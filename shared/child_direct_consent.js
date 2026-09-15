/* v1.0.0 — authenticated legal representative registration, not student self-signup. */
(function () {
  'use strict';
  let opening = false, submitting = false, current = null, dialog = null;
  const messages = {
    CHILD_GUARDIAN_REQUIRED: '법정대리인 본인의 정조합원 계정으로 신청해 주세요.',
    CHILD_GUARDIAN_PHONE_REQUIRED: '법정대리인 계정의 휴대전화번호를 먼저 확인해 주세요.',
    CHILD_CONSENT_EXPIRED: '동의 화면의 유효시간이 지났습니다. 닫은 뒤 다시 확인해 주세요.',
    CHILD_AGE_INVALID: '가입 신청자의 생년월일을 확인해 주세요. 이 메뉴는 만 19세 미만 신청용입니다.',
    INVALID_BIRTH_DATE: '생년월일을 정확하게 입력해 주세요.',
    CHILD_CONSENT_REQUIRED: '필수 동의 항목을 모두 확인해 주세요.',
    CHILD_ALREADY_REGISTERED: '이미 등록된 신청자입니다. 연결된 계정 목록을 확인해 주세요.',
    CHILD_REQUEST_CHANGED: '이미 접수된 신청과 내용이 다릅니다. 신청 내역을 확인해 주세요.',
    INVALID_CHILD_EMAIL: '가입 신청자의 이메일 형식을 확인해 주세요.',
    DUPLICATE_CHILD_EMAIL: '이미 사용 중인 이메일입니다. 기존 계정 연결을 확인해 주세요.',
    CHILD_CAPITAL_INVALID: '출자금은 10만원 이상, 1만원 단위로 입력해 주세요.'
  };
  function errorText(error) { return messages[error?.message] || '접수 결과를 확인하지 못했습니다. 같은 화면에서 다시 확인하면 중복 접수되지 않습니다.'; }
  function close() {
    if (submitting) return;
    dialog?.remove(); dialog = null; current = null;
    const family = document.getElementById('familyModalOverlay');
    if (family) family.style.display = 'flex';
  }
  function node(tag, text, className) {
    const el = document.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el;
  }
  async function open(options) {
    if (opening || dialog) return;
    opening = true;
    try {
      const { data, error } = await options.client.rpc('child_direct_registration', { p_action: 'prepare', p_data: {} });
      if (error) throw error;
      if (!data?.request_id || !data.terms || !data.version) throw new Error('CHILD_REQUEST_UNAVAILABLE');
      // Only a masked display identifier is sent; the remaining RR number is never retained.
      current = { ...options, data: Object.freeze({ ...options.data, rrn2: String(options.data.rrn2).charAt(0) }), request: data };
      const family = document.getElementById('familyModalOverlay'); if (family) family.style.display = 'none';
      dialog = node('div'); dialog.id = 'childDirectConsentDialog';
      dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', 'childDirectTitle');
      Object.assign(dialog.style, {position:'fixed',inset:'0',zIndex:'2100',background:'rgba(0,0,0,.6)',display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'});
      const card = node('div'); Object.assign(card.style,{background:'var(--theme-surface, #fff)',color:'var(--theme-text, #212529)',padding:'24px',borderRadius:'16px',maxWidth:'650px',width:'100%',maxHeight:'90dvh',overflowY:'auto'});
      const title = node('h2','미성년자 가입·법정대리인 동의','h5 fw-bold'); title.id = 'childDirectTitle'; card.append(title);
      card.append(node('p',`${current.data.name} · 신청 출자금 ${Number(current.data.capital).toLocaleString('ko-KR')}원 · 관계: ${current.data.relationship}`,'fw-bold'));
      const labels = {privacy:'개인정보 수집·이용',membership:'가입·출자 동의',guardian:'법정대리인 확인',notice:'동의 접수 안내'};
      for (const [key, label] of Object.entries(labels)) { card.append(node('h3',label,'h6 fw-bold mt-3'),node('p',data.terms[key],'small')); }
      card.append(node('p',`안내받을 법정대리인 휴대전화번호 끝 4자리: ${data.phone_tail}`,'small'));
      for (const [id,label] of [['privacy','신청자의 개인정보 수집·이용에 동의합니다.'],['membership','위 신청 내용과 출자금액을 확인하고 가입·출자에 동의합니다.'],['guardian','본인은 적법한 법정대리인이며 위 확인 내용에 동의합니다.']]) {
        const wrap = node('label',null,'d-flex gap-2 my-3 small');
        const input = node('input'); input.type='checkbox'; input.id=`childDirect-${id}`; input.className='form-check-input flex-shrink-0';
        wrap.append(input,node('span',`(필수) ${label}`)); card.append(wrap);
      }
      const errorEl=node('p',null,'text-danger small'); errorEl.id='childDirectError'; errorEl.setAttribute('role','alert'); card.append(errorEl);
      const actions=node('div',null,'d-flex gap-2');
      const cancel=node('button','취소','btn btn-outline-secondary'); cancel.type='button'; cancel.onclick=close;
      const submit=node('button','동의하고 신청 접수','btn btn-primary flex-grow-1'); submit.type='button'; submit.id='childDirectSubmit'; submit.onclick=send;
      actions.append(cancel,submit); card.append(actions); dialog.append(card); document.body.append(dialog); submit.focus();
    } catch(error) { options.onError(errorText(error)); } finally { opening=false; }
  }
  async function send() {
    if (submitting || !current) return;
    const consent = ['privacy','membership','guardian'].every(id=>document.getElementById(`childDirect-${id}`)?.checked);
    const errorEl=document.getElementById('childDirectError');
    if (!consent) { errorEl.textContent=messages.CHILD_CONSENT_REQUIRED; return; }
    submitting=true; errorEl.textContent=''; const btn=document.getElementById('childDirectSubmit'); btn.disabled=true;
    const ctx=current, d=ctx.data;
    try {
      const {data,error}=await ctx.client.rpc('child_direct_registration',{p_action:'submit',p_data:{request_id:ctx.request.request_id,version:ctx.request.version,name:d.name,rrn_display:`${d.rrn1}-${d.rrn2}******`,email:d.email||'',capital:d.capital,relationship:d.relationship,bank:d.bank||'',acc:d.acc||'',privacy_agreed:true,membership_agreed:true,guardian_declared:true}});
      if (error) throw error; if (!data?.ok) throw new Error('CHILD_REQUEST_UNAVAILABLE');
      dialog.remove(); dialog=null; current=null;
      ['newFamName','newFamRrn1','newFamRrn2','newFamEmail','newFamAcc','newFamBank'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
      await ctx.onSuccess();
    } catch(error) { if (dialog) errorEl.textContent=errorText(error); } finally {submitting=false;if(btn.isConnected)btn.disabled=false;}
  }
  window.ChildDirectConsent=Object.freeze({open});
  document.addEventListener('DOMContentLoaded',()=>{
    const host=String(window.CoopRouteGuard?.getPublicRuntimeHost?.()||location.hostname||'').toLowerCase();
    if(!['www.yonginsolar.kr','yonginsolar.kr','localhost','127.0.0.1'].includes(host))return;
    const rrn=document.getElementById('newFamRrn2');
    if(rrn){rrn.maxLength=1;rrn.placeholder='뒤 첫 숫자';rrn.inputMode='numeric';rrn.setAttribute('aria-label','주민등록번호 뒷자리 첫 숫자만 입력');}
  });
})();
