(() => {
  'use strict';
  const numberDate = value => new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}).format(new Date(value));
  const qrPattern = /^https:\/\/www\.yonginsolar\.kr\/guestbook\.html#[a-f0-9]{64}$/;
  const keys = ['name','affiliation','position','phone','email','consented_at','expires_at'];
  const labels = ['이름','소속','직함','전화번호','이메일','작성 시각','보관기한'];
  function value(key,row) { return row[key] == null ? '' : key.endsWith('_at') ? numberDate(row[key]) : String(row[key]); }
  function workbook(xlsx, rows) {
    // Explicit text cells preserve leading zeros and never turn user text into a formula.
    const data=[labels,...rows.map(row=>keys.map(key=>value(key,row)))];
    const sheet=xlsx.utils.aoa_to_sheet(data.map(row=>row.map(v=>({t:'s',v}))));
    sheet['!cols']=[18,28,18,18,30,26,26].map(wch=>({wch}));
    const book=xlsx.utils.book_new(); xlsx.utils.book_append_sheet(book,sheet,'방명록'); return book;
  }
  function start(client, getOwner) {
    const $=id=>document.getElementById(id);
    const opener=$('boothGuestbookOpen'), dialog=$('boothGuestbookDialog'), select=$('boothGuestbookEvent'), table=$('boothGuestbookRows');
    const controls=$('boothGuestbookControls'), search=$('boothGuestbookSearch'), message=$('boothGuestbookInfo'), printPane=$('boothGuestbookPrint');
    let view=0, requestCounter=0, owner, events=[], settings=null, offset=0, term='', busy=false, pendingChange=false, more=false, exportLib, confirming='', previewUrl='';
    const show = s => { message.textContent=s; };
    const current = (v,r) => v===view && (r===undefined || r===requestCounter) && dialog.open && owner===getOwner() && !window.frameElement?.hidden;
    function render() {
      controls.hidden=!select.value || !settings;
      select.disabled=busy;
      $('boothGuestbookRetry').disabled=busy;
      $('boothGuestbookIssue').textContent=settings?.url?'QR 교체':'QR 발급';
      $('boothGuestbookIssue').disabled=busy || pendingChange || !settings?.can_issue;
      $('boothGuestbookRevoke').disabled=busy || pendingChange || !settings?.url;
      for (const id of ['boothGuestbookPreview','boothGuestbookCopy']) $(id).disabled=busy || pendingChange || !qrPattern.test(settings?.url||'');
      $('boothGuestbookPrevious').disabled=busy || offset===0;
      $('boothGuestbookNext').disabled=busy || !more;
      $('boothGuestbookDownload').disabled=busy || !table.children.length;
      $('boothGuestbookPrintButton').disabled=busy || pendingChange || !previewUrl || previewUrl!==settings?.url;
      $('boothGuestbookConfirm').hidden=!confirming;
      $('boothGuestbookYes').disabled=busy || pendingChange;
    }
    async function rpc(action, id=null, data={}) {
      const ctrl=new AbortController(), timer=setTimeout(()=>ctrl.abort(),12000);
      try {
        const result=await client.rpc('booth_guestbook_admin',{p_action:action,p_event:id,p_data:data}).abortSignal(ctrl.signal);
        if (result.error) throw new Error(result.error.code==='42501' ? 'ACCESS_DENIED' : result.error.message || 'UNAVAILABLE');
        return result.data;
      } finally { clearTimeout(timer); }
    }
    function resetPrint() {
      previewUrl=''; printPane.hidden=true; const qr=$('boothGuestbookQr'); qr.replaceChildren(); qr.removeAttribute('title');
    }
    function clear() {
      view++; requestCounter++; owner=null; events=[]; settings=null; offset=0; term=''; busy=false; pendingChange=false; more=false; confirming='';
      table.replaceChildren(); select.replaceChildren(); search.value=''; resetPrint();
      $('boothGuestbookPrintTitle').textContent=''; $('boothGuestbookPrintWhere').textContent=''; $('boothGuestbookTotal').textContent='';
      dialog.classList.remove('booth-guestbook-printing'); show(''); render();
    }
    function close() { if(dialog.open)dialog.close(); clear(); }
    function protectAfterError(error) {
      if (error.message!=='ACCESS_DENIED') return false;
      settings=null;events=[];pendingChange=false;confirming='';more=false;offset=0;term='';
      search.value='';table.replaceChildren();select.replaceChildren();resetPrint();
      $('boothGuestbookTotal').textContent='';
      show('방명록을 볼 권한을 확인해 주세요.');return true;
    }
    function draw(rows) {
      table.replaceChildren(...rows.map(row=>{
        const tr=document.createElement('tr');
        for (const key of keys) {
          const td=document.createElement('td'); td.textContent=value(key,row)||'—'; tr.append(td);
        }
        return tr;
      }));
    }
    async function load(options={}) {
      const v=view, r=++requestCounter; busy=true;confirming=''; render(); show('방명록을 불러오는 중입니다.');
      let waitingForQr=false;
      try {
        if (!events.length) {
          const result=await rpc('events'); if(!current(v,r))return;
          events=Array.isArray(result)?result:[];
          select.replaceChildren(...events.map(event=>new Option(event.title,event.id)));
          if(!events.length){show('등록된 방명록 행사가 없습니다.');return;}
        }
        const id=select.value;
        if (options.settings || !settings || pendingChange) {
          waitingForQr=true;
          const result=await rpc('settings',id); if(!current(v,r))return;
          if (previewUrl && previewUrl!==result?.url) resetPrint();
          settings=result; pendingChange=false; waitingForQr=false;
          $('boothGuestbookTotal').textContent=`누적 방문 ${Number(result.total||0).toLocaleString('ko-KR')}명`;
        }
        const result=await rpc('list',id,{search:term,offset}); if(!current(v,r))return;
        draw(result.rows || []); more=!!result.more;
        show(table.children.length?'':settings.can_issue?'표시할 방문 기록이 없습니다.':'접수를 시작하지 않았거나 마감됐습니다.');
      } catch (error) {
        if(current(v,r)&&!protectAfterError(error)) {
          if(waitingForQr){resetPrint();pendingChange=true;}
          show(pendingChange?'QR 상태를 확인하지 못했습니다. 다시 확인해 주세요.':'방명록을 불러오지 못했습니다. 다시 확인해 주세요.');
        }
      } finally { if(current(v,r)){busy=false;render();} }
    }
    async function change() {
      const action=confirming;
      if (!['issue','revoke'].includes(action)||busy||pendingChange||!settings)return;
      const v=view, r=++requestCounter, id=select.value, revision=settings.revision;
      busy=true;pendingChange=true;confirming='';resetPrint();render();show('QR 상태를 변경하는 중입니다.');
      try {
        const result=await rpc(action,id,{revision}); if(!current(v,r))return;
        settings=result; pendingChange=false;show(action==='issue'?'QR을 발급했습니다.':'QR을 사용 중지했습니다.');
      } catch (error) {
        if(current(v,r)&&!protectAfterError(error))show('QR 변경 결과를 확인하려면 다시 확인을 눌러 주세요.');
      } finally { if(current(v,r)){busy=false;render();} }
    }
    async function download() {
      const v=view, r=++requestCounter, id=select.value;
      busy=true;render();show('엑셀을 준비하는 중입니다.');
      try {
        if (!window.XLSX) {
          exportLib ||= new Promise((resolve,reject)=>{
            const script=document.createElement('script'); script.src='/shared/vendor/xlsx-0.20.3.full.min.js';
            script.integrity='sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT'; script.crossOrigin='anonymous';
            script.onload=()=>window.XLSX?resolve():reject(new Error('XLSX'));script.onerror=()=>reject(new Error('XLSX'));document.head.append(script);
          }).catch(err=>{exportLib=null;throw err;});
          await exportLib;
        }
        if(!current(v,r))return;
        const result=await rpc('export',id,{search:term}); if(!current(v,r))return;
        if(!result.rows.length){show('다운로드할 방문 기록이 없습니다.');return;}
        window.XLSX.writeFile(workbook(window.XLSX,result.rows),'박람회_방명록.xlsx'); show('엑셀을 다운로드했습니다.');
      } catch (error) { if(current(v,r)&&!protectAfterError(error))show(error.message==='GUESTBOOK_EXPORT_NARROW'?'검색어로 범위를 좁힌 뒤 다운로드해 주세요.':'엑셀을 내려받지 못했습니다. 다시 시도해 주세요.'); }
      finally { if(current(v,r)){busy=false;render();} }
    }
    opener.hidden=false;
    opener.addEventListener('click',()=>{
      if (dialog.open || !getOwner()?.userId) return;
      clear(); owner=getOwner();dialog.showModal(); void load();
    });
    $('boothGuestbookClose').addEventListener('click',close);
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    $('boothGuestbookRetry').addEventListener('click',()=>{if(!busy)void load({settings:true});});
    select.addEventListener('change',()=>{settings=null;pendingChange=false;offset=0; more=false;draw([]);resetPrint();void load({settings:true});});
    $('boothGuestbookSearchForm').addEventListener('submit',event=>{event.preventDefault();if(busy)return; const next=search.value.trim();if(next!==term){term=next;offset=0;more=false;draw([]);}void load();});
    $('boothGuestbookPrevious').addEventListener('click',()=>{if(!busy && offset>0){offset-=50;void load();}});
    $('boothGuestbookNext').addEventListener('click',()=>{if(!busy && more){offset+=50;void load();}});
    $('boothGuestbookDownload').addEventListener('click',()=>{if(!busy)void download();});
    for(const [id,action] of [['boothGuestbookIssue','issue'],['boothGuestbookRevoke','revoke']]) $(id).addEventListener('click',()=>{
      if(busy||pendingChange)return;
      if(action==='issue'&&!settings?.url){confirming=action;void change();return;}
      confirming=action;
      $('boothGuestbookConfirmText').textContent=action==='issue'?'새 QR을 발급하면 인쇄된 기존 QR은 작동하지 않습니다. 교체할까요?':'인쇄된 QR의 접수를 중지할까요?';
      render(); $('boothGuestbookNo').focus();
    });
    $('boothGuestbookNo').addEventListener('click',()=>{const id=confirming==='issue'?'boothGuestbookIssue':'boothGuestbookRevoke';confirming='';render();$(id).focus();});
    $('boothGuestbookYes').addEventListener('click',()=>void change());
    $('boothGuestbookCopy').addEventListener('click',async ()=>{
      const v=view, code=settings?.url; if(!qrPattern.test(code||''))return;
      try{await navigator.clipboard.writeText(code);if(current(v))show('방명록 주소를 복사했습니다.');}catch{if(current(v))show('주소를 복사하지 못했습니다. QR을 사용해 주세요.');}
    });
    $('boothGuestbookPreview').addEventListener('click',()=>{
      const code=settings?.url, event=events.find(item=>item.id===select.value);
      if(!qrPattern.test(code||'')||!event||typeof window.QRCode!=='function'){show('QR 인쇄 화면을 열지 못했습니다. 다시 확인해 주세요.');return;}
      const target=$('boothGuestbookQr'); target.replaceChildren();
      new window.QRCode(target,{text:code,width:384,height:384,correctLevel:window.QRCode.CorrectLevel.M});
      $('boothGuestbookPrintTitle').textContent=event.title;
      $('boothGuestbookPrintWhere').textContent=event.venue;
      previewUrl=code;printPane.hidden=false;render();printPane.scrollIntoView({block:'nearest'});
    });
    $('boothGuestbookPrintButton').addEventListener('click',()=>{
      if(printPane.hidden||busy||!qrPattern.test(previewUrl)||previewUrl!==settings?.url||pendingChange||!current(view))return;
      dialog.classList.add('booth-guestbook-printing');try{window.print();}finally{dialog.classList.remove('booth-guestbook-printing');}
    });
    window.addEventListener('pagehide',close);
    if(window.frameElement)new MutationObserver(()=>{if(window.frameElement?.hidden)close();}).observe(window.frameElement,{attributes:true,attributeFilter:['hidden']});
    return () => { opener.hidden=true; close(); };
  }
  window.BoothGuestbookAdmin=Object.freeze({start,workbook});
})();
