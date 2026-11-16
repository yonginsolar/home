/* 변경등기 클릭 안내1.0.0 · 원본 픽셀 좌표의 비상호작용 HTML 표시. */
(function(root){
 'use strict';
 // 좌표는 원본 픽셀의 [설명,x,y,너비,높이,해당유형]이다. 사진/입력값은 바꾸지 않는다.
 const points={
  'click-01-more.jpg':[['등기유형 더보기',803,176,193,67]],
  'click-02-special.jpg':[['특수법인 왼쪽 +',58,479,172,31]],
  'click-03-change.jpg':[['변경등기 왼쪽 +',89,253,168,34,['capital','officers','chair','name','purpose']],['주사무소이전(관할내) · 해당 관할 확인',90,334,281,34,['office']],['주사무소이전(관할외) · 해당 관할 확인',90,374,281,34,['office']]],
  'click-04-capital.jpg':[['출자/자산사항의 변경',135,391,238,34],['선택',463,689,94,47]],
  'click-05-authority-empty.jpg':[['대표권 있는 사람의 성명 · 직접 입력',218,292,200,41],['등록번호 구분',218,353,200,39],['주민등록번호 · 등기소에서 직접 입력',218,414,406,40],['확인',744,576,93,47]],
  'click-06-capital-items.jpg':[['1. 출자에관한사항 행의 변경 · 설립인가 행 아님',876,626,49,31]],
  'click-07-capital-change-empty.jpg':[['내용 · 이번 ERP 전체 좌수/총액으로 대체',173,237,890,154],['등기원인 · 이번 근거 선택/입력',173,413,533,40],['등기원인일자 · 이번 실제 효력일',890,413,173,41],['등록완료 · 내용을 확인한 뒤',976,516,113,45],['등록취소 · 반영하지 않고 닫기',877,516,94,45]],
  'extra-01-basic-type.jpg':[['전자표준양식',507,199,191,60],['안내 확인 후 동의합니다',779,332,131,45],['등기유형 더보기',795,660,194,67]],
  'extra-02-basic-reason-court.jpg':[['등기의 사유 · 시험 문구를 쓰지 않음',254,410,730,153],['등기소 검색 · 관할을 바꿔야 할 때',258,684,94,31],['저장 후 다음',864,798,135,61]],
  'extra-03-special-types.jpg':[['임원사항 변경 · 이사장 포함',140,204,318,32,['officers','chair']],['명칭/목적 등의 변경',141,244,292,32,['name','purpose']],['출자/자산사항의 변경',141,604,294,32,['capital']],['선택',463,690,94,46]],
  'extra-04-batch-type.jpg':[['여러 등기사항의 일괄 변경',140,394,331,33],['선택',463,690,94,46]],
  'extra-05-court-search.jpg':[['검색 조건',196,151,262,41],['등기소 검색어',471,151,436,41],['조회',928,150,90,45],['결과가 있으면 선택',966,577,90,45]],
  'extra-06-corporation-search.jpg':[['조회방식 · 상호/명칭 또는 등록번호',201,179,450,38],['등기소',199,234,500,42],['선택한 조회방식의 검색값',357,299,340,41],['조회',928,294,91,46],['일치한 법인 행을 고른 뒤 선택완료',942,690,114,46]],
  'extra-07-item-selection.jpg':[['기타사항 · 출자금',414,245,180,68],['임원/출자항목 · 임원 변경',600,172,180,67]],
  'extra-08-home.jpg':[['법인등기 신청',935,468,120,139]],
  'extra-09-application-list.jpg':[['신청서 작성 탭',10,99,441,58],['새 신청은 신규작성',1192,193,129,60],['기존 신청을 이어 쓰면 해당 행 수정',1226,666,51,31]],
  'extra-10-new-application.jpg':[['전자표준양식',500,199,190,60],['안내 확인 후 동의합니다',772,332,130,46]],
  'extra-11-other-add.jpg':[['대제목',173,167,200,40],['소제목',381,167,682,40],['내용',173,238,890,153],['등기원인',173,414,533,40],['등기원인일자',890,414,173,40],['등록완료',976,516,113,45],['등록취소',877,516,94,45]],
  'extra-12-capital-classification.jpg':[['자본에 관한 사항',173,167,200,40],['1. 출자에관한사항',381,167,682,40],['내용',173,238,890,153],['등기원인',173,414,533,40],['등기원인일자',890,414,173,40],['등록완료',976,516,113,45]],
  'extra-13-officer-add.jpg':[['등기원인',249,167,363,41],['등기원인일자',814,167,200,41],['직책',249,283,299,40],['실제 대표권이 있을 때 대표권 있음',563,288,110,33],['등록번호 구분',249,344,299,39],['성명',249,403,299,40],['주민등록번호 · 직접 입력',249,464,459,40],['저장 후 계속입력',752,749,167,45],['등록완료',923,749,117,45]],
  'extra-16-representative-address.jpg':[['대표권 있음 · 해당할 때',563,97,110,33],['주소검색 · 대표자 본인의 주소',255,376,74,32],['상세주소',249,421,422,39],['해외주소인 경우 직접입력',249,340,176,25]],
  'extra-17-branch-add.jpg':[['등기원인',218,180,362,41],['등기원인일자',813,180,201,41],['분사무소명',218,243,796,39],['분사무소 주소검색',224,337,74,33],['상세주소',218,382,446,41],['저장 후 계속입력',752,558,167,45],['등록완료',923,558,117,45]],
  'extra-18-manager-top.jpg':[['등기원인',218,186,364,40],['등기원인일자',813,186,201,40],['직책·공동 여부',218,302,353,40],['등록번호 구분',218,362,300,40],['성명',218,423,300,40],['등록번호 · 직접 입력',218,485,460,41],['주소검색',224,585,74,33],['저장 후 계속입력',752,749,167,45],['등록완료',923,749,117,45]],
  'extra-19-manager-bottom.jpg':[['주소검색',224,357,74,33],['상세주소',218,403,447,40],['규정',218,462,796,72],['지배인을 둔 장소 검색',224,557,150,33]],
  'extra-20-manager-place.jpg':[['주소 또는 지점명 검색',568,114,267,34],['실제 장소의 행 선택',65,219,24,23],['선택',718,299,91,46]],
  'extra-21-fee-electronic.jpg':[['전자납부',218,300,113,27],['영수증 연도·번호 구분',219,348,342,41],['영수증의 납부번호',583,348,437,41],['등록완료',923,577,114,46]],
  'extra-22-fee-bank.jpg':[['은행납부',341,300,110,27],['영수증 연도·번호 구분',219,348,342,41],['영수증의 납부번호',583,348,437,41],['실제 납부금액',219,418,198,41],['등록완료',923,577,114,46]],
  'extra-23-fee-kiosk.jpg':[['무인납부',463,300,113,27],['영수증 연도·번호 구분',219,348,342,41],['영수증의 납부번호',583,348,437,41],['등록완료',923,577,114,46]],
  'extra-24-applicant-top.jpg':[['실제 신청인 구분',249,291,730,46],['성명',249,358,279,40],['대표권자조회 · 필요한 경우',548,363,96,31],['직책',249,418,715,40],['등록번호 구분',249,479,299,40],['주민등록번호 · 직접 입력',249,539,441,41],['등록완료',844,647,113,46]],
  'extra-25-applicant-bottom.jpg':[['신청인 주소검색',235,204,73,32],['전화번호',229,269,395,39],['이메일',229,329,736,40],['선택 구분에 맞는 법인 상호',229,390,299,39],['같은 법인의 본점소재지',235,450,73,32],['같은 법인의 등록번호',229,551,299,40],['등록완료',844,647,113,46]],
  'extra-26-notification.jpg':[['대상자가 있을 때만 해당 목록 선택',53,179,27,23],['필요할 때 저장',713,692,90,46]],
  'extra-27-attachments-middle.jpg':[['실제 첨부할 서류명 검색',150,150,464,46],['조회',629,150,127,46],['실제 첨부할 때 출자금납입증명서',65,458,25,25],['선택',662,647,94,46]],
  'extra-28-attachments-bottom.jpg':[['실제 준비한 등록면허세영수필확인서',65,520,25,24],['대리 신청의 실제 위임장을 첨부할 때',426,520,24,24],['선택',662,647,94,46]],
  'final-01-name-address.jpg':[['명칭 변경 원인',182,72,120,40,['name']],['명칭 변경 효력일',682,72,179,40,['name']],['변경할 명칭',182,132,299,40,['name']],['로마자 · 해당할 때',682,132,163,40,['name']],['주사무소 원인',182,332,199,40,['office']],['이전/변경 효력일',822,332,160,40,['office']],['주소검색',189,407,74,31,['office']],['상세주소',182,450,451,40,['office']]],
  'final-02-address-search.jpg':[['도로명/지번 방식',43,118,794,60],['시군구',135,389,223,40],['도로명',485,389,210,40],['조회',711,386,90,45],['건물번호',617,614,195,41],['결과 선택 후 선택',749,709,90,45]],
  'final-03-purpose-add.jpg':[['등기원인',228,341,325,40],['효력일',764,341,180,40],['사업목적',228,402,516,40],['로마자 · 해당할 때',228,462,705,41],['각호설정 · 새 목적의 해당 경우',228,530,169,24],['저장 후 계속입력',674,619,164,46],['등록완료',844,619,113,46]],
  'final-04-purpose-change.jpg':[['등기원인',228,341,325,40],['효력일',764,341,180,40],['이번 변경 사업목적 · 사진 문구는 예시',228,402,705,40],['로마자 · 해당할 때',228,462,705,41],['등록완료',844,619,113,46]],
  'final-05-tax.jpg':[['과세표준액 · 실제 납부서와 대조',182,159,199,39],['등록면허세 납입정보',96,349,910,40],['지방교육세',703,477,248,40],['농어촌특별세 · 해당할 때',703,531,248,40]],
  'final-06-fees.jpg':[['등기신청수수료 · 실제 신청 기준',182,120,200,40],['실제 전자납부가 있으면 조회',732,346,100,31],['수수료 납부정보 추가',350,557,313,47],['저장 후 다음',863,644,144,60]],
  'final-07-attachments.jpg':[['신청인/대리인 입력',350,258,313,46],['첨부서면 추가',350,580,313,47],['첨부서면 목록 저장',959,510,48,31],['알림 대상자 정보 입력 · 필요한 경우',350,859,313,46],['검토 후 신청서작성완료',836,945,171,61]],
  'final-08-attachment-picker.jpg':[['첨부서면명 검색',150,150,465,46],['조회',629,150,127,46],['실제 준비한 서류의 체크칸',65,334,24,24],['실제 준비한 서류의 체크칸',424,334,24,24],['선택',662,647,94,46]]
 };
 const captures={more:['click-01-more.jpg',1014,263,'등기유형 더보기'],special:['click-02-special.jpg',598,761,'특수법인 펼치기'],change:['click-03-change.jpg',598,761,'변경등기 펼치기'],capital:['click-04-capital.jpg',598,761,'단일 출자/자산사항 선택'],authority:['click-05-authority-empty.jpg',878,648,'신청권한 확인 · 입력 전 화면'],items:['click-06-capital-items.jpg',1030,756,'기타사항 자동 선택·기존 항목 변경'],editor:['click-07-capital-change-empty.jpg',1130,587,'기존 출자에관한사항 변경창']};
 function figure(key){const[file,w,h,title]=captures[key]||[];if(!file)throw Error('확인한 화면이 아닙니다.');const src='/erp/assets/registry-guide/'+file,overlay=key==='editor'?'<output class="rg-value-overlay" data-rg-capital-value style="left:15.31%;top:40.37%;width:78.76%;height:26.24%" aria-label="내용칸에 입력할 값">ERP 값 확인 중</output>':'';return '<figure class="rg-official-capture" data-rg-click-capture="'+key+'"><figcaption>'+title+'</figcaption><div class="rg-screen-scroll" tabindex="0" aria-label="'+title+' 화면 · 좌우로 이동"><div class="rg-capture-map" style="max-width:'+w+'px"><img src="'+src+'" width="'+w+'" height="'+h+'" loading="lazy" decoding="async" alt="인터넷등기소 '+title+' 실제 화면">'+overlay+'</div></div><p class="rg-capture-source">사용자 제공 · 대한민국 법원 인터넷등기소 · <a href="'+src+'" target="_blank" rel="noopener noreferrer">원본 보기</a></p></figure>';}
 function selected(file,topic){return(points[file]||[]).filter(p=>!p[5]||p[5].includes(topic));}
 function decorate(guide,topic){for(const fig of guide.querySelectorAll('figure.rg-official-capture')){const img=fig.querySelector('img'),map=fig.querySelector('.rg-capture-map');if(!img||!map)continue;const file=img.getAttribute('src').split('/').pop();if(!points[file])continue;const key=file+'|'+topic;if(fig.dataset.rgClickKey===key)continue;const w=Number(img.getAttribute('width')),h=Number(img.getAttribute('height')),rows=selected(file,topic);let layer=map.querySelector('.rg-click-layer'),legend=fig.querySelector('.rg-click-legend');if(!layer){layer=document.createElement('span');layer.className='rg-click-layer';layer.setAttribute('aria-hidden','true');map.append(layer);}if(!legend){legend=document.createElement('ol');legend.className='rg-click-legend';legend.setAttribute('aria-label','사진의 클릭 위치');fig.append(legend);}layer.replaceChildren();legend.replaceChildren();rows.forEach(([label,x,y,bw,bh],i)=>{if(![x,y,bw,bh,w,h].every(Number.isFinite)||x<0||y<0||bw<=0||bh<=0||x+bw>w||y+bh>h)throw Error('클릭 표시 좌표를 확인해 주세요.');const mark=document.createElement('span'),number=document.createElement('b'),item=document.createElement('li');mark.className='rg-click-mark';mark.dataset.rgClick=String(i+1);mark.style.cssText='left:'+(x/w*100)+'%;top:'+(y/h*100)+'%;width:'+(bw/w*100)+'%;height:'+(bh/h*100)+'%';number.textContent=String(i+1);mark.append(number);layer.append(mark);item.textContent=label;legend.append(item);});fig.dataset.rgClickKey=key;}}
 root.CoopRegistryGuideClicks=Object.freeze({points,captures,figure,selected,decorate,version:'1.0.0'});
})(typeof window==='undefined'?globalThis:window);
