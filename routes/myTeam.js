const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const { getMyTeam } = require('../controllers/teamViewController');

router.get('/', protect, getMyTeam);

module.exports = router;