const supabase = require('../config/db');
const { fetchTeamFor } = require('./teamViewController');

// ─────────────────────────────────────────────────────────────────────────────
// Calendar
//
// Who sees an event:
//   private → the creator and the required attendees
//   team    → also the creator's team: the managers above them, everyone below them,
//             and (for an agent) the other agents under the same immediate manager
//   public  → everyone
//
// Automatic, read-only dates (never stored, read live each time):
//   commission releases, incentives → the person who recorded the sale (+ Admin sees ALL)
//   overrides                       → the TL / SM / UM receiving the override (+ Admin)
//   reservation dates               → the person who recorded the sale, privately
//   promo end dates                 → everyone, on their own calendar
// ─────────────────────────────────────────────────────────────────────────────

const ROLES = ['admin', 'unit_manager', 'sales_manager', 'team_leader', 'agent'];
const EVENT_TYPES = ['tripping', 'client_meeting', 'team_meeting', 'training', 'personal', 'other'];
const VISIBILITIES = ['private', 'team', 'public'];
const CAN_INVITE = ['admin', 'unit_manager', 'sales_manager', 'team_leader'];
const OVERRIDE_FIELD = { team_leader: 'override_team_leader', sales_manager: 'override_sales_manager', unit_manager: 'override_unit_manager' };
const OVERRIDE_ROLE = { override_team_leader: 'team_leader', override_sales_manager: 'sales_manager', override_unit_manager: 'unit_manager' };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PH_OFFSET = '+08:00'; // the whole group works in Philippine time

const key = (role, id) => `${role}:${id}`;

class BadRequest extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function sendError(res, err) {
  if (err instanceof BadRequest) return res.status(err.status).json({ message: err.message });
  console.error(err);
  return res.status(500).json({ message: 'Server error.' });
}

// ── Everyone in the system, with their reporting lines, in one pass ──
async function loadDirectory() {
  const [admins, ums, sms, tls, agents] = await Promise.all([
    supabase.from('admins').select('id, admin_id, name'),
    supabase.from('unit_managers').select('id, um_id, name, status'),
    supabase.from('sales_managers').select('id, sm_id, name, status, unit_manager_id'),
    supabase.from('team_leaders').select('id, tl_id, name, status, sales_manager_id, unit_manager_id'),
    supabase.from('agents').select('id, agent_id, name, status, team_leader_id, sales_manager_id, unit_manager_id'),
  ]);
  for (const r of [admins, ums, sms, tls, agents]) if (r.error) throw r.error;

  const dir = new Map();
  const add = (rows, role, codeField) => (rows || []).forEach(p => dir.set(key(role, p.id), {
    id: p.id, role, name: p.name, code: p[codeField] || null, status: p.status || 'active',
    team_leader_id: p.team_leader_id || null, sales_manager_id: p.sales_manager_id || null, unit_manager_id: p.unit_manager_id || null,
  }));
  add(admins.data, 'admin', 'admin_id');
  add(ums.data, 'unit_manager', 'um_id');
  add(sms.data, 'sales_manager', 'sm_id');
  add(tls.data, 'team_leader', 'tl_id');
  add(agents.data, 'agent', 'agent_id');
  return dir;
}

function isActive(p) {
  if (!p) return false;
  if (p.role === 'agent') return p.status === 'approved';
  return p.status !== 'suspended';
}

