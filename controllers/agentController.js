const supabase = require('../config/db');
const bcrypt = require('bcryptjs');

// GET /api/agents — get all agents (admin only)
const getAgents = async (req, res) => {
  try {
    const { data: agents, error } = await supabase
      .from('agents')
      .select('id, agent_id, name, email, phone, status, id_front, id_back, team_leader_id, sales_manager_id, unit_manager_id, commission_rank, commission_rate, created_at, updated_at');

    if (error) throw error;
    res.json(agents);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// POST /api/agents — admin directly creates an already-approved agent
// (bypasses the public Register -> Pending Agents approval flow)
const createAgent = async (req, res) => {
  try {
    const { name, email, phone, password, team_leader_id, sales_manager_id, unit_manager_id, commission_rank, commission_rate } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required.' });
    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;
    const agent_id = 'AGT-' + String(Date.now()).slice(-5);
    const { data, error } = await supabase.from('agents').insert([{
      agent_id, name, email, phone,
      team_leader_id: team_leader_id || null,
      sales_manager_id: sales_manager_id || null,
      unit_manager_id: unit_manager_id || null,
      password: hashedPassword,
      status: 'approved',
      commission_rank: commission_rank || 'Property Specialist',
      commission_rate: commission_rate || 2.0,
    }]).select('id, agent_id, name, email, phone, status, team_leader_id, sales_manager_id, unit_manager_id, commission_rank, commission_rate, created_at').single();
    if (error) throw error;
    res.status(201).json(data);
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
      .select('id, agent_id, name, email, phone, status, team_leader_id, sales_manager_id, unit_manager_id, created_at, updated_at')
      .single();

    if (error) throw error;
    if (!agent) return res.status(404).json({ message: 'Agent not found.' });

    res.json({ message: `Agent ${status}.`, agent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// PUT /api/agents/:id — admin edits an existing agent's core details (name/email/phone/reports-to/rank)
const updateAgent = async (req, res) => {
  try {
    const { name, email, phone, team_leader_id, sales_manager_id, unit_manager_id, commission_rank, commission_rate } = req.body;
    const updateData = {
      name, email, phone,
      team_leader_id: team_leader_id || null,
      sales_manager_id: sales_manager_id || null,
      unit_manager_id: unit_manager_id || null,
      commission_rank, commission_rate,
      updated_at: new Date(),
    };
    const { data: agent, error } = await supabase
      .from('agents')
      .update(updateData)
      .eq('id', req.params.id)
      .select('id, agent_id, name, email, phone, status, team_leader_id, sales_manager_id, unit_manager_id, commission_rank, commission_rate, created_at, updated_at')
      .single();
    if (error) throw error;
    if (!agent) return res.status(404).json({ message: 'Agent not found.' });
    res.json({ message: 'Agent updated.', agent });
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

// POST /api/agents/:id/promote — approve a pending applicant into any role (admin only)
// target_role: 'agent' | 'unit_manager' | 'sales_manager' | 'team_leader'
const promoteAgent = async (req, res) => {
  const { target_role, unit_manager_id, sales_manager_id, team_leader_id } = req.body;
  const allowedRoles = ['agent', 'unit_manager', 'sales_manager', 'team_leader'];
  if (!allowedRoles.includes(target_role)) return res.status(400).json({ message: 'Invalid target role.' });

  try {
    const { data: applicant, error: fetchErr } = await supabase
      .from('agents')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (fetchErr || !applicant) return res.status(404).json({ message: 'Applicant not found.' });

    // Approving as a plain Agent — same as before, just update status + assignment
    if (target_role === 'agent') {
      const { sales_manager_id, commission_rank, commission_rate } = req.body;
      const updateData = {
        status: 'approved',
        updated_at: new Date(),
        team_leader_id: team_leader_id || null,
        sales_manager_id: team_leader_id ? null : (sales_manager_id || null),
        unit_manager_id: (team_leader_id || sales_manager_id) ? null : (unit_manager_id || null),
        commission_rank: commission_rank || 'Property Specialist',
        commission_rate: commission_rate || 2.0,
      };
      const { data: agent, error } = await supabase
        .from('agents')
        .update(updateData)
        .eq('id', req.params.id)
        .select('id, agent_id, name, email, phone, status, commission_rank, commission_rate')
        .single();
      if (error) throw error;
      return res.json({ message: 'Approved as Agent.', record: agent });
    }

    // Promoting into Unit Manager / Sales Manager / Team Leader:
    // create the new record (reusing the applicant's hashed password) and remove the old applicant row
    const tableMap    = { unit_manager: 'unit_managers', sales_manager: 'sales_managers', team_leader: 'team_leaders' };
    const idPrefixMap = { unit_manager: 'UM', sales_manager: 'SM', team_leader: 'TL' };
    const idFieldMap  = { unit_manager: 'um_id', sales_manager: 'sm_id', team_leader: 'tl_id' };

    const newId = idPrefixMap[target_role] + '-' + String(Date.now()).slice(-5);
    const insertData = {
      [idFieldMap[target_role]]: newId,
      name: applicant.name,
      email: applicant.email,
      phone: applicant.phone,
      password: applicant.password, // already bcrypt-hashed — reused as-is
      status: 'active',
    };
    if (target_role === 'sales_manager') {
      insertData.unit_manager_id = unit_manager_id || null;
      insertData.previous_role = 'agent';
      insertData.previous_id = req.params.id;
    }
    if (target_role === 'team_leader') {
      insertData.unit_manager_id = unit_manager_id || null;
      insertData.sales_manager_id = sales_manager_id || null;
      insertData.previous_role = 'agent';
      insertData.previous_id = req.params.id;
    }

    const { data: newRecord, error: insertErr } = await supabase
      .from(tableMap[target_role])
      .insert([insertData])
      .select()
      .single();
    if (insertErr) throw insertErr;

    // Deliberate clean break: sales/buyers this person recorded as an Agent stay attributed
    // to their agent-era history and are NOT carried into their new role's commission totals.
    const { error: deleteErr } = await supabase.from('agents').delete().eq('id', req.params.id);
    if (deleteErr) throw deleteErr;

    res.json({ message: `Approved as ${target_role.replace('_',' ')}.`, record: newRecord });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// PATCH /api/agents/:id/rank — set an approved agent's commission rank/rate (admin only)
const setAgentRank = async (req, res) => {
  try {
    const { commission_rank, commission_rate } = req.body;
    const { data: agent, error } = await supabase
      .from('agents')
      .update({ commission_rank, commission_rate, updated_at: new Date() })
      .eq('id', req.params.id)
      .select('id, agent_id, name, commission_rank, commission_rate')
      .single();
    if (error) throw error;
    if (!agent) return res.status(404).json({ message: 'Agent not found.' });
    res.json({ message: 'Commission rank updated.', agent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getAgents, createAgent, updateAgent, updateStatus, deleteAgent, promoteAgent, setAgentRank };