const supabase = require('../config/db');
const bcrypt = require('bcryptjs');

const SELECT_FIELDS = 'id, sm_id, name, email, phone, unit_manager_id, status, commission_rank, commission_rate, created_at';

const getSalesManagers = async (req, res) => {
  try {
    const { unit_manager_id } = req.query;
    let query = supabase.from('sales_managers').select(SELECT_FIELDS).order('created_at', { ascending: false });
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
    const { name, email, phone, unit_manager_id, password, commission_rank, commission_rate } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required.' });
    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;
    const sm_id = 'SM-' + String(Date.now()).slice(-5);
    const { data, error } = await supabase.from('sales_managers').insert([{
      sm_id, name, email, phone, unit_manager_id: unit_manager_id || null, password: hashedPassword,
      commission_rank: commission_rank || 'Sales Manager',
      commission_rate: commission_rate || 3.25,
    }]).select(SELECT_FIELDS).single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

const updateSalesManager = async (req, res) => {
  try {
    const { name, email, phone, unit_manager_id, status, password, commission_rank, commission_rate } = req.body;
    const updateData = { name, email, phone, unit_manager_id: unit_manager_id || null, status, commission_rank, commission_rate };
    if (password) updateData.password = await bcrypt.hash(password, 10);
    const { data, error } = await supabase.from('sales_managers').update(updateData).eq('id', req.params.id).select(SELECT_FIELDS).single();
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

// POST /api/sales-managers/:id/promote — promote a Sales Manager to Unit Manager (admin only)
// Unit Manager is the top of the hierarchy, so no assignment is needed — just migrate the record.
const promoteSalesManager = async (req, res) => {
  try {
    const { data: sm, error: fetchErr } = await supabase.from('sales_managers').select('*').eq('id', req.params.id).single();
    if (fetchErr || !sm) return res.status(404).json({ message: 'Sales Manager not found.' });

    const um_id = 'UM-' + String(Date.now()).slice(-5);
    const { data: newRecord, error: insertErr } = await supabase
      .from('unit_managers')
      .insert([{
        um_id, name: sm.name, email: sm.email, phone: sm.phone,
        password: sm.password,
        status: 'active',
        commission_rank: 'Unit Manager',
        commission_rate: 4.0,
      }])
      .select()
      .single();
    if (insertErr) throw insertErr;

    const { error: reassignErr } = await supabase
      .from('buyers')
      .update({ input_by_role: 'unit_manager', input_by_id: newRecord.id })
      .eq('input_by_role', 'sales_manager')
      .eq('input_by_id', req.params.id);
    if (reassignErr) console.error('Failed to carry over sales history on promotion:', reassignErr);

    const { error: deleteErr } = await supabase.from('sales_managers').delete().eq('id', req.params.id);
    if (deleteErr) throw deleteErr;

    res.json({ message: 'Promoted to Unit Manager.', record: newRecord });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getSalesManagers, createSalesManager, updateSalesManager, deleteSalesManager, promoteSalesManager };