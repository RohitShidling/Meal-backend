const { pool } = require('../../common/database');
const catchAsync = require('../../common/utils/catchAsync');
const AppError = require('../../common/utils/AppError');
const { clientDisplayNameSql } = require('../../common/utils/clientDisplayName');

/** GET /api/admin/clients/:clientId — registered username for bulk/payment display */
exports.getClientById = catchAsync(async (req, res, next) => {
  const { clientId } = req.params;
  const result = await pool.query(
    `SELECT id, phone_number, username,
            ${clientDisplayNameSql('c')} AS display_name,
            created_at
     FROM clients c
     WHERE c.id = $1`,
    [clientId]
  );
  if (result.rows.length === 0) {
    return next(new AppError('Client not found.', 404));
  }
  res.status(200).json({ success: true, data: result.rows[0] });
});
