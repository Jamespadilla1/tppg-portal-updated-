const express = require('express');
const router  = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getPublicPromotions, getMyPromotions, getAllPromotions, createPromotion, setPromotionActive, deletePromotion } = require('../controllers/promotionController');

// Public — no login. Only ever returns live, public promotions (enforced in the controller).
router.get('/public', getPublicPromotions);

// Any logged-in user (agent, team leader, sales manager, unit manager, admin)
router.get('/mine', protect, getMyPromotions);

// Admin only
router.get('/',                protect, adminOnly, getAllPromotions);
router.post('/',               protect, adminOnly, createPromotion);
router.patch('/:id/active',    protect, adminOnly, setPromotionActive);
router.delete('/:id',          protect, adminOnly, deletePromotion);

module.exports = router;