import {
  bootstrapStudio,
  loadSiteEditorState,
  marketingCfg,
  publicMediaUrl,
  publishSiteSubdomain,
  requireSession,
  saveSiteSetting,
  uploadToStyleCovers,
} from '/js/studio-api.js';
import { liveSiteUrl } from '/js/studio-access.js';
import { buildSitePreviewHtml } from '/js/site-preview.js';
import {
  FONT_IDS,
  HERO_LAYOUTS,
  LOCATION_PARTS,
  SECTION_IDS,
  normalizeSiteContent,
  normalizeSiteTheme,
  normalizeSiteProducts,
} from '/js/site-normalize.js';
import {
  checkSubdomainAvailability,
  normalizeSubdomain,
  suggestAlternatives,
} from '/js/subdomain-utils.js';

const TABS = [
  { id: 'style', label: 'Style' },
  { id: 'photos', label: 'Photos' },
  { id: 'content', label: 'Content' },
  { id: 'location', label: 'Location' },
  { id: 'publish', label: 'Publish' },
];

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const state = {
  ctx: null,
  editor: null,
  activeTab: 'style',
  previewMode: localStorage.getItem('styld_editor_preview_mode') || 'split',
  saveStatus: 'idle',
  isSaving: false,
  pendingContent: false,
  pendingTheme: false,
  pendingProducts: false,
  contentTimer: null,
  themeTimer: null,
  productsTimer: null,
  domainTimer: null,
  domainCheck: null,
};

function setSaveStatus(status) {
  state.saveStatus = status;
  const el = document.getElementById('editor-save-status');
  if (!el) return;
  el.textContent =
    status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : status === 'error' ? 'Save failed' : '';
  el.className = 'site-editor__status' + (status === 'saving' ? ' is-saving' : status === 'saved' ? ' is-saved' : '');
}

function scheduleContentSave() {
  state.pendingContent = true;
  clearTimeout(state.contentTimer);
  state.contentTimer = setTimeout(flushContentSave, 700);
}

function scheduleThemeSave() {
  state.pendingTheme = true;
  clearTimeout(state.themeTimer);
  state.themeTimer = setTimeout(flushThemeSave, 700);
}

function scheduleProductsSave() {
  state.pendingProducts = true;
  clearTimeout(state.productsTimer);
  state.productsTimer = setTimeout(flushProductsSave, 700);
}

async function flushContentSave() {
  if (!state.editor) return;
  state.pendingContent = false;
  setSaveStatus('saving');
  try {
    await saveSiteSetting(state.ctx.session.user.id, 'site_content', state.editor.content);
    setSaveStatus('saved');
    refreshPreview();
  } catch (e) {
    setSaveStatus('error');
    console.error(e);
  }
}

async function flushThemeSave() {
  if (!state.editor) return;
  state.pendingTheme = false;
  setSaveStatus('saving');
  try {
    await saveSiteSetting(state.ctx.session.user.id, 'site_theme', state.editor.theme);
    setSaveStatus('saved');
    refreshPreview();
  } catch (e) {
    setSaveStatus('error');
    console.error(e);
  }
}

async function flushProductsSave() {
  if (!state.editor) return;
  state.pendingProducts = false;
  setSaveStatus('saving');
  try {
    await saveSiteSetting(state.ctx.session.user.id, 'products_catalog', state.editor.products);
    setSaveStatus('saved');
  } catch (e) {
    setSaveStatus('error');
  }
}

async function flushAllSaves() {
  clearTimeout(state.contentTimer);
  clearTimeout(state.themeTimer);
  clearTimeout(state.productsTimer);
  const jobs = [];
  if (state.pendingContent) jobs.push(flushContentSave());
  if (state.pendingTheme) jobs.push(flushThemeSave());
  if (state.pendingProducts) jobs.push(flushProductsSave());
  if (jobs.length) await Promise.all(jobs);
}

