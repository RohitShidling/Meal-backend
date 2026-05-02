const { pool } = require('../database');
const AppError = require('../utils/AppError');

/**
 * @desc    Get all active entities
 * @route   GET /api/common/entities
 * @access  Public
 */
exports.getEntities = async (req, res, next) => {
  try {
    const query = `
      SELECT id, name, is_active, created_at, updated_at
      FROM entities
      WHERE is_active = true
      ORDER BY id ASC;
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
