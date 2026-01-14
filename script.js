//LINK SHARE PUBLIC CSV DARI SPREADSHEET
const URL_SPKLU = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=650444376&single=true&output=csv';
const URL_TX = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=2044243535&single=true&output=csv';
const URL_KWH = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=1058603642&single=true&output=csv';

let map, markers = [], currentChart = null, legendControl = null;
let db = { spklu_data: [], up3_list: [], kota_list: [], date_list: [] };
let filteredTableData = [], currentPage = 1, rowsPerPage = 10;

const cleanKey = (k) => k ? k.replace(/^\ufeff/g, "").trim() : "";

// --- FETCH DATA ---
async function fetchData() {
    const fetchCsv = (url) => new Promise((resolve, reject) => {
        Papa.parse(url, {
            download: true, header: true, skipEmptyLines: 'greedy', transformHeader: cleanKey,
            complete: (res) => resolve(res.data), error: (err) => reject(err)
        });
    });

    try {
        const [rawSpklu, rawTx, rawKwh] = await Promise.all([fetchCsv(URL_SPKLU), fetchCsv(URL_TX), fetchCsv(URL_KWH)]);
        
        const headers = Object.keys(rawTx[0]);
        db.date_list = headers.filter(k => k !== 'UP3' && k !== 'ULP' && k !== 'Nama Stasiun');
        
        const kSet = new Set(), uSet = new Set();
        db.spklu_data = rawSpklu.filter(s => s['Nama Stasiun']).map(s => {
            const name = s['Nama Stasiun'].trim();
            if(s.Kota) kSet.add(s.Kota.trim());
            if(s.UP3) uSet.add(s.UP3.trim());
            return {
                ...s, nama: name, lat: parseFloat(s.Latitude), lon: parseFloat(s.Longitude),
                tx: rawTx.find(t => t['Nama Stasiun'] && t['Nama Stasiun'].trim() === name) || {},
                kwh: rawKwh.find(k => k['Nama Stasiun'] && k['Nama Stasiun'].trim() === name) || {}
            };
        });

        db.up3_list = Array.from(uSet).sort();
        db.kota_list = Array.from(kSet).sort();
        
        updateYearFilter(); // Update daftar tahun berdasarkan header sheet
        initApp();
    } catch (error) { console.error("Error load data:", error); }
}

