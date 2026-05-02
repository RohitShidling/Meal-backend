const { pool } = require('../../common/database');
const AppError = require('../../common/utils/AppError');

/**
 * @desc    Get all entities (Admin view, includes inactive)
 * @route   GET /api/admin/entities
 * @access  Private (Admin)
 */
exports.getAllEntities = async (req, res, next) => {
  try {
    const query = `
      SELECT id, name, is_active, created_at, updated_at
      FROM entities
      ORDER BY id ASC;
    `;
    const result = await pool.query(query);

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
 * @desc    Create a new entity
 * @route   POST /api/admin/entities
 * @access  Private (Admin)
 */
exports.createEntity = async (req, res, next) => {
  try {
    let { name, is_active } = req.body;
    const adminId = req.user.id;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return next(new AppError('Please provide a valid entity name.', 400));
    }
    
    // Default is_active to true if not provided
    if (is_active === undefined) is_active = true;

    // Convert name to lowercase and trim
    name = name.toLowerCase().trim();

    const checkQuery = 'SELECT id FROM entities WHERE name = $1';
    const checkResult = await pool.query(checkQuery, [name]);

    if (checkResult.rows.length > 0) {
      return next(new AppError(`Entity name '${name}' already exists.`, 400));
    }

    const insertQuery = `
      INSERT INTO entities (name, is_active, created_by, updated_by)
      VALUES ($1, $2, $3, $3)
      RETURNING id, name, is_active, created_at;
    `;
    const result = await pool.query(insertQuery, [name, is_active, adminId]);

    res.status(201).json({
      success: true,
      message: 'Entity created successfully.',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update an existing entity
 * @route   PUT /api/admin/entities/:id
 * @access  Private (Admin)
 */
exports.updateEntity = async (req, res, next) => {
  try {
    const { id } = req.params;
    let { name, is_active } = req.body;
    const adminId = req.user.id;

    const checkExistQuery = 'SELECT * FROM entities WHERE id = $1';
    const checkExistResult = await pool.query(checkExistQuery, [id]);

    if (checkExistResult.rows.length === 0) {
      return next(new AppError('Entity not found.', 404));
    }

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim() === '') {
        return next(new AppError('Please provide a valid entity name.', 400));
      }
      name = name.toLowerCase().trim();

      if (name !== checkExistResult.rows[0].name) {
        const checkNameQuery = 'SELECT id FROM entities WHERE name = $1 AND id != $2';
        const checkNameResult = await pool.query(checkNameQuery, [name, id]);

        if (checkNameResult.rows.length > 0) {
          return next(new AppError(`Entity name '${name}' already exists.`, 400));
        }
      }
    }

    const updateQuery = `
      UPDATE entities
      SET 
        name = COALESCE($1, name),
        is_active = COALESCE($2, is_active),
        updated_by = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING id, name, is_active, updated_at;
    `;
    
    const result = await pool.query(updateQuery, [
      name, 
      is_active, 
      adminId, 
      id
    ]);

    res.status(200).json({
      success: true,
      message: 'Entity updated successfully.',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete an entity
 * @route   DELETE /api/admin/entities/:id
 * @access  Private (Admin)
 */
exports.deleteEntity = async (req, res, next) => {
  try {
    const { id } = req.params;

    const check = await pool.query('SELECT id FROM entities WHERE id=$1', [id]);
    if (check.rows.length === 0) return next(new AppError('Entity not found.', 404));

    // Check if any homepage uses this entity
    const checkHomepage = await pool.query('SELECT id FROM homepages WHERE entity_id=$1', [id]);
    if (checkHomepage.rows.length > 0) {
        return next(new AppError('Cannot delete entity because it is used in one or more homepages.', 400));
    }

    await pool.query('DELETE FROM entities WHERE id=$1', [id]);

    res.status(200).json({
      success: true,
      message: 'Entity deleted successfully.',
      data: { id }
    });
  } catch (error) {
    next(error);
  }
};