// The managers ABOVE a person (same chain the Team page and override logic use)
function uplineOf(dir, role, id) {
  const me = dir.get(key(role, id));
  if (!me) return [];
  const out = [];
  const push = (r, pid) => { if (pid && dir.has(key(r, pid))) out.push(dir.get(key(r, pid))); };

  if (role === 'agent') {
    if (me.team_leader_id) {
      const tl = dir.get(key('team_leader', me.team_leader_id));
      push('team_leader', me.team_leader_id);
      if (tl) {
        push('sales_manager', tl.sales_manager_id);
        const sm = tl.sales_manager_id ? dir.get(key('sales_manager', tl.sales_manager_id)) : null;
        push('unit_manager', tl.unit_manager_id || (sm && sm.unit_manager_id));
      }
    } else if (me.sales_manager_id) {
      const sm = dir.get(key('sales_manager', me.sales_manager_id));
      push('sales_manager', me.sales_manager_id);
      if (sm) push('unit_manager', sm.unit_manager_id);
    } else if (me.unit_manager_id) {
      push('unit_manager', me.unit_manager_id);
    }
  } else if (role === 'team_leader') {
    const sm = me.sales_manager_id ? dir.get(key('sales_manager', me.sales_manager_id)) : null;
    push('sales_manager', me.sales_manager_id);
    push('unit_manager', me.unit_manager_id || (sm && sm.unit_manager_id));
  } else if (role === 'sales_manager') {
    push('unit_manager', me.unit_manager_id);
  }
  return out.filter(isActive);
}

// Everyone BELOW a manager — reuses the Team page's own lookup so both always agree
async function downlineOf(dir, role, id) {
  if (!['unit_manager', 'sales_manager', 'team_leader'].includes(role)) return [];
  const team = await fetchTeamFor(id, role);
  const out = [];
  (team.salesManagers || []).forEach(p => out.push(dir.get(key('sales_manager', p.id))));
  (team.teamLeaders || []).forEach(p => out.push(dir.get(key('team_leader', p.id))));
  (team.agents || []).forEach(p => out.push(dir.get(key('agent', p.id))));
  return out.filter(isActive);
}

// For an agent: the other agents under the same immediate manager (same rule as the Team page)
function peersOf(dir, id) {
  const me = dir.get(key('agent', id));
  if (!me) return [];
  const field = me.team_leader_id ? 'team_leader_id' : me.sales_manager_id ? 'sales_manager_id' : me.unit_manager_id ? 'unit_manager_id' : null;
  if (!field) return [];
  return [...dir.values()].filter(p => p.role === 'agent' && p.id !== id && p[field] === me[field] && isActive(p));
}

// Whose "team" events this person can see. The relation is two-way: if I'm in your upline,
// you're in my downline, and agent peers see each other.
async function teamCircleKeys(dir, role, id) {
  const people = [...uplineOf(dir, role, id), ...(await downlineOf(dir, role, id))];
  if (role === 'agent') people.push(...peersOf(dir, id));
  return new Set(people.map(p => key(p.role, p.id)));
}

// Who this person may add as a required attendee
async function invitableFor(dir, role, id) {
  if (!CAN_INVITE.includes(role)) return [];
  let people;
  if (role === 'admin') people = [...dir.values()].filter(isActive);
  else people = [...uplineOf(dir, role, id), ...(await downlineOf(dir, role, id))];
  const seen = new Set();
  return people.filter(p => {
    const k = key(p.role, p.id);
    if (seen.has(k) || (p.role === role && p.id === id)) return false;
    seen.add(k);
    return true;
  });
}

function personOut(p, fallback) {
  if (p) return { id: p.id, role: p.role, name: p.name, code: p.code };
  return { id: fallback.id, role: fallback.role, name: fallback.name || 'Former member', code: null };
}

function serializeEvent(ev, attendees, dir, me) {
  return {
    id: ev.id,
    title: ev.title,
    event_type: ev.event_type,
    start_at: ev.start_at,
    end_at: ev.end_at,
    all_day: ev.all_day,
    location: ev.location,
    notes: ev.notes,
    visibility: ev.visibility,
    cancelled: ev.cancelled,
    created_at: ev.created_at,
    updated_at: ev.updated_at,
    created_by: personOut(dir.get(key(ev.created_by_role, ev.created_by_id)), { id: ev.created_by_id, role: ev.created_by_role, name: ev.created_by_name }),
    attendees: attendees.map(a => personOut(dir.get(key(a.person_role, a.person_id)), { id: a.person_id, role: a.person_role })),
    is_mine: ev.created_by_id === me.id && ev.created_by_role === me.role,
    is_required: attendees.some(a => a.person_id === me.id && a.person_role === me.role),
  };
}

