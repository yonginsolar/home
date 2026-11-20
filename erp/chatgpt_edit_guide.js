(function (root) {
  'use strict';
  const doc = root.document;
  const guides = Object.freeze({
    about: {
      next: '받은 시안 중 마음에 드는 문구만 조합 소개 편집기에 붙여넣고, 미리보기에서 확인한 뒤 저장하세요.',
      prompt: [
        '아래 조합 소개를 홈페이지에서 읽기 좋게 편집해 줘.',
        '먼저 원문을 그대로 살린 배치·강조 제안과, 표현도 다듬은 문구 시안을 각각 만들어 줘.',
        '제목, 부제목, 본문, 목록을 구분하고 기존 사실과 숫자는 바꾸지 마. 사진 배치는 별도로 추천해 줘.',
        '아래에 보낼 소개 글을 붙여넣을게.',
      ].join('\n'),
    },
    materials: {
      next: '받은 문구를 회의자료의 필요한 위치에 붙여넣고, 기존 안건·별첨과 대조한 뒤 저장하세요.',
      prompt: [
        '아래 내용을 회의자료 초안으로 정리해 줘.',
        '안건 순서를 유지하고, 보고·논의·의결 예정 사항을 구분해 줘.',
        '원문에 없는 일정, 숫자, 의결 결과는 만들지 마. 바로 붙여넣기 쉽도록 제목과 짧은 문단으로 써 줘.',
        '아래에 보낼 내용만 붙여넣을게.',
      ].join('\n'),
    },
    minutes: {
      next: '받은 문구를 의사록 본문에 붙여넣고, 실제 발언·의결 결과와 대조한 뒤 저장하세요.',
      prompt: [
        '아래에서 확인한 회의 내용을 의사록 초안으로 정리해 줘.',
        '안건 순서대로 실제 논의와 의결 결과를 구분하고, 확인되지 않은 항목은 확인 필요로 표시해 줘.',
        '발언, 표결, 참석 여부를 추측하거나 구두 전용으로 표시한 내용을 넣지 마.',
        '아래에 보내기로 한 내용만 붙여넣을게.',
      ].join('\n'),
    },
  });
  function mount(section) {
    if (section.dataset.chatgptGuideMounted || !Object.hasOwn(guides, section.dataset.chatgptGuide)) return;
    section.dataset.chatgptGuideMounted = 'true';
    const item = guides[section.dataset.chatgptGuide];
    const make = (tag, text) => {
      const el = doc.createElement(tag);
      if (text) el.textContent = text;
      return el;
    };
    const area = make('div');
    area.style.cssText = 'padding-block:.55rem;overflow-wrap:anywhere';
    const direction = make('p', '요청 문구를 복사해 본인 ChatGPT에 붙여넣고, AI에 보낼 자료만 직접 추가하세요.');
    const actions = make('div');
    actions.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:.65rem';
    const chat = make('a', 'ChatGPT 열기');
    chat.href = 'https://chatgpt.com/';
    chat.target = '_blank';
    chat.rel = 'noopener noreferrer';
    chat.referrerPolicy = 'no-referrer';
    const copy = make('button', '요청 문구 복사');
    copy.type = 'button';
    copy.className = 'btn btn-sm btn-outline-secondary';
    const text = make('details');
    text.style.marginBlock = '.55rem';
    const snippet = make('pre', item.prompt);
    snippet.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;padding:.5rem;margin:0;font:inherit';
    text.append(make('summary', '요청 문구 보기'), snippet);
    const status = make('span');
    status.setAttribute('role','status');
    actions.append(chat, copy, status);
    area.append(direction, actions, text, make('p', item.next));
    section.append(area);
    let pending = null;
    new root.MutationObserver(records => {
      if (section.hidden || !section.open || records.some(r => r.attributeName==='open' && r.oldValue!==null)) {
        pending=null; status.textContent='';
      }
    }).observe(section,{attributes:true,attributeOldValue:true,attributeFilter:['open','hidden']});
    copy.addEventListener('keydown', e => {
      if (e.repeat && !e.isComposing && ['Enter',' '].includes(e.key)) e.preventDefault();
    });
    copy.addEventListener('click', async () => {
      if (pending || section.hidden || !section.open) return;
      const run = {};
      pending = run;
      const active = () => pending===run && section.isConnected && section.open && !section.hidden;
      try {
        if (typeof root.navigator.clipboard?.writeText !== 'function') throw Error('CLIPBOARD_UNAVAILABLE');
        await root.navigator.clipboard.writeText(item.prompt);
        if(active())status.textContent = '요청 문구를 복사했어요.';
      } catch {
        if(active()) {
          text.open = true;
          status.textContent = '아래 문구를 직접 선택해 복사해 주세요.';
        }
      } finally {
        if(pending===run)pending=null;
      }
    });
  }
  for (const section of doc.querySelectorAll('details[data-chatgpt-guide]')) mount(section);
  function setVisible(section, visible) {
    if (!section) return;
    section.hidden = !visible;
    if (section.hidden) section.open=false;
  }
  root.CoopChatGptEditGuide = Object.freeze({version:'1.0.0',mount,setVisible});
})(window);
