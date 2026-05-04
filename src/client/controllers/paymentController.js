const db = require('../../common/database');
const phonepe = require('../../common/utils/phonepe');
const AppError = require('../../common/utils/AppError');
const catchAsync = require('../../common/utils/catchAsync');

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

/**
 * Core function: finalize ONE subscription after successful payment
 */
const activateSingleSubscription = async (clientId, subscriptionId, entityType, entityId, orderId, requestedStartDate) => {
  const subRes = await db.query('SELECT billing_cycle FROM subscriptions WHERE id=$1', [subscriptionId]);
  const billingCycle = subRes.rows[0].billing_cycle.toLowerCase();

  // Calculate total meal days from billing cycle
  let totalMeals = 30; // default
  if (billingCycle.includes('month')) totalMeals = 30;
  else if (billingCycle.includes('quarter')) totalMeals = 90;
  else if (billingCycle.includes('year')) totalMeals = 365;
  else if (billingCycle.includes('week')) totalMeals = 7;

  const existingSub = await db.query(
    'SELECT end_date, total_meals, used_meals FROM client_subscriptions WHERE client_id=$1 AND entity_id=$2 AND entity_type=$3 AND is_active=true AND order_id != $4',
    [clientId, entityId, entityType, orderId]
  );

  let baseDate = requestedStartDate ? new Date(requestedStartDate) : new Date();
  let newTotalMeals = totalMeals;
  let newUsedMeals = 0;

  if (existingSub.rows.length > 0 && new Date(existingSub.rows[0].end_date) > new Date()) {
    const currentEnd = new Date(existingSub.rows[0].end_date);
    // If existing subscription is still active and ends after requested start date, extend from current end
    if (currentEnd > baseDate) {
      baseDate = currentEnd;
    }
    const oldTotal = existingSub.rows[0].total_meals || 0;
    const oldUsed = existingSub.rows[0].used_meals || 0;
    
    // Preserve old totals and used, just add new meals to total
    newTotalMeals = oldTotal + totalMeals;
    newUsedMeals = oldUsed;
  }

  let endDate = new Date(baseDate);
  if (billingCycle.includes('month')) endDate.setMonth(endDate.getMonth() + 1);
  else if (billingCycle.includes('quarter')) endDate.setMonth(endDate.getMonth() + 3);
  else if (billingCycle.includes('year')) endDate.setFullYear(endDate.getFullYear() + 1);
  else if (billingCycle.includes('week')) endDate.setDate(endDate.getDate() + 7);
  else endDate.setDate(endDate.getDate() + 30);

  await db.query(
    `INSERT INTO client_subscriptions (client_id,subscription_id,entity_type,entity_id,start_date,end_date,order_id,is_active,total_meals,used_meals)
     VALUES ($1,$2,$3,$4,$8,$5,$6,true,$7,$9)
     ON CONFLICT (client_id,entity_id,entity_type) DO UPDATE SET
       start_date=EXCLUDED.start_date, end_date=EXCLUDED.end_date, subscription_id=EXCLUDED.subscription_id,
       order_id=EXCLUDED.order_id, is_active=true, updated_at=NOW(),
       total_meals=EXCLUDED.total_meals, used_meals=EXCLUDED.used_meals`,
    [clientId, subscriptionId, entityType, entityId, endDate, orderId, newTotalMeals, baseDate, newUsedMeals]
  );
};

/**
 * Master finalize: handles BOTH single-order and cart-order
 */
const finalizeSuccessfulPayment = async (orderId) => {
  // 1. Mark order as completed
  await db.query('UPDATE orders SET status=$1, updated_at=NOW() WHERE id=$2', ['completed', orderId]);

  const orderRes = await db.query('SELECT * FROM orders WHERE id=$1', [orderId]);
  const order = orderRes.rows[0];

  if (order.order_type === 'cart' && order.cart_id) {
    // CART ORDER — activate subscriptions for every cart item
    const cartItems = await db.query('SELECT * FROM cart_items WHERE cart_id=$1', [order.cart_id]);
    for (const item of cartItems.rows) {
      await activateSingleSubscription(order.client_id, item.subscription_id, item.entity_type, item.entity_id, orderId, item.start_date);
    }
    // Mark cart as checked out
    await db.query("UPDATE carts SET status='checked_out', updated_at=NOW() WHERE id=$1", [order.cart_id]);
  } else {
    // SINGLE ORDER
    await activateSingleSubscription(order.client_id, order.subscription_id, order.entity_type, order.entity_id, orderId, order.start_date);
  }

  console.log(`✅ Payment finalized for order: ${orderId} (type: ${order.order_type})`);
};

