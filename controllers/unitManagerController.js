const supabase = require('../config/db');
const bcrypt = require('bcryptjs');

const SELECT_FIELDS = 'id, um_id, name, email, phone, status, commission_rank, commission_rate, created_at';

const getUnitManagers = async (req, res) => {
  try {
    const { data, error } = await supabase.from('unit_managers').select(SELECT_FIELDS).order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

const createUnitManager = async (req, res) => {
  try {
    const { name, email, phone, password, commission_rank, commission_rate } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required.' });
    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;
    const um_id = 'UM-' + String(Date.now()).slice(-5);
    const { data, error } = await supabase.from('unit_managers').insert([{
      um_id, name, email, phone, password: hashedPassword,
      commission_rank: commission_rank || 'Unit Manager',
      commission_rate: commission_rate || 4.0,
    }]).select(SELECT_FIELDS).single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

const updateUnitManager = async (req, res) => {
  try {
    const { name, email, phone, status, password, commission_rank, commission_rate } = req.body;
    const updateData = { name, email, phone, status, commission_rank, commission_rate };
    if (password) updateData.password = await bcrypt.hash(password, 10);
    const { data, error } = await supabase.from('unit_managers').update(updateData).eq('id', req.params.id).select(SELECT_FIELDS).single();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Not found.' });
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

const deleteUnitManager = async (req, res) => {
  try {
    const { error } = await supabase.from('unit_managers').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getUnitManagers, createUnitManager, updateUnitManager, deleteUnitManager };