(function () {
  'use strict';

  const TIPTAP_VERSION = '3.4.1';
  const TIPTAP_PINNED_DEPS = `@tiptap/core@${TIPTAP_VERSION},@tiptap/pm@${TIPTAP_VERSION}`;
  const TIPTAP_MODULE_URLS = Object.freeze({
    core: `https://esm.sh/@tiptap/core@${TIPTAP_VERSION}?bundle&deps=${TIPTAP_PINNED_DEPS}`,
    starterKit: `https://esm.sh/@tiptap/starter-kit@${TIPTAP_VERSION}?bundle&deps=${TIPTAP_PINNED_DEPS}`,
    textAlign: `https://esm.sh/@tiptap/extension-text-align@${TIPTAP_VERSION}?bundle&deps=${TIPTAP_PINNED_DEPS}`,
    table: `https://esm.sh/@tiptap/extension-table@${TIPTAP_VERSION}?bundle&deps=${TIPTAP_PINNED_DEPS}`
  });

  let tiptapModules = null;
  let tiptapLoadPromise = null;

  function resolveElement(target) {
    if (!target) return null;
    if (target instanceof Element) return target;
    if (typeof target !== 'string') return null;
    const selector = target.charAt(0) === '#' ? target : `#${target}`;
    return document.querySelector(selector);
  }

  function pickModuleExport(moduleValue, ...names) {
    if (!moduleValue) return null;
    for (const name of names) {
      if (moduleValue[name]) return moduleValue[name];
    }
    return moduleValue.default || null;
  }

  async function loadTiptapModules() {
    if (tiptapModules) return tiptapModules;
    if (tiptapLoadPromise) return tiptapLoadPromise;

    tiptapLoadPromise = Promise.all([
      import(TIPTAP_MODULE_URLS.core),
      import(TIPTAP_MODULE_URLS.starterKit),
      import(TIPTAP_MODULE_URLS.textAlign),
      import(TIPTAP_MODULE_URLS.table)
    ]).then(([
      core,
      starterKit,
      textAlign,
      table
    ]) => {
      const loaded = {
        Editor: core.Editor,
        StarterKit: pickModuleExport(starterKit, 'StarterKit'),
        TextAlign: pickModuleExport(textAlign, 'TextAlign'),
        TableKit: pickModuleExport(table, 'TableKit')
      };
      const missing = Object.entries(loaded)
        .filter(([, value]) => !value)
        .map(([key]) => key);
      if (missing.length > 0) {
        throw new Error(`APPROVAL_TIPTAP_MODULE_MISSING:${missing.join(',')}`);
      }
      tiptapModules = loaded;
      return loaded;
    }).catch((error) => {
      tiptapLoadPromise = null;
      throw error;
    });

    return tiptapLoadPromise;
  }

  function isTiptapReady() {
    return !!(tiptapModules && tiptapModules.Editor);
  }

  function clampInteger(value, min, max) {
    const number = Number.parseInt(String(value || '').trim(), 10);
    if (!Number.isFinite(number)) return null;
    if (number < min || number > max) return null;
    return number;
  }

  async function askTextValue(label, options = {}) {
    if (typeof options.askText === 'function') {
      return await options.askText(label, options);
    }
    console.warn('approval editor prompt handler is not configured:', label);
    return null;
  }

  async function showMessage(message, options = {}) {
    if (typeof options.showMessage === 'function') {
      options.showMessage(message, options);
      return;
    }
    console.warn('approval editor message handler is not configured:', message);
  }

  async function askTableSize(label, defaultValue, min, max, options = {}) {
    const rawValue = await askTextValue(label, {
      ...options,
      title: '표 넣기',
      value: String(defaultValue),
      placeholder: `${min}~${max} 사이의 숫자`,
      inputType: 'number',
      inputMode: 'numeric',
      min,
      max
    });
    if (rawValue === null) return null;
    const parsed = clampInteger(rawValue, min, max);
    if (parsed === null) {
      await showMessage(`${min}~${max} 사이의 숫자를 입력해주세요.`, options);
      return null;
    }
    return parsed;
  }

  function setEditorContent(editor, rawHtml, emitUpdate = false) {
    const html = String(rawHtml || '').trim() || '<p></p>';
    try {
      editor.commands.setContent(html, { emitUpdate });
    } catch (_) {
      editor.commands.setContent(html, emitUpdate);
    }
  }

  function createTiptapBridge(options = {}) {
    let editor = null;
    let syncing = false;
    let toolbarFallbackBound = false;

    function getSourceElement() {
      if (typeof options.getSourceElement === 'function') return options.getSourceElement();
      return resolveElement(options.source);
    }

    function getPlaceholder() {
      if (typeof options.getPlaceholder === 'function') return String(options.getPlaceholder() || '');
      return String(options.placeholder || '');
    }

    function getToolbarElement() {
      return resolveElement(options.toolbar);
    }

    function normalizeHtml(rawHtml) {
      if (typeof options.normalizeHtml === 'function') return options.normalizeHtml(rawHtml);
      return String(rawHtml || '').trim();
    }

    function buildHtmlFromSource(rawValue) {
      if (typeof options.buildHtmlFromSource === 'function') return options.buildHtmlFromSource(rawValue);
      const value = String(rawValue || '').trim();
      return value || '<p></p>';
    }

    function shouldSyncToSource() {
      if (typeof options.shouldSyncToSource === 'function') return !!options.shouldSyncToSource();
      return true;
    }

    function buildExtensions() {
      const modules = tiptapModules;
      return [
        modules.StarterKit.configure({
          dropcursor: false,
          gapcursor: false,
          link: {
            openOnClick: false,
            autolink: true,
            linkOnPaste: true,
            defaultProtocol: 'https'
          },
          trailingNode: false
        }),
        modules.TextAlign.configure({
          types: ['heading', 'paragraph']
        }),
        modules.TableKit.configure({
          table: {
            resizable: false,
            HTMLAttributes: {
              class: 'approval-rich-table'
            }
          }
        })
      ];
    }

    function updateToolbarState() {
      if (!editor) return;
      const toolbarEl = getToolbarElement();
      if (!toolbarEl) return;

      toolbarEl.querySelectorAll('[data-approval-editor-command]').forEach((button) => {
        const command = button.getAttribute('data-approval-editor-command');
        let active = false;
        if (command === 'bold') active = editor.isActive('bold');
        else if (command === 'italic') active = editor.isActive('italic');
        else if (command === 'underline') active = editor.isActive('underline');
        else if (command === 'bulletList') active = editor.isActive('bulletList');
        else if (command === 'orderedList') active = editor.isActive('orderedList');
        else if (command === 'blockquote') active = editor.isActive('blockquote');
        else if (command === 'link') active = editor.isActive('link');
        else if (command === 'alignLeft') active = editor.isActive({ textAlign: 'left' });
        else if (command === 'alignCenter') active = editor.isActive({ textAlign: 'center' });
        else if (command === 'alignRight') active = editor.isActive({ textAlign: 'right' });
        else if (command === 'alignJustify') active = editor.isActive({ textAlign: 'justify' });
        else if (command === 'tableMenu') active = editor.isActive('table');
        button.classList.toggle('active', active);
      });

      const blockSelect = toolbarEl.querySelector('[data-approval-editor-select="block"]');
      if (blockSelect) {
        if (editor.isActive('heading', { level: 1 })) blockSelect.value = 'heading1';
        else if (editor.isActive('heading', { level: 2 })) blockSelect.value = 'heading2';
        else if (editor.isActive('heading', { level: 3 })) blockSelect.value = 'heading3';
        else blockSelect.value = 'paragraph';
      }
    }

    function runChain(commandName, callback) {
      if (!ensure()) return false;
      try {
        const result = callback(editor.chain().focus());
        if (result && typeof result.run === 'function') result.run();
        syncToSource();
        updateToolbarState();
        return true;
      } catch (error) {
        console.warn(`approval tiptap command failed: ${commandName}`, error);
        return false;
      }
    }

    function applyBlock(value) {
      const blockValue = String(value || 'paragraph');
      return runChain('block', (chain) => {
        if (blockValue === 'heading1') return chain.toggleHeading({ level: 1 });
        if (blockValue === 'heading2') return chain.toggleHeading({ level: 2 });
        if (blockValue === 'heading3') return chain.toggleHeading({ level: 3 });
        return chain.setParagraph();
      });
    }

    async function applyLink() {
      if (!ensure()) return false;
      const currentHref = editor.getAttributes('link')?.href || 'https://';
      const nextHref = await askTextValue('링크 URL을 입력하세요.', {
        askText: options.askText,
        title: '링크',
        value: currentHref,
        placeholder: 'https://example.com',
        inputType: 'url',
        inputMode: 'url'
      });
      if (nextHref === null) return true;
      const href = String(nextHref || '').trim();
      if (!href) {
        return runChain('unsetLink', (chain) => chain.extendMarkRange('link').unsetLink());
      }
      return runChain('setLink', (chain) => chain.extendMarkRange('link').setLink({ href }));
    }

    async function insertTable() {
      const cols = await askTableSize('가로 칸 수를 입력하세요.', 3, 1, 12, {
        askText: options.askText,
        showMessage: options.showMessage
      });
      if (cols === null) return true;
      const rows = await askTableSize('세로 줄 수를 입력하세요.', 3, 1, 20, {
        askText: options.askText,
        showMessage: options.showMessage
      });
      if (rows === null) return true;
      return runChain('insertTable', (chain) => chain.insertTable({ rows, cols, withHeaderRow: true }));
    }

    async function runToolbarCommand(command) {
      switch (String(command || '')) {
        case 'bold':
          return runChain('bold', (chain) => chain.toggleBold());
        case 'italic':
          return runChain('italic', (chain) => chain.toggleItalic());
        case 'underline':
          return runChain('underline', (chain) => chain.toggleUnderline());
        case 'bulletList':
          return runChain('bulletList', (chain) => chain.toggleBulletList());
        case 'orderedList':
          return runChain('orderedList', (chain) => chain.toggleOrderedList());
        case 'blockquote':
          return runChain('blockquote', (chain) => chain.toggleBlockquote());
        case 'alignLeft':
          return runChain('alignLeft', (chain) => chain.setTextAlign('left'));
        case 'alignCenter':
          return runChain('alignCenter', (chain) => chain.setTextAlign('center'));
        case 'alignRight':
          return runChain('alignRight', (chain) => chain.setTextAlign('right'));
        case 'alignJustify':
          return runChain('alignJustify', (chain) => chain.setTextAlign('justify'));
        case 'link':
          return applyLink();
        case 'clean':
          return runChain('clean', (chain) => chain.unsetAllMarks().clearNodes());
        case 'insertTable':
          return await insertTable();
        case 'addRowAfter':
          return runChain('addRowAfter', (chain) => chain.addRowAfter());
        case 'deleteRow':
          return runChain('deleteRow', (chain) => chain.deleteRow());
        case 'addColumnAfter':
          return runChain('addColumnAfter', (chain) => chain.addColumnAfter());
        case 'deleteColumn':
          return runChain('deleteColumn', (chain) => chain.deleteColumn());
        case 'mergeCells':
          return runChain('mergeCells', (chain) => chain.mergeCells());
        case 'splitCell':
          return runChain('splitCell', (chain) => chain.splitCell());
        case 'deleteTable':
          return runChain('deleteTable', (chain) => chain.deleteTable());
        default:
          return false;
      }
    }

    function bindToolbarFallback() {
      if (toolbarFallbackBound) return;
      const toolbarEl = getToolbarElement();
      if (!toolbarEl) return;
      toolbarFallbackBound = true;

      toolbarEl.addEventListener('click', async (event) => {
        const target = event.target?.closest?.('[data-approval-editor-command]');
        if (!target || !toolbarEl.contains(target)) return;
        event.preventDefault();
        event.stopPropagation();
        const command = target.getAttribute('data-approval-editor-command');
        await runToolbarCommand(command);
      });

      toolbarEl.addEventListener('change', (event) => {
        const target = event.target?.closest?.('[data-approval-editor-select]');
        if (!target || !toolbarEl.contains(target)) return;
        if (target.getAttribute('data-approval-editor-select') === 'block') {
          applyBlock(target.value);
          event.preventDefault();
          event.stopPropagation();
        }
      });
    }

    function ensure() {
      if (editor) {
        bindToolbarFallback();
        return true;
      }
      if (!isTiptapReady()) return false;

      const editorEl = resolveElement(options.editor);
      if (!editorEl) return false;
      const source = getSourceElement();
      editorEl.innerHTML = '';

      editor = new tiptapModules.Editor({
        element: editorEl,
        extensions: buildExtensions(),
        content: buildHtmlFromSource(source?.value || ''),
        editorProps: {
          attributes: {
            class: 'approval-tiptap-content',
            'data-placeholder': getPlaceholder(),
            spellcheck: 'false'
          }
        },
        onUpdate: () => {
          if (syncing || !shouldSyncToSource()) return;
          syncToSource();
          updateToolbarState();
        },
        onSelectionUpdate: updateToolbarState,
        onFocus: updateToolbarState,
        onBlur: updateToolbarState
      });

      bindToolbarFallback();
      updateToolbarState();
      if (typeof options.onReady === 'function') options.onReady(editor);
      return true;
    }

    function syncToSource() {
      if (!ensure()) return false;
      const source = getSourceElement();
      if (!source) return false;
      source.value = normalizeHtml(editor.getHTML());
      return true;
    }

    function pasteHtml(rawHtml, source = 'silent') {
      if (!ensure()) return false;
      syncing = true;
      try {
        setEditorContent(editor, rawHtml, source !== 'silent');
      } finally {
        syncing = false;
      }
      if (source !== 'silent') syncToSource();
      updateToolbarState();
      return true;
    }

    function insertHtml(rawHtml) {
      if (!ensure()) return false;
      return runChain('insertHtml', (chain) => chain.insertContent(String(rawHtml || '')));
    }

    function syncFromSource() {
      if (!ensure()) return false;
      const source = getSourceElement();
      if (!source) return false;
      return pasteHtml(buildHtmlFromSource(source.value), 'silent');
    }

    function getEditor() {
      return ensure() ? editor : null;
    }

    function getRootHtml() {
      return getEditor()?.getHTML?.() || '';
    }

    function focus() {
      const instance = getEditor();
      if (instance && typeof instance.commands?.focus === 'function') instance.commands.focus();
    }

    function setPlaceholder() {
      const instance = getEditor();
      if (instance) instance.view?.dispatch?.(instance.state.tr);
    }

    return {
      ensure,
      focus,
      getEditor,
      getRootHtml,
      insertHtml,
      pasteHtml,
      setPlaceholder,
      syncFromSource,
      syncToSource
    };
  }

  window.ApprovalRichEditor = Object.freeze({
    createTiptapBridge,
    isTiptapReady,
    loadTiptapModules
  });
})();
