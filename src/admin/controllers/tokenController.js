const crypto = require('crypto');
const db = require('../../common/database');
const catchAsync = require('../../common/utils/catchAsync');
const AppError = require('../../common/utils/AppError');
const PDFDocument = require('pdfkit');
const mealEligibilityService = require('../../common/services/mealEligibilityService');

const parseToday = () => mealEligibilityService.parseSessionToday();

/** Use -1 in DB when token PDF is “all meal sizes” (school) or corporate bundle */
const WHOLE_DOWNLOAD_MEAL_SIZE_KEY = -1;

const normalizeMealSizeKey = (mealSizeId) => {
  if (mealSizeId === null || mealSizeId === undefined || mealSizeId === '') return WHOLE_DOWNLOAD_MEAL_SIZE_KEY;
  const n = Number(mealSizeId);
  return Number.isFinite(n) ? n : WHOLE_DOWNLOAD_MEAL_SIZE_KEY;
};

const resolveTokenDate = (inputDate, next) => mealEligibilityService.resolveDeliveryDate(inputDate, next);

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

/** Every PDF download is regenerated; a copy is stored for audit and later retrieval. */
const persistTokenPdfExport = async ({ buffer, tokenScope, scopeId, mealSizeId, tokenDate, adminId, rowCount }) => {
  if (!buffer || !buffer.length) return;
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  await db.query(
    `INSERT INTO token_pdf_exports
      (token_scope, scope_id, meal_size_id, token_date, admin_id, row_count, content_sha256, pdf_bytes)
     VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8)`,
    [
      tokenScope,
      scopeId,
      normalizeMealSizeKey(mealSizeId),
      tokenDate,
      adminId,
      rowCount,
      hash,
      buffer,
    ]
  );
};

const sendPdfBuffer = (res, filename, buffer) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
};

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

const buildSchoolCardRows = (row) => {
  if (row.entity_type === 'teacher') {
    return [
      { label: 'Name:', value: row.child_name },
      { label: 'Role:', value: 'Teacher' },
      { label: 'Meal Size:', value: row.meal_size },
      { label: 'Meal Time:', value: row.meal_time || '1:00 PM' },
      { label: 'Remaining:', value: row.remaining_meals },
    ];
  }
  return [
    { label: 'Name:', value: row.child_name },
    { label: 'Roll No:', value: row.roll_number },
    { label: 'Standard:', value: row.standard },
    { label: 'Meal Time:', value: row.meal_time },
    { label: 'Remaining:', value: row.remaining_meals },
  ];
};

