/*
Version: v1.0.0
Change: Shared boot guard helpers for success-only cache, single-flight actions, and fatal/transient error classification.
*/
(function attachBootGuard(global) {
  'use strict';

  function getErrorCode(error) {
    if (!error) return '';
    return String(
      error.code ||
      error.error_code ||
      error.statusCode ||
      error.status ||
      ''
    ).trim();
  }

  function getErrorMessage(error) {
    if (!error) return '';
    return String(
      error.message ||
      error.error_description ||
      error.details ||
      error.error ||
      error
    ).trim();
  }

  function matchRule(rule, error, message, code) {
    if (!rule) return false;
    if (typeof rule === 'function') return !!rule(error);
    if (rule instanceof RegExp) return rule.test(message) || rule.test(code);
    if (Array.isArray(rule)) return rule.some((entry) => matchRule(entry, error, message, code));
    const text = String(rule).trim();
    return text === message || text === code;
  }

  function classifyError(error, options) {
    const config = options || {};
    const message = getErrorMessage(error);
    const code = getErrorCode(error);
    const fatalRules = []
      .concat(config.fatalMessages || [])
      .concat(config.fatalCodes || [])
      .concat(config.fatalRules || []);

    if (fatalRules.some((rule) => matchRule(rule, error, message, code))) {
      return 'fatal';
    }
    return 'transient';
  }

  function createSuccessCachedTask(loader) {
    let cachedValue;
    let hasCachedValue = false;
    let inFlight = null;

    async function run(options) {
      const force = !!(options && options.force);
      if (!force && hasCachedValue) return cachedValue;
      if (!force && inFlight) return inFlight;

      inFlight = Promise.resolve()
        .then(() => loader())
        .then((value) => {
          cachedValue = value;
          hasCachedValue = true;
          return value;
        })
        .catch((error) => {
          cachedValue = undefined;
          hasCachedValue = false;
          throw error;
        })
        .finally(() => {
          if (!hasCachedValue) inFlight = null;
        });

      return inFlight;
    }

    function reset() {
      cachedValue = undefined;
      hasCachedValue = false;
      inFlight = null;
    }

    return {
      run,
      reset,
      hasCachedValue: function hasCachedValueFn() {
        return hasCachedValue;
      }
    };
  }

  function createSingleFlightAction(action) {
    let inFlight = null;
    return async function runSingleFlight() {
      if (inFlight) return inFlight;
      const args = arguments;
      inFlight = Promise.resolve()
        .then(() => action.apply(null, args))
        .finally(() => {
          inFlight = null;
        });
      return inFlight;
    };
  }

  global.BootGuard = {
    classifyError,
    createSingleFlightAction,
    createSuccessCachedTask,
    getErrorCode,
    getErrorMessage
  };
})(window);
