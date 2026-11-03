const supabase = require('../config/db');
const uploadToStorage = require('../utils/uploadToStorage');

// ── Price history ──
// Every time a unit's TCP is set (when listed) or changes (on edit), one row is added to
// unit_price_history. A failed history write is logged but never blocks saving the unit itself.
async function recordPriceChange(unitId, oldTcp, newTcp) {
  const { error } = await supabase.from('unit_price_history').insert([{
    unit_id: String(unitId),
    old_tcp: oldTcp === null || oldTcp === undefined ? null : Number(oldTcp),
    new_tcp: Number(newTcp),
  }]);
  if (error) console.error('Failed to record price history (did you run database/unit_price_history.sql?):', error);
}

// ── Bank financing ──
// Sent by the admin form only when at least one term has a rate. Returns:
//   null            → the form sent nothing, leave the unit's bank financing as it is
//   { error }       → bad input
//   { amount, terms } → values to save (terms [] clears it)
const BANK_TERM_YEARS = [5, 10, 15, 20, 25, 30];
function readBankFinancing(body) {
  if (body.bank_financing_terms === undefined) return null;
  let terms;
  try { terms = JSON.parse(body.bank_financing_terms || '[]'); } catch (e) { return { error: 'Bank financing terms are not valid.' }; }
  if (!Array.isArray(terms) || terms.length > 4) return { error: 'Bank financing can have at most 4 year terms.' };
  const clean = [];
  for (const t of terms) {
    const years = Number(t.years), rate = Number(t.rate);
    if (!BANK_TERM_YEARS.includes(years)) return { error: 'Choose a year term of 5, 10, 15, 20, 25 or 30 years.' };
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return { error: 'Each interest rate must be between 0 and 100%.' };
    clean.push({ years, rate });
  }
  const amount = body.bank_financing_amount === '' || body.bank_financing_amount === undefined ? null : Number(body.bank_financing_amount);
  if (clean.length && (!Number.isFinite(amount) || amount <= 0)) return { error: 'Enter the bank financing amount.' };
  return clean.length ? { amount, terms: clean } : { amount: null, terms: null };
}
const BANK_SQL_HINT = ' (did you run database/bank_financing.sql?)';

// GET /api/units?property_id=xxx&archived=true
const getUnits = async (req, res) => {
  try {
    const { property_id, archived } = req.query;

    let query = supabase
      .from('units')
      .select('*')
      .eq('archived', archived === 'true')
      .order('created_at', { ascending: false });

    if (property_id) query = query.eq('property_id', property_id);

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
    const { property_id, unit_name, tcp, reservation_fee, downpayment, downpayment_terms_months, units_left, bedrooms, square_meters, lot_type, furnishing, construction_status, estimated_finish_date, description } = req.body;
    const bank = readBankFinancing(req.body);
    if (bank && bank.error) return res.status(400).json({ message: bank.error });
    const image_url = await uploadToStorage(req.files?.image?.[0], 'unit-photos');
    const computation_image_url = await uploadToStorage(req.files?.computation_image?.[0], 'unit-computations');

    const bankFields = bank ? { bank_financing_amount: bank.amount, bank_financing_terms: bank.terms } : {};
    const { data: unit, error } = await supabase
      .from('units')
      .insert([{
        ...bankFields,
        property_id,
        unit_name,
        tcp,
        reservation_fee: reservation_fee || null,
        downpayment: downpayment || null,
        downpayment_terms_months: downpayment_terms_months || 24,
        units_left: units_left !== undefined && units_left !== '' ? units_left : 1,
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

    if (error) {
      if (bank) { console.error('createUnit failed:', error); return res.status(500).json({ message: 'Failed to save unit: ' + error.message + BANK_SQL_HINT }); }
      throw error;
    }
    if (unit.tcp !== null && unit.tcp !== undefined && unit.tcp !== '') await recordPriceChange(unit.id, null, unit.tcp);
    res.status(201).json(unit);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// PUT /api/units/:id (admin only)
const updateUnit = async (req, res) => {
  try {
    const { unit_name, tcp, reservation_fee, downpayment, downpayment_terms_months, units_left, bedrooms, square_meters, lot_type, furnishing, construction_status, estimated_finish_date, description } = req.body;
    const bank = readBankFinancing(req.body);
    if (bank && bank.error) return res.status(400).json({ message: bank.error });

    const updateData = {
      unit_name,
      tcp,
      reservation_fee: reservation_fee || null,
      downpayment: downpayment || null,
      downpayment_terms_months: downpayment_terms_months || 24,
      units_left: units_left !== undefined && units_left !== '' ? units_left : 0,
      bedrooms: bedrooms || null,
      square_meters: square_meters || null,
      lot_type: lot_type || null,
      furnishing,
      construction_status,
      estimated_finish_date: estimated_finish_date || null,
      description,
      updated_at: new Date(),
    };
    if (bank) { updateData.bank_financing_amount = bank.amount; updateData.bank_financing_terms = bank.terms; }

    if (req.files?.image?.[0]) updateData.image_url = await uploadToStorage(req.files.image[0], 'unit-photos');
    if (req.files?.computation_image?.[0]) updateData.computation_image_url = await uploadToStorage(req.files.computation_image[0], 'unit-computations');

    // The price before this edit, so a change can be added to the price history
    const { data: before } = await supabase.from('units').select('tcp').eq('id', req.params.id).maybeSingle();

    const { data: unit, error } = await supabase
      .from('units')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      if (bank) { console.error('updateUnit failed:', error); return res.status(500).json({ message: 'Failed to update unit: ' + error.message + BANK_SQL_HINT }); }
      throw error;
    }
    if (!unit) return res.status(404).json({ message: 'Unit not found.' });

    if (before && Number(before.tcp) !== Number(unit.tcp)) await recordPriceChange(unit.id, before.tcp, unit.tcp);

    res.json(unit);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// DELETE /api/units/:id (admin only) — archives instead of destroying
const deleteUnit = async (req, res) => {
  try {
    const { error } = await supabase
      .from('units')
      .update({ archived: true, updated_at: new Date() })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Unit archived.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// PATCH /api/units/:id/restore (admin only)
const restoreUnit = async (req, res) => {
  try {
    const { error } = await supabase
      .from('units')
      .update({ archived: false, updated_at: new Date() })
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Unit restored.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// DELETE /api/units/:id/permanent (admin only) — the real, unrecoverable delete
const permanentlyDeleteUnit = async (req, res) => {
  try {
    const { error } = await supabase.from('units').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Unit permanently deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// GET /api/units/:id/price-history — newest first
const getPriceHistory = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('unit_price_history')
      .select('*')
      .eq('unit_id', String(req.params.id))
      .order('changed_at', { ascending: false });
    if (error) { console.error('getPriceHistory failed:', error); return res.status(500).json({ message: 'Could not load price history: ' + error.message + ' (did you run database/unit_price_history.sql?)' }); }
    res.json(data || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getUnits, createUnit, updateUnit, deleteUnit, restoreUnit, permanentlyDeleteUnit, getPriceHistory };