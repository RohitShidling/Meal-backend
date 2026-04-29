const db = require('../../common/database');
const catchAsync = require('../../common/utils/catchAsync');
const AppError = require('../../common/utils/AppError');

const createState = catchAsync(async (req, res, next) => {
  const name = req.body.name.trim();
  const existing = await db.query('SELECT id FROM states WHERE LOWER(name) = LOWER($1)', [name]);
  if (existing.rows.length > 0) return next(new AppError('State already exists.', 409));

  const result = await db.query(
    'INSERT INTO states (name, created_by) VALUES ($1, $2) RETURNING id, name, is_active, created_by, created_at, updated_at',
    [name, req.user.id]
  );
  return res.status(201).json({ success: true, message: 'State created successfully.', data: result.rows[0] });
});

const updateState = catchAsync(async (req, res, next) => {
  const stateId = Number(req.params.stateId);
  const { name, isActive } = req.body;
  if (name) {
    const duplicate = await db.query('SELECT id FROM states WHERE LOWER(name) = LOWER($1) AND id <> $2', [name.trim(), stateId]);
    if (duplicate.rows.length > 0) return next(new AppError('State already exists.', 409));
  }
  const result = await db.query(
    `UPDATE states SET name = COALESCE($1, name), is_active = COALESCE($2, is_active), updated_at = NOW() WHERE id = $3 RETURNING id, name, is_active, created_by, created_at, updated_at`,
    [name ? name.trim() : null, isActive ?? null, stateId]
  );
  if (result.rows.length === 0) return next(new AppError('State not found.', 404));
  return res.status(200).json({ success: true, message: 'State updated successfully.', data: result.rows[0] });
});

const deleteState = catchAsync(async (req, res, next) => {
  const stateId = Number(req.params.stateId);
  const result = await db.query('DELETE FROM states WHERE id = $1 RETURNING id, name', [stateId]);
  if (result.rows.length === 0) return next(new AppError('State not found.', 404));
  return res.status(200).json({ success: true, message: 'State deleted successfully.', data: result.rows[0] });
});

const createCity = catchAsync(async (req, res, next) => {
  const name = req.body.name.trim();
  const stateId = Number(req.body.stateId);
  const stateCheck = await db.query('SELECT id FROM states WHERE id = $1 AND is_active = true', [stateId]);
  if (stateCheck.rows.length === 0) return next(new AppError('State not found.', 404));
  const existing = await db.query('SELECT id FROM cities WHERE state_id = $1 AND LOWER(name) = LOWER($2)', [stateId, name]);
  if (existing.rows.length > 0) return next(new AppError('City already exists for this state.', 409));

  const result = await db.query(
    'INSERT INTO cities (state_id, name, created_by) VALUES ($1, $2, $3) RETURNING id, state_id, name, is_active, created_by, created_at, updated_at',
    [stateId, name, req.user.id]
  );
  return res.status(201).json({ success: true, message: 'City created successfully.', data: result.rows[0] });
});

const updateCity = catchAsync(async (req, res, next) => {
  const cityId = Number(req.params.cityId);
  const { name, stateId, isActive } = req.body;
  if (stateId !== undefined) {
    const stateCheck = await db.query('SELECT id FROM states WHERE id = $1', [Number(stateId)]);
    if (stateCheck.rows.length === 0) return next(new AppError('State not found.', 404));
  }
  if (name !== undefined) {
    const current = await db.query('SELECT state_id FROM cities WHERE id = $1', [cityId]);
    if (current.rows.length === 0) return next(new AppError('City not found.', 404));
    const effectiveStateId = stateId !== undefined ? Number(stateId) : current.rows[0].state_id;
    const duplicate = await db.query(
      'SELECT id FROM cities WHERE state_id = $1 AND LOWER(name) = LOWER($2) AND id <> $3',
      [effectiveStateId, name.trim(), cityId]
    );
    if (duplicate.rows.length > 0) return next(new AppError('City already exists for this state.', 409));
  }
  const result = await db.query(
    `UPDATE cities SET name = COALESCE($1, name), state_id = COALESCE($2, state_id), is_active = COALESCE($3, is_active), updated_at = NOW() WHERE id = $4 RETURNING id, state_id, name, is_active, created_by, created_at, updated_at`,
    [name ? name.trim() : null, stateId !== undefined ? Number(stateId) : null, isActive ?? null, cityId]
  );
  if (result.rows.length === 0) return next(new AppError('City not found.', 404));
  return res.status(200).json({ success: true, message: 'City updated successfully.', data: result.rows[0] });
});

const deleteCity = catchAsync(async (req, res, next) => {
  const cityId = Number(req.params.cityId);
  const result = await db.query('DELETE FROM cities WHERE id = $1 RETURNING id, name', [cityId]);
  if (result.rows.length === 0) return next(new AppError('City not found.', 404));
  return res.status(200).json({ success: true, message: 'City deleted successfully.', data: result.rows[0] });
});

