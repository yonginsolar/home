/* v1.0.0 — Read-only transaction-group search. No business writes or storage. */
(function(root){
  'use strict';
  const doc=root.document,ids=['journalHistoryFrom','journalHistoryTo','journalHistoryKeyword'];
  let revision=0,pending=null,page=null;
  const values=()=>ids.map(id=>String(doc.getElementById(id)?.value||'').trim());
  const visible=()=>!root.frameElement?.hidden && !!doc.getElementById('tabHistory')?.classList.contains('active');
  function invalidate(){revision++;pending?.controller.abort();pending=null;const more=doc.getElementById('journalHistoryMore');if(more)more.disabled=false;}
  function clear(){invalidate();ids.forEach(id=>{doc.getElementById(id).value='';});}
  function load({more=false,client,owner,authorized,currentOwner,render}){
    const status=doc.getElementById('journalHistoryStatus'),button=doc.getElementById('journalHistoryMore');
    if(!authorized||!owner?.coop_id||!visible()){invalidate();return Promise.resolve(false);}
    const filters=values(),identity=JSON.stringify([owner.auth_user_id||owner.emp_id||owner.id,owner.coop_id]);
    const key=JSON.stringify([identity,filters]);
    if(pending?.key===key&&pending.more===more)return pending.promise;
    if(filters[0]&&filters[1]&&filters[0]>filters[1]){invalidate();status.textContent='시작일과 종료일을 확인해 주세요.';return Promise.resolve(false);}
    if(more&&(!page||page.key!==key||!page.hasMore))return Promise.resolve(false);
    invalidate();const seq=revision,controller=new AbortController();
    const current=()=>seq===revision&&currentOwner()&&visible()&&key===JSON.stringify([identity,values()]);
    const cursor=more?page.next:null;
    status.textContent=more?'이전 내역을 불러오는 중…':'장부를 불러오는 중…';button.disabled=true;
    if(!more){page=null;button.hidden=true;doc.getElementById('historyList').textContent='';doc.getElementById('historyMeta').textContent='';}
    let timer,timedOut=false;
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{timedOut=true;reject(new Error('TIMEOUT'));controller.abort();},15000);});
    const read=Promise.resolve().then(()=>client.rpc('accounting_history_page',{
      p_from:filters[0]||null,p_to:filters[1]||null,p_keyword:filters[2],p_before_date:cursor?.date||null,p_before_key:cursor?.key||null,p_limit:20
    }).abortSignal(controller.signal));
    const promise=Promise.race([read,deadline]).then(({data,error})=>{
      if(!current())return false;if(error)throw error;
      if(!data||!Array.isArray(data.groups))throw new Error('INVALID_RESULT');
      const groups=more?new Map(page.groups):new Map();
      data.groups.forEach(group=>{if(typeof group.key!=='string'||!Array.isArray(group.rows))throw new Error('INVALID_RESULT');groups.set(group.key,group.rows);});
      page={key,groups,next:data.next,hasMore:data.has_more===true};
      render([...groups.values()].flat());
      status.textContent=groups.size?(page.hasMore?'이전 내역을 더 볼 수 있습니다.':'마지막 내역까지 확인했습니다.'):'조회 조건에 맞는 전표가 없습니다.';
      button.hidden=!page.hasMore;return true;
    }).catch(()=>{
      if(!current())return false;
      status.textContent=(timedOut?'조회 시간이 길어지고 있습니다.':'장부를 불러오지 못했습니다.')+(more?' 이전 내역 더 보기를 다시 눌러 주세요.':' 조회를 눌러 다시 확인해 주세요.');
      if(more)button.hidden=false;
      return false;
    }).finally(()=>{clearTimeout(timer);if(pending?.promise===promise){pending=null;button.disabled=false;}});
    pending={key,more,promise,controller};return promise;
  }
  ids.forEach(id=>doc.getElementById(id)?.addEventListener('input',invalidate));
  root.addEventListener('pagehide',invalidate);
  root.CoopAccountingHistory=Object.freeze({load,clear,invalidate});
})(window);
