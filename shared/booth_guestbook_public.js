(() => {
  'use strict';
  const url = 'https://ifdqlwxgqgsvnawmhlfc.supabase.co/functions/v1/booth-guestbook';
  const publishable = 'sb_publishable_lkVhLJDe8WmOPzsWOMkKdg_pjVwVS-h';
  const find = id => document.getElementById(id);
  const form = find('guestForm'), fields = find('guestFields'), submit = find('guestSubmit'), retry = find('guestRetry'), status = find('guestStatus');
  const code = location.hash.slice(1);
  const validCode = /^[0-9a-f]{64}$/.test(code) && location.origin === 'https://www.yonginsolar.kr';
  const storageKey = `booth-guestbook:receipt:${code}`;
  const keyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  let version = '', request = '', payload = null, busy = false, finished = false, uncertain = false, active = false, contextReady = false;
  const dateText = value => new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium'}).format(new Date(value));
  function eventDates(data) {
    const date = /^\d{4}-\d\d-\d\d$/;
    if (date.test(data.event_starts_on || '') && date.test(data.event_ends_on || '') && data.event_starts_on<=data.event_ends_on) {
      return [dateText(data.event_starts_on+'T00:00:00+09:00'),dateText(data.event_ends_on+'T00:00:00+09:00')];
    }
    return [dateText(data.starts_at),dateText(Date.parse(data.ends_at)-1)];
  }
  const setStatus = (message, allowRetry=false) => { status.textContent=message; retry.hidden=!allowRetry; };
  const placeFocus = source => { if (document.activeElement===source || document.activeElement===document.body) status.focus({preventScroll:true}); };
  function sync() {
    form.hidden = finished || !active || !contextReady;
    fields.disabled = busy || uncertain || !!payload;
    submit.disabled = busy || uncertain || !active;
    retry.disabled = busy;
  }
  function savedKey() { try { return sessionStorage.getItem(storageKey) || ''; } catch { return ''; } }
  function record(state) { try { sessionStorage.setItem(storageKey,`${state}:${request}`); } catch {} }
  function done(source) {
    finished=true; uncertain=false; payload=null; record('done'); form.reset();
    setStatus('방명록을 남겼습니다. 방문해 주셔서 감사합니다.'); placeFocus(source);
  }
  async function call(action, data={}) {
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),10000);
    try {
      const response=await fetch(url,{method:'POST',headers:{apikey:publishable,'Content-Type':'application/json'},cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal,body:JSON.stringify({action,code,...data})});
      const result=await response.json();
      if (!response.ok) throw new Error(result?.error || 'REQUEST_UNAVAILABLE');
      return result;
    } finally { clearTimeout(timer); }
  }
  function showNotice(notice) {
    const keys=[['controller','수집 주체'],['purpose','이용 목적'],['required','필수 정보'],['optional','선택 정보'],['retention','보관 기간'],['refusal','동의 거부'],['optional_refusal','선택 정보 미입력'],['withdrawal','철회·삭제'],['age','작성 대상']];
    if (!notice?.version || keys.some(([key])=>typeof notice[key]!=='string')) throw new Error('REQUEST_UNAVAILABLE');
    find('guestNotice').replaceChildren(...keys.map(([key,label])=>{
      const li=document.createElement('li'); li.textContent=`${label}: ${notice[key]}`; return li;
    }));
    version=notice.version;
  }
  async function check(source) {
    if (busy || finished || !validCode) return;
    busy=true; sync(); setStatus('다시 확인하는 중입니다.');
    try {
      if (!contextReady) {
        const data=await call('context'); showNotice(data.notice);
        find('guestTitle').textContent=data.title;
        const meta=find('guestMeta'); meta.textContent=`${eventDates(data).join(' ~ ')} · ${data.venue}`; meta.hidden=false;
        active=data.state==='open'; contextReady=true;
        if (!active && !uncertain) { setStatus(data.state==='upcoming'?`${dateText(data.starts_at)}부터 방명록을 남길 수 있습니다.`:'방명록 작성이 마감됐습니다.'); return; }
      }
      if (uncertain && request) {
        if ((await call('status',{request})).received === true) { done(source); return; }
        uncertain=false;
        if (!active) { setStatus('방명록 작성이 마감됐습니다.'); return; }
        setStatus(payload?'아직 접수된 기록이 없습니다. 같은 내용으로 다시 제출할 수 있습니다.':'아직 접수된 기록이 없습니다. 내용을 입력해 제출할 수 있습니다.');
        return;
      }
      setStatus('');
    } catch (error) {
      if (error.message==='GUESTBOOK_UNAVAILABLE') { active=false;setStatus('사용할 수 없는 방명록입니다. 부스에 있는 최신 QR을 확인해 주세요.'); }
      else setStatus('방명록을 확인하지 못했습니다. 다시 확인해 주세요.',true);
    } finally { busy=false;sync(); }
  }
  function emailState() {
    const needed=!!form.elements.email.value.trim(), box=form.elements.emailConsent;
    find('guestEmailConsent').hidden=!needed; box.required=needed;
    if (!needed) box.checked=false;
  }
  form.elements.email.addEventListener('input',emailState);
  retry.addEventListener('click',()=>void check(retry));
  form.addEventListener('submit',async event=>{
    event.preventDefault(); if (busy || uncertain || finished || !active || !form.reportValidity()) return;
    request ||= crypto.randomUUID();
    if (!payload) {
      const data=Object.fromEntries(new FormData(form));
      payload={request,version,...data,age:form.elements.age.checked,consent:form.elements.consent.checked,emailConsent:form.elements.emailConsent.checked};
    }
    record('pending'); busy=true;sync();setStatus('방명록을 제출하는 중입니다.');
    try {
      if ((await call('submit',payload)).received!==true) throw new Error('REQUEST_UNAVAILABLE');
      done(submit);
    } catch (error) {
      const known={INVALID_INPUT:'이름, 소속, 직함, 전화번호와 이메일을 확인해 주세요.',CONSENT_REQUIRED:'개인정보 수집·이용 안내를 다시 확인해 주세요.',TOO_MANY_REQUESTS:'잠시 뒤 다시 제출해 주세요.',GUESTBOOK_CLOSED:'방명록 작성이 마감됐습니다.',GUESTBOOK_UNAVAILABLE:'사용할 수 없는 QR입니다. 부스의 최신 QR을 확인해 주세요.'};
      if (Object.hasOwn(known,error.message)) {
        payload=null;
        if (error.message==='CONSENT_REQUIRED') {
          form.elements.consent.checked=false; form.elements.emailConsent.checked=false; contextReady=false;
        }
        if (error.message==='GUESTBOOK_CLOSED' || error.message==='GUESTBOOK_UNAVAILABLE') active=false;
        setStatus(known[error.message],error.message==='CONSENT_REQUIRED');
      } else {
        uncertain=true;setStatus('접수 여부를 아직 확인하지 못했습니다. 다시 확인해 주세요.',true);
      }
    } finally { busy=false; sync(); }
  });
  if (!validCode) { setStatus('부스에 있는 QR로 열어 주세요.'); return; }
  const [state,key]=savedKey().split(':');
  if (keyPattern.test(key||'')) { request=key; if (state==='done' || state==='pending') uncertain=true; }
  void check(null);
})();
