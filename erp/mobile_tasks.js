/* v1.0.0 — DOM-only responsive labels; never fetches, saves or caches business data. */
(function () {
  'use strict';
  function start() {
    const task = document.body.dataset.erpMobileTask;
    if (task === 'member' && new URLSearchParams(location.search).get('scope') !== 'member_admin') {
      delete document.body.dataset.erpMobileTask;
      return;
    }
    const selectors = task === 'member'
      ? ['#memberListBody', '#appListBody', '#member-information-list-body']
      : task === 'festival'
        ? ['#salesRows', '#receiptRows', '#voucherRows', '#movementRows', '#eventInventoryRows', '#dashboardRows']
        : [];
    selectors.forEach(function (selector) {
      const body = document.querySelector(selector);
      const table = body?.closest('table');
      if (!table) return;
      table.classList.add('erp-mobile-card-table');
      const labelRows = function () {
        const headers = Array.from(table.tHead?.rows[0]?.cells || []).map(cell => cell.textContent.trim());
        Array.from(body.rows).forEach(function (row) {
          Array.from(row.cells).forEach(function (cell, index) {
            const label = cell.colSpan === 1 && cell.rowSpan === 1 ? headers[index] || '' : '';
            if (cell.dataset.mobileLabel !== label) {
              if (label) cell.dataset.mobileLabel = label;
              else delete cell.dataset.mobileLabel;
            }
          });
        });
      };
      labelRows();
      // Only observe the paginated list; attribute labels cannot retrigger this observer.
      new MutationObserver(labelRows).observe(body, { childList: true, subtree: true });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
