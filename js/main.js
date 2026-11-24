import { DIY_CENTER, DIY_ZOOM } from './config.js';
import { createGeointController } from './geoint.js';
import { createGpsController } from './gps.js';
import { createLbsController } from './lbs.js';

function setStatus(message, type = 'info') {
  const el = document.getElementById('statusBanner');
  if (!el) return;
  el.className = `status-banner ${type}`;
  el.textContent = message;
}

function debounce(fn, delayMs) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}

async function init() {
  const map = L.map('map').setView(DIY_CENTER, DIY_ZOOM);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);

  let outlets = [];
  let boundariesFc = null;

  try {
    const [geraiRes, batasRes] = await Promise.all([
      fetch('./data/gerai.geojson'),
      fetch('./data/diy_batas.geojson'),
    ]);
    if (!geraiRes.ok || !batasRes.ok) throw new Error('Gagal membaca file GeoJSON');
    const geraiFc = await geraiRes.json();
    boundariesFc = await batasRes.json();

    outlets = (geraiFc.features || []).map((f) => ({
      ...f.properties,
      lng: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    }));
  } catch (err) {
    setStatus(`Gagal memuat dataset DIY: ${err.message}`, 'error');
    return;
  }

  let lbs = null;
  let geoint = null;

  const gps = createGpsController(map, {
    onStatus: setStatus,
    onLocation: (loc, sourceLabel) => {
      const coordEl = document.getElementById('userCoordText');
      if (coordEl) {
        coordEl.textContent = `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)} (${sourceLabel})`;
      }
      if (lbs) lbs.updateNearest(loc);
    },
  });

  lbs = createLbsController(map, outlets, {
    onStatus: setStatus,
    getUserLocation: gps.getLocation,
  });

  geoint = createGeointController(map, outlets, boundariesFc);

  // Fit initial view cleanly to DIY boundary
  map.fitBounds(geoint.boundaryLayer.getBounds(), { padding: [20, 20] });
  setStatus(`Siap. ${outlets.length} gerai di DIY dimuat.`, 'success');

  // Mode Tabs (LBS vs GEOINT)
  const tabLbs = document.getElementById('tabLbs');
  const tabGeoint = document.getElementById('tabGeoint');
  const panelLbs = document.getElementById('panelLbs');
  const panelGeoint = document.getElementById('panelGeoint');

  function switchMode(mode) {
    const isGeoint = mode === 'geoint';
    tabLbs.setAttribute('aria-selected', String(!isGeoint));
    tabGeoint.setAttribute('aria-selected', String(isGeoint));
    panelLbs.hidden = isGeoint;
    panelGeoint.hidden = !isGeoint;
    panelLbs.style.display = isGeoint ? 'none' : 'flex';
    panelGeoint.style.display = isGeoint ? 'flex' : 'none';

    lbs.setVisible(!isGeoint);
    geoint.setActive(isGeoint);

    if (isGeoint) {
      map.fitBounds(geoint.boundaryLayer.getBounds(), { padding: [20, 20] });
      setStatus('Mode GEOINT aktif: menampilkan heatmap, buffer jangkauan & blank spot DIY.', 'info');
    } else {
      setStatus('Mode LBS aktif: gunakan GPS Real-time atau Pin Manual.', 'info');
    }
  }

  tabLbs.addEventListener('click', () => switchMode('lbs'));
  tabGeoint.addEventListener('click', () => switchMode('geoint'));

  // LBS controls
  document.getElementById('btnGps').addEventListener('click', gps.startGps);
  document.getElementById('btnManualPin').addEventListener('click', gps.toggleManualMode);
  document.getElementById('btnRecenter').addEventListener('click', gps.recenter);
  document.getElementById('btnClearRoute').addEventListener('click', lbs.clearRoute);

  document.querySelectorAll('.chip-btn[data-brand]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chip-btn[data-brand]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      lbs.setBrandFilter(btn.dataset.brand);
    });
  });

  const lbsRadiusRange = document.getElementById('lbsRadiusRange');
  const lbsRadiusLabel = document.getElementById('lbsRadiusLabel');
  lbsRadiusRange.addEventListener('input', () => {
    lbsRadiusLabel.textContent = `${lbsRadiusRange.value} km`;
  });
  lbsRadiusRange.addEventListener('change', () => {
    lbs.setRadiusKm(Number(lbsRadiusRange.value));
  });

  // GEOINT controls
  const bufferRange = document.getElementById('bufferRadiusRange');
  const bufferLabel = document.getElementById('bufferRadiusLabel');
  const applyBufferDebounced = debounce((km) => geoint.setBufferRadiusKm(km), 180);

  bufferRange.addEventListener('input', () => {
    const val = Number(bufferRange.value);
    bufferLabel.textContent = `${val.toFixed(1)} km`;
    applyBufferDebounced(val);
  });

  document.getElementById('heatBrandSelect').addEventListener('change', (e) => {
    geoint.setHeatBrand(e.target.value);
  });

  document.getElementById('chkBufferRocket').addEventListener('change', (e) => {
    geoint.setLayerFlag('rocket', e.target.checked);
  });
  document.getElementById('chkBufferOlive').addEventListener('change', (e) => {
    geoint.setLayerFlag('olive', e.target.checked);
  });
  document.getElementById('chkOverlap').addEventListener('change', (e) => {
    geoint.setLayerFlag('overlap', e.target.checked);
  });
  document.getElementById('chkBlankSpot').addEventListener('change', (e) => {
    geoint.setLayerFlag('blankSpot', e.target.checked);
  });

  // Mobile drawer toggle
  const sidebar = document.getElementById('sidebar');
  const drawerBtn = document.getElementById('toggleDrawerBtn');
  drawerBtn.addEventListener('click', () => {
    const collapsed = sidebar.classList.toggle('collapsed');
    drawerBtn.setAttribute('aria-expanded', String(!collapsed));
  });

  // Check URL ?mode=geoint
  const params = new URLSearchParams(window.location.search);
  if (params.get('mode') === 'geoint') {
    switchMode('geoint');
  }
}

init();
