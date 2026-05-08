const db = require('../../common/database');
const catchAsync = require('../../common/utils/catchAsync');

const mapEntityTypeToSector = (entityType) => {
  if (entityType === 'child') return 'student';
  if (entityType === 'teacher') return 'teacher';
  if (entityType === 'professional') return 'professional_worker';
  return entityType || null;
};

const mapEntityTypeToSectorLabel = (entityType) => {
  if (entityType === 'child') return 'Student';
  if (entityType === 'teacher') return 'Teacher';
  if (entityType === 'professional') return 'Professional Worker';
  return entityType || null;
};

/**
 * @desc    Get all payments with advanced filters — fixed count query
 * @route   GET /api/admin/payment/all
 */
exports.getAllPayments = catchAsync(async (req, res) => {
  const schoolId = req.query.schoolId || req.query.school_id;
  const entityType = req.query.entityType || req.query.entity_type || req.query.sector;
  const status = req.query.status || req.query.order_status;
  const parsedPage = Number.parseInt(req.query.page, 10);
  const parsedLimit = Number.parseInt(req.query.limit, 10);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 10;
  const { startDate, endDate } = req.query;
  const offset = (page - 1) * limit;

  const params = [];
  let paramCount = 1;
  let whereClause = 'WHERE 1=1';

  if (entityType) {
    // Filter against normalized entity type (cart items split out)
    whereClause += ` AND np.entity_type = $${paramCount}`;
    params.push(entityType);
    paramCount++;
  }
  if (status) {
    whereClause += ` AND np.order_status = $${paramCount}`;
    params.push(status);
    paramCount++;
  }
  if (startDate) {
    whereClause += ` AND np.payment_date >= $${paramCount}`;
    params.push(startDate);
    paramCount++;
  }
  if (endDate) {
    whereClause += ` AND np.payment_date <= $${paramCount}`;
    params.push(endDate);
    paramCount++;
  }
  if (schoolId) {
    whereClause += ` AND np.school_id = $${paramCount}`;
    params.push(schoolId);
    paramCount++;
  }

  const normalizedPaymentsCte = `
    WITH normalized_payments AS (
      -- Non-cart orders: 1 order = 1 person
      SELECT
        o.id AS order_id,
        o.status AS order_status,
        o.order_type,
        o.created_at AS payment_date,
        o.client_id,
        c.phone_number AS client_phone,
        o.entity_type,
        o.entity_id,
        CASE
          WHEN o.entity_type = 'child' THEN ch.name
          WHEN o.entity_type = 'teacher' THEN tp.name
          WHEN o.entity_type = 'professional' THEN pp.name
          ELSE NULL
        END AS customer_name,
        CASE
          WHEN o.entity_type = 'child' THEN sch.name
          WHEN o.entity_type = 'teacher' THEN sch_t.name
          ELSE NULL
        END AS school_name,
        CASE
          WHEN o.entity_type = 'child' THEN ch.school_id
          WHEN o.entity_type = 'teacher' THEN tp.school_id
          ELSE NULL
        END AS school_id,
        NULL::varchar AS corporate_location_name,
        o.amount::numeric AS amount,
        false AS is_cart_order,
        tx.merchant_transaction_id,
        tx.status AS payment_status
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      LEFT JOIN transactions tx ON tx.order_id = o.id
      LEFT JOIN children ch ON o.entity_type = 'child' AND o.entity_id = ch.id
      LEFT JOIN schools sch ON ch.school_id = sch.id
      LEFT JOIN teacher_profiles tp ON o.entity_type = 'teacher' AND o.entity_id = tp.id
      LEFT JOIN schools sch_t ON tp.school_id = sch_t.id
      LEFT JOIN professional_profiles pp ON o.entity_type = 'professional' AND o.entity_id = pp.id
      WHERE o.entity_type IS DISTINCT FROM 'cart'

      UNION ALL

      -- Cart orders: split into per-cart-item rows (1 row per person)
      SELECT
        o.id AS order_id,
        o.status AS order_status,
        o.order_type,
        o.created_at AS payment_date,
        o.client_id,
        c.phone_number AS client_phone,
        ci.entity_type,
        ci.entity_id,
        COALESCE(
          ci.entity_name,
          CASE
            WHEN ci.entity_type = 'child' THEN ch2.name
            WHEN ci.entity_type = 'teacher' THEN tp2.name
            WHEN ci.entity_type = 'professional' THEN pp2.name
            ELSE NULL
          END
        ) AS customer_name,
        CASE
          WHEN ci.entity_type = 'child' THEN sch2.name
          WHEN ci.entity_type = 'teacher' THEN sch_t2.name
          ELSE NULL
        END AS school_name,
        CASE
          WHEN ci.entity_type = 'child' THEN ch2.school_id
          WHEN ci.entity_type = 'teacher' THEN tp2.school_id
          ELSE NULL
        END AS school_id,
        cl2.name AS corporate_location_name,
        ci.unit_price::numeric AS amount,
        true AS is_cart_order,
        tx.merchant_transaction_id,
        tx.status AS payment_status
      FROM orders o
      INNER JOIN cart_items ci ON ci.cart_id = o.cart_id
      LEFT JOIN clients c ON o.client_id = c.id
      LEFT JOIN transactions tx ON tx.order_id = o.id
      LEFT JOIN children ch2 ON ci.entity_type = 'child' AND ci.entity_id = ch2.id
      LEFT JOIN schools sch2 ON ch2.school_id = sch2.id
      LEFT JOIN teacher_profiles tp2 ON ci.entity_type = 'teacher' AND ci.entity_id = tp2.id
      LEFT JOIN schools sch_t2 ON tp2.school_id = sch_t2.id
      LEFT JOIN professional_profiles pp2 ON ci.entity_type = 'professional' AND ci.entity_id = pp2.id
      LEFT JOIN corporate_locations cl2 ON pp2.corporate_location_id = cl2.id
      WHERE o.entity_type = 'cart'
    )
  `;

  // Count query — separate, clean
  const countRes = await db.query(
    `
    ${normalizedPaymentsCte}
    SELECT COUNT(*) FROM normalized_payments np
    ${whereClause}
    `,
    params
  );
  const total = parseInt(countRes.rows[0].count);

  // Data query
  const dataParams = [...params, limit, offset];
  const result = await db.query(
    `
    ${normalizedPaymentsCte}
    SELECT
      np.order_id,
      np.order_status,
      np.order_type,
      np.amount,
      np.entity_type,
      np.entity_id,
      np.payment_date AS created_at,
      np.client_phone,
      np.merchant_transaction_id,
      np.payment_status,
      COALESCE(np.customer_name, 'Unknown') AS customer_name,
      np.school_name,
      np.school_id,
      np.corporate_location_name,
      np.is_cart_order
    FROM normalized_payments np
    ${whereClause}
    ORDER BY np.payment_date DESC, np.order_id DESC
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `,
    dataParams
  );

  const normalized = result.rows.map((row) => {
    const sector = mapEntityTypeToSector(row.entity_type);
    const sectorLabel = mapEntityTypeToSectorLabel(row.entity_type);
    const customerName = row.customer_name || 'Unknown';
    const schoolName = row.school_name || null;
    return {
      ...row,
      amount: Number(row.amount),
      school_name: schoolName,
      customer_name: customerName,
      // New frontend-friendly fields
      orderId: row.order_id,
      isCartOrder: !!row.is_cart_order,
      customerName,
      sector,
      schoolName,
      paymentStatus: row.payment_status || row.order_status,
      paymentDate: row.created_at,
      // Legacy compatibility keys (for existing UI bindings)
      entity_name: customerName,
      sector_label: sectorLabel,
    };
  });

  res.status(200).json({
    success: true,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    },
    data: normalized
  });
});

