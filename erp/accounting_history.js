/* v1.0.3 — Explain confirmed journal data without rewriting it or fetching more records. */
(function(root){
  'use strict';
  const doc=root.document,ids=['journalHistoryFrom','journalHistoryTo','journalHistoryKeyword'];
  let revision=0,pending=null,page=null,phase='idle',readyCheck=null,appendRetry=false;
  const values=()=>ids.map(id=>String(doc.getElementById(id)?.value||'').trim());
  const visible=(allowHidden=false)=>(allowHidden||!root.frameElement?.hidden) && !!doc.getElementById('tabHistory')?.classList.contains('active');
  const ready=()=>phase==='loaded'&&!!page&&visible()&&!!readyCheck?.();
  function controls(){
    const list=doc.getElementById('historyList');
    list.dataset.historyState=phase;list.setAttribute('aria-busy',String(phase==='loading'));
    list.querySelectorAll('[data-history-process]').forEach(button=>{button.disabled=!ready();});
  }
  function invalidate(){revision++;pending?.controller.abort();pending=null;phase='stale';readyCheck=null;appendRetry=false;const more=doc.getElementById('journalHistoryMore');if(more){more.disabled=false;more.hidden=true;}controls();}
  function guard(){const seq=revision;return ()=>seq===revision&&ready();}
  function clear(){invalidate();ids.forEach(id=>{doc.getElementById(id).value='';});}
  function load({more=false,allowHidden=false,client,owner,authorized,currentOwner,render}){
    const status=doc.getElementById('journalHistoryStatus'),button=doc.getElementById('journalHistoryMore');
    if(!authorized||!owner?.coop_id||!visible(allowHidden)){invalidate();if(!authorized)doc.getElementById('historyList').hidden=true;return Promise.resolve(false);}
    const filters=values(),identity=JSON.stringify([owner.auth_user_id||owner.emp_id||owner.id,owner.coop_id]);
    const key=JSON.stringify([identity,filters]),pendingKey=JSON.stringify([key,allowHidden]);
    if(page&&page.identity!==identity){page=null;doc.getElementById('historyList').textContent='';doc.getElementById('historyMeta').textContent='';}
    doc.getElementById('historyList').hidden=false;
    if(pending?.key===pendingKey&&pending.more===more)return pending.promise;
    if(filters[0]&&filters[1]&&filters[0]>filters[1]){invalidate();status.textContent='시작일과 종료일을 확인해 주세요.';return Promise.resolve(false);}
    if(more&&(!page||page.key!==key||!page.hasMore||(!ready()&&!appendRetry)))return Promise.resolve(false);
    invalidate();const seq=revision,controller=new AbortController();
    const current=()=>seq===revision&&currentOwner()&&visible(allowHidden)&&key===JSON.stringify([identity,values()]);
    const cursor=more?page.next:null;
    phase='loading';controls();
    status.textContent=(page?'이전 조회 목록을 표시 중입니다. ':'')+(more?'이전 내역을 불러오는 중…':'장부를 불러오는 중…');button.hidden=!more;button.disabled=true;
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
      page={identity,key,groups,next:data.next,hasMore:data.has_more===true};
      render([...groups.values()].flat());
      phase='loaded';readyCheck=current;appendRetry=false;controls();
      status.textContent=groups.size?(page.hasMore?'이전 내역을 더 볼 수 있습니다.':'마지막 내역까지 확인했습니다.'):'조회 조건에 맞는 전표가 없습니다.';
      button.hidden=!page.hasMore;return true;
    }).catch(()=>{
      if(!current())return false;
      phase='error';appendRetry=more;controls();
      status.textContent=(timedOut?'조회 시간이 길어지고 있습니다.':'장부를 불러오지 못했습니다.')+(page?' 이전 조회 목록을 유지했습니다.':'')+(more?' 이전 내역 더 보기를 다시 눌러 주세요.':' 조회를 눌러 다시 확인해 주세요.');
      if(more)button.hidden=false;
      return false;
    }).finally(()=>{clearTimeout(timer);if(pending?.promise===promise){pending=null;button.disabled=false;}});
    pending={key:pendingKey,more,promise,controller,allowHidden};return promise;
  }
  ids.forEach(id=>doc.getElementById(id)?.addEventListener('input',()=>{
    invalidate();
    doc.getElementById('journalHistoryMore').hidden=true;
    doc.getElementById('journalHistoryStatus').textContent=(page?'이전 조회 목록입니다. ':'')+'조회를 눌러 변경한 조건으로 확인해 주세요.';
  }));
  root.addEventListener('pagehide',invalidate);
  doc.getElementById('accTab')?.addEventListener('shown.bs.tab',()=>{if(!visible())invalidate();else controls();});
  if(root.frameElement&&root.MutationObserver)new root.MutationObserver(()=>{
    if(root.frameElement.hidden&&!pending?.allowHidden)invalidate();else controls();
  }).observe(root.frameElement,{attributes:true,attributeFilter:['hidden']});
  function describe(item){
    const raw=String(item.rawDescription||''),tx=String(item.transId||''),debits=item.debits||[],credits=item.credits||[];
    const cash=a=>/예금|현금|시재금/.test(String(a.account||''));
    const cashNet=debits.filter(cash).reduce((n,a)=>n+Number(a.amount||0),0)-credits.filter(cash).reduce((n,a)=>n+Number(a.amount||0),0);
    const side=(entries,account)=>entries.some(a=>a.account===account&&Number(a.amount)>0);
    const donation=/^DON-\d+(?:$|-(?:REV|POST)-)/.test(tx)||/^\[기부금\]/.test(raw);
    const capital=/^CAP-\d+(?:$|-(?:REV|POST)-)/.test(tx)||/^\[출자\]/.test(raw);
    const salary=/^SAL-\d{4}-\d{2}(?:$|-)/.test(tx)||/^\[급여\]/.test(raw);
    const reverse=/-REV-/.test(tx)||/\[정정취소\]/.test(raw),repost=/-POST-/.test(tx)||/\[정정재기표\]/.test(raw);
    const base=donation?'기부금':capital?'출자금':salary?'급여':/^DIV-\d+(?:$|-)/.test(tx)?'배당금':'';
    if(base&&reverse)return {title:`${base} 정정취소`,explanation:`기존 ${base} 기록을 되돌리는 전표입니다. 새 입금이나 지급 기록과 구분해 주세요.`};
    if(base&&repost)return {title:`${base} 정정 반영`,explanation:`정정한 ${base} 내용을 다시 기록한 전표입니다.`};
    if(/^FUND-RECLASS-DON-\d+-CAPITAL$/.test(tx)&&side(debits,'자산수증이익')&&side(credits,'출자금'))return {title:'기부금의 출자금 전환',explanation:'기부금으로 기록했던 금액을 출자금으로 옮긴 전표입니다. 새 입금은 아닙니다.'};
    const method=donation&&/\/transfer(?:\s|$)/.test(raw)?' · 계좌이체':donation&&/\/cash(?:\s|$)/.test(raw)?' · 현금':'';
    if(donation&&cashNet>0&&side(credits,'자산수증이익'))return {title:'기부금 입금'+method,explanation:'받은 기부금을 통장·현금의 증가와 자산수증이익으로 기록한 거래입니다.'};
    if(capital&&cashNet>0&&side(credits,'출자금'))return {title:'출자금 입금',explanation:'조합원이 납입한 출자금을 통장·현금의 증가와 출자금으로 기록한 거래입니다.'};
    if(salary&&cashNet===0&&debits.some(a=>/급여/.test(a.account)))return {title:'급여 발생 기록',explanation:'급여와 공제액·지급할 금액을 기록한 전표입니다. 통장에서 실제 지급한 전표와 구분됩니다.'};
    if(salary&&cashNet<0)return {title:'급여 지급 전표',explanation:'급여 지급에 따른 통장·현금의 출금을 기록한 전표입니다.'};
    const tax=raw.match(/부가가치세|부가세|원천세|지방소득세|법인세/);
    if(tax&&cashNet<0&&!reverse&&!/환급|취소|반환/.test(raw))return {title:`${tax[0]} 관련 출금`,explanation:`${tax[0]}와 관련된 통장·현금의 출금을 기록한 전표입니다.`};
    if(/^MONEY-/.test(tx)&&/^\[카드환급 정산\]/.test(raw)&&side(credits,'미수금')){
      if(cashNet>0)return {title:'카드 환급금 입금',explanation:'카드 취소로 돌려받을 금액을 통장으로 받은 기록입니다.'};
      if(cashNet===0&&side(debits,'미지급금'))return {title:'카드 환급금의 대금 차감',explanation:'돌려받을 금액을 카드대금에서 뺀 기록입니다. 통장 입금은 아닙니다.'};
    }
    if(/^MONEY-/.test(tx)&&/^\[착오입금 반환\]/.test(raw)&&cashNet<0&&side(debits,'가수금'))return {title:'착오입금 반환',explanation:'잘못 입금된 금액을 돌려주고 가수금을 줄인 기록입니다.'};
    // A return/cancellation is not inferred from cash direction alone.
    return {title:'',explanation:''};
  }
  root.CoopAccountingHistory=Object.freeze({load,clear,invalidate,isCurrent:ready,guard,describe});
})(window);
