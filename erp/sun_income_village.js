/* Sun village operations v1.0.1 — actual server persistence, not demo data. */
(() => {
  'use strict';
  const VERSION = '1.0.1';
  const F = (key, label, type = 'text', options = {}) => ({key, label, type, ...options});
  const TYPES = {
    member: {label:'👥 구성원', title:'성명 / 단체명', date:'가입·등록일', amount:'출자금 기록액', help:'조합원과 주민을 구분합니다. 주민등록번호·계좌번호는 이 화면에서 받지 않습니다. 출자금은 등록 정보이며 장부에 자동 반영되지 않습니다.', fields:[F('phone','휴대전화번호','tel',{max:30}),F('member_type','구성원 구분','select',{items:['조합원','주민','임원']}),F('status','가입 상태','select',{items:['가입 대기','정조합원','탈퇴']}),F('position','직책','text',{max:80}),F('note','참고사항','textarea',{max:2000})]},
    cash: {label:'📒 수입·지출', title:'거래 내용', date:'거래일', amount:'금액', help:'실제 입출금을 한 건씩 기록하는 간편 출납장입니다. 복식부기 결산·세무 신고·통장 자동 대조는 아직 연동하지 않습니다. 출자금·대출 입금은 매출과 구분해 분류해 주세요.', fields:[F('direction','수입 / 지출','select',{items:['수입','지출']}),F('category','분류','select',{items:['전력판매','출자금','운영비','세금','대출','적립','수수료','기타']}),F('account','통장 별칭','text',{required:true,max:100}),F('counterparty','거래 상대','text',{max:120}),F('note','증빙 확인·참고사항','textarea',{max:2000})]},
    approval: {label:'✅ 결재', title:'결재 제목', date:'기안일', amount:'관련 금액', help:'초안 저장 → 결재권자 선택 → 상신 순서입니다. 지정된 결재권자만 승인·반려할 수 있습니다. 승인 후 원문은 잠기며 회계 전표·송금은 자동으로 만들지 않습니다.', fields:[F('approver_id','결재권자','approver'),F('body','결재 내용','textarea',{required:true,max:20000})]},
    meeting: {label:'📝 회의록', title:'회의 제목', date:'회의일', help:'이사회·총회 내용과 참석자를 저장합니다. 이 버전은 회의록 작성·보관용이며 전자서명 완료 문서를 만들지 않습니다. 소집·정족수 요건은 각 마을 정관에 따라 별도로 확인해 주세요.', fields:[F('meeting_type','회의 구분','select',{items:['이사회','총회','기타']}),F('notice_date','공고일','date',{required:true}),F('start_time','시작 시간','time',{required:true}),F('end_time','종료 시간','time',{required:true}),F('place','장소','text',{required:true,max:200}),F('attendees','참석자 / 배석자','textarea',{max:2000}),F('body','안건·의결 및 회의록 본문','textarea',{required:true,max:20000})]},
    regulation: {label:'📚 정관·규정', title:'문서 제목', date:'시행일', help:'시행일, 개정 번호, 의결 근거와 본문을 기록합니다. 수정 전 내용은 변경 이력에 남습니다. 새 개정본은 신규 등록하고 이전 문서는 보관 처리하면 함께 보존됩니다.', fields:[F('document_type','문서 구분','select',{items:['정관','규약','규정']}),F('revision','개정 번호 / 버전','text',{required:true,max:80}),F('basis','의결 근거','text',{max:500}),F('body','문서 본문','textarea',{required:true,max:20000})]},
    generation: {label:'⚡ 발전 실적', title:'발전소 이름', date:'자료 기준월', month:true, amount:'전력판매 정산액', help:'발전소별 월간 발전량과 정산액을 기록합니다. 같은 발전소·같은 월의 중복 등록은 차단됩니다. 정산액은 실제 입금액과 다를 수 있어 수입·지출에 자동으로 더하지 않습니다.', fields:[F('kwh','발전량 (kWh)','number',{step:0.01,required:true}),F('settlement','정산 확인','select',{items:['확인 중','확인 완료']}),F('outage','고장·가동중단','textarea',{max:2000}),F('note','점검·참고사항','textarea',{max:2000})]},
    fund: {label:'🌱 수익금 계획', title:'계획 이름', date:'계획 기준일', amount:'계획 금액', help:'운영비·세금·대출·법정적립금·시설 수선·교체 임의적립금 등을 구분합니다. 현금 사용계획이며 결산상 잉여금이나 배당가능액을 자동 산정하지 않습니다. 총회 등 의결 근거를 확인해 입력해 주세요.', fields:[F('category','활용 구분','select',{items:['운영비','세금','대출 상환','법정적립금','시설 수선·교체 임의적립금','마을공동사업','배당 계획','이월']}),F('actual','실제 집행·적립액','number',{step:1,required:true}),F('basis','의결 근거 / 계획 검토 상태','text',{required:true,max:500}),F('note','참고사항','textarea',{max:2000})]},
    contract: {label:'🤝 운영 계약', title:'계약 이름 / 번호', date:'계약 시작일', admin:true, help:'운영협동조합이 받는 수수료 계약을 관리합니다. 마을의 발전수익과 합치지 않습니다. 실제 계약 금액을 입력하며, 변경 전 조건은 변경 이력에 보존됩니다. 계약 기간이 바뀌면 새 계약으로 등록해 주세요.', fields:[F('end_date','계약 종료일','date',{required:true}),F('setup_fee','초기 설정비 (공급가액)','number',{step:1,required:true}),F('monthly_fee','월 이용료 (공급가액)','number',{step:1,required:true}),F('message_terms','문자·알림톡 실비 조건','textarea',{required:true,max:500}),F('note','담당자·계약 참고사항','textarea',{max:2000})]},
    bill: {label:'🧾 수수료 청구', title:'계약 이름 / 번호', date:'청구 기준월', month:true, amount:'이용료 등 공급가액', admin:true, help:'공급가액·메시지 실비·부가세·입금액을 따로 기록합니다. 같은 계약 이름과 기준월은 한 건만 등록할 수 있습니다. 청구서 전송·세금계산서 발행·양쪽 회계 반영은 자동 처리하지 않습니다.', fields:[F('message_cost','메시지 실비','number',{step:1,required:true}),F('vat','부가세','number',{step:1,required:true}),F('paid','입금 확인액','number',{step:1,required:true}),F('due_date','납부기한','date',{required:true}),F('invoice_state','세금계산서','select',{items:['미발행','발행 완료','해당 없음']}),F('note','입금일·참고사항','textarea',{max:2000})]}
  };
  // Keep form definitions simple and independent of the rendering environment.
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = v => Number(v || 0).toLocaleString('ko-KR')+'원';
  const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
  const STATE = {active:'사용 중',archived:'보관',draft:'초안',pending:'결재 대기',approved:'승인',rejected:'반려'};
  const csvCell = value => '"'+String(value ?? '').replace(/^[\s]*([=+@-])/,"'$1").replace(/"/g,'""')+'"';
  function recordPayload(kind, values) {
    const spec=TYPES[kind];
    if (!spec) throw new Error('INVALID_KIND');
    const data={};
    for (const f of spec.fields) data[f.key]=f.type==='number'?Number(values[f.key]):String(values[f.key]??'').trim();
    return {kind,title:String(values.title||'').trim(),record_date:spec.month?values.record_date+'-01':values.record_date,amount:spec.amount?Number(values.amount):0,data};
  }
  if (typeof module!=='undefined' && module.exports) module.exports={TYPES,recordPayload,csvCell};
  if (typeof document==='undefined') return;
  const $=id=>document.getElementById(id);
  const s={client:null,context:null,op:null,village:'',villages:[],kind:'dashboard',rows:[],staff:null,page:0,query:'',archived:false,readSeq:0,busy:false,editor:null,dirty:false,request:null,uncertain:false};
  const ERRORS={LOGIN_REQUIRED:'로그인이 필요합니다.',ACCESS_DENIED:'이 마을을 처리할 권한이 없습니다. 담당자 배정을 확인해 주세요.',ADMIN_REQUIRED:'전체 관리자만 사용할 수 있습니다.',VERSION_CONFLICT:'다른 곳에서 먼저 수정한 자료입니다. 입력한 내용을 복사해 보관한 뒤 닫고 새로고침하여 최신 내용에 반영해 주세요.',REQUEST_REUSED:'저장 요청 정보가 달라졌습니다. 목록에서 저장 여부를 먼저 확인해 주세요.',VILLAGE_REQUIRED:'먼저 마을을 선택해 주세요.',VILLAGE_INACTIVE:'운영이 중지된 마을은 자료를 변경할 수 없습니다.',LAST_ADMIN:'마지막 전체 관리자는 해제할 수 없습니다. 다른 전체 관리자를 먼저 등록해 주세요.',VERIFIED_ACCOUNT_NOT_FOUND:'이메일 인증을 완료한 기존 계정을 찾지 못했습니다. 가입한 이메일을 확인해 주세요.',VALID_APPROVER_REQUIRED:'본인 외에 이 마을에 배정된 결재권자를 선택해 주세요.',RECORD_LOCKED:'상신·승인되었거나 보관된 자료는 이 방법으로 수정할 수 없습니다.',NOT_ASSIGNED_APPROVER:'이 문서에 지정된 결재권자만 처리할 수 있습니다.',INVALID_MEETING_DATES:'공고일은 회의일 이후일 수 없고, 종료 시간은 시작 시간보다 앞설 수 없습니다.',INVALID_CONTRACT_DATES:'계약 종료일은 시작일 이후여야 합니다.',OVERPAYMENT:'입금액이 청구 합계보다 많습니다.',APPROVAL_AUTHORITY_CONFIRMATION_REQUIRED:'마을의 정관·규정 또는 위임에 따른 결재권을 확인해 주세요.',AMOUNT_REQUIRED:'거래 금액은 0원보다 커야 합니다.'};
  function friendly(error) {
    const msg=String(error?.message||error||'');
    const key=Object.keys(ERRORS).find(k=>msg.includes(k));
    if(key) return ERRORS[key];
    if(msg.includes('ACCOUNT_EMAIL_MISMATCH'))return '선택한 담당자와 입력한 이메일의 계정이 다릅니다. 기존 담당자의 가입 이메일을 확인해 주세요.';
    if(error?.code==='23505') return '이미 등록된 코드 또는 같은 월의 자료가 있습니다. 목록에서 기존 자료를 찾아 수정해 주세요.';
    if(error?.code==='23503') return '등록되지 않았거나 다른 운영협동조합에 속한 대상입니다.';
    if(error?.code==='42501') return '접근 권한이 없습니다. 계정과 담당 마을을 확인해 주세요.';
    if(/INVALID_|MISSING_|UNKNOWN_FIELD|22P02|23514|23502/.test(msg+' '+error?.code)) return '입력 형식이나 필수 항목을 확인해 주세요. 금액은 0 이상, 원 단위는 정수로 입력해 주세요.';
    return '요청을 마치지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요. 계속되면 관리자에게 문의해 주세요.';
  }
  function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
  async function rpc(name,args={}) {
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),20000);
    try {const {data,error}=await s.client.rpc(name,args).abortSignal(controller.signal);if(error)throw error;return data;}finally{clearTimeout(timer);}
  }
  const read=(kind=s.kind,village=s.village,page=s.page)=>rpc('sv_read',{p_operator_id:s.op.id,p_village_id:village||null,p_kind:kind,p_query:s.query,p_page:page,p_archived:s.archived});
  const isAdmin=()=>s.op?.role==='admin';
  const selectedVillage=()=>s.villages.find(v=>v.id===s.village);
  const canWrite=()=>selectedVillage()?.active && selectedVillage()?.can_write;
  const button=(action,label,extra='')=>`<button type="button" data-action="${action}" ${extra}>${label}</button>`;
  function applyTheme(){const value=$('theme').value;document.documentElement.dataset.theme=value==='auto'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):value;try{localStorage.setItem('coop-color-theme',value);}catch(_){}}
  try{$('theme').value=localStorage.getItem('coop-color-theme')||'auto';}catch(_){}
  if(!$('theme').value)$('theme').value='auto';applyTheme();$('theme').addEventListener('change',applyTheme);matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyTheme);
  function nav(){
    const items=[['dashboard','🏡 운영 현황'],...Object.entries(TYPES).filter(([,v])=>!v.admin||isAdmin()).map(([k,v])=>[k,v.label]),...(isAdmin()?[['settings','⚙️ 마을·담당자'],['audit','🕒 변경 이력']]:[]),['guide','📖 사용 안내']];
    $('nav').innerHTML=items.map(([k,v])=>`<button type="button" data-nav="${k}" class="${s.kind===k?'active':''}" ${s.kind===k?'aria-current="page"':''}>${v}</button>`).join('');
  }
  async function boot(){
    if(s.busy)return;s.busy=true;message('로그인과 사용 권한을 확인하고 있습니다…');
    try{
      if(!window.supabase)throw new Error('LIBRARY_UNAVAILABLE');
      s.client ||= window.supabase.createClient('https://ifdqlwxgqgsvnawmhlfc.supabase.co','sb_publishable_lkVhLJDe8WmOPzsWOMkKdg_pjVwVS-h',{global:{headers:{'x-erp-host':window.CoopRouteGuard?.getErpRuntimeHost(location)||location.hostname}}});
      // Session presence is only a UI hint; sv_context and every database request enforce authorization.
      const session=await s.client.auth.getSession();
      if(!session.data?.session){$('workspace').hidden=true;showLogin();message('');return;}
      s.context=await rpc('sv_context');
      $('operator').innerHTML=s.context.operators.map(o=>`<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('');
      s.op=s.context.operators.find(o=>o.id===s.op?.id)||s.context.operators[0]||null;
      if(s.op){$('operator').value=s.op.id;await openOperator();}
      else{showWelcome();message('');}
      if(!s.authSubscribed){s.authSubscribed=true;s.client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){s.readSeq++;s.rows=[];$('content').replaceChildren();$('workspace').hidden=true;$('editor').close();$('detail').close();s.dirty=false;message('로그아웃되었습니다. ERP에 다시 로그인해 주세요.',true);}});}
    }catch(e){message(friendly(e),true);$('workspace').hidden=true;$('welcome').hidden=false;if(String(e?.message||'').includes('LOGIN_REQUIRED'))showLogin();else $('welcome').innerHTML='<h1>연결을 확인해 주세요</h1><p>잠시 후 다시 확인하거나 기존 ERP 로그인 상태를 확인해 주세요.</p><p><a href="index.html">ERP 로그인</a></p>'+button('retry','다시 확인');}finally{s.busy=false;}
  }
  function showLogin(){
    s.loginOpenedAt=Date.now();$('welcome').hidden=false;
    $('welcome').innerHTML='<h1>이메일로 로그인</h1><p>관리자에게 등록한 개인 계정으로 로그인합니다. 기존 ERP에 로그인되어 있다면 같은 계정을 사용할 수 있습니다.</p><form id="loginEmailForm" class="form-grid">'+field(F('login_email','계정 이메일','email',{required:true,max:254}))+'<label hidden>추가 입력<input name="contact_check" tabindex="-1" autocomplete="off"></label><div class="field full"><button type="submit" class="primary">이메일 인증코드 받기</button></div></form><form id="loginCodeForm" class="form-grid" hidden>'+field(F('login_code','메일로 받은 인증코드','password',{required:true,max:12}))+'<div class="field full"><button type="submit" class="primary">코드 확인하고 로그인</button></div></form><p class="hint">신규 계정은 자동으로 만들지 않습니다. 아직 계정이 없다면 운영협동조합 관리자에게 계정 준비를 요청해 주세요. 등록되지 않은 사람은 로그인하더라도 마을 자료를 볼 수 없습니다.</p><p><a href="index.html">기존 ERP에서 로그인하기</a></p>';
  }
  async function emailLogin(event){
    event.preventDefault();if(s.busy)return;
    const form=event.target,values=Object.fromEntries(new FormData(form));
    if(form.id==='loginEmailForm'){
      let until=0;try{until=Number(sessionStorage.getItem('sv-login-cooldown')||0);}catch(_){}
      if(values.contact_check||Date.now()-s.loginOpenedAt<2000||Date.now()<until){message('잠시 기다린 뒤 다시 요청해 주세요. 인증 메일은 1분 간격으로 요청할 수 있습니다.',true);return;}
    }
    s.busy=true;form.querySelector('button').disabled=true;
    try{
      if(form.id==='loginEmailForm'){
        const email=values.login_email.trim().toLowerCase();s.pendingEmail=email;
        try{sessionStorage.setItem('sv-login-cooldown',String(Date.now()+60000));}catch(_){}
        // Existing verified accounts only; no signup, role changes, or automatic invitations.
        await s.client.auth.signInWithOtp({email,options:{shouldCreateUser:false}});
        $('loginCodeForm').hidden=false;message('로그인 가능한 계정이면 인증 메일이 발송됩니다. 메일이 오지 않으면 관리자에게 계정 등록을 확인해 주세요.');
      }else{
        if(!s.pendingEmail)throw new Error('OTP_REQUIRED');
        const {error}=await s.client.auth.verifyOtp({email:s.pendingEmail,token:values.login_code.trim(),type:'email'});if(error)throw error;
        $('welcome').replaceChildren();s.pendingEmail='';s.busy=false;await boot();
      }
    }catch(_){message('인증을 완료하지 못했습니다. 이메일과 현재 인증코드를 확인한 뒤 다시 시도해 주세요.',true);}finally{s.busy=false;form.querySelector('button')?.removeAttribute('disabled');}
  }
  function showWelcome(){
    $('workspace').hidden=true;$('welcome').hidden=false;
    $('welcome').innerHTML=`<h1>마을 운영을 시작해 볼까요?</h1><p>이곳은 실제로 자료를 저장하는 운영용 화면입니다. 데모의 가상 마을이나 기존 조합의 명부·장부는 자동으로 복사하지 않습니다.</p>${s.context.setup_coops.length?`<label class="field"><span>시작할 운영협동조합</span><select id="setupCoop">${s.context.setup_coops.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label><div class="toolbar">${button('setup','운영 공간 만들기','class="primary"')}</div>`:'<p>아직 배정된 운영 공간이 없습니다. 전체 관리자에게 이 계정의 이메일을 알려주고 담당 마을 배정을 요청해 주세요.</p>'}<a href="sun_income_village_demo.html">가상 자료로 데모 먼저 보기</a>`;
  }
  async function openOperator(){
    s.readSeq++;s.rows=[];s.villages=[];s.village='';s.page=0;s.query='';$('content').replaceChildren();
    $('welcome').hidden=true;$('workspace').hidden=false;await refreshVillages();await load();
  }
  async function refreshVillages(){
    const op=s.op.id;const data=await read('dashboard','',0);if(s.op.id!==op)return;
    s.villages=data;$('village').innerHTML='<option value="">전체 운영 현황</option>'+data.map(v=>`<option value="${esc(v.id)}">${esc(v.name)}${v.active?'':' (운영 중지)'}</option>`).join('');
    if(!data.some(v=>v.id===s.village))s.village='';$('village').value=s.village;
    $('scopeLabel').textContent=s.village?selectedVillage().name+' 자료만 표시 중':'접근 가능한 마을의 전체 운영 현황';
  }
  function dashboard(){
    const villages=s.village?s.villages.filter(v=>v.id===s.village):s.villages;
    const sum=k=>villages.reduce((a,v)=>a+Number(v[k]||0),0);
    return `<h1>운영 현황</h1><p class="muted">전체 흐름을 살펴보고, 한 마을씩 선택해 업무를 처리하세요.</p><div class="cards"><div class="panel stat"><span>관리 마을</span><strong>${villages.length}곳</strong></div><div class="panel stat"><span>정조합원 등록</span><strong>${sum('members')}명</strong></div><div class="panel stat"><span>결재 대기</span><strong>${sum('pending')}건</strong></div></div><p class="hint">아래 금액은 출납장에 기록된 누적 입출금입니다. 통장 잔액·매출·결산상 이익과 다릅니다.</p>${villages.length?`<div class="table-wrap"><table><thead><tr><th>마을</th><th>정조합원</th><th>누적 수입</th><th>누적 지출</th><th>결재 대기</th><th>열기</th></tr></thead><tbody>${villages.map(v=>`<tr><td>${esc(v.name)}${v.active?'':' <span class="badge">운영 중지</span>'}</td><td>${v.members}명</td><td class="money">${money(v.income)}</td><td class="money">${money(v.expense)}</td><td>${v.pending}건</td><td>${button('chooseVillage','업무 열기',`data-id="${v.id}"`)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty"><h2>아직 등록된 마을이 없습니다.</h2><p>실제 마을을 등록하면 여기에 운영 현황이 모입니다.</p>'+ (isAdmin()?button('newVillage','첫 마을 등록','class="primary"'):'담당 마을 배정을 기다려 주세요.')+'</div>'}`;
  }
  function guide(){return `<h1>처음 사용하는 분께</h1><section class="panel"><h2>🌻 데모와 다른 점</h2><p>운영용에서는 입력한 자료가 서버에 저장되어 다른 컴퓨터에서도 이어서 사용할 수 있습니다. 데모는 기존의 가상 시연 화면으로 그대로 남아 있습니다.</p><h2>🏡 시작 순서</h2><ol><li>기존 ERP 관리자 계정으로 운영 공간과 실제 마을을 등록합니다.</li><li>이메일 인증을 완료한 개인 계정을 담당자로 등록하고 맡을 마을과 열람·수정 권한을 배정합니다.</li><li>상단에서 마을을 선택한 뒤 구성원·장부·회의록 등 자료를 등록합니다.</li><li>저장 대상 마을을 확인하고 저장합니다. 수정 전 자료는 전체 관리자의 변경 이력에서 확인할 수 있습니다.</li></ol><h2>✅ 결재는 별도로 권한 확인</h2><p>전체 관리자라고 해서 자동으로 결재권자가 되지는 않습니다. 마을 배정에서 실제 정관·규정 또는 위임에 따른 결재권을 확인한 사람에게만 권한을 부여합니다. 본인 상신 건을 스스로 승인할 수 없습니다.</p><h2>📌 이번 1차의 범위</h2><p>실제 자료 등록·수정·보관, 단일 결재권자 승인·반려, 페이지별 CSV 저장과 변경 이력을 제공합니다. 회의록은 작성·보관용입니다. 전자서명, 증빙 파일 업로드, 복식부기 자동 전표, 메시지 발송, 세금계산서 발행은 아직 연결하지 않았습니다.</p><p>마을의 장부와 운영협동조합의 수수료 원장은 별개입니다. 정산액·수익금 계획·청구를 입력했다고 다른 장부에 금액이 자동 반영되지 않습니다.</p><h2>🔒 자료 보호</h2><p>ERP 로그인, 운영협동조합 관리자·담당자 확인과 마을별 권한 검사는 계속 적용됩니다. 이름·연락처는 필요한 범위에서만 수집하고 주민등록번호·계좌번호 등 민감한 내용은 메모에 적지 마세요. CSV로 내려받은 자료도 안전하게 보관해 주세요.</p></section>`;}
  async function load(){
    const seq=++s.readSeq;nav();s.rows=[];$('content').innerHTML='<p class="muted">자료를 불러오고 있습니다…</p>';message('');
    try{
      let html;
      if(s.kind==='dashboard'){await refreshVillages();html=dashboard();}
      else if(s.kind==='guide')html=guide();
      else if(s.kind==='settings'){s.staff=await read('staff','',0);html=settings();}
      else if(s.kind==='audit'){const rows=await read();if(seq!==s.readSeq)return;s.rows=rows;html=auditList(rows);}
      else if(!s.village){html=`<h1>${TYPES[s.kind].label}</h1><div class="empty"><h2>먼저 마을을 선택해 주세요.</h2><p>서로 다른 마을의 명부·장부·문서를 한 목록에 섞지 않습니다.</p></div>`;}
      else{const rows=await read();if(seq!==s.readSeq)return;s.rows=rows;html=recordList(rows);}
      if(seq!==s.readSeq)return;$('content').innerHTML=html;
    }catch(e){if(seq!==s.readSeq)return;$('content').innerHTML='<div class="empty"><h2>자료를 불러오지 못했습니다.</h2><p>'+esc(friendly(e))+'</p>'+button('reload','다시 불러오기')+'</div>';}
  }
  function pager(rows){return `<div class="pager">${button('prev','이전',s.page===0?'disabled':'')}<span>${s.page+1}페이지 · 최대 30건</span>${button('next','다음',rows.length<=30?'disabled':'')}</div>`;}
  function recordList(rows){
    const meta=TYPES[s.kind];
    return `<h1>${meta.label}</h1><p class="muted">${esc(meta.help)}</p>${!selectedVillage().active?'<div class="notice">운영 중지된 마을입니다. 자료를 읽을 수 있지만 변경할 수 없습니다.</div>':''}<form id="searchForm" class="toolbar"><input type="search" name="query" id="query" aria-label="이름 또는 제목 검색" placeholder="이름 또는 제목 검색" maxlength="100" value="${esc(s.query)}"><button type="submit">검색</button><label class="check"><input type="checkbox" id="archived" ${s.archived?'checked':''}>보관 자료 포함</label>${button('export','현재 페이지 CSV',rows.length?'':'disabled')}${canWrite()?button('newRecord','+ 새로 등록','class="primary"'):''}</form>${rows.length?`<div class="table-wrap"><table><thead><tr><th>${esc(meta.date)}</th><th>${esc(meta.title)}</th><th>구분 / 상태</th>${meta.amount?'<th>'+esc(meta.amount)+'</th>':''}<th>상세</th></tr></thead><tbody>${rows.slice(0,30).map(r=>`<tr><td>${esc(meta.month?r.record_date.slice(0,7):r.record_date)}</td><td class="title">${esc(r.title)}</td><td>${esc(r.data.status||r.data.direction||r.data.category||r.data.meeting_type||r.data.settlement||r.data.document_type||r.data.invoice_state||'')} <span class="badge">${STATE[r.state]}</span></td>${meta.amount?`<td class="money">${money(r.amount)}${s.kind==='bill'?`<small class="muted"><br>청구 합계 ${money(r.amount+r.data.message_cost+r.data.vat)}<br>미수 ${money(r.amount+r.data.message_cost+r.data.vat-r.data.paid)}</small>`:''}</td>`:''}<td>${button('detail','열기',`data-id="${r.id}"`)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">'+(s.query?'검색 결과가 없습니다. 검색어를 바꿔 주세요.':'아직 등록된 자료가 없습니다.')+'</div>'}${pager(rows)}`;
  }
  function settings(){
    return `<h1>마을·담당자 설정</h1><p class="muted">실제 마을과 개인별 계정을 연결합니다. 전체 관리자도 결재권은 별도로 배정해야 합니다.</p><div class="toolbar">${button('newVillage','+ 마을 등록','class="primary"')}${button('newStaff','+ 담당자 등록')}</div><h2>🏡 등록된 마을</h2><div class="staff-grid">${s.villages.map(v=>`<section class="panel"><h3>${esc(v.name)}</h3><p>${esc(v.code)} · ${v.active?'운영 중':'운영 중지'}<br>${esc(v.address)}</p>${button('editVillage','마을 수정',`data-id="${v.id}"`)} ${button('assign','담당자 배정',`data-id="${v.id}" ${v.active?'':'disabled'}`)}<div>${s.staff.assignments.filter(a=>a.village_id===v.id).map(a=>`<p class="hint">${esc(s.staff.staff.find(u=>u.user_id===a.user_id)?.display_name||'담당자')} · ${a.access_level==='manager'?'자료 수정':'열람'}${a.can_approve?' · 결재권':''} ${button('editAssignment','변경',`data-id="${v.id}" data-user="${a.user_id}" ${v.active?'':'disabled'}`)}</p>`).join('')}</div></section>`).join('')||'<p>아직 마을이 없습니다.</p>'}</div><h2>👥 운영 담당자</h2><div class="staff-grid">${s.staff.staff.map(u=>`<section class="panel"><h3>${esc(u.display_name)}</h3><p>${u.role==='admin'?'전체 관리자':'담당자'} · ${u.active?'사용 중':'사용 중지'}</p>${button('editStaff','계정 설정 변경',`data-id="${u.user_id}" data-version="${u.version}"`)}</section>`).join('')}</div><div class="notice">직원 등록은 이메일 인증을 완료한 기존 계정만 가능합니다. 이 화면에서 초대 문자·이메일을 보내거나 공용 계정을 만들지 않습니다. 실제 담당자에게 개인 계정의 가입 이메일을 확인해 주세요.</div>`;
  }
  const ACTION_LABEL={create_operator:'운영 공간 생성',save_village:'마을 저장',save_staff:'담당자 저장',assign:'마을 권한 배정',unassign:'마을 배정 해제',save_record:'자료 저장',archive:'자료 보관',restore:'자료 복원',submit:'결재 상신',decide:'승인·반려'};
  function auditList(rows){return `<h1>변경 이력</h1><p class="muted">${s.village?'선택한 마을':'전체 마을'}의 저장·수정·권한 변경을 최근 순서로 봅니다. 수정 전·후 내용을 확인할 수 있으며 이력을 덮어쓰거나 삭제할 수 없습니다.</p><div class="table-wrap"><table><thead><tr><th>일시</th><th>마을</th><th>처리자</th><th>내용</th><th>기록</th></tr></thead><tbody>${rows.slice(0,30).map(r=>`<tr><td>${esc(new Date(r.occurred_at).toLocaleString('ko-KR'))}</td><td>${esc(s.villages.find(v=>v.id===r.village_id)?.name||'운영 설정')}</td><td>${esc(r.actor_name||'담당자')}</td><td>${esc(ACTION_LABEL[r.action]||r.action)}<br>${esc(r.after_row?.title||r.after_row?.name||'')}</td><td>${button('auditDetail','전후 보기',`data-id="${r.id}"`)}</td></tr>`).join('')}</tbody></table></div>${pager(rows)}`;}
  function field(f,value=''){
    const id='f_'+f.key;const attrs=`id="${id}" name="${f.key}" ${f.required?'required':''} ${f.max?`maxlength="${f.max}"`:''}`;
    let input;
    if(f.type==='textarea')input=`<textarea ${attrs}>${esc(value)}</textarea>`;
    else if(f.type==='select'||f.type==='approver')input=`<select ${attrs}>${(f.items||[]).map(o=>{const v=typeof o==='object'?o.value:o;const label=typeof o==='object'?o.label:o;return `<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(label)}</option>`;}).join('')}</select>`;
    else input=`<input type="${f.type}" ${attrs} value="${esc(value)}" ${f.type==='number'?`min="0" max="10000000000000" step="${f.step||1}"`:''} ${f.type==='date'?'min="2000-01-01" max="2099-12-31"':''} ${f.type==='month'?'min="2000-01" max="2099-12"':''}>`;
    return `<label class="field ${f.type==='textarea'?'full':''}" for="${id}"><span>${esc(f.label)}${f.required?' *':''}</span>${input}${f.help?`<small>${esc(f.help)}</small>`:''}</label>`;
  }
  function showEditor(config){
    if($('editor').open||s.busy)return;
    s.editor={...config,op:s.op?.id,village:config.village??s.village};s.request=null;s.uncertain=false;s.dirty=false;
    $('editorTitle').textContent=config.title;$('editorScope').textContent=config.scope|| (s.village?selectedVillage().name+'에 저장합니다.':'운영협동조합 설정입니다.');
    $('editorFields').innerHTML=config.html;$('editorError').hidden=true;$('save').textContent=config.saveLabel||'확인하고 저장';$('save').disabled=false;
    $('editor').showModal();
  }
  async function newRecord(row=null){
    if(!canWrite()||$('editor').open)return;
    const kind=s.kind,scope=s.village; const meta=TYPES[kind];
    let approvers=[];
    if(kind==='approval'){approvers=await read('approvers',scope,0);if(scope!==s.village||kind!==s.kind)return;}
    const fields=[F('title',meta.title,'text',{required:true,max:200}),F('record_date',meta.date,meta.month?'month':'date',{required:true}),...(meta.amount?[F('amount',meta.amount+' (원)','number',{required:true,step:1})]:[]),...meta.fields.map(f=>f.type==='approver'?{...f,items:[{value:'',label:'초안 저장 후에도 선택할 수 있습니다'},...approvers.filter(a=>a.id!==s.context.user_id).map(a=>({value:a.id,label:a.name}))]}:f)];
    const defaults={record_date:meta.month?today().slice(0,7):today(),amount:0,notice_date:today(),start_time:'14:00',end_time:'15:00',end_date:today(),due_date:today(),kwh:0,actual:0,setup_fee:300000,monthly_fee:80000,message_cost:0,vat:0,paid:0,message_terms:'문자·알림톡 발송사 실비 별도',...row,...row?.data};
    if(row&&meta.month)defaults.record_date=row.record_date.slice(0,7);
    showEditor({mode:'record',kind,row,id:row?.id||crypto.randomUUID(),title:(row?'수정 · ':'신규 · ')+meta.label,html:fields.map(f=>field(f,defaults[f.key]??'')).join('')+`<p class="hint field full">${esc(meta.help)}</p>`,version:row?.version||0});
  }
  function newVillage(v=null){showEditor({mode:'village',row:v,id:v?.id||crypto.randomUUID(),version:v?.version||0,village:'',title:v?'마을 정보 수정':'실제 마을 등록',scope:s.op.name+'의 관리 마을을 등록합니다.',html:field(F('name','마을·마을조합 이름','text',{required:true,max:120}),v?.name)+field(F('code','관리 코드','text',{required:true,max:30,help:'영문·숫자·밑줄·붙임표, 30자 이내. 마을마다 다른 코드를 사용합니다.'}),v?.code)+field(F('address','주소','text',{max:300}),v?.address)+(v?field(F('active','운영 상태','select',{items:[{value:'true',label:'운영 중'},{value:'false',label:'운영 중지 (자료 보존·읽기 전용)'}]}),String(v.active)):'')});}
  function newStaff(u=null){showEditor({mode:'staff',row:u,version:u?.version||0,title:u?'담당자 계정 설정':'담당자 등록',html:field(F('email','인증을 완료한 계정 이메일','email',{required:true,max:254,help:u?'기존 담당자의 가입 이메일을 다시 입력해 정확한 계정을 확인합니다.':'해당 담당자가 사용하는 개인 계정의 가입 이메일'}))+field(F('display_name','화면에 표시할 이름','text',{required:true,max:80}),u?.display_name)+field(F('role','운영 권한','select',{items:[{value:'staff',label:'담당자 (배정된 마을만)'},{value:'admin',label:'전체 관리자 (모든 마을)'}]}),u?.role||'staff')+field(F('active','계정 사용','select',{items:[{value:'true',label:'사용 중'},{value:'false',label:'사용 중지'}]}),String(u?.active??true)),scope:'담당자 권한 변경은 기록으로 남습니다. 마을별 결재권은 따로 배정합니다.'});}
  function assign(village,user=''){
    const a=s.staff.assignments.find(a=>a.village_id===village&&a.user_id===user);
    showEditor({mode:'assign',row:a,village,version:a?.version||0,title:'마을 담당자 배정',scope:s.villages.find(v=>v.id===village).name+'의 담당 권한을 설정합니다.',html:field(F('user_id','담당자','select',{required:true,items:s.staff.staff.filter(u=>u.active&&(!user||u.user_id===user)).map(u=>({value:u.user_id,label:u.display_name}))}),user)+field(F('access_level','자료 접근','select',{items:[{value:'viewer',label:'열람만'},{value:'manager',label:'등록·수정 가능'}]}),a?.access_level||'viewer')+field(F('can_approve','이 마을의 결재권','select',{items:[{value:'false',label:'없음'},{value:'true',label:'결재권 있음'}]}),String(a?.can_approve||false))+'<label class="check field full"><input type="checkbox" name="authority_confirmed" value="true">결재권을 부여하는 경우, 이 마을의 정관·규정 또는 위임에 따른 권한을 확인했습니다.</label>'+(a?'<label class="check field full"><input type="checkbox" name="remove" value="true">이 담당자의 마을 배정을 해제합니다.</label>':'')});
  }
  function details(row){
    if($('detail').open)return;
    const meta=TYPES[row.kind];const extra=[];
    if(row.data.submitted_name)extra.push(['상신자',row.data.submitted_name],['지정 결재권자',row.data.approver_name]);
    if(row.data.decided_name)extra.push(['처리한 결재권자',row.data.decided_name]);
    if(row.data.submitted_at)extra.push(['상신일시',new Date(row.data.submitted_at).toLocaleString('ko-KR')]);
    if(row.data.decided_at)extra.push(['처리일시',new Date(row.data.decided_at).toLocaleString('ko-KR')],['처리 의견',row.data.decision_reason]);
    if(row.kind==='fund')extra.push(['계획 대비 잔여',money(row.amount-row.data.actual)]);
    if(row.kind==='bill')extra.push(['청구 합계',money(row.amount+row.data.message_cost+row.data.vat)],['미수금',money(row.amount+row.data.message_cost+row.data.vat-row.data.paid)]);
    $('detailTitle').textContent=row.title;
    const values=[[meta.date,row.record_date],['상태',STATE[row.state]],...(meta.amount?[[meta.amount,money(row.amount)]]:[]),...meta.fields.filter(f=>f.type!=='approver').map(f=>[f.label,f.type==='number'?Number(row.data[f.key]).toLocaleString('ko-KR'):row.data[f.key]]),...extra,['최종 수정',new Date(row.updated_at).toLocaleString('ko-KR')+' · 버전 '+row.version]];
    let actions='';
    if(canWrite()){
      if(['active','draft','rejected'].includes(row.state))actions+=button('edit','수정',`data-id="${row.id}"`)+button('archive','보관 처리',`data-id="${row.id}"`);
      if(row.state==='archived')actions+=button('restore','보관 해제',`data-id="${row.id}"`);
      if(row.kind==='approval'&&row.state==='draft')actions+=button('submit','결재 상신',`data-id="${row.id}" class="primary"`);
    }
    if(selectedVillage().active&&selectedVillage().can_approve&&row.state==='pending'&&row.data.approver_id===s.context.user_id)actions+=button('decide','승인·반려 처리',`data-id="${row.id}" class="primary"`);
    $('detailBody').innerHTML=`<p class="scope-note">${esc(selectedVillage().name)} · ${esc(meta.label)}</p><dl class="detail-list">${values.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v||'—')}</dd>`).join('')}</dl><div class="actions">${actions}</div>`;$('detail').showModal();
  }
  function actionEditor(action,row){
    $('detail').close();
    const defs=action==='decide'?field(F('decision','결재 처리','select',{items:[{value:'approved',label:'승인'},{value:'rejected',label:'반려'}]}),'approved')+field(F('reason','처리 의견','textarea',{required:true,max:2000})):action==='archive'?field(F('reason','보관 사유','textarea',{required:true,max:500})):`<p class="field full">${action==='submit'?'상신 후에는 원문을 수정할 수 없습니다. 지정한 결재권자에게 검토를 요청합니다. 알림 메시지는 자동으로 발송하지 않습니다.':'보관된 자료를 다시 사용 중인 목록에 표시합니다.'}</p>`;
    showEditor({mode:'action',action,row,id:row.id,version:row.version,title:ACTION_LABEL[action]||'보관 해제',html:`<p class="field full"><strong>${esc(row.title)}</strong></p>`+defs,saveLabel:action==='submit'?'확인하고 상신':'확인하고 처리'});
  }
  async function submitEditor(event){
    event.preventDefault();if(s.busy||!s.editor)return;
    const e=s.editor;const values=Object.fromEntries(new FormData($('editorForm')));
    let action,payload;
    if(s.uncertain){({action,payload}=s.request);}
    else{
      payload={operator_id:e.op,village_id:e.village||null,id:e.id,version:e.version};
      if(e.mode==='record'){action='save_record';Object.assign(payload,recordPayload(e.kind,values));}
      else if(e.mode==='village'){action='save_village';Object.assign(payload,values,{active:values.active!=='false'});}
      else if(e.mode==='staff'){action='save_staff';Object.assign(payload,values,{active:values.active==='true',user_id:e.row?.user_id||null});}
      else if(e.mode==='assign'){action=values.remove?'unassign':'assign';Object.assign(payload,values,{can_approve:values.can_approve==='true',authority_confirmed:values.authority_confirmed==='true'});}
      else if(e.mode==='setup'){action='create_operator';payload={coop_id:e.coop,display_name:values.display_name};}
      else{action=e.action;Object.assign(payload,values);}
      const key=JSON.stringify({action,payload});if(s.request?.key!==key)s.request={key,action,payload,id:crypto.randomUUID()};
    }
    s.busy=true;$('save').disabled=true;$('editorError').hidden=true;
    try{
      await rpc('sv_command',{p_action:action,p_payload:payload,p_request_id:s.request.id});
      s.dirty=false;s.uncertain=false;$('editor').close();s.editor=null;s.request=null;
      if(action==='create_operator'){s.busy=false;await boot();}
      else{await refreshVillages();await load();message('저장되었습니다. 다른 컴퓨터에서도 같은 자료를 확인할 수 있습니다.');}
    }catch(error){
      const uncertain=!error?.code||!/^\d{5}$|^P\d{4}$|^PGRST\d+$/.test(error.code);
      if(uncertain){s.uncertain=true;$('editorFields').querySelectorAll('input,select,textarea').forEach(n=>n.disabled=true);$('save').textContent='같은 요청으로 저장 결과 확인';}
      $('editorError').textContent=uncertain?'서버의 저장 결과를 아직 확인하지 못했습니다. 아래 버튼으로 같은 요청을 다시 확인하세요. 중복 등록되지 않도록 입력값은 잠시 잠갔습니다.':friendly(error);$('editorError').hidden=false;
    }finally{s.busy=false;$('save').disabled=false;}
  }
  function closeEditor(){
    if(s.busy)return;
    if((s.dirty||s.uncertain)&&!confirm(s.uncertain?'저장 결과가 불확실합니다. 닫은 뒤 목록에서 저장 여부를 먼저 확인해 주세요. 닫을까요?':'입력 중인 내용이 있습니다. 저장하지 않고 닫을까요?'))return;
    s.dirty=false;s.uncertain=false;s.editor=null;s.request=null;$('editorFields').replaceChildren();$('editor').close();$('save').hidden=false;
  }
  function exportPage(){
    const meta=TYPES[s.kind];const cols=[[meta.title,'title'],[meta.date,'record_date'],['상태','state'],...(meta.amount?[[meta.amount,'amount']]:[]),...meta.fields.filter(f=>f.type!=='approver').map(f=>[f.label,f.key])];
    const rows=[[selectedVillage().name+' · '+meta.label+' · 현재 '+(s.page+1)+'페이지 (최대 30건)'],cols.map(c=>c[0]),...s.rows.slice(0,30).map(r=>cols.map(([,k])=>k==='state'?STATE[r.state]:r[k]??r.data[k]??''))];
    const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=selectedVillage().name.replace(/[\\/:*?"<>|]/g,'_')+'_'+s.kind+'_'+today()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
  function snapshotHtml(row){
    if(!row)return '<p>없음</p>';
    if(row.kind&&TYPES[row.kind]){const meta=TYPES[row.kind];return `<h3>${esc(row.title)}</h3><p>${esc(row.record_date)} · ${esc(STATE[row.state]||'')} · ${money(row.amount)}</p><dl class="detail-list">${meta.fields.filter(f=>f.type!=='approver').map(f=>`<dt>${esc(f.label)}</dt><dd>${esc(row.data[f.key])}</dd>`).join('')}</dl>${row.archive_reason?'<p>보관 사유: '+esc(row.archive_reason)+'</p>':''}${row.data.decision_reason?'<p>결재 의견: '+esc(row.data.decision_reason)+'</p>':''}`;}
    const labels={name:'이름',code:'관리 코드',address:'주소',display_name:'담당자',role:'운영 권한',active:'사용 여부',access_level:'자료 접근',can_approve:'결재권',version:'버전'};
    return '<dl class="detail-list">'+Object.entries(labels).filter(([k])=>k in row).map(([k,label])=>`<dt>${label}</dt><dd>${esc(({admin:'전체 관리자',staff:'담당자',manager:'수정 가능',viewer:'열람만',true:'예',false:'아니오'})[String(row[k])]||row[k])}</dd>`).join('')+'</dl>';
  }
  async function dispatch(event){
    const b=event.target.closest('button[data-action],button[data-nav]');if(!b||b.disabled||s.busy)return;
    try{
      if(b.dataset.nav){s.kind=b.dataset.nav;s.page=0;s.query='';s.archived=false;await load();return;}
      const action=b.dataset.action,id=b.dataset.id,row=s.rows.find(r=>String(r.id)===id);
      if(action==='retry')await boot();
      else if(action==='reload'){await refreshVillages();await load();}
      else if(action==='chooseVillage'){s.village=id;$('village').value=id;$('scopeLabel').textContent=selectedVillage().name+' 자료만 표시 중';s.kind='member';s.page=0;s.query='';await load();}
      else if(action==='newRecord')await newRecord();
      else if(action==='newVillage')newVillage();
      else if(action==='editVillage')newVillage(s.villages.find(v=>v.id===id));
      else if(action==='newStaff')newStaff();
      else if(action==='editStaff')newStaff(s.staff.staff.find(u=>u.user_id===id));
      else if(action==='assign'||action==='editAssignment')assign(id,b.dataset.user||'');
      else if(action==='detail'&&row)details(row);
      else if(action==='edit'&&row){$('detail').close();await newRecord(row);}
      else if(['archive','restore','submit','decide'].includes(action)&&row)actionEditor(action,row);
      else if(action==='export')exportPage();
      else if(action==='next'||action==='prev'){s.page+=action==='next'?1:-1;await load();}
      else if(action==='auditDetail'&&row){$('detailTitle').textContent=ACTION_LABEL[row.action]||'변경 기록';$('detailBody').innerHTML='<h2>변경 전</h2>'+snapshotHtml(row.before_row)+'<hr><h2>변경 후</h2>'+snapshotHtml(row.after_row);$('detail').showModal();}
      else if(action==='setup'){
        const coop=$('setupCoop').value;showEditor({mode:'setup',coop,title:'운영 공간 만들기',scope:s.context.setup_coops.find(c=>c.id===coop).name+'의 운영 공간을 만듭니다.',html:field(F('display_name','전체 관리자 표시 이름','text',{required:true,max:80}))+'<p class="field full hint">기존 명부·회계 자료는 복사되지 않으며, 마을을 등록하기 전에는 빈 화면으로 시작합니다.</p>',saveLabel:'빈 운영 공간 생성'});
      }
    }catch(e){message(friendly(e),true);if($('editor').open){$('editorError').textContent=friendly(e);$('editorError').hidden=false;}}
  }
  document.addEventListener('click',dispatch);
  document.addEventListener('submit',event=>{if(event.target.id==='searchForm'){event.preventDefault();s.query=$('query').value.trim();s.archived=$('archived').checked;s.page=0;void load();}else if(['loginEmailForm','loginCodeForm'].includes(event.target.id)){void emailLogin(event);}});
  $('editorForm').addEventListener('submit',submitEditor);
  $('editorForm').addEventListener('input',()=>{s.dirty=true;});
  $('editorForm').addEventListener('change',()=>{s.dirty=true;});
  $('closeEditor').addEventListener('click',closeEditor);$('editor').addEventListener('cancel',e=>{e.preventDefault();closeEditor();});
  $('closeDetail').addEventListener('click',()=>$('detail').close());
  $('village').addEventListener('change',()=>{s.village=$('village').value;s.page=0;s.query='';s.archived=false;$('scopeLabel').textContent=s.village?selectedVillage().name+' 자료만 표시 중':'접근 가능한 마을의 전체 운영 현황';void load();});
  $('operator').addEventListener('change',()=>{s.op=s.context.operators.find(o=>o.id===$('operator').value);s.kind='dashboard';void openOperator().catch(e=>message(friendly(e),true));});
  $('reload').addEventListener('click',()=>void load());
  window.addEventListener('beforeunload',e=>{if(s.dirty||s.uncertain){e.preventDefault();e.returnValue='';}});
  void boot();
})();
