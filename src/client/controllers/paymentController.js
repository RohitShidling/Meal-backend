const db = require('../../common/database');
const phonepe = require('../../common/utils/phonepe');
const AppError = require('../../common/utils/AppError');
const catchAsync = require('../../common/utils/catchAsync');
const mealEligibilityService = require('../../common/services/mealEligibilityService');
const DEFAULT_MEAL_TIME = '1:00 PM';
const DEFAULT_FRONTEND_REDIRECT = process.env.DEFAULT_FRONTEND_REDIRECT_URL;
const MAX_HISTORY_LIMIT = 100;
const GATEWAY_STATUS_CACHE_TTL_MS = Number.parseInt(process.env.PAYMENT_STATUS_CACHE_TTL_MS || '10000', 10);
const GATEWAY_STATUS_CACHE_MAX_ENTRIES = Number.parseInt(process.env.PAYMENT_STATUS_CACHE_MAX_ENTRIES || '500', 10);
const gatewayStatusCache = new Map();

const invalidateGatewayStatusCache = (txnId) => {
  if (txnId) gatewayStatusCache.delete(String(txnId));
};

const pruneGatewayCacheBeforeSet = () => {
  const cap = Number.isFinite(GATEWAY_STATUS_CACHE_MAX_ENTRIES) && GATEWAY_STATUS_CACHE_MAX_ENTRIES > 0
    ? GATEWAY_STATUS_CACHE_MAX_ENTRIES
    : 500;
  while (gatewayStatusCache.size >= cap) {
    const oldest = gatewayStatusCache.keys().next().value;
    if (oldest === undefined) break;
    gatewayStatusCache.delete(oldest);
  }
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

/** E4: public status page must not echo full merchant txn id (opaque capability). */
const maskMerchantTxnIdForPublicPage = (tid) => {
  const s = String(tid || '');
  if (s.length <= 6) return '••••••';
  return `…${escapeHtml(s.slice(-6))}`;
};

// ─── HELPERS ────────────────────────────────────────────────────────────────

const resolveEntityName = async (entityType, entityId) => {
  const tables = { child: 'children', teacher: 'teacher_profiles', professional: 'professional_profiles' };
  const table = tables[entityType];
  if (!table) return null;
  const r = await db.query(`SELECT name FROM ${table} WHERE id=$1`, [entityId]);
  return r.rows[0]?.name || null;
};

const validateEntityOwnership = async (entityType, entityId, clientId) => {
  const checks = {
    child: 'SELECT id FROM children WHERE id=$1 AND parent_id=$2',
    teacher: 'SELECT id FROM teacher_profiles WHERE id=$1 AND client_id=$2',
    professional: 'SELECT id FROM professional_profiles WHERE id=$1 AND client_id=$2',
  };
  if (!checks[entityType]) return false;
  const r = await db.query(checks[entityType], [entityId, clientId]);
  return r.rows.length > 0;
};

const resolveEntityMealMeta = async (entityType, entityId) => {
  if (entityType === 'child') {
    const r = await db.query('SELECT meal_size_id, meal_time AS meal_timing FROM children WHERE id=$1', [entityId]);
    return r.rows[0] || {};
  }
  if (entityType === 'teacher') {
    const r = await db.query('SELECT meal_size_id, meal_time AS meal_timing FROM teacher_profiles WHERE id=$1', [entityId]);
    return r.rows[0] || {};
  }
  if (entityType === 'professional') {
    const r = await db.query('SELECT meal_size_id, lunch_time AS meal_timing FROM professional_profiles WHERE id=$1', [entityId]);
    return r.rows[0] || {};
  }
  return {};
};

const parseBoolean = (value, defaultValue = true) => {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  const raw = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(raw)) return true;
  if (['false', '0', 'no', 'n'].includes(raw)) return false;
  return defaultValue;
};

const parsePositiveInt = (value, defaultValue) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
};

