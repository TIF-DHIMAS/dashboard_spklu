const URL_SPKLU = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=1832472677&single=true&output=csv';
const URL_TX = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=380492498&single=true&output=csv';
const URL_KWH = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=1097239958&single=true&output=csv';

const TARIF_KWH = 2467;

let map, markers = [], currentChart = null, legendControl = null;
let db = { spklu_data: [], up3_list: [], kota_list: [], date_list: [] };
let filteredTableData = [], currentPage = 1, rowsPerPage = 10;

async function fetchData() {
    const fetchCsv = (url) => new Promise((res, rej) => Papa.parse(url, { download: true, header: true, skipEmptyLines: 'greedy', complete: (r) => res(r.data), error: rej }));
    try {
        const [s, t, k] = await Promise.all([fetchCsv(URL_SPKLU), fetchCsv(URL_TX), fetchCsv(URL_KWH)]);
        processData(s, t, k);
        updateYearFilter();
        initApp();
    } catch (e) { console.error("Data Load Error:", e); }
}

function processData(spklu, tx, kwh) {
    db.date_list = Object.keys(tx[0]).filter(key => !['UP3', 'ULP', 'ID_SPKLU', 'Nama Stasiun'].includes(key));
    const kSet = new Set(), uSet = new Set();
    
    db.spklu_data = spklu.filter(r => r['Nama Stasiun']).map(r => {
        const id = r['ID_SPKLU'];
        if(r.Kota) kSet.add(r.Kota.trim());
        if(r.UP3) uSet.add(r.UP3.trim());
        
        const txData = tx.find(i => i['ID_SPKLU'] === id) || {};
        const kwhData = kwh.find(i => i['ID_SPKLU'] === id) || {};

        // Hitung rata-rata transaksi untuk analisis relokasi
        const totalTx = db.date_list.reduce((acc, bln) => acc + (parseFloat(txData[bln]?.toString().replace(',','.')) || 0), 0);
        const avgTx = totalTx / db.date_list.length;

        return {
            ...r, 
            nama: r['Nama Stasiun'].trim(), 
            lat: parseFloat(r.Latitude), 
            lon: parseFloat(r.Longitude),
            tx: txData,
            kwh: kwhData,
            avgTx: avgTx
        };
    });
    db.up3_list = [...uSet].sort(); db.kota_list = [...kSet].sort();
}

