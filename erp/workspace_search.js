/* ERP 기능 검색: 검색어는 열린 창에서만 유지한다. 이동은 기존 메뉴가 처리한다. */
(() => {
  'use strict';
  if (window.self !== window.top) return;

  const aliases = Object.freeze({
    home: ['처음', '대시보드'], btnApproval: ['결재', '상신', '기안', '품의', '지출결의', '휴가 신청', '연차 신청', '시간차 신청', '실물결재'],
    btnMypage: ['내 정보', '전사 일정', '내 일정', '급여명세', '연차', '근무시간', '달력', '내 휴가'],
    btnAccounting: ['회계', '통장', '장부', '분개', '전표', '결산', '원천세', '결산보고서', '은행 대조', '전자결재 연동'],
    btnAdmin: ['인사', '직원', '근로계약', '직원 명부', '근태', '급여대장', '인사카드'],
    btnCoopSettings: ['설정', '초기설정', '기본정보', '납입기한', '직인', '조합 설정 점검표'],
    btnMemberAdmin: ['회원', '명부', '출자금', '조합원 명부', '가입 승인', '배당', '회원 엑셀', '출자금 등록'],
    btnParticipationAnalytics: ['참여 통계', '참여율'], btnEducationParticipants: ['교육', '행사', '참석자'],
    btnSiteAdmin: ['웹사이트', '홈페이지 편집', '가입 약관', '디자인', '게시판'], btnQuizAdmin: ['문제', '설문 퀴즈', '정답'],
    btnProposalBuilder: ['제안서', '학교 제안서', '범용 제안서'],
    btnOfficialsAdmin: ['임원', '위원회', '이사장', '선관위원', '사외이사', '임원 엑셀'], btnGovernanceHub: ['회의', '이사회', '총회', '의사록', '문서 꾸러미', '회의 꾸러미'],
    btnRegistryHub: ['등기', '공시', '변경 신고'], btnAudit: ['감사', '변경 이력'], btnPerm: ['권한', '접근 권한', '직급 권한'],
    btnVoteHub: ['선거', '투표'], btnFestivalReceipts: ['축제', '매출', '재고'],
    btnPowerMonitorAdmin: ['발전소', '발전량', '모니터링', '발전소 이력'], btnServiceContracts: ['이용계약', '청구서', '이용료'],
    btnDocuments: ['정관', '규약', '공개 문서'], btnMobileDocuments: ['정관', '규약', '공개 문서'],
    btnSignature: ['서명', '전자서명 요청'], btnMobileSignature: ['서명'],
    btnVillageEnergy: ['발전 정산', '수익 배분'], btnSunVillageDemo: ['마을 관리'], btnPlatform: ['조합 추가', '조합 운영']
  });
  // Aliases describe a menu; they never add an action or replace an authenticated label.
  const menuAliases = (id, label) => id === 'btnAdmin' && label === '마을 기본정보' ? ['마을', '기본정보'] : aliases[id] || [];
  const bookletRoute='/minutes/meeting_workspace.html#assembly-booklet';
  const canUseBooklet=runtime=>!!runtime?.coop_id&&runtime.is_active!==false&&runtime.modules?.minutes!==false
    && ['minutes.manage','member.admin','site.admin'].some(key=>
      (runtime.base_effective_permissions||runtime.effective_permissions||[]).includes(key));
  const bookletEntry=run=>({key:'feature:assembly-booklet',label:'총회 자료집',section:'문서 꾸러미',
    aliases:['예산','수입 예산','지출 예산','자료집','정기총회 자료집','사업계획','사업보고','차입금 한도'],run});
  const localAliases=label=>({
    '결재 올리기':['기안','상신','문서 작성'], '결재할 문서':['받은 결재','메일함'], '승인 대기':['승인대기','결재 대기'],
    '결재 이력':['결재 완료','지난 문서'], '장부 찾아보기':['전표 검색','장부 검색'], '전사 일정':['달력','전체 일정'],
    '내 근무·휴가':['시간차','연차','근무시간'], '조합원 명부':['회원 찾기','회원 목록'],
    '규정·정관 관리':['정관 개정','규약'], '회의 꾸러미 만들기':['회의자료','시나리오','문서 꾸러미'],
    '선거 설정·명부':['선거구','선거인 명부'], '경영공시':['공시','공시 복사'], '시청 변경신고':['협동조합 변경 신고'],
    '변경등기 가이드':['등기 안내','법원 등기']
  })[label]||[];
  const normalized = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const compact = value => normalized(value).replace(/ /g, '');
  function match(entries, query) {
    const term = compact(query);
    if (!term) return entries;
    const tokens = normalized(query).split(' ');
    return entries.map(entry => {
      const name = compact(entry.label), tags = (entry.aliases || []).map(compact);
      const fields = [name, ...tags, compact(entry.section)];
      const score = name === term ? 6 : name.startsWith(term) ? 5 : tags.includes(term) ? 4
        : name.includes(term) ? 3 : fields.some(field => field.includes(term)) ? 2
          : tokens.every(token => fields.some(field => field.includes(token))) ? 1 : 0;
      return {entry, score};
    }).filter(item => item.score).sort((a,b) => b.score-a.score).map(item => item.entry);
  }

  const editable = node => node?.nodeType === 1 && !!node.closest('input,textarea,select,[role="textbox"],[contenteditable]:not([contenteditable="false"])');
  const visible = node => !!node?.isConnected && !!node.ownerDocument?.defaultView && !node.closest('[hidden],[inert]') && node.getClientRects().length > 0
    && node.ownerDocument.defaultView.getComputedStyle(node).visibility === 'visible';
  function modalOpen(doc, except) {
    return !!doc && (doc.defaultView?.CoopDialog?.hasPending?.() || [...doc.querySelectorAll('dialog[open],.modal.show,[aria-modal="true"]')]
      .some(node => node !== except && visible(node)));
  }

  function mount(read) {
    const doc = document;
    let child, owner, origin, composing = false, activeKey, results = [], keyboardLock = '', closeStamp = 0;
    const buttons = [];
    const make = (tag, className, value) => {
      const el = doc.createElement(tag); if (className) el.className = className; if (value) el.textContent = value; return el;
    };
    const dialog = make('dialog', 'erp-feature-search');
    dialog.id = 'erpFeatureSearch'; dialog.setAttribute('aria-labelledby', 'erpFeatureSearchTitle');
    const head = make('div', 'erp-feature-search-head');
    const title = make('h2', '', '기능 검색'); title.id = 'erpFeatureSearchTitle';
    const dismiss = make('button', 'erp-feature-search-close', '닫기'); dismiss.type = 'button';
    const input = make('input', 'erp-feature-search-input'); input.type = 'search'; input.autocomplete = 'off';
    input.placeholder = '메뉴나 기능 이름을 입력하세요'; input.setAttribute('aria-label', '메뉴나 기능 이름');
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded','false');
    const status = make('p', 'erp-feature-search-status'); status.setAttribute('role', 'status');
    const list = make('ul', 'erp-feature-search-results'); list.id = 'erpFeatureSearchResults'; list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', '검색 결과'); input.setAttribute('aria-controls',list.id);
    head.append(title,dismiss); dialog.append(head,input,status,list); doc.body.append(dialog);

    function mark(scroll) {
      for (const item of list.children) item.setAttribute('aria-selected',String(item.dataset.key === activeKey));
      const option = [...list.children].find(item => item.dataset.key === activeKey);
      if (option) {
        input.setAttribute('aria-activedescendant',option.id);
        if (scroll) option.scrollIntoView?.({block:'nearest'});
      } else input.removeAttribute('aria-activedescendant');
    }
    function refresh(resetSelection = false) {
      const current = read(dialog.open);
      for (const button of buttons) button.hidden = !current?.owner;
      if (!dialog.open) return;
      if (!current?.owner || current.owner !== owner) { close(false); return; }
      const next = match(current.entries, input.value);
      const unchanged = next.length === results.length && next.every((entry,i) => entry.key === results[i].key
        && entry.label === results[i].label && entry.section === results[i].section);
      if(resetSelection&&list.contains(doc.activeElement))input.focus({preventScroll:true});
      results = next;
      if (resetSelection || !unchanged || !results.some(entry => entry.key === activeKey)) activeKey = undefined;
      if (!unchanged) {
        const wasOnOption=list.contains(doc.activeElement);
        list.replaceChildren(...results.map((entry,i) => {
          const option = make('li','erp-feature-search-result'); option.id = `erpFeatureSearchOption${i}`;
          option.dataset.key = entry.key; option.setAttribute('role','option'); option.tabIndex=-1;
          option.append(make('strong','',entry.label));
          if (entry.section) option.append(make('small','',entry.section));
          return option;
        }));
        if(wasOnOption)input.focus({preventScroll:true});
      }
      status.textContent = results.length ? (compact(input.value) ? `검색 결과 ${results.length}개` : '열 수 있는 메뉴와 기능') : (compact(input.value) ? '검색 결과가 없습니다.' : '지금 열 수 있는 메뉴가 없습니다.');
      input.setAttribute('aria-expanded', String(results.length > 0));
      if (resetSelection) list.scrollTop = 0;
      mark(false);
    }
    function syncHeight() {
      if (dialog.open && window.visualViewport) dialog.style.setProperty('--erp-search-viewport', `${window.visualViewport.height}px`);
    }
    function close(restore = true) {
      if (!dialog.open) return;
      const target = origin, closingChild = child, stamp = ++closeStamp;
      owner = origin = activeKey = undefined; results = []; composing = false;
      dialog.close(); input.value = ''; list.replaceChildren(); status.textContent = '';
      input.removeAttribute('aria-activedescendant'); input.setAttribute('aria-expanded','false');
      window.visualViewport?.removeEventListener('resize',syncHeight);
      dialog.style.removeProperty('--erp-search-viewport');
      if (!restore) return;
      // Native dialog focus may already be restored; don't overwrite a new modal or input.
      requestAnimationFrame(() => {
        if (stamp !== closeStamp || dialog.open || !visible(target) || modalOpen(doc,dialog) || modalOpen(child)) return;
        if (target.ownerDocument !== doc && (child !== closingChild || target.ownerDocument !== child)) return;
        const focused = doc.activeElement;
        const fromChild = target.ownerDocument !== doc;
        if (focused !== doc.body && focused !== target && !dialog.contains(focused)
          && !(fromChild && focused === child.defaultView.frameElement)) return;
        if (fromChild && child.activeElement !== child.body && child.activeElement !== target) return;
        target.focus({preventScroll:true});
      });
    }
    function open(target) {
      if (dialog.open || modalOpen(doc,dialog) || modalOpen(child)) return false;
      const current = read(false); if (!current?.owner) return false;
      ++closeStamp; owner = current.owner; origin = target;
      dialog.showModal(); syncHeight(); window.visualViewport?.addEventListener('resize',syncHeight);
      refresh(true); input.focus({preventScroll:true}); return true;
    }
    function pick(key) {
      const current = read(true);
      if (!dialog.open || !current?.owner || current.owner !== owner) { close(false); return; }
      const entry = current.entries.find(item => item.key === key);
      if (!entry) { refresh(); return; }
      close(); entry.run();
    }
    function shortcut(event) {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229
        || event.key.toLowerCase() !== 'k' || event.ctrlKey === event.metaKey || event.altKey || event.shiftKey
        || event.composedPath().some(editable)) return;
      if (open((event.target.ownerDocument || event.currentTarget).activeElement)) event.preventDefault();
    }
    function repeatGuard(event) {
      if (!keyboardLock) return;
      if (event.type === 'keyup' || !event.repeat) { if (event.key === keyboardLock) keyboardLock = ''; return; }
      if (event.key === keyboardLock) { event.preventDefault(); event.stopImmediatePropagation(); }
    }
    function bindKeys(target, add) {
      const method = add ? 'addEventListener' : 'removeEventListener';
      target?.[method]('keydown',shortcut);
      target?.[method]('keydown',repeatGuard,true);
      target?.[method]('keyup',repeatGuard,true);
    }
    bindKeys(doc,true);
    window.addEventListener('blur', () => { keyboardLock = ''; });
    dialog.addEventListener('cancel', event => event.preventDefault());
    dismiss.addEventListener('click', () => close());
    input.addEventListener('input', () => { if (!composing) refresh(true); });
    input.addEventListener('compositionstart',() => { composing = true; });
    input.addEventListener('compositionend',() => { composing = false; refresh(true); });
    list.addEventListener('pointerdown',event => { if (event.pointerType === 'mouse' && event.target.closest('li')) event.preventDefault(); });
    list.addEventListener('click',event => { const option = event.target.closest('li'); if (option) pick(option.dataset.key); });
    function focusResult(index){
      const option=list.children[index];if(!option)return false;
      activeKey=option.dataset.key;mark(true);option.focus({preventScroll:true});return true;
    }
    dialog.addEventListener('keydown',event => {
      const {key} = event;
      if (composing || event.isComposing || event.keyCode === 229) { event.stopPropagation(); return; }
      if (key === 'Escape') {
        keyboardLock = key; event.preventDefault(); event.stopPropagation(); close();
      } else if (key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault(); event.stopPropagation();
        if(doc.activeElement===input&&!event.shiftKey&&focusResult(0))return;
        if(doc.activeElement===dismiss&&event.shiftKey&&focusResult(0))return;
        (doc.activeElement===input||list.contains(doc.activeElement)&&!event.shiftKey ? dismiss : input).focus();
      } else if ((event.target === input||list.contains(event.target)) && !event.altKey && !event.metaKey && !event.ctrlKey
          && (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key===' '&&event.target!==input)) {
        event.preventDefault(); event.stopPropagation();
        if (key === 'Enter'||key===' ') {
          const option=event.target.closest?.('li[role="option"]');
          if(!event.repeat&&option&&list.contains(option)&&doc.activeElement===option&&option.dataset.key===activeKey){keyboardLock=key;pick(activeKey);}
          return;
        }
        if (!results.length) return;
        const advance=key==='ArrowDown'?1:-1;
        const index=event.target===input?(advance===1?-1:0):results.findIndex(entry=>entry.key===activeKey);
        focusResult((index+advance+results.length)%results.length);
      } else if (key === 'Enter' && event.target === dismiss && !event.repeat) keyboardLock = key;
    });
    function trigger(button = make('button','erp-feature-search-trigger')) {
      button.type = 'button'; button.classList.add('erp-feature-search-trigger'); button.hidden = true;
      button.title='기능 검색 (⌘K / Ctrl+K)';
      button.setAttribute('aria-label','기능 검색'); button.setAttribute('aria-haspopup','dialog');
      button.setAttribute('aria-controls',dialog.id); button.setAttribute('aria-keyshortcuts','Control+K Meta+K');
      const icon = make('span','erp-feature-search-icon'); icon.setAttribute('aria-hidden','true');
      button.replaceChildren(icon,make('span','erp-feature-search-trigger-text','기능 검색'));
      button.addEventListener('click',() => open(button)); buttons.push(button); return button;
    }
    const viewport = window.matchMedia('(max-width: 991.98px)');
    viewport.addEventListener('change',() => refresh());
    window.addEventListener('pagehide',() => { close(false); keyboardLock = ''; });
    return {trigger,refresh:() => refresh(),reset:() => { close(false); refresh(); }, bindChild(next) {
      const newChild = next === doc ? null : next;
      if (child === newChild) return;
      close(false); bindKeys(child,false); child = newChild; bindKeys(child,true);
    }};
  }
  window.ErpWorkspaceSearch = Object.freeze({mount,menuAliases,localAliases,visible,bookletRoute,bookletEntry,canUseBooklet});
})();
