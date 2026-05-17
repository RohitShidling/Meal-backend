const express = require('express');
const router = express.Router();
const adminAuth = require('../middlewares/authMiddleware');
const clientAdminController = require('../controllers/clientAdminController');

router.get('/:clientId', adminAuth, clientAdminController.getClientById);

module.exports = router;
