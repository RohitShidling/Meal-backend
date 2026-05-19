const db = require('../database');
const AppError = require('../utils/AppError');
const { parseYmdStrict, parseSessionToday } = require('../utils/sessionDate');
const {
  BULK_ENTITY_NAME,
  TIER_MODE,
  BULK_ORDER_STATUS,
  MAX_TOTAL_QUANTITY,
  MAX_LINE_QUANTITY,
} = require('../constants/bulkOrder');

const isBulkEntityName = (name) => String(name || '').trim().toLowerCase() === BULK_ENTITY_NAME;

const addCalendarDaysYmd = (ymd, days) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
};

const compareYmd = (a, b) => {
  if (a === b) return 0;
  return a < b ? -1 : 1;
};

const loadConfig = async (executor = db.query.bind(db)) => {
  const configRes = await executor('SELECT * FROM bulk_order_config WHERE id = 1');
  if (configRes.rows.length === 0) {
    throw new AppError('Bulk order is not configured.', 503);
  }
  const config = configRes.rows[0];
  if (!config.is_active) {
    throw new AppError('Bulk ordering is currently unavailable.', 503);
  }
  return config;
};

const mapPublicConfig = (config) => ({
  min_quantity: Number(config.min_quantity),
  standard_max_quantity: Number(
    config.standard_max_quantity ?? Math.max(Number(config.min_quantity), Number(config.tier_threshold) - 1)
  ),
  min_lead_days: Number(config.min_lead_days),
  tier_threshold: Number(config.tier_threshold),
  price_per_meal_under_threshold: Number(config.price_per_meal_under_threshold),
  variety_menu_lookahead_days: Number(config.variety_menu_lookahead_days),
  max_variety_types: Number(config.max_variety_types),
  allow_multiple_variety_meals: config.allow_multiple_variety_meals !== false,
  min_quantity_per_variety_meal: Number(config.min_quantity_per_variety_meal ?? 1),
  is_active: config.is_active,
  hub_intro_text: config.hub_intro_text || null,
  standard_tier_title: config.standard_tier_title || null,
  standard_tier_subtitle: config.standard_tier_subtitle || null,
  standard_tier_description: config.standard_tier_description || null,
  variety_tier_title: config.variety_tier_title || null,
  variety_tier_subtitle: config.variety_tier_subtitle || null,
  variety_tier_description: config.variety_tier_description || null,
});

const getPublicConfig = async () => {
  const config = await loadConfig();
  return mapPublicConfig(config);
};

const getEarliestDeliveryDate = (config) => {
  const today = parseSessionToday();
  return addCalendarDaysYmd(today, Number(config.min_lead_days));
};

const fetchMenuByDate = async (menuDate, executor = db.query.bind(db)) => {
  const res = await executor(
    `SELECT id, items, TO_CHAR(menu_date::date, 'YYYY-MM-DD') AS menu_date, image_url
     FROM daily_menus
     WHERE menu_date::date = $1::date AND is_active = true
     ORDER BY created_at DESC
     LIMIT 1`,
    [menuDate]
  );
  return res.rows[0] || null;
};

const mapVarietyMealRow = (row) => ({
  id: row.id,
  name: row.name,
  items: row.name,
  image_url: row.image_url,
  price_per_meal: Number(row.price_per_meal),
  min_order_quantity: Number(row.min_order_quantity ?? 1),
  category_id: row.category_id || null,
});

const fetchVarietyMeals = async (executor = db.query.bind(db), { categoryId = null } = {}) => {
  const params = [];
  let where = `m.is_active = true AND c.is_active = true`;
  if (categoryId) {
    params.push(categoryId);
    where += ` AND m.category_id = $${params.length}`;
  }
  const res = await executor(
    `SELECT m.id, m.name, m.image_url, m.price_per_meal, m.min_order_quantity, m.category_id
     FROM bulk_variety_meals m
     INNER JOIN bulk_variety_categories c ON c.id = m.category_id
     WHERE ${where}
     ORDER BY m.sort_order ASC, m.created_at DESC`,
    params
  );
  return res.rows.map(mapVarietyMealRow);
};

