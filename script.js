const URL_SPKLU = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=1832472677&single=true&output=csv';
const URL_TX = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=380492498&single=true&output=csv';
const URL_KWH = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=1097239958&single=true&output=csv';

const TARIF_KWH = 2467; // Tarif estimasi Rp per kWh

let map, markers = [], currentChart = null, legendControl = null;
let db = { spklu_data: [], up3_list: [], kota_list: [], date_list: [] };
let filteredTableData = [], currentPage = 1, rowsPerPage = 10;

// --- DATA FETCHING ---
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

// --- PETA & MARKER ---
function initApp() {
    if (map) map.remove();
    map = L.map('map', { zoomControl: false }).setView([-0.03, 109.33], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const icons = {
        "FAST CHARGING": L.icon({ iconUrl: 'icon/fast.png', iconSize: [30, 30], iconAnchor: [15, 30] }),
        "MEDIUM CHARGING": L.icon({ iconUrl: 'icon/mediumfast.png', iconSize: [30, 30], iconAnchor: [15, 30] }),
        "ULTRA FAST CHARGING": L.icon({ iconUrl: 'icon/ultrafast.png', iconSize: [30, 30], iconAnchor: [15, 30] }),
        "SPKLU R2": L.icon({ iconUrl: 'icon/spklur2.png', iconSize: [30, 30], iconAnchor: [15, 30] })
    };

    db.spklu_data.forEach(d => {
        if (!isNaN(d.lat)) {
            const totKwh = db.date_list.reduce((acc, bln) => acc + (parseFloat(d.kwh[bln]?.toString().replace(',','.')) || 0), 0);
            const totTx = db.date_list.reduce((acc, bln) => acc + (parseFloat(d.tx[bln]?.toString().replace(',','.')) || 0), 0);
            const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lon}`;

            const m = L.marker([d.lat, d.lon], { icon: icons[d['TYPE CHARGE']] || icons["FAST CHARGING"] }).addTo(map)
                .bindPopup(`
                    <div style="min-width:180px">
                        <b style="color:#1e88e5;">${d.nama}</b><br><small>ID: ${d.ID_SPKLU}</small><hr>
                        <table style="width:100%; font-size:11px;">
                            <tr><td>Daya</td><td>: ${d.KW || '-'} kW</td></tr>
                            <tr><td>Kwh</td><td>: ${totKwh.toLocaleString('id-ID')}</td></tr>
                            <tr><td>Tx</td><td>: ${totTx.toLocaleString('id-ID')}</td></tr>
                        </table>
                        <a href="${gmaps}" target="_blank" class="btn-rute">📍 Navigasi</a>
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

// --- FILTER & LOGIC ---
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
    let counts = { "FAST CHARGING": 0, "MEDIUM CHARGING": 0, "ULTRA FAST CHARGING": 0, "SPKLU R2": 0 };

    markers.forEach(m => {
        const d = m.data, match = d.nama.toLowerCase().includes(s) && (u === 'all' || d.UP3 === u) && (k === 'all' || d.Kota === k) && (t === 'all' || d['TYPE CHARGE'] === t);
        if(match) {
            m.addTo(map);
            counts[d['TYPE CHARGE']] = (counts[d['TYPE CHARGE']] || 0) + 1;
            const div = document.createElement('div'); div.className = 'list-item'; div.innerHTML = `<b>${d.nama}</b><small>${d.UP3} | ${d['TYPE CHARGE']}</small>`;
            div.onclick = () => { map.setView([d.lat, d.lon], 15); m.openPopup(); }; list.appendChild(div);
        } else map.removeLayer(m);
    });
    updateLegend(counts);
}

function updateLegend(counts) {
    if (legendControl) map.removeControl(legendControl);
    legendControl = L.control({ position: 'bottomright' });
    legendControl.onAdd = () => {
        const div = L.DomUtil.create('div', 'legend');
        div.innerHTML = `<b>Unit Tersedia</b><br>
            <img src="icon/fast.png"> Fast: ${counts["FAST CHARGING"] || 0}<br>
            <img src="icon/mediumfast.png"> Med: ${counts["MEDIUM CHARGING"] || 0}<br>
            <img src="icon/ultrafast.png"> Ultra: ${counts["ULTRA FAST CHARGING"] || 0}<br>
            <img src="icon/spklur2.png"> R2: ${counts["SPKLU R2"] || 0}`;
        return div;
    };
    legendControl.addTo(map);
}

// --- DASHBOARD ---
function updateDashboard() {
    const geo = document.getElementById('evalFilterGeo').value, cat = document.getElementById('evalFilterCategory').value, year = document.getElementById('evalFilterYear').value, txRange = document.getElementById('evalFilterTxRange').value;

    let dates = db.date_list;
    if (year !== 'all') dates = dates.filter(d => d.includes("-" + year.substring(2)));

    // Filter & hitung per stasiun
    filteredTableData = db.spklu_data.filter(s => (geo === 'all' || s.UP3 === geo || s.Kota === geo))
    .map(s => {
        const totalTx = dates.reduce((acc, d) => acc + (parseFloat(s.tx[d]?.toString().replace(',','.')) || 0), 0);
        const totalKwh = dates.reduce((acc, d) => acc + (parseFloat(s.kwh[d]?.toString().replace(',','.')) || 0), 0);
        
        let status = "Sangat Padat", color = "bg-info", rec = "Pertahankan / Tambah Unit";
        if (totalTx === 0) { status = "Tidak Ada Transaksi"; color = "bg-danger"; rec = "Prioritas Relokasi"; }
        else if (totalTx < 3) { status = "Kurang Efektif"; color = "bg-danger"; rec = "Rekomendasi Relokasi"; }
        else if (totalTx < 5) { status = "Cukup Efektif"; color = "bg-warning"; rec = "Evaluasi Rutin"; }
        else if (totalTx < 10) { status = "Efektif"; color = "bg-success"; rec = "Lokasi Sesuai"; }

        return { n: s.nama, u: s.UP3, tx: totalTx, kwh: totalKwh, status, color, rec };
    });

    // Apply Filter Range Transaksi
    if (txRange !== 'all') {
        filteredTableData = filteredTableData.filter(d => {
            if (txRange === '0') return d.tx === 0;
            if (txRange === 'under3') return d.tx > 0 && d.tx < 3;
            if (txRange === 'under5') return d.tx < 5;
            if (txRange === 'under10') return d.tx < 10;
            if (txRange === 'over10') return d.tx >= 10;
        });
    }

    // Totals
    const totalVal = filteredTableData.reduce((a, b) => a + (cat === 'transactions' ? b.tx : b.kwh), 0);
    const totalKwhAkumulasi = filteredTableData.reduce((a, b) => a + b.kwh, 0);
    const relokasiCount = filteredTableData.filter(d => d.tx < 3).length;

    document.getElementById('totalValue').innerText = totalVal.toLocaleString('id-ID') + (cat === 'transactions' ? ' Tx' : ' kWh');
    document.getElementById('totalRupiah').innerText = "Rp " + (totalKwhAkumulasi * TARIF_KWH).toLocaleString('id-ID');
    document.getElementById('relocationCount').innerText = relokasiCount + " Unit";

    // Chart
    const chartData = dates.map(d => filteredTableData.reduce((acc, s) => {
        const stationOrigin = db.spklu_data.find(x => x.nama === s.n);
        return acc + (parseFloat(stationOrigin[cat][d]?.toString().replace(',','.')) || 0);
    }, 0));
    renderChart(dates, chartData, cat === 'transactions' ? 'Transaksi' : 'kWh');

    currentPage = 1; renderTable();
}

function renderChart(type, labels, data, label) {
    if (currentChart) currentChart.destroy();
    const isLine = type === 'line';
    currentChart = new Chart(document.getElementById('mainChart'), {
        type: type,
        data: {
            labels, datasets: [{
                label, data, backgroundColor: isLine ? 'rgba(0, 162, 233, 0.2)' : '#00A2E9', borderColor: '#0079C1', fill: isLine, tension: 0.3, pointRadius: isLine ? 4 : 0
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderTable() {
    const start = (currentPage - 1) * rowsPerPage;
    const pageData = filteredTableData.slice(start, start + rowsPerPage);
    document.getElementById('tableBody').innerHTML = pageData.map(r => `<tr><td>${r.n} (${r.id})</td><td>${r.u}</td><td>${r.b}</td><td>${r.k}</td><td>${r.t}</td></tr>`).join('');
    document.getElementById('pageInfo').innerText = `Hal ${currentPage} dari ${Math.ceil(filteredTableData.length/rowsPerPage) || 1}`;
}

fetchData();
