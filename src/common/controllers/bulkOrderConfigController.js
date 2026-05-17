const catchAsync = require('../utils/catchAsync');
const bulkOrderService = require('../services/bulkOrderService');
const { parseYmdStrict } = require('../utils/sessionDate');
const AppError = require('../utils/AppError');

exports.getConfig = catchAsync(async (req, res) => {
  const data = await bulkOrderService.getPublicConfig();
  const earliest = bulkOrderService.getEarliestDeliveryDate(
    await bulkOrderService.loadConfig()
  );
  res.status(200).json({
    success: true,
    data: {
      ...data,
      earliest_delivery_date: earliest,
    },
  });
});

exports.getMenusForDelivery = catchAsync(async (req, res, next) => {
  const deliveryDate = parseYmdStrict(req.query.deliveryDate);
  if (!deliveryDate) {
    return next(new AppError('deliveryDate query param is required (YYYY-MM-DD).', 400));
  }
  const config = await bulkOrderService.loadConfig();
  const earliest = bulkOrderService.getEarliestDeliveryDate(config);
  if (deliveryDate < earliest) {
    return next(
      new AppError(`Delivery date must be ${earliest} or later.`, 400)
    );
  }
  const deliveryMenu = await bulkOrderService.fetchMenuByDate(deliveryDate);
  const varietyCategories = await bulkOrderService.fetchVarietyCategories();
  res.status(200).json({
    success: true,
    data: {
      delivery_date: deliveryDate,
      delivery_menu: deliveryMenu,
      variety_categories: varietyCategories,
      variety_menus: [],
      tier_threshold: Number(config.tier_threshold),
      min_quantity: Number(config.min_quantity),
      standard_max_quantity: Number(
        config.standard_max_quantity ?? Math.max(Number(config.min_quantity), Number(config.tier_threshold) - 1)
      ),
    },
  });
});

exports.listVarietyCategories = catchAsync(async (req, res) => {
  await bulkOrderService.loadConfig();
  const categories = await bulkOrderService.fetchVarietyCategories();
  res.status(200).json({ success: true, count: categories.length, data: categories });
});

exports.getVarietyMealsByCategory = catchAsync(async (req, res, next) => {
  const categoryId = String(req.params.categoryId || '').trim();
  if (!/^BVC-\d+$/.test(categoryId)) {
    return next(new AppError('Invalid category id.', 400));
  }
  await bulkOrderService.loadConfig();
  const meals = await bulkOrderService.fetchVarietyMealsByCategory(categoryId);
  res.status(200).json({ success: true, count: meals.length, data: meals });
});
