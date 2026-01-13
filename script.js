// Masukkan Link Google Sheets (Format CSV) Anda di sini
const URL_SPKLU = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=650444376&single=true&output=csv';
const URL_TX = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=2044243535&single=true&output=csv';
const URL_KWH = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=1058603642&single=true&output=csv';

let map, markers = [], currentChart = null;
let db = { spklu_data: [], up3_list: [], kota_list: [], date_list: [] };
let filteredTableData = [], currentPage = 1, rowsPerPage = 10;

async function fetchData() {
    const fetchCsv = (url) => new Promise((resolve, reject) => {
        Papa.parse(url, {
            download: true,
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true,
            complete: (results) => resolve(results.data),
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
        console.error("Error:", error);
        alert("Gagal memuat data. Periksa konsol browser untuk detail.");
    }
}

function processData(spklu, tx, kwh) {
    // 1. Ambil daftar tanggal (Kolom setelah UP3, ULP, dan Nama Stasiun)
    // Kita ambil dari header sheet TX mulai dari kolom ke-4 (indeks 3)
    const headers = Object.keys(tx[0]);
    const dateKeys = headers.filter(k => 
        k !== 'UP3' && k !== 'ULP' && k !== 'Nama Stasiun'
    );

    const kotaSet = new Set();
    const up3Set = new Set();

    db.spklu_data = spklu.filter(s => s['Nama Stasiun']).map(s => {
        const stasiunName = s['Nama Stasiun'] ? s['Nama Stasiun'].trim() : "";
        
        // Cari data transaksi & kwh yang cocok berdasarkan Nama Stasiun
        const txMatch = tx.find(t => t['Nama Stasiun'] && t['Nama Stasiun'].trim() === stasiunName) || {};
        const kwhMatch = kwh.find(k => k['Nama Stasiun'] && k['Nama Stasiun'].trim() === stasiunName) || {};

        if (s.Kota) kotaSet.add(s.Kota.trim());
        if (s.UP3) up3Set.add(s.UP3.trim());

        return {
            nama: stasiunName,
            alamat: s.Alamat,
            lat: parseFloat(s.Latitude),
            lon: parseFloat(s.Longitude),
            kota: s.Kota ? s.Kota.trim() : "N/A",
            up3: s.UP3 ? s.UP3.trim() : "N/A",
            ulp: s.ULP ? s.ULP.trim() : "N/A",
            type: s['TYPE CHARGE'],
            kw: s.KW,
            transactions: txMatch, 
            kwh: kwhMatch
        };
    });

    db.date_list = dateKeys;
    db.up3_list = Array.from(up3Set).sort();
    db.kota_list = Array.from(kotaSet).sort();
    
    console.log("Data berhasil diproses. Kolom tanggal terdeteksi:", db.date_list);
}
// ... (Fungsi initMap, populateFilters, setupEventListeners sama seperti sebelumnya) ...

function updateDashboard() {
    const geo = document.getElementById('evalFilterGeo').value;
    const category = document.getElementById('evalFilterCategory').value; // 'kwh' atau 'transactions'
    const chartType = document.getElementById('evalFilterChartType').value;
    const timeRange = document.getElementById('evalFilterTime').value;

    let displayDates = (timeRange === 'all') ? db.date_list : db.date_list.slice(-parseInt(timeRange));
    const filteredStations = db.spklu_data.filter(s => geo === 'all' || s.up3 === geo || s.kota === geo);

    // Hitung nilai bulanan: Jika kategori kwh maka ambil dari s.kwh, jika transaksi ambil s.transactions
    const valuesPerMonth = displayDates.map(date => {
        return filteredStations.reduce((sum, s) => {
            const val = s[category][date] || 0;
            return sum + val;
        }, 0);
    });

    const grandTotal = valuesPerMonth.reduce((a, b) => a + b, 0);
    const unit = (category === 'kwh') ? ' kWh' : ' Tx';
    
    document.getElementById('labelKomulatif').innerText = `Total Komulatif (${category.toUpperCase()})`;
    document.getElementById('totalValue').innerText = grandTotal.toLocaleString('id-ID') + unit;
    document.getElementById('totalSPKLU').innerText = filteredStations.length + " Lokasi Terpilih";

    renderChart(chartType, displayDates, valuesPerMonth, category.toUpperCase());

    // Update Tabel Detail
    filteredTableData = [];
    filteredStations.forEach(s => {
        displayDates.forEach(date => {
            filteredTableData.push({
                nama: s.nama,
                up3: s.up3,
                ulp: s.ulp,
                bulan: date,
                kwh: s.kwh[date] || 0,
                tx: s.transactions[date] || 0
            });
        });
    });
    
    filteredTableData.sort((a,b) => b.bulan.localeCompare(a.bulan));
    currentPage = 1;
    renderTable();
}

// Update Render Table untuk menyertakan ULP
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

// Lanjutkan dengan fungsi renderChart dan sisa kode lainnya...
fetchData();
