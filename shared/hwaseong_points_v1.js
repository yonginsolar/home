(function (root) {
  'use strict';
  const doc=root.document;
  const num=value=>Number(value).toLocaleString('ko-KR');
  const point=value=>num(value)+'P';
  const states=Object.freeze({pending:'승인 대기',review:'재검토',rejected:'반려',approved:'승인 완료',expired:'소멸'});
  const errors=Object.freeze({
    POINTS_FORBIDDEN:'현재 조합과 포인트 권한을 확인해 주세요.',
    POINTS_NOT_OPEN:'포인트 운영 시작일이 아직 지정되지 않았어요.',
    POINTS_SEARCH_REQUIRED:'이름 두 글자 이상 또는 조합원번호를 입력해 주세요.',
    POINTS_SELECT_REQUIRED:'처리할 항목을 최대 300개까지 선택해 주세요.',
    POINTS_MEMBER_CHANGED:'조합원 상태가 바뀌었어요. 다시 조회해 주세요.',
    POINTS_REFERRAL_NOT_CONFIRMED:'같은 조합의 가입 승인과 추천인 연결을 확인해 주세요.',
    POINTS_ONE_REFERRER:'신규 가입 한 건에 추천인 한 명만 선택해 주세요.',
    POINTS_DATE_OUTSIDE_PROGRAM:'운영 시작일 이후, 오늘까지의 활동일을 입력해 주세요.',
    POINTS_PROOF_REQUIRED:'활동 증빙을 입력해 주세요. SNS 활동은 HTTPS 링크가 필요해요.',
    POINTS_COMPLETION_REFERENCE_REQUIRED:'같은 공사에 항상 쓰는 완료 문서번호를 입력해 주세요.',
    POINTS_COMPLETION_REQUIRED:'공사 완료 증빙을 확인해 주세요.',
    POINTS_ALREADY_CREDITED:'이미 적립된 활동이에요.',
    POINTS_ALREADY_REQUESTED:'이미 신청한 활동이에요. 내 신청을 확인해 주세요.',
    POINTS_REVIEW_FIRST:'이미 신청한 활동이 있어요. 신청 검토에서 처리해 주세요.',
    POINTS_APPLICATION_CHANGED:'신청 상태가 바뀌었어요. 다시 조회해 주세요.',
    POINTS_SETTLEMENT_CHANGED:'미지급 내역이 바뀌었어요. 실제 지급한 내역과 다시 대조해 주세요.',
    POINTS_RECORD_ACTUAL_PAYMENT:'지급 예정일 이후 실제 지급한 날짜를 입력해 주세요.',
    POINTS_AMOUNT_REQUIRED:'배점은 1~10,000,000 사이의 정수로 입력해 주세요.',
    POINTS_REASON_REQUIRED:'반려 이유를 입력해 주세요.',
    POINTS_BAD_HALF:'연도와 반기를 선택해 주세요.',
    POINTS_REQUEST_CHANGED:'이전 요청과 내용이 달라요. 내역을 먼저 확인해 주세요.'
  });
  const el=(tag,label,cls,attrs={})=>{
    const node=doc.createElement(tag);
    if(label!=null)node.textContent=label;
    if(cls)node.className=cls;
    for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);
    return node;
  };
  const button=(label,fn,cls='btn btn-outline-secondary btn-sm')=>{
    const b=el('button',label,cls,{type:'button'});
    b.addEventListener('click',fn);return b;
  };
  const group=(...items)=>{
    const row=el('div',null,'d-flex flex-wrap align-items-center gap-2 mb-3');row.append(...items);return row;
  };
  const field=(caption,control)=>{
    if(!control.hasAttribute('aria-label'))control.setAttribute('aria-label',caption);
    const label=el('label',null,'d-block mb-2');label.append(el('span',caption,'small fw-semibold d-block mb-1'),control);return label;
  };
  const input=(type,attrs={})=>el('input',null,'form-control form-control-sm',{type,...attrs});
  const select=items=>{
    const s=el('select',null,'form-select form-select-sm');
    for(const [value,label] of items)s.append(el('option',label,null,{value}));
    return s;
  };
  function summaryList(box,rows,display){
    box.replaceChildren();
    if(!rows?.length){box.append(el('p','표시할 내역이 없어요.','text-muted small mb-0'));return;}
    const list=el('ul',null,'list-group');
    for(const row of rows){const item=el('li',null,'list-group-item small');item.append(display(row));list.append(item);}
    box.append(list);
  }
  function checklist(box,rows,render){
    const chosen=new Set(), checks=[];
    box.replaceChildren();
    if(!rows.length){box.append(el('p','선택할 내역이 없어요.','text-muted small'));return chosen;}
    const list=el('div',null,'list-group mb-2');list.style.maxHeight='26rem';list.style.overflowY='auto';
    const all=button('모두 선택',()=>{
      if(chosen.size){chosen.clear();checks.forEach(c=>{c.checked=false;});}
      else checks.slice(0,300).forEach(c=>{c.checked=true;chosen.add(c.value);});
      update();
    });
    const count=el('span',null,'small text-muted');
    const update=()=>{all.textContent=chosen.size?'선택 해제':'모두 선택';count.textContent=num(chosen.size)+'개 선택'+(rows.length>300?' · 최대 300개씩':'');};
    for(const row of rows){
      const mark=el('input',null,'form-check-input m-0 flex-shrink-0',{type:'checkbox',value:row.id});
      mark.addEventListener('change',()=>{
        if(mark.checked && chosen.size<300)chosen.add(row.id);
        else{mark.checked=false;chosen.delete(row.id);}
        update();
      });
      checks.push(mark);
      const label=el('label',null,'list-group-item d-flex align-items-start gap-2 small');
      label.append(mark,render(row));list.append(label);
    }
    update();box.append(group(all,count),list);return chosen;
  }
  function proofView(text){
    const node=el('div',text,'small text-break');
    try{
      const url=new URL(text);
      if(url.protocol==='https:'&&!url.username&&!url.password)node.append(' ',el('a','증빙 열기',null,{href:url.href,target:'_blank',rel:'noopener noreferrer'}));
    }catch(_){}
    return node;
  }
  const person=row=>[row.name,row.number].filter(Boolean).join(' · ');
  function mount({panel,client,owner,mode,confirm}){
    const admin=mode==='admin', rpc=admin?'hwaseong_points_admin':'hwaseong_points_mine';
    let scope='',version=0,busy=false,active=false,meta=null,rates=new Map(),status=null,retry=null,pending=null;
    let stopReads=new AbortController(),visited='';
    const current=(v=version)=>!!scope&&active&&owner()===scope&&version===v;
    const check=()=>{if(!current())throw Error('STALE');};
    function leave(){
      if(scope && owner()!==scope)pending=null;
      ++version;active=false;scope='';busy=false;meta=null;visited='';status=null;retry=null;
      stopReads.abort();stopReads=new AbortController();panel.replaceChildren();
    }
    function statusText(text,tone='muted'){
      if(!status)return;
      status.className='small my-2 text-'+tone;status.textContent=text;
    }
    async function request(action,p_data={},p_request=null){
      check();const v=version;
      const query=client.rpc(rpc,{p_action:action,p_data,p_request});
      const response=await (!p_request&&typeof query?.abortSignal==='function'?query.abortSignal(stopReads.signal):query);
      if(!current(v))throw Error('STALE');
      if(response?.error)throw Object.assign(Error(response.error.message),{code:response.error.code});
      if(!response?.data||typeof response.data!=='object')throw Error('POINTS_UNCONFIRMED');
      return response.data;
    }
    const renderedError=e=>errors[e?.message]||(e?.message==='STALE'?'':'확인에 실패했어요. 다시 시도해 주세요.');
    async function readBox(task,show){
      const v=version;
      try{const data=await task();if(current(v))show(data);}
      catch(e){if(current(v))statusText(renderedError(e),'danger');}
    }
    async function write(action,data,message,after,question){
      if(busy||!current())return;
      const signature=JSON.stringify([action,data]), v=version;
      if(pending&&pending.owner===scope&&pending.signature!==signature){
        statusText('이전 요청의 결과를 먼저 확인해 주세요. 같은 내용으로 다시 눌러 주세요.','danger');return;
      }
      busy=true;
      try{
        if(question&&!(await confirm(question)))return;
        if(!current(v))return;
        if(!pending||pending.owner!==scope)pending={owner:scope,signature,key:crypto.randomUUID(),action,data,message,after,view:visited};
        retry.hidden=true;
        const attempt=pending;
        statusText('처리 중…');
        let result;
        try{result=await request(action,data,attempt.key);}
        catch(e){
          if(!current(v))return;
          if(errors[e?.message]||/^(22|23|42)[A-Z0-9]{3}$/.test(e?.code||'')){
            pending=null;statusText(renderedError(e),'danger');
          }else {
            statusText('처리 결과를 확인하지 못했어요. 이전 요청을 확인해 주세요.','danger');
            retry.hidden=false;
          }
          return;
        }
        pending=null;
        if(after)await after(result);
        if(current(v))statusText(typeof message==='function'?message(result):message,'success');
      } finally {if(current(v))busy=false;}
    }
    const label=code=>rates.get(code)?.label||'활동';
    function activityForm(){
      const code=select([...rates.values()].map(r=>[r.code,r.label]));
      const on=input('date',{min:meta.starts_on,max:meta.today});on.value=meta.today;
      const date=field('활동일',on);
      const evidence=el('textarea',null,'form-control form-control-sm',{rows:'2',maxlength:'600',placeholder:'활동을 확인할 수 있는 설명 또는 링크'});
      const applicant=input('text',{maxlength:'100',autocomplete:'off'});
      const ref=field('가입 승인된 조합원의 번호',applicant);
      const reference=input('text',{maxlength:'100',autocomplete:'off'}), solar=field('공사 완료 문서번호',reference);
      const rate=el('p',null,'small fw-semibold mb-2');
      const controls=el('div');controls.append(field('활동',code),rate,date,ref,solar,field('활동 증빙',evidence));
      const sync=()=>{
        const v=code.value;
        rate.textContent='배점 '+point(rates.get(v)?.points||0);
        ref.hidden=v!=='referral';date.hidden=v==='referral';solar.hidden=v!=='solar';
        evidence.placeholder=v==='sns'?'SNS 게시물의 HTTPS 링크':v==='solar'?'공사 완료를 확인할 수 있는 설명 또는 링크':'활동을 확인할 수 있는 설명 또는 링크';
      };
      code.addEventListener('change',sync);sync();
      return {controls,code,sync, data:()=>({code:code.value,...(code.value==='referral'?{applicant_number:applicant.value.trim()}:{on:on.value}),
        ...(code.value==='solar'?{reference:reference.value.trim()}:{}),evidence:evidence.value.trim()}),clear:()=>{evidence.value='';applicant.value='';reference.value='';}};
    }
    function historyLine(row,who=''){
      const block=el('div');
      block.append(el('div',[row.activity_on,who,label(row.code),'적립 '+point(row.points)].filter(Boolean).join(' · '),'fw-semibold'));
      if(row.kind)block.append(el('div',[row.effective_on,row.kind==='paid'?'지급':'소멸','−'+point(row.points)].join(' · '),'text-muted'));
      return block;
    }
    function memberUi(content){
      const stats=el('p',null,'fw-semibold'), application=el('div'), history=el('div'), apps=el('div');
      content.append(stats,application,el('h3','내 신청','h6 mt-4'),apps,el('h3','적립·지급·소멸 내역','h6 mt-4'),history);
      async function refresh(){
        await readBox(()=>request('mine'),d=>{
          stats.textContent='미지급 포인트 '+point(d.balance);
          application.hidden=!d.can_submit;
          summaryList(history,d.history,row=>historyLine(row));
          summaryList(apps,d.applications,row=>{
            const box=el('div');box.append(el('div',[row.activity_on,label(row.code),point(row.points),states[row.state]].join(' · '),'fw-semibold'));
            if(row.decision)box.append(el('p',row.decision,'mt-1 mb-2 text-break'));
            if(row.state==='rejected'&&d.can_submit){
              const details=el('details',null,'mt-2'), proof=el('textarea',null,'form-control form-control-sm mb-2',{maxlength:'600',rows:'2','aria-label':'보완 증빙'});
              details.append(el('summary','증빙 보완 후 재검토 요청'),proof,
                button('재검토 요청',()=>write('resubmit',{id:row.id,evidence:proof.value.trim()},'재검토를 요청했어요.',refresh)));
              box.append(details);
            }
            return box;
          });
        });
      }
      const form=activityForm();
      application.append(form.controls,button('포인트 신청',()=>{
        const d=form.data();if(!d.evidence)return statusText('활동 증빙을 입력해 주세요.','danger');
        void write('apply',d,'신청했어요. 승인되면 적립됩니다.',async()=>{form.clear();await refresh();});
      },'btn btn-primary btn-sm'));
      application.hidden=true;void refresh();
    }
    function creditUi(box){
      const form=activityForm(), search=input('search',{maxlength:'80',placeholder:'이름 또는 조합원번호','aria-label':'적립 대상 조합원 검색'});
      const result=el('div'), selectedBar=el('div',null,'mb-3'), recent=el('div'), members=new Map();
      let searchSequence=0;
      function selectedMembers(){
        selectedBar.replaceChildren();
        if(!members.size){selectedBar.append(el('span','선택한 조합원이 없어요.','text-muted small'));return;}
        selectedBar.append(el('div',num(members.size)+'명 선택','small fw-semibold mb-1'));
        const row=el('div',null,'d-flex flex-wrap gap-2');
        members.forEach((p,id)=>row.append(button(person(p)+' ×',()=>{members.delete(id);selectedMembers();})));
        selectedBar.append(row);
      }
      const find=()=>{
        const term=search.value.trim(), ticket=++searchSequence;
        result.replaceChildren();
        if(term.length<2)return statusText('이름 두 글자 이상 또는 조합원번호를 입력해 주세요.','danger');
        statusText('');
        void readBox(()=>request('members',{term}),d=>{
          if(ticket!==searchSequence||!result.isConnected)return;
          summaryList(result,d.rows,m=>button(person(m),()=>{if(members.size<300){members.set(m.id,m);selectedMembers();}},
            'btn btn-sm btn-outline-primary'));
        });
      };
      search.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();find();}});
      search.addEventListener('input',()=>{++searchSequence;result.replaceChildren();});
      box.append(el('h3','직접 적립','h6'),form.controls,group(search,button('조합원 검색',find)),result,selectedBar);
      selectedMembers();
      const readRecent=()=>readBox(()=>request('recent'),d=>{
        if(recent.isConnected)summaryList(recent,d.rows,row=>historyLine(row,person(row)));
      });
      box.append(button('선택한 조합원 적립',()=>{
        const d=form.data(), ids=[...members.keys()].sort();
        if(!ids.length)return statusText('적립할 조합원을 선택해 주세요.','danger');
        if(!d.evidence)return statusText('활동 증빙을 입력해 주세요.','danger');
        const solar=d.code==='solar';
        const caption=solar?'공사 완료 증빙을 확인했나요? ':'';
        void write('credit',{...d,ids,...(solar?{completed:true}:{})},r=>num(r.count)+'명에게 적립했어요.',
          ()=>{members.clear();selectedMembers();form.clear();result.replaceChildren();search.value='';},
          caption+num(ids.length)+'명에게 각각 '+point(rates.get(d.code)?.points||0)+'를 적립할까요?');
      },'btn btn-primary btn-sm'),el('hr'),
      group(el('h3','최근 적립 기록','h6 mb-0'),button('조회',readRecent)),recent);
    }
    function reviewUi(box){
      const state=select(['pending','review','rejected','approved'].map(s=>[s,states[s]]));
      const records=el('div'), reason=input('text',{maxlength:'400',placeholder:'반려 이유','aria-label':'반려 이유'});
      let chosen=new Set(), rows=[], ticket=0;
      function load(){
        const r=++ticket,s=state.value;
        chosen.clear();rows=[];records.replaceChildren();actions.hidden=true;
        return readBox(()=>request('queue',{state:s}),d=>{
          if(ticket!==r||!records.isConnected)return;
          rows=d.rows;
          const detail=row=>{
            const c=el('div');
            c.append(el('div',[person(row),row.activity_on,label(row.code),point(row.points)].join(' · '),'fw-semibold'),proofView(row.evidence));
            if(row.decision)c.append(el('p',row.decision,'text-muted mt-1 mb-0 text-break'));
            return c;
          };
          if(s==='pending'||s==='review')chosen=checklist(records,rows,detail);else summaryList(records,rows,detail);
          actions.hidden=!(rows.length&&(s==='pending'||s==='review'));
        });
      }
      const actions=group(reason,button('선택 승인',()=>{
        const ids=[...chosen].sort();
        if(!ids.length)return statusText('승인할 신청을 선택해 주세요.','danger');
        const solar=rows.some(r=>chosen.has(r.id)&&r.code==='solar');
        const q=(solar?'선택한 공사의 완료 증빙을 확인했나요? ':'')+num(ids.length)+'건을 승인하고 적립할까요?';
        void write('approve',{ids,...(solar?{completed:true}:{})},r=>num(r.count)+'건을 승인하고 적립했어요.',load,q);
      },'btn btn-primary btn-sm'),button('선택 반려',()=>{
        const ids=[...chosen].sort(), note=reason.value.trim();
        if(!ids.length||!note)return statusText('반려할 신청과 이유를 입력해 주세요.','danger');
        void write('reject',{ids,reason:note},r=>num(r.count)+'건을 반려했어요.',async()=>{reason.value='';await load();},num(ids.length)+'건을 반려할까요?');
      }));
      state.addEventListener('change',load);
      box.append(el('h3','신청 검토','h6'),group(field('상태',state)),records,actions);void load();
    }
    function settlementUi(box){
      const year=input('number',{min:meta.starts_on.slice(0,4),max:meta.today.slice(0,4),'aria-label':'정산 연도'});
      const month=select([['01','상반기'],['07','하반기']]), paidOn=input('date',{max:meta.today,'aria-label':'실제 지급일'});
      const result=el('div'), paid=el('div'), total=el('p',null,'fw-semibold'), buttonSet=el('div');paidOn.value=meta.today;
      year.value=meta.today.slice(0,4);
      if(meta.today.slice(5,7)<'07'){year.value=String(+year.value-1);month.value='07';}
      const half=()=>String(year.value).padStart(4,'0')+'-'+month.value+'-01';
      let quote=null, selected=new Set(), loadId=0;
      const clear=()=>{++loadId;quote=null;selected.clear();total.textContent='';buttonSet.hidden=true;result.replaceChildren();paid.replaceChildren();};
      const load=()=>{
        clear();const ticket=loadId,h=half();statusText('');
        return readBox(async()=>{
          const summary=await request('settlement',{half:h});
          if(ticket!==loadId)throw Error('STALE');
          return {summary,actual:await request('paid',{half:h})};
        },({summary,actual})=>{
          if(ticket!==loadId||!result.isConnected)return;
          quote=summary;paidOn.min=summary.due_on;
          total.textContent=summary.due?'미지급 '+num(summary.count)+'명 · '+num(summary.total)+'원':'지급 시작일 '+summary.due_on;
          selected=checklist(result,summary.rows,row=>el('span',person(row)+' · '+num(row.points)+'원','text-break'));
          buttonSet.hidden=!summary.due||!summary.count;
          summaryList(paid,actual.rows,row=>el('span',[row.effective_on,person(row),num(row.points)+'원','지급 완료'].join(' · ')));
        });
      };
      const record=button('실제 지급 기록',()=>{
        const ids=[...selected].sort();
        if(!quote||!ids.length||!paidOn.value)return statusText('실제로 지급한 조합원과 날짜를 선택해 주세요.','danger');
        const amount=quote.rows.filter(r=>selected.has(r.id)).reduce((sum,r)=>sum+Number(r.points),0);
        const data={half:quote.half,proof:quote.proof,ids,on:paidOn.value,confirmed:true};
        void write('pay',data,r=>num(r.count)+'명 · '+num(r.total)+'원 지급 완료를 기록했어요.',load,
          paidOn.value+'에 '+num(ids.length)+'명에게 '+num(amount)+'원을 실제로 지급했나요? 이 버튼은 송금하지 않고 기록만 남깁니다.');
      },'btn btn-primary btn-sm');
      buttonSet.append(group(field('실제 지급일',paidOn),record));buttonSet.hidden=true;
      for(const i of [year,month])i.addEventListener('input',clear);
      box.append(el('h3','반기 정산','h6'),el('p','1P=1원 · 상반기 7월 / 하반기 다음 해 1월 · 송금 후에만 지급을 기록하세요.','small text-muted'),
        group(field('정산 연도',year),field('반기',month),button('조회',load)),total,result,buttonSet,el('h4','지급 완료','h6 mt-4'),paid);
    }
    function ratesUi(box){
      const code=select([...rates.values()].map(r=>[r.code,r.label])), n=input('number',{min:'1',max:'10000000',step:'1'});
      const update=()=>{n.value=String(rates.get(code.value).points);};update();code.addEventListener('change',update);
      box.append(el('h3','활동 배점','h6'),el('p','배점 변경은 이전 신청·적립에 소급하지 않습니다.','small text-muted'),field('활동',code),field('새 배점',n),
        button('배점 저장',()=>{
          const key=code.value,value=n.value;
          void write('rate',{code:key,points:value},'배점을 저장했어요.',r=>{rates.get(key).points=r.points;update();},
            label(key)+' 배점을 '+point(value)+'로 변경할까요?');
        },'btn btn-primary btn-sm'));
    }
    function adminUi(content){
      const tabs=el('div',null,'d-flex flex-wrap gap-2 mb-3',{role:'group','aria-label':'포인트 업무'});
      const body=el('div'), choices=[['credit','직접 적립',creditUi],['review','신청 검토',reviewUi],['settlement','반기 정산',settlementUi],['rates','활동 배점',ratesUi]];
      const nodes=new Map();
      const open=(id,builder)=>{
        if(busy||visited===id)return;
        visited=id;statusText('');body.replaceChildren();
        nodes.forEach((node,key)=>node.setAttribute('aria-pressed',String(key===id)));builder(body);
      };
      for(const [id,title,builder] of choices){const b=button(title,()=>open(id,builder));nodes.set(id,b);tabs.append(b);}
      content.append(tabs,body);open('credit',creditUi);
    }
    async function enter(){
      const key=owner();
      if(!key){leave();return;}
      if(active&&scope===key)return;
      leave();
      if(pending?.owner!==key)pending=null;
      scope=key;active=true;
      const v=version;
      panel.replaceChildren();
      status=el('p',null,'small my-2',{role:'status','aria-live':'polite'});
      const content=el('div');
      retry=button('이전 요청 확인',()=>{
        if(!pending||pending.owner!==scope)return;
        const p=pending;
        void write(p.action,p.data,p.message,p.view===visited?p.after:null,'이전 요청을 같은 내용으로 확인할까요?');
      });
      retry.hidden=true;
      panel.append(status,retry,content);statusText('포인트를 불러오는 중…');
      try{
        meta=await request('overview');
        if(!current(v))return;
        rates=new Map(meta.rates.map(r=>[r.code,r]));
        statusText('');
        if(!meta.active){
          content.append(el('p',meta.starts_on?'포인트 운영 시작 예정일: '+meta.starts_on:'포인트 운영 시작일이 아직 확정되지 않았어요.','text-muted small'));
          return;
        }
        admin?adminUi(content):memberUi(content);
      }catch(e){
        if(current(v)){statusText(renderedError(e),'danger');content.append(button('다시 불러오기',()=>{leave();void enter();}));}
      }
    }
    return Object.freeze({enter,leave});
  }
  root.HwaseongActivityPoints=Object.freeze({version:'1.0.0',mount});
})(window);
