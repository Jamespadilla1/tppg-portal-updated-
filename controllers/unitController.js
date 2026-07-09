const supabase = require('../config/db');

// GET /api/units?property_id=xxx
const getUnits = async (req, res) => {
  try {
    const { property_id, status } = req.query;

    let query = supabase
      .from('units')
      .select('*')
      .order('created_at', { ascending: false });

    if (property_id) query = query.eq('property_id', property_id);
    if (status) query = query.eq('status', status);

    const { data: units, error } = await query;

    if (error) throw error;
    res.json(units);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// POST /api/units (admin only)
const createUnit = async (req, res) => {
  try {
    const { property_id, unit_name, price, commission_rate, status, bedrooms, square_meters, corner_lot, description } = req.body;
    const image_url = req.file ? `/uploads/${req.file.filename}` : null;

    const { data: unit, error } = await supabase
      .from('units')
      .insert([{
        property_id,
        unit_name,
        price,
        commission_rate: commission_rate || 2,
        status: status || 'Available',
        bedrooms: bedrooms || null,
        square_meters: square_meters || null,
        corner_lot: corner_lot === 'true' || corner_lot === true,
        description,
        image_url,
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(unit);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// PUT /api/units/:id (admin only)
const updateUnit = async (req, res) => {
  try {
    const { unit_name, price, commission_rate, status, bedrooms, square_meters, corner_lot, description } = req.body;

    const updateData = {
      unit_name,
      price,
      commission_rate,
      status,
      bedrooms: bedrooms || null,
      square_meters: square_meters || null,
      corner_lot: corner_lot === 'true' || corner_lot === true,
      description,
      updated_at: new Date(),
    };

    if (req.file) updateData.image_url = `/uploads/${req.file.filename}`;

    const { data: unit, error } = await supabase
      .from('units')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!unit) return res.status(404).json({ message: 'Unit not found.' });

    res.json(unit);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// DELETE /api/units/:id (admin only)
const deleteUnit = async (req, res) => {
  try {
    const { error } = await supabase
      .from('units')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Unit deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getUnits, createUnit, updateUnit, deleteUnit };
