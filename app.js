let map;
let markerLayer = L.layerGroup();
let rawData = [];
let ahpData = null;

// ==========================
// 1. INIT MAP
// ==========================
function initMap() {
    map = L.map('map').setView([-0.026330, 109.342504], 7);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    markerLayer.addTo(map);
    addLegend(map);
}

// ==========================
// 2. LEGEND
// ==========================
function addLegend(map) {
    const legend = L.control({ position: 'bottomright' });

    legend.onAdd = function () {
        const div = L.DomUtil.create('div', 'info legend');

        const labels = [
            { color: '#1e7e34', text: 'Optimal' },
            { color: '#f57f17', text: 'Tambah Unit' },
            { color: '#d93025', text: 'Potensi Relokasi' }
        ];

        div.style = `
            background:white;
            padding:10px;
            border-radius:6px;
            font-size:12px;
        `;

        div.innerHTML = '<b>Status</b><br>';

        labels.forEach(item => {
            div.innerHTML += `
                <div>
                    <span style="
                        background:${item.color};
                        width:12px;
                        height:12px;
                        display:inline-block;
                        border-radius:50%;
                        margin-right:6px;
                    "></span>
                    ${item.text}
                </div>
            `;
        });

        return div;
    };

    legend.addTo(map);
}

// ==========================
// 3. FETCH DATA
// ==========================
async function fetchData() {
    try {
        // AHP
        const ahpResponse = await fetch('ahp_results.json');
        ahpData = await ahpResponse.json();
        renderAHPTable(ahpData);

        // DATA SPKLU
        const response = await fetch('data_spklu.json');
        rawData = await response.json();

        if (!rawData || rawData.length === 0) {
            console.warn("Data kosong!");
        }

        populateKapasitasFilter(rawData);
        renderDashboard(rawData);

    } catch (error) {
        console.error("Gagal load JSON:", error);
    }
}

// ==========================
// 4. AHP TABLE
// ==========================
function renderAHPTable(data) {
    const ahpBody = document.getElementById('ahpWeightBody');
    const ahpFooter = document.getElementById('ahpFooter');

    if (!data || data.error) {
        ahpBody.innerHTML = `<tr><td colspan="5" class="text-danger">AHP Error</td></tr>`;
        return;
    }

    const w = data.weights;

    ahpBody.innerHTML = `
        <tr class="text-center fw-bold text-primary">
            <td>${w.Transaksi}</td>
            <td>${w['Pengguna EV']}</td>
            <td>${w.Kapasitas}</td>
            <td>${w.Biaya}</td>
            <td>${w.Umur}</td>
        </tr>
    `;

    const status = data.is_consistent
        ? '<span class="text-success">Konsisten (dibawah 1)</span>'
        : '<span class="text-danger">Tidak Konsisten</span>';

    ahpFooter.innerHTML = `CR: <b>${data.cr}</b> ${status}`;
}

// ==========================
// 5. FILTER DROPDOWN
// ==========================
function populateKapasitasFilter(data) {
    const select = document.getElementById('filterKapasitas');

    const capacities = [...new Set(data.map(d => d.KAPASITAS))].sort((a, b) => a - b);

    select.innerHTML = '<option value="ALL">SEMUA</option>';

    capacities.forEach(cap => {
        const opt = document.createElement('option');
        opt.value = cap;
        opt.innerHTML = `${cap} kW`;
        select.appendChild(opt);
    });
}

// ==========================
// 6. FILTER LOGIC
// ==========================
function applyFilters() {
    const fUP3 = document.getElementById('filterUP3').value;
    const fType = document.getElementById('filterType').value;
    const fCap = document.getElementById('filterKapasitas').value;
    const fStatus = document.getElementById('filterStatus').value;

    const filtered = rawData.filter(item => {
        return (
            (fUP3 === 'ALL' || item.UP3 === fUP3) &&
            (fType === 'ALL' || item['TYPE CHARGE'] === fType) &&
            (fCap === 'ALL' || item.KAPASITAS.toString() === fCap) &&
            (fStatus === 'ALL' || item.REKOMENDASI_DETAIL || item.REKOMENDASI.includes(fStatus))
        );
    });

    renderDashboard(filtered);
}

// ==========================
// 7. RENDER DASHBOARD
// ==========================
function renderDashboard(data) {
    markerLayer.clearLayers();

    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    data.forEach(item => {

        const score = parseFloat(item.SCORE || 0).toFixed(4);

        const nama = item['Nama Stasiun'] || '-';
        const id = item.ID_SPKLU ? parseInt(item.ID_SPKLU) : '-';
        const display = `${id} - ${nama}`;

        const ulp = item.ULP || '-';

        // badge warna
        let badge = 'bg-success';
        if (item.REKOMENDASI.includes('POTENSI')) badge = 'bg-danger';
        if (item.REKOMENDASI.includes('TAMBAH')) badge = 'bg-warning text-dark';

        // TABLE
        tbody.innerHTML += `
            <tr>
                <td class="fw-bold">${display}</td>
                <td>${ulp}</td>
                <td>${item['TYPE CHARGE'] || '-'}</td>
                <td class="text-center">${item.KAPASITAS || 0}</td>
                <td class="text-center text-primary fw-bold">${score}</td>
                <td>
                    <span class="badge ${badge}">
                    ${item.REKOMENDASI}
                    </span><br>    <small class="text-muted">
                    ${item.REKOMENDASI_DETAIL || ''}
                    </small>
                </td>
            </tr>
        `;

        // MAP
        if (item.Latitude && item.Longitude) {
            const color =
                item.REKOMENDASI.includes('POTENSI') ? '#d93025' :
                item.REKOMENDASI.includes('TAMBAH') ? '#f57f17' :
                '#1e7e34';

            const marker = L.circleMarker(
                [item.Latitude, item.Longitude],
                {
                    radius: 8,
                    fillColor: color,
                    color: "#fff",
                    weight: 2,
                    fillOpacity: 0.9
                }
            ).bindPopup(`
                <b>${display}</b><br>
                ULP: ${ulp}<br>
                Transaksi: ${item.RATA2TRANSAKSI} Kali<br>
                Kapasitas: ${item.KAPASITAS} kW<br>
                Umur: ${item.UMUR}<br>
                Skor: ${score}<br>
                <b>${item.REKOMENDASI}</b>
            `);

            markerLayer.addLayer(marker);
        }
    });
}

// ==========================
// INIT
// ==========================
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    fetchData();
});
