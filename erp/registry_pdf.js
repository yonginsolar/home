/* 0.2.13 · 신고내용 한 칸·선택 신고인·이메일 확인서·시청용 명부. */
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
  const original=provided?.original||await load('/erp/registry-assets/change-report-reference-20261114.pdf'),fontBytes=provided?.font||await load('/erp/assets/hr-forms/NanumGothic-Regular.ttf');
  check();const source=await lib.PDFDocument.load(original);if(source.getPageCount()!==2)throw Error('공식 서식의 페이지 구성을 확인해 주세요.');
  const doc=await lib.PDFDocument.create();doc.registerFontkit(kit);const font=await doc.embedFont(fontBytes,{subset:false});
  check();const embedded=await doc.embedPages(source.getPages());check();for(const p of embedded){const page=doc.addPage([p.width,p.height]);page.drawPage(p);page.pushOperators(lib.setTextRenderingMode(0));}
  const page=doc.getPages()[0],H=page.getHeight(),D=x=>x==null?'':typeof x==='number'?x.toLocaleString('ko-KR'):String(x);
  function box(text,x,top,width,height,label){const t=String(text??'').trim();if(!t)return;let lines=wrap(t,font,11,width-4);if(label==='신고인 주소'){lines=[];let line='';for(const ch of t){if(line&&font.widthOfTextAtSize(line+ch,11)>width-4){const at=line.lastIndexOf(' ');if(at>0){lines.push(line.slice(0,at));line=line.slice(at+1)+ch;}else{lines.push(line);line=ch;}}else line+=ch;}if(line)lines.push(line);}if(lines.length*13>height+2)throw Error(label+'가 입력 칸보다 깁니다.');lines.forEach((s,i)=>page.drawText(s,{x:x+2,y:H-top-11-i*13,size:11,font}));}
  const d=model.input,provisional=model.annual&&d.asOf&&d.asOf<d.fiscalEnd,actualDate=provisional?d.asOf:d.fiscalEnd;
  box('V',179,82,15,15,'조합 구분');
  box(d.applicant,115,185,250,15,'신고인 성명');box(d.applicantBirth,375,185,158,15,'신고인 생년월일·법인등록번호');
  box('주소',113,203,32,27,'주소 제목');box(d.applicantAddress,145,203,226,27,'신고인 주소');box(d.applicantPhone,375,216,158,15,'신고인 전화');
  box(d.companyName,115,248,250,14,'조합명');box(d.companyPhone,375,248,158,14,'조합 전화');box(d.officeAddress,115,275,420,14,'주사무소 소재지');
  box(d.chairName,115,302,250,14,'이사장 성명');box(d.chairIdentity,375,302,158,14,'이사장 식별정보');
  box(d.chairPhone,115,329,250,14,'이사장 전화번호');box(d.companyEmail,375,329,158,14,'이사장 전자우편주소');box(d.chairAddress,115,356,420,14,'이사장 개인 주소');
  // 공개 원본의 다른 칸·뒤쪽은 유지하고 신고내용 내부만 한 칸으로 사용한다.
  page.drawText('첨부서류 참조',{x:(110.341+537.671-font.widthOfTextAtSize('첨부서류 참조',11))/2,y:H-474,size:11,font});
  if(/^\d{4}-\d{2}-\d{2}$/.test(d.printDate)){const [y,m,day]=d.printDate.split('-');box(y,420,697,32,15,'작성 연도');box(String(Number(m)),466,697,18,15,'작성 월');box(String(Number(day)),498,697,18,15,'작성 일');}
  box(d.applicant,343,733,122,16,'하단 신고인');
  function stamp(pg){if(provided?.test)pg.drawText('합성 검증용',{x:60,y:pg.getHeight()-35,size:11,font,color:lib.rgb(.65,.15,.1)});}
  doc.getPages().forEach(stamp);
  let current,y;
  function newPage(title){current=doc.addPage([595,842]);stamp(current);const change=title.startsWith('변경하려는 내용을 적은 서류'),size=change?15:17;y=change?715:775;current.drawText(title,{x:change?(595-font.widthOfTextAtSize(title,size))/2:45,y,size,font});y=change?657:739;}
  newPage('변경하려는 내용을 적은 서류');
  function changeTable(){const width=231.6;function row(cells,heading=false){const lines=cells.map(s=>wrap(s,font,11,width-16)),count=Math.max(...lines.map(a=>a.length));let offset=0;do{if(y<110){newPage('변경하려는 내용을 적은 서류 · 계속');row(['변경전','변경후'],true);}const take=Math.min(count-offset,Math.max(1,Math.floor((y-88)/18))),height=Math.max(30,take*18+14);for(let i=0;i<2;i++){const x=66.1+i*width;current.drawRectangle({x,y:y-height,width,height,borderWidth:.5,borderColor:lib.rgb(.5,.5,.5)});lines[i].slice(offset,offset+take).forEach((s,j)=>current.drawText(s,{x:heading?x+(width-font.widthOfTextAtSize(s,11))/2:x+8,y:y-19-j*18,size:11,font}));}y-=height;offset+=take;}while(offset<count);}
   row(['변경전','변경후'],true);for(const r of model.rows){const unit=r.key==='capital'?'원':r.key==='members'?'명':'',label=r.key==='capital'?'출자금':r.label,dated=['capital','members'].includes(r.key);row([label+(dated?'\n'+d.beforeDate:'')+'\n'+D(r.before)+unit,label+(dated?'\n'+actualDate:'')+'\n'+D(r.after)+unit]);}}
  changeTable();y-=20;if(model.reportedMembershipNote){const lines=wrap(model.reportedMembershipNote,font,11,463.2);for(const text of lines){if(y<80)newPage('변경하려는 내용을 적은 서류 · 계속');current.drawText(text,{x:66.1,y,size:11,font});y-=18;}}
  if(model.annual){
   current=doc.addPage([595,841]);stamp(current);const pg=current;
   const draw=(text,x,top,width,height,size=11,center=false)=>{const lines=wrap(text,font,size,width);if(lines.length*(size+2)>height+2)throw Error('확인서 입력 칸보다 내용이 깁니다.');lines.forEach((s,i)=>pg.drawText(s,{x:center?x+(width-font.widthOfTextAtSize(s,size))/2:x,y:841-top-size-i*(size+2),size,font}));};
   pg.drawRectangle({x:86.473,y:102.368,width:429.01,height:638.062,borderWidth:.5,borderColor:lib.rgb(0,0,0)});
   pg.drawLine({start:{x:86.473,y:703.63},end:{x:515.483,y:703.63},thickness:.5});
   draw('출자금 변동내역 확인서',90,111,422,20,14,true);
   let fieldTop=168;for(const [label,value]of [['협동조합명',d.companyName],['법인등록번호',d.corporateNumber],['소재지',d.officeAddress],['출자금',D(model.unit)+'원']]){const height=Math.max(21,wrap(value||'',font,11,292).length*13+4);if(fieldTop+height>280)throw Error('확인서 기본정보가 입력 칸보다 깁니다.');draw(label+' :',114,fieldTop,95,18);draw(value||'',210,fieldTop,292,height);fieldTop+=height;}
   draw('당기 ('+String(d.fiscalEnd||'').slice(0,4)+'년) 출자금 변동내역',114,287,390,18);
   let top=309.501;const widths=[101.106,101.106,101.225,101.106];
   const cells=[['구분','조합원수','출자좌수','출자금'],...['before','increase','decrease','after'].map((key,i)=>[i===0?(d.beforeLabel||'변경 전'):i===1?'당기증가':i===2?'당기감소':D(actualDate).replaceAll('-','.'),D(model.values[key+'Members']),D(model.values[key+'Shares']),D(model.values[key+'Capital'])])];
   for(const row of cells){let x=99.666;const height=24;row.forEach((s,i)=>{pg.drawRectangle({x,y:841-top-height,width:widths[i],height,borderWidth:.45,borderColor:lib.rgb(0,0,0)});draw(s,x+4,top+5,widths[i]-8,height-4,11,true);x+=widths[i];});top+=height;}
   draw('위 출자금 변동사항은 사실과 같음을 확인합니다.',104,465,400,30,11,true);
   draw(String(d.printDate||'').replaceAll('-','.'),114,521,390,22,12,true);
   draw(D(d.companyName)+' 이사장 '+D(d.chairName),104,578,340,32,12,true);
   if(scope?.seal){if(!scope.outputVerified)throw Error('직인 출력 권한을 확인해 주세요.');check();const seal=await doc.embedPng(scope.seal);check();const scale=Math.min(55/seal.width,55/seal.height);pg.drawImage(seal,{x:442.322+(55-seal.width*scale)/2,y:229.908+(55-seal.height*scale)/2,width:seal.width*scale,height:seal.height*scale});}
  }
  if(scope?.roster){
   const r=scope.roster;if(!scope.outputVerified||r.cutoff!==d.fiscalEnd||r.coop!==scope.coop||r.unit!==model.unit||!Array.isArray(r.rows)||!r.rows.length)throw Error('시청용 명부의 권한·기준일을 확인해 주세요.');
   if(model.values.afterMembers!==r.rows.length||model.values.afterCapital!==r.totalCapital)throw Error('신고서와 시청용 명부의 인원·출자금이 다릅니다.');
   const widths=[35,102,130,65,105,65],headers=['연번','성명\n(법인명)','생년월일\n(법인등록번호)','출자좌수','출자금액','비율'];let index=0;
   while(index<r.rows.length){check();newPage(D(d.companyName)+' 출자자 명부');current.drawText('기준일: '+r.cutoff,{x:36,y:695,size:11,font});current.drawText('1좌당 금액: '+D(r.unit)+'원',{x:36,y:676,size:11,font});y=640;
    const row=(values,height)=>{let x=36;values.forEach((s,i)=>{const lines=wrap(String(s),font,11,widths[i]-6);if(lines.length*13>height-6)throw Error('명부 입력 칸보다 내용이 깁니다.');current.drawRectangle({x,y:y-height,width:widths[i],height,borderWidth:.4,borderColor:lib.rgb(0,0,0)});lines.forEach((t,j)=>current.drawText(t,{x:x+(widths[i]-font.widthOfTextAtSize(t,11))/2,y:y-16-j*13,size:11,font}));x+=widths[i];});y-=height;};
    row(headers,40);while(index<r.rows.length){const v=r.rows[index],values=[v['연번'],v['성명(법인명)'],v['생년월일(법인등록번호)'],v['출자좌수'],v['출자금액'],Number(v['비율']).toFixed(2)],height=Math.max(22,...values.map((s,i)=>wrap(String(s),font,11,widths[i]-6).length*13+8));if(height>540)throw Error('명부 입력 칸보다 내용이 깁니다.');if(y-height<60)break;row(values,height);index++;}
   }
  }
  for(const [i,pg]of doc.getPages().entries())if(i>=2)pg.drawText(String(i+1)+' / '+doc.getPageCount(),{x:500,y:30,size:11,font});
  check();doc.setTitle('시청 변경신고 작성자료');doc.setCreator('협동조합 운영시스템');const bytes=await doc.save();try{check();return bytes;}catch(e){bytes.fill(0);throw e;}
 }
 root.CoopRegistryPdf={create,wrap,tools,version:'0.2.13'};
})(typeof window==='undefined'?globalThis:window);
