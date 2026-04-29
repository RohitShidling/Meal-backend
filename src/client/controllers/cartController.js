const db = require('../../common/database');
const AppError = require('../../common/utils/AppError');
const catchAsync = require('../../common/utils/catchAsync');

// ─── HELPER ────────────────────────────────────────────────────────────────
const resolveEntityName = async (entityType, entityId) => {
  if (entityType === 'child') {
    const r = await db.query('SELECT name FROM children WHERE id=$1', [entityId]);
    return r.rows[0]?.name || null;
  }
  if (entityType === 'teacher') {
    const r = await db.query('SELECT name FROM teacher_profiles WHERE id=$1', [entityId]);
    return r.rows[0]?.name || null;
  }
  if (entityType === 'professional') {
    const r = await db.query('SELECT name FROM professional_profiles WHERE id=$1', [entityId]);
    return r.rows[0]?.name || null;
  }
  return null;
};

const validateEntityOwnership = async (entityType, entityId, clientId) => {
  if (entityType === 'child') {
    const r = await db.query('SELECT id FROM children WHERE id=$1 AND parent_id=$2', [entityId, clientId]);
    return r.rows.length > 0;
  }
  if (entityType === 'teacher') {
    const r = await db.query('SELECT id FROM teacher_profiles WHERE id=$1 AND client_id=$2', [entityId, clientId]);
    return r.rows.length > 0;
  }
  if (entityType === 'professional') {
    const r = await db.query('SELECT id FROM professional_profiles WHERE id=$1 AND client_id=$2', [entityId, clientId]);
    return r.rows.length > 0;
  }
  return false;
};

// ─── GET OR CREATE ACTIVE CART ────────────────────────────────────────────
const getOrCreateCart = async (clientId) => {
  let cart = await db.query(
    "SELECT * FROM carts WHERE client_id=$1 AND status='active'",
    [clientId]
  );
  if (cart.rows.length > 0) return cart.rows[0];

  const newCart = await db.query(
    "INSERT INTO carts (client_id, status, total_amount) VALUES ($1,'active',0) RETURNING *",
    [clientId]
  );
  return newCart.rows[0];
};

// ─── RECALCULATE CART TOTAL ────────────────────────────────────────────────
const recalcCartTotal = async (cartId) => {
  await db.query(
    'UPDATE carts SET total_amount=(SELECT COALESCE(SUM(unit_price),0) FROM cart_items WHERE cart_id=$1), updated_at=NOW() WHERE id=$1',
    [cartId]
  );
};

/**
 * @desc  Add item to cart
 * @route POST /api/client/cart/add
 */
exports.addToCart = catchAsync(async (req, res, next) => {
  const clientId = req.user.id;
  const { subscriptionId, entityType, entityId } = req.body;

  if (!subscriptionId || !entityType || !entityId) {
    return next(new AppError('subscriptionId, entityType and entityId are required', 400));
  }
  if (!['child', 'teacher', 'professional'].includes(entityType)) {
    return next(new AppError('entityType must be child, teacher, or professional', 400));
  }

  const owned = await validateEntityOwnership(entityType, entityId, clientId);
  if (!owned) return next(new AppError(`${entityType} not found or unauthorized`, 404));

  const sub = await db.query('SELECT * FROM subscriptions WHERE id=$1 AND is_active=true', [subscriptionId]);
  if (sub.rows.length === 0) return next(new AppError('Subscription plan not found', 404));

  const cart = await getOrCreateCart(clientId);
  const entityName = await resolveEntityName(entityType, entityId);

  try {
    await db.query(
      'INSERT INTO cart_items (cart_id,subscription_id,entity_type,entity_id,entity_name,unit_price) VALUES ($1,$2,$3,$4,$5,$6)',
      [cart.id, subscriptionId, entityType, entityId, entityName, sub.rows[0].price]
    );
  } catch (e) {
    if (e.code === '23505') return next(new AppError(`${entityName || entityId} is already in your cart`, 400));
    throw e;
  }

  await recalcCartTotal(cart.id);
  const updatedCart = await db.query("SELECT * FROM carts WHERE id=$1", [cart.id]);
  const items = await db.query('SELECT ci.*, s.plan_name FROM cart_items ci JOIN subscriptions s ON ci.subscription_id=s.id WHERE ci.cart_id=$1 ORDER BY ci.created_at ASC', [cart.id]);

  res.status(200).json({
    success: true,
    message: `${entityName} added to cart`,
    data: { cart: updatedCart.rows[0], items: items.rows }
  });
});

/**
 * @desc  Remove item from cart
 * @route DELETE /api/client/cart/item/:itemId
 */
exports.removeFromCart = catchAsync(async (req, res, next) => {
  const clientId = req.user.id;
  const { itemId } = req.params;

  const item = await db.query(
    'SELECT ci.* FROM cart_items ci JOIN carts c ON ci.cart_id=c.id WHERE ci.id=$1 AND c.client_id=$2',
    [itemId, clientId]
  );
  if (item.rows.length === 0) return next(new AppError('Cart item not found', 404));

  const cartId = item.rows[0].cart_id;
  await db.query('DELETE FROM cart_items WHERE id=$1', [itemId]);
  await recalcCartTotal(cartId);

  const items = await db.query('SELECT ci.*, s.plan_name FROM cart_items ci JOIN subscriptions s ON ci.subscription_id=s.id WHERE ci.cart_id=$1 ORDER BY ci.created_at ASC', [cartId]);
  const cart = await db.query('SELECT * FROM carts WHERE id=$1', [cartId]);

  res.status(200).json({
    success: true,
    message: 'Item removed from cart',
    data: { cart: cart.rows[0], items: items.rows }
  });
});

/**
 * @desc  View current cart
 * @route GET /api/client/cart
 */
exports.viewCart = catchAsync(async (req, res, next) => {
  const clientId = req.user.id;

  const cart = await db.query("SELECT * FROM carts WHERE client_id=$1 AND status='active'", [clientId]);
  if (cart.rows.length === 0) {
    return res.status(200).json({ success: true, message: 'Cart is empty', data: { cart: null, items: [] } });
  }

  const items = await db.query(
    'SELECT ci.*, s.plan_name, s.billing_cycle FROM cart_items ci JOIN subscriptions s ON ci.subscription_id=s.id WHERE ci.cart_id=$1 ORDER BY ci.created_at ASC',
    [cart.rows[0].id]
  );

  res.status(200).json({
    success: true,
    data: { cart: cart.rows[0], items: items.rows, item_count: items.rowCount }
  });
});

/**
 * @desc  Clear cart
 * @route DELETE /api/client/cart/clear
 */
exports.clearCart = catchAsync(async (req, res, next) => {
  const clientId = req.user.id;
  const cart = await db.query("SELECT id FROM carts WHERE client_id=$1 AND status='active'", [clientId]);
  if (cart.rows.length === 0) return next(new AppError('No active cart found', 404));

  await db.query('DELETE FROM cart_items WHERE cart_id=$1', [cart.rows[0].id]);
  await db.query("UPDATE carts SET total_amount=0, updated_at=NOW() WHERE id=$1", [cart.rows[0].id]);

  res.status(200).json({ success: true, message: 'Cart cleared successfully' });
});