function refreshPreview() {
  if (!state.editor) return;
  const html = buildSitePreviewHtml({
    content: state.editor.content,
    theme: state.editor.theme,
    styles: state.editor.styles,
    supabaseUrl: marketingCfg().supabaseUrl,
  });
  document.querySelectorAll('[data-preview-frame]').forEach(function (frame) {
    frame.srcdoc = html;
  });
}

function bindInput(selector, obj, key, onChange) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.addEventListener('input', function () {
    if (el.type === 'checkbox') {
      obj[key] = el.checked;
    } else {
      obj[key] = el.value;
    }
    if (onChange) onChange();
  });
  el.addEventListener('change', function () {
    if (el.type === 'checkbox') {
      obj[key] = el.checked;
    } else {
      obj[key] = el.value;
    }
    if (onChange) onChange();
  });
}

function renderStyleTab() {
  const c = state.editor.content;
  const t = state.editor.theme;
  return (
    '<div class="editor-section"><h3>Brand & hero copy</h3>' +
    field('Brand name', 'editor-brand', c.brandName) +
    field('Hero left', 'editor-tagline-left', c.taglineLeft) +
    field('Hero line 1', 'editor-tagline-r1', c.taglineRightLine1) +
    field('Hero line 2', 'editor-tagline-r2', c.taglineRightLine2) +
    textarea('Hero description', 'editor-hero-desc', c.heroDescription) +
    textarea('Footer text', 'editor-footer', c.footerText) +
    field('Meta description', 'editor-meta', c.metaDescription) +
    '</div>' +
    '<div class="editor-section"><h3>Colors & typography</h3>' +
    '<div class="editor-row">' +
    colorField('Accent', 'editor-primary', t.primaryColor) +
    colorField('Text', 'editor-secondary', t.secondaryColor) +
    colorField('Background', 'editor-bg', t.backgroundColor) +
    colorField('Navbar', 'editor-navbar', t.navbarColor || t.backgroundColor) +
    '</div>' +
    selectField(
      'Font',
      'editor-font',
      FONT_IDS.map(function (f) {
        return { value: f, label: f };
      }),
      t.fontFamily,
    ) +
    selectField(
      'Service cards',
      'editor-card-layout',
      [
        { value: 'card', label: 'Filled cards' },
        { value: 'outlined', label: 'Outlined' },
      ],
      t.styleCardLayout,
    ) +
    toggle('Hide Book Now button', 'editor-hide-book', t.hideBookNowButton) +
    '</div>'
  );
}

function renderPhotosTab() {
  const t = state.editor.theme;
  const heroUrl = publicMediaUrl(t.heroImagePath);
  const logoUrl = publicMediaUrl(t.logoImagePath);
  return (
    '<div class="editor-section"><h3>Hero layout</h3>' +
    selectField(
      'Layout',
      'editor-hero-layout',
      HERO_LAYOUTS.map(function (l) {
        return { value: l, label: l };
      }),
      t.heroLayout,
    ) +
    toggle('Cover blur', 'editor-hero-blur', t.heroCoverBlur) +
    '</div>' +
    '<div class="editor-section"><h3>Images</h3>' +
    uploadBlock('Hero image', 'editor-hero-upload', heroUrl, 'hero') +
    uploadBlock('Logo', 'editor-logo-upload', logoUrl, 'logo') +
    '</div>'
  );
}