/**
 * @desc    Get payment statistics
 * @route   GET /api/admin/payment/stats
 */
exports.getPaymentStats = catchAsync(async (req, res) => {
  const normalizedPaymentsCte = `
    WITH normalized_payments AS (
      SELECT
        o.id AS order_id,
        o.status AS order_status,
        o.created_at AS payment_date,
        o.entity_type,
        o.entity_id,
        o.amount::numeric AS amount,
        false AS is_cart_order
      FROM orders o
      WHERE o.entity_type IS DISTINCT FROM 'cart'

      UNION ALL

      SELECT
        o.id AS order_id,
        o.status AS order_status,
        o.created_at AS payment_date,
        ci.entity_type,
        ci.entity_id,
        ci.unit_price::numeric AS amount,
        true AS is_cart_order
      FROM orders o
      INNER JOIN cart_items ci ON ci.cart_id = o.cart_id
      WHERE o.entity_type = 'cart'
    )
  `;

  // Overall stats at ORDER level (unchanged meaning), plus normalized row count for UI tables.
  const stats = await db.query(`
    SELECT
      COUNT(*)                                                        AS total_orders,
      COALESCE(SUM(CASE WHEN status='completed' THEN amount END), 0) AS total_revenue,
      COUNT(CASE WHEN status='pending'   THEN 1 END)                 AS pending_orders,
      COUNT(CASE WHEN status='failed'    THEN 1 END)                 AS failed_orders,
      COUNT(CASE WHEN status='completed' THEN 1 END)                 AS completed_orders
    FROM orders
  `);

  const normalizedCount = await db.query(
    `
    ${normalizedPaymentsCte}
    SELECT COUNT(*)::int AS total_rows
    FROM normalized_payments np
    WHERE np.order_status = 'completed'
    `
  );

  // Revenue by entity type using normalized rows (cart splits correctly; amount uses unit_price per person)
  const revenueByEntity = await db.query(
    `
    ${normalizedPaymentsCte}
    SELECT np.entity_type, COUNT(*)::int AS order_count, COALESCE(SUM(np.amount), 0) AS revenue
    FROM normalized_payments np
    WHERE np.order_status = 'completed'
    GROUP BY np.entity_type
    ORDER BY np.entity_type
    `
  );

  // Recent completed payments as normalized rows (good for UI lists)
  const recentPayments = await db.query(
    `
    WITH normalized_recent AS (
      SELECT
        np.order_id AS id,
        np.amount,
        np.order_status AS status,
        np.payment_date AS created_at,
        c.phone_number,
        np.entity_type,
        np.entity_id,
        np.is_cart_order,
        CASE
          WHEN np.entity_type='child' THEN ch.name
          WHEN np.entity_type='teacher' THEN tp.name
          WHEN np.entity_type='professional' THEN pp.name
          ELSE NULL
        END AS customer_name
      FROM (
        ${normalizedPaymentsCte}
        SELECT * FROM normalized_payments
      ) np
      LEFT JOIN orders o ON o.id = np.order_id
      LEFT JOIN clients c ON o.client_id = c.id
      LEFT JOIN children ch ON np.entity_type='child' AND np.entity_id=ch.id
      LEFT JOIN teacher_profiles tp ON np.entity_type='teacher' AND np.entity_id=tp.id
      LEFT JOIN professional_profiles pp ON np.entity_type='professional' AND np.entity_id=pp.id
      WHERE np.order_status = 'completed'
    )
    SELECT * FROM normalized_recent
    ORDER BY created_at DESC, id DESC
    LIMIT 10
    `
  );

  res.status(200).json({
    success: true,
    data: {
      overall: {
        ...stats.rows[0],
        completed_rows: normalizedCount.rows[0]?.total_rows ?? 0,
      },
      byEntityType: revenueByEntity.rows.map((r) => ({
        ...r,
        sector: mapEntityTypeToSector(r.entity_type),
      })),
      recentPayments: recentPayments.rows.map((r) => ({
        ...r,
        isCartOrder: !!r.is_cart_order,
        customerName: r.customer_name,
        sector: mapEntityTypeToSector(r.entity_type),
        entity_name: r.customer_name,
        sector_label: mapEntityTypeToSectorLabel(r.entity_type),
      })),
    }
  });
});
//
