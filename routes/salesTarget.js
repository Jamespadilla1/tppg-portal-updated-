const express = require('express');
const router  = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getSalesTarget, updateSalesTarget } = require('../controllers/salesTargetController');

router.get('/', protect, getSalesTarget);
router.put('/', protect, adminOnly, updateSalesTarget);

module.exports = router;