function renderContentTab() {
  const c = state.editor.content;
  let toggles = '<div class="editor-section"><h3>Section visibility</h3>';
  SECTION_IDS.forEach(function (id) {
    const hidden = c.hiddenSections.indexOf(id) !== -1;
    toggles +=
      '<label class="editor-toggle"><input type="checkbox" data-section-toggle="' +
      esc(id) +
      '"' +
      (hidden ? '' : ' checked') +
      '> Show ' +
      esc(id) +
      '</label>';
  });
  toggles += '</div>';

  return (
    toggles +
    '<div class="editor-section"><h3>About Me</h3>' +
    field('About title', 'editor-about-title', c.aboutTitle) +
    textarea('About body', 'editor-about-body', c.aboutBody) +
    '</div>' +
    '<div class="editor-section"><h3>Visit</h3>' +
    field('Visit title', 'editor-visit-title', c.visitTitle) +
    textarea('Visit blurb', 'editor-visit-body', c.visitBody) +
    '</div>' +
    '<div class="editor-section"><h3>Policies</h3>' +
    textarea('Booking policy', 'editor-policy', c.bookingPolicy) +
    '</div>' +
    '<div class="editor-section"><h3>Services menu copy</h3>' +
    field('Menu title', 'editor-menu-title', c.menuTitle) +
    textarea('Menu blurb', 'editor-menu-blurb', c.menuBlurb) +
    '<p style="font-size:.8125rem;color:var(--white-dim)">Service items and prices are edited in Settings → Styles (Part 6).</p>' +
    '</div>' +
    '<div class="editor-section"><h3>FAQ</h3>' +
    field('FAQ title', 'editor-faq-title', c.faqTitle) +
    textarea('FAQ blurb', 'editor-faq-blurb', c.faqBlurb) +
    textarea(
      'FAQ items (one per line: question | answer)',
      'editor-faq-items',
      (c.faqItems || [])
        .map(function (item) {
          return item.question + ' | ' + item.answer;
        })
        .join('\n'),
    ) +
    '</div>' +
    '<div class="editor-section"><h3>Shop section copy</h3>' +
    field('Products title', 'editor-products-title', c.productsTitle) +
    textarea('Products blurb', 'editor-products-blurb', c.productsBlurb) +
    '</div>'
  );
}

function renderLocationTab() {
  const c = state.editor.content;
  let toggles = '<div class="editor-section"><h3>Location blocks</h3>';
  LOCATION_PARTS.forEach(function (id) {
    const hidden = c.hiddenLocationParts.indexOf(id) !== -1;
    toggles +=
      '<label class="editor-toggle"><input type="checkbox" data-location-toggle="' +
      esc(id) +
      '"' +
      (hidden ? '' : ' checked') +
      '> Show ' +
      esc(id) +
      '</label>';
  });
  toggles += '</div>';

  return (
    toggles +
    '<div class="editor-section"><h3>Address</h3>' +
    field('Line 1', 'editor-addr1', c.addressLine1) +
    field('Line 2', 'editor-addr2', c.addressLine2) +
    '<div class="editor-row">' +
    field('City', 'editor-city', c.city) +
    field('State', 'editor-state', c.state) +
    field('ZIP', 'editor-zip', c.zip) +
    '</div>' +
    field('Timezone', 'editor-tz', c.timezone) +
    '</div>' +
    '<div class="editor-section"><h3>Contact & social</h3>' +
    field('Phone display', 'editor-phone-display', c.phoneDisplay) +
    field('Phone tel link', 'editor-phone-tel', c.phoneTel) +
    field('Email', 'editor-email', c.email) +
    field('Instagram handle', 'editor-instagram', c.instagramHandle) +
    field('Map embed URL', 'editor-map', c.mapEmbedUrl) +
    '</div>'
  );
}

