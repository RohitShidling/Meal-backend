const { query } = require('../../common/database');
const catchAsync = require('../../common/utils/catchAsync');
const AppError = require('../../common/utils/AppError');
const { formatMoney } = require('../../common/utils/formatMoney');

exports.listMealSizeUpgradePrices = catchAsync(async (req, res) => {
  const r = await query(
    `SELECT p.id, p.from_meal_size_id, p.to_meal_size_id, p.price::text, p.is_active,
            p.updated_at,
            f.display_name AS from_display_name,
            t.display_name AS to_display_name
     FROM meal_size_upgrade_prices p
     JOIN meal_sizes f ON f.id = p.from_meal_size_id
     JOIN meal_sizes t ON t.id = p.to_meal_size_id
     ORDER BY p.from_meal_size_id ASC, p.to_meal_size_id ASC`
  );
  res.status(200).json({
    success: true,
    count: r.rowCount,
    data: r.rows.map((row) => ({ ...row, price: formatMoney(row.price) })),
  });
});

/** Completed meal-size upgrade payments (for admin audit). */
exports.listMealSizeUpgradeOrders = catchAsync(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const r = await query(
    `SELECT
        o.id AS order_id,
        o.client_id,
        o.entity_type,
        o.entity_id,
        o.amount::text AS amount_paid,
        o.status AS payment_status,
        o.created_at,
        o.meal_size_id AS to_meal_size_id,
        o.upgrade_from_meal_size_id AS from_meal_size_id,
        f.display_name AS from_display_name,
        t.display_name AS to_display_name,
        COALESCE(c.username, c.phone_number, CAST(c.id AS TEXT)) AS client_name,
        CASE
          WHEN o.entity_type = 'child' THEN ch.name
          WHEN o.entity_type = 'teacher' THEN tp.name
          WHEN o.entity_type = 'professional' THEN pp.name
        END AS entity_name
     FROM orders o
     LEFT JOIN meal_sizes f ON f.id = o.upgrade_from_meal_size_id
     LEFT JOIN meal_sizes t ON t.id = o.meal_size_id
     LEFT JOIN clients c ON c.id = o.client_id
     LEFT JOIN children ch ON o.entity_type = 'child' AND ch.id = o.entity_id
     LEFT JOIN teacher_profiles tp ON o.entity_type = 'teacher' AND tp.id = o.entity_id
     LEFT JOIN professional_profiles pp ON o.entity_type = 'professional' AND pp.id = o.entity_id
     WHERE o.order_type = 'meal_size_upgrade'
     ORDER BY o.created_at DESC
     LIMIT $1`,
    [limit]
  );
  res.status(200).json({
    success: true,
    count: r.rowCount,
    data: r.rows.map((row) => ({
      ...row,
      amount_paid: formatMoney(row.amount_paid),
    })),
  });
});

exports.upsertMealSizeUpgradePrice = catchAsync(async (req, res, next) => {
  const fromId = Number(req.body.fromMealSizeId ?? req.body.from_meal_size_id);
  const toId = Number(req.body.toMealSizeId ?? req.body.to_meal_size_id);
  const price = Number(req.body.price);
  const isActive = req.body.is_active !== false && req.body.isActive !== false;

  if (!Number.isFinite(fromId) || !Number.isFinite(toId)) {
    return next(new AppError('fromMealSizeId and toMealSizeId must be numeric', 400));
  }
  if (fromId === toId) return next(new AppError('from and to meal sizes must differ', 400));
  if (!Number.isFinite(price) || price < 0) return next(new AppError('price must be a non-negative number', 400));

  const sizeCheck = await query(
    `SELECT id FROM meal_sizes WHERE id = ANY($1::int[]) AND is_active = true`,
    [[fromId, toId]]
  );
  if (sizeCheck.rowCount < 2) return next(new AppError('Both meal sizes must exist and be active', 400));

  const r = await query(
    `INSERT INTO meal_size_upgrade_prices (from_meal_size_id, to_meal_size_id, price, is_active, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (from_meal_size_id, to_meal_size_id)
     DO UPDATE SET price = EXCLUDED.price, is_active = EXCLUDED.is_active, updated_at = NOW()
     RETURNING id, from_meal_size_id, to_meal_size_id, price::text, is_active`,
    [fromId, toId, price, isActive]
  );

  res.status(200).json({
    success: true,
    message: 'Upgrade price saved',
    data: r.rows[0],
  });
});

exports.deleteMealSizeUpgradePrice = catchAsync(async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return next(new AppError('Invalid id', 400));
  const r = await query(`DELETE FROM meal_size_upgrade_prices WHERE id = $1 RETURNING id`, [id]);
  if (r.rowCount === 0) return next(new AppError('Upgrade price row not found', 404));
  res.status(200).json({ success: true, message: 'Deleted', data: r.rows[0] });
});
