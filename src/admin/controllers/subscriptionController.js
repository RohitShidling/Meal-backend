const { query } = require('../../common/database');
const AppError = require('../../common/utils/AppError');

/**
 * @desc    Create a new subscription plan
 * @route   POST /api/admin/subscriptions
 * @access  Private (Admin only)
 */
exports.createSubscription = async (req, res, next) => {
  try {
    const { plan_name, price, billing_cycle, trial_days, display_order, is_active } = req.body;
    const adminId = req.user.id;

    if (!plan_name || price === undefined || !billing_cycle) {
      return next(new AppError('plan_name, price, and billing_cycle are required', 400));
    }

    const insertQuery = `
      INSERT INTO subscriptions (
        plan_name, price, billing_cycle, trial_days, display_order, is_active, created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    const values = [
      plan_name,
      price,
      billing_cycle,
      trial_days !== undefined ? trial_days : 0,
      display_order !== undefined ? display_order : 1,
      is_active !== undefined ? is_active : true,
      adminId,
      adminId
    ];

    const result = await query(insertQuery, values);

    res.status(201).json({
      success: true,
      message: 'Subscription created successfully',
      data: result.rows[0],
    });
  } catch (error) {
    next(new AppError(error.message || 'Error creating subscription', 500));
  }
};

/**
 * @desc    Update a subscription plan
 * @route   PUT /api/admin/subscriptions/:id
 * @access  Private (Admin only)
 */
exports.updateSubscription = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { plan_name, price, billing_cycle, trial_days, display_order, is_active } = req.body;
    const adminId = req.user.id;

    // Check if subscription exists
    const checkQuery = `SELECT * FROM subscriptions WHERE id = $1`;
    const checkResult = await query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return next(new AppError('Subscription not found', 404));
    }

    const updateQuery = `
      UPDATE subscriptions
      SET 
        plan_name = COALESCE($1, plan_name),
        price = COALESCE($2, price),
        billing_cycle = COALESCE($3, billing_cycle),
        trial_days = COALESCE($4, trial_days),
        display_order = COALESCE($5, display_order),
        is_active = COALESCE($6, is_active),
        updated_by = $7,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING *;
    `;
    const values = [
      plan_name,
      price,
      billing_cycle,
      trial_days,
      display_order,
      is_active,
      adminId,
      id
    ];

    const result = await query(updateQuery, values);

    res.status(200).json({
      success: true,
      message: 'Subscription updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    next(new AppError(error.message || 'Error updating subscription', 500));
  }
};

/**
 * @desc    Delete a subscription plan
 * @route   DELETE /api/admin/subscriptions/:id
 * @access  Private (Admin only)
 */
exports.deleteSubscription = async (req, res, next) => {
  try {
    const { id } = req.params;

    const checkQuery = `SELECT * FROM subscriptions WHERE id = $1`;
    const checkResult = await query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return next(new AppError('Subscription not found', 404));
    }

    const inUse = await query(
      `SELECT COUNT(*)::int AS active_count
       FROM client_subscriptions
       WHERE subscription_id = $1 AND is_active = true`,
      [id]
    );
    if ((inUse.rows[0]?.active_count || 0) > 0) {
      return next(new AppError('Cannot delete subscription plan with active client subscriptions. Deactivate plan instead.', 409));
    }

    const deleteQuery = `DELETE FROM subscriptions WHERE id = $1 RETURNING id`;
    const result = await query(deleteQuery, [id]);

    res.status(200).json({
      success: true,
      message: 'Subscription deleted successfully',
      data: {
        id: result.rows[0].id
      }
    });
  } catch (error) {
    next(new AppError(error.message || 'Error deleting subscription', 500));
  }
};

/**
 * @desc    Get all subscription plans (Admin view — includes inactive)
 * @route   GET /api/admin/subscriptions
 * @access  Private (Admin only)
 */
exports.getAllSubscriptions = async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM subscriptions WHERE trial_days = 0 OR trial_days IS NULL ORDER BY display_order ASC, created_at DESC'
    );
    res.status(200).json({
      success: true,
      count: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    next(new AppError(error.message || 'Error fetching subscriptions', 500));
  }
};

/**
 * @desc    Get a single subscription plan by ID
 * @route   GET /api/admin/subscriptions/:id
 * @access  Private (Admin only)
 */
exports.getSubscriptionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM subscriptions WHERE id=$1', [id]);
    if (result.rows.length === 0) return next(new AppError('Subscription not found', 404));
    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(new AppError(error.message || 'Error fetching subscription', 500));
  }
};

/**
 * @desc    Admin: Delete (deactivate) a client's active subscription
 * @route   DELETE /api/admin/subscriptions/client-subscription/:subscriptionId
 * @access  Private (Admin only)
 */
exports.deleteClientSubscription = async (req, res, next) => {
  try {
    const { subscriptionId } = req.params;

    // Get the subscription with entity details
    const subResult = await query(
      `SELECT cs.*,
              CASE
                WHEN cs.entity_type='child' THEN ch.name
                WHEN cs.entity_type='teacher' THEN tp.name
                WHEN cs.entity_type='professional' THEN pp.name
              END AS entity_name,
              c.phone_number AS client_phone
       FROM client_subscriptions cs
       LEFT JOIN clients c ON cs.client_id = c.id
       LEFT JOIN children ch ON cs.entity_type='child' AND cs.entity_id=ch.id
       LEFT JOIN teacher_profiles tp ON cs.entity_type='teacher' AND cs.entity_id=tp.id
       LEFT JOIN professional_profiles pp ON cs.entity_type='professional' AND cs.entity_id=pp.id
       WHERE cs.id = $1`,
      [subscriptionId]
    );

    if (subResult.rows.length === 0) {
      return next(new AppError('Client subscription not found.', 404));
    }

    const sub = subResult.rows[0];

    if (!sub.is_active) {
      return next(new AppError('This subscription is already inactive.', 400));
    }

    // Deactivate the subscription
    await query(
      `UPDATE client_subscriptions SET is_active = false, updated_at = NOW() WHERE id = $1`,
      [subscriptionId]
    );

    // Also cancel any future meal skips for this entity
    await query(
      `UPDATE meal_skips SET status = 'cancelled', updated_at = NOW()
       WHERE client_id = $1 AND entity_type = $2 AND entity_id = $3
         AND status = 'approved' AND skip_start_date > CURRENT_DATE`,
      [sub.client_id, sub.entity_type, sub.entity_id]
    );

    res.status(200).json({
      success: true,
      message: 'Client subscription deactivated successfully.',
      data: {
        subscription_id: sub.id,
        client_phone: sub.client_phone,
        entity_type: sub.entity_type,
        entity_name: sub.entity_name,
        total_meals: sub.total_meals,
        used_meals: sub.used_meals,
        remaining_at_deletion: sub.total_meals - sub.used_meals,
        was_active_until: sub.end_date
      }
    });
  } catch (error) {
    next(new AppError(error.message || 'Error deleting client subscription', 500));
  }
};
