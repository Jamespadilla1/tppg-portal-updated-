/* ─────────────────────────────────────────────────────────────────────────────
   Inventory map viewer — shared by the admin, agent and team dashboards.
   window.showInventoryMap(url, title) opens a property's inventory / site
   development map full screen. Click the map to zoom in and pan; Esc or the
   backdrop closes it.
   ───────────────────────────────────────────────────────────────────────────── */
(function () {
  if (window.showInventoryMap) return;

  function build() {
    if (document.getElementById('invMapViewer')) return;
    const style = document.createElement('style');
    style.textContent = `
      #invMapViewer{display:none;position:fixed;inset:0;z-index:70;background:rgba(17,24,39,.78);flex-direction:column}
      #invMapViewer.open{display:flex}
      #invMapViewer .imv-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 18px;background:#fff;border-bottom:1px solid #e5e7eb;color:#111827}
      #invMapViewer .imv-title{font-size:.9rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #invMapViewer .imv-sub{font-size:.72rem;color:#6b7280}
      #invMapViewer .imv-actions{display:flex;gap:8px;flex-shrink:0}
      #invMapViewer .imv-btn{font-size:.78rem;font-weight:500;padding:7px 12px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;color:#374151;cursor:pointer;text-decoration:none}
      #invMapViewer .imv-btn:hover{background:#f9fafb}
      #invMapViewer .imv-btn.primary{background:#c2410c;border-color:#c2410c;color:#fff}
      #invMapViewer .imv-btn.primary:hover{background:#9a3412}
      #invMapViewer .imv-stage{flex:1;overflow:auto;display:flex;align-items:flex-start;justify-content:center;padding:20px}
      #invMapViewer .imv-stage img{max-width:100%;max-height:calc(100vh - 110px);object-fit:contain;background:#fff;border-radius:8px;box-shadow:0 10px 40px rgba(0,0,0,.35);cursor:zoom-in}
      #invMapViewer.zoomed .imv-stage{align-items:flex-start;justify-content:flex-start}
      #invMapViewer.zoomed .imv-stage img{max-width:none;max-height:none;cursor:zoom-out}
    `;
    document.head.appendChild(style);

    const el = document.createElement('div');
    el.id = 'invMapViewer';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Inventory map');
    el.innerHTML = `
      <div class="imv-bar">
        <div style="min-width:0">
          <div class="imv-title" id="imvTitle">Inventory Map</div>
          <div class="imv-sub">Click the map to zoom in or out</div>
        </div>
        <div class="imv-actions">
          <a class="imv-btn" id="imvOpen" target="_blank" rel="noopener">Open full size</a>
          <button type="button" class="imv-btn primary" id="imvClose">Close</button>
        </div>
      </div>
      <div class="imv-stage" id="imvStage"><img id="imvImg" alt="Inventory map"></div>`;
    document.body.appendChild(el);

    const close = () => { el.classList.remove('open', 'zoomed'); };
    document.getElementById('imvClose').addEventListener('click', close);
    document.getElementById('imvStage').addEventListener('click', e => { if (e.target.id === 'imvStage') close(); });
    document.getElementById('imvImg').addEventListener('click', () => el.classList.toggle('zoomed'));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && el.classList.contains('open')) close(); });
  }

  window.showInventoryMap = function (url, title) {
    if (!url) return;
    build();
    document.getElementById('imvTitle').textContent = (title ? title + ' — ' : '') + 'Inventory Map';
    document.getElementById('imvImg').src = url;
    document.getElementById('imvOpen').href = url;
    const el = document.getElementById('invMapViewer');
    el.classList.remove('zoomed');
    el.classList.add('open');
  };
})();
