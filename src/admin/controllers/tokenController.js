const db = require('../../common/database');
const catchAsync = require('../../common/utils/catchAsync');
const AppError = require('../../common/utils/AppError');
const PDFDocument = require('pdfkit');

/** Calendar "today" aligned with DB session timezone (`PG_SESSION_TIMEZONE`, default Asia/Kolkata). */
const parseToday = () => {
  const tz = /^[A-Za-z0-9_/+-]+$/.test(process.env.PG_SESSION_TIMEZONE || '')
    ? process.env.PG_SESSION_TIMEZONE
    : 'Asia/Kolkata';
  return new Date().toLocaleDateString('en-CA', { timeZone: tz });
};
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Use -1 in DB when token PDF is “all meal sizes” (school) or corporate bundle */
const WHOLE_DOWNLOAD_MEAL_SIZE_KEY = -1;

const normalizeMealSizeKey = (mealSizeId) => {
  if (mealSizeId === null || mealSizeId === undefined || mealSizeId === '') return WHOLE_DOWNLOAD_MEAL_SIZE_KEY;
  const n = Number(mealSizeId);
  return Number.isFinite(n) ? n : WHOLE_DOWNLOAD_MEAL_SIZE_KEY;
};

const resolveTokenDate = (inputDate, next) => {
  if (!inputDate) return parseToday();
  if (!DATE_REGEX.test(inputDate)) {
    next(new AppError('Invalid date format. Use YYYY-MM-DD.', 400));
    return null;
  }
  const parsed = new Date(`${inputDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    next(new AppError('Invalid date value.', 400));
    return null;
  }
  return inputDate;
};

/** Reject literals "undefined"/"null" from bad frontend templating → clear 400 instead of confusing 404. */
const sanitizePathSchoolId = (schoolId, next) => {
  const raw = schoolId === undefined || schoolId === null ? '' : String(schoolId).trim();
  if (!raw || raw === 'undefined' || raw === 'null') {
    next(
      new AppError(
        'Invalid school id in URL path. Bind `school_id` from GET /api/admin/tokens/schools response (same value for path param). Frontend often wrongly uses `.id`; use `.school_id` (e.g. SH-12).',
        400
      )
    );
    return null;
  }
  return raw;
};

const sanitizePathMealSizeId = (mealSizeId, next) => {
  const raw = mealSizeId === undefined || mealSizeId === null ? '' : String(mealSizeId).trim();
  const n = Number(raw);
  if (!raw || raw === 'undefined' || raw === 'null' || !Number.isFinite(n)) {
    next(new AppError('Invalid meal size id in URL. Use numeric meal_size_id from overview or meal_sizes API.', 400));
    return null;
  }
  return String(Math.trunc(n));
};

const sanitizePathLocationId = (locationId, next) => {
  const raw = locationId === undefined || locationId === null ? '' : String(locationId).trim();
  if (!raw || raw === 'undefined' || raw === 'null') {
    next(
      new AppError(
        'Invalid corporate location id in URL. Use corporate_location_id from GET /api/admin/tokens/corporate.',
        400
      )
    );
    return null;
  }
  return raw;
};

const upsertDownloadLog = async ({ tokenScope, scopeId, mealSizeId = WHOLE_DOWNLOAD_MEAL_SIZE_KEY, tokenDate, adminId }) => {
  const key = normalizeMealSizeKey(mealSizeId);
  await db.query(
    `INSERT INTO token_download_logs
      (token_scope, scope_id, meal_size_id, token_date, downloaded, download_count, first_downloaded_at, last_downloaded_at, last_downloaded_by)
     VALUES ($1, $2, $3, $4, true, 1, NOW(), NOW(), $5)
     ON CONFLICT (token_scope, scope_id, meal_size_id, token_date)
     DO UPDATE SET
       downloaded = true,
       download_count = token_download_logs.download_count + 1,
       last_downloaded_at = NOW(),
       last_downloaded_by = EXCLUDED.last_downloaded_by,
       updated_at = NOW()`,
    [tokenScope, scopeId, key, tokenDate, adminId]
  );
};

/**
 * Subscription + delivery eligibility for calendar day `$delivery`:
 * Uses PG session timezone (see Pool `PG_SESSION_TIMEZONE`, default Asia/Kolkata) when casting TIMESTAMP → DATE.
 */
const CHILD_SUBJOIN = `
  JOIN client_subscriptions cs
    ON cs.entity_type = 'child'
   AND cs.entity_id = ch.id
   AND cs.is_active = true
   AND DATE(cs.start_date) <= $delivery::date
   AND DATE(cs.end_date) >= $delivery::date
   AND (cs.total_meals - cs.used_meals) > 0
`;

const PROF_SUBJOIN = `
  JOIN client_subscriptions cs
    ON cs.entity_type = 'professional'
   AND cs.entity_id = pp.id
   AND cs.is_active = true
   AND DATE(cs.start_date) <= $delivery::date
   AND DATE(cs.end_date) >= $delivery::date
   AND (cs.total_meals - cs.used_meals) > 0
`;

// ─────────────────────────────────────────────────────────────────────────────
// PDF: same card layout as Admin meal token PDF (sticker-ready)
// ─────────────────────────────────────────────────────────────────────────────
const CARD_W = 245;
const CARD_H = 120;
const CARD_GAP = 15;
const CARD_MARGIN_X = 40;
const CARD_MARGIN_TOP = 40;
const COLS = 2;

const drawTokenCard = (doc, x, y, data) => {
  doc.lineWidth(1.2).strokeColor('#1a365d')
    .roundedRect(x, y, CARD_W, CARD_H, 6).stroke();

  doc.save();
  doc.roundedRect(x, y, CARD_W, 22, 6).clip();
  doc.rect(x, y, CARD_W, 22).fill('#1a365d');
  doc.restore();
  doc.rect(x, y + 16, CARD_W, 6).fill('#1a365d');

  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
  doc.text(String(data.header || ''), x + 8, y + 6, { width: CARD_W - 16, align: 'center' });

  const bx = x + 10;
  let by = y + 28;
  const labelW = 72;
  const valW = CARD_W - labelW - 20;

  (data.rows || []).forEach(r => {
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#4a5568');
    doc.text(String(r.label), bx, by, { width: labelW, align: 'left' });
    doc.font('Helvetica').fontSize(7.5).fillColor('#1a202c');
    doc.text(String(r.value || '—'), bx + labelW, by, { width: valW, align: 'left' });
    by += 12;
  });

  if (data.badge) {
    const bw = 60;
    const bh = 16;
    const bxPos = x + CARD_W - bw - 8;
    const byPos = y + CARD_H - bh - 6;
    doc.roundedRect(bxPos, byPos, bw, bh, 3).fill('#2b6cb0');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7);
    doc.text(String(data.badge), bxPos, byPos + 4, { width: bw, align: 'center' });
  }

  if (data.serial) {
    doc.font('Helvetica').fontSize(7).fillColor('#a0aec0');
    doc.text(String(data.serial), x + 10, y + CARD_H - 16, { width: 60, align: 'left' });
  }
};

const getCardPos = (doc, index, startY = CARD_MARGIN_TOP) => {
  const safeStartY = Math.max(20, Number(startY) || CARD_MARGIN_TOP);
  const rowsPerPage = Math.floor((doc.page.height - safeStartY - 60) / (CARD_H + CARD_GAP));
  const cardsPerPage = COLS * rowsPerPage;

  const pageIdx = Math.floor(index / cardsPerPage);
  const posOnPage = index % cardsPerPage;
  const row = Math.floor(posOnPage / COLS);
  const col = posOnPage % COLS;

  const x = CARD_MARGIN_X + col * (CARD_W + CARD_GAP);
  const y = safeStartY + row * (CARD_H + CARD_GAP);
  return { x, y, pageIdx };
};

const drawSectionTitle = (doc, title, sub) => {
  if (doc.y > doc.page.height - 140) doc.addPage();
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a365d').text(title, { underline: true });
  if (sub) {
    doc.moveDown(0.15);
    doc.font('Helvetica').fontSize(9).fillColor('#4a5568').text(sub);
  }
  doc.moveDown(0.5);
};

/** Master meal_sizes: reject PDF if id inactive or missing (front must use catalog API ids). */
const assertActiveMealSizeId = async (mealSizeId, next) => {
  const res = await db.query(
    'SELECT id, display_name, name FROM meal_sizes WHERE id = $1 AND is_active = true',
    [mealSizeId]
  );
  if (res.rowCount === 0) {
    next(
      new AppError(
        'Invalid or inactive meal_size_id. Load buttons from GET /api/common/lookup/meal-sizes (or GET /api/admin/tokens/schools/panel).',
        400
      )
    );
    return null;
  }
  return res.rows[0];
};

const fetchSchoolSizePdfRows = async (schoolId, mealSizeId, delivery) => {
  const result = await db.query(
    `SELECT ch.name AS child_name, ch.roll_number,
            s.display_name AS standard, ms.display_name AS meal_size,
            ch.meal_time,
            (cs.total_meals - cs.used_meals) AS remaining_meals
     FROM children ch
     ${CHILD_SUBJOIN.replace(/\$delivery/g, '$3')}
     LEFT JOIN standards s ON s.id = ch.standard_id
     LEFT JOIN meal_sizes ms ON ms.id = ch.meal_size_id
     WHERE ch.school_id=$1
       AND ch.meal_size_id=$2
       AND NOT EXISTS (
         SELECT 1 FROM meal_skips sk
         WHERE sk.entity_type='child' AND sk.entity_id=ch.id
           AND sk.status='approved'
           AND sk.skip_start_date <= $3::date
           AND sk.skip_end_date >= $3::date
       )
     ORDER BY ch.name ASC`,
    [schoolId, mealSizeId, delivery]
  );
  return result.rows;
};

const streamBundlePdfToBuffer = (sectionBuilders) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4', bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    let globalSerial = 0;
    let sectionIdx = 0;

    for (const build of sectionBuilders) {
      const { title, subtitle, rows, drawOne } = build;
      if (!rows || rows.length === 0) continue;
      if (sectionIdx > 0) doc.addPage();
      sectionIdx++;
      drawSectionTitle(doc, title, subtitle);
      const sectionStartY = Math.max(CARD_MARGIN_TOP, doc.y + 6);
      let layoutIndex = 0;
      let currentPage = 0;
      for (const row of rows) {
        const pos = getCardPos(doc, layoutIndex, sectionStartY);
        if (pos.pageIdx > currentPage) {
          doc.addPage();
          currentPage = pos.pageIdx;
        }
        globalSerial += 1;
        drawOne(doc, pos.x, pos.y, row, globalSerial - 1);
        layoutIndex += 1;
      }
    }

    if (sectionIdx === 0) {
      doc.fontSize(11).fillColor('#4a5568').text('No token records found for export conditions.', { align: 'center' });
    }

    doc.end();
  });

const streamCardsPdfBuffer = async (rows, drawRowCard) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4', bufferPages: true });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    let currentPage = 0;
    rows.forEach((row, idx) => {
      const pos = getCardPos(doc, idx);
      if (pos.pageIdx > currentPage) {
        doc.addPage();
        currentPage = pos.pageIdx;
      }
      drawRowCard(doc, pos.x, pos.y, row, idx);
    });

    doc.end();
  });

const sendCardsPdfAttachment = async (res, filename, rows, drawRowCard) => {
  const buffer = await streamCardsPdfBuffer(rows, drawRowCard);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
};

const getSkipPolicy = async () => {
  const result = await db.query(
    `SELECT setting_key, setting_value
     FROM app_settings
     WHERE setting_key IN ('meal_skip_min_days', 'meal_skip_min_notice_days')`
  );

  const settings = Object.fromEntries(result.rows.map((row) => [row.setting_key, Number(row.setting_value)]));
  return {
    min_skip_days: Number.isFinite(settings.meal_skip_min_days) ? settings.meal_skip_min_days : 3,
    min_notice_days: Number.isFinite(settings.meal_skip_min_notice_days) ? settings.meal_skip_min_notice_days : 1,
  };
};

/** Shared: eligible schools × active meal_sizes + counts + per-size download status. */
const buildSchoolTokenOverviewGrouped = async (delivery) => {
  /*
   * For each school that has ≥1 eligible child on `delivery`,
   * return ALL active master meal_sizes (Small/Medium/Large/…) with counts (0 if none).
   * Download badges come from token_download_logs and persist across refresh.
   */
  const result = await db.query(
    `WITH eligible_schools AS (
       SELECT DISTINCT sc.id, sc.name
       FROM schools sc
       INNER JOIN children ch ON ch.school_id = sc.id
       INNER JOIN client_subscriptions cs ON cs.entity_type = 'child'
         AND cs.entity_id = ch.id
         AND cs.is_active = true
         AND DATE(cs.start_date) <= $1::date
         AND DATE(cs.end_date) >= $1::date
         AND (cs.total_meals - cs.used_meals) > 0
       WHERE NOT EXISTS (
         SELECT 1 FROM meal_skips sk
         WHERE sk.entity_type = 'child' AND sk.entity_id = ch.id
           AND sk.status = 'approved'
           AND sk.skip_start_date <= $1::date
           AND sk.skip_end_date >= $1::date
       )
     ),
     size_counts AS (
       SELECT sc.id AS school_id, ms.id AS meal_size_id, COUNT(*)::INTEGER AS students_count
       FROM schools sc
       INNER JOIN children ch ON ch.school_id = sc.id
       INNER JOIN meal_sizes ms ON ms.id = ch.meal_size_id
       INNER JOIN client_subscriptions cs ON cs.entity_type = 'child'
         AND cs.entity_id = ch.id
         AND cs.is_active = true
         AND DATE(cs.start_date) <= $1::date
         AND DATE(cs.end_date) >= $1::date
         AND (cs.total_meals - cs.used_meals) > 0
       WHERE NOT EXISTS (
         SELECT 1 FROM meal_skips sk
         WHERE sk.entity_type = 'child' AND sk.entity_id = ch.id
           AND sk.status = 'approved'
           AND sk.skip_start_date <= $1::date
           AND sk.skip_end_date >= $1::date
       )
       GROUP BY sc.id, ms.id
     )
     SELECT es.id AS school_id,
            es.name AS school_name,
            ms.id AS meal_size_id,
            ms.name AS meal_size_key,
            ms.display_name AS meal_size,
            ms.sort_order,
            COALESCE(sz.students_count, 0)::INTEGER AS students_count,
            COALESCE(tdl.downloaded, false) AS downloaded,
            COALESCE(tdl.download_count, 0)::INTEGER AS download_count,
            tdl.last_downloaded_at
     FROM eligible_schools es
     CROSS JOIN meal_sizes ms
     LEFT JOIN size_counts sz ON sz.school_id = es.id AND sz.meal_size_id = ms.id
     LEFT JOIN token_download_logs tdl
       ON tdl.token_scope = 'school'
      AND tdl.scope_id = es.id
      AND tdl.meal_size_id = ms.id
      AND tdl.token_date = $1::date
     WHERE ms.is_active = true
     ORDER BY es.name ASC, ms.sort_order ASC, ms.display_name ASC`,
    [delivery]
  );

  const grouped = {};
  for (const row of result.rows) {
    if (!grouped[row.school_id]) {
      grouped[row.school_id] = {
        school_id: row.school_id,
        /** Alias so frontends that mistakenly use `.id` for routes can migrate to `.school_id`. */
        schoolId: row.school_id,
        school_name: row.school_name,
        /** Sum of eligible students across all meal sizes for this delivery date (same as Σ students_count). */
        total_students: 0,
        meal_sizes: [],
        /** Filled later: combined “all sizes” PDF download row (meal_size_id = -1 in logs). */
        whole_school_pdf: {
          downloaded: false,
          download_count: 0,
          last_downloaded_at: null,
        },
      };
    }
    const sc = Number(row.students_count) || 0;
    grouped[row.school_id].total_students += sc;
    grouped[row.school_id].meal_sizes.push({
      meal_size_id: row.meal_size_id,
      meal_size_key: row.meal_size_key,
      meal_size: row.meal_size,
      sort_order: row.sort_order,
      students_count: sc,
      can_download_pdf: sc > 0,
      downloaded: row.downloaded,
      download_count: row.download_count,
      last_downloaded_at: row.last_downloaded_at,
    });
  }

  const ids = Object.keys(grouped);
  if (ids.length > 0) {
    const whole = await db.query(
      `SELECT scope_id AS school_id,
              COALESCE(downloaded, false) AS downloaded,
              COALESCE(download_count, 0)::INTEGER AS download_count,
              last_downloaded_at
       FROM token_download_logs
       WHERE token_scope = 'school'
         AND meal_size_id = ${WHOLE_DOWNLOAD_MEAL_SIZE_KEY}
         AND token_date = $1::date
         AND scope_id = ANY($2::varchar[])`,
      [delivery, ids]
    );
    for (const row of whole.rows) {
      if (grouped[row.school_id]) {
        grouped[row.school_id].whole_school_pdf = {
          downloaded: row.downloaded,
          download_count: row.download_count,
          last_downloaded_at: row.last_downloaded_at,
        };
      }
    }
  }

  return { grouped, ids: Object.keys(grouped) };
};

exports.getSchoolTokenOverview = catchAsync(async (req, res, next) => {
  const delivery = resolveTokenDate(req.query.date, next);
  if (!delivery) return;
  const { grouped, ids } = await buildSchoolTokenOverviewGrouped(delivery);

  res.status(200).json({
    success: true,
    date: delivery,
    count: ids.length,
    data: Object.values(grouped),
  });
});

/**
 * UI panel: school name + button payloads only (meal sizes aligned with master catalog).
 * Frontend should still call GET /api/common/lookup/meal-sizes — same ids must be used here.
 */
exports.getSchoolTokenPanel = catchAsync(async (req, res, next) => {
  const delivery = resolveTokenDate(req.query.date, next);
  if (!delivery) return;

  const catalogRes = await db.query(
    `SELECT id AS meal_size_id,
            name AS meal_size_key,
            display_name AS meal_size_display,
            sort_order
     FROM meal_sizes
     WHERE is_active = true
     ORDER BY sort_order ASC, display_name ASC`
  );

  const { grouped, ids } = await buildSchoolTokenOverviewGrouped(delivery);

  const apiBaseNote =
    'Append ?date=YYYY-MM-DD on PDF GETs. PDF is generated only when user opens the PDF URL (on button click).';

  res.status(200).json({
    success: true,
    date: delivery,
    meal_sizes_catalog: catalogRes.rows,
    hints: {
      pdf_auth:
        'Use Authorization: Bearer <admin_jwt> or ?token=<jwt> on GET PDF (browser fetch + blob recommended).',
      button_integration: apiBaseNote,
      meal_size_buttons_must_match_catalog:
        'meal_size_id on each button must exist in meal_sizes_catalog; inactive ids return 400 on PDF.',
    },
    count: ids.length,
    schools: ids.map((idKey) => {
      const s = grouped[idKey];
      return {
        school_id: s.school_id,
        schoolId: s.schoolId,
        school_name: s.school_name,
        total_students: s.total_students,
        whole_school_pdf: {
          ...s.whole_school_pdf,
          download_url_template: `/api/admin/tokens/schools/${s.school_id}/pdf`,
        },
        meal_size_buttons: (s.meal_sizes || []).map((b) => ({
          meal_size_id: b.meal_size_id,
          meal_size_key: b.meal_size_key,
          meal_size_label: b.meal_size,
          sort_order: b.sort_order,
          /** Use for badge “N meals” — 0 means disable PDF button or grey out */
          eligible_count: b.students_count,
          can_download_pdf: b.can_download_pdf,
          /** Persisted highlight after refresh */
          downloaded: b.downloaded,
          download_count: b.download_count,
          last_downloaded_at: b.last_downloaded_at,
          pdf_download_url: `/api/admin/tokens/schools/${s.school_id}/meal-sizes/${b.meal_size_id}/pdf`,
        })),
      };
    }),
  });
});

/** One PDF: all eligible schools → per school, meal sizes in catalog order (small→medium→large→…); only non-empty size sections. */
exports.downloadExportSchoolsBundlePdf = catchAsync(async (req, res, next) => {
  const adminId = req.user.id;
  const delivery = resolveTokenDate(req.query.date, next);
  if (!delivery) return;

  const meals = await db.query(
    `SELECT id AS meal_size_id, display_name FROM meal_sizes WHERE is_active = true ORDER BY sort_order ASC, display_name ASC`
  );
  const schools = await db.query(
    `SELECT DISTINCT sc.id AS school_id, sc.name AS school_name
     FROM schools sc
     INNER JOIN children ch ON ch.school_id = sc.id
     INNER JOIN client_subscriptions cs ON cs.entity_type = 'child'
       AND cs.entity_id = ch.id
       AND cs.is_active = true
       AND DATE(cs.start_date) <= $1::date
       AND DATE(cs.end_date) >= $1::date
       AND (cs.total_meals - cs.used_meals) > 0
     WHERE NOT EXISTS (
       SELECT 1 FROM meal_skips sk
       WHERE sk.entity_type='child' AND sk.entity_id=ch.id
         AND sk.status='approved'
         AND sk.skip_start_date <= $1::date
         AND sk.skip_end_date >= $1::date
     )
     ORDER BY sc.name ASC`,
    [delivery]
  );

  const sections = [];
  for (const sch of schools.rows) {
    for (const ms of meals.rows) {
      const rows = await fetchSchoolSizePdfRows(sch.school_id, ms.meal_size_id, delivery);
      if (rows.length === 0) continue;
      sections.push({
        title: `${sch.school_name} — ${ms.display_name}`,
        subtitle: `${rows.length} token(s) • ${delivery}`,
        rows,
        drawOne: (doc, x, y, s, serialIdx) => {
          drawTokenCard(doc, x, y, {
            header: `${sch.school_name} — ${delivery}`,
            badge: s.meal_size || ms.display_name,
            serial: `#${serialIdx + 1}`,
            rows: [
              { label: 'Name:', value: s.child_name },
              { label: 'Roll No:', value: s.roll_number },
              { label: 'Standard:', value: s.standard },
              { label: 'Meal Time:', value: s.meal_time },
              { label: 'Remaining:', value: s.remaining_meals },
            ],
          });
        },
      });
    }
  }

  const buffer = await streamBundlePdfToBuffer(sections);
  if (!buffer.length || sections.length === 0) {
    return next(new AppError('No token records found for export (no eligible students on this date).', 404));
  }

  await upsertDownloadLog({
    tokenScope: 'export_school',
    scopeId: 'GLOBAL',
    mealSizeId: WHOLE_DOWNLOAD_MEAL_SIZE_KEY,
    tokenDate: delivery,
    adminId,
  });

  const filename = `TOKENS_ALL_SCHOOLS_${delivery}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

const fetchCorporatePdfRows = async (locationId, delivery) => {
  const result = await db.query(
    `SELECT pp.name, pp.company_name,
            (cs.total_meals - cs.used_meals) AS remaining_meals
     FROM professional_profiles pp
     ${PROF_SUBJOIN.replace(/\$delivery/g, '$2')}
     WHERE pp.corporate_location_id=$1
       AND NOT EXISTS (
         SELECT 1 FROM meal_skips sk
         WHERE sk.entity_type='professional' AND sk.entity_id=pp.id
           AND sk.status='approved'
           AND sk.skip_start_date <= $2::date
           AND sk.skip_end_date >= $2::date
       )
     ORDER BY pp.name ASC`,
    [locationId, delivery]
  );
  return result.rows;
};

/** One PDF: all corporate locations (“college” / office) in name order. */
exports.downloadExportCorporateBundlePdf = catchAsync(async (req, res, next) => {
  const adminId = req.user.id;
  const delivery = resolveTokenDate(req.query.date, next);
  if (!delivery) return;

  const locations = await db.query(
    `SELECT DISTINCT cl.id AS location_id, cl.name AS location_name
     FROM corporate_locations cl
     INNER JOIN professional_profiles pp ON pp.corporate_location_id = cl.id
     INNER JOIN client_subscriptions cs ON cs.entity_type = 'professional'
       AND cs.entity_id = pp.id
       AND cs.is_active = true
       AND DATE(cs.start_date) <= $1::date
       AND DATE(cs.end_date) >= $1::date
       AND (cs.total_meals - cs.used_meals) > 0
     WHERE NOT EXISTS (
       SELECT 1 FROM meal_skips sk
       WHERE sk.entity_type='professional' AND sk.entity_id=pp.id
         AND sk.status='approved'
         AND sk.skip_start_date <= $1::date
         AND sk.skip_end_date >= $1::date
     )
     ORDER BY cl.name ASC`,
    [delivery]
  );

  const sections = [];
  for (const loc of locations.rows) {
    const rows = await fetchCorporatePdfRows(loc.location_id, delivery);
    if (rows.length === 0) continue;
    sections.push({
      title: `${loc.location_name} — Corporate`,
      subtitle: `${rows.length} professional token(s) • ${delivery}`,
      rows,
      drawOne: (doc, x, y, p, serialIdx) => {
        drawTokenCard(doc, x, y, {
          header: `${loc.location_name} — ${delivery}`,
          badge: 'Professional',
          serial: `#${serialIdx + 1}`,
          rows: [
            { label: 'Name:', value: p.name },
            { label: 'Company:', value: p.company_name },
            { label: 'Remaining:', value: p.remaining_meals },
          ],
        });
      },
    });
  }

  const buffer = await streamBundlePdfToBuffer(sections);
  if (!buffer.length || sections.length === 0) {
    return next(new AppError('No corporate token records found for export on this date.', 404));
  }

  await upsertDownloadLog({
    tokenScope: 'export_corp',
    scopeId: 'GLOBAL',
    mealSizeId: WHOLE_DOWNLOAD_MEAL_SIZE_KEY,
    tokenDate: delivery,
    adminId,
  });

  const filename = `TOKENS_ALL_CORPORATE_${delivery}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

/** One PDF: schools export first, then corporate / “college” section. */
exports.downloadExportAllBundlePdf = catchAsync(async (req, res, next) => {
  const adminId = req.user.id;
  const delivery = resolveTokenDate(req.query.date, next);
  if (!delivery) return;

  const meals = await db.query(
    `SELECT id AS meal_size_id, display_name FROM meal_sizes WHERE is_active = true ORDER BY sort_order ASC, display_name ASC`
  );
  const schools = await db.query(
    `SELECT DISTINCT sc.id AS school_id, sc.name AS school_name
     FROM schools sc
     INNER JOIN children ch ON ch.school_id = sc.id
     INNER JOIN client_subscriptions cs ON cs.entity_type = 'child'
       AND cs.entity_id = ch.id
       AND cs.is_active = true
       AND DATE(cs.start_date) <= $1::date
       AND DATE(cs.end_date) >= $1::date
       AND (cs.total_meals - cs.used_meals) > 0
     WHERE NOT EXISTS (
       SELECT 1 FROM meal_skips sk
       WHERE sk.entity_type='child' AND sk.entity_id=ch.id
         AND sk.status='approved'
         AND sk.skip_start_date <= $1::date
         AND sk.skip_end_date >= $1::date
     )
     ORDER BY sc.name ASC`,
    [delivery]
  );

  const locations = await db.query(
    `SELECT DISTINCT cl.id AS location_id, cl.name AS location_name
     FROM corporate_locations cl
     INNER JOIN professional_profiles pp ON pp.corporate_location_id = cl.id
     INNER JOIN client_subscriptions cs ON cs.entity_type = 'professional'
       AND cs.entity_id = pp.id
       AND cs.is_active = true
       AND DATE(cs.start_date) <= $1::date
       AND DATE(cs.end_date) >= $1::date
       AND (cs.total_meals - cs.used_meals) > 0
     WHERE NOT EXISTS (
       SELECT 1 FROM meal_skips sk
       WHERE sk.entity_type='professional' AND sk.entity_id=pp.id
         AND sk.status='approved'
         AND sk.skip_start_date <= $1::date
         AND sk.skip_end_date >= $1::date
     )
     ORDER BY cl.name ASC`,
    [delivery]
  );

  const realSections = [];
  for (const sch of schools.rows) {
    for (const ms of meals.rows) {
      const rows = await fetchSchoolSizePdfRows(sch.school_id, ms.meal_size_id, delivery);
      if (rows.length === 0) continue;
      realSections.push({
        title: `${sch.school_name} — ${ms.display_name}`,
        subtitle: `${rows.length} token(s)`,
        rows,
        drawOne: (doc, x, y, s, serialIdx) => {
          drawTokenCard(doc, x, y, {
            header: `${sch.school_name} — ${delivery}`,
            badge: s.meal_size || ms.display_name,
            serial: `#${serialIdx + 1}`,
            rows: [
              { label: 'Name:', value: s.child_name },
              { label: 'Roll No:', value: s.roll_number },
              { label: 'Standard:', value: s.standard },
              { label: 'Meal Time:', value: s.meal_time },
              { label: 'Remaining:', value: s.remaining_meals },
            ],
          });
        },
      });
    }
  }

  const corpBlocks = [];
  for (const loc of locations.rows) {
    const crows = await fetchCorporatePdfRows(loc.location_id, delivery);
    if (crows.length === 0) continue;
    corpBlocks.push({
      title: loc.location_name,
      subtitle: `${crows.length} professional token(s)`,
      rows: crows,
      drawOne: (d, x, y, p, serialIdx) => {
        drawTokenCard(d, x, y, {
          header: `${loc.location_name} — ${delivery}`,
          badge: 'Professional',
          serial: `#${serialIdx + 1}`,
          rows: [
            { label: 'Name:', value: p.name },
            { label: 'Company:', value: p.company_name },
            { label: 'Remaining:', value: p.remaining_meals },
          ],
        });
      },
    });
  }

  if (realSections.length === 0 && corpBlocks.length === 0) {
    return next(new AppError('No school or corporate token records for combined export on this date.', 404));
  }

  async function mergeExportBuffer() {
    const doc = new PDFDocument({ margin: 30, size: 'A4', bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    return new Promise((resolve, reject) => {
      doc.on('error', reject);
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      doc.fontSize(18).fillColor('#1a365d').text('Combined meal tokens export', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(11).fillColor('#4a5568').text(`Delivery date: ${delivery}`, { align: 'center' });
      doc.moveDown(1);

      let globalSerial = 0;
      let sectionIdx = 0;

      const runSections = async (blocks) => {
        for (const build of blocks) {
          const { title, subtitle, rows, drawOne } = build;
          if (!rows || rows.length === 0) continue;
          if (sectionIdx > 0) doc.addPage();
          sectionIdx++;
          drawSectionTitle(doc, title, subtitle);
          const sectionStartY = Math.max(CARD_MARGIN_TOP, doc.y + 6);
          let layoutIndex = 0;
          let currentPage = 0;
          for (const row of rows) {
            const pos = getCardPos(doc, layoutIndex, sectionStartY);
            if (pos.pageIdx > currentPage) {
              doc.addPage();
              currentPage = pos.pageIdx;
            }
            globalSerial += 1;
            drawOne(doc, pos.x, pos.y, row, globalSerial - 1);
            layoutIndex += 1;
          }
        }
      };

      /** Start part A headers */
      const run = async () => {
        doc.font('Helvetica-Bold').fontSize(14).fillColor('#2b6cb0').text('PART A — Schools', { underline: true });
        doc.moveDown(0.8);
        if (realSections.length === 0) {
          doc.font('Helvetica').fontSize(10).text('No school tokens for this date.');
          doc.moveDown(1);
        } else {
          await runSections(realSections);
          doc.moveDown(0.5);
        }

        doc.addPage();
        doc.font('Helvetica-Bold').fontSize(14).fillColor('#2b6cb0').text('PART B — Corporate / College', { underline: true });
        doc.moveDown(0.8);

        sectionIdx = 0;
        if (corpBlocks.length === 0) {
          doc.font('Helvetica').fontSize(10).text('No corporate tokens for this date.');
        } else {
          await runSections(corpBlocks);
        }

        doc.end();
      };

      run().catch(reject);
    });
  }

  const buffer = await mergeExportBuffer();
  if (!buffer?.length) {
    return next(new AppError('Export failed.', 500));
  }

  await upsertDownloadLog({
    tokenScope: 'export_all',
    scopeId: 'GLOBAL',
    mealSizeId: WHOLE_DOWNLOAD_MEAL_SIZE_KEY,
    tokenDate: delivery,
    adminId,
  });

  const filename = `TOKENS_SCHOOLS_AND_CORP_${delivery}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

exports.getCorporateTokenOverview = catchAsync(async (req, res, next) => {
  const delivery = resolveTokenDate(req.query.date, next);
  if (!delivery) return;
  const result = await db.query(
    `SELECT cl.id AS corporate_location_id,
            cl.name AS corporate_location_name,
            COUNT(*)::INTEGER AS professionals_count,
            COALESCE(tdl.downloaded, false) AS downloaded,
            COALESCE(tdl.download_count, 0)::INTEGER AS download_count,
            tdl.last_downloaded_at
     FROM corporate_locations cl
     JOIN professional_profiles pp ON pp.corporate_location_id = cl.id
     ${PROF_SUBJOIN.replace(/\$delivery/g, '$1')}
     LEFT JOIN token_download_logs tdl
       ON tdl.token_scope = 'corporate'
      AND tdl.scope_id = cl.id
      AND tdl.meal_size_id = ${WHOLE_DOWNLOAD_MEAL_SIZE_KEY}
      AND tdl.token_date = $1::date
     WHERE NOT EXISTS (
       SELECT 1 FROM meal_skips sk
       WHERE sk.entity_type='professional' AND sk.entity_id=pp.id
         AND sk.status='approved'
         AND sk.skip_start_date <= $1::date
         AND sk.skip_end_date >= $1::date
     )
     GROUP BY cl.id, cl.name, tdl.downloaded, tdl.download_count, tdl.last_downloaded_at
     ORDER BY cl.name ASC`,
    [delivery]
  );

  res.status(200).json({
    success: true,
    date: delivery,
    count: result.rowCount,
    data: result.rows,
  });
});

exports.getSchoolMealSizeTokens = catchAsync(async (req, res, next) => {
  const sid = sanitizePathSchoolId(req.params.schoolId, next);
  if (!sid) return;
  const mid = sanitizePathMealSizeId(req.params.mealSizeId, next);
  if (!mid) return;
  const schoolId = sid;
  const mealSizeId = mid;
  const delivery = resolveTokenDate(req.query.date, next);
  if (!delivery) return;
  const includeTokensRaw = req.query.includeTokens ?? req.query.include_tokens;
  const includeTokens =
    includeTokensRaw === true ||
    includeTokensRaw === 'true' ||
    includeTokensRaw === '1' ||
    includeTokensRaw === 1;

  const school = await db.query('SELECT id, name FROM schools WHERE id = $1', [schoolId]);
  if (school.rowCount === 0) return next(new AppError('School not found.', 404));

  const msRow = await assertActiveMealSizeId(Number(mealSizeId), next);
  if (!msRow) return;

  const students = await db.query(
    `SELECT ch.id AS entity_id, 'child' AS entity_type, ch.name AS student_name, ch.roll_number,
            s.display_name AS standard, ms.display_name AS meal_size,
            (cs.total_meals - cs.used_meals) AS remaining_meals
     FROM children ch
     ${CHILD_SUBJOIN.replace(/\$delivery/g, '$3')}
     LEFT JOIN standards s ON s.id = ch.standard_id
     LEFT JOIN meal_sizes ms ON ms.id = ch.meal_size_id
     WHERE ch.school_id = $1
       AND ch.meal_size_id = $2
       AND NOT EXISTS (
         SELECT 1 FROM meal_skips sk
         WHERE sk.entity_type='child' AND sk.entity_id=ch.id
           AND sk.status='approved'
           AND sk.skip_start_date <= $3::date
           AND sk.skip_end_date >= $3::date
       )
     ORDER BY ch.name ASC`,
    [schoolId, mealSizeId, delivery]
  );

  const downloadStatus = await db.query(
    `SELECT COALESCE(downloaded, false) AS downloaded,
            COALESCE(download_count, 0)::INTEGER AS download_count,
            last_downloaded_at
     FROM token_download_logs
     WHERE token_scope='school' AND scope_id=$1 AND meal_size_id=$2 AND token_date=$3::date`,
    [schoolId, normalizeMealSizeKey(mealSizeId), delivery]
  );
  const status = downloadStatus.rows[0] || { downloaded: false, download_count: 0, last_downloaded_at: null };

  const payload = {
    school_id: school.rows[0].id,
    school_name: school.rows[0].name,
    meal_size_id: msRow.id,
    meal_size: msRow.display_name,
    count: students.rowCount,
    downloaded: status.downloaded,
    download_count: status.download_count,
    last_downloaded_at: status.last_downloaded_at,
  };
  if (includeTokens) {
    payload.tokens = students.rows;
  }

  res.status(200).json({
    success: true,
    date: delivery,
    data: payload,
  });
});

exports.downloadSchoolMealSizeTokensPdf = catchAsync(async (req, res, next) => {
  const sid = sanitizePathSchoolId(req.params.schoolId, next);
  if (!sid) return;
  const mid = sanitizePathMealSizeId(req.params.mealSizeId, next);
  if (!mid) return;
  const schoolId = sid;
  const mealSizeId = mid;
  const adminId = req.user.id;
  const delivery = resolveTokenDate(req.query.date, next);
  if (!delivery) return;

  const school = await db.query('SELECT id, name FROM schools WHERE id = $1', [schoolId]);
  if (school.rowCount === 0) return next(new AppError('School not found.', 404));

  const mealSize = await assertActiveMealSizeId(Number(mealSizeId), next);
  if (!mealSize) return;

  const result = await db.query(
    `SELECT ch.name AS child_name, ch.roll_number,
            s.display_name AS standard, ms.display_name AS meal_size,
            ch.meal_time,
            (cs.total_meals - cs.used_meals) AS remaining_meals
     FROM children ch
     ${CHILD_SUBJOIN.replace(/\$delivery/g, '$3')}
     LEFT JOIN standards s ON s.id = ch.standard_id
     LEFT JOIN meal_sizes ms ON ms.id = ch.meal_size_id
     WHERE ch.school_id=$1
       AND ch.meal_size_id=$2
       AND NOT EXISTS (
         SELECT 1 FROM meal_skips sk
         WHERE sk.entity_type='child' AND sk.entity_id=ch.id
           AND sk.status='approved'
           AND sk.skip_start_date <= $3::date
           AND sk.skip_end_date >= $3::date
       )
     ORDER BY ch.name ASC`,
    [schoolId, mealSizeId, delivery]
  );

  if (result.rowCount === 0) {
    return next(new AppError('No token records found for selected school and meal size.', 404));
  }

  await upsertDownloadLog({
    tokenScope: 'school',
    scopeId: schoolId,
    mealSizeId: normalizeMealSizeKey(mealSizeId),
    tokenDate: delivery,
    adminId,
  });

  const safeSchool = school.rows[0].name.replace(/\s+/g, '_');
  const safeSize = mealSize.display_name.replace(/\s+/g, '_');
  const filename = `tokens_${safeSchool}_${safeSize}_${delivery}.pdf`;

  await sendCardsPdfAttachment(res, filename, result.rows, (doc, x, y, s, idx) => {
    drawTokenCard(doc, x, y, {
      header: `${school.rows[0].name} — ${delivery}`,
      badge: s.meal_size || 'Standard',
      serial: `#${idx + 1}`,
      rows: [
        { label: 'Name:', value: s.child_name },
        { label: 'Roll No:', value: s.roll_number },
        { label: 'Standard:', value: s.standard },
        { label: 'Meal Time:', value: s.meal_time },
        { label: 'Remaining:', value: s.remaining_meals },
      ],
    });
  });
});

