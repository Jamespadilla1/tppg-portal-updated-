const supabase = require('../config/db');
const uploadToStorage = require('../utils/uploadToStorage');

// GET /api/developers
const getDevelopers = async (req, res) => {
  try {
    const { data: developers, error } = await supabase
      .from('developers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(developers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// POST /api/developers (admin only)
const createDeveloper = async (req, res) => {
  try {
    const { name, drive_link } = req.body;
    if (!name) return res.status(400).json({ message: 'Developer name is required.' });

    const logo_url = await uploadToStorage(req.file, 'developer-logos');

    const { data: developer, error } = await supabase
      .from('developers')
      .insert([{ name, logo_url, drive_link: drive_link || null }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(developer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// PUT /api/developers/:id (admin only)
const updateDeveloper = async (req, res) => {
  try {
    const { name, drive_link } = req.body;
    const updateData = { name, drive_link: drive_link || null };
    if (req.file) updateData.logo_url = await uploadToStorage(req.file, 'developer-logos');

    const { data: developer, error } = await supabase
      .from('developers')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!developer) return res.status(404).json({ message: 'Developer not found.' });

    res.json(developer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// DELETE /api/developers/:id (admin only)
const deleteDeveloper = async (req, res) => {
  try {
    const { error } = await supabase
      .from('developers')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Developer deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// GET /api/developers/public (no auth — used by the public landing page trust bar)
const getPublicDevelopers = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('developers')
      .select('id, name, logo_url')
      .order('name', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('getPublicDevelopers error:', err);
    res.status(500).json({ message: 'Failed to load developers.' });
  }
};

module.exports = { getDevelopers, getPublicDevelopers, createDeveloper, updateDeveloper, deleteDeveloper };