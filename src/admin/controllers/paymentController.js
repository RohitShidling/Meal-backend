const db = require('../../common/database');
const catchAsync = require('../../common/utils/catchAsync');

/**
 * @desc    Get all payments with advanced filters — fixed count query
 * @route   GET /api/admin/payment/all
 */
exports.getAllPayments = catchAsync(async (req, res) => {
  const { schoolId, entityType, status, startDate, endDate, page = 1, limit = 10 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const params = [];
  let paramCount = 1;
  let whereClause = 'WHERE 1=1';

  if (entityType) {
    whereClause += ` AND o.entity_type = $${paramCount}`;
    params.push(entityType);
    paramCount++;
  }
  if (status) {
    whereClause += ` AND o.status = $${paramCount}`;
    params.push(status);
    paramCount++;
  }
  if (startDate) {
    whereClause += ` AND o.created_at >= $${paramCount}`;
    params.push(startDate);
    paramCount++;
  }
  if (endDate) {
    whereClause += ` AND o.created_at <= $${paramCount}`;
    params.push(endDate);
    paramCount++;
  }
  if (schoolId) {
    whereClause += ` AND sch_ch.id = $${paramCount}`;
    params.push(schoolId);
    paramCount++;
  }

  const baseJoins = `
    FROM orders o
    LEFT JOIN clients c ON o.client_id = c.id
    LEFT JOIN subscriptions s ON o.subscription_id = s.id
    LEFT JOIN children ch ON o.entity_type = 'child' AND o.entity_id = ch.id
    LEFT JOIN teacher_profiles t ON o.entity_type = 'teacher' AND o.entity_id = t.id
    LEFT JOIN professional_profiles p ON o.entity_type = 'professional' AND o.entity_id = p.id
    LEFT JOIN schools sch_ch ON ch.school_id = sch_ch.id
    LEFT JOIN corporate_locations cl ON p.corporate_location_id = cl.id
    ${whereClause}
  `;

  // Count query — separate, clean
  const countRes = await db.query(`SELECT COUNT(*) ${baseJoins}`, params);
  const total = parseInt(countRes.rows[0].count);

  // Data query
  const dataParams = [...params, parseInt(limit), offset];
  const result = await db.query(`
    SELECT
      o.id AS order_id,
      o.status AS order_status,
      o.order_type,
      o.amount,
      o.entity_type,
      o.entity_id,
      o.created_at,
      o.start_date AS order_start_date,
      c.phone_number AS client_phone,
      s.plan_name AS subscription_name,
      t.merchant_transaction_id,
      t.status AS payment_status,
      CASE
        WHEN o.entity_type = 'child' THEN ch.name
        WHEN o.entity_type = 'teacher' THEN t2.name
        WHEN o.entity_type = 'professional' THEN p.name
        WHEN o.entity_type = 'cart' THEN COALESCE(cart_summary.entity_names, 'Cart Order')
        ELSE 'Cart Order'
      END AS entity_name,
      CASE
        WHEN o.entity_type = 'cart' THEN COALESCE(cart_summary.entity_type_label, 'Cart')
        WHEN o.entity_type = 'child' THEN 'Student'
        WHEN o.entity_type = 'teacher' THEN 'Teacher'
        WHEN o.entity_type = 'professional' THEN 'Professional'
        ELSE o.entity_type
      END AS sector_label,
      CASE
        WHEN o.entity_type = 'cart' THEN COALESCE(cart_summary.institution_names, 'Mixed')
        ELSE sch_ch.name
      END AS school_name,
      CASE
        WHEN o.entity_type = 'cart' THEN COALESCE(cart_summary.institution_names, 'Mixed')
        ELSE cl.name
      END AS corporate_location_name,
      CASE
        WHEN o.entity_type = 'cart' THEN cart_summary.cart_start_date
        ELSE o.start_date
      END AS subscription_start_date
    FROM orders o
    LEFT JOIN clients c ON o.client_id = c.id
    LEFT JOIN subscriptions s ON o.subscription_id = s.id
    LEFT JOIN transactions t ON t.order_id = o.id
    LEFT JOIN children ch ON o.entity_type = 'child' AND o.entity_id = ch.id
    LEFT JOIN teacher_profiles t2 ON o.entity_type = 'teacher' AND o.entity_id = t2.id
    LEFT JOIN professional_profiles p ON o.entity_type = 'professional' AND o.entity_id = p.id
    LEFT JOIN schools sch_ch ON ch.school_id = sch_ch.id
    LEFT JOIN corporate_locations cl ON p.corporate_location_id = cl.id
    LEFT JOIN LATERAL (
      SELECT
        STRING_AGG(DISTINCT COALESCE(ci.entity_name, ci.entity_id), ', ') AS entity_names,
        MIN(ci.start_date)::date AS cart_start_date,
        CASE
          WHEN COUNT(DISTINCT ci.entity_type) > 1 THEN 'Cart (Mixed)'
          WHEN MAX(ci.entity_type) = 'child' THEN 'Cart (Student)'
          WHEN MAX(ci.entity_type) = 'teacher' THEN 'Cart (Teacher)'
          WHEN MAX(ci.entity_type) = 'professional' THEN 'Cart (Professional)'
          ELSE 'Cart'
        END AS entity_type_label,
        STRING_AGG(
          DISTINCT COALESCE(sch.name, cl2.name, tp.school_college_name, 'Unknown'),
          ', '
        ) AS institution_names
      FROM cart_items ci
      LEFT JOIN children ch2 ON ci.entity_type = 'child' AND ci.entity_id = ch2.id
      LEFT JOIN schools sch ON ch2.school_id = sch.id
      LEFT JOIN professional_profiles pp2 ON ci.entity_type = 'professional' AND ci.entity_id = pp2.id
      LEFT JOIN corporate_locations cl2 ON pp2.corporate_location_id = cl2.id
      LEFT JOIN teacher_profiles tp ON ci.entity_type = 'teacher' AND ci.entity_id = tp.id
      WHERE ci.cart_id = o.cart_id
    ) AS cart_summary ON o.entity_type = 'cart'
    ${whereClause}
    ORDER BY o.created_at DESC
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `, dataParams);

  res.status(200).json({
    success: true,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    },
    data: result.rows
  });
});