function renderPublishTab() {
  const root = state.ctx.rootDomain;
  const published = !!state.ctx.publishedAt;
  const slug =
    state.editorDraftSlug ||
    state.editor.subdomain?.subdomain ||
    state.editor.sitePublish?.subdomain ||
    '';
  const live = published && slug ? liveSiteUrl(slug, root) : null;
  const check = state.domainCheck;

  let checkHtml = '';
  if (check) {
    if (check.state === 'available' || check.state === 'yours') {
      checkHtml = '<p class="domain-check domain-check--ok">' + esc(slug) + '.' + root + ' is available</p>';
    } else if (check.state === 'taken' || check.state === 'reserved' || check.state === 'invalid') {
      checkHtml = '<p class="domain-check domain-check--bad">' + esc(check.message || 'Not available') + '</p>';
    }
  }

  return (
    '<div class="editor-section"><h3>Publish status</h3>' +
    '<span class="publish-badge ' +
    (published ? 'publish-badge--live' : 'publish-badge--draft') +
    '">' +
    (published ? '● Live' : '○ Not published') +
    '</span>' +
    (live ? '<p style="margin-top:.75rem"><a href="' + esc(live) + '" target="_blank" rel="noopener">' + esc(live) + '</a></p>' : '') +
    '</div>' +
    '<div class="editor-section"><h3>Your subdomain</h3>' +
    '<div class="editor-field"><label>Subdomain</label><div style="display:flex;align-items:center;gap:.35rem">' +
    '<input id="editor-subdomain" value="' +
    esc(slug) +
    '" placeholder="your-name" />' +
    '<span class="domain-suffix">.' +
    esc(root) +
    '</span></div>' +
    checkHtml +
    '<p style="font-size:.8125rem;color:var(--white-dim);margin-top:.5rem">Saved when you publish. Changing slug requires republish.</p>' +
    '</div>'
  );
}

function field(label, id, value) {
  return (
    '<label class="editor-field"><span>' +
    esc(label) +
    '</span><input id="' +
    id +
    '" value="' +
    esc(value || '') +
    '"></label>'
  );
}

function textarea(label, id, value) {
  return (
    '<label class="editor-field"><span>' +
    esc(label) +
    '</span><textarea id="' +
    id +
    '">' +
    esc(value || '') +
    '</textarea></label>'
  );
}

function colorField(label, id, value) {
  return (
    '<label class="editor-field"><span>' +
    esc(label) +
    '</span><input type="color" id="' +
    id +
    '" value="' +
    esc(value || '#000000') +
    '"></label>'
  );
}

function selectField(label, id, options, value) {
  return (
    '<label class="editor-field"><span>' +
    esc(label) +
    '</span><select id="' +
    id +
    '">' +
    options
      .map(function (opt) {
        return (
          '<option value="' +
          esc(opt.value) +
          '"' +
          (opt.value === value ? ' selected' : '') +
          '>' +
          esc(opt.label) +
          '</option>'
        );
      })
      .join('') +
    '</select></label>'
  );
}

function toggle(label, id, checked) {
  return (
    '<label class="editor-toggle"><input type="checkbox" id="' +
    id +
    '"' +
    (checked ? ' checked' : '') +
    '> ' +
    esc(label) +
    '</label>'
  );
}

function uploadBlock(label, inputId, previewUrl, folder) {
  return (
    '<div class="editor-upload"><span>' +
    esc(label) +
    '</span>' +
    (previewUrl ? '<img src="' + esc(previewUrl) + '" alt="">' : '') +
    '<input type="file" id="' +
    inputId +
    '" accept="image/*" data-upload-folder="' +
    esc(folder) +
    '"></div>'
  );
}

function renderTabPanel() {
  switch (state.activeTab) {
    case 'style':
      return renderStyleTab();
    case 'photos':
      return renderPhotosTab();
    case 'content':
      return renderContentTab();
    case 'location':
      return renderLocationTab();
    case 'publish':
      return renderPublishTab();
    default:
      return '';
  }
}

