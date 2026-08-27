const express    = require('express');
const router     = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getAgents, createAgent, updateAgent, updateStatus, deleteAgent, promoteAgent, setAgentRank } = require('../controllers/agentController');

// All routes require admin
router.get('/',              protect, adminOnly, getAgents);
router.post('/',             protect, adminOnly, createAgent);
router.put('/:id',           protect, adminOnly, updateAgent);
router.patch('/:id/status',  protect, adminOnly, updateStatus);
router.patch('/:id/rank',    protect, adminOnly, setAgentRank);
router.post('/:id/promote',  protect, adminOnly, promoteAgent);
router.delete('/:id',        protect, adminOnly, deleteAgent);

module.exports = router;