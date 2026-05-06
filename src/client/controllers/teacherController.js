const { query } = require('../../common/database');
const AppError = require('../../common/utils/AppError');

/**
 * @desc    Create or update teacher profile
 * @route   POST /api/client/teacher/profile
 * @access  Private (Client only)
 */
exports.saveTeacherProfile = async (req, res, next) => {
  try {
    const { name, school_college_name, city, state, status } = req.body;
    const clientId = req.user.id;

    if (!name || !school_college_name || !city || !state) {
      return next(new AppError('All fields (name, school_college_name, city, state) are required', 400));
    }

    // INDUSTRIAL RULE: Check for mutual exclusivity with Professional profile
    const profCheck = await query('SELECT id FROM professional_profiles WHERE client_id = $1', [clientId]);
    if (profCheck.rows.length > 0) {
      return next(new AppError('A Professional profile already exists for this account. You cannot have both Teacher and Professional profiles.', 403));
    }

    // Check if teacher profile already exists for this client
    const profileCheckQuery = `SELECT * FROM teacher_profiles WHERE client_id = $1`;
    const profileCheck = await query(profileCheckQuery, [clientId]);

    // Best-effort resolve school_id from existing schools table (preserves current UI flow).
    // If there is no match, school_id stays NULL and admin school tokens won't include this teacher
    // until corrected data is provided / mapped.
    let resolvedSchoolId = null;
    const schoolMatch = await query(
      `SELECT id FROM schools WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1`,
      [school_college_name]
    );
    if (schoolMatch.rows.length > 0) resolvedSchoolId = schoolMatch.rows[0].id;

    let result;

    if (profileCheck.rows.length > 0) {
      // Update existing
      const updateQuery = `
        UPDATE teacher_profiles 
        SET 
          name = $1, 
          school_college_name = $2, 
          school_id = $3,
          city = $4, 
          state = $5, 
          status = $6,
          updated_at = CURRENT_TIMESTAMP
        WHERE client_id = $7
        RETURNING *;
      `;
      const values = [name, school_college_name, resolvedSchoolId, city, state, status || 'active', clientId];
      const updateResult = await query(updateQuery, values);
      result = updateResult.rows[0];
    } else {
      // Create new
      const insertQuery = `
        INSERT INTO teacher_profiles (
          client_id, name, school_college_name, school_id, city, state, location, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *;
      `;
      const values = [clientId, name, school_college_name, resolvedSchoolId, city, state, '', status || 'active'];
      const insertResult = await query(insertQuery, values);
      result = insertResult.rows[0];
    }

    res.status(200).json({
      success: true,
      message: profileCheck.rows.length > 0 ? 'Teacher profile updated successfully' : 'Teacher profile created successfully',
      data: result,
    });
  } catch (error) {
    next(new AppError(error.message || 'Error saving teacher profile', 500));
  }
};

/**
 * @desc    Get teacher profile
 * @route   GET /api/client/teacher/profile
 * @access  Private (Client & Admin)
 */
exports.getTeacherProfile = async (req, res, next) => {
  try {
    // If admin, they might pass a clientId in query. If client, use their own.
    const clientId = (req.user.role === 'admin' && req.query.clientId) ? req.query.clientId : req.user.id;

    const sqlQuery = `SELECT * FROM teacher_profiles WHERE client_id = $1`;
    const result = await query(sqlQuery, [clientId]);

    if (result.rows.length === 0) {
      return res.status(200).json({
        success: true,
        data: null,
        message: 'No teacher profile found'
      });
    }

    res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    next(new AppError(error.message || 'Error fetching teacher profile', 500));
  }
};

/**
 * @desc    Delete teacher profile
 * @route   DELETE /api/client/teacher/profile
 * @access  Private (Client & Admin)
 */
exports.deleteTeacherProfile = async (req, res, next) => {
  try {
    const clientId = (req.user.role === 'admin' && req.query.clientId) ? req.query.clientId : req.user.id;

    const profileRes = await query(`SELECT id FROM teacher_profiles WHERE client_id = $1`, [clientId]);
    if (profileRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No teacher profile found to delete'
      });
    }
    const profileId = profileRes.rows[0].id;

    const subCheck = await query(
      `SELECT id FROM client_subscriptions WHERE client_id = $1 AND entity_id = $2 AND entity_type = 'teacher' AND is_active = true`,
      [clientId, profileId]
    );

    if (subCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete teacher profile. Please wait until your active subscription ends.'
      });
    }

    const deleteQuery = `DELETE FROM teacher_profiles WHERE client_id = $1 RETURNING *`;
    const result = await query(deleteQuery, [clientId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No teacher profile found to delete'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Teacher profile deleted successfully',
      data: result.rows[0]
    });
  } catch (error) {
    next(new AppError(error.message || 'Error deleting teacher profile', 500));
  }
};
