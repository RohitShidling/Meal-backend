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

const withProfessionalAliases = (row) => (row ? {
  ...row,
  mealTiming: row.lunch_time || DEFAULT_MEAL_TIME,
  mealSizeId: row.meal_size_id || null,
} : row);

/**
 * @desc    Create or update professional profile
 * @route   POST /api/client/professional/profile
 * @access  Private (Client only)
 */
exports.saveProfessionalProfile = async (req, res, next) => {
  try {
    const { name, company_name, corporate_location_id, city, state } = req.body;
    const mealTimeInput = req.body.mealTiming ?? req.body.lunch_time;
    const mealSizeInput = req.body.mealSizeId ?? req.body.meal_size_id;
    const clientId = req.user.id;

    if (!name || !company_name || !corporate_location_id || !city || !state || !mealTimeInput || !mealSizeInput) {
      return next(new AppError('All fields (name, company_name, corporate_location_id, city, state, lunch_time, meal_size_id) are required', 400));
    }

    // Validate meal size exists and is active
    const mealSizeCheck = await query(
      'SELECT id FROM meal_sizes WHERE id = $1 AND is_active = true',
      [Number(mealSizeInput)]
    );
    const normalizedMealTime = normalizeMealTime(mealTimeInput);
    if (mealSizeCheck.rows.length === 0) {
      return next(new AppError('Invalid or inactive meal size', 400));
    }

    // Verify corporate location exists and is active
    const locationCheckQuery = `SELECT * FROM corporate_locations WHERE id = $1 AND is_active = true`;
    const locationCheck = await query(locationCheckQuery, [corporate_location_id]);

    if (locationCheck.rows.length === 0) {
      return next(new AppError('Invalid or inactive corporate location', 400));
    }

    const tx = await db.pool.connect();
    let result;
    let profileExists = false;
    try {
      await tx.query('BEGIN');
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [String(clientId)]);

      const profileCheck = await tx.query('SELECT * FROM professional_profiles WHERE client_id = $1', [clientId]);
      profileExists = profileCheck.rows.length > 0;

      if (profileExists) {
        const newSize = Number(mealSizeInput);
        const oldSize = Number(profileCheck.rows[0].meal_size_id);
        const entityId = profileCheck.rows[0].id;
        if (Number.isFinite(newSize) && Number.isFinite(oldSize) && newSize !== oldSize) {
          const today = mealEligibilityService.parseSessionToday();
          const block = await tx.query(
            `SELECT id FROM client_subscriptions
             WHERE client_id=$1 AND entity_type='professional' AND entity_id=$2 AND is_active=true
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

      if (profileExists) {
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
        const values = [name, company_name, corporate_location_id, city, state, normalizedMealTime, Number(mealSizeInput), clientId];
        const updateResult = await tx.query(updateQuery, values);
        result = updateResult.rows[0];
      } else {
        const insertQuery = `
          INSERT INTO professional_profiles (
            client_id, name, company_name, corporate_location_id, city, state, lunch_time, meal_size_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *;
        `;
        const values = [clientId, name, company_name, corporate_location_id, city, state, normalizedMealTime, Number(mealSizeInput)];
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
      message: profileExists ? 'Professional profile updated successfully' : 'Professional profile created successfully',
      data: withProfessionalAliases(result),
    });
  } catch (error) {
    if (error instanceof AppError) return next(error);
    console.error('saveProfessionalProfile', error);
    return next(new AppError('Error saving professional profile.', 500));
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
      data: withProfessionalAliases(result.rows[0]),
    });
  } catch (error) {
    if (error instanceof AppError) return next(error);
    console.error('getProfessionalProfile', error);
    return next(new AppError('Error fetching professional profile.', 500));
  }
};

/**
 * @desc    Delete professional profile
 * @route   DELETE /api/client/professional/profile
 * @access  Private (Client only)
 */
exports.deleteProfessionalProfile = async (req, res, next) => {
  try {
    const clientId = req.user.id;

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
    if (error instanceof AppError) return next(error);
    console.error('deleteProfessionalProfile', error);
    return next(new AppError('Error deleting professional profile.', 500));
  }
};
