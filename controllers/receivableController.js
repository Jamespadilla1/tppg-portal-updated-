const supabase = require('../config/db');

// GET /api/commission-receivables (admin only)
const getReceivables = async (req, res) => {
  try {
    const { developer_id } = req.query;
    let query = supabase.from('commission_receivables').select('*').order('release_date', { ascending: false });
    if (developer_id) query = query.eq('developer_id', developer_id);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// POST /api/commission-receivables (admin only)
const createReceivable = async (req, res) => {
  try {
    const { developer_id, buyer_id, amount, release_date, release_type, notes } = req.body;
    if (!developer_id || !amount || !release_date) {
      return res.status(400).json({ message: 'Developer, amount, and release date are required.' });
    }
    const { data, error } = await supabase
      .from('commission_receivables')
      .insert([{
        developer_id,
        buyer_id: buyer_id || null,
        amount,
        release_date,
        release_type: release_type || 'Monthly Tranche',
        notes: notes || null,
      }])
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// PUT /api/commission-receivables/:id (admin only)
const updateReceivable = async (req, res) => {
  try {
    const { developer_id, buyer_id, amount, release_date, release_type, notes } = req.body;
    const { data, error } = await supabase
      .from('commission_receivables')
      .update({ developer_id, buyer_id: buyer_id || null, amount, release_date, release_type, notes: notes || null })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Not found.' });
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// DELETE /api/commission-receivables/:id (admin only)
const deleteReceivable = async (req, res) => {
  try {
    const { error } = await supabase.from('commission_receivables').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getReceivables, createReceivable, updateReceivable, deleteReceivable };