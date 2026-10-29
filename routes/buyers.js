const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const { protect, adminOnly } = require('../middleware/auth');
const { getBuyers, getTeamBuyers, getPreviousRoleSalesHistory, createBuyer, updateBuyer, setBuyerOverrides, deleteBuyer, restoreBuyer, permanentlyDeleteBuyer, cancelBuyer, verifyBuyer, setIncentiveArchived, setBuyerPayslip } = require('../controllers/buyerController');

// Pay slip uploads: memory storage, files go straight to Supabase Storage (same as unit photos)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
// Turns a too-large or broken upload into a plain JSON message instead of an error page
const payslipUpload = (req, res, next) => upload.single('payslip')(req, res, err => {
  if (err) return res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'The pay slip must be 10 MB or smaller.' : 'Upload failed: ' + err.message });
  next();
});

// Any logged-in role can view (scoped to their own) and add buyers
router.get('/',       protect, getBuyers);
router.get('/team',   protect, getTeamBuyers);
router.get('/history', protect, getPreviousRoleSalesHistory);
router.post('/',      protect, createBuyer);
router.put('/:id',    protect, updateBuyer);
router.patch('/:id/overrides', protect, adminOnly, setBuyerOverrides);
router.delete('/:id', protect, deleteBuyer);
router.patch('/:id/restore', protect, restoreBuyer);
router.delete('/:id/permanent', protect, adminOnly, permanentlyDeleteBuyer);
router.patch('/:id/cancel', protect, cancelBuyer);
router.patch('/:id/verify', protect, adminOnly, verifyBuyer);
router.patch('/:id/incentive-archive', protect, adminOnly, setIncentiveArchived);
router.patch('/:id/payslip', protect, adminOnly, payslipUpload, setBuyerPayslip);

module.exports = router;