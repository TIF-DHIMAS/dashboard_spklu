let map;
let markerLayer = L.layerGroup();
let rawData = [];
let ahpData = null;

// 1. Inisialisasi Peta
function initMap() {
    map = L.map('map').setView([-0.026330, 109.342504], 7); 
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    markerLayer.addTo(map);
    // Panggil legenda di sini
    addLegend(map);
}
function addLegend(map) {
    const legend = L.control({ position: 'bottomright' });

    legend.onAdd = function () {
        const div = L.DomUtil.create('div', 'info legend');
        const labels = [
            { color: '#1e7e34', text: 'Optimal' },
            { color: '#f57f17', text: 'Tambah Unit' },
            { color: '#d93025', text: 'Kandidat Relokasi' }
        ];

        div.style.backgroundColor = 'white';
        div.style.padding = '10px';
        div.style.border = '1px solid #ccc';
        div.style.borderRadius = '5px';
        div.style.lineHeight = '1.5em';
        div.style.boxShadow = '0 0 15px rgba(0,0,0,0.2)';

        div.innerHTML = '<h6 style="margin-bottom: 8px; font-weight: bold; font-size: 12px;">Status Rekomendasi</h6>';

        labels.forEach(item => {
            div.innerHTML += `
                <div style="display: flex; align-items: center; margin-bottom: 4px;">
                    <i style="background: ${item.color}; width: 14px; height: 14px; border-radius: 50%; display: inline-block; margin-right: 8px; border: 1px solid #fff;"></i>
                    <span style="font-size: 11px;">${item.text}</span>
                </div>
            `;
        });

        return div;
    };

    legend.addTo(map);
}
// 2. Load Data dari JSON (Data Utama & Data AHP)
async function fetchData() {
    try {
        // Mengambil data bobot AHP terlebih dahulu
        const ahpResponse = await fetch('ahp_results.json');
        ahpData = await ahpResponse.json();
        renderAHPTable(ahpData);

        // Mengambil data utama SPKLU
        const response = await fetch('data_spklu.json');
        rawData = await response.json();
        
        populateKapasitasFilter(rawData);
        renderDashboard(rawData);
    } catch (error) {
        console.error("Gagal memuat data JSON:", error);
    }
}

// 3. Render Tabel Bobot AHP secara Dinamis
function renderAHPTable(data) {
    const ahpBody = document.getElementById('ahpWeightBody');
    const ahpFooter = document.getElementById('ahpFooter'); // Ambil elemen footer
    
    if (!ahpBody || !data) return;

    // 1. Render isi tabel (seperti sebelumnya)
    const getWeight = (key) => {
        const found = data.details.find(d => d.kriteria.toLowerCase().includes(key.toLowerCase()));
        return found ? `${found.bobot}%` : '-';
    };

    ahpBody.innerHTML = `
        <tr class="fw-bold text-primary">
            <td>${getWeight('Rata2')}</td>
            <td>${getWeight('KBLBB')}</td>
            <td>${getWeight('Kapasitas')}</td>
            <td>${getWeight('Biaya')}</td>
            <td>${getWeight('Umur')}</td>
        </tr>`;

    // 2. Update Footer dengan Angka Konsistensi
    if (ahpFooter) {
        const crValue = data.consistency_ratio;
        const statusText = data.is_consistent ? 
            '<span class="text-success">(Konsisten)</span>' : 
            '<span class="text-danger">(Tidak Konsisten - Perlu Evaluasi Matriks)</span>';

        ahpFooter.innerHTML = `* Bobot ini hasil perhitungan AHP dengan <strong>Consistency Ratio (CR): ${crValue}</strong> ${statusText}.`;
    }
}

