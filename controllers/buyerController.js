const supabase = require('../config/db');
const { fetchTeamFor } = require('./teamViewController');

// Decrement/restore a real unit's "Units Available" count when a sale is linked/unlinked/reversed.
// Returns { error } on failure so callers can log it without blocking the buyer operation itself —
// the buyer record is the primary thing being saved; a stock-count hiccup shouldn't lose the sale.
async function decrementUnitStock(unitId) {
  const { data: unit, error: fetchErr } = await supabase.from('units').select('units_left').eq('id', unitId).single();
  if (fetchErr || !unit) return { error: fetchErr || new Error('Unit not found') };
  const left = unit.units_left ?? 1;
  const { error } = await supabase.from('units').update({ units_left: Math.max(0, left - 1), updated_at: new Date() }).eq('id', unitId);
  return { error };
}
async function restoreUnitStock(unitId) {
  const { data: unit, error: fetchErr } = await supabase.from('units').select('units_left').eq('id', unitId).single();
  if (fetchErr || !unit) return { error: fetchErr || new Error('Unit not found') };
  const left = unit.units_left ?? 0;
  const { error } = await supabase.from('units').update({ units_left: left + 1, updated_at: new Date() }).eq('id', unitId);
  return { error };
}

// GET /api/buyers — admin sees all; other roles see only buyers they personally input
const getBuyers = async (req, res) => {
  try {
    const { archived } = req.query;
    let query = supabase.from('buyers').select('*').eq('archived', archived === 'true').order('created_at', { ascending: false });
    if (req.user.role !== 'admin') {
      query = query.eq('input_by_id', req.user.id).eq('input_by_role', req.user.role);
    }
    const { data: buyers, error } = await query;
    if (error) throw error;
    res.json(buyers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// GET /api/buyers/history — for Agent/Team Leader/Sales Manager: sales they recorded under their
// PREVIOUS role, before their most recent promotion. This is view-only history — it does NOT count
// toward their current commission (promotions are a deliberate clean break for that).
const getPreviousRoleSalesHistory = async (req, res) => {
  try {
    const { id, role } = req.user;
    if (!['agent', 'team_leader', 'sales_manager'].includes(role)) {
      return res.status(403).json({ message: 'This account type has no pre-promotion sales history.' });
    }

    // Agents are the base rank — they have no "previous role" to look back on.
    if (role === 'agent') return res.json([]);

    const table = role === 'team_leader' ? 'team_leaders' : 'sales_managers';
    const { data: person, error: personErr } = await supabase
      .from(table)
      .select('previous_role, previous_id')
      .eq('id', id)
      .single();
    if (personErr || !person || !person.previous_role || !person.previous_id) return res.json([]);

    const { data: buyers, error } = await supabase
      .from('buyers')
      .select('*')
      .eq('input_by_role', person.previous_role)
      .eq('input_by_id', person.previous_id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(buyers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// GET /api/buyers/team — for Unit Manager/Sales Manager/Team Leader: buyers added by them
// PLUS everyone in their downward team (used for team-scoped Reports & Analytics)
const getTeamBuyers = async (req, res) => {
  try {
    const { id, role } = req.user;
    if (!['unit_manager', 'sales_manager', 'team_leader'].includes(role)) {
      return res.status(403).json({ message: 'This account type has no team-wide view.' });
    }

    const team = await fetchTeamFor(id, role);
    const people = [{ role, id }];
    (team.salesManagers || []).forEach(p => people.push({ role: 'sales_manager', id: p.id }));
    (team.teamLeaders || []).forEach(p => people.push({ role: 'team_leader', id: p.id }));
    (team.agents || []).forEach(p => people.push({ role: 'agent', id: p.id }));

    const orFilters = people.map(p => `and(input_by_role.eq.${p.role},input_by_id.eq.${p.id})`);
    const { data: buyers, error } = await supabase
      .from('buyers')
      .select('*')
      .or(orFilters.join(','))
      .eq('archived', false)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(buyers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

const ROLE_TABLE_MAP = { agent: 'agents', team_leader: 'team_leaders', sales_manager: 'sales_managers', unit_manager: 'unit_managers' };

// Look up the current name of whoever is creating this record, so it can be frozen onto the
// buyer row. This way, if that person is later promoted (and their old role record is deleted),
// historic "Sold By" displays can still show who actually made the sale at the time.
const lookupPersonName = async (role, id) => {
  const table = ROLE_TABLE_MAP[role];
  if (!table) return null;
  const { data } = await supabase.from(table).select('name').eq('id', id).single();
  return data ? data.name : null;
};

// POST /api/buyers — any logged-in role (agent, team_leader, sales_manager, unit_manager, admin) can add a buyer
// Linking a real listed unit is optional (the person's choice) — when linked, it decrements that
// unit's "Units Available" count by 1. Refused if the unit is already sold out.
const createBuyer = async (req, res) => {
  try {
    const { name, email, phone, address, unit_id, manual_property_name, manual_unit_name, manual_tcp, reservation_date, net_selling_price, payment_option, dp_months, booking_requirements_complete } = req.body;

    // ── Required fields: a real name, a way to reach them, and what they actually bought ──
    if (!name || !String(name).trim()) return res.status(400).json({ message: 'Client name is required.' });
    if (!email && !phone) return res.status(400).json({ message: 'An email or phone number is required, so the client can be reached.' });
    const hasPurchase = unit_id || (manual_property_name && manual_unit_name);
    if (!hasPurchase) return res.status(400).json({ message: 'Specify which unit was purchased — either pick a listed unit, or fill in both Project and Unit Purchased.' });

    // ── Accidental-duplicate guard: catches the same person submitting the exact same sale twice
    // within a few minutes (e.g. a slow connection + an impatient second click). This is NOT about
    // blocking a client's second, later purchase — Re-add already supports that deliberately, and
    // a sale made days or weeks apart is always a different event, never flagged here. ──
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
    let dupeQuery = supabase
      .from('buyers')
      .select('id')
      .eq('input_by_id', req.user.id)
      .eq('input_by_role', req.user.role)
      .ilike('name', String(name).trim())
      .eq('archived', false)
      .eq('cancelled', false)
      .gte('created_at', fiveMinAgo);
    dupeQuery = unit_id ? dupeQuery.eq('unit_id', unit_id) : dupeQuery.eq('manual_property_name', manual_property_name || '').eq('manual_unit_name', manual_unit_name || '');
    const { data: possibleDupes, error: dupeErr } = await dupeQuery;
    if (dupeErr) console.error('Duplicate check failed (continuing anyway):', dupeErr);
    if (possibleDupes && possibleDupes.length) {
      return res.status(409).json({ message: `This looks like a duplicate — you already added a client named "${name}" for this same unit in the last few minutes. If this is really a different sale, please wait a moment and try again.` });
    }

    const input_by_name = await lookupPersonName(req.user.role, req.user.id);

    // If this sale is linked to a real listed unit, snapshot that unit's CURRENT price at the
    // moment of sale into manual_tcp. This locks the price in permanently — if Admin edits the
    // unit's TCP later, this and every other already-recorded sale keeps showing what the buyer
    // actually agreed to pay, instead of silently updating to the new price.
    let lockedTcp = unit_id ? null : (manual_tcp || null);
    if (unit_id) {
      const { data: unitRow } = await supabase.from('units').select('tcp, units_left').eq('id', unit_id).single();
      if (!unitRow) return res.status(404).json({ message: 'Selected unit not found.' });
      if ((unitRow.units_left ?? 1) <= 0) return res.status(400).json({ message: 'This unit is sold out — no units left to link a sale to.' });
      lockedTcp = unitRow.tcp;
    }

    const { data: buyer, error } = await supabase
      .from('buyers')
      .insert([{
        name, email, phone, address,
        unit_id: unit_id || null,
        manual_property_name: unit_id ? null : (manual_property_name || null),
        manual_unit_name: unit_id ? null : (manual_unit_name || null),
        manual_tcp: lockedTcp,
        reservation_date: reservation_date || null,
        net_selling_price: net_selling_price || null,
        payment_option: payment_option || null,
        dp_months: payment_option === 'Monthly Down Payment' ? (dp_months || null) : null,
        booking_requirements_complete: booking_requirements_complete || null,
        input_by_role: req.user.role,
        input_by_id: req.user.id,
        input_by_name,
      }])
      .select()
      .single();

    if (error) throw error;

    if (unit_id) {
      const { error: decErr } = await decrementUnitStock(unit_id);
      if (decErr) console.error('Failed to decrement unit stock:', decErr);
    }

    res.status(201).json(buyer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// PUT /api/buyers/:id — only the original creator or admin can edit
// If the linked unit changes, the old unit's stock is restored and the new one is decremented
const updateBuyer = async (req, res) => {
  try {
    const { data: existing } = await supabase.from('buyers').select('input_by_id, unit_id').eq('id', req.params.id).single();
    if (!existing) return res.status(404).json({ message: 'Not found.' });
    if (req.user.role !== 'admin' && existing.input_by_id !== req.user.id) {
      return res.status(403).json({ message: 'You can only edit buyers you added.' });
    }

    const { name, email, phone, address, unit_id, manual_property_name, manual_unit_name, manual_tcp } = req.body;

    const oldUnitId = existing.unit_id;
    const newUnitId = unit_id || null;

    // Same price-locking rule as createBuyer: if this sale is (re)linked to a real unit,
    // snapshot that unit's CURRENT price now rather than leaving it to drift with future edits.
    let lockedTcp = unit_id ? null : (manual_tcp || null);
    if (unit_id && unit_id !== oldUnitId) {
      const { data: unitRow } = await supabase.from('units').select('tcp, units_left').eq('id', unit_id).single();
      if (!unitRow) return res.status(404).json({ message: 'Selected unit not found.' });
      if ((unitRow.units_left ?? 1) <= 0) return res.status(400).json({ message: 'This unit is sold out — no units left to link a sale to.' });
      lockedTcp = unitRow.tcp;
    } else if (unit_id) {
      const { data: unitRow } = await supabase.from('units').select('tcp').eq('id', unit_id).single();
      if (unitRow) lockedTcp = unitRow.tcp;
    }

    const { data: buyer, error } = await supabase
      .from('buyers')
      .update({
        name, email, phone, address,
        unit_id: unit_id || null,
        manual_property_name: unit_id ? null : (manual_property_name || null),
        manual_unit_name: unit_id ? null : (manual_unit_name || null),
        manual_tcp: lockedTcp,
        updated_at: new Date()
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    if (oldUnitId !== newUnitId) {
      if (oldUnitId) {
        const { error: restoreErr } = await restoreUnitStock(oldUnitId);
        if (restoreErr) console.error('Failed to restore old unit stock:', restoreErr);
      }
      if (newUnitId) {
        const { error: decErr } = await decrementUnitStock(newUnitId);
        if (decErr) console.error('Failed to decrement new unit stock:', decErr);
      }
    }

    res.json(buyer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// PATCH /api/buyers/:id/overrides — admin only: set manager override amounts + incentive for a sale
const setBuyerOverrides = async (req, res) => {
  try {
    const { override_team_leader, override_sales_manager, override_unit_manager, incentive_amount, incentive_reason, incentive_date } = req.body;
    const { data: buyer, error } = await supabase
      .from('buyers')
      .update({
        override_team_leader: override_team_leader || null,
        override_sales_manager: override_sales_manager || null,
        override_unit_manager: override_unit_manager || null,
        incentive_amount: incentive_amount || null,
        incentive_reason: incentive_reason || null,
        incentive_date: incentive_date || null,
        updated_at: new Date(),
      })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    if (!buyer) return res.status(404).json({ message: 'Not found.' });
    res.json(buyer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// DELETE /api/buyers/:id — Admin can archive any client; other roles can only archive their OWN.
// If this sale was linked to a real unit, that unit's stock is restored (the slot is free again
// while this sale is archived) — and re-decremented if the client is later restored.
const deleteBuyer = async (req, res) => {
  try {
    const { data: existing } = await supabase.from('buyers').select('input_by_id, input_by_role, unit_id').eq('id', req.params.id).single();
    if (!existing) return res.status(404).json({ message: 'Not found.' });
    if (req.user.role !== 'admin' && (existing.input_by_id !== req.user.id || existing.input_by_role !== req.user.role)) {
      return res.status(403).json({ message: 'You can only archive clients you added.' });
    }

    const { error } = await supabase.from('buyers').update({ archived: true, updated_at: new Date() }).eq('id', req.params.id);
    if (error) throw error;

    if (existing.unit_id) {
      const { error: restoreErr } = await restoreUnitStock(existing.unit_id);
      if (restoreErr) console.error('Failed to restore unit stock on archive:', restoreErr);
    }

    res.json({ message: 'Client archived.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// PATCH /api/buyers/:id/restore — same ownership rule as archiving
const restoreBuyer = async (req, res) => {
  try {
    const { data: existing } = await supabase.from('buyers').select('input_by_id, input_by_role, unit_id').eq('id', req.params.id).single();
    if (!existing) return res.status(404).json({ message: 'Not found.' });
    if (req.user.role !== 'admin' && (existing.input_by_id !== req.user.id || existing.input_by_role !== req.user.role)) {
      return res.status(403).json({ message: 'You can only restore clients you added.' });
    }
    const { error } = await supabase.from('buyers').update({ archived: false, updated_at: new Date() }).eq('id', req.params.id);
    if (error) throw error;

    if (existing.unit_id) {
      const { error: decErr } = await decrementUnitStock(existing.unit_id);
      if (decErr) console.error('Failed to decrement unit stock on restore:', decErr);
    }

    res.json({ message: 'Client restored.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// DELETE /api/buyers/:id/permanent (admin only) — the real, unrecoverable delete
const permanentlyDeleteBuyer = async (req, res) => {
  try {
    const { error } = await supabase.from('buyers').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Client permanently deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// PATCH /api/buyers/:id/cancel — Admin can cancel any sale; other roles can only cancel their OWN.
// This is FINAL (no un-cancel). Cancelled sales stay visible (grayed out) but are excluded from
// commission and reports — typically used when a buyer stops paying their downpayment.
const cancelBuyer = async (req, res) => {
  try {
    const { data: existing } = await supabase.from('buyers').select('input_by_id, input_by_role, cancelled, unit_id').eq('id', req.params.id).single();
    if (!existing) return res.status(404).json({ message: 'Not found.' });
    if (existing.cancelled) return res.status(400).json({ message: 'This sale is already cancelled.' });
    if (existing.input_by_id !== req.user.id || existing.input_by_role !== req.user.role) {
      return res.status(403).json({ message: 'Only the person who added this sale can cancel it.' });
    }
    const { error } = await supabase.from('buyers').update({ cancelled: true, updated_at: new Date() }).eq('id', req.params.id);
    if (error) throw error;

    if (existing.unit_id) {
      const { error: restoreErr } = await restoreUnitStock(existing.unit_id);
      if (restoreErr) console.error('Failed to restore unit stock on cancel:', restoreErr);
    }

    res.json({ message: 'Sale cancelled.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// PATCH /api/buyers/:id/verify — Admin only. Marks a sale as verified (turns green, seller is notified).
// Body { verified:false } undoes it.
const verifyBuyer = async (req, res) => {
  try {
    const verified = req.body.verified !== false;
    const { data: existing } = await supabase.from('buyers').select('id, cancelled').eq('id', req.params.id).single();
    if (!existing) return res.status(404).json({ message: 'Not found.' });
    if (existing.cancelled) return res.status(400).json({ message: 'A cancelled sale cannot be verified.' });
    const note = verified && req.body.note ? String(req.body.note).trim().slice(0, 500) : null;
    const patch = verified ? { verified: true, verified_at: new Date(), verified_by: req.user.id, verify_note: note || null } : { verified: false, verified_at: null, verified_by: null, verify_note: null };
    const { error } = await supabase.from('buyers').update(patch).eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: verified ? 'Sale verified.' : 'Verification removed.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// PATCH /api/buyers/:id/incentive-archive — Admin only. Hides/restores a sale in the Incentives & Override list
// (does NOT touch the sale itself). Body { archived:true|false }.
const setIncentiveArchived = async (req, res) => {
  try {
    const archived = req.body.archived !== false;
    const { error } = await supabase.from('buyers').update({ incentive_archived: archived }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: archived ? 'Archived.' : 'Restored.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getBuyers, getTeamBuyers, getPreviousRoleSalesHistory, createBuyer, updateBuyer, setBuyerOverrides, deleteBuyer, restoreBuyer, permanentlyDeleteBuyer, cancelBuyer, verifyBuyer, setIncentiveArchived };