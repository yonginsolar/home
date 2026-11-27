/* Shared business report and auditor packet projections. */
const clean=value=>typeof value==='string'?value.trim():'';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paragraphs=value=>esc(value).replace(/\r?\n/g,'<br>');
const lines=value=>clean(value).split(/\r?\n/).map(s=>s.trim().replace(/^[-•·]\s*/, '')).filter(Boolean);

export function businessComparison(data,year) {
  const value=data?.business_report_comparison;
  if(!value||Number(value.year)!==Number(year)||typeof value.source_id!=='string'||!Array.isArray(value.rows)||!value.rows.length)return null;
  const rows=value.rows.map(row=>({plan:clean(row?.plan),actual:clean(row?.actual),reason:clean(row?.reason)}));
  if(rows.some(row=>!row.plan))return null;
  return {...value,rows,goal:clean(value.goal),source_title:clean(value.source_title)};
}

export function approvedBusinessPlan(source,year) {
  if(!source||typeof source.booklet!=='string'||Number(source.year)!==Number(year)||typeof source.id!=='string'
    ||!/^[0-9a-f]{32}$/.test(source.source_revision||''))return null;
  const t=document.createElement('template');
  t.innerHTML=source.booklet;
  const articles=t.content.querySelectorAll('article.business-plan-document');
  if(articles.length!==1)return null;
  const article=articles[0], heading=article.querySelector('.business-plan-heading > span')?.textContent?.trim();
  if(heading!==year+'년도 정기총회')return null;
  const rows=[...article.querySelectorAll('.business-plan-list > li')].map(li=>({plan:clean(li.textContent),actual:'',reason:''}));
  if(!rows.length||rows.length>80||rows.some(row=>!row.plan||row.plan.length>1000))return null;
  const goal=clean(article.querySelector('.business-plan-goal blockquote')?.textContent);
  if(goal.length>4000)return null;
  return {year:Number(year),source_id:source.id,source_revision:source.source_revision,source_title:clean(source.title).slice(0,300),goal,rows};
}

export function businessReportSummary(data,year) {
  const comparison=businessComparison(data,year);
  const intro=clean(data?.business_report_intro), highlights=lines(data?.business_report_highlights);
  return {comparison,intro,highlights,hasContent:!!(intro||highlights.length||comparison?.rows.length)};
}

export function businessReportMarkup(data,year) {
  const {comparison,intro,highlights,hasContent}=businessReportSummary(data,year);
  if(!hasContent)return '';
  const comparisonHtml=comparison?'<section class="erp-business-comparison"><h2>사업계획과 추진 실적</h2>'
    +(comparison.goal?'<p class="erp-business-goal"><strong>당초 목표</strong> '+paragraphs(comparison.goal)+'</p>':'')
    +'<div class="erp-business-cases">'+comparison.rows.map((r,i)=>`<article class="erp-business-case">
      <h3>사업 ${String(i+1).padStart(2,'0')}</h3>
      <dl class="erp-business-pair"><div><dt>승인된 계획</dt><dd>${paragraphs(r.plan)}</dd></div>
        <div><dt>실제 결과</dt><dd>${r.actual?paragraphs(r.actual):'<span class="erp-business-pending">실적 작성 전</span>'}</dd></div></dl>
      ${r.reason?'<p class="erp-business-reason"><strong>차이 이유</strong> '+paragraphs(r.reason)+'</p>':''}</article>`).join('')+'</div></section>':'';
  return `<div class="erp-business-report"><h1>${esc(year)}년도 사업보고서</h1>
    ${intro?`<section class="business-report-overview"><span>한 해를 돌아보며</span><p class="chapter-lead">${paragraphs(intro)}</p></section>`:''}
    ${comparisonHtml}
    ${highlights.length?`<section><h2>${comparison?'추가로 진행한 사업':'주요 사업 추진 실적'}</h2><ol class="business-report-list">${highlights.map(item=>`<li>${esc(item)}</li>`).join('')}</ol></section>`:''}</div>`;
}

// Accounting already freezes these three sections. Render those exact tables,
// not client totals, and do not carry active media, links, or CSS into signing.
function financialMarkup(html) {
  const t=document.createElement('template');
  t.innerHTML=typeof html==='string'?html:'';
  const allowed=new Set('DIV SECTION P SPAN H1 H2 H3 H4 STRONG B EM I SMALL TABLE CAPTION COLGROUP COL THEAD TBODY TFOOT TR TH TD UL OL LI BR HR'.split(' '));
  for (const node of [...t.content.querySelectorAll('*')]) {
    if (!allowed.has(node.tagName)) {node.remove();continue;}
    for(const a of [...node.attributes]) {
      if(a.name==='class'){
        const classes=a.value.split(/\s+/).filter(c=>/^(?:rpt-[a-z0-9-]+|(?:text|fw|border)-[a-z0-9-]+|table(?:-[a-z0-9-]+)?|small|d-flex|justify-content-between)$/.test(c));
        node.setAttribute('class',classes.join(' '));
      }else if(!(['colspan','rowspan'].includes(a.name)&&/^(?:[1-9]|[1-4][0-9])$/.test(a.value)))node.removeAttribute(a.name);
    }
  }
  return t.innerHTML;
}

export function auditorPacketMarkup(packet) {
  const {year,business,finance,period_end}=packet||{};
  if(!Number.isSafeInteger(year)||!business||!finance)return '';
  const report=businessReportMarkup(business,year);
  if(!report)return '';
  const names=[['balance_sheet_html','재무상태표'],['income_statement_html','손익계산서'],
    ['surplus_html','결산처리 자료']];
  const parts=names.map(([key,title])=>[title,financialMarkup(finance[key])]);
  if(parts.some(([,part])=>!part))return '';
  return `<div class="erp-auditor-packet"><header class="erp-auditor-packet-head"><strong>${esc(year)}년도 결산자료</strong>
    ${period_end?`<span>결산 기준일 ${esc(period_end)}</span>`:''}</header>
    ${report}
    ${parts.map(([title,html])=>`<section class="closing-report-snapshot erp-auditor-statement"><h2>${esc(title)}</h2>${html}</section>`).join('')}</div>`;
}
