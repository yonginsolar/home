/* v1.0.1: Static operation labels and non-personal error codes only. */
(function (global) {
  'use strict';
  function summary(value) {
    var result = {};
    if (!value || typeof value !== 'object') return result;
    try {
      // Never serialize message/details/hint, response bodies, URLs or sessions.
      var code = typeof value.code === 'string' ? value.code : '';
      if (/^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(code)) result.code = code;
      if (Number.isInteger(value.status) && value.status >= 100 && value.status <= 599) result.status = value.status;
    } catch (_) { /* A diagnostic must not break the actual workflow. */ }
    return result;
  }
  function write(level, operation, value) {
    // Callers supply source-code literals, never user-generated operation labels.
    var label = typeof operation === 'string' ? operation : 'operation failed';
    var safe = summary(value);
    try {
      if (global.console && typeof global.console[level] === 'function') {
        global.console[level](label + (Object.keys(safe).length ? ' ' + JSON.stringify(safe) : ''));
      }
    } catch (_) { /* Logging is best effort. */ }
  }
  global.CoopSafeLog = Object.freeze({
    summary: summary,
    warn: function (operation, value) { write('warn', operation, value); },
    error: function (operation, value) { write('error', operation, value); }
  });
})(window);
