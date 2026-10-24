/* v1.0.0 — In-document signup draft protection. No persistent storage. */
(function(root){
 'use strict';let baseline=null,pending=false;
 function snapshot(){
  const form=root.document.getElementById('joinForm');if(!form)return '';
  return JSON.stringify([...form.querySelectorAll('input,select,textarea')].filter(n=>!['button','submit','reset'].includes(n.type)&&n.id!=='deferred-signup-otp-input').map(n=>[n.id,n.value,['checkbox','radio'].includes(n.type)?n.checked:null]));
 }
 function initialize(){if(baseline===null)baseline=snapshot();}
 function markSaved(value){if(typeof value==='string')baseline=value;}
 function changed(){return pending||baseline!==null&&snapshot()!==baseline;}
 root.addEventListener('beforeunload',event=>{if(!changed())return;event.preventDefault();event.returnValue='';});
 root.CoopSignupDraft=Object.freeze({snapshot,initialize,markSaved,setPending:value=>{pending=value===true;},changed});
})(window);
