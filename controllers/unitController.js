const supabase = require('../config/db');
const uploadToStorage = require('../utils/uploadToStorage');

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
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// POST /api/units (admin only)
const createUnit = async (req, res) => {
  try {
    const { property_id, unit_name, price, commission_rate, status, bedrooms, square_meters, lot_type, furnishing, construction_status, estimated_finish_date, description } = req.body;
    const image_url = await uploadToStorage(req.files?.image?.[0], 'unit-photos');
    const computation_image_url = await uploadToStorage(req.files?.computation_image?.[0], 'unit-computations');

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
        lot_type: lot_type || null,
        furnishing: furnishing || 'Bare Unit',
        construction_status: construction_status || 'RFO',
        estimated_finish_date: estimated_finish_date || null,
        description,
        image_url,
        computation_image_url,
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(unit);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// PUT /api/units/:id (admin only)
const updateUnit = async (req, res) => {
  try {
    const { unit_name, price, commission_rate, status, bedrooms, square_meters, lot_type, furnishing, construction_status, estimated_finish_date, description } = req.body;

    const updateData = {
      unit_name,
      price,
      commission_rate,
      status,
      bedrooms: bedrooms || null,
      square_meters: square_meters || null,
      lot_type: lot_type || null,
      furnishing,
      construction_status,
      estimated_finish_date: estimated_finish_date || null,
      description,
      updated_at: new Date(),
    };

    if (req.files?.image?.[0]) updateData.image_url = await uploadToStorage(req.files.image[0], 'unit-photos');
    if (req.files?.computation_image?.[0]) updateData.computation_image_url = await uploadToStorage(req.files.computation_image[0], 'unit-computations');

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
    console.error(err);
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
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getUnits, createUnit, updateUnit, deleteUnit };
