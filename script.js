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
        return {
            ...r, nama: r['Nama Stasiun'].trim(), lat: parseFloat(r.Latitude), lon: parseFloat(r.Longitude),
            tx: tx.find(i => i['ID_SPKLU'] === id) || {},
            kwh: kwh.find(i => i['ID_SPKLU'] === id) || {}
        };
    });
    db.up3_list = [...uSet].sort(); db.kota_list = [...kSet].sort();
}

// Fungsi Baru: Marker Warna Dinamis untuk Analisis Relokasi
function getRelocationIcon(totalTx) {
    // Threshold: < 30 transaksi per bulan dianggap prioritas relokasi (Merah)
    const color = (totalTx < 30) ? 'red' : 'green';
    return L.icon({
        iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });
}

function initApp() {
    if (map) map.remove();
    map = L.map('map', { zoomControl: false }).setView([-0.03, 109.33], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    db.spklu_data.forEach(d => {
        if (!isNaN(d.lat)) {
            const totKwh = db.date_list.reduce((acc, bln) => acc + (parseFloat(d.kwh[bln]?.toString().replace(',','.')) || 0), 0);
            const totTx = db.date_list.reduce((acc, bln) => acc + (parseFloat(d.tx[bln]?.toString().replace(',','.')) || 0), 0);
            
            // Hitung rata-rata per bulan yang ada datanya
            const avgTx = totTx / db.date_list.length;

            const m = L.marker([d.lat, d.lon], { icon: getRelocationIcon(totTx) }).addTo(map)
                .bindPopup(`
                    <div style="min-width:180px">
                        <b style="color:#1e88e5;">${d.nama}</b><br><small>ID: ${d.ID_SPKLU}</small><hr>
                        <table style="width:100%; font-size:11px;">
                            <tr><td>Tipe</td><td>: ${d['TYPE CHARGE']}</td></tr>
                            <tr><td>Kwh Total</td><td>: ${totKwh.toLocaleString('id-ID')}</td></tr>
                            <tr><td>Tx Total</td><td>: ${totTx.toLocaleString('id-ID')}</td></tr>
                            <tr><td>Status</td><td>: ${totTx < 30 ? '<b style="color:red;">PRIORITAS RELOKASI</b>' : '<b style="color:green;">OPTIMAL</b>'}</td></tr>
                        </table>
                        <a href="https://www.google.com/maps?q=${d.lat},${d.lon}" target="_blank" class="btn-rute">📍 Navigasi</a>
                    </div>
                `);
            m.data = d; markers.push(m);
        }
    });

    // Populate Filters
    const mU = document.getElementById('mapFilterUP3'), mK = document.getElementById('mapFilterKota'), oU = document.getElementById('optUP3'), oK = document.getElementById('optKota');
    mU.innerHTML = '<option value="all">Semua UP3</option>'; mK.innerHTML = '<option value="all">Semua Kota</option>';
    db.up3_list.forEach(u => { mU.add(new Option(u, u)); oU.appendChild(new Option("UP3 " + u, u)); });
    db.kota_list.forEach(k => { mK.add(new Option(k, k)); oK.appendChild(new Option(k, k)); });

    setupEvents(); updateDashboard(); applyMapFilter();
}

function setupEvents() {
    ['searchNama', 'mapFilterUP3', 'mapFilterKota', 'mapFilterType'].forEach(id => document.getElementById(id).addEventListener('input', applyMapFilter));
    ['evalFilterGeo', 'evalFilterCategory', 'evalFilterChartType', 'evalFilterYear'].forEach(id => document.getElementById(id).addEventListener('change', updateDashboard));
    document.getElementById('prevBtn').onclick = () => { if(currentPage > 1) { currentPage--; renderTable(); } };
    document.getElementById('nextBtn').onclick = () => { if(currentPage * rowsPerPage < filteredTableData.length) { currentPage++; renderTable(); } };
}

function updateYearFilter() {
    const years = new Set();
    db.date_list.forEach(d => { if(d.includes('-')) years.add("20" + d.split('-')[1]); });
    const sel = document.getElementById('evalFilterYear');
    sel.innerHTML = '<option value="all">Semua Tahun</option>';
    Array.from(years).sort().reverse().forEach(y => sel.add(new Option(y, y)));
}

function applyMapFilter() {
    const s = document.getElementById('searchNama').value.toLowerCase(), u = document.getElementById('mapFilterUP3').value, k = document.getElementById('mapFilterKota').value, t = document.getElementById('mapFilterType').value, list = document.getElementById('spkluList');
    list.innerHTML = '';
    
    let stats = { total: 0, relocation: 0, optimal: 0 };

    markers.forEach(m => {
        const d = m.data, match = d.nama.toLowerCase().includes(s) && (u === 'all' || d.UP3 === u) && (k === 'all' || d.Kota === k) && (t === 'all' || d['TYPE CHARGE'] === t);
        if(match) {
            m.addTo(map);
            stats.total++;
            const totTx = db.date_list.reduce((acc, bln) => acc + (parseFloat(d.tx[bln]?.toString().replace(',','.')) || 0), 0);
            if(totTx < 30) stats.relocation++; else stats.optimal++;

            const div = document.createElement('div'); 
            div.className = 'list-item'; 
            div.style.borderLeft = totTx < 30 ? '4px solid red' : '4px solid green';
            div.innerHTML = `<b>${d.nama}</b><small>${d.UP3} | ${totTx} Tx</small>`;
            div.onclick = () => { map.setView([d.lat, d.lon], 15); m.openPopup(); }; 
            list.appendChild(div);
        } else map.removeLayer(m);
    });
    updateLegend(stats);
}

function updateLegend(stats) {
    if (legendControl) map.removeControl(legendControl);
    legendControl = L.control({ position: 'bottomright' });
    legendControl.onAdd = () => {
        const div = L.DomUtil.create('div', 'legend');
        div.innerHTML = `<b>Ringkasan Analisis</b><hr>
            Status Optimal: ${stats.optimal}<br>
            <span style="color:red">Butuh Relokasi: ${stats.relocation}</span><br>
            Total Terfilter: ${stats.total}`;
        return div;
    };
    legendControl.addTo(map);
}

function updateDashboard() {
    const geo = document.getElementById('evalFilterGeo').value, cat = document.getElementById('evalFilterCategory').value, type = document.getElementById('evalFilterChartType').value, year = document.getElementById('evalFilterYear').value;
    let dates = db.date_list;
    if (year !== 'all') dates = dates.filter(d => d.includes("-" + year.substring(2)));
    dates = dates.filter(d => db.spklu_data.reduce((acc, s) => acc + (parseFloat(s[cat][d]?.toString().replace(',','.')) || 0), 0) > 0);

    const stations = db.spklu_data.filter(s => geo === 'all' || s.UP3 === geo || s.Kota === geo);
    const vals = dates.map(d => stations.reduce((acc, s) => acc + (parseFloat(s[cat][d]?.toString().replace(',','.')) || 0), 0));
    const totalKwh = dates.map(d => stations.reduce((acc, s) => acc + (parseFloat(s['kwh'][d]?.toString().replace(',','.')) || 0), 0)).reduce((a,b)=>a+b, 0);

    document.getElementById('totalValue').innerText = vals.reduce((a,b)=>a+b, 0).toLocaleString('id-ID') + (cat==='kwh'?' kWh':' Tx');
    document.getElementById('totalRupiah').innerText = "Rp " + (totalKwh * TARIF_KWH).toLocaleString('id-ID');
    document.getElementById('totalSPKLU').innerText = stations.length;

    renderChart(type, dates, vals, cat.toUpperCase());
    filteredTableData = [];
    stations.forEach(s => dates.forEach(d => { 
        const v = parseFloat(s[cat][d]?.toString().replace(',','.'));
        if(v > 0) filteredTableData.push({ n: s.nama, id: s.ID_SPKLU, u: s.UP3, b: d, k: s.kwh[d]||0, t: s.tx[d]||0 }); 
    }));
    filteredTableData.sort((a,b) => b.b.localeCompare(a.b));
    currentPage = 1; renderTable();
}

function renderChart(type, labels, data, label) {
    if (currentChart) currentChart.destroy();
    const isLine = type === 'line';
    currentChart = new Chart(document.getElementById('mainChart'), {
        type: type,
        data: {
            labels, datasets: [{
                label, data, backgroundColor: isLine ? 'rgba(0, 162, 233, 0.2)' : '#1e88e5', borderColor: '#1e88e5', fill: isLine, tension: 0.3
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderTable() {
    const start = (currentPage - 1) * rowsPerPage;
    const pageData = filteredTableData.slice(start, start + rowsPerPage);
    document.getElementById('tableBody').innerHTML = pageData.map(r => `<tr><td>${r.n}</td><td>${r.u}</td><td>${r.b}</td><td>${r.k}</td><td>${r.t}</td></tr>`).join('');
    document.getElementById('pageInfo').innerText = `Hal ${currentPage} dari ${Math.ceil(filteredTableData.length/rowsPerPage) || 1}`;
}

fetchData();
