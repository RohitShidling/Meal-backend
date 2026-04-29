const db = require('../../common/database');
const catchAsync = require('../../common/utils/catchAsync');
const AppError = require('../../common/utils/AppError');

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
exports.getBySchool = catchAsync(async (req, res) => {
  const { schoolId, isActive, startDate, endDate, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
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
  const dateFilter = buildDateFilter(params, paramCount, startDate, endDate);
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
  const { isActive, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

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
exports.getTeacherSubscriptions = catchAsync(async (req, res) => {
  const { schoolName, isActive, startDate, endDate, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
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
  const dateFilter = buildDateFilter(params, paramCount, startDate, endDate);
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
exports.getProfessionalSubscriptions = catchAsync(async (req, res) => {
  const { locationId, city, isActive, startDate, endDate, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
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
  const dateFilter = buildDateFilter(params, paramCount, startDate, endDate);
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
  const params = [parseInt(days)];
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
      AND cs.end_date <= NOW() + ($1 || ' days')::INTERVAL
      ${entityFilter}
    ORDER BY cs.end_date ASC
  `, params);

  res.status(200).json({
    success: true,
    message: `Subscriptions expiring within ${days} days`,
    count: result.rowCount,
    data: result.rows
  });
});
