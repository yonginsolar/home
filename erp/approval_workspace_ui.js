/* v1.0.1 — Approval inbox presentation. */
(() => {
    'use strict';
    const node = (name, className, text) => {
        const element = document.createElement(name);
        if (className) element.className = className;
        if (text != null) element.textContent = text;
        return element;
    };
    const makeButton = (text, css) => {
        const button = node('button', 'btn btn-sm ' + css, text);
        button.type = 'button';
        return button;
    };
    function inbox(root, api) {
        const list = root.querySelector('[data-inbox-items]');
        const count = root.querySelector('[data-inbox-count]');
        const heading = root.querySelector('[data-inbox-heading]');
        const detail = root.querySelector('[data-inbox-document]');
        const footer = root.querySelector('[data-inbox-actions]');
        const back = root.querySelector('[data-inbox-back]');
        const mobile = matchMedia('(max-width: 991.98px)');
        let rows = new Map(), listOwner = '', phase = '', ticket = null, previous = null;
        const current = view => ticket === view && listOwner === view.owner
            && api.context() === view.owner && rows.has(view.id);
        const isModalOpen = () => !!document.querySelector('.modal.show, .modal[aria-modal="true"], dialog[open]');
        const focusIfLost = (trigger, allowed) => {
            const active = document.activeElement;
            if (allowed() && trigger?.isConnected && trigger.getClientRects().length
                && (!active || active === document.body || active === trigger || !active.getClientRects().length)) {
                trigger.focus({ preventScroll:true });
            }
        };
        const buttonFor = id => Array.from(list.children).find(button => button.dataset.inboxId === String(id));
        const clear = () => {
            const old = ticket;
            ticket = null;
            if (old) {
                old.abort.abort();
                for (const url of old.urls) URL.revokeObjectURL(url);
                old.urls.clear();
            }
            root.removeAttribute('data-inbox-open');
            for (const button of list.querySelectorAll('[aria-pressed="true"]')) button.setAttribute('aria-pressed','false');
            detail.removeAttribute('aria-busy');
            detail.replaceChildren(node('p', 'text-muted mb-0', '목록에서 문서를 선택해 주세요.'));
            footer.replaceChildren();
            footer.hidden = true;
        };
        const leave = () => {
            clear();
            rows.clear();
            listOwner = '';
            previous = null;
            list.replaceChildren();
            count.textContent = '';
        };
        back.addEventListener('click', () => {
            const trigger = buttonFor(ticket?.id);
            const allowed = !!ticket && current(ticket);
            clear();
            if (allowed && trigger?.isConnected) trigger.focus();
        });
        root.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing
                || !ticket || !mobile.matches || isModalOpen()) return;
            event.preventDefault();
            back.click();
        });
        mobile.addEventListener('change', () => {
            if (!ticket || !current(ticket) || isModalOpen()) return;
            const active = document.activeElement;
            if ((mobile.matches && list.contains(active)) || (!mobile.matches && active === back)) heading.focus({preventScroll:true});
        });
        const select = async (id, retry = false) => {
            const owner = api.context();
            if (!owner || owner !== listOwner || !rows.has(id) || isModalOpen()) return;
            if (!retry && ticket?.id === id && ticket.owner === owner && current(ticket)) return;
            clear();
            const view = {id, owner, abort:new AbortController(), urls:new Set()};
            ticket = view;
            root.setAttribute('data-inbox-open','');
            buttonFor(id)?.setAttribute('aria-pressed','true');
            detail.setAttribute('aria-busy','true');
            detail.replaceChildren(node('p','text-muted mb-0','문서를 불러오는 중…'));
            if (mobile.matches) {
                heading.focus();
            }
            const stillCurrent = () => current(view);
            const content = node('div','approval-inbox-read');
            let timer;
            const deadline = new Promise((_, reject) => {
                timer = setTimeout(() => { reject(new Error('INBOX_READ_TIMEOUT')); view.abort.abort(); }, 15000);
                view.abort.signal.addEventListener('abort', () => reject(new Error('INBOX_READ_ABORTED')), {once:true});
            });
            try {
                const doc = await Promise.race([Promise.resolve().then(async () => {
                    const selected = await api.read(id, view.abort.signal);
                    if (!stillCurrent() || view.abort.signal.aborted) return null;
                    await api.paint(content,selected,() => stillCurrent() && !view.abort.signal.aborted,view.urls);
                    return selected;
                }),deadline]);
                if (!doc || !stillCurrent()) return;
                detail.replaceChildren(content);
                const {hint, actions} = api.actions(doc);
                if (hint) footer.append(node('p','small text-muted mb-0',hint));
                for (const action of actions) {
                    const button = makeButton(action.label, action.css);
                    button.addEventListener('click', () => {
                        if (!stillCurrent() || isModalOpen()) return;
                        if (action.modal) {
                            document.getElementById(action.modal)?.addEventListener('hidden.bs.modal',
                                () => focusIfLost(button,stillCurrent),{once:true});
                        }
                        action.run();
                    });
                    footer.append(button);
                }
                footer.hidden = !footer.childElementCount;
            } catch (error) {
                if (!stillCurrent()) return;
                const timeout = error.message === 'INBOX_READ_TIMEOUT' || error.message === 'INBOX_READ_ABORTED' && view.abort.signal.aborted;
                const note = node('p','mb-2',timeout ? '문서 조회가 지연되고 있습니다.' : '문서를 불러올 수 없습니다.');
                const again = makeButton('다시 확인','btn-outline-primary');
                again.addEventListener('click',() => { if (stillCurrent()) void select(id,true); });
                detail.replaceChildren(note,again);
            } finally {
                clearTimeout(timer);
                if (stillCurrent()) detail.removeAttribute('aria-busy');
            }
        };
        function render(documents, state = 'ready') {
            const owner = api.context(true);
            if (!owner) { leave(); return; }
            if (phase === state && owner === listOwner && previous === documents) return;
            const oldFocus = list.contains(document.activeElement) ? document.activeElement.dataset.inboxId : null;
            clear();
            list.replaceChildren();
            rows = new Map();
            listOwner = owner;
            phase = state;
            previous = documents;
            if (state === 'error') {
                count.textContent = '목록을 불러오지 못했습니다.';
                const retry = makeButton('다시 확인','btn-outline-primary');
                retry.addEventListener('click', () => { if (api.context() === owner) void api.retryList(); });
                list.append(retry);
                return;
            }
            if (state === 'loading') { count.textContent = '불러오는 중…'; return; }
            for (const row of documents || []) {
                const id = api.id(row.id);
                if (!id || rows.has(id)) continue;
                rows.set(id,row);
                const item = makeButton(null,'approval-inbox-item');
                item.dataset.inboxId = String(id);
                item.setAttribute('aria-pressed','false');
                item.setAttribute('aria-controls',detail.id);
                const summary = api.describe(row);
                item.append(node('strong', '', summary.title),node('span','small',summary.meta));
                item.addEventListener('click',() => void select(id));
                list.append(item);
            }
            count.textContent = rows.size ? rows.size.toLocaleString('ko-KR') + '건' : '결재할 문서가 없습니다.';
            if (oldFocus) focusIfLost(buttonFor(oldFocus),() => api.context() === owner);
        }
        window.addEventListener('pagehide', leave);
        if (window.frameElement) new MutationObserver(records => {
            if (window.frameElement.hidden || records.some(record => record.oldValue === null)) clear();
        }).observe(window.frameElement,{attributes:true,attributeFilter:['hidden'],attributeOldValue:true});
        return {render, clear, leave};
    }

    window.ApprovalWorkspaceUi = Object.freeze({inbox});
})();
