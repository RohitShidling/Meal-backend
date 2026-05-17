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
  const varietyMenus = await bulkOrderService.fetchVarietyMeals();
  res.status(200).json({
    success: true,
    data: {
      delivery_date: deliveryDate,
      delivery_menu: deliveryMenu,
      variety_menus: varietyMenus,
      tier_threshold: Number(config.tier_threshold),
      min_quantity: Number(config.min_quantity),
    },
  });
});
