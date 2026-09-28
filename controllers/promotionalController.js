const supabase = require('../config/db');

const AUDIENCES = ['public', 'team'];
const SCOPES = ['Developer', 'Property'];

// ── Which promotions are visible right now, and to whom ──
// Kept as a plain function (no database calls) so the audience rules can be tested on their own.
//   audiences: which audience values the caller may see — ['public'] for the landing page,
//              ['public', 'team'] for logged-in team members.
// A promotion is hidden when it is switched off, has passed its end date, or points at a developer /
// property that no longer exists (or a property that has been archived).
function visiblePromos(rows, { developers, properties, audiences, now = Date.now() }) {
  const devById = new Map(developers.map(d => [String(d.id), d]));
  const propById = new Map(properties.map(p => [String(p.id), p]));
  return rows
    .filter(p => audiences.includes(p.audience))
    .filter(p => p.active)
    .filter(p => !p.ends_at || new Date(p.ends_at).getTime() > now)
    .map(p => {
      const target = p.scope === 'Developer' ? devById.get(String(p.target_id)) : propById.get(String(p.target_id));
      return target ? { ...p, target_name: target.name } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.ends_at ? new Date(a.ends_at).getTime() : Infinity) - (b.ends_at ? new Date(b.ends_at).getTime() : Infinity));
}

async function loadLookups() {
  const [{ data: developers, error: dErr }, { data: properties, error: pErr }] = await Promise.all([
    supabase.from('developers').select('id, name'),
    supabase.from('properties').select('id, name').eq('archived', false),
  ]);
  if (dErr) throw dErr;
  if (pErr) throw pErr;
  return { developers: developers || [], properties: properties || [] };
}

// GET /api/promotions/public — NO login required (used by the public landing page).
// Only 'public' promotions are ever read from the database here, so a team-only promotion can never leak.
const getPublicPromotions = async (req, res) => {
  try {
    const { data: rows, error } = await supabase.from('promotions').select('*').eq('audience', 'public');
    if (error) throw error;
    const lookups = await loadLookups();
    const list = visiblePromos(rows || [], { ...lookups, audiences: ['public'] })
      .map(p => ({ title: p.title, message: p.message, scope: p.scope, target_name: p.target_name, ends_at: p.ends_at }));
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// GET /api/promotions/mine — any logged-in user: everything currently live (public + team-only)
const getMyPromotions = async (req, res) => {
  try {
    const { data: rows, error } = await supabase.from('promotions').select('*');
    if (error) throw error;
    const lookups = await loadLookups();
    const list = visiblePromos(rows || [], { ...lookups, audiences: AUDIENCES })
      .map(p => ({ id: p.id, title: p.title, message: p.message, scope: p.scope, target_name: p.target_name, audience: p.audience, ends_at: p.ends_at, created_at: p.created_at }));
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// GET /api/promotions — admin: every promotion, including switched-off and expired ones
const getAllPromotions = async (req, res) => {
  try {
    const { data: rows, error } = await supabase.from('promotions').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    const { developers, properties } = await loadLookups();
    const devById = new Map(developers.map(d => [String(d.id), d]));
    const propById = new Map(properties.map(p => [String(p.id), p]));
    res.json((rows || []).map(p => {
      const target = p.scope === 'Developer' ? devById.get(String(p.target_id)) : propById.get(String(p.target_id));
      return { ...p, target_name: target ? target.name : null };
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// POST /api/promotions — admin
const createPromotion = async (req, res) => {
  try {
    const { title, message, scope, target_id, audience, ends_at } = req.body;
    const t = String(title || '').trim();
    const m = String(message || '').trim();
    if (!t || !m) return res.status(400).json({ message: 'A title and a message are required.' });
    if (t.length > 70) return res.status(400).json({ message: 'Title must be 70 characters or fewer.' });
    if (m.length > 200) return res.status(400).json({ message: 'Message must be 200 characters or fewer.' });
    if (!SCOPES.includes(scope)) return res.status(400).json({ message: 'Choose Developer or Property.' });
    if (!AUDIENCES.includes(audience)) return res.status(400).json({ message: 'Choose who can see this promotion.' });
    if (!target_id) return res.status(400).json({ message: 'Choose the developer or property this applies to.' });

    // The target must exist (and a property must not be archived)
    let targetQuery = supabase.from(scope === 'Developer' ? 'developers' : 'properties').select('id').eq('id', target_id);
    if (scope === 'Property') targetQuery = targetQuery.eq('archived', false);
    const { data: found, error: findErr } = await targetQuery.limit(1);
    if (findErr) throw findErr;
    if (!found || !found.length) return res.status(400).json({ message: 'That developer or property was not found.' });

    let endsAt = null;
    if (ends_at) {
      const d = new Date(ends_at);
      if (isNaN(d.getTime())) return res.status(400).json({ message: 'The end date is not valid.' });
      if (d.getTime() <= Date.now()) return res.status(400).json({ message: 'The end date must be in the future.' });
      endsAt = d.toISOString();
    }

    const { data, error } = await supabase
      .from('promotions')
      .insert([{ title: t, message: m, scope, target_id: String(target_id), audience, ends_at: endsAt, active: true }])
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// PATCH /api/promotions/:id/active — admin: switch a promotion on or off
const setPromotionActive = async (req, res) => {
  try {
    if (typeof req.body.active !== 'boolean') return res.status(400).json({ message: 'active must be true or false.' });
    const { data, error } = await supabase
      .from('promotions')
      .update({ active: req.body.active, updated_at: new Date().toISOString() })
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

// DELETE /api/promotions/:id — admin
const deletePromotion = async (req, res) => {
  try {
    const { error } = await supabase.from('promotions').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Promotion removed.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { visiblePromos, getPublicPromotions, getMyPromotions, getAllPromotions, createPromotion, setPromotionActive, deletePromotion };