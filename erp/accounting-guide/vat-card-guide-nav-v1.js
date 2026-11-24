(() => {
    'use strict';
    const card = document.getElementById('card-guide');
    const basics = document.getElementById('vat-basics');
    const cardNav = document.getElementById('card-nav');
    const basicsNav = document.getElementById('basics-nav');
    const steps = new Set(['#lookup', '#review', '#change']);
    function show(focusStep = false) {
        const hash = location.hash;
        const explaining = hash === '#vat-basics';
        card.hidden = explaining;
        basics.hidden = !explaining;
        const [selected, other] = explaining ? [basicsNav, cardNav] : [cardNav, basicsNav];
        selected.setAttribute('aria-current', 'page');
        other.removeAttribute('aria-current');
        document.title = selected.textContent + ' | 용인모두의햇빛협동조합';
        requestAnimationFrame(() => {
            if (location.hash !== hash) return;
            const step = !explaining && steps.has(hash) && document.getElementById(hash.slice(1));
            if (step) {
                if (focusStep) {
                    step.tabIndex = -1;
                    step.focus({preventScroll:true});
                }
                step.scrollIntoView();
            } else window.scrollTo(0, 0);
        });
    }
    document.addEventListener('click', event => {
        if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        const link = event.target.closest('a[href^="#"]');
        if (!link || !['#card-guide', '#vat-basics'].includes(link.hash) && !steps.has(link.hash)) return;
        event.preventDefault();
        // The guide is also embedded. Its section switches must not add Back steps to the ERP workspace.
        if (location.hash !== link.hash) history.replaceState(null, '', link.hash);
        show(true);
    });
    window.addEventListener('hashchange', () => show());
    show();
})();
