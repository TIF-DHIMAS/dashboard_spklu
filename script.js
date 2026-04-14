const URL_TOPSIS = "https://raw.githubusercontent.com/USERNAME/REPO/main/data/topsis.json";

let map;
let markersLayer = L.layerGroup();
let topsisRaw = [];

async function fetchTopsis() {
    const res = await fetch(URL_TOPSIS);
    topsisRaw = await res.json();
}

// ================= MAP =================
function initMap() {
    map = L.map('map').setView([-0.02, 109.34], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    markersLayer.addTo(map);
}

// dummy koordinat
function getCoord(nama) {
    return [-0.02 + Math.random()/10, 109.34 + Math.random()/10];
}

function getColor(kat) {
    if (kat === "Optimal") return "green";
    if (kat === "Evaluasi") return "orange";
    return "red";
}

function renderMap(filter="all") {
    markersLayer.clearLayers();

    topsisRaw.forEach(d => {
        if(filter !== "all" && d.kategori !== filter) return;

        const coord = getCoord(d.nama);

        const marker = L.circleMarker(coord, {
            radius: 8,
            color: getColor(d.kategori)
        });

        marker.bindPopup(`
            <b>${d.nama}</b><br>
            Skor: ${d.skor}<br>
            Kategori: ${d.kategori}
        `);

        markersLayer.addLayer(marker);
    });
}

// ================= KPI =================
function renderKPI() {
    document.getElementById("total").innerText = topsisRaw.length;

    document.getElementById("optimal").innerText =
        topsisRaw.filter(d => d.kategori === "Optimal").length;

    document.getElementById("evaluasi").innerText =
        topsisRaw.filter(d => d.kategori === "Evaluasi").length;

    document.getElementById("critical").innerText =
        topsisRaw.filter(d => d.kategori === "Critical").length;
}

// ================= CHART =================
function renderChart() {
    const labels = topsisRaw.map(d => d.nama);
    const data = topsisRaw.map(d => d.skor);

    new Chart(document.getElementById("chart"), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Skor TOPSIS',
                data: data
            }]
        }
    });
}

// ================= TABLE =================
function renderTable() {
    let html = "";

    topsisRaw
        .sort((a,b)=>b.skor-a.skor)
        .forEach((d,i)=>{
            html += `
                <tr>
                    <td>${i+1}</td>
                    <td>${d.nama}</td>
                    <td>${d.skor}</td>
                    <td>${d.kategori}</td>
                </tr>
            `;
        });

    document.getElementById("table").innerHTML = html;
}

// ================= FILTER =================
function setupFilter() {
    document.getElementById("filter").addEventListener("change", (e)=>{
        renderMap(e.target.value);
    });
}

// ================= INIT =================
async function init() {
    await fetchTopsis();
    initMap();
    renderMap();
    renderKPI();
    renderChart();
    renderTable();
    setupFilter();
}

init();
