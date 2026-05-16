const db = require('../../common/database');
const { query } = db;
const AppError = require('../../common/utils/AppError');
const mealEligibilityService = require('../../common/services/mealEligibilityService');
const DEFAULT_MEAL_TIME = '1:00 PM';

const normalizeMealTime = (input) => {
  const raw = String(input ?? '').trim();
  if (!raw) return DEFAULT_MEAL_TIME;
  const twelveHour = raw.match(/^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/i);
  if (twelveHour) {
    const hour = Number(twelveHour[1]);
    if (hour >= 1 && hour <= 12) {
      return `${hour}:${twelveHour[2]} ${twelveHour[3].toUpperCase()}`;
    }
  }
  const twentyFourHour = raw.match(/^(\d{1,2}):([0-5]\d)$/);
  if (twentyFourHour) {
    const hour = Number(twentyFourHour[1]);
    if (hour >= 0 && hour <= 23) {
      const normalized = new Date(Date.UTC(2000, 0, 1, hour, Number(twentyFourHour[2])));
      return normalized.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'UTC',
      });
    }
  }
  return DEFAULT_MEAL_TIME;
};

const withTeacherAliases = (row) => (row ? {
  ...row,
  mealTiming: row.meal_time || DEFAULT_MEAL_TIME,
  mealSizeId: row.meal_size_id || null,
} : row);

/**
 * @desc    Create or update teacher profile
 * @route   POST /api/client/teacher/profile
 * @access  Private (Client only)
 */
exports.saveTeacherProfile = async (req, res, next) => {
  try {
    const { name, school_college_name, city, state, status } = req.body;
    const mealTimeInput = req.body.meal_time ?? req.body.mealTiming;
    const mealSizeInput = req.body.meal_size_id ?? req.body.mealSizeId;
    const clientId = req.user.id;

    if (!name || !school_college_name || !city || !state || !mealTimeInput || !mealSizeInput) {
      return next(new AppError('All fields (name, school_college_name, city, state, meal_time, meal_size_id) are required', 400));
    }

    // Validate meal size exists and is active
    const mealSizeCheck = await query(
      'SELECT id FROM meal_sizes WHERE id = $1 AND is_active = true',
      [Number(mealSizeInput)]
    );
    if (mealSizeCheck.rows.length === 0) {
      return next(new AppError('Invalid or inactive meal size', 400));
    }
    const normalizedMealTime = normalizeMealTime(mealTimeInput);

    const tx = await db.pool.connect();
    let result;
    let profileExists = false;
    try {
      await tx.query('BEGIN');
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [String(clientId)]);

      const profileCheck = await tx.query('SELECT * FROM teacher_profiles WHERE client_id = $1', [clientId]);
      profileExists = profileCheck.rows.length > 0;

      if (profileExists) {
        const newSize = Number(mealSizeInput);
        const oldSize = Number(profileCheck.rows[0].meal_size_id);
        const entityId = profileCheck.rows[0].id;
        if (Number.isFinite(newSize) && Number.isFinite(oldSize) && newSize !== oldSize) {
          const today = mealEligibilityService.parseSessionToday();
          const block = await tx.query(
            `SELECT id FROM client_subscriptions
             WHERE client_id=$1 AND entity_type='teacher' AND entity_id=$2 AND is_active=true
               AND DATE(end_date) >= $3::date
               AND ((total_meals - used_meals) > 0 OR DATE(start_date) > $3::date)
             LIMIT 1`,
            [clientId, entityId, today]
          );
          if (block.rows.length > 0) {
            await tx.query('ROLLBACK');
            tx.release();
            return next(
              new AppError(
                'Meal size cannot be changed while a subscription is active or upcoming. Use Upgrade meal size in the app to pay for a larger pack.',
                400
              )
            );
          }
        }
      }

      let resolvedSchoolId = null;
      const schoolMatch = await tx.query(
        `SELECT id FROM schools WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1`,
        [school_college_name]
      );
      if (schoolMatch.rows.length > 0) resolvedSchoolId = schoolMatch.rows[0].id;

      if (profileExists) {
        const updateQuery = `
          UPDATE teacher_profiles
          SET
            name = $1,
            school_college_name = $2,
            school_id = $3,
            city = $4,
            state = $5,
            meal_time = $6,
            status = $7,
            meal_size_id = $8,
            updated_at = CURRENT_TIMESTAMP
          WHERE client_id = $9
          RETURNING *;
        `;
        const values = [name, school_college_name, resolvedSchoolId, city, state, normalizedMealTime, status || 'active', Number(mealSizeInput), clientId];
        const updateResult = await tx.query(updateQuery, values);
        result = updateResult.rows[0];
      } else {
        const insertQuery = `
          INSERT INTO teacher_profiles (
            client_id, name, school_college_name, school_id, city, state, meal_time, location, status, meal_size_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *;
        `;
        const values = [clientId, name, school_college_name, resolvedSchoolId, city, state, normalizedMealTime, '', status || 'active', Number(mealSizeInput)];
        const insertResult = await tx.query(insertQuery, values);
        result = insertResult.rows[0];
      }
      await tx.query('COMMIT');
    } catch (e) {
      await tx.query('ROLLBACK');
      throw e;
    } finally {
      tx.release();
    }

    res.status(200).json({
      success: true,
      message: profileExists ? 'Teacher profile updated successfully' : 'Teacher profile created successfully',
      data: withTeacherAliases(result),
    });
  } catch (error) {
    if (error instanceof AppError) return next(error);
    console.error('saveTeacherProfile', error);
    return next(new AppError('Error saving teacher profile.', 500));
  }
};

/**
 * @desc    Get teacher profile
 * @route   GET /api/client/teacher/profile
 * @access  Private (Client only)
 */
exports.getTeacherProfile = async (req, res, next) => {
  try {
    const clientId = req.user.id;

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
      data: withTeacherAliases(result.rows[0]),
    });
  } catch (error) {
    if (error instanceof AppError) return next(error);
    console.error('getTeacherProfile', error);
    return next(new AppError('Error fetching teacher profile.', 500));
  }
};

/**
 * @desc    Delete teacher profile
 * @route   DELETE /api/client/teacher/profile
 * @access  Private (Client only)
 */
exports.deleteTeacherProfile = async (req, res, next) => {
  try {
    const clientId = req.user.id;

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
    if (error instanceof AppError) return next(error);
    console.error('deleteTeacherProfile', error);
    return next(new AppError('Error deleting teacher profile.', 500));
  }
};
