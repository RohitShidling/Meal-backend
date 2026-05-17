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
    `SELECT id, name, image_url, price_per_meal, min_order_quantity, is_active, sort_order, created_at, updated_at
     FROM bulk_variety_meals
     ORDER BY sort_order ASC, created_at DESC`
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
    })),
  });
});

exports.createVarietyMeal = catchAsync(async (req, res) => {
  const { name, price_per_meal, min_order_quantity, is_active, sort_order } = req.validatedVarietyMeal;
  const image_url = req.file ? req.file.path : null;
  const image_public_id = req.file ? req.file.filename : null;

  if (!image_url || !isAllowedImageUrl(image_url)) {
    throw new AppError('Meal image is required.', 400);
  }
  const result = await pool.query(
    `INSERT INTO bulk_variety_meals (name, image_url, image_public_id, price_per_meal, min_order_quantity, is_active, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, name, image_url, price_per_meal, min_order_quantity, is_active, sort_order`,
    [
      name,
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
  const { name, price_per_meal, min_order_quantity, is_active, sort_order } = payload;

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
         image_url = $2,
         image_public_id = $3,
         price_per_meal = COALESCE($4, price_per_meal),
         min_order_quantity = COALESCE($5, min_order_quantity),
         is_active = COALESCE($6, is_active),
         sort_order = COALESCE($7, sort_order),
         updated_at = NOW()
     WHERE id = $8
     RETURNING id, name, image_url, price_per_meal, min_order_quantity, is_active, sort_order`,
    [
      name !== undefined ? String(name).trim() : null,
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