const getAllowedFrontendOrigins = () => {
  const configured = process.env.ALLOWED_PAYMENT_REDIRECT_ORIGINS || process.env.CORS_ORIGINS || '';
  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

let warnedEmptyPaymentRedirectAllowlist = false;

const sanitizeFrontendRedirectUrl = (candidateUrl) => {
  if (!candidateUrl) return DEFAULT_FRONTEND_REDIRECT || process.env.PHONEPE_REDIRECT_URL;
  const allowlist = getAllowedFrontendOrigins();
  if (allowlist.length === 0) {
    if (process.env.NODE_ENV === 'production' && !warnedEmptyPaymentRedirectAllowlist) {
      warnedEmptyPaymentRedirectAllowlist = true;
      console.warn(
        '[payment] ALLOWED_PAYMENT_REDIRECT_ORIGINS / CORS_ORIGINS is empty — payment redirect is only bounded by DEFAULT_FRONTEND_REDIRECT / PHONEPE_REDIRECT_URL.'
      );
    }
    return DEFAULT_FRONTEND_REDIRECT || process.env.PHONEPE_REDIRECT_URL;
  }
  try {
    const parsed = new URL(candidateUrl);
    if (allowlist.includes(parsed.origin)) return candidateUrl;
    return DEFAULT_FRONTEND_REDIRECT || process.env.PHONEPE_REDIRECT_URL;
  } catch {
    return DEFAULT_FRONTEND_REDIRECT || process.env.PHONEPE_REDIRECT_URL;
  }
};

const resolveApiBaseUrl = (req) => {
  if (process.env.PUBLIC_API_BASE_URL) {
    return process.env.PUBLIC_API_BASE_URL.replace(/\/$/, '');
  }
  return `${req.protocol}://${req.get('host')}`;
};

const getCachedGatewayStatus = async (txnId) => {
  const key = String(txnId);
  const now = Date.now();
  const cached = gatewayStatusCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.payload;
  }
  const payload = await phonepe.checkStatus(key);
  pruneGatewayCacheBeforeSet();
  gatewayStatusCache.set(key, { payload, expiresAt: now + GATEWAY_STATUS_CACHE_TTL_MS });
  return payload;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const parseYmdStrict = (input) => {
  if (!input) return null;

  // DB DATE fields can come as Date objects or ISO datetime strings.
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    const yy = input.getUTCFullYear();
    const mm = String(input.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(input.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  const raw = String(input).trim();
  const normalized = YMD.test(raw)
    ? raw
    : (raw.length >= 10 && YMD.test(raw.slice(0, 10)) ? raw.slice(0, 10) : null);
  if (!normalized) return null;
  const [y, m, d] = normalized.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return normalized;
};

const addDaysYmd = (ymd, days) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
};

const isServiceMealDayYmd = (ymd, includeSaturday) => {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = dt.getUTCDay(); // 0=Sun ... 6=Sat
  if (dow === 0) return false; // Sunday is always a non-meal day
  if (!includeSaturday && dow === 6) return false;
  return true;
};

const computeMealCount = (startDate, durationDays, includeSaturday) => {
  const safeDuration = Number(durationDays) > 0 ? Number(durationDays) : 30;
  const baseYmd = parseYmdStrict(startDate);
  if (!baseYmd) return safeDuration;
  let count = 0;
  for (let i = 0; i < safeDuration; i += 1) {
    const ymd = addDaysYmd(baseYmd, i);
    if (isServiceMealDayYmd(ymd, includeSaturday)) {
      count += 1;
    }
  }
  return count;
};

const computeEndDateByMealDays = (startYmd, mealDays, includeSaturday) => {
  const safeMealDays = Number(mealDays);
  if (!Number.isFinite(safeMealDays) || safeMealDays <= 0) return startYmd;
  let remaining = safeMealDays;
  let cursor = startYmd;
  while (remaining > 0) {
    if (isServiceMealDayYmd(cursor, includeSaturday)) {
      remaining -= 1;
      if (remaining === 0) break;
    }
    cursor = addDaysYmd(cursor, 1);
  }
  return cursor;
};

const recordSubscriptionHistory = async (queryRunner, row) => {
  await queryRunner.query(
    `INSERT INTO client_subscription_history (
      client_subscription_id, client_id, entity_type, entity_id,
      previous_subscription_id, previous_order_id, previous_start_date, previous_end_date,
      previous_total_meals, previous_used_meals, previous_include_saturday,
      new_subscription_id, new_order_id, new_start_date, new_end_date,
      new_total_meals, new_used_meals, new_include_saturday, change_reason
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
    )`,
    [
      row.clientSubscriptionId,
      row.clientId,
      row.entityType,
      row.entityId,
      row.previousSubscriptionId ?? null,
      row.previousOrderId ?? null,
      row.previousStartDate ?? null,
      row.previousEndDate ?? null,
      row.previousTotalMeals ?? null,
      row.previousUsedMeals ?? null,
      row.previousIncludeSaturday ?? null,
      row.newSubscriptionId,
      row.newOrderId,
      row.newStartDate ?? null,
      row.newEndDate ?? null,
      row.newTotalMeals,
      row.newUsedMeals,
      row.newIncludeSaturday,
      row.changeReason,
    ]
  );
};

/**
 * After successful PhonePe txn: bumps profile meal_size_id to paid target.
 */
const applyMealSizeUpgradeOrder = async (queryRunner, order) => {
  const toId = order.meal_size_id;
  const entityType = order.entity_type;
  const entityId = order.entity_id;
  const clientId = order.client_id;
  if (toId == null) throw new Error('Missing target meal size on upgrade order');
  if (entityType === 'child') {
    const u = await queryRunner.query(
      `UPDATE children SET meal_size_id = $1, updated_at = NOW() WHERE id = $2 AND parent_id = $3`,
      [toId, entityId, clientId]
    );
    if (u.rowCount === 0) throw new Error('Child meal size upgrade apply failed');
  } else if (entityType === 'teacher') {
    const u = await queryRunner.query(
      `UPDATE teacher_profiles SET meal_size_id = $1, updated_at = NOW() WHERE id = $2 AND client_id = $3`,
      [toId, entityId, clientId]
    );
    if (u.rowCount === 0) throw new Error('Teacher meal size upgrade apply failed');
  } else if (entityType === 'professional') {
    const u = await queryRunner.query(
      `UPDATE professional_profiles SET meal_size_id = $1, updated_at = NOW() WHERE id = $2 AND client_id = $3`,
      [toId, entityId, clientId]
    );
    if (u.rowCount === 0) throw new Error('Professional meal size upgrade apply failed');
  } else {
    throw new Error('Invalid entity_type for meal size upgrade');
  }
};

/**
 * Core function: finalize ONE subscription after successful payment
 */
const activateSingleSubscription = async (queryRunner, clientId, subscriptionId, entityType, entityId, orderId, requestedStartDate, includeSaturday) => {
  const subRes = await queryRunner.query(
    'SELECT duration_days, duration_days_with_saturday, duration_days_without_saturday FROM subscriptions WHERE id=$1',
    [subscriptionId]
  );
  const baseDurationDays = Number(subRes.rows[0]?.duration_days || 30);
  const explicitWithSaturday = subRes.rows[0]?.duration_days_with_saturday;
  const explicitWithoutSaturday = subRes.rows[0]?.duration_days_without_saturday;
  const hasExplicitVariantDuration = includeSaturday
    ? explicitWithSaturday !== null && explicitWithSaturday !== undefined
    : explicitWithoutSaturday !== null && explicitWithoutSaturday !== undefined;
  const durationDays = includeSaturday
    ? Number(explicitWithSaturday || baseDurationDays)
    : Number(explicitWithoutSaturday || baseDurationDays);

  const existingSubRes = await queryRunner.query(
    `SELECT subscription_id, order_id, is_active, start_date, end_date, total_meals, used_meals, include_saturday
     FROM client_subscriptions
     WHERE client_id=$1 AND entity_id=$2 AND entity_type=$3 AND is_active=true AND order_id != $4
     FOR UPDATE`,
    [clientId, entityId, entityType, orderId]
  );
  const currentSub = existingSubRes.rows[0] || null;

  const sessionToday = mealEligibilityService.parseSessionToday();
  let baseDateYmd = parseYmdStrict(requestedStartDate) || sessionToday;
  // If variant-specific duration is configured, treat it as exact meal count.
  // Legacy plans without variant-specific durations keep old calendar-based counting behavior.
  let newTotalMeals = hasExplicitVariantDuration
    ? durationDays
    : computeMealCount(baseDateYmd, durationDays, includeSaturday);
  let newUsedMeals = 0;

  if (currentSub && currentSub.is_active && currentSub.order_id !== orderId) {
    const currentEndYmd = String(currentSub.end_date).slice(0, 10);
    if (currentEndYmd >= sessionToday) {
      const nextAfterCurrentEnd = addDaysYmd(currentEndYmd, 1);
      // No overlap and no day duplication: new pack starts the day after existing end.
      if (nextAfterCurrentEnd > baseDateYmd) {
        baseDateYmd = nextAfterCurrentEnd;
      }

      const oldTotal = currentSub.total_meals || 0;
      const oldUsed = currentSub.used_meals || 0;

      // Preserve old totals and used, just add new meals to total
      newTotalMeals = oldTotal + (
        hasExplicitVariantDuration
          ? durationDays
          : computeMealCount(baseDateYmd, durationDays, includeSaturday)
      );
      newUsedMeals = oldUsed;
    }
  }

  // Expiry is based on meal-service calendar:
  // - includeSaturday=false => Mon-Fri only
  // - includeSaturday=true  => Mon-Sat
  // - Sunday is always excluded
  const endDateYmd = computeEndDateByMealDays(baseDateYmd, durationDays, includeSaturday);

  const upsertRes = await queryRunner.query(
    `INSERT INTO client_subscriptions (client_id,subscription_id,entity_type,entity_id,start_date,end_date,order_id,is_active,total_meals,used_meals,include_saturday)
     VALUES ($1,$2,$3,$4,$8,$5,$6,true,$7,$9,$10)
     ON CONFLICT (client_id,entity_id,entity_type) DO UPDATE SET
       start_date=EXCLUDED.start_date, end_date=EXCLUDED.end_date, subscription_id=EXCLUDED.subscription_id,
       order_id=EXCLUDED.order_id, is_active=true, updated_at=NOW(),
       total_meals=EXCLUDED.total_meals, used_meals=EXCLUDED.used_meals, include_saturday=EXCLUDED.include_saturday
     RETURNING *`,
    [clientId, subscriptionId, entityType, entityId, endDateYmd, orderId, newTotalMeals, baseDateYmd, newUsedMeals, includeSaturday]
  );
  const nextSub = upsertRes.rows[0];
  if (currentSub && nextSub) {
    await recordSubscriptionHistory(queryRunner, {
      clientSubscriptionId: nextSub.id,
      clientId,
      entityType,
      entityId,
      previousSubscriptionId: currentSub.subscription_id,
      previousOrderId: currentSub.order_id,
      previousStartDate: currentSub.start_date,
      previousEndDate: currentSub.end_date,
      previousTotalMeals: currentSub.total_meals,
      previousUsedMeals: currentSub.used_meals,
      previousIncludeSaturday: currentSub.include_saturday,
      newSubscriptionId: nextSub.subscription_id,
      newOrderId: nextSub.order_id,
      newStartDate: nextSub.start_date,
      newEndDate: nextSub.end_date,
      newTotalMeals: nextSub.total_meals,
      newUsedMeals: nextSub.used_meals,
      newIncludeSaturday: nextSub.include_saturday,
      changeReason: 'renewal_or_reactivation',
    });
  }
};

/**
 * Master finalize: handles BOTH single-order and cart-order
 */
const finalizeSuccessfulPayment = async (orderId, source = 'unknown') => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const orderRes = await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [orderId]);
    if (orderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { finalized: false, reason: 'order_not_found' };
    }
    const order = orderRes.rows[0];
    if (order.status === 'completed') {
      await client.query('COMMIT');
      return { finalized: false, reason: 'already_completed' };
    }
    if (order.status !== 'pending') {
      await client.query('COMMIT');
      return { finalized: false, reason: `invalid_order_status_${order.status}` };
    }

    await client.query('UPDATE orders SET status=$1, updated_at=NOW(), payment_finalized_at=NOW(), payment_finalized_source=$2 WHERE id=$3', ['completed', source, orderId]);

    if (order.order_type === 'cart' && order.cart_id) {
      const cartItems = await client.query('SELECT * FROM cart_items WHERE cart_id=$1 FOR UPDATE', [order.cart_id]);
      for (const item of cartItems.rows) {
        await activateSingleSubscription(
          client,
          order.client_id,
          item.subscription_id,
          item.entity_type,
          item.entity_id,
          orderId,
          item.start_date,
          item.include_saturday !== false
        );
      }
      await client.query("UPDATE carts SET status='checked_out', updated_at=NOW() WHERE id=$1", [order.cart_id]);
    } else if (order.order_type === 'meal_size_upgrade') {
      await applyMealSizeUpgradeOrder(client, order);
    } else {
      await activateSingleSubscription(
        client,
        order.client_id,
        order.subscription_id,
        order.entity_type,
        order.entity_id,
        orderId,
        order.start_date,
        order.include_saturday !== false
      );
    }

    await client.query('COMMIT');
    return { finalized: true, reason: 'success' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const markTransactionStatus = async (merchantTransactionId, status, gatewayTransactionId, gatewayResponse) => {
  const result = await db.query(
    'UPDATE transactions SET status=$1, gateway_transaction_id=$2, gateway_response=$3, updated_at=NOW() WHERE merchant_transaction_id=$4 RETURNING *',
    [status, gatewayTransactionId || null, gatewayResponse || null, merchantTransactionId]
  );
  return result.rows[0] || null;
};

const processSuccessfulTransaction = async (merchantTransactionId, gatewayTransactionId, gatewayPayload, source) => {
  const peek = await db.query(
    'SELECT id, status, order_id, merchant_transaction_id FROM transactions WHERE merchant_transaction_id=$1',
    [merchantTransactionId]
  );
  if (peek.rows.length === 0) return null;
  if (peek.rows[0].status === 'success') {
    invalidateGatewayStatusCache(merchantTransactionId);
    return peek.rows[0];
  }

  const txn = await markTransactionStatus(merchantTransactionId, 'success', gatewayTransactionId, gatewayPayload);
  if (!txn) return null;
  await finalizeSuccessfulPayment(txn.order_id, source);
  invalidateGatewayStatusCache(merchantTransactionId);
  return txn;
};

const processFailedTransaction = async (merchantTransactionId, gatewayPayload, source) => {
  const txn = await markTransactionStatus(merchantTransactionId, 'failure', null, gatewayPayload);
  if (!txn) return null;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const orderRes = await client.query('SELECT status, order_type, cart_id FROM orders WHERE id=$1 FOR UPDATE', [txn.order_id]);
    if (orderRes.rows.length > 0 && orderRes.rows[0].status === 'pending') {
      const order = orderRes.rows[0];
      await client.query('UPDATE orders SET status=$1, updated_at=NOW(), payment_finalized_source=$2 WHERE id=$3', ['failed', source, txn.order_id]);
      
      if (order.order_type === 'cart' && order.cart_id) {
        // Clone the cart into a new 'active' cart so the user can continue shopping, 
        // while preserving the original cart_id snapshot for the failed order.
        const newCartRes = await client.query("INSERT INTO carts (client_id, status, total_amount) SELECT client_id, 'active', total_amount FROM carts WHERE id=$1 RETURNING id", [order.cart_id]);
        if (newCartRes.rows.length > 0) {
          const newCartId = newCartRes.rows[0].id;
          await client.query("INSERT INTO cart_items (cart_id, subscription_id, entity_type, entity_id, entity_name, unit_price, meal_size_id, meal_timing, include_saturday, start_date) SELECT $1, subscription_id, entity_type, entity_id, entity_name, unit_price, meal_size_id, meal_timing, include_saturday, start_date FROM cart_items WHERE cart_id=$2", [newCartId, order.cart_id]);
          // Mark the old cart as failed/abandoned so it's not picked up
          await client.query("UPDATE carts SET status='failed', updated_at=NOW() WHERE id=$1", [order.cart_id]);
        }
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  invalidateGatewayStatusCache(merchantTransactionId);
  return txn;
};

// ─── SINGLE PAYMENT ──────────────────────────────────────────────────────────

/**
 * @desc  Initiate single-entity payment
 * @route POST /api/client/payment/initiate
 */
exports.initiatePayment = catchAsync(async (req, res, next) => {
  const { subscriptionId, entityType, entityId, startDate, includeSaturday, redirectUrl: customRedirect } = req.body;
  const clientId = req.user.id;

  if (!subscriptionId || !entityType || !entityId)
    return next(new AppError('subscriptionId, entityType and entityId are required', 400));

  const sessionToday = mealEligibilityService.parseSessionToday();
  let effectiveStartDateYmd = sessionToday;
  if (startDate) {
    const parsed = parseYmdStrict(startDate);
    if (!parsed) {
      return next(new AppError('Invalid startDate format. Use YYYY-MM-DD', 400));
    }
    effectiveStartDateYmd = parsed;
    // ensure start date is not in the past (allow today) in session timezone
    if (effectiveStartDateYmd < sessionToday) {
      return next(new AppError('startDate cannot be in the past', 400));
    }
  }

  const owned = await validateEntityOwnership(entityType, entityId, clientId);
  if (!owned) return next(new AppError(`${entityType} profile not found or unauthorized`, 404));

  const subResult = await db.query('SELECT * FROM subscriptions WHERE id=$1 AND is_active=true', [subscriptionId]);
  if (subResult.rows.length === 0) return next(new AppError('Subscription plan not found', 404));
  const subscription = subResult.rows[0];
  const entityMealMeta = await resolveEntityMealMeta(entityType, entityId);
  
  if (subscription.meal_size_id && entityMealMeta.meal_size_id && subscription.meal_size_id !== entityMealMeta.meal_size_id) {
    return next(new AppError("The selected plan does not match this profile's meal size", 400));
  }
  
  const effectiveMealSizeId = entityMealMeta.meal_size_id || subscription.meal_size_id || null;
  const effectiveMealTiming = entityMealMeta.meal_timing || DEFAULT_MEAL_TIME;
  const includeSaturdayFlag = parseBoolean(includeSaturday, true);
  const selectedPrice = includeSaturdayFlag
    ? Number(subscription.price_with_saturday ?? subscription.price)
    : Number(subscription.price_without_saturday ?? subscription.price);
  if (!Number.isFinite(selectedPrice) || selectedPrice < 0) {
    return next(new AppError('Invalid subscription pricing configuration', 500));
  }
  const entityName = await resolveEntityName(entityType, entityId);

  const orderResult = await db.query(
    'INSERT INTO orders (client_id,subscription_id,entity_type,entity_id,amount,meal_size_id,meal_timing,include_saturday,status,order_type,start_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
    [clientId, subscriptionId, entityType, entityId, selectedPrice, effectiveMealSizeId, effectiveMealTiming, includeSaturdayFlag, 'pending', 'single', effectiveStartDateYmd]
  );
  const order = orderResult.rows[0];

  const merchantTransactionId = `TXN_${order.id.replace('ORD-', '')}_${Date.now()}`;
  await db.query(
    'INSERT INTO transactions (order_id,merchant_transaction_id,amount,status) VALUES ($1,$2,$3,$4)',
    [order.id, merchantTransactionId, selectedPrice, 'pending']
  );

  const clientData = await db.query('SELECT phone_number FROM clients WHERE id=$1', [clientId]);
  const finalRedirectUrl = sanitizeFrontendRedirectUrl(customRedirect || process.env.PHONEPE_REDIRECT_URL || DEFAULT_FRONTEND_REDIRECT);
  const backendCallbackUrl = `${resolveApiBaseUrl(req)}/api/client/payment/callback?tid=${merchantTransactionId}&frontendUrl=${encodeURIComponent(finalRedirectUrl)}`;

  const response = await phonepe.initiatePayment({
    transactionId: merchantTransactionId,
    userId: clientId,
    amount: selectedPrice,
    redirectUrl: backendCallbackUrl,
    mobileNumber: clientData.rows[0].phone_number.replace(/\D/g, '').slice(-10),
  });

  if (!response.success) return next(new AppError(response.message || 'Payment Gateway Error', 500));

  res.status(200).json({
    success: true,
    data: {
      orderId: order.id,
      merchantTransactionId,
      entityName,
      amount: selectedPrice,
      mealSizeId: effectiveMealSizeId,
      mealTiming: effectiveMealTiming,
      includeSaturday: includeSaturdayFlag,
      planVariant: includeSaturdayFlag ? 'with_saturday' : 'without_saturday',
      planName: subscription.plan_name,
      paymentUrl: response.data.instrumentResponse.redirectInfo.url,
    }
  });
});

/**
 * @desc Live upgrade options for an entity (from current profile meal size)
 * @route GET /api/client/payment/meal-size-upgrade/options
 */
exports.getMealSizeUpgradeOptions = catchAsync(async (req, res, next) => {
  const clientId = req.user.id;
  const entityType = req.query.entityType || req.query.entity_type;
  const entityId = req.query.entityId || req.query.entity_id;

  if (!entityType || !entityId) {
    return next(new AppError('entityType and entityId are required', 400));
  }

  const owned = await validateEntityOwnership(entityType, entityId, clientId);
  if (!owned) return next(new AppError(`${entityType} profile not found or unauthorized`, 404));

  const meta = await resolveEntityMealMeta(entityType, entityId);
  const fromId = meta.meal_size_id != null ? Number(meta.meal_size_id) : NaN;
  if (!Number.isFinite(fromId)) {
    return res.status(200).json({
      success: true,
      current_meal_size_id: null,
      current_meal_size_name: null,
      data: [],
    });
  }

  const currentRes = await db.query(
    'SELECT id, display_name, sort_order FROM meal_sizes WHERE id=$1 AND is_active=true',
    [fromId]
  );
  if (currentRes.rows.length === 0) {
    return next(new AppError('Current meal size is invalid or inactive', 400));
  }
  const currentRow = currentRes.rows[0];
  const currentSort = Number(currentRow.sort_order ?? 0);

  const priceRes = await db.query(
    `SELECT p.to_meal_size_id, p.price::text,
            t.display_name AS to_display_name,
            t.sort_order AS to_sort_order
     FROM meal_size_upgrade_prices p
     INNER JOIN meal_sizes t ON t.id = p.to_meal_size_id AND t.is_active = true
     WHERE p.from_meal_size_id = $1 AND p.is_active = true
       AND COALESCE(t.sort_order, 0) > $2
     ORDER BY t.sort_order ASC, t.id ASC`,
    [fromId, currentSort]
  );

  const { formatMoney } = require('../../common/utils/formatMoney');

  res.status(200).json({
    success: true,
    current_meal_size_id: fromId,
    current_meal_size_name: currentRow.display_name,
    data: priceRes.rows.map((row) => ({
      to_meal_size_id: row.to_meal_size_id,
      to_display_name: row.to_display_name,
      to_sort_order: row.to_sort_order,
      price: formatMoney(row.price),
    })),
  });
});

/**
 * @desc Paid bump of profile meal_size_id (requires admin-configured upgrade matrix)
 * @route POST /api/client/payment/meal-size-upgrade/initiate
 */
exports.initiateMealSizeUpgrade = catchAsync(async (req, res, next) => {
  const clientId = req.user.id;
  const { entityType, entityId, toMealSizeId, redirectUrl: customRedirect } = req.body || {};

  if (!entityType || !entityId || toMealSizeId === undefined || toMealSizeId === null) {
    return next(new AppError('entityType, entityId, and toMealSizeId are required', 400));
  }

  const owned = await validateEntityOwnership(entityType, entityId, clientId);
  if (!owned) return next(new AppError(`${entityType} profile not found or unauthorized`, 404));

  const toId = Number(toMealSizeId);
  if (!Number.isFinite(toId)) return next(new AppError('toMealSizeId must be numeric', 400));

  const meta = await resolveEntityMealMeta(entityType, entityId);
  const fromIdRaw = meta.meal_size_id;
  const fromId = fromIdRaw != null ? Number(fromIdRaw) : NaN;
  if (!Number.isFinite(fromId)) {
    return next(new AppError('Your profile does not have a meal size set yet', 400));
  }
  if (fromId === toId) {
    return next(new AppError('Select a different meal size than your current one', 400));
  }

  const toSizeCheck = await db.query('SELECT id FROM meal_sizes WHERE id=$1 AND is_active=true', [toId]);
  if (toSizeCheck.rows.length === 0) return next(new AppError('Invalid or inactive target meal size', 400));

  const priceRes = await db.query(
    `SELECT price::float AS price
     FROM meal_size_upgrade_prices
     WHERE from_meal_size_id=$1 AND to_meal_size_id=$2 AND is_active=true`,
    [fromId, toId]
  );
  if (priceRes.rows.length === 0) {
    return next(
      new AppError(
        'No upgrade price is published for this size change. Ask your administrator to add it under meal size upgrade prices.',
        404
      )
    );
  }
  const selectedPrice = Number(priceRes.rows[0].price);
  if (!Number.isFinite(selectedPrice) || selectedPrice < 0) {
    return next(new AppError('Invalid upgrade price configuration', 500));
  }

  const todayYmd = mealEligibilityService.parseSessionToday();
  const csRes = await db.query(
    `SELECT subscription_id, include_saturday
     FROM client_subscriptions
     WHERE client_id=$1 AND entity_type=$2 AND entity_id=$3 AND is_active=true
       AND DATE(end_date) >= $4::date
       AND (
         (total_meals - used_meals) > 0
         OR DATE(start_date) > $4::date
       )
     LIMIT 1`,
    [clientId, entityType, entityId, todayYmd]
  );
  if (csRes.rows.length === 0) {
    return next(
      new AppError(
        'An active or upcoming subscription is required to upgrade meal size. Subscribe first, then use Upgrade meal size.',
        400
      )
    );
  }

  const subscriptionId = csRes.rows[0].subscription_id;
  const includeSaturdayFlag = csRes.rows[0].include_saturday !== false;
  const effectiveMealTiming = meta.meal_timing || DEFAULT_MEAL_TIME;
  const entityName = await resolveEntityName(entityType, entityId);

  const orderResult = await db.query(
    `INSERT INTO orders (client_id, subscription_id, entity_type, entity_id, amount, meal_size_id, meal_timing, include_saturday, status, order_type, upgrade_from_meal_size_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      clientId,
      subscriptionId,
      entityType,
      entityId,
      selectedPrice,
      toId,
      effectiveMealTiming,
      includeSaturdayFlag,
      'pending',
      'meal_size_upgrade',
      fromId,
    ]
  );
  const order = orderResult.rows[0];

  const merchantTransactionId = `TXN_MZ_${order.id.replace('ORD-', '')}_${Date.now()}`;
  await db.query(
    'INSERT INTO transactions (order_id,merchant_transaction_id,amount,status) VALUES ($1,$2,$3,$4)',
    [order.id, merchantTransactionId, selectedPrice, 'pending']
  );

  const clientData = await db.query('SELECT phone_number FROM clients WHERE id=$1', [clientId]);
  const finalRedirectUrl = sanitizeFrontendRedirectUrl(customRedirect || process.env.PHONEPE_REDIRECT_URL || DEFAULT_FRONTEND_REDIRECT);
  const backendCallbackUrl = `${resolveApiBaseUrl(req)}/api/client/payment/callback?tid=${merchantTransactionId}&frontendUrl=${encodeURIComponent(finalRedirectUrl)}`;

  const response = await phonepe.initiatePayment({
    transactionId: merchantTransactionId,
    userId: clientId,
    amount: selectedPrice,
    redirectUrl: backendCallbackUrl,
    mobileNumber: clientData.rows[0].phone_number.replace(/\D/g, '').slice(-10),
  });

  if (!response.success) return next(new AppError(response.message || 'Payment Gateway Error', 500));

  res.status(200).json({
    success: true,
    data: {
      orderId: order.id,
      merchantTransactionId,
      entityName,
      amount: selectedPrice,
      fromMealSizeId: fromId,
      toMealSizeId: toId,
      paymentUrl: response.data.instrumentResponse.redirectInfo.url,
    },
  });
});

// ─── CART CHECKOUT PAYMENT ───────────────────────────────────────────────────

/**
 * @desc  Checkout entire cart — creates ONE order for the total amount
 * @route POST /api/client/payment/checkout-cart
 */
exports.checkoutCart = catchAsync(async (req, res, next) => {
  const clientId = req.user.id;
  const { redirectUrl: customRedirect } = req.body;

  const checkoutClient = await db.pool.connect();
  let cart;
  let items;
  let totalAmount;
  let order;
  let merchantTransactionId;
  try {
    await checkoutClient.query('BEGIN');
    const cartRes = await checkoutClient.query("SELECT * FROM carts WHERE client_id=$1 AND status='active' FOR UPDATE", [clientId]);
    if (cartRes.rows.length === 0) {
      await checkoutClient.query('ROLLBACK');
      return next(new AppError('Your cart is empty', 400));
    }

    cart = cartRes.rows[0];
    const itemsRes = await checkoutClient.query(
      `SELECT ci.*, s.plan_name, s.meal_size_id,
              s.price, s.price_with_saturday, s.price_without_saturday, s.is_active as subscription_active,
              ms.display_name AS meal_size_name
       FROM cart_items ci
       JOIN subscriptions s ON ci.subscription_id=s.id
       LEFT JOIN meal_sizes ms ON ms.id = ci.meal_size_id
       WHERE ci.cart_id=$1
       FOR UPDATE OF ci`,
      [cart.id]
    );
    if (itemsRes.rows.length === 0) {
      await checkoutClient.query('ROLLBACK');
      return next(new AppError('Your cart has no items', 400));
    }
    items = itemsRes;

    for (const item of items.rows) {
      if (!item.subscription_active) {
        await checkoutClient.query('ROLLBACK');
        return next(new AppError(`Plan ${item.plan_name} is no longer active. Please refresh cart.`, 409));
      }
      const latestPrice = Number(item.include_saturday !== false
        ? (item.price_with_saturday ?? item.price)
        : (item.price_without_saturday ?? item.price));
      const storedPrice = Number(item.unit_price);
      if (!Number.isFinite(latestPrice) || latestPrice < 0) {
        await checkoutClient.query('ROLLBACK');
        return next(new AppError(`Invalid pricing for plan ${item.plan_name}.`, 500));
      }
      if (Math.abs(latestPrice - storedPrice) > 0.0001) {
        await checkoutClient.query('ROLLBACK');
        return next(new AppError(`Price changed for ${item.entity_name || item.plan_name}. Please refresh your cart before checkout.`, 409));
      }
    }

    totalAmount = items.rows.reduce((sum, item) => sum + Number(item.unit_price || 0), 0);

    // Abandon any stuck 'pending' carts for this client (from previous failed/cancelled checkouts
    // that never got resolved). This prevents the unique constraint violation on (client_id, status).
    const stuckPendingCarts = await checkoutClient.query(
      "SELECT id FROM carts WHERE client_id=$1 AND status='pending' AND id != $2",
      [clientId, cart.id]
    );
    for (const stuckCart of stuckPendingCarts.rows) {
      // Mark stuck cart as 'failed'
      await checkoutClient.query("UPDATE carts SET status='failed', updated_at=NOW() WHERE id=$1", [stuckCart.id]);
      // Mark its associated pending order as 'failed' too
      await checkoutClient.query("UPDATE orders SET status='failed', updated_at=NOW() WHERE cart_id=$1 AND status='pending'", [stuckCart.id]);
      // Mark its transactions as 'failure'
      await checkoutClient.query(
        "UPDATE transactions SET status='failure', updated_at=NOW() WHERE order_id IN (SELECT id FROM orders WHERE cart_id=$1)",
        [stuckCart.id]
      );
    }

    await checkoutClient.query("UPDATE carts SET total_amount=$1, status='pending', updated_at=NOW() WHERE id=$2", [totalAmount, cart.id]);

    const orderResult = await checkoutClient.query(
      `INSERT INTO orders (client_id,subscription_id,entity_type,entity_id,amount,status,order_type,cart_id)
       VALUES ($1,$2,'cart','CART',$3,'pending','cart',$4) RETURNING *`,
      [clientId, items.rows[0].subscription_id, totalAmount, cart.id]
    );
    order = orderResult.rows[0];

    merchantTransactionId = `TXNC_${order.id.replace('ORD-', '')}_${Date.now()}`;
    await checkoutClient.query(
      'INSERT INTO transactions (order_id,merchant_transaction_id,amount,status) VALUES ($1,$2,$3,$4)',
      [order.id, merchantTransactionId, totalAmount, 'pending']
    );
    await checkoutClient.query('COMMIT');
  } catch (error) {
    await checkoutClient.query('ROLLBACK');
    throw error;
  } finally {
    checkoutClient.release();
  }

  const clientData = await db.query('SELECT phone_number FROM clients WHERE id=$1', [clientId]);
  const finalRedirectUrl = sanitizeFrontendRedirectUrl(customRedirect || process.env.PHONEPE_REDIRECT_URL || DEFAULT_FRONTEND_REDIRECT);
  const backendCallbackUrl = `${resolveApiBaseUrl(req)}/api/client/payment/callback?tid=${merchantTransactionId}&frontendUrl=${encodeURIComponent(finalRedirectUrl)}`;

  const response = await phonepe.initiatePayment({
    transactionId: merchantTransactionId,
    userId: clientId,
    amount: totalAmount,
    redirectUrl: backendCallbackUrl,
    mobileNumber: clientData.rows[0].phone_number.replace(/\D/g, '').slice(-10),
  });

  if (!response.success) return next(new AppError(response.message || 'Payment Gateway Error', 500));

  res.status(200).json({
    success: true,
    message: 'Cart checkout initiated. Redirect user to paymentUrl.',
    data: {
      orderId: order.id,
      merchantTransactionId,
      totalAmount,
      itemCount: items.rows.length,
      items: items.rows.map(i => ({ entityName: i.entity_name, entityType: i.entity_type, plan: i.plan_name, price: i.unit_price, mealSize: i.meal_size_name || null, mealTiming: i.meal_timing || DEFAULT_MEAL_TIME })),
      mealMeta: items.rows.map(i => ({
        entityName: i.entity_name,
        mealSizeId: i.meal_size_id || null,
        mealTiming: i.meal_timing || DEFAULT_MEAL_TIME,
      })),
      planVariants: items.rows.map(i => ({
        entityName: i.entity_name,
        includeSaturday: i.include_saturday !== false,
      })),
      paymentUrl: response.data.instrumentResponse.redirectInfo.url,
    }
  });
});

// ─── WEBHOOK & REDIRECT CALLBACK ──────────────────────────────────────────

/**
 * @desc  PhonePe async webhook — DO NOT authenticate this route
 * @route POST /api/client/payment/webhook
 */
exports.handleWebhook = catchAsync(async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body || {});
  const xVerify = req.headers['x-verify'];
  const webhookUsername = process.env.PHONEPE_WEBHOOK_USERNAME;
  const webhookPassword = process.env.PHONEPE_WEBHOOK_PASSWORD;
  if (!xVerify || !webhookUsername || !webhookPassword) {
    return res.status(401).send('Missing webhook verification headers');
  }
  let isValidSignature = false;
  try {
    isValidSignature = phonepe.validateCallback(webhookUsername, webhookPassword, xVerify, rawBody);
  } catch {
    return res.status(401).send('Invalid signature');
  }
  if (!isValidSignature) {
    return res.status(401).send('Invalid signature');
  }

  let body;
  try {
    body = Buffer.isBuffer(req.body) ? JSON.parse(rawBody) : req.body;
  } catch {
    return res.status(400).send('Malformed webhook body');
  }
  const payload = body.response || body.request;
  if (!payload) return res.status(400).send('Invalid Webhook');

  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
  } catch {
    return res.status(400).send('Malformed Payload');
  }

  const { success, code, data } = decoded;
  if (!data?.merchantTransactionId) return res.status(400).send('Missing merchantTransactionId');

  const mtxnId = data.merchantTransactionId || data.merchantOrderId;
  const status = (success && code === 'PAYMENT_SUCCESS') ? 'success' : 'failure';

  if (status === 'success') {
    await processSuccessfulTransaction(mtxnId, data.transactionId, decoded, 'webhook');
  } else {
    await processFailedTransaction(mtxnId, decoded, 'webhook');
  }

  res.status(200).send('OK');
});

/**
 * @desc  Instant Callback Redirect: PhonePe redirects user here first.
 *        We sync status instantly, then redirect user to their frontend.
 * @route POST /api/client/payment/callback
 *        GET /api/client/payment/callback
 */
exports.handleRedirectCallback = catchAsync(async (req, res) => {
  // PhonePe usually sends a POST request with transactionId, code, etc.
  const txnId = (req.body && req.body.transactionId) || req.query.tid || req.query.transactionId;
  const frontendUrl = sanitizeFrontendRedirectUrl(req.query.frontendUrl || process.env.PHONEPE_REDIRECT_URL || DEFAULT_FRONTEND_REDIRECT);

  if (!txnId) return res.redirect(`${frontendUrl}?status=error&message=NoTransactionId`);

  try {
    // 1. Instantly check status with PhonePe
    const gwRes = await getCachedGatewayStatus(txnId);
    
    // 2. Update DB locally
    if (gwRes.success && gwRes.data) {
      const rawState = gwRes.data.state || gwRes.data.status || gwRes.data.paymentState || '';
      const gwState = rawState.toString().toUpperCase();
      const isSuccess = ['COMPLETED', 'SUCCESS', 'PAYMENT_SUCCESS'].includes(gwState);
      const isFailure = ['FAILED', 'FAILURE', 'ERROR'].includes(gwState);

      const txnRes = await db.query('SELECT * FROM transactions WHERE merchant_transaction_id=$1', [txnId]);
      
      if (txnRes.rows.length > 0) {
        const localTxn = txnRes.rows[0];
        if (isSuccess) {
          await processSuccessfulTransaction(txnId, gwRes.data.transactionId, gwRes.data, 'redirect');
        } else if (isFailure) {
          await processFailedTransaction(txnId, gwRes.data, 'redirect');
        }
      }
    }
  } catch (err) {
    console.error('Instant Sync Error:', err.message);
  }

  // 3. Send user to the frontend exactly as requested!
  res.redirect(`${frontendUrl}?tid=${txnId}`);
});

// ─── STATUS SYNC ─────────────────────────────────────────────────────────────

/**
 * @desc  Poll PhonePe and sync local DB. Works for client (own txn) or admin (any txn).
 * @route GET /api/client/payment/status/:txnId  (client)
 *        GET /api/common/payment/status/:txnId  (admin/client shared)
 */
exports.checkPaymentStatus = catchAsync(async (req, res, next) => {
  const { txnId } = req.params;
  const clientId = req.user?.id;

  // Fetch transaction with full order and entity details
  const txnRes = await db.query(
    `SELECT t.*, o.status as order_status, o.order_type, o.cart_id,
            o.entity_type, o.entity_id, o.amount as order_amount, o.include_saturday, o.meal_size_id, o.meal_timing,
            o.client_id, s.plan_name, c.phone_number,
            CASE
              WHEN o.entity_type='child' THEN ch.name
              WHEN o.entity_type='teacher' THEN tp.name
              WHEN o.entity_type='professional' THEN pp.name
              WHEN o.entity_type='cart' THEN 'Cart Order'
            END as entity_name
     FROM transactions t
     JOIN orders o ON t.order_id=o.id
     JOIN clients c ON o.client_id=c.id
     LEFT JOIN subscriptions s ON o.subscription_id=s.id
     LEFT JOIN children ch ON o.entity_type='child' AND o.entity_id=ch.id
     LEFT JOIN teacher_profiles tp ON o.entity_type='teacher' AND o.entity_id=tp.id
     LEFT JOIN professional_profiles pp ON o.entity_type='professional' AND o.entity_id=pp.id
     WHERE t.merchant_transaction_id=$1`,
    [txnId]
  );

  if (txnRes.rows.length === 0) return next(new AppError('Transaction not found', 404));
  const localTxn = txnRes.rows[0];

  // Security: clients can only see their own transactions
  if (clientId && req.user.role === 'client' && localTxn.client_id !== clientId) {
    return next(new AppError('Unauthorized', 403));
  }

  // Poll PhonePe
  const gatewayRes = await getCachedGatewayStatus(txnId);
  if (!gatewayRes.success || !gatewayRes.data) {
    // Return local DB data even if gateway fails
    return res.status(200).json({
      success: true,
      source: 'local_db',
      data: buildStatusResponse(localTxn, null)
    });
  }

  const gwState = gatewayRes.data.state || gatewayRes.data.status || '';
  const isSuccess = ['COMPLETED', 'SUCCESS', 'PAYMENT_SUCCESS'].includes(gwState.toUpperCase());
  const isFailure = ['FAILED', 'FAILURE', 'ERROR'].includes(gwState.toUpperCase());

  // Sync if still pending
  if (isSuccess && localTxn.status === 'pending') {
    await processSuccessfulTransaction(txnId, gatewayRes.data.transactionId, gatewayRes.data, 'status_check');
    localTxn.status = 'success';
    localTxn.order_status = 'completed';
  } else if (isFailure && localTxn.status === 'pending') {
    await processFailedTransaction(txnId, gatewayRes.data, 'status_check');
    localTxn.status = 'failure';
    localTxn.order_status = 'failed';
  }

  // If cart order, attach cart items
  let cartItems = [];
  if (localTxn.order_type === 'cart' && localTxn.cart_id) {
    const ci = await db.query(
      `SELECT ci.*, s.plan_name, ms.display_name AS meal_size_name
       FROM cart_items ci
       JOIN subscriptions s ON ci.subscription_id=s.id
       LEFT JOIN meal_sizes ms ON ms.id = ci.meal_size_id
       WHERE ci.cart_id=$1`,
      [localTxn.cart_id]
    );
    cartItems = ci.rows;
  }

  res.status(200).json({
    success: true,
    source: 'gateway_synced',
    data: { ...buildStatusResponse(localTxn, gwState), cartItems }
  });
});

const buildStatusResponse = (txn, gwState) => ({
  transactionId: txn.merchant_transaction_id,
  gatewayTransactionId: txn.gateway_transaction_id,
  localStatus: txn.status,
  gatewayState: gwState,
  orderStatus: txn.order_status,
  orderType: txn.order_type,
  amountPaid: txn.order_amount,
  includeSaturday: txn.include_saturday,
  mealSizeId: txn.meal_size_id,
  mealTiming: txn.meal_timing || DEFAULT_MEAL_TIME,
  entityType: txn.entity_type,
  entityName: txn.entity_name,
  planName: txn.plan_name,
  clientPhone: txn.phone_number,
  createdAt: txn.created_at,
  updatedAt: txn.updated_at,
});

// ─── REDIRECT PAGE ───────────────────────────────────────────────────────────

/**
 * @desc  Browser redirect landing page — auto-syncs status
 * @route GET /api/client/payment/status-page?tid=TXN_xxx
 */
exports.statusPage = catchAsync(async (req, res) => {
  const { tid } = req.query;
  if (!tid) return res.status(400).send('<h1>Missing Transaction ID</h1>');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');

  const txnRes = await db.query('SELECT * FROM transactions WHERE merchant_transaction_id=$1', [tid]);
  let state = 'PENDING';
  let amountPaid = null;

  const gwRes = await getCachedGatewayStatus(tid);

  if (gwRes.success && gwRes.data) {
    const rawState = gwRes.data.state || gwRes.data.status || gwRes.data.paymentState || '';
    state = rawState.toString().toUpperCase();
  }

  if (txnRes.rows.length > 0) {
    const localTxn = txnRes.rows[0];
    amountPaid = localTxn.amount;

    const isSuccess = ['COMPLETED', 'SUCCESS'].includes(state.toUpperCase());
    const isFailure = ['FAILED', 'FAILURE'].includes(state.toUpperCase());

    if (isSuccess && localTxn.status === 'pending') {
      try {
        await processSuccessfulTransaction(tid, gwRes.data?.transactionId || null, gwRes.data || null, 'status_page');
      } catch (err) {
        console.error('❌ Finalize error on redirect:', err.message);
      }
    } else if (isFailure && localTxn.status === 'pending') {
      await processFailedTransaction(tid, gwRes.data || null, 'status_page');
    }
  }

  const isSuccess = ['COMPLETED', 'SUCCESS'].includes(state.toUpperCase());
  const color = isSuccess ? '#22c55e' : '#ef4444';
  const icon = isSuccess ? '✅' : '❌';
  const title = isSuccess ? 'Payment Successful!' : 'Payment Failed';
  const subtitle = isSuccess ? 'Your subscription has been activated.' : 'Something went wrong. Please try again.';
  const refLabel = maskMerchantTxnIdForPublicPage(tid);

  res.send(`<!DOCTYPE html><html><head><title>${title}</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f5f9;display:flex;align-items:center;justify-content:center;min-height:100vh}
      .card{background:#fff;padding:2.5rem 2rem;border-radius:1.25rem;box-shadow:0 8px 30px rgba(0,0,0,.1);text-align:center;max-width:420px;width:92%}
      .icon{font-size:4rem;margin-bottom:1rem}
      h1{color:#0f172a;font-size:1.5rem;margin-bottom:.5rem}
      .sub{color:#64748b;margin-bottom:1.5rem;font-size:.95rem}
      .row{display:flex;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid #f1f5f9;font-size:.9rem}
      .row span:first-child{color:#94a3b8}
      .row span:last-child{color:#1e293b;font-weight:600}
      .amount{font-size:1.5rem;color:${color};font-weight:700;margin:1rem 0}
      .btn{display:inline-block;margin-top:1.5rem;background:${color};color:#fff;padding:.75rem 2rem;border-radius:.5rem;text-decoration:none;font-weight:600;cursor:pointer}
    </style></head>
    <body><div class="card">
      <div class="icon">${icon}</div>
      <h1>${title}</h1>
      <p class="sub">${subtitle}</p>
      ${amountPaid ? `<div class="amount">₹${parseFloat(amountPaid).toFixed(2)}</div>` : ''}
      <div class="row"><span>Reference</span><span style="font-size:.75rem">${refLabel}</span></div>
      <p class="sub" style="font-size:.8rem;margin-top:.5rem">Open the app for full receipt details.</p>
      <a class="btn" href="#" onclick="window.close()">Close</a>
    </div></body></html>`);
});

// ─── PAYMENT HISTORY ─────────────────────────────────────────────────────────

/**
 * @desc  Client's full payment history with entity name + amount
 * @route GET /api/client/payment/history
 */
exports.getMyPaymentHistory = catchAsync(async (req, res) => {
  const clientId = req.user.id;
  const page = parsePositiveInt(req.query.page, 1);
  const limit = Math.min(parsePositiveInt(req.query.limit, 10), MAX_HISTORY_LIMIT);
  const offset = (page - 1) * limit;

  const result = await db.query(
    `SELECT o.id as order_id, o.status as order_status, o.order_type, o.amount, o.include_saturday, o.meal_timing,
            o.entity_type, o.entity_id, o.created_at,
            s.plan_name, ms.display_name AS meal_size_name,
            t.merchant_transaction_id, t.status as payment_status, t.gateway_transaction_id,
            CASE
              WHEN o.entity_type='child' THEN ch.name
              WHEN o.entity_type='teacher' THEN tp.name
              WHEN o.entity_type='professional' THEN pp.name
              WHEN o.entity_type='cart' THEN 'Cart Order'
            END as entity_name
     FROM orders o
     LEFT JOIN subscriptions s ON o.subscription_id=s.id
     LEFT JOIN meal_sizes ms ON o.meal_size_id = ms.id
     LEFT JOIN transactions t ON t.order_id=o.id
     LEFT JOIN children ch ON o.entity_type='child' AND o.entity_id=ch.id
     LEFT JOIN teacher_profiles tp ON o.entity_type='teacher' AND o.entity_id=tp.id
     LEFT JOIN professional_profiles pp ON o.entity_type='professional' AND o.entity_id=pp.id
     WHERE o.client_id=$1
     ORDER BY o.created_at DESC LIMIT $2 OFFSET $3`,
    [clientId, limit, offset]
  );

  const total = await db.query('SELECT COUNT(*) FROM orders WHERE client_id=$1', [clientId]);

  const { formatMoney } = require('../../common/utils/formatMoney');

  res.status(200).json({
    success: true,
    pagination: { total: parseInt(total.rows[0].count, 10), page, limit },
    data: result.rows.map((row) => ({
      ...row,
      amount: formatMoney(row.amount),
    })),
  });
});

/**
 * @desc  All active subscriptions for client (who subscribed, amount, expiry)
 * @route GET /api/client/payment/active-subscriptions
 */
exports.getMyActiveSubscriptions = catchAsync(async (req, res) => {
  const clientId = req.user.id;
  const today = mealEligibilityService.parseSessionToday();

  const result = await db.query(
    `SELECT cs.id, cs.entity_type, cs.entity_id, cs.is_active,
            s.plan_name, s.price, s.price_with_saturday, s.price_without_saturday, s.billing_cycle,
            o.amount as amount_paid,
            COALESCE(me.display_name, 'Large') AS meal_size_name,
            COALESCE(ch.meal_size_id, tp.meal_size_id, pp.meal_size_id) AS profile_meal_size_id,
            (cs.total_meals - cs.used_meals) AS remaining_meals,
            CASE
              WHEN cs.entity_type='child' THEN ch.meal_time
              WHEN cs.entity_type='teacher' THEN tp.meal_time
              WHEN cs.entity_type='professional' THEN pp.lunch_time
            END AS meal_timing,
            CASE
              WHEN cs.entity_type='child' THEN ch.name
              WHEN cs.entity_type='teacher' THEN tp.name
              WHEN cs.entity_type='professional' THEN pp.name
            END as entity_name,
            (DATE(cs.end_date) - $2::date) as days_remaining,
            cs.include_saturday,
            TO_CHAR(cs.start_date, 'YYYY-MM-DD') AS start_date,
            TO_CHAR(cs.end_date, 'YYYY-MM-DD') AS end_date
     FROM client_subscriptions cs
     JOIN subscriptions s ON cs.subscription_id=s.id
     LEFT JOIN orders o ON cs.order_id=o.id
     LEFT JOIN children ch ON cs.entity_type='child' AND cs.entity_id=ch.id
     LEFT JOIN teacher_profiles tp ON cs.entity_type='teacher' AND cs.entity_id=tp.id
     LEFT JOIN professional_profiles pp ON cs.entity_type='professional' AND cs.entity_id=pp.id
     LEFT JOIN meal_sizes me ON me.id = COALESCE(ch.meal_size_id, tp.meal_size_id, pp.meal_size_id, s.meal_size_id)
    WHERE cs.client_id=$1 AND cs.is_active=true
      AND DATE(cs.end_date) >= $2::date
      AND (
        (cs.total_meals - cs.used_meals) > 0
        OR DATE(cs.start_date) > $2::date
      )
     ORDER BY cs.start_date ASC, cs.end_date ASC`,
    [clientId, today]
  );

  const { formatMoney } = require('../../common/utils/formatMoney');

  res.status(200).json({
    success: true,
    has_active_subscription: result.rowCount > 0,
    count: result.rowCount,
    data: result.rows.map((row) => ({
      ...row,
      amount_paid: formatMoney(row.amount_paid),
    })),
  });
});

/**
 * @desc  FORCE SYNC — Manually finalize a payment if webhook/redirect both failed
 * @route POST /api/client/payment/force-sync/:txnId
 * @note  Client can only sync their own. Admin can sync any.
 */
exports.forceSync = catchAsync(async (req, res, next) => {
  const { txnId } = req.params;
  const clientId = req.user?.id;

  const txnRes = await db.query(
    'SELECT t.*, o.client_id, o.status as order_status FROM transactions t JOIN orders o ON t.order_id=o.id WHERE t.merchant_transaction_id=$1',
    [txnId]
  );
  if (txnRes.rows.length === 0) return next(new AppError('Transaction not found', 404));

  const localTxn = txnRes.rows[0];
  if (clientId && req.user.role === 'client' && localTxn.client_id !== clientId) {
    return next(new AppError('Unauthorized', 403));
  }

  if (localTxn.status !== 'pending') {
    return res.status(200).json({
      success: true,
      message: `Payment already ${localTxn.status}. No sync needed.`,
      data: { localStatus: localTxn.status, orderStatus: localTxn.order_status }
    });
  }

  const gwRes = await getCachedGatewayStatus(txnId);

  if (!gwRes.success || !gwRes.data) {
    return next(new AppError('Unable to reach PhonePe gateway. Try again in a few seconds.', 502));
  }

  const rawState = gwRes.data.state || gwRes.data.status || gwRes.data.paymentState || '';
  const gwState = rawState.toString().toUpperCase();
  const isSuccess = ['COMPLETED', 'SUCCESS', 'PAYMENT_SUCCESS'].includes(gwState);
  const isFailure = ['FAILED', 'FAILURE', 'ERROR'].includes(gwState);

  if (isSuccess) {
    await processSuccessfulTransaction(txnId, gwRes.data.transactionId, gwRes.data, 'force_sync');
    return res.status(200).json({ success: true, message: 'Payment synced and subscription activated!', gatewayState: gwState });
  } else if (isFailure) {
    await processFailedTransaction(txnId, gwRes.data, 'force_sync');
    return res.status(200).json({ success: true, message: 'Payment marked as failed.', gatewayState: gwState });
  } else {
    return res.status(200).json({ success: true, message: `Payment still ${gwState}. Not finalized yet.`, gatewayState: gwState });
  }
});