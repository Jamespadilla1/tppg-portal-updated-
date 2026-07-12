const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const { protect, adminOnly } = require('../middleware/auth');
const { getProperties, createProperty, updateProperty, deleteProperty } = require('../controllers/propertyController');

// Memory storage — files go straight to Supabase Storage, not Railway's local disk
const upload = multer({ storage: multer.memoryStorage() });

router.get('/',       protect, getProperties);
router.post('/',      protect, adminOnly, upload.single('image'), createProperty);
router.put('/:id',    protect, adminOnly, upload.single('image'), updateProperty);
router.delete('/:id', protect, adminOnly, deleteProperty);

module.exports = router;
