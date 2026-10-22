/* Local PDF.js 6.3.289. Original stays untouched; only the explicitly reviewed page is printed to an attachment. */
import * as pdfjs from '../shared/vendor/pdfjs/pdf.mjs';
const base=new URL('../shared/vendor/pdfjs/',import.meta.url);
pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdf.worker.mjs',base).href;
export const fields=Object.freeze([
 ['insuranceHealth','건강보험 고지보험료'],['insuranceCare','장기요양 고지보험료'],
 ['insurancePension','연금보험료 (지원 전)'],['insuranceDurunuriPension','연금 두루누리 지원금'],['insurancePensionOffsetReceipts','연금 지원금·충당·수납액'],
 ['insuranceEmployment','실업급여보험료 (지원 전)'],['insuranceEmploymentStability','고용안정·직업능력개발 보험료 (지원 전)'],
 ['insuranceDurunuriEmployment','실업급여 두루누리 지원금'],['insuranceDurunuriStability','고용안정 두루누리 지원금'],['insuranceIndustrial','산재 고지보험료'],
 ['insuranceNoticeCountHealthCare','건강·요양 고지인원',true],['insuranceNoticeCountPension','연금 고지인원',true],
 ['insuranceNoticeCountEmployment','고용 고지인원',true],['insuranceNoticeCountIndustrial','산재 고지인원',true]
]);
const compact=s=>String(s||'').replace(/\s+/g,'');
const labelText=s=>compact(s).replace(/[+-]?[\d,]+원/g,'');
function lines(items){const groups=[];for(const i of items){if(!i.str?.trim())continue;let r=groups.find(r=>Math.abs(r.y-i.y)<2);if(!r){r={y:i.y,items:[]};groups.push(r);}r.items.push(i);}return groups.sort((a,b)=>b.y-a.y).map(r=>{r.items.sort((a,b)=>a.x-b.x);return r.items.map(x=>x.str).join(' ');});}
const numbers=s=>(String(s).replace(/분할\s*[12]\s*차/g,'분할차').match(/(?<![\d.])[+-]?\d[\d,]*(?:\.\d+)?(?![\d.])/g)||[]).map(x=>Number(x.replace(/,/g,'')));
export function calculate(v){
 const n=id=>{const x=String(v[id]??'').replace(/,/g,'').trim();if(!/^\d+$/.test(x)||!Number.isSafeInteger(Number(x)))throw Error('AMOUNT_INVALID');return Number(x);};
 const health=n('insuranceHealth')+n('insuranceCare'),pension=n('insurancePension')-n('insuranceDurunuriPension')-n('insurancePensionOffsetReceipts'),employment=n('insuranceEmployment')-n('insuranceDurunuriEmployment'),stability=n('insuranceEmploymentStability')-n('insuranceDurunuriStability'),industrial=n('insuranceIndustrial');
 if([health,pension,employment,stability,industrial].some(x=>x<0))throw Error('DEDUCTION_INVALID');
 const total=health+pension+employment+stability+industrial;if(!Number.isSafeInteger(total))throw Error('AMOUNT_INVALID');return{health,pension,employment:employment+stability,industrial,total};
}
export function analyze(pages){
 const values={},evidence={},warnings=[];let sourcePage=null,billingMonth='',totals=null;
 const summaries=pages.filter(p=>{const text=compact(lines(p.items).join(''));return text.includes('고지인원')&&text.includes('고용보험료')&&text.includes('산재보험료')&&text.includes('사회보험료지원금')&&text.includes('납부할금액');});
 const monthSet=new Set();for(const p of pages.slice(0,4))for(const m of compact(p.items.filter(i=>i.y>p.height-85).map(i=>i.str).join('')).matchAll(/(20\d{2})년(\d{1,2})월(?:분|(?:건강|국민연금|연금|고용|산재)?보험료)/g)){if(Number(m[2])>=1&&Number(m[2])<=12)monthSet.add(m[1]+'-'+m[2].padStart(2,'0'));}if(monthSet.size===1)billingMonth=[...monthSet][0];
 if(summaries.length!==1){warnings.push('보험별 합산표를 하나로 특정하지 못했습니다. 원본을 보며 금액과 첨부할 쪽을 확인해 주세요.');return{values,evidence,warnings,billingMonth,sourcePage:null,totals};}
 const page=summaries[0];sourcePage=page.number;
 const regions={health:[],pension:[],employment:[],industrial:[]};
 for(const i of page.items){const side=i.x<page.width/2?'left':'right',half=i.y>page.height/2?'top':'bottom';regions[side==='left'?(half==='top'?'health':'employment'):(half==='top'?'pension':'industrial')].push(i);}
 const rowSets=Object.fromEntries(Object.entries(regions).map(([k,v])=>[k,lines(v)]));
 function find(region,pattern,count){const rs=rowSets[region],matches=[];for(let i=0;i<rs.length;i++){for(let size=1;size<=3&&i+size<=rs.length;size++){const text=rs.slice(i,i+size).join(' ');if(pattern.test(labelText(text))){matches.push({i,size,text});break;}}}if(!matches.length)return null;
  // Multi-line labels and vertically centered amount cells are part of one table row.
  const exact=matches.filter(m=>pattern.test(labelText(rs[m.i])));const start=(exact.length===1?exact[0]:matches.at(-1)).i;
  let text='';for(let j=start;j<Math.min(start+3,rs.length);j++){if(j>start&&/^[①-⑳]/.test(compact(rs[j])))break;text+=' '+rs[j];const nums=numbers(text);if(pattern.test(labelText(text))&&nums.length===count&&nums.every(n=>Number.isSafeInteger(n)&&n>=0))return nums;if(nums.length>count)break;}return null;}
 const put=(id,n,why)=>{if(n!==null&&n!==undefined){values[id]=String(n);evidence[id]={page:sourcePage,label:why};}};
 const h=find('health',/고지보험료/,2);put('insuranceHealth',h?.[0],'건강보험 고지보험료');put('insuranceCare',h?.[1],'장기요양 고지보험료');
 const pensionParts=[find('pension',/당월분보험료/,1),find('pension',/소급분보험료/,1),find('pension',/분할납부중인보험료/,1)];
 if(pensionParts.every(Boolean))put('insurancePension',pensionParts.reduce((s,x)=>s+x[0],0),'당월분 + 소급분 + 분할납부 보험료');
 put('insuranceDurunuriPension',find('pension',/사회보험료지원금/,1)?.[0],'연금 사회보험료 지원금');
 const po=find('pension',/지원금및충당[·ㆍ]?수납액등/,2)||find('pension',/지원금및충당[·ㆍ]?수납액등/,1);if(po)put('insurancePensionOffsetReceipts',po.reduce((a,b)=>a+b,0),'연금 지원금 및 충당·수납액 등');
 const em=find('employment',/월별보험료/,2),es=find('employment',/사회보험료지원금/,2),eo=find('employment',/지원금및충당[·ㆍ]?수납액등/,2);
 // Only the explicit standard zero-adjustment layout is auto-filled. Never guess which column an adjustment belongs to.
 const adjustments=[find('employment',/분할1차/,2),find('employment',/분할2차/,2),find('employment',/보수총액전자신고경감/,1)];
 if(em&&eo&&eo.every(x=>x===0)&&adjustments.every(x=>x&&x.every(n=>n===0))){put('insuranceEmployment',em[0],'실업급여 월별보험료 (정산·충당·경감 0원 확인)');put('insuranceEmploymentStability',em[1],'고용안정·직업능력 월별보험료');}
 else warnings.push('고용보험의 정산·충당·경감 항목을 원본과 확인해 주세요.');
 put('insuranceDurunuriEmployment',es?.[0],'실업급여 사회보험료 지원금');put('insuranceDurunuriStability',es?.[1],'고용안정 사회보험료 지원금');
 put('insuranceIndustrial',find('industrial',/고지보험료/,1)?.[0],'산재보험 고지보험료');
 for(const [region,id]of [['health','insuranceNoticeCountHealthCare'],['pension','insuranceNoticeCountPension'],['employment','insuranceNoticeCountEmployment'],['industrial','insuranceNoticeCountIndustrial']])put(id,find(region,/^고지인원/,1)?.[0],'보험별 고지인원');
 const late=Object.entries(rowSets).flatMap(([k])=>find(k,/연체금/,k==='health'?2:1)||[]);if(late.length!==5||late.some(x=>x!==0))warnings.push('연체금이 있거나 정확히 읽히지 않았습니다. 납부할 금액과 차이를 확인해 주세요.');
 const finalAmounts=Object.entries(rowSets).map(([k])=>find(k,/납부할(?:금액|보험료)/,1)?.[0]);if(finalAmounts.every(x=>x!==undefined))totals={health:finalAmounts[0],pension:finalAmounts[1],employment:finalAmounts[2],industrial:finalAmounts[3],total:finalAmounts.reduce((a,b)=>a+b,0)};
 else warnings.push('납부할 금액을 원본과 확인해 주세요. ('+['건강·요양','연금','고용','산재'].filter((_,i)=>finalAmounts[i]===undefined).join(', ')+')');
 return{values,evidence,warnings,billingMonth,sourcePage,totals};
}
export async function open(file,{password='',signal}={}){
 if(!file||file.size<1||file.size>10485760||!/\.pdf$/i.test(file.name))throw Error('PDF_LIMIT');
 const data=new Uint8Array(await file.arrayBuffer());if(new TextDecoder().decode(data.slice(0,5))!=='%PDF-')throw Error('PDF_INVALID');
 const task=pdfjs.getDocument({data,password,isEvalSupported:false,enableXfa:false,cMapUrl:new URL('cmaps/',base).href,cMapPacked:true,standardFontDataUrl:new URL('standard_fonts/',base).href,wasmUrl:new URL('wasm/',base).href});password='';
 const destroy=()=>task.destroy().catch(()=>{});if(signal?.aborted){void destroy();throw Error('CANCELLED');}signal?.addEventListener('abort',destroy,{once:true});
 try{const pdf=await task.promise;if(pdf.numPages>20)throw Error('PDF_PAGES');let count=0;const pages=[];
 for(let n=1;n<=pdf.numPages;n++){if(signal?.aborted)throw Error('CANCELLED');const p=await pdf.getPage(n),v=p.getViewport({scale:1}),content=await p.getTextContent();count+=content.items.length;if(count>100000)throw Error('PDF_TEXT_LIMIT');pages.push({number:n,width:v.width,height:v.height,items:content.items.filter(i=>i.str).map(i=>({str:i.str,x:i.transform[4],y:i.transform[5]}))});p.cleanup();}
 const result=analyze(pages);let rendering=null,closed=false;const printing=new Set();
 const check=()=>{if(closed||signal?.aborted)throw Error('CANCELLED');};
 return{result,pageCount:pdf.numPages,async render(canvas,n=1){check();rendering?.cancel();const p=await pdf.getPage(n);check();const v=p.getViewport({scale:1}),vp=p.getViewport({scale:Math.min(1.8,850/v.width)});canvas.width=vp.width;canvas.height=vp.height;rendering=p.render({canvasContext:canvas.getContext('2d'),viewport:vp,background:'#fff'});await rendering.promise;check();},
 async createAttachment(n){
  check();if(!Number.isInteger(n)||n<1||n>pdf.numPages)throw Error('PDF_PAGE_INVALID');
  // This is a print copy of exactly one source page, not a reconstruction of read/edited amounts.
  // Keep physical size/rotation and the full page; no password, scripts, links or other source pages are copied.
  await globalThis.ErpWorkflowAssets?.load('pdfCreate');check();const PDFDocument=globalThis.PDFLib?.PDFDocument;if(!PDFDocument)throw Error('PDF_PRINT_UNAVAILABLE');
  const p=await pdf.getPage(n);check();const v=p.getViewport({scale:1}),scale=Math.min(3,Math.sqrt(12000000/(v.width*v.height)));
  if(!Number.isFinite(scale)||scale<1||v.width<1||v.height<1)throw Error('PDF_PAGE_INVALID');
  const canvas=document.createElement('canvas'),vp=p.getViewport({scale});canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);let job;
  try{job=p.render({canvasContext:canvas.getContext('2d'),viewport:vp,background:'#fff'});printing.add(job);await job.promise;check();
   const image=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));check();if(!image)throw Error('PDF_PRINT_UNAVAILABLE');
   const doc=await PDFDocument.create(),png=await doc.embedPng(await image.arrayBuffer());check();const page=doc.addPage([v.width,v.height]);page.drawImage(png,{x:0,y:0,width:v.width,height:v.height});
   const bytes=await doc.save();check();if(bytes.length>10485760)throw Error('PDF_PRINT_LIMIT');
   return new File([bytes],`4대보험_고지서_${n}쪽_첨부용.pdf`,{type:'application/pdf'});
  }finally{if(job)printing.delete(job);canvas.width=1;canvas.height=1;}
 },async destroy(){closed=true;rendering?.cancel();for(const job of printing)job.cancel();printing.clear();signal?.removeEventListener('abort',destroy);await destroy();}};
 }catch(e){signal?.removeEventListener('abort',destroy);await destroy();if(e?.name==='PasswordException')throw Error('PDF_PASSWORD');throw e;}
}
