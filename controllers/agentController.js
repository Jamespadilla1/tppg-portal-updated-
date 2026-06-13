const supabase = require('../config/db');

// GET /api/agents — get all agents (admin only)
const getAgents = async (req, res) => {
  try {
    const { data: agents, error } = await supabase
      .from('agents')
      .select('id, agent_id, name, email, phone, status, id_front, id_back, created_at, updated_at');

    if (error) throw error;
    res.json(agents);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// PATCH /api/agents/:id/status — approve/reject/suspend (admin only)
const updateStatus = async (req, res) => {
  const { status } = req.body;
  const allowed = ['approved', 'rejected', 'suspended', 'pending'];
  if (!allowed.includes(status)) return res.status(400).json({ message: 'Invalid status.' });

  try {
    const { data: agent, error } = await supabase
      .from('agents')
      .update({ status, updated_at: new Date() })
      .eq('id', req.params.id)
      .select('id, agent_id, name, email, phone, status, created_at, updated_at')
      .single();

    if (error) throw error;
    if (!agent) return res.status(404).json({ message: 'Agent not found.' });

    res.json({ message: `Agent ${status}.`, agent });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// DELETE /api/agents/:id — delete agent (admin only)
const deleteAgent = async (req, res) => {
  try {
    const { error } = await supabase
      .from('agents')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Agent deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getAgents, updateStatus, deleteAgent };