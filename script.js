const URLOLAH = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=1309571461&single=true&output=csv';

// 1. Parameter AHP (Matriks Perbandingan Berpasangan)
// Urutan: [Rata2Trans, KBLBB, Kapasitas, Biaya, Umur]
const bobotAHP = [0.456, 0.262, 0.158, 0.082, 0.042]; // Hasil hitung konsisten CR < 0.1

async function initDashboard() {
    const response = await fetch(URLOLAH);
    const csvText = await response.text();
    
    // Parse CSV ke JSON
    const results = Papa.parse(csvText, { header: true, dynamicTyping: true });
    let data = results.data.filter(row => row['Nama Stasiun']); // Bersihkan baris kosong

    // 2. Hitung TOPSIS
    data = hitungTopsis(data, bobotAHP);

    // 3. Render Map
    renderMap(data);

    // 4. Render Chart
    renderChart(data);

    // 5. Render Tabel
    renderTable(data);
}

function hitungTopsis(data, w) {
    const kriteria = ['RATA2TRANSAKSI', 'KBLBB', 'KAPASITAS', 'BIAYA', 'UMUR'];
    const isBenefit = [true, true, true, false, false];

    // Normalisasi & Terbobot
    let pembagi = kriteria.map(k => Math.sqrt(data.reduce((acc, row) => acc + Math.pow(row[k] || 0, 2), 0)));
    
    let terbobot = data.map(row => {
        return kriteria.map((k, i) => ((row[k] || 0) / pembagi[i]) * w[i]);
    });

    // Solusi Ideal
    let ap = kriteria.map((_, i) => isBenefit[i] ? Math.max(...terbobot.map(r => r[i])) : Math.min(...terbobot.map(r => r[i])));
    let an = kriteria.map((_, i) => isBenefit[i] ? Math.min(...terbobot.map(r => r[i])) : Math.max(...terbobot.map(r => r[i])));

    // Jarak & Skor Akhir
    return data.map((row, idx) => {
        let dp = Math.sqrt(terbobot[idx].reduce((acc, val, i) => acc + Math.pow(val - ap[i], 2), 0));
        let dn = Math.sqrt(terbobot[idx].reduce((acc, val, i) => acc + Math.pow(val - an[i], 2), 0));
        row.score = dn / (dp + dn);
        return row;
    }).sort((a, b) => b.score - a.score);
}

function renderMap(data) {
    const map = L.map('map').setView([-0.07, 109.38], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    data.forEach(row => {
        const markerColor = row.RATA2TRANSAKSI >= 50 ? 'red' : 'green';
        L.circleMarker([row.Latitude, row.Longitude], {
            color: markerColor,
            radius: row.score * 20,
            fillOpacity: 0.8
        }).addTo(map).bindPopup(`<b>${row['Nama Stasiun']}</b><br>Skor: ${row.score.toFixed(4)}`);
    });
}

function renderTable(data) {
    const tbody = document.querySelector('#tabelRekomendasi tbody');
    // Cari kandidat donor (skor terendah)
    const donorPool = data.filter(r => r.RATA2TRANSAKSI < 10).reverse();

    data.forEach(row => {
        let rekomendasi = "Optimal";
        let styleClass = "status-aman";

        if (row.RATA2TRANSAKSI >= 50) {
            const unitDonor = donorPool.shift();
            rekomendasi = `TAMBAH UNIT (Relokasi dari ${unitDonor ? unitDonor['Nama Stasiun'] : 'Pengadaan Baru'})`;
            styleClass = "status-tambah";
        }

        tbody.innerHTML += `<tr>
            <td>${row['Nama Stasiun']}</td>
            <td>${row.RATA2TRANSAKSI}</td>
            <td>${row.score.toFixed(4)}</td>
            <td class="${styleClass}">${rekomendasi}</td>
        </tr>`;
    });
}

function renderChart(data) {
    const ctx = document.getElementById('chartTopsis').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.slice(0, 10).map(r => r['Nama Stasiun']),
            datasets: [{
                label: '10 Besar Skor Kelayakan Relokasi (TOPSIS)',
                data: data.slice(0, 10).map(r => r.score),
                backgroundColor: '#005aab'
            }]
        }
    });
}

initDashboard();
