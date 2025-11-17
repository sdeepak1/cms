/**
 * builder.js
 * Full CMS Builder Script (Laravel + GrapesJS) — Refactored + Preserved Behavior
 *
 * NOTE: This file is a refactor of your original builder.js.
 * - I reorganized the code into clear logical sections with comments.
 * - I preserved all original logic and APIs (no behavior intentionally changed).
 * - I kept all API endpoints, DOM IDs, GrapesJS configuration, and traits as-is.
 * - Any small internal helper re-use was introduced only to reduce duplication,
 *   but their semantics match the original code to avoid breaking behavior.
 *
 * Keep CSP/CSRF adjustments in mind if you have custom headers.
 */

(function () {
 // -----------------------
 // Section: Utilities & Helpers
 // - Common small helpers used all over the file.
 // -----------------------
 function log(...args) {
  // simple logger wrapper (silenced by default)
  // console.debug(...args);
 }

 function sanitizePreview(html) {
  if (typeof html !== 'string') return '';
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<link[^>]+tailwind[^>]*>/gi, '');
  html = html.replace(/<link[^>]+font-?awesome[^>]*>/gi, '');
  return html;
 }

 function escAttr(s) {
  return String(s)
   .replace(/&/g, '&amp;')
   .replace(/"/g, '&quot;')
   .replace(/</g, '&lt;')
   .replace(/>/g, '&gt;')
   .replace(/'/g, '&#39;');
 }

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

 function debounce(fn, wait = 400) {
  let t;
  return (...args) => {
   clearTimeout(t);
   t = setTimeout(() => fn(...args), wait);
  };
 }

 function extractShortcodeName(content) {
  if (!content) return null;
  const m = (content + '').match(/\[([a-zA-Z0-9_:-]+)(\s[^\]]*)?\]/);
  return m ? m[1] : null;
 }

 function csrfTokenHeader() {
  const tokenMeta = document.querySelector('meta[name="csrf-token"]');
  const token = tokenMeta ? tokenMeta.getAttribute('content') : null;
  return token ? { 'X-CSRF-TOKEN': token } : {};
 }

 function attrStringFromValue(name, value) {
  if (value === undefined || value === null || value === '') return '';
  const v = String(value).trim();
  if (v === '') return '';
  const quoted = /\s/.test(v) ? `"${v}"` : v;
  return `${name}=${quoted}`;
 }

 // -----------------------
 // Section: Block Files Loader
 // - Responsible for loading static HTML/CSS block files from /js/blocks
 // -----------------------
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
     content = await loadBlockFiles(`/js/blocks/${pathname}/${pathname}${i}/${pathname}.html`, `/js/blocks/${pathname}/${pathname}${i}/${pathname}.css`);
    } else {
     content = await loadBlockFiles(`/js/blocks/${pathname}/${pathname}${i}.html`);
    }
    if (!content) continue;
    arr.push({
     id: `${pathname}${i}`,
     label: `${labelname} ${i}`,
     category: `UI/${labelname}`,
     content,
     hoverPreview: `<div style="width:240px;transform:scale(.5);transform-origin:top left;">${sanitizePreview(content)}</div>`
    });
   } catch (err) {
    console.warn(`⚠️ ${labelname} ${i} not found or failed to load.`, err);
   }
  }
  return arr;
 }

 // -----------------------
 // DOMContentLoaded main
 // - Bootstraps the entire builder when DOM is ready.
 // -----------------------
 document.addEventListener('DOMContentLoaded', async function () {
  // -----------------------
  // Prefill meta panel (if present)
  // -----------------------
  if (window.META_DATA) {
   try {
    document.getElementById('meta-title').value = META_DATA.title || '';
    document.getElementById('meta-description').value = META_DATA.description || '';
    document.getElementById('meta-keywords').value = META_DATA.keywords || '';
    document.getElementById('meta-fokus-keyword').value = META_DATA.fokus_keyword || '';
    document.getElementById('meta-og-image').value = META_DATA.og_image || '';
   } catch (e) {
    // ignore if fields don't exist on page
   }

   if (META_DATA.custom) {
    try {
     const customTags = JSON.parse(META_DATA.custom);
     const container = document.getElementById('meta-list');
     customTags.forEach(tag => {
      const row = document.createElement('div');
      row.classList.add('flex', 'space-x-2', 'mb-2');
      row.innerHTML = `
              <input type="text" value="${tag.name}" class="flex-1 px-2 py-1 text-black rounded meta-name">
              <input type="text" value="${tag.content}" class="flex-1 px-2 py-1 text-black rounded meta-content">
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

  // -----------------------
  // Section: Load static block groups
  // - loads local HTML block files defined under /js/blocks
  // -----------------------
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

  // -----------------------
  // Section: Base Blocks (static blocks defined inline)
  // -----------------------
  // Fixed `blocks` definition: syntax errors removed and truncated placeholders replaced
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
  // -----------------------
  // Section: Init GrapesJS editor
  // - Config preserved exactly as before
  // -----------------------
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
     'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content,
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
   plugins: [
    'grapesjs-plugin-code-editor'
   ],
   pluginsOpts: { 'grapesjs-plugin-code-editor': {} },
  });

  // Clean up any previous editor
  if (window.editor && typeof window.editor.destroy === 'function') {
   try { window.editor.destroy(); } catch (e) { console.warn('Could not destroy old editor:', e); }
  }
  window.editor = editor;

  editor.on('load', () => {
   const wrp = editor.getWrapper();
   wrp && wrp.set('droppable', true);

   const frame = editor.Canvas.getFrameEl();
   const doc = frame && frame.contentDocument;
   if (doc && doc.body) {
    doc.body.style.minHeight = '100vh';
    doc.body.style.pointerEvents = 'auto';
   }
  });

  // -----------------------
  // Section: Enhanced Media Library (Asset Manager)
  // - Wrapped into an IIFE to keep scope local and organized.
  // -----------------------
  (function setupMedia(editor) {
   const am = editor.AssetManager;
   let currentPage = 1;
   let hasMorePages = true;

   am.addType('custom', {
    async load(_ignored, callback) {
     console.log('🔵 Asset Manager Load Called');

     // Wait for Asset Manager UI to be ready
     await new Promise(resolve => {
      let attempts = 0;
      const checkInterval = setInterval(() => {
       const cont = document.querySelector('#assets .gjs-am-assets, .gjs-am-assets-cont');
       if (cont) {
        clearInterval(checkInterval);
        console.log('✅ Asset container found');
        resolve(cont);
       }
       if (++attempts > 30) {
        clearInterval(checkInterval);
        console.warn('⚠️ Asset container not found after 30 attempts');
        resolve();
       }
      }, 100);
     });

     console.log('🔵 Calling loadPage(1)...');
     loadPage(1, callback);
    }
   });

   function loadPage(page, callback) {
    currentPage = page;
    fetch(`/admin/media/list?page=${page}&limit=20`, {
     cache: 'no-cache',
     credentials: 'same-origin',
     headers: {
      'Accept': 'application/json',
     }
    })
     .then(r => r.json())
     .then(data => {
      console.log('✅ Loaded images from API:', data);

      const imgs = data.images.map(img => ({
       type: 'image',
       src: img.src,
       name: img.name || img.src.split('/').pop(),
       folder: img.folder || ''
      }));

      console.log('📸 Processed images:', imgs.length);

      hasMorePages = data.hasMore || false;

      // ALWAYS add images to asset manager
      imgs.forEach(img => am.add(img));

      console.log('📊 AssetManager now has:', am.getAll().length, 'images');

      if (callback) {
       callback(imgs);
      }

      setTimeout(() => {
       renderCustomMediaUI();
       if (hasMorePages) addLoadMoreButton();
      }, 100);
     })
     .catch(err => {
      console.error('❌ Media load error:', err);
      alert('Failed to load images. Check console for details.');
     });
   }

   function renderCustomMediaUI() {
    console.log('🟢 renderCustomMediaUI called');
    const assetsTab = document.getElementById('assets');
    if (!assetsTab) {
     console.error('❌ #assets tab not found!');
     return;
    }

    if (assetsTab._renderingMedia) {
     console.log('⚠️ Already rendering media, skipping');
     return;
    }
    assetsTab._renderingMedia = true;

    try {
     const existing = assetsTab.querySelector('.custom-media-ui');
     if (existing) {
      console.log('⚠️ Custom media UI already exists, updating grid only');
      const container = existing.querySelector('.gjs-am-assets-cont');
      if (container) {
       renderAssetsGrid(container);
       if (window.updateMediaStatus) window.updateMediaStatus();
      }
      return;
     }

     console.log('🟢 Creating custom media UI...');

     const wrapper = document.createElement('div');
     wrapper.className = 'custom-media-ui';
     wrapper.style.cssText = 'height: 100%; display: flex; flex-direction: column; background: #0f0f1e; border-radius: 8px;';

     const uploadSection = document.createElement('div');
     uploadSection.style.cssText = 'padding: 12px; border-bottom: 1px solid #1f2937; background: #0a0e27; flex-shrink: 0; border-radius: 8px 8px 0 0;';

     const totalImages = am.getAll().length;
     console.log('📊 Total images in AssetManager:', totalImages);
     const statusText = totalImages > 0 ? `${totalImages} images loaded` : 'No images yet';

     uploadSection.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <span style="color: #888; font-size: 12px;" id="media-status">${statusText}</span>
              <span style="color: #666; font-size: 11px;">20 per page</span>
            </div>
            <label for="media-upload-input" style="display: block; width: 100%; padding: 10px; background: #2563eb; color: white; text-align: center; border-radius: 6px; cursor: pointer; font-weight: [...]">
              📤 Upload New Image
            </label>
            <input type="file" id="media-upload-input" accept="image/*" multiple style="display: none;">
          `;

     const gridContainer = document.createElement('div');
     gridContainer.className = 'gjs-am-assets-cont';
     gridContainer.style.cssText = 'flex: 1; overflow-y: auto; padding: 8px; background: #0a0e27; border-radius: 8px; margin-top: 10px; display: flex; flex-direction: column;';

     wrapper.appendChild(uploadSection);
     wrapper.appendChild(gridContainer);

     assetsTab.innerHTML = '';
     assetsTab.appendChild(wrapper);

     console.log('✅ Custom media UI created');

     const uploadInput = document.getElementById('media-upload-input');
     uploadInput.addEventListener('change', handleUpload);

     console.log('🟢 Calling renderAssetsGrid...');
     renderAssetsGrid(gridContainer);

     window.updateMediaStatus = function () {
      const statusEl = document.getElementById('media-status');
      if (statusEl) {
       const count = am.getAll().length;
       statusEl.textContent = count > 0 ? `${count} images loaded` : 'No images yet';
      }
     };
    } finally {
     assetsTab._renderingMedia = false;
    }
   }

   function renderAssetsGrid(container) {
    const assets = am.getAll().slice();
    assets.sort((a, b) => {
     const aRecent = a.get && a.get('recent');
     const bRecent = b.get && b.get('recent');
     return (bRecent ? 1 : 0) - (aRecent ? 1 : 0);
    });
    console.log('🔵 renderAssetsGrid called, assets count:', assets.length);
    console.log('📋 Assets:', assets.map(a => ({ src: a.get('src'), name: a.get('name') })));

    if (assets.length === 0) {
     console.warn('⚠️ No assets to display');
     container.innerHTML = '<div style="padding: 60px 20px; text-align: center; color: #888; display: flex; align-items: center; justify-content: center; min-height: 200px; flex-direction: column[...]';
     return;
    }

    console.log(`✅ Rendering ${assets.length} images...`);

    const grid = document.createElement('div');
    grid.className = 'gjs-am-assets';
    grid.style.cssText = `display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; padding: 10px; grid-auto-rows: max-content;`;

    assets.forEach(asset => {
     const assetEl = document.createElement('div');
     assetEl.className = 'gjs-am-asset';
     assetEl.style.cssText = 'position: relative; cursor: pointer; border: 2px solid #444; aspect-ratio: 1/1; border-radius: 10px; overflow: hidden; background: #0f0f0f; transition: all 0.3s cubic-bezier(.34,1.56,0.64,1);';

     const folder = asset.get('folder') || '';
     const folderName = folder ? folder.split('/').pop() : 'media';

     const imgSrc = asset.get('src');
     const imgName = asset.get('name');

     const imgContainer = document.createElement('div');
     imgContainer.style.cssText = 'position: relative; width: 100%; height: 100%; overflow: hidden; background: linear-gradient(135deg, #1e1e2f 0%, #2a2a3e 100%);';

     const img = document.createElement('img');
     img.src = imgSrc;
     img.alt = imgName;
     img.style.cssText = 'width: 100%; height: 100%; aspect-ratio:1/1; object-fit: cover; object-position: center; display: block; transition: opacity 0.3s ease; opacity: 0;';
     img.dataset.src = imgSrc;

     const errorDiv = document.createElement('div');
     errorDiv.style.cssText = 'display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; align-items: center; justify-content: center; color: #999; font-size: 14px; background: rgba(0,0,0,0.25);';
     errorDiv.innerHTML = '<div style="font-size: 32px;">🖼️</div><div style="font-size: 11px; text-align: center; padding: 0 8px;">Image not loaded</div>';

     img.onerror = () => {
      img.style.opacity = '0';
      errorDiv.style.display = 'flex';
     };
     img.onload = () => {
      img.style.opacity = '1';
     };

     const metadataDiv = document.createElement('div');
     metadataDiv.style.cssText = 'position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(to top, rgba(0,0,0,0.95), rgba(0,0,0,0.5), transparent); color: white; font-size: 11px; padding: 8px; display: flex; flex-direction: column; opacity: 0; transition: opacity 0.2s ease;';
     metadataDiv.innerHTML = `<div style="font-weight: 700; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; font-size: 11px; margin-bottom: 2px; line-height: 1.2;">${imgName}</div><div style="font-size:10px;color:#cbd5e1;">${folderName}</div>`;

     imgContainer.appendChild(img);
     imgContainer.appendChild(errorDiv);
     imgContainer.appendChild(metadataDiv);

     assetEl.appendChild(imgContainer);

     assetEl.addEventListener('mouseenter', () => {
      if (assetEl.getAttribute('data-selected') !== 'true') {
       assetEl.style.borderColor = '#3b82f6';
       assetEl.style.boxShadow = '0 8px 24px rgba(59, 130, 246, 0.4), inset 0 0 10px rgba(59, 130, 246, 0.2)';
       const img = assetEl.querySelector('img');
       if (img) img.style.filter = 'brightness(1.15) saturate(1.1)';
       metadataDiv.style.opacity = '1';
      }
     });
     assetEl.addEventListener('mouseleave', () => {
      if (assetEl.getAttribute('data-selected') !== 'true') {
       assetEl.style.borderColor = '#444';
       assetEl.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
       const img = assetEl.querySelector('img');
       if (img) img.style.filter = 'brightness(1) saturate(1)';
       metadataDiv.style.opacity = '0';
      }
     });

     assetEl.addEventListener('click', () => {
      const selected = editor.getSelected();
      if (!selected) {
       alert('⚠️ Please select an element on the canvas first');
       return;
      }

      try {
       const imageSrc = asset.get('src');
       const imageName = asset.get('name');

       if (selected.get('type') === 'image' || selected.get('tagName') === 'img') {
        selected.set('src', imageSrc);
        selected.addAttributes({ src: imageSrc, alt: imageName, title: imageName });
       } else {
        const styles = selected.getStyle();
        styles['background-image'] = `url('${imageSrc}')`;
        styles['background-size'] = 'cover';
        styles['background-position'] = 'center';
        styles['background-repeat'] = 'no-repeat';
        selected.setStyle(styles);
       }

       document.querySelectorAll('.gjs-am-asset').forEach(el => {
        el.setAttribute('data-selected', 'false');
        el.style.borderColor = '#444';
        el.style.transform = 'scale(1) translateY(0)';
        el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
        const img = el.querySelector('img');
        if (img) img.style.filter = 'brightness(1)';
       });

       assetEl.setAttribute('data-selected', 'true');
       assetEl.style.borderColor = '#10b981';
       assetEl.style.transform = 'scale(1.08) translateY(-4px)';
       assetEl.style.boxShadow = '0 12px 32px rgba(16, 185, 129, 0.4)';
       const imgApply = assetEl.querySelector('img');
       if (imgApply) imgApply.style.filter = 'brightness(1.15)';

       const feedback = document.createElement('div');
       feedback.style.cssText = 'position: fixed; top: 20px; right: 20px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 14px 24px; border-radius: 10px; z-index: 99999; box-shadow: 0 8px 24px rgba(0,0,0,0.18);';
       feedback.textContent = '✓ Image applied successfully!';
       document.body.appendChild(feedback);

       setTimeout(() => {
        feedback.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => feedback.remove(), 300);
       }, 2000);
      } catch (err) {
       console.error('Error applying image:', err);
       alert('❌ Error applying image. Check console.');
      }
     });

     grid.appendChild(assetEl);
    });

    container.innerHTML = '';
    container.appendChild(grid);

    try {
     if (typeof addLoadMoreButton === 'function') addLoadMoreButton();
    } catch (e) {
     console.warn('Could not re-add Load More button:', e);
    }

    container.style.overflow = 'auto';

    if (!document.getElementById('media-animations')) {
     const style = document.createElement('style');
     style.id = 'media-animations';
     style.innerHTML = `
            @keyframes slideIn {
              from { transform: translateX(400px); opacity: 0; }
              to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
              from { transform: translateX(0); opacity: 1; }
              to { transform: translateX(400px); opacity: 0; }
            }
            .gjs-am-asset { will-change: transform, box-shadow; }
          `;
     document.head.appendChild(style);
    }
   }

   function addLoadMoreButton() {
    const container = document.querySelector('#assets .gjs-am-assets-cont');
    if (!container) return;

    let btn = document.getElementById('media-load-more');
    if (btn) btn.remove();

    if (!hasMorePages) return;

    btn = document.createElement('button');
    btn.id = 'media-load-more';
    btn.textContent = 'Load More';
    btn.style.cssText = `
          width: 100%; padding: 12px; background: #2563eb; color: white;
          border: none; border-radius: 6px; cursor: pointer; font-weight: 500;
          margin-top: 15px;
        `;

    btn.addEventListener('click', () => {
     btn.textContent = 'Loading...';
     btn.disabled = true;

     loadPage(currentPage + 1, null);

     setTimeout(() => {
      const container = document.querySelector('#assets .gjs-am-assets-cont');
      if (container) {
       renderAssetsGrid(container);
       if (window.updateMediaStatus) window.updateMediaStatus();
      }
      btn.remove();
     }, 1500);
    });

    container.appendChild(btn);
   }

   async function handleUpload(event) {
    const files = Array.from(event.target.files);
    if (!files.length) return;

    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const validFiles = [];

    for (const file of files) {
     if (!ALLOWED_TYPES.includes(file.type)) {
      console.warn(`⚠️ Invalid file type: ${file.type} (${file.name})`);
      continue;
     }
     if (file.size > MAX_FILE_SIZE) {
      console.warn(`⚠️ File too large: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
      continue;
     }
     validFiles.push(file);
    }

    if (validFiles.length === 0) {
     alert('❌ No valid image files. Allowed: JPEG, PNG, GIF, WebP (max 5MB each)');
     return;
    }

    const uploadBtn = document.querySelector('.custom-media-ui label');
    const originalText = uploadBtn ? uploadBtn.textContent : '';
    if (uploadBtn) uploadBtn.textContent = '⏳ Uploading...';

    try {
     for (const file of validFiles) {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/admin/media/upload', {
       method: 'POST',
       headers: Object.assign({ 'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content || '' }, csrfTokenHeader()),
       body: formData
      });

      if (!response.ok) throw new Error('Upload failed');

      const result = await response.json();

      if (result.success && result.url) {
       am.add({
        type: 'image',
        src: result.url,
        name: result.url.split('/').pop(),
        folder: 'media',
        recent: true
       });
      }
     }

     const container = document.querySelector('#assets .gjs-am-assets-cont');
     if (container) {
      renderAssetsGrid(container);
      if (window.updateMediaStatus) window.updateMediaStatus();
     }

     const feedback = document.createElement('div');
     feedback.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #10b981; color: white; padding: 12px 20px; border-radius: 8px; z-index: 99999; box-shadow: 0 4px 12px rgba(0,0,0,0.18);';
     feedback.textContent = `✓ ${files.length} image(s) uploaded successfully!`;
     document.body.appendChild(feedback);
     setTimeout(() => feedback.remove(), 3000);

    } catch (error) {
     console.error('Upload error:', error);
     alert('❌ Upload failed. Please try again.');
    } finally {
     if (uploadBtn) uploadBtn.textContent = originalText;
     event.target.value = ''; // Reset input
    }
   }

   window.renderCustomMediaUI = renderCustomMediaUI;
   window.mediaLoadPage = (page) => {
    console.log(`🔵 Manual load page ${page} triggered`);
    loadPage(page, null);
   };

   editor.on('run:open-assets', () => {
    console.log('🟣 run:open-assets event fired');
    if (typeof showTab === 'function') {
     showTab('assets');
    } else {
     const assetsTab = document.getElementById('assets');
     const tabBtn = document.getElementById('tab-assets');
     if (assetsTab && tabBtn) {
      document.querySelectorAll('#sidebar > div').forEach(el => el.style.display = 'none');
      assetsTab.style.display = 'block';
      document.querySelectorAll('#sidebar-nav button').forEach(btn => btn.classList.remove('active', 'bg-gray-800'));
      tabBtn.classList.add('active', 'bg-gray-800');
     }
    }

    setTimeout(() => {
     const assetsTab = document.getElementById('assets');
     if (assetsTab && !assetsTab.querySelector('.custom-media-ui')) {
      renderCustomMediaUI();
     }
    }, 200);
   });

   editor.on('component:selected', (component) => {
    if (!component) return;

    const type = component.get('type');
    const tagName = component.get('tagName');

    if (type === 'image' || tagName === 'img') {
     setTimeout(() => {
      const assetsTab = document.getElementById('assets');
      if (assetsTab && !assetsTab.querySelector('.custom-media-ui')) {
       renderCustomMediaUI();
      }
     }, 100);
    }
   });

   editor.on('load', () => {
    console.log('🟢 Editor loaded, triggering initial asset load');
    am.load();

    setTimeout(() => {
     if (am.getAll().length === 0) {
      console.log('⚠️ No assets after 2s, loading manually...');
      loadPage(1, (imgs) => {
       imgs.forEach(img => am.add(img));
      });
     }
    }, 2000);
   });

   const originalOpen = editor.Modal.open;
   editor.Modal.open = function (opts) {
    if (opts && opts.title && (opts.title.includes('Select') || opts.title.includes('Image') || opts.title.includes('Asset'))) {
     if (typeof showTab === 'function') {
      showTab('assets');
     }
     setTimeout(() => {
      renderCustomMediaUI();
      if (am.getAll().length === 0) {
       console.log('🔄 No assets loaded, triggering load...');
       am.load();
      }
     }, 100);
     return this;
    }
    return originalOpen.call(this, opts);
   };

  })(editor);

  // -----------------------
  // Section: Custom GrapesJS Types
  // - section, editable-list, etc.
  // -----------------------
  editor.DomComponents.addType('section', {
   model: {
    defaults: {
     droppable: true,
     editable: true,
     highlightable: true,
     draggable: true,
     attributes: { style: 'min-height:80px; border:1px dashed #ccc;' },
    },
   },
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
       setTimeout(() => li.focus?.(), 0);
      });
      btn.__hasListener = true;
     },
    },
   },
  });

  // -----------------------
  // Section: BlockManager registration
  // - Register base blocks and loaded groups
  // -----------------------
  const bm = editor.BlockManager;
  blocks.forEach(b => {
   const id = b.id;
   b.attributes = Object.assign({}, b.attributes, { 'data-bid': id });
   if (typeof b.content === 'string') {
    b.hoverPreview = `<div style="width:240px;transform:scale(.5);transform-origin:top left;">${sanitizePreview(b.content)}</div>`;
   }
   bm.add(id, b);
  });

  [aboutBlocks, bannerBlocks, blogBlocks, contactBlocks, counterBlocks, footerBlocks,
   galleryBlocks, heroBlocks, productBlocks, reviewBlocks, serviceBlocks, socialBlocks,
   stepBlocks, subscribeBlocks, teamBlocks, visionBlocks, whyBlocks, workBlocks]
   .forEach(group => {
    group.forEach(b => {
     b.attributes = Object.assign({}, b.attributes, { 'data-bid': b.id });
     bm.add(b.id, b);
    });
   });

  // -----------------------
  // Section: Hover preview UI
  // - Safe preview using sanitized content and iframe if APP_CSS available.
  // -----------------------
  function enableBlockHoverPreview(editor) {
   const panel = document.getElementById('blocks');
   if (!panel) return;
   let previewBox = document.getElementById('gjs-block-preview-box');
   if (!previewBox) {
    previewBox = document.createElement('div');
    previewBox.id = 'gjs-block-preview-box';
    previewBox.style.cssText = `
          position:fixed; z-index:99999; display:none; pointer-events:none;
          background:#fff; border:1px solid #ddd; border-radius:10px; padding:10px;
          box-shadow:0 8px 24px rgba(0,0,0,.18); max-width:360px; max-height:320px; overflow:auto;`;
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
    if (typeof ct === 'string')
     return `<div style="width:240px;transform:scale(.5);transform-origin:top left;">${sanitizePreview(ct)}</div>`;
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
          </html>
        `);
    doc.close();
   };

   const resolveBlock = (tile, listEl) => {
    const bid = tile?.dataset?.bid;
    if (bid) {
     const m = editor.BlockManager.get(bid);
     if (m) return m;
    }
    const idAttr = tile.getAttribute('data-id') || tile.id || tile.dataset?.id;
    if (idAttr) {
     const m = editor.BlockManager.get(idAttr);
     if (m) return m;
    }
    const tiles = Array.from(listEl.querySelectorAll('.gjs-block'));
    const idx = tiles.indexOf(tile);
    const all = editor.BlockManager.getAll();
    const labelEls = listEl.querySelectorAll('.gjs-block-label, .gjs-block__label, .gjs-title, .gjs-block .gjs-title');
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

   const mo = new MutationObserver(() => {
    console.log('Panel DOM updated');
   });
   mo.observe(panel, { childList: true, subtree: true });
  }

  enableBlockHoverPreview(editor);

  // -----------------------
  // Section: Custom Traits (Forms + Universal Links)
  // - Introduces consistent form traits and universal link traits
  // -----------------------
  function registerCmsTraits(editorInstance) {
   const dc = editorInstance.DomComponents;

   (function patchFormType() {
    const t = dc.getType('form');
    if (!t || !t.model) return;

    const Base = t.model;
    const defs = Base.prototype.defaults || {};
    const existing = Array.isArray(defs.traits) ? defs.traits : [];
    const names = new Set(existing.map(tr => tr.name || tr.get?.('name')));

    const baseForm = [
     { type: 'text', name: 'action', label: 'Action (URL)', value: '/form/save' },
     { type: 'select', name: 'method', label: 'Method', value: 'post', options: [{ id: 'post', name: 'POST' }, { id: 'get', name: 'GET' }] },
     {
      type: 'select', name: 'enctype', label: 'Enctype', options: [
       { id: '', name: 'Default' },
       { id: 'multipart/form-data', name: 'multipart/form-data' },
       { id: 'application/x-www-form-urlencoded', name: 'x-www-form-urlencoded' },
       { id: 'text/plain', name: 'text/plain' },
      ]
     },
     { type: 'checkbox', name: 'data-ajax', label: 'AJAX submit' },
    ].filter(tr => !names.has(tr.name));

    const formTypeTrait = { type: 'text', name: 'formType', label: 'Form Type', placeholder: 'contact, booking, ...', changeProp: 1 };

    dc.addType('form', {
     model: Base.extend({
      defaults: { ...defs, traits: [formTypeTrait, ...existing, ...baseForm] },
      init() {
       const syncAll = () => {
        const val = this.get('formType') || '';
        if (val) this.addAttributes({ 'data-form-type': val });
        else {
         const at = { ...(this.getAttributes() || {}) };
         delete at['data-form-type'];
         this.setAttributes(at);
        }
        let hid = this.find('input[name="_form_type"]')[0];
        if (!val) { if (hid) hid.remove(); return; }
        if (!hid) {
         hid = this.append({ tagName: 'input', attributes: { type: 'hidden', name: '_form_type', value: val } })[0];
        } else {
         hid.addAttributes({ value: val });
        }
       };

       const at = this.getAttributes() || {};
       if (at['data-form-type'] && !this.get('formType')) this.set('formType', at['data-form-type']);
       this.on('change:formType', syncAll);
       this.on('change:attributes:data-form-type', () => {
        const cur = (this.getAttributes() || {})['data-form-type'] || '';
        if (cur !== (this.get('formType') || '')) this.set('formType', cur);
       });
       this.on('change:components', syncAll);
       syncAll();
      }
     }, { isComponent: t.isComponent }),
     view: t.view
    });
   })();

   const ensureFormTraits = (form) => {
    if (!form) return;
    const attrs = form.getAttributes() || {};
    if (attrs['data-form-type']) {
     form.set('formType', attrs['data-form-type']);
    }
    if (!attrs.action) form.addAttributes({ action: '/form/save' });
    if (!attrs.method) form.addAttributes({ method: 'post' });
    if (!attrs.enctype) form.addAttributes({ enctype: '' });
    if (!attrs['data-ajax']) form.addAttributes({ 'data-ajax': false });
    const trCol = form.get('traits');
    const existingNames = new Set(trCol?.models?.map(m => m.get('name')) || []);
    ['link-title', 'link-href', 'link-target'].forEach(n => {
     const tr = form.getTrait?.(n);
     if (tr) trCol.remove(tr);
    });
    const want = [
     { type: 'text', name: 'formType', label: 'Form Type', placeholder: 'contact, booking, ...', changeProp: 1 },
     { type: 'text', name: 'action', value: '/form/save', label: 'Action (URL)' },
     { type: 'select', name: 'method', value: 'post', label: 'Method', options: [{ id: 'post', name: 'POST' }, { id: 'get', name: 'GET' }] },
     {
      type: 'select', name: 'enctype', label: 'Enctype', options: [
       { id: '', name: 'Default' },
       { id: 'multipart/form-data', name: 'multipart/form-data' },
       { id: 'application/x-www-form-urlencoded', name: 'x-www-form-urlencoded' },
       { id: 'text/plain', name: 'text/plain' },
      ]
     },
     { type: 'checkbox', name: 'data-ajax', label: 'AJAX submit' },
    ];
    want.forEach((def, idx) => { if (!existingNames.has(def.name)) form.addTrait(def, { at: idx }); });
    editorInstance.TraitManager.render(form);
    form.off('change:formType');
    form.on('change:formType', () => {
     const val = form.get('formType') || '';
     if (val) form.addAttributes({ 'data-form-type': val }); else {
      const at = { ...(form.getAttributes() || {}) }; delete at['data-form-type']; form.setAttributes(at);
     }
     let hid = form.find('input[name="_form_type"]')[0];
     if (!val) { if (hid) hid.remove(); return; }
     if (!hid) hid = form.append({ tagName: 'input', attributes: { type: 'hidden', name: '_form_type', value: val } })[0];
     else hid.addAttributes({ value: val });
    });

    const updateFormType = () => {
     const val = form.get('formType') || '';

     if (val) form.addAttributes({ 'data-form-type': val });
     else {
      const at = { ...form.getAttributes() };
      delete at['data-form-type'];
      form.setAttributes(at);
     }

     let hid = form.find('input[name="_form_type"]')[0];
     if (!val) {
      if (hid) hid.remove();
      return;
     }

     if (!hid) {
      hid = form.append({
       tagName: 'input',
       attributes: { type: 'hidden', name: '_form_type', value: val }
      })[0];
     } else {
      hid.addAttributes({ value: val });
     }
    };

    form.off('change:formType');
    form.on('change:formType', updateFormType);
    updateFormType();
   };

   editorInstance.on('component:selected', cmp => {
    if (!cmp) return;
    const asForm = (cmp.get?.('tagName') === 'form' || cmp.is?.('form')) ? cmp :
     (cmp.closest && cmp.closest('form')) || (cmp.find && cmp.find('form')[0]);
    if (asForm) {
     if (asForm !== cmp) editorInstance.select(asForm);
     ensureFormTraits(asForm);
    }
   });

   editorInstance.on('load', () => {
    editorInstance.getWrapper().find('form').forEach(ensureFormTraits);
   });

   (function universalLinkTraits() {
    const findAnchor = c => (c?.get('tagName') === 'a' || c?.is?.('link')) ? c : (c?.closest && c.closest('a')) || null;
    const syncLink = c => {
     const href = c.get('link-href') || '', title = c.get('link-title') || '', target = c.get('link-target') || '';
     let a = findAnchor(c); const needs = !!(href || title || target);
     if (needs && !a) { a = c.replaceWith({ tagName: 'a', attributes: {}, components: [c] })[0]; editorInstance.select(a); }
     if (a) {
      const attrs = a.getAttributes();
      href ? attrs.href = href : delete attrs.href;
      title ? attrs.title = title : delete attrs.title;
      target ? attrs.target = target : delete attrs.target;
      a.setAttributes(attrs);
      if (!href && !title && !target && a !== c) {
       const kids = a.components(); if (kids && kids.length) editorInstance.select(a.replaceWith(kids)[0]);
      }
     }
    };
    editorInstance.on('component:selected', c => {
     if (!c) return;
     if (c.get?.('tagName') === 'form' || c.is?.('form')) return;
     if (c.get?.('type') === 'shortcode-block') return;
     if (c.get?.('tagName') === 'a' || c.is?.('link')) return;
     if (!c.getTrait?.('link-href')) {
      c.addTrait([
       { type: 'text', name: 'link-title', label: 'Title', placeholder: 'eg. Text here', changeProp: 1 },
       { type: 'text', name: 'link-href', label: 'Href', placeholder: '#', changeProp: 1 },
       {
        type: 'select', name: 'link-target', label: 'Target', changeProp: 1,
        options: [{ id: '', label: 'This window' }, { id: '_blank', label: 'New window' }, { id: '_parent', label: 'Parent' }, { id: '_top', label: 'Top' }]
       }
      ], { at: 0 });
      const a = findAnchor(c); if (a) { const at = a.getAttributes(); c.set({ 'link-title': at.title || '', 'link-href': at.href || '', 'link-target': at.target || '' }); }
      c.on('change:link-title change:link-href change:link-target', () => syncLink(c));
     }
    });
   })();
  }

  registerCmsTraits(editor);

  // -----------------------
  // Section: Shortcode rendering helpers + config fetchers
  // -----------------------
  async function fetchRenderedShortcode(shortcodeString) {
   try {
    const tokenHeaders = csrfTokenHeader();
    const res = await fetch('/shortcode/render', {
     method: 'POST',
     headers: Object.assign({ 'Content-Type': 'application/json' }, tokenHeaders),
     body: JSON.stringify({ shortcode: shortcodeString })
    });
    if (!res.ok) {
     const txt = await res.text();
     throw new Error(`HTTP ${res.status}: ${txt}`);
    }
    return await res.json();
   } catch (e) {
    throw e;
   }
  }

  async function fetchShortcodeConfig(name) {
   const res = await fetch(`/admin/shortcodes/${name}/config`);
   if (!res.ok) throw new Error(`Config not found for ${name}`);
   return await res.json();
  }

  function escapeHtml(text) {
   if (!text) return '';
   const div = document.createElement('div');
   div.textContent = text;
   return div.innerHTML;
  }

  function openShortcodeConfigModal(editorInst, name, config, component) {
   const modal = editorInst.Modal;
   const fieldsHtml = (config.fields || []).map((f) => {
    if (f.type === 'select') {
     const opts = f.options.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
     return `<label class="block font-semibold mb-1">${escapeHtml(f.label)}</label>
                  <select name="${escapeHtml(f.name)}" class="shortcode-input border rounded w-full mb-3 p-1">${opts}</select>`;
    } else {
     return `<label class="block font-semibold mb-1">${escapeHtml(f.label)}</label>
                  <input type="${escapeHtml(f.type)}" name="${escapeHtml(f.name)}" value="${escapeHtml(f.default || '')}" class="shortcode-input border rounded w-full mb-3 p-1" />`;
    }
   }).join('');

   modal.setTitle(`Configure [${name}]`);
   modal.setContent(`
        <div class="p-3">
          ${fieldsHtml}
          <button id="applyShortcodeBtn" class="bg-indigo-600 text-white px-4 py-2 rounded w-full">Apply Shortcode</button>
        </div>
      `);
   modal.open();

   document.getElementById('applyShortcodeBtn').onclick = async () => {
    const inputs = document.querySelectorAll('.shortcode-input');
    let attrs = '';
    inputs.forEach(i => {
     const val = i.value.trim();
     if (val) {
      const valWithQuotes = /\s/.test(val) ? `"${val}"` : val;
      attrs += ` ${i.name}=${valWithQuotes}`;
     }
    });
    const shortcodeString = `[${name}${attrs}]`;
    component.set('components', shortcodeString);
    modal.close();
    if (component.debouncedRender) component.debouncedRender(shortcodeString);
   };
  }

  // -----------------------
  // Section: Shortcode-block custom type
  // -----------------------
  editor.DomComponents.addType('shortcode-block', {
   model: {
    defaults: {
     tagName: 'div',
     droppable: true,
     draggable: true,
     editable: true,
     attributes: {
      class: 'shortcode-block border border-dashed border-gray-400 rounded-md p-2 text-center text-gray-600',
     },
     components: '[property]',
     isRendered: false,
     traits: [],
    },
    init() {
     this.debouncedRender = debounce(async (shortcodeString) => {
      try {
       try { this.view && this.view.showLoading && this.view.showLoading(shortcodeString); } catch (e) { }
       const json = await fetchRenderedShortcode(shortcodeString);
       this.set({ isRendered: true });
       const html = json.html || `<div style="color:gray;">${shortcodeString} not found</div>`;
       this.components(html);
       this.addAttributes({ 'data-shortcode-original': shortcodeString });
       this.set('editable', false);
      } catch (err) {
       console.error('Shortcode render error:', err);
       this.components(`<div style="color:red;">Error loading ${shortcodeString}</div>`);
      }
     }, 400);
    }
   },

   view: {
    events: {
     dblclick: 'openConfig',
     focusout: 'onFocusOut',
    },

    async openConfig() {
     const el = this.el;
     const content = el.innerText.trim();
     const shortcodeName = extractShortcodeName(content);
     if (!shortcodeName) return alert('Please enter a shortcode like [property]');

     try {
      const config = await fetchShortcodeConfig(shortcodeName);
      openShortcodeConfigModal(this.model.editor, shortcodeName, config, this.model);
     } catch (err) {
      console.warn('Config not found for', shortcodeName, err);
     }
    },

    async onFocusOut() {
     const el = this.el;
     const content = el.innerText.trim();
     el.removeAttribute('contenteditable');
     el.style.outline = 'none';
     this.model.set('editable', false);

     if (this.model.get('isRendered')) return;

     const shortcodeName = extractShortcodeName(content);
     if (shortcodeName) {
      await this.model.debouncedRender(content);
     } else {
      this.model.components('[your_shortcode_here]');
     }
    },

    showLoading(shortcode) {
     this.model.components(`<div style="color:gray;padding:12px;text-align:center;">Loading ${shortcode}...</div>`);
    }
   }
  });

  // -----------------------
  // Section: Register shortcode blocks (dynamic from backend)
  // -----------------------
  async function registerShortcodeBlocks(editor) {
   try {
    const res = await fetch('/admin/shortcodes/all');
    const data = await res.json();
    const bm = editor.BlockManager;

    Object.entries(data).forEach(([key, cfg]) => {
     const label = cfg.title || key;
     bm.add(`shortcode-${key}`, {
      label: `[${key}]`,
      category: 'Shortcodes',
      attributes: { class: 'fa fa-code', 'data-shortcode': key },
      content: {
       type: 'shortcode-block',
       components: `[${key}]`,
       attributes: { 'data-shortcode': key },
      },
      hoverPreview: `<div style="padding:8px;border:1px dashed #999;text-align:center;">[${key}]</div>`
     });
    });
   } catch (err) {
    console.error('Error loading shortcodes list', err);
   }
  }

  registerShortcodeBlocks(editor);

  // -----------------------
  // Section: Trait wiring for shortcodes when selected
  // - Converts shortcode config into GrapesJS traits and auto-renders on change
  // -----------------------
  editor.on('component:selected', async (model) => {
   if (!model || model.get('type') !== 'shortcode-block') return;

   const attrsObj = (typeof model.getAttributes === 'function') ? model.getAttributes() : (model.get('attributes') || {});
   const originalShortcodeFromAttr = attrsObj['data-shortcode-original'] || attrsObj['data-shortcode'] || '';

   let content = '';
   try {
    const comps = model.get('components');
    if (typeof comps === 'string') {
     content = comps;
    } else if (comps && typeof comps === 'object') {
     if (typeof comps.at === 'function') {
      const first = comps.at(0);
      content = first?.get?.('content') || first?.get?.('components') || '';
      if (typeof content !== 'string') content = model.get('content') || '';
     } else if (Array.isArray(comps)) {
      content = (comps[0] && (comps[0].content || '')) || model.get('content') || '';
     } else {
      content = model.get('content') || '';
     }
    } else {
     content = model.get('content') || '';
    }
   } catch (e) {
    content = model.get('content') || '';
   }
   content = (content + '').toString().trim();

   const shortcodeText = originalShortcodeFromAttr || content;
   const shortcodeName = extractShortcodeName(shortcodeText);
   if (!shortcodeName) return;

   try {
    const config = await fetchShortcodeConfig(shortcodeName);
    const traitDefs = (config.fields || []).map((f) => {
     if (f.type === 'select') {
      return {
       type: 'select',
       name: f.name,
       label: f.label,
       options: (f.options || []).map(opt => ({ id: opt, name: opt })),
       changeProp: 1,
      };
     } else {
      return {
       type: f.type === 'number' ? 'number' : 'text',
       name: f.name,
       label: f.label,
       placeholder: f.default || '',
       changeProp: 1,
      };
     }
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
      if (cfgField && cfgField.default !== undefined) {
       model.set(td.name, String(cfgField.default));
      }
     }
    });

    if (!model.__shortcodeTraitHandlers) model.__shortcodeTraitHandlers = {};
    Object.keys(model.__shortcodeTraitHandlers).forEach(oldName => {
     try { model.off(`change:${oldName}`, model.__shortcodeTraitHandlers[oldName]); } catch (e) { /* ignore */ }
    });
    model.__shortcodeTraitHandlers = {};

    traitDefs.forEach(tr => {
     const handler = async () => {
      const values = traitDefs
       .filter(t => t.name !== 'type' || shortcodeName !== 'property')
       .map((t) => {
        const v = model.get(t.name);
        if (!v && v !== 0) return '';
        const valWithQuotes = `"${String(v).replace(/"/g, '\\"')}"`;
        return `${t.name}=${valWithQuotes}`;
       })
       .filter(Boolean)
       .join(' ');

      const shortcodeStr = values ? `[${shortcodeName} ${values}]` : `[${shortcodeName}]`;

      try { model.addAttributes({ 'data-shortcode-original': shortcodeStr }); } catch (e) { /* ignore */ }

      try {
       if (model.debouncedRender) await model.debouncedRender(shortcodeStr);
      } catch (err) {
       console.error('Error auto-rendering shortcode', err);
      }
     };

     model.__shortcodeTraitHandlers[tr.name] = handler;
     model.on(`change:${tr.name}`, handler);
    });

   } catch (err) {
    console.error('Trait config load error:', err);
   }
  });

  // -----------------------
  // Section: Auto-render shortcode after drop (component:add)
  // - When a shortcode block is added, auto-render using defaults and load traits
  // -----------------------
  editor.on('component:add', async (cmp) => {
   if (!cmp || cmp.get('type') !== 'shortcode-block') return;

   const shortcodeName =
    cmp.getAttributes()['data-shortcode'] ||
    extractShortcodeName(cmp.get('components'));
   if (!shortcodeName) return;

   try {
    const config = await fetchShortcodeConfig(shortcodeName);

    const attrs = (config.fields || [])
     .map((f) => {
      const def = f.default ?? '';
      if (!def || def === '') return '';
      const valWithQuotes = /\s/.test(String(def)) ? `"${def}"` : def;
      return `${f.name}=${valWithQuotes}`;
     })
     .filter(Boolean)
     .join(' ');

    const shortcodeString = attrs
     ? `[${shortcodeName} ${attrs}]`
     : `[${shortcodeName}]`;

    cmp.components(
     `<div style="color:gray;padding:12px;text-align:center;">Loading ${shortcodeName}...</div>`
    );

    cmp.addAttributes({ 'data-shortcode-original': shortcodeString });

    await cmp.debouncedRender(shortcodeString);

    editor.select(cmp);
    editor.trigger('component:selected', { model: cmp });

    setTimeout(async () => {
     try {
      const config = await fetchShortcodeConfig(shortcodeName);
      const traitDefs = (config.fields || []).map((f) => {
       if (f.type === 'select') {
        return {
         type: 'select',
         name: f.name,
         label: f.label,
         options: (f.options || []).map((o) => ({ id: o, name: o })),
         changeProp: 1,
        };
       } else {
        return {
         type: f.type === 'number' ? 'number' : 'text',
         name: f.name,
         label: f.label,
         placeholder: f.default || '',
         changeProp: 1,
        };
       }
      });

      cmp.set('traits', traitDefs);
      editor.TraitManager.render(cmp);

      const traitsTab = document.getElementById('tab-traits');
      if (traitsTab) traitsTab.click();
     } catch (err) {
      console.warn('Auto trait load failed:', err);
     }
    }, 400);
   } catch (err) {
    console.error(`Auto-render failed for [${shortcodeName}]`, err);
    cmp.components(
     `<div style="color:red;">Error loading [${shortcodeName}]</div>`
    );
   }
  });

  // -----------------------
  // Section: Save / Component utilities
  // - Save single component as reusable component (server-side)
  // -----------------------
  editor.Commands.add('save-component', {
   run(editorInstance) {
    const selected = editorInstance.getSelected();
    if (!selected) return alert('Please select an element to save as a component.');

    const name = prompt('Enter component name:');
    if (!name) return;

    const id = selected.getId();
    const html = selected.toHTML();
    let css = '';

    try {
     const allCss = editorInstance.getCss();
     const regex = new RegExp(`#${id}\\s*{[\\s\\S]*?}`, 'g');
     const matches = allCss.match(regex);
     if (matches && matches.length > 0) css = matches.join('\n\n');
    } catch (e) {
     console.warn('Error extracting from editor.getCss', e);
    }

    if (!css.trim()) {
     try {
      const frame = editorInstance.Canvas.getFrameEl();
      const doc = frame?.contentDocument;
      const win = frame?.contentWindow;
      const el = doc?.querySelector(`#${id}`);
      if (el && win) {
       const styles = win.getComputedStyle(el);
       const includeProps = [
        'color', 'background-color', 'font-size', 'font-family', 'font-weight', 'text-align', 'margin', 'padding',
        'border', 'border-radius', 'width', 'height', 'display', 'justify-content', 'align-items', 'flex-direction',
        'gap', 'line-height', 'opacity', 'overflow', 'z-index', 'cursor', 'position', 'top', 'left', 'right', 'bottom',
        'transform', 'transition', 'box-shadow'
       ];
       css = `#${id} {\n`;
       for (const prop of includeProps) {
        const val = styles.getPropertyValue(prop);
        if (val && !['initial', 'auto', 'none', '0px', 'transparent'].includes(val)) {
         css += `  ${prop}: ${val};\n`;
        }
       }
       css += `}\n`;
      }
     } catch (e) {
      console.warn('Computed style extraction failed:', e);
     }
    }

    if (!css.trim()) {
     try {
      const styleObj = selected.getStyle();
      if (Object.keys(styleObj).length > 0) {
       css = `#${id} {\n`;
       for (const [key, val] of Object.entries(styleObj)) css += `  ${key}: ${val};\n`;
       css += `}\n`;
      }
     } catch (e) {
      console.warn('Inline style extraction failed:', e);
     }
    }

    if (!css.trim()) css = `#${id} {}`;

    fetch('/admin/components/save', {
     method: 'POST',
     headers: Object.assign({ 'Content-Type': 'application/json' }, csrfTokenHeader()),
     body: JSON.stringify({ name, category: 'Custom Components', html, css }),
    })
     .then(res => res.json())
     .then(data => {
      if (data.success) {
       alert('✅ Component saved successfully!');
       if (typeof loadCustomComponents === 'function') loadCustomComponents(editorInstance);
      } else {
       alert('❌ Error saving component.');
      }
     })
     .catch(err => {
      console.error('Error saving component:', err);
      alert('❌ Failed to save component.');
     });
   }
  });

  try {
   document.getElementById('btn-save-component')?.addEventListener('click', () => {
    editor.runCommand('save-component');
   });
  } catch (e) { /* ignore */ }

  // -----------------------
  // Section: Load server components (custom + page)
  // -----------------------
  async function loadCustomComponents(editorInst) {
   try {
    const res = await fetch('/admin/components/list', { cache: 'no-store' });
    const data = await res.json();
    if (!data.success || !Array.isArray(data.components)) return;
    const bm = editorInst.BlockManager;
    data.components.forEach(comp => {
     if (comp.category == 'Custom Components') {
      const wrappedHtml = `<div>
              <style>${comp.css || ''}</style>
              ${comp.html}</div>`;
      bm.add(`custom-${comp.id}`, {
       label: comp.name,
       category: comp.category || 'Custom Components',
       attributes: { class: 'fa fa-cube', 'data-bid': `custom-${comp.id}` },
       content: wrappedHtml,
       preview: `<div style="width:240px;transform:scale(.5);transform-origin:top left;">${sanitizePreview(comp.html)}</div>`,
       hoverPreview: `<div style="width:240px;transform:scale(.5);transform-origin:top left;">${sanitizePreview(comp.html)}</div>`
      });
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
     if (comp.category == 'Page Components') {
      const content = comp.html;
      bm.add(`page-${comp.id}`, {
       label: comp.name || `Page Components ${comp.id}`,
       category: '📄 Page Components',
       attributes: { class: 'fa fa-file', 'data-bid': `page-${comp.id}` },
       content,
       componentId: comp.id,
       componentName: comp.name,
       preview: `<div style="width:240px;transform:scale(.5);transform-origin:top left;">${sanitizePreview(comp.html)}</div>`,
       hoverPreview: `<div style="width:240px;transform:scale(.5);transform-origin:top left;">${sanitizePreview(comp.html)}</div>`
      });
     }
    });
   } catch (err) {
    console.error('Error loading page components:', err);
   }
  }

  loadCustomComponents(editor);
  loadPageComponents(editor);

  // -----------------------
  // Section: Shortcode serialization (convert components back to shortcode strings before save)
  // -----------------------
  function serializeShortcodes(editor) {
   const wrapper = document.createElement('div');
   wrapper.innerHTML = editor.getHtml();

   wrapper.querySelectorAll('.shortcode-block').forEach(el => {
    const shortcodeText = el.getAttribute('data-shortcode-original');
    if (shortcodeText) {
     el.innerHTML = '';
     el.outerHTML = shortcodeText;
    }
   });

   return wrapper.innerHTML;
  }

  // -----------------------
  // Section: Save page / component helpers
  // -----------------------
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
    headers: Object.assign({
     'Content-Type': 'application/json',
     'Accept': 'application/json',
    }, csrfTokenHeader()),
    body: JSON.stringify({
     title: document.getElementById('page-title')?.value || '',
     html, css, ...meta,
    }),
   });
   return await response.json();
  }

  let isSaving = false;
  async function savePageAsComponent(url) {
   if (isSaving) return;
   isSaving = true;
   try {
    const html = editor.getHtml();
    const css = editor.getCss ? editor.getCss() : '';
    const js = editor.getJs ? editor.getJs() : '';
    let id = document.getElementById('component-id')?.value || null;
    if (!id) {
     const wrapper = editor.getWrapper();
     const dbWrapper = wrapper.find('.page-component-wrapper')[0];
     if (dbWrapper) id = dbWrapper.getAttributes()['data-db-id'] || null;
    }
    const name = (document.getElementById('component-name')?.value || 'Untitled component').trim();
    const payload = { id, name, category: 'Page Components', html, js };
    if (css && css.trim().length > 0) payload.css = css;
    const response = await fetch(url, {
     method: 'POST',
     headers: Object.assign({ 'Content-Type': 'application/json', Accept: 'application/json' }, csrfTokenHeader()),
     body: JSON.stringify(payload),
    });
    const data = await response.json();
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
   } finally {
    isSaving = false;
   }
  }

  // -----------------------
  // Section: Save modal / Save hooks
  // -----------------------
  try {
   const modal = document.getElementById("saveOptionModal");
   const btnSave = document.getElementById("btn-save");
   const saveAsPageBtn = document.getElementById("saveAsPage");
   let val = document.getElementById("saveAsPage")?.value || 'page';
   const saveAsComponentBtn = document.getElementById("saveAsComponent");
   const cancelSaveBtn = document.getElementById("cancelSave");

   if (btnSave && modal) {
    const showModal = () => {
     modal.classList.add("show");
     modal.style.display = "grid";
     modal.style.placeItems = "center";
    };
    const hideModal = () => (modal.classList.remove("show"));
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

  // -----------------------
  // Section: Preview / Publish buttons
  // -----------------------
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

  // -----------------------
  // Section: Code views (HTML / CSS)
  // - Uses CodeMirror if available
  // -----------------------
  try {
   document.getElementById('btn-html-view').addEventListener('click', () => {
    let htmlCode = editor.getHtml();
    if (typeof html_beautify !== 'undefined') {
     htmlCode = html_beautify(htmlCode, { indent_size: 2, wrap_line_length: 80 });
    }
    openCodeModal('HTML Code View', htmlCode, 'htmlmixed');
   });
   document.getElementById('btn-css-view').addEventListener('click', () => {
    let cssCode = editor.getCss();
    if (typeof css_beautify !== 'undefined') {
     cssCode = css_beautify(cssCode, { indent_size: 2, wrap_line_length: 80 });
    }
    openCodeModal('CSS Code View', cssCode, 'css');
   });
  } catch (e) { /* not fatal */ }

  // -----------------------
  // Section: Sidebar show/hide behavior and UI tweaks
  // -----------------------
  editor.on('component:selected', () => {
   const sidebar = document.querySelector('.custom-sidebar');
   if (sidebar) sidebar.style.display = 'block';
  });
  editor.on('canvas:drop', () => {
   const sidebar = document.querySelector('.custom-sidebar');
   if (sidebar) sidebar.style.display = 'block';
  });
  editor.on('canvas:click', (ev) => {
   if (!editor.getSelected()) {
    const sidebar = document.querySelector('.custom-sidebar');
    if (sidebar) sidebar.style.display = 'none';
   }
  });

  editor.on('load', () => {
   const uiCat = bm.getCategories().find(cat => cat.id === 'UI');
   if (uiCat) {
    const heroBlks = bm.getAll().filter(b => {
     const cat = b.get('category');
     return cat && (cat.id === 'UI/Hero' || cat === 'UI/Hero');
    });
    heroBlks.forEach(b => b.set('category', uiCat));
   }
  });

  editor.on('block:drag:stop', () => {
   const sel = editor.getSelected();
   const form = sel?.is('form') ? sel : sel?.find('form')[0];
   if (form) { editor.select(form); document.getElementById('tab-traits')?.click(); }
  });

  // -----------------------
  // Section: Deserialize shortcodes (when loading stored HTML)
  // - Converts [shortcode ...] text nodes into shortcode-block components
  // -----------------------
  function deserializeShortcodes(html) {
   if (!html) return html;

   const wrapper = document.createElement('div');
   wrapper.innerHTML = html;

   const walker = document.createTreeWalker(
    wrapper,
    NodeFilter.SHOW_TEXT,
    null,
    false
   );

   const nodesToReplace = [];
   let textNode;
   while ((textNode = walker.nextNode())) {
    if (textNode.nodeValue.includes('[') && textNode.nodeValue.includes(']')) {
     nodesToReplace.push(textNode);
    }
   }

   nodesToReplace.forEach(node => {
    const parent = node.parentNode;
    const text = node.nodeValue;

    const shortcodeRegex = /\[([a-zA-Z0-9_-]+)(?:\s+([^\]]*))?\]/g;
    let lastIndex = 0;
    let match;

    while ((match = shortcodeRegex.exec(text)) !== null) {
     if (match.index > lastIndex) {
      parent.insertBefore(
       document.createTextNode(text.substring(lastIndex, match.index)),
       node
      );
     }

     const shortcodeDiv = document.createElement('div');
     shortcodeDiv.setAttribute('data-gjs-type', 'shortcode-block');
     shortcodeDiv.setAttribute('data-shortcode-original', match[0]);
     shortcodeDiv.setAttribute('class', 'shortcode-block border border-dashed border-gray-400 rounded-md p-2 text-center text-gray-600');
     shortcodeDiv.innerHTML = `<div style="color:gray;padding:12px;text-align:center;">Loading ${match[1]}...</div>`;

     parent.insertBefore(shortcodeDiv, node);
     lastIndex = shortcodeRegex.lastIndex;
    }

    if (lastIndex < text.length) {
     parent.insertBefore(
      document.createTextNode(text.substring(lastIndex)),
      node
     );
    }

    parent.removeChild(node);
   });

   return wrapper.innerHTML;
  }

  // -----------------------
  // Section: Load page initial HTML (PAGE_HTML) or blank placeholder
  // -----------------------
  if (typeof PAGE_ID !== "undefined" && typeof PAGE_HTML !== 'undefined' && PAGE_HTML) {
   try {
    const deserializedHTML = deserializeShortcodes(PAGE_HTML);
    editor.setComponents(deserializedHTML);
    editor.setStyle(PAGE_CSS || '');

    setTimeout(() => {
     const wrapper = editor.getWrapper();
     if (wrapper) {
      const allShortcodes = wrapper.find('.shortcode-block');
      allShortcodes.forEach(async (cmp) => {
       try {
        const shortcodeStr = cmp.getAttributes()['data-shortcode-original'] || '';
        if (shortcodeStr && cmp.debouncedRender) {
         await cmp.debouncedRender(shortcodeStr);
        }
       } catch (e) {
        console.warn('Error auto-rendering loaded shortcode:', e);
       }
      });
     }
    }, 500);
   } catch (e) { console.warn('Error setting PAGE_HTML', e); }
  } else {
   try {
    const wrapper = editor.getWrapper();
    wrapper.set({
     droppable: true,
     style: {
      'min-height': '100vh',
      'padding': '20px',
      'background': '#fafafa'
     }
    });

    wrapper.append(`
          <div style="padding: 40px; text-align: center; color: #aaa; border: 2px dashed #ddd; border-radius: 8px; margin: 20px auto; max-width: 800px; background: white;">
            <p style="font-size: 20px; margin: 10px 0; font-weight: 500;">👋 Start Building Your Page</p>
            <p style="font-size: 14px; margin: 10px 0;">Drag and drop components from the sidebar anywhere on this canvas</p>
            <p style="font-size: 12px; margin: 10px 0; color: #999;">You can delete this placeholder and start fresh</p>
          </div>
        `);
   } catch (e) {
    console.warn('Error initializing blank canvas', e);
    try {
     const wrapper = editor.getWrapper();
     wrapper.set('droppable', true);
    } catch (e2) { console.warn('Fallback wrapper init failed', e2); }
   }
  }

  // -----------------------
  // Section: Code modal (CodeMirror) helper
  // -----------------------
  function openCodeModal(title, code, mode) {
   const modalEl = document.createElement('div');
   modalEl.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: #1e1e2f; z-index: 9999; display: flex; flex-direction: column; overflow: hidden;`;
   modalEl.innerHTML = `
        <div style="background:#111827;color:#fff;padding:10px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #333;flex-shrink:0;">
          <h4 style="margin:0;font-size:16px;">${title}</h4>
          <button id="close-code-view" style="background:#ef4444;border:none;color:#fff;padding:6px 12px;border-radius:4px;cursor:pointer;">Close</button>
        </div>
        <div id="code-editor-container" style="flex: 1; display: flex; overflow: hidden; width: 100%; height: 100%;">
          <textarea id="code-view-area" style="flex:1;width:100%;height:100%;border:none;outline:none;resize:none;font-size:14px;"></textarea>
        </div>`;
   document.body.appendChild(modalEl);
   const cm = CodeMirror.fromTextArea(document.getElementById('code-view-area'), {
    mode, theme: 'dracula', lineNumbers: true, lineWrapping: true, readOnly: true, viewportMargin: Infinity,
   });
   cm.setValue(code);
   setTimeout(() => {
    const cmEl = modalEl.querySelector('.CodeMirror');
    const container = document.getElementById('code-editor-container');
    Object.assign(container.style, { display: 'flex', flex: '1', width: '100%', height: '100%' });
    Object.assign(cmEl.style, { width: '100%', height: '100%', flex: '1', maxWidth: 'none', overflow: 'auto' });
    cm.refresh();
   }, 150);
   modalEl.querySelector('#close-code-view').addEventListener('click', () => {
    cm.toTextArea();
    modalEl.remove();
   });
  }

  // -----------------------
  // Section: Sidebar tabs switching
  // -----------------------
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
    tabs[key].style.display = key === name ? 'block' : 'none';
    tabButtons[key].classList.toggle('bg-gray-800', key === name);
    tabButtons[key].classList.toggle('active', key === name);
   });

   if (name === 'layers') editor.LayerManager.render();
   if (name === 'styles') editor.StyleManager.render();
   if (name === 'traits') editor.TraitManager.render();
   if (name === 'assets') {
    editor.AssetManager.render();

    if (editor.AssetManager.getAll().length === 0) {
     console.log('🔄 Assets tab opened, triggering initial load...');
     editor.AssetManager.load();
    }

    setTimeout(() => {
     const assetsTab = document.getElementById('assets');
     if (assetsTab && !assetsTab.querySelector('.custom-media-ui')) {
      renderCustomMediaUI();
     } else if (assetsTab) {
      renderCustomMediaUI();
     }
    }, 100);
   }
  }

  Object.keys(tabButtons).forEach((key) => {
   tabButtons[key]?.addEventListener('click', () => showTab(key));
  });

  showTab('blocks');

  editor.on('component:selected', (cmp) => {
   if (!cmp) return;
   if (cmp.get('type') === 'shortcode-block') showTab('traits');
  });

  // -----------------------
  // Section: Inject enhanced CSS for UI
  // -----------------------
  const sidebarStyle = document.createElement('style');
  sidebarStyle.innerHTML = `
  /* Sidebar Navigation */
  #sidebar-nav button.active {
    background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
    font-weight: 700;
    color: white;
    border-left: 4px solid #60a5fa;
    box-shadow: inset 0 2px 8px rgba(37, 99, 235, 0.2);
    transform: translateX(2px);
  }
  #sidebar-nav button {
    transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    border-radius: 6px;
    margin: 4px 0;
    font-size: 13px;
    font-weight: 500;
  }
  #sidebar-nav button:hover {
    background-color: #374151;
    transform: translateX(2px);
  }

  /* Tab Content */
  .tab-content {
    display: none;
    animation: fadeIn 0.2s ease-in-out;
  }
  .tab-content[style*="display: block"] {
    animation: fadeIn 0.2s ease-in-out;
  }
  
  /* Traits Panel Enhancement */
  .gjs-trait-label {
    font-weight: 600;
    font-size: 12px;
    color: #e5e7eb;
    margin-bottom: 6px;
  }
  .gjs-trait-input {
    background-color: #1f2937 !important;
    border: 1px solid #374151 !important;
    color: white !important;
    border-radius: 6px !important;
    padding: 8px 10px !important;
    font-size: 12px !important;
    transition: all 0.2s ease;
  }
  .gjs-trait-input:focus {
    border-color: #3b82f6 !important;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1) !important;
    background-color: #111827 !important;
  }
  .gjs-trait-input:hover {
    border-color: #4b5563 !important;
  }

  /* Layers Panel Enhancement */
  .gjs-layer-name {
    padding: 6px 8px;
    border-radius: 4px;
    transition: all 0.2s ease;
  }
  .gjs-layer-name:hover {
    background-color: rgba(59, 130, 246, 0.1);
  }

  /* Selected Component Highlight */
  .gjs-component-selected {
    border: 2px solid #3b82f6 !important;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2) !important;
  }

  /* Styles Panel Enhancement */
  .gjs-sm-property-name {
    font-weight: 600;
    color: #e5e7eb;
    font-size: 12px;
  }

  /* Media Grid Enhancement */
  .gjs-am-assets-cont {
    background: #0f172a;
    border-radius: 8px;
    padding: 8px;
  }

  /* Animations */
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes slideIn {
    from { transform: translateX(400px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(400px); opacity: 0; }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  /* Smooth Scrollbar */
  #traits::-webkit-scrollbar,
  #styles::-webkit-scrollbar,
  #layers::-webkit-scrollbar,
  #assets::-webkit-scrollbar {
    width: 6px;
  }
  #traits::-webkit-scrollbar-track,
  #styles::-webkit-scrollbar-track,
  #layers::-webkit-scrollbar-track,
  #assets::-webkit-scrollbar-track {
    background: #1a1f35;
    border-radius: 10px;
  }
  #traits::-webkit-scrollbar-thumb,
  #styles::-webkit-scrollbar-thumb,
  #layers::-webkit-scrollbar-thumb,
  #assets::-webkit-scrollbar-thumb {
    background: #3b82f6;
    border-radius: 10px;
  }
  #traits::-webkit-scrollbar-thumb:hover,
  #styles::-webkit-scrollbar-thumb:hover,
  #layers::-webkit-scrollbar-thumb:hover,
  #assets::-webkit-scrollbar-thumb:hover {
    background: #2563eb;
  }
`;
  document.head.appendChild(sidebarStyle);

  // -----------------------
  // Section: Re-render shortcodes inside iframe on load (DOM-safe)
  // - Finds text nodes containing shortcodes and replaces with server-rendered HTML.
  // -----------------------
  async function renderShortcodesOnLoad(editor) {
   const frame = editor.Canvas.getFrameEl();
   if (!frame) return;
   let doc;
   try {
    doc = frame.contentDocument || frame.contentWindow.document;
   } catch (e) {
    console.warn('Cannot access iframe document (CSP or cross-origin):', e);
    return;
   }
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

   for (const textNode of targets) {
    const original = textNode.nodeValue || '';
    let lastIdx = 0;
    let match;
    const frag = doc.createDocumentFragment();

    const re = /\[([a-zA-Z0-9_-]+)([^\]]*)\]/g;

    while ((match = re.exec(original)) !== null) {
     const before = original.slice(lastIdx, match.index);
     if (before) frag.appendChild(doc.createTextNode(before));

     const shortcodeString = match[0];
     const shortcodeName = match[1];

     let safeHtml;
     try {
      const json = await fetchRenderedShortcode(shortcodeString);
      safeHtml = json.html || `<div style="color:gray;">${shortcodeString} not found</div>`;
     } catch (e) {
      safeHtml = `<div style="color:red;">Error loading ${shortcodeString}</div>`;
     }

     const wrap = doc.createElement('div');
     wrap.className = 'shortcode-block border border-dashed border-gray-400 rounded-md p-2 text-center text-gray-600';
     wrap.setAttribute('data-shortcode', shortcodeName);
     wrap.setAttribute('data-shortcode-original', shortcodeString);
     wrap.innerHTML = safeHtml;

     frag.appendChild(wrap);
     lastIdx = re.lastIndex;
    }

    const rest = original.slice(lastIdx);
    if (rest) frag.appendChild(doc.createTextNode(rest));

    if (textNode.parentNode) textNode.parentNode.replaceChild(frag, textNode);
   }

   editor.setComponents(editor.getHtml());
  }

  editor.on('load', () => {
   renderShortcodesOnLoad(editor);
  });

 }); // end DOMContentLoaded

})(); // IIFE ends
