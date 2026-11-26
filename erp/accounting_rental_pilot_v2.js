(function (root) {
    'use strict';
    const bucket = 'erp-rental-pilot-files';
    const dateFormat = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Seoul',dateStyle:'short'});
    const today = () => dateFormat.format(new Date());
    const money = value => new Intl.NumberFormat('ko-KR').format(value)+'원';
    const amount = input => root.ERPNumberInput.raw(input.value);
    const el = (tag, css, label) => {
        const node = document.createElement(tag);
        if (css) node.className = css;
        if (label) node.textContent = label;
        return node;
    };
    const button = (label, css) => { const node = el('button',css,label); node.type='button'; return node; };
    const input = (parent, name, label, type, opts={}) => {
        const col=el('div','col-12 col-sm-6'), cap=el('label','form-label',label);
        const node=el('input','form-control');
        node.id='rentalPilot-'+name; node.type=type; cap.htmlFor=node.id;
        Object.assign(node,opts);
        if (['rent','deposit','paid'].includes(name)) node.setAttribute('data-number-group','');
        col.append(cap,node); parent.append(col); return node;
    };
    let active = null;
    function close() { active?.dialog.close(); }
    function open({client,coopId,userId,current,trigger}) {
        if(active || !current()) return;
        const dialog=el('dialog','accounting-rental-pilot-dialog border-0 rounded-4 p-0 shadow');
        const panel=el('section','p-3 p-md-4');
        const header=el('div','d-flex align-items-center justify-content-between mb-3');
        const title=el('h2','h5 mb-0','임대 매출');title.id='rentalPilotTitle';dialog.setAttribute('aria-labelledby',title.id);
        const dismiss=button('닫기','btn btn-outline-secondary btn-sm');header.append(title,dismiss);
        const toolbar=el('div','d-flex flex-wrap align-items-end gap-2 mb-3'), monthWrap=el('div');
        const views=el('div','d-flex gap-2 mb-3');
        const schedule=button('월별 청구','btn btn-outline-primary btn-sm'),saved=button('계약 목록','btn btn-outline-primary btn-sm');
        views.append(schedule,saved);
        const monthLabel=el('label','form-label mb-1','청구월'), month=el('input','form-control');
        month.type='month';month.id='rentalPilotMonth';monthLabel.htmlFor=month.id;month.value=today().slice(0,7);
        monthWrap.append(monthLabel,month);
        const reload=button('조회','btn btn-outline-primary'), add=button('임대 계약 등록','btn btn-primary');
        add.hidden=true;toolbar.append(monthWrap,reload,add);
        const hint=el('p','small text-body-secondary','월별 청구를 자동 표시합니다. 입금 확인은 임대 내역에만 기록되며 전표는 자동 생성하지 않습니다.');
        const status=el('p','small mb-2');status.setAttribute('role','status');
        const rows=el('div','d-grid gap-2');
        const pages=el('div','d-flex gap-2 mt-2');
        const prev=button('이전 50건','btn btn-outline-secondary btn-sm'),next=button('다음 50건','btn btn-outline-secondary btn-sm');
        pages.hidden=true;pages.append(prev,next);
        const workspace=el('div','mb-3');
        workspace.hidden=true;
        panel.append(header,views,toolbar,hint,status,workspace,rows,pages);dialog.append(panel);document.body.append(dialog);
        const state={dialog,busy:false,generation:0,displayMonth:'',canEdit:false,form:null,mode:'schedule',offset:0,hasMore:false};
        active=state;
        const alive=()=>active===state && current() && dialog.open;
        async function call(args){const {data,error}=await client.rpc('erp_rental_pilot_v1',args);if(error)throw error;return data;}
        function busy(value){
            state.busy=value;
            month.disabled=reload.disabled=add.disabled=value;
            schedule.disabled=saved.disabled=value;
            prev.disabled=value||state.offset===0;next.disabled=value||!state.hasMore;
            for (const control of workspace.querySelectorAll('button,input')) control.disabled=value || (control.tagName==='INPUT' && !!state.form?.locked);
            for (const control of rows.querySelectorAll('button')) control.disabled=value;
        }
        function syncView(){
            const contractMode=state.mode==='contracts',editing=!!state.form;
            monthWrap.hidden=contractMode;views.hidden=editing;toolbar.hidden=editing;
            pages.hidden=editing||!contractMode||(!state.hasMore&&state.offset===0);
            schedule.setAttribute('aria-pressed',String(!contractMode));
            saved.setAttribute('aria-pressed',String(contractMode));
            schedule.classList.toggle('active',!contractMode);saved.classList.toggle('active',contractMode);
        }
        function clearForm(){state.form=null;workspace.hidden=true;workspace.replaceChildren();rows.hidden=false;syncView();}
        function mountForm(title) {
            const form=el('form','card p-3');
            form.append(el('h3','h6 mb-3',title));
            const grid=el('div','row g-3');form.append(grid);
            const controls=el('div','d-flex gap-2 mt-3');
            const save=el('button','btn btn-primary','저장');save.type='submit';
            const cancel=button('취소','btn btn-outline-secondary');controls.append(save,cancel);form.append(controls);
            cancel.onclick=()=>{if(!state.busy){clearForm();status.textContent='';reload.focus();}};
            workspace.replaceChildren(form);workspace.hidden=false;rows.hidden=true;
            status.textContent='';
            state.form={form,locked:false,pending:null};
            syncView();
            workspace.scrollIntoView({block:'nearest'});
            return {form,grid};
        }
        async function viewScan(row, trigger) {
            if(!alive() || state.busy) return;
            trigger.disabled=true;
            try{
                const {data,error}=await client.storage.from(bucket).download(row.scan_path);
                if(!alive()) return;
                if(error || !data) throw error || new Error();
                const url=URL.createObjectURL(data);
                const anchor=el('a');anchor.href=url;anchor.download='임대계약서.'+row.scan_path.split('.').at(-1);
                anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
            }catch(_){if(alive())status.textContent='계약서 스캔을 열지 못했습니다. 다시 시도해 주세요.';}
            finally{trigger.disabled=false;}
        }
        function render(items){
            rows.replaceChildren();
            for(const row of items){
                const item=el('article','card p-3');
                item.append(el('h3','h6 text-break mb-1',row.tenant_label));
                const contracts = state.mode==='contracts';
                item.append(el('p','mb-1',contracts
                    ? row.starts_on+' ~ '+row.ends_on+' · 매월 '+row.due_day+'일 · 월세 '+money(row.rent_amount)
                    : row.due_on+' · 월세 '+money(row.rent_amount)));
                if(row.deposit_amount!=null) item.append(el('p','small text-body-secondary mb-1','계약 보증금 '+money(row.deposit_amount)));
                if(!contracts) item.append(el('p','small fw-semibold mb-2',row.received_on?'입금 확인 · '+row.received_on:'입금 확인 대기'));
                const links=el('div','d-flex flex-wrap gap-2');
                if(row.scan_path){const view=button('계약서 내려받기','btn btn-outline-secondary btn-sm');view.onclick=()=>void viewScan(row,view);links.append(view);}
                if(!contracts&&!row.received_on&&state.canEdit){const confirm=button('입금 확인','btn btn-outline-primary btn-sm');confirm.onclick=()=>confirmReceipt(row);links.append(confirm);}
                item.append(links);rows.append(item);
            }
        }
        async function read(notice='') {
            if(!alive()||state.busy||state.form)return;
            const selected=month.value, contracts=state.mode==='contracts';
            if(!contracts&&!/^20\d\d-(0[1-9]|1[0-2])$/.test(selected)){status.textContent='청구월을 선택해 주세요.';return;}
            const gen=++state.generation;
            rows.replaceChildren();add.hidden=true;busy(true);syncView();status.textContent=contracts?'계약을 불러오는 중입니다.':'청구 내역을 불러오는 중입니다.';
            try{
                let result;
                if (contracts) {
                    const response=await client.rpc('erp_rental_pilot_contracts_v1',{p_offset:state.offset});
                    if(response.error)throw response.error;
                    result=response.data;
                } else result=await call({p_action:'read',p_month:selected+'-01'});
                if(!alive()||gen!==state.generation)return;
                if(!Array.isArray(result?.contracts))throw new Error();
                state.displayMonth=selected;state.canEdit=result.can_edit===true;
                state.hasMore=result.has_more===true;
                add.hidden=!state.canEdit;render(result.contracts);
                status.textContent=notice||(result.contracts.length?'':contracts?'등록된 계약이 없습니다.':'이달에 청구할 임대료가 없습니다.');
            }catch(_){if(alive())status.textContent=contracts?'계약 목록을 불러오지 못했습니다. 다시 조회해 주세요.':'청구 내역을 불러오지 못했습니다. 다시 조회해 주세요.';}
            finally{if(alive()){busy(false);syncView();}}
        }
        function createContract(){
            if(!alive()||state.busy||!state.canEdit)return;
            const {form,grid}=mountForm('임대 계약 등록');
            const tenant=input(grid,'tenant','임차인','text',{required:true,maxLength:160});
            const start=input(grid,'starts','계약 시작일','date',{required:true}),end=input(grid,'ends','계약 종료일','date',{required:true});
            const due=input(grid,'due','매월 입금일','number',{required:true,min:1,max:31,step:1});
            const rent=input(grid,'rent','월세 (원)','number',{required:true,min:1,max:999999999999,step:1});
            const deposit=input(grid,'deposit','보증금 (원, 선택)','number',{min:0,max:999999999999,step:1});
            const scan=input(grid,'file','계약서 스캔 (선택)','file',{accept:'application/pdf,image/jpeg,image/png'});
            const holder=state.form;
            form.addEventListener('submit',async event=>{
                event.preventDefault();
                if(!alive()||state.busy||holder!==state.form)return;
                if(!holder.pending){
                    const file=scan.files[0], ext=file&&({'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png'})[file.type];
                    if(start.value>end.value||!tenant.value.trim()||(file&&(!ext||file.size>10485760||!file.size))){
                        status.textContent='계약 기간·임차인 또는 계약서 파일(PDF·JPG·PNG, 10MB 이하)을 확인해 주세요.';return;
                    }
                    const request=root.crypto.randomUUID(), key=file?coopId+'/'+userId+'/'+request+'.'+ext:null;
                    holder.pending={request,file,key,data:{tenant_label:tenant.value.trim(),starts_on:start.value,ends_on:end.value,
                        due_day:due.value,rent_amount:amount(rent),deposit_amount:amount(deposit)||null,scan_path:key}};
                }
                const pending=holder.pending;
                holder.locked=true;busy(true);
                try{
                    if(pending.file && !pending.uploaded){
                        const {error}=await client.storage.from(bucket).upload(pending.key,pending.file,{contentType:pending.file.type,upsert:false});
                        if(!alive())return;
                        if(error && !(['409','Duplicate'].includes(String(error.statusCode||error.code)))) throw error;
                        pending.uploaded=true;
                    }
                    const res=await call({p_action:'create',p_contract:pending.request,p_data:pending.data});
                    if(!alive())return;
                    if(res?.id!==pending.request)throw new Error();
                    state.mode='contracts';state.offset=0;
                    clearForm();busy(false);await read('계약을 등록했습니다.');
                }catch(_){if(alive())status.textContent='저장을 확인하지 못했습니다. 같은 내용으로 다시 시도하거나 취소해 주세요.';}
                finally{if(alive())busy(false);}
            });
            tenant.focus();
        }
        function confirmReceipt(row){
            if(!alive()||state.busy||!state.canEdit||month.value!==state.displayMonth)return;
            const selected=state.displayMonth;
            const {form,grid}=mountForm('임대료 입금 확인');
            form.insertBefore(el('p','small',row.tenant_label+' · '+selected+' · '+money(row.rent_amount)),grid);
            const date=input(grid,'received','실제 입금일','date',{required:true,max:today()});
            const paidAmount=input(grid,'paid','실제 입금액 (원)','number',{required:true,min:1,step:1,max:999999999999});
            form.querySelector('button[type="submit"]').textContent='입금 확인 저장';
            form.addEventListener('submit',async event=>{
                event.preventDefault();if(!alive()||state.busy)return;
                if(Number(amount(paidAmount))!==Number(row.rent_amount)){status.textContent='월세와 입금액이 다른 건은 여기서 확정하지 않습니다.';return;}
                busy(true);
                try{
                    const res=await call({p_action:'confirm',p_month:selected+'-01',p_contract:row.id,
                        p_data:{received_on:date.value,amount:amount(paidAmount)}});
                    if(!alive())return;
                    if(res?.id!==row.id)throw new Error();
                    clearForm();busy(false);await read();
                }catch(_){if(alive())status.textContent='입금 확인을 저장하지 못했습니다. 날짜와 기존 확인 내역을 확인해 주세요.';}
                finally{if(alive())busy(false);}
            });
            date.focus();
        }
        month.onchange=()=>{rows.replaceChildren();status.textContent='조회 버튼을 눌러 주세요.';};
        function switchView(mode){if(!alive()||state.busy||state.form||mode===state.mode)return;state.mode=mode;state.offset=0;state.hasMore=false;void read();}
        schedule.onclick=()=>switchView('schedule');saved.onclick=()=>switchView('contracts');
        prev.onclick=()=>{if(!state.busy&&state.offset>0){state.offset-=50;void read();}};
        next.onclick=()=>{if(!state.busy&&state.hasMore){state.offset+=50;void read();}};
        reload.onclick=()=>void read();add.onclick=createContract;
        dismiss.onclick=()=>{if(!state.busy||!state.form)close();};
        dialog.addEventListener('cancel',event=>{if(state.busy&&state.form)event.preventDefault();});
        dialog.addEventListener('close',()=>{
            if(active===state)active=null;dialog.remove();
            if(current()&&trigger.isConnected)trigger.focus({preventScroll:true});
        },{once:true});
        dialog.showModal();void read();
    }
    root.CoopRentalPilot=Object.freeze({open,close});
})(window);
