/* 0.4.0 · 위임장 공식 원본에 값만 넣고 별지 명부·선택 PDF를 묶는다. */
(function(root){
 'use strict';
 async function append(doc,model,bundle,tools){
  if(!bundle)return;const {lib,font,load,check,test}=tools;
  if(bundle.coop!==model.input.coopId||bundle.revision!==model.input.documentBundle?.revision)throw Error('첨부서류의 조합·선택을 다시 확인해 주세요.');
  const black=lib.rgb(0,0,0);
  const text=(page,value,x,top,width,height)=>{const original=String(value??''),paper=['210㎜×297㎜[백상지 80g/㎡]','210mm×297mm[백상지 80g/㎡]'].includes(original),rendered=paper?original.replaceAll('㎜','mm').replaceAll('㎡','m²'):original;let lines=root.CoopRegistryPdf.wrap(rendered,font,11,width);if(/^\d{6}-\d{7}$/.test(rendered)&&lines.length>1)lines=[rendered.slice(0,7),rendered.slice(7)];else if(/^\d{2,4}-\d{3,4}-\d{4}$/.test(rendered)&&lines.length>1){lines=[];for(const part of rendered.match(/\d+-?/g)){const prev=lines.at(-1);if(prev&&font.widthOfTextAtSize(prev+part,11)<=width)lines[lines.length-1]+=part;else lines.push(part);}}if(lines.some(s=>font.widthOfTextAtSize(s,11)>width)||lines.length*14>height)throw Error('첨부서류 입력 칸보다 내용이 깁니다.');lines.forEach((s,i)=>page.drawText(s,{x,y:page.getHeight()-top-11-i*14,font,size:11,color:black}));};
  async function original(path){check();const bytes=tools.templates?.[path]||await load('/erp/registry-assets/'+path);check();return lib.PDFDocument.load(bytes);}
  async function add(source,index=0){const s=source.getPages()[index],p=doc.addPage([s.getWidth(),s.getHeight()]),[embedded]=await doc.embedPages([s]);check();p.drawPage(embedded);p.pushOperators(lib.setTextRenderingMode(0));if(test)p.drawText('합성 검증용 · 제출 금지',{x:45,y:p.getHeight()-25,font,size:11,color:lib.rgb(.7,.1,.1)});return p;}
  function derived(source,annex,title){const s=source.getPages()[0],p=doc.addPage([s.getWidth(),s.getHeight()]);text(p,annex,46,43,482,32);p.drawText(title,{x:(p.getWidth()-font.widthOfTextAtSize(title,18))/2,y:p.getHeight()-101,font,size:18});if(test)text(p,'합성 검증용 · 제출 금지',46,15,482,20);return p;}
  if(bundle.proxy){
   const d=bundle.proxy,source=await original('proxy-minwon-annex3-20230330.pdf'),p=await add(source);
   // 원본 칸을 사용한다. 하단의 일반 서명인 라벨만 조합명·직책·성명으로 대체한다.
   const fill=(value,x,top,width,height,label)=>{let lines=root.CoopRegistryPdf.wrap(String(value||''),font,11,width);if(label==='서명인'&&lines.length>1){lines=[];let line='';for(const word of String(value||'').split(/\s+/)){const next=line?line+' '+word:word;if(line&&font.widthOfTextAtSize(next,11)>width){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);lines=lines.flatMap(s=>root.CoopRegistryPdf.wrap(s,font,11,width));}if(lines.length*12>height)throw Error('위임장 '+label+'가 원본 입력 칸보다 깁니다.');lines.forEach((s,i)=>p.drawText(s,{x,y:p.getHeight()-top-11-i*12,font,size:11,color:black}));};
   fill(d.chairName,116,149,237,24,'위임인 이름');fill(d.chairBirth,366,151,166,18,'위임인 생년월일');fill(d.chairAddress,116,188,237,24,'위임인 주소');fill(d.chairPhone,366,191,166,18,'위임인 전화');
   fill(d.applicant,116,235,175,18,'수임인 이름');fill(d.applicantBirth,366,235,166,18,'수임인 생년월일');fill(d.relation||'조합 업무 담당 직원',116,274,237,18,'관계');fill(d.applicantPhone,366,274,166,18,'수임인 전화');fill(d.applicantAddress,116,311,418,24,'수임인 주소');
   fill('협동조합 변경신고',116,377,223,90,'민원명');fill('1부',354,377,33,90,'발급통수');fill('변경신고',399,377,134,90,'용도');
   const [y,m,dte]=String(d.printDate||'').split('-');fill(y,346,549,30,18,'연도');fill(m?String(Number(m)):'',397,549,15,18,'월');fill(dte?String(Number(dte)):'',430,549,17,18,'일');p.drawRectangle({x:228,y:p.getHeight()-595,width:70,height:17,color:lib.rgb(1,1,1)});fill([d.companyName,'이사장',d.chairName].filter(Boolean).join(' '),116,578,321,26,'서명인');
  }
  for(const kind of ['officers','members']){
   if(!bundle[kind])continue;if(!bundle.verified&&!bundle.preview)throw Error('명부 출력 권한을 확인해 주세요.');
   if(kind==='members'&&bundle.verified&&model.annual&&bundle.members.length!==model.values.afterMembers)throw Error('별지 제6호와 신고 인원이 다릅니다. 다시 확인해 주세요.');
   const source=await original(kind==='officers'?'officers-annex3-20200929.pdf':'members-annex6-20200929.pdf'),rows=bundle[kind];
   const widths=kind==='officers'?[30,43,75,105,129,100]:[30,60,100,112,100,80],header=kind==='officers'?['연번','직위','성 명\n(법인명)','주민등록번호\n(법인등록번호)','주소지\n(법인 주소)','연락처']:['연번','발기인/\n설립동의자','성 명\n(법인명)','주민등록번호\n(법인등록번호)','연락처','이해관계자'];
   let i=0;do{const p=derived(source,'■ 협동조합 기본법 시행규칙 [별지 제'+(kind==='officers'?'3':'6')+'호서식] <개정 2020. 9. 29.>',kind==='officers'?'임 원 명 부':'명 부'),h=p.getHeight();let top=kind==='officers'?124:145;
    const drawRow=(cells,height)=>{let x=46;cells.forEach((value,j)=>{p.drawRectangle({x,y:h-top-height,width:widths[j],height,borderWidth:.45,borderColor:black});text(p,value,x+4,top+7,widths[j]-8,height-10);x+=widths[j];});top+=height;};drawRow(header,43);
    if(kind==='members')text(p,'[  ] 발기인 및 설립동의자    [V] 조합원(회원)',46,117,482,18);
    if(bundle.preview&&!rows.length)drawRow(['','','','','',''],44);
    while(i<rows.length){const r=rows[i],cells=kind==='officers'?[r.sequence,r.role,r.name,r.identity,r.address,r.phone]:[r.sequence,r.founder,r.name,r.identity,r.phone,r.stakeholder],height=Math.max(31,...cells.map((s,j)=>root.CoopRegistryPdf.wrap(String(s??''),font,11,widths[j]-8).length*14+15));if(height>500)throw Error('명부 한 행이 용지보다 큽니다.');if(top+height>707)break;drawRow(cells,height);i++;}text(p,'작성방법',46,721,482,18);text(p,kind==='officers'?'법인이 임원인 경우 임원의 직무를 수행할 사람을 동란에 적어주시기 바랍니다.':'1. 이해관계자란은 사회적협동조합의 경우에만 적습니다.\n2. 연합회 설립 시 회원인 협동조합의 정보를 적어주시기 바랍니다.',46,745,482,42);text(p,'210㎜×297㎜[백상지 80g/㎡]',46,798,220,20);check();
   }while(i<rows.length);
  }
  let total=0;for(const item of bundle.pdfs||[]){check();if(!(item.bytes instanceof Uint8Array)||item.bytes.byteLength>20971520)throw Error('첨부 PDF 크기를 확인해 주세요.');total+=item.bytes.byteLength;if(total>52428800)throw Error('묶음 첨부는 50MB 이내로 선택해 주세요.');const source=await lib.PDFDocument.load(item.bytes);if(source.getPageCount()>150||doc.getPageCount()+source.getPageCount()>400)throw Error('묶음 PDF의 페이지 수를 확인해 주세요.');for(let i=0;i<source.getPageCount();i++)await add(source,i);}
 }
 root.CoopRegistryDocumentsPdf=Object.freeze({append,version:'0.4.0'});
})(typeof window==='undefined'?globalThis:window);
