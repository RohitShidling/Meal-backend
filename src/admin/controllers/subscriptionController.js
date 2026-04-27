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
