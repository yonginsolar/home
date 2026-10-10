/* Explicit opt-in amount/count inputs. Display only; no API, persistence or permissions. */
(function (global) {
  'use strict';
  const selector = 'input[data-number-group]', states = new WeakMap();
  const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const raw = value => value == null ? value : String(value).replace(/,/g, '');
  function format(value) {
    const text = raw(value) ?? '';
    if (!/^-?\d*(?:\.\d*)?$/.test(text) || !/\d/.test(text)) return text;
    const [integer, fraction] = text.split('.');
    const sign = integer.startsWith('-') ? '-' : '';
    const digits = integer.replace(/^-/, '').replace(/^0+(?=\d)/, '');
    return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction === undefined ? '' : '.' + fraction);
  }
  function validate(el, state) {
    const value = raw(el.value);
    for (const attr of ['min', 'max', 'step', 'required']) {
      if (el.hasAttribute(attr)) state.probe.setAttribute(attr, el.getAttribute(attr));
      else state.probe.removeAttribute(attr);
    }
    state.probe.value = value;
    const numeric = Number(value);
    const invalid = value !== '' && (!/^-?\d+(?:\.\d*)?$/.test(value) || !Number.isFinite(numeric) || Math.abs(numeric) > Number.MAX_SAFE_INTEGER);
    el.setCustomValidity(invalid ? '숫자를 확인해 주세요.' : state.probe.validationMessage);
  }
  const snapshot = el => ({value:el.value, start:el.selectionStart, end:el.selectionEnd});
  function init(el) {
    if (!el.matches?.(selector)) return null;
    if (states.has(el)) return states.get(el);
    const value = el.value, probe = document.createElement('input'); probe.type = 'number';
    const state = {probe, undo:[], redo:[], replay:false}; states.set(el, state);
    el.type = 'text'; el.inputMode = el.getAttribute('step') && !/^\d+$/.test(el.getAttribute('step')) ? 'decimal' : 'numeric';
    // Only this explicitly opted-in node: the native getter still returns the visible text.
    Object.defineProperty(el, 'value', {configurable:true, get(){return nativeValue.get.call(this);}, set(value){
      nativeValue.set.call(this, format(value)); validate(this, state);
      if (!state.replay) {state.undo.length = 0; state.redo.length = 0;}
    }});
    el.value = value; return state;
  }
  function refresh(root = document) {
    if (root.matches?.(selector)) init(root);
    root.querySelectorAll?.(selector).forEach(init);
  }
  function caret(text, offset) {
    if (!offset) return 0;
    let count = 0;
    for (let i=0; i<text.length; i++) if (text[i] !== ',' && ++count === offset) return i+1;
    return text.length;
  }
  function render(el, state) {
    const before = el.value, start = raw(before.slice(0, el.selectionStart)).length, end = raw(before.slice(0, el.selectionEnd)).length;
    const next = format(before);
    if (next !== before) {
      nativeValue.set.call(el, next);
      el.setSelectionRange(caret(next, start), caret(next, end));
    }
    validate(el, state);
  }
  document.addEventListener('focusin', event => init(event.target), true);
  document.addEventListener('beforeinput', event => {
    const el = event.target, state = init(el);
    if (!state || state.replay || el.disabled || el.readOnly || event.isComposing) return;
    state.undo.push(snapshot(el)); if (state.undo.length > 64) state.undo.shift(); state.redo.length = 0;
    const at = el.selectionStart;
    if (at === el.selectionEnd && event.inputType === 'deleteContentBackward' && el.value[at-1] === ',') el.setSelectionRange(Math.max(0, at-2), at);
    if (at === el.selectionEnd && event.inputType === 'deleteContentForward' && el.value[at] === ',') el.setSelectionRange(at, at+2);
  }, true);
  document.addEventListener('input', event => {
    const state = init(event.target); if (state && !event.isComposing) render(event.target, state);
  }, true);
  document.addEventListener('compositionend', event => {const state=init(event.target);if(state)render(event.target,state);}, true);
  document.addEventListener('keydown', event => {
    const el=event.target, state=states.get(el);
    if (!state || el.disabled || el.readOnly || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key=event.key.toLowerCase(), undo=key==='z'&&!event.shiftKey, redo=key==='y'||(key==='z'&&event.shiftKey);
    if (!undo && !redo) return;
    const from=undo?state.undo:state.redo, to=undo?state.redo:state.undo;
    // Native history cannot safely replay text rewritten for thousands separators.
    event.preventDefault(); if (!from.length) return;
    const next=from.pop(); to.push(snapshot(el)); state.replay=true;
    nativeValue.set.call(el,next.value);el.setSelectionRange(next.start,next.end);validate(el,state);
    el.dispatchEvent(new Event('input',{bubbles:true}));state.replay=false;
  }, true);
  document.addEventListener('submit', event => {
    refresh(event.target);
    event.target.querySelectorAll(selector).forEach(el=>validate(el,states.get(el)));
    if (!event.target.checkValidity()) {event.preventDefault();event.stopImmediatePropagation();event.target.reportValidity();}
  }, true);
  document.addEventListener('reset', event => queueMicrotask(()=>{
    event.target.querySelectorAll(selector).forEach(el=>{const state=init(el);el.value=el.value;state.undo.length=0;state.redo.length=0;});
  }), true);
  global.ERPNumberInput = Object.freeze({raw, format, refresh});
  const start=()=>{
    refresh();
    new MutationObserver(records=>records.forEach(record=>{
      if (record.type==='childList') record.addedNodes.forEach(refresh);
      else if (record.target.matches?.(selector)) {const state=init(record.target);validate(record.target,state);}
    })).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['min','max','step','required']});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})(window);
