const express = require('express');
const router  = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getCommissionSettings, updateCommissionSettings } = require('../controllers/commissionController');

router.get('/', protect, adminOnly, getCommissionSettings);
router.put('/', protect, adminOnly, updateCommissionSettings);

module.exports = router;