const supabase = require('../config/db');

const getUnitManagers = async (req, res) => {
  try {
    const { data, error } = await supabase.from('unit_managers').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

const createUnitManager = async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required.' });
    const { data, error } = await supabase.from('unit_managers').insert([{ name, email, phone }]).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

const updateUnitManager = async (req, res) => {
  try {
    const { name, email, phone, status } = req.body;
    const { data, error } = await supabase.from('unit_managers').update({ name, email, phone, status }).eq('id', req.params.id).select().single();
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
