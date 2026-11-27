/* Meeting orchestration. Business forms and writes belong to their original tasks. */
(() => {
  'use strict';
  const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  const phases=[
   ['prepare','회의 준비','/minutes/meeting_workspace.html',''],
   ['agenda','안건 작성','/minutes/meeting_workspace.html',''],
   ['materials','회의자료 확인','/minutes/meeting_workspace.html',''],
   ['approval','소집 공문 결재','/erp/approval.html',''],
   ['notice','공문 게시·출력','/minutes/admin_minutes.html','notices'],
   ['scenario','시나리오','/minutes/meeting_workspace.html',''],
   ['meeting','회의 결과','/minutes/admin_minutes.html','minutes'],
   ['minutes','의사록','/minutes/admin_minutes.html','minutes'],
   ['signature','서명','/minutes/admin_minutes.html','minutes'],
   ['publish','공개','/minutes/admin_minutes.html','minutes'],
  ];
  const assembly='GENERAL_ASSEMBLY';
  const boardTabs=[
    ['prepare','기본정보'],['agenda','안건'],['materials','회의자료'],['approval','소집 공문 결재'],
    ['notice','소집 공고'],['meeting','이사회 진행'],['minutes','의사록'],['signature','서명'],['publish','의사록 공개']
  ];
  const assemblyPhases=[
    ...phases.slice(0,2),['audit','감사 제출','/minutes/meeting_workspace.html',''],
    ...phases.slice(2).map(phase=>phase[0]==='materials'?[phase[0],'총회 자료집 확인',phase[2],phase[3]]:phase),
    ['followups','의결 후 할 일','/minutes/admin_minutes.html','minutes'],
  ];
  const outcomePhase=['outcome','회의 무산 기록','/minutes/meeting_workspace.html',''];
  const resumePhase=['resume','회의 열기','/minutes/meeting_workspace.html',''];
  const list=(kind,regular=true)=>kind===assembly?assemblyPhases.filter(x=>regular||x[0]!=='audit'):phases;
  const url=(id,stage,kind='BOARD',{record=false}={})=>{
    if(!uuid.test(id))return '';
    const phase=stage==='outcome'?outcomePhase:stage==='resume'?resumePhase:list(kind).find(p=>p[0]===stage);
    if(!phase)return '';
    return phase[2]+'?'+(kind===assembly?'assemblyFlow':'boardFlow')+'='+encodeURIComponent(id)+'&stage='+stage+(phase[3]?'&scope='+phase[3]:'')
      +(record&&kind==='BOARD'&&stage==='minutes'?'&intent=record':'');
  };
  function parse(value){
    try{
      const target=new URL(value,location.href),kind=target.searchParams.has('assemblyFlow')?assembly:'BOARD';
      const id=target.searchParams.get(kind===assembly?'assemblyFlow':'boardFlow'),stage=target.searchParams.get('stage');
      const record=target.searchParams.get('intent')==='record';
      const expected=url(id,stage,kind,{record});
      if(target.origin!==location.origin||target.username||target.password||!expected)return null;
      const canonical=new URL(expected,location.origin);
      if(target.pathname.replace(/\.html$/,'')!==canonical.pathname.replace(/\.html$/,'')
        ||[...target.searchParams.keys()].length!==[...canonical.searchParams.keys()].length
        ||[...canonical.searchParams].some(([k,v])=>target.searchParams.getAll(k).length!==1||target.searchParams.get(k)!==v))return null;
      return record?{id,stage,kind,href:expected,record}:{id,stage,kind,href:expected};
    }catch(_){return null;}
  }
  const approved=s=>['완료','실물결재완료'].includes(s);
  let snapshot=null;
  async function read(client,coopId,route=parse(location.href)){
    if(!route||!uuid.test(coopId||''))throw Error('회의와 현재 조합을 확인해 주세요.');
    const {data,error}=await client.rpc('meeting_guided_state',{p_package_id:route.id,p_kind:route.kind});
    if(error||data?.id!==route.id||data?.coopId!==coopId)throw Error('회의 진행 정보를 불러오지 못했어요.');
    if(route.stage==='audit'&&data.regular===false)throw Error('임시총회에는 감사 제출 단계가 없어요.');
    return data;
  }
  function adopt(context){
    snapshot=context;
    try{window.parent!==window&&window.parent.ErpBoardFlow?.update(window);}catch(_){}
  }
  function getSnapshot(){return snapshot;}
  const basics=row=>!!(row.date&&row.start&&row.location);
  const signed=row=>row.minuteStatus==='CLOSED'&&row.required>0&&row.signed===row.required;
  const posted=row=>approved(row.approvalStatus)&&row.documentPublished===true;
  const canRecord=row=>row.canRecordOutcome===true&&row.status==='READY'&&row.materialsReady===true&&!row.minuteId&&posted(row)&&row.meetingDatePassed===true;
  function nextStage(row,kind){
    if(row.status==='CANCELLED')return 'outcome';
    if(row.minuteId)return !signed(row)?'signature':!row.published||kind!==assembly?'publish':'followups';
    if(!basics(row)||(kind===assembly&&!row.noticeDate))return 'prepare';
    if(!row.agendaReady)return 'agenda';
    if(!row.materialsReady&&!approved(row.approvalStatus))return 'materials';
    if(!posted(row))return approved(row.approvalStatus)?'notice':'approval';
    if(!row.materialsReady)return 'materials';
    return canRecord(row)?'meeting':kind==='BOARD'?'notice':'scenario';
  }
  const boardTabFor=stage=>stage==='scenario'?'notice':stage==='outcome'?'meeting':stage;
  function renderBoardTabs(rail,heading,route,row,open) {
    const active=boardTabFor(route.stage);
    const top=document.createElement('div');top.className='erp-board-heading';
    const index=document.createElement('button');
    index.type='button';index.textContent='회의 목록';
    index.addEventListener('click',()=>window.ErpWorkspaceShell?.navigate('/minutes/meeting_workspace.html'));
    top.append(heading,index);
    const nav=document.createElement('div');nav.className='erp-board-tabstrip';nav.setAttribute('role','group');
    nav.setAttribute('aria-label','이사회 단계');
    const focused=rail.contains(document.activeElement)?document.activeElement?.dataset?.boardTab:null;
    boardTabs.forEach(([stage,label],i)=>{
      const tab=document.createElement('button');tab.type='button';tab.textContent=(i+1)+'. '+label;
      tab.dataset.boardTab=stage;
      if(stage===active)tab.setAttribute('aria-current','step');
      tab.addEventListener('click',()=>{
        if(route.stage!==stage)open(stage);
      });
      nav.append(tab);
    });
    nav.addEventListener('keydown',e=>{
      const buttons=[...nav.children],at=buttons.indexOf(e.target);
      if(at<0||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      e.preventDefault();
      const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(at+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
      buttons[next].focus();
    });
    rail.replaceChildren(top,nav);
    if(focused){
      const nextFocused=nav.querySelector('[data-board-tab="'+focused+'"]');
      nextFocused?.focus({preventScroll:true});
    }
    const current=nav.querySelector('[aria-current=step]');
    if(current&&(current.offsetLeft<nav.scrollLeft||current.offsetLeft+current.offsetWidth>nav.scrollLeft+nav.clientWidth)){
      nav.scrollLeft=Math.max(0,current.offsetLeft-6);
    }
  }
  function canVisit(stage,row){
    if(stage==='outcome')return row.status==='CANCELLED'||canRecord(row);
    if(row.status==='CANCELLED')return false;
    if(stage==='approval')return row.materialsReady===true||!!row.approvalId;
    if(stage==='notice')return approved(row.approvalStatus);
    if(stage==='scenario')return posted(row);
    if(stage==='meeting')return canRecord(row)||!!row.minuteId;
    if(stage==='minutes')return !!row.minuteId||canRecord(row);
    if(stage==='signature'||stage==='publish'||stage==='followups')return !!row.minuteId;
    return true;
  }
  let childWindow=null,shownKey='';
  function update(child){
    if(child!==childWindow)return;
    const rail=document.getElementById('erpBoardFlowRail');
    if(!rail)return;
    let route,row;
    try{route=parse(child.location.href);row=child.ErpBoardFlow?.getSnapshot();}catch(_){}
    const key=route&&route.stage!=='resume'&&row?.id===route?.id?JSON.stringify([route.href,row]):'';
    if(shownKey===key)return;
    shownKey=key;
    rail.hidden=!key;
    if(!key){rail.replaceChildren();return;}
    const heading=document.createElement('strong');
    heading.textContent=(route.kind===assembly?(row.regular?'정기총회 업무':'임시총회 업무'):'이사회 업무')+' · '+row.title;
    const open=stage=>{if(childWindow===child)window.ErpWorkspaceShell?.navigate(url(row.id,stage,route.kind));};
    if(route.kind==='BOARD'){renderBoardTabs(rail,heading,route,row,open);return;}
    const stages=list(route.kind,row.regular!==false);
    const current=stages.find(phase=>phase[0]===route.stage)||outcomePhase;
    const steps=document.createElement('div');steps.className='erp-board-stages';
    const currentLabel=document.createElement('span');
    currentLabel.textContent=current[1];currentLabel.setAttribute('aria-current','step');
    steps.append(currentLabel);
    const next=nextStage(row,route.kind),nextLabel=(stages.find(phase=>phase[0]===next)||(next==='outcome'?outcomePhase:null))?.[1];
    if(next!==route.stage&&nextLabel&&canVisit(next,row)&&!(next==='approval'&&route.stage==='materials')){
      const advance=document.createElement('button');advance.type='button';advance.textContent=nextLabel+' 열기';
      advance.addEventListener('click',()=>open(next));steps.append(advance);
    }
    const more=document.createElement('details');const summary=document.createElement('summary');summary.textContent='전체 단계';
    more.append(summary);const links=document.createElement('div');links.className='erp-board-stages';
    const done={prepare:basics(row),agenda:row.agendaReady,audit:!!row.auditSentOn,materials:row.materialsReady,approval:approved(row.approvalStatus),
      notice:posted(row),meeting:!!row.minuteId,minutes:!!row.minuteId,signature:signed(row),publish:row.published};
    stages.forEach(([id,label],i)=>{
      const button=document.createElement('button');button.type='button';
      const same=id===route.stage;
      if(id==='minutes'&&!row.minuteId)return; // The meeting result owns the first entry into the editor.
      if(same)button.setAttribute('aria-current','step');
      button.disabled=same||!canVisit(id,row);
      button.textContent=(done[id]?'✓ ':String(i+1)+'. ')+label;
      button.addEventListener('click',()=>open(id));
      links.append(button);
    });
    more.append(links);steps.append(more);
    rail.replaceChildren(heading,steps);
  }
  function sync(child){
    childWindow=child;
    update(child);
  }
  window.ErpBoardFlow={version:4,url,parse,read,adopt,getSnapshot,sync,update,approved,posted,signed,canRecord,canVisit,nextStage};
})();
