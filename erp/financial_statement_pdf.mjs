/* Local-only text extraction. Reuse existing pinned PDF.js 6.3.289. No AI/OCR/API. */
import * as pdfjs from '../shared/vendor/pdfjs/pdf.mjs';
const base=new URL('../shared/vendor/pdfjs/',import.meta.url);
pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdf.worker.mjs',base).href;
export async function renderPage(file,canvas,pageNumber=1){
 const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,enableXfa:false,cMapUrl:new URL('cmaps/',base).href,cMapPacked:true,standardFontDataUrl:new URL('standard_fonts/',base).href,wasmUrl:new URL('wasm/',base).href});
 try{const pdf=await task.promise;if(pdf.numPages>20||pageNumber<1||pageNumber>pdf.numPages)throw Error('PDF 쪽수를 확인해 주세요.');const page=await pdf.getPage(pageNumber),view=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(2,900/view.width)});canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvasContext:canvas.getContext('2d'),viewport,background:'#fff'}).promise;return pdf.numPages;}finally{await task.destroy().catch(()=>{});}
}
export async function inspect(file,{signal,onPage}={}){
 if(!file||file.size<1||file.size>10485760||!/\.pdf$/i.test(file.name))throw Error('10MB 이하의 PDF 파일을 선택해 주세요.');
 const bytes=new Uint8Array(await file.arrayBuffer());if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw Error('PDF 파일 형식을 확인해 주세요.');
 const task=pdfjs.getDocument({data:bytes,isEvalSupported:false,enableXfa:false,cMapUrl:new URL('cmaps/',base).href,cMapPacked:true,standardFontDataUrl:new URL('standard_fonts/',base).href,wasmUrl:new URL('wasm/',base).href});
 const abort=()=>void task.destroy().catch(()=>{});if(signal?.aborted){abort();throw Error('CANCELLED');}signal?.addEventListener('abort',abort,{once:true});
 try{const pdf=await task.promise;if(pdf.numPages>20)throw Error('PDF는 20쪽까지 읽을 수 있습니다. 문서별로 나누어 주세요.');let total=0;const lines=[];
  for(let n=1;n<=pdf.numPages;n++){if(signal?.aborted)throw Error('CANCELLED');const page=await pdf.getPage(n),content=await page.getTextContent();total+=content.items.length;if(total>100000)throw Error('글자가 너무 많습니다. 문서별로 나누어 주세요.');const rows=[];
   for(const item of content.items){if(!item.str?.trim())continue;const y=item.transform[5],x=item.transform[4];let row=rows.find(r=>Math.abs(r.y-y)<2);if(!row){row={y,items:[]};rows.push(row);}row.items.push({x,str:item.str});}
   rows.sort((a,b)=>b.y-a.y);for(const row of rows){row.items.sort((a,b)=>a.x-b.x);lines.push({page:n,text:row.items.map(i=>i.str).join(' ')});}page.cleanup();onPage?.(n,pdf.numPages);
  }
  return{lines,pageCount:pdf.numPages};
 }catch(e){if(e?.name==='PasswordException')throw Error('암호가 없는 PDF로 다시 저장해 주세요.');throw e;}finally{signal?.removeEventListener('abort',abort);await task.destroy().catch(()=>{});}
}
