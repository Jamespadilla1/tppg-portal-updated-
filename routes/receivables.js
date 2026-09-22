const express = require('express');
const router  = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getReceivables, getMyReceivables, createReceivable, updateReceivable, deleteReceivable, restoreReceivable, permanentlyDeleteReceivable } = require('../controllers/receivableController');

router.get('/mine',   protect, getMyReceivables);
router.get('/',       protect, adminOnly, getReceivables);
router.post('/',      protect, adminOnly, createReceivable);
router.put('/:id',    protect, adminOnly, updateReceivable);
router.delete('/:id', protect, adminOnly, deleteReceivable);
router.patch('/:id/restore', protect, adminOnly, restoreReceivable);
router.delete('/:id/permanent', protect, adminOnly, permanentlyDeleteReceivable);

module.exports = router;