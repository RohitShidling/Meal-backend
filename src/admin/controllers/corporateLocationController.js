const { query } = require('../../common/database');
const AppError = require('../../common/utils/AppError');

/**
 * @desc    Get all corporate locations (active and inactive)
 * @route   GET /api/admin/corporate-locations
 * @access  Private (Admin only)
 */
exports.getAllLocations = async (req, res, next) => {
  try {
    const fetchQuery = `
      SELECT cl.*, a.username as created_by_name
      FROM corporate_locations cl
      LEFT JOIN admins a ON cl.created_by = a.id
      ORDER BY cl.created_at DESC;
    `;
    const result = await query(fetchQuery);

    res.status(200).json({
      success: true,
      count: result.rowCount,
      data: result.rows,
    });
  } catch (error) {
    next(new AppError(error.message || 'Error fetching corporate locations', 500));
  }
};

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
 * @desc    Update an existing corporate location
 * @route   PUT /api/admin/corporate-locations/:id
 * @access  Private (Admin only)
 */
exports.updateLocation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, address, city, state, is_active } = req.body;
    const adminId = req.user.id;

    // Check if location exists
    const checkQuery = 'SELECT id FROM corporate_locations WHERE id = $1';
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

    // Check if location exists
    const checkQuery = 'SELECT id FROM corporate_locations WHERE id = $1';
    const checkResult = await query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return next(new AppError('Corporate location not found', 404));
    }

    // Check if any professional profile uses this location
    const checkProfileQuery = 'SELECT id FROM professional_profiles WHERE corporate_location_id = $1 LIMIT 1';
    const checkProfileResult = await query(checkProfileQuery, [id]);

    if (checkProfileResult.rows.length > 0) {
      return next(new AppError('Cannot delete location as it is associated with professional profiles. Deactivate it instead.', 400));
    }

    await query('DELETE FROM corporate_locations WHERE id = $1', [id]);

    res.status(200).json({
      success: true,
      message: 'Corporate location deleted successfully',
      data: { id },
    });
  } catch (error) {
    next(new AppError(error.message || 'Error deleting corporate location', 500));
  }
};

/**
 * @desc    Toggle corporate location status (active/inactive)
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

    const updateQuery = `
      UPDATE corporate_locations
      SET is_active = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *;
    `;
    const result = await query(updateQuery, [is_active, id]);

    if (result.rows.length === 0) {
      return next(new AppError('Corporate location not found', 404));
    }

    res.status(200).json({
      success: true,
      message: `Corporate location ${is_active ? 'activated' : 'deactivated'} successfully`,
      data: result.rows[0],
    });
  } catch (error) {
    next(new AppError(error.message || 'Error updating location status', 500));
  }
};

