# ChickenSpot DIY — LBS & Geospatial Intelligence (GEOINT)

Aplikasi web geospasial untuk pencarian gerai **Rocket Chicken** dan **Olive Fried Chicken** terdekat di seluruh wilayah **Daerah Istimewa Yogyakarta (DIY)** beserta analisis keruangan untuk pemetaan zona persaingan dan *blank spot*.

## Anggota Kelompok
1. Muhammad Garnida Barreta Novianto (123240230)
2. Kevin Prasetya (123240231)
3. Candra Aji Ramadhan (123240250)

## Fitur Utama

### 1. Mode Konsumen — Location-Based Service (LBS)
- **Deteksi Lokasi:** Pelacakan GPS *real-time* (`navigator.geolocation.watchPosition`) dan **Pin Manual** (klik peta atau seret marker untuk simulasi lokasi).
- **Pencarian 2 Tahap:** Penyaringan kandidat terdekat menggunakan rumus **Haversine**, lalu kalkulasi jarak tempuh berkendara dan ETA aktual via **OSRM** (*Open Source Routing Machine*) dengan *fallback* otomatis jika server OSRM sibuk.
- **Navigasi Rute:** Garis rute langsung pada peta, daftar instruksi belokan (*turn-by-turn*), filter per brand, slider radius $1$–$15\text{ km}$, serta tautan langsung ke Google Maps.

### 2. Mode Bisnis — Geospatial Intelligence (GEOINT)
- **Heatmap Kepadatan:** Visualisasi konsentrasi gerai (gabungan atau per brand) menggunakan `Leaflet.heat`.
- **Buffer Analysis Dinamis:** Slider radius jangkauan layanan ($1$–$5\text{ km}$) menggunakan `Turf.js` (`buffer`, `union`, `intersect`, `difference`, `area`).
- **Pemetaan Zona Spasial:**
  - Buffer jangkauan masing-masing brand (*Rocket Chicken* vs *Olive Fried Chicken*).
  - **Zona Persaingan (Overlap):** Irisan jangkauan kedua brand.
  - **Blank Spot DIY:** Wilayah di dalam batas 5 kabupaten/kota DIY yang belum terjangkau kedua layanan, lengkap dengan statistik luas ($\text{km}^2$ & %) per kabupaten/kota.

## Teknologi
- **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES Modules) — tanpa proses *build*.
- **Pemetaan & Spasial:** Leaflet.js, Leaflet.markercluster, Leaflet.heat, Turf.js v7.
- **Routing:** OSRM Public API (`router.project-osrm.org`).
- **Dataset:** GeoJSON batas administrasi 5 kabupaten/kota DIY (`data/diy_batas.geojson`) dan koordinat gerai hasil kurasi OpenStreetMap (`data/gerai.geojson`).

## Menjalankan Secara Lokal
Karena menggunakan ES Modules dan `fetch()` GeoJSON, jalankan melalui server HTTP lokal (bukan `file://`):

```bash
python -m http.server 8080
```

Lalu buka `http://localhost:8080/` di browser.
