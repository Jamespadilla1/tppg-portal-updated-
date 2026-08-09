const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const { protect, adminOnly } = require('../middleware/auth');
const { getDevelopers, getPublicDevelopers, createDeveloper, updateDeveloper, deleteDeveloper } = require('../controllers/developerController');

// Memory storage — files go straight to Supabase Storage, not Railway's local disk
const upload = multer({ storage: multer.memoryStorage() });

// Public — no auth. Used by the landing page trust bar. Must stay above GET '/'.
router.get('/public', getPublicDevelopers);

router.get('/',       protect, getDevelopers);
router.post('/',      protect, adminOnly, upload.single('logo'), createDeveloper);
router.put('/:id',    protect, adminOnly, upload.single('logo'), updateDeveloper);
router.delete('/:id', protect, adminOnly, deleteDeveloper);

module.exports = router;