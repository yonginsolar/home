/* Searchable common tabs. Selection always uses the real, authorized tab control. */
(() => {
  'use strict';
  const modules = {
    approval: ['btnApproval','/erp/approval.html','approval','approval.view'],
    mypage: ['btnMypage','/erp/mypage.html','mypage','mypage.view'],
    accounting: ['btnAccounting','/erp/accounting.html','accounting','accounting.view'],
    members: ['btnMemberAdmin','/erp/admin_member.html?scope=member_admin&tab=dashboard','member_admin','member.admin'],
    governance: ['btnGovernanceHub','/erp/governance.html','minutes',null],
  };
  const rows = [
    ['approval','approval-compose','결재 올리기','#tab1',['기안','상신','일반품의','휴가 신청'],'approval.submit'],
    ['approval','approval-inbox','결재할 문서','#tab2',['받은 결재','결재 메일함'],'approval.process'],
    ['approval','approval-wait','승인 대기','#tab3',['승인대기','결재 대기']],
    ['approval','approval-history','결재 이력','#tab4',['결재 완료','지난 문서']],
    ['mypage','mypage-work','근무·휴가','#tab-work-btn',['내 근무','연차','시간차','휴가']],
    ['mypage','mypage-pay','급여','#tab-salary-btn',['급여명세','월별 명세서']],
    ['mypage','mypage-docs','증명서·계약','#tab-cert-btn',['내 근로계약서','재직증명서']],
    ['mypage','mypage-info','내 정보','#tab-info-btn',['개인정보','직원 내정보']],
    ['mypage','mypage-preferences','알림·설정','#tab-ai-btn',['AI 연결','내 AI','디자인 설정']],
    ['mypage','mypage-calendar','전사 일정','#tab-calendar-btn',['달력','공용 일정']],
    ['mypage','mypage-notices','공지사항','#tab-notice-btn',['공지']],
    ['accounting','accounting-entry','수입·지출 입력','#accTab button[data-bs-target="#tabForm"]',['전표 입력'],'accounting.edit'],
    ['accounting','accounting-money','업무별 입력·카드 환급','#accTab button[data-bs-target="#tabMoney"]',['환급','카드 취소']],
    ['accounting','accounting-prepaid','선급·미수 관리','#accTab button[data-bs-target="#tabPrepay"]',['선급금','미수금']],
    ['accounting','accounting-assets','자산·재고','#accTab button[data-bs-target="#tabAssets"]',['자산','재고']],
    ['accounting','accounting-sync','결재·입금 가져오기','#accTab button[data-bs-target="#tabSync"]',['전자결재 연동','입금 연동']],
    ['accounting','accounting-journal','장부 찾아보기','#accTab button[data-bs-target="#tabHistory"]',['전표 검색','장부 검색']],
    ['accounting','accounting-statements','재무제표 등록·분석','#accTab button[data-bs-target="#tabStatements"]',['재무제표','재무상태표','손익']],
    ['accounting','accounting-tax','세무 할 일','#accTab button[data-bs-target="#tabTaxes"]',['원천세','부가세']],
    ['accounting','accounting-guide','신고·결산 매뉴얼','#accTab button[data-bs-target="#tabGuide"]',['신고·결산 따라 하기','결산 안내','Smart A']],
    ['members','member-roster','조합원 명부','#nav-members',['회원 명부','회원 찾기','엑셀 명부']],
    ['members','member-applications','업무 신청 관리','#nav-applications',['가입 승인','가입 신청','출자 신청']],
    ['members','member-funds','자금 및 이용고 배당 관리','#nav-funds-manage',['출자금','배당','이용실적 보상']],
    ['governance','meeting-packages','회의 꾸러미 만들기','#cardMeetingPackages',['회의자료','시나리오','회의 안건']],
  ];
  const items = rows.map(([group,key,label,selector,aliases,right])=>{
    const [menu,route,module,baseRight]=modules[group];
    return Object.freeze({group,key,label,selector,aliases:Object.freeze(aliases),right,menu,route,module,baseRight});
  });
  const byKey = new Map(items.map(x=>[x.key,x]));
  const normalizedPath = u => u.pathname.replace(/\/$/,'').replace(/\.html$/,'');
  const href = (route,key) => `${route}#erp-feature-${key}`;
  function sameRoute(tab,value){
    try{
      const a=new URL(value,location.origin),b=new URL(tab.route,location.origin);
      return a.origin===b.origin&&!a.username&&!a.password&&normalizedPath(a)===normalizedPath(b)&&a.search===b.search;
    }catch{return false;}
  }
  function intent(url) {
    const key=url.hash.match(/^#erp-feature-([a-z][a-z0-9-]{1,45})$/)?.[1];
    const tab=byKey.get(key);
    return tab&&sameRoute(tab,url.href)?tab:null;
  }
  function usable(tab,runtime){
    if(!tab||!runtime?.coop_id||runtime.is_active===false||runtime.modules?.[tab.module]===false)return false;
    const p=Array.isArray(runtime.base_effective_permissions)?runtime.base_effective_permissions:runtime.effective_permissions;
    if(!Array.isArray(p)||[tab.baseRight,tab.right].some(r=>r&&!p.includes(r)))return false;
    if(tab.group==='governance'&&!['member.admin','site.admin','minutes.manage'].some(r=>p.includes(r)))return false;
    if(tab.group==='members'&&runtime.runtime_profile==='site_member'
      &&(tab.key==='member-funds'||runtime.module_access?.member_admin!==true))return false;
    return true;
  }
  function visibleControl(tab,doc){
    const child=doc?.defaultView;
    if(!child||!sameRoute(tab,child.location.href))return null;
    const found=doc.querySelectorAll(tab.selector);
    if(found.length!==1)return null;
    const node=found[0];
    if(!node.matches('button.nav-link,button[role="tab"],a.nav-link,button[data-workspace-submenu]')
      || node.disabled || node.closest('dialog,.modal,[inert],[aria-disabled="true"],.disabled,[hidden],.hidden,.d-none'))return null;
    for(let p=node;p&&p!==doc.body;p=p.parentElement){
      const style=child.getComputedStyle(p);
      if(style.display==='none'||style.visibility==='hidden')return null;
    }
    return node;
  }
  const fromKey=key=>byKey.get(key);
  function activeTab(doc){
    return items.find(tab=>visibleControl(tab,doc)?.matches('.active,[aria-selected="true"]'))||null;
  }
  const owns=(tab,menus)=>menus.has(tab.menu) && (tab.menu!=='btnGovernanceHub'||menus.get(tab.menu)==='회의·문서·서명');
  function entries(runtime,menus,current,run){
    return items.filter(t=>usable(t,runtime)&&owns(t,menus)
      &&(!current||!sameRoute(t,current.defaultView?.location.href)||!!visibleControl(t,current)))
      .map(t=>({key:'tab:'+t.key,label:t.label,section:menus.get(t.menu),aliases:t.aliases,
        run:()=>run(href(t.route,t.key))}));
  }
  window.ErpWorkspaceFeatureTabs=Object.freeze({fromKey,href,intent,sameRoute,usable,entries,visibleControl,activeTab});
})();
