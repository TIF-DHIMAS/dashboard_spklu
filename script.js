const URL_SPKLU = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=1832472677&single=true&output=csv';
const URL_TX = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=380492498&single=true&output=csv';
const URL_KWH = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=1097239958&single=true&output=csv';

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
    } catch (e) { console.error("Error:", e); }
}

function processData(spklu, tx, kwh) {
    // Header dimulai setelah kolom ID_SPKLU dan Nama Stasiun
    db.date_list = Object.keys(tx[0]).filter(key => !['UP3', 'ULP', 'ID_SPKLU', 'Nama Stasiun'].includes(key));
    const kSet = new Set(), uSet = new Set();
    
    db.spklu_data = spklu.filter(row => row['Nama Stasiun']).map(row => {
        const n = row['Nama Stasiun'].trim();
        const id = row['ID_SPKLU'];
        if(row.Kota) kSet.add(row.Kota.trim());
        if(row.UP3) uSet.add(row.UP3.trim());
        
        // Cari data berdasarkan ID_SPKLU agar lebih akurat
        return { 
            ...row, 
            nama: n, 
            lat: parseFloat(row.Latitude), 
            lon: parseFloat(row.Longitude), 
            tx: tx.find(i => i['ID_SPKLU'] === id) || {}, 
            kwh: kwh.find(i => i['ID_SPKLU'] === id) || {} 
        };
    });
    db.up3_list = [...uSet].sort(); db.kota_list = [...kSet].sort();
}

