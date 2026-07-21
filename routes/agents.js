const express    = require('express');
const router     = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getAgents, updateStatus, deleteAgent, promoteAgent } = require('../controllers/agentController');

// All routes require admin
router.get('/',              protect, adminOnly, getAgents);
router.patch('/:id/status',  protect, adminOnly, updateStatus);
router.post('/:id/promote',  protect, adminOnly, promoteAgent);
router.delete('/:id',        protect, adminOnly, deleteAgent);

module.exports = router;