import { BRAND_CONFIG, MAX_OSRM_CANDIDATES } from './config.js';
import { buildGoogleMapsUrl, formatDistanceKm, haversineKm } from './geo.js';
import { enrichDrivingDistances, fetchRoute } from './routing.js';

export function createLbsController(map, outlets, { onStatus, getUserLocation }) {
  const clusterLayer = L.markerClusterGroup({
    maxClusterRadius: 42,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
  }).addTo(map);

  const routeLayer = L.layerGroup().addTo(map);
  const radiusLayer = L.layerGroup().addTo(map);
  const markerById = new Map();

  let brandFilter = 'ALL';
  let searchRadiusKm = 5;
  let selectedOutletId = null;
  let activeResults = [];

  function escapeHtml(str) {
    return String(str ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function renderOutletMarkers() {
    clusterLayer.clearLayers();
    markerById.clear();

    const visible =
      brandFilter === 'ALL'
        ? outlets
        : outlets.filter((o) => o.brand === brandFilter);

    for (const outlet of visible) {
      const cfg = BRAND_CONFIG[outlet.brand];
      const icon = L.divIcon({
        className: '',
        html: `<div class="outlet-pin ${cfg.cssClass}">${cfg.short}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });

      const marker = L.marker([outlet.lat, outlet.lng], { icon });
      marker.on('click', () => {
        marker.bindPopup(buildPopupNode(outlet)).openPopup();
      });
      clusterLayer.addLayer(marker);
      markerById.set(outlet.id, marker);
    }
  }

  function buildPopupNode(outlet) {
    const userLoc = getUserLocation();
    const match = activeResults.find((r) => r.id === outlet.id);
    const distLine = match
      ? `<div><strong>Jarak (${match.distanceSource}):</strong> ${formatDistanceKm(match.distanceKm)} (~${match.etaMin} mnt)</div>`
      : userLoc
        ? `<div><strong>Jarak lurus:</strong> ${formatDistanceKm(haversineKm(userLoc.lat, userLoc.lng, outlet.lat, outlet.lng))}</div>`
        : '';

    const wrap = document.createElement('div');
    wrap.style.minWidth = '210px';
    wrap.innerHTML = `
      <div style="font-weight:700;margin-bottom:4px;">${escapeHtml(outlet.nama)}</div>
      <div style="font-size:12px;color:#475569;margin-bottom:6px;">
        <div><strong>Brand:</strong> ${escapeHtml(outlet.brand)}</div>
        <div><strong>Wilayah:</strong> ${escapeHtml(outlet.kabupaten)}</div>
        <div><strong>Alamat:</strong> ${escapeHtml(outlet.alamat)}</div>
        ${distLine}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button type="button" class="btn btn-primary btn-sm popup-route-btn">Tampilkan Rute</button>
        <a class="btn btn-secondary btn-sm" href="${buildGoogleMapsUrl(outlet.lat, outlet.lng, userLoc)}" target="_blank" rel="noopener noreferrer">Google Maps</a>
      </div>
    `;
    wrap.querySelector('.popup-route-btn').addEventListener('click', () => {
      routeToOutlet(outlet);
    });
    return wrap;
  }

  async function updateNearest(userLoc) {
    if (!userLoc) return;

    radiusLayer.clearLayers();
    L.circle([userLoc.lat, userLoc.lng], {
      radius: searchRadiusKm * 1000,
      color: '#1E40AF',
      weight: 1.5,
      dashArray: '5 5',
      fillColor: '#3B82F6',
      fillOpacity: 0.06,
      interactive: false,
    }).addTo(radiusLayer);

    const filtered =
      brandFilter === 'ALL'
        ? outlets
        : outlets.filter((o) => o.brand === brandFilter);

    const ranked = filtered
      .map((o) => ({
        ...o,
        straightKm: haversineKm(userLoc.lat, userLoc.lng, o.lat, o.lng),
      }))
      .sort((a, b) => a.straightKm - b.straightKm)
      .slice(0, MAX_OSRM_CANDIDATES);

    onStatus('Menghitung jarak tempuh rute jalan (OSRM)...', 'info');
    const enriched = await enrichDrivingDistances(userLoc, ranked);
    enriched.sort((a, b) => a.distanceKm - b.distanceKm);

    const insideRadius = enriched.filter((o) => o.distanceKm <= searchRadiusKm);
    if (insideRadius.length > 0) {
      activeResults = insideRadius;
      onStatus(
        `Ditemukan ${insideRadius.length} gerai dalam radius ${searchRadiusKm} km (${insideRadius[0].distanceSource}).`,
        'success'
      );
    } else {
      activeResults = enriched.slice(0, 3);
      onStatus(
        `Tidak ada gerai dalam ${searchRadiusKm} km. Menampilkan ${activeResults.length} gerai terdekat.`,
        'warning'
      );
    }

    renderStoreList(userLoc);
  }

  function renderStoreList(userLoc) {
    const listEl = document.getElementById('storeList');
    const badgeEl = document.getElementById('lbsCountBadge');
    if (badgeEl) badgeEl.textContent = String(activeResults.length);
    if (!listEl) return;

    if (!activeResults.length) {
      listEl.innerHTML =
        '<p style="margin:0;font-size:0.82rem;color:var(--color-muted-foreground);">Tidak ada gerai yang cocok dengan filter saat ini.</p>';
      return;
    }

    listEl.innerHTML = '';
    activeResults.forEach((outlet, idx) => {
      const cfg = BRAND_CONFIG[outlet.brand];
      const card = document.createElement('div');
      card.className = `store-card${selectedOutletId === outlet.id ? ' selected' : ''}`;
      card.innerHTML = `
        <div class="store-top">
          <span class="store-name">${idx + 1}. ${escapeHtml(outlet.nama)}</span>
          <span class="brand-pill ${cfg.cssClass}">${cfg.short}</span>
        </div>
        <div class="store-meta">
          <span>${escapeHtml(outlet.kabupaten)}</span>
          <span class="mono"><strong>${formatDistanceKm(outlet.distanceKm)}</strong> • ${outlet.etaMin} mnt</span>
        </div>
        <div class="store-actions">
          <button type="button" class="btn btn-primary btn-sm btn-route-card" style="flex:1;">Navigasi Rute</button>
          <a class="btn btn-secondary btn-sm" href="${buildGoogleMapsUrl(outlet.lat, outlet.lng, userLoc)}" target="_blank" rel="noopener noreferrer">G-Maps</a>
        </div>
      `;

      card.querySelector('.btn-route-card').addEventListener('click', () => {
        routeToOutlet(outlet);
      });
      listEl.appendChild(card);
    });
  }

  async function routeToOutlet(outlet) {
    const userLoc = getUserLocation();
    if (!userLoc) {
      onStatus('Tentukan lokasi Anda dulu (GPS Real-time atau Pin Manual).', 'warning');
      return;
    }

    selectedOutletId = outlet.id;
    renderStoreList(userLoc);
    onStatus(`Menghitung rute ke ${outlet.nama}...`, 'info');

    const route = await fetchRoute(userLoc, outlet.lat, outlet.lng);
    routeLayer.clearLayers();

    const line = L.geoJSON(route.geometry, {
      style: {
        color: BRAND_CONFIG[outlet.brand].color,
        weight: 5,
        opacity: 0.85,
        dashArray: route.isFallback ? '8 6' : null,
      },
    }).addTo(routeLayer);

    map.fitBounds(line.getBounds(), { padding: [45, 45] });

    const marker = markerById.get(outlet.id);
    if (marker) {
      clusterLayer.zoomToShowLayer(marker, () => {
        marker.bindPopup(buildPopupNode(outlet)).openPopup();
      });
    }

    const panel = document.getElementById('routePanel');
    const summary = document.getElementById('routeSummary');
    const stepsEl = document.getElementById('routeSteps');
    if (panel && summary && stepsEl) {
      panel.hidden = false;
      summary.textContent = `${formatDistanceKm(route.distanceKm)} • ${route.durationMin} mnt`;
      stepsEl.innerHTML = route.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('');
    }

    onStatus(
      route.isFallback
        ? `Rute estimasi ke ${outlet.nama}: ${formatDistanceKm(route.distanceKm)}.`
        : `Rute ke ${outlet.nama}: ${formatDistanceKm(route.distanceKm)} (${route.durationMin} menit).`,
      route.isFallback ? 'warning' : 'success'
    );
  }

  function clearRoute() {
    routeLayer.clearLayers();
    selectedOutletId = null;
    const panel = document.getElementById('routePanel');
    if (panel) panel.hidden = true;
    const loc = getUserLocation();
    if (loc) renderStoreList(loc);
  }

  function setVisible(visible) {
    if (visible) {
      if (!map.hasLayer(clusterLayer)) map.addLayer(clusterLayer);
      if (!map.hasLayer(routeLayer)) map.addLayer(routeLayer);
      if (!map.hasLayer(radiusLayer)) map.addLayer(radiusLayer);
    } else {
      map.removeLayer(routeLayer);
      map.removeLayer(radiusLayer);
    }
  }

  renderOutletMarkers();

  return {
    setBrandFilter(brand) {
      brandFilter = brand;
      renderOutletMarkers();
      const loc = getUserLocation();
      if (loc) updateNearest(loc);
    },
    setRadiusKm(km) {
      searchRadiusKm = km;
      const loc = getUserLocation();
      if (loc) updateNearest(loc);
    },
    updateNearest,
    clearRoute,
    setVisible,
  };
}
