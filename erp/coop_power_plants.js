(function (global) {
  'use strict';
  function mount({client,root=document,guard=global.ErpRuntimeGuard,resume=global.ErpWorkspaceResume}) {
    const el=id=>root.getElementById(id);
    const editor=el('coopPlantFormDialog'),form=el('coopPlantForm'),fields=el('coopPlantFields'),save=el('coopPlantSave');
    const retry=el('coopPlantRetry'),notice=el('coopPlantFormState');
    const drafts=new Map(),writes=new Map();
    const keys=['name','status','capacity','progress','location','completion_date','area','note'];
    let actor='',scope=null,tab='plants',listRequest=null,selected=null,revision=0,ticket=0,verified=false;
    const visible=()=>!root.hidden && !global.frameElement?.hidden;
    const rootStatus=message=>{el('plantStatus').textContent=message;};
    const call=(p_action,p_payload={})=>client.rpc('coop_power_plants',{p_action,p_payload});
    const active=op=>!!op && editor.open && selected===op && op.token===ticket && op.owner===actor && verified && visible();
    const normalized=status=>['건설중','건설 중','공사 중'].includes(String(status||'').trim())?'공사중':String(status||'').trim();
    const number=value=>value==null||value===''?null:Number(value);
    const readFields=()=>Object.fromEntries(keys.map(key=>[key,['capacity','progress'].includes(key)?number(form.elements.namedItem(key).value):form.elements.namedItem(key).value.trim()||null]));
    const draftKey=(id,subject=actor)=>subject+':'+id;
    const snapshot=obj=>JSON.stringify(keys.map(k=>obj[k]??null));
    function setFields(row){
      for(const key of keys){
        const node=form.elements.namedItem(key), value=key==='status'?normalized(row[key]):row[key];
        if(key==='status'&&value&&![...node.options].some(o=>o.value===value)){const option=root.createElement('option');option.value=option.textContent=value;node.append(option);}
        node.value=value??'';
      }
    }
    function holdDraft(op=selected){
      if(!op?.row||!editor.open)return;
      const input=readFields();
      if(snapshot(input)===op.baseline)drafts.delete(draftKey(op.id,op.owner));
      else {
        const previous=drafts.get(draftKey(op.id,op.owner));
        drafts.set(draftKey(op.id,op.owner),{input,base:op.conflict&&previous?.base?previous.base:op.base,
          revision:op.conflict&&previous?previous.revision:op.row.revision});
      }
    }
    function close(){
      holdDraft();selected=null;ticket++;if(editor.open)editor.close();
    }
    const scopeForImport=()=>{
      const allowed=verified && !!actor && !!scope && visible() && tab==='monitor';
      return {key:JSON.stringify([actor,scope?.coop_id,scope?.dashboard_id]),coop:scope?.coop_id,dashboard:scope?.dashboard_id,
        visible:allowed,ready:allowed&&!listRequest&&!editor.open};
    };
    const importView=global.PowerMonitorImport?.create({
      client:{rpc(name,p){return name==='platform_preview_power_monitor_plant_import' ? call('preview')
        : name==='platform_apply_power_monitor_plant_import' ? call('apply',{revision:p.p_expected_revision}) : Promise.resolve({error:{code:'42501'}});}},
      dialog:el('coopImportDialog'),button:el('coopMonitorImport'),getContext:scopeForImport,
      refresh:async (result,op)=>{await load();if(scopeForImport().key===op.key && scopeForImport().ready)
        rootStatus(result.created||result.linked?`새 발전소 ${result.created}곳 등록 · 기존 발전소 ${result.linked}곳 연결`:'이미 연결된 발전소는 그대로 두었습니다.');}
    });
    function changeTab(next) {
      if(!['plants','monitor'].includes(next))return;
      if(tab!==next){importView?.pause();close();tab=next;}
      el('coopPlantList').hidden=next!=='plants';el('coopMonitorList').hidden=next!=='monitor';
      root.querySelectorAll('[data-plant-tab]').forEach(b=>{const on=b.dataset.plantTab===next;
        b.setAttribute('aria-pressed',String(on));b.classList.toggle('btn-success',on);b.classList.toggle('btn-outline-success',!on);});
      importView?.sync();
    }
    function showRows(id,rows,monitor){
      const box=el(id);box.replaceChildren();
      if(!rows.length)box.textContent='표시할 발전소가 없습니다.';
      for(const row of rows){
        const card=root.createElement('article'),heading=root.createElement('h3'),description=root.createElement('p');
        card.className='border rounded-3 p-3';heading.className='h6';heading.textContent=row.name||'이름 없음';
        description.className='small mb-2';
        description.textContent=[monitor?(row.completed?'운영 중':'공사 중'):normalized(row.status),
          row.capacity==null?null:`${row.capacity}kW`,monitor?(row.linked?'기본정보 연결됨':'연결 전'):row.location,
          !monitor&&row.progress!=null?`공정률 ${row.progress}%`:null].filter(Boolean).join(' · ');
        card.append(heading,description);
        if(!monitor){const b=root.createElement('button');b.type='button';b.className='btn btn-sm btn-outline-primary';b.textContent='기본정보 수정';
          b.addEventListener('click',()=>{if(verified && visible()&&!editor.open)void open(row.id);});card.append(b);}
        box.append(card);
      }
    }
    function within(promise,ms=16000){
      let timer;return Promise.race([promise,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),ms);})]).finally(()=>clearTimeout(timer));
    }
    function load() {
      if(listRequest)return listRequest;
      if(!actor || !visible() || editor.open || el('coopImportDialog').open)return Promise.resolve(false);
      const generation=revision,subject=actor;
      const current=()=>generation===revision && subject===actor && visible();
      el('plantReload').hidden=true;
      if(!scope)rootStatus('발전소 목록을 불러오고 있습니다.');
      const work=within(Promise.resolve().then(()=>call('list'))).then(r=>{
        if(!current())return false;
        if(r?.error?.code==='42501'){verified=false;scope=null;el('plantAuthorized').hidden=true;rootStatus('현재 조합의 발전소 관리 권한이 없습니다.');return false;}
        if(!r||r.error||!Array.isArray(r.data?.plants)||!Array.isArray(r.data?.monitor)||!r.data?.dashboard_id)throw new Error();
        scope=r.data;verified=true;
        showRows('coopPlantCards',scope.plants,false);showRows('coopMonitorCards',scope.monitor,true);
        el('plantAuthorized').hidden=false;rootStatus('');return true;
      }).catch(()=>{if(current()){el('plantReload').hidden=false;rootStatus('목록을 확인하지 못했습니다.');}return false;})
        .finally(()=>{if(listRequest===work)listRequest=null;importView?.sync();});
      listRequest=work;importView?.sync();return work;
    }
    async function open(id) {
      if(!id||!verified)return;
      const op={id,owner:actor,token:++ticket,row:null};
      selected=op;fields.disabled=true;retry.hidden=true;save.disabled=true;form.reset();
      notice.textContent='기본정보를 불러오고 있습니다.';if(!editor.open)editor.showModal();
      try{
        const r=await within(Promise.resolve().then(()=>call('read',{id})));
        if(!active(op))return;
        if(!r||r.error||r.data?.id!==id)throw r?.error||new Error();
        op.row=r.data;setFields(op.row);op.base=readFields();op.baseline=snapshot(op.base);
        const key=draftKey(id),draft=drafts.get(key),writing=writes.get(key);
        if(writing?.unknown && snapshot({...op.row,status:normalized(op.row.status)})===snapshot(writing.sent)){
          writes.delete(key);
          if(draft && snapshot(draft.input)===snapshot(writing.sent))drafts.delete(key);
        }
        const newest=drafts.get(key);
        if(newest)setFields(newest.input);
        op.conflict=!!newest && newest.revision!==op.row.revision;
        fields.disabled=false;save.disabled=op.conflict||writes.has(key);retry.hidden=!writes.get(key)?.unknown;
        notice.textContent=op.conflict?'다른 곳에서 기본정보가 변경됐습니다. 내 수정 내용은 남아 있습니다.'
          : writes.has(key)?'이전 저장 결과를 확인하고 있습니다.':newest?'작성 중이던 내용을 불러왔습니다.':'';
        if(op.conflict&&!writes.has(key)){retry.hidden=false;retry.textContent='최신 정보에 내 수정 다시 적용';}
        else retry.textContent='다시 확인';
      }catch(error){if(active(op)){notice.textContent=error?.code==='42501'?'이 발전소를 볼 권한이 없습니다.':'정보를 확인하지 못했습니다.';
        retry.hidden=false;retry.textContent='다시 확인';}}
    }
    async function submit(event) {
      event.preventDefault();const op=selected;
      if(!active(op)||!op.row||op.conflict||save.disabled)return;
      const key=draftKey(op.id),input=readFields(),request={sent:input,unknown:false};
      if(writes.has(key))return;
      writes.set(key,request);save.disabled=true;retry.hidden=true;notice.textContent='기본정보를 저장하고 있습니다.';
      const result=Promise.resolve().then(()=>active(op)?call('save',{id:op.id,revision:op.row.revision,...input}):{cancelled:true})
        .catch(()=>null);
      const finish=r=>{
        if(writes.get(key)!==request)return;
        const ok=r?.data?.id===op.id && typeof r.data.changed==='boolean',denied=['42501','PT409','22023','55P03'].includes(r?.error?.code);
        if(ok||denied||r?.cancelled)writes.delete(key);else request.unknown=true;
        if(!active(op)){
          const d=drafts.get(key);
          if(ok&&d&&snapshot(d.input)===snapshot(input))drafts.delete(key);
          else if(ok&&d)drafts.set(key,{input:d.input,base:input,revision:r.data.revision});
          if((ok||denied)&&selected?.id===op.id&&active(selected)&&snapshot(readFields())===selected.baseline)void open(op.id);
          return;
        }
        if(ok){
          op.row.revision=r.data.revision;op.base=input;op.baseline=snapshot(input);
          holdDraft(op);
          if(snapshot(readFields())===snapshot(input)){close();void load();}
          else {save.disabled=false;notice.textContent='먼저 입력한 내용은 저장됐습니다. 그 뒤에 바꾼 내용은 아직 저장되지 않았습니다.';}
        }else if(denied){
          op.conflict=r.error.code==='PT409';
          save.disabled=op.conflict||r.error.code==='42501';
          retry.hidden=!op.conflict;retry.textContent='최신 값 다시 확인';
          notice.textContent=op.conflict?'다른 곳에서 기본정보가 변경됐습니다. 현재 입력은 그대로 있습니다.':'입력값과 현재 권한을 확인해 주세요.';
        }else if(!r?.cancelled){notice.textContent='저장 결과를 확인하지 못했습니다. 다시 확인은 조회만 합니다.';retry.hidden=false;retry.textContent='다시 확인';}
      };
      const r=await within(result);finish(r);
      if(!r)void result.then(final=>{if(final)finish(final);});
    }
    function pause(){
      close();revision++;listRequest=null;importView?.pause();
    }
    el('coopPlantClose').addEventListener('click',close);
    editor.addEventListener('cancel',e=>{e.preventDefault();close();});
    form.addEventListener('submit',submit);
    retry.addEventListener('click',()=>{
      const op=selected;if(!op)return;
      const previously=drafts.get(draftKey(op.id)),input=readFields();
      if(op.conflict && previously?.base && !writes.has(draftKey(op.id)) && retry.textContent==='최신 정보에 내 수정 다시 적용'){
        const combined={...op.base};
        for(const k of keys)if(input[k]!==previously.base[k])combined[k]=input[k];
        op.conflict=false;setFields(combined);holdDraft(op);save.disabled=false;retry.hidden=true;
        notice.textContent='최신 정보에 내 수정 항목만 다시 넣었습니다. 확인하고 저장해 주세요.';return;
      }
      holdDraft();void open(op.id);
    });
    el('plantReload').addEventListener('click',load);
    root.querySelectorAll('[data-plant-tab]').forEach(button=>button.addEventListener('click',()=>changeTab(button.dataset.plantTab)));
    global.addEventListener('pagehide',pause);
    global.addEventListener('beforeunload',event=>{
      if(!drafts.size&&!(selected?.row&&snapshot(readFields())!==selected.baseline))return;
      event.preventDefault();event.returnValue='';
    });
    root.addEventListener('visibilitychange',()=>{if(!visible())pause();else void load();});
    if(global.frameElement)new MutationObserver(()=>{if(!visible())pause();else void load();})
      .observe(global.frameElement,{attributes:true,attributeFilter:['hidden']});
    async function start(){
      const {data,error}=await client.auth.getUser();
      if(error||!data?.user?.id){rootStatus('ERP에 로그인한 뒤 다시 열어 주세요.');return false;}
      actor=data.user.id;
      const runtime=await guard.getRuntime(client);
      if(!runtime?.coop_id||runtime.runtime_profile!=='legacy_full'){rootStatus('현재 조합의 발전소 관리 권한이 없습니다.');return false;}
      client.auth.onAuthStateChange?.((event,session)=>{if(event==='SIGNED_OUT'||(session?.user?.id&&session.user.id!==actor)){
        pause();actor='';verified=false;scope=null;drafts.clear();writes.clear();el('plantAuthorized').hidden=true;rootStatus('ERP에 다시 로그인해 주세요.');
      }});
      resume?.register?.({authorize:async()=>{const r=await call('access');return !r.error&&r.data?.allowed===true;},busy:()=>drafts.size>0||editor.open,refresh:load});
      return load();
    }
    return {start,load,pause};
  }
  global.CoopPowerPlants={mount};
  if(global.supabase && global.ErpRuntimeGuard && document.getElementById('coopPlantCards')){
    const client=global.supabase.createClient('https://ifdqlwxgqgsvnawmhlfc.supabase.co','sb_publishable_lkVhLJDe8WmOPzsWOMkKdg_pjVwVS-h',{
      global:{headers:{'x-erp-host':global.CoopRouteGuard?.getErpRuntimeHost(global.location)||global.location.hostname}}
    });
    void mount({client}).start().catch(()=>{document.getElementById('plantStatus').textContent='ERP 접속을 확인하지 못했습니다. ERP 홈에서 다시 열어 주세요.';});
  }
})(window);