async function attendeesByEvent(eventIds) {
  const map = new Map(eventIds.map(id => [id, []]));
  for (let i = 0; i < eventIds.length; i += 200) {
    const chunk = eventIds.slice(i, i + 200);
    const { data, error } = await supabase.from('calendar_event_attendees').select('*').in('event_id', chunk);
    if (error) throw error;
    (data || []).forEach(a => map.get(a.event_id).push(a));
  }
  return map;
}

// ── Turn the request body into a clean row, or explain what's wrong ──
function parseEventBody(body) {
  const title = String(body.title || '').trim();
  if (!title) throw new BadRequest('A title is required.');
  if (title.length > 150) throw new BadRequest('Title must be 150 characters or fewer.');

  const event_type = body.event_type || 'other';
  if (!EVENT_TYPES.includes(event_type)) throw new BadRequest('Choose a valid event type.');
  const visibility = body.visibility || 'private';
  if (!VISIBILITIES.includes(visibility)) throw new BadRequest('Choose who can see this event.');

  const all_day = body.all_day === true || body.all_day === 'true';
  let start_at, end_at;
  if (all_day) {
    const startDate = String(body.start_date || '');
    const endDate = String(body.end_date || body.start_date || '');
    if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) throw new BadRequest('Choose a valid date.');
    if (endDate < startDate) throw new BadRequest('The end date cannot be before the start date.');
    start_at = new Date(`${startDate}T00:00:00${PH_OFFSET}`);
    end_at = new Date(`${endDate}T23:59:59${PH_OFFSET}`);
  } else {
    start_at = new Date(body.start_at);
    end_at = body.end_at ? new Date(body.end_at) : new Date(start_at.getTime() + 3600000);
    if (isNaN(start_at.getTime()) || isNaN(end_at.getTime())) throw new BadRequest('Choose a valid start and end time.');
    if (end_at < start_at) throw new BadRequest('The end time cannot be before the start time.');
  }

  const location = String(body.location || '').trim().slice(0, 200) || null;
  const notes = String(body.notes || '').trim().slice(0, 2000) || null;
  return { title, event_type, visibility, all_day, start_at: start_at.toISOString(), end_at: end_at.toISOString(), location, notes };
}

async function parseAttendees(body, dir, me) {
  const raw = Array.isArray(body.attendees) ? body.attendees : [];
  if (!raw.length) return [];
  if (!CAN_INVITE.includes(me.role)) throw new BadRequest('Agents cannot add required attendees.', 403);

  const allowed = new Set((await invitableFor(dir, me.role, me.id)).map(p => key(p.role, p.id)));
  const out = new Map();
  for (const a of raw) {
    const role = a && a.role, id = a && a.id;
    if (!ROLES.includes(role) || !id) throw new BadRequest('One of the attendees is not valid.');
    if (!allowed.has(key(role, id))) throw new BadRequest('You can only add people from your own team as attendees.', 403);
    out.set(key(role, id), { person_id: String(id), person_role: role });
  }
  return [...out.values()];
}

// Admin events: Private (admin + the people they pick) or Public (every user). No Team option,
// and a Public event needs no attendee list because everyone already sees it.
function applyAdminRules(me, row, attendees) {
  if (me.role !== 'admin') return attendees;
  if (row.visibility === 'team') throw new BadRequest('Admin events are either Private or Public.');
  return row.visibility === 'public' ? [] : attendees;
}

async function loadOwnEvent(req) {
  const { data: ev, error } = await supabase.from('calendar_events').select('*').eq('id', req.params.id).maybeSingle();
  if (error) throw error;
  if (!ev) throw new BadRequest('Event not found.', 404);
  if (ev.created_by_id !== req.user.id || ev.created_by_role !== req.user.role) {
    throw new BadRequest('Only the person who created this event can change it.', 403);
  }
  return ev;
}

