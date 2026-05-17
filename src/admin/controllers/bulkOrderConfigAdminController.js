const { pool } = require('../../common/database');
const catchAsync = require('../../common/utils/catchAsync');
const bulkOrderService = require('../../common/services/bulkOrderService');

exports.getConfig = catchAsync(async (req, res) => {
  const config = await bulkOrderService.loadConfig();
  res.status(200).json({
    success: true,
    data: {
      min_quantity: Number(config.min_quantity),
      min_lead_days: Number(config.min_lead_days),
      tier_threshold: Number(config.tier_threshold),
      price_per_meal_under_threshold: Number(config.price_per_meal_under_threshold),
      variety_menu_lookahead_days: Number(config.variety_menu_lookahead_days),
      max_variety_types: Number(config.max_variety_types),
      allow_multiple_variety_meals: config.allow_multiple_variety_meals !== false,
      min_quantity_per_variety_meal: Number(config.min_quantity_per_variety_meal ?? 1),
      is_active: config.is_active,
    },
  });
});

exports.updateConfig = catchAsync(async (req, res) => {
  const payload = req.validatedBulkConfig;
  const keys = Object.keys(payload);
  const sets = keys.map((k, i) => `${k} = $${i + 1}`);
  const values = keys.map((k) => payload[k]);
  values.push(new Date());
  await pool.query(
    `UPDATE bulk_order_config SET ${sets.join(', ')}, updated_at = $${values.length} WHERE id = 1`,
    values
  );
  const config = await bulkOrderService.loadConfig();
  res.status(200).json({
    success: true,
    message: 'Bulk order configuration updated.',
    data: await bulkOrderService.getPublicConfig(),
  });
});

