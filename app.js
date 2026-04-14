let map;
let markerLayer = L.layerGroup();
let rawData = [];

// 1. Inisialisasi Peta
function initMap() {
    map = L.map('map').setView([-0.026330, 109.342504], 7); 
    // Ganti ke URL standar ini jika muncul error merah
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    markerLayer.addTo(map);
}

// 2. Load Data dari JSON (Hasil main.py)
async function fetchData() {
    try {
        const response = await fetch('data_spklu.json');
        rawData = await response.json();
        
        populateKapasitasFilter(rawData);
        renderDashboard(rawData);
    } catch (error) {
        console.error("Gagal memuat data JSON:", error);
    }
}

// 3. Mengisi Dropdown Kapasitas secara Dinamis
function populateKapasitasFilter(data) {
    const capacities = [...new Set(data.map(item => item.KAPASITAS))].sort((a,b) => a-b);
    const select = document.getElementById('filterKapasitas');
    capacities.forEach(cap => {
        let opt = document.createElement('option');
        opt.value = cap;
        opt.innerHTML = `${cap} kW`;
        select.appendChild(opt);
    });
}

// 4. Logika Filter
function applyFilters() {
    const fUP3 = document.getElementById('filterUP3').value;
    const fType = document.getElementById('filterType').value;
    const fCap = document.getElementById('filterKapasitas').value;
    const fStatus = document.getElementById('filterStatus').value;

    const filtered = rawData.filter(item => {
        return (fUP3 === 'ALL' || item.ULP === fUP3) &&
               (fType === 'ALL' || item['TYPE CHARGE'] === fType) &&
               (fCap === 'ALL' || item.KAPASITAS.toString() === fCap) &&
               (fStatus === 'ALL' || item.REKOMENDASI.toUpperCase().includes(fStatus.toUpperCase()));
    });

    renderDashboard(filtered);
}

// 5. Render Marker dan Tabel
function renderDashboard(data) {
    // 1. Tampilkan Bobot Kriteria AHP
    // Sesuaikan nilai persen di bawah ini dengan hasil perhitungan di main.py Anda
    const ahpBody = document.getElementById('ahpWeightBody');
    ahpBody.innerHTML = `
        <tr class="fw-bold text-primary">
            <td>15%</td>
            <td>10%</td>
            <td>30%</td>
            <td>35%</td>
            <td>10%</td>
        </tr>`;

    // 2. Bersihkan Tabel & Marker
    markerLayer.clearLayers();
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    data.forEach(item => {
        // Format ID - Nama Stasiun
        const idDisplay = item.ID_SPKLU ? parseFloat(item.ID_SPKLU).toFixed(0) : 'N/A';
        const displayName = `${idDisplay} - ${item['Nama Stasiun']}`;
        
        // Menggunakan data ULP langsung dari spreadsheet/JSON
        const valULP = item.ULP || "N/A";

        // Tentukan Warna Badge
        let badgeClass = 'status-optimal';
        if(item.REKOMENDASI.includes('RELOKASI')) badgeClass = 'status-relokasi';
        if(item.REKOMENDASI.includes('TAMBAH')) badgeClass = 'status-tambah';

        // Render Baris Tabel
        const row = `<tr>
            <td class="fw-bold">${displayName}</td>
            <td><span class="badge bg-light text-dark border">${valULP}</span></td>
            <td><small class="text-muted">${item['TYPE CHARGE'] || '-'}</small></td>
            <td class="text-center">${item.KAPASITAS || 0} kW</td>
            <td class="text-center fw-bold text-primary">${parseFloat(item.score || 0).toFixed(4)}</td>
            <td><span class="badge ${badgeClass} px-3 py-2 rounded-pill shadow-sm">${item.REKOMENDASI}</span></td>
        </tr>`;
        tbody.innerHTML += row;

        // 3. Render Marker Peta
        const mColor = item.REKOMENDASI.includes('RELOKASI') ? '#d93025' : 
                       (item.REKOMENDASI.includes('TAMBAH') ? '#f57f17' : '#1e7e34');
        
        const marker = L.circleMarker([item.Latitude, item.Longitude], {
            radius: 9,
            fillColor: mColor,
            color: "#fff",
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9
        }).bindPopup(`<b>${displayName}</b><br>ULP: ${valULP}<br>Rekomendasi: ${item.REKOMENDASI}`);
        
        markerLayer.addLayer(marker);
    });
}

// Jalankan saat halaman siap
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    fetchData();
});
