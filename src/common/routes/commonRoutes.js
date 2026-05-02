const express = require('express');
const router = express.Router();
const commonAuthMiddleware = require('../middlewares/commonAuthMiddleware');

// All common routes require either Admin or Client JWT
router.use(commonAuthMiddleware);

// (Routes moved to specific client/admin domains)

module.exports = router;