// --- INITIALIZE APP ---
function initApp() {
    // 1. Reset Peta jika sudah ada (mencegah error re-inisialisasi)
    if (map) map.remove();
    
    // Inisialisasi Peta - Zoom diletakkan di kanan bawah (zoomControl: false)
    map = L.map('map', { zoomControl: false }).setView([-0.03, 109.33], 7);
    
    // Tambah Tile Layer OpenStreetMap dengan Kredit/Attribution
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Tambah Kontrol Zoom di Pojok Kanan Bawah
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // 2. Definisi Custom Icon berdasarkan Type Charging (File di folder icon/)
    const icons = {
        "FAST CHARGING": L.icon({ 
            iconUrl: 'icon/fast.png', 
            iconSize: [32, 32], 
            iconAnchor: [16, 32], 
            popupAnchor: [0, -32] 
        }),
        "MEDIUM CHARGING": L.icon({ 
            iconUrl: 'icon/mediumfast.png', 
            iconSize: [32, 32], 
            iconAnchor: [16, 32], 
            popupAnchor: [0, -32] 
        }),
        "ULTRA FAST CHARGING": L.icon({ 
            iconUrl: 'icon/ultrafast.png', 
            iconSize: [32, 32], 
            iconAnchor: [16, 32], 
            popupAnchor: [0, -32] 
        })
    };

    // 3. Tambah Marker SPKLU ke Peta
    db.spklu_data.forEach(d => {
        if (!isNaN(d.lat) && !isNaN(d.lon)) {
            // URL Navigasi Google Maps (otomatis mendeteksi lokasi user)
            const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lon}`;
            
            // Pilih icon berdasarkan tipe, default ke Fast jika tidak ditemukan
            const selectedIcon = icons[d['TYPE CHARGE']] || icons["FAST CHARGING"];

            const m = L.marker([d.lat, d.lon], { icon: selectedIcon })
                .addTo(map)
                .bindPopup(`
                    <div style="min-width:160px; font-family:sans-serif;">
                        <b style="color:#1e88e5; font-size:14px;">${d.nama}</b><br>
                        <small>${d.Alamat}</small><br>
                        <span style="font-size:11px; display:block; margin-top:5px;">
                            <b>Tipe:</b> ${d['TYPE CHARGE']}
                        </span>
                        <a href="${gmaps}" target="_blank" class="btn-rute" 
                           style="display:block; margin-top:10px; text-align:center; background:#1e88e5; color:white; padding:6px; border-radius:4px; text-decoration:none; font-weight:bold; font-size:11px;">
                           📍 Navigasi Sekarang
                        </a>
                    </div>
                `);
            m.data = d; // Simpan data di objek marker untuk keperluan filter
            markers.push(m);
        }
    });

    // 4. Populasi Filter (Peta & Evaluasi)
    const mUP3 = document.getElementById('mapFilterUP3');
    const mKota = document.getElementById('mapFilterKota');
    const oUP3 = document.getElementById('optUP3'); // Elemen <optgroup>
    const oKota = document.getElementById('optKota'); // Elemen <optgroup>

    // Reset isi dropdown agar tidak terjadi duplikasi saat re-render
    if (mUP3) mUP3.innerHTML = '<option value="all">Semua UP3</option>';
    if (mKota) mKota.innerHTML = '<option value="all">Semua Kota</option>';
    if (oUP3) oUP3.innerHTML = '';
    if (oKota) oKota.innerHTML = '';

    // Isi UP3 ke Filter Peta dan Filter Evaluasi
    db.up3_list.forEach(u => {
        if (mUP3) mUP3.add(new Option(u, u));
        if (oUP3) oUP3.appendChild(new Option("UP3 " + u, u)); // appendChild khusus optgroup
    });

    // Isi Kota ke Filter Peta dan Filter Evaluasi
    db.kota_list.forEach(k => {
        if (mKota) mKota.add(new Option(k, k));
        if (oKota) oKota.appendChild(new Option(k, k)); // appendChild khusus optgroup
    });

    // Jalankan fungsi event listener, dashboard, dan filter peta pertama kali
    setupEvents();
    updateDashboard();
    applyMapFilter();
}
function setupEvents() {
    ['searchNama', 'mapFilterUP3', 'mapFilterKota', 'mapFilterType'].forEach(id => document.getElementById(id).addEventListener('input', applyMapFilter));
    ['evalFilterGeo', 'evalFilterCategory', 'evalFilterChartType', 'evalFilterTime'].forEach(id => document.getElementById(id).addEventListener('change', updateDashboard));
    document.getElementById('tableFilterYear').addEventListener('change', renderTable);
    
    document.getElementById('prevBtn').onclick = () => { if(currentPage > 1) { currentPage--; renderTable(); } };
    document.getElementById('nextBtn').onclick = () => { if(currentPage * rowsPerPage < filteredTableData.length) { currentPage++; renderTable(); } };
}

// --- FILTER TAHUN LOGIC ---
function updateYearFilter() {
    const yearSelect = document.getElementById('tableFilterYear');
    const years = new Set();
    db.date_list.forEach(dateStr => {
        const parts = dateStr.split('-');
        if (parts.length > 1) years.add("20" + parts[1]);
    });
    yearSelect.innerHTML = '<option value="all">Semua Tahun</option>';
    Array.from(years).sort().reverse().forEach(y => yearSelect.add(new Option(y, y)));
}

// --- MAP & LEGEND LOGIC ---
function applyMapFilter() {
    const s = document.getElementById('searchNama').value.toLowerCase();
    const u = document.getElementById('mapFilterUP3').value;
    const k = document.getElementById('mapFilterKota').value;
    const t = document.getElementById('mapFilterType').value;
    const list = document.getElementById('spkluList');
    list.innerHTML = '';
    
    let counts = { "FAST CHARGING": 0, "MEDIUM CHARGING": 0, "ULTRA FAST CHARGING": 0 };

    markers.forEach(m => {
        const d = m.data;
        const match = d.nama.toLowerCase().includes(s) && (u === 'all' || d.UP3 === u) && (k === 'all' || d.Kota === k) && (t === 'all' || d['TYPE CHARGE'] === t);
        if(match) {
            m.addTo(map);
            counts[d['TYPE CHARGE']] = (counts[d['TYPE CHARGE']] || 0) + 1;
            const div = document.createElement('div');
            div.className = 'list-item';
            div.innerHTML = `<b>${d.nama}</b>${d.UP3} - ${d.Kota}`;
            div.onclick = () => { map.setView([d.lat, d.lon], 15); m.openPopup(); };
            list.appendChild(div);
        } else { map.removeLayer(m); }
    });
    updateLegend(counts);
}

function updateLegend(counts) {
    if (legendControl) map.removeControl(legendControl);
    legendControl = L.control({ position: 'bottomright' });
    legendControl.onAdd = function() {
        const div = L.DomUtil.create('div', 'legend');
        div.innerHTML = `<b>Unit Tersedia</b>
            <img src="icon/fast.png"> Fast <span class="legend-count">${counts["FAST CHARGING"]} Unit</span><br>
            <img src="icon/mediumfast.png"> Medium <span class="legend-count">${counts["MEDIUM CHARGING"]} Unit</span><br>
            <img src="icon/ultrafast.png"> Ultra <span class="legend-count">${counts["ULTRA FAST CHARGING"]} Unit</span>`;
        return div;
    };
    legendControl.addTo(map);
}

// --- DASHBOARD & CHART LOGIC ---
function updateDashboard() {
    const geo = document.getElementById('evalFilterGeo').value, cat = document.getElementById('evalFilterCategory').value, type = document.getElementById('evalFilterChartType').value, time = document.getElementById('evalFilterTime').value;
    
    // SMART FILTER: Deteksi kolom terakhir yang berisi data > 0
    let lastDataIndex = -1;
    for (let i = db.date_list.length - 1; i >= 0; i--) {
        const header = db.date_list[i];
        const total = db.spklu_data.reduce((sum, s) => sum + (parseFloat(s[cat][header]?.toString().replace(',','.')) || 0), 0);
        if (total > 0) { lastDataIndex = i; break; }
    }
    if (lastDataIndex === -1) lastDataIndex = db.date_list.length - 1;

    let availableDates = db.date_list.slice(0, lastDataIndex + 1);
    let displayDates = (time === 'all') ? availableDates : availableDates.slice(-parseInt(time));
    const stations = db.spklu_data.filter(s => geo === 'all' || s.UP3 === geo || s.Kota === geo);

    const vals = displayDates.map(d => stations.reduce((acc, s) => acc + (parseFloat(s[cat][d]?.toString().replace(',','.')) || 0), 0));

    document.getElementById('totalValue').innerText = vals.reduce((a,b)=>a+b, 0).toLocaleString('id-ID') + (cat==='kwh'?' kWh':' Tx');
    document.getElementById('totalSPKLU').innerText = stations.length + " Unit";

    renderChart(type, displayDates, vals, cat.toUpperCase());

    // Siapkan data tabel
    filteredTableData = [];
    stations.forEach(s => displayDates.forEach(d => filteredTableData.push({ n: s.nama, u: s.UP3, ul: s.ULP, b: d, k: s.kwh[d]||0, t: s.tx[d]||0 })));
    filteredTableData.sort((a,b) => b.b.localeCompare(a.b));
    currentPage = 1; 
    renderTable();
}

function renderChart(type, labels, data, label) {
    const ctx = document.getElementById('mainChart').getContext('2d');
    if (currentChart) currentChart.destroy();
    const isLine = (type === 'line');

    currentChart = new Chart(ctx, {
        type: type,
        data: {
            labels: labels,
            datasets: [{
                label: label, data: data,
                backgroundColor: isLine ? 'rgba(0, 162, 233, 0.2)' : '#00A2E9',
                borderColor: '#0079C1',
                borderWidth: isLine ? 3 : 1,
                fill: isLine ? 'origin' : false,
                tension: 0.3, pointRadius: isLine ? 4 : 0
            }]
        },
        options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom' } } }
    });
}

function renderTable() {
    const selectedYear = document.getElementById('tableFilterYear').value;
    let dataForTable = filteredTableData;
    if (selectedYear !== 'all') {
        dataForTable = filteredTableData.filter(r => r.b.includes("-" + selectedYear.substring(2)));
    }

    const start = (currentPage - 1) * rowsPerPage;
    const pageData = dataForTable.slice(start, start + rowsPerPage);
    document.getElementById('tableBody').innerHTML = pageData.map(r => `<tr><td>${r.n}</td><td>${r.u} (${r.ul})</td><td>${r.b}</td><td>${r.k.toLocaleString('id-ID')}</td><td>${r.t.toLocaleString('id-ID')}</td></tr>`).join('');
    
    const totalPages = Math.ceil(dataForTable.length / rowsPerPage) || 1;
    document.getElementById('pageInfo').innerText = `Hal ${currentPage} dari ${totalPages}`;
    document.getElementById('prevBtn').disabled = (currentPage === 1);
    document.getElementById('nextBtn').disabled = (currentPage * rowsPerPage >= dataForTable.length);
}

fetchData();
