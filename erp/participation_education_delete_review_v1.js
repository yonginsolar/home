(function (root) {
  'use strict';
  const element=(tag,cls,label)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(label)n.textContent=label;return n;};
  const button=(label,kind)=>{const n=element('button','btn btn-sm '+kind,label);n.type='button';return n;};
  const names={
    coop_participation_attendees:'참석자',coop_participation_manual_attendees:'수기 참석자',
    coop_participation_event_files:'첨부',coop_participation_external_director_attendees:'외부 참석자',
    coop_participation_guest_checkins:'방문 출석',site_badges:'배지',site_documents:'공개 문서',
    coop_participation_humanities_alert_deliveries:'인문학 알림 이력',coop_participation_humanities_checkins:'인문학 출석',
    coop_participation_humanities_handoffs:'인문학 확인 내역',coop_participation_humanities_links:'인문학 연동',
    coop_participation_humanities_security_attempts:'인문학 확인 이력'
  };
  const date=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'});
  let active=null;
  function close(){active?.dialog.close();}
  function open({client,current,trigger,removeFiles,refreshEducation}){
    if(active||!current())return;
    const dialog=element('dialog','education-review-dialog border-0 rounded-4 p-0 shadow');
    dialog.setAttribute('aria-labelledby','educationDeleteReviewTitle');
    const panel=element('div','p-3 p-md-4'),head=element('div','d-flex justify-content-between align-items-center gap-2 mb-3');
    const title=element('h2','h5 mb-0','교육 삭제 요청');title.id='educationDeleteReviewTitle';
    const dismiss=button('닫기','btn-outline-secondary'),items=element('div','d-grid gap-2');
    const status=element('p','mb-2 small');status.setAttribute('role','status');
    head.append(title,dismiss);panel.append(head,status,items);dialog.append(panel);document.body.append(dialog);
    const s={dialog,busy:false,writing:false};active=s;
    const live=()=>active===s && dialog.open && current();
    const rpc=async args=>{const r=await client.rpc('education_portal_delete_review_v1',args);if(r.error||!r.data)throw r.error||new Error();return r.data;};
    function lock(value,writing=false){
      s.busy=value;s.writing=writing;
      for(const n of items.querySelectorAll('button'))n.disabled=value;
      dismiss.disabled=writing;
    }
    function retry(text,callback){items.replaceChildren();const b=button(text,'btn-outline-primary');b.onclick=callback;items.append(b);}
    async function list(message=''){
      if(!live()||s.busy)return;
      items.replaceChildren();lock(true);status.textContent='요청을 불러오는 중입니다.';
      try{
        const result=await rpc({p_action:'list'});
        if(!live())return;
        if(!Array.isArray(result.requests))throw new Error();
        for(const row of result.requests){
          const text=row.title+' · '+date.format(new Date(row.starts_at));
          const b=button(text,'btn-outline-secondary text-start text-break');
          b.onclick=()=>void inspect(row.id);items.append(b);
        }
        status.textContent=message||(result.requests.length?'':'승인 대기 중인 요청이 없습니다.');
      }catch(error){
        if(live()){
          status.textContent=error.code==='42501'?'교육 삭제 요청을 검토할 권한이 없습니다.':'요청 목록을 불러오지 못했습니다.';
          if(error.code!=='42501')retry('다시 확인',()=>void list());
        }
      }finally{if(live())lock(false);}
    }
    async function inspect(id){
      if(!live()||s.busy)return;
      lock(true);status.textContent='교육과 연결 기록을 확인하는 중입니다.';
      try{
        const row=await rpc({p_action:'inspect',p_id:id});
        if(!live())return;
        if(row.id!==id){lock(false);return list('이미 처리된 요청입니다.');}
        detail(row);
      }catch(_){if(live()){status.textContent='요청을 다시 확인해 주세요.';retry('목록',()=>void list());}}
      finally{if(live())lock(false);}
    }
    function detail(row){
      items.replaceChildren();
      status.textContent='';
      const article=element('section','border rounded p-3');
      article.append(element('h3','h6 text-break',row.title),element('p','small',date.format(new Date(row.starts_at))));
      const links=Object.entries(row.links||{}).map(([table,n])=>(names[table]||'연결 기록')+' '+n+'건');
      article.append(element('p','small text-break',links.length?links.join(' · '):'연결 기록 없음'));
      items.append(article);
      if(!row.can_review)status.textContent='본인이 보낸 요청은 다른 관리자가 검토합니다.';
      const actions=element('div','d-flex flex-wrap gap-2');
      const back=button('목록','btn-outline-secondary');back.onclick=()=>void list();actions.append(back);
      if(row.can_review){
        const reject=button('반려','btn-outline-secondary'),approve=button('삭제 승인','btn-outline-danger');
        reject.onclick=()=>decision('reject',row);approve.onclick=()=>{
          actions.replaceChildren();
          const cancel=button('취소','btn-outline-secondary'),yes=button('삭제 확정','btn-danger');
          actions.append(cancel,yes);cancel.focus();
          status.textContent='교육과 연결된 참석·첨부 기록이 함께 삭제될 수 있습니다. 삭제를 확정할까요?';
          cancel.onclick=()=>detail(row);yes.onclick=()=>decision('approve',row);
        };
        actions.append(reject,approve);
      }
      items.append(actions);
    }
    async function cleanup(paths,message){
      if(!paths?.length){lock(false);return list(message);}
      try{await removeFiles(paths);if(live()){lock(false);return list(message);}}
      catch(_){
        if(!live())return;
        status.textContent='교육 삭제는 승인됐지만 첨부 정리를 확인하지 못했습니다.';
        retry('첨부 정리 다시 시도',()=>{if(!live()||s.busy)return;lock(true,true);void cleanup(paths,message).finally(()=>{if(live())lock(false);});});
      }
    }
    async function decision(action,row){
      if(!live()||s.busy)return;
      lock(true,true);
      try{
        const result=await rpc({p_action:action,p_id:row.id,p_expected:row.updated_at,p_links:row.links});
        if(!live())return;
        if(result.state==='approved'){
          if(current())await refreshEducation();
          if(live())await cleanup(result.storage_paths,'교육 삭제를 승인했습니다.');
        }else if(result.state==='rejected'){lock(false);await list('삭제 요청을 반려했습니다.');}
        else {lock(false);await list('요청 상태가 바뀌었습니다.');}
      }catch(e){
        if(!live())return;
        status.textContent=e.code==='40001'?'교육이나 연결 기록이 바뀌었습니다. 다시 검토해 주세요.':'처리 결과를 확인하지 못했습니다. 같은 요청을 다시 확인해 주세요.';
        if(e.code==='40001')retry('다시 검토',()=>void inspect(row.id));
        else retry('같은 요청 다시 확인',()=>void decision(action,row));
      }finally{if(live())lock(false);}
    }
    dismiss.onclick=()=>{if(!s.writing)close();};
    dialog.addEventListener('cancel',event=>{if(s.writing)event.preventDefault();});
    dialog.addEventListener('close',()=>{if(active===s)active=null;dialog.remove();if(current()&&trigger.isConnected)trigger.focus({preventScroll:true});},{once:true});
    dialog.showModal();void list();
  }
  root.EducationDeleteReview=Object.freeze({open,close});
})(window);
