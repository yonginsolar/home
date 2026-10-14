/* v1.0.0 — Keep already-issued deposit links on the same tenant's payment guide. */
(function () {
  'use strict';
  const target = new URL('pay.html', window.location.href);
  const query = new URLSearchParams(window.location.search);
  for (const key of ['amount', 'name']) {
    const value = query.get(key);
    if (value !== null) target.searchParams.set(key, value.slice(0, key === 'name' ? 100 : 20));
  }
  const link = document.getElementById('depositContinue');
  if (link) link.href = target.href;
  window.location.replace(target.href);
})();
