const express    = require('express');
const router     = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getBuyers, createBuyer, updateBuyer, deleteBuyer } = require('../controllers/buyerController');

// Any logged-in role can view (scoped to their own) and add buyers
router.get('/',       protect, getBuyers);
router.post('/',      protect, createBuyer);
router.put('/:id',    protect, updateBuyer);
router.delete('/:id', protect, adminOnly, deleteBuyer);

module.exports = router;