// 1. LINK CSV GOOGLE SHEETS
const URL_SPKLU = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=650444376&single=true&output=csv';
const URL_TX = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=2044243535&single=true&output=csv';
const URL_KWH = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=1058603642&single=true&output=csv';

let map, markers = [], currentChart = null;
let db = { spklu_data: [], up3_list: [], kota_list: [], date_list: [] };
let filteredTableData = [], currentPage = 1, rowsPerPage = 10;

// Fungsi membersihkan karakter aneh pada header CSV
const cleanKey = (key) => key ? key.replace(/^\ufeff/g, "").trim() : "";

async function fetchData() {
    console.log("Memulai fetch data...");
    const fetchCsv = (url) => new Promise((resolve, reject) => {
        Papa.parse(url, {
            download: true,
            header: true,
            skipEmptyLines: 'greedy',
            transformHeader: (h) => cleanKey(h), // Membersihkan header otomatis
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

        console.log("Data diterima, memproses...");
        processData(rawSpklu, rawTx, rawKwh);
        initApp();
        console.log("Aplikasi Berhasil Dimuat");
    } catch (error) {
        console.error("Gagal Fetch:", error);
        alert("Gagal memuat data dari Google Sheets. Cek koneksi internet.");
    }
}

function processData(spklu, tx, kwh) {
    if (!tx || tx.length === 0) return;

    // Ambil daftar tanggal (Kolom selain UP3, ULP, Nama Stasiun)
    const headers = Object.keys(tx[0]);
    const dateKeys = headers.filter(k => 
        k !== 'UP3' && k !== 'ULP' && k !== 'Nama Stasiun'
    );

    const kotaSet = new Set();
    const up3Set = new Set();

    db.spklu_data = spklu.filter(s => s['Nama Stasiun']).map(s => {
        const name = s['Nama Stasiun'].toString().trim();
        
        // Pencocokan data antar sheet
        const txMatch = tx.find(t => t['Nama Stasiun'] && t['Nama Stasiun'].toString().trim() === name) || {};
        const kwhMatch = kwh.find(k => k['Nama Stasiun'] && k['Nama Stasiun'].toString().trim() === name) || {};

        if (s.Kota) kotaSet.add(s.Kota.trim());
        if (s.UP3) up3Set.add(s.UP3.toString().trim());

        return {
            nama: name,
            alamat: s.Alamat,
            lat: parseFloat(s.Latitude),
            lon: parseFloat(s.Longitude),
            kota: s.Kota ? s.Kota.trim() : "N/A",
            up3: s.UP3 ? s.UP3.toString().trim() : "N/A",
            ulp: s.ULP ? s.ULP.toString().trim() : "N/A",
            type: s['TYPE CHARGE'],
            kw: s.KW,
            transactions: txMatch, 
            kwh: kwhMatch
        };
    });

    db.date_list = dateKeys;
    db.up3_list = Array.from(up3Set).sort();
    db.kota_list = Array.from(kotaSet).sort();
}

// Fungsi Sisanya (initMap, populateFilters, updateDashboard, dll) tetap sama
// Pastikan memanggil initApp() hanya setelah data diproses.
