const express    = require('express');
const router     = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getProperties, createProperty, updateProperty, deleteProperty } = require('../controllers/propertyController');

// GET — both admin and agents can view
router.get('/',       protect, getProperties);

// Admin only — create, update, delete
router.post('/',      protect, adminOnly, createProperty);
router.put('/:id',    protect, adminOnly, updateProperty);
router.delete('/:id', protect, adminOnly, deleteProperty);

module.exports = router;
