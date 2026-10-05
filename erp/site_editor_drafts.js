/* v1.0.0 — page-memory drafts only; no storage, network or authorization changes. */
(function (root) {
  'use strict';
  function create(read, notify = () => {}) {
    let loaded = false, loading = false, busy = false, pending = null;
    let baseline = read(), last = baseline, revision = 0;
    function refresh() {
      const current = read();
      if (current !== last) { revision++; last = current; }
      const status = { loaded, loading, busy, dirty: current !== baseline };
      notify(status);
      return status;
    }
    function accept() {
      loaded = true;
      baseline = last = read();
      revision++;
      return refresh();
    }
    function load(fetchValue, apply) {
      const state = refresh();
      if (state.loaded || state.dirty || busy) return Promise.resolve(false);
      if (pending) return pending;
      const ticket = revision;
      loading = true;
      refresh();
      pending = Promise.resolve().then(fetchValue).then(value => {
        // Check the current form as well as events: programmatic edits also count.
        const current = refresh();
        if (ticket !== revision || current.dirty || busy) return false;
        apply(value);
        accept();
        return true;
      }).finally(() => {
        loading = false;
        pending = null;
        refresh();
      });
      return pending;
    }
    function setBusy(value) { busy = !!value; return refresh(); }
    return Object.freeze({ refresh, accept, load, setBusy });
  }
  root.SiteEditorDrafts = Object.freeze({ create });
})(window);
