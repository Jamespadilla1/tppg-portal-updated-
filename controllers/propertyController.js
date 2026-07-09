const supabase = require('../config/db');

// GET /api/properties
const getProperties = async (req, res) => {
  try {
    const { status, developer_id } = req.query;

    let query = supabase
      .from('properties')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (developer_id) query = query.eq('developer_id', developer_id);

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
    const { name, location, developer_id, property_type } = req.body;
    const image_url = req.file ? `/uploads/${req.file.filename}` : null;

    const { data: property, error } = await supabase
      .from('properties')
      .insert([{
        name,
        location,
        image_url,
        developer_id: developer_id || null,
        property_type: property_type || 'Condo',
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
    const { name, location, developer_id, property_type } = req.body;

    const updateData = {
      name,
      location,
      property_type,
      updated_at: new Date(),
    };

    if (developer_id) updateData.developer_id = developer_id;
    if (req.file) updateData.image_url = `/uploads/${req.file.filename}`;

    const { data: property, error } = await supabase
      .from('properties')
      .update(updateData)
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