const supabase = require('../config/db');

// GET /api/commission-settings (admin only)
const getCommissionSettings = async (req, res) => {
  try {
    const { data, error } = await supabase.from('commission_settings').select('*').eq('id', 1).single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// PUT /api/commission-settings (admin only)
const updateCommissionSettings = async (req, res) => {
  try {
    const { agent_rate, team_leader_rate, sales_manager_rate, unit_manager_rate } = req.body;
    const { data, error } = await supabase
      .from('commission_settings')
      .update({ agent_rate, team_leader_rate, sales_manager_rate, unit_manager_rate, updated_at: new Date() })
      .eq('id', 1)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getCommissionSettings, updateCommissionSettings };