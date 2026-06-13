const express    = require('express');
const router     = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getSellers, createSeller, updateSeller, deleteSeller } = require('../controllers/sellerController');

router.get('/',       protect, adminOnly, getSellers);
router.post('/',      protect, adminOnly, createSeller);
router.put('/:id',    protect, adminOnly, updateSeller);
router.delete('/:id', protect, adminOnly, deleteSeller);

module.exports = router;
