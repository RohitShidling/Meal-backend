const db = require('../../common/database');
const catchAsync = require('../../common/utils/catchAsync');
const AppError = require('../../common/utils/AppError');

const parsePagination = (pageRaw, limitRaw, defaultLimit = 20, maxLimit = 100) => {
  const parsedPage = Number.parseInt(pageRaw, 10);
  const parsedLimit = Number.parseInt(limitRaw, 10);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit = Number.isInteger(parsedLimit) && parsedLimit > 0
    ? Math.min(parsedLimit, maxLimit)
    : defaultLimit;
  return { page, limit, offset: (page - 1) * limit };
};

/** E3: reject invalid YYYY-MM-DD and cap inclusive span when both bounds are set. */
const parseYmdQuery = (value) => {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const s = String(value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return s;
};

const validateAnalyticsDateRange = (startDate, endDate) => {
  const s = parseYmdQuery(startDate);
  const e = parseYmdQuery(endDate);
  if (s === false || e === false) {
    return { ok: false, message: 'startDate and endDate must be YYYY-MM-DD when provided' };
  }
  if (s && e) {
    const d0 = new Date(`${s}T00:00:00Z`);
    const d1 = new Date(`${e}T00:00:00Z`);
    if (Number.isNaN(d0.getTime()) || Number.isNaN(d1.getTime())) {
      return { ok: false, message: 'Invalid startDate or endDate' };
    }
    if (d1 < d0) return { ok: false, message: 'endDate must be on or after startDate' };
    const spanDays = (d1 - d0) / 86400000;
    const maxSpan = Number.parseInt(process.env.ANALYTICS_MAX_DATE_RANGE_DAYS || '400', 10);
    if (Number.isFinite(maxSpan) && maxSpan > 0 && spanDays > maxSpan) {
      return { ok: false, message: `Date range cannot exceed ${maxSpan} days` };
    }
  }
  return { ok: true, start: s, end: e };
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: shared filter builder
// ─────────────────────────────────────────────────────────────────────────────
const buildDateFilter = (params, paramCount, startDate, endDate) => {
  let clause = '';
  if (startDate) {
    clause += ` AND cs.start_date >= $${paramCount}`;
    params.push(startDate);
    paramCount++;
  }
  if (endDate) {
    clause += ` AND cs.end_date <= $${paramCount}`;
    params.push(endDate);
    paramCount++;
  }
  return { clause, paramCount };
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. OVERVIEW: Total subscriptions by entity type (school / teacher / professional)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @desc  Overview stats: count and revenue by entity type
 * @route GET /api/admin/subscriptions/analytics/overview
 */
exports.getSubscriptionOverview = catchAsync(async (req, res) => {
  const overview = await db.query(`
    SELECT
      cs.entity_type,
      COUNT(*) AS total_subscribed,
      COUNT(*) FILTER (WHERE cs.is_active = true AND cs.end_date > NOW()) AS active_count,
      COUNT(*) FILTER (WHERE cs.end_date <= NOW() OR cs.is_active = false) AS expired_count,
      COALESCE(SUM(o.amount), 0) AS total_revenue
    FROM client_subscriptions cs
    LEFT JOIN orders o ON cs.order_id = o.id
    GROUP BY cs.entity_type
    ORDER BY cs.entity_type;
  `);

  const totals = await db.query(`
    SELECT
      COUNT(*) AS grand_total,
      COUNT(*) FILTER (WHERE cs.is_active = true AND cs.end_date > NOW()) AS grand_active,
      COALESCE(SUM(o.amount), 0) AS grand_revenue
    FROM client_subscriptions cs
    LEFT JOIN orders o ON cs.order_id = o.id;
  `);

  res.status(200).json({
    success: true,
    data: {
      byEntityType: overview.rows,
      totals: totals.rows[0],
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SCHOOL-WISE: All children subscriptions grouped by school
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @desc  School-wise subscription counts and revenue
 * @route GET /api/admin/subscriptions/analytics/by-school
 */
exports.getBySchool = catchAsync(async (req, res, next) => {
  const { schoolId, isActive, startDate, endDate } = req.query;
  const range = validateAnalyticsDateRange(startDate, endDate);
  if (!range.ok) return next(new AppError(range.message, 400));
  const { page, limit, offset } = parsePagination(req.query.page, req.query.limit, 20, 100);
  const params = [];
  let paramCount = 1;
  let where = 'WHERE sc.id IS NOT NULL';

  if (schoolId) {
    where += ` AND sc.id = $${paramCount}`;
    params.push(schoolId);
    paramCount++;
  }
  if (isActive !== undefined) {
    where += ` AND cs.is_active = $${paramCount} AND cs.end_date ${isActive === 'true' ? '>' : '<='} NOW()`;
    params.push(isActive === 'true');
    paramCount++;
  }
  const dateFilter = buildDateFilter(params, paramCount, range.start, range.end);
  where += dateFilter.clause;
  paramCount = dateFilter.paramCount;

  const result = await db.query(`
    SELECT
      sc.id AS school_id,
      sc.name AS school_name,
      sc.city,
      sc.state,
      COUNT(DISTINCT cs.id) AS total_subscriptions,
      COUNT(DISTINCT cs.id) FILTER (WHERE cs.is_active = true AND cs.end_date > NOW()) AS active_subscriptions,
      COUNT(DISTINCT cs.id) FILTER (WHERE cs.end_date <= NOW()) AS expired_subscriptions,
      COUNT(DISTINCT ch.id) AS total_children,
      COALESCE(SUM(o.amount), 0) AS total_revenue,
      MIN(cs.end_date) AS earliest_expiry,
      MAX(cs.end_date) AS latest_expiry
    FROM schools sc
    LEFT JOIN children ch ON ch.school_id = sc.id
    LEFT JOIN client_subscriptions cs ON cs.entity_type = 'child' AND cs.entity_id = ch.id
    LEFT JOIN orders o ON cs.order_id = o.id
    ${where}
    GROUP BY sc.id, sc.name, sc.city, sc.state
    ORDER BY active_subscriptions DESC
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `, [...params, limit, offset]);

  const total = await db.query(`
    SELECT COUNT(DISTINCT sc.id)
    FROM schools sc
    LEFT JOIN children ch ON ch.school_id = sc.id
    LEFT JOIN client_subscriptions cs ON cs.entity_type = 'child' AND cs.entity_id = ch.id
    ${where}
  `, params);

  res.status(200).json({
    success: true,
    pagination: { total: parseInt(total.rows[0].count), page: parseInt(page), limit: parseInt(limit) },
    data: result.rows
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. CHILDREN IN A SCHOOL: detailed list for a specific school
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @desc  List all subscribed children for a specific school with status
 * @route GET /api/admin/subscriptions/analytics/school/:schoolId/children
 */
exports.getChildrenBySchool = catchAsync(async (req, res, next) => {
  const { schoolId } = req.params;
  const { isActive } = req.query;
  const { page, limit, offset } = parsePagination(req.query.page, req.query.limit, 20, 100);

  const school = await db.query('SELECT id, name FROM schools WHERE id=$1', [schoolId]);
  if (school.rows.length === 0) return next(new AppError('School not found', 404));

  let where = "WHERE ch.school_id = $1";
  const params = [schoolId];
  let paramCount = 2;

  if (isActive === 'true') {
    where += ` AND cs.is_active = true AND cs.end_date > NOW()`;
  } else if (isActive === 'false') {
    where += ` AND (cs.is_active = false OR cs.end_date <= NOW() OR cs.id IS NULL)`;
  }

  const result = await db.query(`
    SELECT
      ch.id AS child_id,
      ch.name AS child_name,
      ch.roll_number,
      c.phone_number AS parent_phone,
      s.name AS standard,
      ms.display_name AS meal_size,
      cs.id AS subscription_id,
      cs.is_active AS subscription_active,
      cs.start_date,
      cs.end_date,
      EXTRACT(DAY FROM cs.end_date - NOW()) AS days_remaining,
      sub.plan_name,
      o.amount AS amount_paid,
      CASE
        WHEN cs.id IS NULL THEN 'never_subscribed'
        WHEN cs.end_date <= NOW() THEN 'expired'
        WHEN cs.is_active = true THEN 'active'
        ELSE 'inactive'
      END AS status
    FROM children ch
    JOIN clients c ON ch.parent_id = c.id
    LEFT JOIN standards s ON ch.standard_id = s.id
    LEFT JOIN meal_sizes ms ON ch.meal_size_id = ms.id
    LEFT JOIN client_subscriptions cs ON cs.entity_type = 'child' AND cs.entity_id = ch.id
    LEFT JOIN subscriptions sub ON cs.subscription_id = sub.id
    LEFT JOIN orders o ON cs.order_id = o.id
    ${where}
    ORDER BY cs.end_date ASC NULLS LAST
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `, [...params, limit, offset]);

  const total = await db.query(
    `SELECT COUNT(*) FROM children ch ${where}`,
    params
  );

  res.status(200).json({
    success: true,
    school: school.rows[0],
    pagination: { total: parseInt(total.rows[0].count), page: parseInt(page), limit: parseInt(limit) },
    data: result.rows
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. TEACHER SUBSCRIPTIONS
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @desc  All teacher subscriptions with filter by school/active/date
 * @route GET /api/admin/subscriptions/analytics/teachers
 */
exports.getTeacherSubscriptions = catchAsync(async (req, res, next) => {
  const { schoolName, isActive, startDate, endDate } = req.query;
  const range = validateAnalyticsDateRange(startDate, endDate);
  if (!range.ok) return next(new AppError(range.message, 400));
  const { page, limit, offset } = parsePagination(req.query.page, req.query.limit, 20, 100);
  const params = [];
  let paramCount = 1;
  let where = "WHERE cs.entity_type = 'teacher'";

  if (schoolName) {
    where += ` AND tp.school_college_name ILIKE $${paramCount}`;
    params.push(`%${schoolName}%`);
    paramCount++;
  }
  if (isActive === 'true') {
    where += ' AND cs.is_active = true AND cs.end_date > NOW()';
  } else if (isActive === 'false') {
    where += ' AND (cs.is_active = false OR cs.end_date <= NOW())';
  }
  const dateFilter = buildDateFilter(params, paramCount, range.start, range.end);
  where += dateFilter.clause;
  paramCount = dateFilter.paramCount;

  const result = await db.query(`
    SELECT
      tp.id AS teacher_id,
      tp.name AS teacher_name,
      tp.school_college_name,
      tp.city,
      tp.state,
      c.phone_number,
      cs.is_active AS subscription_active,
      cs.start_date,
      cs.end_date,
      EXTRACT(DAY FROM cs.end_date - NOW()) AS days_remaining,
      sub.plan_name,
      o.amount AS amount_paid,
      CASE
        WHEN cs.end_date <= NOW() THEN 'expired'
        WHEN cs.is_active = true THEN 'active'
        ELSE 'inactive'
      END AS status
    FROM client_subscriptions cs
    JOIN teacher_profiles tp ON cs.entity_id = tp.id
    JOIN clients c ON tp.client_id = c.id
    LEFT JOIN subscriptions sub ON cs.subscription_id = sub.id
    LEFT JOIN orders o ON cs.order_id = o.id
    ${where}
    ORDER BY cs.end_date ASC
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `, [...params, limit, offset]);

  const total = await db.query(
    `SELECT COUNT(*) FROM client_subscriptions cs
     JOIN teacher_profiles tp ON cs.entity_id = tp.id ${where}`,
    params
  );

  res.status(200).json({
    success: true,
    pagination: { total: parseInt(total.rows[0].count), page: parseInt(page), limit: parseInt(limit) },
    data: result.rows
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. PROFESSIONAL SUBSCRIPTIONS
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @desc  All professional subscriptions with filter by location/active/date
 * @route GET /api/admin/subscriptions/analytics/professionals
 */
exports.getProfessionalSubscriptions = catchAsync(async (req, res, next) => {
  const { locationId, city, isActive, startDate, endDate } = req.query;
  const range = validateAnalyticsDateRange(startDate, endDate);
  if (!range.ok) return next(new AppError(range.message, 400));
  const { page, limit, offset } = parsePagination(req.query.page, req.query.limit, 20, 100);
  const params = [];
  let paramCount = 1;
  let where = "WHERE cs.entity_type = 'professional'";

  if (locationId) {
    where += ` AND pp.corporate_location_id = $${paramCount}`;
    params.push(locationId);
    paramCount++;
  }
  if (city) {
    where += ` AND pp.city ILIKE $${paramCount}`;
    params.push(`%${city}%`);
    paramCount++;
  }
  if (isActive === 'true') {
    where += ' AND cs.is_active = true AND cs.end_date > NOW()';
  } else if (isActive === 'false') {
    where += ' AND (cs.is_active = false OR cs.end_date <= NOW())';
  }
  const dateFilter = buildDateFilter(params, paramCount, range.start, range.end);
  where += dateFilter.clause;
  paramCount = dateFilter.paramCount;

  const result = await db.query(`
    SELECT
      pp.id AS professional_id,
      pp.name AS professional_name,
      pp.company_name,
      pp.city,
      pp.state,
      cl.name AS corporate_location,
      c.phone_number,
      cs.is_active AS subscription_active,
      cs.start_date,
      cs.end_date,
      EXTRACT(DAY FROM cs.end_date - NOW()) AS days_remaining,
      sub.plan_name,
      o.amount AS amount_paid,
      CASE
        WHEN cs.end_date <= NOW() THEN 'expired'
        WHEN cs.is_active = true THEN 'active'
        ELSE 'inactive'
      END AS status
    FROM client_subscriptions cs
    JOIN professional_profiles pp ON cs.entity_id = pp.id
    JOIN clients c ON pp.client_id = c.id
    LEFT JOIN corporate_locations cl ON pp.corporate_location_id = cl.id
    LEFT JOIN subscriptions sub ON cs.subscription_id = sub.id
    LEFT JOIN orders o ON cs.order_id = o.id
    ${where}
    ORDER BY cs.end_date ASC
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `, [...params, limit, offset]);

  const total = await db.query(
    `SELECT COUNT(*) FROM client_subscriptions cs
     JOIN professional_profiles pp ON cs.entity_id = pp.id ${where}`,
    params
  );

  res.status(200).json({
    success: true,
    pagination: { total: parseInt(total.rows[0].count), page: parseInt(page), limit: parseInt(limit) },
    data: result.rows
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. EXPIRING SOON: subscriptions expiring within N days
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @desc  All subscriptions expiring within the next N days (default 7)
 * @route GET /api/admin/subscriptions/analytics/expiring-soon
 */
exports.getExpiringSoon = catchAsync(async (req, res) => {
  const { days = 7, entityType } = req.query;
  const safeDays = Number.isInteger(Number.parseInt(days, 10)) ? Number.parseInt(days, 10) : 7;
  const params = [safeDays];
  let entityFilter = '';
  if (entityType) {
    entityFilter = ` AND cs.entity_type = $2`;
    params.push(entityType);
  }

  const result = await db.query(`
    SELECT
      cs.entity_type,
      cs.entity_id,
      cs.end_date,
      EXTRACT(DAY FROM cs.end_date - NOW()) AS days_remaining,
      sub.plan_name,
      c.phone_number AS client_phone,
      CASE
        WHEN cs.entity_type='child' THEN ch.name
        WHEN cs.entity_type='teacher' THEN tp.name
        WHEN cs.entity_type='professional' THEN pp.name
      END AS entity_name,
      CASE
        WHEN cs.entity_type='child' THEN sch.name
        WHEN cs.entity_type='teacher' THEN tp.school_college_name
        WHEN cs.entity_type='professional' THEN cl.name
      END AS institution_name
    FROM client_subscriptions cs
    JOIN subscriptions sub ON cs.subscription_id = sub.id
    JOIN clients c ON cs.client_id = c.id
    LEFT JOIN children ch ON cs.entity_type='child' AND cs.entity_id=ch.id
    LEFT JOIN schools sch ON ch.school_id = sch.id
    LEFT JOIN teacher_profiles tp ON cs.entity_type='teacher' AND cs.entity_id=tp.id
    LEFT JOIN professional_profiles pp ON cs.entity_type='professional' AND cs.entity_id=pp.id
    LEFT JOIN corporate_locations cl ON pp.corporate_location_id = cl.id
    WHERE cs.is_active = true
      AND cs.end_date > NOW()
      AND cs.end_date <= NOW() + ($1::int * INTERVAL '1 day')
      ${entityFilter}
    ORDER BY cs.end_date ASC
  `, params);

  res.status(200).json({
    success: true,
    message: `Subscriptions expiring within ${safeDays} days`,
    count: result.rowCount,
    data: result.rows
  });
});

/**
 * @desc  Active subscriptions where remaining meals (total_meals - used_meals) are low
 * @route GET /api/admin/subscriptions/analytics/low-remaining-meals
 */
exports.getLowRemainingMeals = catchAsync(async (req, res) => {
  const parsedMax = parseInt(req.query.maxRemaining ?? req.query.max_remaining, 10);
  const maxRemaining = Number.isFinite(parsedMax) ? Math.min(100, Math.max(1, parsedMax)) : 5;
  const { entityType } = req.query;
  const params = [maxRemaining];
  let entityFilter = '';

  const et = String(entityType || '').trim().toLowerCase();
  if (et === 'child' || et === 'teacher' || et === 'professional') {
    entityFilter = ' AND cs.entity_type = $2';
    params.push(et);
  }

  const result = await db.query(
    `
    SELECT
      cs.entity_type,
      cs.entity_id,
      cs.end_date,
      GREATEST(0, (cs.total_meals - cs.used_meals))::INT AS remaining_meals,
      cs.total_meals::INT AS total_meals,
      cs.used_meals::INT AS used_meals,
      sub.plan_name,
      c.phone_number AS client_phone,
      CASE
        WHEN cs.entity_type='child' THEN ch.name
        WHEN cs.entity_type='teacher' THEN tp.name
        WHEN cs.entity_type='professional' THEN pp.name
      END AS entity_name,
      CASE
        WHEN cs.entity_type='child' THEN sch.name
        WHEN cs.entity_type='teacher' THEN tp.school_college_name
        WHEN cs.entity_type='professional' THEN cl.name
      END AS institution_name
    FROM client_subscriptions cs
    JOIN subscriptions sub ON cs.subscription_id = sub.id
    JOIN clients c ON cs.client_id = c.id
    LEFT JOIN children ch ON cs.entity_type='child' AND cs.entity_id=ch.id
    LEFT JOIN schools sch ON ch.school_id = sch.id
    LEFT JOIN teacher_profiles tp ON cs.entity_type='teacher' AND cs.entity_id=tp.id
    LEFT JOIN professional_profiles pp ON cs.entity_type='professional' AND cs.entity_id=pp.id
    LEFT JOIN corporate_locations cl ON pp.corporate_location_id = cl.id
    WHERE cs.is_active = true
      AND DATE(cs.end_date) >= CURRENT_DATE
      AND (cs.total_meals - cs.used_meals) > 0
      AND (cs.total_meals - cs.used_meals) <= $1
      ${entityFilter}
    ORDER BY remaining_meals ASC, cs.end_date ASC
    `,
    params
  );

  res.status(200).json({
    success: true,
    message: `Active subscriptions with at most ${maxRemaining} meals remaining`,
    max_remaining: maxRemaining,
    count: result.rowCount,
    data: result.rows,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. ALL MEMBERS SUBSCRIPTION STATUS (subscribed + unsubscribed + expired)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @desc  Full subscription status for ALL members across children, teachers, professionals.
 *        Shows who subscribed (start date, end date, days remaining) and who never subscribed.
 * @route GET /api/admin/subscriptions/analytics/all-members
 */
exports.getAllMembersSubscriptionStatus = catchAsync(async (req, res) => {
  const { entityType, status, schoolId } = req.query;
  const { page, limit, offset } = parsePagination(req.query.page, req.query.limit, 20, 100);
  const params = [];

  // ── CHILDREN ────────────────────────────────────────────────────────────────
  const queryParams = [];
  let schoolParamRef = '';
  if (schoolId) {
    queryParams.push(String(schoolId));
    schoolParamRef = `$${queryParams.length}`;
  }

  let childQuery = `
    SELECT
      'child'                                       AS entity_type,
      ch.id                                         AS entity_id,
      ch.name                                       AS entity_name,
      ch.roll_number                                AS identifier,
      sc.name                                       AS institution_name,
      c.phone_number                                AS client_phone,
      cs.start_date,
      cs.end_date,
      CASE
        WHEN cs.id IS NULL                          THEN 'never_subscribed'
        WHEN cs.end_date <= NOW()                   THEN 'expired'
        WHEN cs.is_active = true AND cs.end_date > NOW() THEN 'active'
        ELSE 'inactive'
      END                                           AS status,
      GREATEST(0, EXTRACT(DAY FROM cs.end_date - NOW()))::INT AS days_remaining,
      sub.plan_name,
      o.amount                                      AS amount_paid
    FROM children ch
    JOIN clients c ON ch.parent_id = c.id
    LEFT JOIN schools sc ON ch.school_id = sc.id
    LEFT JOIN client_subscriptions cs
           ON cs.entity_type = 'child' AND cs.entity_id = ch.id
    LEFT JOIN subscriptions sub ON cs.subscription_id = sub.id
    LEFT JOIN orders o ON cs.order_id = o.id
    WHERE 1=1
  `;
  if (schoolId) {
    params.push(schoolId);
    childQuery += ` AND ch.school_id = $${params.length}`;
  }

  // ── TEACHERS ────────────────────────────────────────────────────────────────
  const teacherQuery = `
    SELECT
      'teacher'                                     AS entity_type,
      tp.id                                         AS entity_id,
      tp.name                                       AS entity_name,
      tp.school_college_name                        AS identifier,
      tp.school_college_name                        AS institution_name,
      c.phone_number                                AS client_phone,
      cs.start_date,
      cs.end_date,
      CASE
        WHEN cs.id IS NULL                          THEN 'never_subscribed'
        WHEN cs.end_date <= NOW()                   THEN 'expired'
        WHEN cs.is_active = true AND cs.end_date > NOW() THEN 'active'
        ELSE 'inactive'
      END                                           AS status,
      GREATEST(0, EXTRACT(DAY FROM cs.end_date - NOW()))::INT AS days_remaining,
      sub.plan_name,
      o.amount                                      AS amount_paid
    FROM teacher_profiles tp
    JOIN clients c ON tp.client_id = c.id
    LEFT JOIN client_subscriptions cs
           ON cs.entity_type = 'teacher' AND cs.entity_id = tp.id
    LEFT JOIN subscriptions sub ON cs.subscription_id = sub.id
    LEFT JOIN orders o ON cs.order_id = o.id
    WHERE 1=1
  `;

  // ── PROFESSIONALS ────────────────────────────────────────────────────────────
  const professionalQuery = `
    SELECT
      'professional'                                AS entity_type,
      pp.id                                         AS entity_id,
      pp.name                                       AS entity_name,
      pp.company_name                               AS identifier,
      cl.name                                       AS institution_name,
      c.phone_number                                AS client_phone,
      cs.start_date,
      cs.end_date,
      CASE
        WHEN cs.id IS NULL                          THEN 'never_subscribed'
        WHEN cs.end_date <= NOW()                   THEN 'expired'
        WHEN cs.is_active = true AND cs.end_date > NOW() THEN 'active'
        ELSE 'inactive'
      END                                           AS status,
      GREATEST(0, EXTRACT(DAY FROM cs.end_date - NOW()))::INT AS days_remaining,
      sub.plan_name,
      o.amount                                      AS amount_paid
    FROM professional_profiles pp
    JOIN clients c ON pp.client_id = c.id
    LEFT JOIN corporate_locations cl ON pp.corporate_location_id = cl.id
    LEFT JOIN client_subscriptions cs
           ON cs.entity_type = 'professional' AND cs.entity_id = pp.id
    LEFT JOIN subscriptions sub ON cs.subscription_id = sub.id
    LEFT JOIN orders o ON cs.order_id = o.id
    WHERE 1=1
  `;

  // ── COMBINE & FILTER ─────────────────────────────────────────────────────────
  let statusFilter = '';
  if (status === 'active')           statusFilter = "WHERE status = 'active'";
  else if (status === 'expired')     statusFilter = "WHERE status = 'expired'";
  else if (status === 'never_subscribed') statusFilter = "WHERE status = 'never_subscribed'";
  else if (status === 'subscribed')  statusFilter = "WHERE status IN ('active','expired')";

  let typeFilter = '';
  if (entityType === 'child')        typeFilter = "WHERE entity_type = 'child'";
  else if (entityType === 'teacher') typeFilter = "WHERE entity_type = 'teacher'";
  else if (entityType === 'professional') typeFilter = "WHERE entity_type = 'professional'";

  // Combine all three with UNION
  let combinedFilters = [statusFilter, typeFilter].filter(Boolean).join(' AND ');
  if (combinedFilters && !combinedFilters.startsWith('WHERE')) {
    combinedFilters = 'WHERE ' + combinedFilters.replace(/^WHERE /g, '').replace(/ AND WHERE /g, ' AND ');
  }

  // Build which queries to include based on entityType filter
  let unionParts = [];
  if (!entityType || entityType === 'child')        unionParts.push(`(${childQuery})`);
  if (!entityType || entityType === 'teacher')      unionParts.push(`(${teacherQuery})`);
  if (!entityType || entityType === 'professional') unionParts.push(`(${professionalQuery})`);

  const unionSQL = unionParts.join(' UNION ALL ');

  // Apply status filter on top of union
  let outerWhere = '';
  if (status === 'active')                outerWhere = "WHERE combined.status = 'active'";
  else if (status === 'expired')          outerWhere = "WHERE combined.status = 'expired'";
  else if (status === 'never_subscribed') outerWhere = "WHERE combined.status = 'never_subscribed'";
  else if (status === 'subscribed')       outerWhere = "WHERE combined.status IN ('active','expired')";

  params.push(limit, offset);
  const finalSQL = `
    SELECT * FROM (${unionSQL}) AS combined
    ${outerWhere}
    ORDER BY
      CASE combined.status
        WHEN 'active'            THEN 1
        WHEN 'expired'           THEN 2
        WHEN 'never_subscribed'  THEN 3
        ELSE 4
      END,
      combined.days_remaining ASC NULLS LAST
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const countSQL = `
    SELECT COUNT(*) FROM (${unionSQL}) AS combined ${outerWhere}
  `;

  const [result, countRes] = await Promise.all([
    db.query(finalSQL, params),
    db.query(countSQL, params.slice(0, params.length - 2))
  ]);

  // Summary counts
  const summarySQL = `
    SELECT
      COUNT(*) FILTER (WHERE combined.status = 'active')           AS active_count,
      COUNT(*) FILTER (WHERE combined.status = 'expired')          AS expired_count,
      COUNT(*) FILTER (WHERE combined.status = 'never_subscribed') AS never_subscribed_count,
      COUNT(*) AS total
    FROM (${unionSQL}) AS combined
  `;
  const summary = await db.query(summarySQL, params.slice(0, params.length - 2));

  res.status(200).json({
    success: true,
    summary: {
      total_members: parseInt(summary.rows[0].total),
      active_subscriptions: parseInt(summary.rows[0].active_count),
      expired_subscriptions: parseInt(summary.rows[0].expired_count),
      never_subscribed: parseInt(summary.rows[0].never_subscribed_count),
    },
    pagination: {
      total: parseInt(countRes.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    },
    data: result.rows
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. UNSUBSCRIBED MEMBERS (never subscribed — separate targeted API)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @desc  List all members who have NEVER subscribed at all
 * @route GET /api/admin/subscriptions/analytics/not-subscribed
 */
exports.getUnsubscribedMembers = catchAsync(async (req, res) => {
  const { entityType, schoolId } = req.query;
  const { page, limit, offset } = parsePagination(req.query.page, req.query.limit, 20, 100);
  const params = [];
  let childSchoolFilter = '';
  if (schoolId) {
    params.push(schoolId);
    childSchoolFilter = `AND ch.school_id = $${params.length}`;
  }

  const childQuery = `
    SELECT 'child' AS entity_type, ch.id AS entity_id, ch.name AS entity_name,
           ch.roll_number AS identifier, sc.name AS institution_name, c.phone_number AS client_phone,
           ch.created_at AS registered_on
    FROM children ch
    JOIN clients c ON ch.parent_id = c.id
    LEFT JOIN schools sc ON ch.school_id = sc.id
    WHERE NOT EXISTS (
      SELECT 1 FROM client_subscriptions cs
      WHERE cs.entity_type = 'child' AND cs.entity_id = ch.id AND cs.is_active = true
    )
    ${childSchoolFilter}
  `;

  const teacherQuery = `
    SELECT 'teacher' AS entity_type, tp.id AS entity_id, tp.name AS entity_name,
           tp.school_college_name AS identifier, tp.school_college_name AS institution_name,
           c.phone_number AS client_phone, tp.created_at AS registered_on
    FROM teacher_profiles tp
    JOIN clients c ON tp.client_id = c.id
    WHERE NOT EXISTS (
      SELECT 1 FROM client_subscriptions cs
      WHERE cs.entity_type = 'teacher' AND cs.entity_id = tp.id AND cs.is_active = true
    )
  `;

  const professionalQuery = `
    SELECT 'professional' AS entity_type, pp.id AS entity_id, pp.name AS entity_name,
           pp.company_name AS identifier, cl.name AS institution_name,
           c.phone_number AS client_phone, pp.created_at AS registered_on
    FROM professional_profiles pp
    JOIN clients c ON pp.client_id = c.id
    LEFT JOIN corporate_locations cl ON pp.corporate_location_id = cl.id
    WHERE NOT EXISTS (
      SELECT 1 FROM client_subscriptions cs
      WHERE cs.entity_type = 'professional' AND cs.entity_id = pp.id AND cs.is_active = true
    )
  `;

  let unionParts = [];
  if (!entityType || entityType === 'child')        unionParts.push(`(${childQuery})`);
  if (!entityType || entityType === 'teacher')      unionParts.push(`(${teacherQuery})`);
  if (!entityType || entityType === 'professional') unionParts.push(`(${professionalQuery})`);

  const unionSQL = unionParts.join(' UNION ALL ');

  params.push(limit, offset);
  const finalSQL = `
    SELECT * FROM (${unionSQL}) AS unsubscribed
    ORDER BY entity_type, entity_name
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const countSQL = `SELECT COUNT(*) FROM (${unionSQL}) AS unsubscribed`;

  const [result, countRes] = await Promise.all([
    db.query(finalSQL, params),
    db.query(countSQL, params.slice(0, params.length - 2))
  ]);

  res.status(200).json({
    success: true,
    message: 'Members who have never subscribed',
    total_unsubscribed: parseInt(countRes.rows[0].count),
    pagination: { total: parseInt(countRes.rows[0].count), page: parseInt(page), limit: parseInt(limit) },
    data: result.rows
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. ACTIVE SUBSCRIPTIONS WITH MEAL COUNTS
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @desc  Detailed list of all ACTIVE subscriptions with meal counts (total, used, remaining)
 * @route GET /api/admin/subscriptions/analytics/active-meal-status
 */
exports.getActiveSubscriptionsWithMeals = catchAsync(async (req, res) => {
  const { entityType } = req.query;
  const { page, limit, offset } = parsePagination(req.query.page, req.query.limit, 50, 200);
  
  const params = [];
  let where = "WHERE cs.is_active = true AND cs.end_date > NOW()";
  
  if (entityType) {
    where += ` AND cs.entity_type = $1`;
    params.push(entityType);
  }

  const result = await db.query(`
    SELECT 
      cs.id AS subscription_id,
      cs.client_id,
      c.phone_number AS client_phone,
      cs.entity_type,
      cs.entity_id,
      CASE
        WHEN cs.entity_type='child' THEN ch.name
        WHEN cs.entity_type='teacher' THEN tp.name
        WHEN cs.entity_type='professional' THEN pp.name
      END AS entity_name,
      CASE
        WHEN cs.entity_type='child' THEN sch.name
        WHEN cs.entity_type='teacher' THEN tp.school_college_name
        WHEN cs.entity_type='professional' THEN cl.name
      END AS institution_name,
      cs.total_meals,
      cs.used_meals,
      (cs.total_meals - cs.used_meals) AS remaining_meals,
      cs.start_date,
      cs.end_date,
      sub.plan_name
    FROM client_subscriptions cs
    JOIN clients c ON cs.client_id = c.id
    JOIN subscriptions sub ON cs.subscription_id = sub.id
    LEFT JOIN children ch ON cs.entity_type='child' AND cs.entity_id=ch.id
    LEFT JOIN schools sch ON ch.school_id = sch.id
    LEFT JOIN teacher_profiles tp ON cs.entity_type='teacher' AND cs.entity_id=tp.id
    LEFT JOIN professional_profiles pp ON cs.entity_type='professional' AND cs.entity_id=pp.id
    LEFT JOIN corporate_locations cl ON pp.corporate_location_id = cl.id
    ${where}
    ORDER BY remaining_meals ASC, cs.end_date ASC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `, [...params, limit, offset]);

  const countRes = await db.query(
    `SELECT COUNT(*) FROM client_subscriptions cs ${where}`,
    params
  );

  res.status(200).json({
    success: true,
    pagination: {
      total: parseInt(countRes.rows[0].count),
      page,
      limit
    },
    data: result.rows
  });
});
