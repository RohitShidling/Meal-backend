const { pool } = require('../../common/database');
const catchAsync = require('../../common/utils/catchAsync');
const AppError = require('../../common/utils/AppError');
const { clientDisplayNameSql } = require('../../common/utils/clientDisplayName');
const { TIER_MODE } = require('../../common/constants/bulkOrder');

const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const parseYmd = (value) => {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return YMD_REGEX.test(v) ? v : null;
};

const buildListQuery = (query) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const conditions = [];
  const params = [];
  let n = 0;
  const add = (val) => {
    params.push(val);
    n += 1;
    return `$${n}`;
  };

  const tierRaw = String(query.tier_mode || query.tier || '').trim().toLowerCase();
  if (tierRaw === TIER_MODE.UNDER_THRESHOLD || tierRaw === 'standard' || tierRaw === 'under') {
    conditions.push(`bo.tier_mode = ${add(TIER_MODE.UNDER_THRESHOLD)}`);
  } else if (
    tierRaw === TIER_MODE.AT_OR_ABOVE_THRESHOLD ||
    tierRaw === 'variety' ||
    tierRaw === 'large' ||
    tierRaw === '50+' ||
    tierRaw === 'at_or_above'
  ) {
    conditions.push(`bo.tier_mode = ${add(TIER_MODE.AT_OR_ABOVE_THRESHOLD)}`);
  }

  const categoryId = String(query.category_id || query.categoryId || '').trim();
  if (/^BVC-\d+$/.test(categoryId)) {
    const p = add(categoryId);
    conditions.push(`EXISTS (
      SELECT 1 FROM bulk_order_items boi
      INNER JOIN bulk_variety_meals bvm ON bvm.id = boi.bulk_variety_meal_id
      WHERE boi.bulk_order_id = bo.id AND bvm.category_id = ${p}
    )`);
  }

  const dateField = String(query.date_field || query.dateField || 'ordered').trim().toLowerCase();
  const dateCol = dateField === 'delivery' ? 'bo.delivery_date::date' : 'bo.created_at::date';
  const startDate = parseYmd(query.start_date || query.startDate);
  const endDate = parseYmd(query.end_date || query.endDate);
  if (startDate) {
    conditions.push(`${dateCol} >= ${add(startDate)}::date`);
  }
  if (endDate) {
    conditions.push(`${dateCol} <= ${add(endDate)}::date`);
  }

  const status = String(query.status || '').trim().toLowerCase();
  if (status) {
    const p = add(status);
    conditions.push(`LOWER(COALESCE(o.status, bo.status)) = ${p}`);
  }

  const search = String(query.search || '').trim();
  if (search.length > 0) {
    const p = add(`%${search}%`);
    const tierHint =
      /standard|under/i.test(search) ? TIER_MODE.UNDER_THRESHOLD
      : /large|variety|50\+?/i.test(search)
        ? TIER_MODE.AT_OR_ABOVE_THRESHOLD
        : null;
    const tierClause = tierHint ? ` OR bo.tier_mode = ${add(tierHint)}` : '';
    conditions.push(`(
      bo.id ILIKE ${p}
      OR c.phone_number ILIKE ${p}
      OR c.username ILIKE ${p}
      OR (${clientDisplayNameSql('c')}) ILIKE ${p}
      OR bo.address_line ILIKE ${p}
      OR bo.pincode ILIKE ${p}
      OR st.name ILIKE ${p}
      OR ct.name ILIKE ${p}
      ${tierClause}
      OR EXISTS (
        SELECT 1 FROM bulk_order_items boi
        LEFT JOIN bulk_variety_meals bvm ON bvm.id = boi.bulk_variety_meal_id
        LEFT JOIN bulk_variety_categories bvc ON bvc.id = bvm.category_id
        LEFT JOIN daily_menus dm ON dm.id = boi.daily_menu_id
        WHERE boi.bulk_order_id = bo.id
          AND (
            bvm.name ILIKE ${p}
            OR bvc.name ILIKE ${p}
            OR dm.items ILIKE ${p}
          )
      )
    )`);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return { page, limit, offset, whereSql, params };
};

