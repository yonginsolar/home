/* v1.1.0 — scope-aware prompt examples; no AI or ERP secret is displayed or persisted. */
(function () {
  'use strict';
  const LABELS = { help: '사용 안내', accounting: '회계', approvals: '전자결재', documents: '문서함', inventory: '재고', events: '행사 매출', member_stats: '조합원 통계' };
  const TOOLS = { erp_help: '사용 안내', erp_summary: '현황 조회', erp_search: '검색', erp_fetch: '본문 조회' };
  const date = (v) => v ? new Date(v).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '아직 없음';
  const element = (tag, text, className) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; };
  const labels = (scopes) => (scopes || []).filter((s) => s !== 'help').map((s) => LABELS[s] || s).join(' · ') || '사용 안내';
  const connectionPrompt = (address) => [
    '우리 조합 ERP에 읽기 전용으로 연결하도록 도와줘.',
    '연결 주소: ' + address,
    '이 주소는 일반 웹페이지가 아니라 원격 MCP 서버 주소야. 지금 사용하는 AI 환경에서 지원하는 연결 설정 방법을 안내하고, 직접 설정할 수 없다면 내가 따라 할 순서를 알려줘.',
    'OAuth 인증을 사용해. ERP 로그인과 조회할 업무 분야 승인은 내가 직접 할게. 비밀번호, ERP 로그인 인증값이나 관리자 API 키를 채팅에 요구하지 마.',
    '연결되면 먼저 erp_help로 허용된 분야와 사용 방법을 확인하고, 내가 요청한 자료만 조회해줘. 자료를 등록·수정·승인·삭제하거나 알림을 보내는 연결은 아니야.'
  ].join('\n');
  const EXAMPLES = [
    { scope: 'help', title: '🧭 처음에는 이렇게 물어보세요', detail: '연결된 업무 분야와 사용할 수 있는 기능부터 확인합니다.', prompt: '내가 연결한 ERP에서 조회할 수 있는 업무 분야와 사용 방법을 알려주고, 지금 할 수 있는 질문을 몇 가지 추천해줘.' },
    { scope: 'accounting', title: '📊 회계 자료 정리', detail: '기간별 계정 합계와 계산 기준을 표로 확인합니다.', prompt: '지난달 회계 자료를 계정별 차변·대변 합계로 표로 정리해줘. 조회 기간과 집계 기준을 먼저 알려주고, 확인이 필요한 부분은 원자료와 구분해줘.' },
    { scope: 'approvals', title: '📋 결재 내용 찾기', detail: '제목으로 결재를 찾아 상태와 금액을 확인합니다.', prompt: '올해 제목에 "지출결의"가 들어간 결재를 찾아 제목·상태·금액을 정리해줘. 첨부가 있는 문서는 ERP에서 첨부를 확인해야 한다고 표시해줘.' },
    { scope: 'documents', title: '📚 문서 내용 요약', detail: '열람할 수 있는 문서를 찾아 주요 내용을 정리합니다.', prompt: '올해 제목에 "이사회"가 들어간 문서를 찾아 내용을 요약하고, 결정된 사항과 확인할 사항을 나눠줘. 원문에 없는 내용은 추측하지 마.' },
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
    version: '1.1.0',
    mount(client, root) {
      if (!root || root.dataset.aiMounted) return;
      root.dataset.aiMounted = '1'; root.classList.add('ai-panel');
      root.append(element('h2', '🤖 AI 연결'));
      root.append(element('p', '사용하는 AI에서 허용된 업무 자료를 찾아보고, 내용을 정리하거나 사용 방법을 물어볼 수 있습니다. 자료 등록·수정·승인은 기존 ERP 화면에서 진행합니다.'));
      const addressBox = element('div', undefined, 'ai-box');
      addressBox.append(element('h3', '1. 처음 연결할 때', 'h5'));
      addressBox.append(element('p', '연결 안내를 복사해 자신이 사용하는 AI 채팅에 붙여넣어 주세요. AI가 연결 설정을 안내하면 ERP에 로그인하고 조회할 분야를 직접 선택합니다.'));
      addressBox.append(element('strong', 'AI 설정에 등록할 연결 주소'));
      const address = element('input', undefined, 'ai-address'); address.readOnly = true; address.setAttribute('aria-label', 'AI 연결 주소');
      addressBox.append(address);
      const copy = element('button', '주소 복사', 'btn btn-outline-primary'); copy.type = 'button';
      const prompt = element('button', '연결 안내 복사', 'btn btn-outline-secondary'); prompt.type = 'button';
      copy.disabled = true; prompt.disabled = true;
      const actions = element('div', undefined, 'ai-actions'); actions.append(copy, prompt); addressBox.append(actions);
      addressBox.append(element('p', '이 주소는 브라우저에서 여는 홈페이지가 아닙니다. 안내를 붙여넣는 것만으로 연결이 완료되지는 않으며, AI 서비스에 따라 외부 연결 지원 여부와 설정 방법이 다릅니다.', 'ai-muted'));
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
      let loading = false;
      const load = async () => {
        if (loading) return; loading = true; refresh.disabled = true; status.textContent = '연결 정보를 확인하고 있습니다.';
        copy.disabled = true; prompt.disabled = true; examples.replaceChildren(element('p', '내 업무 권한에 맞는 예시를 확인하고 있습니다.', 'ai-muted'));
        setupText.textContent = '연결 정보를 확인하고 있습니다.'; manualCopy.hidden = true; manualCopy.value = '';
        try {
          const d = await rpc(client, 'list');
          address.value = 'https://' + d.host + '/ai/mcp';
          setupText.textContent = connectionPrompt(address.value); renderExamples(d.scopes);
          copy.disabled = false; prompt.disabled = false;
          allowed.textContent = d.coop_name + ' · 현재 조회 가능한 분야: ' + labels(d.scopes);
          list.replaceChildren();
          if (!d.connections.length) list.append(element('p', '아직 연결된 AI가 없습니다.', 'ai-muted'));
          for (const c of d.connections) {
            const row = element('div', undefined, 'ai-connection'); const info = element('div');
            info.append(element('strong', c.name), element('p', labels(c.scopes)), element('p', '최근 사용: ' + date(c.last_used_at), 'ai-muted'));
            const active = !c.revoked_at && new Date(c.expires_at) > new Date();
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
        } catch (e) { status.textContent = e.message; copy.disabled = true; prompt.disabled = true; setupText.textContent = '연결 정보를 확인한 뒤 요청 문구를 표시합니다.'; examples.replaceChildren(element('p', '업무 권한을 확인하지 못해 예시를 표시하지 않았습니다.', 'ai-muted')); } finally { loading = false; refresh.disabled = false; }
      };
      copy.addEventListener('click', () => copyText(address.value));
      prompt.addEventListener('click', () => copyText(setupText.textContent));
      refresh.addEventListener('click', load);
      logs.addEventListener('toggle', async () => {
        if (!logs.open) return;
        try {
          const data = await rpc(client, 'logs'); logBody.replaceChildren();
          if (!data.length) { logBody.append(element('p', '아직 조회 기록이 없습니다.')); return; }
          const table = element('table', undefined, 'ai-log-table'); const head = element('tr');
          for (const h of ['일시', 'AI · 작업', '결과']) head.append(element('th', h)); table.append(head);
          for (const r of data) { const row = element('tr'); row.append(element('td', date(r.used_at)), element('td', r.name + ' · ' + (TOOLS[r.tool] || '조회')), element('td', r.result === 'OK' ? (r.row_count + '건 조회') : '접근 또는 요청 차단')); table.append(row); }
          logBody.append(table);
        } catch (e) { logBody.replaceChildren(element('p', e.message)); }
      });
      load();
    },
    async authorize(client, root) {
      const request = new URLSearchParams(location.hash.slice(1)).get('request');
      const status = document.getElementById('aiAuthStatus');
      if (!/^[a-f0-9]{64}$/.test(request || '')) { status.textContent = 'AI에서 연결을 시작한 뒤 이 화면을 열어 주세요.'; return; }
      try {
        const d = await rpc(client, 'inspect', { request });
        document.getElementById('aiAuthTitle').textContent = d.coop_name + ' AI 연결';
        document.getElementById('aiClientName').textContent = d.name;
        document.getElementById('aiRedirectHost').textContent = new URL(d.redirect_uri).origin;
        const grid = document.getElementById('aiScopes');
        for (const s of d.scopes.filter((s) => s !== 'help')) {
          const label = element('label'); const box = element('input'); box.type = 'checkbox'; box.value = s; box.name = 'scope';
          label.append(box, element('span', LABELS[s])); grid.append(label);
        }
        const finish = async (action) => {
          const buttons = root.querySelectorAll('button'); buttons.forEach((b) => b.disabled = true);
          try {
            const scopes = Array.from(grid.querySelectorAll('input:checked'), (b) => b.value);
            if (action === 'approve' && !scopes.length) throw new Error('전달할 업무 분야를 하나 이상 선택해 주세요.');
            const r = await rpc(client, action, { request, scopes }); const dest = new URL(r.redirect_uri);
            dest.searchParams.set('state', r.state); dest.searchParams.set(r.error ? 'error' : 'code', r.error || r.code);
            location.replace(dest.href);
          } catch (e) { status.textContent = e.message; buttons.forEach((b) => b.disabled = false); }
        };
        document.getElementById('aiApprove').addEventListener('click', () => finish('approve'));
        document.getElementById('aiDeny').addEventListener('click', () => finish('deny'));
        document.getElementById('aiAuthControls').hidden = false;
        status.textContent = d.scopes.length > 1 ? '' : '현재 계정에는 AI에 전달할 업무 분야의 조회 권한이 없습니다.';
      } catch (e) { status.textContent = e.message; }
    }
  };
})();
