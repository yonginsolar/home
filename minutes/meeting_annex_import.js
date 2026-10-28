/* v1.1.2 — Insert incremental imports using frozen source-relative positions. */
const topAnnexes = root => [...root.querySelectorAll('.board-text-annex,.board-pdf-annex')]
  .filter(node => !node.parentElement.closest('.board-text-annex,.board-pdf-annex'));

export function orderMeetingAnnexes(root, agendas = []) {
  const nodes = topAnnexes(root), positions = new Map(agendas.map((a, i) => [a.id, i]));
  const group = node => positions.has(node.dataset.boardAgendaId) ? positions.get(node.dataset.boardAgendaId)
    : node.dataset.boardAgendaId === 'common' ? agendas.length : agendas.length + 1;
  nodes.sort((a, b) => group(a) - group(b)); // stable within an agenda, including deliberate duplicates
  nodes.forEach((node, index) => {
    const agenda = node.dataset.boardAgendaId, at = positions.get(agenda);
    node.dataset.boardAnnexNumber = String(index + 1);
    const heading = node.querySelector('.board-annex-heading');
    if (heading) {
      let label = heading.querySelector(':scope > span');
      if (!label) { label = root.ownerDocument.createElement('span'); heading.prepend(label); }
      label.textContent = `${at !== undefined ? `제${at + 1}호 안건 · ` : agenda === 'common' ? '공통 자료 · ' : agenda ? '연결 안건 확인 필요 · ' : ''}별첨 ${index + 1}`;
    }
    root.append(node);
  });
  return nodes;
}

export function setMeetingAnnexLink(root, annexId, agendaId, agendas = [], uuid = () => crypto.randomUUID()) {
  if (agendaId && agendaId !== 'common' && !agendas.some(a => a.id === agendaId)) return false;
  const nodes = topAnnexes(root), node = nodes.find((n, i) => (n.dataset.boardAnnexId || (n.classList.contains('board-pdf-annex') ? `pdf:${n.dataset.boardPdfId}` : `text:${nodes.slice(0, i).filter(x => x.classList.contains('board-text-annex')).length}`)) === annexId);
  if (!node || (node.dataset.boardAgendaId || '') === agendaId) return false;
  node.dataset.boardAnnexId ||= uuid();
  if (agendaId) node.dataset.boardAgendaId = agendaId; else delete node.dataset.boardAgendaId;
  orderMeetingAnnexes(root, agendas); return true;
}

export function moveMeetingAnnex(root, annexId, direction, agendas = []) {
  const nodes = topAnnexes(root), node = nodes.find(n => n.dataset.boardAnnexId === annexId);
  if (!node) return false;
  const peers = nodes.filter(n => (n.dataset.boardAgendaId || '') === (node.dataset.boardAgendaId || ''));
  const other = peers[peers.indexOf(node) + direction];
  if (!other) return false;
  if (direction < 0) other.before(node); else other.after(node);
  orderMeetingAnnexes(root, agendas); return true;
}

export function listMeetingAnnexes(html, pdfs = [], { document, sanitizeHtml = value => value } = {}) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = sanitizeHtml(html || '');
  const rows = new Map(pdfs.map(row => [row.id, row])), seenPdfs = new Set(), result = [];
  const pdf = (row, node) => ({ id:`pdf:${row.id}`, agendaId:node?.dataset.boardAgendaId || '', kind:'PDF', title:row.title || row.original_filename || '첨부 PDF', pdfId:row.id });
  let textIndex = 0;
  for (const node of topAnnexes(wrapper)) {
    if (node.classList.contains('board-text-annex')) {
      const index = textIndex++;
      node.querySelectorAll('.board-annex-toggle').forEach(button => button.remove());
      node.classList.remove('is-collapsed');
      result.push({ id:node.dataset.boardAnnexId || `text:${index}`, agendaId:node.dataset.boardAgendaId || '', kind:'TEXT', title:node.querySelector('.board-annex-heading h1,h1')?.textContent.trim() || `별첨 ${index + 1}`, html:node.outerHTML });
    } else {
      const row = rows.get(node.dataset.boardPdfId);
      if (row && !seenPdfs.has(row.id)) { result.push(pdf(row, node)); seenPdfs.add(row.id); }
    }
  }
  // Older PDFs without an in-document position remain after the ordered annexes.
  for (const row of pdfs) if (!seenPdfs.has(row.id)) { result.push(pdf(row)); seenPdfs.add(row.id); }
  return result.map((annex, sourceOrder) => ({ ...annex, sourceOrder }));
}