const fetchVarietyCategories = async (executor = db.query.bind(db)) => {
  const res = await executor(
    `SELECT c.id, c.name, c.description, c.image_url, c.sort_order,
            COUNT(m.id) FILTER (WHERE m.is_active = true)::int AS meal_count
     FROM bulk_variety_categories c
     LEFT JOIN bulk_variety_meals m ON m.category_id = c.id
     WHERE c.is_active = true
     GROUP BY c.id
     HAVING COUNT(m.id) FILTER (WHERE m.is_active = true) > 0
     ORDER BY c.sort_order ASC, c.created_at DESC`
  );
  return res.rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    image_url: row.image_url,
    sort_order: row.sort_order,
    meal_count: Number(row.meal_count ?? 0),
  }));
};

const fetchVarietyMealsByCategory = async (categoryId, executor = db.query.bind(db)) => {
  const catRes = await executor(
    `SELECT id FROM bulk_variety_categories WHERE id = $1 AND is_active = true`,
    [categoryId]
  );
  if (catRes.rows.length === 0) {
    throw new AppError('Category not found or inactive.', 404);
  }
  return fetchVarietyMeals(executor, { categoryId });
};

const normalizeItems = (items) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((row) => ({
      dailyMenuId: String(row.dailyMenuId || row.daily_menu_id || '').trim(),
      bulkMealId: String(row.bulkMealId || row.bulk_meal_id || '').trim(),
      quantity: Number(row.quantity),
    }))
    .filter(
      (row) =>
        (row.dailyMenuId || row.bulkMealId) &&
        Number.isFinite(row.quantity) &&
        row.quantity > 0
    );
};

const validateDeliveryAddress = async (address, executor = db.query.bind(db)) => {
  if (!address || typeof address !== 'object') {
    throw new AppError('Delivery address is required (state, city, and street address).', 400);
  }
  const stateId = Number(address.stateId ?? address.state_id);
  const cityId = Number(address.cityId ?? address.city_id);
  const addressLine = String(address.address ?? address.addressLine ?? address.address_line ?? '').trim();
  const pincodeRaw = String(address.pincode ?? '').trim();

  if (!Number.isInteger(stateId) || stateId < 1) {
    throw new AppError('Please select a valid state.', 400);
  }
  if (!Number.isInteger(cityId) || cityId < 1) {
    throw new AppError('Please select a valid city.', 400);
  }
  if (addressLine.length < 5) {
    throw new AppError('Delivery address must be at least 5 characters.', 400);
  }
  if (addressLine.length > 500) {
    throw new AppError('Delivery address is too long (max 500 characters).', 400);
  }
  if (pincodeRaw && !/^\d{6}$/.test(pincodeRaw)) {
    throw new AppError('Pincode must be 6 digits.', 400);
  }

  const cityRes = await executor(
    `SELECT c.id, c.name AS city_name, c.state_id, s.name AS state_name
     FROM cities c
     INNER JOIN states s ON s.id = c.state_id
     WHERE c.id = $1 AND c.is_active = true AND s.is_active = true`,
    [cityId]
  );
  const cityRow = cityRes.rows[0];
  if (!cityRow || Number(cityRow.state_id) !== stateId) {
    throw new AppError('Selected city does not belong to the selected state.', 400);
  }

  return {
    state_id: stateId,
    city_id: cityId,
    state_name: cityRow.state_name,
    city_name: cityRow.city_name,
    address_line: addressLine,
    pincode: pincodeRaw || null,
  };
};

