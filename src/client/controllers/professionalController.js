const { query } = require('../../common/database');
const AppError = require('../../common/utils/AppError');

/**
 * @desc    Create or update professional profile
 * @route   POST /api/client/professional/profile
 * @access  Private (Client only)
 */
exports.saveProfessionalProfile = async (req, res, next) => {
  try {
    const { name, company_name, corporate_location_id, city, state, lunch_time, meal_size_id } = req.body;
    const clientId = req.user.id;

    if (!name || !company_name || !corporate_location_id || !city || !state || !lunch_time || !meal_size_id) {
      return next(new AppError('All fields (name, company_name, corporate_location_id, city, state, lunch_time, meal_size_id) are required', 400));
    }

    // Validate meal size exists and is active
    const mealSizeCheck = await query(
      'SELECT id FROM meal_sizes WHERE id = $1 AND is_active = true',
      [Number(meal_size_id)]
    );
    if (mealSizeCheck.rows.length === 0) {
      return next(new AppError('Invalid or inactive meal size', 400));
    }

    // Verify corporate location exists and is active
    const locationCheckQuery = `SELECT * FROM corporate_locations WHERE id = $1 AND is_active = true`;
    const locationCheck = await query(locationCheckQuery, [corporate_location_id]);

    if (locationCheck.rows.length === 0) {
      return next(new AppError('Invalid or inactive corporate location', 400));
    }

    // INDUSTRIAL RULE: Check for mutual exclusivity with Teacher profile
    const teacherCheck = await query('SELECT id FROM teacher_profiles WHERE client_id = $1', [clientId]);
    if (teacherCheck.rows.length > 0) {
      return next(new AppError('A Teacher profile already exists for this account. You cannot have both Teacher and Professional profiles.', 403));
    }

    // Check if professional profile already exists for this client
    const profileCheckQuery = `SELECT * FROM professional_profiles WHERE client_id = $1`;
    const profileCheck = await query(profileCheckQuery, [clientId]);

    let result;

    if (profileCheck.rows.length > 0) {
      // Update existing
      const updateQuery = `
        UPDATE professional_profiles 
        SET 
          name = $1, 
          company_name = $2, 
          corporate_location_id = $3, 
          city = $4, 
          state = $5, 
          lunch_time = $6,
          meal_size_id = $7,
          updated_at = CURRENT_TIMESTAMP
        WHERE client_id = $8
        RETURNING *;
      `;
      const values = [name, company_name, corporate_location_id, city, state, lunch_time, Number(meal_size_id), clientId];
      const updateResult = await query(updateQuery, values);
      result = updateResult.rows[0];
    } else {
      // Create new
      const insertQuery = `
        INSERT INTO professional_profiles (
          client_id, name, company_name, corporate_location_id, city, state, lunch_time, meal_size_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *;
      `;
      const values = [clientId, name, company_name, corporate_location_id, city, state, lunch_time, Number(meal_size_id)];
      const insertResult = await query(insertQuery, values);
      result = insertResult.rows[0];
    }

    res.status(200).json({
      success: true,
      message: profileCheck.rows.length > 0 ? 'Professional profile updated successfully' : 'Professional profile created successfully',
      data: result,
    });
  } catch (error) {
    next(new AppError(error.message || 'Error saving professional profile', 500));
  }
};

/**
 * @desc    Get professional profile
 * @route   GET /api/client/professional/profile
 * @access  Private (Client only)
 */
exports.getProfessionalProfile = async (req, res, next) => {
  try {
    const clientId = req.user.id;

    const sqlQuery = `
      SELECT p.*, c.name as corporate_location_name, c.address as corporate_location_address
      FROM professional_profiles p
      JOIN corporate_locations c ON p.corporate_location_id = c.id
      WHERE p.client_id = $1
    `;
    
    const result = await query(sqlQuery, [clientId]);

    if (result.rows.length === 0) {
      return res.status(200).json({
        success: true,
        data: null,
        message: 'No professional profile found'
      });
    }

    res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    next(new AppError(error.message || 'Error fetching professional profile', 500));
  }
};

/**
 * @desc    Delete professional profile
 * @route   DELETE /api/client/professional/profile
 * @access  Private (Client & Admin)
 */
exports.deleteProfessionalProfile = async (req, res, next) => {
  try {
    const clientId = (req.user.role === 'admin' && req.query.clientId) ? req.query.clientId : req.user.id;

    const profileRes = await query(`SELECT id FROM professional_profiles WHERE client_id = $1`, [clientId]);
    if (profileRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No professional profile found to delete'
      });
    }
    const profileId = profileRes.rows[0].id;

    const subCheck = await query(
      `SELECT id FROM client_subscriptions WHERE client_id = $1 AND entity_id = $2 AND entity_type = 'professional' AND is_active = true`,
      [clientId, profileId]
    );

    if (subCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete professional profile. Please wait until your active subscription ends.'
      });
    }

    const deleteQuery = `DELETE FROM professional_profiles WHERE client_id = $1 RETURNING *`;
    const result = await query(deleteQuery, [clientId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No professional profile found to delete'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Professional profile deleted successfully',
      data: result.rows[0]
    });
  } catch (error) {
    next(new AppError(error.message || 'Error deleting professional profile', 500));
  }
};
