const supabase = require('../config/db');

// GET /api/my-team — returns the logged-in Unit Manager / Sales Manager / Team Leader's downward team
const getMyTeam = async (req, res) => {
  try {
    const { id, role } = req.user;

    if (role === 'team_leader') {
      const { data: agents, error } = await supabase
        .from('agents')
        .select('id, name, email, phone, agent_id, status, created_at')
        .eq('team_leader_id', id)
        .eq('status', 'approved');
      if (error) throw error;
      return res.json({ salesManagers: [], teamLeaders: [], agents });
    }

    if (role === 'sales_manager') {
      const { data: teamLeaders, error: tlErr } = await supabase
        .from('team_leaders')
        .select('id, name, email, phone, status')
        .eq('sales_manager_id', id);
      if (tlErr) throw tlErr;

      const tlIds = teamLeaders.map(t => t.id);
      let agents = [];
      if (tlIds.length) {
        const { data, error } = await supabase
          .from('agents')
          .select('id, name, email, phone, agent_id, status, team_leader_id, created_at')
          .in('team_leader_id', tlIds)
          .eq('status', 'approved');
        if (error) throw error;
        agents = data;
      }
      return res.json({ salesManagers: [], teamLeaders, agents });
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

      let agents = [];
      const orFilters = [];
      if (tlIds.length) orFilters.push(`team_leader_id.in.(${tlIds.join(',')})`);
      orFilters.push(`unit_manager_id.eq.${id}`);
      const { data, error } = await supabase
        .from('agents')
        .select('id, name, email, phone, agent_id, status, team_leader_id, unit_manager_id, created_at')
        .or(orFilters.join(','))
        .eq('status', 'approved');
      if (error) throw error;
      agents = data;

      return res.json({ salesManagers, teamLeaders, agents });
    }

    return res.status(403).json({ message: 'This account type has no team view.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getMyTeam };