const groupSchoolRowsForExport = (rows, mealCatalogRows = []) => {
  const grouped = new Map();
  (rows || []).forEach((row) => {
    const key = row.meal_size || 'Unassigned';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  });

  const ordered = [];
  for (const meal of mealCatalogRows) {
    const key = meal.display_name;
    if (grouped.has(key)) {
      ordered.push({ label: key, rows: grouped.get(key) });
      grouped.delete(key);
    }
  }

  if (grouped.has('Unassigned')) {
    ordered.push({ label: 'Unassigned', rows: grouped.get('Unassigned') });
    grouped.delete('Unassigned');
  }

  for (const [label, groupRows] of grouped.entries()) {
    ordered.push({ label, rows: groupRows });
  }

  return ordered;
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

const buildCardsPdfBuffer = (rows, drawRowCard) => streamCardsPdfBuffer(rows, drawRowCard);

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
  const countsRes = await mealEligibilityService.fetchSchoolMealSizeCounts(delivery);
  const countBySchool = {};
  for (const row of countsRes.rows) {
    if (!countBySchool[row.school_id]) countBySchool[row.school_id] = {};
    countBySchool[row.school_id][row.meal_size_id] = row.students_count;
  }
  const schoolIds = Object.keys(countBySchool);
  if (schoolIds.length === 0) return { grouped: {}, ids: [] };

  const schoolsRes = await db.query(
    `SELECT id AS school_id, name AS school_name FROM schools WHERE id = ANY($1::varchar[]) ORDER BY name ASC`,
    [schoolIds]
  );
  const catalog = await db.query(
    `SELECT id AS meal_size_id, name AS meal_size_key, display_name AS meal_size, sort_order
     FROM meal_sizes WHERE is_active = true
     ORDER BY sort_order ASC, display_name ASC`
  );

  const logRows = await db.query(
    `SELECT scope_id AS school_id, meal_size_id,
            COALESCE(downloaded, false) AS downloaded,
            COALESCE(download_count, 0)::INTEGER AS download_count,
            last_downloaded_at
     FROM token_download_logs
     WHERE token_scope = 'school' AND token_date = $1::date AND scope_id = ANY($2::varchar[])`,
    [delivery, schoolIds]
  );
  const logKey = (sid, mid) => `${sid}::${mid}`;
  const logMap = new Map();
  for (const lr of logRows.rows) {
    logMap.set(logKey(lr.school_id, Number(lr.meal_size_id)), lr);
  }

  const grouped = {};
  for (const s of schoolsRes.rows) {
    grouped[s.school_id] = {
      school_id: s.school_id,
      schoolId: s.school_id,
      school_name: s.school_name,
      total_students: 0,
      meal_sizes: [],
      whole_school_pdf: {
        downloaded: false,
        download_count: 0,
        last_downloaded_at: null,
      },
    };
    for (const ms of catalog.rows) {
      const sc = Number(countBySchool[s.school_id]?.[ms.meal_size_id]) || 0;
      grouped[s.school_id].total_students += sc;
      const lg = logMap.get(logKey(s.school_id, ms.meal_size_id)) || {
        downloaded: false,
        download_count: 0,
        last_downloaded_at: null,
      };
      grouped[s.school_id].meal_sizes.push({
        meal_size_id: ms.meal_size_id,
        meal_size_key: ms.meal_size_key,
        meal_size: ms.meal_size,
        sort_order: ms.sort_order,
        students_count: sc,
        can_download_pdf: sc > 0,
        downloaded: lg.downloaded,
        download_count: lg.download_count,
        last_downloaded_at: lg.last_downloaded_at,
      });
    }
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
    'Append ?date=YYYY-MM-DD on PDF GETs. Each PDF request regenerates fresh content from current DB state; a byte-accurate copy is also stored (see GET /api/admin/tokens/pdf-exports).';

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
  const schools = await mealEligibilityService.fetchDistinctSchoolsWithEligibleChildren(delivery);

  const sections = [];
  let totalRows = 0;
  for (const sch of schools.rows) {
    const allRowsRes = await mealEligibilityService.fetchChildTokenRows({
      schoolId: sch.school_id,
      mealSizeId: null,
      delivery,
    });
    const allRows = allRowsRes.rows || [];
    totalRows += allRows.length;

    const grouped = groupSchoolRowsForExport(allRows, meals.rows);
    for (const group of grouped) {
      const rows = group.rows;
      if (!rows.length) continue;
      sections.push({
        title: `${sch.school_name} — ${group.label}`,
        subtitle: `${rows.length} token(s) • ${delivery}`,
        rows,
        drawOne: (doc, x, y, s, serialIdx) => {
          drawTokenCard(doc, x, y, {
            header: `${sch.school_name} — ${delivery}`,
            badge: s.meal_size || group.label,
            serial: `#${serialIdx + 1}`,
            rows: buildSchoolCardRows(s),
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

  await persistTokenPdfExport({
    buffer,
    tokenScope: 'export_school',
    scopeId: 'GLOBAL',
    mealSizeId: WHOLE_DOWNLOAD_MEAL_SIZE_KEY,
    tokenDate: delivery,
    adminId,
    rowCount: totalRows,
  });

  const filename = `TOKENS_ALL_SCHOOLS_${delivery}.pdf`;
  sendPdfBuffer(res, filename, buffer);
});

/** One PDF: all corporate locations (“college” / office) in name order. */
exports.downloadExportCorporateBundlePdf = catchAsync(async (req, res, next) => {
  const adminId = req.user.id;
  const delivery = resolveTokenDate(req.query.date, next);
  if (!delivery) return;

  const locations = await mealEligibilityService.fetchDistinctCorporateLocationsWithEligible(delivery);

  const sections = [];
  let totalRows = 0;
  for (const loc of locations.rows) {
    const q = await mealEligibilityService.fetchProfessionalTokenRows({
      locationId: loc.location_id,
      delivery,
    });
    const rows = q.rows;
    totalRows += rows.length;
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
            { label: 'Meal Size:', value: p.meal_size || 'Large' },
            { label: 'Meal Time:', value: p.meal_time || '1:00 PM' },
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

  await persistTokenPdfExport({
    buffer,
    tokenScope: 'export_corp',
    scopeId: 'GLOBAL',
    mealSizeId: WHOLE_DOWNLOAD_MEAL_SIZE_KEY,
    tokenDate: delivery,
    adminId,
    rowCount: totalRows,
  });

  const filename = `TOKENS_ALL_CORPORATE_${delivery}.pdf`;
  sendPdfBuffer(res, filename, buffer);
});

/** One PDF: schools export first, then corporate / “college” section. */
exports.downloadExportAllBundlePdf = catchAsync(async (req, res, next) => {
  const adminId = req.user.id;
  const delivery = resolveTokenDate(req.query.date, next);
  if (!delivery) return;

  const meals = await db.query(
    `SELECT id AS meal_size_id, display_name FROM meal_sizes WHERE is_active = true ORDER BY sort_order ASC, display_name ASC`
  );
  const schools = await mealEligibilityService.fetchDistinctSchoolsWithEligibleChildren(delivery);
  const locations = await mealEligibilityService.fetchDistinctCorporateLocationsWithEligible(delivery);

  const realSections = [];
  let totalSchoolRows = 0;
  for (const sch of schools.rows) {
    const allRowsRes = await mealEligibilityService.fetchChildTokenRows({
      schoolId: sch.school_id,
      mealSizeId: null,
      delivery,
    });
    const allRows = allRowsRes.rows || [];
    totalSchoolRows += allRows.length;

    const grouped = groupSchoolRowsForExport(allRows, meals.rows);
    for (const group of grouped) {
      const rows = group.rows;
      if (!rows.length) continue;
      realSections.push({
        title: `${sch.school_name} — ${group.label}`,
        subtitle: `${rows.length} token(s)`,
        rows,
        drawOne: (doc, x, y, s, serialIdx) => {
          drawTokenCard(doc, x, y, {
            header: `${sch.school_name} — ${delivery}`,
            badge: s.meal_size || group.label,
            serial: `#${serialIdx + 1}`,
            rows: buildSchoolCardRows(s),
          });
        },
      });
    }
  }

  const corpBlocks = [];
  let totalCorpRows = 0;
  for (const loc of locations.rows) {
    const q = await mealEligibilityService.fetchProfessionalTokenRows({
      locationId: loc.location_id,
      delivery,
    });
    const crows = q.rows;
    totalCorpRows += crows.length;
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
            { label: 'Meal Size:', value: p.meal_size || 'Large' },
            { label: 'Meal Time:', value: p.meal_time || '1:00 PM' },
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

  await persistTokenPdfExport({
    buffer,
    tokenScope: 'export_all',
    scopeId: 'GLOBAL',
    mealSizeId: WHOLE_DOWNLOAD_MEAL_SIZE_KEY,
    tokenDate: delivery,
    adminId,
    rowCount: totalSchoolRows + totalCorpRows,
  });

  const filename = `TOKENS_SCHOOLS_AND_CORP_${delivery}.pdf`;
  sendPdfBuffer(res, filename, buffer);
});

exports.getCorporateTokenOverview = catchAsync(async (req, res, next) => {
  const delivery = resolveTokenDate(req.query.date, next);
  if (!delivery) return;
  const base = await mealEligibilityService.fetchCorporateOverviewBase(delivery);
  const locIds = base.rows.map((r) => r.corporate_location_id);
  let logMap = new Map();
  if (locIds.length > 0) {
    const logs = await db.query(
      `SELECT scope_id AS corporate_location_id,
              COALESCE(downloaded, false) AS downloaded,
              COALESCE(download_count, 0)::INTEGER AS download_count,
              last_downloaded_at
       FROM token_download_logs
       WHERE token_scope = 'corporate'
         AND meal_size_id = ${WHOLE_DOWNLOAD_MEAL_SIZE_KEY}
         AND token_date = $1::date
         AND scope_id = ANY($2::varchar[])`,
      [delivery, locIds]
    );
    logMap = new Map(logs.rows.map((l) => [l.corporate_location_id, l]));
  }

  const data = base.rows.map((row) => {
    const lg = logMap.get(row.corporate_location_id) || {
      downloaded: false,
      download_count: 0,
      last_downloaded_at: null,
    };
    return {
      corporate_location_id: row.corporate_location_id,
      corporate_location_name: row.corporate_location_name,
      professionals_count: row.professionals_count,
      downloaded: lg.downloaded,
      download_count: lg.download_count,
      last_downloaded_at: lg.last_downloaded_at,
    };
  });

  res.status(200).json({
    success: true,
    date: delivery,
    count: data.length,
    data,
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

  const students = await mealEligibilityService.fetchChildTokenRows({
    schoolId,
    mealSizeId,
    delivery,
  });

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
    count: students.rows.length,
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

  const result = await mealEligibilityService.fetchChildTokenRows({
    schoolId,
    mealSizeId,
    delivery,
  });

  if (result.rows.length === 0) {
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

  const buffer = await buildCardsPdfBuffer(result.rows, (doc, x, y, s, idx) => {
    drawTokenCard(doc, x, y, {
      header: `${school.rows[0].name} — ${delivery}`,
      badge: s.meal_size || 'Standard',
      serial: `#${idx + 1}`,
      rows: buildSchoolCardRows(s),
    });
  });

  await persistTokenPdfExport({
    buffer,
    tokenScope: 'school',
    scopeId: schoolId,
    mealSizeId: normalizeMealSizeKey(mealSizeId),
    tokenDate: delivery,
    adminId,
    rowCount: result.rows.length,
  });

  sendPdfBuffer(res, filename, buffer);
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

  const result = await mealEligibilityService.fetchChildTokenRows({
    schoolId,
    mealSizeId: null,
    delivery,
  });

  if (result.rows.length === 0) {
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

  const buffer = await buildCardsPdfBuffer(result.rows, (doc, x, y, s, idx) => {
    drawTokenCard(doc, x, y, {
      header: `${school.rows[0].name} — ${delivery}`,
      badge: s.meal_size || 'Standard',
      serial: `#${idx + 1}`,
      rows: buildSchoolCardRows(s),
    });
  });

  await persistTokenPdfExport({
    buffer,
    tokenScope: 'school',
    scopeId: schoolId,
    mealSizeId: WHOLE_DOWNLOAD_MEAL_SIZE_KEY,
    tokenDate: delivery,
    adminId,
    rowCount: result.rows.length,
  });

  sendPdfBuffer(res, filename, buffer);
});

exports.getCorporateTokens = catchAsync(async (req, res, next) => {
  const lid = sanitizePathLocationId(req.params.locationId, next);
  if (!lid) return;
  const locationId = lid;
  const delivery = resolveTokenDate(req.query.date, next);
  if (!delivery) return;
  const location = await db.query('SELECT id, name FROM corporate_locations WHERE id = $1', [locationId]);
  if (location.rowCount === 0) return next(new AppError('Corporate location not found.', 404));

  const result = await mealEligibilityService.fetchProfessionalTokenRows({
    locationId,
    delivery,
  });

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
      count: result.rows.length,
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

  const result = await mealEligibilityService.fetchProfessionalTokenRows({
    locationId,
    delivery,
  });
  if (result.rows.length === 0) {
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

  const buffer = await buildCardsPdfBuffer(result.rows, (doc, x, y, p, idx) => {
    drawTokenCard(doc, x, y, {
      header: `${location.rows[0].name} — ${delivery}`,
      badge: 'Professional',
      serial: `#${idx + 1}`,
      rows: [
        { label: 'Name:', value: p.name },
        { label: 'Company:', value: p.company_name },
        { label: 'Meal Size:', value: p.meal_size || 'Large' },
        { label: 'Meal Time:', value: p.meal_time || '1:00 PM' },
        { label: 'Remaining:', value: p.remaining_meals },
      ],
    });
  });

  await persistTokenPdfExport({
    buffer,
    tokenScope: 'corporate',
    scopeId: locationId,
    mealSizeId: WHOLE_DOWNLOAD_MEAL_SIZE_KEY,
    tokenDate: delivery,
    adminId,
    rowCount: result.rows.length,
  });

  sendPdfBuffer(res, filename, buffer);
});

exports.listTokenPdfExports = catchAsync(async (req, res, next) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const dateFilter = req.query.date ? mealEligibilityService.resolveDeliveryDate(req.query.date, next) : null;
  if (req.query.date && !dateFilter) return;
  const { token_scope: tokenScope } = req.query;

  const params = [];
  const cond = ['1=1'];
  if (dateFilter) {
    params.push(dateFilter);
    cond.push(`token_date = $${params.length}::date`);
  }
  if (tokenScope) {
    params.push(String(tokenScope));
    cond.push(`token_scope = $${params.length}`);
  }

  const r = await db.query(
    `SELECT id, token_scope, scope_id, meal_size_id, token_date, admin_id, row_count, content_sha256, created_at
     FROM token_pdf_exports
     WHERE ${cond.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT ${limit}`,
    params
  );

  res.status(200).json({
    success: true,
    count: r.rowCount,
    data: r.rows,
  });
});

exports.downloadStoredTokenPdfExport = catchAsync(async (req, res, next) => {
  const id = parseInt(req.params.exportId, 10);
  if (!Number.isFinite(id)) return next(new AppError('Invalid export id.', 400));

  const r = await db.query(
    `SELECT pdf_bytes, token_scope, scope_id, token_date, meal_size_id
     FROM token_pdf_exports WHERE id = $1`,
    [id]
  );
  if (r.rowCount === 0) return next(new AppError('Stored PDF export not found.', 404));

  const row = r.rows[0];
  const filename = `ARCHIVE_${row.token_scope}_${row.scope_id}_ms${row.meal_size_id}_${row.token_date}.pdf`;
  sendPdfBuffer(res, filename, row.pdf_bytes);
});

exports.addExtraMeals = catchAsync(async (req, res, next) => {
  const adminId = req.user.id;
  const { subscriptionId } = req.params;
  const { extraMeals, reason } = req.body;

  const YMD = /^\d{4}-\d{2}-\d{2}$/;
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
  const extendEndYmdByMealDays = ({ endYmd, includeSaturday, extraMeals: extra }) => {
    let remainingExtra = extra;
    let cursor = endYmd;
    while (remainingExtra > 0) {
      cursor = addDaysYmd(cursor, 1);
      const saturday = isSaturdayYmd(cursor);
      const isMealDay = includeSaturday || !saturday;
      if (isMealDay) remainingExtra -= 1;
    }
    return cursor;
  };

  const parsedExtra = Number(extraMeals);
  if (!Number.isInteger(parsedExtra) || parsedExtra <= 0) {
    return next(new AppError('extraMeals must be a positive integer.', 400));
  }

  if (!reason || String(reason).trim().length < 3) {
    return next(new AppError('reason is required and must be at least 3 characters.', 400));
  }

  const subscription = await db.query(
    `SELECT id, total_meals, used_meals, end_date, include_saturday
     FROM client_subscriptions
     WHERE id = $1`,
    [subscriptionId]
  );
  if (subscription.rowCount === 0) return next(new AppError('Subscription not found.', 404));

  const sub = subscription.rows[0];
  const endYmd = String(sub.end_date).slice(0, 10);
  if (!YMD.test(endYmd)) return next(new AppError('Invalid end_date in subscription.', 500));

  const includeSaturday = sub.include_saturday !== false;
  const newEndYmd = extendEndYmdByMealDays({
    endYmd,
    includeSaturday,
    extraMeals: parsedExtra,
  });

  await db.query('BEGIN');
  try {
    const updated = await db.query(
      `UPDATE client_subscriptions
       SET total_meals = total_meals + $1,
           is_active = true,
           end_date = ($3::date + interval '12 hours'),
           updated_at = NOW()
       WHERE id = $2
       RETURNING id, total_meals, used_meals, end_date`,
      [parsedExtra, subscriptionId, newEndYmd]
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
        new_end_date: String(item.end_date).slice(0, 10),
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
