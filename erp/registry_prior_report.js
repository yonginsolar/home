/* 1.0.0 · 신고연도별 직전 신고값을 읽고 기존 수치 수정 경로에 연결한다. */
(function(root){
 'use strict';
 const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(s);
 const integer=n=>Number.isSafeInteger(n)&&n>=0;
 const titles=['설립신고','설립신고확인증','설립신고확인증 발급','설립신고 완료','설립신고 수리','협동조합 설립신고확인증 발급'];
 const date=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 function resolve(year,coop,response,foundations=[]){
  if(!Number.isInteger(year)||year<1901||year>9999||!coop||!response||response.coop_id!==coop||response.report_year!==year-1||!Object.hasOwn(response,'current'))throw Error('직전 신고값의 조합·연도를 확인해 주세요.');
  const record=response.current,values={},result={date:(year-2)+'-12-31',label:'직전 신고',values};
  if(record!==null){
   if(!uuid(record?.revision)||!record.values||typeof record.values!=='object'||Array.isArray(record.values))throw Error('직전 신고값을 확인해 주세요.');
   for(const [from,to]of [['afterMembers','beforeMembers'],['afterCapital','beforeCapital'],['afterShares','beforeShares']])if(Object.hasOwn(record.values,from)){if(!integer(record.values[from])||from==='afterMembers'&&record.values[from]>2147483647)throw Error('직전 신고값을 확인해 주세요.');values[to]=record.values[from];}
   if(Object.keys(values).length)return result;
  }
  if(!Array.isArray(foundations)||foundations.some(r=>r.coop_id!==coop))throw Error('설립 신고 기준의 조합을 확인해 주세요.');
  const first=foundations.filter(r=>r.category==='history'&&r.is_active===true&&titles.includes(r.title)&&date(r.event_date)&&r.event_date.slice(0,4)===String(year-1));
  const dates=[...new Set(first.map(r=>r.event_date))];
  if(dates.length===1){result.date=dates[0];result.label='설립 신고';}
  return result;
 }
 function attach({context,client,verify,onChange,status}){
  let generation=0,op=null,state={key:'',ready:false,values:{},date:'',label:'직전 신고'},suspended=false;
  const key=c=>c.owner+'|'+c.coop+'|'+c.year,live=c=>c.authorized&&c.visible&&c.owner&&c.coop&&Number.isInteger(c.year)&&c.year>=1901&&c.year<=9999;
  function publish(next){state=next;onChange({...state,values:{...state.values}});}
  async function refresh(){const c=context();if(!live(c))return;suspended=false;const k=key(c);if(op?.key===k)return op.promise;
   op?.controller.abort();const work={key:k,g:++generation,controller:new AbortController()};op=work;const current=()=>!suspended&&op===work&&generation===work.g&&live(context())&&key(context())===k&&!work.controller.signal.aborted;
   publish(state.key===k?{...state,ready:false}:{key:k,ready:false,values:{},date:(c.year-2)+'-12-31',label:'직전 신고'});status.textContent='직전 신고값을 확인하고 있습니다.';
   work.promise=(async()=>{let timer;try{
    const run=(async()=>{await verify();if(!current())return;
     const r=c.year===1901?{data:{coop_id:c.coop,report_year:1900,current:null}}:await client().rpc('member_city_report_overrides',{p_action:'get',p_report_year:c.year-1,p_request_id:null,p_actor_id:c.owner,p_coop_id:c.coop}).abortSignal(work.controller.signal);if(!current())return;if(r.error)throw r.error;
     let rows=[];if(r.data?.current===null||!['afterCapital','afterShares','afterMembers'].some(id=>Object.hasOwn(r.data?.current?.values||{},id))){
      const f=await client().from('site_documents').select('id,coop_id,category,title,event_date,is_active',{count:'exact'}).eq('coop_id',c.coop).eq('category','history').eq('is_active',true).in('title',titles).order('event_date').limit(20).abortSignal(work.controller.signal);if(!current())return;if(f.error||!Array.isArray(f.data)||!Number.isSafeInteger(f.count)||f.count!==f.data.length)throw Error('설립 신고 기준을 확인하지 못했습니다. 다시 확인해 주세요.');rows=f.data;
     }
     const next=resolve(c.year,c.coop,r.data,rows);await verify();if(!current())return;publish({key:k,ready:true,...next});status.textContent='';
    })();await Promise.race([run,new Promise((_,reject)=>{timer=setTimeout(()=>{work.controller.abort();reject(Error('직전 신고값 조회가 지연되고 있습니다. ERP 출자금·인원 조회를 다시 눌러 주세요.'));},15000);})]);
   }catch(e){if(!suspended&&op===work&&generation===work.g&&key(context())===k&&live(context())){status.textContent=e.code==='42501'?'직전 신고값 조회 권한을 확인해 주세요.':e.message||'직전 신고값을 확인하지 못했습니다. ERP 출자금·인원 조회를 다시 눌러 주세요.';publish({...state,ready:false});}}
   finally{clearTimeout(timer);if(op===work)op=null;}})();return work.promise;
  }
  function leave(clear=false){generation++;suspended=true;op?.controller.abort();op=null;state=clear?{key:'',ready:false,values:{},date:'',label:'직전 신고'}:{...state,ready:false};}
  function snapshot(){const c=context();return state.key===key(c)?{...state,values:{...state.values}}:{ready:false,values:{},date:'',label:'직전 신고'};}
  return{refresh,leave,snapshot};
 }
 root.RegistryPriorReport=Object.freeze({resolve,attach,version:'1.0.0'});
})(typeof window==='undefined'?globalThis:window);