const orderSelectSql = `
  SELECT bo.id, bo.client_id, bo.delivery_date, bo.total_quantity, bo.total_amount,
         bo.tier_mode, bo.created_at,
         bo.state_id, bo.city_id, bo.address_line, bo.pincode,
         st.name AS state_name, ct.name AS city_name,
         COALESCE(o.status, bo.status) AS status,
         c.phone_number,
         c.username AS client_username,
         ${clientDisplayNameSql('c')} AS client_name,
         (
           SELECT COALESCE(
             json_agg(DISTINCT jsonb_build_object('id', bvc.id, 'name', bvc.name))
             FILTER (WHERE bvc.id IS NOT NULL),
             '[]'::json
           )
           FROM bulk_order_items boi_cat
           LEFT JOIN bulk_variety_meals bvm_cat ON bvm_cat.id = boi_cat.bulk_variety_meal_id
           LEFT JOIN bulk_variety_categories bvc ON bvc.id = bvm_cat.category_id
           WHERE boi_cat.bulk_order_id = bo.id
         ) AS categories,
         (
           SELECT COALESCE(json_agg(
             json_build_object(
               'id', boi.id,
               'meal_name', COALESCE(dm.items, bvm.name, 'Unknown'),
               'category_id', bvm.category_id,
               'category_name', bvc.name,
               'quantity', boi.quantity,
               'unit_price', boi.unit_price,
               'line_total', boi.line_total,
               'variety_slot', boi.variety_slot,
               'is_variety_meal', (boi.bulk_variety_meal_id IS NOT NULL)
             ) ORDER BY boi.variety_slot NULLS FIRST, boi.menu_date ASC
           ), '[]'::json)
           FROM bulk_order_items boi
           LEFT JOIN daily_menus dm ON dm.id = boi.daily_menu_id
           LEFT JOIN bulk_variety_meals bvm ON bvm.id = boi.bulk_variety_meal_id
           LEFT JOIN bulk_variety_categories bvc ON bvc.id = bvm.category_id
           WHERE boi.bulk_order_id = bo.id
         ) AS items
  FROM bulk_orders bo
  LEFT JOIN orders o ON o.id = bo.order_id
  JOIN clients c ON c.id = bo.client_id
  LEFT JOIN states st ON st.id = bo.state_id
  LEFT JOIN cities ct ON ct.id = bo.city_id
`;

exports.listOrders = catchAsync(async (req, res) => {
  const { page, limit, offset, whereSql, params } = buildListQuery(req.query);

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM bulk_orders bo
     LEFT JOIN orders o ON o.id = bo.order_id
     JOIN clients c ON c.id = bo.client_id
     LEFT JOIN states st ON st.id = bo.state_id
     LEFT JOIN cities ct ON ct.id = bo.city_id
     ${whereSql}`,
    params
  );
  const total = countRes.rows[0]?.total || 0;

  const listParams = [...params, limit, offset];
  const limitParam = `$${listParams.length - 1}`;
  const offsetParam = `$${listParams.length}`;

  const rows = await pool.query(
    `${orderSelectSql}
     ${whereSql}
     ORDER BY bo.created_at DESC
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    listParams
  );

  res.status(200).json({
    success: true,
    count: rows.rowCount,
    total,
    page,
    limit,
    data: rows.rows,
  });
});

exports.getOrderById = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const resOrder = await pool.query(
    `SELECT bo.*, o.status AS order_status,
            c.phone_number,
            c.username AS client_username,
            ${clientDisplayNameSql('c')} AS client_name
     FROM bulk_orders bo
     LEFT JOIN orders o ON o.id = bo.order_id
     JOIN clients c ON c.id = bo.client_id
     WHERE bo.id = $1`,
    [id]
  );
  if (resOrder.rows.length === 0) return next(new AppError('Bulk order not found.', 404));
  const items = await pool.query(
    `SELECT boi.*,
            COALESCE(dm.items, bvm.name) AS menu_items,
            bvm.category_id,
            bvc.name AS category_name
     FROM bulk_order_items boi
     LEFT JOIN daily_menus dm ON dm.id = boi.daily_menu_id
     LEFT JOIN bulk_variety_meals bvm ON bvm.id = boi.bulk_variety_meal_id
     LEFT JOIN bulk_variety_categories bvc ON bvc.id = bvm.category_id
     WHERE boi.bulk_order_id = $1
     ORDER BY boi.variety_slot NULLS FIRST, boi.menu_date ASC`,
    [id]
  );
  res.status(200).json({
    success: true,
    data: { ...resOrder.rows[0], items: items.rows },
  });
});
