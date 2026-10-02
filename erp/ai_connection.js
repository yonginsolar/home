/* v1.0.0 — no AI or ERP secret is displayed or persisted by this module. */
(function () {
  'use strict';
  const LABELS = { help: '사용 안내', accounting: '회계', approvals: '전자결재', documents: '문서함', inventory: '재고', events: '행사 매출', member_stats: '조합원 통계' };
  const TOOLS = { erp_help: '사용 안내', erp_summary: '현황 조회', erp_search: '검색', erp_fetch: '본문 조회' };
  const date = (v) => v ? new Date(v).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '아직 없음';
  const element = (tag, text, className) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; };
  const labels = (scopes) => (scopes || []).filter((s) => s !== 'help').map((s) => LABELS[s] || s).join(' · ') || '사용 안내';
  async function rpc(client, action, data = {}) {
    const result = await client.rpc('erp_ai_connections', { p_action: action, p_data: data });
    if (result.error) throw new Error('접근 권한이나 연결 유효기간을 확인해 주세요. 잠시 후 다시 시도할 수 있습니다.');
    return result.data;
  }
  window.ErpAiConnections = {
    version: '1.0.0',
    mount(client, root) {
      if (!root || root.dataset.aiMounted) return;
      root.dataset.aiMounted = '1'; root.classList.add('ai-panel');
      root.append(element('h2', '🤖 AI 연결'));
      root.append(element('p', '사용하는 AI에서 허용된 업무 자료를 찾아보고, 내용을 정리하거나 사용 방법을 물어볼 수 있습니다. 자료 등록·수정·승인은 기존 ERP 화면에서 진행합니다.'));
      const addressBox = element('div', undefined, 'ai-box');
      addressBox.append(element('strong', '연결 주소'));
      const address = element('input', undefined, 'ai-address'); address.readOnly = true; address.setAttribute('aria-label', 'AI 연결 주소');
      addressBox.append(address);
      const copy = element('button', '주소 복사', 'btn btn-outline-primary'); copy.type = 'button';
      const prompt = element('button', '연결 안내 복사', 'btn btn-outline-secondary'); prompt.type = 'button';
      const actions = element('div', undefined, 'ai-actions'); actions.append(copy, prompt); addressBox.append(actions);
      addressBox.append(element('p', '이 주소를 AI의 원격 MCP 연결 설정에 입력하고 OAuth로 로그인해 주세요. 로그인 후 전달할 업무 분야를 직접 선택합니다. 연결 기능과 외부 도구 지원 여부는 사용하는 AI 서비스에 따라 다릅니다.', 'ai-muted'));
      root.append(addressBox);
      const allowed = element('p'); root.append(allowed);
      root.append(element('h3', '연결된 AI', 'h5'));
      const list = element('div'); root.append(list);
      const refresh = element('button', '연결 목록 새로고침', 'btn btn-outline-secondary'); refresh.type = 'button'; root.append(refresh);
      const logs = element('details', undefined, 'ai-box'); logs.append(element('summary', '최근 조회 기록')); const logBody = element('div'); logs.append(logBody); root.append(logs);
      const status = element('p', '', 'ai-status'); status.setAttribute('role', 'status'); root.append(status);
      let loading = false;
      const load = async () => {
        if (loading) return; loading = true; refresh.disabled = true; status.textContent = '연결 정보를 확인하고 있습니다.';
        try {
          const d = await rpc(client, 'list');
          address.value = 'https://' + d.host + '/ai/mcp';
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
        } catch (e) { status.textContent = e.message; } finally { loading = false; refresh.disabled = false; }
      };
      const copyText = async (text) => { try { await navigator.clipboard.writeText(text); status.textContent = '복사했습니다.'; } catch { address.focus(); address.select(); status.textContent = '주소를 선택했습니다. 복사해 주세요.'; } };
      copy.addEventListener('click', () => copyText(address.value));
      prompt.addEventListener('click', () => copyText('ERP 읽기 전용 MCP 연결을 설정해 주세요. 주소: ' + address.value + '\nOAuth 인증을 사용하며 연결 화면에서 업무 분야를 선택합니다. ERP 로그인 키나 관리자 키는 요구하지 마세요. 연결된 조합의 허용된 자료만 조회하며 변경은 ERP에서 직접 진행합니다. 먼저 erp_help를 호출해 사용 가능한 분야를 확인해 주세요.'));
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
