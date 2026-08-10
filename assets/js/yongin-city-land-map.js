/*
 * Version: v1.3.0
 * On-demand Yongin public-land solar candidate search for map.html.
 */
(function () {
    'use strict';

    const DATA_VERSION = '20260810-3';
    const INDEX_URL = `assets/data/yongin-public-land-index.json?v=${DATA_VERSION}`;
    const TOP30_URL = `assets/data/yongin-city-land-solar-top30.geojson?v=${DATA_VERSION}`;
    const DATASETS = Object.freeze({
        city: {
            label: '용인시유지',
            ownerLabel: '용인시',
            url: `assets/data/yongin-city-land-solar-candidates.geojson?v=${DATA_VERSION}`
        },
        province: {
            label: '경기도유지',
            ownerLabel: '경기도',
            url: `assets/data/yongin-province-land-solar-candidates.geojson?v=${DATA_VERSION}`
        },
        national: {
            label: '국유지',
            ownerLabel: '대한민국',
            url: `assets/data/yongin-national-land-solar-candidates.geojson?v=${DATA_VERSION}`
        }
    });
    const DISTRICTS = ['처인구', '기흥구', '수지구'];
    const primaryLandCategories = new Set(['주차장', '잡종지', '대', '체육용지', '공장용지', '창고용지', '도로', '공원']);
    const numberFormat = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });
    const state = {
        index: null,
        indexPromise: null,
        candidatesByOwner: new Map(),
        loadingByOwner: new Map(),
        top30: null,
        top30Promise: null,
        reviewPromise: null,
        reviews: new Map(),
        canReview: false,
        reviewUserId: null,
        clusterGroup: null,
        boundaryGroup: null,
        markerIcons: {},
        markerByPnu: new Map(),
        activeFilters: null,
        currentFeatures: [],
        currentOwnerCounts: new Map(),
        currentExcludedCount: 0,
        visibleBounds: null,
        pendingLargeSignature: null,
        searchDirty: true
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
        element.classList.toggle('warning', type === 'warning');
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
        if (!state.boundaryGroup) state.boundaryGroup = L.layerGroup();
    }

    function validateFeatureCollection(payload, expectedGeometry) {
        if (!payload || payload.type !== 'FeatureCollection' || !Array.isArray(payload.features)) {
            throw new Error('국공유지 지도 데이터 형식이 올바르지 않습니다.');
        }
        const invalid = payload.features.some(feature => {
            const geometryType = feature?.geometry?.type || '';
            return !feature?.properties?.pnu || !geometryType.includes(expectedGeometry);
        });
        if (invalid) throw new Error('국공유지 지도 데이터 일부가 손상되었습니다.');
        return payload;
    }

    function normalizeFeature(feature, ownerKey) {
        const dataset = DATASETS[ownerKey];
        const properties = feature.properties || {};
        properties.owner_type = properties.owner_type || dataset.label;
        properties.owner_label = properties.owner_label || dataset.ownerLabel;
        properties._ownerKey = ownerKey;
        feature.properties = properties;
        return feature;
    }

    async function loadIndex() {
        if (state.index) return state.index;
        if (state.indexPromise) return state.indexPromise;
        state.indexPromise = fetch(INDEX_URL, { cache: 'force-cache' })
            .then(async response => {
                if (!response.ok) throw new Error(`검색 인덱스를 불러오지 못했습니다. (${response.status})`);
                const payload = await response.json();
                if (!payload?.layers || !Number.isFinite(Number(payload.total_candidate_count))) {
                    throw new Error('검색 인덱스 형식이 올바르지 않습니다.');
                }
                state.index = payload;
                Object.keys(DATASETS).forEach(ownerKey => {
                    const count = Number(payload.layers?.[ownerKey]?.feature_count || 0);
                    document.querySelectorAll(`[data-owner-count="${ownerKey}"]`).forEach(element => {
                        element.textContent = `${numberFormat.format(count)}필지`;
                    });
                });
                return payload;
            })
            .finally(() => { state.indexPromise = null; });
        return state.indexPromise;
    }

    async function loadOwnerData(ownerKey) {
        if (!DATASETS[ownerKey]) throw new Error('지원하지 않는 소유구분입니다.');
        if (state.candidatesByOwner.has(ownerKey)) return state.candidatesByOwner.get(ownerKey);
        if (state.loadingByOwner.has(ownerKey)) return state.loadingByOwner.get(ownerKey);
        const promise = fetch(DATASETS[ownerKey].url, { cache: 'force-cache' })
            .then(async response => {
                if (!response.ok) throw new Error(`${DATASETS[ownerKey].label} 데이터를 불러오지 못했습니다. (${response.status})`);
                const payload = validateFeatureCollection(await response.json(), 'Point');
                payload.features.forEach(feature => normalizeFeature(feature, ownerKey));
                state.candidatesByOwner.set(ownerKey, payload);
                return payload;
            })
            .finally(() => { state.loadingByOwner.delete(ownerKey); });
        state.loadingByOwner.set(ownerKey, promise);
        return promise;
    }

    async function loadTop30() {
        if (state.top30) return state.top30;
        if (state.top30Promise) return state.top30Promise;
        state.top30Promise = fetch(TOP30_URL, { cache: 'force-cache' })
            .then(async response => {
                if (!response.ok) throw new Error(`상위 30개 필지 경계를 불러오지 못했습니다. (${response.status})`);
                const payload = validateFeatureCollection(await response.json(), 'Polygon');
                payload.features.forEach(feature => normalizeFeature(feature, 'city'));
                state.top30 = payload;
                return payload;
            })
            .finally(() => { state.top30Promise = null; });
        return state.top30Promise;
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
            console.error('[PublicLandReview]', error);
        });
        return state.reviewPromise;
    }

    function markerIcon(ownerKey, isPriority, isExcluded = false) {
        const key = `${ownerKey}:${isPriority ? 'priority' : 'review'}:${isExcluded ? 'excluded' : 'included'}`;
        if (!state.markerIcons[key]) {
            const classes = ['city-land-marker-dot', `owner-${ownerKey}`];
            if (isPriority) classes.push('priority');
            if (isExcluded) classes.push('excluded');
            state.markerIcons[key] = L.divIcon({
                className: 'city-land-marker',
                html: `<span class="${classes.join(' ')}"></span>`,
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

        const addressLabel = document.createElement('div');
        addressLabel.className = 'city-land-popup-address-label';
        addressLabel.textContent = '공식 지번 · PNU 기준';
        const title = document.createElement('h4');
        title.textContent = properties.address || '용인시 국공유지 후보';
        container.append(addressLabel, title);
        container.appendChild(popupRow('소유구분', properties.owner_type || '미확인'));
        container.appendChild(popupRow('소유기관', properties.owner_label || '미확인'));
        if (properties.manager) container.appendChild(popupRow('관리기관', properties.manager));
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
        note.textContent = `공개자료 기준 ${properties.source_date || '2026-08-10'} · 주소는 공식 공개 PNU 지번 · 위치는 해당 필지 내부 대표점 · 설치 가능 확정이 아닌 조사 우선순위`;
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
                marker.setIcon(markerIcon(properties._ownerKey || 'city', isPriority, Boolean(data.is_excluded)));
            }
            updateVisibleReviewCounts();
            renderBoundaries(state.activeFilters);
            message.textContent = data.is_excluded ? '저장했습니다. 이 필지는 회색으로 표시됩니다.' : '검토 기록을 저장했습니다.';
        } catch (error) {
            console.error('[PublicLandReviewSave]', error);
            message.textContent = '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.';
        } finally {
            saveButton.disabled = false;
        }
    }

    function selectedOwners() {
        return new Set([...document.querySelectorAll('#cityLandOwnerFilter input[type="checkbox"]:checked')].map(input => input.value));
    }

    function selectedGroupValues(groupId) {
        const inputs = [...document.querySelectorAll(`#${groupId} input[type="checkbox"]`)];
        if (inputs.some(input => input.value === 'all' && input.checked)) return null;
        return new Set(inputs.filter(input => input.value !== 'all' && input.checked).map(input => input.value));
    }

    function currentFilters() {
        const minimumAreaInput = document.getElementById('cityLandMinimumArea');
        const maximumAreaInput = document.getElementById('cityLandMaximumArea');
        const minimumArea = Math.max(0, Number(minimumAreaInput?.value || 0));
        const maximumArea = maximumAreaInput?.value === '' ? Number.POSITIVE_INFINITY : Math.max(0, Number(maximumAreaInput?.value || 0));
        return {
            owners: selectedOwners(),
            districts: selectedGroupValues('cityLandDistrictFilter'),
            categories: selectedGroupValues('cityLandCategoryFilter'),
            minimumArea,
            maximumArea,
            invalidAreaRange: maximumArea < minimumArea,
            priority: document.getElementById('cityLandPriorityFilter')?.value || '35',
            showTop30: Boolean(document.getElementById('cityLandTop30Toggle')?.checked)
        };
    }

    function filterSignature(filters) {
        const serializeSet = value => value ? [...value].sort().join(',') : 'all';
        return [
            serializeSet(filters.owners),
            serializeSet(filters.districts),
            serializeSet(filters.categories),
            filters.minimumArea,
            Number.isFinite(filters.maximumArea) ? filters.maximumArea : 'max',
            filters.priority,
            filters.showTop30 ? 'top30' : 'points'
        ].join('|');
    }

    function matchesFilters(feature, filters) {
        const properties = feature.properties || {};
        if (!filters.owners.has(properties._ownerKey)) return false;
        if (filters.districts && !filters.districts.has(properties.district)) return false;
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

    function estimateMaximumCount(filters) {
        if (!state.index) return 0;
        let total = 0;
        for (const ownerKey of filters.owners) {
            const layer = state.index.layers?.[ownerKey];
            if (!layer) continue;
            const districts = filters.districts ? [...filters.districts] : DISTRICTS;
            for (const district of districts) {
                const categories = layer.district_category_counts?.[district] || {};
                if (!filters.categories) {
                    total += Object.values(categories).reduce((sum, count) => sum + Number(count || 0), 0);
                    continue;
                }
                for (const category of filters.categories) {
                    if (category === 'other') {
                        total += Object.entries(categories)
                            .filter(([name]) => !primaryLandCategories.has(name))
                            .reduce((sum, [, count]) => sum + Number(count || 0), 0);
                    } else {
                        total += Number(categories[category] || 0);
                    }
                }
            }
        }
        return total;
    }

    function clearRenderedResults() {
        const mapInstance = getMap();
        if (state.clusterGroup) state.clusterGroup.clearLayers();
        if (state.boundaryGroup) {
            state.boundaryGroup.clearLayers();
            if (mapInstance?.hasLayer(state.boundaryGroup)) mapInstance.removeLayer(state.boundaryGroup);
        }
        state.markerByPnu.clear();
        state.activeFilters = null;
        state.currentFeatures = [];
        state.currentOwnerCounts = new Map();
        state.currentExcludedCount = 0;
        state.visibleBounds = null;
        const fitButton = document.getElementById('cityLandFitButton');
        if (fitButton) fitButton.disabled = true;
    }

    function resetLargeWarning() {
        const warning = document.getElementById('cityLandLargeScopeWarning');
        const confirm = document.getElementById('cityLandLargeScopeConfirm');
        if (warning) warning.hidden = true;
        if (confirm) confirm.checked = false;
        state.pendingLargeSignature = null;
    }

    function markPublicLandSearchDirty() {
        state.searchDirty = true;
        clearRenderedResults();
        resetLargeWarning();
        setStatus('조건이 변경되었습니다. 선택 조건으로 검색을 눌러 주세요.', 'warning');
    }

    function handlePublicLandCheckboxChange(checkbox, groupId) {
        const inputs = [...document.querySelectorAll(`#${groupId} input[type="checkbox"]`)];
        const allInput = inputs.find(input => input.value === 'all');
        const specificInputs = inputs.filter(input => input.value !== 'all');
        if (checkbox?.value === 'all' && checkbox.checked) {
            specificInputs.forEach(input => { input.checked = false; });
        } else if (checkbox?.value !== 'all' && checkbox?.checked && allInput) {
            allInput.checked = false;
        }
        if (!specificInputs.some(input => input.checked) && allInput) allInput.checked = true;
        markPublicLandSearchDirty();
    }

    function renderBoundaries(filters) {
        const mapInstance = getMap();
        if (!mapInstance || !state.boundaryGroup) return;
        state.boundaryGroup.clearLayers();
        if (!filters?.showTop30 || !filters.owners.has('city') || !state.top30) {
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

    function renderCandidates(features, filters) {
        const mapInstance = getMap();
        if (!mapInstance) throw new Error('지도가 아직 준비되지 않았습니다.');
        ensureLayerGroups();
        const markers = [];
        const bounds = [];
        const ownerCounts = new Map();
        state.clusterGroup.clearLayers();
        state.markerByPnu.clear();

        features.forEach(feature => {
            const coordinates = feature.geometry.coordinates;
            const latLng = L.latLng(Number(coordinates[1]), Number(coordinates[0]));
            if (!Number.isFinite(latLng.lat) || !Number.isFinite(latLng.lng)) return;
            const properties = feature.properties || {};
            const ownerKey = properties._ownerKey || 'city';
            const isExcluded = Boolean(candidateReview(feature)?.is_excluded);
            const isPriority = properties.solar_candidate === 'Y' || Number(properties.priority_score || 0) >= 60;
            const marker = L.marker(latLng, {
                icon: markerIcon(ownerKey, isPriority, isExcluded),
                title: properties.address || '용인시 국공유지 후보',
                keyboard: true,
                riseOnHover: true,
                bubblingMouseEvents: false
            });
            marker.on('click', event => {
                if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
                if (typeof window.clearMapClickSelection === 'function') window.clearMapClickSelection();
            });
            marker.bindPopup(() => buildPopup(feature, latLng), { maxWidth: 320 });
            markers.push(marker);
            state.markerByPnu.set(String(properties.pnu || ''), marker);
            ownerCounts.set(ownerKey, Number(ownerCounts.get(ownerKey) || 0) + 1);
            bounds.push(latLng);
        });
        if (markers.length) state.clusterGroup.addLayers(markers);
        if (!mapInstance.hasLayer(state.clusterGroup)) state.clusterGroup.addTo(mapInstance);
        state.activeFilters = filters;
        state.currentFeatures = features;
        state.currentOwnerCounts = ownerCounts;
        state.currentExcludedCount = features.filter(feature => candidateReview(feature)?.is_excluded).length;
        state.visibleBounds = bounds.length ? L.latLngBounds(bounds) : null;
        renderBoundaries(filters);
        const fitButton = document.getElementById('cityLandFitButton');
        if (fitButton) fitButton.disabled = markers.length === 0;
        setResultsStatus();
    }

    function setResultsStatus() {
        const ownerSummary = [...state.currentOwnerCounts.entries()]
            .map(([ownerKey, count]) => `${DATASETS[ownerKey]?.label || ownerKey} ${numberFormat.format(count)}`)
            .join(' · ');
        const reviewSummary = state.canReview ? ` · 추천 제외 ${numberFormat.format(state.currentExcludedCount)}필지(회색)` : '';
        const prefix = ownerSummary ? `${ownerSummary} · ` : '';
        setStatus(`${prefix}총 ${numberFormat.format(state.currentFeatures.length)}필지 표시${reviewSummary} · 금색 테두리는 우선 검토 후보입니다.`);
    }

    function updateVisibleReviewCounts() {
        state.currentExcludedCount = state.currentFeatures.filter(feature => candidateReview(feature)?.is_excluded).length;
        setResultsStatus();
    }

    async function searchPublicLandCandidates() {
        const toggle = document.getElementById('cityLandLayerToggle');
        const searchButton = document.getElementById('cityLandSearchButton');
        if (!toggle?.checked) return;
        const filters = currentFilters();
        if (!filters.owners.size) {
            setStatus('소유구분을 한 개 이상 선택해 주세요.', 'error');
            return;
        }
        if (filters.invalidAreaRange) {
            clearRenderedResults();
            setStatus('최대 면적은 최소 면적보다 크거나 같아야 합니다.', 'error');
            return;
        }

        if (searchButton) {
            searchButton.disabled = true;
            searchButton.textContent = '검색 범위 확인 중';
        }
        try {
            await loadIndex();
            const estimate = estimateMaximumCount(filters);
            const threshold = Number(state.index.warning_threshold || 5000);
            const signature = filterSignature(filters);
            const warning = document.getElementById('cityLandLargeScopeWarning');
            const warningText = document.getElementById('cityLandLargeScopeText');
            const confirm = document.getElementById('cityLandLargeScopeConfirm');
            if (estimate > threshold && (state.pendingLargeSignature !== signature || !confirm?.checked)) {
                if (state.pendingLargeSignature !== signature && confirm) confirm.checked = false;
                state.pendingLargeSignature = signature;
                if (warningText) warningText.textContent = `현재 조건은 최대 약 ${numberFormat.format(estimate)}필지를 불러옵니다. 지도 표시가 느려질 수 있으니 지역·지목·면적을 더 좁히거나 아래 확인란을 선택해 주세요.`;
                if (warning) warning.hidden = false;
                setStatus(`검색 범위가 큽니다(최대 약 ${numberFormat.format(estimate)}필지). 확인란을 선택한 뒤 다시 검색해 주세요.`, 'warning');
                return;
            }
            if (warning) warning.hidden = true;
            setStatus(`${[...filters.owners].map(key => DATASETS[key].label).join('·')} 데이터를 필요한 만큼 불러오는 중입니다.`);
            if (searchButton) searchButton.textContent = '데이터 불러오는 중';
            const loadPromises = [...filters.owners].map(loadOwnerData);
            if (filters.showTop30 && filters.owners.has('city')) loadPromises.push(loadTop30());
            await Promise.all([Promise.all(loadPromises), ensureReviewAccess()]);

            const deduplicated = new Map();
            for (const ownerKey of filters.owners) {
                const collection = state.candidatesByOwner.get(ownerKey);
                for (const feature of collection?.features || []) {
                    const pnu = String(feature?.properties?.pnu || '');
                    if (pnu && !deduplicated.has(pnu)) deduplicated.set(pnu, feature);
                }
            }
            const filteredFeatures = [...deduplicated.values()].filter(feature => matchesFilters(feature, filters));
            renderCandidates(filteredFeatures, filters);
            state.searchDirty = false;
        } catch (error) {
            console.error('[PublicLandMap]', error);
            clearRenderedResults();
            setStatus(error?.message || '국공유지 후보 데이터를 불러오지 못했습니다.', 'error');
            if (typeof window.showSystemModal === 'function') window.showSystemModal('국공유지 후보 데이터를 불러오지 못했습니다.', 'error');
        } finally {
            if (searchButton) {
                searchButton.disabled = false;
                searchButton.textContent = '선택 조건으로 검색';
            }
        }
    }

    async function togglePublicLandSearch(checkbox) {
        const controls = document.getElementById('cityLandControls');
        if (!checkbox?.checked) {
            if (controls) controls.hidden = true;
            clearRenderedResults();
            resetLargeWarning();
            return;
        }
        if (controls) controls.hidden = false;
        checkbox.disabled = true;
        setStatus('검색 범위별 필지 수를 확인하는 중입니다. 후보 데이터는 아직 불러오지 않습니다.');
        try {
            ensureLayerGroups();
            await Promise.all([loadIndex(), ensureReviewAccess()]);
            setStatus('조건을 선택하고 검색을 눌러 주세요. 후보 데이터는 검색 전에는 불러오지 않습니다.');
        } catch (error) {
            console.error('[PublicLandSearchIndex]', error);
            setStatus(error?.message || '검색 정보를 불러오지 못했습니다.', 'error');
        } finally {
            checkbox.disabled = false;
        }
    }

    function fitPublicLandResults() {
        const mapInstance = getMap();
        if (!mapInstance || !state.visibleBounds || !state.visibleBounds.isValid()) {
            setStatus('현재 조건에 표시할 필지가 없습니다.', 'error');
            return;
        }
        mapInstance.fitBounds(state.visibleBounds.pad(0.08), { maxZoom: 15, animate: true });
    }

    window.togglePublicLandSearch = togglePublicLandSearch;
    window.markPublicLandSearchDirty = markPublicLandSearchDirty;
    window.handlePublicLandCheckboxChange = handlePublicLandCheckboxChange;
    window.searchPublicLandCandidates = searchPublicLandCandidates;
    window.fitPublicLandResults = fitPublicLandResults;
    console.log('[Version] v1.3.0 | yongin-city-land-map.js | official PNU address clarity');
})();
