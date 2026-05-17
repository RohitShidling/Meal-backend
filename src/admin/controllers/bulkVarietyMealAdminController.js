const { pool } = require('../../common/database');
const cloudinary = require('cloudinary').v2;
const catchAsync = require('../../common/utils/catchAsync');
const AppError = require('../../common/utils/AppError');

const isAllowedImageUrl = (urlValue) => {
  try {
    const u = new URL(String(urlValue || '').trim());
    if (!/^https?:$/.test(u.protocol)) return false;
    return /(^|\.)cloudinary\.com$/i.test(u.hostname);
  } catch (_) {
    return false;
  }
};

exports.listVarietyMeals = catchAsync(async (req, res) => {
  const result = await pool.query(
    `SELECT m.id, m.name, m.image_url, m.price_per_meal, m.min_order_quantity, m.is_active, m.sort_order,
            m.category_id, c.name AS category_name, m.created_at, m.updated_at
     FROM bulk_variety_meals m
     LEFT JOIN bulk_variety_categories c ON c.id = m.category_id
     ORDER BY m.sort_order ASC, m.created_at DESC`
  );
  res.status(200).json({
    success: true,
    count: result.rowCount,
    data: result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      image_url: row.image_url,
      price_per_meal: Number(row.price_per_meal),
      min_order_quantity: Number(row.min_order_quantity ?? 1),
      is_active: row.is_active,
      sort_order: row.sort_order,
      category_id: row.category_id,
      category_name: row.category_name,
    })),
  });
});

exports.createVarietyMeal = catchAsync(async (req, res) => {
  const { name, category_id, price_per_meal, min_order_quantity, is_active, sort_order } =
    req.validatedVarietyMeal;
  const image_url = req.file ? req.file.path : null;
  const image_public_id = req.file ? req.file.filename : null;

  if (!image_url || !isAllowedImageUrl(image_url)) {
    throw new AppError('Meal image is required.', 400);
  }
  const cat = await pool.query(`SELECT id FROM bulk_variety_categories WHERE id = $1`, [category_id]);
  if (cat.rows.length === 0) {
    throw new AppError('Category not found.', 400);
  }
  const result = await pool.query(
    `INSERT INTO bulk_variety_meals (name, category_id, image_url, image_public_id, price_per_meal, min_order_quantity, is_active, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, name, category_id, image_url, price_per_meal, min_order_quantity, is_active, sort_order`,
    [
      name,
      category_id,
      image_url,
      image_public_id,
      Number(price_per_meal),
      Number(min_order_quantity ?? 1),
      is_active !== false,
      sort_order ?? 0,
    ]
  );

  res.status(201).json({
    success: true,
    message: 'Bulk variety meal created.',
    data: {
      ...result.rows[0],
      price_per_meal: Number(result.rows[0].price_per_meal),
    },
  });
});

exports.updateVarietyMeal = catchAsync(async (req, res) => {
  const id = req.params.id;
  const payload = req.validatedVarietyMeal || {};
  const { name, category_id, price_per_meal, min_order_quantity, is_active, sort_order } = payload;

  if (category_id !== undefined) {
    const cat = await pool.query(`SELECT id FROM bulk_variety_categories WHERE id = $1`, [category_id]);
    if (cat.rows.length === 0) {
      throw new AppError('Category not found.', 400);
    }
  }

  const current = await pool.query(
    `SELECT id, image_url, image_public_id FROM bulk_variety_meals WHERE id = $1`,
    [id]
  );
  if (current.rows.length === 0) {
    throw new AppError('Bulk variety meal not found.', 404);
  }

  let image_url = current.rows[0].image_url;
  let image_public_id = current.rows[0].image_public_id;

  if (req.file) {
    if (!isAllowedImageUrl(req.file.path)) {
      throw new AppError('Invalid meal image URL source.', 400);
    }
    if (image_public_id) {
      try {
        await cloudinary.uploader.destroy(image_public_id);
      } catch (_) {
        /* ignore cloudinary cleanup errors */
      }
    }
    image_url = req.file.path;
    image_public_id = req.file.filename;
  }

  const result = await pool.query(
    `UPDATE bulk_variety_meals
     SET name = COALESCE($1, name),
         category_id = COALESCE($2, category_id),
         image_url = $3,
         image_public_id = $4,
         price_per_meal = COALESCE($5, price_per_meal),
         min_order_quantity = COALESCE($6, min_order_quantity),
         is_active = COALESCE($7, is_active),
         sort_order = COALESCE($8, sort_order),
         updated_at = NOW()
     WHERE id = $9
     RETURNING id, name, category_id, image_url, price_per_meal, min_order_quantity, is_active, sort_order`,
    [
      name !== undefined ? String(name).trim() : null,
      category_id !== undefined ? category_id : null,
      image_url,
      image_public_id,
      price_per_meal !== undefined ? Number(price_per_meal) : null,
      min_order_quantity !== undefined ? Number(min_order_quantity) : null,
      is_active !== undefined ? !(is_active === false || is_active === 'false') : null,
      sort_order !== undefined && Number.isFinite(Number(sort_order)) ? Number(sort_order) : null,
      id,
    ]
  );

  res.status(200).json({
    success: true,
    message: 'Bulk variety meal updated.',
    data: {
      ...result.rows[0],
      price_per_meal: Number(result.rows[0].price_per_meal),
    },
  });
});

exports.deleteVarietyMeal = catchAsync(async (req, res) => {
  const id = req.params.id;
  const current = await pool.query(
    `SELECT id, image_public_id FROM bulk_variety_meals WHERE id = $1`,
    [id]
  );
  if (current.rows.length === 0) {
    throw new AppError('Bulk variety meal not found.', 404);
  }

  const inUse = await pool.query(
    `SELECT 1 FROM bulk_order_items WHERE bulk_variety_meal_id = $1 LIMIT 1`,
    [id]
  );
  if (inUse.rows.length > 0) {
    throw new AppError('Cannot delete: this meal is used in existing bulk orders.', 400);
  }

  await pool.query(`DELETE FROM bulk_variety_meals WHERE id = $1`, [id]);

  if (current.rows[0].image_public_id) {
    try {
      await cloudinary.uploader.destroy(current.rows[0].image_public_id);
    } catch (_) {
      /* ignore */
    }
  }

  res.status(200).json({ success: true, message: 'Bulk variety meal deleted.' });
});
