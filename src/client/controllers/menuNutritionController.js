const db = require('../../common/database');
const catchAsync = require('../../common/utils/catchAsync');

const mealEligibilityService = require('../../common/services/mealEligibilityService');
const getToday = () => mealEligibilityService.parseSessionToday();

const fetchNutritionMapByDates = async (dates = []) => {
  if (!Array.isArray(dates) || dates.length === 0) return {};

  const result = await db.query(
    `
    SELECT
      dm.menu_date,
      COALESCE(
        ARRAY_AGG(dmn.nutrition_text ORDER BY dmn.sort_order ASC, dmn.id ASC)
          FILTER (WHERE dmn.nutrition_text IS NOT NULL),
        '{}'
      ) AS nutrition_points
    FROM daily_menus dm
    LEFT JOIN daily_menu_nutrition dmn ON dmn.menu_id = dm.id
    WHERE dm.menu_date = ANY($1) AND dm.is_active = true
    GROUP BY dm.menu_date
    `,
    [dates]
  );

  return result.rows.reduce((acc, row) => {
    acc[String(row.menu_date).slice(0, 10)] = row.nutrition_points || [];
    return acc;
  }, {});
};

exports.getTodayNutrition = catchAsync(async (req, res) => {
  const todayMenuResult = await db.query(
    `
    SELECT id, menu_date
    FROM daily_menus
    WHERE is_active = true
      AND menu_date::date = CURRENT_DATE
    ORDER BY created_at DESC
    LIMIT 1
    `
  );

  if (todayMenuResult.rows.length === 0) {
    return res.status(200).json({
      success: true,
      data: {
        menu_date: getToday(),
        nutrition_points: [],
      },
    });
  }

  const todayMenu = todayMenuResult.rows[0];
  const nutritionResult = await db.query(
    `
    SELECT nutrition_text
    FROM daily_menu_nutrition
    WHERE menu_id = $1
    ORDER BY sort_order ASC, id ASC
    `,
    [todayMenu.id]
  );
  const nutritionPoints = nutritionResult.rows.map((row) => row.nutrition_text);

  res.status(200).json({
    success: true,
    data: {
      menu_date: todayMenu.menu_date,
      nutrition_points: nutritionPoints,
    },
  });
});

exports.getWeeklyNutrition = catchAsync(async (req, res) => {
  const weeklyMenus = await db.query(
    `
    SELECT DISTINCT menu_date
    FROM daily_menus
    WHERE is_active = true
      AND menu_date >= CURRENT_DATE
      AND menu_date < CURRENT_DATE + INTERVAL '7 days'
    ORDER BY menu_date ASC
    `
  );

  const dates = weeklyMenus.rows.map((row) => row.menu_date);
  const nutritionMap = await fetchNutritionMapByDates(dates);

  const data = dates.map((menuDate) => ({
    menu_date: String(menuDate).slice(0, 10),
    nutrition_points: nutritionMap[String(menuDate).slice(0, 10)] || [],
  }));

  res.status(200).json({
    success: true,
    count: data.length,
    data,
  });
});
