/* Homepage demand loader v1.0.2. Public reads only; no persistence or Auth cache. */
(function (host) {
  'use strict';
  function create(options) {
    const jobs = new Map(), queue = [];
    let active = 0, started = false, stopped = false, scheduled = false;
    const limit = 2, margin = 400;
    const nodes = job => job.targets.map(id => document.getElementById(id)).filter(Boolean);
    const statusNodes = job => (job.statusTargets || job.targets).map(id => document.getElementById(id)).filter(Boolean);
    // Empty progress sections intentionally stay hidden until their first read.
    // Watch the end of the preceding visible section without exposing empty UI.
    function boundaries(job) {
      return (job.boundaryTargets || []).map(id => {
        let node = document.getElementById(id)?.previousElementSibling;
        while (node && (node.hidden || getComputedStyle(node).display === 'none')) node = node.previousElementSibling;
        return node;
      }).filter(Boolean);
    }
    const allowed = job => !stopped && options.enabled(job);
    function near(job) {
      return nodes(job).some(node => {
        if (node.hidden || getComputedStyle(node).display === 'none') return false;
        const r = node.getBoundingClientRect();
        return r.height > 0 && r.bottom >= -margin && r.top <= innerHeight + margin;
      }) || boundaries(job).some(node => {
        const r = node.getBoundingClientRect();
        return r.height > 0 && r.bottom >= -margin && r.bottom <= innerHeight + margin;
      });
    }
    function status(job, state) {
      for (const node of statusNodes(job)) {
        node.dataset.homeLoadState = state;
        node.setAttribute('aria-busy', String(state === 'loading'));
        let row = node.querySelector(`[data-home-read-status="${job.key}"]`);
        if (state !== 'failed') {
          if (state === 'loading' && row) {
            const retry = row.querySelector('button');
            retry.setAttribute('aria-disabled', 'true');
            retry.setAttribute('aria-busy', 'true');
            retry.classList.add('disabled');
            retry.textContent = '확인 중…';
          } else row?.remove();
          continue;
        }
        if (row) {
          const retry = row.querySelector('button');
          retry.setAttribute('aria-disabled', 'false');
          retry.setAttribute('aria-busy', 'false');
          retry.classList.remove('disabled');
          retry.textContent = '다시 확인';
          continue;
        }
        row = document.createElement('div');
        row.dataset.homeReadStatus = job.key;
        row.className = 'home-read-status container py-3';
        const text = document.createElement('span');
        text.textContent = '자료를 불러오지 못했습니다. ';
        const retry = document.createElement('button');
        retry.type = 'button'; retry.className = 'btn btn-sm btn-outline-secondary';
        retry.textContent = '다시 확인';
        retry.onclick = () => { if (retry.getAttribute('aria-disabled') !== 'true') void load(job.key, true); };
        row.append(text, retry); node.append(row);
      }
    }
    async function pump() {
      if (!started || stopped) return;
      while (active < limit && queue.length) {
        const job = queue.shift();
        if (!allowed(job) || (!job.explicit && !options.eager && !near(job))) {
          job.state = 'waiting'; job.resolve?.(false); job.promise = null;
          continue;
        }
        active++; job.state = 'loading'; status(job, 'loading');
        const controller = new AbortController();
        const attempt = { signal: controller.signal, isCurrent: () => allowed(job) && job.attempt === attempt && !controller.signal.aborted };
        job.attempt = attempt;
        job.cancel = () => controller.abort();
        let timer;
        const expired = new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(Error('PUBLIC_READ_CANCELLED')), { once: true });
          // The connected power monitor has its own bounded shared request.
          if (job.timeoutMs !== 0) timer = host.setTimeout(() => controller.abort(), 15000);
        });
        Promise.race([Promise.resolve().then(() => job.run(attempt)), expired]).then(result => {
          if (!attempt.isCurrent()) { job.state = 'waiting'; job.resolve?.(false); return; }
          if (result === false) throw Error('PUBLIC_READ_FAILED');
          job.state = 'ready'; status(job, 'ready'); job.resolve?.(true);
          options.onSettled?.(job);
        }).catch(() => {
          if (stopped || job.attempt !== attempt) return;
          job.state = 'failed'; status(job, 'failed'); job.resolve?.(false);
        }).finally(() => {
          host.clearTimeout(timer);
          active--; job.promise = null; job.resolve = null; job.cancel = null;
          void pump();
        });
      }
    }
    function load(key, explicit = false) {
      const job = jobs.get(key);
      if (!job || !allowed(job)) return Promise.resolve(false);
      if (job.state === 'ready') return Promise.resolve(true);
      if (job.promise) { if (explicit) job.explicit = true; return job.promise; }
      if (job.state === 'failed' && !explicit) return Promise.resolve(false);
      job.explicit = explicit; job.state = 'queued';
      job.promise = new Promise(resolve => { job.resolve = resolve; });
      if (explicit) queue.unshift(job); else queue.push(job);
      void pump(); return job.promise;
    }
    function area(id) {
      for (const job of jobs.values()) if (job.targets.includes(id)) void load(job.key, true);
    }
    function scan() {
      if (!started || stopped || scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        for (const job of jobs.values()) if (near(job)) void load(job.key);
      });
    }
    function hash() {
      let id; try { id = decodeURIComponent(location.hash.slice(1)); } catch (_) { return; }
      if (id) area(id);
    }
    function click(event) {
      const link = event.target.closest?.('a[href]');
      if (!link || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      try {
        const url = new URL(link.href, location.href);
        if (url.origin === location.origin && url.pathname.replace(/index\.html$/, '') === location.pathname.replace(/index\.html$/, '') && url.hash) area(decodeURIComponent(url.hash.slice(1)));
      } catch (_) {}
    }
    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(scan, { rootMargin: margin + 'px' }) : null;
    for (const config of options.jobs) {
      const job = { ...config, state: 'waiting', explicit: false, promise: null, resolve: null };
      jobs.set(job.key, job);
    }
    function start() {
      if (started || stopped) return;
      started = true;
      if (options.eager) for (const job of jobs.values()) void load(job.key, true);
      else {
        for (const job of jobs.values()) for (const node of [...nodes(job), ...boundaries(job)]) observer?.observe(node);
        host.addEventListener('scroll', scan, { passive: true });
        host.addEventListener('resize', scan, { passive: true });
        host.addEventListener('hashchange', hash);
        document.addEventListener('click', click);
        hash(); scan();
      }
    }
    function dispose() {
      stopped = true; observer?.disconnect();
      host.removeEventListener('scroll', scan); host.removeEventListener('resize', scan);
      host.removeEventListener('hashchange', hash); document.removeEventListener('click', click);
      for (const job of jobs.values()) { job.resolve?.(false); job.cancel?.(); }
      queue.length = 0;
    }
    return Object.freeze({ start, load, area, scan, dispose });
  }
  host.CoopHomeProgressive = Object.freeze({ create });
})(window);
