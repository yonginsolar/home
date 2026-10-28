/* Signup pledge amount display only. No other fields, requests, storage or form submission hooks. */
(function(global){
 'use strict';
 const raw=value=>String(value??'').replace(/,/g,'');
 const native=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
 const format=value=>{
  const text=raw(value);if(!/^-?\d*(?:\.\d*)?$/.test(text)||!/[0-9]/.test(text))return text;
  const [integer,fraction]=text.split('.'),sign=integer.startsWith('-')?'-':'';
  const digits=integer.replace(/^-/,'').replace(/^0+(?=\d)/,'');
  return sign+digits.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(fraction===undefined?'':'.'+fraction);
 };
 function init(){
  const input=document.getElementById('money');if(!input||input.dataset.signupAmountReady)return;
  input.dataset.signupAmountReady='true';
  const probe=document.createElement('input');probe.type='number';
  const undo=[],redo=[];let replay=false,composing=false;
  const validate=()=>{
   for(const attr of ['min','max','step','required']){if(input.hasAttribute(attr))probe.setAttribute(attr,input.getAttribute(attr));else probe.removeAttribute(attr);}
   const value=raw(input.value);probe.value=value;
   const invalid=value!==''&&(!/^-?\d+(?:\.\d*)?$/.test(value)||!Number.isFinite(Number(value))||Math.abs(Number(value))>Number.MAX_SAFE_INTEGER);
   input.setCustomValidity(invalid?'금액을 확인해 주세요.':probe.validationMessage);
  };
  const snapshot=()=>({value:input.value,start:input.selectionStart,end:input.selectionEnd});
  const caret=(text,count)=>{if(!count)return 0;let seen=0;for(let i=0;i<text.length;i++)if(text[i]!==','&&++seen===count)return i+1;return text.length;};
  const render=()=>{
   const before=input.value,start=raw(before.slice(0,input.selectionStart)).length,end=raw(before.slice(0,input.selectionEnd)).length,next=format(before);
   if(next!==before){native.set.call(input,next);input.setSelectionRange(caret(next,start),caret(next,end));}
   validate();
  };
  const initial=input.value;input.type='text';input.inputMode='numeric';
  Object.defineProperty(input,'value',{configurable:true,get(){return native.get.call(this);},set(value){native.set.call(this,format(value));validate();if(!replay){undo.length=0;redo.length=0;}}});
  input.value=initial;
  input.addEventListener('beforeinput',event=>{
   if(replay||input.disabled||input.readOnly||event.isComposing||composing)return;
   undo.push(snapshot());if(undo.length>64)undo.shift();redo.length=0;
   const at=input.selectionStart;
   if(at===input.selectionEnd&&event.inputType==='deleteContentBackward'&&input.value[at-1]===',')input.setSelectionRange(Math.max(0,at-2),at);
   if(at===input.selectionEnd&&event.inputType==='deleteContentForward'&&input.value[at]===',')input.setSelectionRange(at,at+2);
  },true);
  input.addEventListener('input',event=>{if(!event.isComposing&&!composing)render();},true);
  input.addEventListener('compositionstart',()=>{composing=true;});
  input.addEventListener('compositionend',()=>{composing=false;render();});
  input.addEventListener('keydown',event=>{
   if(input.disabled||input.readOnly||!(event.ctrlKey||event.metaKey)||event.altKey)return;
   const key=event.key.toLowerCase(),back=key==='z'&&!event.shiftKey,forward=key==='y'||(key==='z'&&event.shiftKey);
   if(!back&&!forward)return;
   event.preventDefault();const from=back?undo:redo,to=back?redo:undo;if(!from.length)return;
   const value=from.pop();to.push(snapshot());replay=true;
   native.set.call(input,value.value);input.setSelectionRange(value.start,value.end);validate();
   input.dispatchEvent(new Event('input',{bubbles:true}));replay=false;
  },true);
  input.form?.addEventListener('reset',()=>queueMicrotask(()=>{input.value=input.value;}));
  new MutationObserver(validate).observe(input,{attributes:true,attributeFilter:['min','max','step','required']});
 }
 global.CoopSignupAmount=Object.freeze({raw,format});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window);
