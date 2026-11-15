/* 0.3.3 · 선택·파일을 보존하며 변경 유형에 맞춰 추천 표시 갱신. */
(function(root){
 'use strict';
 function attach(config){
  const M=root.CoopRegistryDocumentsModel,S=root.CoopRegistryDocumentSources,box=config.element;
  let revision=0,epoch=0,flight=null,catalog=[],data={},identity='',lastNeeds='',pending=false;
  const selections=new Map(),localFiles=new Map(),panels=new Map();
  const create=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
  const load=create('button','ERP 첨부자료 불러오기'),status=create('p'),list=create('div'),yearLabel=create('label','사업·예산 연도'),year=create('input');
  load.type='button';load.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.repeat&&!e.isComposing&&!e.defaultPrevented&&!e.ctrlKey&&!e.altKey&&!e.metaKey)e.preventDefault();});status.setAttribute('role','status');year.type='number';year.min='1901';year.max='9999';year.value=String(new Date().getFullYear());yearLabel.append(year);box.append(load,status,yearLabel,list);box.addEventListener('input',e=>e.stopPropagation());
  function context(){const c=config.context();return{...c,key:c.owner+'|'+c.coop};}
  function change(){revision++;config.onChange();sync();}
  function input(){return{...config.input(),businessYear:Number(year.value)};}
  function active(){const c=context();return c.authorized&&c.visible;}
  function guard(op){const c=context();return active()&&c.key===op.identity&&epoch===op.epoch&&!op.controller.signal.aborted;}
  function scoped(work){if(flight)return flight.promise;const c=context(),op={identity:c.key,epoch,controller:new AbortController()};flight=op;pending=true;load.disabled=true;op.promise=(async()=>{let timer;try{return await Promise.race([work(op,()=>guard(op)),new Promise((_,reject)=>{timer=setTimeout(()=>{op.controller.abort();reject(Error('조회가 지연되고 있습니다. 같은 버튼으로 다시 확인해 주세요.'));},15000);})]);}finally{clearTimeout(timer);if(flight===op){flight=null;pending=false;load.disabled=!active();}}})();return op.promise;}
  function available(key){return catalog.filter(d=>d.coop_id===context().coop&&(d.types||[]).includes(key));}
  function recommendationScope(raw){return JSON.stringify([raw.coopId,raw.kinds||[]]);}
  function optionLabel(raw,d){const matches=M.recommend(raw,d,(data.meeting_package_agendas||[]).filter(a=>(data.meeting_packages||[]).some(pack=>pack.id===a.package_id&&pack.published_minute_id===d.id)));return(matches.length?'추천 · ':'')+d.title+(d.event_date?' · '+d.event_date:'');}
  function selectOptions(key,p){const old=p.select.value,rows=available(key),raw=input();p.select.replaceChildren(new Option(p.req.mode==='generate'?'ERP 정보로 작성':'자료 선택',''),...rows.map(d=>new Option(optionLabel(raw,d),d.key)));p.select.value=old;p.recommendationScope=recommendationScope(raw);const saved=selections.get(key),latest=rows.find(d=>d.key===saved?.sourceKey);if(saved&&(!latest||latest.revision!==saved.revision))p.review.checked=false;}
  function refreshRecommendations(key,p){if(!p.select)return;const raw=input(),scope=recommendationScope(raw);if(p.recommendationScope===scope)return;const rows=new Map(available(key).map(d=>[d.key,d]));for(const option of p.select.options){const row=rows.get(option.value);if(row){const label=optionLabel(raw,row);if(option.textContent!==label)option.textContent=label;}}p.recommendationScope=scope;}
  function sync(){
   const c=context();if(!identity&&c.owner&&c.coop){for(const p of panels.values())p.root.remove();panels.clear();identity=c.key;}else if(identity&&identity!==c.key){leave(true);identity=c.owner&&c.coop?c.key:'';}
   const needs=M.requirements(input()),keys=new Set(needs.map(r=>r.key));yearLabel.hidden=!keys.has('plan')&&!keys.has('budget');load.disabled=pending||!active();
   for(const[key,p]of panels)p.root.hidden=!keys.has(key);
   for(const req of needs){
    let p=panels.get(req.key);if(p){p.root.hidden=false;refreshRecommendations(req.key,p);continue;}
    const section=create('fieldset'),legend=create('legend',req.label);section.append(legend);list.append(section);p={root:section,req};panels.set(req.key,p);
    const templates={officers:'officers-annex3-20200929.pdf',members:'members-annex6-20200929.pdf',plan:'business-plan-annex4-20200929.pdf',budget:'budget-annex5-20200929.pdf',proxy:'proxy-minwon-annex3-20230330.pdf'};
    if(templates[req.key]){const link=create('a','서식 보기');link.href='registry-assets/'+templates[req.key];link.target='_blank';link.rel='noopener noreferrer';section.append(link);}
    if(req.mode==='external'){section.append(create('p','별도 원본 준비'));continue;}
    if(req.mode==='existing'){section.append(create('p','기존 시청용 출자자 명부'));continue;}
    const label=create('label','ERP 문서'),select=create('select'),reviewLabel=create('label'),review=create('input'),fileLabel=create('label','PDF 선택'),file=create('input'),fileList=create('select'),excerpt=create('p');
    p.automatic=['assembly','board','notice'].includes(req.key);review.type='checkbox';reviewLabel.append(review,document.createTextNode('선택한 자료 확인'));label.append(select);file.type='file';file.accept='.pdf,application/pdf';fileLabel.append(file);fileList.setAttribute('aria-label',req.label+'의 PDF 원본');p.select=select;p.review=review;p.reviewLabel=reviewLabel;p.file=file;p.fileLabel=fileLabel;p.files=fileList;p.excerpt=excerpt;
    excerpt.setAttribute('role','status');p.identity=c.key;section.append(label,fileLabel,fileList,...(p.automatic?[]:[reviewLabel]),excerpt);
    if(req.key==='plan'||req.key==='budget'){const fullLabel=create('label'),full=create('input');full.type='checkbox';fullLabel.append(full,document.createTextNode('해당 연도 전체 내용 확인'));section.append(fullLabel);p.whole=full;full.onchange=e=>{e.stopPropagation();capture(req.key);};}
    select.onchange=e=>{e.stopPropagation();review.checked=false;p.whole&&(p.whole.checked=false);updateSource(req.key,true);capture(req.key);};
    review.onchange=e=>{e.stopPropagation();capture(req.key);};fileList.onchange=e=>{e.stopPropagation();review.checked=false;capture(req.key);};
    file.onchange=e=>{e.stopPropagation();if(!active()||context().key!==p.identity)return;const chosen=file.files?.[0];if(!chosen)return;if(chosen.size<5||chosen.size>20971520||!/\.pdf$/i.test(chosen.name)){excerpt.textContent='20MB 이내의 PDF를 선택해 주세요.';return;}const key='local:'+req.key,source={key,coop_id:c.coop,title:chosen.name,revision:String(++revision),types:[req.key],files:[],local:true};localFiles.set(key,chosen);catalog=catalog.filter(d=>d.key!==key).concat(source);selectOptions(req.key,p);select.value=key;review.checked=false;p.whole&&(p.whole.checked=false);updateSource(req.key);capture(req.key);};
    selectOptions(req.key,p);updateSource(req.key);
   }
   lastNeeds=JSON.stringify(needs.map(r=>r.key));
  }
  function updateSource(key,reset=false){const p=panels.get(key),d=catalog.find(r=>r.key===p.select.value),saved=selections.get(key);p.reviewLabel.hidden=p.automatic||!d;p.fileLabel.hidden=!!(p.automatic&&d&&!d.local);p.files.replaceChildren();if(d?.local)p.files.append(new Option('선택한 PDF','0'));else{p.files.append(new Option('출력할 PDF 선택',''));for(const[f,i]of(d?.files||[]).map((f,i)=>[f,i]))p.files.append(new Option('첨부파일 '+(i+1),String(i)));if(!reset&&saved&&d&&saved.sourceKey===d.key&&saved.revision===d.revision&&Number.isInteger(saved.fileIndex))p.files.value=String(saved.fileIndex);}p.files.hidden=p.automatic||!d||d.local||!d.files.length;p.excerpt.textContent='';}
  function capture(key){const p=panels.get(key);if(!active()||p?.identity!==context().key)return;const d=catalog.find(r=>r.key===p.select.value);selections.set(key,{sourceKey:p.select.value,revision:d?.revision||'',reviewed:p.review.checked,fileIndex:p.files.value===''?null:Number(p.files.value),wholeYear:!!p.whole?.checked,year:Number(year.value)});change();}
  year.addEventListener('input',e=>{e.stopPropagation();for(const key of ['plan','budget']){const p=panels.get(key);if(p){p.whole.checked=false;capture(key);}}change();});
  load.onclick=async()=>{if(!active())return;const e=epoch;status.textContent='첨부자료를 확인하고 있습니다.';try{await scoped(async(op,current)=>{const result=await S.catalog(config.client(),{coop:context().coop,signal:op.controller.signal,current,verify:config.verify});if(!current())return;const failedTables=new Set(result.failures),fresh=result.catalog;catalog=catalog.filter(d=>d.local||failedTables.has(d.table)).concat(fresh);data={...data,...Object.fromEntries(Object.entries(result.data).filter(([,v])=>v!==null))};for(const[key,p]of panels)if(p.select){selectOptions(key,p);updateSource(key);}sync();const drafts=(data.meeting_packages||[]).filter(p=>p.meeting_type==='GENERAL_ASSEMBLY'&&Number(p.fiscal_year)===Number(year.value));status.textContent=(result.failures.length?'일부 자료를 확인하지 못했습니다. 같은 버튼으로 다시 확인해 주세요.':'첨부자료를 불러왔습니다.')+(drafts.some(p=>M.planReadiness(p,year.value).available)?' 총회 사업·예산 초안은 별지 제4·5호 보완이 필요합니다.':'');config.invalidate();});}catch(error){if(e===epoch&&active())status.textContent=error.message;}};
  function snapshot(){const r=input(),result=M.chosen(r,Object.fromEntries(selections),catalog),draftKey=JSON.stringify([...selections].filter(([,s])=>s.sourceKey).sort(([a],[b])=>a.localeCompare(b)));return{revision,draftKey,businessYear:r.businessYear,needs:result.rows.map(r=>({key:r.key,mode:r.mode,state:r.state})),missing:result.missing};}
  async function prepare(raw,options){
   const c=context(),v=revision,selected=new Map([...selections].map(([k,s])=>[k,{...s}])),checked=M.chosen({...raw,businessYear:Number(year.value)},Object.fromEntries(selected),catalog),owned=[],bundle={coop:c.coop,revision:v,pdfs:[],preview:!options.final,verified:!!options.final};
   const current=()=>active()&&context().key===c.key&&revision===v&&options.current(),check=()=>{if(options.signal?.aborted||!current())throw Error('첨부 준비가 취소되었습니다.');};
   const clean=()=>{options.signal?.removeEventListener('abort',clean);for(const b of owned)b.fill(0);for(const key of ['officers','members']){if(bundle[key]?.membershipProof)bundle[key].membershipProof='';for(const r of bundle[key]||[])for(const field of Object.keys(r))r[field]='';}if(bundle.proxy)for(const key of Object.keys(bundle.proxy))bundle.proxy[key]='';},seenFiles=new Set();options.signal?.addEventListener('abort',clean,{once:true});
   try{
    if(options.final&&checked.missing.length)throw Error('확인 필요: '+checked.missing.join(', '));
    for(const req of checked.rows){check();const s=selected.get(req.key),source=catalog.find(d=>d.key===s?.sourceKey),automatic=['assembly','board','notice'].includes(req.key),previewSource=!options.final&&source&&source.coop_id===c.coop&&source.revision===s.revision&&source.types.includes(req.key)&&source.meeting_outcome!=='NOT_HELD'&&(source.local||automatic||Number.isInteger(s.fileIndex)&&source.files[s.fileIndex]);if(req.state==='missing'&&!previewSource)continue;if(source&&(req.state==='selected'||previewSource)){const fileKey=source.key+'|'+(automatic?'document':s.fileIndex);if(seenFiles.has(fileKey))continue;seenFiles.add(fileKey);let bytes;if(source.local){const file=localFiles.get(source.key);if(!file)throw Error('선택한 PDF를 다시 확인해 주세요.');bytes=new Uint8Array(await file.arrayBuffer());owned.push(bytes);check();if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw Error('PDF 원본 파일을 선택해 주세요.');}else if(automatic){const documents=await S.documentPdfs(config.client(),source,{coop:c.coop,signal:options.signal,current,verify:config.verify});for(const item of documents){owned.push(item.bytes);bundle.pdfs.push({key:req.key,bytes:item.bytes});}continue;}else{bytes=await S.pdf(config.client(),source,s.fileIndex,{coop:c.coop,signal:options.signal,current,verify:config.verify});owned.push(bytes);}bundle.pdfs.push({key:req.key,bytes});continue;}
     if(req.key==='proxy'){const d=raw;if(d.applicantType==='corporation')throw Error('법인 신고인의 위임장 PDF를 선택해 주세요.');bundle.proxy={companyName:d.companyName,chairName:d.chairName,chairBirth:options.chairBirth||'',chairAddress:d.chairAddress,chairPhone:d.chairPhone,applicant:d.applicant,applicantBirth:d.applicantBirth,applicantAddress:d.applicantAddress,applicantPhone:d.applicantPhone,printDate:d.printDate};}
     if(['officers','members'].includes(req.key)){if(options.final){if(!options.secure)throw Error('명부 보안 확인이 필요합니다.');bundle[req.key]=await options.secure(req.key,data.coop_officials||[],current);}else bundle[req.key]=[];}
    }
    check();return{bundle,clean};
   }catch(error){clean();throw error;}
  }
  function leave(clear=false){epoch++;flight?.controller.abort();flight=null;pending=false;load.disabled=!active();if(clear){for(const p of panels.values())p.root.remove();panels.clear();selections.clear();localFiles.clear();catalog=[];data={};revision++;identity='';lastNeeds='';}}
  sync();return Object.freeze({sync,snapshot,prepare,leave,clear:()=>leave(true),busy:()=>pending});
 }
 root.CoopRegistryDocumentsUi=Object.freeze({attach,version:'0.3.3'});
})(typeof window==='undefined'?globalThis:window);
