const express    = require('express');
const router     = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getBuyers, getTeamBuyers, getPreviousRoleSalesHistory, createBuyer, updateBuyer, setBuyerOverrides, deleteBuyer, restoreBuyer, permanentlyDeleteBuyer, cancelBuyer } = require('../controllers/buyerController');

// Any logged-in role can view (scoped to their own) and add buyers
router.get('/',       protect, getBuyers);
router.get('/team',   protect, getTeamBuyers);
router.get('/history', protect, getPreviousRoleSalesHistory);
router.post('/',      protect, createBuyer);
router.put('/:id',    protect, updateBuyer);
router.patch('/:id/overrides', protect, adminOnly, setBuyerOverrides);
router.delete('/:id', protect, deleteBuyer);
router.patch('/:id/restore', protect, restoreBuyer);
router.delete('/:id/permanent', protect, adminOnly, permanentlyDeleteBuyer);
router.patch('/:id/cancel', protect, cancelBuyer);

module.exports = router;