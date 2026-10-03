/* v1.2.4 — meeting-transcript drafting examples; ERP tools remain read-only. */
(function () {
  'use strict';
  const LABELS = { help: '사용 안내', accounting: '회계', approvals: '전자결재', documents: '문서함', inventory: '재고', events: '행사 매출', member_stats: '조합원 통계' };
  const TOOLS = { erp_help: '사용 안내', erp_summary: '현황 조회', erp_search: '검색', erp_fetch: '본문 조회' };
  const date = (v) => v ? new Date(v).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '아직 없음';
  const element = (tag, text, className) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; };
  const labels = (scopes) => (scopes || []).filter((s) => s !== 'help').map((s) => LABELS[s] || s).join(' · ') || '사용 안내';
  const CLIENTS = {
    chatgpt: { name: 'ChatGPT', detail: '웹에서 연결하기', url: 'https://chatgpt.com/plugins', link: 'ChatGPT 연결 화면 열기', docs: 'https://developers.openai.com/plugins/deploy/connect-chatgpt',
      steps: ['ChatGPT의 플러그인 화면을 엽니다. 이미 ERP 플러그인을 설치했다면 새로 만들지 말고 해당 연결의 인증을 진행합니다.', '새 연결이 필요하면 + 버튼에서 이름과 설명을 적고, 연결 주소에 아래 주소를 붙여넣습니다. 이 메뉴가 없으면 설정 → 보안 및 로그인에서 개발자 모드 제공 여부를 확인합니다.', 'ERP 화면이 열리면 로그인 상태를 확인하고, AI에 전달할 업무 분야를 직접 선택합니다.', 'ChatGPT 대화에서 ERP 연결을 선택하고 아래 연결 확인 질문을 보냅니다.'],
      note: '맞춤 연결 메뉴는 계정·조직 정책에 따라 제공되지 않을 수 있습니다. 플러그인 설치와 ERP 접근 허용은 서로 다른 단계입니다.' },
    claude: { name: 'Claude', detail: '웹 · Claude Code', url: 'https://claude.ai/customize/connectors', link: 'Claude 연결 설정 열기', docs: 'https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp',
      steps: ['Claude의 맞춤 설정 → 커넥터에서 추가 → 맞춤 커넥터를 선택합니다. 이미 등록했다면 기존 커넥터의 연결 버튼을 사용합니다.', '이름을 적고 아래 연결 주소를 붙여넣습니다. 인증은 OAuth 로그인, OAuth 클라이언트는 자동 등록(Register automatically)을 선택합니다. 요청 헤더나 API 키는 입력하지 않습니다.', '연결을 눌러 ERP에 로그인한 뒤 전달할 업무 분야를 직접 선택합니다.', 'Claude 대화의 + → 커넥터에서 ERP를 켜고 아래 연결 확인 질문을 보냅니다.'],
      note: 'Claude Code를 같은 Claude 구독 계정으로 사용하면 Claude 웹에 연결한 커넥터를 불러올 수 있습니다. /mcp에서 확인하세요. 조직 계정은 관리자가 커넥터를 먼저 추가해야 할 수 있습니다.' },
    codex: { name: 'Codex', detail: '데스크톱 앱', docs: 'https://developers.openai.com/codex/mcp',
      steps: ['Codex 데스크톱 앱의 설정 → MCP 서버를 엽니다. 기존 ERP 서버가 있으면 새로 추가하지 않습니다.', '새 서버를 추가하는 경우 이름을 적고 Streamable HTTP를 선택한 뒤 아래 연결 주소를 붙여넣어 저장합니다.', '서버 목록의 인증(Authenticate)을 눌러 ERP에 로그인하고 전달할 업무 분야를 직접 선택합니다. 설치만 된 상태라면 이 인증 단계가 남아 있습니다.', '앱에서 재시작을 요구하면 입력 중인 작업을 저장한 뒤 진행합니다. 새 대화에서 /mcp로 ERP 서버를 확인하고 아래 연결 확인 질문을 보냅니다.'],
      note: 'ERP 홈페이지에 로그인했더라도 Codex 연결 인증은 별도로 한 번 완료해야 합니다. 이후 유효한 연결은 재사용합니다.' },
    gemini: { name: 'Gemini CLI', detail: '고급 설정', docs: 'https://geminicli.com/docs/tools/mcp-server/',
      steps: ['Gemini CLI를 사용한다면 settings.json의 mcpServers에 아래 설정을 추가합니다. 기존 설정을 지우지 말고 함께 둡니다.', 'Gemini CLI를 다시 열고 /mcp auth coop-erp로 인증을 시작합니다.', 'ERP 화면에서 직접 로그인하고 전달할 업무 분야를 선택한 뒤 아래 연결 확인 질문을 보냅니다.'],
      note: '이 안내는 개발용 Gemini CLI에만 해당합니다. 일반 Gemini 앱의 맞춤 연결은 지역·언어·계정 제한이 있어 한국에서 바로 연결되는 기능으로 안내하지 않습니다.' }
  };
  const connectionPrompt = (address, name, steps) => [
    '우리 조합 ERP에 읽기 전용으로 연결하도록 도와줘.',
    '사용할 AI: ' + name,
    '연결 주소: ' + address,
    '이 주소는 일반 웹페이지가 아니라 원격 MCP 서버 주소야. 이미 등록된 연결이 있으면 새로 만들지 말고 인증 상태부터 확인해줘.',
    ...steps.map((s, i) => (i + 1) + '. ' + s),
    'OAuth 인증을 사용해. ERP 로그인과 조회할 업무 분야 승인은 내가 직접 할게. 비밀번호, ERP 로그인 인증값이나 관리자 API 키를 채팅에 요구하지 마.',
    '연결되면 먼저 erp_help로 허용된 분야와 사용 방법을 확인하고, 내가 요청한 자료만 조회해줘. 자료를 등록·수정·승인·삭제하거나 알림을 보내는 연결은 아니야.'
  ].join('\n');
  const verificationPrompt = (address) => [
    'ERP 연결이 실제로 작동하는지 확인해줘. 연결 주소: ' + address,
    '이 대화에 제공된 실제 ERP 도구 목록부터 확인하고, erp_help를 호출해 허용된 업무 분야와 사용 방법을 알려줘. 연결 확인 중에는 회계 금액, 문서 본문이나 조합원 자료를 조회하지 마.',
    '도구가 없거나 인증이 필요하면 연결 미완료라고 알려줘. 주소를 복사했거나 홈페이지가 열리는 것만으로 연결 성공이라고 하지 마.'
  ].join('\n');
  const EXAMPLES = [
    { scope: 'help', title: '🧭 처음에는 이렇게 물어보세요', detail: '연결된 업무 분야와 사용할 수 있는 기능부터 확인합니다.', prompt: '내가 연결한 ERP에서 조회할 수 있는 업무 분야와 사용 방법을 알려주고, 지금 할 수 있는 질문을 몇 가지 추천해줘.' },
    { scope: 'accounting', title: '📊 회계 자료 정리', detail: '기간별 계정 합계와 계산 기준을 표로 확인합니다.', prompt: '지난달 회계 자료를 계정별 차변·대변 합계로 표로 정리해줘. 조회 기간과 집계 기준을 먼저 알려주고, 확인이 필요한 부분은 원자료와 구분해줘.' },
    { scope: 'accounting', title: '🗓️ 통장과 장부 날짜 점검', detail: '제공한 통장 내역과 장부를 비교해 관리자가 확인할 후보를 정리합니다.', prompt: '내가 제공한 통장 거래 내역과 내 조합의 ERP 전표를 비교해 날짜·금액이 다른 후보를 찾아줘. 통장 내역을 아직 제공하지 않았다면 먼저 요청해줘. 같은 금액만으로 거래를 확정하지 말고 적요와 상대방 등 확인 가능한 근거를 함께 비교해줘. 비용 발생일과 지급일, 신용카드 사용일과 대금 출금일, 매출 공급일과 입금일은 서로 다를 수 있으니 정상적인 차이와 수정 후보를 구분해줘. 신고·결산 기간이 달라지는 후보도 표시해줘. 현재 날짜·제안 날짜·근거·확인할 사항을 정리하되 추측으로 날짜를 정하지 마. 수정은 권한 있는 관리자가 ERP 회계관리의 전표 날짜 수정에서 직접 진행하므로 자료를 변경하거나 저장하지 마. 연결된 다른 업무가 있는 전표는 해당 업무 화면을 함께 확인하도록 안내해줘.' },
    { scope: 'approvals', title: '📋 결재 내용 찾기', detail: '제목으로 결재를 찾아 상태와 금액을 확인합니다.', prompt: '올해 제목에 "지출결의"가 들어간 결재를 찾아 제목·상태·금액을 정리해줘. 첨부가 있는 문서는 ERP에서 첨부를 확인해야 한다고 표시해줘.' },
    { scope: 'documents', title: '📚 문서 내용 요약', detail: '열람할 수 있는 문서를 찾아 주요 내용을 정리합니다.', prompt: '올해 제목에 "이사회"가 들어간 문서를 찾아 내용을 요약하고, 결정된 사항과 확인할 사항을 나눠줘. 원문에 없는 내용은 추측하지 마.' },
    { scope: 'documents', title: '🎙️ 회의자료와 녹취록으로 의사록 초안 작성', detail: '회의자료와 녹취록을 AI에 첨부해 초안을 만듭니다. 음성 파일을 지원하지 않는 AI에는 녹취록을 제공하세요. 현재 ERP 연결은 회의꾸러미 자동 조회·녹음 변환·초안 저장을 하지 않습니다.', prompt: '내가 첨부한 이사회 또는 총회 회의자료와 녹취록을 바탕으로 의사록 초안을 작성해줘. 자료가 없으면 먼저 요청하고, 내가 열람할 권한이 있는 이전 의사록을 ERP에서 찾을 수 있으면 형식만 참고해줘. 회의자료의 예정 안건·제안과 실제 회의에서 확정한 사항을 구분해줘. 회의 일시·장소·참석자·정족수·표결 수·가결 여부는 근거가 있는 내용만 적고, 녹취가 불명확하거나 자료끼리 다르면 확인 필요로 표시해줘. 이전 회의의 참석자·의결 결과를 이번 회의에 가져오거나 빠진 내용을 추측하지 마. 불필요한 개인정보는 제외하고, 본문 초안과 확인할 사항을 나눠 보여줘. 검토한 초안은 권한 있는 사람이 ERP 문서함에서 직접 등록할 것이므로 저장·승인·서명·공개·알림 발송은 하지 마.' },
    { scope: 'inventory', title: '📦 재고와 입고 대기 확인', detail: '검수 완료 재고와 아직 확인하지 않은 입고 수량을 구분합니다.', prompt: '오늘 기준 제품별 검수 완료 재고와 입고 검수 대기 수량을 나눠 정리해줘. 실제 수령한 제품을 입고 완료로 처리하려면 ERP의 어느 화면에서 무엇을 확인해야 하는지도 알려줘.' },
    { scope: 'events', title: '🎪 행사 매출 정리', detail: '행사별 판매 수량과 수납 방법별 금액을 비교합니다.', prompt: '지난달 행사별 판매 수량과 매출, 계좌·현금·쿠폰 금액을 표로 정리해줘. 조회 기간을 명시하고 쿠폰 금액을 실제 입금 완료액으로 단정하지 마.' },
    { scope: 'member_stats', title: '👥 조합원 현황 확인', detail: '가입 상태와 개인·단체 구분별 인원을 확인합니다.', prompt: '현재 조합원 현황을 가입 상태와 개인·단체 구분별 인원으로 정리해줘. 집계된 인원을 기준으로 전체 현황을 설명해줘.' }
  ];
  async function rpc(client, action, data = {}) {
    const result = await client.rpc('erp_ai_connections', { p_action: action, p_data: data });
    if (result.error) throw new Error('접근 권한이나 연결 유효기간을 확인해 주세요. 잠시 후 다시 시도할 수 있습니다.');
    return result.data;
  }
  window.ErpAiConnections = {
    version: '1.2.4',
    mount(client, root) {
      if (!root || root.dataset.aiMounted) return;
      root.dataset.aiMounted = '1'; root.classList.add('ai-panel');
      root.append(element('h2', '🤖 AI 연결'));
      root.append(element('p', '사용하는 AI에서 허용된 업무 자료를 찾아보고, 내용을 정리하거나 문서 초안을 작성할 수 있습니다. 작성한 초안의 검토와 자료 등록·수정·승인은 기존 ERP 화면에서 진행합니다.'));
      const addressBox = element('div', undefined, 'ai-box');
      addressBox.append(element('h3', '1. 사용할 AI를 골라 주세요', 'h5'));
      addressBox.append(element('p', 'AI를 고르면 해당 서비스의 설정 순서가 나옵니다. 처음 한 번 ERP에 로그인하고 전달할 분야를 직접 선택하면, 유효기간 안에는 연결을 다시 사용합니다.'));
      const picker = element('div', undefined, 'ai-client-picker'); picker.setAttribute('role', 'group'); picker.setAttribute('aria-label', '사용할 AI 선택');
      const clientButtons = {};
      for (const key of ['chatgpt', 'claude', 'codex']) {
        const b = element('button', undefined, 'ai-client-choice'); b.type = 'button'; b.dataset.client = key;
        b.append(element('strong', CLIENTS[key].name), element('span', CLIENTS[key].detail)); clientButtons[key] = b; picker.append(b);
      }
      addressBox.append(picker);
      const advanced = element('details', undefined, 'ai-setup-preview'); advanced.append(element('summary', 'Gemini CLI 연결 안내'));
      const geminiButton = element('button', 'Gemini CLI 선택', 'btn btn-outline-secondary'); geminiButton.type = 'button'; clientButtons.gemini = geminiButton; advanced.append(geminiButton); addressBox.append(advanced);
      const guide = element('div', undefined, 'ai-client-guide'); guide.setAttribute('aria-live', 'polite'); addressBox.append(guide);
      addressBox.append(element('strong', 'AI 설정에 등록할 연결 주소'));
      const address = element('input', undefined, 'ai-address'); address.readOnly = true; address.setAttribute('aria-label', 'AI 연결 주소');
      addressBox.append(address);
      const copy = element('button', '주소 복사', 'btn btn-outline-primary'); copy.type = 'button';
      const prompt = element('button', '연결 안내 복사', 'btn btn-outline-secondary'); prompt.type = 'button';
      const verify = element('button', '연결 확인 질문 복사', 'btn btn-primary'); verify.type = 'button';
      copy.disabled = true; prompt.disabled = true; verify.disabled = true;
      const actions = element('div', undefined, 'ai-actions'); actions.append(copy, prompt, verify); addressBox.append(actions);
      addressBox.append(element('p', '주소는 AI의 연결 설정에 붙여넣습니다. 브라우저에서 직접 열거나 안내를 채팅에 붙여넣는 것만으로 인증이 완료되지는 않습니다.', 'ai-muted'));
      const preview = element('details', undefined, 'ai-setup-preview');
      preview.append(element('summary', 'AI에 붙여넣을 연결 요청 문구 보기'));
      const setupText = element('pre', '연결 정보를 확인하고 있습니다.', 'ai-prompt-text'); preview.append(setupText); addressBox.append(preview);
      root.append(addressBox);
      const allowed = element('p'); root.append(allowed);
      root.append(element('h3', '2. 연결 후 이렇게 물어보세요', 'h5'));
      root.append(element('p', '문구를 복사해 AI에 붙여넣고 기간이나 검색어를 원하는 내용으로 바꿔 보세요. 내 업무 권한에 맞는 예시이며, 실제 조회는 연결할 때 선택한 분야에서만 가능합니다.', 'ai-muted'));
      const examples = element('div', undefined, 'ai-example-grid'); examples.setAttribute('aria-label', '업무별 AI 질문 예시'); root.append(examples);
      root.append(element('h3', '연결된 AI', 'h5'));
      const list = element('div'); root.append(list);
      const refresh = element('button', '연결 목록 새로고침', 'btn btn-outline-secondary'); refresh.type = 'button'; root.append(refresh);
      const logs = element('details', undefined, 'ai-box'); logs.append(element('summary', '최근 조회 기록')); const logBody = element('div'); logs.append(logBody); root.append(logs);
      const status = element('p', '', 'ai-status'); status.setAttribute('role', 'status'); root.append(status);
      const manualCopy = element('textarea', undefined, 'ai-copy-fallback'); manualCopy.readOnly = true; manualCopy.hidden = true; manualCopy.rows = 6; manualCopy.setAttribute('aria-label', '직접 복사할 문구'); root.append(manualCopy);
      let selected = 'chatgpt'; let ready = false;
      const renderGuide = () => {
        const profile = CLIENTS[selected]; guide.replaceChildren(element('h4', profile.name + ' 연결 순서'));
        for (const [key, b] of Object.entries(clientButtons)) b.setAttribute('aria-pressed', String(key === selected));
        const steps = element('ol'); for (const step of profile.steps) steps.append(element('li', step)); guide.append(steps);
        guide.append(element('p', profile.note, 'ai-muted'));
        const links = element('div', undefined, 'ai-actions');
        const link = (title, url, className) => { const a = element('a', title, className); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };
        if (profile.url) links.append(link(profile.link, profile.url, 'btn btn-outline-primary'));
        links.append(link('공식 안내 보기', profile.docs, 'ai-doc-link')); guide.append(links);
        if (selected === 'gemini' && ready) {
          const config = element('pre', JSON.stringify({ mcpServers: { 'coop-erp': { httpUrl: address.value } } }, null, 2), 'ai-prompt-text');
          const configCopy = element('button', 'Gemini 설정 복사', 'btn btn-outline-secondary'); configCopy.type = 'button'; configCopy.addEventListener('click', () => copyText(config.textContent));
          guide.append(config, configCopy);
        }
        setupText.textContent = ready ? connectionPrompt(address.value, profile.name, profile.steps) : '연결 정보를 확인하고 있습니다.';
      };
      for (const [key, b] of Object.entries(clientButtons)) b.addEventListener('click', () => { selected = key; manualCopy.hidden = true; manualCopy.value = ''; renderGuide(); });
      const copyText = async (text) => {
        try { await navigator.clipboard.writeText(text); manualCopy.hidden = true; manualCopy.value = ''; status.textContent = '복사했습니다. 사용하는 AI 채팅에 붙여넣어 주세요.'; }
        catch { manualCopy.value = text; manualCopy.hidden = false; manualCopy.focus(); manualCopy.select(); status.textContent = '자동 복사를 사용할 수 없어 문구를 선택했습니다. 직접 복사해 주세요.'; }
      };
      const renderExamples = (scopes) => {
        examples.replaceChildren();
        for (const example of EXAMPLES.filter((e) => e.scope === 'help' || (scopes || []).includes(e.scope))) {
          const card = element('article', undefined, 'ai-example' + (example.scope === 'help' ? ' ai-example--starter' : ''));
          card.append(element('h4', example.title), element('p', example.detail, 'ai-muted'), element('p', example.prompt, 'ai-example-prompt'));
          const copyExample = element('button', '문구 복사', 'btn btn-outline-primary'); copyExample.type = 'button'; copyExample.setAttribute('aria-label', example.title.replace(/^\S+\s/, '') + ' 문구 복사');
          copyExample.addEventListener('click', () => copyText(example.prompt)); card.append(copyExample); examples.append(card);
        }
      };
      renderGuide();
      let loading = false;
      const load = async () => {
        if (loading) return; loading = true; refresh.disabled = true; status.textContent = '연결 정보를 확인하고 있습니다.';
        ready = false; address.value = ''; allowed.textContent = ''; list.replaceChildren(); copy.disabled = true; prompt.disabled = true; verify.disabled = true; renderGuide(); examples.replaceChildren(element('p', '내 업무 권한에 맞는 예시를 확인하고 있습니다.', 'ai-muted'));
        setupText.textContent = '연결 정보를 확인하고 있습니다.'; manualCopy.hidden = true; manualCopy.value = '';
        try {
          const d = await rpc(client, 'list');
          if (typeof d.host !== 'string' || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(d.host) || d.host.includes('..')) throw new Error('현재 조합의 연결 주소를 확인하지 못했습니다.');
          address.value = 'https://' + d.host + '/ai/mcp';
          ready = true; renderGuide(); renderExamples(d.scopes);
          copy.disabled = false; prompt.disabled = false; verify.disabled = false;
          allowed.textContent = d.coop_name + ' · 현재 조회 가능한 분야: ' + labels(d.scopes);
          list.replaceChildren();
          if (!d.connections.length) list.append(element('p', '아직 연결된 AI가 없습니다.', 'ai-muted'));
          for (const c of d.connections) {
            const row = element('div', undefined, 'ai-connection'); const info = element('div');
            info.append(element('strong', c.name), element('p', labels(c.scopes)), element('p', '최근 AI 요청: ' + date(c.last_used_at), 'ai-muted'));
            const active = !c.revoked_at && new Date(c.expires_at) > new Date();
            info.append(element('p', active ? (c.last_used_at ? 'AI 요청 확인' : '권한 허용 · AI 요청 대기') : '연결 종료', 'ai-connection-state'));
            if (active && !c.last_used_at) info.append(element('p', 'AI에서 ERP 연결을 선택한 뒤 연결 확인 질문을 보내 주세요.', 'ai-muted'));
            info.append(element('p', active ? '유효기간: ' + date(c.expires_at) : '연결 종료', 'ai-muted')); row.append(info);
            if (active) {
              const revoke = element('button', '연결 해제', 'btn btn-outline-danger'); revoke.type = 'button';
              revoke.addEventListener('click', async () => {
                if (!window.confirm('이 AI의 조회 연결을 해제할까요? 다시 연결하려면 새로 로그인해야 합니다.')) return;
                revoke.disabled = true;
                try { await rpc(client, 'revoke', { id: c.id }); await load(); } catch (e) { status.textContent = e.message; revoke.disabled = false; }
              }); row.append(revoke);
            }
            list.append(row);
          }
          status.textContent = '';
        } catch (e) { ready = false; address.value = ''; renderGuide(); status.textContent = e.message; copy.disabled = true; prompt.disabled = true; verify.disabled = true; setupText.textContent = '연결 정보를 확인한 뒤 요청 문구를 표시합니다.'; examples.replaceChildren(element('p', '업무 권한을 확인하지 못해 예시를 표시하지 않았습니다.', 'ai-muted')); } finally { loading = false; refresh.disabled = false; }
      };
      copy.addEventListener('click', () => copyText(address.value));
      prompt.addEventListener('click', () => copyText(setupText.textContent));
      verify.addEventListener('click', () => copyText(verificationPrompt(address.value)));
      refresh.addEventListener('click', load);
      logs.addEventListener('toggle', async () => {
        if (!logs.open) return;
        try {
          const data = await rpc(client, 'logs'); logBody.replaceChildren();
          if (!data.length) { logBody.append(element('p', '아직 조회 기록이 없습니다.')); return; }
          const table = element('table', undefined, 'ai-log-table'); const head = element('tr');
          for (const h of ['일시', 'AI · 작업', '결과']) head.append(element('th', h)); table.append(head);
          for (const r of data) { const row = element('tr'); row.append(element('td', date(r.used_at)), element('td', r.name + ' · ' + (TOOLS[r.tool] || '조회')), element('td', r.result === 'OK' ? (r.tool === 'erp_help' ? '안내 확인' : r.row_count + '건 조회') : '접근 또는 요청 차단')); table.append(row); }
          logBody.append(table);
        } catch (e) { logBody.replaceChildren(element('p', e.message)); }
      });
      load();
    },
    async authorize(client, root) {
      if (!root || root.dataset.aiAuthorizing) return;
      root.dataset.aiAuthorizing = '1';
      const request = new URLSearchParams(location.hash.slice(1)).get('request');
      const status = document.getElementById('aiAuthStatus');
      if (!/^[a-f0-9]{64}$/.test(request || '')) { status.textContent = 'AI에서 연결을 시작한 뒤 이 화면을 열어 주세요.'; return; }
      try {
        const d = await rpc(client, 'inspect', { request });
        document.getElementById('aiAuthTitle').textContent = d.coop_name + ' AI 연결';
        document.getElementById('aiClientName').textContent = d.name;
        document.getElementById('aiRedirectHost').textContent = new URL(d.redirect_uri).origin;
        const grid = document.getElementById('aiScopes');
        grid.replaceChildren();
        for (const s of d.scopes.filter((s) => s !== 'help')) {
          const label = element('label'); const box = element('input'); box.type = 'checkbox'; box.value = s; box.name = 'scope';
          label.append(box, element('span', LABELS[s])); grid.append(label);
        }
        let finishing = false;
        const finish = async (action) => {
          if (finishing) return; finishing = true;
          const buttons = root.querySelectorAll('button'); buttons.forEach((b) => b.disabled = true);
          try {
            const scopes = Array.from(grid.querySelectorAll('input:checked'), (b) => b.value);
            if (action === 'approve' && !scopes.length) throw new Error('전달할 업무 분야를 하나 이상 선택해 주세요.');
            const r = await rpc(client, action, { request, scopes }); const dest = new URL(r.redirect_uri);
            dest.searchParams.set('state', r.state); dest.searchParams.set(r.error ? 'error' : 'code', r.error || r.code);
            // RFC 9207: the issuer is the current, server-validated tenant origin,
            // not the callback's origin or any query supplied by an AI client.
            dest.searchParams.set('iss', new URL('/ai/oauth', location.origin).href);
            location.replace(dest.href);
          } catch (e) { finishing = false; status.textContent = e.message; buttons.forEach((b) => b.disabled = false); }
        };
        document.getElementById('aiApprove').addEventListener('click', () => finish('approve'));
        document.getElementById('aiDeny').addEventListener('click', () => finish('deny'));
        document.getElementById('aiAuthControls').hidden = false;
        status.textContent = d.scopes.some((s) => s !== 'help') ? '' : '현재 계정에는 AI에 전달할 업무 분야의 조회 권한이 없습니다.';
      } catch (e) { status.textContent = e.message; }
    }
  };
})();