/**
 * Whole school PDF: all meal sizes, card layout — generated only on GET (download).
 */
exports.downloadSchoolAllSizesTokensPdf = catchAsync(async (req, res, next) => {
  const sid = sanitizePathSchoolId(req.params.schoolId, next);
  if (!sid) return;
  const schoolId = sid;
  const adminId = req.user.id;
  const delivery = resolveTokenDate(req.query.date, next);
  if (!delivery) return;

  const school = await db.query('SELECT id, name FROM schools WHERE id = $1', [schoolId]);
  if (school.rowCount === 0) return next(new AppError('School not found.', 404));

  const result = await db.query(
    `SELECT ch.name AS child_name, ch.roll_number,
            s.display_name AS standard, ms.display_name AS meal_size, ms.sort_order,
            ch.meal_time,
            (cs.total_meals - cs.used_meals) AS remaining_meals
     FROM children ch
     ${CHILD_SUBJOIN.replace(/\$delivery/g, '$2')}
     LEFT JOIN standards s ON s.id = ch.standard_id
     LEFT JOIN meal_sizes ms ON ms.id = ch.meal_size_id
     WHERE ch.school_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM meal_skips sk
         WHERE sk.entity_type='child' AND sk.entity_id=ch.id
           AND sk.status='approved'
           AND sk.skip_start_date <= $2::date
           AND sk.skip_end_date >= $2::date
       )
     ORDER BY ms.sort_order NULLS LAST, ms.display_name, ch.name`,
    [schoolId, delivery]
  );

  if (result.rowCount === 0) {
    return next(new AppError('No token records found for selected school.', 404));
  }

  await upsertDownloadLog({
    tokenScope: 'school',
    scopeId: schoolId,
    mealSizeId: WHOLE_DOWNLOAD_MEAL_SIZE_KEY,
    tokenDate: delivery,
    adminId,
  });

  const safeSchool = school.rows[0].name.replace(/\s+/g, '_');
  const filename = `tokens_${safeSchool}_ALL_SIZES_${delivery}.pdf`;

  await sendCardsPdfAttachment(res, filename, result.rows, (doc, x, y, s, idx) => {
    drawTokenCard(doc, x, y, {
      header: `${school.rows[0].name} — ${delivery}`,
      badge: s.meal_size || 'Standard',
      serial: `#${idx + 1}`,
      rows: [
        { label: 'Name:', value: s.child_name },
        { label: 'Roll No:', value: s.roll_number },
        { label: 'Standard:', value: s.standard },
        { label: 'Meal Time:', value: s.meal_time },
        { label: 'Remaining:', value: s.remaining_meals },
      ],
    });
  });
});

