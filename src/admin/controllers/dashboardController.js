const db = require('../../common/database');
const catchAsync = require('../../common/utils/catchAsync');

const getDashboardStats = catchAsync(async (req, res, next) => {
  const statsQuery = `
    SELECT
      (SELECT COUNT(*) FROM schools WHERE is_deleted = false) as total_schools,
      (SELECT COUNT(*) FROM subscriptions) as total_subscriptions,
      (SELECT COUNT(*) FROM corporate_locations) as total_locations,
      (SELECT COUNT(*) FROM daily_menus) as total_menus,
      (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE status = 'success') as total_revenue
  `;
  const statsResult = await db.query(statsQuery);

  const mealSizesResult = await db.query('SELECT * FROM meal_sizes ORDER BY sort_order ASC');
  const standardsResult = await db.query('SELECT * FROM standards ORDER BY numeric_value ASC');

  return res.status(200).json({
    success: true,
    data: {
      stats: {
        schools: parseInt(statsResult.rows[0].total_schools, 10),
        subscriptions: parseInt(statsResult.rows[0].total_subscriptions, 10),
        locations: parseInt(statsResult.rows[0].total_locations, 10),
        menus: parseInt(statsResult.rows[0].total_menus, 10),
        revenue: parseFloat(statsResult.rows[0].total_revenue)
      },
      mealSizes: mealSizesResult.rows,
      standards: standardsResult.rows
    }
  });
});

module.exports = { getDashboardStats };
