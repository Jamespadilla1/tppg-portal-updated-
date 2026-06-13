const express    = require('express');
const router     = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const supabase   = require('../config/db');

// GET /api/logs — admin only
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const { data: logs, error } = await supabase
      .from('logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/logs — any authenticated user can add a log
router.post('/', protect, async (req, res) => {
  try {
    const { data: log, error } = await supabase
      .from('logs')
      .insert([{
        message: req.body.message,
        actor:   req.body.actor || 'System',
        role:    req.user.role,
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(log);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/logs — admin only
router.delete('/', protect, adminOnly, async (req, res) => {
  try {
    const { error } = await supabase
      .from('logs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) throw error;
    res.json({ message: 'Logs cleared.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;