const db = require('../database');

// @desc    Get latest menu (Specific School or Global)
// @route   GET /api/common/menu/:school_id
exports.getLatestMenu = async (req, res, next) => {
  try {
    const { school_id } = req.params;

    // Logic: Look for school-specific menu first, fallback to Global (NULL school_id)
    const query = `
      SELECT id, school_id, image_url, items, menu_date, created_at
      FROM daily_menus
      WHERE (school_id = $1 OR school_id IS NULL) AND is_active = true
      ORDER BY (school_id IS NOT NULL) DESC, menu_date DESC, created_at DESC
      LIMIT 1
    `;
    
    const result = await db.query(query, [school_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active menu found for this school today.'
      });
    }

    res.status(200).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get menu history
// @route   GET /api/common/menu/:school_id/history
exports.getMenuHistory = async (req, res, next) => {
  try {
    const { school_id } = req.params;
    const { limit = 10, page = 1 } = req.query;
    const offset = (page - 1) * limit;

    const query = `
      SELECT id, school_id, image_url, items, menu_date, created_at
      FROM daily_menus
      WHERE (school_id = $1 OR school_id IS NULL) AND is_active = true
      ORDER BY menu_date DESC
      LIMIT $2 OFFSET $3
    `;
    
    const result = await db.query(query, [school_id, limit, offset]);

    res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
};
