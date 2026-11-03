const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const { protect, adminOnly } = require('../middleware/auth');
const { getProperties, createProperty, updateProperty, deleteProperty, restoreProperty, permanentlyDeleteProperty } = require('../controllers/propertyController');

// Memory storage — files go straight to Supabase Storage, not Railway's local disk
const upload = multer({ storage: multer.memoryStorage() });
// A property can carry a cover photo and an inventory (site development) map
const propUpload = upload.fields([{ name: 'image', maxCount: 1 }, { name: 'inventory_map', maxCount: 1 }]);

router.get('/',       protect, getProperties);
router.post('/',      protect, adminOnly, propUpload, createProperty);
router.put('/:id',    protect, adminOnly, propUpload, updateProperty);
router.delete('/:id', protect, adminOnly, deleteProperty);
router.patch('/:id/restore', protect, adminOnly, restoreProperty);
router.delete('/:id/permanent', protect, adminOnly, permanentlyDeleteProperty);

module.exports = router;