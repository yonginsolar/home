/*
Version: v1.0.0
Change: 2026-03-26 - Normalize Bootstrap/custom modal stacking across shared pages.
*/
(function initModalLayeringHelper() {
    const BOOTSTRAP_BASE_Z_INDEX = 1050;
    const CUSTOM_BASE_Z_INDEX = 4000;
    const Z_INDEX_STEP = 20;
    let layerSequence = 0;
    let bootstrapBound = false;
    let observerBound = false;
    let syncQueued = false;

    function isElementVisible(el) {
        if (!(el instanceof HTMLElement)) return false;
        if (el.hidden) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        return true;
    } // End of isElementVisible

    function isCustomOverlay(el) {
        if (!(el instanceof HTMLElement)) return false;
        if (!el.matches('.modal-overlay, .modal-backdrop')) return false;
        if (el.classList.contains('modal')) return false;
        if (el.classList.contains('fade') && el.children.length === 0) return false;
        return el.children.length > 0;
    } // End of isCustomOverlay

    function ensureLayerOrder(el) {
        if (!(el instanceof HTMLElement)) return;
        const currentOrder = Number(el.dataset.modalLayerOrder || 0);
        if (Number.isFinite(currentOrder) && currentOrder > 0) {
            if (currentOrder > layerSequence) layerSequence = currentOrder;
            return;
        }
        el.dataset.modalLayerOrder = String(++layerSequence);
    } // End of ensureLayerOrder

    function clearLayerOrder(el) {
        if (!(el instanceof HTMLElement)) return;
        el.removeAttribute('data-modal-layer-order');
    } // End of clearLayerOrder

    function getBootstrapBackdrops() {
        return Array.from(document.querySelectorAll('.modal-backdrop')).filter((el) => !isCustomOverlay(el));
    } // End of getBootstrapBackdrops

    function syncBootstrapModalLayers() {
        const openModals = Array.from(document.querySelectorAll('.modal.show')).filter((el) => el instanceof HTMLElement);
        openModals.forEach(ensureLayerOrder);
        openModals.sort((a, b) => Number(a.dataset.modalLayerOrder || 0) - Number(b.dataset.modalLayerOrder || 0));

        openModals.forEach((modalEl, index) => {
            modalEl.style.zIndex = String(BOOTSTRAP_BASE_Z_INDEX + 5 + (index * Z_INDEX_STEP));
            modalEl.removeAttribute('aria-hidden');
        });

        const backdrops = getBootstrapBackdrops();
        backdrops.forEach((backdropEl, index) => {
            backdropEl.style.zIndex = String(BOOTSTRAP_BASE_Z_INDEX + (index * Z_INDEX_STEP));
        });

        if (openModals.length > 0) document.body.classList.add('modal-open');
    } // End of syncBootstrapModalLayers

    function syncCustomOverlayLayers() {
        const overlays = Array.from(document.querySelectorAll('.modal-overlay, .modal-backdrop')).filter(isCustomOverlay);
        const visibleOverlays = overlays.filter(isElementVisible);

        visibleOverlays.forEach(ensureLayerOrder);
        visibleOverlays.sort((a, b) => Number(a.dataset.modalLayerOrder || 0) - Number(b.dataset.modalLayerOrder || 0));

        overlays.forEach((overlayEl) => {
            if (!visibleOverlays.includes(overlayEl)) {
                overlayEl.style.zIndex = '';
                overlayEl.style.pointerEvents = '';
                clearLayerOrder(overlayEl);
            }
        });

        visibleOverlays.forEach((overlayEl, index) => {
            const isTop = index === visibleOverlays.length - 1;
            overlayEl.style.zIndex = String(CUSTOM_BASE_Z_INDEX + (index * Z_INDEX_STEP));
            overlayEl.style.pointerEvents = isTop ? 'auto' : 'none';
        });
    } // End of syncCustomOverlayLayers

    function syncModalLayersNow() {
        syncQueued = false;
        syncBootstrapModalLayers();
        syncCustomOverlayLayers();
    } // End of syncModalLayersNow

    function scheduleModalLayerSync() {
        if (syncQueued) return;
        syncQueued = true;
        window.requestAnimationFrame(syncModalLayersNow);
    } // End of scheduleModalLayerSync

    function bindBootstrapModalLayering() {
        if (bootstrapBound || !document.body) return;
        bootstrapBound = true;

        document.addEventListener('show.bs.modal', (event) => {
            const modalEl = event.target;
            if (!(modalEl instanceof HTMLElement) || !modalEl.classList.contains('modal')) return;
            ensureLayerOrder(modalEl);
            scheduleModalLayerSync();
        }, true);

        document.addEventListener('shown.bs.modal', scheduleModalLayerSync, true);
        document.addEventListener('hide.bs.modal', scheduleModalLayerSync, true);
        document.addEventListener('hidden.bs.modal', (event) => {
            const modalEl = event.target;
            if (modalEl instanceof HTMLElement && modalEl.classList.contains('modal')) {
                modalEl.style.zIndex = '';
                clearLayerOrder(modalEl);
            }
            scheduleModalLayerSync();
        }, true);
    } // End of bindBootstrapModalLayering

    function bindCustomOverlayObserver() {
        if (observerBound || !document.body) return;
        observerBound = true;

        const observer = new MutationObserver(() => {
            scheduleModalLayerSync();
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'hidden', 'aria-hidden']
        });
    } // End of bindCustomOverlayObserver

    function bindModalLayering() {
        if (!document.body) return;
        bindBootstrapModalLayering();
        bindCustomOverlayObserver();
        scheduleModalLayerSync();
    } // End of bindModalLayering

    window.modalLayeringHelper = {
        bind: bindModalLayering,
        sync: scheduleModalLayerSync
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindModalLayering, { once: true });
    } else {
        bindModalLayering();
    }
})(); // End of initModalLayeringHelper
