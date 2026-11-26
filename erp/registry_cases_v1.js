(function(root){
 'use strict';
 const kinds={charter:'정관 변경 · 신고만',officer:'임원 변경',chair:'이사장 변경',office:'주사무소 이전',capital:'기말 출자금 변경',members:'기말 조합원 수 변경',other:'직접 설정'};
 const tasks={resolution:'의결 확인',notary:'의사록 공증',report:'변경신고',registry:'변경등기',tax:'홈택스 사업자등록 정정',bank:'은행 정보 정정',disclosure:'경영공시 반영'};
 const plantTasks={permit:'발전사업허가',power:'한전 또는 KPX 계약',rec:'RPS 설비·REC 정산'};
 const stages={todo:'할 일',doing:'진행 중',done:'완료',skip:'해당 없음'};
 const presets={charter:['resolution','report'],officer:['resolution','notary','report','registry'],chair:['resolution','notary','report','registry','tax','bank','disclosure'],office:['resolution','notary','report','registry','tax','bank','disclosure'],capital:['report','registry'],members:['report'],other:[]};
 const preset=kind=>Object.fromEntries(Object.keys(tasks).map(k=>[k,presets[kind]?.includes(k)?'todo':'skip']));
 const ymd=d=>d.toISOString().slice(0,10);
 function suggested(kind,date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return '';
  const d=new Date(date+'T00:00:00Z');if(Number.isNaN(+d)||ymd(d)!==date)return '';
  if(['capital','members'].includes(kind))return date.endsWith('-12-31')?(d.getUTCFullYear()+1)+'-03-31':'';
  if(!['officer','chair','office'].includes(kind))return '';
  d.setUTCDate(d.getUTCDate()+21);return ymd(d);
 }
 function attach({element,client,context,authorize,go}){
  const d=element.ownerDocument,$=id=>d.getElementById(id),newNode=(tag,s)=>{const n=d.createElement(tag);if(s)n.textContent=s;return n;};
  const status=$('caseTrackingStatus'),list=$('caseTrackingList'),form=$('caseTrackingForm'),title=$('caseTrackingName'),kind=$('caseTrackingKind'),cause=$('caseTrackingCause'),due=$('caseTrackingDue'),minute=$('caseTrackingMinute'),steps=$('caseTrackingSteps'),plants=$('caseTrackingPlants'),plantNames=$('caseTrackingPlantNames');
  let gen=0,open=false,checking=false,saving=false,suggestions=false,rows=[],selected=null,baseline='',allowReplace=false;
  const scope=()=>context().key,ticket=()=>[gen,scope()],current=([n,k])=>open&&n===gen&&k===scope()&&context().authorized;
  const message=(s)=>status.textContent=s;
  const call=async(action,id=null,detail=null,revision=null)=>{
   const {coop}=context(),r=await client.rpc('member_city_registry_cases',{p_action:action,p_coop:coop,p_id:id,p_detail:detail,p_revision:revision});
   if(r.error)throw r.error;
   if(r.data?.coop_id!==coop)throw Error('조합 정보를 다시 확인해 주세요.');
   return r.data;
  };
  function option(s,value,selected=false){const n=newNode('option',s);n.value=value;n.selected=selected;return n;}
  function selectControl(group,label,value){const wrap=newNode('label',label),n=newNode('select');n.dataset.key=group;n.replaceChildren(...Object.entries(stages).map(([k,v])=>option(v,k,k===value)));wrap.append(n);return wrap;}
  function showTasks(values){steps.replaceChildren(...Object.entries(tasks).map(([k,label])=>selectControl(k,label,values[k]||'skip')));}
  function appendPlant(value={name:'',permit:'todo',power:'todo',rec:'todo'}){
   if(plants.children.length>=50)return;
   const group=newNode('fieldset'),nameLabel=newNode('label','발전소 이름'),name=newNode('input'),remove=newNode('button','이 목록에서 빼기');
   name.value=value.name;name.maxLength=100;name.required=true;name.setAttribute('list',plantNames.id);
   remove.type='button';remove.onclick=()=>{group.remove();$('caseTrackingAddPlant').focus();};
   nameLabel.append(name);group.append(nameLabel,...Object.entries(plantTasks).map(([k,text])=>selectControl(k,text,value[k]||'skip')),remove);plants.append(group);return name;
  }
  const states=el=>Object.fromEntries([...el.querySelectorAll('select[data-key]')].map(n=>[n.dataset.key,n.value]));
  const dates={notary:$('caseTrackingNotaryOn'),report:$('caseTrackingReportOn'),registry:$('caseTrackingRegistryOn')};
  const read=()=>({title:title.value.trim(),kind:kind.value,causeOn:cause.value,dueOn:due.value,minute:minute.value,
   dates:Object.fromEntries(Object.entries(dates).map(([key,node])=>[key,node.value])),
   steps:states(steps),plants:[...plants.children].map(el=>({name:el.querySelector('input').value.trim(),...states(el)}))});
  const dirty=()=>!!selected&&JSON.stringify(read())!==baseline;
  async function replaceOK(){if(!dirty())return true;if(!root.CoopDialog||typeof root.CoopDialog.confirm!=='function')return false;return root.CoopDialog.confirm('저장하지 않은 진행상태를 닫을까요?');}
  function showRow(row){
   selected=row;allowReplace=false;const x=row.detail;
   title.value=x.title;kind.value=x.kind;cause.value=x.causeOn;due.value=x.dueOn;showTasks(x.steps);
   for(const [key,node] of Object.entries(dates))node.value=x.dates?.[key]||'';
   minute.replaceChildren(option('연결하지 않음',''),...(x.minute?[option('연결된 회의록',x.minute,true)]:[]));
   plants.replaceChildren();x.plants.forEach(appendPlant);form.hidden=false;baseline=JSON.stringify(read());drawRows();
  }
  function drawRows(){list.replaceChildren(...rows.map(r=>{const b=newNode('button',r.detail.title),line=newNode('div'),on=Object.values(r.detail.steps).concat(r.detail.plants.flatMap(p=>[p.permit,p.power,p.rec])).filter(x=>x!=='skip'),n=on.filter(x=>x==='done').length,info=newNode('small',(r.detail.dueOn?r.detail.dueOn+'까지 · ':'')+(on.length?n+'/'+on.length+' 완료':'일정 확인'));b.type='button';b.setAttribute('aria-pressed',String(r.id===selected?.id));b.onclick=async()=>{const t=ticket();if(!saving&&await replaceOK()&&current(t)){showRow(r);title.focus();}};line.append(b,info);return line;}));}
  async function refresh(force=false){
   if(checking||saving||!open)return;
   const t=ticket();checking=true;
   try{await authorize();if(!current(t))return;const result=await call('list');if(!current(t))return;rows=result.rows;if(!Array.isArray(rows))throw Error();
    drawRows();if(force&&rows.length===0)message('진행 중인 변경 건이 없습니다.');else message(rows.length===101?'최근 101건을 표시합니다.':'');
   }catch(e){if(current(t))message(e?.code==='42501'?'변경 건을 볼 권한을 다시 확인해 주세요.':'변경 건을 불러오지 못했습니다. 다시 확인을 눌러 주세요.');}
   finally{if(t[0]===gen)checking=false;}
  }
  $('caseTrackingReload').onclick=()=>refresh(true);
  $('caseTrackingNew').onclick=async()=>{const t=ticket();if(saving||!await replaceOK()||!current(t))return;
   showRow({id:root.crypto.randomUUID(),revision:null,detail:{title:'',kind:'other',causeOn:'',dueOn:'',minute:'',steps:preset('other'),plants:[]}});allowReplace=true;title.focus();message('');};
  kind.append(...Object.entries(kinds).map(([k,v])=>option(v,k)));
  kind.onchange=()=>{if(!allowReplace)return;showTasks(preset(kind.value));};
  $('caseTrackingSuggest').onclick=()=>{const date=suggested(kind.value,cause.value);if(date){due.value=date;message('기한을 채웠습니다.');}else message(['capital','members'].includes(kind.value)?'12월 결산이면 기준일에 12월 31일을 입력하세요.':'이 건의 접수 기한을 직접 입력해 주세요.');};
  $('caseTrackingAddPlant').onclick=()=>appendPlant()?.focus();
  $('caseTrackingLoadPlants').onclick=async()=>{
   if(suggestions)return;const t=ticket(),button=$('caseTrackingLoadPlants');suggestions=true;button.disabled=true;
   try{await authorize();if(!current(t))return;const r=await client.rpc('coop_power_plants',{p_action:'list',p_payload:{}});
    if(!current(t))return;if(r.error||!Array.isArray(r.data?.plants))throw Error();
    plantNames.replaceChildren(...[...new Set(r.data.plants.map(x=>String(x.name||'').trim()).filter(Boolean))].map(x=>option(x,x)));
    message(plantNames.children.length?'발전소 이름을 입력하면 기존 목록이 나옵니다.':'등록한 발전소가 없습니다.');
   }catch{if(current(t))message('발전소 목록을 불러오지 못했습니다. 이름을 직접 입력할 수 있습니다.');}
   finally{if(t[0]===gen){suggestions=false;button.disabled=false;}}
  };
  $('caseTrackingLoadMinutes').onclick=async()=>{
   const t=ticket(),id=selected?.id,b=$('caseTrackingLoadMinutes'),coop=context().coop;if(b.disabled||!id)return;b.disabled=true;
   try{await authorize();if(!current(t)||selected?.id!==id)return;const r=await client.from('minutes').select('id,title,coop_id,doc_type').eq('coop_id',coop).in('doc_type',['GENERAL_ASSEMBLY','MINUTES','PAST_MINUTES']).order('id',{ascending:false}).limit(50);
    if(!current(t)||selected?.id!==id)return;if(r.error||!Array.isArray(r.data)||r.data.some(x=>x.coop_id!==coop))throw Error();
    const value=minute.value;minute.replaceChildren(option('연결하지 않음',''),...r.data.map(x=>option(x.title||'회의록',x.id,x.id===value)));
    if(value&&!r.data.some(x=>x.id===value))minute.add(option('연결된 회의록',value,true));minute.focus();
   }catch{if(current(t)&&selected?.id===id)message('현재 권한으로 회의록 목록을 확인할 수 없습니다.');}
   finally{if(t[0]===gen)b.disabled=false;}
  };
  form.onsubmit=async e=>{
   e.preventDefault();if(!selected||saving||!context().authorized)return;
   const t=ticket(),id=selected.id,detail=read(),rev=selected.revision,save=$('caseTrackingSave');
   if(!detail.title||detail.plants.some(p=>!p.name)){message('변경 건 제목과 발전소 이름을 입력하세요.');return;}
   saving=true;save.disabled=true;message('저장하고 있습니다.');
   try{await authorize();if(!current(t))return;const row=await call('save',id,detail,rev);if(!current(t)||selected?.id!==id)return;
    if(row.id!==id||!row.revision)throw Error();
    rows=[row,...rows.filter(r=>r.id!==id)];selected=row;baseline=JSON.stringify(detail);allowReplace=false;drawRows();message('저장했습니다.');
   }catch(e){if(current(t))message(e?.code==='40001'?'다른 창에서 먼저 저장했습니다. 입력은 그대로 있어요. 다시 확인해 주세요.':'저장하지 못했습니다. 입력을 확인하고 다시 저장해 주세요.');}
   finally{if(t[0]===gen){saving=false;save.disabled=false;}}
  };
  $('caseTrackingCity').onclick=()=>go('registry.html');$('caseTrackingGuide').onclick=()=>go('registry_guide.html');
  return {open(){if(open)return;open=true;gen++;refresh(true);},leave(clear=false){const wasOpen=open;if(wasOpen){gen++;open=false;checking=false;saving=false;suggestions=false;$('caseTrackingSave').disabled=$('caseTrackingLoadPlants').disabled=$('caseTrackingLoadMinutes').disabled=false;}
   if(clear){rows=[];selected=null;baseline='';list.replaceChildren();plants.replaceChildren();plantNames.replaceChildren();form.hidden=true;message('');}
  },dirty:()=>open&&(saving||dirty()),refresh};
 }
 root.CoopRegistryCases=Object.freeze({attach,suggested,preset});
})(typeof window==='undefined'?globalThis:window);
