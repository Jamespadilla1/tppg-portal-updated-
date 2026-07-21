const supabase = require('../config/db');

// GET /api/agents — get all agents (admin only)
const getAgents = async (req, res) => {
  try {
    const { data: agents, error } = await supabase
      .from('agents')
      .select('id, agent_id, name, email, phone, status, id_front, id_back, team_leader_id, unit_manager_id, created_at, updated_at');

    if (error) throw error;
    res.json(agents);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// PATCH /api/agents/:id/status — approve/reject/suspend (admin only)
// On approval, an optional team_leader_id OR unit_manager_id assigns the agent to their team
const updateStatus = async (req, res) => {
  const { status, team_leader_id, unit_manager_id } = req.body;
  const allowed = ['approved', 'rejected', 'suspended', 'pending'];
  if (!allowed.includes(status)) return res.status(400).json({ message: 'Invalid status.' });

  try {
    const updateData = { status, updated_at: new Date() };
    if (status === 'approved') {
      updateData.team_leader_id = team_leader_id || null;
      updateData.unit_manager_id = team_leader_id ? null : (unit_manager_id || null);
    }

    const { data: agent, error } = await supabase
      .from('agents')
      .update(updateData)
      .eq('id', req.params.id)
      .select('id, agent_id, name, email, phone, status, team_leader_id, unit_manager_id, created_at, updated_at')
      .single();

    if (error) throw error;
    if (!agent) return res.status(404).json({ message: 'Agent not found.' });

    res.json({ message: `Agent ${status}.`, agent });
  } catch (err) {
    console.error(err);
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
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getAgents, updateStatus, deleteAgent };
