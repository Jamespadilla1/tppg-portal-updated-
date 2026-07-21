const express = require('express');
const router  = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getUnitManagers, createUnitManager, updateUnitManager, deleteUnitManager } = require('../controllers/unitManagerController');

router.get('/',       protect, getUnitManagers);
router.post('/',      protect, adminOnly, createUnitManager);
router.put('/:id',    protect, adminOnly, updateUnitManager);
router.delete('/:id', protect, adminOnly, deleteUnitManager);

module.exports = router;
