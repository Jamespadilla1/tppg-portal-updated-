/* ─────────────────────────────────────────────────────────────────────────────
   TPPG Calendar — shared by admin-dashboard.html, agent-dashboard.html and
   team-dashboard.html. One copy, so all three dashboards behave the same.

   A dashboard only needs:
     1. <script src="calendar.js"></script>
     2. a section containing <div id="calendarRoot"></div>
     3. to call TPPGCalendar.render() when that section is opened
   Optional:
     - an element with id "calNavCount" (unread reminders count on the nav link)
     - window.refreshBellCount(): called after reminders load, so the bell can add them
     - TPPGCalendar.renderNotices('<container id>') to list reminders on another page

   Month / week / day views come from FullCalendar (loaded from a CDN on first use).
   Who can see or change what is enforced by the server (/api/calendar), not here.
   ───────────────────────────────────────────────────────────────────────────── */
(function () {
  if (window.TPPGCalendar) return;

  const FC_SRC = 'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.js';
  const ROLE_LABEL = { admin: 'Admin', unit_manager: 'Unit Manager', sales_manager: 'Sales Manager', team_leader: 'Team Leader', agent: 'Agent' };
  const CAN_INVITE = ['admin', 'unit_manager', 'sales_manager', 'team_leader'];
  const TYPES = {
    tripping:       { label: 'Tripping',       color: '#ea580c' },
    client_meeting: { label: 'Client meeting', color: '#2563eb' },
    team_meeting:   { label: 'Team meeting',   color: '#7c3aed' },
    training:       { label: 'Training',       color: '#0d9488' },
    personal:       { label: 'Personal',       color: '#64748b' },
    other:          { label: 'Other',          color: '#6b7280' },
  };
  const AUTO = {
    commission:  { label: 'Commission release', color: '#16a34a' },
    incentive:   { label: 'Incentive',          color: '#9333ea' },
    override:    { label: 'Override',           color: '#2563eb' },
    reservation: { label: 'Reservation date',   color: '#ca8a04' },
    promo_end:   { label: 'Promo ends',         color: '#ea580c' },
  };
  const VIS = {
    private: { label: 'Private', help: 'Only you and the people you add can see it.' },
    team:    { label: 'Team',    help: 'Your team can see it: your managers, the people under you, and teammates.' },
    public:  { label: 'Public',  help: 'Everyone in the group can see it.' },
  };

  const token = () => localStorage.getItem('token');
  // Admin events are either Private (admin + the people they pick) or Public (everyone) — no Team option
  const isAdmin = () => localStorage.getItem('role') === 'admin';
  const defaultVis = type => isAdmin() ? 'private' : (type === 'tripping' ? 'team' : 'private');
  const ADMIN_VIS_HELP = {
    private: 'Only you and the agents or managers you pick below can see it.',
    public:  'Every agent and manager in the group can see it.',
  };
  const myRole = () => localStorage.getItem('role');
  const seenKey = () => 'calSeen_' + (localStorage.getItem('personId') || localStorage.getItem('adminId') || localStorage.getItem('agentId') || localStorage.getItem('email') || 'me');

  let calendar = null;
  let mounted = false;
  let invitable = null;          // cached list of people this user may invite
  let notices = { upcoming: [], changes: [] };
  let editing = null;            // the event being edited, or null for a new one
  let visTouched = false;        // has the user picked visibility themselves?

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pad = n => String(n).padStart(2, '0');
  const localDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const localTime = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const addDays = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); return localDate(new Date(y, m - 1, d + n)); };
  const fmtDate = ymd => { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); };
  const fmtTime = d => d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });

  const ICON = {
    lock:  '<svg class="tcal-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    private: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    team:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.2A6.5 6.5 0 0 1 21.5 20"/></svg>',
    public: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18"/></svg>',
  };
  // soft background + darker text tone for a type colour
  const soft = hex => hex + '1a';
  const deep = hex => {
    const n = parseInt(hex.slice(1), 16), k = 0.72;
    const c = v => Math.round(v * k).toString(16).padStart(2, '0');
    return '#' + c(n >> 16) + c((n >> 8) & 255) + c(n & 255);
  };
  const hiddenKinds = new Set();   // event types (and 'auto') switched off in the filter chips

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: { 'Authorization': 'Bearer ' + token(), ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok) throw new Error((data && data.message) || 'Something went wrong. Please try again.');
    return data;
  }

  // ── styles (prefixed tcal- so nothing clashes with the dashboards) ──
  function addStyles() {
    if (document.getElementById('tcal-css')) return;
    const css = `
      #calendarRoot, .tcal-backdrop {
        --ink:#1c1917; --ink-2:#44403c; --muted:#78716c; --faint:#a8a29e;
        --line:#ece8e3; --line-2:#f4f1ed; --paper:#ffffff; --surface:#faf8f5;
        --accent:#ea580c; --accent-2:#f97316; --accent-soft:#fff4ec; --accent-line:#fed7aa;
      }
      .tcal-wrap{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:20px;align-items:start;animation:tcal-rise .35s ease both}
      @media(max-width:1180px){.tcal-wrap{grid-template-columns:1fr}}
      @keyframes tcal-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
      @keyframes tcal-pop{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:none}}
      .tcal-card{background:var(--paper);border:1px solid var(--line);border-radius:16px;box-shadow:0 1px 2px rgba(28,25,23,.04)}
      .tcal-main{padding:18px 20px 20px}

      /* top row: type filters + new event */
      .tcal-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}
      .tcal-filters{display:flex;gap:6px;flex-wrap:wrap}
      .tcal-chip{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border-radius:999px;border:1px solid var(--line);background:var(--paper);color:var(--ink-2);font-size:.74rem;font-weight:500;cursor:pointer;transition:all .15s;user-select:none}
      .tcal-chip:hover{border-color:#d6d3d1}
      .tcal-chip i{width:8px;height:8px;border-radius:50%;background:var(--c);flex-shrink:0;transition:all .15s}
      .tcal-chip.off{color:var(--faint);background:var(--surface);text-decoration:line-through}
      .tcal-chip.off i{background:transparent;box-shadow:inset 0 0 0 1.5px var(--faint)}
      .tcal-chip svg{width:12px;height:12px}
      .tcal-btn{display:inline-flex;align-items:center;gap:6px;background:var(--accent-2);color:#fff;border:none;border-radius:10px;padding:9px 16px;font-size:.82rem;font-weight:600;cursor:pointer;box-shadow:0 1px 0 rgba(255,255,255,.25) inset,0 4px 12px rgba(249,115,22,.25);transition:all .15s}
      .tcal-btn:hover{background:var(--accent);transform:translateY(-1px)}
      .tcal-btn:disabled{opacity:.6;cursor:wait;transform:none}
      .tcal-btn-ghost{display:inline-flex;align-items:center;gap:6px;background:var(--paper);color:var(--ink-2);border:1px solid var(--line);border-radius:10px;padding:9px 14px;font-size:.82rem;font-weight:500;cursor:pointer;transition:all .15s}
      .tcal-btn-ghost:hover{background:var(--surface);color:var(--ink)}
      .tcal-btn-danger{background:transparent;color:#dc2626;border:1px solid transparent;border-radius:10px;padding:9px 12px;font-size:.82rem;font-weight:500;cursor:pointer;transition:all .15s}
      .tcal-btn-danger:hover{background:#fef2f2;border-color:#fecaca}
      .tcal-btn-danger.armed{background:#dc2626;color:#fff;border-color:#dc2626}

      /* side column */
      .tcal-col{display:flex;flex-direction:column;gap:16px}
      .tcal-today{position:relative;overflow:hidden;padding:18px 20px;background:linear-gradient(135deg,#fff7f0 0%,#ffffff 60%);border-color:#fbe3cf}
      .tcal-today::after{content:'';position:absolute;right:-30px;top:-30px;width:120px;height:120px;border-radius:50%;background:radial-gradient(circle,rgba(249,115,22,.14),transparent 70%)}
      .tcal-today-row{display:flex;align-items:center;gap:14px;position:relative}
      .tcal-today-num{font-size:2.6rem;font-weight:700;line-height:1;color:var(--accent);letter-spacing:-.03em;font-variant-numeric:tabular-nums}
      .tcal-today-dow{font-size:.95rem;font-weight:700;color:var(--ink)}
      .tcal-today-mon{font-size:.75rem;color:var(--muted);margin-top:1px}
      .tcal-today-sum{position:relative;margin-top:12px;font-size:.78rem;color:var(--ink-2)}
      .tcal-today-sum b{color:var(--accent)}
      .tcal-side{padding:16px 18px 10px}
      .tcal-side h4{font-size:.72rem;font-weight:700;color:var(--muted);margin:0 0 6px;text-transform:uppercase;letter-spacing:.07em}
      .tcal-day{font-size:.72rem;font-weight:700;color:var(--ink);margin:12px 0 4px;display:flex;align-items:center;gap:6px}
      .tcal-day:first-of-type{margin-top:6px}
      .tcal-day span{font-weight:500;color:var(--faint)}
      .tcal-item{display:grid;grid-template-columns:62px 1fr;gap:10px;padding:8px 8px;margin:0 -8px;border-radius:10px;cursor:pointer;transition:background .12s;animation:tcal-rise .3s ease both}
      .tcal-item:hover{background:var(--surface)}
      .tcal-item:hover .tcal-item-title{color:var(--accent)}
      .tcal-item-time{font-size:.72rem;color:var(--muted);font-variant-numeric:tabular-nums;padding-top:1px;white-space:nowrap}
      .tcal-item-body{border-left:3px solid var(--c);padding-left:9px;min-width:0}
      .tcal-item-title{font-size:.82rem;font-weight:600;color:var(--ink);line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:color .12s}
      .tcal-item-sub{font-size:.7rem;color:var(--muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .tcal-item.auto .tcal-item-body{border-left-style:dotted}
      .tcal-empty{font-size:.78rem;color:var(--faint);padding:8px 0 10px}
      .tcal-pill{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;font-size:.68rem;font-weight:600}
      .tcal-req{color:var(--accent);font-weight:600}
      .tcal-lock{display:inline-block;width:11px;height:11px;vertical-align:-1px;flex-shrink:0}
      .tcal-count{margin-left:auto;background:#f97316;color:#fff;font-size:10px;font-weight:700;min-width:18px;height:18px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;padding:0 5px}
      .tcal-count.hidden{display:none}

      /* modals */
      .tcal-backdrop{display:none;position:fixed;inset:0;background:rgba(28,25,23,.42);backdrop-filter:blur(2px);z-index:60;align-items:center;justify-content:center;padding:1rem}
      .tcal-backdrop.open{display:flex}
      .tcal-modal{position:relative;background:var(--paper);border:1px solid var(--line);border-radius:18px;width:100%;max-width:560px;padding:26px 26px 22px;max-height:92vh;overflow-y:auto;color:var(--ink);box-shadow:0 24px 60px rgba(28,25,23,.22);animation:tcal-pop .22s cubic-bezier(.2,.9,.3,1.2) both}
      .tcal-modal::before{content:'';position:absolute;left:0;right:0;top:0;height:5px;background:var(--tc,var(--accent-2));border-radius:18px 18px 0 0;transition:background .2s}
      .tcal-modal h3{font-size:1.1rem;font-weight:700;margin:0 0 4px;letter-spacing:-.01em}
      .tcal-modal-sub{font-size:.75rem;color:var(--muted);margin:0 0 14px}
      .tcal-title-input{width:100%;border:none;border-bottom:2px solid var(--line);padding:8px 0;font-size:1.15rem;font-weight:600;color:var(--ink);outline:none;background:transparent;transition:border-color .15s;box-sizing:border-box}
      .tcal-title-input:focus{border-color:var(--tc,var(--accent-2))}
      .tcal-title-input::placeholder{color:#c7c2bd;font-weight:500}
      .tcal-label{display:block;font-size:.7rem;font-weight:700;color:var(--muted);margin:16px 0 7px;text-transform:uppercase;letter-spacing:.06em}
      .tcal-field{width:100%;padding:9px 12px;background:var(--paper);border:1px solid var(--line);border-radius:10px;color:var(--ink);font-size:.85rem;outline:none;box-sizing:border-box;transition:border-color .15s,box-shadow .15s}
      .tcal-field:focus{border-color:var(--accent-2);box-shadow:0 0 0 3px rgba(249,115,22,.12)}
      .tcal-row{display:grid;grid-template-columns:1.3fr 1fr;gap:10px}
      .tcal-help{font-size:.72rem;color:var(--muted);margin-top:6px}
      .tcal-sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
      .tcal-types{display:flex;flex-wrap:wrap;gap:6px}
      .tcal-type{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;border:1px solid var(--line);background:var(--paper);font-size:.78rem;font-weight:500;color:var(--ink-2);cursor:pointer;transition:all .15s}
      .tcal-type i{width:8px;height:8px;border-radius:50%;background:var(--c)}
      .tcal-type:hover{border-color:#d6d3d1}
      .tcal-type.on{background:var(--soft);border-color:var(--c);color:var(--ink);font-weight:600}
      .tcal-seg{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:4px;background:var(--line-2);border-radius:12px}
      .tcal-seg button{display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 6px;border:none;border-radius:9px;background:transparent;font-size:.78rem;font-weight:500;color:var(--muted);cursor:pointer;transition:all .15s}
      .tcal-seg button svg{width:14px;height:14px}
      .tcal-seg button.on{background:var(--paper);color:var(--ink);font-weight:600;box-shadow:0 1px 3px rgba(28,25,23,.12)}
      .tcal-when{border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--surface)}
      .tcal-when-row{display:grid;grid-template-columns:48px 1fr 120px;gap:8px;align-items:center}
      .tcal-when-row + .tcal-when-row{margin-top:8px}
      .tcal-when-row > span{font-size:.72rem;font-weight:600;color:var(--muted)}
      .tcal-when.allday .tcal-time{visibility:hidden}
      .tcal-switch{display:inline-flex;align-items:center;gap:9px;font-size:.8rem;font-weight:500;color:var(--ink-2);cursor:pointer;margin-bottom:10px;user-select:none}
      .tcal-switch input{position:absolute;opacity:0;pointer-events:none}
      .tcal-switch b{position:relative;width:32px;height:18px;border-radius:999px;background:#d6d3d1;transition:background .15s;flex-shrink:0}
      .tcal-switch b::after{content:'';position:absolute;left:2px;top:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform .15s}
      .tcal-switch input:checked + b{background:var(--accent-2)}
      .tcal-switch input:checked + b::after{transform:translateX(14px)}
      .tcal-switch input:focus-visible + b{box-shadow:0 0 0 3px rgba(249,115,22,.25)}
      .tcal-err{font-size:.78rem;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:9px 12px;margin-top:14px}
      .tcal-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:22px;padding-top:16px;border-top:1px solid var(--line-2)}
      .tcal-actions .tcal-left{margin-right:auto;display:flex;gap:4px}
      .tcal-people{border:1px solid var(--line);border-radius:10px;max-height:200px;overflow-y:auto;margin-top:6px}
      .tcal-people label{display:flex;align-items:center;gap:9px;padding:8px 12px;font-size:.8rem;cursor:pointer;border-top:1px solid var(--line-2)}
      .tcal-people label:first-child{border-top:none}
      .tcal-people label:hover{background:var(--accent-soft)}
      .tcal-people input{accent-color:var(--accent-2)}
      .tcal-people .tcal-group{padding:6px 12px;font-size:.66rem;font-weight:700;color:var(--faint);text-transform:uppercase;letter-spacing:.06em;background:var(--surface);border-top:1px solid var(--line-2);position:sticky;top:0}
      .tcal-dl{display:grid;grid-template-columns:100px 1fr;gap:10px 14px;font-size:.84rem;margin-top:14px}
      .tcal-dl dt{color:var(--muted);font-size:.75rem;font-weight:600;padding-top:1px}
      .tcal-dl dd{margin:0;color:var(--ink);word-break:break-word}

      /* FullCalendar skin */
      #calendarRoot .fc{font-size:.8rem;--fc-border-color:var(--line);--fc-today-bg-color:transparent;--fc-now-indicator-color:var(--accent-2);--fc-page-bg-color:#fff;--fc-neutral-bg-color:var(--surface);--fc-highlight-color:rgba(249,115,22,.08);--fc-event-border-color:transparent}
      #calendarRoot .fc .fc-toolbar.fc-header-toolbar{margin-bottom:14px}
      #calendarRoot .fc .fc-toolbar-title{font-size:1.3rem;font-weight:700;color:var(--ink);letter-spacing:-.02em}
      #calendarRoot .fc .fc-button{background:var(--paper);color:var(--ink-2);border:1px solid var(--line);font-size:.78rem;font-weight:500;padding:6px 12px;text-transform:none;box-shadow:none;border-radius:10px;transition:all .15s}
      #calendarRoot .fc .fc-button:hover{background:var(--surface);color:var(--ink)}
      #calendarRoot .fc .fc-button:focus{box-shadow:0 0 0 3px rgba(249,115,22,.15)}
      #calendarRoot .fc .fc-button:disabled{opacity:.45}
      #calendarRoot .fc .fc-prev-button,#calendarRoot .fc .fc-next-button{width:34px;padding:6px 0;border-radius:50%!important;margin-right:4px}
      #calendarRoot .fc .fc-today-button{margin-left:6px!important}
      #calendarRoot .fc .fc-button-group:has(.fc-dayGridMonth-button){background:var(--line-2);border-radius:12px;padding:3px;gap:2px}
      #calendarRoot .fc .fc-button-group:has(.fc-dayGridMonth-button) .fc-button{border:none;border-radius:9px!important;background:transparent;color:var(--muted)}
      #calendarRoot .fc .fc-button-group:has(.fc-dayGridMonth-button) .fc-button.fc-button-active{background:var(--paper);color:var(--ink);font-weight:600;box-shadow:0 1px 3px rgba(28,25,23,.12)}
      #calendarRoot .fc .fc-scrollgrid{border-radius:12px;overflow:hidden;border-color:var(--line)}
      #calendarRoot .fc th{border-color:var(--line)}
      #calendarRoot .fc .fc-col-header-cell{background:var(--surface);padding:8px 0}
      #calendarRoot .fc .fc-col-header-cell-cushion{color:var(--muted);font-weight:600;font-size:.7rem;text-transform:uppercase;letter-spacing:.07em;text-decoration:none}
      #calendarRoot .fc a{color:inherit;text-decoration:none}
      #calendarRoot .fc .fc-daygrid-day{transition:background .12s}
      #calendarRoot .fc .fc-daygrid-day:hover{background:#fffaf5;cursor:pointer}
      #calendarRoot .fc .fc-day-sat,#calendarRoot .fc .fc-day-sun{background:#fcfbf9}
      #calendarRoot .fc .fc-daygrid-day-number{font-size:.78rem;font-weight:600;color:var(--ink-2);padding:6px 8px;font-variant-numeric:tabular-nums}
      #calendarRoot .fc .fc-day-other .fc-daygrid-day-number{color:#d6d3d1}
      #calendarRoot .fc .fc-day-today .fc-daygrid-day-number{background:var(--accent-2);color:#fff;border-radius:999px;min-width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;padding:0 7px;margin:4px 4px 0 0;box-shadow:0 2px 8px rgba(249,115,22,.35)}
      #calendarRoot .fc .fc-daygrid-day-frame{min-height:96px}
      #calendarRoot .fc .fc-daygrid-more-link{font-size:.7rem;font-weight:600;color:var(--accent);padding:1px 6px}
      #calendarRoot .fc .fc-timegrid-slot{height:2.6em}
      #calendarRoot .fc .fc-timegrid-slot-label-cushion,#calendarRoot .fc .fc-timegrid-axis-cushion{font-size:.7rem;color:var(--faint);font-weight:500}
      #calendarRoot .fc .fc-timegrid-slot-minor{border-top-style:dotted}
      #calendarRoot .fc .fc-timegrid-col.fc-day-today{background:linear-gradient(180deg,rgba(255,244,236,.6),rgba(255,244,236,.15))}
      #calendarRoot .fc .fc-timegrid-now-indicator-line{border-width:2px 0 0}
      #calendarRoot .fc .fc-timegrid-now-indicator-arrow{border-color:var(--accent-2);border-top-color:transparent;border-bottom-color:transparent}
      .tcal-dh{display:flex;flex-direction:column;align-items:center;gap:2px;padding:2px 0}
      .tcal-dh-dow{font-size:.66rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
      .tcal-dh-num{font-size:1.15rem;font-weight:700;color:var(--ink);line-height:1;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:50%;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
      .tcal-dh.today .tcal-dh-dow{color:var(--accent)}
      .tcal-dh.today .tcal-dh-num{background:var(--accent-2);color:#fff;box-shadow:0 2px 8px rgba(249,115,22,.35)}

      /* events */
      #calendarRoot .fc .tcal-ev{border:none!important;border-left:3px solid var(--c)!important;background:var(--soft)!important;color:var(--ink)!important;border-radius:6px;margin:1px 3px;padding:0;box-shadow:none;transition:transform .12s,box-shadow .12s;cursor:pointer}
      #calendarRoot .fc .tcal-ev:hover{transform:translateY(-1px);box-shadow:0 3px 10px rgba(28,25,23,.1)}
      #calendarRoot .fc .fc-timegrid-event.tcal-ev{margin:0 2px 1px 1px;border-radius:8px}
      #calendarRoot .fc .fc-timegrid-event-harness-inset .tcal-ev{box-shadow:0 0 0 1.5px #fff}
      .tcal-ev-in{display:flex;align-items:center;gap:5px;padding:2px 6px;min-width:0;overflow:hidden;font-size:.74rem;line-height:1.35}
      .tcal-ev-in .t{font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .tcal-ev-in .tm{color:var(--cd);font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;flex-shrink:0}
      .tcal-ev-in .star{color:var(--accent);font-size:.7rem;flex-shrink:0}
      .tcal-ev-tg{padding:5px 8px;font-size:.74rem;line-height:1.3;height:100%;box-sizing:border-box;overflow:hidden}
      .tcal-ev-tg .tm{display:block;color:var(--cd);font-weight:600;font-size:.68rem;font-variant-numeric:tabular-nums}
      .tcal-ev-tg .t{display:block;font-weight:600;color:var(--ink)}
      .tcal-ev-tg .loc{display:block;color:var(--muted);font-size:.68rem;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #calendarRoot .fc .tcal-auto{background:#fff!important;box-shadow:inset 0 0 0 1px var(--line)!important;border-left-style:dotted!important}
      #calendarRoot .fc .tcal-auto .t{color:var(--ink-2);font-weight:500}
      #calendarRoot .fc .tcal-cancelled{opacity:.5}
      #calendarRoot .fc .tcal-cancelled .t{text-decoration:line-through}
      #calendarRoot .fc .fc-list{border-radius:12px;overflow:hidden}
      #calendarRoot .fc .fc-list-day-cushion{background:var(--surface)}
      #calendarRoot .fc .fc-list-event:hover td{background:#fffaf5}
      #calendarRoot .fc .fc-list-event-dot{border-color:var(--c)}
      @media (prefers-reduced-motion: reduce){.tcal-wrap,.tcal-item,.tcal-modal{animation:none}#calendarRoot .fc .tcal-ev:hover{transform:none}}
      @media(max-width:640px){
        .tcal-main{padding:14px}
        #calendarRoot .fc .fc-toolbar.fc-header-toolbar{flex-wrap:wrap;gap:8px}
        #calendarRoot .fc .fc-toolbar-title{font-size:1.05rem}
        .tcal-row{grid-template-columns:1fr}
        .tcal-when-row{grid-template-columns:40px 1fr 96px}
        .tcal-ev-in .tm,.tcal-ev-in .tcal-lock{display:none}
      }
    `;
    const style = document.createElement('style');
    style.id = 'tcal-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function loadFullCalendar() {
    if (window.FullCalendar) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.getElementById('tcal-fc-script');
      if (existing) { existing.addEventListener('load', resolve); existing.addEventListener('error', reject); return; }
      const s = document.createElement('script');
      s.id = 'tcal-fc-script';
      s.src = FC_SRC;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load the calendar library. Check your internet connection.'));
      document.head.appendChild(s);
    });
  }

  // ── page layout ──
  function buildShell(root) {
    const chips = Object.entries(TYPES).map(([k, t]) => `<button type="button" class="tcal-chip" data-kind="${k}" style="--c:${t.color}" aria-pressed="true"><i></i>${t.label}</button>`).join('')
      + `<button type="button" class="tcal-chip" data-kind="auto" style="--c:#a8a29e" aria-pressed="true" title="Commission releases, incentives, overrides, reservations and promo end dates">${ICON.lock}Automatic</button>`;
    root.innerHTML = `
      <div class="tcal-wrap">
        <div class="tcal-card tcal-main">
          <div class="tcal-top">
            <div class="tcal-filters" role="group" aria-label="Show event types">${chips}</div>
            <button class="tcal-btn" type="button" id="tcalNewBtn"><span style="font-size:1.05rem;line-height:1">+</span> New event</button>
          </div>
          <div id="tcalCalendar"></div>
        </div>
        <div class="tcal-col">
          <div class="tcal-card tcal-today" id="tcalToday"></div>
          <div class="tcal-card tcal-side">
            <h4>Next 7 days</h4>
            <div id="tcalUpcoming"><p class="tcal-empty">Loading…</p></div>
          </div>
          <div class="tcal-card tcal-side" id="tcalChangesCard" style="display:none">
            <h4>Changes to your required events</h4>
            <div id="tcalChanges"></div>
          </div>
        </div>
      </div>`;
    document.getElementById('tcalNewBtn').addEventListener('click', () => openEditor(null, localDate(new Date())));
    root.querySelectorAll('.tcal-chip').forEach(chip => chip.addEventListener('click', () => {
      const k = chip.dataset.kind;
      if (hiddenKinds.has(k)) hiddenKinds.delete(k); else hiddenKinds.add(k);
      chip.classList.toggle('off', hiddenKinds.has(k));
      chip.setAttribute('aria-pressed', String(!hiddenKinds.has(k)));
      if (calendar) calendar.refetchEvents();
    }));
    paintToday(null);
    buildModals();
  }

  function buildModals() {
    if (document.getElementById('tcalEditor')) return;
    const typeOptions = Object.entries(TYPES).map(([k, t]) => `<option value="${k}">${t.label}</option>`).join('');
    const visOptions = Object.entries(VIS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
    const typeChips = Object.entries(TYPES).map(([k, t]) => `<button type="button" class="tcal-type" role="radio" data-val="${k}" style="--c:${t.color};--soft:${soft(t.color)}"><i></i>${t.label}</button>`).join('');
    const visSeg = Object.entries(VIS).filter(([k]) => !(isAdmin() && k === 'team')).map(([k, v]) => `<button type="button" role="radio" data-val="${k}">${ICON[k]}${v.label}</button>`).join('');
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="tcal-backdrop" id="tcalEditor" role="dialog" aria-modal="true" aria-labelledby="tcalEditorTitle">
        <div class="tcal-modal">
          <h3 id="tcalEditorTitle">New event</h3>
          <p class="tcal-modal-sub" id="tcalEditorSub">Add it to your calendar. You can change it any time.</p>
          <input class="tcal-title-input" id="tcalTitle" maxlength="150" placeholder="Add a title, e.g. Tripping with Mr. Santos" aria-label="Title">
          <span class="tcal-label">Type</span>
          <select class="tcal-sr" id="tcalType" aria-hidden="true" tabindex="-1">${typeOptions}</select>
          <div class="tcal-types" id="tcalTypeChips" role="radiogroup" aria-label="Type">${typeChips}</div>
          <span class="tcal-label">When</span>
          <div class="tcal-when" id="tcalWhen">
            <label class="tcal-switch"><input type="checkbox" id="tcalAllDay"><b></b>All day</label>
            <div class="tcal-when-row"><span>Starts</span><input type="date" class="tcal-field" id="tcalStartDate" aria-label="Start date"><div class="tcal-time"><input type="time" class="tcal-field" id="tcalStartTime" aria-label="Start time"></div></div>
            <div class="tcal-when-row"><span>Ends</span><input type="date" class="tcal-field" id="tcalEndDate" aria-label="End date"><div class="tcal-time"><input type="time" class="tcal-field" id="tcalEndTime" aria-label="End time"></div></div>
          </div>
          <span class="tcal-label">Who can see it</span>
          <select class="tcal-sr" id="tcalVis" aria-hidden="true" tabindex="-1">${visOptions}</select>
          <div class="tcal-seg" id="tcalVisSeg" role="radiogroup" aria-label="Who can see it"${isAdmin() ? ' style="grid-template-columns:repeat(2,1fr)"' : ''}>${visSeg}</div>
          <p class="tcal-help" id="tcalVisHelp"></p>
          <label class="tcal-label" for="tcalLocation">Location</label>
          <input class="tcal-field" id="tcalLocation" maxlength="200" placeholder="Optional">
          <label class="tcal-label" for="tcalNotes">Notes</label>
          <textarea class="tcal-field" id="tcalNotes" rows="3" maxlength="2000" placeholder="Optional"></textarea>
          <div id="tcalAttendeeBox" style="display:none">
            <label class="tcal-label" for="tcalPeopleSearch">Required attendees <span id="tcalPickedCount" style="font-weight:400;color:#6b7280"></span></label>
            <input class="tcal-field" id="tcalPeopleSearch" placeholder="Search your team…">
            <div class="tcal-people" id="tcalPeople"><p class="tcal-empty" style="padding:8px 10px">Loading…</p></div>
            <p class="tcal-help">They'll see this event on their calendar, marked as required.</p>
          </div>
          <div class="tcal-err" id="tcalErr" style="display:none"></div>
          <div class="tcal-actions">
            <div class="tcal-left">
              <button type="button" class="tcal-btn-danger" id="tcalCancelEventBtn" style="display:none">Cancel event</button>
              <button type="button" class="tcal-btn-danger" id="tcalDeleteBtn" style="display:none">Delete</button>
            </div>
            <button type="button" class="tcal-btn-ghost" id="tcalCloseBtn">Close</button>
            <button type="button" class="tcal-btn" id="tcalSaveBtn">Save</button>
          </div>
        </div>
      </div>
      <div class="tcal-backdrop" id="tcalViewer" role="dialog" aria-modal="true" aria-labelledby="tcalViewerTitle">
        <div class="tcal-modal">
          <h3 id="tcalViewerTitle"></h3>
          <div id="tcalViewerBody"></div>
          <div class="tcal-actions">
            <a class="tcal-btn-ghost" id="tcalGoogleBtn" target="_blank" rel="noopener" style="text-decoration:none;display:none">Add to Google Calendar</a>
            <button type="button" class="tcal-btn-ghost" id="tcalViewerEditBtn" style="display:none">Edit</button>
            <button type="button" class="tcal-btn" id="tcalViewerCloseBtn">Close</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    const close = id => document.getElementById(id).classList.remove('open');
    ['tcalEditor', 'tcalViewer'].forEach(id => {
      const el = document.getElementById(id);
      el.addEventListener('click', e => { if (e.target === el) close(id); });
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { close('tcalEditor'); close('tcalViewer'); } });
    document.getElementById('tcalCloseBtn').addEventListener('click', () => close('tcalEditor'));
    document.getElementById('tcalViewerCloseBtn').addEventListener('click', () => close('tcalViewer'));
    document.getElementById('tcalSaveBtn').addEventListener('click', saveEvent);
    document.getElementById('tcalAllDay').addEventListener('change', syncAllDay);
    document.getElementById('tcalVis').addEventListener('change', () => { visTouched = true; syncVisHelp(); });
    document.getElementById('tcalType').addEventListener('change', () => {
      if (!visTouched && !editing) document.getElementById('tcalVis').value = defaultVis(document.getElementById('tcalType').value);
      syncVisHelp();
    });
    document.getElementById('tcalStartDate').addEventListener('change', () => {
      const s = document.getElementById('tcalStartDate'), e = document.getElementById('tcalEndDate');
      if (!e.value || e.value < s.value) e.value = s.value;
    });
    document.getElementById('tcalPeopleSearch').addEventListener('input', filterPeople);
    const pick = (selectId, val) => { const sel = document.getElementById(selectId); sel.value = val; sel.dispatchEvent(new Event('change')); };
    document.querySelectorAll('#tcalTypeChips .tcal-type').forEach(b => b.addEventListener('click', () => pick('tcalType', b.dataset.val)));
    document.querySelectorAll('#tcalVisSeg button').forEach(b => b.addEventListener('click', () => pick('tcalVis', b.dataset.val)));
    armButton('tcalDeleteBtn', 'Click again to delete', () => mutateEditing('DELETE', ''));
    armButton('tcalCancelEventBtn', 'Click again to cancel it', () => mutateEditing('PATCH', '/cancel'));
  }

  // Two-click confirm, so nothing is lost by a stray click (and no browser pop-up)
  function armButton(id, armedText, action) {
    const btn = document.getElementById(id);
    let timer = null;
    btn.dataset.label = btn.textContent;
    btn.addEventListener('click', () => {
      if (btn.classList.contains('armed')) {
        clearTimeout(timer); disarm(btn); action();
        return;
      }
      btn.classList.add('armed'); btn.textContent = armedText;
      timer = setTimeout(() => disarm(btn), 4000);
    });
  }
  function disarm(btn) { btn.classList.remove('armed'); btn.textContent = btn.dataset.label; }

  function syncAllDay() {
    document.getElementById('tcalWhen').classList.toggle('allday', document.getElementById('tcalAllDay').checked);
  }
  function syncVisHelp() {
    const type = document.getElementById('tcalType').value, vis = document.getElementById('tcalVis').value;
    document.getElementById('tcalVisHelp').textContent = (isAdmin() && ADMIN_VIS_HELP[vis]) || VIS[vis].help;
    // An admin's Public event already reaches everyone, so there's no one to pick
    document.getElementById('tcalAttendeeBox').style.display = CAN_INVITE.includes(myRole()) && !(isAdmin() && vis === 'public') ? '' : 'none';
    document.querySelectorAll('#tcalTypeChips .tcal-type').forEach(b => { const on = b.dataset.val === type; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    document.querySelectorAll('#tcalVisSeg button').forEach(b => { const on = b.dataset.val === vis; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    document.querySelector('#tcalEditor .tcal-modal').style.setProperty('--tc', (TYPES[type] || TYPES.other).color);
  }
  function showErr(msg) {
    const el = document.getElementById('tcalErr');
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
  }

  // ── attendee picker ──
  async function loadInvitable() {
    if (invitable) return invitable;
    invitable = await api('/api/calendar/invitable');
    return invitable;
  }
  function renderPeople(selected) {
    const box = document.getElementById('tcalPeople');
    if (!invitable || !invitable.length) { box.innerHTML = `<p class="tcal-empty" style="padding:8px 10px">There's no one in your team to add yet.</p>`; return; }
    let html = '', lastRole = null;
    invitable.forEach(p => {
      if (p.role !== lastRole) { html += `<div class="tcal-group">${ROLE_LABEL[p.role]}s</div>`; lastRole = p.role; }
      const k = `${p.role}:${p.id}`;
      html += `<label data-search="${esc((p.name + ' ' + (p.code || '')).toLowerCase())}">
        <input type="checkbox" value="${esc(k)}" ${selected.has(k) ? 'checked' : ''}>
        <span>${esc(p.name)}</span><span style="margin-left:auto;color:#9ca3af;font-size:.72rem">${esc(p.code || '')}</span>
      </label>`;
    });
    box.innerHTML = html;
    box.querySelectorAll('input[type=checkbox]').forEach(cb => cb.addEventListener('change', updatePickedCount));
    updatePickedCount();
  }
  function filterPeople() {
    const q = document.getElementById('tcalPeopleSearch').value.trim().toLowerCase();
    document.querySelectorAll('#tcalPeople label').forEach(l => { l.style.display = !q || l.dataset.search.includes(q) ? '' : 'none'; });
    // hide a role heading when none of the people under it match
    document.querySelectorAll('#tcalPeople .tcal-group').forEach(g => {
      let el = g.nextElementSibling, any = false;
      while (el && !el.classList.contains('tcal-group')) { if (el.style.display !== 'none') any = true; el = el.nextElementSibling; }
      g.style.display = any ? '' : 'none';
    });
  }
  function updatePickedCount() {
    const n = document.querySelectorAll('#tcalPeople input:checked').length;
    document.getElementById('tcalPickedCount').textContent = n ? `· ${n} selected` : '';
  }
  function pickedAttendees() {
    return [...document.querySelectorAll('#tcalPeople input:checked')].map(cb => {
      const i = cb.value.indexOf(':');
      return { role: cb.value.slice(0, i), id: cb.value.slice(i + 1) };
    });
  }

  // ── create / edit ──
  function defaultTimes(ymd) {
    const now = new Date();
    if (ymd !== localDate(now)) return { start: '09:00', end: '10:00' };
    const h = now.getHours() + 1;
    if (h >= 23) return { start: '23:00', end: '23:59' };
    return { start: `${pad(h)}:00`, end: `${pad(h + 1)}:00` };
  }

  // allDayHint: true = an all-day selection, or { start, end } times from a week/day-view selection
  async function openEditor(ev, dateStr, endDateStr, allDayHint) {
    editing = ev;
    visTouched = !!ev;
    showErr('');
    ['tcalDeleteBtn', 'tcalCancelEventBtn'].forEach(id => disarm(document.getElementById(id)));
    document.getElementById('tcalEditorTitle').textContent = ev ? 'Edit event' : 'New event';
    document.getElementById('tcalEditorSub').textContent = ev ? 'Changes are shown to everyone who can see this event.' : 'Add it to your calendar. You can change it any time.';
    document.getElementById('tcalDeleteBtn').style.display = ev ? '' : 'none';
    document.getElementById('tcalCancelEventBtn').style.display = ev && !ev.cancelled ? '' : 'none';

    const now = new Date();
    if (ev) {
      const s = new Date(ev.start_at), e = new Date(ev.end_at);
      document.getElementById('tcalTitle').value = ev.title;
      document.getElementById('tcalType').value = ev.event_type;
      document.getElementById('tcalVis').value = isAdmin() && ev.visibility === 'team' ? 'private' : ev.visibility;
      document.getElementById('tcalAllDay').checked = ev.all_day;
      document.getElementById('tcalStartDate').value = localDate(s);
      document.getElementById('tcalStartTime').value = localTime(s);
      document.getElementById('tcalEndDate').value = localDate(e);
      document.getElementById('tcalEndTime').value = localTime(e);
      document.getElementById('tcalLocation').value = ev.location || '';
      document.getElementById('tcalNotes').value = ev.notes || '';
    } else {
      const times = allDayHint && allDayHint.start ? allDayHint : defaultTimes(dateStr);
      document.getElementById('tcalTitle').value = '';
      document.getElementById('tcalType').value = 'tripping';
      document.getElementById('tcalVis').value = defaultVis('tripping');
      document.getElementById('tcalAllDay').checked = allDayHint === true;
      document.getElementById('tcalStartDate').value = dateStr;
      document.getElementById('tcalEndDate').value = endDateStr || dateStr;
      document.getElementById('tcalStartTime').value = times.start;
      document.getElementById('tcalEndTime').value = times.end;
      document.getElementById('tcalLocation').value = '';
      document.getElementById('tcalNotes').value = '';
    }
    syncAllDay();
    syncVisHelp();

    const canInvite = CAN_INVITE.includes(myRole());
    document.getElementById('tcalAttendeeBox').style.display = canInvite && !(isAdmin() && document.getElementById('tcalVis').value === 'public') ? '' : 'none';
    document.getElementById('tcalPeopleSearch').value = '';
    document.getElementById('tcalEditor').classList.add('open');
    document.getElementById('tcalTitle').focus();

    if (canInvite) {
      const selected = new Set((ev ? ev.attendees : []).map(a => `${a.role}:${a.id}`));
      try { await loadInvitable(); renderPeople(selected); }
      catch (e) { document.getElementById('tcalPeople').innerHTML = `<p class="tcal-empty" style="padding:8px 10px;color:#dc2626">${esc(e.message)}</p>`; }
    }
  }

  async function saveEvent() {
    const btn = document.getElementById('tcalSaveBtn');
    if (btn.disabled) return;
    showErr('');
    const allDay = document.getElementById('tcalAllDay').checked;
    const startDate = document.getElementById('tcalStartDate').value;
    const endDate = document.getElementById('tcalEndDate').value || startDate;
    const body = {
      title: document.getElementById('tcalTitle').value.trim(),
      event_type: document.getElementById('tcalType').value,
      visibility: document.getElementById('tcalVis').value,
      all_day: allDay,
      location: document.getElementById('tcalLocation').value.trim(),
      notes: document.getElementById('tcalNotes').value.trim(),
      attendees: CAN_INVITE.includes(myRole()) && !(isAdmin() && document.getElementById('tcalVis').value === 'public') ? pickedAttendees() : [],
    };
    if (!body.title) return showErr('Please give the event a title.');
    if (!startDate) return showErr('Please choose a start date.');
    if (allDay) {
      body.start_date = startDate;
      body.end_date = endDate;
    } else {
      const st = document.getElementById('tcalStartTime').value, et = document.getElementById('tcalEndTime').value;
      if (!st || !et) return showErr('Please choose a start and end time, or tick All day.');
      const s = new Date(`${startDate}T${st}`), e = new Date(`${endDate}T${et}`);
      if (e < s) return showErr('The event ends before it starts.');
      body.start_at = s.toISOString();
      body.end_at = e.toISOString();
    }

    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      await api(editing ? `/api/calendar/${editing.id}` : '/api/calendar', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(body) });
      document.getElementById('tcalEditor').classList.remove('open');
      toast(editing ? 'Event updated' : 'Event added', body.attendees.length ? `${body.attendees.length} required attendee${body.attendees.length === 1 ? '' : 's'}` : '');
      refreshAll();
    } catch (e) {
      showErr(e.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Save';
    }
  }

  async function mutateEditing(method, suffix) {
    if (!editing) return;
    try {
      await api(`/api/calendar/${editing.id}${suffix}`, { method });
      document.getElementById('tcalEditor').classList.remove('open');
      toast(method === 'DELETE' ? 'Event deleted' : 'Event cancelled', method === 'DELETE' ? '' : 'Attendees will see it as cancelled');
      refreshAll();
    } catch (e) { showErr(e.message); }
  }

  function toast(text, sub) {
    if (typeof window.showToast === 'function') window.showToast(text, sub);
  }

  // ── read-only details ──
  function googleLink(ev) {
    const z = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    let dates;
    if (ev.all_day) {
      const s = localDate(new Date(ev.start_at)).replace(/-/g, '');
      const e = addDays(localDate(new Date(ev.end_at)), 1).replace(/-/g, '');
      dates = `${s}/${e}`;
    } else {
      dates = `${z(new Date(ev.start_at))}/${z(new Date(ev.end_at))}`;
    }
    const p = new URLSearchParams({ action: 'TEMPLATE', text: ev.title, dates, details: ev.notes || '', location: ev.location || '' });
    return 'https://calendar.google.com/calendar/render?' + p.toString();
  }

  function whenText(ev) {
    const s = new Date(ev.start_at), e = new Date(ev.end_at);
    if (ev.all_day) {
      const a = localDate(s), b = localDate(e);
      return a === b ? `${fmtDate(a)} · All day` : `${fmtDate(a)} – ${fmtDate(b)} · All day`;
    }
    return localDate(s) === localDate(e)
      ? `${fmtDate(localDate(s))} · ${fmtTime(s)} – ${fmtTime(e)}`
      : `${fmtDate(localDate(s))} ${fmtTime(s)} – ${fmtDate(localDate(e))} ${fmtTime(e)}`;
  }

  function openViewer(kind, data) {
    const body = document.getElementById('tcalViewerBody');
    const gBtn = document.getElementById('tcalGoogleBtn');
    const editBtn = document.getElementById('tcalViewerEditBtn');
    const row = (k, v) => v ? `<dt>${k}</dt><dd>${v}</dd>` : '';

    if (kind === 'auto') {
      const a = AUTO[data.kind] || { label: 'Date', color: '#6b7280' };
      document.getElementById('tcalViewerTitle').textContent = data.title;
      body.innerHTML = `<dl class="tcal-dl">
        ${row('Type', `<span class="tcal-pill" style="background:${a.color}1a;color:${a.color}">${a.label}</span>`)}
        ${row('Date', esc(fmtDate(data.date)))}
        ${row('Client', esc(data.client))}
        ${row('Sold by', esc(data.seller))}
        ${data.amount != null ? row('Amount', esc(peso(data.amount))) : ''}
        ${row('Details', esc(data.detail))}
      </dl>
      <p class="tcal-help" style="margin-top:16px;display:flex;gap:6px;align-items:flex-start">${ICON.lock}<span>This date comes from the system's records and is only shown to you. It can't be edited here.</span></p>`;
      document.querySelector('#tcalViewer .tcal-modal').style.setProperty('--tc', a.color);
      gBtn.style.display = 'none';
      editBtn.style.display = 'none';
    } else {
      const t = TYPES[data.event_type] || TYPES.other;
      document.getElementById('tcalViewerTitle').textContent = data.title;
      document.querySelector('#tcalViewer .tcal-modal').style.setProperty('--tc', data.cancelled ? '#a8a29e' : t.color);
      const people = data.attendees.length ? data.attendees.map(p => `${esc(p.name)} <span style="color:#9ca3af">(${ROLE_LABEL[p.role] || p.role})</span>`).join('<br>') : '';
      body.innerHTML = `
        ${data.cancelled ? `<p class="tcal-err" style="margin:0 0 12px">This event was cancelled.</p>` : ''}
        ${data.is_required && !data.is_mine ? `<p style="margin:0 0 12px"><span class="tcal-pill" style="background:#fff7ed;color:#ea580c">You're required to attend</span></p>` : ''}
        <dl class="tcal-dl">
          ${row('Type', `<span class="tcal-pill" style="background:${t.color}1a;color:${t.color}">${t.label}</span>`)}
          ${row('When', esc(whenText(data)))}
          ${row('Location', esc(data.location))}
          ${row('Notes', esc(data.notes).replace(/\n/g, '<br>'))}
          ${row('Created by', `${esc(data.created_by.name)} <span style="color:#9ca3af">(${ROLE_LABEL[data.created_by.role] || data.created_by.role})</span>`)}
          ${row('Visible to', esc(VIS[data.visibility].label))}
          ${row('Required', people)}
        </dl>`;
      gBtn.href = googleLink(data);
      gBtn.style.display = data.cancelled ? 'none' : '';
      editBtn.style.display = data.is_mine ? '' : 'none';
      editBtn.onclick = () => { document.getElementById('tcalViewer').classList.remove('open'); openEditor(data); };
    }
    document.getElementById('tcalViewer').classList.add('open');
  }

  // ── data → FullCalendar ──
  function toFcEvent(ev) {
    const t = TYPES[ev.event_type] || TYPES.other;
    const s = new Date(ev.start_at), e = new Date(ev.end_at);
    return {
      id: ev.id,
      title: ev.title,
      start: ev.all_day ? localDate(s) : s,
      end: ev.all_day ? addDays(localDate(e), 1) : e,
      allDay: ev.all_day,
      display: 'block',
      backgroundColor: soft(t.color),
      borderColor: t.color,
      textColor: '#1c1917',
      classNames: ['tcal-ev', ...(ev.cancelled ? ['tcal-cancelled'] : [])],
      extendedProps: { kind: 'event', data: ev, color: t.color, typeKey: ev.event_type },
    };
  }
  function toFcAuto(a) {
    const c = (AUTO[a.kind] || { color: '#6b7280' }).color;
    return {
      id: a.id,
      title: a.title,
      start: a.date,
      allDay: true,
      display: 'block',
      backgroundColor: '#ffffff',
      borderColor: c,
      textColor: '#44403c',
      classNames: ['tcal-ev', 'tcal-auto'],
      extendedProps: { kind: 'auto', data: a, color: c, typeKey: 'auto' },
    };
  }

  // How an event looks inside the grid
  function eventContent(arg) {
    const { kind, data, color } = arg.event.extendedProps;
    const timeGrid = arg.view.type.startsWith('timeGrid') && !arg.event.allDay;
    const star = kind === 'event' && data.is_required && !data.is_mine ? '<span class="star" title="You\'re required to attend">★</span>' : '';
    if (arg.view.type.startsWith('list')) {
      return { html: `<span style="font-weight:600">${kind === 'auto' ? ICON.lock + ' ' : ''}${esc(arg.event.title)}</span>${star ? ' <span class="tcal-req">· Required</span>' : ''}${kind === 'event' && data.location ? ` <span style="color:#78716c">· ${esc(data.location)}</span>` : ''}` };
    }
    if (timeGrid) {
      return { html: `<div class="tcal-ev-tg"><span class="tm">${esc(arg.timeText)}</span><span class="t">${star}${esc(arg.event.title)}</span>${data.location ? `<span class="loc">${esc(data.location)}</span>` : ''}</div>` };
    }
    const tm = !arg.event.allDay && arg.timeText ? `<span class="tm">${esc(arg.timeText)}</span>` : '';
    const lock = kind === 'auto' ? `<span style="color:${color};display:inline-flex">${ICON.lock}</span>` : '';
    return { html: `<div class="tcal-ev-in">${lock}${tm}${star}<span class="t">${esc(arg.event.title)}</span></div>` };
  }

  async function fetchRange(from, to) {
    return api(`/api/calendar?from=${from}&to=${to}`);
  }

  function dayHeader(arg) {
    if (!arg.view.type.startsWith('timeGrid')) return arg.text;
    const today = localDate(arg.date) === localDate(new Date());
    const dow = arg.date.toLocaleDateString('en-PH', { weekday: 'short' });
    return { html: `<div class="tcal-dh${today ? ' today' : ''}"><span class="tcal-dh-dow">${dow}</span><span class="tcal-dh-num">${arg.date.getDate()}</span></div>` };
  }

  function initCalendar() {
    const el = document.getElementById('tcalCalendar');
    calendar = new FullCalendar.Calendar(el, {
      initialView: 'dayGridMonth',
      headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay,listMonth' },
      buttonText: { today: 'Today', month: 'Month', week: 'Week', day: 'Day', list: 'List' },
      height: 'auto',
      views: {
        timeGrid: { scrollTime: '07:00:00', slotLabelFormat: { hour: 'numeric', meridiem: 'short' }, dayHeaderFormat: { weekday: 'short', day: 'numeric' } },
        dayGridMonth: { dayHeaderFormat: { weekday: 'short' } },
      },
      dayMaxEvents: 3,
      nowIndicator: true,
      selectable: true,
      selectMirror: true,
      eventDisplay: 'block',
      slotEventOverlap: false,   // events at the same time sit side by side instead of stacking on top of each other
      eventTimeFormat: { hour: 'numeric', minute: '2-digit', meridiem: 'short' },
      dayHeaderContent: dayHeader,
      eventContent,
      // Month and list grow to fit; week and day keep a fixed height and scroll, opening at 7 AM
      datesSet: info => {
        const want = info.view.type.startsWith('timeGrid') ? 720 : 'auto';
        if (calendar && calendar.getOption('height') !== want) calendar.setOption('height', want);
        if (calendar && want === 720) setTimeout(() => calendar.scrollToTime('07:00:00'), 0);
      },
      eventDidMount: info => {
        const c = info.event.extendedProps.color || '#6b7280';
        info.el.style.setProperty('--c', c);
        info.el.style.setProperty('--soft', info.event.extendedProps.kind === 'auto' ? '#ffffff' : soft(c));
        info.el.style.setProperty('--cd', deep(c));
        const d = info.event.extendedProps.data;
        info.el.title = info.event.extendedProps.kind === 'auto' ? `${d.title} (automatic, only you can see this)` : `${d.title}${d.location ? ' · ' + d.location : ''}`;
      },
      events: async (info, success, failure) => {
        try {
          const from = localDate(info.start);
          const to = addDays(localDate(info.end), -1);
          const data = await fetchRange(from, to);
          const all = [...data.events.map(toFcEvent), ...data.auto.map(toFcAuto)];
          success(all.filter(e => !hiddenKinds.has(e.extendedProps.typeKey)));
        } catch (e) {
          failure(e);
          toast('Could not load the calendar', e.message);
        }
      },
      select: info => {
        calendar.unselect();
        if (info.allDay) {
          const startDay = localDate(info.start), endDay = addDays(localDate(info.end), -1);
          // One day clicked → a timed event (time fields shown). Several days dragged → all day.
          if (startDay === endDay) openEditor(null, startDay, startDay, defaultTimes(startDay));
          else openEditor(null, startDay, endDay, true);
        } else {
          openEditor(null, localDate(info.start), localDate(info.end), { start: localTime(info.start), end: localTime(info.end) });
        }
      },
      eventClick: info => {
        info.jsEvent.preventDefault();
        const { kind, data } = info.event.extendedProps;
        if (kind === 'event' && data.is_mine && !data.cancelled) openEditor(data);
        else openViewer(kind, data);
      },
    });
    calendar.render();
  }

  // ── side panel: today + next 7 days + changes ──
  function paintToday(data) {
    const box = document.getElementById('tcalToday');
    if (!box) return;
    const now = new Date(), today = localDate(now);
    let summary = 'Loading today…';
    if (data) {
      const evs = data.events.filter(e => !e.cancelled && localDate(new Date(e.start_at)) <= today && localDate(new Date(e.end_at)) >= today);
      const autos = data.auto.filter(a => a.date === today);
      const req = evs.filter(e => e.is_required && !e.is_mine).length;
      const parts = [];
      if (evs.length) parts.push(`<b>${evs.length}</b> event${evs.length === 1 ? '' : 's'}`);
      if (autos.length) parts.push(`<b>${autos.length}</b> automatic date${autos.length === 1 ? '' : 's'}`);
      summary = parts.length ? `Today: ${parts.join(' · ')}${req ? ` · <span class="tcal-req">${req} required</span>` : ''}` : 'Nothing on your calendar today.';
    }
    box.innerHTML = `
      <div class="tcal-today-row">
        <div class="tcal-today-num">${now.getDate()}</div>
        <div>
          <div class="tcal-today-dow">${now.toLocaleDateString('en-PH', { weekday: 'long' })}</div>
          <div class="tcal-today-mon">${now.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</div>
        </div>
      </div>
      <p class="tcal-today-sum">${summary}</p>`;
  }

  function sideItem(color, time, title, sub, onClick, isAuto, delay) {
    const div = document.createElement('div');
    div.className = 'tcal-item' + (isAuto ? ' auto' : '');
    div.style.setProperty('--c', color);
    div.style.animationDelay = (delay || 0) + 'ms';
    div.setAttribute('role', 'button');
    div.tabIndex = 0;
    div.innerHTML = `<div class="tcal-item-time">${time}</div><div class="tcal-item-body"><div class="tcal-item-title">${title}</div>${sub ? `<div class="tcal-item-sub">${sub}</div>` : ''}</div>`;
    div.addEventListener('click', onClick);
    div.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } });
    return div;
  }

  function dayLabel(ymd) {
    const today = localDate(new Date());
    if (ymd === today) return 'Today';
    if (ymd === addDays(today, 1)) return 'Tomorrow';
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-PH', { weekday: 'long' });
  }

  async function renderSide() {
    const box = document.getElementById('tcalUpcoming');
    if (!box) return;
    const today = localDate(new Date());
    try {
      const data = await fetchRange(today, addDays(today, 7));
      paintToday(data);
      const rows = [
        ...data.events.filter(e => !e.cancelled && new Date(e.end_at).getTime() >= Date.now())
          .map(e => ({ day: localDate(new Date(e.start_at)) < today ? today : localDate(new Date(e.start_at)), when: new Date(e.start_at).getTime(), kind: 'event', data: e })),
        ...data.auto.map(a => { const [y, m, d] = a.date.split('-').map(Number); return { day: a.date, when: new Date(y, m - 1, d).getTime() - 1, kind: 'auto', data: a }; }),
      ].sort((a, b) => a.day.localeCompare(b.day) || a.when - b.when).slice(0, 14);

      box.innerHTML = rows.length ? '' : `<p class="tcal-empty">Nothing scheduled this week. Click any day on the calendar to add something.</p>`;
      let lastDay = null, i = 0;
      rows.forEach(r => {
        if (r.day !== lastDay) {
          const h = document.createElement('div');
          h.className = 'tcal-day';
          const [y, m, d] = r.day.split('-').map(Number);
          h.innerHTML = `${esc(dayLabel(r.day))} <span>${new Date(y, m - 1, d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</span>`;
          box.appendChild(h);
          lastDay = r.day;
        }
        if (r.kind === 'event') {
          const ev = r.data, t = TYPES[ev.event_type] || TYPES.other;
          const time = ev.all_day ? 'All day' : esc(fmtTime(new Date(ev.start_at)));
          const sub = [ev.location ? esc(ev.location) : '', ev.is_required && !ev.is_mine ? '<span class="tcal-req">Required</span>' : ''].filter(Boolean).join(' · ');
          box.appendChild(sideItem(t.color, time, esc(ev.title), sub, () => openViewer('event', ev), false, i++ * 35));
        } else {
          const a = AUTO[r.data.kind] || { color: '#6b7280', label: 'Date' };
          box.appendChild(sideItem(a.color, `<span style="color:${a.color}">${ICON.lock}</span>`, esc(r.data.title), esc(a.label), () => openViewer('auto', r.data), true, i++ * 35));
        }
      });
    } catch (e) {
      paintToday({ events: [], auto: [] });
      box.innerHTML = `<p class="tcal-empty" style="color:#dc2626">${esc(e.message)}</p>`;
    }

    const card = document.getElementById('tcalChangesCard');
    const cbox = document.getElementById('tcalChanges');
    if (card && cbox) {
      card.style.display = notices.changes.length ? '' : 'none';
      cbox.innerHTML = '';
      notices.changes.forEach((ev, i) => {
        const t = TYPES[ev.event_type] || TYPES.other;
        cbox.appendChild(sideItem(ev.cancelled ? '#dc2626' : t.color, ev.cancelled ? '<span style="color:#dc2626;font-weight:600">Cancelled</span>' : 'Updated', esc(ev.title), esc(whenText(ev)), () => openViewer('event', ev), false, i * 35));
      });
    }
  }

  // ── reminders & change notices (feed the nav count and the bell) ──
  function noticeKeys() {
    return [
      ...notices.upcoming.map(e => `soon:${e.id}:${e.start_at}`),
      ...notices.changes.map(e => `chg:${e.id}:${e.updated_at}`),
    ];
  }
  function readSeen() { try { return new Set(JSON.parse(localStorage.getItem(seenKey()) || '[]')); } catch (e) { return new Set(); } }
  function markSeen() {
    try { localStorage.setItem(seenKey(), JSON.stringify(noticeKeys())); } catch (e) { /* storage unavailable */ }
    api_.unread = 0;
    paintCounts();
  }
  function paintCounts() {
    addStyles(); // the count chip's style lives in the calendar stylesheet
    const el = document.getElementById('calNavCount');
    if (el) {
      el.textContent = api_.unread > 9 ? '9+' : String(api_.unread);
      el.classList.toggle('hidden', api_.unread === 0);
    }
    if (typeof window.refreshBellCount === 'function') window.refreshBellCount();
  }
  async function refreshNotices() {
    if (!token()) return;
    try {
      notices = await api('/api/calendar/notices');
      const seen = readSeen();
      api_.unread = noticeKeys().filter(k => !seen.has(k)).length;
    } catch (e) {
      console.error('Calendar notices:', e.message);
    }
    paintCounts();
  }

  function noticeCard(ev, isChange) {
    const t = TYPES[ev.event_type] || TYPES.other;
    const s = new Date(ev.start_at);
    const dayDiff = Math.round((new Date(localDate(s) + 'T00:00') - new Date(localDate(new Date()) + 'T00:00')) / 86400000);
    const whenWord = ev.cancelled ? 'Cancelled' : isChange ? 'Updated' : dayDiff <= 0 ? 'Today' : dayDiff === 1 ? 'Tomorrow' : `In ${dayDiff} days`;
    return `
      <div class="card p-4 flex items-center justify-between gap-4 flex-wrap" style="cursor:pointer" data-tcal-id="${esc(ev.id)}">
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <span class="tcal-pill" style="background:${t.color}1a;color:${t.color}">${t.label}</span>
            ${ev.is_required && !ev.is_mine ? '<span class="tcal-pill" style="background:#fff7ed;color:#ea580c">Required</span>' : ''}
          </div>
          <p class="font-semibold text-sm" style="${ev.cancelled ? 'text-decoration:line-through' : ''}">${esc(ev.title)}</p>
          <p class="text-xs text-gray-500">${esc(whenText(ev))}${ev.location ? ' · ' + esc(ev.location) : ''}</p>
        </div>
        <div class="text-right shrink-0">
          <p class="text-sm font-semibold" style="color:${ev.cancelled ? '#dc2626' : '#ea580c'}">${whenWord}</p>
        </div>
      </div>`;
  }

  const api_ = {
    unread: 0,

    async render() {
      const root = document.getElementById('calendarRoot');
      if (!root) return;
      addStyles();
      if (!mounted) {
        buildShell(root);
        mounted = true;
        try {
          await loadFullCalendar();
          initCalendar();
        } catch (e) {
          document.getElementById('tcalCalendar').innerHTML = `<p class="tcal-empty" style="color:#dc2626;padding:20px">${esc(e.message)}</p>`;
        }
      } else if (calendar) {
        calendar.refetchEvents();
        // FullCalendar can't measure itself while its section is hidden; re-measure now it's shown
        setTimeout(() => calendar.updateSize(), 0);
      }
      await refreshNotices();
      renderSide();
      markSeen();
    },

    // List reminders + changes in another page (e.g. the Updates page), then mark them read
    async renderNotices(containerId) {
      const box = document.getElementById(containerId);
      if (!box) return;
      addStyles();
      buildModals();
      await refreshNotices();
      const all = [...notices.changes.map(e => [e, true]), ...notices.upcoming.map(e => [e, false])];
      box.innerHTML = all.map(([e, c]) => noticeCard(e, c)).join('')
        || `<div class="card p-5 text-center text-gray-400 text-sm">No events today or tomorrow.</div>`;
      box.querySelectorAll('[data-tcal-id]').forEach(el => el.addEventListener('click', () => {
        const ev = [...notices.changes, ...notices.upcoming].find(x => x.id === el.dataset.tcalId);
        if (ev) openViewer('event', ev);
      }));
      markSeen();
    },

    refreshNotices,
  };

  function refreshAll() {
    if (calendar) calendar.refetchEvents();
    refreshNotices().then(renderSide);
  }

  window.TPPGCalendar = api_;

  // Load the reminder count as soon as the dashboard opens, so the nav / bell can show it
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => refreshNotices());
  else refreshNotices();
})();
