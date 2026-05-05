const db = require('../../common/database');
const AppError = require('../../common/utils/AppError');

const normalizeDateInput = (date) => {
  if (!date || date === 'today') return new Date().toISOString().split('T')[0];
  return date;
};

const normalizeNutritionPoints = (points) => {
  if (!Array.isArray(points)) return [];
  return points
    .map((item) => String(item || '').trim())
    .filter(Boolean);
};

const getMenuByDate = async (menuDate) => {
  const result = await db.query(
    `
    SELECT id, menu_date, items, image_url, is_active, created_at, updated_at
    FROM daily_menus
    WHERE menu_date = $1
    ORDER BY created_at DESC
    LIMIT 1;
    `,
    [menuDate]
  );
  return result.rows[0] || null;
};

const fetchNutritionByMenuId = async (menuId) => {
  const result = await db.query(
    `
    SELECT nutrition_text
    FROM daily_menu_nutrition
    WHERE menu_id = $1
    ORDER BY sort_order ASC, id ASC;
    `,
    [menuId]
  );
  return result.rows.map((row) => row.nutrition_text);
};

exports.upsertMenuNutrition = async (req, res, next) => {
  try {
    const menuDate = normalizeDateInput(req.body.menu_date);
    const nutritionPoints = normalizeNutritionPoints(req.body.nutrition_points);

    const menu = await getMenuByDate(menuDate);
    if (!menu) {
      return next(new AppError(`No menu found for date: ${menuDate}`, 404));
    }

    await db.query('DELETE FROM daily_menu_nutrition WHERE menu_id = $1', [menu.id]);

    if (nutritionPoints.length > 0) {
      const values = [];
      const placeholders = [];
      nutritionPoints.forEach((point, idx) => {
        const base = idx * 3;
        placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
        values.push(menu.id, point, idx + 1);
      });

      await db.query(
        `
        INSERT INTO daily_menu_nutrition (menu_id, nutrition_text, sort_order)
        VALUES ${placeholders.join(', ')};
        `,
        values
      );
    }

    const savedNutrition = await fetchNutritionByMenuId(menu.id);

    res.status(200).json({
      success: true,
      message: 'Menu nutrition saved successfully',
      data: {
        menu_id: menu.id,
        menu_date: menu.menu_date,
        nutrition_points: savedNutrition,
      },
    });
  } catch (error) {
    next(new AppError(error.message || 'Error saving menu nutrition', 500));
  }
};

exports.getMenuNutritionByDate = async (req, res, next) => {
  try {
    const menuDate = normalizeDateInput(req.params.date);
    const menu = await getMenuByDate(menuDate);
    if (!menu) {
      return next(new AppError(`No menu found for date: ${menuDate}`, 404));
    }

    const nutritionPoints = await fetchNutritionByMenuId(menu.id);

    res.status(200).json({
      success: true,
      data: {
        ...menu,
        nutrition_points: nutritionPoints,
      },
    });
  } catch (error) {
    next(new AppError(error.message || 'Error fetching menu nutrition', 500));
  }
};

exports.getMenuNutritionHistory = async (req, res, next) => {
  try {
    const { limit = 20, page = 1 } = req.query;
    const safeLimit = Math.max(1, Number(limit) || 20);
    const safePage = Math.max(1, Number(page) || 1);
    const offset = (safePage - 1) * safeLimit;

    const menusResult = await db.query(
      `
      SELECT id, menu_date, items, image_url, is_active, created_at, updated_at
      FROM daily_menus
      ORDER BY menu_date DESC, created_at DESC
      LIMIT $1 OFFSET $2;
      `,
      [safeLimit, offset]
    );

    const menuIds = menusResult.rows.map((m) => m.id);
    let nutritionMap = {};

    if (menuIds.length > 0) {
      const nutritionRows = await db.query(
        `
        SELECT menu_id, nutrition_text
        FROM daily_menu_nutrition
        WHERE menu_id = ANY($1)
        ORDER BY menu_id, sort_order ASC, id ASC;
        `,
        [menuIds]
      );

      nutritionRows.rows.forEach((row) => {
        if (!nutritionMap[row.menu_id]) nutritionMap[row.menu_id] = [];
        nutritionMap[row.menu_id].push(row.nutrition_text);
      });
    }

    const data = menusResult.rows.map((m) => ({
      ...m,
      nutrition_points: nutritionMap[m.id] || [],
    }));

    res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    next(new AppError(error.message || 'Error fetching menu nutrition history', 500));
  }
};
