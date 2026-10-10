/* Dashboard-only code; shared Auth, tenant state and RPC paths remain in core. */
(function (root) {
    'use strict';
function buildMonthLabels(monthCount = 12) {
    const labels = [];
    const now = new Date();
    for (let i = monthCount - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        labels.push(ym);
    }
    return labels;
}

async function fetchMonthlyCapitalInflow(monthCount = 12) {
    try {
        const labels = buildMonthLabels(monthCount);
        const start = labels[0] + '-01';

        const { data, error } = await scopeAdminTenant(_supabase
            .from('ref_members')
            .select('deposit_date, amount'))
            .gte('deposit_date', start)
            .order('deposit_date', { ascending: true });

        if (error || !data) return null;

        const totals = new Map();
        labels.forEach(l => totals.set(l, 0));

        data.forEach(row => {
            if (!row.deposit_date) return;
            const key = String(row.deposit_date).substring(0, 7);
            if (!totals.has(key)) return;
            const amt = Number(row.amount || 0);
            if (amt <= 0) return; // 감자/환급 등 음수는 제외
            totals.set(key, totals.get(key) + amt);
        });

        return {
            labels,
            totals: labels.map(l => totals.get(l) || 0)
        };
    } catch (e) {
        return null;
    }
}

async function fetchPendingApplicationCount() {
    const { count, error } = await scopeAdminTenant(_supabase
        .from('coop_applications')
        .select('*', { count: 'exact', head: true }))
        .eq('status', 'pending');
    if (error) return null;
    return count || 0;
}

const DASHBOARD_YONGIN_LOCATION_LABEL_ORDER = Object.freeze(['수지구', '기흥구', '처인구', '그 외']);

const DASHBOARD_GYEONGGI_LOCATION_LABEL_ORDER = Object.freeze(['경기도내', '그 외']);

const DASHBOARD_LOCATION_COLORS = Object.freeze({
    '수지구': '#0d6efd',
    '기흥구': '#20c997',
    '처인구': '#198754',
    '경기도내': '#ffc107',
    '그 외': '#adb5bd'
});

const DASHBOARD_GYEONGGI_ADDRESS_PATTERNS = Object.freeze([
    '수원시', '수원특례시', '장안구', '권선구', '팔달구', '영통구',
    '성남시', '수정구', '중원구', '분당구',
    '의정부시', '안양시', '만안구', '동안구', '부천시',
    '광명시', '평택시', '동두천시', '안산시', '상록구', '단원구',
    '고양시', '고양특례시', '덕양구', '일산동구', '일산서구',
    '과천시', '구리시', '남양주시', '오산시', '시흥시',
    '군포시', '의왕시', '하남시', '용인시', '용인특례시',
    '파주시', '이천시', '안성시', '김포시', '화성시',
    '화성특례시', '광주시', '양주시', '포천시', '여주시',
    '연천군', '가평군', '양평군'
]);

function isDashboardGyeonggiAddress(address) {
    const normalized = String(address || '').replace(/\s+/g, '');
    if (!normalized) return false;
    if (normalized.includes('경기도') || normalized.startsWith('경기')) return true;
    return DASHBOARD_GYEONGGI_ADDRESS_PATTERNS.some(function (pattern) { return normalized.includes(pattern); });
}

function classifyDashboardYonginLocationAddress(address) {
    const normalized = String(address || '').replace(/\s+/g, '');
    if (normalized.includes('수지구')) return '수지구';
    if (normalized.includes('기흥구')) return '기흥구';
    if (normalized.includes('처인구')) return '처인구';
    return '그 외';
}

function classifyDashboardGyeonggiLocationAddress(address) {
    return isDashboardGyeonggiAddress(address) ? '경기도내' : '그 외';
}

function buildDashboardLocationChartData(locationStats, labelOrder) {
    const source = (locationStats && typeof locationStats === 'object') ? locationStats : {};
    const seenLabels = new Set();
    const orderedEntries = [];

    labelOrder.forEach(function (label) {
        if (!Object.prototype.hasOwnProperty.call(source, label)) return;
        const count = Number(source[label] || 0);
        if (count <= 0) return;
        seenLabels.add(label);
        orderedEntries.push({ label, count });
    });

    Object.keys(source).sort().forEach(function (label) {
        if (seenLabels.has(label)) return;
        const count = Number(source[label] || 0);
        if (count <= 0) return;
        orderedEntries.push({ label, count });
    });

    return {
        labels: orderedEntries.map(function (entry) { return entry.label; }),
        data: orderedEntries.map(function (entry) { return entry.count; }),
        colors: orderedEntries.map(function (entry) { return DASHBOARD_LOCATION_COLORS[entry.label] || '#adb5bd'; })
    };
}

function getDashboardChartDatasetTotal(chart, datasetIndex = 0) {
    const values = chart?.data?.datasets?.[datasetIndex]?.data;
    if (!Array.isArray(values)) return 0;
    return values.reduce(function (total, value) {
        const count = Number(value || 0);
        return total + (Number.isFinite(count) && count > 0 ? count : 0);
    }, 0);
}

function formatDashboardChartCountPercentage(label, count, total) {
    const safeLabel = String(label || '').trim() || '기타';
    const safeCount = Number.isFinite(Number(count)) ? Number(count) : 0;
    const percentage = total > 0 ? (safeCount / total) * 100 : 0;
    return `${safeLabel} ${safeCount.toLocaleString()}명 (${percentage.toFixed(1)}%)`;
}

function buildDashboardDoughnutLegendLabels(chart) {
    const defaultGenerator = Chart.overrides?.[chart.config.type]?.plugins?.legend?.labels?.generateLabels
        || Chart.defaults?.plugins?.legend?.labels?.generateLabels;
    const labels = typeof defaultGenerator === 'function' ? defaultGenerator(chart) : [];
    const total = getDashboardChartDatasetTotal(chart);
    return labels.map(function (item) {
        const count = Number(chart?.data?.datasets?.[item.datasetIndex || 0]?.data?.[item.index] || 0);
        return {
            ...item,
            text: formatDashboardChartCountPercentage(item.text, count, total)
        };
    });
}

function buildDashboardDoughnutTooltipLabel(context) {
    const total = getDashboardChartDatasetTotal(context.chart, context.datasetIndex || 0);
    return formatDashboardChartCountPercentage(context.label, context.raw, total);
}

function buildDashboardAgeChartData(ageStats) {
    const source = (ageStats && typeof ageStats === 'object') ? ageStats : {};
    const totals = {};

    Object.keys(source).forEach(function (label) {
        const count = Number(source[label] || 0);
        if (!Number.isFinite(count) || count <= 0) return;
        const normalizedLabel = label === '0대' || label === '10대' ? '10대' : label;
        totals[normalizedLabel] = (totals[normalizedLabel] || 0) + count;
    });

    const labels = Object.keys(totals).sort(function (a, b) {
        const ageA = Number.parseInt(a, 10);
        const ageB = Number.parseInt(b, 10);
        if (Number.isFinite(ageA) && Number.isFinite(ageB)) return ageA - ageB;
        if (Number.isFinite(ageA)) return -1;
        if (Number.isFinite(ageB)) return 1;
        return a.localeCompare(b, 'ko');
    });

    return {
        labels,
        data: labels.map(function (label) { return totals[label]; })
    };
}

function formatDashboardAgePercentage(count, total) {
    const safeCount = Number.isFinite(Number(count)) ? Number(count) : 0;
    const percentage = total > 0 ? (safeCount / total) * 100 : 0;
    return `${safeCount.toLocaleString()}명 (${percentage.toFixed(1)}%)`;
}

function buildDashboardAgeTooltipLabel(context) {
    if (isAdminMemberSiteProfile()) {
        return formatDashboardAgePercentage(context.raw, getDashboardChartDatasetTotal(context.chart, context.datasetIndex || 0));
    }
    return MemberDemographics.ageTooltip(context);
}

const DASHBOARD_AGE_VALUE_LABEL_PLUGIN = Object.freeze({
    id: 'dashboardAgeValueLabels',
    afterDatasetsDraw: function (chart) {
        const dataset = chart?.data?.datasets?.[0];
        const meta = chart?.getDatasetMeta?.(0);
        if (!dataset || !Array.isArray(dataset.data) || !meta || !Array.isArray(meta.data)) return;

        const total = getDashboardChartDatasetTotal(chart);
        const ctx = chart.ctx;
        if (!ctx || !chart.chartArea) return;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        meta.data.forEach(function (bar, index) {
            const count = Number(dataset.data[index] || 0);
            if (!Number.isFinite(count) || count <= 0) return;

            const percentage = total > 0 ? (count / total) * 100 : 0;
            const x = Number(bar.x);
            const y = Math.max(chart.chartArea.top + 11, Number(bar.y) - 19);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;

            ctx.fillStyle = '#495057';
            ctx.font = '700 12px Pretendard, sans-serif';
            ctx.fillText(`${count.toLocaleString()}명`, x, y);
            ctx.fillStyle = '#6c757d';
            ctx.font = '600 11px Pretendard, sans-serif';
            ctx.fillText(`(${percentage.toFixed(1)}%)`, x, y + 14);
        });

        ctx.restore();
    }
});

async function fetchDashboardLocationStats() {
    const totals = {
        yongin: {},
        gyeonggi: {}
    };
    const pageSize = 1000;
    let from = 0;

    while (true) {
        const { data, error } = await scopeAdminTenant(_supabase
            .from('coop_members')
            .select('address'))
            .eq('status', '정상')
            .range(from, from + pageSize - 1);

        if (error) {
            CoopSafeLog.warn("지역 구성 직접 집계 실패:", error);
            return null;
        }

        const rows = Array.isArray(data) ? data : [];
        rows.forEach(function (row) {
            const yonginLabel = classifyDashboardYonginLocationAddress(row && row.address);
            const gyeonggiLabel = classifyDashboardGyeonggiLocationAddress(row && row.address);
            totals.yongin[yonginLabel] = (totals.yongin[yonginLabel] || 0) + 1;
            totals.gyeonggi[gyeonggiLabel] = (totals.gyeonggi[gyeonggiLabel] || 0) + 1;
        });

        if (rows.length < pageSize) break;
        from += pageSize;
    }

    return totals;
}

function buildFallbackDashboardLocationStats(statsLocation) {
    const source = (statsLocation && typeof statsLocation === 'object') ? statsLocation : {};
    const yongin = {
        '수지구': Number(source['수지구'] || 0),
        '기흥구': Number(source['기흥구'] || 0),
        '처인구': Number(source['처인구'] || 0),
        '그 외': Number(source['그 외'] || source['경기도 관내'] || source['관외'] || 0)
    };
    const gyeonggi = {
        '경기도내': yongin['수지구'] + yongin['기흥구'] + yongin['처인구'] + Number(source['경기도 관내'] || 0),
        '그 외': yongin['그 외']
    };
    return { yongin, gyeonggi };
}

async function loadDashboard() {
    void loadMemberInformationSummary();
    void loadMemberDemographicCharts();
    // PostgREST builders are lazy thenables. Start this request now rather
    // than only after the independent count requests have finished.
    const statsPromise = Promise.resolve(_supabase.rpc('get_dashboard_stats'));
    const monthlyPromise = fetchMonthlyCapitalInflow(12);
    const pendingAppPromise = fetchPendingApplicationCount();
    const returnSummaryPromise = fetchMemberReturnSummary();
    const weekAgoISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const countQuery = () => scopeAdminTenant(_supabase.from('coop_members')
        .select('*', { count: 'exact', head: true }));
    const [fullResult, pendingResult, newResult, capitalResponse] = await Promise.all([
        countQuery().eq('status', '정상'),
        countQuery().eq('status', '승인대기'),
        countQuery().eq('status', '승인대기').gte('created_at', weekAgoISO),
        _supabase.rpc('get_total_capital_secure')
    ]);
    const pendingCount = pendingResult.count;
    const countText = result => result.error ? '확인 필요' : (result.count || 0) + '명';

    // 3. UI 업데이트
    setText('dashboard-total-count', countText(fullResult));
    setText('dash-capital', capitalResponse.error ? '확인 필요' : Number(capitalResponse.data || 0).toLocaleString() + '원');
    setText('dashboard-new-signups', countText(newResult));

    const pendingEl = document.getElementById('dashboard-pending-count');
    if (pendingEl) {
        pendingEl.innerText = countText(pendingResult);
        // 대기자가 있으면 빨간색 강조
        pendingEl.className = pendingCount > 0 ? "display-6 fw-bold mb-0 text-danger" : "display-6 fw-bold mb-0";
    }

    // 1. [신규] 업무 신청 대기 건수 즉시 표시 (탭 클릭 없이)
    const [pendingAppCount, , statsResponse, monthly] = await Promise.all([
        pendingAppPromise, returnSummaryPromise, statsPromise, monthlyPromise
    ]);
    if (typeof pendingAppCount === 'number') updateAppBadges(pendingAppCount);

    // 2. [신규] 통계 차트 데이터 로드
    const { data: stats, error: statError } = statsResponse;

    if (statError) {
        CoopSafeLog.error("통계 로드 실패:", statError);
    } else if (stats) {
        // (1) 월별 출자금 차트 (Line Chart)
        const fallbackMonthly = [...(stats.monthly_capital || [])].reverse();
        const labels = monthly?.labels || fallbackMonthly.map(x => x.month);
        const values = monthly?.totals || fallbackMonthly.map(x => x.total);
        renderChart('capital', 'chart-capital', 'line', {
            labels,
            datasets: [{
                label: '월별 출자금 유입',
                data: values,
                borderColor: '#198754', // Success Color
                backgroundColor: 'rgba(25, 135, 84, 0.1)',
                fill: true,
                tension: 0.3
            }]
        }, `📉 총 감자액(반환): ${Number(stats.capital_reduction || 0).toLocaleString()}원`);

        // Regional and age composition are read-only server aggregates, loaded
        // independently so a failure in unrelated capital statistics cannot block them.
        // Preserve the existing age-only chart for the site/member-only profile.
        if (isAdminMemberSiteProfile()) {
            const ageData = buildDashboardAgeChartData(stats.age_group || {});
            renderChart('age', 'chart-age', 'bar', {
                labels: ageData.labels,
                datasets: [{ label: '조합원 수', data: ageData.data, backgroundColor: '#ffc107' }]
            });
        }

        // (4) 탈퇴 사유 (Horizontal Bar)
        const reasons = stats.exit_reasons || []; // [{reason: '...', count: 1}, ...]
        renderChart('exit', 'chart-exit', 'bar', {
            labels: reasons.map(r => r.reason || '기타'),
            datasets: [{
                label: '건수',
                data: reasons.map(r => r.count),
                backgroundColor: '#dc3545', // Danger Color
            }],
            indexAxis: 'y' // 가로 막대
        });
    }

    // 로그 기록
    logAdminAction('VIEW', '대시보드', '메인 화면 조회');
}

function loadMemberDemographicCharts() {
    return MemberDemographics.load({
        client: _supabase, cacheKey: String(g_adminMemberRuntime?.coop_id || ''),
        enabled: !isAdminMemberSiteProfile(), renderChart,
        clearCharts() { for (const key of ['location','locationGyeonggi','age']) { g_charts[key]?.destroy(); delete g_charts[key]; } }
    });
}

function renderChart(key, canvasId, type, data, titleText = null) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    // 기존 차트가 있으면 삭제 (캔버스 재사용 문제 방지)
    if (g_charts[key]) {
        g_charts[key].destroy();
    }

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: type !== 'bar' || data.indexAxis === 'y', // 막대그래프는 범례 숨김 (깔끔하게)
                position: 'bottom',
                labels: type === 'doughnut'
                    ? { generateLabels: buildDashboardDoughnutLegendLabels }
                    : {}
            },
            tooltip: {
                callbacks: type === 'doughnut'
                    ? { label: buildDashboardDoughnutTooltipLabel }
                    : key === 'age'
                    ? { label: buildDashboardAgeTooltipLabel }
                    : {}
            }
        }
    };

    if (key === 'age') {
        options.layout = { padding: { top: 32 } };
        options.scales = {
            y: {
                beginAtZero: true,
                grace: '18%',
                ticks: { precision: 0 }
            }
        };
    }
    if (type === 'doughnut' && (key === 'location' || key === 'locationGyeonggi')) {
        options.onClick = function (event, elements, chart) {
            if (elements.length) MemberDemographics.openRegion(key === 'location' ? 'yongin' : 'gyeonggi', chart.data.labels[elements[0].index]);
        };
        options.onHover = function (event, elements, chart) { chart.canvas.style.cursor = elements.length ? 'pointer' : 'default'; };
    }
    if (type === 'doughnut' || key === 'age') {
        options.plugins.tooltip.titleFont = { size: 14 };
        options.plugins.tooltip.bodyFont = { size: 14 };
    }

    // 제목이 있으면 추가 (예: 감자액 표시용)
    if (titleText) {
        options.plugins.title = {
            display: true,
            text: titleText,
            align: 'end',
            color: '#dc3545',
            font: { size: 12 }
        };
    }

    g_charts[key] = new Chart(ctx, {
        type: type,
        data: data,
        options: options,
        plugins: key === 'age' ? [DASHBOARD_AGE_VALUE_LABEL_PLUGIN] : []
    });
}

    root.AdminMemberDashboard = Object.freeze({ load: loadDashboard });
})(window);
