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

/**
 * @desc    Update a corporate location
 * @route   PUT /api/admin/corporate-locations/:id
 * @access  Private (Admin only)
 */
exports.updateLocation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, address, city, state, is_active } = req.body;

    const checkQuery = `SELECT * FROM corporate_locations WHERE id = $1`;
    const checkResult = await query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return next(new AppError('Corporate location not found', 404));
    }

    const updateQuery = `
      UPDATE corporate_locations
      SET 
        name = COALESCE($1, name),
        address = COALESCE($2, address),
        city = COALESCE($3, city),
        state = COALESCE($4, state),
        is_active = COALESCE($5, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *;
    `;
    const values = [name, address, city, state, is_active, id];
    const result = await query(updateQuery, values);

    res.status(200).json({
      success: true,
      message: 'Corporate location updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    next(new AppError(error.message || 'Error updating corporate location', 500));
  }
};

/**
 * @desc    Delete a corporate location
 * @route   DELETE /api/admin/corporate-locations/:id
 * @access  Private (Admin only)
 */
exports.deleteLocation = async (req, res, next) => {
  try {
    const { id } = req.params;

    const checkQuery = `SELECT * FROM corporate_locations WHERE id = $1`;
    const checkResult = await query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return next(new AppError('Corporate location not found', 404));
    }

    const deleteQuery = `DELETE FROM corporate_locations WHERE id = $1 RETURNING id`;
    const result = await query(deleteQuery, [id]);

    res.status(200).json({
      success: true,
      message: 'Corporate location deleted successfully',
      data: { id: result.rows[0].id }
    });
  } catch (error) {
    next(new AppError(error.message || 'Error deleting corporate location', 500));
  }
};

/**
 * @desc    Update corporate location status
 * @route   PATCH /api/admin/corporate-locations/:id/status
 * @access  Private (Admin only)
 */
exports.updateLocationStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    if (is_active === undefined) {
      return next(new AppError('is_active status is required', 400));
    }

    const checkQuery = `SELECT * FROM corporate_locations WHERE id = $1`;
    const checkResult = await query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return next(new AppError('Corporate location not found', 404));
    }

    const updateQuery = `
      UPDATE corporate_locations
      SET is_active = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *;
    `;
    const result = await query(updateQuery, [is_active, id]);

    res.status(200).json({
      success: true,
      message: 'Corporate location status updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    next(new AppError(error.message || 'Error updating corporate location status', 500));
  }
};
