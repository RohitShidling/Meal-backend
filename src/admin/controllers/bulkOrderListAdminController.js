const { pool } = require('../../common/database');
const catchAsync = require('../../common/utils/catchAsync');
const AppError = require('../../common/utils/AppError');
const { clientDisplayNameSql } = require('../../common/utils/clientDisplayName');

exports.listOrders = catchAsync(async (req, res, next) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const countRes = await pool.query('SELECT COUNT(*)::int AS total FROM bulk_orders');
  const total = countRes.rows[0]?.total || 0;

  const rows = await pool.query(
    `SELECT bo.id, bo.client_id, bo.delivery_date, bo.total_quantity, bo.total_amount,
            bo.tier_mode, bo.created_at,
            COALESCE(o.status, bo.status) AS status,
            c.phone_number,
            c.username AS client_username,
            ${clientDisplayNameSql('c')} AS client_name,
            (
              SELECT COALESCE(json_agg(
                json_build_object(
                  'id', boi.id,
                  'meal_name', COALESCE(dm.items, bvm.name, 'Unknown'),
                  'quantity', boi.quantity,
                  'unit_price', boi.unit_price,
                  'line_total', boi.line_total,
                  'variety_slot', boi.variety_slot,
                  'is_variety_meal', (boi.bulk_variety_meal_id IS NOT NULL)
                ) ORDER BY boi.variety_slot NULLS FIRST, boi.menu_date ASC
              ), '[]'::json)
              FROM bulk_order_items boi
              LEFT JOIN daily_menus dm ON dm.id = boi.daily_menu_id
              LEFT JOIN bulk_variety_meals bvm ON bvm.id = boi.bulk_variety_meal_id
              WHERE boi.bulk_order_id = bo.id
            ) AS items
     FROM bulk_orders bo
     LEFT JOIN orders o ON o.id = bo.order_id
     JOIN clients c ON c.id = bo.client_id
     ORDER BY bo.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  res.status(200).json({
    success: true,
    count: rows.rowCount,
    total,
    page,
    limit,
    data: rows.rows,
  });
});


exports.getOrderById = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const resOrder = await pool.query(
    `SELECT bo.*, o.status AS order_status,
            c.phone_number,
            c.username AS client_username,
            ${clientDisplayNameSql('c')} AS client_name
     FROM bulk_orders bo
     LEFT JOIN orders o ON o.id = bo.order_id
     JOIN clients c ON c.id = bo.client_id
     WHERE bo.id = $1`,
    [id]
  );
  if (resOrder.rows.length === 0) return next(new AppError('Bulk order not found.', 404));
  const items = await pool.query(
    `SELECT boi.*,
            COALESCE(dm.items, bvm.name) AS menu_items
     FROM bulk_order_items boi
     LEFT JOIN daily_menus dm ON dm.id = boi.daily_menu_id
     LEFT JOIN bulk_variety_meals bvm ON bvm.id = boi.bulk_variety_meal_id
     WHERE boi.bulk_order_id = $1
     ORDER BY boi.variety_slot NULLS FIRST, boi.menu_date ASC`,
    [id]
  );
  res.status(200).json({
    success: true,
    data: { ...resOrder.rows[0], items: items.rows },
  });
});
