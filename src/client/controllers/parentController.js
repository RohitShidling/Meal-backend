const { query } = require('../../common/database');
const AppError = require('../../common/utils/AppError');

/**
 * @desc    Create or update parent profile
 * @route   POST /api/client/parent/profile
 * @access  Private (Client only)
 */
exports.saveParentProfile = async (req, res, next) => {
  try {
    const { name } = req.body;
    const clientId = req.user.id;

    if (!name) {
      return next(new AppError('Name is required', 400));
    }

    // Check if profile exists
    const profileCheckQuery = `SELECT * FROM parent_profiles WHERE client_id = $1`;
    const profileCheck = await query(profileCheckQuery, [clientId]);

    let result;
    if (profileCheck.rows.length > 0) {
      const updateQuery = `
        UPDATE parent_profiles 
        SET name = $1, updated_at = CURRENT_TIMESTAMP 
        WHERE client_id = $2 
        RETURNING *;
      `;
      const updateResult = await query(updateQuery, [name, clientId]);
      result = updateResult.rows[0];
    } else {
      const insertQuery = `
        INSERT INTO parent_profiles (client_id, name) 
        VALUES ($1, $2) 
        RETURNING *;
      `;
      const insertResult = await query(insertQuery, [clientId, name]);
      result = insertResult.rows[0];
    }

    res.status(200).json({
      success: true,
      message: profileCheck.rows.length > 0 ? 'Parent profile updated successfully' : 'Parent profile created successfully',
      data: result,
    });
  } catch (error) {
    next(new AppError(error.message || 'Error saving parent profile', 500));
  }
};

/**
 * @desc    Get parent profile
 * @route   GET /api/client/parent/profile
 * @access  Private (Client only)
 */
exports.getParentProfile = async (req, res, next) => {
  try {
    const clientId = req.user.id;
    const sqlQuery = `SELECT * FROM parent_profiles WHERE client_id = $1`;
    const result = await query(sqlQuery, [clientId]);

    if (result.rows.length === 0) {
      return res.status(200).json({
        success: true,
        data: null,
        message: 'No parent profile found'
      });
    }

    res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    next(new AppError(error.message || 'Error fetching parent profile', 500));
  }
};
