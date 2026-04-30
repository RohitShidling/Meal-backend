const db = require('../../common/database');
const catchAsync = require('../../common/utils/catchAsync');

const getAllStates = catchAsync(async (req, res) => {
  const result = await db.query('SELECT * FROM states ORDER BY name ASC');
  return res.status(200).json({ success: true, data: result.rows });
});

const getAllCities = catchAsync(async (req, res) => {
  const result = await db.query(`
    SELECT c.*, s.name AS state_name 
    FROM cities c 
    JOIN states s ON s.id = c.state_id 
    ORDER BY c.name ASC
  `);
  return res.status(200).json({ success: true, data: result.rows });
});

const getAllCompanies = catchAsync(async (req, res) => {
  const result = await db.query(`
    SELECT comp.*, c.name AS city_name 
    FROM companies comp 
    LEFT JOIN cities c ON c.id = comp.city_id 
    ORDER BY comp.name ASC
  `);
  return res.status(200).json({ success: true, data: result.rows });
});

const getAllMealSizes = catchAsync(async (req, res) => {
  const result = await db.query('SELECT * FROM meal_sizes ORDER BY sort_order ASC');
  return res.status(200).json({ success: true, data: { mealSizes: result.rows } });
});

const getAllStandards = catchAsync(async (req, res) => {
  const result = await db.query('SELECT * FROM standards ORDER BY numeric_value ASC');
  return res.status(200).json({ success: true, data: { standards: result.rows } });
});

module.exports = {
  getAllStates,
  getAllCities,
  getAllCompanies,
  getAllMealSizes,
  getAllStandards,
};
