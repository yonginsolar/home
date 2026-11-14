/* 0.2.13 · 기존 시청용 RPC/RLS·직인 Storage 권한만 사용. */
(function(root){
 'use strict';
 async function load(client,options){
  const {coop,cutoff,unit,signal,current,verify}=options;let seal=null;
  const check=()=>{if(signal?.aborted||!current())throw Error('출력 준비가 취소되었습니다.');};
  async function read(builder){check();const r=await (builder.abortSignal?builder.abortSignal(signal):builder);check();if(r.error)throw Error(r.error.code==='42501'?'시청용 명부·직인 조회 권한을 확인해 주세요.':'시청용 명부·직인을 불러오지 못했습니다.');return r;}
  async function pages(make,key){const rows=[],seen=new Set();let total;for(let start=0;start<100000;start+=500){const r=await read(make().range(start,start+499));if(!Array.isArray(r.data)||!Number.isSafeInteger(r.count)||r.count<0)throw Error('명부 전체 건수를 확인하지 못했습니다.');if(total===undefined)total=r.count;if(total!==r.count)throw Error('조회 중 명부가 바뀌었습니다.');for(const row of r.data){if(!row[key]||seen.has(String(row[key])))throw Error('명부 조회 결과가 중복되었습니다.');seen.add(String(row[key]));rows.push(row);}if(rows.length===total)return rows;if(r.data.length<500||rows.length>total)break;}throw Error('명부 전체를 확인하지 못했습니다.');}
  if(!/^\d{4}-12-31$/.test(cutoff)||cutoff>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()))throw Error('선택한 연도가 끝난 뒤 시청용 명부를 출력할 수 있습니다.');
  try{
   const runtime=await verify();check();const site=runtime?.runtime_profile==='site_member';
   const members=await pages(()=>client.from('coop_members').select('id,coop_id,member_id,name,member_type,status,join_date,birth_date,rrn_display,corp_number,business_number,updated_at',{count:'exact'}).eq('coop_id',coop).order('name').order('id'),'id');
   const proof=()=>pages(()=>client.rpc('member_export_city_membership_at_year_end',{p_year:Number(cutoff.slice(0,4))},{count:'exact'}).order('member_uid'),'member_uid');
   const first=await proof(),confirmed=await proof();const sig=rows=>JSON.stringify(rows.map(r=>[r.member_uid,r.is_member_on_cutoff,r.joined_on,r.ended_on,r.review_codes,r.member_updated_at]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
   if(sig(first)!==sig(confirmed))throw Error('조회 중 가입 이력이 바뀌었습니다.');
   root.CoopRegistryRosterMath.validate(members,confirmed,cutoff,coop);
   const ledger=await pages(()=>site?client.rpc('member_export_capital_snapshot_secure',{p_cutoff_date:cutoff},{count:'exact'}).order('member_id'):client.from('ref_members').select('id,coop_id,member_id,amount',{count:'exact'}).eq('coop_id',coop).lte('deposit_date',cutoff).order('id'),site?'member_id':'id'),snapshot={};
   for(const r of ledger){const amount=Number(r.total_capital??r.amount);if((!site&&r.coop_id!==coop)||!r.member_id||!Number.isSafeInteger(amount))throw Error('명부 출자 원장을 확인해 주세요.');snapshot[r.member_id]=site?amount:(snapshot[r.member_id]||0)+amount;if(!Number.isSafeInteger(snapshot[r.member_id]))throw Error('출자금 합계를 확인해 주세요.');}
   const result=root.CoopRegistryRosterMath.build(members,{cutoffDate:cutoff,shareUnitAmount:unit,snapshotMap:snapshot,exportType:'city-report',cityMembership:confirmed});
   if(!result.rows.length)throw Error('출력할 시청용 명부가 없습니다.');
   const config=(await read(client.rpc('erp_coop_certificate_setup',{p_action:'get',p_data:{}}))).data;
   if(config?.coop_id!==coop)throw Error('직인의 조합 권한을 확인해 주세요.');const path=String(config.seal_path||'');
   if(!path)throw Error('등록된 조합 직인이 없습니다.');
   const prefix='company-seals/'+coop+'/';if(!path.startsWith(prefix)&&!['Official Seal.png','ec_seal.png'].includes(path))throw Error('조합 직인 설정을 확인해 주세요.');
   await verify();check();const file=await client.storage.from('attachments').download(path);
   if(file.error||!file.data||file.data.type!=='image/png'||file.data.size>5242880)throw Error('직인 조회 권한·파일을 확인해 주세요.');
   seal=new Uint8Array(await file.data.arrayBuffer());check();
   const latest=(await read(client.rpc('erp_coop_certificate_setup',{p_action:'get',p_data:{}}))).data;
   if(latest?.coop_id!==coop||latest.seal_path!==path||latest.seal_revision!==config.seal_revision)throw Error('조회 중 직인이 바뀌었습니다.');
   await verify();check();return {seal,roster:{coop,cutoff,unit,rows:result.rows,totalCapital:result.totalCapital}};
  }catch(e){seal?.fill(0);if(Array.isArray(e?.cityReview))throw Error('가입 이력 확인 필요 '+e.cityReview.length+'명: 시청용 명부를 확인해 주세요.');throw e;}
 }
 root.CoopRegistryBundle=Object.freeze({load,version:'0.2.13'});
})(typeof window==='undefined'?globalThis:window);
