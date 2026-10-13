/* v1.0.0 — Uses the surrounding form's save and unsaved-input guards. */
(function(root){
 'use strict';
 const instances=new Map();
 function safe(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.hostname==='ifdqlwxgqgsvnawmhlfc.supabase.co'&&u.pathname.startsWith('/storage/v1/object/public/assets/')?u.href:'';}catch(_){return '';}}
 function mount(container,id){
  if(instances.has(id))return instances.get(id);if(!container)return null;
  const field=document.createElement('div');field.className='col-12';
  field.innerHTML=`<label for="${id}-file" class="form-label small fw-bold">파비콘용 로고</label><input id="${id}-file" type="file" accept="image/png,image/jpeg,image/webp" class="form-control form-control-sm"><div class="d-flex align-items-center gap-3 mt-2"><img id="${id}-preview" alt="파비콘용 로고 미리보기" hidden style="width:64px;height:64px;object-fit:contain"><span id="${id}-empty" class="small text-muted">별도 파비콘용 로고가 없습니다.</span></div><div id="${id}-meta" class="form-text"></div><div class="d-flex justify-content-end gap-3 mt-2"><a id="${id}-original" hidden target="_blank" rel="noopener noreferrer">원본 보기</a><button id="${id}-cancel" type="button" class="btn btn-outline-secondary btn-sm">선택 취소</button></div><div class="form-text">탭·검색 아이콘에 사용합니다. 글자 없이 로고만 있는 PNG·JPG·WebP 이미지, 5MB 이하.</div>`;
  container.append(field);
  const get=name=>field.querySelector('#'+id+'-'+name),input=get('file');let info={},preview='';
  function revoke(){if(preview)URL.revokeObjectURL(preview);preview='';}
  function paint(){const src=preview||safe(info.icon_url);get('preview').hidden=!src;if(src)get('preview').src=src;else get('preview').removeAttribute('src');get('empty').hidden=!!src;get('meta').textContent=input.files[0]?'저장 전 미리보기':info.icon_custom?'현재 등록된 파비콘용 로고':'별도 등록 전에는 기존 아이콘을 유지합니다.';const original=safe(info.icon_original_url);get('original').hidden=!original;if(original)get('original').href=original;else get('original').removeAttribute('href');}
  function reset(){input.value='';revoke();paint();}
  input.addEventListener('change',()=>{revoke();try{const file=input.files[0];if(file){root.CoopLogoUpload.validate(file);preview=URL.createObjectURL(file);}}catch(e){input.value='';input.setCustomValidity(e.message);input.reportValidity();}paint();});
  input.addEventListener('change',()=>{if(!input.files[0]||preview)input.setCustomValidity('');});get('cancel').addEventListener('click',reset);
  const controller=Object.freeze({file:()=>input.files[0]||null,sync:value=>{info={...value};paint();},reset,clearSaved:file=>{if(input.files[0]===file)reset();},dispose:()=>{revoke();info={};input.value='';paint();},node:field});
  instances.set(id,controller);paint();return controller;
 }
 root.CoopFaviconField=Object.freeze({mount,safe,version:'1.0.0'});
})(window);
