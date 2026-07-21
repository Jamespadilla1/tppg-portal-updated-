const express = require('express');
const router  = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getTeamLeaders, createTeamLeader, updateTeamLeader, deleteTeamLeader } = require('../controllers/teamLeaderController');

router.get('/',       protect, getTeamLeaders);
router.post('/',      protect, adminOnly, createTeamLeader);
router.put('/:id',    protect, adminOnly, updateTeamLeader);
router.delete('/:id', protect, adminOnly, deleteTeamLeader);

module.exports = router;
