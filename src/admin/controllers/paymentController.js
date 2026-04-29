const db = require('../../common/database');
const catchAsync = require('../../common/utils/catchAsync');

/**
 * @desc    Get all payments with advanced filters
 * @route   GET /api/admin/payment/all
 * @access  Private (Admin only)
 */
exports.getAllPayments = catchAsync(async (req, res) => {
  const { schoolId, entityType, status, startDate, endDate, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  let queryStr = `
    SELECT 
      o.*, 
      c.phone_number as client_phone,
      s.plan_name as subscription_name,
      CASE 
        WHEN o.entity_type = 'child' THEN ch.name
        WHEN o.entity_type = 'teacher' THEN t.name
        WHEN o.entity_type = 'professional' THEN p.name
      END as entity_name,
      CASE 
        WHEN o.entity_type = 'child' THEN sch_ch.name
        WHEN o.entity_type = 'teacher' THEN sch_t.name
        ELSE NULL
      END as school_name,
      cl.name as corporate_location_name
    FROM orders o
    LEFT JOIN clients c ON o.client_id = c.id
    LEFT JOIN subscriptions s ON o.subscription_id = s.id
    LEFT JOIN children ch ON o.entity_type = 'child' AND o.entity_id = ch.id
    LEFT JOIN teacher_profiles t ON o.entity_type = 'teacher' AND o.entity_id = t.id
    LEFT JOIN professional_profiles p ON o.entity_type = 'professional' AND o.entity_id = p.id
    LEFT JOIN schools sch_ch ON ch.school_id = sch_ch.id
    LEFT JOIN schools sch_t ON t.school_college_name = sch_t.name -- Simplified link
    LEFT JOIN corporate_locations cl ON p.corporate_location_id = cl.id
    WHERE 1=1
  `;

  const params = [];
  let paramCount = 1;

  if (schoolId) {
    queryStr += ` AND (sch_ch.id = $${paramCount} OR sch_t.id = $${paramCount})`;
    params.push(schoolId);
    paramCount++;
  }

  if (entityType) {
    queryStr += ` AND o.entity_type = $${paramCount}`;
    params.push(entityType);
    paramCount++;
  }

  if (status) {
    queryStr += ` AND o.status = $${paramCount}`;
    params.push(status);
    paramCount++;
  }

  if (startDate) {
    queryStr += ` AND o.created_at >= $${paramCount}`;
    params.push(startDate);
    paramCount++;
  }

  if (endDate) {
    queryStr += ` AND o.created_at <= $${paramCount}`;
    params.push(endDate);
    paramCount++;
  }

  queryStr += ` ORDER BY o.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
  params.push(limit, offset);

  const result = await db.query(queryStr, params);

  // Get total count for pagination
  const countQuery = queryStr.split('FROM')[1].split('ORDER BY')[0];
  const totalCountResult = await db.query(`SELECT COUNT(*) FROM ${countQuery}`, params.slice(0, -2));

  res.status(200).json({
    success: true,
    data: result.rows,
    pagination: {
      totalItems: parseInt(totalCountResult.rows[0].count),
      currentPage: parseInt(page),
      totalPages: Math.ceil(parseInt(totalCountResult.rows[0].count) / limit)
    }
  });
});

/**
 * @desc    Get payment statistics
 * @route   GET /api/admin/payment/stats
 * @access  Private (Admin only)
 */
exports.getPaymentStats = catchAsync(async (req, res) => {
  const stats = await db.query(`
    SELECT 
      COUNT(*) as total_orders,
      SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_revenue,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_orders
    FROM orders
  `);

  const revenueByEntity = await db.query(`
    SELECT entity_type, SUM(amount) as revenue
    FROM orders
    WHERE status = 'completed'
    GROUP BY entity_type
  `);

  res.status(200).json({
    success: true,
    data: {
      overall: stats.rows[0],
      byEntity: revenueByEntity.rows
    }
  });
});
