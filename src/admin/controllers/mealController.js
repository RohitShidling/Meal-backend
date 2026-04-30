const db = require('../../common/database');
const catchAsync = require('../../common/utils/catchAsync');
const AppError = require('../../common/utils/AppError');
const PDFDocument = require('pdfkit');

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
  const today = new Date().toISOString().split('T')[0];

  // Check if already reduced today
  const alreadyDone = await db.query(
    'SELECT id FROM meal_reductions WHERE reduction_date=$1', [today]
  );
  if (alreadyDone.rows.length > 0) {
    return next(new AppError(`Meals have already been reduced for today (${today}). Only one reduction per day is allowed.`, 409));
  }

  // Create the reduction record FIRST (lock the date)
  const reductionRow = await db.query(
    `INSERT INTO meal_reductions (reduced_by, reduction_date, affected_count, skipped_count)
     VALUES ($1, $2, 0, 0) RETURNING id`,
    [adminId, today]
  );
  const reductionId = reductionRow.rows[0].id;

  // Get all active subscriptions with remaining meals > 0 and start_date <= today
  const activeSubscriptions = await db.query(
    `SELECT cs.id, cs.client_id, cs.entity_type, cs.entity_id, cs.total_meals, cs.used_meals
     FROM client_subscriptions cs
     WHERE cs.is_active = true AND cs.end_date > NOW() AND (cs.total_meals - cs.used_meals) > 0 AND cs.start_date <= CURRENT_DATE`
  );

  let affectedCount = 0;
  let skippedCount = 0;
  const affectedDetails = [];
  const skippedDetails = [];

  for (const sub of activeSubscriptions.rows) {
    // Check if this entity has an approved skip for today
    const skipCheck = await db.query(
      `SELECT id FROM meal_skips
       WHERE client_id=$1 AND entity_type=$2 AND entity_id=$3
         AND status='approved'
         AND skip_start_date <= $4 AND skip_end_date >= $4`,
      [sub.client_id, sub.entity_type, sub.entity_id, today]
    );

    if (skipCheck.rows.length > 0) {
      // This entity has a skip for today — do NOT reduce
      skippedCount++;
      skippedDetails.push({
        subscription_id: sub.id,
        entity_type: sub.entity_type,
        entity_id: sub.entity_id,
        reason: 'meal_skip_active'
      });
    } else {
      // STEP 1: Insert into daily_meal_log (SOURCE OF TRUTH)
      try {
        await db.query(
          `INSERT INTO daily_meal_log (subscription_id, entity_type, entity_id, meal_date, reduction_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [sub.id, sub.entity_type, sub.entity_id, today, reductionId]
        );
      } catch (e) {
        // UNIQUE violation = already logged today (idempotent)
        if (e.code === '23505') continue;
        throw e;
      }

      // STEP 2: Increment used_meals (denormalized for performance)
      await db.query(
        `UPDATE client_subscriptions SET used_meals = used_meals + 1, updated_at = NOW()
         WHERE id = $1`,
        [sub.id]
      );

      affectedCount++;
      affectedDetails.push({
        subscription_id: sub.id,
        entity_type: sub.entity_type,
        entity_id: sub.entity_id,
        new_used: sub.used_meals + 1,
        new_remaining: sub.total_meals - sub.used_meals - 1
      });
    }
  }

  // Update the reduction record with final counts
  await db.query(
    `UPDATE meal_reductions SET affected_count=$1, skipped_count=$2,
            details=$3 WHERE id=$4`,
    [affectedCount, skippedCount, JSON.stringify({ affected: affectedDetails, skipped: skippedDetails }), reductionId]
  );

  res.status(200).json({
    success: true,
    message: `Meal reduction completed for ${today}.`,
    data: {
      date: today,
      reduction_id: reductionId,
      total_active_subscriptions: activeSubscriptions.rowCount,
      meals_reduced: affectedCount,
      skipped_due_to_meal_pause: skippedCount
    }
  });
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
    `SELECT ms.*,
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
  const today = new Date().toISOString().split('T')[0];

  // Get all subscribed children in this school with computed remaining
  const children = await db.query(
    `SELECT ch.name AS child_name, ch.roll_number, s.display_name AS standard,
            ms.display_name AS meal_size, ms.sort_order, ch.meal_time,
            (cs.total_meals - cs.used_meals) AS remaining_meals
     FROM children ch
     JOIN client_subscriptions cs ON cs.entity_type='child' AND cs.entity_id=ch.id
       AND cs.is_active=true AND cs.end_date > NOW() AND (cs.total_meals - cs.used_meals) > 0
     LEFT JOIN standards s ON ch.standard_id = s.id
     LEFT JOIN meal_sizes ms ON ch.meal_size_id = ms.id
     WHERE ch.school_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM meal_skips msk
         WHERE msk.entity_type='child' AND msk.entity_id=ch.id
           AND msk.status='approved'
           AND msk.skip_start_date <= $2 AND msk.skip_end_date >= $2
       )
     ORDER BY ms.sort_order, ch.name`,
    [schoolId, today]
  );

  if (children.rowCount === 0) {
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
  const today = new Date().toISOString().split('T')[0];

  const professionals = await db.query(
    `SELECT pp.name AS professional_name, pp.company_name,
            (cs.total_meals - cs.used_meals) AS remaining_meals
     FROM professional_profiles pp
     JOIN client_subscriptions cs ON cs.entity_type='professional' AND cs.entity_id=pp.id
       AND cs.is_active=true AND cs.end_date > NOW() AND (cs.total_meals - cs.used_meals) > 0
     WHERE pp.corporate_location_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM meal_skips msk
         WHERE msk.entity_type='professional' AND msk.entity_id=pp.id
           AND msk.status='approved'
           AND msk.skip_start_date <= $2 AND msk.skip_end_date >= $2
       )
     ORDER BY pp.name`,
    [locationId, today]
  );

  if (professionals.rowCount === 0) {
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
        { label: 'Name:', value: p.professional_name },
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
  const today = new Date().toISOString().split('T')[0];

  const schools = await db.query(
    `SELECT DISTINCT sc.id, sc.name, sc.city, sc.state
     FROM schools sc
     JOIN children ch ON ch.school_id = sc.id
     JOIN client_subscriptions cs ON cs.entity_type='child' AND cs.entity_id=ch.id
       AND cs.is_active=true AND cs.end_date > NOW() AND (cs.total_meals - cs.used_meals) > 0
     WHERE NOT EXISTS (
       SELECT 1 FROM meal_skips msk
       WHERE msk.entity_type='child' AND msk.entity_id=ch.id
         AND msk.status='approved'
         AND msk.skip_start_date <= $1 AND msk.skip_end_date >= $1
     )
     ORDER BY sc.name`,
    [today]
  );

  const locations = await db.query(
    `SELECT DISTINCT cl.id, cl.name, cl.city, cl.state
     FROM corporate_locations cl
     JOIN professional_profiles pp ON pp.corporate_location_id = cl.id
     JOIN client_subscriptions cs ON cs.entity_type='professional' AND cs.entity_id=pp.id
       AND cs.is_active=true AND cs.end_date > NOW() AND (cs.total_meals - cs.used_meals) > 0
     WHERE NOT EXISTS (
       SELECT 1 FROM meal_skips msk
       WHERE msk.entity_type='professional' AND msk.entity_id=pp.id
         AND msk.status='approved'
         AND msk.skip_start_date <= $1 AND msk.skip_end_date >= $1
     )
     ORDER BY cl.name`,
    [today]
  );

  if (schools.rowCount === 0 && locations.rowCount === 0) {
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
    .text(`Schools: ${schools.rowCount} | Corporates: ${locations.rowCount}`, { align: 'center' });

  // School cards — each school starts a new page, all meal sizes together
  for (const school of schools.rows) {
    const children = await db.query(
      `SELECT ch.name AS child_name, ch.roll_number,
              s.display_name AS standard, ms.display_name AS meal_size,
              ms.sort_order, ch.meal_time,
              (cs.total_meals - cs.used_meals) AS remaining_meals
       FROM children ch
       JOIN client_subscriptions cs ON cs.entity_type='child' AND cs.entity_id=ch.id
         AND cs.is_active=true AND cs.end_date > NOW() AND (cs.total_meals - cs.used_meals) > 0
       LEFT JOIN standards s ON ch.standard_id = s.id
       LEFT JOIN meal_sizes ms ON ch.meal_size_id = ms.id
       WHERE ch.school_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM meal_skips msk
           WHERE msk.entity_type='child' AND msk.entity_id=ch.id
             AND msk.status='approved'
             AND msk.skip_start_date <= $2 AND msk.skip_end_date >= $2
         )
       ORDER BY ms.sort_order, ch.name`,
      [school.id, today]
    );
    if (children.rowCount === 0) continue;

    doc.addPage();
    let currentPage = 0;
    children.rows.forEach((s, idx) => {
      const pos = getCardPos(doc, idx);
      if (pos.pageIdx > currentPage) {
        doc.addPage();
        currentPage = pos.pageIdx;
      }
      drawTokenCard(doc, pos.x, pos.y, {
        header: `${school.name} — ${today}`,
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
    const profs = await db.query(
      `SELECT pp.name AS professional_name, pp.company_name,
              (cs.total_meals - cs.used_meals) AS remaining_meals
       FROM professional_profiles pp
       JOIN client_subscriptions cs ON cs.entity_type='professional' AND cs.entity_id=pp.id
         AND cs.is_active=true AND cs.end_date > NOW() AND (cs.total_meals - cs.used_meals) > 0
       WHERE pp.corporate_location_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM meal_skips msk
           WHERE msk.entity_type='professional' AND msk.entity_id=pp.id
             AND msk.status='approved'
             AND msk.skip_start_date <= $2 AND msk.skip_end_date >= $2
         )
       ORDER BY pp.name`,
      [loc.id, today]
    );
    if (profs.rowCount === 0) continue;

    doc.addPage();
    let currentPage = 0;
    profs.rows.forEach((p, idx) => {
      const pos = getCardPos(doc, idx);
      if (pos.pageIdx > currentPage) {
        doc.addPage();
        currentPage = pos.pageIdx;
      }
      drawTokenCard(doc, pos.x, pos.y, {
        header: `${loc.name} — ${today}`,
        badge: 'Professional',
        serial: `#${idx + 1}`,
        rows: [
          { label: 'Name:', value: p.professional_name },
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
  const today = new Date().toISOString().split('T')[0];

  // 1. Total Subscribed (Everyone who has a valid subscription, regardless of skip or start date)
  const totalSubscribedRes = await db.query(
    `SELECT COUNT(*) as total FROM client_subscriptions 
     WHERE is_active = true 
       AND end_date > NOW() 
       AND (total_meals - used_meals) > 0`
  );
  const totalSubscribed = parseInt(totalSubscribedRes.rows[0].total);

  // 2. Active Today (People who need a meal TODAY)
  // Condition: active, remaining > 0, start_date <= today, not skipped today
  const activeTodayQuery = `
    SELECT cs.entity_type, cs.entity_id 
    FROM client_subscriptions cs
    WHERE cs.is_active = true 
      AND cs.end_date > NOW() 
      AND (cs.total_meals - cs.used_meals) > 0
      AND cs.start_date <= $1
      AND NOT EXISTS (
        SELECT 1 FROM meal_skips ms
        WHERE ms.entity_type = cs.entity_type 
          AND ms.entity_id = cs.entity_id
          AND ms.status = 'approved'
          AND ms.skip_start_date <= $1 AND ms.skip_end_date >= $1
      )
  `;
  const activeTodayRes = await db.query(activeTodayQuery, [today]);
  const activeTodayCount = activeTodayRes.rowCount;

  // 3. Meal Sizes Breakdown (for children only, teachers/professionals can be grouped)
  const mealSizes = {};

  // For children, join with children table and meal_sizes table
  const activeChildrenIds = activeTodayRes.rows
    .filter(r => r.entity_type === 'child')
    .map(r => r.entity_id);

  if (activeChildrenIds.length > 0) {
    const childrenSizesRes = await db.query(`
      SELECT ms.display_name as size_name, COUNT(c.id) as count
      FROM children c
      JOIN meal_sizes ms ON c.meal_size_id = ms.id
      WHERE c.id = ANY($1)
      GROUP BY ms.display_name
    `, [activeChildrenIds]);

    childrenSizesRes.rows.forEach(r => {
      mealSizes[r.size_name] = parseInt(r.count);
    });
  }

  // Count teachers and professionals separately (since they don't have meal_size_id)
  const teacherCount = activeTodayRes.rows.filter(r => r.entity_type === 'teacher').length;
  const profCount = activeTodayRes.rows.filter(r => r.entity_type === 'professional').length;

  if (teacherCount > 0) mealSizes['Teacher (Standard)'] = teacherCount;
  if (profCount > 0) mealSizes['Professional (Standard)'] = profCount;

  // Format the meal sizes object into an array for easier frontend parsing
  const formattedMealSizes = Object.keys(mealSizes).map(key => ({
    size: key,
    count: mealSizes[key]
  }));

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
