const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const path       = require('path');
const { protect, adminOnly } = require('../middleware/auth');
const { getProperties, createProperty, updateProperty, deleteProperty } = require('../controllers/propertyController');

// Multer config for property photo uploads (same pattern as agent ID uploads)
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
router.get('/',       protect, getProperties);

// Admin only — create, update, delete
router.post('/',      protect, adminOnly, upload.single('image'), createProperty);
router.put('/:id',    protect, adminOnly, upload.single('image'), updateProperty);
router.delete('/:id', protect, adminOnly, deleteProperty);

module.exports = router;
