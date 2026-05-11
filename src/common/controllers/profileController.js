const db = require('../database');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

const getMyProfile = catchAsync(async (req, res, next) => {
  const clientId = req.user.role === 'admin' ? req.query.clientId : req.user.id;

  if (!clientId) {
    return next(new AppError('clientId is required for admin requests.', 400));
  }

  const clientResult = await db.query(
    `
      SELECT id, username, phone_number, last_login
      FROM clients
      WHERE id = $1
    `,
    [clientId]
  );

  if (clientResult.rows.length === 0) {
    return next(new AppError('User not found.', 404));
  }

  if (req.user.role === 'admin') {
    await db.query(
      `INSERT INTO admin_profile_access_logs (admin_id, target_client_id, accessed_at, source)
       VALUES ($1, $2, NOW(), $3)`,
      [req.user.id, clientId, 'common_profile_controller']
    );
  }

  const parentResult = await db.query(
    `
      SELECT id, client_id, name, created_at, updated_at
      FROM parent_profiles
      WHERE client_id = $1
    `,
    [clientId]
  );

  const childrenResult = await db.query(
    `
      SELECT COUNT(*) AS count
      FROM children
      WHERE parent_id = $1
    `,
    [clientId]
  );

  const professionalResult = await db.query(
    `
      SELECT id, client_id, name, company_name, corporate_location_id, city, state, lunch_time, lunch_time AS meal_timing, meal_size_id, created_at, updated_at
      FROM professional_profiles
      WHERE client_id = $1
    `,
    [clientId]
  );

  const teacherResult = await db.query(
    `
      SELECT id, client_id, name, school_college_name, city, state, location, status, meal_time, meal_time AS meal_timing, meal_size_id, created_at, updated_at
      FROM teacher_profiles
      WHERE client_id = $1
    `,
    [clientId]
  );

  return res.status(200).json({
    success: true,
    data: {
      user: clientResult.rows[0],
      profiles: {
        isParent: parentResult.rows.length > 0,
        parentProfile: parentResult.rows[0] || null,
        childrenCount: parseInt(childrenResult.rows[0].count, 10),
        isProfessional: professionalResult.rows.length > 0,
        professionalProfile: professionalResult.rows[0] || null,
        isTeacher: teacherResult.rows.length > 0,
        teacherProfile: teacherResult.rows[0] || null
      }
    }
  });
});

module.exports = {
  getMyProfile
};