exports.getCorporateTokens = catchAsync(async (req, res, next) => {
  const lid = sanitizePathLocationId(req.params.locationId, next);
  if (!lid) return;
  const locationId = lid;
  const delivery = resolveTokenDate(req.query.date, next);
  if (!delivery) return;
  const location = await db.query('SELECT id, name FROM corporate_locations WHERE id = $1', [locationId]);
  if (location.rowCount === 0) return next(new AppError('Corporate location not found.', 404));

  const result = await db.query(
    `SELECT pp.id AS entity_id, 'professional' AS entity_type, pp.name AS professional_name,
            pp.company_name, (cs.total_meals - cs.used_meals) AS remaining_meals,
            'Professional' AS meal_size
     FROM professional_profiles pp
     ${PROF_SUBJOIN.replace(/\$delivery/g, '$2')}
     WHERE pp.corporate_location_id=$1
       AND NOT EXISTS (
         SELECT 1 FROM meal_skips sk
         WHERE sk.entity_type='professional' AND sk.entity_id=pp.id
           AND sk.status='approved'
           AND sk.skip_start_date <= $2::date
           AND sk.skip_end_date >= $2::date
       )
     ORDER BY pp.name ASC`,
    [locationId, delivery]
  );

  const downloadStatus = await db.query(
    `SELECT COALESCE(downloaded, false) AS downloaded,
            COALESCE(download_count, 0)::INTEGER AS download_count,
            last_downloaded_at
     FROM token_download_logs
     WHERE token_scope='corporate' AND scope_id=$1 AND meal_size_id=$2 AND token_date=$3::date`,
    [locationId, WHOLE_DOWNLOAD_MEAL_SIZE_KEY, delivery]
  );
  const status = downloadStatus.rows[0] || { downloaded: false, download_count: 0, last_downloaded_at: null };

  res.status(200).json({
    success: true,
    date: delivery,
    data: {
      corporate_location_id: location.rows[0].id,
      corporate_location_name: location.rows[0].name,
      count: result.rowCount,
      downloaded: status.downloaded,
      download_count: status.download_count,
      last_downloaded_at: status.last_downloaded_at,
      tokens: result.rows,
    },
  });
});

