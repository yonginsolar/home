/* Member Excel entry v1.0.4. File routing only; original preview/writers remain authoritative. */
(function (root) {
    'use strict';
    const labels = {members:'회원 등록',capital:'출자금 추가',workbook:'회원·출자금 함께 등록'};
    function classify(wb, X) {
        if (!wb.SheetNames?.length) throw Error('시트가 없는 파일입니다.');
        const header = name => {
            const sheet = wb.Sheets[name];
            if (!sheet) return [];
            const rows = X.utils.sheet_to_json(sheet, {header:1,raw:true,defval:'',range:0});
            return (rows.find(row => row.some(value => String(value ?? '').trim())) || []).map(value => String(value ?? '').trim());
        };
        if (wb.Sheets['조합원'] && wb.Sheets['출자금 납입내역']) return 'workbook';
        const first = wb.SheetNames[0], head = header(first), has = values => values.some(value => head.includes(value));
        if (has(['유형','member_type']) && has(['이름','성명','name','단체명','법인명','상호']) && first !== '출자금 납입내역') return 'members';
        if (has(['납입일','입금일','날짜','deposit_date']) && has(['금액','입금액','출자금액','출자금','amount'])
            && has(['조합원번호','회원번호','member_id','이름·단체명','이름','성명','단체명','name'])) {
            if (first === '출자금 납입내역' && head.includes('거래 구분') && head.includes('유형')) return 'workbook';
            return 'capital';
        }
        throw Error('양식의 항목을 확인해 주세요. 양식 다운로드에서 회원·출자금 통합 양식을 받을 수 있습니다.');
    }
    function create({getContext,ensureSpreadsheet,openReview,getDrafts,downloadTemplate}) {
        let modal, input, status, proceed, retry, drafts, opener, owner='', epoch=0, file=null, kind=null, forwarding=false, permissionBlocked=false, reading=false, interrupted=false, stopFocusWatch=null, closeReturn=null;
        const context = () => getContext() || {};
        const current = ticket => ticket === epoch && owner && owner === context().owner && context().allowed === true && !root.frameElement?.hidden;
        const visible = () => modal?.classList.contains('show');
        const retryMessage = '파일 확인이 중단됐어요. 다시 확인을 눌러 이어가 주세요.';
        function cancelFocusReturn() {stopFocusWatch?.();stopFocusWatch=null;}
        function unblockedByDialog() {
            try {
                let host=root;
                while(true){
                    if(host.document.querySelector('dialog[open]')||host.CoopDialog?.hasPending?.())return false;
                    if(host!==root&&host.document.querySelector('.modal.show'))return false;
                    if(host===host.parent)break;
                    host=host.parent;
                }
            }catch(_){return false;}
            return true;
        }
        function ownsKeyboard() {
            return !!owner&&owner===context().owner&&!root.frameElement?.hidden&&visible()&&!modal.closest('[inert]')&&unblockedByDialog();
        }
        function cancelCloseReturn() {closeReturn?.stop?.();closeReturn=null;}
        function prepareCloseReturn(event) {
            if(event.target!==modal)return;
            cancelCloseReturn();
            if(forwarding)return;
            const state={eligible:modal.contains(document.activeElement),target:opener,changed:false};closeReturn=state;
            root.queueMicrotask(()=>{if(event.defaultPrevented&&closeReturn===state)cancelCloseReturn();});
        }
        function watchCloseReturn() {
            const state=closeReturn;if(!state?.eligible)return;
            state.ticket=epoch;state.baseline=document.activeElement;
            const documents=[],events=['pointerdown','keydown','input','focusin'],changed=()=>{state.changed=true;};
            try {
                let host=root;
                while(true){documents.push(host.document);if(host===host.parent)break;host=host.parent;}
            }catch(_){cancelCloseReturn();return;}
            for(const doc of documents)for(const name of events)doc.addEventListener(name,changed,true);
            root.addEventListener('blur',changed);
            state.stop=()=>{for(const doc of documents)for(const name of events)doc.removeEventListener(name,changed,true);root.removeEventListener('blur',changed);};
            // Bootstrap deactivates its focus trap after hide listeners return. Clear only
            // residual focus in the closing dialog before the core's next-frame fallback.
            root.queueMicrotask(()=>{if(closeReturn===state&&modal.contains(document.activeElement)){document.activeElement.blur();state.baseline=document.activeElement;}});
        }
        function finishCloseReturn() {
            const state=closeReturn;cancelCloseReturn();
            const target=state?.target;
            if(!state?.eligible||state.changed||forwarding||!current(state.ticket)||visible()||!document.hasFocus()||!unblockedByDialog()||document.querySelector('.modal.show'))return;
            if(![state.baseline,document.body].includes(document.activeElement)||!target?.isConnected||target.disabled||target.closest('[hidden],[inert]')||!target.getClientRects().length||getComputedStyle(target).visibility!=='visible')return;
            target.focus({preventScroll:true});
        }
        function containTab(event) {
            if(event.key!=='Tab'||event.defaultPrevented||event.isComposing||!ownsKeyboard())return;
            const nodes=Array.from(modal.querySelectorAll('a[href],button,input,select,textarea,[tabindex],[contenteditable="true"]'))
                .filter(node=>node.tabIndex>=0&&!node.matches(':disabled')&&!node.closest('[hidden],[inert]')&&node.getClientRects().length&&getComputedStyle(node).visibility==='visible')
                .sort((a,b)=>(a.tabIndex>0?a.tabIndex:Infinity)-(b.tabIndex>0?b.tabIndex:Infinity));
            const index=nodes.indexOf(document.activeElement);
            if(!nodes.length||index<0||(!event.shiftKey&&index===nodes.length-1)||(event.shiftKey&&index===0)){
                event.preventDefault();
                ((event.shiftKey?nodes[nodes.length-1]:nodes[0])||modal).focus({preventScroll:true});
            }
        }
        function watchRetryFocus() {
            let changed=false;
            const interact=()=>{changed=true;};
            const focus=event=>{if(![retry,modal,document.body].includes(event.target))changed=true;};
            const events=['pointerdown','keydown','input'];
            for(const name of events)document.addEventListener(name,interact,true);
            document.addEventListener('focusin',focus,true);
            root.addEventListener('blur',interact);
            const stop=()=>{for(const name of events)document.removeEventListener(name,interact,true);document.removeEventListener('focusin',focus,true);root.removeEventListener('blur',interact);if(stopFocusWatch===stop)stopFocusWatch=null;};
            stopFocusWatch=stop;
            return {stop,mayReturn:()=>!changed&&document.hasFocus()&&[retry,modal,document.body].includes(document.activeElement)};
        }
        function renderRetry() {
            retry.hidden=!file||!!kind||!interrupted;
            retry.disabled=reading||forwarding||!current(epoch);
        }
        function interruptRead() {
            cancelFocusReturn();
            if(reading){reading=false;interrupted=true;status.textContent=retryMessage;}
            renderRetry();
        }
        function renderDrafts() {
            drafts.replaceChildren();
            if(!owner||owner!==context().owner||!context().allowed)return;
            for (const key of getDrafts()) {
                const button = document.createElement('button');button.type='button';button.className='btn btn-sm btn-outline-primary';
                button.textContent=labels[key]+' 검토 이어보기';button.onclick=()=>void forward(key, null);drafts.append(button);
            }
        }
        function build() {
            if (modal) return;
            modal=document.createElement('div');modal.id='memberExcelEntryModal';modal.className='modal fade';modal.tabIndex=-1;
            modal.setAttribute('aria-labelledby','memberExcelEntryTitle');
            modal.innerHTML='<div class="modal-dialog modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h2 class="modal-title h5" id="memberExcelEntryTitle">엑셀 업로드</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="닫기"></button></div><div class="modal-body"><p>회원 등록·출자금 추가·함께 등록을 파일 양식에 맞춰 검토합니다.</p><div class="d-flex gap-2 flex-wrap mb-3"><button type="button" class="btn btn-sm btn-outline-success" data-template>통합 양식 다운로드</button><button type="button" class="btn btn-sm btn-outline-secondary coop-workflow-help" data-help aria-label="엑셀 업로드 도움말">?</button></div><label for="memberExcelEntryFile" class="form-label">엑셀·CSV 파일</label><input id="memberExcelEntryFile" type="file" accept=".xlsx,.xls,.csv" class="form-control"><p class="small text-muted mt-2">신규 회원은 조합원 시트에, 실제 입금은 출자금 납입내역 시트에 입력하세요. 한 종류만 입력해도 됩니다. 기존 양식도 사용할 수 있어요. 파일은 10MB, 시트별 500건까지입니다.</p><p data-status class="small" role="status" aria-live="polite"></p><div data-drafts class="d-flex gap-2 flex-wrap"></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">닫기</button><button type="button" data-proceed class="btn btn-primary" disabled>검토하기</button></div></div></div>';
            document.body.append(modal);input=modal.querySelector('input');status=modal.querySelector('[data-status]');proceed=modal.querySelector('[data-proceed]');drafts=modal.querySelector('[data-drafts]');
            retry=document.createElement('button');retry.type='button';retry.className='btn btn-sm btn-outline-primary mb-3';retry.dataset.retry='';retry.textContent='다시 확인';retry.hidden=true;status.after(retry);
            input.addEventListener('change',()=>void read());proceed.onclick=()=>void forward(kind,file);retry.onclick=()=>void read(true);
            modal.addEventListener('keydown',containTab);
            modal.querySelector('[data-template]').onclick=async()=>{const ticket=epoch;try{await downloadTemplate(()=>current(ticket)&&visible());}catch(_){if(current(ticket)&&visible())status.textContent='양식을 내려받지 못했어요. 다시 시도해 주세요.';}};
            modal.querySelector('[data-help]').onclick=()=>{if(root.CoopWorkflowHelp?.visible()===false)return;void root.CoopDialog.alert('회원만 등록할 때는 조합원 시트만 작성하세요. 유형과 이름·단체명은 필수이며, 나머지 빈칸은 나중에 보완할 수 있어요.\n\n여러 차례 납입했다면 출자금 납입내역 시트에 실제 입금을 한 줄씩 적으세요. 기존 조합원은 조합원번호로 연결하고, 신규 회원은 유형과 이름·단체명을 일치시켜 주세요.\n\n같은 날 같은 금액의 별도 입금은 거래 구분을 다르게 적고 검토 화면에서 확인해 주세요. 파일 선택만으로 등록되지는 않으며 검토 후 등록을 눌러야 반영돼요.',{title:'엑셀 업로드'});};
            root.addEventListener('hide.bs.modal',prepareCloseReturn,true);
            modal.addEventListener('hide.bs.modal',()=>{if(!forwarding){epoch++;interruptRead();proceed.disabled=!kind;watchCloseReturn();}});
            modal.addEventListener('hidden.bs.modal',finishCloseReturn);
            root.addEventListener('pagehide',cancelCloseReturn);
            if(root.frameElement)new MutationObserver(()=>{if(root.frameElement.hidden){epoch++;cancelCloseReturn();forwarding=false;interruptRead();proceed.disabled=!kind;}}).observe(root.frameElement,{attributes:true,attributeFilter:['hidden']});
            root.addEventListener('beforeunload',event=>{if(file){event.preventDefault();event.returnValue='';}});
        }
        async function read(fromRetry=false) {
            const selected=input.files?.[0];if(!selected||forwarding||!current(epoch)||!visible())return;
            cancelFocusReturn();
            const returnFocus=fromRetry&&document.activeElement===retry?watchRetryFocus():null;
            const previous=file,previousKind=kind,ticket=++epoch;kind=null;proceed.disabled=true;
            reading=false;interrupted=false;
            const restorePrevious=()=>{file=previous;kind=previousKind;interrupted=!!previous&&!previousKind;try{const transfer=new root.DataTransfer();if(previous)transfer.items.add(previous);input.files=transfer.files;}catch(_){input.value='';}proceed.disabled=!kind||!context().allowed;renderRetry();};
            if(selected.size>10*1024*1024||!/[.](xlsx|xls|csv)$/i.test(selected.name)) {
                restorePrevious();
                status.textContent='10MB 이하의 엑셀(.xlsx, .xls) 또는 CSV 파일을 선택해 주세요.';returnFocus?.stop();return;
            }
            file=selected;reading=true;renderRetry();status.textContent='파일 양식을 확인하고 있어요…';
            let toolReady=false;
            try {
                await ensureSpreadsheet();toolReady=true;if(!current(ticket)||!visible())return;
                const bytes=await selected.arrayBuffer();if(!current(ticket)||!visible()||file!==selected)return;
                const wb=root.XLSX.read(bytes,{type:'array',cellDates:false,sheetRows:10002});
                kind=classify(wb,root.XLSX);
                if(kind!=='capital'&&/[.]csv$/i.test(selected.name))throw Error('회원 등록은 엑셀(.xlsx, .xls) 파일로 선택해 주세요.');
                if(kind==='capital'&&/[.]xls$/i.test(selected.name))throw Error('출자금만 담은 파일은 엑셀(.xlsx) 또는 CSV로 선택해 주세요.');
                status.textContent=labels[kind]+' 양식입니다. 검토하기를 눌러 내용과 중복 여부를 확인해 주세요.';proceed.disabled=false;
            }catch(error){if(current(ticket)&&visible()&&file===selected){
                if(!toolReady){kind=null;interrupted=true;proceed.disabled=true;status.textContent='파일 읽기 도구를 불러오지 못했어요. 다시 확인을 눌러 주세요.';}
                else{restorePrevious();status.textContent=error.message||'파일을 읽지 못했어요. 다시 선택해 주세요.';}
            }}
            finally{
                if(ticket===epoch){
                    reading=false;renderRetry();
                    const target=kind?proceed:!retry.hidden&&!retry.disabled?retry:null;
                    if(target&&returnFocus?.mayReturn()&&current(ticket)&&visible()&&file===selected&&ownsKeyboard())target.focus({preventScroll:true});
                }
                returnFocus?.stop();
            }
        }
        async function forward(target, selected) {
            const ticket=epoch;if(!target||forwarding||!current(ticket)||!visible())return;
            if(selected&&getDrafts().includes(target)){
                const yes=await root.CoopDialog.confirm('작성 중인 검토를 선택한 파일로 바꿀까요?');
                if(!yes||!current(ticket)||!visible()||file!==selected)return;
            }
            forwarding=true;proceed.disabled=true;input.disabled=true;
            try {
                const transfer=selected?new root.DataTransfer():null;if(transfer)transfer.items.add(selected);
                await new Promise(resolve=>{modal.addEventListener('hidden.bs.modal',resolve,{once:true});root.bootstrap.Modal.getOrCreateInstance(modal).hide();});
                if(!current(ticket))return;
                const accepted=await openReview(target,transfer,()=>current(ticket));
                if(!current(ticket))return;
                if(accepted&&selected){file=null;kind=null;interrupted=false;input.value='';root.ErpWorkspaceResume?.checkpoint(input);status.textContent='';}
                else if(!accepted){status.textContent='검토를 열지 못했어요. 작성 중인 검토나 처리 결과를 확인한 뒤 다시 시도해 주세요.';root.bootstrap.Modal.getOrCreateInstance(modal).show();}
            }catch(_){if(current(ticket)){status.textContent='검토 도구를 열지 못했어요. 다시 시도해 주세요.';root.bootstrap.Modal.getOrCreateInstance(modal).show();}}
            finally{forwarding=false;input.disabled=!context().allowed;proceed.disabled=!kind||!context().allowed;renderRetry();renderDrafts();}
        }
        function syncContext() {
            if(!modal)return;
            const c=context();
            if(owner&&owner!==c.owner){epoch++;cancelCloseReturn();cancelFocusReturn();file=null;kind=null;reading=false;interrupted=false;input.value='';status.textContent='';permissionBlocked=false;owner='';root.bootstrap.Modal.getInstance(modal)?.hide();}
            if(!c.allowed){epoch++;interruptRead();permissionBlocked=true;proceed.disabled=true;status.textContent='현재 권한으로는 업로드할 수 없습니다.';}
            else if(permissionBlocked){permissionBlocked=false;proceed.disabled=!kind||forwarding;status.textContent=kind?labels[kind]+' 양식입니다. 검토하기를 눌러 내용과 중복 여부를 확인해 주세요.':interrupted?retryMessage:'';}
            input.disabled=!c.allowed||forwarding;
            renderRetry();
        }
        function open() {
            if(forwarding)return false;
            cancelCloseReturn();
            build();syncContext();const c=context();if(!c.owner||!c.allowed)return false;
            owner=c.owner;opener=document.activeElement;renderDrafts();renderRetry();input.disabled=false;proceed.disabled=!kind;root.bootstrap.Modal.getOrCreateInstance(modal).show();
            if(file&&!kind){const go=()=>void read();if(visible())go();else modal.addEventListener('shown.bs.modal',go,{once:true});}return true;
        }
        return Object.freeze({open,syncContext});
    }
    root.MemberExcelEntry=Object.freeze({version:'1.0.4',create,classify});
})(window);