// ─── SINGLE PAYMENT ──────────────────────────────────────────────────────────

/**
 * @desc  Initiate single-entity payment
 * @route POST /api/client/payment/initiate
 */
exports.initiatePayment = catchAsync(async (req, res, next) => {
  const { subscriptionId, entityType, entityId, startDate, redirectUrl: customRedirect } = req.body;
  const clientId = req.user.id;

  if (!subscriptionId || !entityType || !entityId)
    return next(new AppError('subscriptionId, entityType and entityId are required', 400));

  let effectiveStartDate = new Date();
  if (startDate) {
    effectiveStartDate = new Date(startDate);
    if (isNaN(effectiveStartDate.getTime())) {
      return next(new AppError('Invalid startDate format', 400));
    }
    // ensure start date is not in the past (allow today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (effectiveStartDate < today) {
      return next(new AppError('startDate cannot be in the past', 400));
    }
  }

  const owned = await validateEntityOwnership(entityType, entityId, clientId);
  if (!owned) return next(new AppError(`${entityType} profile not found or unauthorized`, 404));

  const subResult = await db.query('SELECT * FROM subscriptions WHERE id=$1 AND is_active=true', [subscriptionId]);
  if (subResult.rows.length === 0) return next(new AppError('Subscription plan not found', 404));

  const subscription = subResult.rows[0];
  const entityName = await resolveEntityName(entityType, entityId);

  const orderResult = await db.query(
    'INSERT INTO orders (client_id,subscription_id,entity_type,entity_id,amount,status,order_type,start_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
    [clientId, subscriptionId, entityType, entityId, subscription.price, 'pending', 'single', effectiveStartDate.toISOString().split('T')[0]]
  );
  const order = orderResult.rows[0];

  const merchantTransactionId = `TXN_${order.id.replace('ORD-', '')}_${Date.now()}`;
  await db.query(
    'INSERT INTO transactions (order_id,merchant_transaction_id,amount,status) VALUES ($1,$2,$3,$4)',
    [order.id, merchantTransactionId, subscription.price, 'pending']
  );

  const clientData = await db.query('SELECT phone_number FROM clients WHERE id=$1', [clientId]);
  const finalRedirectUrl = customRedirect || process.env.PHONEPE_REDIRECT_URL || 'https://yourdomain.com/payment-result';
  const backendCallbackUrl = `${req.protocol}://${req.get('host')}/api/client/payment/callback?tid=${merchantTransactionId}&frontendUrl=${encodeURIComponent(finalRedirectUrl)}`;

  const response = await phonepe.initiatePayment({
    transactionId: merchantTransactionId,
    userId: clientId,
    amount: subscription.price,
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
      amount: subscription.price,
      planName: subscription.plan_name,
      paymentUrl: response.data.instrumentResponse.redirectInfo.url,
    }
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

  const cartRes = await db.query("SELECT * FROM carts WHERE client_id=$1 AND status='active'", [clientId]);
  if (cartRes.rows.length === 0) return next(new AppError('Your cart is empty', 400));

  const cart = cartRes.rows[0];
  const items = await db.query(
    'SELECT ci.*, s.plan_name FROM cart_items ci JOIN subscriptions s ON ci.subscription_id=s.id WHERE ci.cart_id=$1',
    [cart.id]
  );
  if (items.rows.length === 0) return next(new AppError('Your cart has no items', 400));

  const totalAmount = parseFloat(cart.total_amount);

  // Create a single cart-order (subscription_id from first item for reference, entity_type='cart')
  const orderResult = await db.query(
    `INSERT INTO orders (client_id,subscription_id,entity_type,entity_id,amount,status,order_type,cart_id)
     VALUES ($1,$2,'cart','CART',   $3,'pending','cart',$4) RETURNING *`,
    [clientId, items.rows[0].subscription_id, totalAmount, cart.id]
  );
  const order = orderResult.rows[0];

  const merchantTransactionId = `TXNC_${order.id.replace('ORD-', '')}_${Date.now()}`;
  await db.query(
    'INSERT INTO transactions (order_id,merchant_transaction_id,amount,status) VALUES ($1,$2,$3,$4)',
    [order.id, merchantTransactionId, totalAmount, 'pending']
  );

  const clientData = await db.query('SELECT phone_number FROM clients WHERE id=$1', [clientId]);
  const finalRedirectUrl = customRedirect || process.env.PHONEPE_REDIRECT_URL || 'https://yourdomain.com/payment-result';
  const backendCallbackUrl = `${req.protocol}://${req.get('host')}/api/client/payment/callback?tid=${merchantTransactionId}&frontendUrl=${encodeURIComponent(finalRedirectUrl)}`;

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
      items: items.rows.map(i => ({ entityName: i.entity_name, entityType: i.entity_type, plan: i.plan_name, price: i.unit_price })),
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
  const payload = req.body.response || req.body.request;
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

  const txnResult = await db.query(
    'UPDATE transactions SET status=$1, gateway_transaction_id=$2, gateway_response=$3, updated_at=NOW() WHERE merchant_transaction_id=$4 RETURNING *',
    [status, data.transactionId, decoded, mtxnId]
  );

  if (txnResult.rows.length > 0) {
    if (status === 'success') {
      await finalizeSuccessfulPayment(txnResult.rows[0].order_id);
    } else {
      await db.query('UPDATE orders SET status=$1, updated_at=NOW() WHERE id=$2', ['failed', txnResult.rows[0].order_id]);
    }
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
  const frontendUrl = req.query.frontendUrl || 'https://yourdomain.com/payment-result';

  if (!txnId) return res.redirect(`${frontendUrl}?status=error&message=NoTransactionId`);

  try {
    // 1. Instantly check status with PhonePe
    const gwRes = await phonepe.checkStatus(txnId);
    
    // 2. Update DB locally
    if (gwRes.success && gwRes.data) {
      const rawState = gwRes.data.state || gwRes.data.status || gwRes.data.paymentState || '';
      const gwState = rawState.toString().toUpperCase();
      const isSuccess = ['COMPLETED', 'SUCCESS', 'PAYMENT_SUCCESS'].includes(gwState);
      const isFailure = ['FAILED', 'FAILURE', 'ERROR'].includes(gwState);

      const txnRes = await db.query('SELECT * FROM transactions WHERE merchant_transaction_id=$1 AND status=$2', [txnId, 'pending']);
      
      if (txnRes.rows.length > 0) {
        const localTxn = txnRes.rows[0];
        if (isSuccess) {
          await db.query(
            'UPDATE transactions SET status=$1,gateway_transaction_id=$2,gateway_response=$3,updated_at=NOW() WHERE merchant_transaction_id=$4',
            ['success', gwRes.data.transactionId, gwRes.data, txnId]
          );
          await finalizeSuccessfulPayment(localTxn.order_id);
        } else if (isFailure) {
          await db.query('UPDATE transactions SET status=$1,updated_at=NOW() WHERE merchant_transaction_id=$2', ['failure', txnId]);
          await db.query('UPDATE orders SET status=$1,updated_at=NOW() WHERE id=$2', ['failed', localTxn.order_id]);
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
            o.entity_type, o.entity_id, o.amount as order_amount,
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
  const gatewayRes = await phonepe.checkStatus(txnId);
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
    await db.query(
      'UPDATE transactions SET status=$1,gateway_transaction_id=$2,gateway_response=$3,updated_at=NOW() WHERE merchant_transaction_id=$4',
      ['success', gatewayRes.data.transactionId, gatewayRes.data, txnId]
    );
    await finalizeSuccessfulPayment(localTxn.order_id);
    localTxn.status = 'success';
    localTxn.order_status = 'completed';
  } else if (isFailure && localTxn.status === 'pending') {
    await db.query('UPDATE transactions SET status=$1,updated_at=NOW() WHERE merchant_transaction_id=$2', ['failure', txnId]);
    await db.query('UPDATE orders SET status=$1,updated_at=NOW() WHERE id=$2', ['failed', localTxn.order_id]);
    localTxn.status = 'failure';
    localTxn.order_status = 'failed';
  }

  // If cart order, attach cart items
  let cartItems = [];
  if (localTxn.order_type === 'cart' && localTxn.cart_id) {
    const ci = await db.query(
      'SELECT ci.*,s.plan_name FROM cart_items ci JOIN subscriptions s ON ci.subscription_id=s.id WHERE ci.cart_id=$1',
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

  const txnRes = await db.query('SELECT * FROM transactions WHERE merchant_transaction_id=$1', [tid]);
  let state = 'PENDING';
  let amountPaid = null;
  let entityName = null;

  const gwRes = await phonepe.checkStatus(tid);
  // DEBUG: log raw PhonePe response to identify actual field names
  console.log('📲 PhonePe statusPage RAW for', tid, ':', JSON.stringify(gwRes, null, 2));

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
        await db.query(
          'UPDATE transactions SET status=$1,gateway_transaction_id=$2,gateway_response=$3,updated_at=NOW() WHERE merchant_transaction_id=$4',
          ['success', gwRes.data?.transactionId || null, gwRes.data || null, tid]
        );
        await finalizeSuccessfulPayment(localTxn.order_id);
      } catch (err) {
        console.error('❌ Finalize error on redirect:', err.message);
      }
    } else if (isFailure && localTxn.status === 'pending') {
      await db.query('UPDATE transactions SET status=$1,updated_at=NOW() WHERE merchant_transaction_id=$2', ['failure', tid]);
      await db.query('UPDATE orders SET status=$1,updated_at=NOW() WHERE id=$2', ['failed', localTxn.order_id]);
    }

    // Fetch entity name for display
    const orderRes = await db.query(
      `SELECT o.entity_type, o.entity_id, o.order_type,
        CASE WHEN o.entity_type='child' THEN ch.name
             WHEN o.entity_type='teacher' THEN tp.name
             WHEN o.entity_type='professional' THEN pp.name
             WHEN o.entity_type='cart' THEN 'Cart Order'
        END as entity_name
       FROM orders o
       LEFT JOIN children ch ON o.entity_type='child' AND o.entity_id=ch.id
       LEFT JOIN teacher_profiles tp ON o.entity_type='teacher' AND o.entity_id=tp.id
       LEFT JOIN professional_profiles pp ON o.entity_type='professional' AND o.entity_id=pp.id
       WHERE o.id=$1`, [localTxn.order_id]
    );
    if (orderRes.rows.length > 0) entityName = orderRes.rows[0].entity_name;
  }

  const isSuccess = ['COMPLETED', 'SUCCESS'].includes(state.toUpperCase());
  const color = isSuccess ? '#22c55e' : '#ef4444';
  const icon = isSuccess ? '✅' : '❌';
  const title = isSuccess ? 'Payment Successful!' : 'Payment Failed';
  const subtitle = isSuccess ? 'Your subscription has been activated.' : 'Something went wrong. Please try again.';

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
      <div class="row"><span>For</span><span>${entityName || '—'}</span></div>
      <div class="row"><span>Transaction ID</span><span style="font-size:.75rem">${tid}</span></div>
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
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  const result = await db.query(
    `SELECT o.id as order_id, o.status as order_status, o.order_type, o.amount,
            o.entity_type, o.entity_id, o.created_at,
            s.plan_name,
            t.merchant_transaction_id, t.status as payment_status, t.gateway_transaction_id,
            CASE
              WHEN o.entity_type='child' THEN ch.name
              WHEN o.entity_type='teacher' THEN tp.name
              WHEN o.entity_type='professional' THEN pp.name
              WHEN o.entity_type='cart' THEN 'Cart Order'
            END as entity_name
     FROM orders o
     LEFT JOIN subscriptions s ON o.subscription_id=s.id
     LEFT JOIN transactions t ON t.order_id=o.id
     LEFT JOIN children ch ON o.entity_type='child' AND o.entity_id=ch.id
     LEFT JOIN teacher_profiles tp ON o.entity_type='teacher' AND o.entity_id=tp.id
     LEFT JOIN professional_profiles pp ON o.entity_type='professional' AND o.entity_id=pp.id
     WHERE o.client_id=$1
     ORDER BY o.created_at DESC LIMIT $2 OFFSET $3`,
    [clientId, limit, offset]
  );

  const total = await db.query('SELECT COUNT(*) FROM orders WHERE client_id=$1', [clientId]);

  res.status(200).json({
    success: true,
    pagination: { total: parseInt(total.rows[0].count), page: parseInt(page), limit: parseInt(limit) },
    data: result.rows
  });
});

/**
 * @desc  All active subscriptions for client (who subscribed, amount, expiry)
 * @route GET /api/client/payment/active-subscriptions
 */
exports.getMyActiveSubscriptions = catchAsync(async (req, res) => {
  const clientId = req.user.id;

  const result = await db.query(
    `SELECT cs.id, cs.entity_type, cs.entity_id, cs.start_date, cs.end_date, cs.is_active,
            s.plan_name, s.price, s.billing_cycle,
            o.amount as amount_paid,
            CASE
              WHEN cs.entity_type='child' THEN ch.name
              WHEN cs.entity_type='teacher' THEN tp.name
              WHEN cs.entity_type='professional' THEN pp.name
            END as entity_name,
            EXTRACT(DAY FROM cs.end_date - NOW()) as days_remaining
     FROM client_subscriptions cs
     JOIN subscriptions s ON cs.subscription_id=s.id
     LEFT JOIN orders o ON cs.order_id=o.id
     LEFT JOIN children ch ON cs.entity_type='child' AND cs.entity_id=ch.id
     LEFT JOIN teacher_profiles tp ON cs.entity_type='teacher' AND cs.entity_id=tp.id
     LEFT JOIN professional_profiles pp ON cs.entity_type='professional' AND cs.entity_id=pp.id
     WHERE cs.client_id=$1 AND cs.is_active=true AND cs.end_date > NOW()
     ORDER BY cs.end_date ASC`,
    [clientId]
  );

  res.status(200).json({
    success: true,
    has_active_subscription: result.rowCount > 0,
    count: result.rowCount,
    data: result.rows
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

  const gwRes = await phonepe.checkStatus(txnId);
  console.log('🔄 Force-sync RAW response:', JSON.stringify(gwRes, null, 2));

  if (!gwRes.success || !gwRes.data) {
    return next(new AppError('Unable to reach PhonePe gateway. Try again in a few seconds.', 502));
  }

  const rawState = gwRes.data.state || gwRes.data.status || gwRes.data.paymentState || '';
  const gwState = rawState.toString().toUpperCase();
  const isSuccess = ['COMPLETED', 'SUCCESS', 'PAYMENT_SUCCESS'].includes(gwState);
  const isFailure = ['FAILED', 'FAILURE', 'ERROR'].includes(gwState);

  if (isSuccess) {
    await db.query(
      'UPDATE transactions SET status=$1,gateway_transaction_id=$2,gateway_response=$3,updated_at=NOW() WHERE merchant_transaction_id=$4',
      ['success', gwRes.data.transactionId, gwRes.data, txnId]
    );
    await finalizeSuccessfulPayment(localTxn.order_id);
    return res.status(200).json({ success: true, message: 'Payment synced and subscription activated!', gatewayState: gwState });
  } else if (isFailure) {
    await db.query('UPDATE transactions SET status=$1,updated_at=NOW() WHERE merchant_transaction_id=$2', ['failure', txnId]);
    await db.query('UPDATE orders SET status=$1,updated_at=NOW() WHERE id=$2', ['failed', localTxn.order_id]);
    return res.status(200).json({ success: true, message: 'Payment marked as failed.', gatewayState: gwState });
  } else {
    return res.status(200).json({ success: true, message: `Payment still ${gwState}. Not finalized yet.`, gatewayState: gwState });
  }
});


