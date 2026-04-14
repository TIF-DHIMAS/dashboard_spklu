async function loadDashboard() {
    const response = await fetch('data_spklu.json');
    const data = await response.json();

    // 1. Leaflet Map
    const map = L.map('map').setView([-0.07, 109.38], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    data.forEach(d => {
        const color = d.RATA2TRANSAKSI >= 50 ? 'red' : 'green';
        L.circleMarker([d.Latitude, d.Longitude], {
            color: color, radius: d.score * 15, fillOpacity: 0.7
        }).addTo(map).bindPopup(`<b>${d['Nama Stasiun']}</b><br>Skor: ${d.score.toFixed(3)}<br>${d.REKOMENDASI}`);
    });

    // 2. Chart.js
    const ctx = document.getElementById('myChart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.slice(0, 10).map(d => d['Nama Stasiun']),
            datasets: [{
                label: 'Top 10 Skor Prioritas (TOPSIS)',
                data: data.slice(0, 10).map(d => d.score),
                backgroundColor: '#005aab'
            }]
        }
    });

    // 3. Table Recommendation
    const tbody = document.querySelector('#recomTable tbody');
    data.forEach(d => {
        const row = `<tr>
            <td>${d['Nama Stasiun']}</td>
            <td>${d.RATA2TRANSAKSI}</td>
            <td>${d.score.toFixed(4)}</td>
            <td>${d.REKOMENDASI}</td>
        </tr>`;
        tbody.innerHTML += row;
    });
}

loadDashboard();
