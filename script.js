// Masukkan Link Google Sheets (Format CSV) Anda di sini
const URL_SPKLU = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=650444376&single=true&output=csv';
const URL_TX = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=2044243535&single=true&output=csv';
const URL_KWH = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=1058603642&single=true&output=csv';

let map, markers = [], currentChart = null;
let db = { spklu_data: [], up3_list: [], kota_list: [], date_list: [] };
let filteredTableData = [], currentPage = 1, rowsPerPage = 10;

// 1. Ambil Data dari Google Sheets
async function fetchData() {
    const fetchCsv = (url) => new Promise((resolve) => {
        Papa.parse(url, { download: true, header: true, dynamicTyping: true, complete: (res) => resolve(res.data) });
    });

    try {
        const [rawSpklu, rawTx, rawKwh] = await Promise.all([fetchCsv(URL_SPKLU), fetchCsv(URL_TX), fetchCsv(URL_KWH)]);
        processData(rawSpklu, rawTx, rawKwh);
        initApp();
    } catch (e) { alert("Gagal memuat data. Periksa link Google Sheets Anda."); }
}

// 2. Olah Data
function processData(spklu, tx, kwh) {
    const dates = Object.keys(tx[0]).filter(k => k !== 'Nama Stasiun');
    const kotaSet = new Set(), up3Set = new Set();

    db.spklu_data = spklu.filter(s => s['Nama Stasiun']).map(s => {
        kotaSet.add(s.Kota);
        up3Set.add(s.UP3);
        return {
            ...s, nama: s['Nama Stasiun'],
            transactions: tx.find(t => t['Nama Stasiun'] === s['Nama Stasiun']) || {},
            kwh: kwh.find(k => k['Nama Stasiun'] === s['Nama Stasiun']) || {}
        };
    });

    db.date_list = dates;
    db.up3_list = Array.from(up3Set).sort();
    db.kota_list = Array.from(kotaSet).sort();
}

// 3. Jalankan Aplikasi
function initApp() {
    initMap();
    populateFilters();
    updateDashboard();
    setupEventListeners();
}

function initMap() {
    map = L.map('map', { zoomControl: false }).setView([-0.03, 109.33], 8);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    db.spklu_data.forEach(d => {
        const m = L.marker([d.Latitude, d.Longitude]).addTo(map)
            .bindPopup(`<b>${d.nama}</b><br>${d.Alamat}`);
        m.data = d;
        markers.push(m);
    });
}

function populateFilters() {
    const optUP3 = document.getElementById('optUP3');
    const optKota = document.getElementById('optKota');
    const mapKota = document.getElementById('mapFilterKota');

    db.kota_list.forEach(k => {
        optKota.add(new Option(k, k));
        mapKota.add(new Option(k, k));
    });
    db.up3_list.forEach(u => optUP3.add(new Option("UP3 " + u, u)));
}

function setupEventListeners() {
    document.getElementById('searchNama').addEventListener('input', applyMapFilter);
    ['mapFilterKota', 'mapFilterType'].forEach(id => document.getElementById(id).addEventListener('change', applyMapFilter));
    ['evalFilterGeo', 'evalFilterCategory', 'evalFilterChartType', 'evalFilterTime'].forEach(id => {
        document.getElementById(id).addEventListener('change', updateDashboard);
    });

    document.getElementById('prevBtn').onclick = () => { if(currentPage > 1) { currentPage--; renderTable(); } };
    document.getElementById('nextBtn').onclick = () => { if(currentPage * rowsPerPage < filteredTableData.length) { currentPage++; renderTable(); } };
}

function applyMapFilter() {
    const search = document.getElementById('searchNama').value.toLowerCase();
    const kota = document.getElementById('mapFilterKota').value;
    const type = document.getElementById('mapFilterType').value;
    const listEl = document.getElementById('spkluList');
    listEl.innerHTML = '';

    markers.forEach(m => {
        const d = m.data;
        const match = d.nama.toLowerCase().includes(search) && (kota === 'all' || d.Kota === kota) && (type === 'all' || d['TYPE CHARGE'] === type);
        if(match) {
            m.addTo(map);
            const item = document.createElement('div');
            item.className = 'list-item';
            item.innerHTML = `<b>${d.nama}</b> ${d.Kota}`;
            item.onclick = () => { map.setView([d.Latitude, d.Longitude], 14); m.openPopup(); };
            listEl.appendChild(item);
        } else { map.removeLayer(m); }
    });
}

function updateDashboard() {
    const geo = document.getElementById('evalFilterGeo').value;
    const category = document.getElementById('evalFilterCategory').value;
    const chartType = document.getElementById('evalFilterChartType').value;
    const timeRange = document.getElementById('evalFilterTime').value;

    let displayDates = (timeRange === 'all') ? db.date_list : db.date_list.slice(-parseInt(timeRange));
    const filteredStations = db.spklu_data.filter(s => geo === 'all' || s.UP3 === geo || s.Kota === geo);

    const values = displayDates.map(date => {
        return filteredStations.reduce((sum, s) => sum + (s[category][date] || 0), 0);
    });

    renderChart(chartType, displayDates, values, category.toUpperCase());

    filteredTableData = [];
    filteredStations.forEach(s => {
        displayDates.forEach(date => {
            filteredTableData.push({ nama: s.nama, up3: s.UP3, bulan: date, kwh: s.kwh[date] || 0, tx: s.transactions[date] || 0 });
        });
    });
    filteredTableData.sort((a,b) => b.bulan.localeCompare(a.bulan));
    currentPage = 1;
    renderTable();
}

function renderChart(type, labels, data, label) {
    const ctx = document.getElementById('mainChart').getContext('2d');
    if(currentChart) currentChart.destroy();
    currentChart = new Chart(ctx, {
        type: type,
        data: { labels, datasets: [{ label, data, borderColor: '#1e88e5', backgroundColor: 'rgba(30,136,229,0.1)', fill: true }] }
    });
}

function renderTable() {
    const start = (currentPage - 1) * rowsPerPage;
    const pageData = filteredTableData.slice(start, start + rowsPerPage);
    document.getElementById('tableBody').innerHTML = pageData.map(r => `
        <tr><td>${r.nama}</td><td>${r.up3}</td><td>${r.bulan}</td><td>${r.kwh}</td><td>${r.tx}</td></tr>
    `).join('');
    document.getElementById('pageInfo').innerText = `Halaman ${currentPage}`;
}

fetchData();
