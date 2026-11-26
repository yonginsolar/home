(function (root) {
  'use strict';
  const spec = [
    ['title','교육명','text',200],['starts_at','시작 일시','datetime-local'],
    ['ends_at','종료 일시','datetime-local'],['location','장소','text',300],
    ['instructor','강사','text',200],['education_content','교육 내용','textarea',5000]
  ];
  const fmt=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'});
  const local=value=>value?fmt.format(new Date(value)).replace(' ','T'):'';
  const formValue=(row,key)=>key.endsWith('_at')?local(row?.[key]):row?.[key]??'';
  const element=(tag,cls,text)=>{
    const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;
  };
  const button=(label,cls)=>{const b=element('button',cls,label);b.type='button';return b;};
  const primary='btn btn-success btn-sm',secondary='btn btn-outline-secondary btn-sm';
  let active=null;
  function close(){active?.dialog.close();}
  function open({rpc,current,trigger}){
    if(active||!current())return;
    const dialog=element('dialog','portal-edu-pilot-dialog border-0 rounded-4 p-0 shadow');
    const panel=element('div','p-3 p-md-4');
    const header=element('div','d-flex justify-content-between align-items-center gap-2 mb-3');
    const title=element('h2','h5 mb-0','교육 관리');title.id='eduPilotTitle';dialog.setAttribute('aria-labelledby',title.id);
    const dismiss=button('닫기',secondary);header.append(title,dismiss);
    const status=element('p','small mb-2');status.setAttribute('role','status');
    const top=element('div','d-flex flex-wrap gap-2 mb-3');
    const mine=button('내 교육',secondary), history=button('지난 교육',secondary);
    const entry=button('교육 등록',primary),reload=button('새로고침',secondary);
    top.append(mine,history,entry,reload);
    const list=element('div','d-grid gap-2 mb-2');
    const pages=element('div','d-flex gap-2 mt-2');
    const prev=button('이전 50건',secondary),next=button('다음 50건',secondary);pages.append(prev,next);
    const detail=element('article','mb-2');
    const form=element('form','d-grid gap-2');
    const fields=new Map(spec.map(([key,label,kind,max])=>{
      const wrap=element('div'), input=element(kind==='textarea'?'textarea':'input','form-control');
      if(kind!=='textarea')input.type=kind;else input.rows=3;
      input.id='eduPilot-'+key;if(max)input.maxLength=max;input.required=true;
      const cap=element('label','form-label mb-1',label);cap.htmlFor=input.id;wrap.append(cap,input);form.append(wrap);return [key,input];
    }));
    const editingControls=element('div','d-flex flex-wrap gap-2 mt-1');
    const save=element('button',primary,'저장');save.type='submit';
    const cancel=button('취소',secondary),recover=button('최신 내용 확인',secondary);
    const changes=element('div','small');changes.setAttribute('aria-live','polite');
    recover.hidden=true;editingControls.append(save,cancel,recover);form.append(editingControls,changes);
    panel.append(header,status,top,list,pages,detail,form);dialog.append(panel);document.body.append(dialog);
    const s={dialog,mode:'mine',view:'list',offset:0,hasMore:false,busy:false,item:null,draft:null,saving:false};
    active=s;
    const alive=()=>active===s && dialog.open && current();
    const get=async args=>{const {data,error}=await rpc(args);if(error)throw error;if(!data)throw new Error();return data;};
    function sync(){
      const onList=s.view==='list', editing=s.view==='edit';
      top.hidden=list.hidden=!onList;
      pages.hidden=!onList||(!s.hasMore&&s.offset===0);
      detail.hidden=s.view!=='detail';form.hidden=!editing;
      // Read-only in-flight requests can be closed, but not two writes at once.
      for(const control of panel.querySelectorAll('input,textarea,button')) control.disabled=s.busy;
      dismiss.disabled=s.saving;
      mine.setAttribute('aria-pressed',String(s.mode==='mine'));
      history.setAttribute('aria-pressed',String(s.mode==='history'));
      mine.classList.toggle('active',s.mode==='mine');history.classList.toggle('active',s.mode==='history');
      prev.disabled=s.busy||s.offset===0;next.disabled=s.busy||!s.hasMore;
    }
    function lock(value,saving=false){s.busy=value;s.saving=saving;sync();}
    function dirty(){return !!s.draft&&[...fields].some(([k,input])=>input.value!==s.draft.initial[k]);}
    async function read(message=''){
      if(!alive()||s.busy)return;
      s.view='list';s.item=null;s.draft=null;list.replaceChildren();lock(true);
      status.textContent='교육을 불러오는 중입니다.';
      try{
        const result=await get({p_action:'list',p_fields:{mode:s.mode,offset:s.offset}});
        if(!alive())return;
        if(!Array.isArray(result.events))throw new Error();
        s.hasMore=result.has_more===true;
        if(result.events.length===0&&s.offset>0){s.offset=Math.max(0,s.offset-50);lock(false);return read(message);}
        for(const item of result.events){
          const b=button(item.title+' · '+local(item.starts_at).replace('T',' '),'btn btn-outline-secondary text-start text-break');
          b.onclick=()=>void readOne(item.id);list.append(b);
        }
        status.textContent=message||(result.events.length?'':s.mode==='mine'?'등록한 교육이 없습니다.':'지난 교육이 없습니다.');
      }catch(_){if(alive())status.textContent='목록을 불러오지 못했습니다. 새로고침을 눌러 주세요.';}
      finally{if(alive())lock(false);}
    }
    function onMode(mode){if(s.busy||s.mode===mode)return;s.mode=mode;s.offset=0;s.hasMore=false;void read();}
    mine.onclick=()=>onMode('mine');history.onclick=()=>onMode('history');reload.onclick=()=>void read();
    prev.onclick=()=>{if(!s.busy&&s.offset>0){s.offset-=50;void read();}};
    next.onclick=()=>{if(!s.busy&&s.hasMore){s.offset+=50;void read();}};
    async function readOne(id){
      lock(true);status.textContent='교육을 불러오는 중입니다.';
      try{
        const row=await get({p_action:'detail',p_event:id});
        if(!alive()||row.id!==id||!row.title)throw new Error();
        showDetail(row);
      }catch(_){if(alive())status.textContent='교육을 불러오지 못했습니다. 다시 선택해 주세요.';}
      finally{if(alive())lock(false);}
    }
    function showDetail(row){
      s.view='detail';s.item=row;s.draft=null;detail.replaceChildren();status.textContent='';
      detail.append(element('h3','h6 mb-3 text-break',row.title));
      const facts=element('dl','mb-3');
      for(const [key,label] of spec.slice(1)){
        const value=formValue(row,key).replace(key.endsWith('_at')?'T':'\u0000',' ');
        facts.append(element('dt','small',label),element('dd','text-break mb-2',value||'미입력'));
      }
      detail.append(facts);
      const actions=element('div','d-flex flex-wrap gap-2');
      const back=button('목록',secondary);back.onclick=()=>void read();actions.append(back);
      if(row.past===true){
        const copy=button('양식 복사',secondary);copy.onclick=()=>edit(null,row);actions.append(copy);
      }
      if(row.owned===true){
        const editButton=button('수정',primary);editButton.onclick=()=>edit(row);actions.append(editButton);
        if(row.delete_pending)status.textContent='삭제 승인 대기 중입니다.';
        else {
          const remove=button('삭제','btn btn-outline-danger btn-sm');remove.onclick=()=>confirmRemove(row,actions);actions.append(remove);
        }
      }
      detail.append(actions);sync();
    }
    function confirmRemove(row,actions){
      actions.replaceChildren();
      status.textContent='삭제할까요? 출석·첨부 등 연결된 기록이 있으면 관리자에게 삭제를 요청합니다.';
      const no=button('취소',secondary),yes=button('삭제 확인','btn btn-danger btn-sm');
      actions.append(no,yes);no.focus();
      no.onclick=()=>showDetail(row);
      yes.onclick=async()=>{
        if(!alive()||s.busy)return;
        lock(true,true);
        try{
          const result=await get({p_action:'remove',p_event:row.id,p_expected:row.updated_at});
          if(!alive())return;
          if(!['pending','deleted'].includes(result.state))throw new Error();
          lock(false);
          if(result.state==='pending')showDetail({...row,delete_pending:true});
          else await read('교육을 삭제했습니다.');
        }catch(error){if(alive()){
          showDetail(row);
          status.textContent=error.code==='40001'?'내용이 바뀌었습니다. 목록에서 다시 열어 주세요.':'삭제를 확인하지 못했습니다. 다시 시도해 주세요.';
        }}finally{if(alive())lock(false);}
      };
    }
    function edit(row,copy=null){
      if(s.busy||!alive())return;
      s.view='edit';s.draft={row,request:row?null:root.crypto.randomUUID(),initial:{}};
      for(const [key,input] of fields){
        input.value=formValue(row||(key.endsWith('_at')?null:copy),key);
        s.draft.initial[key]=input.value;
      }
      recover.hidden=true;changes.replaceChildren();status.textContent='';sync();fields.get('title').focus();
    }
    entry.onclick=()=>edit(null);
    cancel.onclick=()=>{
      if(s.busy||dirty()&&!root.confirm('저장하지 않은 수정 내용을 버릴까요?'))return;
      if(s.item)showDetail(s.item);else void read();
    };
    recover.onclick=async()=>{
      const draft=s.draft;
      if(s.busy||!draft?.row||!alive())return;
      lock(true);
      try{
        const latest=await get({p_action:'detail',p_event:draft.row.id});
        if(!alive()||draft!==s.draft)return;
        if(latest.id!==draft.row.id||latest.owned!==true)throw new Error();
        const overlaps=[];
        for(const [key,input] of fields){
          const newest=formValue(latest,key);
          if(input.value===draft.initial[key])input.value=newest;
          else if(newest!==draft.initial[key]&&newest!==input.value)overlaps.push([key,newest]);
          draft.initial[key]=newest;
        }
        draft.row=latest;s.item=latest;recover.hidden=true;changes.replaceChildren();
        status.textContent=overlaps.length?'다른 창과 같은 항목을 바꿨습니다. 최신 값과 내 입력을 확인한 뒤 저장하세요.':'최신 내용을 반영했습니다. 직접 바꾼 입력은 유지했습니다.';
        for(const [key,newest] of overlaps){
          changes.append(element('p','mb-1 text-break',spec.find(x=>x[0]===key)[1]+' 최신 값: '+(newest||'미입력')));
        }
      }catch(_){if(alive())status.textContent='최신 내용을 확인하지 못했습니다. 입력은 그대로입니다.';}
      finally{if(alive())lock(false);}
    };
    form.onsubmit=async event=>{
      event.preventDefault();
      const draft=s.draft;
      if(!alive()||s.busy||!draft||!recover.hidden)return;
      const values=Object.fromEntries([...fields].map(([key,input])=>[key,input.value.trim()]));
      if(Object.values(values).some(value=>!value)||values.ends_at<values.starts_at){
        status.textContent='모든 항목과 시작·종료 일시를 확인해 주세요.';return;
      }
      const timestamp=key=>draft.row?.[key]&&local(draft.row[key])===values[key]?draft.row[key]:values[key]+'+09:00';
      lock(true,true);
      try{
        const data=await get({p_action:'save',p_event:draft.row?.id??null,p_request:draft.request,
          p_expected:draft.row?.updated_at??null,p_fields:{...values,starts_at:timestamp('starts_at'),ends_at:timestamp('ends_at')}});
        if(!alive())return;if(!data.id)throw new Error();
        lock(false);s.mode='mine';s.offset=0;s.hasMore=false;await read('교육을 저장했습니다.');
      }catch(error){
        if(!alive())return;
        if(error.code==='40001'&&draft.row){
          recover.hidden=false;status.textContent='다른 창에서 내용이 바뀌었습니다. 최신 내용을 확인해 주세요.';
        }else status.textContent='저장을 확인하지 못했습니다. 입력은 그대로입니다.';
      }finally{if(alive())lock(false);}
    };
    dismiss.onclick=()=>{if(!s.saving&&(!dirty()||root.confirm('저장하지 않은 수정 내용을 버릴까요?')))close();};
    dialog.addEventListener('cancel',event=>{if(s.saving||dirty()&&!root.confirm('저장하지 않은 수정 내용을 버릴까요?'))event.preventDefault();});
    dialog.addEventListener('close',()=>{
      if(active===s)active=null;dialog.remove();
      if(current()&&trigger.isConnected)trigger.focus({preventScroll:true});
    },{once:true});
    dialog.showModal();sync();void read();
  }
  root.MemberEducationPilot=Object.freeze({open,close});
})(window);
