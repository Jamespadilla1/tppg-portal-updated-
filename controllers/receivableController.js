const supabase = require('../config/db');
const uploadToStorage = require('../utils/uploadToStorage');

// GET /api/commission-receivables (admin only)
const getReceivables = async (req, res) => {
  try {
    const { developer_id, archived } = req.query;
    let query = supabase.from('commission_receivables').select('*').eq('archived', archived === 'true').order('release_date', { ascending: false });
    if (developer_id) query = query.eq('developer_id', developer_id);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// GET /api/commission-receivables/mine — for Agent/TL/SM/UM: commission releases tied to sales THEY personally recorded
const getMyReceivables = async (req, res) => {
  try {
    const { id, role } = req.user;
    const { data: myBuyers, error: buyersErr } = await supabase
      .from('buyers')
      .select('id')
      .eq('input_by_id', id)
      .eq('input_by_role', role);
    if (buyersErr) throw buyersErr;

    const buyerIds = (myBuyers || []).map(b => b.id);
    if (buyerIds.length === 0) return res.json([]);

    const { data, error } = await supabase
      .from('commission_receivables')
      .select('*')
      .in('buyer_id', buyerIds)
      .eq('archived', false)
      .order('release_date', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// POST /api/commission-receivables (admin only)
const createReceivable = async (req, res) => {
  try {
    const { developer_id, buyer_id, amount, release_date, release_type, monthly_amount, tranche_months, notes, percent } = req.body;
    if (!buyer_id || !amount || !release_date) {
      return res.status(400).json({ message: 'Linked sale, amount, and release date are required.' });
    }
    const { data, error } = await supabase
      .from('commission_receivables')
      .insert([{
        developer_id: developer_id || null,
        buyer_id,
        amount,
        release_date,
        release_type: release_type || 'Monthly Tranche',
        monthly_amount: monthly_amount || null,
        tranche_months: tranche_months || null,
        notes: notes || null,
        percent: percent ? String(percent).trim().slice(0, 20) : null,
      }])
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// PUT /api/commission-receivables/:id (admin only)
const updateReceivable = async (req, res) => {
  try {
    const { developer_id, buyer_id, amount, release_date, release_type, monthly_amount, tranche_months, notes, percent } = req.body;
    const { data, error } = await supabase
      .from('commission_receivables')
      .update({ developer_id, buyer_id, amount, release_date, release_type, monthly_amount: monthly_amount || null, tranche_months: tranche_months || null, notes: notes || null, percent: percent ? String(percent).trim().slice(0, 20) : null })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Not found.' });
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// DELETE /api/commission-receivables/:id (admin only) — archives instead of destroying
const deleteReceivable = async (req, res) => {
  try {
    const { error } = await supabase.from('commission_receivables').update({ archived: true }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Archived.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// PATCH /api/commission-receivables/:id/restore (admin only)
const restoreReceivable = async (req, res) => {
  try {
    const { error } = await supabase.from('commission_receivables').update({ archived: false }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Restored.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// DELETE /api/commission-receivables/:id/permanent (admin only) — the real, unrecoverable delete
const permanentlyDeleteReceivable = async (req, res) => {
  try {
    const { error } = await supabase.from('commission_receivables').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Permanently deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// PATCH /api/commission-receivables/:id/proof — Admin only. Attaches a photo of the paycheck (or a
// PDF) to one commission release, form field "proof", replacing any earlier one. Body remove=true
// clears it. The seller sees it next to that release in their Commission page.
const PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const PROOF_MAX_BYTES = 10 * 1024 * 1024;
const setReceivableProof = async (req, res) => {
  try {
    const { data: existing, error: findErr } = await supabase.from('commission_receivables').select('id').eq('id', req.params.id).maybeSingle();
    if (findErr) throw findErr;
    if (!existing) return res.status(404).json({ message: 'Release not found.' });

    let patch;
    if (req.body.remove === 'true' || req.body.remove === true) {
      patch = { proof_url: null, proof_uploaded_at: null };
    } else {
      const file = req.file;
      if (!file) return res.status(400).json({ message: 'Choose a paycheck photo to upload.' });
      if (!PROOF_TYPES.includes(file.mimetype)) return res.status(400).json({ message: 'The paycheck photo must be a JPG, PNG, WEBP image or a PDF.' });
      if (file.size > PROOF_MAX_BYTES) return res.status(400).json({ message: 'The paycheck photo must be 10 MB or smaller.' });
      patch = { proof_url: await uploadToStorage(file, 'release-proofs'), proof_uploaded_at: new Date() };
    }

    const { data, error } = await supabase.from('commission_receivables').update(patch).eq('id', req.params.id).select().single();
    if (error) { console.error('setReceivableProof update failed:', error); return res.status(500).json({ message: 'Update failed: ' + error.message + ' (did you run database/release_proof.sql?)' }); }
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// PATCH /api/commission-receivables/:id/received — the SELLER (not admin) confirms whether they received
// this expected commission. Body { received: true|false }. Only allowed once the date has arrived.
const setReceivableReceived = async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    if (role === 'admin') return res.status(403).json({ message: 'Only the seller can confirm receipt.' });
    const { data: rec, error: recErr } = await supabase.from('commission_receivables').select('id, buyer_id, release_date').eq('id', req.params.id).maybeSingle();
    if (recErr) throw recErr;
    if (!rec) return res.status(404).json({ message: 'Commission record not found.' });
    const { data: buyer, error: buyerErr } = await supabase.from('buyers').select('id, input_by_id, input_by_role, cancelled').eq('id', rec.buyer_id).maybeSingle();
    if (buyerErr) throw buyerErr;
    if (!buyer || buyer.input_by_id !== userId || buyer.input_by_role !== role) {
      return res.status(403).json({ message: 'You can only confirm commission for your own sales.' });
    }
    if (buyer.cancelled) return res.status(400).json({ message: 'This sale was cancelled.' });
    const received = req.body.received !== false && req.body.received !== 'false';
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    if (received && String(rec.release_date).slice(0, 10) > today) {
      return res.status(400).json({ message: 'This commission is not due yet.' });
    }
    const { error } = await supabase.from('commission_receivables')
      .update(received ? { received: true, received_at: new Date() } : { received: false, received_at: null })
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: received ? 'Marked as received.' : 'Marked as not received.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getReceivables, getMyReceivables, createReceivable, updateReceivable, deleteReceivable, restoreReceivable, permanentlyDeleteReceivable, setReceivableProof, setReceivableReceived };