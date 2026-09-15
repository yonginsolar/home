/* 2026-09-15 v1.0.2. Compact and legacy tokens; memory only, never analytics/storage/query string. */
console.info('[Version] v1.0.2 | guardian_consent.html');
(() => {
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  history.replaceState(null, '', location.pathname); // Do not retain capability in browser history.
  const el = id => document.getElementById(id);
  let busy = false, version = '';
  const errors = { LINK_UNAVAILABLE:'이 링크는 만료되었거나 더 이상 사용할 수 없습니다. 사무국에 새 안내를 요청해 주세요.', GUARDIAN_DETAILS_MISMATCH:'신청할 때 입력한 법정대리인 이름과 관계를 확인해 주세요. 이름이 잘못 등록됐다면 사무국에 정정을 요청해 주세요.', CONSENT_REQUIRED:'동의 내용을 모두 확인해 주세요.', RESPONSE_ALREADY_RECORDED:'이미 응답이 접수되었습니다. 변경이 필요하면 사무국에 연락해 주세요.' };
  async function call(action, data = {}) {
    const response = await fetch('https://ifdqlwxgqgsvnawmhlfc.supabase.co/functions/v1/guardian-consent', { method:'POST', cache:'no-store', referrerPolicy:'no-referrer', credentials:'omit', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...data, action, token }) });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(errors[result.error] || '접수 결과를 확인하지 못했습니다. 잠시 후 다시 눌러 확인해 주세요. 같은 응답은 중복 접수되지 않습니다.');
    return result;
  }
  function completed(status) {
    el('consentForm').hidden = true;
    el('message').textContent = status === 'consented' ? '동의가 접수되었습니다.\n사무국이 확인한 후 가입 승인을 진행합니다. 동의 접수 알림은 등록된 법정대리인 연락처로 보내드립니다.' : '동의하지 않는 것으로 접수되었습니다. 가입 승인은 보류되며, 변경이 필요하면 사무국으로 연락해 주세요.';
  }
  async function respond(action) {
    if (busy) return;
    busy = true; document.querySelectorAll('button').forEach(b=>b.disabled=true);
    try {
      const result = await call(action, { name:el('guardianName').value.trim(), relationship:el('relationship').value==='other' ? el('otherRelationship').value.trim() : el('relationship').value, version, representative:el('representative').checked, membership:el('membership').checked, privacy:el('privacy').checked });
      completed(result.status);
    } catch(error) { el('message').textContent = error.message; el('message').scrollIntoView({block:'center'}); }
    finally { busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false); }
  }
  el('relationship').addEventListener('change',()=>{el('otherRelationship').hidden=el('relationship').value!=='other';el('otherRelationship').required=!el('otherRelationship').hidden;});
  el('consentForm').addEventListener('submit',e=>{e.preventDefault();if(e.currentTarget.reportValidity())void respond('consent');});
  el('declineButton').addEventListener('click',()=>el('declineConfirm').hidden=false);
  el('cancelDecline').addEventListener('click',()=>el('declineConfirm').hidden=true);
  el('confirmDecline').addEventListener('click',()=>void respond('decline'));
  if (!token) {el('message').textContent='받으신 알림톡의 신청 확인 링크로 이 화면을 다시 열어 주세요. 안내를 찾을 수 없다면 아래 사무국 연락처로 문의해 주세요.';return;}
  if (!/^(?:[A-Za-z0-9_-]{43}|[0-9a-f-]{36}\.[0-9a-f]{64})$/.test(token)) {el('message').textContent=errors.LINK_UNAVAILABLE;return;}
  call('preview').then(data=>{
    el('student').textContent=data.student_name;el('amount').textContent=Number(data.amount).toLocaleString('ko-KR')+'원';
    version=data.terms.version;
    ['representative','membership','privacy'].forEach(key=>el(key+'Text').textContent=data.terms[key]);
    el('notice').textContent=data.terms.notice;el('application').hidden=false;el('message').textContent='';
    if(data.status!=='pending')completed(data.status);
  }).catch(error=>el('message').textContent=error.message);
})();
