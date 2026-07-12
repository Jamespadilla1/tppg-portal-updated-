const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const { login, register } = require('../controllers/authController');

// Multer config for ID uploads — memory storage, files go straight to Supabase Storage
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/auth/login
router.post('/login', login);

// POST /api/auth/register  (agent applies)
router.post('/register', upload.fields([
  { name: 'idFront', maxCount: 1 },
  { name: 'idBack',  maxCount: 1 },
]), register);

module.exports = router;
