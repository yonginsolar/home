/* Published election results 1.0.0. No writes, tally recomputation or notifications. */
import { AdminService } from './AdminService.js?v=20261021-1';
const service = new AdminService();
const id = new URL(location.href).searchParams.get('id') || '';
const byId = value => document.getElementById(value);
let generation = 0, controller = null;
function dateText(value) {
    const date = new Date(value);
    return value && Number.isFinite(date.getTime())
        ? date.toLocaleDateString('ko-KR', { timeZone:'Asia/Seoul' }) : '';
}
async function load() {
    const request = ++generation;
    controller?.abort();
    const activeController = controller = new AbortController();
    const signal = activeController.signal;
    byId('results-retry').disabled = true;
    byId('result-content').hidden = true;
    byId('winner-list').replaceChildren();
    byId('result-state').textContent = '선거 결과를 확인하고 있어요…';
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) {
        byId('result-state').textContent = '선거를 확인하지 못했어요. 대시보드에서 선거를 다시 선택해 주세요.';
        return;
    }
    const timer = setTimeout(() => activeController.abort(), 15000);
    try {
        const data = await service.getPublishedSummary(id, { signal });
        if (request !== generation) return;
        byId('results-title').textContent = data.title || '공포된 선거 결과';
        byId('result-total').textContent = `${data.total.toLocaleString('ko-KR')}명`;
        byId('result-current').textContent = `${data.current.toLocaleString('ko-KR')}명`;
        byId('result-percent').textContent = `${Number(data.percent).toFixed(1)}%`;
        byId('result-meta').textContent = data.published
            ? [dateText(data.notice_date || data.published_at), data.doc_no].filter(Boolean).join(' · ') : '';
        if (!data.published) {
            byId('winner-summary').textContent = '아직 공포된 당선 결과가 없어요.';
        } else {
            if (!Array.isArray(data.winners)) throw new Error('ELECTION_RESULT_UNAVAILABLE');
            const uncontested = data.winners.filter(w => w.winner_type === 'UNCONTESTED').length;
            byId('winner-summary').textContent = `당선 ${data.winners.length}명${uncontested ? ` · 무투표 당선 ${uncontested}명` : ''}`;
            for (const winner of data.winners) {
                const li = document.createElement('li'), person = document.createElement('div');
                const name = document.createElement('strong'), district = document.createElement('span'), result = document.createElement('div');
                name.textContent = winner.name || '이름 미기재';
                district.textContent = winner.district_name || '선거구 미기재';
                const votes = Number(winner.vote_count);
                result.textContent = winner.winner_type === 'UNCONTESTED' ? '무투표 당선'
                    : `당선${winner.vote_count != null && Number.isSafeInteger(votes) && votes >= 0 ? ` · ${votes.toLocaleString('ko-KR')}표` : ''}`;
                person.append(name, district);li.append(person, result);byId('winner-list').append(li);
            }
        }
        byId('result-state').textContent = data.published ? '공포할 때 저장한 당선 결과예요. 무투표 당선은 투표 참여 인원과 별도로 표시해요.' : '';
        byId('result-content').hidden = false;
    } catch (error) {
        if (request !== generation) return;
        byId('result-state').textContent = error?.code === '42501'
            ? '이 선거 결과를 확인할 권한이 없어요.'
            : '선거 결과를 불러오지 못했어요. 다시 확인해 주세요.';
    } finally {
        clearTimeout(timer);
        if (request === generation) byId('results-retry').disabled = false;
    }
}
byId('results-retry').addEventListener('click', () => void load());
byId('results-help').addEventListener('click', () => void window.CoopDialog?.alert(
    '🏅 결과는 공포할 때 저장한 당선 명부를 보여줘요.\n무투표 당선도 함께 확인할 수 있어요.\n\n👥 유권자와 참여 인원은 선거구가 여러 개여도 같은 사람을 한 번만 세어요. 참여 인원은 이번 회차에 한 번이라도 투표한 사람 수예요.',
    { title:'공포된 선거 결과' }));
window.addEventListener('pagehide', () => { ++generation; controller?.abort(); });
window.addEventListener('pageshow', event => { if (event.persisted) void load(); });
void load();
