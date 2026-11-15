/* 0.3.0 · 기존 PIN 명부의 필요한 열·대상만 조회한다. */
(function(root){
 'use strict';
 async function load(kind,client,options){
  const {coop,cutoff,signal,current,verify}=options,M=root.CoopRegistryDocumentsModel;
  const check=()=>{if(signal?.aborted||!current())throw Error('명부 준비가 취소되었습니다.');};
  const records=[];let secure=[];
  async function read(query,sensitive=false){check();const r=await query.abortSignal(signal);try{check();if(r.error||!Array.isArray(r.data))throw Error('명부 조회 권한·연결을 확인해 주세요.');return r;}catch(e){if(sensitive&&Array.isArray(r.data))for(const row of r.data)row.decrypted_rrn='';throw e;}}
  async function pages(make){const rows=[];let total;for(let start=0;start<100000;start+=250){const r=await read(make().range(start,start+249));if(!Number.isSafeInteger(r.count))throw Error('명부 전체 건수를 확인해 주세요.');if(total===undefined)total=r.count;if(r.count!==total)throw Error('조회 중 명부가 바뀌었습니다.');rows.push(...r.data);if(rows.length===total)return rows;if(r.data.length<250||rows.length>total)break;}throw Error('명부 전체를 확인하지 못했습니다.');}
  try{
   await verify();check();if(!root.CoopRegistryModel.date(cutoff)||cutoff>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()))throw Error('명부 기준일을 확인해 주세요.');
   let proof=null,first=[];
   if(kind==='officers'){
    const rows=await pages(()=>client.from('coop_officials').select('id,coop_id,member_id,name,category,role,is_registered,status,term_start_date,term_end_date,real_end_date,term_count,end_reason',{count:'exact'}).eq('coop_id',coop).order('id'));
    first=M.officersAt(rows,cutoff,coop);if(first.some(r=>!r.member_id))throw Error('비조합원 임원의 식별정보는 등록된 임원명부 PDF를 선택해 주세요.');
    for(const r of first){const members=await read(client.from('coop_members').select('id,coop_id,member_id,name,member_type,corp_number,updated_at').eq('coop_id',coop).eq('member_id',r.member_id).limit(2));if(members.data.length!==1||members.data[0].name!==r.name)throw Error('임원·회원 연결을 확인해 주세요.');records.push({...members.data[0],role:r.role});}
   }else if(kind==='members'){
    if(!/^\d{4}-12-31$/.test(cutoff))throw Error('조합원 명부의 연말 기준일을 확인해 주세요.');
    records.push(...await pages(()=>client.from('coop_members').select('id,coop_id,member_id,name,member_type,status,join_date,corp_number,updated_at',{count:'exact'}).eq('coop_id',coop).order('id')));
    proof=await pages(()=>client.rpc('member_export_city_membership_at_year_end',{p_year:Number(cutoff.slice(0,4))},{count:'exact'}).order('member_uid'));
    root.CoopRegistryRosterMath.validate(records,proof,cutoff,coop);
   }else throw Error('명부 종류를 확인해 주세요.');
   const included=kind==='members'?new Set(proof.filter(r=>r.is_member_on_cutoff===true).map(r=>r.member_uid)):null;
   const excluded=new Set(['07e99e55-bc64-432c-828d-66817d80c0d6','e4a11490-7c88-43ff-9c6b-b010a98f65dc']);
   const selected=records.filter(r=>(!included||included.has(r.id))&&!excluded.has(r.id));
   if(!selected.length)throw Error('출력할 명부가 없습니다.');
   const ids=selected.map(r=>r.member_id);if(new Set(ids).size!==ids.length||ids.some(v=>!v))throw Error('회원 연결이 중복되거나 없습니다.');
   for(let i=0;i<ids.length;i+=250){const chunk=ids.slice(i,i+250),r=await read(client.rpc('get_full_members_secure',{p_pin:options.pin}).select('member_id,name,phone,address,member_type,decrypted_rrn').in('member_id',chunk),true);secure.push(...r.data);if(r.data.some(r=>!chunk.includes(r.member_id)))throw Error('다른 회원의 보안정보가 포함됐습니다.');}
   await verify();check();
   if(kind==='members'){const latest=await pages(()=>client.rpc('member_export_city_membership_at_year_end',{p_year:Number(cutoff.slice(0,4))},{count:'exact'}).order('member_uid'));if(JSON.stringify(latest)!==JSON.stringify(proof))throw Error('조회 중 가입 이력이 바뀌었습니다. 다시 확인해 주세요.');}
   else{const latest=await pages(()=>client.from('coop_officials').select('id,coop_id,member_id,name,category,role,is_registered,status,term_start_date,term_end_date,real_end_date,term_count,end_reason',{count:'exact'}).eq('coop_id',coop).order('id'));if(JSON.stringify(M.officersAt(latest,cutoff,coop))!==JSON.stringify(first))throw Error('조회 중 임원 이력이 바뀌었습니다. 다시 확인해 주세요.');}
   for(let i=0;i<ids.length;i+=250){const chunk=ids.slice(i,i+250),latest=await read(client.from('coop_members').select('member_id,coop_id,updated_at').eq('coop_id',coop).in('member_id',chunk));if(latest.data.length!==chunk.length||latest.data.some(r=>r.coop_id!==coop||!chunk.includes(r.member_id)||r.updated_at!==selected.find(s=>s.member_id===r.member_id)?.updated_at))throw Error('조회 중 회원정보가 바뀌었습니다. 다시 확인해 주세요.');}
   const output=M.roster(selected,secure,coop,kind,kind==='members'?proof:null);if(kind==='members')Object.defineProperty(output,'membershipProof',{value:JSON.stringify(proof.map(r=>[r.member_uid,r.is_member_on_cutoff,r.joined_on,r.ended_on,r.review_codes,r.member_updated_at]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))),writable:true});return output;
  }finally{for(const r of secure)r.decrypted_rrn='';secure=[];options.pin='';}
 }
 root.CoopRegistryDocumentsSecure=Object.freeze({load,version:'0.3.0'});
})(typeof window==='undefined'?globalThis:window);
