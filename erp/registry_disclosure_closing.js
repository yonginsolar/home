/* v1.0.1 — 저장된 총회 재무표 우선, 없을 때만 연간 회계 마감본. 읽기 전용. */
(function(root){'use strict';
 const fail=()=>{throw Error('DISCLOSURE_CLOSING_REVIEW');};
 const integer=v=>{if(typeof v!=='number'||!Number.isSafeInteger(v))fail();return v;};
 const annual=(r,y)=>r.fiscal_year===y&&r.period_start===y+'-01-01'&&r.period_end===y+'-12-31';
 const stamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
 const result=(values,source,revision)=>({values,source,revision,empty:!Object.keys(values).length,missing:[],end:''});
 function snapshot(row,{coop,year}){
  if(row.coop_id!==coop||row.fiscal_year!==year||typeof row.id!=='string'||!stamp(row.generated_at))fail();
  if(!annual(row,year))return null;
  const s=row.summary;
  if(row.report_source!=='accounting_closing_report'||row.payload_version!==1||!s||s.fiscal_year!==year||s.period_start!==row.period_start||s.period_end!==row.period_end)fail();
  if(s.is_closed!==true)return null;
  const values={},map={assets:'total_assets',liabilities:'total_liabilities',equity:'total_equity',capital:'capital',revenue:'total_revenue',selling:'total_expenses',operating:'operating_income',otherRevenue:'total_other_revenue',net:'net_income',reserveDisposition:'legal_reserve'};
  for(const[k,name]of Object.entries(map))if(Object.hasOwn(s,name))values[k]=integer(s[name]);
  if(Array.isArray(s.equity))for(const[key,names]of [['reserveBalance',['법정적립금']],['retained',['미처분이익잉여금','미처리결손금','이월이익잉여금']]]){const rows=s.equity.filter(r=>names.includes(r.name));if(rows.length===1)values[key]=integer(rows[0].amount);}
  if(Array.isArray(s.expenses)){const rows=s.expenses.filter(r=>r.name==='법인세비용');if(rows.length>1)fail();if(rows.length)values.tax=integer(rows[0].amount);}
  if(Object.hasOwn(values,'net')&&Object.hasOwn(values,'tax'))values.pretax=integer(values.net+values.tax);
  return result(values,'회계 마감본',row.generated_at);
 }
 function materials(row,{coop,year}){
  if(row.coop_id!==coop||row.document_type!=='MATERIALS'||typeof row.content_html!=='string'||!Number.isSafeInteger(row.version)||row.version<1||!stamp(row.updated_at))fail();
  if(row.content_html.length>4194304)fail();
  const doc=new DOMParser().parseFromString(row.content_html,'text/html'),ids=['closing-balance-sheet','closing-income-statement','closing-surplus-statement'];
  const chapters=ids.map(id=>{const a=doc.querySelectorAll('[data-chapter-id="'+id+'"]');if(a.length>1)fail();return a[0];});
  if(chapters.every(c=>!c))return null;
  const clean=s=>s.replace(/\s+/g,''),values={};
  const maps=[{자산총계:'assets',부채총계:'liabilities',자본총계:'equity',출자금:'capital',법정적립금:'reserveBalance',미처분이익잉여금:'retained',미처리결손금:'retained',이월이익잉여금:'retained'}, {'매출합계':'revenue','비용합계':'selling','영업외수익합계':'otherRevenue','영업이익(손실)':'operating','당기순이익(손실)':'net','법인세비용':'tax'}, {'법정적립금':'reserveDisposition'}];
  chapters.forEach((chapter,i)=>{
   if(!chapter)return;
   const h=chapter.querySelector('.financial-statement-heading');
   const title=[year+'년재무상태표',year+'년손익계산서',year+'년이익잉여금처분계산서'][i];
   if(!h||clean(h.querySelector('h1')?.textContent||'')!==title||clean(h.querySelector('small')?.textContent||'')!=='단위:원')fail();
   const period=clean(h.querySelector('p')?.textContent||'');
   if(period!==(i===1?year+'년1월1일부터'+year+'년12월31일까지':year+'년12월31일결산기준'))fail();
   for(const tr of chapter.querySelectorAll('.financial-data-table tbody tr,.financial-data-table tfoot tr')){
    const cells=[...tr.children];if(cells.length!==2)fail();const key=maps[i][clean(cells[0].textContent)];if(!key)continue;
    const text=cells[1].textContent.trim();if(!/^-?(?:\d{1,3}(?:,\d{3})+|\d+)\s*원$/.test(text))fail();
    if(Object.hasOwn(values,key))fail();values[key]=integer(Number(text.replace(/[,원\s]/g,'')));
   }
  });
  if(Object.hasOwn(values,'net')&&Object.hasOwn(values,'tax'))values.pretax=integer(values.net+values.tax);
  return result(values,'총회 자료',row.updated_at+' · '+row.version+'판');
 }
 async function load(client,{coop,year,today,signal}){
  if(!coop||!Number.isInteger(year)||today<=year+'-12-31')return result({},'결산 자료 준비 전','');
  const check=()=>{if(signal.aborted)throw Error('DISCLOSURE_READ_CANCELLED');};
  const can=await client.rpc('erp_can_access',{p_key:'minutes.manage'}).abortSignal(signal);check();if(can.error)throw can.error;if(typeof can.data!=='boolean')fail();
  if(can.data){
   const p=await client.from('meeting_packages').select('id,coop_id,fiscal_year,meeting_type,status,meeting_date').eq('coop_id',coop).eq('fiscal_year',year).eq('meeting_type','GENERAL_ASSEMBLY').eq('status','FINAL').limit(21).abortSignal(signal);if(p.error)throw p.error;
   check();if(!Array.isArray(p.data)||p.data.length>20||p.data.some(r=>r.coop_id!==coop||r.fiscal_year!==year||r.meeting_type!=='GENERAL_ASSEMBLY'||r.status!=='FINAL'||typeof r.id!=='string'))fail();
   if(p.data.length){
    const docs=await client.from('meeting_package_documents').select('id,coop_id,package_id,document_type,content_html,version,updated_at').eq('coop_id',coop).in('package_id',p.data.map(r=>r.id)).eq('document_type','MATERIALS').limit(21).abortSignal(signal);if(docs.error)throw docs.error;
    check();if(!Array.isArray(docs.data)||docs.data.length>20||docs.data.some(r=>!p.data.some(p=>p.id===r.package_id))||new Set(docs.data.map(r=>r.package_id)).size!==docs.data.length)fail();
    const found=docs.data.map(r=>materials(r,{coop,year})).filter(Boolean);if(found.length>1)fail();if(found.length)return found[0];
   }
  }else{const rights=await Promise.all(['accounting.view','accounting.edit'].map(p_key=>client.rpc('erp_can_access',{p_key}).abortSignal(signal)));check();for(const r of rights){if(r.error)throw r.error;if(typeof r.data!=='boolean')fail();}if(!rights.some(r=>r.data))throw Object.assign(Error('CLOSING_ACCESS_REQUIRED'),{code:'42501'});}
  const r=await client.from('accounting_closing_report_snapshots').select('id,coop_id,fiscal_year,period_start,period_end,generated_at,report_source:report_payload->>source,payload_version:report_payload->schema_version,summary:report_payload->summary').eq('coop_id',coop).eq('fiscal_year',year).limit(2).abortSignal(signal);if(r.error)throw r.error;
  check();if(!Array.isArray(r.data)||r.data.length>1)fail();return r.data.length?snapshot(r.data[0],{coop,year})||result({},'결산 자료 준비 전',''):result({},'결산 자료 준비 전','');
 }
 root.DisclosureClosing=Object.freeze({load,snapshot,materials,version:'1.0.1'});
})(window);
