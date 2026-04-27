const db = require('../database');

// @desc    Get menu by date (defaults to today if date is 'today')
// @route   GET /api/common/menu/:date
exports.getMenuByDate = async (req, res, next) => {
  try {
    let { date } = req.params;
    
    // If the client asks for 'today', use the current date
    if (date === 'today') {
      date = new Date().toISOString().split('T')[0];
    }

    const query = `
      SELECT id, image_url, items, menu_date, created_at
      FROM daily_menus
      WHERE menu_date = $1 AND is_active = true
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    const result = await db.query(query, [date]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No active menu found for ${date}.`
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

// @desc    Get menu history (All global menus)
// @route   GET /api/common/menu/history/all
exports.getMenuHistory = async (req, res, next) => {
  try {
    const { limit = 10, page = 1 } = req.query;
    const offset = (page - 1) * limit;

    const query = `
      SELECT id, image_url, items, menu_date, created_at
      FROM daily_menus
      WHERE is_active = true
      ORDER BY menu_date DESC
      LIMIT $1 OFFSET $2
    `;
    
    const result = await db.query(query, [limit, offset]);

    res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
};
