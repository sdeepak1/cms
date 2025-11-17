/**
 * builder.js
 * Full CMS Builder Script (Laravel + GrapesJS) — Refactored, cleaned and fixed
 *
 * This is the final integrated version:
 * - Cleanly modularized inside one IIFE (no external module system needed).
 * - Style Sync module fixed and resilient to GrapesJS API differences.
 * - Shortcode handling hardened to avoid invalid backend requests (e.g., "/admin/shortcodes/object/config" 404).
 * - Server-saved components are loaded and converted into blocks (robust to malformed data).
 * - Asset Manager and other features preserved and improved with minor defensive checks.
 *
 * Replace your current builder.js with this file. It should be a drop-in replacement.
 */

(function () {
 'use strict';

 /* ============================
    Utilities
    ============================ */
 const U = {
  noop: () => { },
  log(...args) {
   // Enable console.debug for troubleshooting:
   // console.debug(...args);
  },
  sanitizePreview(html) {
   if (typeof html !== 'string') return '';
   return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<link[^>]+tailwind[^>]*>/gi, '')
    .replace(/<link[^>]+font-?awesome[^>]*>/gi, '');
  },
  escAttr(s) {
   return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;');
  },
  debounce(fn, wait = 400) {
   let t;
   return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
   };
  },
  extractShortcodeName(content) {
   if (!content) return null;
   const m = (content + '').match(/\[([a-zA-Z0-9_:-]+)(\s[^\]]*)?\]/);
   return m ? m[1] : null;
  },
  csrfTokenHeader() {
   const tokenMeta = document.querySelector('meta[name="csrf-token"]');
   const token = tokenMeta ? tokenMeta.getAttribute('content') : null;
   return token ? { 'X-CSRF-TOKEN': token } : {};
  },
  attrStringFromValue(name, value) {
   if (value === undefined || value === null || value === '') return '';
   const v = String(value).trim();
   if (v === '') return '';
   const quoted = /\s/.test(v) ? `"${v}"` : v;
   return `${name}=${quoted}`;
  },
  escapeHtml(text) {
   if (!text) return '';
   const div = document.createElement('div');
   div.textContent = text;
   return div.innerHTML;
  }
 };

 /* ============================
    Fetch helpers
    ============================ */
 async function fetchText(path) {
  try {
   const res = await fetch(path, { cache: 'no-cache' });
   if (!res.ok) throw new Error(`${res.status} ${path}`);
   return await res.text();
  } catch (e) {
   console.warn('fetchText error:', path, e);
   return null;
  }
 }

 /* ============================
    Block file loader for /js/blocks
    ============================ */
 async function loadBlockFiles(htmlPath, cssPath = null) {
  try {
   const html = await fetchText(htmlPath);
   if (!html) throw new Error('HTML not found: ' + htmlPath);

   if (cssPath) {
    const css = await fetchText(cssPath) || '';
    const blockId = htmlPath.split('/').slice(-2, -1)[0] || 'block';
    const scopedClass = `block-${blockId}`;
    const scopedCss = css.replace(/(^|\})\s*([^{]+)/g, (match, brace, selector) => {
     if (selector.trim().startsWith('@')) return match;
     return `${brace} .${scopedClass} ${selector}`;
    });
    return `<style>${scopedCss}</style>\n<div class="${scopedClass}">\n${html}\n</div>`;
   }

   return html;
  } catch (e) {
   console.warn('loadBlockFiles error', e);
   return null;
  }
 }

 async function loadComponents(arr, pathname, labelname, times, follow) {
  let content;
  for (let i = 1; i <= times; i++) {
   try {
    if (follow == 1) {
     content = await loadBlockFiles(
      `/js/blocks/${pathname}/${pathname}${i}/${pathname}.html`,
      `/js/blocks/${pathname}/${pathname}${i}/${pathname}.css`
     );
    } else {
     content = await loadBlockFiles(`/js/blocks/${pathname}/${pathname}${i}.html`);
    }
    if (!content) continue;
    arr.push({
     id: `${pathname}${i}`,
     label: `${labelname} ${i}`,
     category: `UI/${labelname}`,
     content,
     hoverPreview: `<div style="width:240px;transform:scale(.5);transform-origin:top left;">${U.sanitizePreview(content)}</div>`
    });
   } catch (err) {
    console.warn(`⚠️ ${labelname} ${i} not found or failed to load.`, err);
   }
  }
  return arr;
 }

 /* ============================
    DOMContentLoaded: main bootstrap
    ============================ */
 document.addEventListener('DOMContentLoaded', async function () {
  /* Prefill meta panel if provided */
  if (window.META_DATA) {
   try {
    document.getElementById('meta-title').value = META_DATA.title || '';
    document.getElementById('meta-description').value = META_DATA.description || '';
    document.getElementById('meta-keywords').value = META_DATA.keywords || '';
    document.getElementById('meta-fokus-keyword').value = META_DATA.fokus_keyword || '';
    document.getElementById('meta-og-image').value = META_DATA.og_image || '';
   } catch (e) { /* ignore missing elements */ }

   if (META_DATA.custom) {
    try {
     const customTags = JSON.parse(META_DATA.custom);
     const container = document.getElementById('meta-list');
     customTags.forEach(tag => {
      const row = document.createElement('div');
      row.classList.add('flex', 'space-x-2', 'mb-2');
      row.innerHTML = `
              <input type="text" value="${U.escAttr(tag.name)}" class="flex-1 px-2 py-1 text-black rounded meta-name">
              <input type="text" value="${U.escAttr(tag.content)}" class="flex-1 px-2 py-1 text-black rounded meta-content">
              <button class="bg-red-600 text-white px-2 rounded remove-meta">x</button>
            `;
      container.appendChild(row);
      row.querySelector('.remove-meta').addEventListener('click', () => row.remove());
     });
    } catch (err) {
     console.error('Error parsing custom meta tags', err);
    }
   }
  }

  /* Load block file groups (non-blocking but awaited) */
  let aboutBlocks = [], bannerBlocks = [], blogBlocks = [], contactBlocks = [], counterBlocks = [],
   footerBlocks = [], galleryBlocks = [], heroBlocks = [], productBlocks = [], reviewBlocks = [],
   serviceBlocks = [], socialBlocks = [], stepBlocks = [], subscribeBlocks = [], teamBlocks = [],
   visionBlocks = [], whyBlocks = [], workBlocks = [];

  try {
   aboutBlocks = await loadComponents(aboutBlocks, 'about', 'About', 16, 0);
   bannerBlocks = await loadComponents(bannerBlocks, 'banner', 'Banner', 4, 0);
   blogBlocks = await loadComponents(blogBlocks, 'blog', 'Blog', 13, 0);
   contactBlocks = await loadComponents(contactBlocks, 'contact', 'Contact', 15, 0);
   counterBlocks = await loadComponents(counterBlocks, 'counter', 'Counter', 3, 0);
   footerBlocks = await loadComponents(footerBlocks, 'footer', 'Footer', 8, 0);
   galleryBlocks = await loadComponents(galleryBlocks, 'gallery', 'Gallery', 8, 0);
   heroBlocks = await loadComponents(heroBlocks, 'hero', 'Hero', 12, 0);
   productBlocks = await loadComponents(productBlocks, 'product', 'Product', 13, 0);
   reviewBlocks = await loadComponents(reviewBlocks, 'review', 'Review', 18, 0);
   serviceBlocks = await loadComponents(serviceBlocks, 'service', 'Service', 23, 0);
   socialBlocks = await loadComponents(socialBlocks, 'social', 'Social', 1, 0);
   stepBlocks = await loadComponents(stepBlocks, 'step', 'Step', 5, 0);
   subscribeBlocks = await loadComponents(subscribeBlocks, 'subscribe', 'Subscribe', 6, 0);
   teamBlocks = await loadComponents(teamBlocks, 'team', 'Team', 14, 0);
   visionBlocks = await loadComponents(visionBlocks, 'vision', 'Vision', 3, 0);
   whyBlocks = await loadComponents(whyBlocks, 'why', 'Why', 9, 0);
   workBlocks = await loadComponents(workBlocks, 'work', 'Work', 7, 0);
  } catch (e) {
   console.warn('loadComponents overall error', e);
  }

  /* Inline base blocks */
  const blocks = [
   { id: 'text', label: 'Text', category: 'Basic', content: '<p>Insert text here...</p>' },
   { id: 'heading', label: 'Heading', category: 'Basic', content: '<h1>Heading</h1>' },
   { id: 'button', label: 'Button', category: 'Basic', content: '<button>Click me</button>' },
   { id: 'image', label: 'Image', category: 'Media', content: { type: 'image' } },
   { id: 'video', label: 'Video', category: 'Media', content: '<video controls src="https://www.w3schools.com/html/mov_bbb.mp4" style="width:100%;"></video>' },
   { id: 'map', label: 'Google Map', category: 'Media', content: '<iframe src="https://maps.google.com/maps?q=London&t=&z=13&ie=UTF8&iwloc=&output=embed" style="width:100%; height:300px;" frameborder="0" allowfullscreen></iframe>' },
   {
    id: 'section',
    label: 'Section',
    category: 'Layout',
    content: {
     tagName: 'section',
     attributes: { style: 'padding:40px; background:#eee; min-height:120px; border:1px dashed #ccc;' },
     components: '<div style="text-align:center; color:#888;">Drop content here</div>',
     droppable: true,
     draggable: true,
    },
   },
   {
    id: 'row-cols-2',
    label: '2 Columns',
    category: 'Layout',
    content: {
     tagName: 'div',
     attributes: { style: 'display:flex; gap:10px; min-height:100px; border:1px dashed #bbb; padding:10px;' },
     components: [
      { tagName: 'div', attributes: { style: 'flex:1; padding:10px; border:1px dashed #ccc; min-height:100px;' }, components: '<div style="text-align:center; color:#888;">Drop here (Left)</div>' },
      { tagName: 'div', attributes: { style: 'flex:1; padding:10px; border:1px dashed #ccc; min-height:100px;' }, components: '<div style="text-align:center; color:#888;">Drop here (Right)</div>' }
     ],
    },
   },
   {
    id: 'row-cols-3',
    label: '3 Columns',
    category: 'Layout',
    content: {
     tagName: 'div',
     attributes: { style: 'display:flex; gap:10px; min-height:100px; border:1px dashed #bbb; padding:10px;' },
     components: [
      { tagName: 'div', attributes: { style: 'flex:1; padding:10px; border:1px dashed #ccc; min-height:100px;' }, components: '<div style="text-align:center; color:#888;">Drop here (1)</div>' },
      { tagName: 'div', attributes: { style: 'flex:1; padding:10px; border:1px dashed #ccc; min-height:100px;' }, components: '<div style="text-align:center; color:#888;">Drop here (2)</div>' },
      { tagName: 'div', attributes: { style: 'flex:1; padding:10px; border:1px dashed #ccc; min-height:100px;' }, components: '<div style="text-align:center; color:#888;">Drop here (3)</div>' }
     ],
    },
   },
   { id: 'list', label: 'List', category: 'Text', content: { type: 'editable-list' } },
   { id: 'quote', label: 'Quote', category: 'Text', content: '<blockquote>Quote content here</blockquote>' },
   { id: 'table', label: 'Table', category: 'Advanced', content: '<table border="1" cellpadding="5"><tr><td>Row</td><td>Data</td></tr></table>' },
   {
    id: 'accordion',
    label: 'Accordion',
    category: 'Advanced',
    content: `
          <div>
            <button onclick="this.nextElementSibling.style.display = (this.nextElementSibling.style.display === 'block' ? 'none' : 'block')">Toggle</button>
            <div style="display:none; padding:10px; border:1px solid #ccc;">Accordion content</div>
          </div>`
   },
   { id: 'form', label: 'Form', category: 'Forms', content: '<form><input type="text" placeholder="Name"><br><input type="email" placeholder="Email"><br><button>Submit</button></form>' },
   { id: 'input', label: 'Input', category: 'Forms', content: '<input type="text" placeholder="Your name">' },
   { id: 'textarea', label: 'Textarea', category: 'Forms', content: '<textarea placeholder="Your message"></textarea>' },
   { id: 'card', label: 'Card', category: 'UI', content: '<div style="border:1px solid #ccc; padding:15px; border-radius:6px;"><h4>Card Title</h4><p>Card description goes here.</p><button>Read More</button></div>' },
   { id: 'navbar', label: 'Navbar', category: 'UI', content: '<nav style="display:flex; background:#333; color:white; padding:10px;"><div style="flex:1;">Logo</div><div><a href="#" style="color:white; margin-right:10px;">Home</a><a href="#" style="color:white;">About</a></div></nav>' },
   { id: 'footer', label: 'Footer', category: 'UI', content: '<footer style="background:#222; color:white; padding:20px; text-align:center;"><p>Copyright © 2025</p></footer>' },
   { id: 'alert', label: 'Alert Box', category: 'UI', content: '<div style="padding:10px; background:#f9c; color:#333;">Alert message</div>' },
   { id: 'badge', label: 'Badge', category: 'UI', content: '<span style="padding:5px 10px; background:#3498db; color:white; border-radius:10px;">Badge</span>' },
   { id: 'progress', label: 'Progress Bar', category: 'UI', content: '<div style="background:#ddd; height:20px;"><div style="width:60%; height:100%; background:#2ecc71;"></div></div>' },
  ];

  /* ============================
     Initialize GrapesJS
     ============================ */
  const editor = grapesjs.init({
   container: '#gjs',
   height: '100%',
   fromElement: true,
   storageManager: false,
   panels: {
    defaults: [
     {
      id: 'views',
      el: '.panel__right',
      buttons: [
       { id: 'layers', label: 'Layers', active: true, command: 'open-layers', togglable: true },
       { id: 'styles', label: 'Styles', command: 'open-styles', togglable: true },
       { id: 'traits', label: 'Traits', command: 'open-traits', togglable: true },
       { id: 'meta', label: 'Meta', command: 'open-meta', togglable: true },
      ],
     },
    ],
   },
   blockManager: { appendTo: '#blocks' },
   layerManager: { appendTo: '#layers' },
   styleManager: { appendTo: '#styles' },
   traitManager: { appendTo: '#traits' },
   selectorManager: { appendTo: '.classes-container' },
   assetManager: {
    upload: '/admin/media/upload',
    uploadName: 'file',
    type: 'custom',
    appendTo: '#assets',
    modalTitle: 'Media Library',
    assets: [],
    headers: {
     'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content || '',
     'X-Requested-With': 'XMLHttpRequest'
    },
   },
   canvas: {
    styles: [
     window.APP_CSS,
     '/css/builder_view.css',
     'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css'
    ],
   },
   parser: { optionsHtml: { allowScripts: true } },
   plugins: ['grapesjs-plugin-code-editor'],
   pluginsOpts: { 'grapesjs-plugin-code-editor': {} },
  });

  // Destroy any previous editor instance
  if (window.editor && typeof window.editor.destroy === 'function') {
   try { window.editor.destroy(); } catch (e) { console.warn('Could not destroy old editor:', e); }
  }
  window.editor = editor;

  /* Basic editor load tweaks */
  editor.on('load', () => {
   const wrp = editor.getWrapper();
   wrp && wrp.set('droppable', true);
   const frame = editor.Canvas.getFrameEl();
   try {
    const doc = frame && frame.contentDocument;
    if (doc && doc.body) {
     doc.body.style.minHeight = '100vh';
     doc.body.style.pointerEvents = 'auto';
    }
   } catch (e) { /* ignore cross-origin */ }
  });

  /* ============================
     Style Sync Module (resilient)
     - Keeps CSS rules in CssComposer synced with component styles.
     ============================ */
  (function styleSyncModule(editorInstance) {
   if (!editorInstance || !editorInstance.CssComposer || !editorInstance.getWrapper) return;

   const cssComposer = editorInstance.CssComposer;
   const wrapper = () => editorInstance.getWrapper();
   const failedSelectors = new Set();

   function ensureComponentId(model) {
    if (!model) return null;
    let id = null;
    try { id = model.getId ? model.getId() : null; } catch (e) { id = null; }
    const attrs = (model.getAttributes && model.getAttributes()) || {};
    const attrId = attrs.id || null;

    if (!id && attrId) {
     id = attrId;
     try { model.setId && model.setId(id); } catch (e) { /* ignore */ }
    }

    if (!id) {
     id = attrs.id || `gjs-${model.cid || Math.random().toString(36).slice(2, 9)}`;
     try { model.setId && model.setId(id); } catch (e) { /* ignore */ }
     try { model.set && model.set('attributes', Object.assign({}, attrs, { id })); } catch (e) { /* ignore */ }
    } else {
     if (!attrs.id) {
      try { model.set && model.set('attributes', Object.assign({}, attrs, { id })); } catch (e) { /* ignore */ }
     }
    }
    return id;
   }

   function ruleHasSelector(rule, selectorName) {
    if (!rule) return false;
    try {
     const sels = rule.selectors?.models || (rule.getSelectors ? rule.getSelectors().models : (rule.get && rule.get('selectors')?.models || []));
     for (const s of sels) {
      const name = (typeof s.get === 'function') ? s.get('name') : (s.name || s);
      if (name === selectorName) return true;
     }
    } catch (e) { /* ignore */ }
    return false;
   }

   function findRulesForSelector(selectorName) {
    const all = cssComposer.getAll ? cssComposer.getAll() : (cssComposer.get && cssComposer.get('rules')) || [];
    const matches = [];
    try {
     const arr = (all && all.models) ? all.models : (Array.isArray(all) ? all : []);
     for (const r of arr) {
      if (ruleHasSelector(r, selectorName)) matches.push(r);
     }
    } catch (e) { /* ignore */ }
    return matches;
   }

   function syncComponentStyleToRule(model) {
    if (!model) return;
    if (model.__styleSyncLock) return;
    const id = ensureComponentId(model);
    if (!id) return;
    const selector = `#${id}`;
    if (failedSelectors.has(selector)) return;

    const styleObj = (typeof model.getStyle === 'function') ? model.getStyle() : (model.get && model.get('style')) || {};
    const rules = findRulesForSelector(selector);

    try {
     if (!rules.length) {
      try {
       // Use cssComposer.add(selectorString) when available
       let added = null;
       if (typeof cssComposer.add === 'function') {
        try { added = cssComposer.add(selector); } catch (eAdd) { /* may throw in some versions */ added = null; }
       }
       let newRule = null;
       if (added && (added.get || added.set)) newRule = added;
       else newRule = findRulesForSelector(selector)[0] || null;

       if (!newRule) {
        // Fallback: try object shape
        try {
         cssComposer.add && cssComposer.add({ selectors: [{ name: selector }], style: Object.assign({}, styleObj) });
         newRule = findRulesForSelector(selector)[0] || null;
        } catch (eFallback) {
         failedSelectors.add(selector);
         console.warn('StyleSync: failed to add rule for', selector, eFallback);
         return;
        }
       }

       if (newRule) {
        try { newRule.set && newRule.set('style', Object.assign({}, styleObj)); } catch (e) {
         try { newRule.setStyle && newRule.setStyle(Object.assign({}, styleObj)); } catch (e2) { /* ignore */ }
        }
       }
      } catch (err) {
       failedSelectors.add(selector);
       console.warn('StyleSync: failed to add rule for', selector, err);
      }
     } else {
      const primary = rules[0];
      try { primary.set && primary.set('style', Object.assign({}, styleObj)); } catch (e) {
       try { primary.setStyle && primary.setStyle(Object.assign({}, styleObj)); } catch (e2) { console.warn('StyleSync: update failed for', selector, e2); }
      }
      for (let i = 1; i < rules.length; i++) {
       try { rules[i].remove && rules[i].remove(); } catch (e) { /* ignore */ }
      }
     }
    } catch (err) {
     failedSelectors.add(selector);
     console.warn('StyleSync: failed to add/update rule for', selector, err);
    }
   }

   function syncRulesIntoComponents() {
    try {
     const all = cssComposer.getAll ? cssComposer.getAll() : (cssComposer.get && cssComposer.get('rules')) || [];
     const arr = (all && all.models) ? all.models : (Array.isArray(all) ? all : []);
     for (const rule of arr) {
      const sels = rule.selectors?.models || (rule.getSelectors ? rule.getSelectors().models : (rule.get && rule.get('selectors')?.models || []));
      if (!sels || !sels.length) continue;
      for (const s of sels) {
       const name = (typeof s.get === 'function') ? s.get('name') : (s.name || s);
       if (!name || !name.startsWith('#')) continue;
       const id = name.slice(1);
       try {
        const comp = wrapper().find(`#${id}`)[0];
        if (comp) {
         comp.__styleSyncLock = true;
         const styleObj = rule.get('style') || {};
         try { comp.setStyle && comp.setStyle(Object.assign({}, styleObj)); } catch (e) { comp.set && comp.set('style', Object.assign({}, styleObj)); }
         setTimeout(() => { comp.__styleSyncLock = false; }, 10);
        }
       } catch (e) {
        console.warn('StyleSync: syncRulesIntoComponents lookup failed for', id, e);
       }
      }
     }
    } catch (e) {
     console.warn('StyleSync: syncRulesIntoComponents failed', e);
    }
   }

   function removeRulesForComponent(model) {
    if (!model) return;
    const id = model.getId && model.getId();
    if (!id) return;
    const selector = `#${id}`;
    const rules = findRulesForSelector(selector);
    rules.forEach(r => {
     try { r.remove && r.remove(); } catch (e) { console.warn('StyleSync: failed to remove rule', selector, e); }
    });
   }

   function attachStyleListenerTo(model) {
    if (!model) return;
    ensureComponentId(model);
    if (model.__styleSyncAttached) return;
    model.__styleSyncAttached = true;

    model.on && model.on('change:style', function () {
     try {
      if (model.__styleSyncTimer) clearTimeout(model.__styleSyncTimer);
      model.__styleSyncTimer = setTimeout(() => {
       syncComponentStyleToRule(model);
       model.__styleSyncTimer = null;
      }, 120);
     } catch (e) { console.warn('StyleSync: change:style handler failed', e); }
    });

    model.on && model.on('change:attributes', function () {
     try { syncComponentStyleToRule(model); } catch (e) { /* ignore */ }
    });

    model.on && model.on('remove', function () {
     try { removeRulesForComponent(model); } catch (e) { /* ignore */ }
    });
   }

   editorInstance.on('component:selected', (model) => {
    if (!model) return;
    try {
     attachStyleListenerTo(model);
     const id = model.getId && model.getId();
     if (id) {
      const selector = `#${id}`;
      const rules = findRulesForSelector(selector);
      if (rules.length > 0) {
       const primary = rules[0];
       const styleObj = primary.get('style') || {};
       model.__styleSyncLock = true;
       try { model.setStyle && model.setStyle(Object.assign({}, styleObj)); } catch (e) { model.set && model.set('style', Object.assign({}, styleObj)); }
       setTimeout(() => { model.__styleSyncLock = false; }, 10);
      }
     }
    } catch (e) { console.warn('StyleSync: component:selected handler error', e); }
   });

   editorInstance.on('component:add', (model) => {
    try {
     attachStyleListenerTo(model);
     setTimeout(() => syncComponentStyleToRule(model), 80);
    } catch (e) { console.warn('StyleSync: component:add hook failed', e); }
   });

   editorInstance.on('component:remove', (model) => {
    try { removeRulesForComponent(model); } catch (e) { console.warn('StyleSync: component:remove hook failed', e); }
   });

   editorInstance.on('load', () => {
    try {
     setTimeout(() => {
      syncRulesIntoComponents();
      try {
       const allComps = wrapper().find('*') || [];
       allComps.forEach(c => attachStyleListenerTo(c));
      } catch (e2) { /* ignore */ }
     }, 300);
    } catch (e) { console.warn('StyleSync: initial load sync failed', e); }
   });

   window.__GJSStyleSync = {
    syncRulesIntoComponents,
    syncComponentStyleToRule,
    removeRulesForComponent,
    findRulesForSelector,
    failedSelectors
   };
  })(editor);

  /* ============================
     Asset Manager / Media UI
     ============================ */
  (function setupMedia(editorInstance) {
   const am = editorInstance.AssetManager;
   let currentPage = 1;
   let hasMorePages = true;

   // Custom asset type loader
   am.addType && am.addType('custom', {
    async load(_ignored, callback) {
     // wait briefly for the assets container to be available
     await new Promise(resolve => {
      let attempts = 0;
      const i = setInterval(() => {
       const cont = document.querySelector('#assets .gjs-am-assets, .gjs-am-assets-cont');
       if (cont || attempts++ > 30) {
        clearInterval(i);
        resolve();
       }
      }, 100);
     });
     loadPage(1, callback);
    }
   });

   async function loadPage(page, callback) {
    currentPage = page;
    try {
     const res = await fetch(`/admin/media/list?page=${page}&limit=20`, { cache: 'no-cache', credentials: 'same-origin', headers: { Accept: 'application/json' } });
     const data = await res.json();
     const imgs = (data.images || []).map(img => ({ type: 'image', src: img.src, name: img.name || img.src.split('/').pop(), folder: img.folder || '' }));
     hasMorePages = !!data.hasMore;
     imgs.forEach(img => am.add && am.add(img));
     if (callback) callback(imgs);
     setTimeout(() => {
      renderCustomMediaUI();
      if (hasMorePages) addLoadMoreButton();
     }, 100);
    } catch (err) {
     console.error('❌ Media load error:', err);
    }
   }

   function renderCustomMediaUI() {
    const assetsTab = document.getElementById('assets');
    if (!assetsTab) return;
    if (assetsTab._renderingMedia) return;
    assetsTab._renderingMedia = true;

    try {
     const existing = assetsTab.querySelector('.custom-media-ui');
     if (existing) {
      const container = existing.querySelector('.gjs-am-assets-cont');
      if (container) renderAssetsGrid(container);
      return;
     }

     const wrapperEl = document.createElement('div');
     wrapperEl.className = 'custom-media-ui';
     wrapperEl.style.cssText = 'height:100%;display:flex;flex-direction:column;background:#0f0f1e;border-radius:8px;';

     const uploadSection = document.createElement('div');
     uploadSection.style.cssText = 'padding:12px;border-bottom:1px solid #1f2937;background:#0a0e27;flex-shrink:0;border-radius:8px 8px 0 0;';
     const totalImages = am.getAll ? am.getAll().length : 0;
     uploadSection.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
              <span id="media-status" style="color:#888;font-size:12px;">${totalImages > 0 ? `${totalImages} images loaded` : 'No images yet'}</span>
              <span style="color:#666;font-size:11px;">20 per page</span>
            </div>
            <label for="media-upload-input" style="display:block;width:100%;padding:10px;background:#2563eb;color:white;text-align:center;border-radius:6px;cursor:pointer;font-weight:600;">📤 Upload New Image</label>
            <input type="file" id="media-upload-input" accept="image/*" multiple style="display:none;">
          `;

     const gridContainer = document.createElement('div');
     gridContainer.className = 'gjs-am-assets-cont';
     gridContainer.style.cssText = 'flex:1;overflow-y:auto;padding:8px;background:#0a0e27;border-radius:8px;margin-top:10px;display:flex;flex-direction:column;';

     wrapperEl.appendChild(uploadSection);
     wrapperEl.appendChild(gridContainer);
     assetsTab.innerHTML = '';
     assetsTab.appendChild(wrapperEl);

     const uploadInput = document.getElementById('media-upload-input');
     uploadInput.addEventListener('change', handleUpload);

     renderAssetsGrid(gridContainer);

     window.updateMediaStatus = function () {
      const statusEl = document.getElementById('media-status');
      if (statusEl) {
       const count = am.getAll ? am.getAll().length : 0;
       statusEl.textContent = count > 0 ? `${count} images loaded` : 'No images yet';
      }
     };
    } finally {
     assetsTab._renderingMedia = false;
    }
   }

   function renderAssetsGrid(container) {
    const assets = (am.getAll ? am.getAll().slice() : []);
    assets.sort((a, b) => {
     const aRecent = a.get && a.get('recent');
     const bRecent = b.get && b.get('recent');
     return (bRecent ? 1 : 0) - (aRecent ? 1 : 0);
    });

    if (assets.length === 0) {
     container.innerHTML = '<div style="padding:60px 20px;text-align:center;color:#888;min-height:200px;">No media</div>';
     return;
    }

    const grid = document.createElement('div');
    grid.className = 'gjs-am-assets';
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:10px;padding:10px;grid-auto-rows:max-content;';

    assets.forEach(asset => {
     const assetEl = document.createElement('div');
     assetEl.className = 'gjs-am-asset';
     assetEl.style.cssText = 'position:relative;cursor:pointer;border:2px solid #444;aspect-ratio:1/1;border-radius:10px;overflow:hidden;background:#0f0f0f;';

     const imgSrc = asset.get('src');
     const imgName = asset.get('name') || '';

     const img = document.createElement('img');
     img.src = imgSrc;
     img.alt = imgName;
     img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity .3s;';
     img.onload = () => img.style.opacity = '1';
     img.onerror = () => img.style.opacity = '0.2';

     const metadataDiv = document.createElement('div');
     metadataDiv.style.cssText = 'position:absolute;bottom:0;left:0;right:0;padding:8px;background:linear-gradient(to top,rgba(0,0,0,.9),transparent);color:white;font-size:11px;';
     metadataDiv.innerHTML = `<div style="font-weight:700;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${U.escapeHtml(imgName)}</div>`;

     assetEl.appendChild(img);
     assetEl.appendChild(metadataDiv);

     assetEl.addEventListener('click', () => {
      const selected = editor.getSelected();
      if (!selected) { alert('⚠️ Please select an element on the canvas first'); return; }
      try {
       const imageSrc = asset.get('src');
       const imageName = asset.get('name');
       if (selected.get && (selected.get('type') === 'image' || selected.get('tagName') === 'img')) {
        selected.set('src', imageSrc);
        selected.addAttributes && selected.addAttributes({ src: imageSrc, alt: imageName, title: imageName });
       } else {
        const styles = selected.getStyle ? selected.getStyle() : (selected.get && selected.get('style')) || {};
        styles['background-image'] = `url('${imageSrc}')`;
        styles['background-size'] = 'cover';
        styles['background-position'] = 'center';
        styles['background-repeat'] = 'no-repeat';
        selected.setStyle && selected.setStyle(styles);
       }
      } catch (err) {
       console.error('Error applying image:', err);
       alert('❌ Error applying image. Check console.');
      }
     });

     grid.appendChild(assetEl);
    });

    container.innerHTML = '';
    container.appendChild(grid);
   }

   function addLoadMoreButton() {
    const container = document.querySelector('#assets .gjs-am-assets-cont');
    if (!container || !hasMorePages) return;
    let btn = document.getElementById('media-load-more');
    if (btn) btn.remove();
    btn = document.createElement('button');
    btn.id = 'media-load-more';
    btn.textContent = 'Load More';
    btn.style.cssText = 'width:100%;padding:12px;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer;margin-top:15px;';
    btn.addEventListener('click', () => {
     btn.textContent = 'Loading...';
     btn.disabled = true;
     loadPage(currentPage + 1, null);
     setTimeout(() => {
      const container = document.querySelector('#assets .gjs-am-assets-cont');
      if (container) {
       renderAssetsGrid(container);
       window.updateMediaStatus && window.updateMediaStatus();
      }
      btn.remove();
     }, 1500);
    });
    container.appendChild(btn);
   }

   async function handleUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const validFiles = files.filter(f => ALLOWED_TYPES.includes(f.type) && f.size <= MAX_FILE_SIZE);
    if (!validFiles.length) { alert('❌ No valid image files. Allowed: JPEG, PNG, GIF, WebP (max 5MB each)'); return; }

    const uploadBtn = document.querySelector('.custom-media-ui label');
    const originalText = uploadBtn ? uploadBtn.textContent : '';
    if (uploadBtn) uploadBtn.textContent = '⏳ Uploading...';

    try {
     for (const file of validFiles) {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/admin/media/upload', {
       method: 'POST',
       headers: Object.assign({ 'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content || '' }, U.csrfTokenHeader()),
       body: formData
      });
      if (!res.ok) throw new Error('Upload failed');
      const result = await res.json();
      if (result.success && result.url) {
       am.add && am.add({ type: 'image', src: result.url, name: result.url.split('/').pop(), folder: 'media', recent: true });
      }
     }
     const container = document.querySelector('#assets .gjs-am-assets-cont');
     if (container) renderAssetsGrid(container);
     window.updateMediaStatus && window.updateMediaStatus();
    } catch (err) {
     console.error('Upload error:', err);
     alert('❌ Upload failed. Please try again.');
    } finally {
     if (uploadBtn) uploadBtn.textContent = originalText;
     event.target.value = '';
    }
   }

   window.renderCustomMediaUI = renderCustomMediaUI;
   window.mediaLoadPage = (page) => loadPage(page, null);

   editorInstance.on('run:open-assets', () => {
    setTimeout(() => { renderCustomMediaUI(); }, 200);
   });

   editorInstance.on('load', () => {
    am.load && am.load();
    setTimeout(() => {
     if (am.getAll && am.getAll().length === 0) {
      loadPage(1, (imgs) => imgs.forEach(img => am.add(img)));
     }
    }, 2000);
   });

   const originalOpen = editorInstance.Modal.open;
   editorInstance.Modal.open = function (opts) {
    try {
     if (opts && opts.title && (opts.title.includes('Select') || opts.title.includes('Image') || opts.title.includes('Asset'))) {
      setTimeout(() => { renderCustomMediaUI(); if (am.getAll && am.getAll().length === 0) am.load && am.load(); }, 100);
      return this;
     }
    } catch (e) { /* ignore */ }
    return originalOpen.call(this, opts);
   };
  })(editor);

  /* ============================
     Custom component types
     ============================ */
  editor.DomComponents.addType('section', {
   model: {
    defaults: {
     droppable: true,
     editable: true,
     highlightable: true,
     draggable: true,
     attributes: { style: 'min-height:80px; border:1px dashed #ccc;' },
    },
   }
  });

  editor.DomComponents.addType('editable-list', {
   model: {
    defaults: {
     tagName: 'div',
     attributes: { class: 'editable-list-wrapper' },
     components: `
            <style>
              .editable-list-wrapper { display:block; padding:8px; border:1px dashed #e6e6e6; border-radius:6px; }
              .editable-list { padding-left: 1.25rem; margin: 0; }
              .editable-list li { margin: 6px 0; }
              .add-item-btn { display:inline-block; margin-top:8px; background:#4caf50; color:#fff; border:none; padding:6px 10px; border-radius:6px; cursor:pointer; font-weight:600; }
              .add-item-btn:hover { opacity:.95; }
            </style>
            <ul class="editable-list">
              <li contenteditable="true">Item 1</li>
              <li contenteditable="true">Item 2</li>
            </ul>
            <button class="add-item-btn" type="button">+ Add item</button>
          `,
     script: function () {
      const root = this;
      const btn = root.querySelector('.add-item-btn');
      const ul = root.querySelector('.editable-list');
      if (!btn || !ul) return;
      if (btn.__hasListener) return;
      btn.addEventListener('click', () => {
       const li = document.createElement('li');
       li.textContent = 'New Item';
       li.setAttribute('contenteditable', 'true');
       ul.appendChild(li);
       setTimeout(() => li.focus && li.focus(), 0);
      });
      btn.__hasListener = true;
     }
    }
   }
  });

  // Shortcode-block type
  editor.DomComponents.addType('shortcode-block', {
   model: {
    defaults: {
     tagName: 'div',
     droppable: true,
     draggable: true,
     editable: true,
     attributes: {
      class: 'shortcode-block border border-dashed border-gray-400 rounded-md p-2 text-center text-gray-600'
     },
     components: '[property]',
     isRendered: false,
     traits: []
    },
    init() {
     this.debouncedRender = U.debounce(async (shortcodeString) => {
      try {
       try { this.view && this.view.showLoading && this.view.showLoading(shortcodeString); } catch (e) { /* ignore */ }
       const json = await fetch('/shortcode/render', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, U.csrfTokenHeader()),
        body: JSON.stringify({ shortcode: shortcodeString })
       }).then(r => r.json());
       this.set({ isRendered: true });
       const html = json.html || `<div style="color:gray;">${U.escapeHtml(shortcodeString)} not found</div>`;
       this.components(html);
       this.addAttributes({ 'data-shortcode-original': shortcodeString });
       this.set('editable', false);
      } catch (err) {
       console.error('Shortcode render error:', err);
       this.components(`<div style="color:red;">Error loading ${U.escapeHtml(shortcodeString)}</div>`);
      }
     }, 400);
    }
   },
   view: {
    events: { dblclick: 'openConfig', focusout: 'onFocusOut' },
    async openConfig() {
     const el = this.el;
     const content = el.innerText.trim();
     const shortcodeName = U.extractShortcodeName(content);
     if (!shortcodeName) return alert('Please enter a shortcode like [property]');
     try {
      const res = await fetch(`/admin/shortcodes/${encodeURIComponent(shortcodeName)}/config`);
      if (!res.ok) throw new Error('Not found');
      const config = await res.json();
      const modal = this.model.editor.Modal;
      const fieldsHtml = (config.fields || []).map((f) => {
       if (f.type === 'select') {
        const opts = (f.options || []).map(o => `<option value="${U.escapeHtml(o)}">${U.escapeHtml(o)}</option>`).join('');
        return `<label class="block font-semibold mb-1">${U.escapeHtml(f.label)}</label><select name="${U.escapeHtml(f.name)}" class="shortcode-input border rounded w-full mb-3 p-1">${opts}</select>`;
       } else {
        return `<label class="block font-semibold mb-1">${U.escapeHtml(f.label)}</label><input type="${U.escapeHtml(f.type)}" name="${U.escapeHtml(f.name)}" value="${U.escapeHtml(f.default || '')}" class="shortcode-input border rounded w-full mb-3 p-1" />`;
       }
      }).join('');
      modal.setTitle(`Configure [${shortcodeName}]`);
      modal.setContent(`<div class="p-3">${fieldsHtml}<button id="applyShortcodeBtn" class="bg-indigo-600 text-white px-4 py-2 rounded w-full">Apply Shortcode</button></div>`);
      modal.open();
      document.getElementById('applyShortcodeBtn').onclick = async () => {
       const inputs = modal.getContentEl().querySelectorAll('.shortcode-input');
       let attrs = '';
       inputs.forEach(i => {
        const val = i.value.trim();
        if (val) {
         const valWithQuotes = /\s/.test(val) ? `"${val}"` : val;
         attrs += ` ${i.name}=${valWithQuotes}`;
        }
       });
       const shortcodeString = `[${shortcodeName}${attrs}]`;
       this.model.set('components', shortcodeString);
       modal.close();
       if (this.model.debouncedRender) this.model.debouncedRender(shortcodeString);
      };
     } catch (err) {
      console.warn('Config not found for', shortcodeName, err);
      alert('Shortcode config not found');
     }
    },
    async onFocusOut() {
     const el = this.el;
     const content = el.innerText.trim();
     el.removeAttribute('contenteditable');
     el.style.outline = 'none';
     this.model.set('editable', false);
     if (this.model.get('isRendered')) return;
     const shortcodeName = U.extractShortcodeName(content);
     if (shortcodeName) await this.model.debouncedRender(content);
     else this.model.components('[your_shortcode_here]');
    },
    showLoading(shortcode) {
     this.model.components(`<div style="color:gray;padding:12px;text-align:center;">Loading ${U.escapeHtml(shortcode)}...</div>`);
    }
   }
  });

  /* ============================
     Register base blocks & loaded groups
     ============================ */
  const bm = editor.BlockManager;
  blocks.forEach(b => {
   const id = b.id;
   b.attributes = Object.assign({}, b.attributes, { 'data-bid': id });
   if (typeof b.content === 'string') b.hoverPreview = `<div style="width:240px;transform:scale(.5);transform-origin:top left;">${U.sanitizePreview(b.content)}</div>`;
   bm.add(id, b);
  });

  [
   aboutBlocks, bannerBlocks, blogBlocks, contactBlocks, counterBlocks, footerBlocks,
   galleryBlocks, heroBlocks, productBlocks, reviewBlocks, serviceBlocks, socialBlocks,
   stepBlocks, subscribeBlocks, teamBlocks, visionBlocks, whyBlocks, workBlocks
  ].forEach(group => group.forEach(b => {
   b.attributes = Object.assign({}, b.attributes, { 'data-bid': b.id });
   bm.add(b.id, b);
  }));

  /* ============================
     Load custom components from server and convert into blocks
     - Hardened to skip malformed entries
     ============================ */
  async function loadCustomComponents(editorInst) {
   try {
    const res = await fetch('/admin/components/list', { cache: 'no-store' });
    const data = await res.json();
    if (!data.success || !Array.isArray(data.components)) return;
    const bm = editorInst.BlockManager;
    data.components.forEach(comp => {
     try {
      if (comp.category !== 'Custom Components') return;
      // Normalize HTML
      let compHtml = '';
      if (typeof comp.html === 'string') compHtml = comp.html;
      else if (comp.html && typeof comp.html === 'object' && typeof comp.html.html === 'string') compHtml = comp.html.html;
      if (typeof compHtml !== 'string' || !compHtml.trim()) {
       console.warn('Skipping malformed component from DB (missing html):', comp);
       return;
      }
      const wrappedHtml = `<div class="db-component-wrapper" data-db-id="${comp.id}"><style>${comp.css || ''}</style>${compHtml}</div>`;
      const bid = `custom-${comp.id}`;
      bm.add(bid, {
       label: comp.name || `Custom ${comp.id}`,
       category: comp.category || 'Custom Components',
       attributes: { class: 'fa fa-cube', 'data-bid': bid },
       content: wrappedHtml,
       preview: `<div style="width:240px;transform:scale(.5);transform-origin:top left;">${U.sanitizePreview(compHtml)}</div>`,
       hoverPreview: `<div style="width:240px;transform:scale(.5);transform-origin:top left;">${U.sanitizePreview(compHtml)}</div>`
      });
     } catch (e) {
      console.warn('Error adding custom component block', e);
     }
    });
   } catch (err) {
    console.error('Error loading components:', err);
   }
  }

  async function loadPageComponents(editorInst) {
   try {
    const res = await fetch('/admin/components/list', { cache: 'no-store' });
    const data = await res.json();
    if (!data.success || !Array.isArray(data.components)) return;
    const bm = editorInst.BlockManager;
    data.components.forEach(comp => {
     try {
      if (comp.category !== 'Page Components') return;
      let content = '';
      if (typeof comp.html === 'string') content = comp.html;
      else if (comp.html && typeof comp.html === 'object' && typeof comp.html.html === 'string') content = comp.html.html;
      if (!content || typeof content !== 'string') {
       console.warn('Skipping malformed page component (missing html):', comp);
       return;
      }
      const bid = `page-${comp.id}`;
      bm.add(bid, {
       label: comp.name || `Page Component ${comp.id}`,
       category: '📄 Page Components',
       attributes: { class: 'fa fa-file', 'data-bid': bid },
       content,
       componentId: comp.id,
       componentName: comp.name,
       preview: `<div style="width:240px;transform:scale(.5);transform-origin:top left;">${U.sanitizePreview(content)}</div>`,
       hoverPreview: `<div style="width:240px;transform:scale(.5);transform-origin:top left;">${U.sanitizePreview(content)}</div>`
      });
     } catch (e) {
      console.warn('Error adding page component block', e);
     }
    });
   } catch (err) {
    console.error('Error loading page components:', err);
   }
  }

  loadCustomComponents(editor);
  loadPageComponents(editor);

  /* ============================
     Register shortcode blocks (HARDENED)
     - Validates keys before registering and before requesting config
     ============================ */
  async function registerShortcodeBlocks(editorInst) {
   try {
    const res = await fetch('/admin/shortcodes/all');
    const data = await res.json();
    if (!data || typeof data !== 'object') return;
    const bm = editorInst.BlockManager;
    Object.entries(data).forEach(([key, cfg]) => {
     if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(key)) {
      console.warn('Skipping invalid shortcode key from backend:', key);
      return;
     }
     const label = cfg && cfg.title ? cfg.title : key;
     bm.add(`shortcode-${key}`, {
      label: `[${key}]`,
      category: 'Shortcodes',
      attributes: { class: 'fa fa-code', 'data-shortcode': key },
      content: {
       type: 'shortcode-block',
       components: `[${key}]`,
       attributes: { 'data-shortcode': key }
      },
      hoverPreview: `<div style="padding:8px;border:1px dashed #999;text-align:center;">[${key}]</div>`
     });
    });
   } catch (err) {
    console.error('Error loading shortcodes list', err);
   }
  }
  registerShortcodeBlocks(editor);

  /* ============================
     Trait wiring for shortcode-block selection (HARDENED)
     - Validate shortcodeName before fetching config
     ============================ */
  editor.on('component:selected', async (model) => {
   if (!model || model.get('type') !== 'shortcode-block') return;

   // Validate shortcode name
   const isValidShortcodeName = (n) => typeof n === 'string' && /^[a-zA-Z0-9_-]+$/.test(n);

   const attrsObj = (typeof model.getAttributes === 'function') ? model.getAttributes() : (model.get('attributes') || {});
   const originalShortcodeFromAttr = attrsObj['data-shortcode-original'] || attrsObj['data-shortcode'] || '';

   let content = '';
   try {
    const comps = model.get('components');
    if (typeof comps === 'string') content = comps;
    else if (comps && typeof comps === 'object') {
     if (typeof comps.at === 'function') {
      const first = comps.at(0);
      content = first?.get?.('content') || first?.get?.('components') || '';
      if (typeof content !== 'string') content = model.get('content') || '';
     } else if (Array.isArray(comps)) {
      content = (comps[0] && (comps[0].content || '')) || model.get('content') || '';
     } else content = model.get('content') || '';
    } else content = model.get('content') || '';
   } catch (e) { content = model.get('content') || ''; }
   content = (content + '').toString().trim();

   const shortcodeText = originalShortcodeFromAttr || content;
   const shortcodeName = U.extractShortcodeName(shortcodeText);

   if (!isValidShortcodeName(shortcodeName)) return;

   try {
    const cfgRes = await fetch(`/admin/shortcodes/${encodeURIComponent(shortcodeName)}/config`);
    if (!cfgRes.ok) {
     console.warn(`Shortcode config not found for ${shortcodeName} (${cfgRes.status})`);
     return;
    }
    const config = await cfgRes.json();
    const traitDefs = (config.fields || []).map((f) => {
     if (f.type === 'select') return { type: 'select', name: f.name, label: f.label, options: (f.options || []).map(opt => ({ id: opt, name: opt })), changeProp: 1 };
     return { type: f.type === 'number' ? 'number' : 'text', name: f.name, label: f.label, placeholder: f.default || '', changeProp: 1 };
    });
    model.set('traits', traitDefs);
    editor.TraitManager.render(model);

    const parseAttrs = (text) => {
     const result = {};
     if (!text) return result;
     const re = /(\w+)\s*=\s*"([^"]*)"|(\w+)\s*=\s*([^\s"]+)/g;
     let m;
     while ((m = re.exec(text)) !== null) {
      if (m[1]) result[m[1]] = m[2];
      else if (m[3]) result[m[3]] = m[4];
     }
     return result;
    };

    const attrText = (shortcodeText.match(/\[([^\]]+)\]/) || [])[1] || '';
    const parsedAttrs = parseAttrs(attrText);
    traitDefs.forEach(td => {
     const parsed = parsedAttrs[td.name];
     if (parsed !== undefined) model.set(td.name, parsed);
     else {
      const cfgField = (config.fields || []).find(f => f.name === td.name);
      if (cfgField && cfgField.default !== undefined) model.set(td.name, String(cfgField.default));
     }
    });

    if (!model.__shortcodeTraitHandlers) model.__shortcodeTraitHandlers = {};
    Object.keys(model.__shortcodeTraitHandlers || {}).forEach(oldName => {
     try { model.off(`change:${oldName}`, model.__shortcodeTraitHandlers[oldName]); } catch (e) { /* ignore */ }
    });
    model.__shortcodeTraitHandlers = {};
    traitDefs.forEach(tr => {
     const handler = async () => {
      const values = traitDefs
       .map((t) => {
        const v = model.get(t.name);
        if (!v && v !== 0) return '';
        const valWithQuotes = `"${String(v).replace(/"/g, '\\"')}"`;
        return `${t.name}=${valWithQuotes}`;
       })
       .filter(Boolean)
       .join(' ');
      const shortcodeStr = values ? `[${shortcodeName} ${values}]` : `[${shortcodeName}]`;
      try { model.addAttributes && model.addAttributes({ 'data-shortcode-original': shortcodeStr }); } catch (e) { /* ignore */ }
      try { model.debouncedRender && model.debouncedRender(shortcodeStr); } catch (err) { console.error('Error auto-rendering shortcode', err); }
     };
     model.__shortcodeTraitHandlers[tr.name] = handler;
     model.on(`change:${tr.name}`, handler);
    });
   } catch (err) {
    console.error('Trait config load error:', err);
   }
  });

  /* ============================
     Auto-render shortcode after drop (component:add) with validation
     ============================ */
  editor.on('component:add', async (cmp) => {
   if (!cmp || cmp.get('type') !== 'shortcode-block') return;
   const shortcodeName = cmp.getAttributes()['data-shortcode'] || U.extractShortcodeName(cmp.get('components'));
   if (!shortcodeName || typeof shortcodeName !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(shortcodeName)) return;

   try {
    const cfgRes = await fetch(`/admin/shortcodes/${encodeURIComponent(shortcodeName)}/config`);
    const config = cfgRes.ok ? await cfgRes.json() : null;

    const attrs = (config && config.fields || []).map((f) => {
     const def = f.default ?? '';
     if (!def || def === '') return '';
     const valWithQuotes = /\s/.test(String(def)) ? `"${def}"` : def;
     return `${f.name}=${valWithQuotes}`;
    }).filter(Boolean).join(' ');

    const shortcodeString = attrs ? `[${shortcodeName} ${attrs}]` : `[${shortcodeName}]`;
    cmp.components(`<div style="color:gray;padding:12px;text-align:center;">Loading ${shortcodeName}...</div>`);
    cmp.addAttributes({ 'data-shortcode-original': shortcodeString });

    if (cmp.debouncedRender) await cmp.debouncedRender(shortcodeString);
    editor.select(cmp);
    editor.trigger('component:selected', { model: cmp });

    setTimeout(async () => {
     try {
      if (config) {
       const traitDefs = (config.fields || []).map((f) => {
        if (f.type === 'select') return { type: 'select', name: f.name, label: f.label, options: (f.options || []).map(o => ({ id: o, name: o })), changeProp: 1 };
        return { type: f.type === 'number' ? 'number' : 'text', name: f.name, label: f.label, placeholder: f.default || '', changeProp: 1 };
       });
       cmp.set('traits', traitDefs);
       editor.TraitManager.render(cmp);
       document.getElementById('tab-traits')?.click();
      }
     } catch (err) { console.warn('Auto trait load failed:', err); }
    }, 400);
   } catch (err) {
    console.error(`Auto-render failed for [${shortcodeName}]`, err);
    cmp.components(`<div style="color:red;">Error loading [${shortcodeName}]</div>`);
   }
  });

  /* ============================
     Shortcode serialization for saving pages
     ============================ */
  function serializeShortcodes(instEditor) {
   const wrapper = document.createElement('div');
   wrapper.innerHTML = instEditor.getHtml();
   wrapper.querySelectorAll('.shortcode-block').forEach(el => {
    const shortcodeText = el.getAttribute('data-shortcode-original');
    if (shortcodeText) {
     el.innerHTML = '';
     el.outerHTML = shortcodeText;
    }
   });
   return wrapper.innerHTML;
  }

  async function savePageData(url) {
   const html = serializeShortcodes(editor);
   const css = editor.getCss();
   const meta = {
    meta_title: document.getElementById('meta-title')?.value || '',
    meta_description: document.getElementById('meta-description')?.value || '',
    meta_keywords: document.getElementById('meta-keywords')?.value || '',
    meta_og_image: document.getElementById('meta-og-image')?.value || '',
    meta_fokus_keyword: document.getElementById('meta-fokus-keyword')?.value || '',
   };
   const response = await fetch(url, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json', 'Accept': 'application/json' }, U.csrfTokenHeader()),
    body: JSON.stringify({
     title: document.getElementById('page-title')?.value || '',
     html, css, ...meta
    })
   });
   return await response.json();
  }

  async function savePageAsComponent(url) {
   if (window.__isSavingPageComponent) return;
   window.__isSavingPageComponent = true;
   try {
    const html = editor.getHtml();
    const css = editor.getCss ? editor.getCss() : '';
    const js = editor.getJs ? editor.getJs() : '';
    let id = document.getElementById('component-id')?.value || null;
    if (!id) {
     const wrapperComp = editor.getWrapper();
     const dbWrapper = wrapperComp.find('.page-component-wrapper')[0];
     if (dbWrapper) id = dbWrapper.getAttributes()['data-db-id'] || null;
    }
    const name = (document.getElementById('component-name')?.value || 'Untitled component').trim();
    const payload = { id, name, category: 'Page Components', html, js };
    if (css && css.trim().length > 0) payload.css = css;
    const res = await fetch(url, {
     method: 'POST',
     headers: Object.assign({ 'Content-Type': 'application/json', Accept: 'application/json' }, U.csrfTokenHeader()),
     body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data?.id) {
     let idInput = document.getElementById('component-id');
     if (!idInput) { idInput = document.createElement('input'); idInput.type = 'hidden'; idInput.id = 'component-id'; document.body.appendChild(idInput); }
     idInput.value = data.id;
    }
    alert(data.message || 'Component saved successfully');
    return data;
   } catch (e) {
    console.error(e);
    alert('Save failed');
    return { success: false };
   } finally { window.__isSavingPageComponent = false; }
  }

  /* ---------------------------
     Save modal hooks
     --------------------------- */
  try {
   const modal = document.getElementById("saveOptionModal");
   const btnSave = document.getElementById("btn-save");
   const saveAsPageBtn = document.getElementById("saveAsPage");
   const saveAsComponentBtn = document.getElementById("saveAsComponent");
   const cancelSaveBtn = document.getElementById("cancelSave");
   let val = document.getElementById("saveAsPage")?.value || 'page';

   if (btnSave && modal) {
    const showModal = () => { modal.classList.add("show"); modal.style.display = "grid"; modal.style.placeItems = "center"; };
    const hideModal = () => modal.classList.remove("show");
    btnSave.addEventListener("click", e => { e.preventDefault(); showModal(); });
    cancelSaveBtn?.addEventListener('click', hideModal);

    saveAsPageBtn?.addEventListener("click", async () => {
     hideModal();
     if (val === 'page') {
      const result = await savePageData(`/admin/pages/${PAGE_ID}/save`);
      if (result.success) alert('✅ Page saved successfully!');
      else if (result.failed) alert('❌ Page title Already Exits change Page title');
     } else if (val === 'blog') {
      const result = await savePageData(`/admin/blog/${PAGE_ID}/save`);
      if (result.success) alert('✅ Blog saved successfully!');
      else if (result.failed) alert('❌ Blog title Already Exits change Blog title');
     }
    });

    saveAsComponentBtn?.addEventListener("click", async () => {
     hideModal();
     const result = await savePageAsComponent('/admin/components/saveAsComponent');
     if (result.success) alert('✅ Page As Component saved successfully!');
    });
   }
  } catch (e) { console.warn('save modal hookup failed', e); }

  /* ---------------------------
     Preview / Publish
     --------------------------- */
  try {
   document.getElementById('btn-preview').onclick = async () => {
    if ((document.getElementById('saveAsPage')?.value || 'page') === 'page') {
     const result = await savePageData(`/admin/pages/${PAGE_ID}/save`);
     if (result.success) window.open(`/admin/preview/${PAGE_ID}`, '_blank');
     else if (result.failed) alert('❌ Page title Already Exits change Page title');
    } else {
     const result = await savePageData(`/admin/blog/${PAGE_ID}/save`);
     if (result.success) window.open(`/admin/blog/preview/${PAGE_ID}`, '_blank');
     else if (result.failed) alert('❌ Blog title Already Exits change Blog title');
    }
   };
   document.getElementById('btn-publish').onclick = async () => {
    if ((document.getElementById('saveAsPage')?.value || 'page') === 'page') {
     const result = await savePageData(`/admin/pages/${PAGE_ID}/publish`);
     if (result.success) { alert('🚀 Page published successfully!'); if (result.url) window.open(result.url, '_blank'); }
     else if (result.failed) alert('❌ Page title Already Exits change Page title');
    } else {
     const result = await savePageData(`/admin/blog/${PAGE_ID}/publish`);
     if (result.success) { alert('🚀 Blog published successfully!'); if (result.url) window.open(result.url, '_blank'); }
     else if (result.failed) alert('❌ Blog title Already Exits change Blog title');
    }
   };
  } catch (e) { /* ignore missing buttons */ }

  /* ---------------------------
     Code views (HTML/CSS)
     --------------------------- */
  try {
   document.getElementById('btn-html-view').addEventListener('click', () => {
    let htmlCode = editor.getHtml();
    if (typeof html_beautify !== 'undefined') htmlCode = html_beautify(htmlCode, { indent_size: 2, wrap_line_length: 80 });
    openCodeModal('HTML Code View', htmlCode, 'htmlmixed');
   });
   document.getElementById('btn-css-view').addEventListener('click', () => {
    let cssCode = editor.getCss();
    if (typeof css_beautify !== 'undefined') cssCode = css_beautify(cssCode, { indent_size: 2, wrap_line_length: 80 });
    openCodeModal('CSS Code View', cssCode, 'css');
   });
  } catch (e) { /* not fatal */ }

  /* ---------------------------
     Sidebar behavior & tabs
     --------------------------- */
  const tabs = {
   traits: document.getElementById('traits'),
   blocks: document.getElementById('blocks'),
   layers: document.getElementById('layers'),
   styles: document.getElementById('styles'),
   assets: document.getElementById('assets'),
   meta: document.getElementById('meta'),
  };

  const tabButtons = {
   traits: document.getElementById('tab-traits'),
   blocks: document.getElementById('tab-blocks'),
   layers: document.getElementById('tab-layers'),
   styles: document.getElementById('tab-styles'),
   assets: document.getElementById('tab-assets'),
   meta: document.getElementById('tab-meta'),
  };

  function showTab(name) {
   Object.keys(tabs).forEach((key) => {
    try {
     tabs[key].style.display = key === name ? 'block' : 'none';
     tabButtons[key].classList.toggle('bg-gray-800', key === name);
     tabButtons[key].classList.toggle('active', key === name);
    } catch (e) { /* ignore missing DOM */ }
   });

   if (name === 'layers') editor.LayerManager.render();
   if (name === 'styles') editor.StyleManager.render();
   if (name === 'traits') editor.TraitManager.render();
   if (name === 'assets') {
    editor.AssetManager.render();
    if (editor.AssetManager.getAll().length === 0) editor.AssetManager.load && editor.AssetManager.load();
    setTimeout(() => { window.renderCustomMediaUI && window.renderCustomMediaUI(); }, 100);
   }
  }

  Object.keys(tabButtons).forEach((key) => { tabButtons[key]?.addEventListener('click', () => showTab(key)); });
  showTab('blocks');

  editor.on('component:selected', (cmp) => { if (!cmp) return; if (cmp.get('type') === 'shortcode-block') showTab('traits'); });

  /* ---------------------------
     Hover preview for blocks (UI)
     --------------------------- */
  function enableBlockHoverPreview(editorInstance) {
   const panel = document.getElementById('blocks');
   if (!panel) return;
   let previewBox = document.getElementById('gjs-block-preview-box');
   if (!previewBox) {
    previewBox = document.createElement('div');
    previewBox.id = 'gjs-block-preview-box';
    previewBox.style.cssText = 'position:fixed;z-index:99999;display:none;pointer-events:none;background:#fff;border:1px solid #ddd;border-radius:10px;padding:10px;box-shadow:0 8px 24px rgba(0,0,0,.18);max-width:360px;max-height:320px;overflow:auto;';
    document.body.appendChild(previewBox);
   }

   const listSelector = '.gjs-blocks-c, .gjs-blocks-cs, .gjs-blocks-cw, .gjs-blocks, #blocks';
   const moveBox = (e) => {
    const pad = 14;
    const maxX = window.scrollX + window.innerWidth - (previewBox.offsetWidth + pad);
    const maxY = window.scrollY + window.innerHeight - (previewBox.offsetHeight + pad);
    previewBox.style.left = Math.min(e.pageX + pad, maxX) + 'px';
    previewBox.style.top = Math.min(e.pageY + pad, maxY) + 'px';
   };

   const getPreviewHtml = (block) => {
    const hv = block?.get('hoverPreview');
    const pv = block?.get('preview');
    const ct = block?.get('content');
    if (typeof hv === 'string') return hv;
    if (typeof pv === 'string') return pv;
    if (typeof ct === 'string') return `<div style="width:240px;transform:scale(.5);transform-origin:top left;">${U.sanitizePreview(ct)}</div>`;
    return '<div style="padding:12px;color:#666;">Preview not available</div>';
   };

   const setPreviewContent = (block) => {
    const html = getPreviewHtml(block);
    if (!window.APP_CSS) { previewBox.innerHTML = html; return; }
    previewBox.innerHTML = `<iframe style="width:360px;height:280px;border:0;border-radius:8px;background:#fff;"></iframe>`;
    const iframe = previewBox.querySelector('iframe');
    const doc = iframe.contentDocument;
    doc.open();
    doc.write(`
          <html>
            <head>
              <link rel="stylesheet" href="${window.APP_CSS}">
              <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css">
              <style>body{margin:8px;font-family:system-ui,-apple-system,Segoe UI,Roboto,'Helvetica Neue',Arial}</style>
            </head>
            <body>${html}</body>
          </html>`);
    doc.close();
   };

   const resolveBlock = (tile, listEl) => {
    const bid = tile?.dataset?.bid;
    if (bid) {
     const m = editorInstance.BlockManager.get(bid);
     if (m) return m;
    }
    const idAttr = tile.getAttribute('data-id') || tile.id || tile.dataset?.id;
    if (idAttr) {
     const m = editorInstance.BlockManager.get(idAttr);
     if (m) return m;
    }
    const tiles = Array.from((listEl || panel).querySelectorAll('.gjs-block'));
    const idx = tiles.indexOf(tile);
    const all = editorInstance.BlockManager.getAll();
    const labelEls = (listEl || panel).querySelectorAll('.gjs-block-label, .gjs-block__label, .gjs-title, .gjs-block .gjs-title');
    const text = labelEls[idx]?.textContent?.trim();
    if (text) {
     const match = all.find(b => (b.get('label') + '').trim() === text);
     if (match) return match;
    }
    return all.at(idx) || null;
   };

   const onOver = (ev) => {
    const tile = ev.target.closest('.gjs-block');
    if (!tile || !panel.contains(tile)) return;
    const listEl = tile.closest(listSelector) || panel;
    const block = resolveBlock(tile, listEl);
    if (!block) return;
    setPreviewContent(block);
    previewBox.style.display = 'block';
    moveBox(ev);
   };
   const onMove = (ev) => { if (previewBox.style.display === 'block') moveBox(ev); };
   const onOut = (ev) => {
    const toEl = ev.relatedTarget;
    if (toEl && toEl.closest && toEl.closest('.gjs-block')) return;
    previewBox.style.display = 'none';
   };

   panel.removeEventListener('mouseover', onOver);
   panel.removeEventListener('mousemove', onMove);
   panel.removeEventListener('mouseout', onOut);
   panel.addEventListener('mouseover', onOver, { passive: true });
   panel.addEventListener('mousemove', onMove, { passive: true });
   panel.addEventListener('mouseout', onOut, { passive: true });
  }
  enableBlockHoverPreview(editor);

  /* ---------------------------
     Inject small UI CSS tweaks
     --------------------------- */
  const sidebarStyle = document.createElement('style');
  sidebarStyle.innerHTML = `
      #sidebar-nav button.active { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); font-weight:700; color:white; border-left:4px solid #60a5fa; transform:translateX(2px); }
      .gjs-trait-input { background-color:#1f2937 !important; border:1px solid #374151 !important; color:white !important; border-radius:6px !important; padding:8px 10px !important; font-size:12px !important; }
      .gjs-component-selected { border:2px solid #3b82f6 !important; box-shadow:0 0 0 2px rgba(59,130,246,.2) !important; }
      .gjs-am-assets-cont { background:#0f172a; border-radius:8px; padding:8px; }
      @keyframes fadeIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:none; } }
    `;
  document.head.appendChild(sidebarStyle);

  /* ---------------------------
     Deserialize PAGE_HTML (shortcodes) or create placeholder
     --------------------------- */
  function deserializeShortcodes(html) {
   if (!html) return html;
   const wrapper = document.createElement('div');
   wrapper.innerHTML = html;
   const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, null, false);
   const nodesToReplace = [];
   let textNode;
   while ((textNode = walker.nextNode())) {
    if (textNode.nodeValue.includes('[') && textNode.nodeValue.includes(']')) nodesToReplace.push(textNode);
   }
   nodesToReplace.forEach(node => {
    const parent = node.parentNode;
    const text = node.nodeValue;
    const shortcodeRegex = /\[([a-zA-Z0-9_-]+)(?:\s+([^\]]*))?\]/g;
    let lastIndex = 0;
    let match;
    while ((match = shortcodeRegex.exec(text)) !== null) {
     if (match.index > lastIndex) parent.insertBefore(document.createTextNode(text.substring(lastIndex, match.index)), node);
     const shortcodeDiv = document.createElement('div');
     shortcodeDiv.setAttribute('data-gjs-type', 'shortcode-block');
     shortcodeDiv.setAttribute('data-shortcode-original', match[0]);
     shortcodeDiv.setAttribute('class', 'shortcode-block border border-dashed border-gray-400 rounded-md p-2 text-center text-gray-600');
     shortcodeDiv.innerHTML = `<div style="color:gray;padding:12px;text-align:center;">Loading ${U.escapeHtml(match[1])}...</div>`;
     parent.insertBefore(shortcodeDiv, node);
     lastIndex = shortcodeRegex.lastIndex;
    }
    if (lastIndex < text.length) parent.insertBefore(document.createTextNode(text.substring(lastIndex)), node);
    parent.removeChild(node);
   });
   return wrapper.innerHTML;
  }

  if (typeof PAGE_ID !== "undefined" && typeof PAGE_HTML !== 'undefined' && PAGE_HTML) {
   try {
    const deserializedHTML = deserializeShortcodes(PAGE_HTML);
    editor.setComponents(deserializedHTML);
    editor.setStyle(PAGE_CSS || '');

    setTimeout(() => {
     const wrapperComp = editor.getWrapper();
     if (wrapperComp) {
      const allShortcodes = wrapperComp.find('.shortcode-block');
      allShortcodes.forEach(async (cmp) => {
       try {
        const shortcodeStr = cmp.getAttributes()['data-shortcode-original'] || '';
        if (shortcodeStr && cmp.debouncedRender) await cmp.debouncedRender(shortcodeStr);
       } catch (e) { console.warn('Error auto-rendering loaded shortcode:', e); }
      });
     }
    }, 500);
   } catch (e) { console.warn('Error setting PAGE_HTML', e); }
  } else {
   try {
    const wrp = editor.getWrapper();
    wrp.set({ droppable: true, style: { 'min-height': '100vh', padding: '20px', background: '#fafafa' } });
    wrp.append(`
          <div style="padding:40px;text-align:center;color:#aaa;border:2px dashed #ddd;border-radius:8px;margin:20px auto;max-width:800px;background:white;">
            <p style="font-size:20px;margin:10px 0;font-weight:500;">👋 Start Building Your Page</p>
            <p style="font-size:14px;margin:10px 0;">Drag and drop components from the sidebar anywhere on this canvas</p>
            <p style="font-size:12px;margin:10px 0;color:#999;">You can delete this placeholder and start fresh</p>
          </div>
        `);
   } catch (e) {
    console.warn('Error initializing blank canvas', e);
    try { editor.getWrapper().set('droppable', true); } catch (e2) { /* ignore */ }
   }
  }

  /* ---------------------------
     Re-render shortcodes inside iframe on load
     --------------------------- */
  async function renderShortcodesOnLoad(instEditor) {
   const frame = instEditor.Canvas.getFrameEl();
   if (!frame) return;
   let doc;
   try { doc = frame.contentDocument || frame.contentWindow.document; } catch (e) { console.warn('Cannot access iframe document (CSP or cross-origin):', e); return; }
   if (!doc || !doc.body) return;

   const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
   const targets = [];
   while (true) {
    const node = walker.nextNode();
    if (!node) break;
    const txt = (node.nodeValue || '').trim();
    if (!txt) continue;
    if (/\[([a-zA-Z0-9_-]+)([^\]]*)\]/.test(txt)) targets.push(node);
   }
   if (!targets.length) return;

   const re = /\[([a-zA-Z0-9_-]+)([^\]]*)\]/g;
   for (const textNode of targets) {
    const original = textNode.nodeValue || '';
    let lastIdx = 0;
    let match;
    const frag = doc.createDocumentFragment();
    while ((match = re.exec(original)) !== null) {
     const before = original.slice(lastIdx, match.index);
     if (before) frag.appendChild(doc.createTextNode(before));
     const shortcodeString = match[0];
     let safeHtml;
     try {
      const json = await fetch('/shortcode/render', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, U.csrfTokenHeader()), body: JSON.stringify({ shortcode: shortcodeString }) }).then(r => r.json());
      safeHtml = json.html || `<div style="color:gray;">${U.escapeHtml(shortcodeString)} not found</div>`;
     } catch (e) { safeHtml = `<div style="color:red;">Error loading ${U.escapeHtml(shortcodeString)}</div>`; }
     const wrap = doc.createElement('div');
     wrap.className = 'shortcode-block border border-dashed border-gray-400 rounded-md p-2 text-center text-gray-600';
     wrap.setAttribute('data-shortcode', match[1]);
     wrap.setAttribute('data-shortcode-original', shortcodeString);
     wrap.innerHTML = safeHtml;
     frag.appendChild(wrap);
     lastIdx = re.lastIndex;
    }
    const rest = original.slice(lastIdx);
    if (rest) frag.appendChild(doc.createTextNode(rest));
    if (textNode.parentNode) textNode.parentNode.replaceChild(frag, textNode);
   }

   instEditor.setComponents(instEditor.getHtml());
  }

  editor.on('load', () => { renderShortcodesOnLoad(editor); });

  /* End DOMContentLoaded */
 }); // end DOMContentLoaded

 /* Code modal helper (outside DOMContentLoaded scope for reuse) */
 function openCodeModal(title, code, mode) {
  const modalEl = document.createElement('div');
  modalEl.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:#1e1e2f;z-index:9999;display:flex;flex-direction:column;overflow:hidden;';
  modalEl.innerHTML = `
      <div style="background:#111827;color:#fff;padding:10px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #333;">
        <h4 style="margin:0;font-size:16px;">${U.escapeHtml(title)}</h4>
        <button id="close-code-view" style="background:#ef4444;border:none;color:#fff;padding:6px 12px;border-radius:4px;cursor:pointer;">Close</button>
      </div>
      <div id="code-editor-container" style="flex:1;display:flex;overflow:hidden;">
        <textarea id="code-view-area" style="flex:1;width:100%;height:100%;border:none;outline:none;resize:none;font-size:14px;"></textarea>
      </div>`;
  document.body.appendChild(modalEl);
  const cm = CodeMirror.fromTextArea(document.getElementById('code-view-area'), { mode, theme: 'dracula', lineNumbers: true, lineWrapping: true, readOnly: true, viewportMargin: Infinity });
  cm.setValue(code);
  setTimeout(() => cm.refresh(), 150);
  modalEl.querySelector('#close-code-view').addEventListener('click', () => { cm.toTextArea(); modalEl.remove(); });
 }

})();
