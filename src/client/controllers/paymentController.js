const db = require('../../common/database');
const phonepe = require('../../common/utils/phonepe');
const AppError = require('../../common/utils/AppError');
const catchAsync = require('../../common/utils/catchAsync');

/**
 * @desc    Helper to update order and activate subscription on success
 */
const finalizeSuccessfulPayment = async (orderId, gatewayResponse) => {
  // 1. Update Order
  await db.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2', ['completed', orderId]);

  // 2. Fetch order details for subscription activation
  const orderRes = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);
  const order = orderRes.rows[0];

  const subRes = await db.query('SELECT billing_cycle FROM subscriptions WHERE id = $1', [order.subscription_id]);
  const billingCycle = subRes.rows[0].billing_cycle.toLowerCase();

  // Industrial Renewal Logic: Check if there's an existing active subscription to EXTEND it
  const existingSub = await db.query(
    'SELECT end_date FROM client_subscriptions WHERE client_id = $1 AND entity_id = $2 AND entity_type = $3 AND is_active = true',
    [order.client_id, order.entity_id, order.entity_type]
  );

  let startDate = new Date();
  let baseDate = new Date();

  // If already active, extend from the current end_date. Otherwise, start from now.
  if (existingSub.rows.length > 0 && new Date(existingSub.rows[0].end_date) > new Date()) {
    baseDate = new Date(existingSub.rows[0].end_date);
  }

  let endDate = new Date(baseDate);
  if (billingCycle.includes('month')) endDate.setMonth(endDate.getMonth() + 1);
  else if (billingCycle.includes('year')) endDate.setFullYear(endDate.getFullYear() + 1);
  else endDate.setDate(endDate.getDate() + 30);

  // 3. Upsert into client_subscriptions
  await db.query(
    `INSERT INTO client_subscriptions (client_id, subscription_id, entity_type, entity_id, start_date, end_date, order_id) 
     VALUES ($1, $2, $3, $4, $7, $5, $6)
     ON CONFLICT (client_id, entity_id, entity_type) DO UPDATE SET 
        end_date = $5, 
        subscription_id = $2,
        order_id = $6,
        is_active = true,
        updated_at = NOW()`,
    [order.client_id, order.subscription_id, order.entity_type, order.entity_id, endDate, order.id, startDate]
  );
};

/**
 * @desc    Initiate payment with Industrial Standard Redirection logic
 */
exports.initiatePayment = catchAsync(async (req, res, next) => {
  const { subscriptionId, entityType, entityId, customRedirectUrl } = req.body;
  const clientId = req.user.id;

  if (!subscriptionId || !entityType || !entityId) {
    return next(new AppError('Subscription ID, Entity Type, and Entity ID are required', 400));
  }

  // Industrial Validation
  let entityExists = false;
  if (entityType === 'child') {
    const check = await db.query('SELECT id FROM children WHERE id = $1 AND parent_id = $2', [entityId, clientId]);
    entityExists = check.rows.length > 0;
  } else if (entityType === 'teacher') {
    const check = await db.query('SELECT id FROM teacher_profiles WHERE id = $1 AND client_id = $2', [entityId, clientId]);
    entityExists = check.rows.length > 0;
  } else if (entityType === 'professional') {
    const check = await db.query('SELECT id FROM professional_profiles WHERE id = $1 AND client_id = $2', [entityId, clientId]);
    entityExists = check.rows.length > 0;
  }

  if (!entityExists) {
    return next(new AppError(`${entityType} profile not found or unauthorized access`, 404));
  }

  const subResult = await db.query('SELECT * FROM subscriptions WHERE id = $1 AND is_active = true', [subscriptionId]);
  if (subResult.rows.length === 0) return next(new AppError('Subscription plan not found', 404));
  
  const subscription = subResult.rows[0];
  const orderResult = await db.query(
    'INSERT INTO orders (client_id, subscription_id, entity_type, entity_id, amount, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [clientId, subscriptionId, entityType, entityId, subscription.price, 'pending']
  );
  const order = orderResult.rows[0];

  const merchantTransactionId = `TXN_${order.id.split('-')[1]}_${Date.now()}`;

  await db.query(
    'INSERT INTO transactions (order_id, merchant_transaction_id, amount, status) VALUES ($1, $2, $3, $4)',
    [order.id, merchantTransactionId, subscription.price, 'pending']
  );

  const clientData = await db.query('SELECT phone_number FROM clients WHERE id = $1', [clientId]);
  const phone = clientData.rows[0].phone_number;

  const finalRedirectUrl = customRedirectUrl || process.env.PHONEPE_REDIRECT_URL;
  
  const paymentData = {
    transactionId: merchantTransactionId,
    userId: clientId,
    amount: subscription.price,
    redirectUrl: `${finalRedirectUrl}?tid=${merchantTransactionId}`,
    mobileNumber: phone.replace(/\D/g, '').slice(-10),
  };

  const response = await phonepe.initiatePayment(paymentData);

  if (response.success) {
    res.status(200).json({
      success: true,
      data: {
        orderId: order.id,
        merchantTransactionId: merchantTransactionId,
        paymentUrl: response.data.instrumentResponse.redirectInfo.url
      }
    });
  } else {
    return next(new AppError(response.message || 'Payment Gateway Error', 500));
  }
});

