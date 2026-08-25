const supabase = require('../config/db');
const { fetchTeamFor } = require('./teamViewController');

// GET /api/buyers — admin sees all; other roles see only buyers they personally input
const getBuyers = async (req, res) => {
  try {
    let query = supabase.from('buyers').select('*').order('created_at', { ascending: false });
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

    const orFilters = people.map(p => and(input_by_role.eq.${p.role},input_by_id.eq.${p.id}));
    const { data: buyers, error } = await supabase
      .from('buyers')
      .select('*')
      .or(orFilters.join(','))
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
// This is now a free-text sales log entry (Project / Unit Purchased / TCP typed in directly) since
// Property Listings isn't reliably kept in sync — it no longer auto-links to or marks a real unit Sold.
// Admin marks units Sold manually in Property Listings when appropriate.
const createBuyer = async (req, res) => {
  try {
    const { name, email, phone, address, unit_id, manual_property_name, manual_unit_name, manual_tcp, reservation_date, net_selling_price, payment_option, dp_months, booking_requirements_complete } = req.body;
    const input_by_name = await lookupPersonName(req.user.role, req.user.id);

    const { data: buyer, error } = await supabase
      .from('buyers')
      .insert([{
        name, email, phone, address,
        unit_id: unit_id || null,
        manual_property_name: unit_id ? null : (manual_property_name || null),
        manual_unit_name: unit_id ? null : (manual_unit_name || null),
        manual_tcp: unit_id ? null : (manual_tcp || null),
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
    res.status(201).json(buyer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// PUT /api/buyers/:id — only the original creator or admin can edit
const updateBuyer = async (req, res) => {
  try {
    const { data: existing } = await supabase.from('buyers').select('input_by_id, unit_id').eq('id', req.params.id).single();
    if (!existing) return res.status(404).json({ message: 'Not found.' });
    if (req.user.role !== 'admin' && existing.input_by_id !== req.user.id) {
      return res.status(403).json({ message: 'You can only edit buyers you added.' });
    }

    const {
      name, email, phone, address,
      manual_property_name, manual_unit_name, manual_tcp,
      reservation_date, net_selling_price, payment_option, booking_complete,
    } = req.body;
    const { data: buyer, error } = await supabase
      .from('buyers')
      .update({
        name, email, phone, address,
        manual_property_name: manual_property_name || null,
        manual_unit_name: manual_unit_name || null,
        manual_tcp: manual_tcp || null,
        reservation_date: reservation_date || null,
        net_selling_price: net_selling_price || null,
        payment_option: payment_option || null,
        booking_complete: !!booking_complete,
        updated_at: new Date()
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(buyer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// PATCH /api/buyers/:id/overrides — admin only: set manager override amounts + incentive for a sale
const setBuyerOverrides = async (req, res) => {
  try {
    const { override_team_leader, override_sales_manager, override_unit_manager, incentive_amount } = req.body;
    const { data: buyer, error } = await supabase
      .from('buyers')
      .update({
        override_team_leader: override_team_leader || null,
        override_sales_manager: override_sales_manager || null,
        override_unit_manager: override_unit_manager || null,
        incentive_amount: incentive_amount || null,
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

// DELETE /api/buyers/:id — admin only (prevents accidental data loss by sales roles)
// Reverts the linked unit back to Available since the sale record is gone
const deleteBuyer = async (req, res) => {
  try {
    const { data: existing } = await supabase.from('buyers').select('unit_id').eq('id', req.params.id).single();

    const { error } = await supabase.from('buyers').delete().eq('id', req.params.id);
    if (error) throw error;

    if (existing && existing.unit_id) {
      const { error: revertErr } = await supabase.from('units').update({ status: 'Available', updated_at: new Date() }).eq('id', existing.unit_id);
      if (revertErr) console.error('Failed to revert unit to Available:', revertErr);
    }

    res.json({ message: 'Buyer deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getBuyers, getTeamBuyers, createBuyer, updateBuyer, setBuyerOverrides, deleteBuyer };