exports.downloadCorporateTokensPdf = catchAsync(async (req, res, next) => {
  const lid = sanitizePathLocationId(req.params.locationId, next);
  if (!lid) return;
  const locationId = lid;
  const adminId = req.user.id;
  const delivery = resolveTokenDate(req.query.date, next);
  if (!delivery) return;
  const location = await db.query('SELECT id, name FROM corporate_locations WHERE id = $1', [locationId]);
  if (location.rowCount === 0) return next(new AppError('Corporate location not found.', 404));

  const result = await db.query(
    `SELECT pp.name, pp.company_name,
            (cs.total_meals - cs.used_meals) AS remaining_meals
     FROM professional_profiles pp
     ${PROF_SUBJOIN.replace(/\$delivery/g, '$2')}
     WHERE pp.corporate_location_id=$1
       AND NOT EXISTS (
         SELECT 1 FROM meal_skips sk
         WHERE sk.entity_type='professional' AND sk.entity_id=pp.id
           AND sk.status='approved'
           AND sk.skip_start_date <= $2::date
           AND sk.skip_end_date >= $2::date
       )
     ORDER BY pp.name ASC`,
    [locationId, delivery]
  );
  if (result.rowCount === 0) {
    return next(new AppError('No token records found for selected corporate location.', 404));
  }

  await upsertDownloadLog({
    tokenScope: 'corporate',
    scopeId: locationId,
    mealSizeId: WHOLE_DOWNLOAD_MEAL_SIZE_KEY,
    tokenDate: delivery,
    adminId,
  });

  const safeLoc = location.rows[0].name.replace(/\s+/g, '_');
  const filename = `tokens_${safeLoc}_${delivery}.pdf`;

  await sendCardsPdfAttachment(res, filename, result.rows, (doc, x, y, p, idx) => {
    drawTokenCard(doc, x, y, {
      header: `${location.rows[0].name} — ${delivery}`,
      badge: 'Professional',
      serial: `#${idx + 1}`,
      rows: [
        { label: 'Name:', value: p.name },
        { label: 'Company:', value: p.company_name },
        { label: 'Remaining:', value: p.remaining_meals },
      ],
    });
  });
});

