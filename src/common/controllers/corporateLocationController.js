const { query } = require('../database');
const AppError = require('../utils/AppError');

/**
 * @desc    Get all active corporate locations
 * @route   GET /api/common/corporate-locations
 * @access  Private (Admin & Client)
 */
exports.getLocations = async (req, res, next) => {
  try {
    const isClient = req.user.role === 'client';
    
    let sqlQuery = `
      SELECT id, name, address, city, state 
      FROM corporate_locations 
    `;

    if (isClient) {
      sqlQuery += ` WHERE is_active = true `;
    }

    sqlQuery += ` ORDER BY created_at DESC;`;

    const result = await query(sqlQuery);

    res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    next(new AppError(error.message || 'Error fetching corporate locations', 500));
  }
};
