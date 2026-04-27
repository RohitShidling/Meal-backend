const { query } = require('../../common/database');
const AppError = require('../../common/utils/AppError');

/**
 * @desc    Create a new corporate location
 * @route   POST /api/admin/corporate-locations
 * @access  Private (Admin only)
 */
exports.createLocation = async (req, res, next) => {
  try {
    const { name, address, city, state, is_active } = req.body;
    const adminId = req.user.id;

    if (!name || !address || !city || !state) {
      return next(new AppError('name, address, city, and state are required', 400));
    }

    const insertQuery = `
      INSERT INTO corporate_locations (
        name, address, city, state, is_active, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const values = [
      name,
      address,
      city,
      state,
      is_active !== undefined ? is_active : true,
      adminId
    ];

    const result = await query(insertQuery, values);

    res.status(201).json({
      success: true,
      message: 'Corporate location created successfully',
      data: result.rows[0],
    });
  } catch (error) {
    next(new AppError(error.message || 'Error creating corporate location', 500));
  }
};
