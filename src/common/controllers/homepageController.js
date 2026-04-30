const { pool } = require('../database');
const AppError = require('../utils/AppError');

/**
 * @desc    Get all homepage entries ordered by display_order
 * @route   GET /api/common/homepage
 * @access  Public (or accessible to authenticated clients/admins)
 */
exports.getHomepage = async (req, res, next) => {
  try {
    const query = `
      SELECT id, name, description, display_order, is_active, created_at, updated_at
      FROM homepages
      WHERE is_active = true
      ORDER BY display_order ASC;
    `;
    const result = await pool.query(query);

    res.status(200).json({
      success: true,
      count: result.rowCount,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get a specific homepage entry based on the display_order
 * @route   GET /api/common/homepage/order/:order
 * @access  Public (or accessible to authenticated clients/admins)
 */
exports.getHomepageByOrder = async (req, res, next) => {
  try {
    const { order } = req.params;

    if (isNaN(order)) {
      return next(new AppError('Invalid display order.', 400));
    }

    const query = `
      SELECT id, name, description, display_order, is_active, created_at, updated_at
      FROM homepages
      WHERE is_active = true AND display_order = $1;
    `;
    const result = await pool.query(query, [parseInt(order, 10)]);

    if (result.rowCount === 0) {
      return next(new AppError(`No homepage entry found for order ${order}.`, 404));
    }

    res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};
