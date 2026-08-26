const supabase = require('../config/db');

// GET /api/sales-target — any logged-in role can read (used for Dashboard progress display)
const getSalesTarget = async (req, res) => {
  try {
    const { data, error } = await supabase.from('commission_settings').select('annual_sales_target').eq('id', 1).single();
    if (error) throw error;
    res.json({ annual_sales_target: data ? data.annual_sales_target : null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// PUT /api/sales-target — admin only
const updateSalesTarget = async (req, res) => {
  try {
    const { annual_sales_target } = req.body;
    const { data, error } = await supabase
      .from('commission_settings')
      .update({ annual_sales_target: annual_sales_target || null })
      .eq('id', 1)
      .select('annual_sales_target')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getSalesTarget, updateSalesTarget };