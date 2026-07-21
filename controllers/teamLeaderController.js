const supabase = require('../config/db');
const bcrypt = require('bcryptjs');

const getTeamLeaders = async (req, res) => {
  try {
    const { unit_manager_id, sales_manager_id } = req.query;
    let query = supabase.from('team_leaders').select('id, tl_id, name, email, phone, unit_manager_id, sales_manager_id, status, created_at').order('created_at', { ascending: false });
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
    const { name, email, phone, unit_manager_id, sales_manager_id, password } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required.' });
    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;
    const tl_id = 'TL-' + String(Date.now()).slice(-5);
    const { data, error } = await supabase.from('team_leaders').insert([{
      tl_id, name, email, phone,
      unit_manager_id: unit_manager_id || null,
      sales_manager_id: sales_manager_id || null,
      password: hashedPassword,
    }]).select('id, tl_id, name, email, phone, unit_manager_id, sales_manager_id, status, created_at').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

const updateTeamLeader = async (req, res) => {
  try {
    const { name, email, phone, unit_manager_id, sales_manager_id, status, password } = req.body;
    const updateData = {
      name, email, phone,
      unit_manager_id: unit_manager_id || null,
      sales_manager_id: sales_manager_id || null,
      status,
    };
    if (password) updateData.password = await bcrypt.hash(password, 10);
    const { data, error } = await supabase.from('team_leaders').update(updateData).eq('id', req.params.id).select('id, tl_id, name, email, phone, unit_manager_id, sales_manager_id, status, created_at').single();
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

module.exports = { getTeamLeaders, createTeamLeader, updateTeamLeader, deleteTeamLeader };