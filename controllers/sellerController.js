const supabase = require('../config/db');

// GET /api/sellers
const getSellers = async (req, res) => {
  try {
    const { data: sellers, error } = await supabase
      .from('sellers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(sellers);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// POST /api/sellers
const createSeller = async (req, res) => {
  try {
    const { name, email, phone, address, property } = req.body;

    const { data: seller, error } = await supabase
      .from('sellers')
      .insert([{ name, email, phone, address, property }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(seller);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// PUT /api/sellers/:id
const updateSeller = async (req, res) => {
  try {
    const { name, email, phone, address, property } = req.body;

    const { data: seller, error } = await supabase
      .from('sellers')
      .update({ name, email, phone, address, property, updated_at: new Date() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!seller) return res.status(404).json({ message: 'Not found.' });

    res.json(seller);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// DELETE /api/sellers/:id
const deleteSeller = async (req, res) => {
  try {
    const { error } = await supabase
      .from('sellers')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Seller deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getSellers, createSeller, updateSeller, deleteSeller };