const validateAndQuote = async ({ deliveryDate, items, deliveryAddress }, executor = db.query.bind(db)) => {
  const config = await loadConfig(executor);
  const deliveryYmd = parseYmdStrict(deliveryDate);
  if (!deliveryYmd) {
    throw new AppError('deliveryDate must be YYYY-MM-DD.', 400);
  }

  const earliest = getEarliestDeliveryDate(config);
  if (compareYmd(deliveryYmd, earliest) < 0) {
    throw new AppError(
      `Delivery date must be at least ${config.min_lead_days} day(s) from today (${earliest} or later).`,
      400
    );
  }

  const normalizedItems = normalizeItems(items);
  if (normalizedItems.length === 0) {
    throw new AppError('At least one menu line is required.', 400);
  }

  const resolvedAddress = await validateDeliveryAddress(deliveryAddress, executor);

  const totalQuantity = normalizedItems.reduce((sum, row) => sum + row.quantity, 0);
  if (totalQuantity > MAX_TOTAL_QUANTITY) {
    throw new AppError(`Total quantity cannot exceed ${MAX_TOTAL_QUANTITY}.`, 400);
  }
  if (totalQuantity < Number(config.min_quantity)) {
    throw new AppError(`Minimum order quantity is ${config.min_quantity} meals.`, 400);
  }
  for (const row of normalizedItems) {
    if (row.quantity > MAX_LINE_QUANTITY) {
      throw new AppError(`Line quantity cannot exceed ${MAX_LINE_QUANTITY}.`, 400);
    }
  }

  const threshold = Number(config.tier_threshold);
  const tierMode =
    totalQuantity >= threshold ? TIER_MODE.AT_OR_ABOVE_THRESHOLD : TIER_MODE.UNDER_THRESHOLD;

  let quotedLines = [];

  const standardMax = Number(
    config.standard_max_quantity ?? Math.max(Number(config.min_quantity), threshold - 1)
  );

  if (tierMode === TIER_MODE.UNDER_THRESHOLD) {
    const deliveryMenu = await fetchMenuByDate(deliveryYmd, executor);
    if (!deliveryMenu) {
      throw new AppError(`No active menu for delivery date ${deliveryYmd}.`, 400);
    }
    if (totalQuantity > standardMax) {
      throw new AppError(
        `Standard bulk orders allow at most ${standardMax} meals. For ${threshold} or more, use large event bulk.`,
        400
      );
    }
    if (totalQuantity >= threshold) {
      throw new AppError(`For quantities of ${threshold} or more, use the variety ordering mode.`, 400);
    }
    if (normalizedItems.length !== 1) {
      throw new AppError('Orders below the tier threshold must include exactly one menu (delivery day menu).', 400);
    }
    const line = normalizedItems[0];
    if (line.bulkMealId) {
      throw new AppError('For orders below the tier threshold, use the delivery day school menu only.', 400);
    }
    if (!line.dailyMenuId) {
      throw new AppError('dailyMenuId is required for this order size.', 400);
    }
    if (line.dailyMenuId !== deliveryMenu.id) {
      throw new AppError('For this quantity tier, you must order the menu scheduled for your delivery date only.', 400);
    }
    const unitPrice = Number(config.price_per_meal_under_threshold);
    quotedLines = [
      {
        daily_menu_id: deliveryMenu.id,
        bulk_variety_meal_id: null,
        menu_date: deliveryMenu.menu_date,
        items: deliveryMenu.items,
        image_url: deliveryMenu.image_url || null,
        quantity: totalQuantity,
        variety_slot: null,
        unit_price: unitPrice,
        line_total: Number((unitPrice * totalQuantity).toFixed(2)),
      },
    ];
  } else {
    if (totalQuantity < threshold) {
      throw new AppError(`Minimum quantity for variety ordering is ${threshold}.`, 400);
    }
    const varietyCatalog = await fetchVarietyMeals(executor);
    if (varietyCatalog.length === 0) {
      throw new AppError('No bulk variety meals are configured. Contact support.', 503);
    }
    const distinctIds = [...new Set(normalizedItems.map((r) => r.bulkMealId).filter(Boolean))];
    if (distinctIds.length !== normalizedItems.length) {
      throw new AppError('Each line must reference a bulk variety meal (bulkMealId).', 400);
    }
    if (normalizedItems.some((r) => r.dailyMenuId)) {
      throw new AppError('For 50+ orders, select meals from the bulk variety catalog only.', 400);
    }
    const allowMultiple = config.allow_multiple_variety_meals !== false;
    const maxTypes = allowMultiple ? Number(config.max_variety_types) : 1;

    if (!allowMultiple) {
      if (distinctIds.length !== 1 || normalizedItems.length !== 1) {
        throw new AppError('Only one meal type is allowed for large bulk orders.', 400);
      }
    } else if (distinctIds.length > maxTypes) {
      throw new AppError(`You can select at most ${maxTypes} different meals.`, 400);
    }

    const allowedMeals = varietyCatalog;
    const allowedIds = new Set(allowedMeals.map((m) => m.id));
    if (allowedIds.size === 0) {
      throw new AppError('No bulk variety meals are configured. Contact support.', 503);
    }

    const mealCache = new Map();
    const getBulkMeal = async (id) => {
      if (mealCache.has(id)) return mealCache.get(id);
      const res = await executor(
        `SELECT m.id, m.name, m.image_url, m.price_per_meal, m.min_order_quantity, m.is_active, m.category_id,
                c.is_active AS category_active
         FROM bulk_variety_meals m
         INNER JOIN bulk_variety_categories c ON c.id = m.category_id
         WHERE m.id = $1`,
        [id]
      );
      const meal = res.rows[0] || null;
      mealCache.set(id, meal);
      return meal;
    };

    const mealRows = [];
    for (const line of normalizedItems) {
      const meal = await getBulkMeal(line.bulkMealId);
      if (!meal || !meal.is_active || !meal.category_active) {
        throw new AppError(`Bulk meal ${line.bulkMealId} is not available.`, 400);
      }
      if (!allowedIds.has(meal.id)) {
        throw new AppError(`Bulk meal ${meal.name} is not available for ordering.`, 400);
      }
      mealRows.push({ ...line, meal, unitPrice: Number(meal.price_per_meal) });
    }

    const multipleMealTypes = mealRows.length > 1;
    if (multipleMealTypes) {
      for (const row of mealRows) {
        const mealMin = Number(row.meal.min_order_quantity ?? 1);
        if (row.quantity < mealMin) {
          throw new AppError(
            `${row.meal.name} requires at least ${mealMin} portions when ordering multiple different meals.`,
            400
          );
        }
      }
      const minSum = mealRows.reduce(
        (sum, row) => sum + Number(row.meal.min_order_quantity ?? 1),
        0
      );
      if (minSum > totalQuantity) {
        throw new AppError(
          `Your meal minimums require at least ${minSum} portions total for the types you selected.`,
          400
        );
      }
    }

    mealRows.sort((a, b) => a.meal.id.localeCompare(b.meal.id));

    quotedLines = mealRows.map((row, idx) => ({
      daily_menu_id: null,
      bulk_variety_meal_id: row.meal.id,
      menu_date: deliveryYmd,
      items: row.meal.name,
      image_url: row.meal.image_url || null,
      quantity: row.quantity,
      variety_slot: idx + 1,
      unit_price: row.unitPrice,
      line_total: Number((row.unitPrice * row.quantity).toFixed(2)),
    }));
  }

  const totalAmount = quotedLines.reduce((sum, line) => sum + line.line_total, 0);

  return {
    delivery_date: deliveryYmd,
    total_quantity: totalQuantity,
    total_amount: Number(totalAmount.toFixed(2)),
    tier_mode: tierMode,
    earliest_delivery_date: earliest,
    delivery_address: resolvedAddress,
    lines: quotedLines,
  };
};

