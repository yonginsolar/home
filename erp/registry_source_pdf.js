/* 0.3.2 · 기존 회의·공문 인쇄 서식 → 브라우저 안 PDF. 저장·발송·인쇄 없음. */
(function(root){
 'use strict';
 const toolFlights=new WeakMap();
 function tools(target=root){
  if(typeof target.html2pdf==='function')return Promise.resolve();
  if(!toolFlights.has(target)){const pending=new Promise((resolve,reject)=>{const s=target.document.createElement('script');let done=false;const finish=error=>{if(done)return;done=true;clearTimeout(timer);if(error){s.remove();reject(Error('문서 PDF 도구를 불러오지 못했습니다. 다시 눌러 주세요.'));}else resolve();};const timer=setTimeout(()=>finish(true),15000);s.src='/erp/assets/vendor/html2pdf-0.10.1.bundle.min.js';s.integrity='sha512-GsLlZN/3F2ErC5ifS5QtgpiJtWd43JWSuIgh7mbzZ8zBps+dvLusV+eNQATqgA/HdeKFVgA5v3S/cIrLF7QnIg==';s.crossOrigin='anonymous';s.referrerPolicy='no-referrer';s.onload=()=>finish(typeof target.html2pdf!=='function');s.onerror=()=>finish(true);target.document.head.append(s);}).catch(e=>{toolFlights.delete(target);throw e;});toolFlights.set(target,pending);}return toolFlights.get(target);
 }
 function paginate(height,pageHeight,boxes,forced=[]){
  if(forced.some(n=>boxes.some(b=>b.top<n-.5&&b.bottom>n+.5)))throw Error('선택 문서의 강제 페이지 경계를 확인해 주세요.');
  const pages=[];let start=0;while(start<height-0.5){if(pages.length>=150)throw Error('선택 문서의 페이지가 너무 많습니다.');let end=Math.min(height,start+pageHeight);const next=forced.filter(n=>n>start+1&&n<end).sort((a,b)=>a-b)[0];if(next!==undefined)end=next;let previous;do{previous=end;for(const b of boxes)if(b.top>start+1&&b.top<end-.5&&b.bottom>end+.5)end=Math.min(end,b.top);}while(end<previous-.1);if(end-start<1)throw Error('선택 문서의 페이지 경계를 확인해 주세요.');pages.push({start,end});start=end;}return pages;
 }
 async function create(client,source,options){
  const {coop,signal,current,verify}=options;let frame=null,stopped=false,worker=null,timer;const resources=[],waits=new Set();
  const check=()=>{if(stopped||signal?.aborted||!current())throw Error('첨부 준비가 취소되었습니다.');};
  function bounded(promise,ms=15000){return new Promise((resolve,reject)=>{let done=false;const finish=(error,value)=>{if(done)return;done=true;clearTimeout(clock);waits.delete(cancel);error?reject(error):resolve(value);},cancel=()=>finish(Error('첨부 준비가 취소되었습니다.')),clock=setTimeout(()=>finish(Error('선택 문서 준비가 지연됩니다. 다시 눌러 주세요.')),ms);waits.add(cancel);Promise.resolve(promise).then(v=>finish(null,v),e=>finish(e));if(stopped||signal?.aborted)cancel();});}
  async function read(q){check();const r=await bounded(q.abortSignal?q.abortSignal(signal):q);check();if(r.error)throw Error('선택 문서의 출력 자료를 읽을 수 없습니다.');return r.data;}
  async function rows(table,columns,filter=q=>q){const out=[];for(let offset=0;offset<100000;offset+=500){let q=client.from(table).select(columns).eq('coop_id',coop);q=filter(q);const r=await read(q.order('id').range(offset,offset+499));if(!Array.isArray(r)||r.some(x=>x.coop_id&&x.coop_id!==coop))throw Error('문서 출력 자료의 조합을 확인해 주세요.');out.push(...r);if(r.length<500)return out;}throw Error('문서 출력 자료 전체를 확인하지 못했습니다.');}
  async function image(bucket,path){
   check();if(!['attachments','assets','signature-previews','meeting-package-files'].includes(bucket)||!path||path.split('/').some(x=>x==='.'||x==='..')||/[\\\x00-\x1f]/.test(path))throw Error('문서 이미지의 저장 경로를 확인해 주세요.');
   const r=await bounded(client.storage.from(bucket).download(path));check();if(r.error||!r.data||r.data.size>5242880||!/^image\/(png|jpeg|webp)$/.test(r.data.type))throw Error('문서의 이미지·서명 원본을 읽을 수 없습니다.');
   const bytes=new Uint8Array(await r.data.arrayBuffer());resources.push(bytes);check();return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>{try{check();resolve(String(reader.result));}catch(e){reject(e);}};reader.onerror=()=>reject(Error('문서 이미지를 준비하지 못했습니다.'));reader.readAsDataURL(new Blob([bytes],{type:r.data.type}));});
  }
  async function resolveImage(raw){
   const value=String(raw||'').trim();if(/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(value)&&value.length<8000000)return value;
   if(value.startsWith('https://')){const u=new URL(value);if(u.origin!=='https://ifdqlwxgqgsvnawmhlfc.supabase.co'||u.username||u.password)throw Error('외부 이미지가 포함되어 문서를 준비할 수 없습니다.');const m=u.pathname.match(/^\/storage\/v1\/object\/(?:public|sign)\/(attachments|assets|signature-previews|meeting-package-files)\/(.+)$/);if(!m)throw Error('문서 이미지의 저장 경로를 확인해 주세요.');return image(m[1],decodeURIComponent(m[2]));}
   const f=root.CoopRegistryDocumentSources.storageFile(value);return image(f.bucket,f.path);
  }
  const cleanup=()=>{stopped=true;for(const cancel of [...waits])cancel();frame?.remove();frame=null;for(const bytes of resources)bytes.fill(0);resources.length=0;if(worker?.prop?.canvas){worker.prop.canvas.width=1;worker.prop.canvas.height=1;}worker=null;};signal?.addEventListener('abort',cleanup,{once:true});
  try{
   check();await verify();check();if(source.coop_id!==coop)throw Error('문서의 조합을 확인해 주세요.');
   let officialRows=[],signatures=[],signatureSnapshot='',approval=source.table==='ref_approval'?source:null,linkedRevision='',sealRecord=null;
   const linkedApproval=()=>read(client.from('ref_approval').select('id,coop_id,title,content,created_at,processed_at,status,doc_type,doc_no,receiver,via,drafter_id,drafter_name,approval_line').eq('coop_id',coop).eq('id',source.source_approval_id).limit(2));
   const signatureRows=()=>rows('doc_signatures','id,coop_id,official_id,signature_url,signed_at',q=>q.eq('minute_id',source.id));
   if(source.table==='minutes'&&source.requires_sign){
    officialRows=await rows('coop_officials','id,coop_id,member_id,name,role,category,status');
    officialRows=Array.isArray(source.signer_ids)&&source.signer_ids.length?officialRows.filter(o=>source.signer_ids.map(String).includes(String(o.id))):officialRows.filter(o=>!o.status||o.status==='active');
    signatures=await signatureRows();signatureSnapshot=JSON.stringify(signatures);
   }
   if(source.table==='coop_notices'&&source.source_approval_id){const data=await linkedApproval();if(data?.length!==1||data[0].doc_type!=='공문'||!['완료','실물결재완료'].includes(data[0].status))throw Error('소집공고의 완료 결재 문서를 확인해 주세요.');approval=data[0];linkedRevision=JSON.stringify(data);}
   let company;
   const service={
    async createSignedUrl(bucket,path){return{data:{signedUrl:await image(bucket,decodeURIComponent(String(path).split('?')[0]))}};},
    async getEmployeePositionByEmpId(id){check();const r=await bounded(client.from('ref_employees').select('position').eq('coop_id',coop).eq('emp_id',id).limit(2).abortSignal(signal));check();return{data:!r.error&&r.data?.length===1?r.data[0].position:''};},
    async getCompanyInfo(){if(company)return{data:company};const data=await read(client.from('ref_company_info').select('key,value').eq('coop_id',coop)),info=Object.fromEntries((data||[]).map(r=>[r.key,r.value]));company={...info,company_name:info.company_name||info.orgName||'',address:info.company_address||info.address||'',phone:info.company_contact_phone||info.phone||'',email:info.company_email||info.email||'',homepage:info.homepage||info.homepage_url||info.website||info.site_url||''};return{data:company};},
    async getOfficialSealUrl(){const config=await read(client.rpc('erp_coop_certificate_setup',{p_action:'get',p_data:{}}));if(config?.coop_id!==coop)throw Error('소집공고 직인의 조합을 확인해 주세요.');sealRecord=[config.coop_id,config.seal_path,config.seal_revision];return config.seal_path?resolveImage(config.seal_path):'';}
   };
   const templates=root.CoopMinutesPrintTemplates.create({allOfficials:officialRows,MinutesService:service});
   if(source.requires_sign&&(!templates.complete(source,signatures)||templates.required(source).some(id=>!officialRows.some(o=>String(o.id)===String(id)))))throw Error('선택한 의사록의 필수 전자서명이 완료되지 않았습니다.');
   let html=source.table==='minutes'&&source.doc_type!=='NOTICE'?await templates.minute(source,signatures):await templates.notice(approval||{},source.table==='ref_approval'?null:source);
   check();const parsed=new DOMParser().parseFromString(html,'text/html');for(const img of parsed.images)img.setAttribute('src',await resolveImage(img.getAttribute('src')));
   for(const n of parsed.querySelectorAll('script,iframe,object,embed,link,meta,base'))n.remove();for(const n of parsed.querySelectorAll('*'))for(const a of [...n.attributes])if(a.name.startsWith('on')||a.name==='srcset'||a.name==='href')n.removeAttribute(a.name);
   if([...parsed.querySelectorAll('style,[style]')].some(n=>/url\s*\(|@import/i.test(n.tagName==='STYLE'?n.textContent:n.getAttribute('style'))))throw Error('문서의 외부 배경 이미지를 확인해 주세요.');
   const signatureBlock=parsed.querySelector('.content')?.nextElementSibling;if(signatureBlock?.querySelector('img'))signatureBlock.classList.add('registry-print-keep');
   const css=document.createElement('style');css.textContent='@font-face{font-family:RegistryPrint;src:url(/erp/assets/hr-forms/NanumGothic-Regular.ttf)}html,body{background:white!important;color:#111827!important}body{width:182mm!important;margin:0!important;padding:0!important;font-family:RegistryPrint,sans-serif!important;font-size:11pt!important}body *{font-family:RegistryPrint,sans-serif!important;font-size:11pt!important}h1{font-size:18pt!important}h2{font-size:15pt!important}.print-cert-sheet{break-before:always}.print-cert-sheet-meta{display:block}.cert-sheet-sign-image{width:60px;height:60px;object-fit:contain}.registry-print-keep,.print-head,.print-foot,.content p,.print-notice-wrap p,tr,img{break-inside:avoid}';parsed.head.append(css);
   const csp=document.createElement('meta');csp.httpEquiv='Content-Security-Policy';csp.content="default-src 'none'; script-src 'self'; img-src data:; style-src 'unsafe-inline'; font-src 'self'; form-action 'none'; connect-src 'none';";parsed.head.prepend(csp);
   check();frame=document.createElement('iframe');frame.title='선택 문서 PDF 준비';frame.setAttribute('aria-hidden','true');frame.setAttribute('sandbox','allow-same-origin allow-scripts');frame.tabIndex=-1;frame.style.cssText='position:fixed;left:-20000px;top:0;width:794px;height:1123px;border:0;pointer-events:none';
   await bounded(new Promise((resolve,reject)=>{frame.onload=resolve;frame.onerror=()=>reject(Error('문서 PDF 준비 화면을 열 수 없습니다.'));frame.srcdoc=parsed.documentElement.outerHTML;document.body.append(frame);}));check();const doc=frame.contentDocument;
   await bounded(tools(frame.contentWindow));check();await bounded(doc.fonts.ready);check();await bounded(Promise.all([...doc.images].map(img=>img.decode().catch(()=>{throw Error('문서 이미지를 준비하지 못했습니다.');}))));check();
   if(doc.body.scrollHeight>14000||[...doc.querySelectorAll('.content p,.content table tr,.print-notice-wrap p,.print-notice-wrap table tr,img')].some(n=>n.getBoundingClientRect().height>990))throw Error('선택 문서의 긴 문단·표는 원본 PDF가 필요합니다.');
   const rendering=(async()=>{
    // 같은 프레임에서 한 번 렌더하고 실제 문단·표·서명 경계로 자른다.
    // html2pdf의 자동 padding/분할은 사용하지 않아 글자와 서명이 쪼개지지 않게 한다.
    const settings=frame.contentWindow.JSON.parse(JSON.stringify({margin:[16,14,18,14],enableLinks:false,html2canvas:{scale:2,useCORS:false,allowTaint:false,logging:false,windowWidth:794,scrollX:0,scrollY:0},jsPDF:{unit:'mm',format:'a4',orientation:'portrait',compress:true},pagebreak:{mode:[]}}));worker=frame.contentWindow.html2pdf().set(settings).from(doc.body);await worker.toContainer();check();const container=worker.prop.container,bounds=container.getBoundingClientRect(),pageHeight=bounds.width*263/182,boxes=[...container.querySelectorAll('p,h1,h2,h3,h4,h5,h6,tr,img,.registry-print-keep,.registry-print-keep>div>div,.print-head,.print-foot')].map(n=>{const r=n.getBoundingClientRect();return{top:r.top-bounds.top,bottom:r.bottom-bounds.top};}).filter(r=>r.bottom-r.top>0&&r.bottom-r.top<pageHeight),forced=[...container.querySelectorAll('.print-cert-sheet')].map(n=>n.getBoundingClientRect().top-bounds.top);
    for(const heading of container.querySelectorAll('h1,h2,h3,h4,h5,h6')){const next=heading.nextElementSibling;if(!next)continue;const top=heading.getBoundingClientRect().top-bounds.top,bottom=next.getBoundingClientRect().bottom-bounds.top;if(bottom-top<pageHeight)boxes.push({top,bottom});}
    await worker.toCanvas();check();const canvas=worker.prop.canvas,ratio=canvas.width/bounds.width,cuts=paginate(canvas.height/ratio,pageHeight,boxes,forced);await root.CoopRegistryPdf.tools();check();const pdf=await root.PDFLib.PDFDocument.create(),mm=72/25.4;
    for(const cut of cuts){check();const top=Math.max(0,Math.floor(cut.start*ratio)),bottom=Math.min(canvas.height,Math.floor(cut.end*ratio)),part=doc.createElement('canvas');part.width=canvas.width;part.height=Math.max(1,bottom-top);const ctx=part.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,part.width,part.height);ctx.drawImage(canvas,0,top,canvas.width,part.height,0,0,canvas.width,part.height);const encoded=part.toDataURL('image/jpeg',.98).split(',')[1],jpeg=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));resources.push(jpeg);part.width=1;part.height=1;const image=await pdf.embedJpg(jpeg);check();const page=pdf.addPage([210*mm,297*mm]),height=image.height/image.width*182*mm;page.drawImage(image,{x:14*mm,y:297*mm-16*mm-height,width:182*mm,height});}
    const bytes=await pdf.save();try{check();return bytes;}catch(e){bytes.fill(0);throw e;}
   })();
   const bytes=await Promise.race([rendering,new Promise((_,reject)=>{timer=setTimeout(()=>{cleanup();reject(Error('선택 문서 PDF 준비가 지연됩니다. 다시 눌러 주세요.'));},30000);})]);
   try{check();if(source.requires_sign&&JSON.stringify(await signatureRows())!==signatureSnapshot)throw Error('준비 중 전자서명이 바뀌었습니다. 다시 확인해 주세요.');if(linkedRevision&&JSON.stringify(await linkedApproval())!==linkedRevision)throw Error('준비 중 소집공고의 결재 문서가 바뀌었습니다. 다시 확인해 주세요.');if(sealRecord){const latest=await read(client.rpc('erp_coop_certificate_setup',{p_action:'get',p_data:{}}));if(JSON.stringify([latest?.coop_id,latest?.seal_path,latest?.seal_revision])!==JSON.stringify(sealRecord))throw Error('준비 중 소집공고 직인이 바뀌었습니다. 다시 확인해 주세요.');}await verify();check();return bytes;}catch(e){bytes.fill(0);throw e;}
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',cleanup);cleanup();}
 }
 root.CoopRegistrySourcePdf=Object.freeze({create,tools,paginate,version:'0.3.2'});
})(typeof window==='undefined'?globalThis:window);
