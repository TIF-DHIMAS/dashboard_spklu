// 1. DAFTAR LINK GOOGLE SHEETS (PUBLISH AS CSV)
const URL_SPKLU = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=650444376&single=true&output=csv';
const URL_TX = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=2044243535&single=true&output=csv';
const URL_KWH = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=1058603642&single=true&output=csv';

let map, markers = [], currentChart = null;
let db = { spklu_data: [], up3_list: [], kota_list: [], date_list: [] };
let filteredTableData = [], currentPage = 1, rowsPerPage = 10;

// Fungsi membersihkan karakter aneh pada header (seperti tanda BOM dari Google Sheets)
const cleanKey = (k) => k ? k.replace(/^\ufeff/g, "").trim() : "";

// --- FUNGSI AMBIL DATA ---
async function fetchData() {
    const fetchCsv = (url) => new Promise((resolve, reject) => {
        Papa.parse(url, {
            download: true,
            header: true,
            skipEmptyLines: 'greedy',
            transformHeader: cleanKey,
            complete: (res) => resolve(res.data),
            error: (err) => reject(err)
        });
    });

    try {
        const [rawSpklu, rawTx, rawKwh] = await Promise.all([
            fetchCsv(URL_SPKLU),
            fetchCsv(URL_TX),
            fetchCsv(URL_KWH)
        ]);
        
        processData(rawSpklu, rawTx, rawKwh);
        initApp(); 
    } catch (error) {
        console.error("Gagal memuat data:", error);
    }
}

// --- FUNGSI OLAH DATA ---
function processData(spklu, tx, kwh) {
    if (!tx || tx.length === 0) return;

    // Ambil daftar tanggal (Header selain UP3, ULP, dan Nama Stasiun)
    const allHeaders = Object.keys(tx[0]);
    const dateKeys = allHeaders.filter(k => 
        k !== 'UP3' && k !== 'ULP' && k !== 'Nama Stasiun'
    );

    const kotaSet = new Set();
    const up3Set = new Set();

    db.spklu_data = spklu.filter(s => s['Nama Stasiun']).map(s => {
        const stasiunName = s['Nama Stasiun'].toString().trim();
        
        // Cari baris yang cocok di sheet Transaksi dan kWh
        const txMatch = tx.find(t => t['Nama Stasiun'] && t['Nama Stasiun'].toString().trim() === stasiunName) || {};
        const kwhMatch = kwh.find(k => k['Nama Stasiun'] && k['Nama Stasiun'].toString().trim() === stasiunName) || {};

        if (s.Kota) kotaSet.add(s.Kota.trim());
        if (s.UP3) up3Set.add(s.UP3.toString().trim());

        return {
            nama: stasiunName,
            alamat: s.Alamat,
            lat: parseFloat(s.Latitude),
            lon: parseFloat(s.Longitude),
            kota: s.Kota ? s.Kota.trim() : "N/A",
            up3: s.UP3 ? s.UP3.toString().trim() : "N/A",
            ulp: s.ULP ? s.ULP.toString().trim() : "N/A",
            type: s['TYPE CHARGE'],
            kw: s.KW,
            // Simpan data bulanan ke dalam kategori masing-masing
            transactions: txMatch, 
            kwh: kwhMatch
        };
    });

    db.date_list = dateKeys;
    db.up3_list = Array.from(up3Set).sort();
    db.kota_list = Array.from(kotaSet).sort();
}

// --- INISIALISASI TAMPILAN ---
function initApp() {
    // Inisialisasi Peta (Kalbar)
    map = L.map('map', { zoomControl: false }).setView([-0.03, 109.33], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    db.spklu_data.forEach(d => {
        if (!isNaN(d.lat) && !isNaN(d.lon)) {
            const m = L.marker([d.lat, d.lon]).addTo(map)
                .bindPopup(`<b>${d.nama}</b><br>${d.alamat}<br>Tipe: ${d.type}`);
            m.data = d;
            markers.push(m);
        }
    });

    // Isi Dropdown Filter
    const optUP3 = document.getElementById('optUP3');
    const optKota = document.getElementById('optKota');
    const mapKota = document.getElementById('mapFilterKota');

    db.kota_list.forEach(k => {
        const option = new Option(k, k);
        optKota.add(option.cloneNode(true));
        mapKota.add(option.cloneNode(true));
    });
    db.up3_list.forEach(u => optUP3.add(new Option("UP3 " + u, u)));

    setupEventListeners();
    updateDashboard(); // Load data dashboard pertama kali
    applyMapFilter(); // Load list map pertama kali
}

function setupEventListeners() {
    document.getElementById('searchNama').addEventListener('input', applyMapFilter);
    ['mapFilterKota', 'mapFilterType', 'evalFilterGeo', 'evalFilterCategory', 'evalFilterChartType', 'evalFilterTime'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('change', id.includes('map') ? applyMapFilter : updateDashboard);
    });
    document.getElementById('prevBtn').onclick = () => { if(currentPage > 1) { currentPage--; renderTable(); } };
    document.getElementById('nextBtn').onclick = () => { if(currentPage * rowsPerPage < filteredTableData.length) { currentPage++; renderTable(); } };
}

