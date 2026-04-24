const db = require('../../common/database');
const catchAsync = require('../../common/utils/catchAsync');

/**
 * GET /api/admin/lookup/meal-sizes
 * Returns the fixed meal sizes: Small, Medium, Large
 */
const getMealSizes = catchAsync(async (req, res) => {
  const result = await db.query(
    'SELECT id, name, display_name, sort_order FROM meal_sizes WHERE is_active = true ORDER BY sort_order ASC'
  );

  return res.status(200).json({
    success: true,
    message: 'Meal sizes fetched successfully.',
    data: {
      mealSizes: result.rows,
    },
  });
});

/**
 * GET /api/admin/lookup/standards
 * Returns the fixed standards: 1st to 12th
 */
const getStandards = catchAsync(async (req, res) => {
  const result = await db.query(
    'SELECT id, name, display_name, numeric_value FROM standards WHERE is_active = true ORDER BY numeric_value ASC'
  );

  return res.status(200).json({
    success: true,
    message: 'Standards fetched successfully.',
    data: {
      standards: result.rows,
    },
  });
});

module.exports = { getMealSizes, getStandards };
