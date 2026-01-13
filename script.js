// LINK CSV ANDA
const URL_SPKLU = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=650444376&single=true&output=csv';
const URL_TX = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=2044243535&single=true&output=csv';
const URL_KWH = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=1058603642&single=true&output=csv';

let map, markers = [], currentChart = null;
let db = { spklu_data: [], up3_list: [], kota_list: [], date_list: [] };
let filteredTableData = [], currentPage = 1, rowsPerPage = 10;

// Fungsi pembersih header agar tidak error jika ada karakter aneh dari Google
const cleanKey = (k) => k ? k.replace(/^\ufeff/g, "").trim() : "";

async function fetchData() {
    console.log("--- STEP 1: Memulai Fetch Data ---");
    const fetchCsv = (url, name) => new Promise((resolve, reject) => {
        Papa.parse(url, {
            download: true,
            header: true,
            skipEmptyLines: 'greedy',
            transformHeader: cleanKey,
            complete: (res) => {
                console.log(`Berhasil memuat sheet: ${name} (${res.data.length} baris)`);
                resolve(res.data);
            },
            error: (err) => {
                console.error(`Gagal memuat sheet ${name}:`, err);
                reject(err);
            }
        });
    });

    try {
        const [rawSpklu, rawTx, rawKwh] = await Promise.all([
            fetchCsv(URL_SPKLU, "SPKLU"),
            fetchCsv(URL_TX, "Transaksi"),
            fetchCsv(URL_KWH, "kWh")
        ]);

        console.log("--- STEP 2: Memproses Data ---");
        processData(rawSpklu, rawTx, rawKwh);
        
        console.log("--- STEP 3: Inisialisasi Aplikasi ---");
        initApp();
        
    } catch (error) {
        console.error("CRITICAL ERROR:", error);
        document.body.innerHTML = `<h2 style='color:red; padding:50px;'>Gagal Memuat Data: ${error.message}<br>Cek Console (F12) untuk detail.</h2>`;
    }
}

function processData(spklu, tx, kwh) {
    if (!tx || tx.length === 0) throw new Error("Data Transaksi Kosong");

    // Ambil header tanggal (Kolom selain UP3, ULP, Nama Stasiun)
    const headers = Object.keys(tx[0]);
    const dateKeys = headers.filter(k => 
        k !== 'UP3' && k !== 'ULP' && k !== 'Nama Stasiun'
    );
    console.log("Kolom Tanggal Ditemukan:", dateKeys);

    const kotaSet = new Set();
    const up3Set = new Set();

    db.spklu_data = spklu.filter(s => s['Nama Stasiun']).map(s => {
        const name = s['Nama Stasiun'].toString().trim();
        
        // Cari baris yang cocok di sheet lain
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
    
    console.log("Proses Data Berhasil. SPKLU Terdaftar:", db.spklu_data.length);
}

// Tambahkan sisa fungsi (initMap, populateFilters, dll) di bawah sini...
// Pastikan tidak ada script error di fungsi-fungsi tersebut.