// --- LOGIKA FILTER PETA ---
function applyMapFilter() {
    const search = document.getElementById('searchNama').value.toLowerCase();
    const kota = document.getElementById('mapFilterKota').value;
    const type = document.getElementById('mapFilterType').value;
    const listEl = document.getElementById('spkluList');
    listEl.innerHTML = '';

    markers.forEach(m => {
        const d = m.data;
        const match = d.nama.toLowerCase().includes(search) && 
                      (kota === 'all' || d.kota === kota) && 
                      (type === 'all' || d.type === type);
        
        if(match) {
            m.addTo(map);
            const item = document.createElement('div');
            item.className = 'list-item';
            item.innerHTML = `<b>${d.nama}</b> ${d.kota}`;
            item.onclick = () => { map.setView([d.lat, d.lon], 14); m.openPopup(); };
            listEl.appendChild(item);
        } else {
            map.removeLayer(m);
        }
    });
}

// --- LOGIKA EVALUASI (GRAFIK & TABEL) ---
function updateDashboard() {
    const geo = document.getElementById('evalFilterGeo').value;
    const category = document.getElementById('evalFilterCategory').value; // 'kwh' atau 'transactions'
    const chartType = document.getElementById('evalFilterChartType').value;
    const timeRange = document.getElementById('evalFilterTime').value;

    // Filter Waktu
    let displayDates = (timeRange === 'all') ? db.date_list : db.date_list.slice(-parseInt(timeRange));
    
    // Filter Wilayah
    const filteredStations = db.spklu_data.filter(s => geo === 'all' || s.up3 === geo || s.kota === geo);

    // Hitung Nilai Bulanan untuk Grafik
    const valuesPerMonth = displayDates.map(date => {
        return filteredStations.reduce((sum, s) => {
            const val = s[category][date];
            // Konversi ke angka, tangani format desimal Indonesia (koma) jika ada
            const num = typeof val === 'string' ? parseFloat(val.replace(',', '.')) : parseFloat(val);
            return sum + (num || 0);
        }, 0);
    });

    // Update Ringkasan Komulatif
    const grandTotal = valuesPerMonth.reduce((a, b) => a + b, 0);
    const unit = (category === 'kwh') ? ' kWh' : ' Tx';
    document.getElementById('labelKomulatif').innerText = `Total Komulatif (${category.toUpperCase()})`;
    document.getElementById('totalValue').innerText = grandTotal.toLocaleString('id-ID') + unit;
    document.getElementById('totalSPKLU').innerText = filteredStations.length + " Lokasi Terpilih";

    renderChart(chartType, displayDates, valuesPerMonth, category.toUpperCase());

    // Siapkan Data Tabel Detail
    filteredTableData = [];
    filteredStations.forEach(s => {
        displayDates.forEach(date => {
            const kVal = typeof s.kwh[date] === 'string' ? parseFloat(s.kwh[date].replace(',','.')) : parseFloat(s.kwh[date]);
            const tVal = typeof s.transactions[date] === 'string' ? parseFloat(s.transactions[date].replace(',','.')) : parseFloat(s.transactions[date]);
            filteredTableData.push({
                nama: s.nama, up3: s.up3, ulp: s.ulp, bulan: date,
                kwh: kVal || 0, tx: tVal || 0
            });
        });
    });
    
    // Urutkan berdasarkan bulan terbaru
    filteredTableData.sort((a,b) => b.bulan.localeCompare(a.bulan));
    currentPage = 1;
    renderTable();
}

function renderChart(type, labels, data, label) {
    const ctx = document.getElementById('mainChart').getContext('2d');
    if(currentChart) currentChart.destroy();
    currentChart = new Chart(ctx, {
        type: type,
        data: {
            labels,
            datasets: [{ 
                label, data, 
                borderColor: '#1e88e5', 
                backgroundColor: 'rgba(30, 136, 229, 0.2)', 
                fill: true, tension: 0.3 
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { legend: { display: true } }
        }
    });
}

function renderTable() {
    const start = (currentPage - 1) * rowsPerPage;
    const pageData = filteredTableData.slice(start, start + rowsPerPage);
    
    document.getElementById('tableBody').innerHTML = pageData.map(r => `
        <tr>
            <td>${r.nama}</td>
            <td>${r.up3} (${r.ulp})</td>
            <td>${r.bulan}</td>
            <td>${r.kwh.toLocaleString('id-ID')}</td>
            <td>${r.tx.toLocaleString('id-ID')}</td>
        </tr>
    `).join('');

    document.getElementById('pageInfo').innerText = `Halaman ${currentPage} dari ${Math.ceil(filteredTableData.length / rowsPerPage)}`;
    document.getElementById('prevBtn').disabled = (currentPage === 1);
    document.getElementById('nextBtn').disabled = (currentPage * rowsPerPage >= filteredTableData.length);
}

// Jalankan pengambilan data pertama kali
fetchData();
