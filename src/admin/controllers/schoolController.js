const db = require('../../common/database');
const catchAsync = require('../../common/utils/catchAsync');
const AppError = require('../../common/utils/AppError');

/**
 * POST /api/admin/schools
 * Add a new school (Admin only)
 */
const addSchool = catchAsync(async (req, res, next) => {
  const {
    name,
    address,
    city,
    state,
    pincode,
    country,
  } = req.body;

  // Check for duplicate school name
  const existing = await db.query(
    'SELECT id FROM schools WHERE LOWER(name) = LOWER($1)',
    [name.trim()]
  );
  if (existing.rows.length > 0) {
    return next(new AppError(`A school with the name "${name}" already exists.`, 409));
  }

  const result = await db.query(
    `INSERT INTO schools
      (name, address, city, state, pincode, country, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      name.trim(),
      address.trim(),
      city.trim(),
      state.trim(),
      pincode.trim(),
      country ? country.trim() : 'India',
      req.user.id,
    ]
  );

  return res.status(201).json({
    success: true,
    message: 'School added successfully.',
    data: {
      school: result.rows[0],
    },
  });
});

/**
 * PUT /api/admin/schools/:id
 * Edit an existing school (Admin only)
 */
const editSchool = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  // Verify school exists
  const schoolCheck = await db.query('SELECT id FROM schools WHERE id = $1 AND is_deleted = false', [id]);
  if (schoolCheck.rows.length === 0) {
    return next(new AppError('School not found.', 404));
  }

  const {
    name,
    address,
    city,
    state,
    pincode,
    country,
    is_active,
  } = req.body;

  // Check if updated name conflicts with another school
  if (name) {
    const nameConflict = await db.query(
      'SELECT id FROM schools WHERE LOWER(name) = LOWER($1) AND id != $2 AND is_deleted = false',
      [name.trim(), id]
    );
    if (nameConflict.rows.length > 0) {
      return next(new AppError(`Another school with the name "${name}" already exists.`, 409));
    }
  }

  const result = await db.query(
    `UPDATE schools SET
      name            = COALESCE($1, name),
      address         = COALESCE($2, address),
      city            = COALESCE($3, city),
      state           = COALESCE($4, state),
      pincode         = COALESCE($5, pincode),
      country         = COALESCE($6, country),
      is_active       = COALESCE($7, is_active),
      updated_at      = NOW(),
      updated_by      = $8
    WHERE id = $9 AND is_deleted = false
    RETURNING *`,
    [
      name ? name.trim() : null,
      address ? address.trim() : null,
      city ? city.trim() : null,
      state ? state.trim() : null,
      pincode ? pincode.trim() : null,
      country ? country.trim() : null,
      is_active !== undefined ? is_active : null,
      req.user.id,
      id,
    ]
  );

  return res.status(200).json({
    success: true,
    message: 'School updated successfully.',
    data: {
      school: result.rows[0],
    },
  });
});

/**
 * GET /api/admin/schools
 * List all schools with optional pagination & search (Admin only)
 */
const getAllSchools = catchAsync(async (req, res, next) => {
  const page   = parseInt(req.query.page, 10)   || 1;
  const limit  = parseInt(req.query.limit, 10)  || 10;
  const search = req.query.search || '';
  const offset = (page - 1) * limit;

  const countResult = await db.query(
    `SELECT COUNT(*) FROM schools
     WHERE is_deleted = false
       AND ($1 = '' OR LOWER(name) LIKE LOWER($2) OR LOWER(city) LIKE LOWER($2))`,
    [search, `%${search}%`]
  );

  const totalItems = parseInt(countResult.rows[0].count, 10);
  const totalPages = Math.ceil(totalItems / limit);

  const result = await db.query(
    `SELECT * FROM schools
     WHERE is_deleted = false
       AND ($1 = '' OR LOWER(name) LIKE LOWER($2) OR LOWER(city) LIKE LOWER($2))
     ORDER BY created_at DESC
     LIMIT $3 OFFSET $4`,
    [search, `%${search}%`, limit, offset]
  );

  return res.status(200).json({
    success: true,
    message: 'Schools fetched successfully.',
    data: {
      schools: result.rows,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
      },
    },
  });
});

/**
 * GET /api/admin/schools/:id
 * Get a single school by ID (Admin only)
 */
const getSchoolById = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const result = await db.query(
    'SELECT * FROM schools WHERE id = $1 AND is_deleted = false',
    [id]
  );

  if (result.rows.length === 0) {
    return next(new AppError('School not found.', 404));
  }

  return res.status(200).json({
    success: true,
    message: 'School fetched successfully.',
    data: {
      school: result.rows[0],
    },
  });
});

/**
 * DELETE /api/admin/schools/:id
 * Soft-delete a school (Admin only)
 */
const deleteSchool = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const schoolCheck = await db.query(
    'SELECT id FROM schools WHERE id = $1 AND is_deleted = false',
    [id]
  );
  if (schoolCheck.rows.length === 0) {
    return next(new AppError('School not found.', 404));
  }

  await db.query(
    `UPDATE schools SET is_deleted = true, updated_at = NOW(), updated_by = $1 WHERE id = $2`,
    [req.user.id, id]
  );

  return res.status(200).json({
    success: true,
    message: 'School deleted successfully.',
  });
});

module.exports = { addSchool, editSchool, getAllSchools, getSchoolById, deleteSchool };
