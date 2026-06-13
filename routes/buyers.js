const express    = require('express');
const router     = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getBuyers, createBuyer, updateBuyer, deleteBuyer } = require('../controllers/buyerController');

router.get('/',       protect, adminOnly, getBuyers);
router.post('/',      protect, adminOnly, createBuyer);
router.put('/:id',    protect, adminOnly, updateBuyer);
router.delete('/:id', protect, adminOnly, deleteBuyer);

module.exports = router;
