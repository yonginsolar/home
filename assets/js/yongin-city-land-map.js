/*
 * Version: v1.0.0
 * Public Yongin municipal-land solar candidate overlay for map.html.
 */
(function () {
    'use strict';

    const DATA_VERSION = '20260810-1';
    const CANDIDATE_URL = `assets/data/yongin-city-land-solar-candidates.geojson?v=${DATA_VERSION}`;
    const TOP30_URL = `assets/data/yongin-city-land-solar-top30.geojson?v=${DATA_VERSION}`;
    const numberFormat = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });
    const state = {
        candidates: null,
        top30: null,
        loadingPromise: null,
        clusterGroup: null,
        boundaryGroup: null,
        markerIcons: {},
        visibleBounds: null
    };

    function getMap() {
        return window.yonginSolarMap || null;
    }

    function setStatus(message, type = 'normal') {
        const element = document.getElementById('cityLandStatus');
        if (!element) return;
        element.textContent = message;
        element.classList.toggle('error', type === 'error');
    }

    function ensureLayerGroups() {
        if (!window.L) throw new Error('지도 라이브러리를 불러오지 못했습니다.');
        if (!state.clusterGroup) {
            state.clusterGroup = L.markerClusterGroup({
                chunkedLoading: true,
                chunkInterval: 120,
                chunkDelay: 25,
                maxClusterRadius: 48,
                disableClusteringAtZoom: 17,
                showCoverageOnHover: false,
                iconCreateFunction(cluster) {
                    const count = cluster.getChildCount();
                    const size = count >= 100 ? 46 : count >= 10 ? 40 : 34;
                    return L.divIcon({
                        html: `<div><span>${numberFormat.format(count)}</span></div>`,
                        className: 'marker-cluster city-land-cluster',
                        iconSize: L.point(size, size)
                    });
                }
            });
        }
        if (!state.boundaryGroup) {
            state.boundaryGroup = L.layerGroup();
        }
    }

    function validateFeatureCollection(payload, expectedGeometry) {
        if (!payload || payload.type !== 'FeatureCollection' || !Array.isArray(payload.features)) {
            throw new Error('시유지 지도 데이터 형식이 올바르지 않습니다.');
        }
        const invalid = payload.features.some(feature => {
            const geometryType = feature?.geometry?.type || '';
            return !feature?.properties?.pnu || !geometryType.includes(expectedGeometry);
        });
        if (invalid) throw new Error('시유지 지도 데이터 일부가 손상되었습니다.');
        return payload;
    }

    async function loadMunicipalLandData() {
        if (state.candidates && state.top30) return;
        if (state.loadingPromise) return state.loadingPromise;
        setStatus('용인시 시유지 후보 2,982필지를 불러오는 중입니다.');
        state.loadingPromise = Promise.all([
            fetch(CANDIDATE_URL, { cache: 'force-cache' }),
            fetch(TOP30_URL, { cache: 'force-cache' })
        ]).then(async ([candidateResponse, top30Response]) => {
            if (!candidateResponse.ok || !top30Response.ok) {
                throw new Error(`시유지 데이터를 불러오지 못했습니다. (${candidateResponse.status}/${top30Response.status})`);
            }
            const [candidatePayload, top30Payload] = await Promise.all([
                candidateResponse.json(),
                top30Response.json()
            ]);
            state.candidates = validateFeatureCollection(candidatePayload, 'Point');
            state.top30 = validateFeatureCollection(top30Payload, 'Polygon');
        }).finally(() => {
            state.loadingPromise = null;
        });
        return state.loadingPromise;
    }

    function markerIcon(isPriority) {
        const key = isPriority ? 'priority' : 'review';
        if (!state.markerIcons[key]) {
            state.markerIcons[key] = L.divIcon({
                className: 'city-land-marker',
                html: `<span class="city-land-marker-dot${isPriority ? ' priority' : ''}"></span>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8],
                popupAnchor: [0, -8]
            });
        }
        return state.markerIcons[key];
    }

    function popupRow(label, value) {
        const row = document.createElement('div');
        row.className = 'city-land-popup-row';
        const labelElement = document.createElement('span');
        labelElement.textContent = label;
        const valueElement = document.createElement('strong');
        valueElement.textContent = value;
        row.append(labelElement, valueElement);
        return row;
    }

    function buildPopup(feature, latLng) {
        const properties = feature.properties || {};
        const container = document.createElement('div');
        container.className = 'city-land-popup';

        const title = document.createElement('h4');
        title.textContent = properties.address || '용인시 시유지 후보';
        container.appendChild(title);
        container.appendChild(popupRow('지목', properties.land_category || '미확인'));
        container.appendChild(popupRow('면적', `${numberFormat.format(Number(properties.area_sqm || 0))}㎡`));
        container.appendChild(popupRow('우선순위', `${properties.solar_candidate || '검토필요'} · ${Number(properties.priority_score || 0)}점`));
        if (properties.rank) container.appendChild(popupRow('상위 후보', `${properties.rank}위`));

        const reason = document.createElement('div');
        reason.className = 'city-land-popup-reason';
        reason.textContent = properties.candidate_reason || '현장조사와 규제 확인이 필요한 1차 후보입니다.';
        container.appendChild(reason);

        const note = document.createElement('div');
        note.className = 'city-land-popup-note';
        note.textContent = `공개자료 기준 ${properties.source_date || '2026-08-10'} · 설치 가능 확정이 아닌 조사 우선순위 · 위치는 필지 중심점`;
        container.appendChild(note);

        if (latLng && typeof window.openRegModalWithLoc === 'function') {
            const action = document.createElement('button');
            action.type = 'button';
            action.className = 'city-land-popup-action';
            action.textContent = '이 위치를 사용자 추천으로 등록';
            action.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                window.openRegModalWithLoc(latLng.lat, latLng.lng, properties.address || '');
            });
            container.appendChild(action);
        }
        return container;
    }

    function currentFilters() {
        return {
            district: document.getElementById('cityLandDistrictFilter')?.value || 'all',
            category: document.getElementById('cityLandCategoryFilter')?.value || 'all',
            minimumArea: Number(document.getElementById('cityLandAreaFilter')?.value || 0),
            priority: document.getElementById('cityLandPriorityFilter')?.value || '35'
        };
    }

    function matchesFilters(feature, filters) {
        const properties = feature.properties || {};
        if (filters.district !== 'all' && properties.district !== filters.district) return false;
        if (filters.category !== 'all' && properties.land_category !== filters.category) return false;
        if (Number(properties.area_sqm || 0) < filters.minimumArea) return false;
        if (filters.priority === 'Y') return properties.solar_candidate === 'Y';
        return Number(properties.priority_score || 0) >= Number(filters.priority || 35);
    }

    function renderBoundaries(filters) {
        const mapInstance = getMap();
        if (!mapInstance || !state.boundaryGroup) return;
        state.boundaryGroup.clearLayers();
        const showBoundaries = Boolean(document.getElementById('cityLandTop30Toggle')?.checked);
        if (!showBoundaries || !state.top30) {
            if (mapInstance.hasLayer(state.boundaryGroup)) mapInstance.removeLayer(state.boundaryGroup);
            return;
        }

        const filteredFeatures = state.top30.features.filter(feature => matchesFilters(feature, filters));
        const geoJsonLayer = L.geoJSON({ type: 'FeatureCollection', features: filteredFeatures }, {
            style(feature) {
                return {
                    color: feature?.properties?.solar_candidate === 'Y' ? '#0e7a3d' : '#c18400',
                    weight: 3,
                    opacity: 0.9,
                    fillColor: '#f4c542',
                    fillOpacity: 0.13
                };
            },
            onEachFeature(feature, layer) {
                const center = layer.getBounds ? layer.getBounds().getCenter() : null;
                layer.bindPopup(() => buildPopup(feature, center));
            }
        });
        state.boundaryGroup.addLayer(geoJsonLayer);
        if (!mapInstance.hasLayer(state.boundaryGroup)) state.boundaryGroup.addTo(mapInstance);
    }

    function renderCandidates() {
        const mapInstance = getMap();
        const toggle = document.getElementById('cityLandLayerToggle');
        if (!mapInstance || !toggle?.checked || !state.candidates) return;
        ensureLayerGroups();
        const filters = currentFilters();
        const filteredFeatures = state.candidates.features.filter(feature => matchesFilters(feature, filters));
        const markers = [];
        const bounds = [];

        state.clusterGroup.clearLayers();
        filteredFeatures.forEach(feature => {
            const coordinates = feature.geometry.coordinates;
            const latLng = L.latLng(Number(coordinates[1]), Number(coordinates[0]));
            if (!Number.isFinite(latLng.lat) || !Number.isFinite(latLng.lng)) return;
            const properties = feature.properties || {};
            const marker = L.marker(latLng, {
                icon: markerIcon(properties.solar_candidate === 'Y' || Number(properties.priority_score || 0) >= 60),
                title: properties.address || '용인시 시유지 후보',
                keyboard: true,
                riseOnHover: true
            });
            marker.bindPopup(() => buildPopup(feature, latLng), { maxWidth: 300 });
            markers.push(marker);
            bounds.push(latLng);
        });
        if (markers.length) state.clusterGroup.addLayers(markers);
        if (!mapInstance.hasLayer(state.clusterGroup)) state.clusterGroup.addTo(mapInstance);
        state.visibleBounds = bounds.length ? L.latLngBounds(bounds) : null;
        renderBoundaries(filters);
        setStatus(`${numberFormat.format(markers.length)}필지 표시 · 전체 ${numberFormat.format(state.candidates.features.length)}필지 · 초록색은 우선 후보입니다.`);
    }

    async function toggleMunicipalLandLayer(checkbox) {
        const controls = document.getElementById('cityLandControls');
        if (!checkbox?.checked) {
            if (controls) controls.hidden = true;
            const mapInstance = getMap();
            if (mapInstance && state.clusterGroup && mapInstance.hasLayer(state.clusterGroup)) mapInstance.removeLayer(state.clusterGroup);
            if (mapInstance && state.boundaryGroup && mapInstance.hasLayer(state.boundaryGroup)) mapInstance.removeLayer(state.boundaryGroup);
            return;
        }
        if (controls) controls.hidden = false;
        checkbox.disabled = true;
        try {
            ensureLayerGroups();
            await loadMunicipalLandData();
            if (checkbox.checked) renderCandidates();
        } catch (error) {
            console.error('[MunicipalLandMap]', error);
            checkbox.checked = false;
            if (controls) controls.hidden = false;
            setStatus(error?.message || '시유지 후보 데이터를 불러오지 못했습니다.', 'error');
            if (typeof window.showSystemModal === 'function') window.showSystemModal('시유지 후보 데이터를 불러오지 못했습니다.', 'error');
        } finally {
            checkbox.disabled = false;
        }
    }

    function fitMunicipalLandResults() {
        const mapInstance = getMap();
        if (!mapInstance || !state.visibleBounds || !state.visibleBounds.isValid()) {
            setStatus('현재 조건에 표시할 필지가 없습니다.', 'error');
            return;
        }
        mapInstance.fitBounds(state.visibleBounds.pad(0.08), { maxZoom: 15, animate: true });
    }

    window.toggleMunicipalLandLayer = toggleMunicipalLandLayer;
    window.applyMunicipalLandFilters = renderCandidates;
    window.fitMunicipalLandResults = fitMunicipalLandResults;
    console.log('[Version] v1.0.0 | yongin-city-land-map.js | 2,982 public candidates');
})();
