const db = require('../../common/database');
const catchAsync = require('../../common/utils/catchAsync');
const AppError = require('../../common/utils/AppError');
const PDFDocument = require('pdfkit');
const mealEligibilityService = require('../../common/services/mealEligibilityService');

// ─────────────────────────────────────────────────────────────────────────────
// 1. REDUCE MEAL FOR ALL (admin presses one button)
//    - Writes to daily_meal_log FIRST (source of truth)
//    - Then increments used_meals (denormalized counter)
//    - If crash mid-process: daily_meal_log is the recovery source
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @desc  Reduce remaining meals by 1 for all active subscribers who want today's meal
 * @route POST /api/admin/meals/reduce-today
 */
exports.reduceMealsForToday = catchAsync(async (req, res, next) => {
  const adminId = req.user.id;
  const today = mealEligibilityService.parseSessionToday();

  const result = await mealEligibilityService.executeMealReductionForDate(adminId, today);

  res.status(200).json({
    success: true,
    message: `Meal reduction completed for ${today}${result.repeated_reduction_mode ? ' (repeat run).' : '.'}`,
    data: {
      date: today,
      reduction_id: result.reductionId,
      repeated_reduction_mode: !!result.repeated_reduction_mode,
      eligible_for_meal_on_date: result.eligible_count,
      meals_reduced: result.meals_reduced,
      skipped_due_to_meal_pause: result.skipped_due_to_meal_pause,
    },
  });
});

/**
 * @desc  Reverse today's meal reduction (admin safety rollback)
 * @route POST /api/admin/meals/reduce-today/reverse
 */
