/* 법인등록번호 표시 전용. 저장값·권한·초점은 변경하지 않는다. */
(function(root){
 'use strict';
 const bound=new WeakSet();
 function format(value){const text=String(value??'');if(!/^[0-9-]*$/.test(text)||(text.match(/-/g)||[]).length>1)return text;const digits=text.replace('-','');if(digits.length>13)return text;return digits.length>6?digits.slice(0,6)+'-'+digits.slice(6):digits;}
 function render(input){if(!input)return;const old=input.value,next=format(old);if(old===next)return;const start=input.selectionStart,end=input.selectionEnd,direction=input.selectionDirection;
  const position=p=>{if(p===null)return null;const prefix=old.slice(0,p),digits=(prefix.match(/[0-9]/g)||[]).length;return Math.min(next.length,digits+(digits>6||digits===6&&prefix.includes('-')&&next.length>6?1:0));};
  input.value=next;if(start!==null&&end!==null)input.setSelectionRange(position(start),position(end),direction||'none');
 }
 function bind(input){if(!input||bound.has(input))return;bound.add(input);let composing=false;
  input.addEventListener('compositionstart',()=>{composing=true;});
  input.addEventListener('compositionend',()=>{composing=false;render(input);});
  input.addEventListener('input',e=>{if(!composing&&!e.isComposing)render(input);});
  input.addEventListener('beforeinput',e=>{if(composing||e.isComposing||!e.cancelable||input.readOnly||input.disabled||input.selectionStart!==input.selectionEnd)return;const at=input.selectionStart,old=input.value;if(!/^\d{6}-\d{1,7}$/.test(old))return;
   const backward=e.inputType==='deleteContentBackward'&&at===7,forward=e.inputType==='deleteContentForward'&&at===6;if(!backward&&!forward)return;e.preventDefault();input.setRangeText('',backward?5:6,backward?7:8,'end');render(input);input.dispatchEvent(new Event('input',{bubbles:true}));
  });render(input);
 }
 root.ERPCorporateNumber={format,bind};
})(typeof window==='undefined'?globalThis:window);
