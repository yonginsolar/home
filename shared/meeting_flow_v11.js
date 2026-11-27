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
  const stageTabs=[
    ['prepare','기본정보'],['agenda','안건'],['materials','회의자료'],['approval','소집 공문 결재'],
    ['notice','소집 공고'],['meeting','회의 결과·의사록'],['signature','서명'],['publish','의사록 공개']
  ];
  const assemblyTabs=[...stageTabs.slice(0,2),['audit','감사보고서'],...stageTabs.slice(3,5),['materials','총회 자료집'],
    ...stageTabs.slice(5),['followups','의결 후 할 일']];
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
  async function read(client,coopId,route=parse(location.href),signal){
    if(!route||!uuid.test(coopId||''))throw Error('회의와 현재 조합을 확인해 주세요.');
    const lookup=client.rpc('meeting_guided_state',{p_package_id:route.id,p_kind:route.kind});
    const {data,error}=await (signal&&lookup.abortSignal?lookup.abortSignal(signal):lookup);
    if(error||data?.id!==route.id||data?.coopId!==coopId){
      const failure=Error('회의 진행 정보를 불러오지 못했어요.');failure.code=error?.code||(data?'42501':null);throw failure;
    }
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
  const gated=route=>['notice','meeting','signature','publish'].includes(route?.stage);
  function waitReason(route,row){
    if(!gated(route))return '';
    if(row.status==='CANCELLED')return route.stage==='meeting'?'':route.kind===assembly?'무산된 총회입니다.':'무산된 이사회입니다.';
    if(route.stage==='notice')return !approved(row.approvalStatus)?'소집 공문 결재가 끝나면 공고할 수 있어요.':!row.approvalId?'연결된 소집 공문이 없습니다.':'';
    if(route.stage==='meeting'&&!row.minuteId&&!canRecord(row))return !posted(row)?'소집 공고 후, 회의 날짜가 지나면 결과를 기록할 수 있어요.':!row.meetingDatePassed?'회의 날짜가 지나면 결과를 기록할 수 있어요.':'회의자료와 결과 기록 상태를 확인해 주세요.';
    if(route.stage==='signature'&&!row.minuteId)return '의사록을 저장하면 서명을 요청할 수 있어요.';
    if(route.stage==='publish'&&(!row.minuteId||(!row.published&&!signed(row))))return '의사록의 서명이 끝나면 공개할 수 있어요.';
    return '';
  }
  function nextStage(row,kind){
    if(row.status==='CANCELLED')return 'outcome';
    if(row.minuteId)return !signed(row)?'signature':!row.published||kind!==assembly?'publish':'followups';
    if(!basics(row)||(kind===assembly&&!row.noticeDate))return 'prepare';
    if(!row.agendaReady)return 'agenda';
    if(kind===assembly&&!row.materialsSaved&&!row.approvalId)return 'agenda';
    if(kind!==assembly&&!row.materialsReady&&!approved(row.approvalStatus))return 'materials';
    if(!posted(row))return approved(row.approvalStatus)?'notice':'approval';
    if(!row.materialsReady)return 'materials';
    return canRecord(row)?'meeting':kind==='BOARD'?'notice':'scenario';
  }
  const tabFor=stage=>stage==='scenario'?'notice':['outcome','minutes'].includes(stage)?'meeting':stage;
  function meetingHeading(heading){
    const top=document.createElement('div');top.className='erp-board-heading';
    const index=document.createElement('button');
    index.type='button';index.textContent='회의 바꾸기';
    index.addEventListener('click',()=>window.ErpWorkspaceShell?.navigate('/minutes/meeting_workspace.html?picker=1'));
    top.append(heading,index);
    return top;
  }
  function makeStageTabs(kind) {
    const nav=document.createElement('div');nav.className='erp-board-tabstrip';nav.setAttribute('role','group');
    const isAssembly=kind===assembly;
    nav.setAttribute('aria-label',isAssembly?'총회 단계':'이사회 단계');
    (isAssembly?assemblyTabs:stageTabs).forEach(([stage,label])=>{
      const tab=document.createElement('button');tab.type='button';
      tab.dataset.boardTab=stage;tab.dataset.stageLabel=label;
      tab.addEventListener('click',()=>open(stage));
      nav.append(tab);
    });
    nav.addEventListener('keydown',e=>{
      const buttons=[...nav.children].filter(tab=>!tab.hidden),at=buttons.indexOf(e.target);
      if(at<0||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      e.preventDefault();
      const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(at+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
      buttons[next].focus();
    });
    return nav;
  }
  function selectStageTab(nav,stage,regular) {
    const active=tabFor(stage);
    let number=0;
    for(const tab of nav.children){
      tab.hidden=tab.dataset.boardTab==='audit'&&!regular;
      if(!tab.hidden){
        const label=(++number)+'. '+tab.dataset.stageLabel;
        if(tab.textContent!==label)tab.textContent=label;
      }
      if(!tab.hidden&&tab.dataset.boardTab===active)tab.setAttribute('aria-current','step');
      else tab.removeAttribute('aria-current');
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
  // The outer workspace owns the chrome; a child owns only its authorized
  // task and fresh snapshot. A pending/failed child must not unmount the rail.
  let childWindow=null,expected=null,shown=null,recheckRoute='';
  const railNode=()=>document.getElementById('erpBoardFlowRail');
  const sameMeeting=(a,b)=>!!a&&!!b&&a.id===b.id&&a.kind===b.kind&&a.coopId===b.coopId;
  function clear(){
    if(!shown)return;
    shown=null;
    const rail=railNode();
    if(rail){rail.hidden=true;rail.replaceChildren();}
  }
  function begin(value,coopId){
    const route=parse(value);
    expected=route&&uuid.test(coopId||'')?{...route,coopId}:null;
    childWindow=null; // A late snapshot from the parked body cannot repaint this target.
    if(!sameMeeting(shown?.route,expected)){clear();return;}
    selectStageTab(shown.tabs,expected.stage,shown.regular);
  }
  function setRecheck(value=''){
    recheckRoute=value;
  }
  function open(stage){
    if(!sameMeeting(shown?.route,expected))return;
    if(expected.stage===stage){
      if(recheckRoute===expected.href)window.ErpWorkspaceShell?.recheckMeetingStage(expected.href);
      return;
    }
    window.ErpWorkspaceShell?.navigate(url(expected.id,stage,expected.kind));
  }
  function update(child){
    if(!child||child!==childWindow||!expected)return;
    const rail=railNode();
    if(!rail)return;
    let route,row;
    try{route=parse(child.location.href);row=child.ErpBoardFlow?.getSnapshot();}catch(_){return;}
    show(route,row);
  }
  function show(route,row){
    const rail=railNode();
    if(!rail||!expected||route?.href!==expected.href||route.stage==='resume'||row?.id!==expected.id||row?.coopId!==expected.coopId)return;
    if(!sameMeeting(shown?.route,expected)){
      const heading=document.createElement('strong');
      const tabs=makeStageTabs(route.kind);
      shown={route:expected,heading,tabs,key:null};
      rail.replaceChildren(meetingHeading(heading),tabs);
      rail.hidden=false;
    }
    const key=JSON.stringify([route.href,row]);
    if(shown.key===key)return;
    shown.route=expected;shown.key=key;shown.regular=row.regular===true;
    const title=(route.kind===assembly?(row.regular?'정기총회 업무':'임시총회 업무'):'이사회 업무')+' · '+row.title;
    if(shown.heading.textContent!==title)shown.heading.textContent=title;
    selectStageTab(shown.tabs,route.stage,shown.regular);
  }
  function sync(child,target,coopId){
    if(!child){begin(null);return;}
    const route=parse(target);
    if(expected?.href!==route?.href||expected?.coopId!==coopId)begin(target,coopId);
    childWindow=child;
    update(child);
  }
  // Version is the child/parent contract, not the filename revision.
  window.ErpBoardFlow={version:5,meetingPickerEntry:true,url,parse,read,adopt,getSnapshot,begin,sync,update,show,setRecheck,gated,waitReason,approved,posted,signed,canRecord,canVisit,nextStage};
})();