function renderEditor() {
  const root = document.getElementById('site-editor-app');
  const splitClass = state.previewMode === 'split' ? ' is-split' : '';
  root.innerHTML =
    '<div class="site-editor">' +
    '<header class="site-editor__header">' +
    '<div class="site-editor__header-left">' +
    '<a class="studio-btn studio-btn--ghost" href="/studio/website">← Back</a>' +
    '<span class="site-editor__title">Edit site</span>' +
    '<span id="editor-save-status" class="site-editor__status"></span>' +
    '</div>' +
    '<div class="site-editor__header-right">' +
    '<button type="button" class="studio-btn studio-btn--primary" id="editor-publish-btn">Publish 🚀</button>' +
    '</div></header>' +
    '<div class="site-editor__toolbar">' +
    '<div class="site-editor__tabs">' +
    TABS.map(function (tab) {
      return (
        '<button type="button" data-tab="' +
        tab.id +
        '" class="' +
        (state.activeTab === tab.id ? 'is-active' : '') +
        '">' +
        esc(tab.label) +
        '</button>'
      );
    }).join('') +
    '</div>' +
    '<div class="site-editor__preview-modes">' +
    ['edit', 'split', 'full']
      .map(function (mode) {
        return (
          '<button type="button" data-preview-mode="' +
          mode +
          '" class="' +
          (state.previewMode === mode ? 'is-active' : '') +
          '">' +
          esc(mode === 'edit' ? 'Edit only' : mode === 'split' ? 'Split' : 'Full') +
          '</button>'
        );
      })
      .join('') +
    '</div></div>' +
    '<div class="site-editor__body' +
    splitClass +
    '">' +
    '<div class="site-editor__panel" id="editor-panel">' +
    renderTabPanel() +
    '</div>' +
    '<aside class="site-editor__preview"><iframe data-preview-frame title="Preview"></iframe></aside>' +
    '</div>' +
    '<div class="site-editor__preview-full" id="preview-full">' +
    '<header><strong>Preview</strong><button type="button" class="studio-btn studio-btn--ghost" id="preview-full-close">Close</button></header>' +
    '<iframe data-preview-frame title="Preview fullscreen"></iframe>' +
    '</div></div>';

  bindEditorEvents();
  refreshPreview();
}

function bindEditorEvents() {
  document.querySelectorAll('[data-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.activeTab = btn.getAttribute('data-tab') || 'style';
      document.querySelectorAll('[data-tab]').forEach(function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-tab') === state.activeTab);
      });
      document.getElementById('editor-panel').innerHTML = renderTabPanel();
      bindTabFields();
    });
  });

  document.querySelectorAll('[data-preview-mode]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.previewMode = btn.getAttribute('data-preview-mode') || 'split';
      localStorage.setItem('styld_editor_preview_mode', state.previewMode);
      document.querySelector('.site-editor__body').className =
        'site-editor__body' + (state.previewMode === 'split' ? ' is-split' : '');
      document.querySelectorAll('[data-preview-mode]').forEach(function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-preview-mode') === state.previewMode);
      });
      const full = document.getElementById('preview-full');
      if (state.previewMode === 'full') {
        full.classList.add('is-open');
        refreshPreview();
      } else {
        full.classList.remove('is-open');
      }
    });
  });

  document.getElementById('preview-full-close')?.addEventListener('click', function () {
    document.getElementById('preview-full').classList.remove('is-open');
    state.previewMode = 'split';
    localStorage.setItem('styld_editor_preview_mode', 'split');
    document.querySelector('.site-editor__body').classList.add('is-split');
  });

  document.getElementById('editor-publish-btn')?.addEventListener('click', runPublish);
  bindTabFields();
}

