/* v1.0.0 — Uses the existing settings form, draft protection and save gate. */
(function(root){
 'use strict';let info={},preview='',epoch=0;
 const get=id=>document.getElementById(id);
 function revoke(){if(preview)URL.revokeObjectURL(preview);preview='';}
 function url(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='ifdqlwxgqgsvnawmhlfc.supabase.co'&&u.pathname.startsWith('/storage/v1/object/public/assets/')&&!u.search&&!u.hash?u.href:'';}catch(_){return '';}}
 function stored(value){if(!value)return '';return url(String(value).startsWith('https:')?value:'https://ifdqlwxgqgsvnawmhlfc.supabase.co/storage/v1/object/public/assets/'+value);}
 function paint(){const image=get('set_logoPreview'),link=get('set_logoOriginal');if(!image)return;const src=preview||stored(info.logo_horizontal_url);image.hidden=!src;if(src)image.src=src;else image.removeAttribute('src');get('set_logoEmpty').hidden=!!src;const original=stored(info.logo_original_url);link.hidden=!original;if(original)link.href=original;else link.removeAttribute('href');get('set_logoMeta').textContent=get('set_logoFile').files[0]?'저장 전 미리보기':'화면과 파비콘에 맞게 크기를 자동으로 조정합니다.';}
 function sync(value){info={...value};paint();}
 function reset(){epoch++;get('set_logoFile').value='';revoke();paint();}
 function mount(){const pane=get('setCompany');if(!pane||get('set_logoFile'))return;const field=document.createElement('div');field.className='col-12';field.innerHTML='<label for="set_logoFile" class="small text-muted">조합 로고</label><input id="set_logoFile" type="file" accept="image/png,image/jpeg,image/webp" class="form-control form-control-sm"><div class="d-flex align-items-center gap-3 mt-2"><img id="set_logoPreview" alt="조합 로고 미리보기" hidden style="max-width:220px;height:70px;object-fit:contain"><span id="set_logoEmpty" class="small text-muted">등록된 조합 로고가 없습니다.</span></div><div id="set_logoMeta" class="form-text"></div><div class="d-flex justify-content-end gap-3 mt-2"><a id="set_logoOriginal" hidden target="_blank" rel="noopener noreferrer">원본 보기</a><button id="set_logoCancel" type="button" class="btn btn-outline-secondary btn-sm">선택 취소</button></div><div class="form-text">PNG·JPG·WebP, 5MB 이하. 새 파일을 선택하지 않으면 현재 로고를 유지합니다.</div>';
  const seal=get('set_sealFile')?.parentElement;seal?.before(field);if(!field.isConnected)pane.querySelector('.row').append(field);
  get('set_logoCancel').addEventListener('click',reset);get('set_logoFile').addEventListener('change',()=>{epoch++;revoke();const file=get('set_logoFile').files[0];if(file){try{root.CoopLogoUpload.validate(file);preview=URL.createObjectURL(file);}catch(e){get('set_logoFile').value='';root.showAlert?.(e.message);}}paint();});paint();
 }
 async function saveIfSelected(client,coopId){const file=get('set_logoFile')?.files[0];if(!file)return null;const generation=epoch;const result=await root.CoopLogoUpload.save(client,coopId,file,info.logo_revision);if(generation===epoch&&get('set_logoFile')?.files[0]===file){get('set_logoFile').value='';revoke();info={...info,logo_horizontal_url:result.display_url,logo_original_url:result.original_url,logo_revision:result.revision};paint();try{root.parent.ErpWorkspace?.refreshBrand();}catch(_){}}return result;}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
 root.CoopLogoSettings=Object.freeze({sync,saveIfSelected,reset});
})(window);
