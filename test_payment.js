// DEV-ONLY — manual payment flow test script; not used by production server.
const db = require('./src/common/database');
const paymentController = require('./src/client/controllers/paymentController');

async function test() {
  try {
    const res = await db.query('SELECT id, merchant_transaction_id FROM transactions WHERE status=\'pending\' OR status=\'success\' ORDER BY created_at DESC LIMIT 1');
    if (res.rows.length === 0) {
      console.log('No recent transaction found.');
      process.exit(0);
    }
    const txn = res.rows[0];
    console.log('Testing txn:', txn.merchant_transaction_id);

    // Call checkPaymentStatus logic directly or just finalize
    const txnRes = await db.query('SELECT * FROM transactions WHERE merchant_transaction_id=$1', [txn.merchant_transaction_id]);
    const orderId = txnRes.rows[0].order_id;
    
    // We will just try to finalize the order directly to see if it throws an error
    console.log('Finalizing order:', orderId);
    
    // Mock the logic
    const orderRes = await db.query('SELECT * FROM orders WHERE id=$1', [orderId]);
    const order = orderRes.rows[0];
    console.log('Order data:', order);

    // try activateSingleSubscription logic manually
    const clientId = order.client_id;
    const subscriptionId = order.subscription_id;
    const entityType = order.entity_type;
    const entityId = order.entity_id;
    const requestedStartDate = order.start_date;

    console.log('Calling activateSingleSubscription...');
    const subRes = await db.query('SELECT billing_cycle FROM subscriptions WHERE id=$1', [subscriptionId]);
    const billingCycle = subRes.rows[0].billing_cycle.toLowerCase();

    let totalMeals = 30; // default
    if (billingCycle.includes('month')) totalMeals = 30;
    else if (billingCycle.includes('quarter')) totalMeals = 90;
    else if (billingCycle.includes('year')) totalMeals = 365;
    else if (billingCycle.includes('week')) totalMeals = 7;

    const existingSub = await db.query(
      'SELECT end_date, total_meals, used_meals FROM client_subscriptions WHERE client_id=$1 AND entity_id=$2 AND entity_type=$3 AND is_active=true',
      [clientId, entityId, entityType]
    );

    let baseDate = requestedStartDate ? new Date(requestedStartDate) : new Date();
    let carryOverMeals = 0;
    if (existingSub.rows.length > 0 && new Date(existingSub.rows[0].end_date) > new Date()) {
      const currentEnd = new Date(existingSub.rows[0].end_date);
      if (currentEnd > baseDate) {
        baseDate = currentEnd;
      }
      const oldTotal = existingSub.rows[0].total_meals || 0;
      const oldUsed = existingSub.rows[0].used_meals || 0;
      carryOverMeals = Math.max(0, oldTotal - oldUsed);
    }

    let endDate = new Date(baseDate);
    if (billingCycle.includes('month')) endDate.setMonth(endDate.getMonth() + 1);
    else if (billingCycle.includes('quarter')) endDate.setMonth(endDate.getMonth() + 3);
    else if (billingCycle.includes('year')) endDate.setFullYear(endDate.getFullYear() + 1);
    else if (billingCycle.includes('week')) endDate.setDate(endDate.getDate() + 7);
    else endDate.setDate(endDate.getDate() + 30);

    const finalTotalMeals = totalMeals + carryOverMeals;

    console.log({
      clientId, subscriptionId, entityType, entityId, baseDate, endDate, orderId, finalTotalMeals
    });

    await db.query(
      `INSERT INTO client_subscriptions (client_id,subscription_id,entity_type,entity_id,start_date,end_date,order_id,is_active,total_meals,used_meals)
       VALUES ($1,$2,$3,$4,$8,$5,$6,true,$7,0)
       ON CONFLICT (client_id,entity_id,entity_type) DO UPDATE SET
         start_date=EXCLUDED.start_date, end_date=EXCLUDED.end_date, subscription_id=EXCLUDED.subscription_id,
         order_id=EXCLUDED.order_id, is_active=true, updated_at=NOW(),
         total_meals=EXCLUDED.total_meals, used_meals=0`,
      [clientId, subscriptionId, entityType, entityId, endDate, orderId, finalTotalMeals, baseDate]
    );
    console.log('Success inserted client_subscriptions');

  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    process.exit(0);
  }
}
test();
