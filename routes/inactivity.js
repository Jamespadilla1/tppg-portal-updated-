const express = require('express');
const router  = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getSettings, setSettings, getInactivityReport } = require('../controllers/inactivityController');

router.get('/settings',   protect, adminOnly, getSettings);
router.patch('/settings', protect, adminOnly, setSettings);
router.get('/',            protect, adminOnly, getInactivityReport);

module.exports = router;