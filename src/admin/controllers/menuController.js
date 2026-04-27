const db = require('../../common/database');
const cloudinary = require('cloudinary').v2;

// @desc    Upload new daily menu
// @route   POST /api/admin/menu/upload
exports.uploadMenu = async (req, res, next) => {
  try {
    const { school_id, items, menu_date } = req.body;
    const image_url = req.file ? req.file.path : null;
    const image_public_id = req.file ? req.file.filename : null; // Multer-storage-cloudinary uses .filename for public_id

    if (!image_url) {
      return res.status(400).json({ success: false, message: 'Menu image is required' });
    }

    const query = `
      INSERT INTO daily_menus (school_id, image_url, image_public_id, items, menu_date, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const values = [school_id || null, image_url, image_public_id, items, menu_date || new Date(), req.user.id];
    const result = await db.query(query, values);

    res.status(201).json({
      success: true,
      message: 'Menu uploaded successfully',
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update existing menu
// @route   PUT /api/admin/menu/:id
exports.updateMenu = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { items, menu_date, is_active } = req.body;
    const image_url = req.file ? req.file.path : null;
    const image_public_id = req.file ? req.file.filename : null;

    // Get current menu to find old public_id
    const currentMenu = await db.query('SELECT image_public_id FROM daily_menus WHERE id = $1', [id]);
    
    if (currentMenu.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Menu not found' });
    }

    // If new image is uploaded, delete the OLD one from Cloudinary
    if (image_url && currentMenu.rows[0].image_public_id) {
      await cloudinary.uploader.destroy(currentMenu.rows[0].image_public_id);
    }

    let query = 'UPDATE daily_menus SET items = $1, menu_date = $2, is_active = $3, updated_at = CURRENT_TIMESTAMP';
    let values = [items, menu_date, is_active];

    if (image_url) {
      query += ', image_url = $4, image_public_id = $5 WHERE id = $6 RETURNING *';
      values.push(image_url, image_public_id, id);
    } else {
      query += ' WHERE id = $4 RETURNING *';
      values.push(id);
    }

    const result = await db.query(query, values);

    res.status(200).json({
      success: true,
      message: 'Menu updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete menu
// @route   DELETE /api/admin/menu/:id
exports.deleteMenu = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Get public_id first to delete from Cloudinary
    const currentMenu = await db.query('SELECT image_public_id FROM daily_menus WHERE id = $1', [id]);
    
    if (currentMenu.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Menu not found' });
    }

    // Delete from Cloudinary
    if (currentMenu.rows[0].image_public_id) {
      await cloudinary.uploader.destroy(currentMenu.rows[0].image_public_id);
    }

    // Delete from Database
    await db.query('DELETE FROM daily_menus WHERE id = $1', [id]);

    res.status(200).json({
      success: true,
      message: 'Menu deleted successfully (Cloudinary and DB)'
    });
  } catch (error) {
    next(error);
  }
};