function bindTabFields() {
  const c = state.editor.content;
  const t = state.editor.theme;

  bindInput('#editor-brand', c, 'brandName', scheduleContentSave);
  bindInput('#editor-tagline-left', c, 'taglineLeft', scheduleContentSave);
  bindInput('#editor-tagline-r1', c, 'taglineRightLine1', scheduleContentSave);
  bindInput('#editor-tagline-r2', c, 'taglineRightLine2', scheduleContentSave);
  bindInput('#editor-hero-desc', c, 'heroDescription', scheduleContentSave);
  bindInput('#editor-footer', c, 'footerText', scheduleContentSave);
  bindInput('#editor-meta', c, 'metaDescription', scheduleContentSave);
  bindInput('#editor-about-title', c, 'aboutTitle', scheduleContentSave);
  bindInput('#editor-about-body', c, 'aboutBody', scheduleContentSave);
  bindInput('#editor-visit-title', c, 'visitTitle', scheduleContentSave);
  bindInput('#editor-visit-body', c, 'visitBody', scheduleContentSave);
  bindInput('#editor-policy', c, 'bookingPolicy', scheduleContentSave);
  bindInput('#editor-menu-title', c, 'menuTitle', scheduleContentSave);
  bindInput('#editor-menu-blurb', c, 'menuBlurb', scheduleContentSave);
  bindInput('#editor-faq-title', c, 'faqTitle', scheduleContentSave);
  bindInput('#editor-faq-blurb', c, 'faqBlurb', scheduleContentSave);
  bindInput('#editor-products-title', c, 'productsTitle', scheduleContentSave);
  bindInput('#editor-products-blurb', c, 'productsBlurb', scheduleContentSave);
  bindInput('#editor-addr1', c, 'addressLine1', scheduleContentSave);
  bindInput('#editor-addr2', c, 'addressLine2', scheduleContentSave);
  bindInput('#editor-city', c, 'city', scheduleContentSave);
  bindInput('#editor-state', c, 'state', scheduleContentSave);
  bindInput('#editor-zip', c, 'zip', scheduleContentSave);
  bindInput('#editor-tz', c, 'timezone', scheduleContentSave);
  bindInput('#editor-phone-display', c, 'phoneDisplay', scheduleContentSave);
  bindInput('#editor-phone-tel', c, 'phoneTel', scheduleContentSave);
  bindInput('#editor-email', c, 'email', scheduleContentSave);
  bindInput('#editor-instagram', c, 'instagramHandle', scheduleContentSave);
  bindInput('#editor-map', c, 'mapEmbedUrl', scheduleContentSave);

  bindInput('#editor-primary', t, 'primaryColor', scheduleThemeSave);
  bindInput('#editor-secondary', t, 'secondaryColor', scheduleThemeSave);
  bindInput('#editor-bg', t, 'backgroundColor', scheduleThemeSave);
  bindInput('#editor-navbar', t, 'navbarColor', scheduleThemeSave);
  bindInput('#editor-font', t, 'fontFamily', scheduleThemeSave);
  bindInput('#editor-card-layout', t, 'styleCardLayout', scheduleThemeSave);
  bindInput('#editor-hero-layout', t, 'heroLayout', scheduleThemeSave);
  bindInput('#editor-hide-book', t, 'hideBookNowButton', scheduleThemeSave);
  bindInput('#editor-hero-blur', t, 'heroCoverBlur', scheduleThemeSave);

  const faqEl = document.getElementById('editor-faq-items');
  if (faqEl) {
    faqEl.addEventListener('change', function () {
      c.faqItems = String(faqEl.value || '')
        .split('\n')
        .map(function (line) {
          const parts = line.split('|');
          return { question: (parts[0] || '').trim(), answer: (parts.slice(1).join('|') || '').trim() };
        })
        .filter(function (item) {
          return item.question;
        });
      scheduleContentSave();
    });
  }

  document.querySelectorAll('[data-section-toggle]').forEach(function (input) {
    input.addEventListener('change', function () {
      const id = input.getAttribute('data-section-toggle');
      const idx = c.hiddenSections.indexOf(id);
      if (input.checked && idx !== -1) c.hiddenSections.splice(idx, 1);
      if (!input.checked && idx === -1) c.hiddenSections.push(id);
      scheduleContentSave();
    });
  });

  document.querySelectorAll('[data-location-toggle]').forEach(function (input) {
    input.addEventListener('change', function () {
      const id = input.getAttribute('data-location-toggle');
      const idx = c.hiddenLocationParts.indexOf(id);
      if (input.checked && idx !== -1) c.hiddenLocationParts.splice(idx, 1);
      if (!input.checked && idx === -1) c.hiddenLocationParts.push(id);
      scheduleContentSave();
    });
  });

  document.querySelectorAll('[data-upload-folder]').forEach(function (input) {
    input.addEventListener('change', async function () {
      const file = input.files && input.files[0];
      if (!file) return;
      const folder = input.getAttribute('data-upload-folder') || 'hero';
      setSaveStatus('saving');
      try {
        const path = await uploadToStyleCovers(state.ctx.session.user.id, folder, file);
        if (folder === 'hero') t.heroImagePath = path;
        if (folder === 'logo') t.logoImagePath = path;
        await flushThemeSave();
        document.getElementById('editor-panel').innerHTML = renderTabPanel();
        bindTabFields();
      } catch (e) {
        setSaveStatus('error');
        alert(e.message || 'Upload failed');
      }
    });
  });

  const subInput = document.getElementById('editor-subdomain');
  if (subInput) {
    state.editorDraftSlug = normalizeSubdomain(subInput.value);
    subInput.addEventListener('input', function () {
      state.editorDraftSlug = normalizeSubdomain(subInput.value);
      subInput.value = state.editorDraftSlug;
      clearTimeout(state.domainTimer);
      state.domainTimer = setTimeout(checkDomain, 500);
    });
  }
}

