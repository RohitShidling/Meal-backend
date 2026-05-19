const db = require('../../common/database');
const catchAsync = require('../../common/utils/catchAsync');
const AppError = require('../../common/utils/AppError');
const bulkOrderService = require('../../common/services/bulkOrderService');
const { initiatePhonePePayment } = require('../../common/services/phonepeCheckoutService');
const { BULK_ORDER_STATUS } = require('../../common/constants/bulkOrder');

exports.quote = catchAsync(async (req, res) => {
  const quote = await bulkOrderService.validateAndQuote(req.bulkOrderPayload);
  res.status(200).json({ success: true, data: quote });
});

exports.initiatePayment = catchAsync(async (req, res, next) => {
  const clientId = req.user.id;
  const { deliveryDate, items, deliveryAddress, redirectUrl } = req.bulkOrderPayload;

  const client = await db.pool.connect();
  let quote;
  let bulkOrder;
  let order;
  let merchantTransactionId;

  try {
    await client.query('BEGIN');
    quote = await bulkOrderService.validateAndQuote(
      { deliveryDate, items, deliveryAddress: req.bulkOrderPayload.deliveryAddress },
      client.query.bind(client)
    );
    const persisted = await bulkOrderService.persistBulkOrder(client, clientId, quote);
    bulkOrder = persisted.bulkOrder;
    order = persisted.order;

    merchantTransactionId = `TXN_BLK_${order.id.replace('ORD-', '')}_${Date.now()}`;
    await client.query(
      'INSERT INTO transactions (order_id, merchant_transaction_id, amount, status) VALUES ($1, $2, $3, $4)',
      [order.id, merchantTransactionId, quote.total_amount, 'pending']
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const clientData = await db.query('SELECT phone_number FROM clients WHERE id=$1', [clientId]);
  const phonepe = await initiatePhonePePayment({
    req,
    clientId,
    merchantTransactionId,
    amount: quote.total_amount,
    customRedirect: redirectUrl,
    mobileNumber: clientData.rows[0]?.phone_number,
  });

  if (!phonepe.success) {
    await db.query("UPDATE orders SET status='failed', updated_at=NOW() WHERE id=$1", [order.id]);
    await db.query(
      `UPDATE bulk_orders SET status=$1, updated_at=NOW() WHERE id=$2`,
      [BULK_ORDER_STATUS.CANCELLED, bulkOrder.id]
    );
    await db.query(
      "UPDATE transactions SET status='failure', updated_at=NOW() WHERE merchant_transaction_id=$1",
      [merchantTransactionId]
    );
    return next(new AppError(phonepe.message || 'Payment Gateway Error', 500));
  }

  res.status(200).json({
    success: true,
    message: 'Bulk order payment initiated. Redirect user to paymentUrl.',
    data: {
      bulkOrderId: bulkOrder.id,
      orderId: order.id,
      merchantTransactionId,
      deliveryDate: quote.delivery_date,
      totalQuantity: quote.total_quantity,
      totalAmount: quote.total_amount,
      tierMode: quote.tier_mode,
      lines: quote.lines,
      paymentUrl: phonepe.paymentUrl,
    },
  });
});

exports.getBulkOrder = catchAsync(async (req, res, next) => {
  const data = await bulkOrderService.getBulkOrderForClient(req.params.id, req.user.id);
  if (!data) return next(new AppError('Bulk order not found.', 404));
  res.status(200).json({ success: true, data });
});

exports.checkBulkEntity = catchAsync(async (req, res) => {
  const { entityName } = req.query;
  res.status(200).json({
    success: true,
    data: { is_bulk: bulkOrderService.isBulkEntityName(entityName) },
  });
});
