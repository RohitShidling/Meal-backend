const { pool } = require('../../common/database');
const AppError = require('../../common/utils/AppError');

/**
 * @desc    Create a new homepage entry
 * @route   POST /api/admin/homepage
 * @access  Private (Admin)
 */
exports.createHomepage = async (req, res, next) => {
  try {
    const { name, description, display_order } = req.body;
    const adminId = req.user.id;

    if (!name || !description || display_order === undefined) {
      return next(new AppError('Please provide name, description, and display_order.', 400));
    }

    // Validation: Check if display_order already exists
    const checkQuery = 'SELECT id FROM homepages WHERE display_order = $1';
    const checkResult = await pool.query(checkQuery, [display_order]);

    if (checkResult.rows.length > 0) {
      return next(new AppError(`Display order ${display_order} already exists. Please choose a different order like ${display_order + 1}.`, 400));
    }

    const insertQuery = `
      INSERT INTO homepages (name, description, display_order, created_by, updated_by)
      VALUES ($1, $2, $3, $4, $4)
      RETURNING id, name, description, display_order, is_active, created_at;
    `;
    const result = await pool.query(insertQuery, [name, description, display_order, adminId]);

    res.status(201).json({
      success: true,
      message: 'Homepage entry created successfully.',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update an existing homepage entry
 * @route   PUT /api/admin/homepage/:id
 * @access  Private (Admin)
 */
exports.updateHomepage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, display_order, is_active } = req.body;
    const adminId = req.user.id;

    // Check if the entry exists
    const checkExistQuery = 'SELECT * FROM homepages WHERE id = $1';
    const checkExistResult = await pool.query(checkExistQuery, [id]);

    if (checkExistResult.rows.length === 0) {
      return next(new AppError('Homepage entry not found.', 404));
    }

    // Validation: Check if display_order already exists (if changing order)
    if (display_order !== undefined && display_order !== checkExistResult.rows[0].display_order) {
      const checkOrderQuery = 'SELECT id FROM homepages WHERE display_order = $1 AND id != $2';
      const checkOrderResult = await pool.query(checkOrderQuery, [display_order, id]);

      if (checkOrderResult.rows.length > 0) {
        return next(new AppError(`Display order ${display_order} already exists. Please choose a different order.`, 400));
      }
    }

    const updateQuery = `
      UPDATE homepages
      SET 
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        display_order = COALESCE($3, display_order),
        is_active = COALESCE($4, is_active),
        updated_by = $5,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING id, name, description, display_order, is_active, updated_at;
    `;
    
    const result = await pool.query(updateQuery, [
      name, 
      description, 
      display_order, 
      is_active, 
      adminId, 
      id
    ]);

    res.status(200).json({
      success: true,
      message: 'Homepage entry updated successfully.',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};
