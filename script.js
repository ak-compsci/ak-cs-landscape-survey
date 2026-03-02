let surveyData = null;

const districtColors = [
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
    '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#fabed4',
    '#469990', '#dcbeff', '#9A6324', '#fffac8', '#800000',
    '#aaffc3', '#808000', '#ffd8b1', '#000075', '#a9a9a9',
    '#e6beff', '#1ce6ff', '#ff34ff', '#ff6eb4', '#ffb347',
    '#87ceeb', '#dda0dd', '#98fb98', '#ffa07a', '#20b2aa',
    '#778899', '#b0c4de', '#ffcc99', '#cc99ff', '#99ccff',
    '#ff9999', '#66cdaa', '#deb887', '#5f9ea0', '#7b68ee',
    '#ff7f50', '#6495ed', '#dc143c', '#00ced1', '#9400d3',
    '#ff1493', '#00bfff', '#696969', '#1e90ff', '#b22222',
    '#228b22', '#daa520', '#adff2f', '#ff69b4'
];

fetch('survey_dashboard_data.json')
    .then(res => res.json())
    .then(data => { surveyData = data; initCharts(data.statewide); loadMap(); })
    .catch(err => { console.error(err); loadMap(); });

function getDistrictStyle(feature, index) {
    const name = feature.properties.EntityName;
    const hasSurvey = surveyData && surveyData.districts[name];
    const csOffered = hasSurvey && surveyData.districts[name].CS_Offered.includes("Yes");
    let fillColor, fillOpacity, borderColor;
    if (csOffered) {
        fillColor = districtColors[index % districtColors.length];
        fillOpacity = 0.55;
        borderColor = '#1d3557';
    } else {
        fillColor = '#fca5a5';
        fillOpacity = 0.45;
        borderColor = '#94a3b8';
    }
    return {
        fillColor: fillColor,
        weight: 1.5,
        opacity: 1,
        color: borderColor,
        fillOpacity: fillOpacity
    };
}

function loadMap() {
    const map = L.map('leaflet-map', {
        center: [64.2, -152],
        zoom: 4,
        zoomControl: true,
        minZoom: 3,
        maxZoom: 10
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 10
    }).addTo(map);

    fetch('combined_districts.json')
        .then(res => res.json())
        .then(geojsonData => {
            let index = 0;
            let selectedLayer = null;
            const geoLayer = L.geoJSON(geojsonData, {
                style: function (feature) {
                    return getDistrictStyle(feature, feature._colorIndex);
                },
                onEachFeature: function (feature, layer) {
                    feature._colorIndex = index++;
                    layer.setStyle(getDistrictStyle(feature, feature._colorIndex));

                    const name = feature.properties.EntityName || 'Unknown District';
                    const hasSurvey = surveyData && surveyData.districts[name];

                    let tooltipContent = `<strong>${name}</strong>`;
                    if (hasSurvey) {
                        const d = surveyData.districts[name];
                        const offered = d.CS_Offered.includes("Yes") ? "Yes" : d.CS_Offered.includes("No") ? "No" : "Unknown";
                        tooltipContent += `<br>CS Offered: ${offered}`;
                    } else {
                        tooltipContent += `<br><em>No survey data</em>`;
                    }
                    layer.bindTooltip(tooltipContent, { sticky: true });

                    layer.on('mouseover', function () {
                        if (layer !== selectedLayer) {
                            layer.setStyle({ weight: 3, color: '#334155', fillOpacity: 0.75 });
                        }
                    });
                    layer.on('mouseout', function () {
                        if (layer !== selectedLayer) {
                            layer.setStyle(getDistrictStyle(feature, feature._colorIndex));
                        }
                    });
                    layer.on('click', function (e) {
                        L.DomEvent.stopPropagation(e);
                        geoLayer.eachLayer(function (l) {
                            l.setStyle(getDistrictStyle(l.feature, l.feature._colorIndex));
                        });
                        selectedLayer = layer;
                        layer.setStyle({ weight: 3, color: '#334155', fillOpacity: 0.75 });
                        layer.bringToFront();
                        showDistrictData(name);
                    });
                }
            }).addTo(map);

            map.setView([64.2, -152], 4);
        })
        .catch(err => console.error('Error loading GeoJSON:', err));
}

