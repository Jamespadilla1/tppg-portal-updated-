const express = require('express');
const router  = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const multer  = require('multer');
const { getReceivables, getMyReceivables, createReceivable, updateReceivable, deleteReceivable, restoreReceivable, permanentlyDeleteReceivable, setReceivableProof } = require('../controllers/receivableController');

// Paycheck photo uploads: memory storage, files go straight to Supabase Storage
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
// Turns a too-large or broken upload into a plain JSON message instead of an error page
const proofUpload = (req, res, next) => upload.single('proof')(req, res, err => {
  if (err) return res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'The paycheck photo must be 10 MB or smaller.' : 'Upload failed: ' + err.message });
  next();
});

router.get('/mine',   protect, getMyReceivables);
router.get('/',       protect, adminOnly, getReceivables);
router.post('/',      protect, adminOnly, createReceivable);
router.put('/:id',    protect, adminOnly, updateReceivable);
router.delete('/:id', protect, adminOnly, deleteReceivable);
router.patch('/:id/restore', protect, adminOnly, restoreReceivable);
router.delete('/:id/permanent', protect, adminOnly, permanentlyDeleteReceivable);
router.patch('/:id/proof', protect, adminOnly, proofUpload, setReceivableProof);

module.exports = router;