/* v1.1.0 — Registered host scopes public guides, branding and payment accounts. */
(() => {
  'use strict';
  const base='https://ifdqlwxgqgsvnawmhlfc.supabase.co';
  const publishable='sb_publishable_lkVhLJDe8WmOPzsWOMkKdg_pjVwVS-h';
  const headers=()=>({apikey:publishable,'Content-Type':'application/json','x-erp-host':location.hostname});
  window.FestivalGuide={async context() {
    const response=await fetch(`${base}/rest/v1/rpc/festival_payment_context`,{method:'POST',headers:headers(),body:'{}',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('CONTEXT_UNAVAILABLE');
    const data=await response.json();
    if(!data||typeof data.coop_name!=='string')throw new Error('CONTEXT_UNAVAILABLE');
    return data;
  },async load(code) {
    if(!/^[0-9a-f]{20}$/.test(code))throw new Error('행사 관리에서 안내 페이지를 다시 열어 주세요.');
    const response=await fetch(`${base}/rest/v1/rpc/festival_payment_guide`,{method:'POST',headers:headers(),body:JSON.stringify({p_code:code}),credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('안내를 불러오지 못했습니다. 잠시 후 다시 열어 주세요.');
    const result=await response.json();
    if(!result||typeof result.event_name!=='string'||!result.guide||!Number.isSafeInteger(result.guide.unit_price))throw new Error('현재 사용할 수 없는 행사 안내입니다. 부스 담당자에게 문의해 주세요.');
    return result;
  },meta(data) {
    const g=data.guide,parts=[];
    if(data.event_date)parts.push(new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric',timeZone:'Asia/Seoul'}).format(new Date(`${data.event_date}T00:00:00+09:00`)));
    if(g.time_text)parts.push(g.time_text);
    if(g.capacity)parts.push(`선착순 ${Number(g.capacity).toLocaleString('ko-KR')}명`);
    return parts.join(' · ');
  }};
})();