const createCompany = catchAsync(async (req, res, next) => {
  const name = req.body.name.trim();
  const cityId = req.body.cityId !== undefined && req.body.cityId !== null ? Number(req.body.cityId) : null;
  if (cityId !== null) {
    const cityCheck = await db.query('SELECT id FROM cities WHERE id = $1 AND is_active = true', [cityId]);
    if (cityCheck.rows.length === 0) return next(new AppError('City not found.', 404));
  }
  const existing = await db.query('SELECT id FROM companies WHERE LOWER(name) = LOWER($1)', [name]);
  if (existing.rows.length > 0) return next(new AppError('Company already exists.', 409));
  const result = await db.query(
    'INSERT INTO companies (name, city_id, created_by) VALUES ($1, $2, $3) RETURNING id, name, city_id, is_active, created_by, created_at, updated_at',
    [name, cityId, req.user.id]
  );
  return res.status(201).json({ success: true, message: 'Company created successfully.', data: result.rows[0] });
});

const updateCompany = catchAsync(async (req, res, next) => {
  const companyId = Number(req.params.companyId);
  const { name, cityId, isActive } = req.body;
  if (cityId !== undefined && cityId !== null) {
    const cityCheck = await db.query('SELECT id FROM cities WHERE id = $1', [Number(cityId)]);
    if (cityCheck.rows.length === 0) return next(new AppError('City not found.', 404));
  }
  if (name !== undefined) {
    const duplicate = await db.query('SELECT id FROM companies WHERE LOWER(name) = LOWER($1) AND id <> $2', [name.trim(), companyId]);
    if (duplicate.rows.length > 0) return next(new AppError('Company already exists.', 409));
  }
  const result = await db.query(
    `UPDATE companies SET name = COALESCE($1, name), city_id = CASE WHEN $2::int = -1 THEN NULL ELSE COALESCE($2, city_id) END, is_active = COALESCE($3, is_active), updated_at = NOW() WHERE id = $4 RETURNING id, name, city_id, is_active, created_by, created_at, updated_at`,
    [name ? name.trim() : null, cityId === null ? -1 : (cityId !== undefined ? Number(cityId) : null), isActive ?? null, companyId]
  );
  if (result.rows.length === 0) return next(new AppError('Company not found.', 404));
  return res.status(200).json({ success: true, message: 'Company updated successfully.', data: result.rows[0] });
});

const deleteCompany = catchAsync(async (req, res, next) => {
  const companyId = Number(req.params.companyId);
  const result = await db.query('DELETE FROM companies WHERE id = $1 RETURNING id, name', [companyId]);
  if (result.rows.length === 0) return next(new AppError('Company not found.', 404));
  return res.status(200).json({ success: true, message: 'Company deleted successfully.', data: result.rows[0] });
});

const createMealSize = catchAsync(async (req, res, next) => {
  const name = req.body.name.trim().toLowerCase();
  const displayName = req.body.displayName.trim();
  const sortOrder = req.body.sortOrder !== undefined ? Number(req.body.sortOrder) : 1;
  const existing = await db.query('SELECT id FROM meal_sizes WHERE LOWER(name) = LOWER($1)', [name]);
  if (existing.rows.length > 0) return next(new AppError('Meal size already exists.', 409));
  const result = await db.query(
    `INSERT INTO meal_sizes (name, display_name, sort_order, is_active) VALUES ($1, $2, $3, true) RETURNING id, name, display_name, sort_order, is_active, created_at`,
    [name, displayName, sortOrder]
  );
  return res.status(201).json({ success: true, message: 'Meal size created successfully.', data: result.rows[0] });
});

const updateMealSize = catchAsync(async (req, res, next) => {
  const mealSizeId = Number(req.params.mealSizeId);
  const { name, displayName, sortOrder, isActive } = req.body;
  if (name !== undefined) {
    const duplicate = await db.query('SELECT id FROM meal_sizes WHERE LOWER(name) = LOWER($1) AND id <> $2', [name.trim(), mealSizeId]);
    if (duplicate.rows.length > 0) return next(new AppError('Meal size already exists.', 409));
  }
  const result = await db.query(
    `UPDATE meal_sizes SET name = COALESCE($1, name), display_name = COALESCE($2, display_name), sort_order = COALESCE($3, sort_order), is_active = COALESCE($4, is_active) WHERE id = $5 RETURNING id, name, display_name, sort_order, is_active, created_at`,
    [name ? name.trim().toLowerCase() : null, displayName ? displayName.trim() : null, sortOrder !== undefined ? Number(sortOrder) : null, isActive ?? null, mealSizeId]
  );
  if (result.rows.length === 0) return next(new AppError('Meal size not found.', 404));
  return res.status(200).json({ success: true, message: 'Meal size updated successfully.', data: result.rows[0] });
});

const deleteMealSize = catchAsync(async (req, res, next) => {
  const mealSizeId = Number(req.params.mealSizeId);
  const result = await db.query('DELETE FROM meal_sizes WHERE id = $1 RETURNING id, name', [mealSizeId]);
  if (result.rows.length === 0) return next(new AppError('Meal size not found.', 404));
  return res.status(200).json({ success: true, message: 'Meal size deleted successfully.', data: result.rows[0] });
});

module.exports = {
  createState,
  updateState,
  deleteState,
  createCity,
  updateCity,
  deleteCity,
  createCompany,
  updateCompany,
  deleteCompany,
  createMealSize,
  updateMealSize,
  deleteMealSize
};
