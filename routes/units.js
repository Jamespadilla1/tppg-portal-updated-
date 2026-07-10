const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const path       = require('path');
const { protect, adminOnly } = require('../middleware/auth');
const { getUnits, createUnit, updateUnit, deleteUnit } = require('../controllers/unitController');

// Multer config for unit photo + computation image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '..', 'public', 'uploads');
    require('fs').mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random()*1e5) + path.extname(file.originalname)),
});
const upload = multer({ storage });
const uploadFields = upload.fields([{ name: 'image', maxCount: 1 }, { name: 'computation_image', maxCount: 1 }]);

// GET — both admin and agents can view
router.get('/',       protect, getUnits);

// Admin only — create, update, delete
router.post('/',      protect, adminOnly, uploadFields, createUnit);
router.put('/:id',    protect, adminOnly, uploadFields, updateUnit);
router.delete('/:id', protect, adminOnly, deleteUnit);

module.exports = router;
