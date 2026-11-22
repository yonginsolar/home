/* 변경신고 첨부서류 0.6.0 · 직접 선택한 회의·소집 문서를 자동으로 묶는다. */
(function(root){
 'use strict';
 const text=v=>String(v??'').trim();
 const labels=Object.freeze({articles:'변경한 정관',notice:'총회 소집공고',assembly:'총회 의사록',board:'이사회 의사록',officers:'임원명부 · 별지 제3호',members:'조합원 명부 · 별지 제6호',investors:'출자자 명부',plan:'해당 연도 전체 사업계획서 · 별지 제4호',budget:'해당 연도 전체 수입·지출 예산서 · 별지 제5호',resignation:'사임서',balance:'재무상태표',creditors:'출자감소·채권자 보호 증명서류',proxy:'위임장',sealCertificate:'법인인감증명서',filingCertificate:'신고확인증 원본',addressAbstract:'이사장 주소변경 초본'});
 function isProxy(input){
  if(input.submissionMode==='chair')return false;
  if(input.submissionMode==='proxy')return true;
  if(input.applicantIsChair===true)return false;
  if(input.applicantIsChair===false)return true;
  // 이름이 같은 직원만으로 이사장 본인임을 판정하지 않는다.
  return !(input.applicantMemberId&&input.applicantMemberId===input.chairMemberId&&text(input.applicant)===text(input.chairName));
 }
 function requirements(input){
  input={...input,...root.CoopRegistryModel.changeScope(input)};
  const kinds=new Set(input.kinds||[]),need=new Map(),add=(key,mode='select')=>need.set(key,{key,label:labels[key],mode});
  const articles=kinds.has('articles')||kinds.has('name')||kinds.has('purpose')||!!input.unitReduced||!!input.unitIncreased;
  if(articles){add('articles');add('assembly');add('notice');}
  if(kinds.has('office'))add('board');
  if(['appointment','renewal','retirement','resignation','chair'].some(k=>kinds.has(k)))add('officers','generate');
  if(['appointment','renewal','chair'].some(k=>kinds.has(k))||input.resolutionRequired){add('assembly');add('notice');}
  if(kinds.has('resignation'))add('resignation');
  if(kinds.has('capital')||kinds.has('members'))add('investors','existing');
  if(kinds.has('purpose')||input.businessAccountingChanged){add('plan');add('budget');}
  if(input.unitReduced){add('balance');add('creditors');}
  if(['name','chair','office'].some(k=>kinds.has(k)))add('filingCertificate','external');
  if(kinds.has('chairAddress'))add('addressAbstract','external');
  if((text(input.applicant)||input.submissionMode==='proxy')&&isProxy(input)){add('proxy','generate');add('sealCertificate','external');}
  return [...need.values()];
 }
 const words={name:/명칭|조합명|명칭변경/,office:/주(?:된|사무소)|사무소.{0,12}(이전|소재지)|소재지.{0,10}변경/,purpose:/사업.{0,12}(목적|종류|추가|변경)|목적사업/,articles:/정관.{0,12}(개정|변경)/,appointment:/임원.{0,12}(선임|선출)|이사.{0,8}(선임|선출)|감사.{0,8}(선임|선출)/,renewal:/중임|재선임|임원.{0,8}선출/,retirement:/퇴임|임기.{0,8}만료/,resignation:/사임/,chair:/이사장.{0,12}(선임|선출|변경)/,capital:/출자.{0,12}(감소|증가|금액|좌)/};
 function plain(value){return text(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/\s+/g,' ');}
 function recommend(input,doc,agendas=[]){
  if(doc.coop_id!==input.coopId||doc.meeting_outcome==='NOT_HELD')return [];
  const content=plain(doc.content),agendaText=agendas.filter(a=>a.coop_id===input.coopId).map(a=>[a.title,a.summary,a.proposal_text,a.decision_result].map(plain).join(' ')).join(' ');
  const evidence=agendaText||content;
  // 제목은 목록 정렬/표시에만 쓰고 추천 근거에는 넣지 않는다.
  return (input.kinds||[]).filter(k=>words[k]?.test(evidence));
 }
 function sourceTypes(doc){
  if(doc.table==='site_documents'){const types=[];if(/정관/.test(doc.title))types.push('articles');if(/사업계획/.test(doc.title))types.push('plan');if(/예산/.test(doc.title))types.push('budget');return types;}
  if(doc.table==='coop_notices'||doc.doc_type==='NOTICE')return text(doc.title).includes('소집')?['notice']:[];
  if(doc.table==='ref_approval'&&doc.doc_type==='공문'&&['완료','실물결재완료'].includes(doc.status))return text(doc.title).includes('소집')?['notice']:[];
  if(doc.table==='coop_officials'&&root.CoopRegistryModel.registeredOfficer(doc)&&doc.end_reason==='resignation'&&doc.resignation_document_path)return ['resignation'];
  if(doc.table!=='minutes')return [];
  if(doc.doc_type==='GENERAL_ASSEMBLY')return ['assembly'];
  if(doc.doc_type==='MINUTES')return ['board'];
  if(doc.doc_type==='PAST_MINUTES'){
   if(doc.meeting_type==='GENERAL_ASSEMBLY')return ['assembly'];
   if(doc.meeting_type==='BOARD')return ['board'];
   const title=text(doc.title),assembly=/총회/.test(title),board=/이사회/.test(title);
   if(assembly&&!board)return ['assembly'];if(board&&!assembly)return ['board'];
  }
  return [];
 }
 function chosen(input,selection,catalog){
  const needs=requirements(input),rows=[],missing=[];
  for(const req of needs){
   if(req.mode==='external'){rows.push({...req,state:'external'});continue;}
   if(req.mode==='existing'||req.mode==='generate'&&!selection[req.key]?.sourceKey){rows.push({...req,state:'generated'});continue;}
   const selected=selection[req.key],source=selected&&catalog.find(d=>d.key===selected.sourceKey&&d.coop_id===input.coopId);
   const automatic=['assembly','board','notice'].includes(req.key);
   if(!source||!(source.types||[]).includes(req.key)||source.meeting_outcome==='NOT_HELD'||!automatic&&!selected.reviewed||selected.revision!==source.revision){missing.push(req.label+(automatic?' 선택':' 선택·확인'));rows.push({...req,state:'missing'});continue;}
   if(req.key==='resignation'&&source.table==='coop_officials'&&String(source.id)!==String(input.official_resignation)){missing.push('선택한 임원의 사임서 확인');rows.push({...req,state:'missing'});continue;}
   if(!automatic&&!source.local&&(!Number.isInteger(selected.fileIndex)||!source.files?.[selected.fileIndex])){missing.push(req.label+' 출력할 PDF 선택');rows.push({...req,state:'missing'});continue;}
   if((req.key==='plan'||req.key==='budget')&&(!selected.wholeYear||Number(selected.year)!==Number(input.businessYear))){missing.push(req.label+' 연도·전체 내용 확인');rows.push({...req,state:'missing'});continue;}
   rows.push({...req,state:'selected',source,selection:selected});
  }
  return{rows,missing};
 }
 function officersAt(records,day,coop){
  if(!root.CoopRegistryModel.date(day)||records.some(r=>r.coop_id!==coop))throw Error('임원명부의 조합·기준일을 확인해 주세요.');
  if(records.some(r=>root.CoopRegistryModel.registeredOfficer(r)&&r.status==='active'&&(!root.CoopRegistryModel.date(r.term_start_date)||!root.CoopRegistryModel.date(r.term_end_date)||r.real_end_date&&!root.CoopRegistryModel.date(r.real_end_date))))throw Error('현재 임원의 임기 날짜를 확인해 주세요.');
  const rows=records.filter(r=>r.coop_id===coop&&root.CoopRegistryModel.registeredOfficer(r)&&r.term_start_date<=day&&(!r.real_end_date||r.real_end_date>day)&&r.term_end_date>=day);
  const keys=new Set();for(const r of rows){const key=r.member_id||'external:'+r.id;if(keys.has(key))throw Error('같은 임원의 임기 이력이 겹칩니다.');keys.add(key);}
  if(!rows.length||rows.filter(r=>r.role==='이사장').length!==1)throw Error('신고 기준일의 이사장·등기 임원을 확인해 주세요.');
  return rows.sort((a,b)=>['이사장','이사','감사'].indexOf(a.role)-['이사장','이사','감사'].indexOf(b.role)||text(a.name).localeCompare(text(b.name),'ko'));
 }
 function roster(records,secure,coop,kind,proof){
  if(!Array.isArray(secure)||new Set(secure.map(r=>r.member_id)).size!==secure.length)throw Error('보안명부 응답이 중복되거나 불완전합니다.');
  const checked=new Map(secure.map(r=>[r.member_id,r]));
  if(kind==='members'){
   if(!Array.isArray(proof)||proof.some(r=>r.is_member_on_cutoff===null||r.review_codes?.length))throw Error('기준일 조합원 명부를 확인해 주세요.');
   const included=new Set(proof.filter(r=>r.is_member_on_cutoff===true).map(r=>r.member_uid));records=records.filter(r=>included.has(r.id));
  }
  return records.map((r,i)=>{if(r.coop_id!==coop||!r.member_id)throw Error('명부의 조합·회원 연결을 확인해 주세요.');const s=checked.get(r.member_id),corporate=r.member_type==='단체';if(!s||s.name!==r.name||s.member_type!==r.member_type)throw Error('명부 작성 중 회원정보가 바뀌었습니다.');if(kind==='officers'&&corporate)throw Error('법인 임원의 직무수행자 정보가 포함된 임원명부 PDF를 선택해 주세요.');const identity=corporate?r.corp_number:s.decrypted_rrn;if(!/^\d{6}-?\d{7}$/.test(identity||'')||!text(s.phone)||kind==='officers'&&!text(s.address))throw Error('명부의 식별번호·주소·연락처를 확인해 주세요.');return{sequence:i+1,role:r.role||'',name:s.name,identity:identity.replace(/^(\d{6})(\d{7})$/,'$1-$2'),address:s.address||'',phone:s.phone,stakeholder:'',founder:''};});
 }
 function planReadiness(row,year){const d=row?.assembly_booklet_data||{},missing=[];if(Number(row?.fiscal_year)!==Number(year))missing.push('사업연도');if(!text(d.business_plan_goal))missing.push('사업 목표');if(!text(d.business_plan_details))missing.push('해당 연도 전체 사업');for(const key of ['income_budget','expense_budget'])if(!Array.isArray(d[key])||!d[key].length||d[key].some(r=>!text(r.name)||!text(r.basis)||!Number.isSafeInteger(Number(r.amount))||Number(r.amount)<0))missing.push(key==='income_budget'?'수입 예산':'지출 예산');return{ready:false,missing,available:!missing.length,reason:'별지 제4·5호의 조직 개요·조직도·경력 등 보완 필요'};}
 root.CoopRegistryDocumentsModel=Object.freeze({requirements,isProxy,recommend,sourceTypes,chosen,officersAt,roster,planReadiness,labels,plain,version:'0.6.0'});
})(typeof window==='undefined'?globalThis:window);
