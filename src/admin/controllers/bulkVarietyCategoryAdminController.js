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

exports.listCategories = catchAsync(async (req, res) => {
  const result = await pool.query(
    `SELECT c.id, c.name, c.description, c.image_url, c.sort_order, c.is_active, c.created_at, c.updated_at,
            COUNT(m.id)::int AS meal_count
     FROM bulk_variety_categories c
     LEFT JOIN bulk_variety_meals m ON m.category_id = c.id
     GROUP BY c.id
     ORDER BY c.sort_order ASC, c.created_at DESC`
  );
  res.status(200).json({
    success: true,
    count: result.rowCount,
    data: result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      image_url: row.image_url,
      sort_order: row.sort_order,
      is_active: row.is_active,
      meal_count: Number(row.meal_count ?? 0),
      created_at: row.created_at,
      updated_at: row.updated_at,
    })),
  });
});

exports.createCategory = catchAsync(async (req, res) => {
  const { name, description, is_active, sort_order } = req.validatedCategory;
  const image_url = req.file?.path || null;
  const image_public_id = req.file?.filename || null;
  if (image_url && !isAllowedImageUrl(image_url)) {
    throw new AppError('Invalid category image URL source.', 400);
  }

  const result = await pool.query(
    `INSERT INTO bulk_variety_categories (name, description, image_url, image_public_id, is_active, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, description, image_url, sort_order, is_active`,
    [
      name,
      description || null,
      image_url,
      image_public_id,
      is_active !== false,
      sort_order ?? 0,
    ]
  );

  res.status(201).json({
    success: true,
    message: 'Bulk variety category created.',
    data: result.rows[0],
  });
});

exports.updateCategory = catchAsync(async (req, res) => {
  const id = req.params.id;
  const payload = req.validatedCategory || {};
  const current = await pool.query(
    `SELECT id, image_url, image_public_id FROM bulk_variety_categories WHERE id = $1`,
    [id]
  );
  if (current.rows.length === 0) {
    throw new AppError('Bulk variety category not found.', 404);
  }

  let image_url = current.rows[0].image_url;
  let image_public_id = current.rows[0].image_public_id;

  if (req.file) {
    if (!isAllowedImageUrl(req.file.path)) {
      throw new AppError('Invalid category image URL source.', 400);
    }
    if (image_public_id) {
      try {
        await cloudinary.uploader.destroy(image_public_id);
      } catch (_) {
        /* ignore */
      }
    }
    image_url = req.file.path;
    image_public_id = req.file.filename;
  }

  const { name, description, is_active, sort_order } = payload;
  const result = await pool.query(
    `UPDATE bulk_variety_categories
     SET name = COALESCE($1, name),
         description = COALESCE($2, description),
         image_url = $3,
         image_public_id = $4,
         is_active = COALESCE($5, is_active),
         sort_order = COALESCE($6, sort_order),
         updated_at = NOW()
     WHERE id = $7
     RETURNING id, name, description, image_url, sort_order, is_active`,
    [
      name !== undefined ? String(name).trim() : null,
      description !== undefined ? (description ? String(description).trim() : null) : null,
      image_url,
      image_public_id,
      is_active !== undefined ? !(is_active === false || is_active === 'false') : null,
      sort_order !== undefined && Number.isFinite(Number(sort_order)) ? Number(sort_order) : null,
      id,
    ]
  );

  res.status(200).json({
    success: true,
    message: 'Bulk variety category updated.',
    data: result.rows[0],
  });
});

exports.deleteCategory = catchAsync(async (req, res) => {
  const id = req.params.id;
  const current = await pool.query(
    `SELECT id, image_public_id FROM bulk_variety_categories WHERE id = $1`,
    [id]
  );
  if (current.rows.length === 0) {
    throw new AppError('Bulk variety category not found.', 404);
  }

  const mealCount = await pool.query(
    `SELECT COUNT(*)::int AS c FROM bulk_variety_meals WHERE category_id = $1`,
    [id]
  );
  if (Number(mealCount.rows[0]?.c ?? 0) > 0) {
    throw new AppError('Cannot delete: category still has meals. Move or delete meals first.', 400);
  }

  await pool.query(`DELETE FROM bulk_variety_categories WHERE id = $1`, [id]);

  if (current.rows[0].image_public_id) {
    try {
      await cloudinary.uploader.destroy(current.rows[0].image_public_id);
    } catch (_) {
      /* ignore */
    }
  }

  res.status(200).json({ success: true, message: 'Bulk variety category deleted.' });
});
