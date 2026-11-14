/* 0.2.6 · 별지 제7호만 원본 고정 글씨 유지. 입력·별지 최소11pt. */
(function(root){
 'use strict';
 let toolsPending;
 function script(src,test){if(test())return Promise.resolve();return new Promise((resolve,reject)=>{const s=document.createElement('script');let done=false;const finish=error=>{if(done)return;done=true;clearTimeout(timer);if(error){s.remove();reject(Error('PDF 도구를 불러오지 못했습니다. 다시 눌러 주세요.'));}else resolve();};const timer=setTimeout(()=>finish(true),20000);s.src=src;s.onload=()=>finish(!test());s.onerror=()=>finish(true);document.head.append(s);});}
 async function tools(){if(root.PDFLib&&root.fontkit)return;if(!toolsPending)toolsPending=script('/erp/assets/vendor/pdf-lib-1.17.1.min.js',()=>!!root.PDFLib).then(()=>script('/erp/assets/vendor/pdf-fontkit-1.1.1.min.js',()=>!!root.fontkit)).catch(e=>{toolsPending=null;throw e;});return toolsPending;}
 async function load(path){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{const r=await fetch(path,{cache:'force-cache',signal:controller.signal});if(!r.ok)throw Error('공식 서식·글꼴 파일을 불러오지 못했습니다.');return new Uint8Array(await r.arrayBuffer());}finally{clearTimeout(timer);}}
 function wrap(text,font,size,width){const lines=[];let line='';for(const ch of String(text??'')){if(ch==='\n'){lines.push(line);line='';continue;}if(line&&font.widthOfTextAtSize(line+ch,size)>width){lines.push(line);line=ch;}else line+=ch;}if(line||!lines.length)lines.push(line);return lines;}
 async function create(model,provided,scope){
  const check=()=>{if(scope?.signal?.aborted||scope?.current&&!scope.current())throw Error('출력 준비가 취소되었습니다.');};check();
  if(!provided)await tools();const lib=provided?.lib||root.PDFLib,kit=provided?.fontkit||root.fontkit;
  const original=provided?.original||await load('/erp/registry-assets/change-report-20260624.pdf'),fontBytes=provided?.font||await load('/erp/assets/hr-forms/NanumGothic-Regular.ttf');
  check();const source=await lib.PDFDocument.load(original);if(source.getPageCount()!==2)throw Error('공식 서식의 페이지 구성을 확인해 주세요.');
  const doc=await lib.PDFDocument.create();doc.registerFontkit(kit);const font=await doc.embedFont(fontBytes,{subset:false});
  check();const embedded=await doc.embedPages(source.getPages());check();for(const p of embedded){const page=doc.addPage([p.width,p.height]);page.drawPage(p);page.pushOperators(lib.setTextRenderingMode(0));}
  const page=doc.getPages()[0],H=page.getHeight(),D=root.CoopRegistryModel.display,overflow=[];
  function box(text,x,top,width,height,label){const t=String(text??'').trim();if(!t)return;let lines=wrap(t,font,11,width-4);if(lines.length*13>height){overflow.push([label,t]);lines=['별지 참조'];}if(font.widthOfTextAtSize(lines[0],11)>width-4)throw Error('공식 서식의 입력 칸 너비를 확인해 주세요.');lines.forEach((s,i)=>page.drawText(s,{x:x+2,y:H-top-11-i*13,size:11,font}));}
  const d=model.input,provisional=model.annual&&d.asOf&&d.asOf<d.fiscalEnd;
  box('V',179,82,15,15,'조합 구분');
  box(d.applicant,115,185,250,15,'신고인 성명');box(d.applicantBirth||(d.applicantBirthFromSecure?'보안 확인 후 표시':''),375,185,158,15,'신고인 생년월일·법인등록번호');
  box(d.applicantAddress,115,216,250,15,'신고인 주소');box(d.applicantPhone,375,216,158,15,'신고인 전화');
  box(d.companyName,115,248,250,14,'조합명');box(d.companyPhone,375,248,158,14,'조합 전화');box(d.officeAddress,115,275,420,14,'주사무소 소재지');
  box(d.chairName,115,302,250,14,'이사장 성명');box(d.chairIdentity,375,302,158,14,'이사장 식별정보');
  box(d.chairPhone,115,329,250,14,'이사장 전화번호');box(d.companyEmail,375,329,158,14,'이사장 전자우편주소');box(d.chairAddress,115,356,420,14,'이사장 개인 주소');
  // 3월 제출 예시처럼 한 번만 기재한다. 개정된 공식 표의 고정 선·문구는 지우지 않는다.
  box('첨부서류 참조',260,408,270,20,'신고내용');
  if(/^\d{4}-\d{2}-\d{2}$/.test(d.printDate)){const [y,m,day]=d.printDate.split('-');box(y,420,697,32,15,'작성 연도');box(String(Number(m)),466,697,18,15,'작성 월');box(String(Number(day)),498,697,18,15,'작성 일');}
  // 신고인 서명/인과 뒤쪽 행정정보 동의 서명 칸은 의도적으로 비워 둔다.
  function stamp(pg){if(model.draft||provided?.test)pg.drawText(provided?.test?'시험용 · 기관 제출 금지':'작성 중 · 확인 필요',{x:60,y:pg.getHeight()-35,size:11,font,color:lib.rgb(.65,.15,.1)});}
  doc.getPages().forEach(stamp);
  let current,y;
  function newPage(title){current=doc.addPage([595,842]);stamp(current);const change=title.startsWith('변경하려는 내용을 적은 서류'),size=change?15:17;y=change?715:775;current.drawText(title,{x:change?(595-font.widthOfTextAtSize(title,size))/2:45,y,size,font});y=change?657:739;}
  function line(text,size=11){const lines=wrap(text,font,size,505);for(const s of lines){if(y<60)newPage('변경신고 작성자료 · 계속');current.drawText(s,{x:45,y,size,font});y-=size*1.65;}y-=6;}
  newPage('변경하려는 내용을 적은 서류');
  function changeTable(){const width=231.6;function row(cells,heading=false){const lines=cells.map(s=>wrap(s,font,11,width-16)),count=Math.max(...lines.map(a=>a.length));let offset=0;do{if(y<110)newPage('변경하려는 내용을 적은 서류 · 계속');const take=Math.min(count-offset,Math.max(1,Math.floor((y-88)/18))),height=Math.max(30,take*18+14);for(let i=0;i<2;i++){const x=66.1+i*width;current.drawRectangle({x,y:y-height,width,height,borderWidth:.5,borderColor:lib.rgb(.5,.5,.5)});lines[i].slice(offset,offset+take).forEach((s,j)=>current.drawText(s,{x:heading?x+(width-font.widthOfTextAtSize(s,11))/2:x+8,y:y-19-j*18,size:11,font}));}y-=height;offset+=take;}while(offset<count);}
   row(['변경전','변경후'],true);for(const r of model.rows){const unit=r.key==='capital'?'원':r.key==='members'?'명':'',label=r.key==='capital'?'출자금':r.label;row([label+' '+D(r.before)+unit,label+(provisional&&['capital','members'].includes(r.key)?' (현재 집계)':'')+' '+D(r.after)+unit]);}}
  changeTable();y-=20;
  const covered=new Set(['조합명','주사무소 소재지',...model.rows.flatMap(r=>[r.label+' 변경 전',r.label+' 변경 후'])]);
  for(const [label,value]of overflow){if(covered.has(label))continue;line('공식 신고서 별지 참조 · '+label,12);line(value);}
  if(model.annual){newPage('출자금 변동내역 확인서');line('협동조합명: '+D(d.companyName));line('법인등록번호: '+D(d.corporateNumber));line('소재지: '+D(d.officeAddress));line((provisional?'현재 집계 기준일: '+D(d.asOf)+' · '+D(d.fiscalEnd)+' 기말 미확정':'기준일: '+D(d.fiscalEnd))+' · 계산 1좌 금액: '+D(model.unit)+'원 ('+(d.unitSource==='erp_current'?'ERP 현재 설정':d.unitSource==='entered'?'직접 수정':'입력값')+')');
   if(d.membershipSource==='manual')line('조합원 수: 확인한 인원을 직접 입력한 값입니다.');
   const cols=[['before',d.beforeLabel||'변경 전'],['increase','당기 증가'],['decrease','당기 감소'],['after',provisional?'현재 집계 '+D(d.asOf):'기말 '+D(d.fiscalEnd)]];
   function tableRow(cells){const widths=[140,95,100,170],wrapped=cells.map((s,i)=>wrap(s,font,11,widths[i]-12)),height=Math.max(32,...wrapped.map(ls=>ls.length*17+12));if(y-height<80)newPage('출자금 변동내역 확인서 · 계속');let x=45;for(let i=0;i<cells.length;i++){current.drawRectangle({x,y:y-height,width:widths[i],height,borderWidth:.5,borderColor:lib.rgb(.5,.5,.5)});wrapped[i].forEach((s,j)=>current.drawText(s,{x:x+6,y:y-17-j*17,size:11,font}));x+=widths[i];}y-=height;}
   tableRow(['구분','조합원 수','출자좌수','출자금(원)']);for(const [p,label]of cols)tableRow([label+(p==='before'&&d.beforeDate?'\n'+d.beforeDate:''),D(model.values[p+'Members']),D(model.values[p+'Shares']),D(model.values[p+'Capital'])]);y-=22;
   line(provisional?'작성일 현재 집계입니다. 회계연도 말 자료는 아직 확정되지 않았습니다.':'위 출자금 변동사항은 사실과 같음을 확인합니다.');line(D(d.printDate));line(D(d.companyName)+' 이사장 '+D(d.chairName)+' (서명 또는 인)');
  }
  if(model.missing.length||model.warnings.length){newPage('출력 전 확인할 사항');for(const m of model.missing)line('확인 필요: '+m);for(const w of model.warnings)line(w);}
  for(const [i,pg]of doc.getPages().entries())if(i>=2)pg.drawText(String(i+1)+' / '+doc.getPageCount(),{x:500,y:30,size:11,font});
  check();doc.setTitle('시청 변경신고 작성자료');doc.setCreator('협동조합 운영시스템');const bytes=await doc.save();try{check();return bytes;}catch(e){bytes.fill(0);throw e;}
 }
 root.CoopRegistryPdf={create,wrap,tools,version:'0.2.6'};
})(typeof window==='undefined'?globalThis:window);