/**
 * @desc    Get payment statistics
 * @route   GET /api/admin/payment/stats
 */
exports.getPaymentStats = catchAsync(async (req, res) => {
  const stats = await db.query(`
    SELECT
      COUNT(*)                                                        AS total_orders,
      COALESCE(SUM(CASE WHEN status='completed' THEN amount END), 0) AS total_revenue,
      COUNT(CASE WHEN status='pending'   THEN 1 END)                 AS pending_orders,
      COUNT(CASE WHEN status='failed'    THEN 1 END)                 AS failed_orders,
      COUNT(CASE WHEN status='completed' THEN 1 END)                 AS completed_orders
    FROM orders
  `);

  const revenueByEntity = await db.query(`
    SELECT entity_type, COUNT(*) AS order_count, COALESCE(SUM(amount), 0) AS revenue
    FROM orders
    WHERE status = 'completed'
    GROUP BY entity_type
    ORDER BY entity_type
  `);

  const recentPayments = await db.query(`
    SELECT o.id, o.amount, o.status, o.created_at, c.phone_number,
           CASE
             WHEN o.entity_type='child' THEN ch.name
             WHEN o.entity_type='teacher' THEN tp.name
             WHEN o.entity_type='professional' THEN pp.name
             ELSE 'Cart Order'
           END AS entity_name
    FROM orders o
    LEFT JOIN clients c ON o.client_id = c.id
    LEFT JOIN children ch ON o.entity_type='child' AND o.entity_id=ch.id
    LEFT JOIN teacher_profiles tp ON o.entity_type='teacher' AND o.entity_id=tp.id
    LEFT JOIN professional_profiles pp ON o.entity_type='professional' AND o.entity_id=pp.id
    WHERE o.status = 'completed'
    ORDER BY o.created_at DESC LIMIT 10
  `);

  res.status(200).json({
    success: true,
    data: {
      overall: stats.rows[0],
      byEntityType: revenueByEntity.rows,
      recentPayments: recentPayments.rows
    }
  });
});
