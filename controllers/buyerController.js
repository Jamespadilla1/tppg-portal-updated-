const supabase = require('../config/db');

// GET /api/buyers
const getBuyers = async (req, res) => {
  try {
    const { data: buyers, error } = await supabase
      .from('buyers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(buyers);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// POST /api/buyers
const createBuyer = async (req, res) => {
  try {
    const { name, email, phone, address, property } = req.body;

    const { data: buyer, error } = await supabase
      .from('buyers')
      .insert([{ name, email, phone, address, property }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(buyer);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// PUT /api/buyers/:id
const updateBuyer = async (req, res) => {
  try {
    const { name, email, phone, address, property } = req.body;

    const { data: buyer, error } = await supabase
      .from('buyers')
      .update({ name, email, phone, address, property, updated_at: new Date() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!buyer) return res.status(404).json({ message: 'Not found.' });

    res.json(buyer);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// DELETE /api/buyers/:id
const deleteBuyer = async (req, res) => {
  try {
    const { error } = await supabase
      .from('buyers')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Buyer deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getBuyers, createBuyer, updateBuyer, deleteBuyer };