function initApp() {
    if (map) map.remove();
    map = L.map('map', { zoomControl: false }).setView([-0.03, 109.33], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const icons = {
        "FAST CHARGING": L.icon({ iconUrl: 'icon/fast.png', iconSize: [32, 32], iconAnchor: [16, 32] }),
        "MEDIUM CHARGING": L.icon({ iconUrl: 'icon/mediumfast.png', iconSize: [32, 32], iconAnchor: [16, 32] }),
        "ULTRA FAST CHARGING": L.icon({ iconUrl: 'icon/ultrafast.png', iconSize: [32, 32], iconAnchor: [16, 32] })
    };

    db.spklu_data.forEach(d => {
        if (!isNaN(d.lat)) {
            const m = L.marker([d.lat, d.lon], { icon: icons[d['TYPE CHARGE']] || icons["FAST CHARGING"] }).addTo(map)
                .bindPopup(`<b>${d.nama}</b><br><small>ID: ${d.ID_SPKLU}</small><br><a href="http://google.com/maps?q=${d.lat},${d.lon}" target="_blank" class="btn-rute">📍 Navigasi</a>`);
            m.data = d; markers.push(m);
        }
    });

    const mU = document.getElementById('mapFilterUP3'), mK = document.getElementById('mapFilterKota'), oU = document.getElementById('optUP3'), oK = document.getElementById('optKota');
    db.up3_list.forEach(u => { mU.add(new Option(u, u)); oU.appendChild(new Option("UP3 " + u, u)); });
    db.kota_list.forEach(k => { mK.add(new Option(k, k)); oK.appendChild(new Option(k, k)); });

    setupEvents(); updateDashboard(); applyMapFilter();
}

function setupEvents() {
    ['searchNama', 'mapFilterUP3', 'mapFilterKota', 'mapFilterType'].forEach(id => document.getElementById(id).addEventListener('input', applyMapFilter));
    ['evalFilterGeo', 'evalFilterCategory', 'evalFilterChartType', 'evalFilterTime'].forEach(id => document.getElementById(id).addEventListener('change', updateDashboard));
    document.getElementById('tableFilterYear').addEventListener('change', renderTable);
    document.getElementById('prevBtn').onclick = () => { if(currentPage > 1) { currentPage--; renderTable(); } };
    document.getElementById('nextBtn').onclick = () => { if(currentPage * rowsPerPage < filteredTableData.length) { currentPage++; renderTable(); } };
}

function updateYearFilter() {
    const years = new Set();
    db.date_list.forEach(d => { if(d.includes('-')) years.add("20" + d.split('-')[1]); });
    const select = document.getElementById('tableFilterYear');
    Array.from(years).sort().reverse().forEach(y => select.add(new Option(y, y)));
}

function applyMapFilter() {
    const s = document.getElementById('searchNama').value.toLowerCase(), u = document.getElementById('mapFilterUP3').value, k = document.getElementById('mapFilterKota').value, t = document.getElementById('mapFilterType').value, list = document.getElementById('spkluList');
    list.innerHTML = ''; let counts = { "FAST CHARGING": 0, "MEDIUM CHARGING": 0, "ULTRA FAST CHARGING": 0 };
    markers.forEach(m => {
        const d = m.data, match = d.nama.toLowerCase().includes(s) && (u === 'all' || d.UP3 === u) && (k === 'all' || d.Kota === k) && (t === 'all' || d['TYPE CHARGE'] === t);
        if(match) { m.addTo(map); counts[d['TYPE CHARGE']]++; const div = document.createElement('div'); div.className='list-item'; div.innerHTML=`<b>${d.nama}</b>${d.UP3}`; div.onclick=()=> { map.setView([d.lat, d.lon], 15); m.openPopup(); }; list.appendChild(div); } else map.removeLayer(m);
    });
    updateLegend(counts);
}

function updateLegend(counts) {
    if (legendControl) map.removeControl(legendControl);
    legendControl = L.control({ position: 'bottomright' });
    legendControl.onAdd = () => {
        const div = L.DomUtil.create('div', 'legend');
        div.innerHTML = `<b>Unit Tersedia</b><br><img src="icon/fast.png" width="16"> Fast: ${counts["FAST CHARGING"]}<br><img src="icon/mediumfast.png" width="16"> Med: ${counts["MEDIUM CHARGING"]}<br><img src="icon/ultrafast.png" width="16"> Ultra: ${counts["ULTRA FAST CHARGING"]}`;
        return div;
    };
    legendControl.addTo(map);
}

function updateDashboard() {
    const geo = document.getElementById('evalFilterGeo').value, cat = document.getElementById('evalFilterCategory').value, type = document.getElementById('evalFilterChartType').value, time = document.getElementById('evalFilterTime').value;
    
    let lastDataIndex = -1;
    for (let i = db.date_list.length - 1; i >= 0; i--) {
        const total = db.spklu_data.reduce((acc, s) => acc + (parseFloat(s[cat][db.date_list[i]]?.toString().replace(',','.')) || 0), 0);
        if (total > 0) { lastDataIndex = i; break; }
    }
    if (lastDataIndex === -1) lastDataIndex = db.date_list.length - 1;

    let availableDates = db.date_list.slice(0, lastDataIndex + 1);
    let displayDates = (time === 'all') ? availableDates : availableDates.slice(-parseInt(time));
    const stations = db.spklu_data.filter(s => geo === 'all' || s.UP3 === geo || s.Kota === geo);
    const vals = displayDates.map(d => stations.reduce((acc, s) => acc + (parseFloat(s[cat][d]?.toString().replace(',','.')) || 0), 0));
    
    document.getElementById('totalValue').innerText = vals.reduce((a,b)=>a+b, 0).toLocaleString('id-ID') + (cat==='kwh'?' kWh':' Tx');
    document.getElementById('totalSPKLU').innerText = stations.length;
    renderChart(type, displayDates, vals, cat.toUpperCase());
    
    filteredTableData = [];
    stations.forEach(s => displayDates.forEach(d => filteredTableData.push({ n: s.nama, id: s.ID_SPKLU, u: s.UP3, ul: s.ULP, b: d, k: s.kwh[d]||0, t: s.tx[d]||0 })));
    filteredTableData.sort((a,b) => b.b.localeCompare(a.b));
    currentPage = 1; renderTable();
}

function renderChart(type, labels, data, label) {
    if(currentChart) currentChart.destroy();
    const isLine = type === 'line';
    currentChart = new Chart(document.getElementById('mainChart'), {
        type: type,
        data: { labels, datasets: [{ label, data, backgroundColor: isLine ? 'rgba(0, 162, 233, 0.2)' : '#00A2E9', borderColor: '#0079C1', fill: isLine, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderTable() {
    const year = document.getElementById('tableFilterYear').value;
    let tableData = filteredTableData;
    if(year !== 'all') tableData = tableData.filter(r => r.b.includes("-" + year.substring(2)));
    const start = (currentPage - 1) * rowsPerPage;
    const pageData = tableData.slice(start, start + rowsPerPage);
    document.getElementById('tableBody').innerHTML = pageData.map(r => `<tr><td>${r.n} (${r.id})</td><td>${r.u} (${r.ul})</td><td>${r.b}</td><td>${r.k}</td><td>${r.t}</td></tr>`).join('');
    document.getElementById('pageInfo').innerText = `Hal ${currentPage} dari ${Math.ceil(tableData.length/rowsPerPage) || 1}`;
}

fetchData();