const persistBulkOrder = async (client, clientId, quote) => {
  const addr = quote.delivery_address || {};
  const bulkRes = await client.query(
    `INSERT INTO bulk_orders (
       client_id, delivery_date, total_quantity, total_amount, tier_mode, status,
       state_id, city_id, address_line, pincode
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      clientId,
      quote.delivery_date,
      quote.total_quantity,
      quote.total_amount,
      quote.tier_mode,
      BULK_ORDER_STATUS.PENDING,
      addr.state_id ?? null,
      addr.city_id ?? null,
      addr.address_line ?? null,
      addr.pincode ?? null,
    ]
  );
  const bulkOrder = bulkRes.rows[0];

  for (const line of quote.lines) {
    await client.query(
      `INSERT INTO bulk_order_items (bulk_order_id, daily_menu_id, bulk_variety_meal_id, menu_date, quantity, variety_slot, unit_price, line_total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        bulkOrder.id,
        line.daily_menu_id || null,
        line.bulk_variety_meal_id || null,
        line.menu_date,
        line.quantity,
        line.variety_slot,
        line.unit_price,
        line.line_total,
      ]
    );
  }

  const orderRes = await client.query(
    `INSERT INTO orders (client_id, subscription_id, entity_type, entity_id, amount, status, order_type, start_date)
     VALUES ($1, NULL, 'bulk', $2, $3, 'pending', 'bulk', $4)
     RETURNING *`,
    [clientId, bulkOrder.id, quote.total_amount, quote.delivery_date]
  );
  const order = orderRes.rows[0];

  await client.query('UPDATE bulk_orders SET order_id = $1, updated_at = NOW() WHERE id = $2', [
    order.id,
    bulkOrder.id,
  ]);

  return { bulkOrder, order };
};

