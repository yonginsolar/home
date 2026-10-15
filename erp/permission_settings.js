/* v1.1.0 — Separate explicit full-admin assignment from module selection. */
(function(root){
 'use strict';
 const controllers=new Set(),catalog=[['approval.view','전자결재 조회'],['approval.submit','전자결재 기안'],['approval.process','전자결재 승인'],['approval.physical','실물결재 처리'],['mypage.view','마이페이지'],['accounting.view','회계 조회'],['accounting.edit','회계 등록·수정'],['hr.admin','직원·급여 관리'],['member.admin','조합원 관리'],['education.manage','교육·행사 관리'],['site.admin','홈페이지 관리'],['audit.view','감사 로그 조회'],['permission.manage','업무 권한 관리'],['minutes.manage','회의 관리'],['documents.manage','문서함 관리'],['signature.manage','전자서명 관리'],['vote.manage','선거·투표 관리']];
 const labels=Object.fromEntries(catalog),roleLabel=v=>({admin:'관리자',admin_all:'전체 관리자',manager:'관리 담당자',staff:'일반 직원',chairman:'이사장'}[v]||v),permissionModule=k=>({member:'member_admin',site:'site_admin'}[k.split('.')[0]]||k.split('.')[0]);
 const setting=v=>v===true?'사용':v===false?'사용 안 함':'기본 권한 따름';
 function node(tag,cls,text){const n=document.createElement(tag);n.className=cls||'';if(text)n.textContent=text;return n;}
 function select(values,label){const n=node('select','form-select');n.setAttribute('aria-label',label);for(const [value,text]of values){const o=node('option','',text);o.value=value;n.append(o);}return n;}
 function button(text,action){const n=node('button','btn btn-outline-primary btn-sm',text);n.type='button';n.onclick=action;return n;}
 function mount(client,container,options={}){
  if(container.permissionController)return container.permissionController;
  let data=null,busy=false,reading=false,known=false,epoch=0,owner=options.owner?.()||'',kind=options.kind||'defaults',scope='role',role='',pending={},access={},chosen=new Set();
  const snapshot=()=>JSON.stringify([kind,scope,role,pending,access,[...chosen].sort()]),dirty=()=>Object.keys(pending).some(k=>Object.keys(pending[k]).length)||Object.keys(access).length>0||(kind==='admins'&&chosen.size>0);
  const status=node('p','text-secondary mb-3'),toolbar=node('div','d-flex flex-wrap gap-2 mb-3'),body=node('div'),actions=node('div','d-flex gap-2 mt-3');container.append(status,toolbar,body,actions);
  const reload=button('최신 권한 확인',()=>void read(true)),save=button('변경 내용 확인·저장',()=>void commit());actions.append(reload,save);
  const current=ticket=>ticket===epoch&&owner===(options.owner?.()||owner);
  const mayChange=()=>known&&data&&(kind==='defaults'?data.can_defaults:kind==='admins'?data.can_admins:data.can_bulk)===true;
  function lock(){const hasChanges=kind==='defaults'?Object.keys(pending[groupKey()]||{}).length>0:kind==='admins'?chosen.size>0:Object.keys(access).length>0&&chosen.size>0;body.querySelectorAll('input,select').forEach(n=>{n.disabled=busy||reading||!mayChange()||n.dataset.coopDisabled==='true';});toolbar.querySelectorAll('input,select,button').forEach(n=>n.disabled=busy||reading);save.disabled=busy||reading||!mayChange()||!hasChanges;reload.disabled=busy||reading;}
  async function rpc(args,readOnly=false){let q=client.rpc('erp_permission_config',args);if(readOnly&&q.abortSignal)q=q.abortSignal(AbortSignal.timeout(15000));const r=await q;if(r.error)throw r.error;return r.data;}
  function groupKey(){return scope+'\n'+role;}
  function defaultValue(key){return data.rules.find(x=>x.scope===scope&&x.role===role&&x.permission===key)?.enabled??null;}
  function controlsCheckpoint(){if(!dirty())root.ErpWorkspaceResume?.checkpoint(container);}
  function paint(){
   if(!data)return;toolbar.replaceChildren();body.replaceChildren();
   if(!options.kind){for(const [k,label]of[['defaults','조합 기본 권한'],['bulk','직원별 일괄 변경']]){const b=button(label,()=>{if(busy||reading)return;kind=k;paint();});b.classList.toggle('btn-primary',kind===k);toolbar.append(b);}}
   if(kind==='defaults'){
    const scopeSelect=select([['role','역할별'],['position','직급별']],'기본 권한 기준');scopeSelect.value=scope;scopeSelect.dataset.erpQueryControl='';scopeSelect.onchange=()=>{scope=scopeSelect.value;role='';paint();};toolbar.append(scopeSelect);
    const keys=[...new Set([...data.employees.map(x=>scope==='role'?x.role:x.position),...data.rules.filter(x=>x.scope===scope).map(x=>x.role),...(scope==='role'?['staff','manager','chairman','admin','admin_all']:data.positions||[])])].filter(Boolean).sort((a,b)=>a.localeCompare(b,'ko'));
    if(!keys.includes(role))role=keys[0]||'';const roleSelect=select(keys.map(k=>[k,scope==='role'?roleLabel(k):k]),scope==='role'?'역할 선택':'직급 선택');roleSelect.value=role;roleSelect.dataset.erpQueryControl='';roleSelect.onchange=()=>{role=roleSelect.value;paint();};toolbar.append(roleSelect);
    if(!role){body.append(node('p','text-secondary','먼저 조합 설정에서 직급을 등록해 주세요.'));lock();return;}
    const help=node('p','text-secondary','역할·직급의 기본 권한을 정합니다. 직원별 사용·사용 안 함 설정과 결재로 받은 권한은 유지됩니다. 전체 관리자의 복구 권한은 별도로 유지됩니다.');body.append(help);
    for(const [key,label]of catalog){const row=node('div','permission-setting-row'),title=node('label','form-label mb-0',label),s=select([['unset','미설정'],['yes','사용'],['no','사용 안 함']],label+' 기본 권한');s.id='permission-default-'+key.replaceAll('.','-');title.htmlFor=s.id;const base=defaultValue(key),patch=pending[groupKey()]?.[key];s.value=(patch===undefined?base:patch)===true?'yes':(patch===undefined?base:patch)===false?'no':'unset';
     const module=data.modules.find(m=>m.key===permissionModule(key));if(module?.enabled===false){s.querySelector('option[value="yes"]').disabled=true;row.append(node('span','badge text-bg-secondary','조합 사용 중지'));}
     s.onchange=()=>{const value=s.value==='yes'?true:s.value==='no'?false:null,k=groupKey();pending[k]||={};if(value===base)delete pending[k][key];else pending[k][key]=value;lock();};row.prepend(title,s);body.append(row);}
    if(!data.can_defaults)body.prepend(node('p','alert alert-info','기본 권한 변경은 조합 전체 관리자만 할 수 있습니다. 현재 기준은 조회할 수 있습니다.'));
   }else{
    const admins=kind==='admins';
    if(admins&&data.can_admins!==true){body.append(node('p','alert alert-info','전체 관리자 지정은 같은 조합의 전체 관리자만 할 수 있습니다.'));lock();return;}
    body.append(node('p',admins?'alert alert-warning':'text-secondary',admins?'선택한 사람을 이 조합의 전체 관리자로 지정합니다. 조합 전체 업무와 권한 설정을 관리할 수 있으므로 필요한 사람만 선택하세요. 기존 개별 설정·결재선·초기 설정 권한 기록은 변경하지 않습니다. 한 명이라도 처리할 수 없으면 모두 취소됩니다.':'변경할 사람과 업무만 선택하세요. 선택하지 않은 업무와 기존 개별 설정은 바뀌지 않습니다. 한 명이라도 저장할 수 없으면 모두 취소됩니다.'));
    const people=node('fieldset','permission-people'),legend=node('legend','h6','권한 받을 사람');people.append(legend);
    const eligible=data.employees.filter(e=>!admins||e.can_admin_target===true);
    for(const e of eligible){const l=node('label','form-check border rounded p-2'),check=node('input','form-check-input ms-0 me-2');check.type='checkbox';check.dataset.permissionTarget=e.id;check.checked=chosen.has(e.id);check.onchange=()=>{check.checked?chosen.add(e.id):chosen.delete(e.id);lock();};l.append(check,document.createTextNode(e.name+(e.position?' · '+e.position:'')+' · '+roleLabel(e.role)));people.append(l);}body.append(people);
    if(!eligible.length)body.append(node('p','text-secondary','지정할 수 있는 사람이 없습니다.'));
    for(const m of admins?[]:data.modules){const row=node('div','permission-setting-row'),l=node('label','form-label mb-0',m.label),s=select([['same','변경 안 함'],['inherit','기본 권한 따름'],['yes','사용'],['no','사용 안 함']],m.label+' 일괄 설정');s.id='permission-bulk-'+m.key;l.htmlFor=s.id;s.value=Object.hasOwn(access,m.key)?access[m.key]===true?'yes':access[m.key]===false?'no':'inherit':'same';if(!m.enabled)s.querySelector('option[value="yes"]').disabled=true;
     s.onchange=()=>{if(s.value==='same')delete access[m.key];else access[m.key]=s.value==='yes'?true:s.value==='no'?false:null;lock();};row.append(l,s);if(!m.enabled)row.append(node('span','badge text-bg-secondary','조합 사용 중지'));body.append(row);}
   }lock();controlsCheckpoint();
  }
  async function read(merge=false){if(busy||reading)return;const ticket=++epoch,readOwner=options.owner?.()||owner;if(readOwner!==owner){owner=readOwner;known=false;body.hidden=true;status.textContent='현재 조합 권한을 다시 확인해 주세요.';return;}reading=true;lock();status.textContent='현재 권한을 확인하고 있습니다.';
   try{const next=await rpc({p_action:'get'},true);if(!current(ticket))return;data=next;known=true;body.hidden=false;
    if(merge){for(const [group,patch]of Object.entries(pending)){const [s,r]=group.split('\n');for(const [key,v]of Object.entries(patch)){const base=data.rules.find(x=>x.scope===s&&x.role===r&&x.permission===key)?.enabled??null;if(base===v)delete patch[key];}}chosen=new Set([...chosen].filter(id=>data.employees.some(e=>e.id===id&&(kind!=='admins'||e.can_admin_target===true))));}
    status.textContent=dirty()?'입력 내용은 유지했습니다. 변경 내용을 확인한 뒤 저장하세요.':'최신 권한을 불러왔습니다.';paint();
   }catch(_){if(current(ticket)){known=false;status.textContent='권한을 확인하지 못했습니다. 입력 내용은 유지됩니다. 최신 권한 확인을 눌러 다시 시도해 주세요.';}}
   finally{if(current(ticket)){reading=false;lock();}}
  }
  async function commit(){if(busy||reading||!mayChange()||!dirty())return;const initial=snapshot(),ticket=epoch;let args,message;
   if(kind==='defaults'){const patch=pending[groupKey()];if(!patch||!Object.keys(patch).length)return;args={p_action:'defaults',p_scope:scope,p_role:role,p_rules:{...patch},p_revision:data.revision};message=(scope==='role'?roleLabel(role):role)+'의 기본 권한을 변경할까요?\n'+Object.entries(patch).map(([k,v])=>(labels[k]||'업무')+': '+(defaultValue(k)===null?'미설정':setting(defaultValue(k)))+' → '+(v===null?'미설정':setting(v))).join('\n');
   }else if(kind==='admins'){
    if(!chosen.size||[...chosen].some(id=>!data.employees.some(e=>e.id===id&&e.can_admin_target===true)))return;
    args={p_action:'admins',p_targets:[...chosen],p_revision:data.revision};
    message=[...chosen].map(id=>{const e=data.employees.find(x=>x.id===id);return e.name+(e.position?' · '+e.position:'')+': '+roleLabel(e.role)+' → 전체 관리자';}).join('\n')+'\n\n선택한 사람에게 이 조합의 전체 관리자 권한을 부여할까요? 다른 조합·통합관리자 권한은 부여하지 않습니다.';
   }else{if(!chosen.size)return root.CoopDialog.alert('권한 받을 사람을 선택해 주세요.');args={p_action:'bulk',p_targets:[...chosen],p_access:{...access},p_revision:data.revision};message=[...chosen].map(id=>{const e=data.employees.find(x=>x.id===id);return e.name+'\n'+Object.entries(access).map(([k,v])=>'  '+(data.modules.find(m=>m.key===k)?.label||'업무')+': '+setting(data.overrides.find(o=>o.id===id&&o.module===k)?.enabled??null)+' → '+setting(v)).join('\n');}).join('\n\n')+'\n\n선택한 업무만 변경할까요?';}
   if(!await root.CoopDialog.confirm(message)||!current(ticket)||snapshot()!==initial)return;
   busy=true;lock();try{const next=await rpc(args);if(!current(ticket))return;data=next;if(kind==='defaults')delete pending[groupKey()];else{access={};chosen.clear();}status.textContent=kind==='admins'?'전체 관리자로 지정했습니다.':'업무 권한을 저장했습니다.';paint();await root.CoopDialog.alert(status.textContent+' 다른 설정은 유지됩니다.');}
   catch(e){if(current(ticket))status.textContent=e?.code==='PT409'?'다른 담당자가 권한을 변경했습니다. 입력 내용은 유지됩니다. 최신 권한 확인 후 다시 검토하세요.':'저장 결과를 확인하지 못했습니다. 입력 내용은 유지됩니다. 최신 권한 확인으로 상태를 확인해 주세요.';}
   finally{if(current(ticket)){busy=false;lock();}}
  }
  const controller={read,dirty,writing:()=>busy||reading,busy:()=>busy||reading||dirty(),invalidate(){epoch++;known=false;reading=false;busy=false;body.hidden=true;status.textContent='현재 계정의 권한을 다시 확인해 주세요.';lock();}};container.permissionController=controller;controllers.add(controller);return controller;
 }
 function dialog(client,kind,owner){if(!['defaults','bulk','admins'].includes(kind))return;const title={defaults:'조합 기본 업무 권한',bulk:'직원 권한 일괄 변경',admins:'전체 관리자 일괄 지정'}[kind];let modal=document.querySelector('dialog[data-permission-editor="'+kind+'"]');if(!modal){modal=node('dialog','permission-settings-dialog');modal.dataset.permissionEditor=kind;modal.setAttribute('aria-label',title);const heading=node('div','d-flex align-items-center justify-content-between mb-3');heading.append(node('h2','h4 mb-0',title));heading.append(button('닫기',()=>{if(modal.permissionController?.writing())return;modal.close();}));modal.append(heading);document.body.append(modal);mount(client,modal,{kind,owner});modal.addEventListener('cancel',e=>{if(modal.permissionController.writing())e.preventDefault();});}
  modal.showModal();void modal.permissionController.read(true);return modal.permissionController;
 }
 root.addEventListener('beforeunload',e=>{if([...controllers].some(c=>c.busy())){e.preventDefault();e.returnValue='';}});
 root.ERPPermissionSettings=Object.freeze({mount,dialog,busy:()=>[...controllers].some(c=>c.busy()),invalidate:()=>controllers.forEach(c=>c.invalidate()),catalog,permissionModule,version:'1.1.0'});
})(window);