function initApp() {
    if (map) map.remove();
    map = L.map('map', { zoomControl: false }).setView([-0.03, 109.33], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    db.spklu_data.forEach(d => {
        if (!isNaN(d.lat)) {
            const m = L.marker([d.lat, d.lon]).addTo(map)
                .bindPopup(`<b>${d.nama}</b><br>Avg Transaksi: ${d.avgTx.toFixed(1)}/bln`);
            m.data = d; markers.push(m);
        }
    });

    const mU = document.getElementById('mapFilterUP3'), mK = document.getElementById('mapFilterKota'), oU = document.getElementById('optUP3'), oK = document.getElementById('optKota');
    db.up3_list.forEach(u => { mU.add(new Option(u, u)); oU.appendChild(new Option(u, u)); });
    db.kota_list.forEach(k => { mK.add(new Option(k, k)); oK.appendChild(new Option(k, k)); });

    setupEvents(); updateDashboard();
}

function setupEvents() {
    ['searchNama', 'mapFilterUP3', 'mapFilterKota', 'mapFilterType'].forEach(id => document.getElementById(id).addEventListener('input', applyMapFilter));
    ['evalFilterGeo', 'evalFilterCategory', 'evalFilterProductivity', 'evalFilterYear'].forEach(id => document.getElementById(id).addEventListener('change', updateDashboard));
    document.getElementById('prevBtn').onclick = () => { if(currentPage > 1) { currentPage--; renderTable(); } };
    document.getElementById('nextBtn').onclick = () => { if(currentPage * rowsPerPage < filteredTableData.length) { currentPage++; renderTable(); } };
}

function applyMapFilter() {
    const s = document.getElementById('searchNama').value.toLowerCase(), u = document.getElementById('mapFilterUP3').value, k = document.getElementById('mapFilterKota').value, t = document.getElementById('mapFilterType').value;
    markers.forEach(m => {
        const d = m.data, match = d.nama.toLowerCase().includes(s) && (u === 'all' || d.UP3 === u) && (k === 'all' || d.Kota === k) && (t === 'all' || d['TYPE CHARGE'] === t);
        if(match) m.addTo(map); else map.removeLayer(m);
    });
}

function updateDashboard() {
    const geo = document.getElementById('evalFilterGeo').value;
    const cat = document.getElementById('evalFilterCategory').value;
    const year = document.getElementById('evalFilterYear').value;
    const prod = document.getElementById('evalFilterProductivity').value;

    let dates = db.date_list;
    if (year !== 'all') dates = dates.filter(d => d.includes("-" + year.substring(2)));

    // Filtering Stasiun berdasarkan Geografis DAN Produktivitas
    const stations = db.spklu_data.filter(s => {
        const geoMatch = (geo === 'all' || s.UP3 === geo || s.Kota === geo);
        let prodMatch = true;
        if (prod === '0') prodMatch = s.avgTx === 0;
        else if (prod === 'under3') prodMatch = s.avgTx > 0 && s.avgTx < 3;
        else if (prod === 'under5') prodMatch = s.avgTx >= 3 && s.avgTx < 5;
        else if (prod === 'under10') prodMatch = s.avgTx >= 5 && s.avgTx <= 10;
        else if (prod === 'over10') prodMatch = s.avgTx > 10;
        return geoMatch && prodMatch;
    });

    // Statistik
    const totalVals = stations.reduce((acc, s) => acc + dates.reduce((a, b) => a + (parseFloat(s[cat][b]?.toString().replace(',','.')) || 0), 0), 0);
    const totalKwhVal = stations.reduce((acc, s) => acc + dates.reduce((a, b) => a + (parseFloat(s['kwh'][b]?.toString().replace(',','.')) || 0), 0), 0);
    const lowPerformers = stations.filter(s => s.avgTx < 3).length;

    document.getElementById('totalValue').innerText = totalVals.toLocaleString('id-ID') + (cat === 'kwh' ? ' kWh' : ' Tx');
    document.getElementById('totalRupiah').innerText = "Rp " + (totalKwhVal * TARIF_KWH).toLocaleString('id-ID');
    document.getElementById('relocationCount').innerText = lowPerformers + " Unit";

    // Grafik
    const chartLabels = dates;
    const chartData = dates.map(d => stations.reduce((acc, s) => acc + (parseFloat(s[cat][d]?.toString().replace(',','.')) || 0), 0));
    renderChart(chartLabels, chartData, cat.toUpperCase());

    // Tabel Rekomendasi
    filteredTableData = stations.map(s => {
        let status = "Sangat Efektif", color = "bg-blue", rec = "Pertahankan";
        if (s.avgTx === 0) { status = "Tidak Ada Transaksi"; color = "bg-red"; rec = "Prioritas Relokasi"; }
        else if (s.avgTx < 3) { status = "Kurang Efektif"; color = "bg-orange"; rec = "Rekomendasi Relokasi"; }
        else if (s.avgTx < 10) { status = "Efektif"; color = "bg-green"; rec = "Optimal"; }
        
        return { n: s.nama, u: s.UP3, avg: s.avgTx.toFixed(2), status, color, rec };
    });

    currentPage = 1; renderTable();
}

function renderChart(labels, data, label) {
    if (currentChart) currentChart.destroy();
    currentChart = new Chart(document.getElementById('mainChart'), {
        type: 'line',
        data: { labels, datasets: [{ label, data, borderColor: '#0079C1', fill: false, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderTable() {
    const start = (currentPage - 1) * rowsPerPage;
    const pageData = filteredTableData.slice(start, start + rowsPerPage);
    document.getElementById('tableBody').innerHTML = pageData.map(r => `
        <tr>
            <td>${r.n}</td>
            <td>${r.u}</td>
            <td>${r.avg}</td>
            <td><span class="status-badge ${r.color}">${r.status}</span></td>
            <td><b>${r.rec}</b></td>
        </tr>`).join('');
    document.getElementById('pageInfo').innerText = `Hal ${currentPage} dari ${Math.ceil(filteredTableData.length/rowsPerPage) || 1}`;
}

function updateYearFilter() {
    const years = new Set();
    db.date_list.forEach(d => { if(d.includes('-')) years.add("20" + d.split('-')[1]); });
    const sel = document.getElementById('evalFilterYear');
    sel.innerHTML = '<option value="all">Semua Tahun</option>';
    Array.from(years).sort().reverse().forEach(y => sel.add(new Option(y, y)));
}

fetchData();
