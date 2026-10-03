/* v1.0.0 - Meeting call notices from the saved, tenant-scoped meeting materials. */
(function (root) {
    'use strict';
    let rows = [], loading = false, generation = 0, loadedCoop = '', loadedKind = '';
    const el = id => document.getElementById(id);
    const esc = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    function agendaGroups(row, html) {
        const document = new DOMParser().parseFromString(html || '', 'text/html');
        if (row.meeting_type === 'BOARD') {
            const groups = new Map([['보고', []], ['의결', []], ['토의', []], ['기타', []]]);
            document.querySelectorAll('.board-one-paper > .source-agenda-row').forEach(node => {
                const kind = String(node.querySelector('strong')?.textContent || '').trim().split(' ')[0];
                const title = String(node.querySelector(':scope > span')?.textContent || '').trim();
                if (groups.has(kind) && title) groups.get(kind).push(title);
            });
            if (![...groups.values()].some(list => list.length)) throw new Error('저장된 이사회 회의자료에서 안건 제목을 찾지 못했습니다. 꾸러미의 회의자료를 먼저 저장해 주세요.');
            return [...groups].map(([kind, titles], index) => `<p><strong>${['가','나','다','라'][index]}. ${kind} 안건</strong></p>`
                + titles.map((title, i) => `<p>제${i + 1}호${kind === '의결' ? ' 의안' : ''}: ${esc(title)}</p>`).join('')).join('');
        }
        const titles = [...document.querySelectorAll('.meeting-chapter.chapter-bill')]
            .map(node => String(node.querySelector(':scope > h2')?.textContent || '').trim()).filter(Boolean);
        if (!titles.length) throw new Error('저장된 총회 자료집에서 의안 제목을 찾지 못했습니다. 꾸러미의 자료집을 먼저 저장해 주세요.');
        return '<ol>' + titles.map((title, i) => `<li>제${i + 1}호 의안: ${esc(title)}</li>`).join('') + '</ol>';
    }
    function build(row, html, coopName) {
        if (!coopName || !row.title || !row.meeting_date || !row.start_time || !row.location) throw new Error('회의꾸러미의 제목·일시·장소와 조합 기본정보를 먼저 확인해 주세요.');
        const board = row.meeting_type === 'BOARD';
        const audience = board ? '임원' : /대의원/.test(row.title) ? '대의원' : '조합원';
        const date = new Date(row.meeting_date + 'T12:00:00+09:00');
        if (!Number.isFinite(date.getTime())) throw new Error('회의 날짜를 확인해 주세요.');
        const dateLabel = new Intl.DateTimeFormat('ko-KR', { timeZone:'Asia/Seoul', year:'numeric', month:'long', day:'numeric', weekday:'long' }).format(date);
        const subject = `${row.title} 소집 ${board ? '통지' : '통보'}`;
        const intro = board
            ? `<p>조합 발전을 위해 애쓰시는 임원 여러분의 노고에 감사드립니다.</p><p>본 조합 정관에 의거하여 아래와 같이 ${esc(row.title)}를 소집하오니 임원분들께서는 참석하여 주시기 바랍니다.</p><p style="text-align:center">- 아 래 -</p>`
            : `<p>본 조합 정관에 의거하여 ${esc(row.title)}를 아래와 같이 개최하오니 조합의 중요한 의사결정을 위해 바쁘시더라도 꼭 참석하여 주시기 바랍니다.</p>`;
        return { title:subject, receiver:`${coopName} ${audience}`, content:intro
            + `<p><strong>1. 일시:</strong> ${esc(dateLabel)} ${esc(row.start_time.slice(0,5))}</p><p><strong>2. 장소:</strong> ${esc(row.location)}</p>`
            + (board ? '' : `<p><strong>3. 참석 대상:</strong> ${esc(coopName)} ${audience} 전원</p>`)
            + `<p><strong>${board ? '3. 안건:' : '4. 회의 안건:'}</strong></p>` + agendaGroups(row, html) };
    }
    async function load(client, coopId, kind) {
        const request = ++generation;
        rows = []; loadedCoop = ''; loadedKind = '';
        el('noticeMeetingSelect').replaceChildren(new Option('회의꾸러미를 선택하세요', ''));
        if (!kind) { loading = false; el('noticeMeetingLoad').disabled = false; return; }
        loading = true; el('noticeMeetingLoad').disabled = true;
        try {
            const { data, error } = await client.from('meeting_packages')
                .select('id,title,meeting_type,meeting_date,start_time,location,status')
                .eq('coop_id', coopId).eq('meeting_type', kind).order('meeting_date', { ascending:false }).limit(100);
            if (error) throw error;
            if (request !== generation) return;
            rows = data || [];
            loadedCoop = coopId; loadedKind = kind;
            const select = el('noticeMeetingSelect'); select.replaceChildren(new Option('회의꾸러미를 선택하세요', ''));
            rows.forEach(row => select.add(new Option(`${row.meeting_date || '날짜 미정'} · ${row.title}`, row.id)));
            el('noticeMeetingStatus').textContent = rows.length ? '' : '조회 가능한 회의꾸러미가 없습니다.';
        } catch (_) { if (request === generation) { rows = []; el('noticeMeetingSelect').replaceChildren(new Option('조회하지 못했습니다', '')); el('noticeMeetingStatus').textContent = '회의자료 열람 권한과 현재 조합을 확인해 주세요.'; } }
        finally { if (request === generation) { loading = false; el('noticeMeetingLoad').disabled = false; } }
    }
    async function read(client, coopId, id, kind) {
        const row = rows.find(item => item.id === id);
        if (loading || !row || loadedCoop !== coopId || loadedKind !== kind) throw new Error('현재 조합의 회의꾸러미를 먼저 선택하세요.');
        const [meeting, materials, runtime] = await Promise.all([
            client.from('meeting_packages').select('id,title,meeting_type,meeting_date,start_time,location').eq('coop_id', coopId).eq('id', id).maybeSingle(),
            client.from('meeting_package_documents').select('content_html').eq('coop_id', coopId).eq('package_id', id).eq('document_type','MATERIALS').maybeSingle(),
            client.rpc('get_my_erp_runtime')
        ]);
        if (meeting.error || materials.error || runtime.error || !meeting.data || meeting.data.meeting_type !== kind || runtime.data?.coop_id !== coopId) throw new Error('현재 조합의 회의꾸러미를 확인하지 못했습니다.');
        return build(meeting.data, materials.data?.content_html, runtime.data.coop_name);
    }
    root.CoopMeetingNotice = { load, read, build, agendaGroups };
})(window);
