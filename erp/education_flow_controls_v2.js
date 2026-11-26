(function(root){
  'use strict';
  const create=(tag,text,classe)=>{
    const n=document.createElement(tag);
    if(text)n.textContent=text;if(classe)n.className=classe;return n;
  };
  const makeButton=(label,fn)=>{
    const el=create('button',label,'btn btn-sm btn-outline-primary');el.type='button';el.onclick=fn;return el;
  };
  const descriptions={
    application:{label:'사전 신청',timing:'교육 시작 전까지 신청할 수 있습니다.',list:'신청 명단',action:'applications'},
    feedback:{label:'익명 피드백',timing:'교육 종료 후 제출할 수 있습니다.',list:'받은 피드백',action:'feedback'}
  };
  function mount({containers,lists,rpc,origin,getRecord,inAttendance,stillCurrent,confirm}) {
    let record=null, tickets=null, fetching=null, epoch=0;
    const panels = Object.entries(containers).map(([purpose,section])=>{
      const d=descriptions[purpose], area=section.querySelector('[data-controls]'), status=create('p','','small mb-2');
      status.setAttribute('role','status');status.setAttribute('aria-live','polite');
      const code=create('div','','qr-code-box p-2'), preview=create('div','','mb-2'), actions=create('div','','d-flex flex-wrap gap-2 mb-2');
      code.style.width='10rem';code.style.height='10rem';preview.append(code);
      const list=create('div','','small');
      const panel={purpose,section,area,status,preview,code,actions,list,offset:0,listOpen:false,busy:false,listTick:0};
      const listSection=lists[purpose];
      listSection.querySelector('[data-controls]').append(list);
      area.append(status,preview,actions);
      section.addEventListener('toggle',()=>{
        if(section.open&&!section.hidden)void initialize(panel);
      });
      listSection.addEventListener('toggle',()=>{
        if(listSection.open&&!listSection.hidden){panel.offset=0;void readList(panel);}
      });
      panel.listSection=listSection;
      return panel;
    });
    const current=(r,v)=>!!r?.id&&r===record&&v===epoch&&stillCurrent(r);
    const ask=async(action,r,fields={})=>{
      const {data,error}=await rpc(action,r.id,fields);
      if(error||!data)throw new Error('교육 QR을 확인하지 못했습니다.');
      return data;
    };
    function link(purpose,token){
      const destination=new URL('/education_response_v1.html',origin);
      destination.search=new URLSearchParams({purpose,qr:token});
      return destination.href;
    }
    function printer(p,token){
      if(!record||typeof root.QRCode!=='function')return;
      const printPane=document.getElementById('educationFlowPrintSheet');
      const sheetTitle=create('h1',record.title||'교육');
      const sheetTopic=create('h2',descriptions[p.purpose].label+' QR');
      const qr=create('div','','education-flow-print-code');
      const schedule=record.schedule||'';
      printPane.replaceChildren(sheetTitle,sheetTopic,create('p',schedule),create('p',record.location||''),qr,create('p',descriptions[p.purpose].timing));
      new root.QRCode(qr,{text:link(p.purpose,token),width:420,height:420});
      document.body.classList.add('print-education-flow');
      root.requestAnimationFrame(()=>root.print());
    }
    root.addEventListener('afterprint',()=>{
      document.body.classList.remove('print-education-flow');
      document.getElementById('educationFlowPrintSheet')?.replaceChildren();
    });
    function paint(p){
      p.actions.replaceChildren();p.code.replaceChildren();
      const token=tickets?.[p.purpose], d=descriptions[p.purpose];
      p.preview.hidden=!token;
      if(token){
        const url=link(p.purpose,token);
        if(typeof root.QRCode==='function')new root.QRCode(p.code,{text:url,width:128,height:128});
        const open=create('a','신청 화면 열기','btn btn-sm btn-outline-primary');
        open.textContent=d.label+' 화면 열기';open.href=url;open.target='_blank';open.rel='noopener noreferrer';
        p.actions.append(open,
          makeButton('링크 복사',async()=>{
            try{await navigator.clipboard.writeText(url);p.status.textContent='링크를 복사했습니다.';}
            catch(_){p.status.textContent='링크를 복사하지 못했습니다. 화면 열기에서 주소를 복사할 수 있습니다.';}
          }),
          makeButton('QR 인쇄',()=>printer(p,token)),
          makeButton(d.label+' QR 중지',()=>void change(p,'close')));
      }else p.actions.append(makeButton(d.label+' QR 만들기',()=>void change(p,'issue')));
      for(const button of p.actions.querySelectorAll('button'))button.disabled=p.busy;
    }
    async function initialize(p){
      const r=record,v=epoch;
      if(!current(r,v))return;
      if(!tickets){
        p.status.textContent='QR 설정을 확인하는 중입니다.';
        if(!fetching)fetching=ask('codes',r);
        const call=fetching;
        try{
          const data=await call;
          if(!current(r,v))return;tickets=data.codes||{};
        }catch(_){
          if(current(r,v)){
            p.status.textContent='QR 설정을 확인하지 못했습니다.';
            p.actions.replaceChildren(makeButton('다시 확인',()=>void initialize(p)));
          }
          return;
        }finally{if(fetching===call)fetching=null;}
      }
      p.status.textContent=descriptions[p.purpose].timing;paint(p);
    }
    async function change(p,action){
      const r=record,v=epoch;
      if(p.busy||!current(r,v))return;
      p.busy=true;
      for(const button of p.actions.querySelectorAll('button'))button.disabled=true;
      try{
        if(action==='close'&&!(await confirm('이 QR을 중지할까요? 이미 받은 신청이나 피드백은 그대로 남습니다.')))return;
        if(!current(r,v))return;
        const data=await ask(action,r,{purpose:p.purpose});
        if(!current(r,v))return;
        if(action==='issue'&&data.token)tickets[p.purpose]=data.token;
        else if(action==='close'&&data.closed)delete tickets[p.purpose];
        else throw new Error();
        p.status.textContent=action==='issue'?'QR을 만들었습니다.':'기존 QR을 중지했습니다.';
      }catch(_){
        if(current(r,v))p.status.textContent='QR 상태를 확인하지 못했습니다. 다시 시도해 주세요.';
      }finally{
        if(current(r,v)){p.busy=false;paint(p);}
      }
    }
    async function readList(p){
      const r=record,v=epoch,seq=++p.listTick;
      if(!current(r,v))return;
      p.list.textContent='목록을 불러오는 중입니다.';
      try{
        const data=await ask(descriptions[p.purpose].action,r,{offset:p.offset});
        if(!current(r,v)||seq!==p.listTick)return;
        const caption=create('p',`${descriptions[p.purpose].list} · ${data.total}건`,'fw-bold mb-2');
        const list=create('ul','','ps-3');
        for(const value of data.rows.slice(0,50)){
          const row=p.purpose==='application'
            ?[value.name,value.is_guest?'비조합원':'조합원',value.phone_display].filter(Boolean).join(' · ')
            :`${value.rating}점${value.comment?' · '+value.comment:''}`;
          list.append(create('li',row,'text-break mb-1'));
        }
        p.list.replaceChildren(caption,list);
        if(p.offset>0)p.list.append(makeButton('이전 50건',()=>{p.offset=Math.max(0,p.offset-50);void readList(p);}));
        if(data.rows.length>50)p.list.append(makeButton('다음 50건',()=>{p.offset+=50;void readList(p);}));
      }catch(_){
        if(current(r,v)&&seq===p.listTick)p.list.replaceChildren(create('p','목록을 확인하지 못했습니다.'),makeButton('다시 확인',()=>void readList(p)));
      }
    }
    function reset(){
      const next=getRecord();
      record=next;epoch++;fetching=null;tickets=null;
      for(const p of panels){
        p.section.hidden=!next||inAttendance();p.section.open=false;
        p.listSection.hidden=!next||!inAttendance();p.listSection.open=false;
        p.list.replaceChildren();p.code.replaceChildren();p.actions.replaceChildren();
        p.preview.hidden=true;p.status.textContent='';p.offset=0;p.busy=false;p.listTick++;
      }
    }
    reset();
    return Object.freeze({reset});
  }
  root.EducationFlowControls=Object.freeze({mount});
})(window);
