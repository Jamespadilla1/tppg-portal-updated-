const supabase = require('../config/db');

// GET /api/buyers — admin sees all; other roles see only buyers they personally input
const getBuyers = async (req, res) => {
  try {
    let query = supabase.from('buyers').select('*').order('created_at', { ascending: false });
    if (req.user.role !== 'admin') {
      query = query.eq('input_by_id', req.user.id).eq('input_by_role', req.user.role);
    }
    const { data: buyers, error } = await query;
    if (error) throw error;
    res.json(buyers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// POST /api/buyers — any logged-in role (agent, team_leader, sales_manager, unit_manager, admin) can add a buyer
const createBuyer = async (req, res) => {
  try {
    const { name, email, phone, address, unit_id } = req.body;

    const { data: buyer, error } = await supabase
      .from('buyers')
      .insert([{
        name, email, phone, address,
        unit_id: unit_id || null,
        input_by_role: req.user.role,
        input_by_id: req.user.id,
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(buyer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// PUT /api/buyers/:id — only the original creator or admin can edit
const updateBuyer = async (req, res) => {
  try {
    const { data: existing } = await supabase.from('buyers').select('input_by_id').eq('id', req.params.id).single();
    if (!existing) return res.status(404).json({ message: 'Not found.' });
    if (req.user.role !== 'admin' && existing.input_by_id !== req.user.id) {
      return res.status(403).json({ message: 'You can only edit buyers you added.' });
    }

    const { name, email, phone, address, unit_id } = req.body;
    const { data: buyer, error } = await supabase
      .from('buyers')
      .update({ name, email, phone, address, unit_id: unit_id || null, updated_at: new Date() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(buyer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// DELETE /api/buyers/:id — admin only (prevents accidental data loss by sales roles)
const deleteBuyer = async (req, res) => {
  try {
    const { error } = await supabase.from('buyers').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Buyer deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getBuyers, createBuyer, updateBuyer, deleteBuyer };