const supabase = require('../config/db');

// GET /api/properties
const getProperties = async (req, res) => {
  try {
    const { status } = req.query;

    let query = supabase
      .from('properties')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data: properties, error } = await query;

    if (error) throw error;
    res.json(properties);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// POST /api/properties (admin only)
const createProperty = async (req, res) => {
  try {
    const { name, location, price, rate, description, status } = req.body;

    const { data: property, error } = await supabase
      .from('properties')
      .insert([{
        name,
        location,
        price,
        rate,
        description,
        status: status || 'Available',
        date: new Date(),
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(property);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// PUT /api/properties/:id (admin only)
const updateProperty = async (req, res) => {
  try {
    const { name, location, price, rate, description, status } = req.body;

    const { data: property, error } = await supabase
      .from('properties')
      .update({
        name,
        location,
        price,
        rate,
        description,
        status,
        updated_at: new Date(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!property) return res.status(404).json({ message: 'Property not found.' });

    res.json(property);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// DELETE /api/properties/:id (admin only)
const deleteProperty = async (req, res) => {
  try {
    const { error } = await supabase
      .from('properties')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Property deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getProperties, createProperty, updateProperty, deleteProperty };