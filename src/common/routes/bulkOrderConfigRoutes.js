const express = require('express');
const router = express.Router();
const bulkOrderConfigController = require('../controllers/bulkOrderConfigController');

router.get('/config', bulkOrderConfigController.getConfig);
router.get('/menus', bulkOrderConfigController.getMenusForDelivery);

module.exports = router;
