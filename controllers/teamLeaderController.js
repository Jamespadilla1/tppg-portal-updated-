const supabase = require('../config/db');
const bcrypt = require('bcryptjs');

const SELECT_FIELDS = 'id, tl_id, name, email, phone, unit_manager_id, sales_manager_id, status, commission_rank, commission_rate, created_at';

const getTeamLeaders = async (req, res) => {
  try {
    const { unit_manager_id, sales_manager_id } = req.query;
    let query = supabase.from('team_leaders').select(SELECT_FIELDS).order('created_at', { ascending: false });
    if (unit_manager_id) query = query.eq('unit_manager_id', unit_manager_id);
    if (sales_manager_id) query = query.eq('sales_manager_id', sales_manager_id);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

const createTeamLeader = async (req, res) => {
  try {
    const { name, email, phone, unit_manager_id, sales_manager_id, password, commission_rank, commission_rate } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required.' });
    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;
    const tl_id = 'TL-' + String(Date.now()).slice(-5);
    const { data, error } = await supabase.from('team_leaders').insert([{
      tl_id, name, email, phone,
      unit_manager_id: unit_manager_id || null,
      sales_manager_id: sales_manager_id || null,
      password: hashedPassword,
      commission_rank: commission_rank || 'Team Leader',
      commission_rate: commission_rate || 3.0,
    }]).select(SELECT_FIELDS).single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

const updateTeamLeader = async (req, res) => {
  try {
    const { name, email, phone, unit_manager_id, sales_manager_id, status, password, commission_rank, commission_rate } = req.body;
    const updateData = {
      name, email, phone,
      unit_manager_id: unit_manager_id || null,
      sales_manager_id: sales_manager_id || null,
      status, commission_rank, commission_rate,
    };
    if (password) updateData.password = await bcrypt.hash(password, 10);
    const { data, error } = await supabase.from('team_leaders').update(updateData).eq('id', req.params.id).select(SELECT_FIELDS).single();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Not found.' });
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

const deleteTeamLeader = async (req, res) => {
  try {
    const { error } = await supabase.from('team_leaders').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// POST /api/team-leaders/:id/promote — promote a Team Leader to Sales Manager (admin only)
// Migrates the record into sales_managers, reusing the hashed password, and carries their
// sales/commission history forward by reassigning their buyer records to the new role/id.
const promoteTeamLeader = async (req, res) => {
  try {
    const { unit_manager_id } = req.body;
    const { data: tl, error: fetchErr } = await supabase.from('team_leaders').select('*').eq('id', req.params.id).single();
    if (fetchErr || !tl) return res.status(404).json({ message: 'Team Leader not found.' });

    const sm_id = 'SM-' + String(Date.now()).slice(-5);
    const { data: newRecord, error: insertErr } = await supabase
      .from('sales_managers')
      .insert([{
        sm_id, name: tl.name, email: tl.email, phone: tl.phone,
        unit_manager_id: unit_manager_id || null,
        password: tl.password,
        status: 'active',
        commission_rank: 'Sales Manager',
        commission_rate: 3.25,
      }])
      .select()
      .single();
    if (insertErr) throw insertErr;

    const { error: reassignErr } = await supabase
      .from('buyers')
      .update({ input_by_role: 'sales_manager', input_by_id: newRecord.id })
      .eq('input_by_role', 'team_leader')
      .eq('input_by_id', req.params.id);
    if (reassignErr) console.error('Failed to carry over sales history on promotion:', reassignErr);

    const { error: deleteErr } = await supabase.from('team_leaders').delete().eq('id', req.params.id);
    if (deleteErr) throw deleteErr;

    res.json({ message: 'Promoted to Sales Manager.', record: newRecord });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getTeamLeaders, createTeamLeader, updateTeamLeader, deleteTeamLeader, promoteTeamLeader };