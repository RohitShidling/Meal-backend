const { pool } = require('../../common/database');
const AppError = require('../../common/utils/AppError');

/**
 * @desc    Create a new homepage entry
 * @route   POST /api/admin/homepage
 * @access  Private (Admin)
 */
exports.createHomepage = async (req, res, next) => {
  try {
    const { entity_id, name, description, display_order } = req.body;
    const adminId = req.user.id;

    if (!entity_id || !name || !description || display_order === undefined) {
      return next(new AppError('Please provide entity_id, name, description, and display_order.', 400));
    }

    // Validation: Check if entity exists
    const checkEntity = await pool.query('SELECT id FROM entities WHERE id = $1', [entity_id]);
    if (checkEntity.rows.length === 0) {
      return next(new AppError('Invalid entity_id.', 400));
    }

    // Validation: Check if display_order already exists for this entity
    const checkQuery = 'SELECT id FROM homepages WHERE entity_id = $1 AND display_order = $2';
    const checkResult = await pool.query(checkQuery, [entity_id, display_order]);

    if (checkResult.rows.length > 0) {
      return next(new AppError(`Display order ${display_order} already exists for this entity. Please choose a different order.`, 400));
    }

    const insertQuery = `
      INSERT INTO homepages (entity_id, name, description, display_order, created_by, updated_by)
      VALUES ($1, $2, $3, $4, $5, $5)
      RETURNING id, entity_id, name, description, display_order, is_active, created_at;
    `;
    const result = await pool.query(insertQuery, [entity_id, name, description, display_order, adminId]);

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
    const { entity_id, name, description, display_order, is_active } = req.body;
    const adminId = req.user.id;

    // Check if the entry exists
    const checkExistQuery = 'SELECT * FROM homepages WHERE id = $1';
    const checkExistResult = await pool.query(checkExistQuery, [id]);

    if (checkExistResult.rows.length === 0) {
      return next(new AppError('Homepage entry not found.', 404));
    }

    const currentEntry = checkExistResult.rows[0];
    const targetEntityId = entity_id || currentEntry.entity_id;

    if (entity_id && entity_id !== currentEntry.entity_id) {
      const checkEntity = await pool.query('SELECT id FROM entities WHERE id = $1', [entity_id]);
      if (checkEntity.rows.length === 0) {
        return next(new AppError('Invalid entity_id.', 400));
      }
    }

    // Validation: Check if display_order already exists for this entity (if changing order or entity)
    if ((display_order !== undefined && display_order !== currentEntry.display_order) || 
        (entity_id !== undefined && entity_id !== currentEntry.entity_id)) {
      
      const orderToCheck = display_order !== undefined ? display_order : currentEntry.display_order;
      
      const checkOrderQuery = 'SELECT id FROM homepages WHERE entity_id = $1 AND display_order = $2 AND id != $3';
      const checkOrderResult = await pool.query(checkOrderQuery, [targetEntityId, orderToCheck, id]);

      if (checkOrderResult.rows.length > 0) {
        return next(new AppError(`Display order ${orderToCheck} already exists for this entity. Please choose a different order.`, 400));
      }
    }

    const updateQuery = `
      UPDATE homepages
      SET 
        entity_id = COALESCE($1, entity_id),
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        display_order = COALESCE($4, display_order),
        is_active = COALESCE($5, is_active),
        updated_by = $6,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING id, entity_id, name, description, display_order, is_active, updated_at;
    `;
    
    const result = await pool.query(updateQuery, [
      entity_id,
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

/**
 * @desc    Get all homepage entries (active and inactive)
 * @route   GET /api/admin/homepage
 * @access  Private (Admin)
 */
exports.getHomepages = async (req, res, next) => {
  try {
    const { entity_id } = req.query;

    let query = `
      SELECT h.id, h.entity_id, e.name as entity_name, h.name, h.description, h.display_order, h.is_active, h.created_at, h.updated_at
      FROM homepages h
      LEFT JOIN entities e ON h.entity_id = e.id
    `;
    const params = [];

    if (entity_id) {
      query += ` WHERE h.entity_id = $1`;
      params.push(entity_id);
    }

    query += ` ORDER BY h.entity_id, h.display_order ASC;`;

    const result = await pool.query(query, params);

    res.status(200).json({
      success: true,
      count: result.rowCount,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a homepage entry
 * @route   DELETE /api/admin/homepage/:id
 * @access  Private (Admin)
 */
exports.deleteHomepage = async (req, res, next) => {
  try {
    const { id } = req.params;

    const check = await pool.query('SELECT id FROM homepages WHERE id=$1', [id]);
    if (check.rows.length === 0) return next(new AppError('Homepage entry not found.', 404));

    await pool.query('DELETE FROM homepages WHERE id=$1', [id]);

    res.status(200).json({
      success: true,
      message: 'Homepage entry deleted successfully.',
      data: { id }
    });
  } catch (error) {
    next(error);
  }
};

