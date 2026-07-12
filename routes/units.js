const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const { protect, adminOnly } = require('../middleware/auth');
const { getUnits, createUnit, updateUnit, deleteUnit } = require('../controllers/unitController');

// Memory storage — files go straight to Supabase Storage, not Railway's local disk
const upload = multer({ storage: multer.memoryStorage() });
const uploadFields = upload.fields([{ name: 'image', maxCount: 1 }, { name: 'computation_image', maxCount: 1 }]);

router.get('/',       protect, getUnits);
router.post('/',      protect, adminOnly, uploadFields, createUnit);
router.put('/:id',    protect, adminOnly, uploadFields, updateUnit);
router.delete('/:id', protect, adminOnly, deleteUnit);

module.exports = router;
