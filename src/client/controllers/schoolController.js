const db = require('../../common/database');
const catchAsync = require('../../common/utils/catchAsync');

/**
 * GET /api/client/schools
 * List all active schools for client
 */
const getActiveSchools = catchAsync(async (req, res, next) => {
  const search = req.query.search || '';
  
  const queryText = `
    SELECT id, name, address, city, state, pincode, country 
    FROM schools 
    WHERE is_active = true 
      AND is_deleted = false 
      AND ($1 = '' OR LOWER(name) LIKE LOWER($2) OR LOWER(city) LIKE LOWER($2))
    ORDER BY name ASC
  `;
  
  const result = await db.query(queryText, [search, `%${search}%`]);

  return res.status(200).json({
    success: true,
    message: 'Active schools fetched successfully.',
    data: {
      schools: result.rows,
    },
  });
});

module.exports = { getActiveSchools };
