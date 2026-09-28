(function () {
  if (window.__tppgPromoStrip) return;
  window.__tppgPromoStrip = true;

  var MIN = 60000, HOUR = 3600000, DAY = 86400000;
  var timer = null;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function timeLeft(ms) {
    if (ms <= 0) return 'Ended';
    var d = Math.floor(ms / DAY), h = Math.floor((ms % DAY) / HOUR), m = Math.floor((ms % HOUR) / MIN);
    if (d >= 1) return d + 'd ' + h + 'h left';
    if (h >= 1) return h + 'h ' + m + 'm left';
    return Math.max(m, 1) + 'm left';
  }

  function endsIn(p) { return new Date(p.ends_at).getTime() - Date.now(); }

  function addStyles() {
    if (document.getElementById('tppg-promo-css')) return;
    var css =
      '.tppg-promos{max-width:80rem;margin:0 auto;padding:64px 24px 0}' +
      '.tppg-promos-head{display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:22px}' +
      '.tppg-eyebrow{margin:0 0 10px;font-size:11px;letter-spacing:.05em;color:#f97316;font-weight:600;text-transform:uppercase}' +
      '.tppg-promos h2{margin:0;font-size:1.875rem;line-height:1.2;font-weight:700}' +
      '.tppg-sub{margin:0;color:#9ca3af;font-size:.875rem;max-width:24rem}' +
      '.tppg-grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}' +
      '.tppg-card{background:#17171a;border:1px solid #2a2a30;border-radius:16px;padding:18px;display:flex;flex-direction:column;gap:8px}' +
      '.tppg-card.hot{border-color:rgba(249,115,22,.55)}' +
      '.tppg-top{display:flex;justify-content:space-between;align-items:center;font-size:11px}' +
      '.tppg-tag{background:rgba(249,115,22,.16);color:#fb923c;font-weight:700;padding:3px 10px;border-radius:999px;letter-spacing:.02em}' +
      '.tppg-tag.ongoing{background:rgba(255,255,255,.08);color:#a1a1aa}' +
      '.tppg-time{color:#a1a1aa;font-weight:600}' +
      '.tppg-time.soon{color:#fb923c}' +
      '.tppg-card h3{margin:2px 0 0;font-size:1.05rem;line-height:1.3;font-weight:600}' +
      '.tppg-card p{margin:0;color:#a1a1aa;font-size:.85rem;line-height:1.5}' +
      '.tppg-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:auto;padding-top:10px;font-size:.8rem;color:#a1a1aa}' +
      '.tppg-cta{background:#f97316;color:#fff;border-radius:8px;padding:6px 12px;font-weight:600;font-size:.78rem;text-decoration:none;white-space:nowrap}' +
      '.tppg-cta:hover{background:#ea580c}' +
      '.tppg-cta:focus-visible{outline:2px solid #fff;outline-offset:2px}';
    var style = el('style');
    style.id = 'tppg-promo-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function card(p) {
    var limited = !!p.ends_at;
    var soon = limited && endsIn(p) < 3 * DAY;
    var c = el('article', 'tppg-card' + (soon ? ' hot' : ''));
    c.setAttribute('data-ends', limited ? String(new Date(p.ends_at).getTime()) : '');

    var top = el('div', 'tppg-top');
    if (limited) {
      top.appendChild(el('span', 'tppg-tag', 'Limited time'));
      var t = el('time', 'tppg-time' + (soon ? ' soon' : ''), timeLeft(endsIn(p)));
      t.setAttribute('datetime', new Date(p.ends_at).toISOString());
      top.appendChild(t);
    } else {
      top.appendChild(el('span', 'tppg-tag ongoing', 'Ongoing offer'));
    }
    c.appendChild(top);
    c.appendChild(el('h3', null, p.title));
    c.appendChild(el('p', null, p.message));

    var foot = el('div', 'tppg-foot');
    foot.appendChild(el('span', null, '\uD83D\uDCCD ' + p.target_name));
    var cta = el('a', 'tppg-cta', 'Browse Listings \u2192');
    cta.href = '#listings';
    foot.appendChild(cta);
    c.appendChild(foot);
    return c;
  }

  function anchorInsert(section) {
    var listings = document.getElementById('listings');
    if (listings && listings.parentNode) { listings.parentNode.insertBefore(section, listings); return; }
    var hero = document.getElementById('heroSection');
    if (hero && hero.parentNode) { hero.parentNode.insertBefore(section, hero.nextSibling); return; }
    var host = document.querySelector('main') || document.body;
    host.insertBefore(section, host.firstChild);
  }

  // Keep the countdowns fresh, and drop a card the moment it expires while the page is open
  function refresh() {
    var section = document.getElementById('tppgPromos');
    if (!section) { clearInterval(timer); return; }
    var cards = section.querySelectorAll('.tppg-card');
    cards.forEach(function (c) {
      var ends = c.getAttribute('data-ends');
      if (!ends) return;
      var ms = Number(ends) - Date.now();
      if (ms <= 0) { c.remove(); return; }
      var t = c.querySelector('.tppg-time');
      if (t) { t.textContent = timeLeft(ms); if (ms < 3 * DAY) { t.classList.add('soon'); c.classList.add('hot'); } }
    });
    if (!section.querySelector('.tppg-card')) { section.remove(); clearInterval(timer); }
  }

  function build(list) {
    addStyles();
    var section = el('section', 'tppg-promos');
    section.id = 'tppgPromos';
    section.setAttribute('aria-labelledby', 'tppgPromosTitle');

    var head = el('div', 'tppg-promos-head');
    var left = el('div');
    left.appendChild(el('p', 'tppg-eyebrow', 'Limited-time offers'));
    var h2 = el('h2', null, 'Current promotions');
    h2.id = 'tppgPromosTitle';
    left.appendChild(h2);
    head.appendChild(left);
    head.appendChild(el('p', 'tppg-sub', 'Offers from our partner developers. Availability and end dates apply.'));
    section.appendChild(head);

    var grid = el('div', 'tppg-grid');
    list.forEach(function (p) { grid.appendChild(card(p)); });
    section.appendChild(grid);

    anchorInsert(section);
    timer = setInterval(refresh, MIN);
  }

  function init() {
    fetch('/api/promotions/public')
      .then(function (res) { return res.ok ? res.json() : []; })
      .then(function (data) {
        if (!Array.isArray(data)) return;
        // Defensive: never show something that has already ended, even if the server sent it
        var live = data.filter(function (p) {
          return p && p.title && p.message && p.target_name && (!p.ends_at || endsIn(p) > 0);
        });
        if (live.length) build(live);
      })
      .catch(function () { /* stay silent: the page simply looks as it always did */ });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();