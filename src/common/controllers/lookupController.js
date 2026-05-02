const db = require('../database');
const catchAsync = require('../utils/catchAsync');

const getStates = catchAsync(async (req, res) => {
  const result = await db.query(
    'SELECT id, name, is_active, created_at, updated_at FROM states WHERE is_active = true ORDER BY name ASC'
  );

  return res.status(200).json({
    success: true,
    message: 'States fetched successfully.',
    count: result.rows.length,
    data: result.rows
  });
});

const getCities = catchAsync(async (req, res) => {
  const stateId = req.query.stateId ? Number(req.query.stateId) : null;
  const result = await db.query(
    `
      SELECT c.id, c.state_id, s.name AS state_name, c.name, c.is_active, c.created_at, c.updated_at
      FROM cities c
      JOIN states s ON s.id = c.state_id
      WHERE c.is_active = true AND ($1::int IS NULL OR c.state_id = $1)
      ORDER BY c.name ASC
    `,
    [stateId]
  );

  return res.status(200).json({
    success: true,
    message: 'Cities fetched successfully.',
    count: result.rows.length,
    data: result.rows
  });
});

const getCompanies = catchAsync(async (req, res) => {
  const cityId = req.query.cityId ? Number(req.query.cityId) : null;
  const result = await db.query(
    `
      SELECT comp.id, comp.name, comp.city_id, c.name AS city_name, comp.is_active, comp.created_at, comp.updated_at
      FROM companies comp
      LEFT JOIN cities c ON c.id = comp.city_id
      WHERE comp.is_active = true AND ($1::int IS NULL OR comp.city_id = $1)
      ORDER BY comp.name ASC
    `,
    [cityId]
  );

  return res.status(200).json({
    success: true,
    message: 'Companies fetched successfully.',
    count: result.rows.length,
    data: result.rows
  });
});

const getMealSizes = catchAsync(async (req, res) => {
  const result = await db.query(
    'SELECT id, name, display_name, sort_order FROM meal_sizes WHERE is_active = true ORDER BY sort_order ASC'
  );

  return res.status(200).json({
    success: true,
    message: 'Meal sizes fetched successfully.',
    count: result.rows.length,
    data: {
      mealSizes: result.rows,
    },
  });
});

const getStandards = catchAsync(async (req, res) => {
  const result = await db.query(
    'SELECT id, name, display_name, numeric_value FROM standards WHERE is_active = true ORDER BY numeric_value ASC'
  );

  return res.status(200).json({
    success: true,
    message: 'Standards fetched successfully.',
    count: result.rows.length,
    data: {
      standards: result.rows,
    },
  });
});

module.exports = {
  getStates,
  getCities,
  getCompanies,
  getMealSizes,
  getStandards
};
