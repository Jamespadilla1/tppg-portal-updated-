const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const { protect, adminOnly } = require('../middleware/auth');
const { getUnits, createUnit, updateUnit, deleteUnit, restoreUnit, permanentlyDeleteUnit } = require('../controllers/unitController');

const upload = multer({ storage: multer.memoryStorage() });
const unitUpload = upload.fields([{ name: 'image', maxCount: 1 }, { name: 'computation_image', maxCount: 1 }]);

router.get('/',       protect, getUnits);
router.post('/',      protect, adminOnly, unitUpload, createUnit);
router.put('/:id',    protect, adminOnly, unitUpload, updateUnit);
router.delete('/:id', protect, adminOnly, deleteUnit);
router.patch('/:id/restore', protect, adminOnly, restoreUnit);
router.delete('/:id/permanent', protect, adminOnly, permanentlyDeleteUnit);

module.exports = router;