// ── Automatic dates for one person, within [from, to] (both 'YYYY-MM-DD') ──
async function autoItemsFor(dir, me, from, to) {
  const items = [];
  const isAdmin = me.role === 'admin';
  const sellerName = b => b.input_by_name || (dir.get(key(b.input_by_role, b.input_by_id)) || {}).name || 'Unknown';
  const live = b => b && !b.cancelled && !b.archived;

  // Sales this person recorded (Admin: every sale), for releases / incentives / reservations
  let buyersQuery = supabase.from('buyers').select('*').eq('archived', false);
  if (!isAdmin) buyersQuery = buyersQuery.eq('input_by_id', me.id).eq('input_by_role', me.role);
  const { data: myBuyers, error: bErr } = await buyersQuery;
  if (bErr) throw bErr;
  const buyerById = new Map((myBuyers || []).filter(live).map(b => [b.id, b]));

  // Commission releases
  if (buyerById.size) {
    let recQuery = supabase.from('commission_receivables').select('*').eq('archived', false).gte('release_date', from).lte('release_date', to);
    if (!isAdmin) recQuery = recQuery.in('buyer_id', [...buyerById.keys()]);
    const { data: recs, error: rErr } = await recQuery;
    if (rErr) throw rErr;
    (recs || []).forEach(r => {
      const b = buyerById.get(r.buyer_id);
      if (!b) return;
      items.push({
        id: `auto-commission-${r.id}`, kind: 'commission', date: String(r.release_date).slice(0, 10),
        title: `Commission release · ${b.name}`, client: b.name, seller: sellerName(b),
        amount: r.amount, detail: r.release_type || null,
      });
    });
  }

  buyerById.forEach(b => {
    const incDate = b.incentive_date ? String(b.incentive_date).slice(0, 10) : null;
    const inRange = d => d && d >= from && d <= to;

    // Incentives go to the person who made the sale
    if (b.incentive_amount && inRange(incDate)) {
      items.push({
        id: `auto-incentive-${b.id}`, kind: 'incentive', date: incDate,
        title: `Incentive · ${b.name}`, client: b.name, seller: sellerName(b),
        amount: b.incentive_amount, detail: b.incentive_reason || null,
      });
    }
    // Admin also sees every override release date across the group
    if (isAdmin && inRange(incDate)) {
      Object.keys(OVERRIDE_ROLE).forEach(field => {
        if (!b[field]) return;
        items.push({
          id: `auto-override-${b.id}-${field}`, kind: 'override', date: incDate,
          title: `Override · ${b.name}`, client: b.name, seller: sellerName(b),
          amount: b[field], detail: `Override for the ${OVERRIDE_ROLE[field].replace('_', ' ')}`,
        });
      });
    }
    // Reservation dates are private to the person who recorded the sale
    const resDate = b.reservation_date ? String(b.reservation_date).slice(0, 10) : null;
    if (!isAdmin && inRange(resDate)) {
      items.push({
        id: `auto-reservation-${b.id}`, kind: 'reservation', date: resDate,
        title: `Reservation · ${b.name}`, client: b.name, seller: sellerName(b), amount: null,
        detail: [b.manual_property_name, b.manual_unit_name].filter(Boolean).join(' · ') || null,
      });
    }
  });

  // Overrides on team sales go to the TL / SM / UM who receives them (same rule as release notices)
  const overrideField = OVERRIDE_FIELD[me.role];
  if (overrideField) {
    const team = await fetchTeamFor(me.id, me.role);
    const people = [];
    (team.salesManagers || []).forEach(p => people.push(key('sales_manager', p.id)));
    (team.teamLeaders || []).forEach(p => people.push(key('team_leader', p.id)));
    (team.agents || []).forEach(p => people.push(key('agent', p.id)));
    if (people.length) {
      const orFilters = people.map(k => { const [r, i] = k.split(':'); return `and(input_by_role.eq.${r},input_by_id.eq.${i})`; });
      const { data: teamBuyers, error: tErr } = await supabase
        .from('buyers').select('*').or(orFilters.join(','))
        .eq('archived', false).not(overrideField, 'is', null)
        .gte('incentive_date', from).lte('incentive_date', to);
      if (tErr) throw tErr;
      (teamBuyers || []).filter(live).forEach(b => {
        items.push({
          id: `auto-override-${b.id}-${overrideField}`, kind: 'override', date: String(b.incentive_date).slice(0, 10),
          title: `Override · ${b.name}`, client: b.name, seller: sellerName(b),
          amount: b[overrideField], detail: 'Override from your team\'s sale',
        });
      });
    }
  }

  // Promo end dates — everyone sees live promotions, so everyone sees when they end
  const { data: promos, error: pErr } = await supabase.from('promotions').select('id, title, ends_at, active')
    .eq('active', true).not('ends_at', 'is', null)
    .gte('ends_at', `${from}T00:00:00${PH_OFFSET}`).lte('ends_at', `${to}T23:59:59${PH_OFFSET}`);
  if (pErr) throw pErr;
  (promos || []).forEach(p => {
    const phDate = new Date(new Date(p.ends_at).getTime() + 8 * 3600000).toISOString().slice(0, 10);
    items.push({ id: `auto-promo-${p.id}`, kind: 'promo_end', date: phDate, title: `Promo ends · ${p.title}`, client: null, seller: null, amount: null, detail: null });
  });

  return items;
}

// GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
const getCalendar = async (req, res) => {
  try {
    const me = { id: req.user.id, role: req.user.role };
    const { from, to } = req.query;
    if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '') || to < from) throw new BadRequest('Give a valid from and to date.');

    const dir = await loadDirectory();
    const { data: events, error } = await supabase.from('calendar_events').select('*')
      .lte('start_at', `${to}T23:59:59${PH_OFFSET}`)
      .gte('end_at', `${from}T00:00:00${PH_OFFSET}`)
      .order('start_at', { ascending: true });
    if (error) throw error;

    const attendees = await attendeesByEvent((events || []).map(e => e.id));
    const circle = await teamCircleKeys(dir, me.role, me.id);

    const visible = (events || []).filter(ev => {
      const mine = ev.created_by_id === me.id && ev.created_by_role === me.role;
      const invited = attendees.get(ev.id).some(a => a.person_id === me.id && a.person_role === me.role);
      if (mine || invited || ev.visibility === 'public') return true;
      return ev.visibility === 'team' && circle.has(key(ev.created_by_role, ev.created_by_id));
    });

    res.json({
      events: visible.map(ev => serializeEvent(ev, attendees.get(ev.id), dir, me)),
      auto: await autoItemsFor(dir, me, from, to),
    });
  } catch (err) { sendError(res, err); }
};

// GET /api/calendar/notices — events starting soon, and changes to events I'm required at
const getNotices = async (req, res) => {
  try {
    const me = { id: req.user.id, role: req.user.role };
    const dir = await loadDirectory();
    const now = Date.now();

    const { data: myRows, error: aErr } = await supabase.from('calendar_event_attendees').select('event_id').eq('person_id', me.id).eq('person_role', me.role);
    if (aErr) throw aErr;
    const invitedIds = (myRows || []).map(r => r.event_id);

    const { data: mine, error: mErr } = await supabase.from('calendar_events').select('*')
      .eq('created_by_id', me.id).eq('created_by_role', me.role).eq('cancelled', false)
      .gte('start_at', new Date(now - 12 * 3600000).toISOString()).lte('start_at', new Date(now + 48 * 3600000).toISOString());
    if (mErr) throw mErr;

    let invited = [];
    if (invitedIds.length) {
      const { data, error } = await supabase.from('calendar_events').select('*').in('id', invitedIds)
        .gte('end_at', new Date(now - 14 * 86400000).toISOString());
      if (error) throw error;
      invited = data || [];
    }

    const all = [...(mine || []), ...invited];
    const attendees = await attendeesByEvent([...new Set(all.map(e => e.id))]);
    const ser = ev => serializeEvent(ev, attendees.get(ev.id) || [], dir, me);

    const startsSoon = ev => {
      const t = new Date(ev.start_at).getTime();
      return !ev.cancelled && t >= now - 12 * 3600000 && t <= now + 48 * 3600000;
    };
    const seenIds = new Set();
    const upcoming = all.filter(ev => startsSoon(ev) && !seenIds.has(ev.id) && seenIds.add(ev.id)).map(ser);

    const changes = invited
      .filter(ev => ev.created_by_id !== me.id || ev.created_by_role !== me.role)
      .filter(ev => new Date(ev.updated_at).getTime() >= now - 14 * 86400000)
      .filter(ev => ev.cancelled || new Date(ev.updated_at).getTime() - new Date(ev.created_at).getTime() > 60000)
      .map(ser);

    res.json({ upcoming, changes });
  } catch (err) { sendError(res, err); }
};

