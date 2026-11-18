(() => {
  'use strict';
  const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  const versions = {pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'};
  const labels = {PROMO:'홍보 이미지',MATERIAL:'제작물',CHECKLIST:'체크리스트'};
  const messages = {EVENT_ARCHIVE_ACCESS:'행사를 관리할 권한을 확인해 주세요.',EVENT_ARCHIVE_CHANGED:'다른 곳에서 변경했습니다. 다시 확인한 뒤 저장해 주세요.',EVENT_ARCHIVE_LINK:'해당 방명록은 다른 행사에 연결됐거나 사용할 수 없습니다.',EVENT_ARCHIVE_LIMIT:'이 행사에 더 추가할 수 없습니다.',EVENT_ARCHIVE_UPLOAD_PENDING:'파일 저장을 확인하지 못했습니다. 같은 파일로 다시 시도해 주세요.',EVENT_ARCHIVE_INPUT:'입력한 내용과 파일 형식을 확인해 주세요.',EVENT_ARCHIVE_FILE_HIDDEN:'이 파일은 이미 보관되어 있습니다.',EVENT_ARCHIVE_CHECKLIST_CHANGED:'원래 체크리스트가 바뀌었습니다. 다시 확인해 주세요.',TIMEOUT:'응답을 확인하지 못했습니다. 다시 확인해 주세요.'};
  const empty = () => ({title:'',venue:'',starts_on:'',ends_on:'',notes:'',label:'',kind:'PROMO',file:null,createId:null,checkId:null,rev:0,loaded:false,section:'info',copyResult:''});
  const fn = 'participation_event_archive';
  const bucket = 'participation-files';
  const keys = ['title','venue','starts_on','ends_on','notes'];
  const basicsOf = value => Object.fromEntries(keys.map(k=>[k,String(value?.[k] ?? '')]));
  function start(client,getOwner,{onEducationLeave}={}) {
    const $=id=>document.getElementById(id), el=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text});
    const tabs=$('participationAreaTabs'), edu=$('participationEducationPane'), archive=$('participationArchivePane'), book=$('boothGuestbookOpen');
    const educationTab=$('participationEducationTab'), archiveTab=$('participationArchiveTab'), basics=$('archiveBasics'), contents=$('archiveContents');
    const checkForm=$('archiveCheckAdd'), fileForm=$('archiveFileAdd'), linkForm=$('archiveLink'), preview=$('archivePreview');
    const copy=$('archiveChecklistCopy'), source=$('archiveChecklistSource'), copyConfirm=$('archiveChecklistCopyConfirm'), copyRetry=$('archiveChecklistCopyRetry');
    const paper=$('archiveChecklistPrint'), printGo=$('archiveChecklistPrintGo');
    let events=[], draft=new Map(), active='', readSeq=0, busyRead=false, writing=false, more=false, mode=false, closed=false, lastDetail=null;
    let control=null, previewSeq=0, imageUrl='', pdfTask=null, pdfRender=null, pdfDoc=null, page=1, previewFrom=null;
    let copySeq=0, copyControl=null, copying=false, copyData=null, copyRetryStep='', printEvent='', printTimer;
    function currentOwner() { const p=getOwner(); return p?.userId&&p?.coopId ? `${p.userId}:${p.coopId}:${p.revision}` : ''; }
    const owner=currentOwner(), inView=()=>!closed&&owner&&owner===currentOwner()&&mode&&!window.frameElement?.hidden;
    const focusAllowed=()=>document.activeElement===document.body||document.activeElement===preview;
    const status=s=>{ $('archiveStatus').textContent=s; };
    const note=e=>messages[e.message]||'행사 정보를 처리하지 못했습니다. 다시 확인해 주세요.';
    const draftFor=id=>{if(!draft.has(id))draft.set(id,empty());return draft.get(id);};
    const button=(text,fn,css='btn btn-outline-secondary')=>{const b=el('button',text);b.type='button';b.className=css;b.addEventListener('click',fn);return b;};
    function bounded(p,ms=12000,controller){
      let timer;return Promise.race([p,new Promise((_,reject)=>timer=setTimeout(()=>{reject(new Error('TIMEOUT'));controller?.abort();},ms))]).finally(()=>clearTimeout(timer));
    }
    async function rpc(action,event,data={},ctrl=new AbortController()) {
      if(!owner||owner!==currentOwner())throw Error('EVENT_ARCHIVE_ACCESS');
      const result=await bounded(client.rpc(fn,{p_action:action,p_event:event||null,p_data:data}).abortSignal(ctrl.signal),12000,ctrl);
      if(result.error)throw Error(result.error.code==='42501'?'EVENT_ARCHIVE_ACCESS':result.error.message);
      return result.data;
    }
    function invalidate(){ readSeq++;control?.abort();control=null;busyRead=false; }
    function actions(){
      $('archiveMore').hidden=!more;$('archiveMore').disabled=busyRead;
      $('archiveReload').disabled=busyRead;
      for(const b of archive.querySelectorAll('form [type="submit"]'))b.disabled=writing || busyRead;
      book.disabled=!!(active && (!lastDetail || !lastDetail.guestbook_id));
      $('archiveChecklistReuse').disabled=writing||busyRead||!lastDetail;
      $('archiveChecklistPrintOpen').disabled=busyRead||!lastDetail?.checklist?.length;
      copyConfirm.disabled=writing||busyRead||!copyData?.labels?.length;
    }
    function setBasics(d){for(const key of keys){const input=basics.elements[key],value=d[key]||'';if(input.value!==value)input.value=value;}}
    function remember(){
      if(!active||(!lastDetail&&active!=='new'))return;
      const d=draftFor(active);
      Object.assign(d,basicsOf(Object.fromEntries(new FormData(basics))),{label:checkForm.elements.label.value,kind:fileForm.elements.kind.value});
    }
    function list(){
      const rows=events.map(item=>{const b=button('',()=>select(item.id),'archive-row'); b.setAttribute('aria-current',String(item.id===active));
        b.append(el('strong',item.title),el('span',`${item.starts_on} ~ ${item.ends_on} · ${item.venue}`)); return b;});
      $('archiveEventList').replaceChildren(...(rows.length?rows:[el('p','등록된 행사가 없습니다.')]));
    }
    function fields(id,detail){
      const d=draftFor(id);
      if(detail&&!d.loaded){Object.assign(d,basicsOf(detail),{rev:detail.revision,loaded:true,base:basicsOf(detail)});}
      setBasics(d);if(checkForm.elements.label.value!==d.label)checkForm.elements.label.value=d.label;fileForm.elements.kind.value=d.kind;
      if((fileForm.elements.file.files[0]||null)!==d.file){
        fileForm.elements.file.value='';
        if(d.file){try{const t=new DataTransfer();t.items.add(d.file);fileForm.elements.file.files=t.files;}catch{}}
      }
      $('archiveSelectedFile').textContent=d.file?.name||'';
      $('archiveHeading').textContent=detail?.title||'새 행사';
      contents.hidden=!detail;lastDetail=detail||null;
      if(detail) draw(detail);else hideBook();
      applySection();
      actions();
    }
    function hideBook(){book.hidden=true;delete book.dataset.guestbookId;}
    function applySection(){
      const check=!!lastDetail&&draftFor(active).section==='checklist';
      $('archiveSectionNav').hidden=!lastDetail;
      basics.hidden=check||(!lastDetail&&active!=='new');
      $('archiveInfoPane').hidden=check;$('archiveChecklistPane').hidden=!check;
      $('archiveInfoMenu').setAttribute('aria-pressed',String(!check));
      $('archiveChecklistMenu').setAttribute('aria-pressed',String(check));
    }
    function chooseSection(section){if(!inView()||!lastDetail)return;remember();draftFor(active).section=section;applySection();}
    $('archiveInfoMenu').addEventListener('click',()=>chooseSection('info'));
    $('archiveChecklistMenu').addEventListener('click',()=>chooseSection('checklist'));
    function draw(detail){
      const checklist=Array.isArray(detail.checklist)?detail.checklist:[], files=Array.isArray(detail.files)?detail.files:[];
      $('archiveChecklist').replaceChildren(...checklist.map(item=>el('li',item.label)));
      $('archiveChecklistEmpty').hidden=checklist.length>0;
      $('archiveChecklistResult').textContent=draftFor(active).copyResult;
      $('archiveFiles').replaceChildren(...files.map(file=>{const row=el('div','');row.className='archive-line';const group=el('div','');group.className='archive-bar';
        const view=button('미리보기',e=>void useFile(file,true,e.currentTarget));const download=button('다운로드',e=>void useFile(file,false,e.currentTarget));
        view.setAttribute('aria-label',`${file.name} 미리보기`);download.setAttribute('aria-label',`${file.name} 다운로드`);
        group.append(view,download);row.append(el('span',`${labels[file.kind]||'자료'} · ${file.name}`),group);return row;}));
      const linked=uuid.test(detail.guestbook_id||'');
      hideBook();
      if(linked){book.dataset.guestbookId=detail.guestbook_id;book.hidden=false;}
      $('archiveReceipts').textContent=linked?`누적 접수 ${Number(detail.receipt_count||0).toLocaleString('ko-KR')}건`:'연결된 방명록이 없습니다.';
      const unlinked=Array.isArray(detail.guestbooks)?detail.guestbooks.filter(x=>uuid.test(x.id)):[];
      linkForm.hidden=linked||unlinked.length===0;
      linkForm.elements.book.replaceChildren(new Option('방명록 선택',''),...unlinked.map(x=>new Option(x.title,x.id)));
    }
    async function read(id=active,append=false){
      if(!inView() || (append && busyRead))return;
      invalidate(); const seq=readSeq; const ctrl=control=new AbortController();busyRead=true;actions();
      const usable=()=>inView()&&seq===readSeq&&active===id;
      if(!append)status('행사 정보를 불러오는 중입니다.');
      try {
        const data=await rpc('list',null,{offset:append?events.length:0},ctrl);
        if(!usable())return;
        if(!Array.isArray(data))throw Error('INVALID_RESPONSE');
        more=data.length===50;
        events=append?[...new Map([...events,...data].map(x=>[x.id,x])).values()]:data;
        list();
        if(id && id!=='new' && !append){
          const detail=await rpc('detail',id,{},ctrl); if(!usable())return;
          if(detail?.id!==id)throw Error('INVALID_RESPONSE');
          remember();const d=draftFor(id);
          if(d.base && keys.every(k=>d[k]===d.base[k]))d.loaded=false;
          fields(id,detail);
        }else if(!id){status('');return;}
        status('');
      } catch(e){if(usable()){
        if(e.message==='EVENT_ARCHIVE_ACCESS'){events=[]; $('archiveEventList').replaceChildren(); contents.hidden=true;hideBook();lastDetail=null;applySection();closeChecklistDialogs();}
        status(note(e));
      }} finally {if(usable()){busyRead=false;actions();}}
    }
    function select(id){
      if(!inView() || (id!=='new'&&!uuid.test(id)) || (active===id&&busyRead))return;
      remember();invalidate();closePreview(false);closeChecklistDialogs();active=id;lastDetail=null;hideBook();applySection();
      if(id==='new'){fields(id,null);list();status('');}
      else {basics.hidden=true;contents.hidden=true;list();void read(id);}
    }
    async function mutate(op,onOk){
      if(writing||busyRead||!inView()||!active)return;
      const id=active, seq=readSeq; writing=true;actions();status('저장 중입니다.');
      const same=()=>inView()&&active===id&&seq===readSeq;
      try{const result=await op(id);if(same()){await onOk?.(result,id);if(inView())void read(active);}}
      catch(e){if(same())status(note(e));}
      finally{writing=false;if(inView())actions();}
    }
    basics.addEventListener('submit',event=>{
      event.preventDefault(); if(!basics.reportValidity())return;
      remember();const id=active,d=draftFor(id),values=basicsOf(d);
      if(values.ends_on<values.starts_on){status('종료일은 시작일보다 빠를 수 없습니다.');return;}
      const request=id==='new'?(d.createId||=crypto.randomUUID()):id;
      const action=id==='new'?'create':'update';
      void mutate(()=>rpc(action,request,{...values,revision:d.rev}),(result)=>{
        remember();const unchanged=keys.every(k=>d[k]===values[k]);
        d.rev=result.revision; d.base=basicsOf(result);d.loaded=!unchanged;
        if(id==='new'){draft.delete(id);draft.set(result.id,d);active=result.id;}
      });
    });
    checkForm.addEventListener('submit',event=>{
      event.preventDefault(); if(!lastDetail||$('archiveChecklistPane').hidden||!checkForm.reportValidity())return;
      const d=draftFor(active), label=checkForm.elements.label.value.trim();if(!label)return;
      const tag=JSON.stringify([label]);if(tag!==d.lastCheck){d.checkId=crypto.randomUUID();d.lastCheck=tag;}
      void mutate(id=>rpc('check_add',id,{id:d.checkId,label}),()=>{
        if(checkForm.elements.label.value.trim()===label){checkForm.elements.label.value='';d.label='';d.lastCheck=null;}
      });
    });
    function copyStatus(text,retry=''){
      $('archiveChecklistCopyStatus').textContent=text;copyRetryStep=retry;copyRetry.hidden=!retry;
    }
    function invalidateCopy(){copySeq++;copyControl?.abort();copyControl=null;copyData=null;actions();}
    function closeCopy(){invalidateCopy();source.replaceChildren();$('archiveChecklistSourceItems').replaceChildren();copyStatus('');if(copy.open)copy.close();}
    function stopPrinting(){clearTimeout(printTimer);paper.classList.remove('archive-checklist-printing');printGo.disabled=false;}
    function closePrint(){stopPrinting();printEvent='';$('archiveChecklistPrintItems').replaceChildren();if(paper.open)paper.close();}
    function closeChecklistDialogs(){if(copy.open)closeCopy();if(paper.open)closePrint();}
    async function readCopy(step){
      if(!copy.open||!inView()||!active||copying)return;
      invalidateCopy();const seq=copySeq,id=active,source_id=source.value;
      const same=()=>copy.open&&inView()&&seq===copySeq&&active===id;
      $('archiveChecklistSourceItems').replaceChildren();
      if(step==='source'&&!uuid.test(source_id)){copyStatus('');return;}
      copyStatus('불러오는 중입니다.');
      if(step==='list')source.disabled=true;
      try{
        const ctrl=copyControl=new AbortController();
        const data=await rpc(step==='list'?'checklist_sources':'checklist_source',id,{source_id},ctrl);
        if(!same())return;
        if(step==='list'){
          const rows=Array.isArray(data)?data.filter(x=>x.id!==id&&uuid.test(x.id||'')):[];
          source.replaceChildren(new Option('행사 선택',''),...rows.map(x=>new Option(`${x.title} · ${x.starts_on}`,x.id)));
          copyStatus(rows.length?'':'체크리스트를 가져올 다른 행사가 없습니다.');
        }else{
          if(data?.id!==source_id||!Array.isArray(data.labels)||!data.labels.every(x=>typeof x==='string')||!/^[a-f0-9]{64}$/.test(data.digest||''))throw Error('INVALID_RESPONSE');
          copyData=data;
          $('archiveChecklistSourceItems').replaceChildren(...data.labels.map(label=>el('li',label)));
          copyStatus(data.labels.length?'':'가져올 준비물이 없습니다.');
        }
      }catch(e){if(same())copyStatus(note(e),e.message==='EVENT_ARCHIVE_ACCESS'?'':step);}
      finally{if(same()){copyControl=null;source.disabled=false;actions();}}
    }
    $('archiveChecklistReuse').addEventListener('click',()=>{
      if(!inView()||!lastDetail||writing||busyRead||copy.open)return;
      $('archiveChecklistCopyInto').textContent=`${lastDetail.title} 행사에 추가합니다.`;
      copy.showModal();void readCopy('list');
    });
    source.addEventListener('change',()=>void readCopy('source'));
    copyRetry.addEventListener('click',()=>void readCopy(copyRetryStep));
    $('archiveChecklistCopyClose').addEventListener('click',closeCopy);
    copy.addEventListener('cancel',e=>{e.preventDefault();closeCopy();});
    copyConfirm.addEventListener('click',async()=>{
      if(!copy.open||!inView()||!lastDetail||!copyData?.labels?.length||writing||busyRead)return;
      const id=active,data=copyData,seq=copySeq;
      const same=()=>copy.open&&inView()&&active===id&&seq===copySeq;
      writing=copying=true;source.disabled=true;actions();copyStatus('가져오는 중입니다.');
      try{
        const result=await rpc('checklist_copy',id,{source_id:data.id,digest:data.digest});
        if(!Number.isInteger(result?.added)||result.added<0)throw Error('INVALID_RESPONSE');
        if(same()){
          draftFor(id).copyResult=result.added?`준비물 ${result.added}개를 가져왔습니다.`:'추가할 준비물이 없습니다.';
          closeCopy();void read(id);
        }else if(inView()&&active===id&&lastDetail)void read(id);
      }catch(e){if(same()){
        if(e.message==='EVENT_ARCHIVE_CHECKLIST_CHANGED'||e.message==='EVENT_ARCHIVE_ACCESS')copyData=null;
        copyStatus(note(e),e.message==='EVENT_ARCHIVE_CHECKLIST_CHANGED'?'source':'');
      }}finally{writing=copying=false;if(copy.open)source.disabled=false;if(inView())actions();}
    });
    $('archiveChecklistPrintOpen').addEventListener('click',()=>{
      if(!inView()||busyRead||!lastDetail?.checklist?.length||paper.open)return;
      printEvent=active;$('archiveChecklistPrintEvent').textContent=lastDetail.title;
      $('archiveChecklistPrintDates').textContent=lastDetail.starts_on===lastDetail.ends_on?lastDetail.starts_on:`${lastDetail.starts_on} ~ ${lastDetail.ends_on}`;
      $('archiveChecklistPrintItems').replaceChildren(...lastDetail.checklist.map(item=>el('li',item.label)));
      paper.showModal();
    });
    $('archiveChecklistPrintClose').addEventListener('click',closePrint);
    paper.addEventListener('cancel',e=>{e.preventDefault();closePrint();});
    printGo.addEventListener('click',()=>{
      if(!paper.open||!inView()||busyRead||printEvent!==active||printGo.disabled)return;
      printGo.disabled=true;paper.classList.add('archive-checklist-printing');
      printTimer=setTimeout(stopPrinting,120000);
      try{window.print();}catch{stopPrinting();}
    });
    window.addEventListener('afterprint',stopPrinting);
    fileForm.elements.file.addEventListener('change',()=>{
      if(!active)return;const d=draftFor(active);d.file=fileForm.elements.file.files[0]||null;
      $('archiveSelectedFile').textContent=d.file?.name||'';
    });
    fileForm.addEventListener('submit',event=>{
      event.preventDefault(); if(!active)return;
      const d=draftFor(active), file=d.file, kind=fileForm.elements.kind.value;
      const ext=file?.name.split('.').pop().toLowerCase(), mime=versions[ext];
      if(!mime||file.size<1||file.size>10485760){status('10MB 이하의 PDF, PNG, JPG, WebP 파일을 선택해 주세요.');return;}
      void mutate(async id=>{
        const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
        const reserved=await rpc('file_reserve',id,{id:crypto.randomUUID(),name:file.name,kind,mime,bytes:file.size,digest});
        if(reserved.ready===true)return;
        if(!validPath(reserved.path,id,reserved.id))throw Error('EVENT_ARCHIVE_ACCESS');
        try {await rpc('file_commit',id,{id:reserved.id});return;} catch(e){if(e.message!=='EVENT_ARCHIVE_UPLOAD_PENDING')throw e;}
        if(owner!==currentOwner())throw Error('EVENT_ARCHIVE_ACCESS');
        // The installed upload wrapper verifies bytes and obtains a short storage capability.
        const put=await bounded(client.storage.from(bucket).upload(reserved.path,file,{upsert:false,contentType:mime,cacheControl:'0'}),30000);
        if(put.error){try{await rpc('file_commit',id,{id:reserved.id});return;}catch{throw Error('EVENT_ARCHIVE_UPLOAD_PENDING');}}
        await rpc('file_commit',id,{id:reserved.id});
      },()=>{if(d.file===file){d.file=null;fileForm.elements.file.value='';$('archiveSelectedFile').textContent='';}});
    });
    linkForm.addEventListener('submit',event=>{
      event.preventDefault(); const guestbook_id=linkForm.elements.book.value;if(uuid.test(guestbook_id))void mutate(id=>rpc('guestbook_link',id,{guestbook_id}));
    });
    function validPath(path,id,fileId) {
      const [c,e,kind,f,extra]=String(path||'').split('/');
      return !extra&&c===getOwner()?.coopId&&e===id&&kind==='event_archive'&&uuid.test(fileId||'')&&new RegExp(`^${fileId}\\.(pdf|png|jpg|webp)$`,'i').test(f||'');
    }
    function closePreview(focus=true){
      previewSeq++;pdfRender?.cancel();pdfRender=null;void pdfTask?.destroy().catch(()=>{});pdfTask=null;pdfDoc=null;
      if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl='';$('archivePreviewBody').replaceChildren();$('archivePdfActions').hidden=true;
      const from=previewFrom;previewFrom=null;
      if(preview.open)preview.close();if(focus&&inView()&&focusAllowed()&&from?.isConnected)from.focus({preventScroll:true});
    }
    async function pdfPage(n,seq){
      if(!pdfDoc||n<1||n>pdfDoc.numPages||seq!==previewSeq||!inView())return;
      const doc=pdfDoc;page=n;pdfRender?.cancel();
      const content=$('archivePreviewBody'), canvas=document.createElement('canvas');content.replaceChildren(canvas);
      const renderPage=await doc.getPage(n);if(seq!==previewSeq||page!==n||!preview.open)return;
      const scale=renderPage.getViewport({scale:1});
      const viewport=renderPage.getViewport({scale:Math.min(1.5,1050/scale.width,1400/scale.height)});
      canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);canvas.setAttribute('aria-label',`PDF ${n}쪽`);
      pdfRender=renderPage.render({canvas,canvasContext:canvas.getContext('2d'),viewport,background:'#fff'});
      await pdfRender.promise; if(seq!==previewSeq||page!==n||!preview.open)return;
      $('archivePdfPage').textContent=`${n} / ${doc.numPages}`;$('archivePdfPrev').disabled=n<=1;$('archivePdfNext').disabled=n>=doc.numPages;
      $('archivePdfActions').hidden=doc.numPages<=1;
    }
    async function useFile(file,show,from){
      const id=active;
      if(!inView()||!validPath(file.path,id,file.id)||!Object.values(versions).includes(file.mime)||from.disabled)return;
      const readAt=readSeq;const same=()=>inView()&&active===id&&readAt===readSeq;
      let seq;
      from.disabled=true;
      if(show){closePreview(false);seq=previewSeq;previewFrom=from;$('archivePreviewTitle').textContent=file.name;
        $('archivePreviewBody').replaceChildren(el('p','자료를 불러오는 중입니다.'));preview.showModal();}
      const still=()=>same()&&(!show||(seq===previewSeq&&preview.open));
      try{
        const result=await bounded(client.storage.from(bucket).download(file.path),18000);
        const blob=result.data;if(!still())return;
        if(result.error||!blob||blob.size!==file.bytes||blob.size>10485760)throw Error('INVALID_FILE');
        if(!show){const href=URL.createObjectURL(blob);const a=el('a','');a.href=href;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);return;}
        if(file.mime!=='application/pdf'){
          imageUrl=URL.createObjectURL(new Blob([blob],{type:file.mime}));const image=el('img','');image.src=imageUrl;image.alt=file.name;$('archivePreviewBody').replaceChildren(image);return;
        }
        const pdf=await import('/shared/vendor/pdfjs/pdf.mjs');if(!still())return;
        pdf.GlobalWorkerOptions.workerSrc='/shared/vendor/pdfjs/pdf.worker.mjs';
        const data=new Uint8Array(await blob.arrayBuffer());if(!still())return;
        const task=pdfTask=pdf.getDocument({data,cMapUrl:'/shared/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/shared/vendor/pdfjs/standard_fonts/',wasmUrl:'/shared/vendor/pdfjs/wasm/',isEvalSupported:false,enableXfa:false});
        const document=await bounded(task.promise,12000);if(!still())return;
        if(document.numPages>100)throw Error('INVALID_FILE');pdfDoc=document;await pdfPage(1,seq);
      }catch(e){if(still()){
        if(show)$('archivePreviewBody').replaceChildren(el('p','미리보기를 열지 못했습니다. 자료를 내려받아 확인해 주세요.'));
        else status('자료를 내려받지 못했습니다. 다시 시도해 주세요.');
      }}finally{from.disabled=false;}
    }
    function turnPage(n){const seq=previewSeq;void pdfPage(n,seq).catch(e=>{if(seq===previewSeq&&e?.name!=='RenderingCancelledException')$('archivePreviewBody').replaceChildren(el('p','이 쪽을 표시하지 못했습니다.'));});}
    $('archivePdfPrev').addEventListener('click',()=>turnPage(page-1));$('archivePdfNext').addEventListener('click',()=>turnPage(page+1));
    $('archivePreviewClose').addEventListener('click',()=>closePreview());preview.addEventListener('cancel',e=>{e.preventDefault();closePreview();});
    function toggle(next,focus=false){
      if(closed||owner!==currentOwner())return;
      if(next===mode)return;
      remember();invalidate(); closePreview(false);closeChecklistDialogs();if(next)onEducationLeave?.();mode=next;edu.hidden=mode;archive.hidden=!mode;
      for(const [tab,on] of [[educationTab,!mode],[archiveTab,mode]]){tab.setAttribute('aria-selected',String(on));tab.tabIndex=on?0:-1;}
      if(mode){if(active==='new')fields(active,null);void read();}
      if(focus)(mode?archiveTab:educationTab).focus();
    }
    educationTab.addEventListener('click',()=>toggle(false));archiveTab.addEventListener('click',()=>toggle(true));
    tabs.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();toggle(e.key==='Home'?false:e.key==='End'?true:!mode,true);}});
    $('archiveNew').addEventListener('click',()=>select('new'));$('archiveReload').addEventListener('click',()=>void read());
    $('archiveMore').addEventListener('click',()=>void read(active,true));
    const leave=()=>{remember();invalidate();closePreview(false);closeChecklistDialogs();};
    window.addEventListener('pagehide',leave);
    const observer=window.frameElement?new MutationObserver(()=>{if(window.frameElement.hidden)leave();else if(mode)void read();}):null;
    observer?.observe(window.frameElement,{attributes:true,attributeFilter:['hidden']});
    edu.setAttribute('role','tabpanel');edu.setAttribute('aria-labelledby',educationTab.id);tabs.hidden=false;hideBook();
    return ()=>{closed=true;leave();observer?.disconnect();window.removeEventListener('pagehide',leave);window.removeEventListener('afterprint',stopPrinting);draft.clear();lastDetail=null;events=[];tabs.hidden=true;archive.hidden=true;edu.hidden=false;hideBook();
      basics.reset();checkForm.reset();fileForm.reset();for(const id of ['archiveEventList','archiveChecklist','archiveFiles','archiveSelectedFile','archiveHeading','archiveReceipts','archiveStatus'])$(id).replaceChildren();};
  }
  window.CoopEventArchive=Object.freeze({start,version:'1.1.0'});
})();
