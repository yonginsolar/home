/* Board-only orchestration. Business forms and writes belong to their original tasks. */
(() => {
  'use strict';
  const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  const phases=[
   ['prepare','회의 준비','/minutes/meeting_workspace.html',''],
   ['agenda','안건 작성','/minutes/meeting_workspace.html',''],
   ['approval','소집 공문 결재','/erp/approval.html',''],
   ['notice','공지','/minutes/admin_minutes.html','notices'],
   ['meeting','회의 진행','/minutes/admin_minutes.html','minutes'],
   ['minutes','의사록','/minutes/admin_minutes.html','minutes'],
   ['signature','서명','/minutes/admin_minutes.html','minutes'],
   ['publish','공개','/minutes/admin_minutes.html','minutes'],
  ];
  const url=(id,stage)=>{
    if(!uuid.test(id))return '';
    const phase=phases.find(p=>p[0]===stage);
    if(!phase)return '';
    return phase[2]+'?boardFlow='+encodeURIComponent(id)+'&stage='+stage+(phase[3]?'&scope='+phase[3]:'');
  };
  function parse(value){
    try{
      const target=new URL(value,location.href), id=target.searchParams.get('boardFlow'),stage=target.searchParams.get('stage');
      const expected=url(id,stage);
      if(target.origin!==location.origin||target.username||target.password||!expected)return null;
      const canonical=new URL(expected,location.origin);
      if(target.pathname.replace(/\.html$/,'')!==canonical.pathname.replace(/\.html$/,'')
        ||[...target.searchParams.keys()].length!==[...canonical.searchParams.keys()].length
        ||[...canonical.searchParams].some(([k,v])=>target.searchParams.getAll(k).length!==1||target.searchParams.get(k)!==v))return null;
      return {id,stage,href:expected};
    }catch(_){return null;}
  }
  const approved=s=>['완료','실물결재완료'].includes(s);
  let snapshot=null;
  async function read(client,coopId,route=parse(location.href)){
    if(!route||!uuid.test(coopId||''))throw Error('이사회와 현재 조합을 확인해 주세요.');
    const {data,error}=await client.rpc('board_meeting_flow_state',{p_package_id:route.id});
    if(error||data?.id!==route.id||data?.coopId!==coopId)throw Error('이사회 진행 정보를 불러오지 못했어요.');
    return data;
  }
  function adopt(context){
    snapshot=context;
    try{window.parent!==window&&window.parent.ErpBoardFlow?.update(window);}catch(_){}
  }
  function getSnapshot(){return snapshot;}
  function states(row){
    return [!!(row.date&&row.start&&row.location),row.agendaReady===true,approved(row.approvalStatus),row.noticePublished===true,
      !!row.minuteId,!!row.minuteId,row.minuteStatus==='CLOSED'&&row.required>0&&row.signed===row.required,row.published===true];
  }
  let childWindow=null,shownKey='';
  function update(child){
    if(child!==childWindow)return;
    const rail=document.getElementById('erpBoardFlowRail');
    if(!rail)return;
    let route,row;
    try{route=parse(child.location.href);row=child.ErpBoardFlow?.getSnapshot();}catch(_){}
    const key=route&&row?.id===route?.id?JSON.stringify([route.href,row]):'';
    if(shownKey===key)return;
    shownKey=key;
    rail.hidden=!key;
    if(!key){rail.replaceChildren();return;}
    const heading=document.createElement('strong');
    heading.textContent='이사회 진행 · '+row.title;
    const steps=document.createElement('div');steps.className='erp-board-stages';
    const done=states(row);
    phases.forEach(([id,label],i)=>{
      const button=document.createElement('button');button.type='button';
      const same=id===route.stage;
      if(same){button.setAttribute('aria-current','step');button.setAttribute('aria-label',label+' 현재 단계');}
      button.textContent=(done[i]?'✓ ':String(i+1)+'. ')+label;
      button.addEventListener('click',()=>{
        if(!same&&childWindow===child)window.ErpWorkspaceShell?.navigate(url(row.id,id));
      });
      steps.append(button);
    });
    rail.replaceChildren(heading,steps);
  }
  function sync(child){
    childWindow=child;
    update(child);
  }
  window.ErpBoardFlow={url,parse,read,adopt,getSnapshot,sync,update,approved,states};
})();
