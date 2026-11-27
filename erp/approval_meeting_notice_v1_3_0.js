/* v1.3.0 - Import the saved agenda snapshot with the confirmed assembly audience. */
(function (root) {
    'use strict';
    let rows = [], loading = false, generation = 0, loadedCoop = '', loadedKind = '';
    const el = id => document.getElementById(id);
    const esc = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const agendaKinds = new Map([['REPORT','보고'], ['DECISION','의결'], ['DISCUSSION','토의'], ['OTHER','기타']]);
    function agendaGroups(agendas) {
        if (!Array.isArray(agendas)) throw new Error('저장된 안건을 확인하지 못했습니다. 다시 불러와 주세요.');
        const keys = [...agendaKinds.keys()], groups = new Map(keys.map(key => [key, []]));
        const ordered = [];
        let previousGroup = -1, mixedOrder = false;
        // The server returns a stable sort_order/id sequence. Keep even an interleaved sequence intact.
        for (const agenda of agendas) {
            if (!groups.has(agenda?.agenda_kind)) throw new Error('저장된 안건의 종류를 확인해 주세요.');
            const title = String(agenda.title || '').trim();
            if (!title) continue;
            const kind = agenda.agenda_kind, group = keys.indexOf(kind), list = groups.get(kind);
            list.push(title);
            ordered.push({kind,title,number:list.length});
            mixedOrder ||= group < previousGroup;
            previousGroup = group;
        }
        if (!ordered.length) throw new Error('저장된 안건이 없습니다. 회의꾸러미에서 안건을 저장한 뒤 다시 불러와 주세요.');
        if (mixedOrder) return ordered.map(({kind,title,number}) =>
            `<p>${agendaKinds.get(kind)} 제${number}호${kind === 'DECISION' ? ' 의안' : ''}: ${esc(title)}</p>`).join('');
        return [...groups].map(([kind, titles], index) => `<p><strong>${['가','나','다','라'][index]}. ${agendaKinds.get(kind)} 안건</strong></p>`
            + titles.map((title, i) => `<p>제${i + 1}호${kind === 'DECISION' ? ' 의안' : ''}: ${esc(title)}</p>`).join('')).join('');
    }
    function assemblyNoticeAgenda(html) {
        const document = new DOMParser().parseFromString(html || '', 'text/html');
        const titles = [...document.querySelectorAll('.meeting-chapter.chapter-bill')]
            .map(node => String(node.querySelector(':scope > h2')?.textContent || '').trim()).filter(Boolean);
        if (!titles.length) throw new Error('저장된 총회 자료집에서 의안 제목을 찾지 못했습니다. 꾸러미의 자료집을 먼저 저장해 주세요.');
        return '<ol>' + titles.map((title, i) => `<li>제${i + 1}호 의안: ${esc(title)}</li>`).join('') + '</ol>';
    }
    async function readAssemblyDelegates(client, coopId) {
        if (!coopId) throw new Error('현재 조합을 확인해 주세요.');
        const { data, error } = await client.from('coop_officials').select('id')
            .eq('coop_id', coopId).eq('category', 'delegate').eq('status', 'active').limit(1);
        if (error || !Array.isArray(data)) throw new Error('대의원 명단을 확인하지 못했어요. 회의 내용을 다시 불러와 주세요.');
        return data.length > 0;
    }
    function build(row, source, coopName, type = '공문', { hasDelegates } = {}) {
        if (!coopName || !row.title || !row.meeting_date || !row.start_time || !row.location) throw new Error('회의꾸러미의 제목·일시·장소와 조합 기본정보를 먼저 확인해 주세요.');
        const board = row.meeting_type === 'BOARD';
        const date = new Date(row.meeting_date + 'T12:00:00+09:00');
        if (!Number.isFinite(date.getTime())) throw new Error('회의 날짜를 확인해 주세요.');
        const dateLabel = new Intl.DateTimeFormat('ko-KR', { timeZone:'Asia/Seoul', year:'numeric', month:'long', day:'numeric', weekday:'long' }).format(date);
        const timeAndPlace = `<p><strong>1. 일시:</strong> ${esc(dateLabel)} ${esc(row.start_time.slice(0,5))}</p><p><strong>2. 장소:</strong> ${esc(row.location)}</p>`;
        if (type === '일반품의') return { content:`<p><strong>${esc(row.title)}</strong></p>` + timeAndPlace
            + '<p><strong>3. 안건:</strong></p>' + agendaGroups(source.agendas) };
        if (!board && typeof hasDelegates !== 'boolean') throw new Error('대의원 명단을 확인하지 못했어요.');
        const assemblyName = hasDelegates ? '대의원총회' : '총회';
        const meetingName = board ? row.title : /총회/.test(row.title)
            ? row.title.replace(/대의원\s*총회|총회/, assemblyName)
                .replace(/(정기|임시)\s*(대의원총회|총회)/, (_, kind, noun) => kind + (hasDelegates ? ' ' : '') + noun)
            : `${row.title} · ${row.assembly_kind === 'EXTRAORDINARY' ? '임시' : '정기'}${hasDelegates ? ' ' : ''}${assemblyName}`;
        const audience = board ? `${coopName} 임원` : hasDelegates ? '대의원' : '조합원 전체';
        const subject = `${meetingName} 소집 ${board ? '통지' : '통보'}`;
        const intro = board
            ? `<p>조합 발전을 위해 애쓰시는 임원 여러분의 노고에 감사드립니다.</p><p>본 조합 정관에 의거하여 아래와 같이 ${esc(row.title)}를 소집하오니 임원분들께서는 참석하여 주시기 바랍니다.</p><p style="text-align:center">- 아 래 -</p>`
            : `<p>본 조합 정관에 의거하여 ${esc(meetingName)}를 아래와 같이 개최하오니 참석하여 주시기 바랍니다.</p>`;
        return { title:subject, receiver:audience, content:intro
            + timeAndPlace
            + (board ? '' : `<p><strong>3. 참석 대상:</strong> ${esc(coopName)} ${esc(audience)}</p>`)
            + `<p><strong>${board ? '3. 안건:' : '4. 회의 안건:'}</strong></p>`
            + (board ? agendaGroups(source.agendas) : assemblyNoticeAgenda(source.content_html)) };
    }
    async function load(client, coopId, kind, isCurrent = () => true) {
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
            if (request !== generation || !isCurrent()) return;
            rows = data || [];
            loadedCoop = coopId; loadedKind = kind;
            const select = el('noticeMeetingSelect'); select.replaceChildren(new Option('회의꾸러미를 선택하세요', ''));
            rows.forEach(row => select.add(new Option(`${row.meeting_date || '날짜 미정'} · ${row.title}`, row.id)));
            el('noticeMeetingStatus').textContent = rows.length ? '' : '조회 가능한 회의꾸러미가 없습니다.';
        } catch (_) { if (request === generation && isCurrent()) { rows = []; el('noticeMeetingSelect').replaceChildren(new Option('조회하지 못했습니다', '')); el('noticeMeetingStatus').textContent = '회의자료 열람 권한과 현재 조합을 확인해 주세요.'; } }
        finally { if (request === generation) { loading = false; if (isCurrent()) el('noticeMeetingLoad').disabled = false; } }
    }
    async function read(client, coopId, id, kind, type = '공문') {
        const row = rows.find(item => item.id === id);
        if (loading || !row || loadedCoop !== coopId || loadedKind !== kind) throw new Error('현재 조합의 회의꾸러미를 먼저 선택하세요.');
        if (!['공문','일반품의'].includes(type) || !['BOARD','GENERAL_ASSEMBLY'].includes(kind)) throw new Error('회의와 결재 문서 종류를 확인해 주세요.');
        // Formal assembly notices already include standard bills generated in the booklet.
        const rpc = type === '공문' && kind === 'GENERAL_ASSEMBLY' ? 'get_meeting_call_notice_source' : 'get_meeting_call_notice_source_v2';
        const [source, runtime] = await Promise.all([
            client.rpc(rpc,{p_package_id:id}),
            client.rpc('get_my_erp_runtime')
        ]);
        const meeting = source.data?.meeting, lock = source.data?.agenda_state;
        if (source.error || runtime.error || !/^[a-f0-9]{64}$/.test(lock?.fingerprint || '') || !meeting || meeting.id !== id
            || meeting.coop_id !== coopId || meeting.meeting_type !== kind || runtime.data?.coop_id !== coopId) throw new Error('현재 조합의 회의꾸러미와 안건 상태를 확인하지 못했습니다.');
        const hasDelegates = kind === 'GENERAL_ASSEMBLY' && type === '공문' ? await readAssemblyDelegates(client, coopId) : undefined;
        return { ...build(meeting, source.data, runtime.data.coop_name, type, { hasDelegates }),
            ...(type === '공문' ? { meetingLink:{packageId:id,fingerprint:lock.fingerprint,kind,coopId,title:meeting.title} } : {}) };
    }
    root.CoopMeetingNotice = { version:'1.3.0', load, read, build, agendaGroups, readAssemblyDelegates };
})(window);
