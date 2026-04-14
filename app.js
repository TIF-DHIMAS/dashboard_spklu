/**
 * app.js - Visualisasi Dashboard SPKLU
 * Mengambil data hasil perhitungan AHP & TOPSIS dari Python (JSON)
 */

async function initDashboard() {
    try {
        // Mengambil data JSON yang dihasilkan otomatis oleh skrip Python
        const response = await fetch('data_spklu.json');
        if (!response.ok) throw new Error('Data JSON tidak ditemukan. Pastikan Python script sudah berjalan.');
        
        const data = await response.json();

        renderMap(data);
        renderChart(data);
        renderTable(data);

    } catch (error) {
        console.error('Error loading dashboard:', error);
        document.body.innerHTML += `<div style="color:red; padding:20px;">Error: ${error.message}</div>`;
    }
}

function renderMap(data) {
    // Pusat peta: Kalimantan Barat
    const map = L.map('map').setView([-0.07, 109.38], 7);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    data.forEach(row => {
        // Warna marker berdasarkan transaksi (Ramai = Merah, Sepi = Hijau)
        const markerColor = row.RATA2TRANSAKSI >= 50 ? '#c62828' : '#2e7d32';
        
        // Ukuran marker berdasarkan skor TOPSIS
        const radius = row.score * 25;

        L.circleMarker([row.Latitude, row.Longitude], {
            radius: radius < 5 ? 5 : radius, // Ukuran minimal agar tetap terlihat
            fillColor: markerColor,
            color: "#fff",
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
        })
        .addTo(map)
        .bindPopup(`
            <strong>${row['Nama Stasiun']}</strong><br>
            Rata-rata Transaksi: ${row.RATA2TRANSAKSI}/bln<br>
            Skor TOPSIS: ${row.score.toFixed(4)}<br>
            <hr>
            <strong>Saran:</strong> ${row.REKOMENDASI}
        `);
    });
}

function renderChart(data) {
    const ctx = document.getElementById('chartTopsis').getContext('2d');
    
    // Ambil 10 teratas untuk grafik
    const topData = data.slice(0, 10);

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: topData.map(d => d['Nama Stasiun']),
            datasets: [{
                label: 'Skor Prioritas Relokasi (TOPSIS)',
                data: topData.map(d => d.score),
                backgroundColor: '#005aab',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true, max: 1 }
            }
        }
    });
}

function renderTable(data) {
    const tbody = document.querySelector('#recomTable tbody');
    tbody.innerHTML = ''; // Clear existing

    data.forEach(row => {
        let badgeClass = 'badge-optimal';
        if (row.REKOMENDASI.includes('TAMBAH')) badgeClass = 'badge-tambah';
        if (row.REKOMENDASI.includes('RELOKASI')) badgeClass = 'badge-relokasi';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${row['Nama Stasiun']}</strong></td>
            <td>${row.RATA2TRANSAKSI} unit/bln</td>
            <td>${row.score.toFixed(4)}</td>
            <td><span class="badge ${badgeClass}">${row.REKOMENDASI}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// Jalankan dashboard saat halaman dimuat
document.addEventListener('DOMContentLoaded', initDashboard);
