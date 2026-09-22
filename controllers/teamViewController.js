const supabase = require('../config/db');

// Core logic: returns the downward team for a given { id, role }
async function fetchTeamFor(id, role) {
  if (role === 'team_leader') {
    const { data: agents, error } = await supabase
      .from('agents')
      .select('id, name, email, phone, agent_id, status, created_at')
      .eq('team_leader_id', id)
      .eq('status', 'approved');
    if (error) throw error;
    return { salesManagers: [], teamLeaders: [], agents };
  }

  if (role === 'sales_manager') {
    const { data: teamLeaders, error: tlErr } = await supabase
      .from('team_leaders')
      .select('id, name, email, phone, status')
      .eq('sales_manager_id', id);
    if (tlErr) throw tlErr;

    const tlIds = teamLeaders.map(t => t.id);
    const orFilters = [`sales_manager_id.eq.${id}`];
    if (tlIds.length) orFilters.push(`team_leader_id.in.(${tlIds.join(',')})`);

    const { data: agents, error } = await supabase
      .from('agents')
      .select('id, name, email, phone, agent_id, status, team_leader_id, sales_manager_id, created_at')
      .or(orFilters.join(','))
      .eq('status', 'approved');
    if (error) throw error;

    return { salesManagers: [], teamLeaders, agents };
  }

  if (role === 'unit_manager') {
    const { data: salesManagers, error: smErr } = await supabase
      .from('sales_managers')
      .select('id, name, email, phone, status')
      .eq('unit_manager_id', id);
    if (smErr) throw smErr;

    const smIds = salesManagers.map(s => s.id);

    const { data: directTL, error: tlErr1 } = await supabase
      .from('team_leaders')
      .select('id, name, email, phone, status, sales_manager_id')
      .eq('unit_manager_id', id);
    if (tlErr1) throw tlErr1;

    let indirectTL = [];
    if (smIds.length) {
      const { data, error } = await supabase
        .from('team_leaders')
        .select('id, name, email, phone, status, sales_manager_id')
        .in('sales_manager_id', smIds);
      if (error) throw error;
      indirectTL = data;
    }

    const teamLeaders = [...directTL, ...indirectTL];
    const tlIds = teamLeaders.map(t => t.id);

    const orFilters = [`unit_manager_id.eq.${id}`];
    if (tlIds.length) orFilters.push(`team_leader_id.in.(${tlIds.join(',')})`);
    if (smIds.length) orFilters.push(`sales_manager_id.in.(${smIds.join(',')})`);

    const { data: agents, error } = await supabase
      .from('agents')
      .select('id, name, email, phone, agent_id, status, team_leader_id, sales_manager_id, unit_manager_id, created_at')
      .or(orFilters.join(','))
      .eq('status', 'approved');
    if (error) throw error;

    return { salesManagers, teamLeaders, agents };
  }

  return { salesManagers: [], teamLeaders: [], agents: [] };
}

// For an Agent: they have no downward team (they're the base rank), so "their team" means something
// different — who they report to (their chain up through TL/SM/UM), and their peers (other agents
// who report to that same immediate manager).
async function fetchAgentTeamView(agentId) {
  const { data: me, error: meErr } = await supabase
    .from('agents')
    .select('id, name, email, team_leader_id, sales_manager_id, unit_manager_id')
    .eq('id', agentId)
    .single();
  if (meErr || !me) throw meErr || new Error('Agent not found.');

  let teamLeader = null, salesManager = null, unitManager = null;
  if (me.team_leader_id) {
    const { data } = await supabase.from('team_leaders').select('id, name, email, phone, tl_id, sales_manager_id, unit_manager_id').eq('id', me.team_leader_id).single();
    teamLeader = data || null;
    if (teamLeader?.sales_manager_id) {
      const { data: sm } = await supabase.from('sales_managers').select('id, name, email, phone, sm_id, unit_manager_id').eq('id', teamLeader.sales_manager_id).single();
      salesManager = sm || null;
    }
    if (teamLeader?.unit_manager_id) {
      const { data: um } = await supabase.from('unit_managers').select('id, name, email, phone, um_id').eq('id', teamLeader.unit_manager_id).single();
      unitManager = um || null;
    }
  } else if (me.sales_manager_id) {
    const { data: sm } = await supabase.from('sales_managers').select('id, name, email, phone, sm_id, unit_manager_id').eq('id', me.sales_manager_id).single();
    salesManager = sm || null;
    if (salesManager?.unit_manager_id) {
      const { data: um } = await supabase.from('unit_managers').select('id, name, email, phone, um_id').eq('id', salesManager.unit_manager_id).single();
      unitManager = um || null;
    }
  } else if (me.unit_manager_id) {
    const { data: um } = await supabase.from('unit_managers').select('id, name, email, phone, um_id').eq('id', me.unit_manager_id).single();
    unitManager = um || null;
  }

  // Peers: other approved agents sharing the same immediate manager
  let peers = [];
  if (me.team_leader_id) {
    const { data } = await supabase.from('agents').select('id, name, email, phone, agent_id, status').eq('team_leader_id', me.team_leader_id).eq('status', 'approved').neq('id', agentId);
    peers = data || [];
  } else if (me.sales_manager_id) {
    const { data } = await supabase.from('agents').select('id, name, email, phone, agent_id, status').eq('sales_manager_id', me.sales_manager_id).eq('status', 'approved').neq('id', agentId);
    peers = data || [];
  } else if (me.unit_manager_id) {
    const { data } = await supabase.from('agents').select('id, name, email, phone, agent_id, status').eq('unit_manager_id', me.unit_manager_id).eq('status', 'approved').neq('id', agentId);
    peers = data || [];
  }

  return { reportsTo: { teamLeader, salesManager, unitManager }, peers };
}

// GET /api/my-team — the logged-in Unit Manager / Sales Manager / Team Leader's own downward team,
// or (for an Agent) their reporting chain + peers
const getMyTeam = async (req, res) => {
  try {
    const { id, role } = req.user;
    if (role === 'agent') {
      const result = await fetchAgentTeamView(id);
      return res.json(result);
    }
    if (!['unit_manager', 'sales_manager', 'team_leader'].includes(role)) {
      return res.status(403).json({ message: 'This account type has no team view.' });
    }
    const result = await fetchTeamFor(id, role);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// GET /api/my-team/of/:role/:id — the downward team of a specific subordinate (used to drill down)
const getTeamOf = async (req, res) => {
  try {
    const { role, id } = req.params;
    if (!['unit_manager', 'sales_manager', 'team_leader'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role.' });
    }
    const result = await fetchTeamFor(id, role);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getMyTeam, getTeamOf, fetchTeamFor };