exports.addExtraMeals = catchAsync(async (req, res, next) => {
  const adminId = req.user.id;
  const { subscriptionId } = req.params;
  const { extraMeals, reason } = req.body;

  const parsedExtra = Number(extraMeals);
  if (!Number.isInteger(parsedExtra) || parsedExtra <= 0) {
    return next(new AppError('extraMeals must be a positive integer.', 400));
  }

  if (!reason || String(reason).trim().length < 3) {
    return next(new AppError('reason is required and must be at least 3 characters.', 400));
  }

  const subscription = await db.query(
    `SELECT id, total_meals, used_meals
     FROM client_subscriptions
     WHERE id = $1`,
    [subscriptionId]
  );
  if (subscription.rowCount === 0) return next(new AppError('Subscription not found.', 404));

  await db.query('BEGIN');
  try {
    const updated = await db.query(
      `UPDATE client_subscriptions
       SET total_meals = total_meals + $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, total_meals, used_meals`,
      [parsedExtra, subscriptionId]
    );

    await db.query(
      `INSERT INTO subscription_meal_adjustments
       (subscription_id, adjusted_by, adjustment_type, meal_delta, reason)
       VALUES ($1, $2, 'extra_meals', $3, $4)`,
      [subscriptionId, adminId, parsedExtra, reason.trim()]
    );
    await db.query('COMMIT');

    const item = updated.rows[0];
    res.status(200).json({
      success: true,
      message: 'Extra meals added successfully.',
      data: {
        subscription_id: item.id,
        added_meals: parsedExtra,
        total_meals: item.total_meals,
        used_meals: item.used_meals,
        remaining_meals: item.total_meals - item.used_meals,
      },
    });
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
});

exports.getMealSkipPolicy = catchAsync(async (req, res) => {
  const policy = await getSkipPolicy();
  res.status(200).json({
    success: true,
    data: policy,
  });
});

exports.updateMealSkipPolicy = catchAsync(async (req, res, next) => {
  const { minSkipDays, minNoticeDays } = req.body;
  const updates = [];

  if (minSkipDays !== undefined) {
    const value = Number(minSkipDays);
    if (!Number.isInteger(value) || value < 1 || value > 30) {
      return next(new AppError('minSkipDays must be an integer between 1 and 30.', 400));
    }
    updates.push(['meal_skip_min_days', String(value)]);
  }

  if (minNoticeDays !== undefined) {
    const value = Number(minNoticeDays);
    if (!Number.isInteger(value) || value < 0 || value > 15) {
      return next(new AppError('minNoticeDays must be an integer between 0 and 15.', 400));
    }
    updates.push(['meal_skip_min_notice_days', String(value)]);
  }

  if (updates.length === 0) {
    return next(new AppError('At least one field is required: minSkipDays or minNoticeDays.', 400));
  }

  for (const [key, value] of updates) {
    await db.query(
      `INSERT INTO app_settings (setting_key, setting_value)
       VALUES ($1, $2)
       ON CONFLICT (setting_key) DO UPDATE
       SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`,
      [key, value]
    );
  }

  const policy = await getSkipPolicy();
  res.status(200).json({
    success: true,
    message: 'Meal skip policy updated successfully.',
    data: policy,
  });
});
