const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const bulkOrderController = require('../controllers/bulkOrderController');
const clientAuth = require('../middlewares/authMiddleware');
const {
  validateQuoteBody,
  validateInitiateBody,
  validateBulkOrderIdParam,
} = require('../validators/bulkOrderValidator');

const bulkInitiateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number.parseInt(process.env.BULK_ORDER_INITIATE_RATE_LIMIT_MAX || '20', 10),
  message: { success: false, message: 'Too many bulk order attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/quote', clientAuth, validateQuoteBody, bulkOrderController.quote);
router.post(
  '/initiate-payment',
  clientAuth,
  bulkInitiateLimiter,
  validateInitiateBody,
  bulkOrderController.initiatePayment
);
router.get('/entity-check', bulkOrderController.checkBulkEntity);
router.get('/:id', clientAuth, validateBulkOrderIdParam, bulkOrderController.getBulkOrder);

module.exports = router;
