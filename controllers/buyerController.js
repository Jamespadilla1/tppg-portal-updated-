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
// Linking a unit automatically marks that unit as Sold
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

    if (unit_id) {
      const { error: unitErr } = await supabase
        .from('units')
        .update({ status: 'Sold', updated_at: new Date() })
        .eq('id', unit_id);
      if (unitErr) console.error('Failed to mark unit as Sold:', unitErr);
    }

    res.status(201).json(buyer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// PUT /api/buyers/:id — only the original creator or admin can edit
// If the linked unit changes, the old unit reverts to Available and the new one is marked Sold
const updateBuyer = async (req, res) => {
  try {
    const { data: existing } = await supabase.from('buyers').select('input_by_id, unit_id').eq('id', req.params.id).single();
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

    const oldUnitId = existing.unit_id;
    const newUnitId = unit_id || null;
    if (oldUnitId !== newUnitId) {
      if (oldUnitId) {
        const { error: revertErr } = await supabase.from('units').update({ status: 'Available', updated_at: new Date() }).eq('id', oldUnitId);
        if (revertErr) console.error('Failed to revert old unit to Available:', revertErr);
      }
      if (newUnitId) {
        const { error: soldErr } = await supabase.from('units').update({ status: 'Sold', updated_at: new Date() }).eq('id', newUnitId);
        if (soldErr) console.error('Failed to mark unit as Sold:', soldErr);
      }
    }

    res.json(buyer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// DELETE /api/buyers/:id — admin only (prevents accidental data loss by sales roles)
// Reverts the linked unit back to Available since the sale record is gone
const deleteBuyer = async (req, res) => {
  try {
    const { data: existing } = await supabase.from('buyers').select('unit_id').eq('id', req.params.id).single();

    const { error } = await supabase.from('buyers').delete().eq('id', req.params.id);
    if (error) throw error;

    if (existing && existing.unit_id) {
      const { error: revertErr } = await supabase.from('units').update({ status: 'Available', updated_at: new Date() }).eq('id', existing.unit_id);
      if (revertErr) console.error('Failed to revert unit to Available:', revertErr);
    }

    res.json({ message: 'Buyer deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getBuyers, createBuyer, updateBuyer, deleteBuyer };