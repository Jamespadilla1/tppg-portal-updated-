const supabase = require('../config/db');

const ROLE_TABLE = { agent: 'agents', team_leader: 'team_leaders', sales_manager: 'sales_managers', unit_manager: 'unit_managers' };
const ROLE_ID_FIELD = { agent: 'agent_id', team_leader: 'tl_id', sales_manager: 'sm_id', unit_manager: 'um_id' };
const ROLE_LABEL = { agent: 'Agent', team_leader: 'Team Leader', sales_manager: 'Sales Manager', unit_manager: 'Unit Manager' };

async function getThreshold() {
  const { data, error } = await supabase.from('app_settings').select('inactivity_days').eq('id', 1).single();
  if (error || !data) return 30; // sensible default if the settings row is somehow missing
  return data.inactivity_days;
}

// GET /api/inactivity/settings — admin
const getSettings = async (req, res) => {
  try {
    res.json({ inactivity_days: await getThreshold() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// PATCH /api/inactivity/settings — admin
const setSettings = async (req, res) => {
  try {
    const days = parseInt(req.body.inactivity_days, 10);
    if (!Number.isFinite(days) || days < 1) return res.status(400).json({ message: 'Enter a number of days of at least 1.' });
    const { error } = await supabase.from('app_settings').update({ inactivity_days: days }).eq('id', 1);
    if (error) throw error;
    res.json({ inactivity_days: days });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// GET /api/inactivity — admin: every non-admin user, with their last login, last sale, and
// whether they're inactive by BOTH measures (no login AND no sale within the threshold)
const getInactivityReport = async (req, res) => {
  try {
    const thresholdDays = await getThreshold();
    const cutoff = Date.now() - thresholdDays * 86400000;

    const [agentsR, tlsR, smsR, umsR, buyersR] = await Promise.all([
      supabase.from('agents').select('id, agent_id, name, email, status, last_login, created_at'),
      supabase.from('team_leaders').select('id, tl_id, name, email, status, last_login, created_at'),
      supabase.from('sales_managers').select('id, sm_id, name, email, status, last_login, created_at'),
      supabase.from('unit_managers').select('id, um_id, name, email, status, last_login, created_at'),
      supabase.from('buyers').select('input_by_role, input_by_id, created_at'),
    ]);
    for (const r of [agentsR, tlsR, smsR, umsR, buyersR]) if (r.error) throw r.error;

    // Latest sale date per person, so we don't have to re-scan the whole buyers list per row
    const lastSaleByPerson = new Map(); // key: `${role}:${id}`
    (buyersR.data || []).forEach(b => {
      if (!b.input_by_role || !b.input_by_id) return;
      const key = `${b.input_by_role}:${b.input_by_id}`;
      const existing = lastSaleByPerson.get(key);
      if (!existing || new Date(b.created_at) > new Date(existing)) lastSaleByPerson.set(key, b.created_at);
    });

    const rolePeople = [
      ...(agentsR.data || []).map(p => ({ ...p, role: 'agent' })),
      ...(tlsR.data || []).map(p => ({ ...p, role: 'team_leader' })),
      ...(smsR.data || []).map(p => ({ ...p, role: 'sales_manager' })),
      ...(umsR.data || []).map(p => ({ ...p, role: 'unit_manager' })),
    ];

    const report = rolePeople.map(p => {
      const lastSale = lastSaleByPerson.get(`${p.role}:${p.id}`) || null;
      const loginIsStale = !p.last_login || new Date(p.last_login).getTime() < cutoff;
      const saleIsStale = !lastSale || new Date(lastSale).getTime() < cutoff;
      return {
        id: p.id,
        role: p.role,
        role_label: ROLE_LABEL[p.role],
        role_id: p[ROLE_ID_FIELD[p.role]],
        name: p.name,
        email: p.email,
        status: p.status,
        last_login: p.last_login || null,
        last_sale: lastSale,
        joined_at: p.created_at,
        inactive: p.status !== 'suspended' && loginIsStale && saleIsStale,
      };
    });

    res.json({ threshold_days: thresholdDays, people: report });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Release notifications: how many days before a scheduled release people get a heads-up ──
const DEFAULT_RELEASE_NOTICE_DAYS = 3;

// GET /api/inactivity/release-notice-days — any logged-in user (every dashboard needs the number)
const getReleaseNoticeDays = async (req, res) => {
  try {
    const { data, error } = await supabase.from('app_settings').select('release_notice_days').eq('id', 1).single();
    if (error) console.error('Could not read release_notice_days (using the default):', error.message);
    const days = data && Number.isFinite(data.release_notice_days) ? data.release_notice_days : DEFAULT_RELEASE_NOTICE_DAYS;
    res.json({ release_notice_days: days });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// PATCH /api/inactivity/release-notice-days — admin
const setReleaseNoticeDays = async (req, res) => {
  try {
    const days = Number(req.body.release_notice_days);
    if (!Number.isInteger(days) || days < 1 || days > 60) {
      return res.status(400).json({ message: 'Enter a whole number of days between 1 and 60.' });
    }
    const { error } = await supabase.from('app_settings').update({ release_notice_days: days }).eq('id', 1);
    if (error) throw error;
    res.json({ release_notice_days: days });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getSettings, setSettings, getInactivityReport, getReleaseNoticeDays, setReleaseNoticeDays };