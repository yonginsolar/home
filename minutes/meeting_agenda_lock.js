/* v1.0.0 — Material-only agenda fencing. UI attributes never become document content. */
export const AGENDA_LOCK_REASON = '소집 공문 결재가 완료되어 안건이 확정되었습니다. 진행 대사·메모·논의와 의결 결과는 계속 작성할 수 있습니다.';
export function materialAgendaNodes(container) {
  if (container.classList.contains('chapter-bill')) return [...container.children].filter(n => !n.classList.contains('bill-note-card'));
  return [...container.querySelectorAll('.source-agenda-row,.chapter-bill,.board-one-paper > h2')]
    .filter(n => n.tagName !== 'H2' || /^[1-4]\.\s*/.test(n.textContent.trim()));
}
export function protectMaterialAgendas(container, locked) {
  clearMaterialAgendaUi(container);
  if (!locked) return;
  for (const node of materialAgendaNodes(container)) {
    node.dataset.agendaUiLock = 'true';
    node.contentEditable = 'false';
    node.setAttribute('aria-readonly','true');
    node.title = '소집 공문 결재가 완료된 안건';
  }
}
export function clearMaterialAgendaUi(container) {
  container.querySelectorAll('[data-agenda-ui-lock]').forEach(n => {
    n.removeAttribute('data-agenda-ui-lock');n.removeAttribute('contenteditable');
    n.removeAttribute('aria-readonly');n.removeAttribute('title');
  });
}
export function guardMaterialAgendaInput(event) {
  const editor = event.currentTarget;
  if (!editor.querySelector('[data-agenda-ui-lock]')) return;
  const selection = editor.ownerDocument.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if ([...editor.querySelectorAll('[data-agenda-ui-lock]')].some(node =>
    node.contains(selection.anchorNode) || !range.collapsed && range.intersectsNode(node))) event.preventDefault();
}