/**
 * @desc    Asynchronous Status Update (Webhook)
 */
exports.handleWebhook = catchAsync(async (req, res) => {
  const { request } = req.body;
  if (!request) return res.status(400).send('Invalid Webhook');

  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(request, 'base64').toString('utf-8'));
  } catch (err) {
    console.error('Industrial Webhook Error: Malformed JSON payload');
    return res.status(400).send('Malformed Payload');
  }

  const { success, code, data } = decoded;

  const merchantTransactionId = data.merchantTransactionId;
  const transactionStatus = (success && code === 'PAYMENT_SUCCESS') ? 'success' : 'failure';

  const txnResult = await db.query(
    'UPDATE transactions SET status = $1, gateway_transaction_id = $2, gateway_response = $3, updated_at = NOW() WHERE merchant_transaction_id = $4 RETURNING *',
    [transactionStatus, data.transactionId, decoded, merchantTransactionId]
  );

  if (txnResult.rows.length > 0) {
    const transaction = txnResult.rows[0];
    if (transactionStatus === 'success') {
      await finalizeSuccessfulPayment(transaction.order_id, decoded);
    } else {
      await db.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2', ['failed', transaction.order_id]);
    }
  }

  res.status(200).send('OK');
});

/**
 * @desc    Industrial Status Sync: Check PhonePe AND update local DB automatically
 */
exports.checkPaymentStatus = catchAsync(async (req, res, next) => {
  const { txnId } = req.params;
  const clientId = req.user.id;

  const txnCheck = await db.query(
    'SELECT t.*, o.status as order_status FROM transactions t JOIN orders o ON t.order_id = o.id WHERE t.merchant_transaction_id = $1 AND o.client_id = $2',
    [txnId, clientId]
  );

  if (txnCheck.rows.length === 0) return next(new AppError('Transaction not found', 404));

  const localTxn = txnCheck.rows[0];
  const response = await phonepe.checkStatus(txnId);
  const phonepeState = response.data.state; 

  if (phonepeState === 'COMPLETED' && localTxn.status === 'pending') {
    await db.query(
      'UPDATE transactions SET status = $1, gateway_transaction_id = $2, gateway_response = $3, updated_at = NOW() WHERE merchant_transaction_id = $4',
      ['success', response.data.transactionId, response.data, txnId]
    );
    await finalizeSuccessfulPayment(localTxn.order_id, response.data);
  } else if (phonepeState === 'FAILED' && localTxn.status === 'pending') {
    await db.query('UPDATE transactions SET status = $1, updated_at = NOW() WHERE merchant_transaction_id = $2', ['failure', txnId]);
    await db.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2', ['failed', localTxn.order_id]);
  }

  res.status(200).json({
    success: true,
    message: `Payment status is ${phonepeState}`,
    data: response.data
  });
});

