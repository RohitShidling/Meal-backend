const { query } = require('../database');
const AppError = require('../utils/AppError');

/**
 * @desc    Get all active subscription plans
 * @route   GET /api/common/subscriptions
 * @access  Private (Admin & Client)
 */
exports.getSubscriptions = async (req, res, next) => {
  try {
    const isClient = req.user.role === 'client';
    let sqlQuery;
    let values = [];

    if (isClient) {
      // Clients only see active subscriptions ordered by display_order
      sqlQuery = `
        SELECT id, plan_name, price, billing_cycle, trial_days, display_order 
        FROM subscriptions 
        WHERE is_active = true AND (trial_days = 0 OR trial_days IS NULL)
        ORDER BY display_order ASC, created_at DESC;
      `;
    } else {
      // Admin sees all subscriptions
      sqlQuery = `
        SELECT * 
        FROM subscriptions 
        WHERE trial_days = 0 OR trial_days IS NULL
        ORDER BY display_order ASC, created_at DESC;
      `;
    }

    const result = await query(sqlQuery, values);

    res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    next(new AppError(error.message || 'Error fetching subscriptions', 500));
  }
};

/**
 * @desc    Get subscription plan by ID
 * @route   GET /api/common/subscriptions/:id
 * @access  Private (Admin & Client)
 */
exports.getSubscriptionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const isClient = req.user.role === 'client';
    
    let sqlQuery = `SELECT * FROM subscriptions WHERE id = $1`;
    if (isClient) {
      sqlQuery += ` AND is_active = true`;
    }
    
    const result = await query(sqlQuery, [id]);

    if (result.rows.length === 0) {
      return next(new AppError('Subscription not found', 404));
    }

    res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    next(new AppError(error.message || 'Error fetching subscription', 500));
  }
};
