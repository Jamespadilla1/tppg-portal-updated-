const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const { login, register } = require('../controllers/authController');

// Multer config for ID uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
  const uploadPath = require('path').join(__dirname, '..', 'public', 'uploads');
  require('fs').mkdirSync(uploadPath, { recursive: true });
  cb(null, uploadPath);
},
filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });
 


// POST /api/auth/login
router.post('/login', login);

// POST /api/auth/register  (agent applies)
router.post('/register', upload.fields([
  { name: 'idFront', maxCount: 1 },
  { name: 'idBack',  maxCount: 1 },
]), register);

module.exports = router;
