const supabase = require('../config/db');

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
    res.status(500).json({ message: 'Server error.' });
  }
};

// POST /api/developers (admin only)
const createDeveloper = async (req, res) => {
  try {
    const { name } = req.body;
    const logo_url = req.file ? `/uploads/${req.file.filename}` : null;

    if (!name) return res.status(400).json({ message: 'Developer name is required.' });

    const { data: developer, error } = await supabase
      .from('developers')
      .insert([{ name, logo_url }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(developer);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// PUT /api/developers/:id (admin only)
const updateDeveloper = async (req, res) => {
  try {
    const { name } = req.body;
    const updateData = { name };
    if (req.file) updateData.logo_url = `/uploads/${req.file.filename}`;

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
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getDevelopers, createDeveloper, updateDeveloper, deleteDeveloper };
