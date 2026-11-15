/* 0.3.0 · 기존 Auth/RLS/Storage의 읽기만 사용한다. */
(function(root){
 'use strict';
 const tableColumns={
  minutes:'id,coop_id,title,content,created_at,status,doc_type,requires_sign,published_at,file_urls,meeting_outcome',
  site_documents:'id,coop_id,title,content,event_date,version,is_current,is_active,category,file_url,updated_at',
  coop_notices:'id,coop_id,title,content,status,category,created_at,updated_at,file_url,file_urls',
  ref_approval:'id,coop_id,title,content,created_at,processed_at,status,doc_type,doc_no,file_links,notice_usage',
  meeting_packages:'id,coop_id,title,meeting_type,meeting_date,fiscal_year,published_minute_id,assembly_booklet_data,updated_at',
  meeting_package_agendas:'id,coop_id,package_id,agenda_kind,title,summary,proposal_text,decision_result,updated_at',
  coop_officials:'id,coop_id,member_id,name,category,role,is_registered,status,term_start_date,term_end_date,real_end_date,term_count,end_reason,resignation_document_path,resignation_document_name'
 };
 const revision=row=>JSON.stringify(row),model=()=>root.CoopRegistryDocumentsModel;
 function files(row){const raw=row.file_urls||row.file_links;let list=[];if(Array.isArray(raw))list=raw;else if(typeof raw==='string'&&raw.trim()){try{const parsed=JSON.parse(raw);list=Array.isArray(parsed)?parsed:[raw];}catch{list=[raw];}}if(row.file_url)list.unshift(row.file_url);if(row.resignation_document_path)list.push(row.resignation_document_path);return [...new Set(list.filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim()))];}
 function storageFile(value){
  const s=String(value||'');if(!s||s.includes('\\')||/[\x00-\x1f]/.test(s))throw Error('첨부파일 경로를 확인해 주세요.');
  if(s.startsWith('https://')){const u=new URL(s);if(u.origin!=='https://ifdqlwxgqgsvnawmhlfc.supabase.co'||u.username||u.password)throw Error('기존 첨부 저장소의 PDF를 선택해 주세요.');const m=u.pathname.match(/^\/storage\/v1\/object\/(?:public|sign)\/(attachments|meeting-package-files)\/(.+)$/);if(!m)throw Error('기존 첨부 저장소의 PDF를 선택해 주세요.');const path=decodeURIComponent(m[2]);if(path.split('/').some(p=>p==='..'||p==='.')||!path)throw Error('첨부파일 경로를 확인해 주세요.');return{bucket:m[1],path};}
  if(/^[a-z][a-z0-9+.-]*:/i.test(s)||s.startsWith('//')||s.startsWith('/')||s.split('/').some(p=>p==='..'||p==='.')||s.includes('?')||s.includes('#'))throw Error('첨부파일 경로를 확인해 주세요.');return{bucket:'attachments',path:s};
 }
 function decorate(row,table){return{...row,title:row.title||(table==='coop_officials'?row.name+' · 사임서':''),table,key:table+':'+row.id,revision:revision(row),files:files(row),types:model().sourceTypes({...row,table})};}
 async function catalog(client,options){
  const {coop,signal,current,verify}=options,check=()=>{if(signal?.aborted||!current())throw Error('조회가 취소되었습니다.');};
  await verify();check();
  async function pages(table){const rows=[],seen=new Set();let total;for(let start=0;start<100000;start+=250){check();let q=client.from(table).select(tableColumns[table],{count:'exact'}).eq('coop_id',coop);if(table==='site_documents')q=q.eq('category','doc').eq('is_active',true);if(table==='ref_approval')q=q.eq('doc_type','공문').in('status',['완료','실물결재완료']);const r=await q.order('id').range(start,start+249).abortSignal(signal);check();if(r.error||!Array.isArray(r.data)||!Number.isSafeInteger(r.count))throw Error('자료 조회 권한·연결을 확인해 주세요.');if(total===undefined)total=r.count;if(r.count!==total)throw Error('조회 중 자료가 바뀌었습니다. 다시 확인해 주세요.');for(const row of r.data){if(row.coop_id!==coop||!row.id||seen.has(String(row.id)))throw Error('다른 조합 또는 중복 자료가 포함됐습니다.');seen.add(String(row.id));rows.push(row);}if(rows.length===total)return rows;if(r.data.length<250||rows.length>total)break;}throw Error('자료 전체를 확인하지 못했습니다.');}
  const tables=Object.keys(tableColumns),result=await Promise.allSettled(tables.map(pages));check();const data={},failures=[];tables.forEach((table,i)=>{if(result[i].status==='fulfilled')data[table]=result[i].value;else{data[table]=null;failures.push(table);}});return{data,failures,catalog:['minutes','site_documents','coop_notices','ref_approval','coop_officials'].flatMap(table=>(data[table]||[]).map(row=>decorate(row,table)))};
 }
 async function confirm(client,source,options){
  const {coop,signal,current,verify}=options,check=()=>{if(signal?.aborted||!current())throw Error('출력 준비가 취소되었습니다.');};
  if(!Object.hasOwn(tableColumns,source.table)||source.coop_id!==coop)throw Error('선택한 문서의 조합을 확인해 주세요.');await verify();check();
  const r=await client.from(source.table).select(tableColumns[source.table]).eq('coop_id',coop).eq('id',source.id).limit(2).abortSignal(signal);check();
  if(r.error||!Array.isArray(r.data)||r.data.length!==1||r.data[0].coop_id!==coop||revision(r.data[0])!==source.revision)throw Error('선택한 문서가 바뀌었거나 조회할 수 없습니다. 다시 확인해 주세요.');return decorate(r.data[0],source.table);
 }
 async function pdf(client,source,fileIndex,options){
  const checked=await confirm(client,source,options),raw=checked.files[fileIndex];if(!raw)throw Error('출력할 PDF 원본을 선택해 주세요.');const file=storageFile(raw);const r=await client.storage.from(file.bucket).download(file.path);if(options.signal?.aborted||!options.current())throw Error('출력 준비가 취소되었습니다.');if(r.error||!r.data||r.data.size>20971520||r.data.size<5)throw Error('선택한 PDF를 불러오지 못했습니다.');const bytes=new Uint8Array(await r.data.arrayBuffer());if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-'){bytes.fill(0);throw Error('PDF 원본 파일을 선택해 주세요.');}try{await confirm(client,source,options);return bytes;}catch(e){bytes.fill(0);throw e;}
 }
 root.CoopRegistryDocumentSources=Object.freeze({catalog,confirm,pdf,files,storageFile,decorate,version:'0.3.0'});
})(typeof window==='undefined'?globalThis:window);
