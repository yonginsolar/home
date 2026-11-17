/* 변경등기 입력1.6.0 · 기존 조회값의 항목별 복사. */
(function(root){
 'use strict';
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
 function court(address){
  const a=String(address||'').trim(),m=a.match(/^(?:(?:경기도|경기)\s+)?(용인(?:특례)?시|화성(?:특례)?시|수원(?:특례)?시)(?:\s|$)/);
  if(!m)return '';
  return m[1].startsWith('용인')?'수원지방법원 용인등기소':'수원지방법원 등기국';
 }
 async function load(client,{coop,topic,year,signal,current,verify,model,day=today(),onProfile=()=>{}}){
  const check=()=>{if(signal.aborted||!current())throw Error('조회가 취소되었습니다.');};
  async function read(q){check();const r=await q.abortSignal(signal);check();if(r.error)throw Error(r.error.code==='42501'?'현재 권한으로 입력 기준을 확인할 수 없습니다.':'입력 기준 조회에 실패했습니다. 다시 확인해 주세요.');return r;}
  async function pages(make,key){let total;const out=[],seen=new Set();for(let start=0;start<100000;start+=500){const r=await read(make().range(start,start+499));if(!Array.isArray(r.data)||!Number.isSafeInteger(r.count)||r.count<0||total!==undefined&&total!==r.count)throw Error('전체 건수 또는 조회 중 변경을 확인해 주세요.');total=r.count;for(const row of r.data){if(row[key]===null||row[key]===undefined||seen.has(String(row[key])))throw Error('조회 자료가 중복되거나 불완전합니다.');seen.add(String(row[key]));out.push(row);}if(out.length===total)return out;if(r.data.length<500||out.length>total)break;}throw Error('전체 자료를 확인하지 못했습니다. 다시 확인해 주세요.');}
  const runtime=await verify();check();
  const keys=['company_name','orgName','company_address','address','chairman_name'];
  const p=await read(client.from('ref_company_info').select('coop_id,key,value').eq('coop_id',coop).in('key',keys).limit(10));
  if(!Array.isArray(p.data)||p.data.some(r=>r.coop_id!==coop||!keys.includes(r.key)||typeof r.value!=='string')||new Set(p.data.map(r=>r.key)).size!==p.data.length)throw Error('조합 정보의 소속·항목을 확인해 주세요.');
  const profile=Object.fromEntries(p.data.map(r=>[r.key,r.value.trim()])),result={name:profile.company_name||profile.orgName||'',address:profile.company_address||profile.address||'',chair:profile.chairman_name||''};
  onProfile(result);check();
  if(topic==='capital'){
   if(runtime?.runtime_profile==='site_member')throw Error('현재 권한에서는 전체 출자 원장 합계를 확인할 수 없습니다. 시청 변경신고의 기존 자료 검토로 확인해 주세요.');
   if(!Number.isInteger(year)||year<1901||year>9998)throw Error('기준연도를 확인해 주세요.');
   const period=model.period(year+1),cutoff=period.end<day?period.end:day;
   if(period.start>day)throw Error('아직 시작되지 않은 연도의 출자금을 확정하지 않습니다.');
   const rules=await read(client.rpc('get_member_capital_rules')),unit=Number(rules.data?.unit);
   if(!Number.isSafeInteger(unit)||unit<=0)throw Error('ERP의 1좌 금액을 확인하지 못했습니다.');
   const make=()=>client.from('ref_members').select('id,coop_id,deposit_date,amount',{count:'exact'}).eq('coop_id',coop).lte('deposit_date',cutoff).order('id');
   const rows=await pages(make,'id'),again=await pages(make,'id');
   if(JSON.stringify(rows)!==JSON.stringify(again))throw Error('조회 중 출자 원장이 바뀌었습니다. 다시 확인해 주세요.');
   if(!rows.length)throw Error('출자 원장이 없습니다. 0원으로 확정하지 않습니다.');
   const missing=await read(client.from('ref_members').select('id',{count:'exact',head:true}).eq('coop_id',coop).is('deposit_date',null));if(missing.count!==0)throw Error('납입일이 없는 원장이 있어 기준일을 확인해야 합니다.');const total=model.capitalAt(rows,period,unit,coop).afterCapital;
   const latest=await read(client.rpc('get_member_capital_rules'));if(Number(latest.data?.unit)!==unit)throw Error('조회 중 1좌 금액이 바뀌었습니다. 다시 확인해 주세요.');
   if(total<0)throw Error('납입출자금 합계가 음수입니다. 원장을 확인해 주세요.');
   const activity=model.capitalAt(rows,period,unit,coop);result.capital={year,cutoff,provisional:period.end>day,total,unit,shares:total%unit===0?total/unit:null,activity:{increase:activity.increaseCapital,decrease:activity.decreaseCapital}};
  }else if(topic==='officers'||topic==='chair'){
   const rows=await pages(()=>client.from('coop_officials').select('id,coop_id,member_id,name,category,role,is_registered,status,term_start_date,term_end_date,real_end_date,term_count,end_reason',{count:'exact'}).eq('coop_id',coop).order('id'),'id');
   if(rows.some(r=>r.coop_id!==coop))throw Error('임원 이력의 조합을 확인해 주세요.');result.officials=rows.filter(r=>topic!=='chair'||r.role==='이사장');
  }else if(topic==='purpose'){
   const rows=await pages(()=>client.from('site_documents').select('id,coop_id,title,content,is_current,is_active',{count:'exact'}).eq('coop_id',coop).eq('category','doc').eq('is_current',true).eq('is_active',true).order('id'),'id');
   if(rows.some(r=>r.coop_id!==coop))throw Error('정관의 조합을 확인해 주세요.');const articles=rows.filter(r=>/정관/.test(r.title||''));result.purpose=articles.length===1?model.purposeFromText(articles[0].content):'';
  }
  check();return result;
 }
 function officialFields(kind,id,records,model){const change=model.officialChange(kind,id,records);if(change.error)return null;const row=records.find(r=>String(r.id)===String(id)&&model.registeredOfficer(r));if(!row||typeof row.name!=='string'||!row.name.trim()||typeof row.role!=='string')return null;const label={appointment:'취임',renewal:'중임',resignation:'사임',retirement:'퇴임'}[kind];if(!label)return null;return{name:row.name,role:row.role,kind:label,dates:'임기 '+row.term_start_date+' ~ '+row.term_end_date+(model.date(row.real_end_date)?' · ERP 종료일 '+row.real_end_date:'')};}
 function payment({topic,date,entity,scope,treatment,before,capital,authorized=true}){
  const r={base:null,registration:null,education:null,fee:null,needs:[],formula:[]},need=s=>r.needs.push(s);
  if(!authorized){need('현재 조합 권한을 먼저 확인해야 합니다.');return r;}
  if(!['capital','officers','chair','name','purpose','office'].includes(topic)){need('변경 유형이 필요합니다.');return r;}
  let increase=null;
  if(topic==='capital'){
   if(!capital||capital.provisional!==false||!Number.isInteger(capital.year)||capital.cutoff!==capital.year+'-12-31'||!Number.isSafeInteger(capital.total)||capital.total<0)need('종료된 기준연도의 ERP 출자금 집계가 필요합니다.');
   else{const s=String(before??'').trim();if(!/^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/.test(s)||!Number.isSafeInteger(Number(s.replaceAll(',',''))))need('직전 등기부의 납입출자금 총액이 필요합니다.');else{increase=capital.total-Number(s.replaceAll(',',''));if(increase>0)r.base=increase;else need(increase===0?'직전 등기액과 같아 출자 증가가 아닙니다.':'출자 감소는 이번 증액 산식 대상이 아닙니다.');}}
  }
  const validDate=typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;
  if(topic==='capital'&&validDate&&capital&&capital.cutoff>=date){increase=null;r.base=null;need('신청일보다 앞선 종료연도의 출자금 집계가 필요합니다.');}
  if(!validDate)need('신청 예정일이 필요합니다.');else if(date<'2026-10-02'||date>'2026-12-31')need('이 신청일의 시행 법령은 아직 계산 기준에 반영되지 않았습니다.');
  if(entity!=='ordinary')need(entity==='other'?'사회적협동조합·그 밖의 법인은 별도 세율·감면 검토 대상입니다.':'일반 협동조합(영리법인) 여부가 필요합니다.');
  if(scope!=='single')need('단독 신청 1건·등기목적 1개·수수료 면제 없음의 신청인지 정해야 합니다. 복합신청·관할 이전은 별도 계산입니다.');
  const eligible=validDate&&date>='2026-10-02'&&date<='2026-12-31'&&entity==='ordinary'&&scope==='single';
  if(eligible&&topic!=='office'){r.fee=5000;r.formula.push('전자표준양식 단독 1목적: 신청수수료 5,000원');}
  if(topic==='office'){need('주사무소 이전의 관할내·외와 구·신 소재지별 과세·신청 구분이 필요합니다.');return r;}
  if(!['standard','triple'].includes(treatment)){need('중과·감면·조례 특례 적용 여부가 필요합니다.');return r;}
  if(!eligible)return r;
  if(topic==='capital'&&increase>0){const multiplier=treatment==='triple'?3n:1n,raw=BigInt(increase)*4n,minimum=112500n*1000n,scaled=(raw>minimum?raw:minimum)*multiplier;r.registration=Number(scaled/10000n*10n);r.formula.push('증가액 × 0.4%, 최저 112,500원'+(multiplier===3n?'의 3배 중과':'')+' · 10원 미만 버림');}
  else if(topic!=='capital'&&treatment==='standard'){r.registration=40200;r.formula.push('지방세법 제28조 제1항 제6호 바목: 기타 변경등기 1건 40,200원');}
  else if(topic!=='capital'){need('선택한 일반 변경은 출자증가 3배 중과 산식 대상이 아닙니다.');}
  if(r.registration!==null){r.education=Number(BigInt(r.registration)*20n/1000n*10n);r.formula.push('지방교육세 = 등록면허세 × 20% · 10원 미만 버림');}
  return r;
 }
 function attach({client,authorize,context,onValues=()=>{},onProfile=()=>{},onScope=()=>{}}){
  const d=document,el=d.createElement('section');el.id='rgInputReference';el.className='rg-input-reference';
  const make=(tag,text,parent=el)=>{const n=d.createElement(tag);if(text)n.textContent=text;parent.append(n);return n;};
  make('h2','ERP 값');const controls=make('div','');controls.className='rg-input-controls';
  const yearLabel=make('label','출자금 기준연도 ',controls),year=make('input','',yearLabel);year.type='number';year.min='1901';year.max='9998';year.value=String(Number(today().slice(0,4))-1);year.id='rgInputYear';
  const kindLabel=make('label','변경 종류 ',controls),kind=make('select','',kindLabel);kind.id='rgInputKind';for(const[v,label]of[['appointment','취임'],['renewal','중임'],['resignation','사임'],['retirement','퇴임']])kind.add(new Option(label,v));
  const officerLabel=make('label','ERP 처리 이력 ',controls),officer=make('select','',officerLabel);officer.id='rgInputOfficer';
  const loadButton=make('button','다시 확인',controls);loadButton.type='button';loadButton.id='rgInputLoad';loadButton.hidden=true;
  const status=make('p','');status.id='rgInputStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const rows=make('div','');rows.id='rgInputRows';const caution=make('p','');caution.className='rg-note';
  let topic='',generation=0,valueVersion=0,flight=null,data=null,state=null,subject='',validated='';const drafts=new Map(),copies=new Map();
  const visible=()=>!d.hidden&&(!root.frameElement||!root.frameElement.hidden),allowed=()=>context().authorized&&visible();
  const requestKey=()=>context().key+'|'+topic+(topic==='capital'?'|'+year.value:'');
  function cancel(){onValues(null);generation++;flight?.controller.abort();flight=null;validated='';loadButton.disabled=false;loadButton.hidden=true;data=null;rows.replaceChildren();officer.replaceChildren();status.textContent='';}
  function row(label,value,copyValue,enabled=true,buttonText='복사'){const box=make('div','',rows);box.className='rg-info-row';make('strong',label,box);const out=make('output',value||'ERP에서 확인할 값이 없습니다.',box);if(copyValue!==undefined&&copyValue!==''){const b=make('button',buttonText,box);b.type='button';b.disabled=!enabled||copies.has(label);b.setAttribute('aria-label',label+' 복사');b.dataset.rgInputCopy=label;b.dataset.rgCopyReady=String(enabled);b.onclick=async()=>{if(!allowed()||b.disabled||copies.has(label))return;const g=generation,k=context().key,v=valueVersion,op={};copies.set(label,op);b.disabled=true;const active=()=>g===generation&&v===valueVersion&&k===context().key&&allowed();try{await navigator.clipboard.writeText(String(copyValue));if(active())status.textContent='복사했습니다.';}catch{if(active())status.textContent='복사하지 못했습니다. 표시된 값을 선택해 복사해 주세요.';}finally{if(copies.get(label)===op)copies.delete(label);if(k===context().key&&allowed())for(const n of rows.querySelectorAll('[data-rg-input-copy]'))if(n.dataset.rgInputCopy===label)n.disabled=n.dataset.rgCopyReady!=='true';}};}return out;}
  function render(){onValues(null);valueVersion++;if(status.textContent.startsWith('복사'))status.textContent='';rows.replaceChildren();if(!data)return;
   row('현재 ERP 주사무소',data.address,data.address);row('현재 ERP 이사장',data.chair,data.chair);
   if(topic==='office'){const recommendation=court(data.address);row('관할 추천',recommendation||'인터넷등기소의 전국등기소안내에서 확인하세요.');}
   if(topic==='capital') {const c=data.capital,shares=c.shares;row('집계 기준',c.cutoff+(c.provisional?' · 연말 미확정':' · 종료연도 ERP 원장 집계'));row('변경 후 납입출자금 총액',c.total.toLocaleString('ko-KR')+'원');row('계산에 사용한 ERP 현재 1좌 금액',c.unit.toLocaleString('ko-KR')+'원');row('변경 후 출자총좌수',shares===null?'납입총액이 ERP 현재 1좌 금액으로 나누어떨어지지 않습니다.':shares.toLocaleString('ko-KR')+'좌');const content=shares===null?'':'출자총좌수 '+shares.toLocaleString('ko-KR')+'좌\n납입출자금 총액 '+c.total.toLocaleString('ko-KR')+'원';row('등기할 내용',content||'ERP 출자 기준과 원장을 확인해 주세요.',content,!c.provisional,'내용 복사');onValues({topic,capital:c,content:c.provisional?'':content,state:c.provisional?'연말 미확정':'ERP 출자 기준 확인 필요'});caution.textContent='좌수는 ERP 현재 1좌 금액 기준입니다.';}
   else if(topic==='officers'||topic==='chair'){const change=root.CoopRegistryModel.officialChange(kind.value,officer.value,data.officials),official=officialFields(kind.value,officer.value,data.officials,root.CoopRegistryModel);onValues({topic,official});row('변경 전',change.error?'ERP 처리 이력을 선택해 주세요.':change.before,change.error?'':change.before);row('변경 후',change.error||change.after,change.error?'':change.after);if(official){row('ERP 임원 성명',official.name,official.name);row('ERP 임원 직책',official.role,official.role);row('ERP 임원 처리 구분',official.kind,official.kind);}caution.textContent='등기원인·효력일은 이번 근거와 대조하세요. 대표자 주소와 식별번호는 인터넷등기소에서 직접 입력합니다.';}
   else if(topic==='purpose'){row('현재 정관의 목적',data.purpose||'현재 정관에서 목적 조항을 하나로 확인하지 못했습니다.',data.purpose);caution.textContent='현재 목적은 변경 후 참고값입니다. 등기된 기존 목적과 의결된 추가·삭제 문구를 대조하세요. ERP 저장일을 효력일로 쓰지 않습니다.';}
   else if(topic==='name'){row('ERP 현재 조합명',data.name,data.name);caution.textContent='등기부의 기존 명칭과 의결된 새 명칭·효력일을 각각 확인하세요.';}
   else{caution.textContent='현재 ERP 주소가 새 주소라면 변경 후 참고값입니다. 변경 전 등기주소·실제 이전일과 이전 전후의 법인·상업등기 관할을 각각 확인하세요.';}
  }
  function options(){const old=state.officials[kind.value]||'';officer.replaceChildren(new Option('처리 이력 선택',''));for(const r of root.CoopRegistryModel.officialOptions(kind.value,data?.officials||[]))officer.add(new Option(r.name+' · '+r.role+' · '+r.term_start_date,String(r.id)));officer.value=old;if(!officer.value)state.officials[kind.value]='';}
  function open(next){const k=context().key;if(state){state.year=year.value;state.kind=kind.value;}cancel();if(subject&&subject!==k)drafts.clear();subject=k;topic=next;const key=k+'|'+next;state=drafts.get(key)||{year:String(Number(today().slice(0,4))-1),kind:'appointment',officials:{}};drafts.set(key,state);year.value=state.year;kind.value=state.kind;yearLabel.hidden=next!=='capital';kindLabel.hidden=officerLabel.hidden=!['officers','chair'].includes(next);caution.textContent='';onScope(topic,year.value);void refresh();}
  function refresh(){if(!allowed()||!state)return;if(subject!==context().key){cancel();return;}const key=requestKey();if(flight?.requestKey===key)return flight.promise;if(validated===key)return;if(topic==='capital'&&(!/^\d{4}$/.test(year.value)||Number(year.value)<1901||Number(year.value)>9998)){onValues({topic,state:'기준연도 확인 필요'});status.textContent='기준연도를 확인해 주세요.';return;}
   const op={g:generation,key:context().key,requestKey:key,controller:new AbortController()};flight=op;data=null;render();loadButton.disabled=true;loadButton.hidden=true;status.textContent='ERP 값을 확인하고 있습니다.';const current=()=>flight===op&&generation===op.g&&context().key===op.key&&requestKey()===op.requestKey&&allowed()&&!op.controller.signal.aborted;
   op.promise=(async()=>{let timer;try{const work=load(client,{coop:context().coop,topic,year:Number(year.value),signal:op.controller.signal,current,verify:authorize,model:root.CoopRegistryModel,onProfile:value=>{if(current()){op.profileReceived=true;onProfile(value);}}});const value=await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>{op.controller.abort();reject(Error('조회가 지연되고 있습니다. 다시 확인해 주세요.'));},15000);})]);if(!current())return;data=value;validated=key;options();render();status.textContent='';}
    catch(e){if(generation===op.g&&context().key===op.key&&requestKey()===op.requestKey&&allowed()){if(!op.profileReceived)onProfile({error:true});onValues({topic,state:'ERP 값 확인 필요'});status.textContent=e.message||'확인하지 못했습니다. 다시 확인해 주세요.';loadButton.hidden=false;}}
    finally{clearTimeout(timer);if(flight===op){flight=null;loadButton.disabled=false;}}
   })();return op.promise;
  }
  loadButton.onclick=()=>{if(!loadButton.hidden)void refresh();};
  year.oninput=()=>{if(state.year===year.value)return;state.year=year.value;onScope(topic,year.value);cancel();caution.textContent='';void refresh();};
  kind.onchange=()=>{state.kind=kind.value;if(data){options();render();}};officer.onchange=()=>{state.officials[kind.value]=officer.value;if(data)render();};
  loadButton.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.repeat)e.preventDefault();});
  return{element:el,open,refresh,leave:cancel};
 }
 root.CoopRegistryGuideInputs=Object.freeze({court,load,attach,officialFields,payment,version:'1.6.0'});
})(typeof window==='undefined'?globalThis:window);
