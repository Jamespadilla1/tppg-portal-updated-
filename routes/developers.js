const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const path       = require('path');
const { protect, adminOnly } = require('../middleware/auth');
const { getDevelopers, createDeveloper, updateDeveloper, deleteDeveloper } = require('../controllers/developerController');

// Multer config for developer logo uploads (same pattern used elsewhere)
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
router.get('/',       protect, getDevelopers);

// Admin only — create, update, delete
router.post('/',      protect, adminOnly, upload.single('logo'), createDeveloper);
router.put('/:id',    protect, adminOnly, upload.single('logo'), updateDeveloper);
router.delete('/:id', protect, adminOnly, deleteDeveloper);

module.exports = router;
