const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const path       = require('path');
const { protect, adminOnly } = require('../middleware/auth');
const { getUnits, createUnit, updateUnit, deleteUnit } = require('../controllers/unitController');

// Multer config for unit photo uploads (same pattern used elsewhere)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '..', 'public', 'uploads');
    require('fs').mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// GET — both admin and agents can view
router.get('/',       protect, getUnits);

// Admin only — create, update, delete
router.post('/',      protect, adminOnly, upload.single('image'), createUnit);
router.put('/:id',    protect, adminOnly, upload.single('image'), updateUnit);
router.delete('/:id', protect, adminOnly, deleteUnit);

module.exports = router;
