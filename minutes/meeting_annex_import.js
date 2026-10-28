/* v1.0.0 — Explicit, memory-only text annex import; normal document save remains authoritative. */
export function listMeetingAnnexes(html, pdfs = [], { document, sanitizeHtml = value => value } = {}) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = sanitizeHtml(html || '');
  const text = [...wrapper.querySelectorAll('.board-text-annex')]
    .filter(node => !node.parentElement.closest('.board-text-annex'))
    .map((node, index) => {
      node.querySelectorAll('.board-annex-toggle').forEach(button => button.remove());
      node.classList.remove('is-collapsed');
      return { id:`text:${index}`, kind:'TEXT', title:node.querySelector('.board-annex-heading h1,h1')?.textContent.trim() || `별첨 ${index + 1}`, html:node.outerHTML };
    });
  return [...text, ...pdfs.map(row => ({ id:`pdf:${row.id}`, kind:'PDF', title:row.title || row.original_filename || '첨부 PDF', pdfId:row.id }))];
}

export function appendMeetingTextAnnexes(html, annexes, sourceId, { document, sanitizeHtml = value => value } = {}) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = sanitizeHtml(html || '');
  const seen = new Set([...wrapper.querySelectorAll('[data-board-carry-source]')].map(node => node.dataset.boardCarrySource));
  let number = Math.max(0, ...[...wrapper.querySelectorAll('.board-text-annex')].map(node => Number(node.dataset.boardAnnexNumber) || 0)), added = 0;
  for (const annex of annexes || []) {
    const marker = `${sourceId}:${annex.id}`;
    if (annex.kind !== 'TEXT' || seen.has(marker)) continue;
    const source = document.createElement('div');source.innerHTML = sanitizeHtml(annex.html || '');
    const node = source.querySelector(':scope > .board-text-annex');
    if (!node) continue;
    node.querySelectorAll('.board-annex-toggle').forEach(button => button.remove());node.classList.remove('is-collapsed');
    node.dataset.boardCarrySource = marker;node.dataset.boardAnnexNumber = String(++number);
    const heading = node.querySelector('.board-annex-heading');
    if (heading) {
      let label = heading.querySelector(':scope > span');
      if (!label) { label = document.createElement('span');heading.prepend(label); }
      label.textContent = `별첨 ${number}`;
    }
    wrapper.append(node);seen.add(marker);added++;
  }
  return { html:added ? wrapper.innerHTML : html, added };
}
