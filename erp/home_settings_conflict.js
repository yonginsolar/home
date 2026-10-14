/* Homepage settings three-way review. Page memory only; no Auth, network or writes. */
(function(root){
 'use strict';
 const labels={home_template:'홈페이지 구성',home_layout_mode:'영역 배치',home_title_font:'제목 글꼴',home_body_font:'본문 글꼴',home_external_fonts:'외부 글꼴',hero_content_visible:'배너 문구 표시',hero_text_position:'배너 문구 높이',hero_image_url:'PC 배너 사진',hero_mobile_image_url:'모바일 배너 사진',hero_image_position:'사진 기준 위치',hero_overlay_percent:'사진 어둡게',hero_text_align:'배너 글자 정렬',hero_cta_url:'배너 버튼 연결',hero_banner_link:'배너 클릭 연결',hero_slides_enabled:'배너 구성 방식',hero_autoplay:'자동 전환',impact_image_url:'참여 안내 사진',impact_image_position:'참여 안내 사진 위치',impact_cta_url:'참여 안내 버튼 연결',impact_display_mode:'참여 현황 표시',impact_regions:'참여 현황 지역',impact_visible:'참여 안내 표시',home_display_options:'사진 표시·문구 배치'};
 const textKeys=['hero_title','hero_highlight','hero_subtitle','hero_cta_label','impact_kicker','impact_title','impact_description','impact_cta_label','contact_name','contact_role','contact_phone','contact_email','contact_address'];
 const textNames=['배너 제목','강조 문구','배너 설명','배너 버튼','참여 안내 머리말','참여 안내 제목','참여 안내 설명','참여 안내 버튼','담당자','직책','전화','이메일','주소'];
 const styleKeys=['heroTitle',null,'heroSubtitle','heroButton','impactKicker','impactTitle','impactDescription','impactButton',null,null,'contactPhone','contactEmail','contactAddress'];
 const presentationNames={desktop_fit:'PC 사진 표시',desktop_position:'PC 자르기 위치',mobile_fit:'모바일 사진 표시',mobile_position:'모바일 자르기 위치',image_x:'사진 가로 위치',image_y:'사진 세로 위치',title_visible:'제목 표시',subtitle_visible:'설명 표시',button_visible:'버튼 표시',align:'글자 정렬',size:'글자 크기'};
 const clone=v=>JSON.parse(JSON.stringify(v));
 const canonical=v=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):Array.isArray(v)?v.map(canonical):v;
 const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
 function fromSettings(value,baseline){
  if(!value||typeof value.updated_at!=='string'||!value.updated_at)throw Error('저장된 설정의 확인 정보를 읽지 못했습니다. 작성 내용은 유지됩니다.');
  const result=clone(baseline);
  for(const key of Object.keys(result.payload)){if(key==='p_external_font_rights_confirmed')continue;const raw=value[key.slice(2)];if(raw!==undefined)result.payload[key]=raw===null?(typeof result.payload[key]==='string'?'':result.payload[key]):clone(raw);}
  const defaults={image_url:'',mobile_image_url:'',title:'',subtitle:'',button_label:'',button_url:'',link_url:'',image_position:'center',text_align:'center',text_position:'center',overlay:35};
  result.payload.p_hero_slides=(result.payload.p_hero_slides||[]).map(row=>({...defaults,...row}));
  const options=result.payload.p_home_display_options||{};options.slides=result.payload.p_hero_slides.map((_,i)=>options.slides?.[i]||{});result.payload.p_home_display_options=options;
  result.payload.p_expected_updated_at=value.updated_at;result.styles=clone(value.text_styles||{});return result;
 }
 function groups(model){
  const p=clone(model.payload),display=p.p_home_display_options||{},slides=display.slides||[];delete display.slides;
  const result={slides:{label:'슬라이드 사진·순서와 사진별 표시',value:{photos:p.p_hero_slides,presentation:slides}}};delete p.p_hero_slides;
  textKeys.forEach((key,i)=>{result['text:'+key]={label:textNames[i],value:{text:p['p_'+key]||'',runs:styleKeys[i]?model.styles[styleKeys[i]]||[]:[]}};delete p['p_'+key];});
  delete p.p_expected_updated_at;delete p.p_external_font_rights_confirmed;p.p_home_display_options=display;
  for(const [key,value]of Object.entries(p))result[key]={label:labels[key.slice(2)]||'홈페이지 설정',value};return result;
 }
 function mergePresentation(b,m,s,path,changes,conflicts){
  const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
  if([b,m,s].every(v=>v===undefined||object(v))){const out={};for(const key of new Set([...Object.keys(b||{}),...Object.keys(m||{}),...Object.keys(s||{})])){const chosen=mergePresentation(b?.[key],m?.[key],s?.[key],path.concat(key),changes,conflicts);if(chosen!==undefined)out[key]=chosen;}return Object.keys(out).length?out:undefined;}
  const changed=!equal(m,b),label=presentationNames[path.at(-1)]||'문구 배치',key='display:'+path.join('.');
  if(changed)changes.push(label);if(changed&&!equal(s,b)&&!equal(m,s))conflicts.push({key,label,mine:m,server:s});return changed?m:s;
 }
 function plan(base,mine,server){
  const b=groups(base),m=groups(mine),s=groups(server),chosen={},changes=[],conflicts=[];
  for(const [key,item]of Object.entries(m)){if(key==='p_home_display_options'){chosen[key]=mergePresentation(b[key].value,item.value,s[key].value,[],changes,conflicts)||{};continue;}const mineChanged=!equal(item.value,b[key].value),serverChanged=!equal(s[key].value,b[key].value);chosen[key]=mineChanged?item.value:s[key].value;if(mineChanged)changes.push(item.label);if(mineChanged&&serverChanged&&!equal(item.value,s[key].value))conflicts.push({key,label:item.label,mine:item.value,server:s[key].value});}
  const payload=clone(server.payload),styles=clone(server.styles);for(const [key,value]of Object.entries(chosen)){if(key.startsWith('text:')||key==='slides')continue;payload[key]=clone(value);}
  payload.p_home_display_options.slides=clone(chosen.slides.presentation);payload.p_hero_slides=clone(chosen.slides.photos);
  textKeys.forEach((key,i)=>{const value=chosen['text:'+key];payload['p_'+key]=value.text;if(styleKeys[i]){if(value.runs.length)styles[styleKeys[i]]=clone(value.runs);else delete styles[styleKeys[i]];}});payload.p_external_font_rights_confirmed=mine.payload.p_external_font_rights_confirmed;
  return {payload,styles,changes:[...new Set(changes)],conflicts};
 }
 function describe(value,key){
  if(key==='p_hero_image_url'||key==='p_hero_mobile_image_url'||key==='p_impact_image_url')return value?'사진 있음':'사진 없음';
  if(key.startsWith('text:'))return String(value.text||'(비어 있음)').slice(0,300)+'\n강조 서식: '+(value.runs.length?'있음':'없음');
  if(key.startsWith('display:')){const words={cover:'화면 채우기',contain:'전체 보기',center:'가운데',top:'위',bottom:'아래',left:'왼쪽',right:'오른쪽',small:'작게',normal:'보통',large:'크게'};return words[value]||(value===undefined?'기본값':typeof value==='boolean'?(value?'켜짐':'꺼짐'):String(value));}
  if(key==='slides')return (value.photos||[]).map((x,i)=>{const p=value.presentation?.[i]||{},fit=v=>v==='cover'?'화면 채우기':'전체 보기',position=v=>({top:'위',bottom:'아래',left:'왼쪽',right:'오른쪽'}[v]||'가운데');return '사진 '+(i+1)+': '+String(x.title||'제목 없음').slice(0,120)+'\n설명: '+String(x.subtitle||'(비어 있음)').slice(0,160)+'\nPC '+fit(p.desktop_fit)+' · '+position(p.desktop_position)+' / 모바일 '+fit(p.mobile_fit)+' · '+position(p.mobile_position);}).join('\n\n')||'슬라이드 사진 없음';
  if(typeof value==='boolean')return value?'켜짐':'꺼짐';if(value&&typeof value==='object')return Array.isArray(value)?value.join(', '):'설정 변경';return String(value??'').slice(0,300)||'(비어 있음)';
 }
 function message(result){return '다른 창이나 담당자가 설정을 변경했습니다. 작성 중인 내용과 선택한 사진은 그대로 유지되어 있습니다.\n\n내 변경: '+(result.changes.join(', ')||'없음')+'\n변경하지 않은 항목은 최신 저장 내용을 유지합니다.'+(result.conflicts.length?'\n\n아래 항목은 양쪽에서 바뀌었습니다. 확인하면 내 변경 내용으로 반영합니다.\n'+result.conflicts.map(c=>'\n'+c.label+'\n[내 변경]\n'+describe(c.mine,c.key)+'\n[최신 저장]\n'+describe(c.server,c.key)).join('\n'):'\n\n겹쳐 수정한 항목이 없습니다.')+'\n\n검토한 내용으로 저장할까요?';}
 root.CoopHomeConflict=Object.freeze({fromSettings,plan,message,equal,version:'1.0.0'});
})(window);