/**
 * @desc    Industrial Success/Failure Landing Page (For Redirection)
 * @route   GET /api/client/payment/status-page
 * @access  Public (Called via browser redirect)
 */
exports.statusPage = catchAsync(async (req, res) => {
  const { tid } = req.query;
  if (!tid) return res.status(400).send('Missing Transaction ID');

  const response = await phonepe.checkStatus(tid);
  const state = response.data.state;

  const txnCheck = await db.query('SELECT * FROM transactions WHERE merchant_transaction_id = $1', [tid]);
  if (txnCheck.rows.length > 0) {
    const localTxn = txnCheck.rows[0];
    if (state === 'COMPLETED' && localTxn.status === 'pending') {
      await db.query(
        'UPDATE transactions SET status = $1, gateway_transaction_id = $2, gateway_response = $3, updated_at = NOW() WHERE merchant_transaction_id = $4',
        ['success', response.data.transactionId, response.data, tid]
      );
      await finalizeSuccessfulPayment(localTxn.order_id, response.data);
    }
  }

  const color = state === 'COMPLETED' ? '#22c55e' : '#ef4444';
  const icon = state === 'COMPLETED' ? '✅' : '❌';
  const title = state === 'COMPLETED' ? 'Payment Successful!' : 'Payment Failed';
  const subtitle = state === 'COMPLETED' 
    ? 'Your subscription has been activated successfully.' 
    : 'Something went wrong with your transaction. Please try again.';

  res.send(`
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f8fafc; }
          .card { background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); text-align: center; max-width: 400px; width: 90%; }
          .icon { font-size: 4rem; margin-bottom: 1rem; }
          h1 { color: #1e293b; margin: 0 0 0.5rem; }
          p { color: #64748b; margin: 0 0 1.5rem; }
          .btn { background: ${color}; color: white; padding: 0.75rem 1.5rem; border-radius: 0.5rem; text-decoration: none; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">${icon}</div>
          <h1>${title}</h1>
          <p>${subtitle}</p>
          <small style="display:block; margin-bottom:1.5rem; color:#94a3b8">Transaction ID: ${tid}</small>
          <a href="#" onclick="window.close()" class="btn">Close Window</a>
        </div>
      </body>
    </html>
  `);
});

/**
 * @desc    Get logged-in client's payment history
 */
exports.getMyPaymentHistory = catchAsync(async (req, res) => {
  const clientId = req.user.id;
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  const result = await db.query(
    `SELECT o.*, s.plan_name 
     FROM orders o 
     JOIN subscriptions s ON o.subscription_id = s.id 
     WHERE o.client_id = $1 
     ORDER BY o.created_at DESC LIMIT $2 OFFSET $3`,
    [clientId, limit, offset]
  );

  res.status(200).json({
    success: true,
    data: result.rows
  });
});

/**
 * @desc    Get all active subscriptions for a client's entities
 */
exports.getMyActiveSubscriptions = catchAsync(async (req, res) => {
  const clientId = req.user.id;

  const result = await db.query(
    `SELECT cs.*, s.plan_name, 
     CASE 
        WHEN cs.entity_type = 'child' THEN ch.name
        WHEN cs.entity_type = 'teacher' THEN t.name
        WHEN cs.entity_type = 'professional' THEN p.name
     END as entity_name
     FROM client_subscriptions cs
     JOIN subscriptions s ON cs.subscription_id = s.id
     LEFT JOIN children ch ON cs.entity_type = 'child' AND cs.entity_id = ch.id
     LEFT JOIN teacher_profiles t ON cs.entity_type = 'teacher' AND cs.entity_id = t.id
     LEFT JOIN professional_profiles p ON cs.entity_type = 'professional' AND cs.entity_id = p.id
     WHERE cs.client_id = $1 AND cs.is_active = true AND cs.end_date > NOW()`,
    [clientId]
  );

  res.status(200).json({
    success: true,
    data: result.rows
  });
});
