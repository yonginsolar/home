/* v1.0.0 — One dated note, optimistic edits and in-memory per-author drafts. */
(function (global) {
  'use strict';
  const sheet=global.document.createElement('style');
  sheet.textContent='#patchNoteModal{--bs-modal-width:680px}#patchNoteModal .patch-day-title{font-size:1.02rem;line-height:1.55;word-break:keep-all}#patchNoteModal .patch-day-copy{font-size:.9rem;line-height:1.85;word-break:keep-all;overflow-wrap:break-word}#patchNoteModal .list-group-item{padding:1.15rem!important}#patchNoteModal time{font-variant-numeric:tabular-nums}#patchNoteModal #patchDailyStatus{min-height:1.5rem}';
  global.document.head.append(sheet);
  const fields = ['pnVersion', 'pnTitle', 'pnContent', 'pnMajor'];
  const pick = row => row ? Object.fromEntries(['id','version','release_date','title','content','is_major'].map(k=>[k,row[k]])) : null;
  global.CoopDailyPatchNotes = {
    create(options) {
      const doc = global.document, byId = id => doc.getElementById(id);
      const drafts = new Map();
      let date = '', owner = '', client = null, subscription, pending = null, revision = 0;
      let draft = null, ready = false, loading = false, writing = false, error = '';
      const values = () => ({version:byId('pnVersion').value,title:byId('pnTitle').value,content:byId('pnContent').value,is_major:byId('pnMajor').checked});
      const set = v => {byId('pnVersion').value=v.version||'';byId('pnTitle').value=v.title||'';byId('pnContent').value=v.content||'';byId('pnMajor').checked=!!v.is_major;};
      const blank = () => ({version:'',title:'',content:'',is_major:false});
      const key = () => owner+'|'+date;
      function capture() {if(draft){draft.values=values();drafts.set(key(),draft);}}
      function render() {
        const status = byId('patchDailyStatus');
        if(status){
          status.replaceChildren();
          status.append(doc.createTextNode(error || (loading ? '해당 날짜의 글을 확인하고 있어요…' : ready ? (draft?.base ? '📝 이 날짜의 글을 수정해요.' : '🌱 이 날짜의 새 글을 작성해요.') : '')));
          if(error){const button=doc.createElement('button');button.type='button';button.className='btn btn-sm btn-outline-secondary ms-2';button.textContent='다시 불러오기';button.onclick=()=>load(date,true);status.append(button);}
        }
        const button=byId('btnSavePatchNote');
        if(button)button.disabled=!ready||loading||writing||options.saving()||!options.allowed();
        fields.forEach(id=>{if(byId(id))byId(id).disabled=loading||!options.allowed();});
        if(byId('pnDate'))byId('pnDate').disabled=writing||options.saving()||!options.allowed();
      }
      function pause() {capture();revision++;pending?.abort();pending=null;loading=false;ready=false;render();}
      function bind(next) {
        if(client===next)return;
        pause();subscription?.unsubscribe();client=next;owner='';date='';draft=null;
        subscription=client?.auth.onAuthStateChange((event,session)=>{
          if(event==='INITIAL_SESSION')return;
          const nextOwner=session?.user?.id||'';
          if((owner&&nextOwner!==owner)||event==='SIGNED_OUT'){pause();owner=nextOwner;date='';draft=null;set(blank());}
        })?.data?.subscription;
      }
      async function load(nextDate, force=false) {
        bind(options.client());
        if(writing||!client||!options.allowed()||!/^\d{4}-\d{2}-\d{2}$/.test(nextDate))return false;
        if(loading&&date===nextDate&&!force)return false;
        capture();pending?.abort();const epoch=++revision, readClient=client;
        const controller=new AbortController();pending=controller;loading=true;ready=false;error='';render();
        let timer;
        try{
          const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('timeout'));},15000);});
          const result=await Promise.race([(async()=>{
            const auth=await readClient.auth.getSession();if(auth.error||!auth.data?.session)throw Error('auth');
            if(epoch!==revision)return null;
            owner=auth.data.session.user.id;date=nextDate;byId('pnDate').value=date;
            draft=drafts.get(key())||{values:blank(),base:undefined,dirty:false};set(draft.values);
            const query=await readClient.from(options.table).select('*').eq('release_date',date).abortSignal(controller.signal).maybeSingle();
            if(query.error)throw Error('read');return query.data;
          })(),timeout]);
          if(epoch!==revision||client!==readClient||client!==options.client())return false;
          const latest=pick(result);
          if(draft.dirty&&draft.base!==undefined&&JSON.stringify(draft.base)!==JSON.stringify(latest)){
            const text=result?String(result.title)+'\n'+String(result.content).replace(/<[^>]*>/g,' '):'이 날짜의 글이 삭제됐어요.';
            const accepted=await options.confirm('저장된 글이 달라졌어요.\n\n'+text+'\n\n작성 중인 내용으로 수정할까요?');
            if(epoch!==revision)return false;
            if(!accepted){error='최신 글을 확인한 뒤 다시 저장해 주세요.';return false;}
            draft.base=latest;
          }
          if(draft.base===undefined)draft.base=latest;
          if(!draft.dirty){draft.base=pick(result);draft.values=result?pick(result):blank();set(draft.values);}
          capture();ready=true;return true;
        }catch(_){if(epoch===revision)error='해당 날짜의 글을 불러오지 못했어요.';return false;}
        finally{clearTimeout(timer);if(epoch===revision){loading=false;pending=null;render();}}
      }
      function stateChanged(){render();}
      const controller={
        open:()=>load(byId('pnDate').value),pause,stateChanged,
        get ready(){return ready&&!loading;},get busy(){return loading||writing;},
        async save(payload){
          if(!ready||loading||writing||date!==payload.release_date||client!==options.client()||!options.allowed())return{error:{code:'DAILY_NOT_READY'}};
          capture();const epoch=revision,writeClient=client,writeOwner=owner,writeDraft=draft,writeDate=date;
          writing=true;render();
          try{
            const auth=await writeClient.auth.getSession();
            if(auth.error||auth.data?.session?.user?.id!==writeOwner||epoch!==revision)return{error:{code:'DAILY_NOT_READY'}};
            const response=await writeClient.rpc('save_daily_patch_note',{p_area:options.area,p_date:writeDate,p_version:payload.version,p_title:payload.title,p_content:payload.content,p_is_major:payload.is_major,p_expected:writeDraft.base});
            if(response.error)return response;
            writeDraft.base=pick(response.data);
            if(epoch===revision&&draft===writeDraft){writeDraft.dirty=JSON.stringify(values())!==JSON.stringify({version:payload.version,title:payload.title,content:payload.content,is_major:payload.is_major});capture();}
            return response;
          }catch(_){return{error:{code:'DAILY_UNKNOWN'}};}
          finally{writing=false;render();}
        },
        message(error){
          if(error?.code==='PT409')return '저장된 글이 달라졌어요. 날짜의 글을 다시 불러와 확인해 주세요.';
          if(error?.code==='DAILY_UNKNOWN')return '저장 결과를 확인하지 못했습니다. 목록을 확인해 주세요.';
          if(error?.code==='DAILY_NOT_READY')return '해당 날짜의 글을 다시 불러온 뒤 저장해 주세요.';
          return '저장하지 못했습니다. 권한과 입력 내용을 확인해 주세요.';
        }
      };
      fields.forEach(id=>byId(id)?.addEventListener('input',()=>{if(draft){draft.dirty=true;capture();}}));
      byId('pnDate')?.addEventListener('change',()=>{void load(byId('pnDate').value);});
      return controller;
    }
  };
})(window);
