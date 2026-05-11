const db = require('../../common/database');
const cloudinary = require('cloudinary').v2;

// @desc    Upload new daily menu
// @route   POST /api/admin/menu/upload
exports.uploadMenu = async (req, res, next) => {
  try {
    const { items, menu_date } = req.body;
    const image_url = req.file ? req.file.path : null;
    const image_public_id = req.file ? req.file.filename : null; // Multer-storage-cloudinary uses .filename for public_id

    if (!image_url) {
      return res.status(400).json({ success: false, message: 'Menu image is required' });
    }

    const query = `
      INSERT INTO daily_menus (image_url, image_public_id, items, menu_date, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const values = [image_url, image_public_id, items, menu_date || new Date(), req.admin ? req.admin.id : req.user.id];
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

// @desc    Upload multiple daily menus in bulk
// @route   POST /api/admin/menu/bulk-upload
exports.uploadBulkMenu = async (req, res, next) => {
  try {
    // req.body.menus should be a JSON string of array of menu objects
    let menus = [];
    if (req.body.menus) {
      try {
        menus = JSON.parse(req.body.menus);
      } catch (err) {
        return res.status(400).json({ success: false, message: 'Invalid JSON for menus' });
      }
    }

    if (!Array.isArray(menus) || menus.length === 0) {
      return res.status(400).json({ success: false, message: 'Please provide an array of menus' });
    }

    const files = req.files || [];
    
    if (files.length > 0 && files.length !== menus.length) {
      // If images are provided, there must be one image per menu, or we use one image for all, or some logic.
      // Let's assume the client sends one image per menu if they are uploading images.
      return res.status(400).json({ success: false, message: 'Number of images must match number of menus' });
    }

    const createdMenus = [];

    // Begin a transaction or just loop
    for (let i = 0; i < menus.length; i++) {
      const menu = menus[i];
      const items = menu.items;
      const menu_date = menu.menu_date || new Date();
      
      const image_url = files[i] ? files[i].path : (menu.image_url || null);
      const image_public_id = files[i] ? files[i].filename : (menu.image_public_id || null);

      if (!image_url) {
        return res.status(400).json({ success: false, message: `Menu image is required for menu at index ${i}` });
      }

      const query = `
        INSERT INTO daily_menus (image_url, image_public_id, items, menu_date, created_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      
      const values = [image_url, image_public_id, items, menu_date, req.admin ? req.admin.id : req.user.id];
      const result = await db.query(query, values);
      createdMenus.push(result.rows[0]);
    }

    res.status(201).json({
      success: true,
      message: `${createdMenus.length} menus uploaded successfully`,
      data: createdMenus
    });
  } catch (error) {
    next(error);
  }
};


// @desc    Update existing menu by date
// @route   PUT /api/admin/menu/:date
exports.updateMenu = async (req, res, next) => {
  try {
    let { date } = req.params;
    if (date === 'today') {
      date = new Date().toISOString().split('T')[0];
    }
    
    const { items, is_active, menu_date } = req.body;
    let normalizedMenuDate = menu_date;
    if (normalizedMenuDate === 'today') {
      normalizedMenuDate = new Date().toISOString().split('T')[0];
    }
    const image_url = req.file ? req.file.path : null;
    const image_public_id = req.file ? req.file.filename : null;

    // Get current menu to find old public_id
    const currentMenu = await db.query('SELECT id, image_public_id FROM daily_menus WHERE menu_date = $1', [date]);
    
    if (currentMenu.rows.length === 0) {
      return res.status(404).json({ success: false, message: `No menu found for date: ${date}` });
    }

    const menuId = currentMenu.rows[0].id;

    // If new image is uploaded, delete the OLD one from Cloudinary
    if (image_url && currentMenu.rows[0].image_public_id) {
      await cloudinary.uploader.destroy(currentMenu.rows[0].image_public_id);
    }

    let query = 'UPDATE daily_menus SET items = $1, is_active = $2, menu_date = COALESCE($3, menu_date), updated_at = CURRENT_TIMESTAMP';
    let values = [items, is_active, normalizedMenuDate || null];

    if (image_url) {
      query += ', image_url = $4, image_public_id = $5 WHERE id = $6 RETURNING *';
      values.push(image_url, image_public_id, menuId);
    } else {
      query += ' WHERE id = $4 RETURNING *';
      values.push(menuId);
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

// @desc    Delete menu by date
// @route   DELETE /api/admin/menu/:date
exports.deleteMenu = async (req, res, next) => {
  try {
    let { date } = req.params;
    if (date === 'today') {
      date = new Date().toISOString().split('T')[0];
    }
    
    // Get public_id first to delete from Cloudinary
    const currentMenu = await db.query('SELECT id, image_public_id FROM daily_menus WHERE menu_date = $1', [date]);
    
    if (currentMenu.rows.length === 0) {
      return res.status(404).json({ success: false, message: `No menu found for date: ${date}` });
    }

    const menuId = currentMenu.rows[0].id;

    // Delete from Cloudinary
    if (currentMenu.rows[0].image_public_id) {
      await cloudinary.uploader.destroy(currentMenu.rows[0].image_public_id);
    }

    // Delete from Database
    await db.query('DELETE FROM daily_menus WHERE id = $1', [menuId]);

    res.status(200).json({
      success: true,
      message: 'Menu deleted successfully (Cloudinary and DB)'
    });
  } catch (error) {
    next(error);
  }
};