export function appendMeetingTextAnnexes(html, annexes, sourceId, { document, sanitizeHtml = value => value, agendaMap = {}, agendas = [], pdfs = [], sourceOrder = [], uuid = () => crypto.randomUUID() } = {}) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = sanitizeHtml(html || '');
  const seen = new Set([...wrapper.querySelectorAll('[data-board-carry-source]')].map(node => node.dataset.boardCarrySource));
  const positions = new Map(sourceOrder.map((id, index) => [id, index])), prefix = `${sourceId}:`;
  for (const annex of annexes || []) if (!positions.has(annex.id) && Number.isSafeInteger(annex.sourceOrder) && annex.sourceOrder >= 0) positions.set(annex.id, annex.sourceOrder);
  const position = node => {
    const marker = node.dataset.boardCarrySource || '';
    if (!marker.startsWith(prefix)) return undefined;
    if (positions.has(marker.slice(prefix.length))) return positions.get(marker.slice(prefix.length));
    const value = node.dataset.boardCarryOrder;
    return /^\d+$/.test(value || '') && Number.isSafeInteger(Number(value)) ? Number(value) : undefined;
  };
  let number = Math.max(0, ...[...wrapper.querySelectorAll('.board-text-annex')].map(node => Number(node.dataset.boardAnnexNumber) || 0)), added = 0, orderReview = false;
  for (const annex of annexes || []) {
    const marker = `${sourceId}:${annex.id}`;
    if (seen.has(marker)) continue;
    const source = document.createElement('div');source.innerHTML = sanitizeHtml(annex.html || '');
    let node = annex.kind === 'TEXT' ? source.querySelector(':scope > .board-text-annex') : null;
    if (annex.kind === 'PDF' && pdfs.some(p => p.id === annex.pdfId)) {
      node = [...wrapper.querySelectorAll('.board-pdf-annex')].find(n => n.dataset.boardPdfId === annex.pdfId);
      if (node) continue;
      node = document.createElement('section');node.className = 'board-pdf-annex';node.dataset.boardPdfId = annex.pdfId;node.contentEditable='false';
      const heading = document.createElement('header');heading.className = 'board-annex-heading';
      const title = document.createElement('h1');title.textContent = annex.title;heading.append(title);node.append(heading);
    }
    if (!node) continue;
    node.querySelectorAll('.board-annex-toggle').forEach(button => button.remove());node.classList.remove('is-collapsed');
    node.dataset.boardCarrySource = marker;node.dataset.boardAnnexNumber = String(++number);
    delete node.dataset.boardCarryOrder;
    if (positions.has(annex.id)) node.dataset.boardCarryOrder = String(positions.get(annex.id));
    // A source agenda ID is never valid as a target relationship by itself.
    const linked = annex.agendaId === 'common' ? 'common' : agendaMap[annex.agendaId];
    delete node.dataset.boardAgendaId;
    if (linked && (linked === 'common' || agendas.some(a => a.id === linked))) node.dataset.boardAgendaId = linked;
    if (annex.agendaId || node.dataset.boardAnnexId || annex.kind === 'PDF') node.dataset.boardAnnexId = uuid();
    const heading = node.querySelector('.board-annex-heading');
    if (heading) {
      let label = heading.querySelector(':scope > span');
      if (!label) { label = document.createElement('span');heading.prepend(label); }
      label.textContent = `별첨 ${number}`;
    }
    const peers = topAnnexes(wrapper).filter(peer => (peer.dataset.boardCarrySource || '').startsWith(prefix) && (peer.dataset.boardAgendaId || '') === (node.dataset.boardAgendaId || ''));
    const ranks = peers.map(position), at = position(node);
    const ordered = at !== undefined && ranks.every((rank, i) => rank !== undefined && (!i || ranks[i - 1] <= rank));
    if (ordered && peers.length) {
      const after = peers.find((_, i) => ranks[i] > at);
      if (after) after.before(node); else peers[peers.length - 1].after(node);
    } else { wrapper.append(node);if (peers.length) orderReview = true; }
    seen.add(marker);added++;
  }
  if (added && agendas.length) orderMeetingAnnexes(wrapper, agendas);
  return { html:added ? wrapper.innerHTML : html, added, orderReview };
}