exports.reverseTodayMealReduction = catchAsync(async (req, res, next) => {
  const adminId = req.user.id;
  const today = mealEligibilityService.parseSessionToday();

  const result = await mealEligibilityService.reverseMealReductionForDate(adminId, today);
  if (result.notFound) {
    return next(new AppError(`No meal reduction found for ${today}.`, 404));
  }

  res.status(200).json({
    success: true,
    message: `Meal reduction rollback completed for ${today}.`,
    data: {
      date: today,
      reduction_id: result.reductionId,
      restored_count: result.restoredCount,
      restored_entities: result.restored,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1.5. ADMIN: ADD EXTRA MEALS BY ENTITY (child/teacher/professional)
// ─────────────────────────────────────────────────────────────────────────────

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const parseYmdStrict = (input) => {
  const raw = String(input || '').trim();
  if (!YMD.test(raw)) return null;
  return raw;
};

const addDaysYmd = (ymd, days) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
};

const isSaturdayYmd = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dt.getUTCDay() === 6;
};

const extendEndYmdByMealDays = ({ endYmd, includeSaturday, extraMeals }) => {
  let remainingExtra = extraMeals;
  let cursor = endYmd;
  while (remainingExtra > 0) {
    cursor = addDaysYmd(cursor, 1);
    const saturday = isSaturdayYmd(cursor);
    const isMealDay = includeSaturday || !saturday;
    if (isMealDay) remainingExtra -= 1;
  }
  return cursor;
};

/**
 * @desc  Admin adds extra meal credits for a single entity (child/teacher/professional).
 *        total_meals increases; end_date extends based on include_saturday so date-based token validity stays correct.
 *        Also (re)activates subscription when it was expired due to remaining reaching 0.
 */
exports.adminAddExtraMealsByEntity = catchAsync(async (req, res, next) => {
  const adminId = req.user.id;
  const { entityType, entityId, extraMeals, reason } = req.body || {};

  if (!entityType || !entityId) {
    return next(new AppError('entityType and entityId are required.', 400));
  }
  const allowed = ['child', 'teacher', 'professional'];
  if (!allowed.includes(entityType)) {
    return next(new AppError('Invalid entityType. Must be child, teacher, or professional.', 400));
  }

  const parsedExtra = Number(extraMeals);
  if (!Number.isInteger(parsedExtra) || parsedExtra <= 0) {
    return next(new AppError('extraMeals must be a positive integer.', 400));
  }

  if (!reason || String(reason).trim().length < 3) {
    return next(new AppError('reason is required and must be at least 3 characters.', 400));
  }

  // Find the subscription row for this entity (even if it is inactive due to remaining hitting 0)
  const subRes = await db.query(
    `SELECT id,
            client_id,
            total_meals,
            used_meals,
            start_date,
            end_date,
            TO_CHAR(end_date, 'YYYY-MM-DD') AS end_date_ymd,
            include_saturday
     FROM client_subscriptions
     WHERE entity_type = $1 AND entity_id = $2
     LIMIT 1`,
    [entityType, entityId]
  );

  if (subRes.rowCount === 0) return next(new AppError('No subscription found for this entity.', 404));

  const sub = subRes.rows[0];
  const remainingBefore = Number(sub.total_meals) - Number(sub.used_meals);

  const includeSaturday = sub.include_saturday !== false;
  const endYmd = sub.end_date_ymd;
  if (!parseYmdStrict(endYmd)) return next(new AppError('Invalid subscription end_date format in DB.', 500));

  const newEndYmd = extendEndYmdByMealDays({
    endYmd,
    includeSaturday,
    extraMeals: parsedExtra,
  });

  await db.query('BEGIN');
  try {
    await db.query(
      `UPDATE client_subscriptions
       SET total_meals = total_meals + $1,
           is_active = true,
           end_date = ($2::date + interval '12 hours'),
           updated_at = NOW()
       WHERE id = $3`,
      [parsedExtra, newEndYmd, sub.id]
    );

    await db.query(
      `INSERT INTO subscription_meal_adjustments
        (subscription_id, adjusted_by, adjustment_type, meal_delta, reason)
       VALUES ($1, $2, 'extra_meals', $3, $4)`,
      [sub.id, adminId, parsedExtra, String(reason).trim()]
    );

    const updated = await db.query(
      `SELECT id, total_meals, used_meals, end_date, include_saturday
       FROM client_subscriptions
       WHERE id=$1`,
      [sub.id]
    );

    const u = updated.rows[0];
    const remainingAfter = Number(u.total_meals) - Number(u.used_meals);

    await db.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Extra meals added successfully.',
      data: {
        subscription_id: u.id,
        entity_type: entityType,
        entity_id: entityId,
        extra_meals_added: parsedExtra,
        remaining_meals_before: remainingBefore,
        remaining_meals_after: remainingAfter,
        total_meals: u.total_meals,
        used_meals: u.used_meals,
        new_end_date: String(u.end_date).slice(0, 10),
      },
    });
  } catch (e) {
    await db.query('ROLLBACK');
    throw e;
  }
});

/**
 * @desc  Admin list of all subscribed users with remaining meals
 * @route GET /api/admin/meals/users
 */
exports.getSubscribedUsersRemainingMeals = catchAsync(async (req, res) => {
  const { role, q, activeOnly = 'false', page = 1, limit = 50 } = req.query;
  const roleFilter = role ? String(role).trim().toLowerCase() : null;
  const allowedRoles = ['child', 'teacher', 'professional'];
  if (roleFilter && !allowedRoles.includes(roleFilter)) {
    throw new AppError('Invalid role. Use child, teacher, or professional.', 400);
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const offset = (pageNum - 1) * limitNum;
  const search = q ? `%${String(q).trim()}%` : null;
  const onlyActive = activeOnly === true || String(activeOnly).toLowerCase() === 'true';

  const params = [];
  const where = ['1=1'];
  if (roleFilter) {
    params.push(roleFilter);
    where.push(`cs.entity_type = $${params.length}`);
  }
  if (search) {
    params.push(search);
    const s = `$${params.length}`;
    where.push(
      `(COALESCE(ch.name, tp.name, pp.name) ILIKE ${s} OR cs.entity_id ILIKE ${s} OR cs.id ILIKE ${s})`
    );
  }
  if (onlyActive) {
    where.push('cs.is_active = true');
  }

  params.push(limitNum, offset);
  const limitParam = `$${params.length - 1}`;
  const offsetParam = `$${params.length}`;

  const rows = await db.query(
    `SELECT
       cs.id AS subscription_id,
       cs.entity_type AS role,
       cs.entity_id,
       COALESCE(ch.name, tp.name, pp.name) AS user_name,
       cs.is_active,
       DATE(cs.start_date) AS start_date,
       DATE(cs.end_date) AS end_date,
       cs.total_meals,
       cs.used_meals,
       (cs.total_meals - cs.used_meals) AS remaining_meals
     FROM client_subscriptions cs
     LEFT JOIN children ch ON cs.entity_type = 'child' AND cs.entity_id = ch.id
     LEFT JOIN teacher_profiles tp ON cs.entity_type = 'teacher' AND cs.entity_id = tp.id
     LEFT JOIN professional_profiles pp ON cs.entity_type = 'professional' AND cs.entity_id = pp.id
     WHERE ${where.join(' AND ')}
     ORDER BY cs.updated_at DESC
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params
  );

  const countParams = params.slice(0, params.length - 2);
  const countRes = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM client_subscriptions cs
     LEFT JOIN children ch ON cs.entity_type = 'child' AND cs.entity_id = ch.id
     LEFT JOIN teacher_profiles tp ON cs.entity_type = 'teacher' AND cs.entity_id = tp.id
     LEFT JOIN professional_profiles pp ON cs.entity_type = 'professional' AND cs.entity_id = pp.id
     WHERE ${where.join(' AND ')}`,
    countParams
  );

  res.status(200).json({
    success: true,
    pagination: {
      total: countRes.rows[0]?.total || 0,
      page: pageNum,
      limit: limitNum,
    },
    data: rows.rows,
  });
});

/**
 * @desc  Admin add remaining meals for one selected user
 * @route POST /api/admin/meals/users/:entityType/:entityId/add-remaining-meals
 */
exports.addRemainingMealsForUser = catchAsync(async (req, res, next) => {
  const { entityType, entityId } = req.params;
  const { mealsToAdd, reason } = req.body || {};
  req.body = {
    entityType,
    entityId,
    extraMeals: mealsToAdd,
    reason: reason || 'Admin manual meal extension',
  };
  return exports.adminAddExtraMealsByEntity(req, res, next);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. REPAIR / RECONCILE (recovery if used_meals got corrupted)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @desc  Recompute used_meals from daily_meal_log (source of truth recovery)
 * @route POST /api/admin/meals/reconcile
 */
exports.reconcileMeals = catchAsync(async (req, res) => {
  const result = await db.query(`
    UPDATE client_subscriptions cs
    SET used_meals = COALESCE(log_counts.actual_used, 0),
        updated_at = NOW()
    FROM (
      SELECT subscription_id, COUNT(*) AS actual_used
      FROM daily_meal_log
      GROUP BY subscription_id
    ) AS log_counts
    WHERE cs.id = log_counts.subscription_id
      AND cs.used_meals != log_counts.actual_used
    RETURNING cs.id, cs.used_meals AS corrected_used
  `);

  res.status(200).json({
    success: true,
    message: `Reconciliation complete. ${result.rowCount} subscription(s) corrected.`,
    corrected: result.rows
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET MEAL REDUCTION HISTORY
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @desc  Get the admin meal reduction log/history
 * @route GET /api/admin/meals/reduction-history
 */
exports.getReductionHistory = catchAsync(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const result = await db.query(
    `SELECT mr.*, a.phone_number AS admin_phone
     FROM meal_reductions mr
     LEFT JOIN admins a ON mr.reduced_by = a.id
     ORDER BY mr.reduction_date DESC
     LIMIT $1 OFFSET $2`,
    [parseInt(limit), offset]
  );

  const total = await db.query('SELECT COUNT(*) FROM meal_reductions');

  res.status(200).json({
    success: true,
    pagination: {
      total: parseInt(total.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    },
    data: result.rows
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. GET DAILY MEAL LOG FOR A DATE
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @desc  View per-entity meal log for a specific date
 * @route GET /api/admin/meals/daily-log/:date
 */
exports.getDailyLog = catchAsync(async (req, res) => {
  let { date } = req.params;
  if (date === 'today') date = new Date().toISOString().split('T')[0];

  const result = await db.query(
    `SELECT dml.*, 
            CASE
              WHEN dml.entity_type='child' THEN ch.name
              WHEN dml.entity_type='teacher' THEN tp.name
              WHEN dml.entity_type='professional' THEN pp.name
            END AS entity_name,
            c.phone_number AS client_phone
     FROM daily_meal_log dml
     LEFT JOIN client_subscriptions cs ON dml.subscription_id = cs.id
     LEFT JOIN clients c ON cs.client_id = c.id
     LEFT JOIN children ch ON dml.entity_type='child' AND dml.entity_id=ch.id
     LEFT JOIN teacher_profiles tp ON dml.entity_type='teacher' AND dml.entity_id=tp.id
     LEFT JOIN professional_profiles pp ON dml.entity_type='professional' AND dml.entity_id=pp.id
     WHERE dml.meal_date = $1
     ORDER BY dml.entity_type, entity_name`,
    [date]
  );

  res.status(200).json({
    success: true,
    date,
    count: result.rowCount,
    data: result.rows
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. VIEW ALL MEAL SKIPS (admin visibility)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @desc  Admin can view all approved meal skips
 * @route GET /api/admin/meals/skips
 */
exports.getAllMealSkips = catchAsync(async (req, res) => {
  const { entityType, status, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  let paramCount = 1;
  let where = 'WHERE 1=1';

  if (entityType) {
    where += ` AND ms.entity_type = $${paramCount}`;
    params.push(entityType);
    paramCount++;
  }
  if (status) {
    where += ` AND ms.status = $${paramCount}`;
    params.push(status);
    paramCount++;
  }

  const result = await db.query(
    `SELECT ms.id, ms.client_id, ms.entity_type, ms.entity_id,
            TO_CHAR(ms.skip_start_date, 'YYYY-MM-DD') AS skip_start_date,
            TO_CHAR(ms.skip_end_date, 'YYYY-MM-DD') AS skip_end_date,
            ms.total_skip_days, ms.status, ms.created_at, ms.updated_at,
            c.phone_number AS client_phone,
            CASE
              WHEN ms.entity_type='child' THEN ch.name
              WHEN ms.entity_type='teacher' THEN tp.name
              WHEN ms.entity_type='professional' THEN pp.name
            END AS entity_name
     FROM meal_skips ms
     LEFT JOIN clients c ON ms.client_id = c.id
     LEFT JOIN children ch ON ms.entity_type='child' AND ms.entity_id=ch.id
     LEFT JOIN teacher_profiles tp ON ms.entity_type='teacher' AND ms.entity_id=tp.id
     LEFT JOIN professional_profiles pp ON ms.entity_type='professional' AND ms.entity_id=pp.id
     ${where}
     ORDER BY ms.skip_start_date DESC
     LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
    [...params, parseInt(limit), offset]
  );

  res.status(200).json({
    success: true,
    count: result.rowCount,
    data: result.rows
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PDF HELPER: Draw a single token card
// ─────────────────────────────────────────────────────────────────────────────
const CARD_W = 245;
const CARD_H = 120;
const CARD_GAP = 15;
const CARD_MARGIN_X = 40;
const CARD_MARGIN_TOP = 40;
const COLS = 2;

const drawTokenCard = (doc, x, y, data) => {
  // Outer border
  doc.lineWidth(1.2).strokeColor('#1a365d')
    .roundedRect(x, y, CARD_W, CARD_H, 6).stroke();

  // Header strip
  doc.save();
  doc.roundedRect(x, y, CARD_W, 22, 6).clip();
  doc.rect(x, y, CARD_W, 22).fill('#1a365d');
  doc.restore();
  // Cover bottom corners of header strip
  doc.rect(x, y + 16, CARD_W, 6).fill('#1a365d');

  // School / Location name in header
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
  doc.text(String(data.header || ''), x + 8, y + 6, { width: CARD_W - 16, align: 'center' });

  // Card body
  const bx = x + 10;
  let by = y + 28;
  const labelW = 72;
  const valW = CARD_W - labelW - 20;

  const rows = data.rows || [];
  rows.forEach(r => {
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#4a5568');
    doc.text(String(r.label), bx, by, { width: labelW, align: 'left' });
    doc.font('Helvetica').fontSize(7.5).fillColor('#1a202c');
    doc.text(String(r.value || '—'), bx + labelW, by, { width: valW, align: 'left' });
    by += 12;
  });

  // Meal size badge at bottom-right
  if (data.badge) {
    const bw = 60;
    const bh = 16;
    const bxPos = x + CARD_W - bw - 8;
    const byPos = y + CARD_H - bh - 6;
    doc.roundedRect(bxPos, byPos, bw, bh, 3).fill('#2b6cb0');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7);
    doc.text(String(data.badge), bxPos, byPos + 4, { width: bw, align: 'center' });
  }

  // Token # at bottom-left
  if (data.serial) {
    doc.font('Helvetica').fontSize(7).fillColor('#a0aec0');
    doc.text(String(data.serial), x + 10, y + CARD_H - 16, { width: 60, align: 'left' });
  }
};

// Returns { x, y } for the next card position, auto-adds pages
const getCardPos = (doc, index) => {
  const cardsPerRow = COLS;
  const rowsPerPage = Math.floor((doc.page.height - CARD_MARGIN_TOP - 60) / (CARD_H + CARD_GAP));
  const cardsPerPage = cardsPerRow * rowsPerPage;

  const pageIdx = Math.floor(index / cardsPerPage);
  const posOnPage = index % cardsPerPage;
  const row = Math.floor(posOnPage / cardsPerRow);
  const col = posOnPage % cardsPerRow;

  const x = CARD_MARGIN_X + col * (CARD_W + CARD_GAP);
  const y = CARD_MARGIN_TOP + row * (CARD_H + CARD_GAP);
  return { x, y, pageIdx };
};

// Legacy drawTable kept for backwards compat if needed
const drawTable = (doc, headers, rows, startX, startY, colWidths) => {
  const rowHeight = 22;
  let y = startY || 50;
  const totalW = (colWidths || []).reduce((a, b) => a + b, 0) || 480;

  doc.fillColor('#1a365d').rect(startX, y, totalW, rowHeight).fill();
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
  let x = startX;
  (headers || []).forEach((h, i) => {
    doc.text(String(h), x + 4, y + 6, { width: (colWidths[i] || 80) - 8, align: 'left' });
    x += (colWidths[i] || 80);
  });
  y += rowHeight;

  doc.font('Helvetica').fontSize(8).fillColor('#1a202c');
  (rows || []).forEach((row, rowIdx) => {
    if (y > doc.page.height - 60) { doc.addPage(); y = 50; }
    const bg = rowIdx % 2 === 0 ? '#f7fafc' : '#edf2f7';
    doc.fillColor(bg).rect(startX, y, totalW, rowHeight).fill();
    doc.fillColor('#1a202c');
    x = startX;
    (row || []).forEach((cell, i) => {
      doc.text(String(cell || '—'), x + 4, y + 6, { width: (colWidths[i] || 80) - 8, align: 'left' });
      x += (colWidths[i] || 80);
    });
    y += rowHeight;
  });
  return y;
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. PDF: SCHOOL-SPECIFIC TOKENS
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @desc  Generate PDF meal tokens for a specific school, grouped by meal size
 * @route GET /api/admin/meals/tokens/school/:schoolId
 */
exports.getSchoolTokensPDF = catchAsync(async (req, res, next) => {
  const { schoolId } = req.params;

  const school = await db.query('SELECT id, name, city, state FROM schools WHERE id=$1', [schoolId]);
  if (school.rows.length === 0) return next(new AppError('School not found.', 404));

  const schoolData = school.rows[0];
  const today = mealEligibilityService.parseSessionToday();

  const children = await mealEligibilityService.fetchChildTokenRows({
    schoolId,
    mealSizeId: null,
    delivery: today,
  });

  if (children.rows.length === 0) {
    return res.status(200).json({
      success: false,
      message: 'No subscribed children wanting meal today in this school.'
    });
  }

  // Group by meal size
  const groups = {};
  children.rows.forEach(c => {
    const key = c.meal_size || 'Unknown';
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  });

  // Generate PDF with CARD layout
  const doc = new PDFDocument({ margin: 30, size: 'A4', bufferPages: true });
  const filename = `tokens_${schoolData.name.replace(/\s+/g, '_')}_${today}.pdf`;

  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));
  doc.on('end', () => {
    const result = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', result.length);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(result);
  });

  // Flatten all children into one list (all meal sizes on same pages)
  const allStudents = children.rows;
  const rowsPerPage = Math.floor((doc.page.height - CARD_MARGIN_TOP - 40) / (CARD_H + CARD_GAP));
  const cardsPerPage = COLS * rowsPerPage;
  let currentPage = 0;

  allStudents.forEach((s, idx) => {
    const pos = getCardPos(doc, idx);
    if (pos.pageIdx > currentPage) {
      doc.addPage();
      currentPage = pos.pageIdx;
    }
    drawTokenCard(doc, pos.x, pos.y, {
      header: `${schoolData.name} — ${today}`,
      badge: s.meal_size || 'Standard',
      serial: `#${idx + 1}`,
      rows: [
        { label: 'Name:', value: s.child_name },
        { label: 'Roll No:', value: s.roll_number },
        { label: 'Standard:', value: s.standard },
        { label: 'Meal Time:', value: s.meal_time },
        { label: 'Remaining:', value: s.remaining_meals }
      ]
    });
  });

  doc.end();
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. PDF: CORPORATE/PROFESSIONAL TOKENS
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @desc  Generate PDF meal tokens for a corporate location
 * @route GET /api/admin/meals/tokens/corporate/:locationId
 */
exports.getCorporateTokensPDF = catchAsync(async (req, res, next) => {
  const { locationId } = req.params;

  const location = await db.query('SELECT id, name, city, state FROM corporate_locations WHERE id=$1', [locationId]);
  if (location.rows.length === 0) return next(new AppError('Corporate location not found.', 404));

  const locData = location.rows[0];
  const today = mealEligibilityService.parseSessionToday();

  const professionals = await mealEligibilityService.fetchProfessionalTokenRows({
    locationId,
    delivery: today,
  });

  if (professionals.rows.length === 0) {
    return res.status(200).json({
      success: false,
      message: 'No subscribed professionals wanting meal today at this location.'
    });
  }

  const doc = new PDFDocument({ margin: 30, size: 'A4', bufferPages: true });
  const filename = `tokens_${locData.name.replace(/\s+/g, '_')}_${today}.pdf`;

  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));
  doc.on('end', () => {
    const result = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', result.length);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(result);
  });

  let currentPage = 0;
  professionals.rows.forEach((p, idx) => {
    const pos = getCardPos(doc, idx);
    if (pos.pageIdx > currentPage) {
      doc.addPage();
      currentPage = pos.pageIdx;
    }
    drawTokenCard(doc, pos.x, pos.y, {
      header: `${locData.name} — ${today}`,
      badge: 'Professional',
      serial: `#${idx + 1}`,
      rows: [
        { label: 'Name:', value: p.professional_name || p.name },
        { label: 'Company:', value: p.company_name },
        { label: 'Remaining:', value: p.remaining_meals }
      ]
    });
  });

  doc.end();
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. PDF: DOWNLOAD ALL TOKENS
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @desc  Generate ONE combined PDF with all schools (grouped by meal size) + all corporate locations
 * @route GET /api/admin/meals/tokens/all
 */
exports.getAllTokensPDF = catchAsync(async (req, res) => {
  const today = mealEligibilityService.parseSessionToday();

  const schools = await mealEligibilityService.fetchDistinctSchoolsWithEligibleChildren(today);
  const locations = await mealEligibilityService.fetchDistinctCorporateLocationsWithEligible(today);

  if (schools.rows.length === 0 && locations.rows.length === 0) {
    return res.status(200).json({
      success: false,
      message: `No meal tokens to generate for today (${today}).`
    });
  }

  const doc = new PDFDocument({ margin: 30, size: 'A4', bufferPages: true });
  const filename = `all_meal_tokens_${today}.pdf`;
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));
  doc.on('end', () => {
    const result = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', result.length);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(result);
  });

  // Cover page
  doc.moveDown(8);
  doc.fillColor('#1a365d').font('Helvetica-Bold').fontSize(28)
    .text('MEAL DELIVERY TOKENS', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(14).fillColor('#4a5568')
    .text(`Date: ${today}`, { align: 'center' });
  doc.fontSize(11).fillColor('#718096')
    .text(`Generated at: ${new Date().toLocaleString('en-IN')}`, { align: 'center' });
  doc.moveDown(1);
  doc.fontSize(12).fillColor('#2b6cb0')
    .text(`Schools: ${schools.rows.length} | Corporates: ${locations.rows.length}`, { align: 'center' });

  // School cards — each school starts a new page, all meal sizes together
  for (const school of schools.rows) {
    const children = await mealEligibilityService.fetchChildTokenRows({
      schoolId: school.school_id,
      mealSizeId: null,
      delivery: today,
    });
    if (children.rows.length === 0) continue;

    doc.addPage();
    let currentPage = 0;
    children.rows.forEach((s, idx) => {
      const pos = getCardPos(doc, idx);
      if (pos.pageIdx > currentPage) {
        doc.addPage();
        currentPage = pos.pageIdx;
      }
      drawTokenCard(doc, pos.x, pos.y, {
        header: `${school.school_name} — ${today}`,
        badge: s.meal_size || 'Standard',
        serial: `#${idx + 1}`,
        rows: [
          { label: 'Name:', value: s.child_name },
          { label: 'Roll No:', value: s.roll_number },
          { label: 'Standard:', value: s.standard },
          { label: 'Meal Time:', value: s.meal_time },
          { label: 'Remaining:', value: s.remaining_meals }
        ]
      });
    });
  }

  // Corporate cards
  for (const loc of locations.rows) {
    const profs = await mealEligibilityService.fetchProfessionalTokenRows({
      locationId: loc.location_id,
      delivery: today,
    });
    if (profs.rows.length === 0) continue;

    doc.addPage();
    let currentPage = 0;
    profs.rows.forEach((p, idx) => {
      const pos = getCardPos(doc, idx);
      if (pos.pageIdx > currentPage) {
        doc.addPage();
        currentPage = pos.pageIdx;
      }
      drawTokenCard(doc, pos.x, pos.y, {
        header: `${loc.location_name} — ${today}`,
        badge: 'Professional',
        serial: `#${idx + 1}`,
        rows: [
          { label: 'Name:', value: p.professional_name || p.name },
          { label: 'Company:', value: p.company_name },
          { label: 'Remaining:', value: p.remaining_meals }
        ]
      });
    });
  }

  doc.end();
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. KITCHEN REPORT (Today's Active Count & Meal Sizes)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @desc  Get today's kitchen report: total subscribed, active today, and breakdown of meal sizes
 * @route GET /api/admin/meals/kitchen-report/today
 */
exports.getKitchenReport = catchAsync(async (req, res, next) => {
  const today = mealEligibilityService.parseSessionToday();
  const pred = mealEligibilityService.subscriptionEligiblePredicateSql('cs');

  // 1. Total Subscribed (Everyone who has a valid subscription, regardless of skip or start date)
  const totalSubscribedRes = await db.query(
    `SELECT COUNT(*) as total FROM client_subscriptions 
     WHERE is_active = true 
       AND (total_meals - used_meals) > 0`
  );
  const totalSubscribed = parseInt(totalSubscribedRes.rows[0].total);

  // 2. Active Today — same rules as tokens / meal reduction (calendar day in session TZ)
  const activeTodayRes = await db.query(
    `SELECT cs.id, cs.entity_type, cs.entity_id 
     FROM client_subscriptions cs
     WHERE ${pred}`,
    [today]
  );
  const activeTodayCount = activeTodayRes.rowCount;

  // 3. Meal size breakdown from subscription plan mapping (works for all entity types)
  let formattedMealSizes = [];
  const activeSubscriptionIds = activeTodayRes.rows.map((row) => row.id);
  if (activeSubscriptionIds.length > 0) {
    const mealSizeBreakdown = await db.query(
      `
      SELECT
        COALESCE(ms.display_name, 'Unassigned') AS size,
        COUNT(*)::int AS count,
        COALESCE(ms.sort_order, 9999) AS sort_order
      FROM client_subscriptions cs
      JOIN subscriptions s ON s.id = cs.subscription_id
      LEFT JOIN meal_sizes ms ON ms.id = s.meal_size_id
      WHERE cs.id = ANY($1)
      GROUP BY COALESCE(ms.display_name, 'Unassigned'), COALESCE(ms.sort_order, 9999)
      ORDER BY COALESCE(ms.sort_order, 9999), COALESCE(ms.display_name, 'Unassigned')
      `,
      [activeSubscriptionIds]
    );
    formattedMealSizes = mealSizeBreakdown.rows.map((row) => ({
      size: row.size,
      count: row.count
    }));
  }

  res.status(200).json({
    success: true,
    data: {
      date: today,
      total_subscribed: totalSubscribed,
      active_today: activeTodayCount,
      meal_sizes: formattedMealSizes
    }
  });
});
