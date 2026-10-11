/* Member Telegram connection v1.0.1 — optional, own authenticated profile only. */
(() => {
  'use strict';
  let client=null, context=null, revision=0, pending=false;
  const byId=id=>document.getElementById(id);
  function setBusy(value) {
    pending=value;
    for (const id of ['memberTelegramConnect','memberTelegramDisconnect','memberTelegramRefresh']) if (byId(id)) byId(id).disabled=value;
  }
  function clearLink() {
    const link=byId('memberTelegramOpen');
    if (link) { link.hidden=true; link.removeAttribute('href'); }
  }
  function setContext(nextClient,next) {
    const key=JSON.stringify([next.authUserId,next.coopId,next.profileId,next.isOwn]);
    if (context?.key===key) return;
    client=nextClient;context={...next,key};revision++;setBusy(false);clearLink();
    const card=byId('memberTelegramCard');
    if (card) { card.hidden=next.isOwn!==true; card.open=false; }
    if (byId('memberTelegramState')) byId('memberTelegramState').textContent='';
    if (byId('memberTelegramConnect')) byId('memberTelegramConnect').hidden=true;
    if (byId('memberTelegramDisconnect')) byId('memberTelegramDisconnect').hidden=true;
  }
  async function perform(action) {
    if (pending || !client || context?.isOwn!==true || !context.authUserId || !context.coopId) return;
    const current=revision, owner=context.key;
    const isCurrent=()=>current===revision && context?.key===owner && context?.isOwn===true;
    setBusy(true);
    try {
      if (action==='connect') {
        const {data,error}=await client.rpc('member_issue_my_telegram_link_request');
        if (!isCurrent()) return;
        if (error) throw error;
        const url=new URL(String(data?.connect_url || ''));
        if (url.protocol!=='https:' || url.hostname!=='t.me' || url.username || url.password || !/^\/[A-Za-z0-9_]{5,32}$/.test(url.pathname)
          || !/^[a-f0-9]{64}$/.test(url.searchParams.get('start') || '')) throw new Error('LINK_INVALID');
        byId('memberTelegramOpen').href=url.href;byId('memberTelegramOpen').hidden=false;
        byId('memberTelegramState').textContent='텔레그램을 열고 시작 버튼을 눌러 주세요. 연결 후 연결 확인을 누르면 됩니다.';
        return;
      }
      if (action==='disconnect') {
        if (!window.confirm('텔레그램 알림 연결을 해제할까요?')) return;
        const {error}=await client.rpc('member_disconnect_my_telegram_link');
        if (!isCurrent()) return;
        if (error) throw error;
        clearLink();
      }
      const {data,error}=await client.rpc('member_get_telegram_link_status');
      if (!isCurrent()) return;
      if (error) throw error;
      byId('memberTelegramState').textContent=data?.linked?'연결됨':data?.enabled?'미연결':'현재 텔레그램 연결을 사용할 수 없습니다.';
      byId('memberTelegramConnect').hidden=data?.enabled!==true || data?.linked===true;
      byId('memberTelegramDisconnect').hidden=data?.linked!==true;
      if (data?.linked) clearLink();
    } catch (_) {
      if (isCurrent()) byId('memberTelegramState').textContent='연결 상태를 확인하지 못했습니다. 다시 시도해 주세요.';
    } finally { if (isCurrent()) setBusy(false); }
  }
  const clear=()=>setContext(null,{authUserId:null,coopId:null,profileId:null,isOwn:false});
  window.MemberTelegramConnection={setContext,perform,clear};
})();