function initCharts(statewideData) {
    const ctxPie = document.getElementById('pieChart').getContext('2d');
    const offeredData = statewideData.CS_Offered_Counts;
    const totalDistricts = statewideData.Total_Districts;
    const surveyedDistricts = statewideData.Surveyed_Districts;
    const notSurveyed = totalDistricts - surveyedDistricts;

    // Categorize survey responses
    let yesCount = 0, noCount = 0, unsureCount = 0;
    Object.entries(offeredData).forEach(([k, v]) => {
        if (k.includes('Yes')) yesCount += v;
        else if (k.includes('No')) noCount += v;
        else unsureCount += v;
    });

    const pieLabels = ['Yes', 'No', 'Unsure', 'Not Yet Surveyed'];
    const pieValues = [yesCount, noCount, unsureCount, notSurveyed];
    const pct = (n) => ((n / totalDistricts) * 100).toFixed(1);

    new Chart(ctxPie, {
        type: 'doughnut',
        data: {
            labels: pieLabels,
            datasets: [{ data: pieValues, backgroundColor: ['#10b981', '#ef4444', '#f59e0b', '#d1d5db'] }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const val = context.raw;
                            return ` ${context.label}: ${val} of ${totalDistricts} districts (${pct(val)}%)`;
                        }
                    }
                }
            }
        }
    });

    // Populate subtitle
    const subtitleEl = document.getElementById('pie-subtitle');
    if (subtitleEl) {
        subtitleEl.textContent = `${surveyedDistricts} of ${totalDistricts} districts surveyed — ${notSurveyed} not yet surveyed`;
    }

    // Enrollment by grade band stacked bar
    const bandLabels = ['K-2', '3-5', '6-8', '9-12'];
    const csEnr = statewideData.CS_Enrollment_By_Band;
    const noCsEnr = statewideData.No_CS_Enrollment_By_Band;
    const ctxEnroll = document.getElementById('enrollChart').getContext('2d');
    new Chart(ctxEnroll, {
        type: 'bar',
        data: {
            labels: bandLabels,
            datasets: [
                { label: 'CS Offered', data: bandLabels.map(b => csEnr[b] || 0), backgroundColor: '#10b981', borderRadius: 4 },
                { label: 'No CS', data: bandLabels.map(b => noCsEnr[b] || 0), backgroundColor: '#fca5a5', borderRadius: 4 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: 'Students' } } },
            plugins: { legend: { position: 'top' } }
        }
    });

    const ctxBar = document.getElementById('barChart').getContext('2d');
    const barrierData = statewideData.Top_Barriers;
    new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: Object.keys(barrierData).map(l => l.length > 30 ? l.substring(0, 30) + "..." : l),
            datasets: [{ label: 'Mentions', data: Object.values(barrierData), backgroundColor: '#3b82f6', borderRadius: 4 }]
        },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } } }
    });
}

let districtEnrollChartInstance = null;

function showDistrictData(districtName) {
    document.getElementById('panel-title').innerText = districtName;
    document.getElementById('reset-btn').classList.remove('hidden');

    const detailsDiv = document.getElementById('district-details');
    const chartsDiv = document.getElementById('statewide-charts');

    // Destroy previous district chart
    if (districtEnrollChartInstance) { districtEnrollChartInstance.destroy(); districtEnrollChartInstance = null; }

    if (!surveyData || !surveyData.districts[districtName]) {
        detailsDiv.classList.remove('hidden'); chartsDiv.classList.add('hidden');
        document.getElementById('dt-offered').innerText = "No Data";
        document.getElementById('dt-required').innerText = "N/A";
        document.getElementById('dt-enrollment').innerText = "N/A";
        document.getElementById('dt-gradebands').innerText = "N/A";
        document.getElementById('dt-barriers').innerHTML = "<li>No survey response on record.</li>";
        return;
    }

    const data = surveyData.districts[districtName];
    detailsDiv.classList.remove('hidden'); chartsDiv.classList.add('hidden');

    document.getElementById('dt-offered').innerText = data.CS_Offered.includes("Yes") ? "Yes" : "No";
    document.getElementById('dt-required').innerText = data.CS_Required;
    document.getElementById('dt-enrollment').innerText = data.Enrollment;
    document.getElementById('dt-gradebands').innerText = data.CS_Grade_Bands.length > 0 ? data.CS_Grade_Bands.join(', ') : 'None';

    // District enrollment bar chart with CS grade bands highlighted
    const bandLabels = ['K-2', '3-5', '6-8', '9-12'];
    const enr = data.Enrollment_By_Band;
    const csColors = bandLabels.map(b => data.CS_Grade_Bands.includes(b) ? '#10b981' : '#fca5a5');
    const ctx = document.getElementById('districtEnrollChart').getContext('2d');
    districtEnrollChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: bandLabels,
            datasets: [{
                label: 'Students',
                data: bandLabels.map(b => enr[b] || 0),
                backgroundColor: csColors,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, title: { display: true, text: 'Students' } } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        afterLabel: function (context) {
                            const band = bandLabels[context.dataIndex];
                            return data.CS_Grade_Bands.includes(band) ? '(CS offered at this level)' : '(No CS at this level)';
                        }
                    }
                }
            }
        }
    });

    const barriersUl = document.getElementById('dt-barriers');
    barriersUl.innerHTML = "";
    if (data.Barriers.length > 0) {
        data.Barriers.forEach(b => {
            const li = document.createElement('li'); li.innerText = b; barriersUl.appendChild(li);
        });
    } else { barriersUl.innerHTML = "<li>None reported.</li>"; }
}

document.getElementById('reset-btn').onclick = () => {
    document.getElementById('panel-title').innerText = "Statewide Overview";
    document.getElementById('reset-btn').classList.add('hidden');
    document.getElementById('district-details').classList.add('hidden');
    document.getElementById('statewide-charts').classList.remove('hidden');
    if (districtEnrollChartInstance) { districtEnrollChartInstance.destroy(); districtEnrollChartInstance = null; }
};