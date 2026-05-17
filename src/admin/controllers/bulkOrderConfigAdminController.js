const { pool } = require('../../common/database');
const catchAsync = require('../../common/utils/catchAsync');
const AppError = require('../../common/utils/AppError');
const bulkOrderService = require('../../common/services/bulkOrderService');

exports.getConfig = catchAsync(async (req, res) => {
  const config = await bulkOrderService.loadConfig();
  res.status(200).json({
    success: true,
    data: {
      min_quantity: Number(config.min_quantity),
      standard_max_quantity: Number(
        config.standard_max_quantity ?? Math.max(Number(config.min_quantity), Number(config.tier_threshold) - 1)
      ),
      min_lead_days: Number(config.min_lead_days),
      tier_threshold: Number(config.tier_threshold),
      price_per_meal_under_threshold: Number(config.price_per_meal_under_threshold),
      variety_menu_lookahead_days: Number(config.variety_menu_lookahead_days),
      max_variety_types: Number(config.max_variety_types),
      allow_multiple_variety_meals: config.allow_multiple_variety_meals !== false,
      min_quantity_per_variety_meal: Number(config.min_quantity_per_variety_meal ?? 1),
      is_active: config.is_active,
      hub_intro_text: config.hub_intro_text,
      standard_tier_title: config.standard_tier_title,
      standard_tier_subtitle: config.standard_tier_subtitle,
      standard_tier_description: config.standard_tier_description,
      variety_tier_title: config.variety_tier_title,
      variety_tier_subtitle: config.variety_tier_subtitle,
      variety_tier_description: config.variety_tier_description,
    },
  });
});

exports.updateConfig = catchAsync(async (req, res) => {
  const payload = req.validatedBulkConfig;
  const current = await bulkOrderService.loadConfig();
  const merged = { ...current, ...payload };
  const minQ = Number(merged.min_quantity);
  const maxQ = Number(
    merged.standard_max_quantity ?? Math.max(minQ, Number(merged.tier_threshold) - 1)
  );
  const tier = Number(merged.tier_threshold);
  if (maxQ < minQ || maxQ >= tier) {
    throw new AppError(
      'standard_max_quantity must be between min_quantity and tier_threshold (exclusive).',
      400
    );
  }
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

