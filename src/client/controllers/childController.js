const db = require('../../common/database');
const catchAsync = require('../../common/utils/catchAsync');
const AppError = require('../../common/utils/AppError');
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

/**
 * POST /api/client/children
 * Add 1 to 3 children for the authenticated client
 */
const addChildren = catchAsync(async (req, res, next) => {
  const { children } = req.body;
  const clientId = req.user.id; // This will be like 'P-1'

  // Check how many children the client already has
  const countResult = await db.query(
    'SELECT COUNT(*) FROM children WHERE parent_id = $1',
    [clientId]
  );
  
  const existingCount = parseInt(countResult.rows[0].count, 10);
  if (existingCount + children.length > 3) {
    return next(new AppError(`You already have ${existingCount} children registered. Total cannot exceed 3.`, 400));
  }

  const insertedChildren = [];

  // Start a transaction for batch insertion
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    for (const child of children) {
      const { name, rollNumber, schoolId, standardId, mealSizeId, mealTime } = child;

      // Verify school exists and is active
      const schoolCheck = await client.query(
        'SELECT id FROM schools WHERE id = $1 AND is_active = true AND is_deleted = false',
        [schoolId]
      );
      if (schoolCheck.rows.length === 0) {
        throw new Error(`School with ID ${schoolId} not found or inactive.`);
      }

      // Verify standard exists
      const standardCheck = await client.query('SELECT id FROM standards WHERE id = $1', [standardId]);
      if (standardCheck.rows.length === 0) {
        throw new Error(`Standard with ID ${standardId} not found.`);
      }

      // Verify meal size exists
      const mealSizeCheck = await client.query('SELECT id FROM meal_sizes WHERE id = $1', [mealSizeId]);
      if (mealSizeCheck.rows.length === 0) {
        throw new Error(`Meal size with ID ${mealSizeId} not found.`);
      }

      // Check for duplicate roll number in the same school
      const duplicateCheck = await client.query(
        'SELECT id FROM children WHERE LOWER(roll_number) = LOWER($1) AND school_id = $2',
        [rollNumber.trim(), schoolId]
      );
      if (duplicateCheck.rows.length > 0) {
        throw new Error(`A student with roll number "${rollNumber}" is already registered in this school.`);
      }

      const result = await client.query(
        `INSERT INTO children 
          (parent_id, name, roll_number, school_id, standard_id, meal_size_id, meal_time)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [clientId, name.trim(), rollNumber.trim(), schoolId, standardId, mealSizeId, normalizeMealTime(mealTime)]
      );

      insertedChildren.push(result.rows[0]);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    return next(new AppError(err.message || 'Failed to register children.', 400));
  } finally {
    client.release();
  }

  return res.status(201).json({
    success: true,
    message: 'Children registered successfully.',
    data: {
      children: insertedChildren,
    },
  });
});

/**
 * GET /api/client/children
 * Fetch all children for the authenticated client
 */
const getMyChildren = catchAsync(async (req, res, next) => {
  const clientId = req.user.id;

  const result = await db.query(
    `SELECT c.*, s.name as school_name, st.display_name as standard_name, ms.display_name as meal_size_name
     FROM children c
     JOIN schools s ON c.school_id = s.id
     JOIN standards st ON c.standard_id = st.id
     JOIN meal_sizes ms ON c.meal_size_id = ms.id
     WHERE c.parent_id = $1
     ORDER BY c.created_at ASC`,
    [clientId]
  );

  return res.status(200).json({
    success: true,
    message: 'Children fetched successfully.',
    data: {
      children: result.rows,
    },
  });
});

/**
 * PUT /api/client/children/:childId
 * Update specific child details
 */
const updateChild = catchAsync(async (req, res, next) => {
  const { childId } = req.params;
  const clientId = req.user.id;
  const { name, rollNumber, schoolId, standardId, mealSizeId, mealTime } = req.body;
  const normalizedMealTime = mealTime === undefined ? null : normalizeMealTime(mealTime);

  // Check if child exists and belongs to client
  const childCheck = await db.query('SELECT * FROM children WHERE id = $1 AND parent_id = $2', [childId, clientId]);
  if (childCheck.rows.length === 0) {
    return next(new AppError('Child not found or unauthorized.', 404));
  }

  // Update fields if provided
  const result = await db.query(
    `UPDATE children 
     SET name = COALESCE($1, name), 
         roll_number = COALESCE($2, roll_number), 
         school_id = COALESCE($3, school_id), 
         standard_id = COALESCE($4, standard_id), 
         meal_size_id = COALESCE($5, meal_size_id), 
         meal_time = COALESCE($6, meal_time),
         updated_at = NOW()
     WHERE id = $7 AND parent_id = $8
     RETURNING *`,
    [name, rollNumber, schoolId, standardId, mealSizeId, normalizedMealTime, childId, clientId]
  );

  return res.status(200).json({
    success: true,
    message: 'Child updated successfully.',
    data: result.rows[0],
  });
});

/**
 * DELETE /api/client/children/:childId
 * Delete a specific child
 */
const deleteChild = catchAsync(async (req, res, next) => {
  const { childId } = req.params;
  const clientId = req.user.id;

  const subCheck = await db.query(
    `SELECT id FROM client_subscriptions WHERE client_id = $1 AND entity_id = $2 AND entity_type = 'child' AND is_active = true`,
    [clientId, childId]
  );

  if (subCheck.rows.length > 0) {
    return next(new AppError('Cannot delete child profile. Please wait until the active subscription ends.', 400));
  }

  const result = await db.query(
    'DELETE FROM children WHERE id = $1 AND parent_id = $2 RETURNING *',
    [childId, clientId]
  );

  if (result.rows.length === 0) {
    return next(new AppError('Child not found or unauthorized.', 404));
  }

  return res.status(200).json({
    success: true,
    message: 'Child deleted successfully.',
    data: result.rows[0],
  });
});

module.exports = { addChildren, getMyChildren, updateChild, deleteChild };