// GET /api/calendar/invitable — people this person may add as required attendees
const getInvitable = async (req, res) => {
  try {
    const dir = await loadDirectory();
    const people = await invitableFor(dir, req.user.role, req.user.id);
    const order = { admin: 0, unit_manager: 1, sales_manager: 2, team_leader: 3, agent: 4 };
    people.sort((a, b) => order[a.role] - order[b.role] || String(a.name).localeCompare(String(b.name)));
    res.json(people.map(p => ({ id: p.id, role: p.role, name: p.name, code: p.code })));
  } catch (err) { sendError(res, err); }
};

// POST /api/calendar
const createEvent = async (req, res) => {
  try {
    const me = { id: req.user.id, role: req.user.role };
    const row = parseEventBody(req.body);
    const dir = await loadDirectory();
    const attendees = applyAdminRules(me, row, (await parseAttendees(req.body, dir, me)).filter(a => !(a.person_id === me.id && a.person_role === me.role)));
    const creator = dir.get(key(me.role, me.id));

    const { data: ev, error } = await supabase.from('calendar_events')
      .insert([{ ...row, created_by_id: me.id, created_by_role: me.role, created_by_name: creator ? creator.name : null }])
      .select().single();
    if (error) throw error;

    if (attendees.length) {
      const { error: aErr } = await supabase.from('calendar_event_attendees').insert(attendees.map(a => ({ ...a, event_id: ev.id })));
      if (aErr) {
        await supabase.from('calendar_events').delete().eq('id', ev.id); // don't leave a half-saved event behind
        throw aErr;
      }
    }
    res.status(201).json(serializeEvent(ev, attendees, dir, me));
  } catch (err) { sendError(res, err); }
};

// PUT /api/calendar/:id — creator only
const updateEvent = async (req, res) => {
  try {
    const me = { id: req.user.id, role: req.user.role };
    await loadOwnEvent(req);
    const row = parseEventBody(req.body);
    const dir = await loadDirectory();
    const attendees = applyAdminRules(me, row, (await parseAttendees(req.body, dir, me)).filter(a => !(a.person_id === me.id && a.person_role === me.role)));

    const { data: ev, error } = await supabase.from('calendar_events')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single();
    if (error) throw error;

    const { error: dErr } = await supabase.from('calendar_event_attendees').delete().eq('event_id', ev.id);
    if (dErr) throw dErr;
    if (attendees.length) {
      const { error: aErr } = await supabase.from('calendar_event_attendees').insert(attendees.map(a => ({ ...a, event_id: ev.id })));
      if (aErr) throw aErr;
    }
    res.json(serializeEvent(ev, attendees, dir, me));
  } catch (err) { sendError(res, err); }
};

// PATCH /api/calendar/:id/cancel — creator only; attendees see it struck through and get a notice
const cancelEvent = async (req, res) => {
  try {
    await loadOwnEvent(req);
    const { error } = await supabase.from('calendar_events')
      .update({ cancelled: true, updated_at: new Date().toISOString() }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Event cancelled.' });
  } catch (err) { sendError(res, err); }
};

// DELETE /api/calendar/:id — creator only; removes it for everyone
const deleteEvent = async (req, res) => {
  try {
    await loadOwnEvent(req);
    const { error } = await supabase.from('calendar_events').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Event deleted.' });
  } catch (err) { sendError(res, err); }
};

module.exports = {
  getCalendar, getNotices, getInvitable, createEvent, updateEvent, cancelEvent, deleteEvent,
  // exported for testing the visibility rules on their own
  uplineOf, peersOf, parseEventBody,
};
