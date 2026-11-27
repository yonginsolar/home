import {businessReportMarkup,auditorPacketMarkup} from './meeting_business_report_v1.js';
import {closingReportChapters} from './meeting_templates_v1_11.js';

const financeLabels=['재무상태표','손익계산서','이익잉여금처분계산서'];
function packetDocuments(packet,{auditHtml='',requireBooklet=false}={}){
  if(!Number.isSafeInteger(packet?.year))return [];
  const report=businessReportMarkup(packet.business,packet.year);
  if(!report)return [];
  const booklet=packet.booklet_financial;
  const statements=booklet?.summary&&typeof booklet.summary==='object'&&!Array.isArray(booklet.summary)
    ?closingReportChapters({fiscal_year:packet.year,closing_report:{period_start:booklet.period_start,
     period_end:booklet.period_end,report_payload:{summary:booklet.summary}}}):[];
  let finance=[];
  if(statements.length===financeLabels.length){
    finance=statements.map((html,i)=>({label:financeLabels[i],html}));
  }else{
    if(requireBooklet)return [];
    // Keep previously submitted financial snapshots exactly as saved.
    const raw=document.createElement('template');
    raw.innerHTML=auditorPacketMarkup(packet);
    const prior=[...raw.content.querySelectorAll('.erp-auditor-statement')];
    if(prior.length!==financeLabels.length)return [];
    finance=prior.map(node=>({label:node.querySelector('h2').textContent,
      html:'<div class="erp-auditor-packet">'+node.outerHTML+'</div>'}));
  }
  return [{label:'사업보고서',html:report},...finance,...(auditHtml?[{label:'감사보고서 초안',html:auditHtml}]:[])];
}

// The same document picker is used by the preview before submission and the existing signature page.
export function mountAuditDocuments(root,packet,{scroll=root,...options}={}){
  const docs=packetDocuments(packet,options);
  if(!docs.length)return false;
  const nav=document.createElement('div'),paper=document.createElement('div');
  const base=root.id+'-paper';
  nav.className='erp-audit-document-tabs';
  nav.setAttribute('role','tablist');nav.setAttribute('aria-label','검토할 문서');
  paper.className='rich-editor erp-audit-document-paper';
  paper.id=base;paper.setAttribute('role','tabpanel');paper.tabIndex=0;
  const buttons=docs.map(({label},index)=>{
    const button=document.createElement('button');
    button.type='button';button.id=base+'-tab-'+index;button.textContent=label;
    button.setAttribute('role','tab');button.setAttribute('aria-controls',base);
    button.addEventListener('click',()=>select(index));
    button.addEventListener('keydown',event=>{
      const length=docs.length;
      const next=event.key==='ArrowRight'?(index+1)%length:event.key==='ArrowLeft'?(index+length-1)%length:
        event.key==='Home'?0:event.key==='End'?length-1:null;
      if(next===null)return;
      event.preventDefault();select(next);buttons[next].focus();
    });
    return button;
  });
  function select(index){
    for (let i=0;i<buttons.length;i++){
      buttons[i].tabIndex=i===index?0:-1;
      buttons[i].setAttribute('aria-selected',String(i===index));
    }
    paper.setAttribute('aria-labelledby',buttons[index].id);
    paper.innerHTML=docs[index].html;
    scroll.scrollTop=0;
  }
  nav.append(...buttons);root.replaceChildren(nav,paper);select(0);
  return true;
}