async function checkDomain() {
  const slug = state.editorDraftSlug;
  if (!slug) {
    state.domainCheck = { state: 'empty' };
    return;
  }
  try {
    state.domainCheck = await checkSubdomainAvailability(slug, marketingCfg(), state.ctx.session.user.id);
    if (state.activeTab === 'publish') {
      document.getElementById('editor-panel').innerHTML = renderPublishTab();
      bindTabFields();
    }
  } catch (_) {
    state.domainCheck = { state: 'error' };
  }
}

async function runPublish() {
  const slug = normalizeSubdomain(
    state.editorDraftSlug ||
      document.getElementById('editor-subdomain')?.value ||
      state.editor.subdomain?.subdomain ||
      '',
  );
  if (slug.length < 2) {
    alert('Enter a subdomain (at least 2 characters) on the Publish tab.');
    state.activeTab = 'publish';
    document.getElementById('editor-panel').innerHTML = renderPublishTab();
    bindTabFields();
    return;
  }

  const btn = document.getElementById('editor-publish-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Publishing…';
  }

  try {
    await flushAllSaves();
    const result = await publishSiteSubdomain(
      state.ctx.session.user.id,
      slug,
      state.editor.profile?.business_name,
    );
    state.ctx.publishedAt = result.publishedAt;
    state.editor.subdomain = { subdomain: result.subdomain, published_at: result.publishedAt };
    alert('Your site is live at ' + result.publicUrl);
    window.location.href = '/studio/website';
  } catch (e) {
    const msg = String(e.message || e);
    if (msg === 'subscription_required') {
      window.location.href = '/studio/subscribe?reason=publish';
      return;
    } else if (msg === 'subdomain_taken') {
      alert('That subdomain is taken. Try: ' + suggestAlternatives(slug).join(', '));
    } else {
      alert(msg || 'Publish failed');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Publish 🚀';
    }
  }
}

window.addEventListener('beforeunload', function (e) {
  if (state.pendingContent || state.pendingTheme || state.pendingProducts || state.saveStatus === 'saving') {
    e.preventDefault();
    e.returnValue = '';
  }
});

async function init() {
  await requireSession('/login?next=/studio/website/edit');
  const ctx = await bootstrapStudio();

  if (ctx.accessPhase === 'account_onboarding') {
    window.location.replace('/onboarding');
    return;
  }
  if (ctx.accessPhase === 'paywall') {
    window.location.replace('/studio/subscribe');
    return;
  }

  const editor = await loadSiteEditorState(ctx.session.user.id);
  state.ctx = ctx;
  state.editor = editor;
  state.editorDraftSlug = editor.subdomain?.subdomain || editor.sitePublish?.subdomain || '';
  state.editor.content = normalizeSiteContent(editor.content);
  state.editor.theme = normalizeSiteTheme(editor.theme);
  state.editor.products = normalizeSiteProducts(editor.products);

  renderEditor();
}

init().catch(function (err) {
  if (String(err && err.message) === 'redirecting') return;
  document.getElementById('site-editor-app').innerHTML =
    '<div class="studio-gate"><h1>Could not load editor</h1><p>' +
    esc(err.message || err) +
    '</p><a class="studio-btn studio-btn--primary" href="/studio/website">Back</a></div>';
});
