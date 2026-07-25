const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const { getMyTeam, getTeamOf } = require('../controllers/teamViewController');

router.get('/', protect, getMyTeam);
router.get('/of/:role/:id', protect, getTeamOf);

module.exports = router;