/*
 * Version: v1.1.1
 * Public Yongin municipal-land solar candidate overlay for map.html.
 */
(function () {
    'use strict';

    const DATA_VERSION = '20260810-2';
    const CANDIDATE_URL = `assets/data/yongin-city-land-solar-candidates.geojson?v=${DATA_VERSION}`;
    const TOP30_URL = `assets/data/yongin-city-land-solar-top30.geojson?v=${DATA_VERSION}`;
    const numberFormat = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });
    const primaryLandCategories = new Set(['주차장', '잡종지', '대', '체육용지', '공장용지', '창고용지', '도로', '공원']);
    const state = {
        candidates: null,
        top30: null,
        loadingPromise: null,
        reviewPromise: null,
        reviews: new Map(),
        canReview: false,
        reviewUserId: null,
        clusterGroup: null,
        boundaryGroup: null,
        markerIcons: {},
        markerByPnu: new Map(),
        currentMarkerCount: 0,
        currentExcludedCount: 0,
        visibleBounds: null
    };

    function getMap() {
        return window.yonginSolarMap || null;
    }

    function getSupabaseClient() {
        return window.yonginSolarSupabase || null;
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

    async function ensureReviewAccess() {
        if (state.reviewPromise) return state.reviewPromise;
        state.reviewPromise = (async () => {
            const client = getSupabaseClient();
            if (!client) return;
            const { data: userData, error: userError } = await client.auth.getUser();
            if (userError || !userData?.user) return;
            const { data: isHomeAdmin, error: adminError } = await client.rpc('is_home_admin');
            if (adminError || isHomeAdmin !== true) return;

            state.canReview = true;
            state.reviewUserId = userData.user.id;
            const { data: reviewRows, error: reviewError } = await client
                .from('site_land_candidate_reviews')
                .select('pnu,note,is_excluded,updated_at');
            if (reviewError) throw reviewError;
            state.reviews = new Map((reviewRows || []).map(row => [String(row.pnu), row]));

            const help = document.getElementById('cityLandReviewHelp');
            if (help) help.hidden = false;
        })().catch(error => {
            state.canReview = false;
            state.reviewUserId = null;
            console.error('[MunicipalLandReview]', error);
        });
        return state.reviewPromise;
    }

    function markerIcon(isPriority, isExcluded = false) {
        const key = isExcluded ? 'excluded' : (isPriority ? 'priority' : 'review');
        if (!state.markerIcons[key]) {
            state.markerIcons[key] = L.divIcon({
                className: 'city-land-marker',
                html: `<span class="city-land-marker-dot${isExcluded ? ' excluded' : (isPriority ? ' priority' : '')}"></span>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8],
                popupAnchor: [0, -8]
            });
        }
        return state.markerIcons[key];
    }

    function candidateReview(feature) {
        return state.reviews.get(String(feature?.properties?.pnu || '')) || null;
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
        const review = candidateReview(feature);
        const isExcluded = Boolean(review?.is_excluded);
        const container = document.createElement('div');
        container.className = 'city-land-popup';

        const title = document.createElement('h4');
        title.textContent = properties.address || '용인시 시유지 후보';
        container.appendChild(title);
        container.appendChild(popupRow('지목', properties.land_category || '미확인'));
        container.appendChild(popupRow('면적', `${numberFormat.format(Number(properties.area_sqm || 0))}㎡`));
        container.appendChild(popupRow('우선순위', isExcluded ? `추천 제외 · ${Number(properties.priority_score || 0)}점` : `${properties.solar_candidate || '검토필요'} · ${Number(properties.priority_score || 0)}점`));
        if (properties.rank) container.appendChild(popupRow('상위 후보', `${properties.rank}위`));

        const reason = document.createElement('div');
        reason.className = 'city-land-popup-reason';
        reason.textContent = properties.candidate_reason || '현장조사와 규제 확인이 필요한 1차 후보입니다.';
        container.appendChild(reason);

        const note = document.createElement('div');
        note.className = 'city-land-popup-note';
        note.textContent = `공개자료 기준 ${properties.source_date || '2026-08-10'} · 설치 가능 확정이 아닌 조사 우선순위 · 위치는 필지 내부 대표점`;
        container.appendChild(note);

        if (state.canReview) {
            const reviewBox = document.createElement('div');
            reviewBox.className = 'city-land-review-box';

            const excludedLabel = document.createElement('label');
            const excludedInput = document.createElement('input');
            excludedInput.type = 'checkbox';
            excludedInput.checked = isExcluded;
            excludedLabel.append(excludedInput, document.createTextNode('추천 제외(회색으로 계속 표시)'));

            const memo = document.createElement('textarea');
            memo.maxLength = 2000;
            memo.placeholder = '현장 확인 내용이나 제외 사유를 메모하세요.';
            memo.setAttribute('aria-label', '필지 검토 메모');
            memo.value = review?.note || '';

            const saveButton = document.createElement('button');
            saveButton.type = 'button';
            saveButton.className = 'city-land-review-save';
            saveButton.textContent = '검토 기록 저장';

            const message = document.createElement('div');
            message.className = 'city-land-review-message';
            message.setAttribute('role', 'status');

            saveButton.addEventListener('click', () => saveCandidateReview(feature, memo.value, excludedInput.checked, saveButton, message));
            reviewBox.append(excludedLabel, memo, saveButton, message);
            container.appendChild(reviewBox);
        }

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

    async function saveCandidateReview(feature, noteValue, isExcluded, saveButton, message) {
        const client = getSupabaseClient();
        const pnu = String(feature?.properties?.pnu || '');
        if (!client || !state.canReview || !state.reviewUserId || !/^\d{19}$/.test(pnu)) {
            message.textContent = '관리자 검토 권한을 확인할 수 없습니다.';
            return;
        }

        saveButton.disabled = true;
        message.textContent = '저장 중입니다.';
        const normalizedNote = String(noteValue || '').trim();
        const payload = {
            pnu,
            note: normalizedNote || null,
            is_excluded: Boolean(isExcluded),
            updated_by: state.reviewUserId,
            updated_at: new Date().toISOString()
        };

        try {
            const { data, error } = await client
                .from('site_land_candidate_reviews')
                .upsert(payload, { onConflict: 'coop_id,pnu' })
                .select('pnu,note,is_excluded,updated_at')
                .single();
            if (error) throw error;

            state.reviews.set(pnu, data);
            const properties = feature.properties || {};
            const marker = state.markerByPnu.get(pnu);
            if (marker) {
                const isPriority = properties.solar_candidate === 'Y' || Number(properties.priority_score || 0) >= 60;
                marker.setIcon(markerIcon(isPriority, Boolean(data.is_excluded)));
            }
            updateVisibleReviewCounts();
            renderBoundaries(currentFilters());
            message.textContent = data.is_excluded ? '저장했습니다. 이 필지는 회색으로 표시됩니다.' : '검토 기록을 저장했습니다.';
        } catch (error) {
            console.error('[MunicipalLandReviewSave]', error);
            message.textContent = '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.';
        } finally {
            saveButton.disabled = false;
        }
    }

    function selectedLandCategories() {
        const inputs = [...document.querySelectorAll('#cityLandCategoryFilter input[type="checkbox"]')];
        if (inputs.some(input => input.value === 'all' && input.checked)) return null;
        return new Set(inputs.filter(input => input.value !== 'all' && input.checked).map(input => input.value));
    }

    function currentFilters() {
        const minimumAreaInput = document.getElementById('cityLandMinimumArea');
        const maximumAreaInput = document.getElementById('cityLandMaximumArea');
        const minimumArea = Math.max(0, Number(minimumAreaInput?.value || 0));
        const maximumArea = maximumAreaInput?.value === '' ? Number.POSITIVE_INFINITY : Math.max(0, Number(maximumAreaInput?.value || 0));
        return {
            district: document.getElementById('cityLandDistrictFilter')?.value || 'all',
            categories: selectedLandCategories(),
            minimumArea,
            maximumArea,
            invalidAreaRange: maximumArea < minimumArea,
            priority: document.getElementById('cityLandPriorityFilter')?.value || '35'
        };
    }

    let filterTimer = null;
    function scheduleMunicipalLandFilters() {
        window.clearTimeout(filterTimer);
        filterTimer = window.setTimeout(renderCandidates, 180);
    }

    function matchesFilters(feature, filters) {
        const properties = feature.properties || {};
        if (filters.district !== 'all' && properties.district !== filters.district) return false;
        if (filters.categories) {
            const category = properties.land_category || '';
            const matchesNamedCategory = filters.categories.has(category);
            const matchesOther = filters.categories.has('other') && !primaryLandCategories.has(category);
            if (!matchesNamedCategory && !matchesOther) return false;
        }
        const area = Number(properties.area_sqm || 0);
        if (area < filters.minimumArea || area > filters.maximumArea) return false;
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
                const isExcluded = Boolean(candidateReview(feature)?.is_excluded);
                return {
                    color: isExcluded ? '#777f79' : (feature?.properties?.solar_candidate === 'Y' ? '#0e7a3d' : '#c18400'),
                    weight: 3,
                    opacity: 0.9,
                    fillColor: isExcluded ? '#a6aca8' : '#f4c542',
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
        if (filters.invalidAreaRange) {
            state.clusterGroup.clearLayers();
            if (state.boundaryGroup) state.boundaryGroup.clearLayers();
            state.visibleBounds = null;
            state.currentMarkerCount = 0;
            state.currentExcludedCount = 0;
            setStatus('최대 면적은 최소 면적보다 크거나 같아야 합니다.', 'error');
            return;
        }
        const filteredFeatures = state.candidates.features.filter(feature => matchesFilters(feature, filters));
        const markers = [];
        const bounds = [];

        state.clusterGroup.clearLayers();
        state.markerByPnu.clear();
        filteredFeatures.forEach(feature => {
            const coordinates = feature.geometry.coordinates;
            const latLng = L.latLng(Number(coordinates[1]), Number(coordinates[0]));
            if (!Number.isFinite(latLng.lat) || !Number.isFinite(latLng.lng)) return;
            const properties = feature.properties || {};
            const isExcluded = Boolean(candidateReview(feature)?.is_excluded);
            const marker = L.marker(latLng, {
                icon: markerIcon(properties.solar_candidate === 'Y' || Number(properties.priority_score || 0) >= 60, isExcluded),
                title: properties.address || '용인시 시유지 후보',
                keyboard: true,
                riseOnHover: true
            });
            marker.bindPopup(() => buildPopup(feature, latLng), { maxWidth: 300 });
            markers.push(marker);
            state.markerByPnu.set(String(properties.pnu || ''), marker);
            bounds.push(latLng);
        });
        if (markers.length) state.clusterGroup.addLayers(markers);
        if (!mapInstance.hasLayer(state.clusterGroup)) state.clusterGroup.addTo(mapInstance);
        state.visibleBounds = bounds.length ? L.latLngBounds(bounds) : null;
        state.currentMarkerCount = markers.length;
        state.currentExcludedCount = filteredFeatures.filter(feature => candidateReview(feature)?.is_excluded).length;
        renderBoundaries(filters);
        setResultsStatus();
    }

    function setResultsStatus() {
        const reviewSummary = state.canReview ? ` · 추천 제외 ${numberFormat.format(state.currentExcludedCount)}필지(회색)` : '';
        setStatus(`${numberFormat.format(state.currentMarkerCount)}필지 표시 · 전체 ${numberFormat.format(state.candidates.features.length)}필지${reviewSummary} · 초록색은 우선 후보입니다.`);
    }

    function updateVisibleReviewCounts() {
        if (!state.candidates) return;
        const filters = currentFilters();
        const filteredFeatures = state.candidates.features.filter(feature => matchesFilters(feature, filters));
        state.currentExcludedCount = filteredFeatures.filter(feature => candidateReview(feature)?.is_excluded).length;
        setResultsStatus();
    }

    function handleMunicipalLandCategoryChange(checkbox) {
        const inputs = [...document.querySelectorAll('#cityLandCategoryFilter input[type="checkbox"]')];
        const allInput = inputs.find(input => input.value === 'all');
        const categoryInputs = inputs.filter(input => input.value !== 'all');
        if (checkbox?.value === 'all' && checkbox.checked) {
            categoryInputs.forEach(input => { input.checked = false; });
        } else if (checkbox?.value !== 'all' && checkbox?.checked && allInput) {
            allInput.checked = false;
        }
        if (!categoryInputs.some(input => input.checked) && allInput) allInput.checked = true;
        renderCandidates();
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
            await Promise.all([loadMunicipalLandData(), ensureReviewAccess()]);
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
    window.scheduleMunicipalLandFilters = scheduleMunicipalLandFilters;
    window.handleMunicipalLandCategoryChange = handleMunicipalLandCategoryChange;
    window.fitMunicipalLandResults = fitMunicipalLandResults;
    console.log('[Version] v1.1.1 | yongin-city-land-map.js | corrected representative points and admin reviews');
})();
