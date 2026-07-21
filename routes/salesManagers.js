const express = require('express');
const router  = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getSalesManagers, createSalesManager, updateSalesManager, deleteSalesManager } = require('../controllers/salesManagerController');

router.get('/',       protect, getSalesManagers);
router.post('/',      protect, adminOnly, createSalesManager);
router.put('/:id',    protect, adminOnly, updateSalesManager);
router.delete('/:id', protect, adminOnly, deleteSalesManager);

module.exports = router;