const confirmBulkOrder = async (client, bulkOrderId) => {
  await client.query(
    `UPDATE bulk_orders SET status = $1, updated_at = NOW() WHERE id = $2`,
    [BULK_ORDER_STATUS.CONFIRMED, bulkOrderId]
  );
};

const cancelBulkOrder = async (client, bulkOrderId) => {
  await client.query(
    `UPDATE bulk_orders SET status = $1, updated_at = NOW() WHERE id = $2`,
    [BULK_ORDER_STATUS.CANCELLED, bulkOrderId]
  );
};

const bulkOrderAddressSelect = `
  bo.state_id, bo.city_id, bo.address_line, bo.pincode,
  st.name AS state_name, ct.name AS city_name
`;

const getBulkOrderForClient = async (bulkOrderId, clientId) => {
  const res = await db.query(
    `SELECT bo.*, o.status AS order_status,
            ${bulkOrderAddressSelect}
     FROM bulk_orders bo
     LEFT JOIN orders o ON o.id = bo.order_id
     LEFT JOIN states st ON st.id = bo.state_id
     LEFT JOIN cities ct ON ct.id = bo.city_id
     WHERE bo.id = $1 AND bo.client_id = $2`,
    [bulkOrderId, clientId]
  );
  if (res.rows.length === 0) return null;
  const items = await db.query(
    `SELECT boi.*,
            COALESCE(dm.items, bvm.name) AS menu_items,
            COALESCE(dm.image_url, bvm.image_url) AS image_url
     FROM bulk_order_items boi
     LEFT JOIN daily_menus dm ON dm.id = boi.daily_menu_id
     LEFT JOIN bulk_variety_meals bvm ON bvm.id = boi.bulk_variety_meal_id
     WHERE boi.bulk_order_id = $1
     ORDER BY boi.variety_slot NULLS FIRST, boi.menu_date ASC`,
    [bulkOrderId]
  );
  return { ...res.rows[0], items: items.rows };
};

const getBulkSummaryForOrder = async (orderId) => {
  const res = await db.query(
    `SELECT bo.id, bo.delivery_date, bo.total_quantity, bo.total_amount, bo.tier_mode, bo.status,
            ${bulkOrderAddressSelect}
     FROM bulk_orders bo
     LEFT JOIN states st ON st.id = bo.state_id
     LEFT JOIN cities ct ON ct.id = bo.city_id
     WHERE bo.order_id = $1`,
    [orderId]
  );
  if (res.rows.length === 0) return null;
  const bulk = res.rows[0];
  const items = await db.query(
    `SELECT boi.daily_menu_id, boi.bulk_variety_meal_id, boi.menu_date, boi.quantity, boi.variety_slot,
            boi.unit_price, boi.line_total,
            COALESCE(dm.items, bvm.name) AS menu_items,
            COALESCE(dm.image_url, bvm.image_url) AS image_url
     FROM bulk_order_items boi
     LEFT JOIN daily_menus dm ON dm.id = boi.daily_menu_id
     LEFT JOIN bulk_variety_meals bvm ON bvm.id = boi.bulk_variety_meal_id
     WHERE boi.bulk_order_id = $1
     ORDER BY boi.variety_slot NULLS FIRST, boi.menu_date ASC`,
    [bulk.id]
  );
  return { ...bulk, items: items.rows };
};

module.exports = {
  isBulkEntityName,
  loadConfig,
  getPublicConfig,
  getEarliestDeliveryDate,
  fetchMenuByDate,
  fetchVarietyMeals,
  fetchVarietyCategories,
  fetchVarietyMealsByCategory,
  validateDeliveryAddress,
  validateAndQuote,
  persistBulkOrder,
  confirmBulkOrder,
  cancelBulkOrder,
  getBulkOrderForClient,
  getBulkSummaryForOrder,
  addCalendarDaysYmd,
};
