let map;
let markerLayer = L.layerGroup();
let rawData = [];

function initMap() {
    map = L.map('map').setView([-0.026330, 109.342504], 7);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')
        .addTo(map);

    markerLayer.addTo(map);
}

async function fetchData() {
    const res1 = await fetch('ahp_results.json');
    const ahp = await res1.json();
    renderAHPTable(ahp);

    const res2 = await fetch('data_spklu.json');
    rawData = await res2.json();

    renderDashboard(rawData);
}

function renderAHPTable(data) {
    const body = document.getElementById('ahpWeightBody');
    const foot = document.getElementById('ahpFooter');

    if (!data || data.error) return;

    const w = data.weights;

    body.innerHTML = `
        <tr>
            <td>${w.Transaksi}</td>
            <td>${w['Pengguna EV']}</td>
            <td>${w.Kapasitas}</td>
            <td>${w.Biaya}</td>
            <td>${w.Umur}</td>
        </tr>
    `;

    foot.innerHTML = `CR: ${data.cr}`;
}

function renderDashboard(data) {
    markerLayer.clearLayers();

    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    data.forEach(item => {

        let badge = 'bg-success';
        if (item.REKOMENDASI.includes('POTENSI')) badge = 'bg-danger';
        if (item.REKOMENDASI.includes('TAMBAH')) badge = 'bg-warning text-dark';

        const detail = item.REKOMENDASI_DETAIL || item.REKOMENDASI;

        tbody.innerHTML += `
        <tr>
            <td>${item.ID_SPKLU} - ${item['Nama Stasiun']}</td>
            <td>${item.ULP}</td>
            <td>${item['TYPE CHARGE']}</td>
            <td class="text-center">${item.KAPASITAS}</td>
            <td class="text-center text-primary fw-bold">
                ${parseFloat(item.SCORE).toFixed(4)}
            </td>
            <td>
                <span class="badge ${badge}">
                    ${item.REKOMENDASI}
                </span>
                <br>
                <small>${detail}</small>
            </td>
        </tr>
        `;

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
                <b>${item['Nama Stasiun']}</b><br>
                ${detail}
            `);

            markerLayer.addLayer(marker);
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    fetchData();
});
