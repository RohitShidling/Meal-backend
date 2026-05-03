const { pool } = require('../database');
const AppError = require('../utils/AppError');

/**
 * @desc    Get all homepage entries ordered by display_order
 * @route   GET /api/common/homepage
 * @access  Public (or accessible to authenticated clients/admins)
 */
exports.getHomepage = async (req, res, next) => {
  try {
    const { entity_id } = req.query;

    let query = `
      SELECT h.id, h.entity_id, e.name as entity_name, h.name, h.description, h.display_order, h.is_active, h.created_at, h.updated_at
      FROM homepages h
      LEFT JOIN entities e ON h.entity_id = e.id
      WHERE h.is_active = true
    `;
    const params = [];

    if (entity_id) {
      // Validate entity_id
      const checkEntity = await pool.query('SELECT id FROM entities WHERE id = $1 AND is_active = true', [entity_id]);
      if (checkEntity.rows.length === 0) {
        return next(new AppError('Invalid or inactive entity selected.', 400));
      }
      query += ` AND h.entity_id = $1`;
      params.push(entity_id);
    }

    query += ` ORDER BY h.display_order ASC;`;

    const result = await pool.query(query, params);

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
    const { entity_id } = req.query;

    if (isNaN(order)) {
      return next(new AppError('Invalid display order.', 400));
    }

    let query = `
      SELECT h.id, h.entity_id, e.name as entity_name, h.name, h.description, h.display_order, h.is_active, h.created_at, h.updated_at
      FROM homepages h
      LEFT JOIN entities e ON h.entity_id = e.id
      WHERE h.is_active = true AND h.display_order = $1
    `;
    const params = [parseInt(order, 10)];

    if (entity_id) {
      // Validate entity_id
      const checkEntity = await pool.query('SELECT id FROM entities WHERE id = $1 AND is_active = true', [entity_id]);
      if (checkEntity.rows.length === 0) {
        return next(new AppError('Invalid or inactive entity selected.', 400));
      }
      query += ` AND h.entity_id = $2`;
      params.push(entity_id);
    }

    const result = await pool.query(query, params);

    if (result.rowCount === 0) {
      return next(new AppError(`No homepage entry found for order ${order}${entity_id ? ' for the specified entity' : ''}.`, 404));
    }

    res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};
