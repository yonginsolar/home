/* v1.0.3 — Public-only homepage adapter. Never reads monitor administration tables. */
(function (global) {
  'use strict';

  // Explicit opt-in: public host AND server-resolved cooperative must match.
  // This selects already-public data; server-side public/private filtering remains authoritative.
  const HCREC = Object.freeze({
    coopId: '4e2b5e2a-79b1-4beb-a4ec-8797ebe23028',
    coopName: '화성시민재생에너지발전협동조합',
    hosts: Object.freeze(['hcrec.kr', 'www.hcrec.kr']),
    slug: 'hwaseong-renewable-energy',
    url: 'https://monitor.hcrec.kr/'
  });
  const doc = global.document;
  const numberFormat = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });
  const normalHost = value => String(value || '').trim().toLowerCase().replace(/\.$/, '');
  const number = value => value !== null && value !== undefined && value !== ''
    && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  const formatted = value => number(value) === null ? '—' : numberFormat.format(Number(value));
  const kstDay = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(date);
  };
  const timeLabel = value => {
    const date = new Date(value);
    return !value || Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(date);
  };
  const sum = values => values.length && values.every(value => value !== null)
    ? values.reduce((total, value) => total + value, 0) : null;
  const metric = (plant, field) => ['live', 'stale'].includes(plant.data_state)
    ? number(plant[field]) : null;
  const todayValue = (plant, today) => plant.fetched_at && kstDay(plant.fetched_at) === today
    ? metric(plant, 'today_kwh') : null;

  function monthValue(plant, now) {
    const today = kstDay(now);
    const dayCount = Number(today.slice(-2));
    const prefix = today.slice(0, 8);
    const days = new Map();
    for (const row of Array.isArray(plant.monthly_generation) ? plant.monthly_generation : []) {
      if (typeof row?.date === 'string' && row.date.startsWith(prefix) && row.date <= today) {
        days.set(row.date, number(row.kwh));
      }
    }
    // Use the latest today's value, not an older daily-history collection.
    const latestToday = todayValue(plant, today);
    if (latestToday !== null) days.set(today, latestToday);
    const values = [];
    for (let day = 1; day <= dayCount; day += 1) {
      const value = days.get(prefix + String(day).padStart(2, '0'));
      if (value === undefined || value === null) return null;
      values.push(value);
    }
    return sum(values);
  }

  function element(tag, className, text) {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function create(options) {
    if (!options?.context || !options.client || !HCREC.hosts.includes(normalHost(options.hostname))
      || String(options.context.coop_id) !== HCREC.coopId) return null;
    const status = doc.getElementById('status');
    const portfolio = doc.getElementById('portfolio');
    const container = doc.getElementById('power-plants-container');
    if (!status || !container) return null;
    status.classList.add('public-monitor-connected');
    portfolio?.classList.add('public-monitor-connected');
    const dayLabel = doc.getElementById('power-stat-day-label');
    if (dayLabel) dayLabel.textContent = '오늘 발전량';
    const stamp = doc.getElementById('public-power-stats-timestamp');
    const toolbar = element('div', 'public-monitor-toolbar');
    const link = element('a', 'btn btn-sm btn-outline-primary rounded-pill', '발전 모니터 보기');
    link.href = HCREC.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    const retry = element('button', 'btn btn-sm btn-outline-secondary rounded-pill', '다시 불러오기');
    retry.type = 'button';
    retry.hidden = true;
    toolbar.append(link, retry);
    stamp?.after(toolbar);
    const statusMessage = element('div', 'public-monitor-message');
    statusMessage.setAttribute('role', 'status');
    toolbar.after(statusMessage);
    let inFlight = null;
    let timer = null;
    let lastLoaded = 0;
    let hasData = false;
    let interval = 180000;
    let disposed = false;

    function writeStats(values) {
      ['power-stat-latest-day-kwh', 'power-stat-month-kwh', 'power-stat-cumulative-kwh', 'power-stat-operating-count']
        .forEach((id, index) => {
          const el = doc.getElementById(id);
          if (el) el.textContent = formatted(values[index]);
        });
    }
    writeStats([null, null, null, null]);
    if (stamp) stamp.textContent = '발전 현황을 불러오는 중';
    container.replaceChildren(element('div', 'col-12 text-center py-4', '발전소 현황을 불러오는 중입니다.'));

    function render(data) {
      const plants = data.plants;
      const now = Date.now();
      const today = kstDay(now);
      writeStats([sum(plants.map(p => todayValue(p, today))), sum(plants.map(p => monthValue(p, now))),
        sum(plants.map(p => metric(p, 'lifetime_kwh'))), plants.length]);
      const updated = timeLabel(data.last_updated);
      if (stamp) stamp.textContent = updated ? `${updated} 기준` : '발전량 수집 대기 중';
      const delayed = plants.some(p => !p.fetched_at || p.data_state !== 'live'
        || !Number.isFinite(Date.parse(p.fetched_at)) || now - Date.parse(p.fetched_at) > 600000);
      statusMessage.textContent = delayed ? '일부 발전소의 최신 자료를 기다리고 있습니다.' : '';
      const fragment = doc.createDocumentFragment();
      if (!plants.length) fragment.append(element('div', 'col-12 text-center py-4', '현재 공개된 운영 발전소가 없습니다.'));
      plants.forEach(plant => {
        const cell = element('div', 'col-lg-6 col-md-6 mb-4');
        const card = element('article', 'public-monitor-plant');
        const heading = element('div', 'public-monitor-plant-heading');
        const icon = element('i', 'bi bi-sun public-monitor-plant-icon');
        icon.setAttribute('aria-hidden', 'true');
        const title = element('div', 'public-monitor-plant-title');
        title.append(element('h3', '', plant.full_name || plant.short_name || '태양광 발전소'));
        const location = String(plant.location_label || '').trim();
        if (location) title.append(element('p', 'public-monitor-location', location));
        heading.append(icon, title);
        card.append(heading);
        const details = element('dl', 'public-monitor-metrics');
        [['설비 용량', plant.capacity_kw, 'kW'], ['오늘 발전량', todayValue(plant, today), 'kWh'],
          ['현재 출력', metric(plant, 'current_kw'), 'kW'], ['누적 발전량', metric(plant, 'lifetime_kwh'), 'kWh']]
          .forEach(([label, value, unit]) => {
            const group = element('div');
            group.append(element('dt', '', label), element('dd', '', `${formatted(value)} ${unit}`));
            details.append(group);
          });
        card.append(details);
        const fetched = timeLabel(plant.fetched_at);
        if (fetched) card.append(element('p', 'public-monitor-plant-time', `${fetched} 기준`));
        cell.append(card);
        fragment.append(cell);
      });
      container.replaceChildren(fragment);
      retry.hidden = true;
      hasData = true;
    }

    const sectionsVisible = () => [status, portfolio].some(el => el && !el.hidden
      && global.getComputedStyle(el).display !== 'none');
    function schedule() {
      global.clearTimeout(timer);
      if (!disposed) timer = global.setTimeout(() => {
        if (!doc.hidden && sectionsVisible()) refresh();
        else schedule();
      }, interval);
    }
    function refresh(force) {
      if (disposed) return Promise.resolve();
      if (inFlight) return inFlight;
      if (!force && hasData && Date.now() - lastLoaded < interval) return Promise.resolve();
      retry.disabled = true;
      inFlight = (async () => {
        const controller = new AbortController();
        const timeout = global.setTimeout(() => controller.abort(), 20000);
        try {
          const response = await options.client.rpc('get_public_power_monitor', { p_slug: HCREC.slug }).abortSignal(controller.signal);
          if (disposed) return;
          if (response.error) throw new Error('PUBLIC_MONITOR_READ_FAILED');
          const data = response.data;
          if (!data || data.slug !== HCREC.slug || data.coop_name !== HCREC.coopName || !Array.isArray(data.plants)
            || data.plants.some(p => !p || typeof p !== 'object')) {
            // A successful empty response can mean publication was withdrawn.
            // Do not keep a formerly public snapshot after that response.
            hasData = false;
            lastLoaded = 0;
            throw new Error('PUBLIC_MONITOR_RESPONSE_INVALID');
          }
          interval = Math.max(180, Math.min(3600, Number(data.refresh_seconds) || 180)) * 1000;
          render(data);
          lastLoaded = Date.now();
        } catch (_) {
          if (disposed) return;
          statusMessage.textContent = hasData ? '갱신이 지연되어 마지막으로 확인한 자료를 보여드립니다.'
            : '발전 현황을 불러오지 못했습니다.';
          if (!hasData) {
            writeStats([null, null, null, null]);
            if (stamp) stamp.textContent = '발전 현황 확인 중';
            container.replaceChildren(element('div', 'col-12 text-center py-4', '발전소 현황을 불러오지 못했습니다.'));
          }
          retry.hidden = false;
        } finally {
          global.clearTimeout(timeout);
        }
      })().finally(() => {
        inFlight = null;
        retry.disabled = false;
        schedule();
      });
      return inFlight;
    }
    const onVisible = () => { if (!doc.hidden && sectionsVisible()) refresh(); };
    const onPageHide = () => global.clearTimeout(timer);
    const onPageShow = () => { schedule(); onVisible(); };
    retry.addEventListener('click', () => refresh(true));
    doc.addEventListener('visibilitychange', onVisible);
    global.addEventListener('pagehide', onPageHide);
    global.addEventListener('pageshow', onPageShow);
    function destroy() {
      disposed = true;
      global.clearTimeout(timer);
      doc.removeEventListener('visibilitychange', onVisible);
      global.removeEventListener('pagehide', onPageHide);
      global.removeEventListener('pageshow', onPageShow);
    }
    return Object.freeze({ refresh, destroy });
  }

  global.CoopPublicPowerMonitor = Object.freeze({ create });
})(window);
