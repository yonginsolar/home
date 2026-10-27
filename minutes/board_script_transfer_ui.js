/* Version: v1.0.2 — compare, explicitly select, then edit an unsaved practical script. */
import { compareBoardChairLines, applyBoardChairSelection, labelPracticalScript } from './board_script_transfer.js?v=1.0.2';

export function createBoardScriptTransfer(hooks) {
  const { state, manager, savedRows, editStates, sanitize, value, owner, isCurrent, remember, render, toast } = hooks;
  const $ = id => document.getElementById(id), SOURCE = 'SCENARIO', TARGET = 'SCENARIO_SECRETARIAT';
  let intent = null, opening = false, closing = false, generation = 0;
  const key = type => `${state.current?.id}:${type}`;
  function currentValue(type) { return hooks.currentValue(type); }
  function available() { return state.current?.meeting_type === 'BOARD' && state.current.status !== 'FINAL' && [SOURCE, TARGET].includes(state.activeDocument); }
  function sync() {
    const button = $('transferChairScriptButton');
    button.hidden = !available();
    button.disabled = state.loading || opening || closing || !!intent || manager.hasPending(owner());
    button.textContent = state.activeDocument === SOURCE ? '실무자용에 적용' : '의장용 변경 비교';
    if (!intent) return;
    const count = $('scriptTransferList').querySelectorAll('input:checked').length;
    $('scriptTransferSelection').textContent = `${count}개 선택`;
    $('applyScriptTransferButton').disabled = !!intent.busy || intent.stale || (!count && intent.plan.changes.length > 0);
    $('applyScriptTransferButton').textContent = intent.plan.changes.length ? '선택 반영 후 실무자용 편집' : '실무자용 편집';
  }
  function sameScope(row) {
    return intent === row && generation === row.generation && isCurrent(row.owner) && hooks.epoch() === row.epoch
      && state.activeDocument === row.active && state.currentStep === row.step && !window.frameElement?.hidden;
  }
  function current(row) {
    return sameScope(row) && currentValue(SOURCE) === row.sourceValue && currentValue(TARGET) === row.targetValue;
  }
  function release(row) {
    if (!row || !row.acquired || row.alreadyOwned || row.applied || !isCurrent(row.owner)) { closing = false; sync(); return Promise.resolve(); }
    closing = true; sync();
    return manager.manage(row.owner, TARGET, 'release').then(() => {
      if (isCurrent(row.owner) && !intent && !opening) { editStates.delete(key(TARGET)); hooks.renderEdit(); }
    }).catch(() => {}).finally(() => { closing = false; sync(); });
  }
  function close(restore = true) {
    const row = intent, activeBefore = document.activeElement, target = $('transferChairScriptButton');
    let outside = null;
    try { if (window.frameElement && window.parent.document.activeElement !== window.frameElement) outside = window.parent.document.activeElement; } catch (_) { /* Keep cross-origin focus untouched. */ }
    const mayReturn = restore && !outside && (!activeBefore || activeBefore === document.body || activeBefore === target || $('scriptTransferDialog').contains(activeBefore));
    intent = null; const closedGeneration = ++generation;
    if ($('scriptTransferDialog').open) $('scriptTransferDialog').close();
    if (outside?.isConnected && window.parent.document.activeElement !== outside) outside.focus({preventScroll:true});
    const restoreFocus = () => {
      const active = document.activeElement;
      if (mayReturn && row && generation === closedGeneration && isCurrent(row.owner) && state.activeDocument === row.active && state.currentStep === row.step
        && !window.frameElement?.hidden && target.getClientRects().length && !target.disabled
        && (!active || active === document.body || active === target || $('scriptTransferDialog').contains(active))) target.focus({ preventScroll: true });
    };
    if (row?.busy && !row.applied) { row.cancelled = true; closing = true; }
    else void release(row).then(restoreFocus);
    if (row) row.restoreFocus = restoreFocus;
    sync();
  }
  function renderComparison(row) {
    const list = $('scriptTransferList'); list.replaceChildren();
    for (const change of row.plan.changes) {
      const card = document.createElement('section'); card.className = 'script-transfer-row';
      const label = document.createElement('label'), check = document.createElement('input');
      check.type = 'checkbox'; check.value = String(change.id); check.addEventListener('change', sync);
      const name = document.createElement('span');
      name.textContent = `${change.heading} · ${change.before ? change.after ? '발언 수정' : '의장 발언 삭제' : '의장 발언 추가'}`;
      label.append(check, name); card.append(label);
      if (change.conflict || change.unknown) {
        const warning = document.createElement('p'); warning.className = 'script-transfer-warning';
        warning.textContent = change.conflict ? '양쪽에서 수정한 발언입니다. 비교한 뒤 선택해 주세요.' : '이전 적용 기준이 없는 발언입니다. 현재 내용과 비교해 주세요.';
        card.append(warning);
      }
      const columns = document.createElement('div'); columns.className = 'script-transfer-columns';
      for (const [title, text] of [['현재 실무자용', change.oldText || '(없음)'], ['저장된 의장용', change.newText || '(삭제됨)']]) {
        const box = document.createElement('div'), heading = document.createElement('strong'), paragraph = document.createElement('p');
        heading.textContent = title; paragraph.textContent = text; box.append(heading, paragraph); columns.append(box);
      }
      card.append(columns); list.append(card);
    }
    if (!row.plan.changes.length) {
      const message = document.createElement('p');
      message.textContent = row.plan.skipped.length ? '선택 반영할 수 있는 변경이 없습니다. 아래 진행 구간을 직접 확인해 주세요.'
        : '의장용에서 새로 반영할 변경이 없습니다. 실무자용 편집을 이어갈 수 있습니다.';
      list.append(message);
    }
    if (row.plan.skipped.length) {
      const message = document.createElement('p'); message.className = 'script-transfer-warning';
      message.textContent = `직접 확인할 부분: ${row.plan.skipped.join(' / ')}`; list.append(message);
    }
    $('scriptTransferError').textContent = ''; sync();
  }
  async function open() {
    if (opening || closing || intent || !available() || manager.hasPending(owner())) return;
    remember();
    if (state.pendingDocuments.has(SOURCE) || (state.activeDocument === SOURCE && state.documentDirty)) throw new Error('의장용 시나리오를 먼저 저장한 뒤 실무자용에 적용해 주세요.');
    if (!savedRows.get(SOURCE)?.content_html) throw new Error('의장용 시나리오를 먼저 저장해 주세요.');
    const row = { owner: owner(), generation: ++generation, epoch: hooks.epoch(), active: state.activeDocument, step: state.currentStep,
      sourceValue: currentValue(SOURCE), targetValue: currentValue(TARGET), alreadyOwned: manager.owned(owner(), TARGET) };
    const stillOpening = () => generation === row.generation && isCurrent(row.owner) && hooks.epoch() === row.epoch
      && state.activeDocument === row.active && state.currentStep === row.step && currentValue(SOURCE) === row.sourceValue && currentValue(TARGET) === row.targetValue;
    opening = true; sync();
    try {
      const source = await manager.manage(row.owner, SOURCE, 'status');
      if (!stillOpening()) return;
      if (value(source.document) !== value(savedRows.get(SOURCE))) {
        throw new Error('저장된 의장용이 바뀌었습니다. 의장용의 편집에서 최신 문서를 확인한 뒤 다시 비교해 주세요.');
      }
      const target = await manager.manage(row.owner, TARGET, 'acquire');
      row.acquired = target.owned;
      if (!stillOpening()) { release(row); return; }
      editStates.set(key(TARGET), target);
      if (!target.owned) throw new Error(`${target.holder_name || '다른 담당자'} 님이 실무자용을 편집 중입니다.`);
      if (value(target.document) !== value(savedRows.get(TARGET))) {
        throw new Error('실무자용의 저장 내용이 바뀌었습니다. 실무자용의 편집에서 최신 문서와 초안을 확인한 뒤 다시 비교해 주세요.');
      }
      row.sourceSaved = value(source.document); row.targetSaved = value(target.document);
      row.plan = compareBoardChairLines(source.document.content_html, state.documents.get(TARGET)?.content_html || '', sanitize);
      intent = row; renderComparison(row); $('scriptTransferDialog').showModal();
      $('cancelScriptTransferButton').focus({ preventScroll: true });
    } catch (error) {
      release(row);
      if (stillOpening()) throw error;
    } finally { opening = false; sync(); hooks.renderEdit(); }
  }
  async function apply() {
    const row = intent;
    if (!row || row.busy || row.stale || !current(row)) return;
    const selected = [...$('scriptTransferList').querySelectorAll('input:checked')].map(node => Number(node.value));
    if (!selected.length && row.plan.changes.length) return;
    row.busy = true; sync();
    try {
      const target = await manager.manage(row.owner, TARGET, 'renew');
      if (!current(row)) return;
      const source = await manager.manage(row.owner, SOURCE, 'status');
      if (!current(row)) return;
      if (!target.owned || !manager.owned(row.owner, TARGET)) throw new Error('실무자용의 편집권을 다시 확인해 주세요.');
      if (value(source.document) !== row.sourceSaved || value(target.document) !== row.targetSaved)
        throw new Error('비교하는 동안 저장된 문서가 바뀌었습니다. 닫은 뒤 최신 문서를 확인하고 다시 비교해 주세요.');
      const html = labelPracticalScript(applyBoardChairSelection(row.plan, selected, sanitize), sanitize);
      const existing = state.documents.get(TARGET) || {};
      state.documents.set(TARGET, { ...existing, document_type: TARGET,
        title: String(existing.title || hooks.defaultTitle(TARGET)).replace(/사무국장용 진행 시나리오$/, '실무자용 진행 시나리오'),
        content_html: html, manually_edited: true });
      state.pendingDocuments.add(TARGET); row.applied = true;
      close(false); state.activeDocument = TARGET; render(); state.documentDirty = true;
      $('documentEditor').focus({ preventScroll: true });
      toast('실무자용 초안에 반영했습니다. 내용을 확인한 뒤 저장해 주세요.', 4200);
    } catch (error) {
      if (sameScope(row)) { row.stale = true; $('scriptTransferError').textContent = error.message || '다시 비교해 주세요.'; }
    } finally {
      if (row.cancelled) { row.busy = false; void release(row).then(row.restoreFocus); }
      if (intent === row) { row.busy = false; sync(); }
    }
  }
  function bind() {
    $('transferChairScriptButton').addEventListener('click', () => hooks.run(open));
    $('cancelScriptTransferButton').addEventListener('click', () => close());
    $('scriptTransferDialog').addEventListener('cancel', event => { event.preventDefault(); close(); });
    $('applyScriptTransferButton').addEventListener('click', () => void apply());
    for (const [id, selected] of [['selectAllScriptTransferButton', true], ['clearScriptTransferButton', false]]) $(id).addEventListener('click', () => {
      if (!intent || intent.busy) return;
      $('scriptTransferList').querySelectorAll('input').forEach(node => { node.checked = selected; }); sync();
    });
    $('scriptTransferDialog').addEventListener('keydown', event => {
      if (event.key !== 'Tab' || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
      const controls = [...$('scriptTransferDialog').querySelectorAll('button,input')].filter(node => !node.disabled && node.getClientRects().length);
      if (!controls.length) return;
      const index = controls.indexOf(document.activeElement), next = event.shiftKey ? (index <= 0 ? controls.length - 1 : index - 1) : (index + 1) % controls.length;
      event.preventDefault(); controls[next].focus();
    });
  }
  return { bind, sync, invalidate: () => close(false) };
}
