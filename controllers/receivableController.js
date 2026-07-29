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

// GET /api/commission-receivables/mine — for Agent/TL/SM/UM: commission releases tied to sales THEY personally recorded
const getMyReceivables = async (req, res) => {
  try {
    const { id, role } = req.user;
    const { data: myBuyers, error: buyersErr } = await supabase
      .from('buyers')
      .select('id')
      .eq('input_by_id', id)
      .eq('input_by_role', role);
    if (buyersErr) throw buyersErr;

    const buyerIds = (myBuyers || []).map(b => b.id);
    if (buyerIds.length === 0) return res.json([]);

    const { data, error } = await supabase
      .from('commission_receivables')
      .select('*')
      .in('buyer_id', buyerIds)
      .order('release_date', { ascending: false });
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
    const { developer_id, buyer_id, amount, release_date, release_type, monthly_amount, tranche_months, notes } = req.body;
    if (!developer_id || !buyer_id || !amount || !release_date) {
      return res.status(400).json({ message: 'Linked sale, amount, and release date are required.' });
    }
    const { data, error } = await supabase
      .from('commission_receivables')
      .insert([{
        developer_id,
        buyer_id,
        amount,
        release_date,
        release_type: release_type || 'Monthly Tranche',
        monthly_amount: monthly_amount || null,
        tranche_months: tranche_months || null,
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
    const { developer_id, buyer_id, amount, release_date, release_type, monthly_amount, tranche_months, notes } = req.body;
    const { data, error } = await supabase
      .from('commission_receivables')
      .update({ developer_id, buyer_id, amount, release_date, release_type, monthly_amount: monthly_amount || null, tranche_months: tranche_months || null, notes: notes || null })
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

module.exports = { getReceivables, getMyReceivables, createReceivable, updateReceivable, deleteReceivable };