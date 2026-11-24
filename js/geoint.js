import { BRAND_CONFIG } from './config.js';
import { formatAreaKm2 } from './geo.js';

function safeUnion(features) {
  if (!features.length) return null;
  if (features.length === 1) return features[0];
  try {
    return turf.union(turf.featureCollection(features));
  } catch {
    // Fallback pairwise if polygon topology hits an edge case
    let acc = features[0];
    for (let i = 1; i < features.length; i += 1) {
      try {
        const next = turf.union(turf.featureCollection([acc, features[i]]));
        if (next) acc = next;
      } catch {
        // skip invalid ring
      }
    }
    return acc;
  }
}

function safeIntersect(a, b) {
  if (!a || !b) return null;
  try {
    return turf.intersect(turf.featureCollection([a, b]));
  } catch {
    return null;
  }
}

function safeDifference(a, b) {
  if (!a) return null;
  if (!b) return a;
  try {
    return turf.difference(turf.featureCollection([a, b]));
  } catch {
    return null;
  }
}

export function createGeointController(map, outlets, boundariesFc) {
  const boundaryLayer = L.geoJSON(boundariesFc, {
    style: {
      color: '#475569',
      weight: 1.4,
      dashArray: '4 4',
      fillColor: '#94A3B8',
      fillOpacity: 0.04,
    },
    onEachFeature: (feat, layer) => {
      layer.bindTooltip(feat.properties.nama, { sticky: true });
    },
  }).addTo(map);

  const blankSpotLayer = L.layerGroup();
  const bufferRocketLayer = L.layerGroup();
  const bufferOliveLayer = L.layerGroup();
  const overlapLayer = L.layerGroup();
  let heatLayer = null;

  const diyUnion = safeUnion(boundariesFc.features);
  const diyTotalAreaM2 = diyUnion ? turf.area(diyUnion) : 0;

  let currentRadiusKm = 2;
  let currentHeatBrand = 'ALL';
  let isActive = false;

  const visibility = {
    rocket: true,
    olive: true,
    overlap: true,
    blankSpot: true,
  };

  function buildHeatmap() {
    if (heatLayer && map.hasLayer(heatLayer)) {
      map.removeLayer(heatLayer);
    }
    if (!isActive || currentHeatBrand === 'NONE') return;

    const pts = outlets
      .filter((o) => currentHeatBrand === 'ALL' || o.brand === currentHeatBrand)
      .map((o) => [o.lat, o.lng, 0.85]);

    heatLayer = L.heatLayer(pts, {
      radius: 26,
      blur: 18,
      maxZoom: 13,
      gradient: { 0.3: '#3B82F6', 0.6: '#F59E0B', 1.0: '#DC2626' },
    });
    heatLayer.addTo(map);
  }

  function buildBuffersAndStats() {
    const rcOutlets = outlets.filter((o) => o.brand === 'Rocket Chicken');
    const olOutlets = outlets.filter((o) => o.brand === 'Olive Fried Chicken');

    const toBuffers = (list) =>
      list.map((o) =>
        turf.buffer(turf.point([o.lng, o.lat]), currentRadiusKm, {
          units: 'kilometers',
          steps: 24,
        })
      );

    const rcUnion = safeUnion(toBuffers(rcOutlets));
    const olUnion = safeUnion(toBuffers(olOutlets));

    const combinedBuffers = [rcUnion, olUnion].filter(Boolean);
    const allUnion = safeUnion(combinedBuffers);

    const coveredInDiy = safeIntersect(diyUnion, allUnion);
    const blankSpotPoly = safeDifference(diyUnion, coveredInDiy);
    const overlapRaw = safeIntersect(rcUnion, olUnion);
    const overlapInDiy = safeIntersect(diyUnion, overlapRaw);

    bufferRocketLayer.clearLayers();
    if (rcUnion) {
      L.geoJSON(rcUnion, {
        style: {
          color: BRAND_CONFIG['Rocket Chicken'].color,
          weight: 1.5,
          fillColor: BRAND_CONFIG['Rocket Chicken'].bufferColor,
          fillOpacity: 0.16,
        },
        interactive: false,
      }).addTo(bufferRocketLayer);
    }

    bufferOliveLayer.clearLayers();
    if (olUnion) {
      L.geoJSON(olUnion, {
        style: {
          color: BRAND_CONFIG['Olive Fried Chicken'].color,
          weight: 1.5,
          fillColor: BRAND_CONFIG['Olive Fried Chicken'].bufferColor,
          fillOpacity: 0.16,
        },
        interactive: false,
      }).addTo(bufferOliveLayer);
    }

    overlapLayer.clearLayers();
    if (overlapInDiy) {
      L.geoJSON(overlapInDiy, {
        style: {
          color: '#6D28D9',
          weight: 1.6,
          fillColor: '#7C3AED',
          fillOpacity: 0.28,
        },
        interactive: false,
      }).addTo(overlapLayer);
    }

    blankSpotLayer.clearLayers();
    if (blankSpotPoly) {
      L.geoJSON(blankSpotPoly, {
        style: {
          color: '#334155',
          weight: 1.2,
          dashArray: '3 3',
          fillColor: '#1E293B',
          fillOpacity: 0.22,
        },
        interactive: false,
      }).addTo(blankSpotLayer);
    }

    updateStatsUI({
      coveredAreaM2: coveredInDiy ? turf.area(coveredInDiy) : 0,
      blankAreaM2: blankSpotPoly ? turf.area(blankSpotPoly) : diyTotalAreaM2,
      overlapAreaM2: overlapInDiy ? turf.area(overlapInDiy) : 0,
      rcCount: rcOutlets.length,
      olCount: olOutlets.length,
      coveredInDiy,
    });

    syncLayerVisibility();
  }

  function updateStatsUI({
    coveredAreaM2,
    blankAreaM2,
    overlapAreaM2,
    rcCount,
    olCount,
    coveredInDiy,
  }) {
    const pct = (part) => (diyTotalAreaM2 > 0 ? ((part / diyTotalAreaM2) * 100).toFixed(1) : '0.0');

    document.getElementById('kpiCoveredPct').textContent = `${pct(coveredAreaM2)}%`;
    document.getElementById('kpiCoveredArea').textContent = formatAreaKm2(coveredAreaM2);
    document.getElementById('kpiBlankPct').textContent = `${pct(blankAreaM2)}%`;
    document.getElementById('kpiBlankArea').textContent = formatAreaKm2(blankAreaM2);
    document.getElementById('kpiOverlapPct').textContent = `${pct(overlapAreaM2)}%`;
    document.getElementById('kpiOverlapArea').textContent = formatAreaKm2(overlapAreaM2);
    document.getElementById('kpiTotalArea').textContent = formatAreaKm2(diyTotalAreaM2);
    document.getElementById('kpiOutletSplit').textContent = `RC ${rcCount} / OL ${olCount}`;

    const tbody = document.getElementById('kabStatsBody');
    if (!tbody) return;

    const rows = boundariesFc.features.map((kabFeat) => {
      const nama = kabFeat.properties.nama;
      const kabArea = turf.area(kabFeat);
      const kabCov = safeIntersect(kabFeat, coveredInDiy);
      const covArea = kabCov ? turf.area(kabCov) : 0;
      const blankPct = Math.max(0, Math.min(100, ((kabArea - covArea) / kabArea) * 100));
      const count = outlets.filter((o) => o.kabupaten === nama).length;
      return { nama: nama.replace('Kabupaten ', 'Kab. '), count, blankPct };
    });

    rows.sort((a, b) => b.blankPct - a.blankPct);
    tbody.innerHTML = rows
      .map(
        (r) => `
        <tr>
          <td>${r.nama}</td>
          <td class="num">${r.count}</td>
          <td class="num">${r.blankPct.toFixed(1)}%</td>
        </tr>`
      )
      .join('');
  }

  function syncLayerVisibility() {
    const toggle = (layer, show) => {
      if (isActive && show) {
        if (!map.hasLayer(layer)) map.addLayer(layer);
      } else if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    };

    toggle(blankSpotLayer, visibility.blankSpot);
    toggle(bufferRocketLayer, visibility.rocket);
    toggle(bufferOliveLayer, visibility.olive);
    toggle(overlapLayer, visibility.overlap);
    buildHeatmap();
  }

  return {
    boundaryLayer,
    setActive(active) {
      isActive = active;
      if (active) {
        buildBuffersAndStats();
      } else {
        syncLayerVisibility();
      }
    },
    setBufferRadiusKm(km) {
      currentRadiusKm = km;
      if (isActive) buildBuffersAndStats();
    },
    setHeatBrand(brand) {
      currentHeatBrand = brand;
      buildHeatmap();
    },
    setLayerFlag(key, enabled) {
      visibility[key] = enabled;
      syncLayerVisibility();
    },
  };
}
