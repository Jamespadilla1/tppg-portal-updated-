const supabase = require('../config/db');
const uploadToStorage = require('../utils/uploadToStorage');

// GET /api/properties
const getProperties = async (req, res) => {
  try {
    const { status, developer_id, archived } = req.query;

    let query = supabase
      .from('properties')
      .select('*')
      .eq('archived', archived === 'true')
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (developer_id) query = query.eq('developer_id', developer_id);

    const { data: properties, error } = await query;

    if (error) throw error;
    res.json(properties);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// POST /api/properties (admin only)
const createProperty = async (req, res) => {
  try {
    const { name, location, developer_id, property_type, selling_status, turnover_date, latitude, longitude } = req.body;
    const image_url = await uploadToStorage(req.file, 'property-photos');

    const { data: property, error } = await supabase
      .from('properties')
      .insert([{
        name,
        location,
        image_url,
        developer_id: developer_id || null,
        property_type: property_type || 'Condo',
        selling_status: selling_status || 'RFO',
        turnover_date: turnover_date || null,
        latitude: latitude || null,
        longitude: longitude || null,
        date: new Date(),
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(property);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// PUT /api/properties/:id (admin only)
const updateProperty = async (req, res) => {
  try {
    const { name, location, developer_id, property_type, selling_status, turnover_date, latitude, longitude } = req.body;

    const updateData = {
      name,
      location,
      property_type,
      selling_status,
      turnover_date: turnover_date || null,
      latitude: latitude || null,
      longitude: longitude || null,
      updated_at: new Date(),
    };

    if (developer_id) updateData.developer_id = developer_id;
    if (req.file) updateData.image_url = await uploadToStorage(req.file, 'property-photos');

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
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// DELETE /api/properties/:id (admin only) — archives the property and its units instead of destroying them
const deleteProperty = async (req, res) => {
  try {
    const { error } = await supabase
      .from('properties')
      .update({ archived: true, updated_at: new Date() })
      .eq('id', req.params.id);
    if (error) throw error;

    const { error: unitsErr } = await supabase
      .from('units')
      .update({ archived: true, updated_at: new Date() })
      .eq('property_id', req.params.id);
    if (unitsErr) console.error('Failed to cascade-archive units:', unitsErr);

    res.json({ message: 'Property archived.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// PATCH /api/properties/:id/restore (admin only) — restores the property only, not its units
// (units are restored individually, since some may have been archived separately/intentionally)
const restoreProperty = async (req, res) => {
  try {
    const { error } = await supabase
      .from('properties')
      .update({ archived: false, updated_at: new Date() })
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Property restored.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// DELETE /api/properties/:id/permanent (admin only) — the real, unrecoverable delete
const permanentlyDeleteProperty = async (req, res) => {
  try {
    const { error } = await supabase.from('properties').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Property permanently deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getProperties, createProperty, updateProperty, deleteProperty, restoreProperty, permanentlyDeleteProperty };