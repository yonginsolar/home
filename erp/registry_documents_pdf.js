/* 0.3.0 · 공식 원본을 바탕으로 만든 위임장·별지 명부와 선택한 PDF만 묶는다. */
(function(root){
 'use strict';
 async function append(doc,model,bundle,tools){
  if(!bundle)return;const {lib,font,load,check,test}=tools;
  if(bundle.coop!==model.input.coopId||bundle.revision!==model.input.documentBundle?.revision)throw Error('첨부서류의 조합·선택을 다시 확인해 주세요.');
  const black=lib.rgb(0,0,0),white=lib.rgb(1,1,1);
  const text=(page,value,x,top,width,height)=>{const original=String(value??''),paper=['210㎜×297㎜[백상지 80g/㎡]','210mm×297mm[백상지 80g/㎡]'].includes(original),rendered=paper?original.replaceAll('㎜','mm').replaceAll('㎡','m²'):original;let lines=root.CoopRegistryPdf.wrap(rendered,font,11,width);if(/^\d{6}-\d{7}$/.test(rendered)&&lines.length>1)lines=[rendered.slice(0,7),rendered.slice(7)];else if(/^\d{2,4}-\d{3,4}-\d{4}$/.test(rendered)&&lines.length>1){lines=[];for(const part of rendered.match(/\d+-?/g)){const prev=lines.at(-1);if(prev&&font.widthOfTextAtSize(prev+part,11)<=width)lines[lines.length-1]+=part;else lines.push(part);}}if(lines.some(s=>font.widthOfTextAtSize(s,11)>width)||lines.length*14>height)throw Error('첨부서류 입력 칸보다 내용이 깁니다.');lines.forEach((s,i)=>page.drawText(s,{x,y:page.getHeight()-top-11-i*14,font,size:11,color:black}));};
  async function original(path){check();const bytes=tools.templates?.[path]||await load('/erp/registry-assets/'+path);check();return lib.PDFDocument.load(bytes);}
  async function add(source,index=0){const s=source.getPages()[index],p=doc.addPage([s.getWidth(),s.getHeight()]),[embedded]=await doc.embedPages([s]);check();p.drawPage(embedded);p.pushOperators(lib.setTextRenderingMode(0));if(test)p.drawText('합성 검증용 · 제출 금지',{x:45,y:p.getHeight()-25,font,size:11,color:lib.rgb(.7,.1,.1)});return p;}
  function derived(source,annex,title){const s=source.getPages()[0],p=doc.addPage([s.getWidth(),s.getHeight()]);text(p,annex,46,43,482,32);p.drawText(title,{x:(p.getWidth()-font.widthOfTextAtSize(title,18))/2,y:p.getHeight()-101,font,size:18});if(test)text(p,'합성 검증용 · 제출 금지',46,15,482,20);return p;}
  function formRow(p,label,value,x,top,width,height){p.drawRectangle({x,y:p.getHeight()-top-height,width,height,borderColor:black,borderWidth:.5});text(p,label,x+7,top+5,width-14,18);text(p,value,x+7,top+24,width-14,height-28);}
  if(bundle.proxy){
   const d=bundle.proxy,source=await original('proxy-minwon-annex3-20230330.pdf'),p=derived(source,'■ 민원 처리에 관한 법률 시행규칙 [별지 제3호서식] <개정 2023. 3. 30.>','위 임 장');
   text(p,'위임하는 사람',46,115,482,17);formRow(p,'이름',d.chairName,46,137,289,46);formRow(p,'생년월일',d.chairBirth,335,137,193,46);formRow(p,'주소',d.chairAddress,46,183,289,62);formRow(p,'전화번호',d.chairPhone,335,183,193,62);
   text(p,'위임받는 사람',46,253,482,17);formRow(p,'이름 (서명 또는 인)',d.applicant,46,275,289,46);formRow(p,'생년월일',d.applicantBirth,335,275,193,46);formRow(p,'위임하는 사람과의 관계',d.relation||'조합 업무 담당 직원',46,321,289,46);formRow(p,'전화번호',d.applicantPhone,335,321,193,46);formRow(p,'주소',d.applicantAddress,46,367,482,61);
   text(p,'민원사항',46,436,482,18);formRow(p,'민 원 명','협동조합 변경신고',46,458,289,46);formRow(p,'발급통수','1부',335,458,70,46);formRow(p,'용 도','변경신고',405,458,123,46);
   text(p,'위 위임하는 사람은 위 위임받는 사람에게 위 민원사항에 대한 신청 및 교부에 관한 모든 권한을 위임합니다.',46,515,482,34);
   const [y,m,dte]=String(d.printDate||'').split('-');text(p,y+'년 '+Number(m)+'월 '+Number(dte)+'일',330,554,200,22);
   text(p,'위임하는 사람 '+d.companyName+'\n이사장 '+d.chairName+' (서명 또는 인)',150,582,285,45);
   // 일반 직인을 사용하지 않는다. 실제 법인인감을 직접 날인할 자리다.
   p.drawRectangle({x:441,y:p.getHeight()-631,width:76,height:44,color:white,borderColor:black,borderWidth:.5});text(p,'법인인감',456,603,60,18);
   text(p,'유의사항',46,642,482,18);text(p,'1. 위임받는 사람의 신분증(주민등록증, 여권, 운전면허증 등)을 제시해야 합니다.\n2. 민원사항(출입국사실증명, 외국인등록사실증명, 국내거소신고 사실증명, 납세증명, 지방세 납세증명 등)에 따라서는 위임하는 사람과 위임받는 사람의 신분증 사본을 구비서류로 제출해야 합니다.\n3. 다른 사람의 인장 도용 등 허위로 위임장을 작성하여 신청할 경우에는 「형법」 제231조와 제232조에 따라 사문서 위조ㆍ변조죄로 5년 이하의 징역 또는 1천만원 이하의 벌금에 처하게 됩니다.',46,665,482,126);text(p,'210mm×297mm[백상지 80g/㎡]',46,798,220,20);
  }
  for(const kind of ['officers','members']){
   if(!bundle[kind])continue;if(!bundle.verified&&!bundle.preview)throw Error('명부 출력 권한을 확인해 주세요.');
   if(kind==='members'&&bundle.verified&&model.annual&&bundle.members.length!==model.values.afterMembers)throw Error('별지 제6호와 신고 인원이 다릅니다. 다시 확인해 주세요.');
   const source=await original(kind==='officers'?'officers-annex3-20200929.pdf':'members-annex6-20200929.pdf'),rows=bundle[kind];
   const widths=kind==='officers'?[30,43,75,105,129,100]:[30,60,100,112,100,80],header=kind==='officers'?['연번','직위','성 명\n(법인명)','주민등록번호\n(법인등록번호)','주소지\n(법인 주소)','연락처']:['연번','발기인/\n설립동의자','성 명\n(법인명)','주민등록번호\n(법인등록번호)','연락처','이해관계자'];
   let i=0;do{const p=derived(source,'■ 협동조합 기본법 시행규칙 [별지 제'+(kind==='officers'?'3':'6')+'호서식] <개정 2020. 9. 29.>',kind==='officers'?'임 원 명 부':'명 부'),h=p.getHeight();let top=kind==='officers'?124:145;
    const drawRow=(cells,height)=>{let x=46;cells.forEach((value,j)=>{p.drawRectangle({x,y:h-top-height,width:widths[j],height,borderWidth:.45,borderColor:black});text(p,value,x+4,top+7,widths[j]-8,height-10);x+=widths[j];});top+=height;};drawRow(header,43);
    if(kind==='members')text(p,'[  ] 발기인 및 설립동의자    [V] 조합원(회원)',46,117,482,18);
    if(bundle.preview&&!rows.length)drawRow(['','','출력 전 보안 확인','','',''],44);
    while(i<rows.length){const r=rows[i],cells=kind==='officers'?[r.sequence,r.role,r.name,r.identity,r.address,r.phone]:[r.sequence,r.founder,r.name,r.identity,r.phone,r.stakeholder],height=Math.max(31,...cells.map((s,j)=>root.CoopRegistryPdf.wrap(String(s??''),font,11,widths[j]-8).length*14+15));if(height>500)throw Error('명부 한 행이 용지보다 큽니다.');if(top+height>707)break;drawRow(cells,height);i++;}text(p,'작성방법',46,721,482,18);text(p,kind==='officers'?'법인이 임원인 경우 임원의 직무를 수행할 사람을 동란에 적어주시기 바랍니다.':'1. 이해관계자란은 사회적협동조합의 경우에만 적습니다.\n2. 연합회 설립 시 회원인 협동조합의 정보를 적어주시기 바랍니다.',46,745,482,42);text(p,'210㎜×297㎜[백상지 80g/㎡]',46,798,220,20);check();
   }while(i<rows.length);
  }
  let total=0;for(const item of bundle.pdfs||[]){check();if(!(item.bytes instanceof Uint8Array)||item.bytes.byteLength>20971520)throw Error('첨부 PDF 크기를 확인해 주세요.');total+=item.bytes.byteLength;if(total>52428800)throw Error('묶음 첨부는 50MB 이내로 선택해 주세요.');const source=await lib.PDFDocument.load(item.bytes);if(source.getPageCount()>150||doc.getPageCount()+source.getPageCount()>400)throw Error('묶음 PDF의 페이지 수를 확인해 주세요.');for(let i=0;i<source.getPageCount();i++)await add(source,i);}
 }
 root.CoopRegistryDocumentsPdf=Object.freeze({append,version:'0.3.0'});
})(typeof window==='undefined'?globalThis:window);
