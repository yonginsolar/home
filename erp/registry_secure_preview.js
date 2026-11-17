/* 인쇄용 PDF 수명 1.0.0 · 인쇄 시작·종료를 짝지어 보안 자료를 정리한다. */
(function(root){
 'use strict';
 function attach({frame,button,status,hint,url,bytes,live,verify,onClear=()=>{}}){
  const d=frame.ownerDocument,source=url;let closed=false,printing=false,ready=false,checking=false,target=null,loadTimer,expiry;
  const active=()=>!closed&&live()&&frame.getAttribute('src')===source;
  function started(){if(active()&&ready){printing=true;button.disabled=true;status.textContent='인쇄 미리보기를 확인하고 있습니다.';}}
  function finished(){if(active()&&printing)clear('인쇄 미리보기를 종료했습니다.');}
  function loaded(){if(!active()||ready)return;clearTimeout(loadTimer);ready=true;button.disabled=false;status.textContent='출력용 PDF를 준비했습니다.';try{target=frame.contentWindow;if(target&&target!==root){target.addEventListener('beforeprint',started);target.addEventListener('afterprint',finished);}}catch(_){target=null;}}
  function failed(){if(active())clear('인쇄용 PDF를 표시하지 못했습니다. 다시 인쇄 미리보기를 눌러 주세요.');}
  async function print(){
   if(!active()||!ready||printing||checking||d.hidden)return;checking=true;button.disabled=true;
   try{await verify();if(!active()||d.hidden)return;printing=true;status.textContent='인쇄 미리보기를 확인하고 있습니다.';frame.contentWindow.print();}
   catch(_){if(active()){printing=false;status.textContent='인쇄창을 열지 못했습니다. 다시 인쇄를 눌러 주세요.';}}
   finally{checking=false;if(active()&&!printing)button.disabled=!ready;}
  }
  function clear(message=''){
   if(closed)return;closed=true;clearTimeout(expiry);clearTimeout(loadTimer);frame.removeEventListener('load',loaded);frame.removeEventListener('error',failed);root.removeEventListener('beforeprint',started);root.removeEventListener('afterprint',finished);try{target?.removeEventListener('beforeprint',started);target?.removeEventListener('afterprint',finished);}catch(_){}root.URL.revokeObjectURL(url);bytes.fill(0);
   if(frame.getAttribute('src')===source){frame.removeAttribute('src');frame.hidden=true;hint.hidden=true;button.hidden=true;button.disabled=true;button.onclick=null;status.textContent=typeof message==='string'?message:'';}onClear();
  }
  frame.addEventListener('load',loaded);frame.addEventListener('error',failed);root.addEventListener('beforeprint',started);root.addEventListener('afterprint',finished);button.onclick=print;button.hidden=false;button.disabled=true;frame.src=source;frame.hidden=false;hint.textContent='인쇄 미리보기';hint.hidden=false;status.textContent='인쇄용 PDF를 불러오는 중입니다.';
  loadTimer=setTimeout(()=>{if(!ready&&active())failed();},15000);expiry=setTimeout(()=>clear('보안 미리보기 시간이 끝났습니다. 다시 인쇄 미리보기를 눌러 주세요.'),300000);
  return {isVisible:()=>active()&&printing,clear};
 }
 root.CoopRegistrySecurePreview=Object.freeze({attach,version:'1.0.0'});
})(typeof window==='undefined'?globalThis:window);
