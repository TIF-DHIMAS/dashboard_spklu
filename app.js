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
    // Bersihkan Marker & Tabel
    markerLayer.clearLayers();
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    data.forEach(item => {
        // Gabungkan ID dan Nama sesuai permintaan
        const displayName = `${item.ID_SPKLU || 'N/A'} - ${item['Nama Stasiun']}`;
        
        // Pilih Warna Badge
        let badgeClass = 'badge-optimal';
        if(item.REKOMENDASI.includes('RELOKASI')) badgeClass = 'badge-relokasi';
        if(item.REKOMENDASI.includes('TAMBAH')) badgeClass = 'badge-tambah';

        // Update Tabel
        const row = `<tr>
            <td class="fw-bold">${displayName}</td>
            <td>${item.UP3}</td>
            <td><small>${item['TYPE CHARGE']}</small></td>
            <td>${item.KAPASITAS} kW</td>
            <td>${parseFloat(item.score).toFixed(4)}</td>
            <td><span class="badge ${badgeClass} p-2">${item.REKOMENDASI}</span></td>
        </tr>`;
        tbody.innerHTML += row;

        // Update Peta
        const markerColor = item.REKOMENDASI.includes('RELOKASI') ? 'red' : 
                            item.REKOMENDASI.includes('TAMBAH') ? 'orange' : 'green';
        
        const marker = L.circleMarker([item.Latitude, item.Longitude], {
            radius: 8,
            fillColor: markerColor,
            color: "#fff",
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
        }).bindPopup(`
            <b>${displayName}</b><br>
            Status: ${item.REKOMENDASI}<br>
            Transaksi: ${item.RATA2TRANSAKSI}
        `);
        markerLayer.addLayer(marker);
    });
}

// Jalankan saat halaman siap
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    fetchData();
});
