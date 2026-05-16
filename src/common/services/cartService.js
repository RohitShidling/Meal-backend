const db = require('../database');

/**
 * Merge duplicate active carts (legacy data / races) into the newest row.
 */
const mergeDuplicateActiveCarts = async (queryRunner, clientId) => {
  const activeRes = await queryRunner.query(
    "SELECT id FROM carts WHERE client_id=$1 AND status='active' ORDER BY updated_at DESC FOR UPDATE",
    [clientId]
  );
  if (activeRes.rows.length <= 1) return activeRes.rows[0]?.id || null;

  const keepId = activeRes.rows[0].id;
  for (let i = 1; i < activeRes.rows.length; i++) {
    const orphanId = activeRes.rows[i].id;
    await queryRunner.query(
      `INSERT INTO cart_items (cart_id, subscription_id, entity_type, entity_id, entity_name, unit_price, meal_size_id, meal_timing, include_saturday, start_date)
       SELECT $1, subscription_id, entity_type, entity_id, entity_name, unit_price, meal_size_id, meal_timing, include_saturday, start_date
       FROM cart_items ci
       WHERE ci.cart_id=$2
       ON CONFLICT (cart_id, entity_id, entity_type) DO NOTHING`,
      [keepId, orphanId]
    );
    await queryRunner.query("UPDATE carts SET status='abandoned', updated_at=NOW() WHERE id=$1", [orphanId]);
  }
  await queryRunner.query(
    'UPDATE carts SET total_amount=(SELECT COALESCE(SUM(unit_price),0) FROM cart_items WHERE cart_id=$1), updated_at=NOW() WHERE id=$1',
    [keepId]
  );
  return keepId;
};

/**
 * Get or create the single active cart for a client (transaction-safe).
 */
const getOrCreateActiveCart = async (clientId) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await mergeDuplicateActiveCarts(client, clientId);
    let cartRes = await client.query(
      "SELECT * FROM carts WHERE client_id=$1 AND status='active' ORDER BY updated_at DESC LIMIT 1 FOR UPDATE",
      [clientId]
    );
    if (cartRes.rows.length === 0) {
      cartRes = await client.query(
        "INSERT INTO carts (client_id, status, total_amount) VALUES ($1,'active',0) RETURNING *",
        [clientId]
      );
    }
    await client.query('COMMIT');
    return cartRes.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Before checkout: free the unique (client_id, status='pending') slot and drop stale actives.
 */
const prepareCartsForCheckout = async (queryRunner, clientId, activeCartId) => {
  await mergeDuplicateActiveCarts(queryRunner, clientId);
  await queryRunner.query(
    `UPDATE carts SET status='abandoned', updated_at=NOW()
     WHERE client_id=$1 AND status IN ('pending', 'failed') AND id <> $2`,
    [clientId, activeCartId]
  );
  await queryRunner.query(
    `UPDATE carts SET status='abandoned', updated_at=NOW()
     WHERE client_id=$1 AND status='active' AND id <> $2`,
    [clientId, activeCartId]
  );
};

/**
 * Reactivate a pending cart after failed/cancelled payment (no VARCHAR id coercion).
 */
const reactivateCartAfterFailedPayment = async (queryRunner, clientId, cartId) => {
  const existingActive = await queryRunner.query(
    "SELECT id FROM carts WHERE client_id=$1 AND status='active' FOR UPDATE",
    [clientId]
  );
  const otherActive = existingActive.rows.find((r) => String(r.id) !== String(cartId));
  if (otherActive) {
    await queryRunner.query(
      `INSERT INTO cart_items (cart_id, subscription_id, entity_type, entity_id, entity_name, unit_price, meal_size_id, meal_timing, include_saturday, start_date)
       SELECT $1, subscription_id, entity_type, entity_id, entity_name, unit_price, meal_size_id, meal_timing, include_saturday, start_date
       FROM cart_items WHERE cart_id=$2
       ON CONFLICT (cart_id, entity_id, entity_type) DO NOTHING`,
      [otherActive.id, cartId]
    );
    await queryRunner.query("UPDATE carts SET status='abandoned', updated_at=NOW() WHERE id=$1", [cartId]);
    await queryRunner.query(
      'UPDATE carts SET total_amount=(SELECT COALESCE(SUM(unit_price),0) FROM cart_items WHERE cart_id=$1), updated_at=NOW() WHERE id=$1',
      [otherActive.id]
    );
  } else {
    await queryRunner.query("UPDATE carts SET status='active', updated_at=NOW() WHERE id=$1", [cartId]);
  }
};

module.exports = {
  mergeDuplicateActiveCarts,
  getOrCreateActiveCart,
  prepareCartsForCheckout,
  reactivateCartAfterFailedPayment,
};
