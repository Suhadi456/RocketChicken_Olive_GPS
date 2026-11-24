export function createGpsController(map, { onLocation, onStatus }) {
  let userMarker = null;
  let watchId = null;
  let manualMode = false;
  let userMovedMap = false;
  let lastLocation = null;

  map.on('dragstart zoomstart', () => {
    userMovedMap = true;
  });

  function renderUserMarker(lat, lng) {
    const icon = L.divIcon({
      className: '',
      html: '<div class="user-pin" title="Lokasi Pengguna"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
    if (!userMarker) {
      userMarker = L.marker([lat, lng], { icon, draggable: true, zIndexOffset: 900 }).addTo(map);
      userMarker.on('dragend', () => {
        const pos = userMarker.getLatLng();
        stopGpsWatch();
        setLocation(pos.lat, pos.lng, 'Pin digeser manual');
      });
    } else {
      userMarker.setLatLng([lat, lng]);
    }
    userMarker.bindPopup(
      `<strong>Lokasi Anda</strong><br><span class="mono">${lat.toFixed(5)}, ${lng.toFixed(5)}</span><br><small>Seret pin untuk simulasi lokasi</small>`
    );
  }

  function setLocation(lat, lng, sourceLabel = 'GPS') {
    lastLocation = { lat, lng };
    renderUserMarker(lat, lng);
    if (!userMovedMap) {
      map.setView([lat, lng], Math.max(map.getZoom(), 13));
    }
    onLocation(lastLocation, sourceLabel);
  }

  function stopGpsWatch() {
    if (watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
  }

  function startGps() {
    if (!navigator.geolocation) {
      onStatus('Browser tidak mendukung Geolocation. Gunakan Pin Manual.', 'error');
      return;
    }
    setManualMode(false);
    userMovedMap = false;
    stopGpsWatch();
    onStatus('Mendeteksi koordinat GPS perangkat...', 'info');

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLocation(pos.coords.latitude, pos.coords.longitude, 'GPS Real-time');
      },
      (err) => {
        const msg =
          err.code === 1
            ? 'Izin lokasi ditolak. Aktifkan izin atau gunakan Pin Manual.'
            : 'GPS gagal membaca posisi. Gunakan Pin Manual untuk simulasi.';
        onStatus(msg, 'warning');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
    );
  }

  function setManualMode(enabled) {
    manualMode = enabled;
    const banner = document.getElementById('manualPinBanner');
    const btn = document.getElementById('btnManualPin');
    if (banner) banner.hidden = !enabled;
    if (btn) btn.setAttribute('aria-pressed', String(enabled));
    map.getContainer().style.cursor = enabled ? 'crosshair' : '';
    if (enabled) {
      stopGpsWatch();
      onStatus('Mode Pin Manual aktif: klik titik mana saja di peta.', 'info');
    }
  }

  map.on('click', (e) => {
    if (!manualMode) return;
    userMovedMap = false;
    setLocation(e.latlng.lat, e.latlng.lng, 'Pin Manual');
    setManualMode(false);
  });

  function recenter() {
    if (!lastLocation) {
      onStatus('Lokasi belum tersedia. Klik GPS Real-time atau Pin Manual.', 'warning');
      return;
    }
    userMovedMap = false;
    map.setView([lastLocation.lat, lastLocation.lng], 14);
    if (userMarker) userMarker.openPopup();
  }

  return {
    startGps,
    toggleManualMode: () => setManualMode(!manualMode),
    recenter,
    getLocation: () => lastLocation,
    setLocation,
  };
}
