const express = require('express');
const router  = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getSettings, setSettings, getInactivityReport, getReleaseNoticeDays, setReleaseNoticeDays } = require('../controllers/inactivityController');

router.get('/settings',   protect, adminOnly, getSettings);
router.patch('/settings', protect, adminOnly, setSettings);
router.get('/',            protect, adminOnly, getInactivityReport);

// Release notifications setting: everyone can read it, only Admin can change it
router.get('/release-notice-days',   protect,            getReleaseNoticeDays);
router.patch('/release-notice-days', protect, adminOnly, setReleaseNoticeDays);

module.exports = router;