const { pool } = require('../../common/database');
const AppError = require('../../common/utils/AppError');

/**
 * @desc    Get subscription status for the logged-in client (all entities)
 * @route   GET /api/client/subscriptions/status
 * @access  Private (Client only)
 */
exports.getMySubscriptionStatus = async (req, res, next) => {
  try {
    const clientId = req.user.id; // from clientAuth middleware

    const query = `
      SELECT cs.id as client_subscription_id, cs.entity_type, cs.entity_id, 
             cs.start_date, cs.end_date, cs.is_active as subscription_status,
             s.plan_name, s.price, s.billing_cycle
      FROM client_subscriptions cs
      JOIN subscriptions s ON cs.subscription_id = s.id
      WHERE cs.client_id = $1
      ORDER BY cs.created_at DESC;
    `;
    
    const result = await pool.query(query, [clientId]);

    // Check if user has any active subscription
    const hasActiveSubscription = result.rows.some(sub => sub.subscription_status === true && new Date(sub.end_date) > new Date());

    res.status(200).json({
      success: true,
      has_active_subscription: hasActiveSubscription,
      count: result.rowCount,
      data: result.rows,
    });
  } catch (error) {
    next(new AppError(error.message || 'Error fetching subscription status', 500));
  }
};
