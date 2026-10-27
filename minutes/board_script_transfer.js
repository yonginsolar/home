/* Version: v1.0.0 — explicit chair-line comparison; no network, saving or authority changes. */
const BASE = 'data-chair-transfer-base';
const normalized = value => String(value || '').replace(/\s+/g, ' ').trim();
function sections(html, sanitize) {
  const root = document.createElement('div');
  root.innerHTML = sanitize(html);
  const article = root.querySelector('.board-scenario');
  const rows = [], duplicates = new Set(), seen = new Set();
  for (const heading of article?.querySelectorAll(':scope > h2') || []) {
    const key = normalized(heading.textContent), lines = [];
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
    let end = heading.nextElementSibling;
    for (; end && end.tagName !== 'H2'; end = end.nextElementSibling) {
      if (end.matches('p.speaker') && normalized(end.querySelector(':scope > strong')?.textContent) === '의장') lines.push(end);
    }
    rows.push({ key, heading, lines, end, article });
  }
  return { root, rows, duplicates };
}
function markup(node) { return String(node?.innerHTML || '').trim(); }
function baseline(node) {
  return node.hasAttribute(BASE) ? node.getAttribute(BASE) : markup(node);
}
function align(oldLines, newLines) {
  if (oldLines.length > 250 || newLines.length > 250) throw new Error('한 구간의 의장 발언이 너무 많습니다. 구간을 나눠 확인해 주세요.');
  const costs = Array.from({ length: oldLines.length + 1 }, () => new Uint16Array(newLines.length + 1));
  for (let i = 0; i <= oldLines.length; i++) costs[i][0] = i;
  for (let j = 0; j <= newLines.length; j++) costs[0][j] = j;
  for (let i = 1; i <= oldLines.length; i++) for (let j = 1; j <= newLines.length; j++) {
    costs[i][j] = Math.min(costs[i - 1][j - 1] + (oldLines[i - 1] === newLines[j - 1] ? 0 : 1), costs[i - 1][j] + 1, costs[i][j - 1] + 1);
  }
  const result = []; let i = oldLines.length, j = newLines.length;
  while (i || j) {
    if (i && j && costs[i][j] === costs[i - 1][j - 1] + (oldLines[i - 1] === newLines[j - 1] ? 0 : 1)) result.push({ old: --i, next: --j });
    else if (i && costs[i][j] === costs[i - 1][j] + 1) result.push({ old: --i, next: null });
    else result.push({ old: null, next: --j, before: i });
  }
  return result.reverse();
}
export function compareBoardChairLines(sourceHtml, targetHtml, sanitize) {
  const source = sections(sourceHtml, sanitize), target = sections(targetHtml, sanitize);
  if (!source.rows.length || !target.rows.length) throw new Error('시나리오의 진행 구간을 찾지 못했습니다. 두 문서의 제목과 의장 발언 표시를 확인해 주세요.');
  const changes = [], matches = [], skipped = [];
  for (const section of source.rows) {
    const destination = target.rows.find(row => row.key === section.key);
    if (!destination || source.duplicates.has(section.key) || target.duplicates.has(section.key)) {
      skipped.push(section.key); continue;
    }
    for (const pair of align(destination.lines.map(baseline), section.lines.map(markup))) {
      const before = pair.old === null ? null : destination.lines[pair.old];
      const after = pair.next === null ? null : section.lines[pair.next];
      if (before && after && markup(before) === markup(after)) { matches.push({ before, after }); continue; }
      // A previously applied line changed only in the practical script: leave it alone.
      if (before && after && before.hasAttribute(BASE) && baseline(before) === markup(after)) continue;
      changes.push({ id: changes.length, heading: section.key, before, after, destination, beforeIndex: pair.before,
        conflict: !!before && before.hasAttribute(BASE) && baseline(before) !== markup(before),
        unknown: !!before && !before.hasAttribute(BASE),
        oldText: before?.textContent.trim() || '', newText: after?.textContent.trim() || '' });
    }
  }
  for (const section of target.rows) if (!source.rows.some(row => row.key === section.key)) skipped.push(section.key);
  return { sourceHtml, targetHtml, target, changes, matches, skipped: [...new Set(skipped)] };
}
export function applyBoardChairSelection(plan, selected, sanitize) {
  if (plan.applied) throw new Error('이미 반영한 비교입니다. 다시 비교해 주세요.');
  const ids = new Set(selected), tails = new Map();
  for (const row of plan.changes) {
    if (!ids.has(row.id)) continue;
    if (row.before && !row.after) { row.before.remove(); continue; }
    if (row.before) {
      row.before.innerHTML = row.after.innerHTML;
      row.before.setAttribute(BASE, markup(row.after));
    } else {
      const node = row.after.cloneNode(true);
      node.setAttribute(BASE, markup(row.after));
      const anchor = row.destination.lines[row.beforeIndex];
      if (anchor?.isConnected || anchor?.parentNode) anchor.before(node);
      else {
        const tail = tails.get(row.destination) || row.destination.lines.at(-1);
        if (tail?.parentNode) tail.after(node);
        else if (row.destination.end) row.destination.end.before(node);
        else row.destination.article.append(node);
        tails.set(row.destination, node);
      }
    }
  }
  for (const { before, after } of plan.matches) before.setAttribute(BASE, markup(after));
  plan.applied = true;
  return sanitize(plan.target.root.innerHTML);
}