// 4. Mengisi Dropdown Kapasitas secara Dinamis
function populateKapasitasFilter(data) {
    const capacities = [...new Set(data.map(item => item.KAPASITAS))].sort((a,b) => a-b);
    const select = document.getElementById('filterKapasitas');
    
    // Bersihkan opsi lama kecuali "ALL"
    select.innerHTML = '<option value="ALL">SEMUA KAPASITAS</option>';
    
    capacities.forEach(cap => {
        let opt = document.createElement('option');
        opt.value = cap;
        opt.innerHTML = `${cap} kW`;
        select.appendChild(opt);
    });
}

// 5. Logika Filter
function applyFilters() {
    const fUP3 = document.getElementById('filterUP3').value;
    const fType = document.getElementById('filterType').value;
    const fCap = document.getElementById('filterKapasitas').value;
    const fStatus = document.getElementById('filterStatus').value;

    const filtered = rawData.filter(item => {
        const matchUP3 = (fUP3 === 'ALL' || item.UP3 === fUP3);
        const matchType = (fType === 'ALL' || item['TYPE CHARGE'] === fType);
        const matchCap = (fCap === 'ALL' || item.KAPASITAS.toString() === fCap);
        const matchStatus = (fStatus === 'ALL' || item.REKOMENDASI.toUpperCase().includes(fStatus.toUpperCase()));
        
        return matchUP3 && matchType && matchCap && matchStatus;
    });

    renderDashboard(filtered);
}

// 6. Render Marker dan Tabel Utama
function renderDashboard(data) {
    // Bersihkan Tabel & Marker
    markerLayer.clearLayers();
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    data.forEach(item => {
        // Format ID - Nama Stasiun
        const idDisplay = item.ID_SPKLU ? parseFloat(item.ID_SPKLU).toFixed(0) : 'N/A';
        const displayName = `${idDisplay} - ${item['Nama Stasiun']}`;
        const valULP = item.ULP || "N/A";

        // Tentukan Warna Badge Rekomendasi
        let badgeClass = 'bg-success'; // Default Optimal
        if(item.REKOMENDASI.includes('RELOKASI')) badgeClass = 'bg-danger';
        if(item.REKOMENDASI.includes('TAMBAH')) badgeClass = 'bg-warning text-dark';

        // Render Baris Tabel
        const row = `<tr>
            <td class="fw-bold">${displayName}</td>
            <td><span class="badge bg-light text-dark border">${valULP}</span></td>
            <td><small class="text-muted">${item['TYPE CHARGE'] || '-'}</small></td>
            <td class="text-center">${item.KAPASITAS || 0} kW</td>
            <td class="text-center fw-bold text-primary">${parseFloat(item.score || 0).toFixed(4)}</td>
            <td><span class="badge ${badgeClass} px-3 py-2 rounded-pill shadow-sm w-100">${item.REKOMENDASI}</span></td>
        </tr>`;
        tbody.innerHTML += row;

        // 7. Render Marker Peta
        const mColor = item.REKOMENDASI.includes('RELOKASI') ? '#d93025' : 
                       (item.REKOMENDASI.includes('TAMBAH') ? '#f57f17' : '#1e7e34');
        
        if (item.Latitude && item.Longitude) {
            const marker = L.circleMarker([item.Latitude, item.Longitude], {
                radius: 9,
                fillColor: mColor,
                color: "#fff",
                weight: 2,
                opacity: 1,
                fillOpacity: 0.9
            }).bindPopup(`
                <div style="font-family: Arial">
                    <b>${displayName}</b><br>
                    <hr style="margin: 5px 0">
                    ULP : ${valULP}<br>
                    Rata2: ${item.RATA2TRANSAKSI} Kali Transaksi<br>
                    Kapasitas Daya : ${item.KAPASITAS} KW<br>
                    Umur  : ${item.UMUR} Tahun<br>
                    Skor : ${parseFloat(item.score).toFixed(4)}<br>
                    <b>Status : ${item.REKOMENDASI}</b>
                </div>
            `);
            markerLayer.addLayer(marker);
        }
    });
}

// Inisialisasi saat halaman dimuat
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    fetchData();
});
