/*
 * Version: v1.7.1
 * On-demand Gyeonggi public-land solar candidate search for map.html.
 */
(function () {
    'use strict';

    const DATA_VERSION = '20260811-4';
    const INDEX_URL = `assets/data/gyeonggi-public-land-index.json?v=${DATA_VERSION}`;
    const TOP30_URL = `assets/data/yongin-city-land-solar-top30.geojson?v=${DATA_VERSION}`;
    const PARCEL_BOUNDARY_URL = 'https://gris.gg.go.kr:8888/grisgis/rest/services/bdsMap_Cbnd/MapServer/5/query';
    const PARCEL_PROJECT_URL = 'https://gris.gg.go.kr:8888/grisgis/rest/services/Utilities/Geometry/GeometryServer/project';
    const DATASETS = Object.freeze({
        municipal: {
            label: '시·군유지',
            ownerLabel: '해당 시·군'
        },
        province: {
            label: '경기도유지',
            ownerLabel: '경기도'
        },
        national: {
            label: '국유지',
            ownerLabel: '대한민국'
        }
    });
    const primaryLandCategories = new Set(['주차장', '잡종지', '대', '체육용지', '공장용지', '창고용지', '도로', '공원']);
    const numberFormat = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });
    const state = {
        index: null,
        indexPromise: null,
        candidatesByPartition: new Map(),
        loadingByPartition: new Map(),
        top30: null,
        top30Promise: null,
        reviewPromise: null,
        reviews: new Map(),
        canReview: false,
        reviewUserId: null,
        clusterGroup: null,
        boundaryGroup: null,
        focusedBoundaryGroup: null,
        boundaryCache: new Map(),
        referenceAddressCache: new Map(),
        focusedBoundaryPnu: null,
        markerIcons: {},
        markerByPnu: new Map(),
        activeFilters: null,
        currentFeatures: [],
        currentOwnerCounts: new Map(),
        currentExcludedCount: 0,
        currentInstalledSolarCount: 0,
        visibleBounds: null,
        pendingLargeSignature: null,
        searchDirty: true,
        resultMode: 'filter'
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
        if (!state.focusedBoundaryGroup) state.focusedBoundaryGroup = L.layerGroup();
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

    function renderMunicipalityOptions(payload) {
        const container = document.getElementById('cityLandMunicipalityFilter');
        if (!container || container.dataset.ready === 'true') return;
        container.replaceChildren();
        const addOption = (value, name, checked = false) => {
            const label = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.value = value;
            input.checked = checked;
            input.addEventListener('change', () => handlePublicLandCheckboxChange(input, 'cityLandMunicipalityFilter'));
            label.append(input, document.createTextNode(name));
            container.appendChild(label);
        };
        addOption('all', '경기도 전체', false);
        const municipalities = [...(payload.municipalities || [])].sort((left, right) => {
            const leftCode = String(left.code);
            const rightCode = String(right.code);
            if (leftCode === '41460') return -1;
            if (rightCode === '41460') return 1;
            return String(left.name).localeCompare(String(right.name), 'ko');
        });
        for (const municipality of municipalities) {
            const isDefault = String(municipality.code) === '41460';
            addOption(String(municipality.code), `${municipality.name}${isDefault ? ' (기본)' : ''}`, isDefault);
        }
        container.dataset.ready = 'true';
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
                renderMunicipalityOptions(payload);
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

    function partitionKey(municipalityCode, ownerKey) {
        return `${municipalityCode}:${ownerKey}`;
    }

    async function loadPartition(municipalityCode, ownerKey) {
        if (!DATASETS[ownerKey]) throw new Error('지원하지 않는 소유구분입니다.');
        const key = partitionKey(municipalityCode, ownerKey);
        if (state.candidatesByPartition.has(key)) return state.candidatesByPartition.get(key);
        if (state.loadingByPartition.has(key)) return state.loadingByPartition.get(key);
        const partition = state.index?.layers?.[ownerKey]?.partitions?.[municipalityCode];
        if (!partition?.file) throw new Error(`${municipalityCode} ${DATASETS[ownerKey].label} 검색 파일을 찾지 못했습니다.`);
        const promise = fetch(`assets/data/${partition.file}?v=${DATA_VERSION}`, { cache: 'force-cache' })
            .then(async response => {
                if (!response.ok) throw new Error(`${DATASETS[ownerKey].label} 데이터를 불러오지 못했습니다. (${response.status})`);
                const payload = validateFeatureCollection(await response.json(), 'Point');
                payload.features.forEach(feature => normalizeFeature(feature, ownerKey));
                state.candidatesByPartition.set(key, payload);
                return payload;
            })
            .finally(() => { state.loadingByPartition.delete(key); });
        state.loadingByPartition.set(key, promise);
        return promise;
    }

    async function loadTop30() {
        if (state.top30) return state.top30;
        if (state.top30Promise) return state.top30Promise;
        state.top30Promise = fetch(TOP30_URL, { cache: 'force-cache' })
            .then(async response => {
                if (!response.ok) throw new Error(`상위 30개 필지 경계를 불러오지 못했습니다. (${response.status})`);
                const payload = validateFeatureCollection(await response.json(), 'Polygon');
                payload.features.forEach(feature => {
                    feature.properties = feature.properties || {};
                    feature.properties.municipality_code = '41460';
                    feature.properties.municipality = '용인시';
                    feature.properties.owner_label = feature.properties.owner_label || '용인시';
                    normalizeFeature(feature, 'municipal');
                });
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

    function markerIcon(ownerKey, isPriority, isExcluded = false, isInstalledSolar = false) {
        const key = `${ownerKey}:${isPriority ? 'priority' : 'review'}:${isExcluded ? 'excluded' : 'included'}:${isInstalledSolar ? 'installed' : 'unknown'}`;
        if (!state.markerIcons[key]) {
            const classes = ['city-land-marker-dot', `owner-${ownerKey}`];
            if (isPriority) classes.push('priority');
            if (isExcluded) classes.push('excluded');
            if (isInstalledSolar) classes.push('installed-solar');
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

    function popupRow(label, value, className = '') {
        const row = document.createElement('div');
        row.className = 'city-land-popup-row';
        if (className) row.classList.add(className);
        const labelElement = document.createElement('span');
        labelElement.textContent = label;
        const valueElement = document.createElement('strong');
        valueElement.textContent = value;
        row.append(labelElement, valueElement);
        return row;
    }

    function ownershipSourceSummary(properties) {
        const agency = String(properties.source_agency || '경기도').trim();
        const dataset = String(properties.source_dataset || '경기부동산포털 국공유지조회').trim();
        const source = dataset.includes('경기부동산포털')
            ? '경기부동산포털'
            : `${agency} ${dataset}`.trim();
        return `${source} · ${properties.source_date || '2026-08-11'} 조회`;
    }

    function popupDetails(label, className = '') {
        const details = document.createElement('details');
        details.className = `city-land-popup-details ${className}`.trim();
        const summary = document.createElement('summary');
        summary.textContent = label;
        const body = document.createElement('div');
        body.className = 'city-land-popup-details-body';
        details.append(summary, body);
        return { details, summary, body };
    }

    function compactAddress(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/대한민국|경기도/g, '')
            .replace(/[\s,()]/g, '');
    }

    function officialParcelKey(address) {
        const match = String(address || '').match(/([^\s]+(?:동|리|가))\s+(산\s*)?(\d+(?:-\d+)?)/);
        if (!match) return '';
        return compactAddress(`${match[1]}${match[2] || ''}${match[3]}`);
    }

    function appendReferenceAddressCheck(container, feature, latLng) {
        if (!latLng || typeof window.lookupMapReferenceAddress !== 'function') return;
        const check = document.createElement('div');
        check.className = 'city-land-address-check';
        check.textContent = '일반 주소 서비스의 참고 결과와 대조하는 중입니다.';
        container.appendChild(check);

        const cacheKey = `${Number(latLng.lat).toFixed(7)},${Number(latLng.lng).toFixed(7)}`;
        if (!state.referenceAddressCache.has(cacheKey)) {
            state.referenceAddressCache.set(cacheKey, Promise.resolve(window.lookupMapReferenceAddress(latLng.lat, latLng.lng)));
        }
        state.referenceAddressCache.get(cacheKey)
            .then(addressInfo => {
                const officialAddress = feature?.properties?.address || '';
                const officialKey = officialParcelKey(officialAddress);
                const referenceAddress = addressInfo?.jibunAddress || addressInfo?.roadAddress || '';
                const referenceKey = compactAddress(referenceAddress);
                const matches = Boolean(officialKey && referenceKey.includes(officialKey));
                check.classList.toggle('match', matches);
                check.classList.toggle('mismatch', !matches);
                check.textContent = matches
                    ? `일반 주소 참고 결과도 공식 지번과 일치합니다: ${referenceAddress}`
                    : `일반 주소 참고 결과는 “${referenceAddress || '확인 불가'}”로 공식 지번과 다릅니다. 필지 판단은 위 공식 지번과 공식 경계를 기준으로 해 주세요.`;
            })
            .catch(() => {
                state.referenceAddressCache.delete(cacheKey);
                check.textContent = '일반 주소 서비스의 참고 결과는 현재 대조할 수 없습니다. 필지 판단은 위 공식 지번과 공식 경계를 기준으로 해 주세요.';
            });
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
        title.textContent = properties.address || '경기도 국공유지 후보';
        container.append(addressLabel, title);
        container.appendChild(popupRow('소유구분', properties.owner_type || '미확인'));
        container.appendChild(popupRow('소유기관', properties.owner_label || '미확인'));
        container.appendChild(popupRow(
            '소유근거',
            ownershipSourceSummary(properties),
            'source'
        ));
        if (properties.manager) container.appendChild(popupRow('관리기관', properties.manager));
        container.appendChild(popupRow('지목', properties.land_category || '미확인'));
        container.appendChild(popupRow('면적', `${numberFormat.format(Number(properties.area_sqm || 0))}㎡`));
        container.appendChild(popupRow('우선순위', isExcluded ? `추천 제외 · ${Number(properties.priority_score || 0)}점` : `${properties.solar_candidate || '검토필요'} · ${Number(properties.priority_score || 0)}점`));
        if (typeof properties.installed_solar_match === 'boolean') {
            const installedValue = properties.installed_solar_match
                ? `경기도 공개 ${(properties.installed_solar_analysis_years || []).join('·') || '2024'}년 항공영상 PNU 일치 · ${numberFormat.format(Number(properties.installed_solar_count || 0))}개 · 탐지면적 ${numberFormat.format(Number(properties.installed_solar_area_sqm || 0))}㎡`
                : '경기도 공개 2024년 항공영상 자료 PNU 일치 없음';
            container.appendChild(popupRow('태양광 현황', installedValue));
        }
        if (properties.rank) container.appendChild(popupRow('상위 후보', `${properties.rank}위`));

        const reason = document.createElement('div');
        reason.className = 'city-land-popup-reason';
        reason.textContent = properties.candidate_reason || '현장조사와 규제 확인이 필요한 1차 후보입니다.';
        container.appendChild(reason);

        const referenceDetails = popupDetails('참고');
        const note = document.createElement('div');
        note.className = 'city-land-popup-note';
        note.textContent = `${properties.source_agency || '경기도'} ${properties.source_dataset || '경기부동산포털 국공유지조회'} 공개 응답을 ${properties.source_date || '2026-08-11'}에 조회해 소유구분·소유기관을 표시했습니다. 주소는 공식 공개 PNU 지번, 위치는 연속지적도 필지 내부 대표점입니다. 현재 법적 소유와 설치 가능성은 토지대장·등기·현장조사로 다시 확인해야 합니다.`;
        referenceDetails.body.appendChild(note);
        if (typeof properties.installed_solar_match === 'boolean') {
            const installedNote = document.createElement('div');
            installedNote.className = 'city-land-popup-note';
            installedNote.textContent = properties.installed_solar_match
                ? '기설치 표시는 경기도 공식 2024년 항공영상 AI 판독자료와 PNU가 정확히 일치한 결과입니다. 현재 발전사업 허가·가동 상태는 별도 확인해야 합니다.'
                : '기설치 공개자료와 PNU가 일치하지 않았습니다. 항공영상 기준일 이후 설치나 PNU 미기재 자료가 있을 수 있으므로 미설치 확정으로 사용하지 마세요.';
            referenceDetails.body.appendChild(installedNote);
        }
        let referenceLoaded = false;
        referenceDetails.details.addEventListener('toggle', () => {
            if (!referenceDetails.details.open || referenceLoaded) return;
            referenceLoaded = true;
            appendReferenceAddressCheck(referenceDetails.body, feature, latLng);
        });
        container.appendChild(referenceDetails.details);

        if (state.canReview) {
            const reviewDetails = popupDetails(
                review?.is_excluded ? '검토 기록 입력 · 추천 제외됨' : (review?.note ? '검토 기록 입력 · 메모 있음' : '추천 제외·메모 입력'),
                'review'
            );
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
            saveButton.addEventListener('click', () => saveCandidateReview(
                feature,
                memo.value,
                excludedInput.checked,
                saveButton,
                message,
                reviewDetails.summary
            ));
            reviewBox.append(excludedLabel, memo, saveButton, message);
            reviewDetails.body.appendChild(reviewBox);
            container.appendChild(reviewDetails.details);
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

    async function saveCandidateReview(feature, noteValue, isExcluded, saveButton, message, summary) {
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
                marker.setIcon(markerIcon(properties._ownerKey || 'municipal', isPriority, Boolean(data.is_excluded), properties.installed_solar_match === true));
            }
            updateVisibleReviewCounts();
            renderBoundaries(state.activeFilters);
            message.textContent = data.is_excluded ? '저장했습니다. 이 필지는 회색으로 표시됩니다.' : '검토 기록을 저장했습니다.';
            if (summary) {
                summary.textContent = data.is_excluded
                    ? '검토 기록 입력 · 추천 제외됨'
                    : (data.note ? '검토 기록 입력 · 메모 있음' : '추천 제외·메모 입력');
            }
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

    function selectedMunicipalities() {
        const selected = selectedGroupValues('cityLandMunicipalityFilter');
        if (selected) return selected;
        return new Set((state.index?.municipalities || []).map(item => String(item.code)));
    }

    function currentFilters() {
        const minimumAreaInput = document.getElementById('cityLandMinimumArea');
        const maximumAreaInput = document.getElementById('cityLandMaximumArea');
        const minimumArea = Math.max(0, Number(minimumAreaInput?.value || 0));
        const maximumArea = maximumAreaInput?.value === '' ? Number.POSITIVE_INFINITY : Math.max(0, Number(maximumAreaInput?.value || 0));
        return {
            owners: selectedOwners(),
            municipalities: selectedMunicipalities(),
            categories: selectedGroupValues('cityLandCategoryFilter'),
            minimumArea,
            maximumArea,
            invalidAreaRange: maximumArea < minimumArea,
            priority: document.getElementById('cityLandPriorityFilter')?.value || '35',
            installedSolar: document.getElementById('cityLandInstalledSolarFilter')?.value || 'all',
            showTop30: Boolean(document.getElementById('cityLandTop30Toggle')?.checked)
        };
    }

    function filterSignature(filters) {
        const serializeSet = value => value ? [...value].sort().join(',') : 'all';
        return [
            serializeSet(filters.owners),
            serializeSet(filters.municipalities),
            serializeSet(filters.categories),
            filters.minimumArea,
            Number.isFinite(filters.maximumArea) ? filters.maximumArea : 'max',
            filters.priority,
            filters.installedSolar,
            filters.showTop30 ? 'top30' : 'points'
        ].join('|');
    }

    function matchesFilters(feature, filters) {
        const properties = feature.properties || {};
        if (!filters.owners.has(properties._ownerKey)) return false;
        if (!filters.municipalities.has(String(properties.municipality_code || ''))) return false;
        if (filters.categories) {
            const category = properties.land_category || '';
            const matchesNamedCategory = filters.categories.has(category);
            const matchesOther = filters.categories.has('other') && !primaryLandCategories.has(category);
            if (!matchesNamedCategory && !matchesOther) return false;
        }
        const area = Number(properties.area_sqm || 0);
        if (area < filters.minimumArea || area > filters.maximumArea) return false;
        if (filters.installedSolar === 'matched' && properties.installed_solar_match !== true) return false;
        if (filters.installedSolar === 'unmatched' && properties.installed_solar_match === true) return false;
        if (filters.priority === 'Y') return properties.solar_candidate === 'Y';
        return Number(properties.priority_score || 0) >= Number(filters.priority || 35);
    }

    function estimateMaximumCount(filters) {
        if (!state.index) return 0;
        let total = 0;
        for (const ownerKey of filters.owners) {
            const layer = state.index.layers?.[ownerKey];
            if (!layer) continue;
            for (const municipalityCode of filters.municipalities) {
                const partition = layer.partitions?.[municipalityCode];
                const categories = partition?.category_counts || {};
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

    function selectedPartitionPairs(filters) {
        const pairs = [];
        for (const municipalityCode of filters.municipalities) {
            for (const ownerKey of filters.owners) {
                pairs.push({ municipalityCode, ownerKey });
            }
        }
        return pairs;
    }

    async function loadSelectedPartitions(pairs, concurrency = 6) {
        const queue = [...pairs];
        const workerCount = Math.min(Math.max(1, concurrency), queue.length);
        const workers = Array.from({ length: workerCount }, async () => {
            while (queue.length) {
                const pair = queue.shift();
                if (!pair) return;
                await loadPartition(pair.municipalityCode, pair.ownerKey);
            }
        });
        await Promise.all(workers);
    }

    function keywordMunicipalityCodes(rawQuery) {
        const digits = String(rawQuery || '').replace(/\D/g, '');
        if (/^\d{19}$/.test(digits)) {
            const match = (state.index?.municipalities || []).find(item =>
                (item.sgg_codes || []).map(String).includes(digits.slice(0, 5))
            );
            if (match) return new Set([String(match.code)]);
        }
        const compactQuery = compactAddress(rawQuery);
        const matches = (state.index?.municipalities || []).filter(item =>
            compactQuery.includes(compactAddress(item.name))
        );
        return matches.length === 1 ? new Set([String(matches[0].code)]) : null;
    }

    async function loadParcelBoundary(pnu) {
        const normalizedPnu = String(pnu || '');
        if (!/^\d{19}$/.test(normalizedPnu)) throw new Error('공식 필지번호(PNU)가 올바르지 않습니다.');
        if (state.boundaryCache.has(normalizedPnu)) return state.boundaryCache.get(normalizedPnu);

        const params = new URLSearchParams({
            where: `PNU='${normalizedPnu}'`,
            outFields: 'PNU,JIBUN_NM,JIMOK',
            returnGeometry: 'true',
            outSR: '2097',
            f: 'json'
        });
        const response = await fetch(`${PARCEL_BOUNDARY_URL}?${params.toString()}`, {
            cache: 'no-store',
            credentials: 'omit'
        });
        if (!response.ok) throw new Error(`공식 필지 경계를 불러오지 못했습니다. (${response.status})`);
        const payload = await response.json();
        const parcel = payload?.features?.find(item => {
            const returnedPnu = String(item?.attributes?.PNU || item?.attributes?.pnu || '');
            return returnedPnu === normalizedPnu && Array.isArray(item?.geometry?.rings);
        });
        if (!parcel) throw new Error('공식 연속지적도에서 해당 필지 경계를 찾지 못했습니다.');

        const projectParams = new URLSearchParams({
            f: 'json',
            inSR: '5174',
            outSR: '4326',
            geometries: JSON.stringify({
                geometryType: 'esriGeometryPolygon',
                geometries: [parcel.geometry]
            })
        });
        const projectResponse = await fetch(PARCEL_PROJECT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: projectParams.toString(),
            cache: 'no-store',
            credentials: 'omit'
        });
        if (!projectResponse.ok) throw new Error(`공식 필지 좌표를 변환하지 못했습니다. (${projectResponse.status})`);
        const projectedPayload = await projectResponse.json();
        const projectedGeometry = projectedPayload?.geometries?.[0];
        if (!Array.isArray(projectedGeometry?.rings)) throw new Error('공식 필지 좌표 변환 결과가 올바르지 않습니다.');
        const boundary = {
            type: 'Feature',
            id: normalizedPnu,
            properties: parcel.attributes || {},
            geometry: {
                type: 'Polygon',
                coordinates: projectedGeometry.rings
            }
        };
        state.boundaryCache.set(normalizedPnu, boundary);
        return boundary;
    }

    async function showFocusedParcelBoundary(feature, options = {}) {
        const mapInstance = getMap();
        const pnu = String(feature?.properties?.pnu || '');
        if (!mapInstance || !/^\d{19}$/.test(pnu)) return false;
        ensureLayerGroups();
        state.focusedBoundaryPnu = pnu;
        state.focusedBoundaryGroup.clearLayers();
        if (mapInstance.hasLayer(state.focusedBoundaryGroup)) mapInstance.removeLayer(state.focusedBoundaryGroup);

        try {
            const boundary = await loadParcelBoundary(pnu);
            if (state.focusedBoundaryPnu !== pnu) return false;
            const layer = L.geoJSON(boundary, {
                style: {
                    color: '#d43b2f',
                    weight: 4,
                    opacity: 0.95,
                    fillColor: '#ffd34d',
                    fillOpacity: 0.2
                }
            });
            state.focusedBoundaryGroup.addLayer(layer).addTo(mapInstance);
            if (options.fit !== false && layer.getBounds().isValid()) {
                mapInstance.fitBounds(layer.getBounds().pad(0.7), { maxZoom: 17, animate: true });
            }
            return true;
        } catch (error) {
            if (state.focusedBoundaryPnu !== pnu) return false;
            console.error('[PublicLandBoundary]', error);
            setStatus(`${feature?.properties?.address || '선택한 필지'} 마커는 표시했지만 공식 필지 경계를 불러오지 못했습니다. 잠시 후 다시 눌러 주세요.`, 'warning');
            return false;
        }
    }

    function normalizedParcelQuery(value) {
        return compactAddress(value).replace(/[._]/g, '');
    }

    function parcelMatchScore(feature, rawQuery) {
        const properties = feature?.properties || {};
        const pnu = String(properties.pnu || '');
        const query = normalizedParcelQuery(rawQuery);
        const pnuQuery = String(rawQuery || '').replace(/\D/g, '');
        const address = normalizedParcelQuery(properties.address || '');
        if (/^\d{19}$/.test(pnuQuery) && pnu === pnuQuery) return 0;
        if (address === query) return 1;
        if (address.endsWith(query)) return 2;
        if (address.includes(query)) return 3;
        if (pnuQuery.length >= 6 && pnu.includes(pnuQuery)) return 4;
        return Number.POSITIVE_INFINITY;
    }

    function setKeywordResultsMessage(message, type = 'normal') {
        const container = document.getElementById('cityLandKeywordResults');
        if (!container) return;
        container.replaceChildren();
        container.hidden = false;
        container.classList.toggle('error', type === 'error');
        const summary = document.createElement('div');
        summary.className = 'city-land-keyword-summary';
        summary.textContent = message;
        container.appendChild(summary);
    }

    function focusedFilters(feature) {
        return {
            owners: new Set([feature?.properties?._ownerKey || 'municipal']),
            municipalities: new Set([String(feature?.properties?.municipality_code || '')]),
            categories: null,
            minimumArea: 0,
            maximumArea: Number.POSITIVE_INFINITY,
            invalidAreaRange: false,
            priority: '35',
            installedSolar: 'all',
            showTop30: false
        };
    }

    async function selectKeywordCandidate(feature) {
        if (!feature) return;
        const properties = feature.properties || {};
        state.resultMode = 'keyword';
        renderCandidates([feature], focusedFilters(feature));
        state.searchDirty = false;
        const marker = state.markerByPnu.get(String(properties.pnu || ''));
        if (typeof window.clearMapClickSelection === 'function') window.clearMapClickSelection();
        const boundaryShown = await showFocusedParcelBoundary(feature, { fit: true });
        if (marker) {
            const openPopup = () => marker.openPopup();
            if (state.clusterGroup?.zoomToShowLayer) state.clusterGroup.zoomToShowLayer(marker, openPopup);
            else openPopup();
        }
        setKeywordResultsMessage(boundaryShown
            ? `선택됨: ${properties.address || properties.pnu} · 빨간 선은 공식 연속지적도 필지 경계입니다.`
            : `선택됨: ${properties.address || properties.pnu} · 마커는 표시했지만 공식 필지 경계는 불러오지 못했습니다.`);
    }

    function renderKeywordMatches(matches, totalCount, rawQuery) {
        const container = document.getElementById('cityLandKeywordResults');
        if (!container) return;
        container.replaceChildren();
        container.hidden = false;
        container.classList.remove('error');
        const summary = document.createElement('div');
        summary.className = 'city-land-keyword-summary';
        summary.textContent = totalCount > matches.length
            ? `“${rawQuery}” 검색 결과 ${numberFormat.format(totalCount)}건 중 상위 ${matches.length}건입니다. 읍·면·동과 지번을 함께 입력하면 더 정확합니다.`
            : `“${rawQuery}” 검색 결과 ${numberFormat.format(totalCount)}건입니다. 정확한 필지를 선택해 주세요.`;
        container.appendChild(summary);
        matches.forEach(({ feature }) => {
            const properties = feature.properties || {};
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'city-land-keyword-result';
            const title = document.createElement('strong');
            title.textContent = properties.address || properties.pnu;
            const meta = document.createElement('span');
            meta.textContent = `${properties.owner_type || '소유 미확인'} · ${properties.land_category || '지목 미확인'} · ${numberFormat.format(Number(properties.area_sqm || 0))}㎡ · PNU ${properties.pnu}`;
            button.append(title, meta);
            button.addEventListener('click', () => selectKeywordCandidate(feature));
            container.appendChild(button);
        });
    }

    async function searchPublicLandByKeyword() {
        const input = document.getElementById('cityLandParcelKeyword');
        const button = document.getElementById('cityLandKeywordButton');
        const toggle = document.getElementById('cityLandLayerToggle');
        const rawQuery = String(input?.value || '').trim();
        const normalizedQuery = normalizedParcelQuery(rawQuery);
        if (!toggle?.checked) return;
        if (normalizedQuery.length < 3) {
            setKeywordResultsMessage('읍·면·동을 포함한 지번 또는 19자리 PNU를 세 글자 이상 입력해 주세요.', 'error');
            input?.focus();
            return;
        }
        try {
            await loadIndex();
        } catch (error) {
            setKeywordResultsMessage(error?.message || '검색 정보를 불러오지 못했습니다.', 'error');
            return;
        }
        const filters = currentFilters();
        if (!filters.owners.size || !filters.municipalities.size) {
            setKeywordResultsMessage('시·군과 소유구분을 한 개 이상 선택해 주세요.', 'error');
            return;
        }
        const allMunicipalities = document.querySelector('#cityLandMunicipalityFilter input[value="all"]');
        if (allMunicipalities?.checked) {
            const narrowed = keywordMunicipalityCodes(rawQuery);
            if (!narrowed) {
                setKeywordResultsMessage('경기도 전체를 한꺼번에 읽지 않도록 시·군명까지 입력하거나 찾을 시·군을 먼저 선택해 주세요.', 'error');
                return;
            }
            filters.municipalities = narrowed;
        }
        if (button) {
            button.disabled = true;
            button.textContent = '찾는 중';
        }
        const pairs = selectedPartitionPairs(filters);
        setKeywordResultsMessage(`선택한 ${filters.municipalities.size}개 시·군의 공개 후보에서 공식 지번·PNU를 찾는 중입니다.`);
        setStatus('선택한 시·군과 소유구분 데이터만 불러오는 중입니다.');
        try {
            await Promise.all([loadSelectedPartitions(pairs), ensureReviewAccess()]);
            const deduplicated = new Map();
            pairs.forEach(({ municipalityCode, ownerKey }) => {
                for (const feature of state.candidatesByPartition.get(partitionKey(municipalityCode, ownerKey))?.features || []) {
                    const pnu = String(feature?.properties?.pnu || '');
                    if (pnu && !deduplicated.has(pnu)) deduplicated.set(pnu, feature);
                }
            });
            const ranked = [...deduplicated.values()]
                .map(feature => ({ feature, score: parcelMatchScore(feature, rawQuery) }))
                .filter(item => Number.isFinite(item.score))
                .sort((left, right) => left.score - right.score
                    || String(left.feature?.properties?.address || '').localeCompare(String(right.feature?.properties?.address || ''), 'ko'));
            if (!ranked.length) {
                clearRenderedResults();
                setKeywordResultsMessage(`“${rawQuery}”와 일치하는 필지를 공개 후보 데이터에서 찾지 못했습니다. 전체 공식 토지대장이 아니라 1차 조사 후보 데이터임을 참고해 주세요.`, 'error');
                setStatus('일치하는 공개 후보 필지가 없습니다.', 'warning');
                return;
            }
            const visibleMatches = ranked.slice(0, 20);
            const bestMatches = ranked.filter(item => item.score === ranked[0].score);
            renderKeywordMatches(visibleMatches, ranked.length, rawQuery);
            if (bestMatches.length === 1 && ranked[0].score <= 2) {
                await selectKeywordCandidate(ranked[0].feature);
            } else {
                clearRenderedResults();
                setStatus(`${numberFormat.format(ranked.length)}개 후보 중 정확한 지번을 선택해 주세요. 아직 지도에는 표시하지 않았습니다.`);
            }
        } catch (error) {
            console.error('[PublicLandKeywordSearch]', error);
            clearRenderedResults();
            setKeywordResultsMessage(error?.message || '지번·PNU 검색을 완료하지 못했습니다.', 'error');
            setStatus(error?.message || '지번·PNU 검색을 완료하지 못했습니다.', 'error');
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = '지번 찾기';
            }
        }
    }

    function clearRenderedResults() {
        const mapInstance = getMap();
        if (state.clusterGroup) state.clusterGroup.clearLayers();
        if (state.boundaryGroup) {
            state.boundaryGroup.clearLayers();
            if (mapInstance?.hasLayer(state.boundaryGroup)) mapInstance.removeLayer(state.boundaryGroup);
        }
        if (state.focusedBoundaryGroup) {
            state.focusedBoundaryGroup.clearLayers();
            if (mapInstance?.hasLayer(state.focusedBoundaryGroup)) mapInstance.removeLayer(state.focusedBoundaryGroup);
        }
        state.focusedBoundaryPnu = null;
        state.markerByPnu.clear();
        state.activeFilters = null;
        state.currentFeatures = [];
        state.currentOwnerCounts = new Map();
        state.currentExcludedCount = 0;
        state.currentInstalledSolarCount = 0;
        state.visibleBounds = null;
        state.resultMode = 'filter';
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
        const top30 = document.getElementById('cityLandTop30Toggle');
        const selected = selectedGroupValues('cityLandMunicipalityFilter');
        const municipalOwner = document.querySelector('#cityLandOwnerFilter input[value="municipal"]');
        const top30Available = Boolean(selected?.has('41460') && municipalOwner?.checked);
        if (top30) {
            top30.disabled = !top30Available;
            if (!top30Available) top30.checked = false;
        }
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

    function togglePublicLandScoreHelp(button) {
        const help = document.getElementById('cityLandScoreHelp');
        if (!help) return;
        help.hidden = !help.hidden;
        button?.setAttribute('aria-expanded', String(!help.hidden));
    }

    function renderBoundaries(filters) {
        const mapInstance = getMap();
        if (!mapInstance || !state.boundaryGroup) return;
        state.boundaryGroup.clearLayers();
        if (!filters?.showTop30 || !filters.owners.has('municipal') || !filters.municipalities.has('41460') || !state.top30) {
            if (mapInstance.hasLayer(state.boundaryGroup)) mapInstance.removeLayer(state.boundaryGroup);
            return;
        }
        const currentByPnu = new Map(state.currentFeatures.map(feature => [String(feature?.properties?.pnu || ''), feature.properties]));
        state.top30.features.forEach(feature => {
            const current = currentByPnu.get(String(feature?.properties?.pnu || ''));
            if (current) Object.assign(feature.properties, {
                installed_solar_match: current.installed_solar_match,
                installed_solar_count: current.installed_solar_count,
                installed_solar_area_sqm: current.installed_solar_area_sqm,
                installed_solar_analysis_years: current.installed_solar_analysis_years,
                installed_solar_types: current.installed_solar_types
            });
        });
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
                layer.bindPopup(() => buildPopup(feature, center), { maxWidth: 340 });
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
        state.focusedBoundaryPnu = null;
        state.focusedBoundaryGroup.clearLayers();
        if (mapInstance.hasLayer(state.focusedBoundaryGroup)) mapInstance.removeLayer(state.focusedBoundaryGroup);

        features.forEach(feature => {
            const coordinates = feature.geometry.coordinates;
            const latLng = L.latLng(Number(coordinates[1]), Number(coordinates[0]));
            if (!Number.isFinite(latLng.lat) || !Number.isFinite(latLng.lng)) return;
            const properties = feature.properties || {};
            const ownerKey = properties._ownerKey || 'municipal';
            const isExcluded = Boolean(candidateReview(feature)?.is_excluded);
            const isPriority = properties.solar_candidate === 'Y' || Number(properties.priority_score || 0) >= 60;
            const marker = L.marker(latLng, {
                icon: markerIcon(ownerKey, isPriority, isExcluded, properties.installed_solar_match === true),
                title: properties.address || '경기도 국공유지 후보',
                keyboard: true,
                riseOnHover: true,
                bubblingMouseEvents: false
            });
            marker.on('click', event => {
                if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
                if (typeof window.clearMapClickSelection === 'function') window.clearMapClickSelection();
                showFocusedParcelBoundary(feature, { fit: true });
            });
            marker.bindPopup(() => buildPopup(feature, latLng), { maxWidth: 340 });
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
        state.currentInstalledSolarCount = features.filter(feature => feature?.properties?.installed_solar_match === true).length;
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
        const installedSummary = state.currentInstalledSolarCount
            ? ` · 기설치 공개자료 PNU 일치 ${numberFormat.format(state.currentInstalledSolarCount)}필지(청록색 중심점)`
            : '';
        const prefix = ownerSummary ? `${ownerSummary} · ` : '';
        const clusterSummary = state.currentFeatures.length > 1
            ? ' · 여러 필지는 확대 전 숫자 원으로 묶이며 숫자 원을 누르면 확대됩니다.'
            : '';
        const modeSummary = state.resultMode === 'keyword' ? '지번 빠른 찾기 · ' : '';
        setStatus(`${modeSummary}${prefix}총 ${numberFormat.format(state.currentFeatures.length)}필지 표시${reviewSummary}${installedSummary} · 금색 테두리는 우선 검토 후보입니다.${clusterSummary}`);
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
            if (!filters.municipalities.size) {
                setStatus('시·군을 한 개 이상 선택해 주세요.', 'error');
                return;
            }
            const pairs = selectedPartitionPairs(filters);
            const supportingLoads = [ensureReviewAccess()];
            if (filters.showTop30 && filters.owners.has('municipal') && filters.municipalities.has('41460')) supportingLoads.push(loadTop30());
            await Promise.all([loadSelectedPartitions(pairs), ...supportingLoads]);

            const deduplicated = new Map();
            for (const { municipalityCode, ownerKey } of pairs) {
                const collection = state.candidatesByPartition.get(partitionKey(municipalityCode, ownerKey));
                for (const feature of collection?.features || []) {
                    const pnu = String(feature?.properties?.pnu || '');
                    if (pnu && !deduplicated.has(pnu)) deduplicated.set(pnu, feature);
                }
            }
            const filteredFeatures = [...deduplicated.values()].filter(feature => matchesFilters(feature, filters));
            state.resultMode = 'filter';
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
    window.togglePublicLandScoreHelp = togglePublicLandScoreHelp;
    window.searchPublicLandCandidates = searchPublicLandCandidates;
    window.searchPublicLandByKeyword = searchPublicLandByKeyword;
    window.fitPublicLandResults = fitPublicLandResults;
    console.log('[Version] v1.7.1 | yongin-city-land-map.js | single-line compact ownership source row');
})();
