const supabase = require('../config/db');
const bcrypt = require('bcryptjs');

const getSalesManagers = async (req, res) => {
  try {
    const { unit_manager_id } = req.query;
    let query = supabase.from('sales_managers').select('id, sm_id, name, email, phone, unit_manager_id, status, created_at').order('created_at', { ascending: false });
    if (unit_manager_id) query = query.eq('unit_manager_id', unit_manager_id);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

const createSalesManager = async (req, res) => {
  try {
    const { name, email, phone, unit_manager_id, password } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required.' });
    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;
    const sm_id = 'SM-' + String(Date.now()).slice(-5);
    const { data, error } = await supabase.from('sales_managers').insert([{ sm_id, name, email, phone, unit_manager_id: unit_manager_id || null, password: hashedPassword }]).select('id, sm_id, name, email, phone, unit_manager_id, status, created_at').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

const updateSalesManager = async (req, res) => {
  try {
    const { name, email, phone, unit_manager_id, status, password } = req.body;
    const updateData = { name, email, phone, unit_manager_id: unit_manager_id || null, status };
    if (password) updateData.password = await bcrypt.hash(password, 10);
    const { data, error } = await supabase.from('sales_managers').update(updateData).eq('id', req.params.id).select('id, sm_id, name, email, phone, unit_manager_id, status, created_at').single();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Not found.' });
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

const deleteSalesManager = async (req, res) => {
  try {
    const { error } = await supabase.from('sales_managers').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getSalesManagers, createSalesManager, updateSalesManager, deleteSalesManager };