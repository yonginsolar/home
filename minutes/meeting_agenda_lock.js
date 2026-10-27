/* v1.1.0 — Announced metadata/titles only; proposal prose and independent scripts stay editable. */
export const AGENDA_LOCK_REASON = '소집 공문 결재가 완료되어 기본정보와 안건 제목·구성이 확정되었습니다. 안건 설명·시나리오·메모·결과는 계속 작성할 수 있습니다.';
export function materialAgendaNodes(container) {
  const nodes = [...container.querySelectorAll('.source-agenda-row > strong,.source-agenda-row > span,.chapter-bill > h1,.chapter-bill > h2,.board-one-paper > h1,.board-one-paper > .meeting-meta,.board-one-paper > h2,.assembly-cover > h1,.assembly-cover > dl')]
    .filter(n => !n.matches('.board-one-paper > h2') || /^[1-4]\.\s*/.test(n.textContent.trim()));
  if (container.classList.contains('chapter-bill')) nodes.push(...[...container.children].filter(n => ['H1','H2'].includes(n.tagName)));
  return [...new Set(nodes)];
}
export function protectMaterialAgendas(container, locked) {
  clearMaterialAgendaUi(container);
  if (!locked) return;
  for (const node of materialAgendaNodes(container)) {
    node.dataset.agendaUiLock = 'true';
    node.contentEditable = 'false';
    node.setAttribute('aria-readonly','true');
    node.title = '소집 공문 결재가 완료된 기본정보·안건 제목';
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
