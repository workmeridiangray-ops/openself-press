// ============================================================
// Meridian Press — Cover designer
//
// Runs on local/in-memory state (same pattern as editor.js and
// submit.js). Every spot that becomes a real backend call is
// marked TODO(backend). Uploaded images are held as object URLs
// in-browser only — a real build uploads them to Supabase Storage
// and stores the returned path on the manuscript/book record.
// ============================================================

document.addEventListener('DOMContentLoaded', async function () {

  // ---------- session + manuscript lookup ----------
  // Opened from the dashboard as cover-designer.html?id=<manuscript_id>,
  // so it always edits the exact book the author had selected there. There
  // is no "most recent manuscript" fallback anymore — guessing which book a
  // bare link means risks silently editing the wrong one, so a missing id
  // sends the author back to the dashboard to pick explicitly instead.
  var session = window.MeridianSession ? await MeridianSession.requireRole('author', '../pages/login.html') : null;
  if (!session && window.MeridianSession) return; // requireRole already redirected

  var currentManuscriptId = new URLSearchParams(window.location.search).get('id') || null;
  if (session && !currentManuscriptId) {
    window.location.href = 'author-dashboard.html';
    return;
  }

  // ---------- role state ----------
  var currentRole = 'author';
  var btnAuthorRole = document.getElementById('btnAuthorRole');
  var btnDesignerRole = document.getElementById('btnDesignerRole');
  function setRole(role) {
    currentRole = role;
    btnAuthorRole.classList.toggle('active', role === 'author');
    btnDesignerRole.classList.toggle('active', role === 'designer');
    // TODO(backend): once real permissions exist, restrict template
    // switching / advanced properties to role === 'designer' here.
  }
  btnAuthorRole.addEventListener('click', function () { setRole('author'); });
  btnDesignerRole.addEventListener('click', function () { setRole('designer'); });

  // ---------- dimensions ----------
  var TRIM_SIZES = {
    '5x8':      { w: 5,   h: 8 },
    '5.5x8.5':  { w: 5.5, h: 8.5 },
    '6x9':      { w: 6,   h: 9 },
    '8.5x8.5': { w: 8.5, h: 8.5 },
    '8.5x11':   { w: 8.5, h: 11 }
  };
  var BLEED_IN = 0.125;
  var SPINE_IN_PER_PAGE = 0.0025; // standard paperback stock rule-of-thumb
  var SCREEN_DPI = 72; // scaled down from print 300dpi for on-screen editing

  var trimSizeEl = document.getElementById('trimSize');
  var pageCountEl = document.getElementById('pageCount');
  var dimFront = document.getElementById('dimFront');
  var dimSpine = document.getElementById('dimSpine');
  var dimFull = document.getElementById('dimFull');
  var canvas = document.getElementById('cdCanvas');
  var canvasWrap = document.querySelector('.cd-canvas-wrap');

  var currentDims = { frontW: 0, frontH: 0, spineW: 0, fullW: 0, fullH: 0 };
  var guidesVisible = true;

  function computeDimensions() {
    var size = TRIM_SIZES[trimSizeEl.value];
    var pages = Math.max(24, parseInt(pageCountEl.value, 10) || 220);
    var spineIn = +(pages * SPINE_IN_PER_PAGE).toFixed(3);

    var frontW = size.w + BLEED_IN; // bleed on outer edge only, simplified
    var frontH = size.h + BLEED_IN * 2;
    var fullW = frontW * 2 + spineIn;
    var fullH = frontH;

    currentDims = { frontW: frontW, frontH: frontH, spineW: spineIn, fullW: fullW, fullH: fullH, trimW: size.w, trimH: size.h };

    dimFront.textContent = size.w + '" × ' + size.h + '"';
    dimSpine.textContent = spineIn + '"';
    dimFull.textContent = fullW.toFixed(2) + '" × ' + fullH.toFixed(2) + '"';

    renderCanvasSize();
  }

  function renderCanvasSize() {
    var w = Math.round(currentDims.fullW * SCREEN_DPI);
    var h = Math.round(currentDims.fullH * SCREEN_DPI);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    renderGuides();
  }

  function renderGuides() {
    var existing = canvas.querySelectorAll('.cd-guide, .cd-guide-label');
    existing.forEach(function (el) { el.remove(); });
    if (!guidesVisible) return;

    var w = canvas.offsetWidth, h = canvas.offsetHeight;
    var bleedPx = BLEED_IN * SCREEN_DPI;
    var spinePx = currentDims.spineW * SCREEN_DPI;
    var frontPx = currentDims.frontW * SCREEN_DPI;

    // trim/safe area guide (whole wrap, inset by bleed)
    var safe = document.createElement('div');
    safe.className = 'cd-guide';
    safe.style.left = bleedPx + 'px';
    safe.style.top = bleedPx + 'px';
    safe.style.right = bleedPx + 'px';
    safe.style.bottom = bleedPx + 'px';
    canvas.appendChild(safe);

    // spine band, centered
    var spine = document.createElement('div');
    spine.className = 'cd-guide spine';
    spine.style.left = (frontPx) + 'px';
    spine.style.top = '0';
    spine.style.bottom = '0';
    spine.style.width = spinePx + 'px';
    canvas.appendChild(spine);

    var backLabel = document.createElement('div');
    backLabel.className = 'cd-guide-label';
    backLabel.style.left = '4px';
    backLabel.textContent = 'Back cover';
    canvas.appendChild(backLabel);

    var spineLabel = document.createElement('div');
    spineLabel.className = 'cd-guide-label';
    spineLabel.style.left = (frontPx + 2) + 'px';
    spineLabel.textContent = 'Spine';
    canvas.appendChild(spineLabel);

    var frontLabel = document.createElement('div');
    frontLabel.className = 'cd-guide-label';
    frontLabel.style.left = (frontPx + spinePx + 4) + 'px';
    frontLabel.textContent = 'Front cover';
    canvas.appendChild(frontLabel);

    // center-snap guides (hidden by default, shown only during drag)
    // center-h = element snapped to the horizontal center -> draw a VERTICAL line
    var centerHGuide = document.createElement('div');
    centerHGuide.className = 'cd-guide center-h';
    var vGuideX = frontPx + spinePx + (currentDims.frontW * SCREEN_DPI) / 2;
    centerHGuide.style.cssText = 'position:absolute; left:' + vGuideX + 'px; top:0; bottom:0; width:0; border-left:1px solid var(--brick); border-top:none; border-right:none; border-bottom:none; display:none;';
    canvas.appendChild(centerHGuide);

    // center-v = element snapped to the vertical center -> draw a HORIZONTAL line
    var centerVGuide = document.createElement('div');
    centerVGuide.className = 'cd-guide center-v';
    centerVGuide.style.cssText = 'position:absolute; left:' + (frontPx + spinePx) + 'px; width:' + (currentDims.frontW * SCREEN_DPI) + 'px; top:' + (h / 2) + 'px; height:0; border-top:1px solid var(--brick); border-left:none; border-right:none; border-bottom:none; display:none;';
    canvas.appendChild(centerVGuide);
  }

  [trimSizeEl, pageCountEl].forEach(function (el) {
    el.addEventListener('change', function () {
      var oldFullW = currentDims.fullW * SCREEN_DPI;
      var oldFullH = currentDims.fullH * SCREEN_DPI;

      computeDimensions();

      var newFullW = currentDims.fullW * SCREEN_DPI;
      var newFullH = currentDims.fullH * SCREEN_DPI;
      var scaleX = oldFullW ? newFullW / oldFullW : 1;
      var scaleY = oldFullH ? newFullH / oldFullH : 1;

      // Reposition and rescale every existing element proportionally, so
      // switching trim size or page count (which changes spine width)
      // doesn't leave elements sitting in the wrong spot relative to the
      // resized canvas — this was the bug: elements kept their old
      // absolute pixel coordinates while the canvas around them resized.
      if (scaleX !== 1 || scaleY !== 1) {
        elements.forEach(function (rec) {
          rec.x = Math.round(rec.x * scaleX);
          rec.y = Math.round(rec.y * scaleY);
          rec.w = Math.round(rec.w * scaleX);
          rec.h = Math.round(rec.h * scaleY);
          rec.el.style.left = rec.x + 'px';
          rec.el.style.top = rec.y + 'px';
          rec.el.style.width = rec.w + 'px';
          if (!(rec.kind === 'shape' && rec.type === 'line')) {
            rec.el.style.height = rec.h + 'px';
          }
          if (rec.kind === 'text' && rec.fontSize) {
            rec.fontSize = Math.max(6, Math.round(rec.fontSize * scaleY));
            rec.el.style.fontSize = rec.fontSize + 'px';
          }
        });
        if (selectedId) renderProps(); // refresh the properties panel's displayed numbers
      }

      markUnsaved();
    });
  });

  document.getElementById('toggleGuides').addEventListener('click', function () {
    guidesVisible = !guidesVisible;
    renderGuides();
  });

  // ---------- autosave (real) ----------
  var saveState = document.getElementById('saveState');
  var saveTimer = null;
  var currentBackground = { type: 'color', value: '#1C2B33' }; // tracks what's currently applied

  function markUnsaved() {
    saveState.textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveCoverNow,900);
  }
  async function saveCoverNow() {
      if (!currentManuscriptId) {
        saveState.textContent = 'All changes saved';
        return;
      }
      var layout = {
        background: currentBackground,
        elements: elements.map(function (rec) {
          if (rec.kind === 'shape') {
            return { id: rec.id, kind: 'shape', type: rec.type, x: rec.x, y: rec.y, w: rec.w, h: rec.h,
              fill: rec.fill, stroke: rec.stroke, strokeWidth: rec.strokeWidth,
              rotation: rec.rotation, opacity: rec.opacity };
          }
          return { id: rec.id, kind: 'text', type: rec.type, x: rec.x, y: rec.y, w: rec.w, h: rec.h,
            fontSize: rec.fontSize, color: rec.color, fontWeight: rec.fontWeight, fontStyle: rec.fontStyle,
            fontFamily: rec.fontFamily, textAlign: rec.textAlign, letterSpacing: rec.letterSpacing,
            text: rec.text, rotation: rec.rotation, opacity: rec.opacity };
        }),
        trimSize: trimSizeEl.value,
        pageCount: pageCountEl.value
      };
      var res = await supabaseClient.from('manuscripts').update({ cover_layout_json: layout }).eq('id', currentManuscriptId);
      if (res.error) {
        console.error('Could not save cover layout', res.error);
        saveState.textContent = 'Could not save — check your connection';
        saveState.style.color = 'var(--brick, #b23b2e)';
      } else {
        saveState.style.color = '';
        saveState.textContent = 'All changes saved';
      }
  }

  // ---------- background ----------
  document.getElementById('bgColorInput').addEventListener('input', function (e) {
    canvas.style.backgroundImage = '';
    canvas.style.background = e.target.value;
    currentBackground = { type: 'color', value: e.target.value };
    markUnsaved();
  });

  var uploadBgBtn = document.getElementById('uploadBgBtn');
  var bgImageInput = document.getElementById('bgImageInput');
  uploadBgBtn.addEventListener('click', function () { bgImageInput.click(); });
  bgImageInput.addEventListener('change', async function () {
    var file = bgImageInput.files[0];
    if (!file) return;

    if (!session) {
      alert('You need to be logged in to upload a cover image.');
      return;
    }

    // show it immediately via a local blob URL while the real upload runs
    var previewUrl = URL.createObjectURL(file);
    canvas.style.background = 'none';
    canvas.style.backgroundImage = 'url(' + previewUrl + ')';

    var path = session.id + '/' + Date.now() + '-' + file.name;
    var uploadRes = await supabaseClient.storage.from('covers').upload(path, file);
    if (uploadRes.error) {
      alert('Image upload failed: ' + uploadRes.error.message);
      return;
    }
    var publicUrlRes = supabaseClient.storage.from('covers').getPublicUrl(path);
    currentBackground = { type: 'image', value: publicUrlRes.data.publicUrl };

    if (currentManuscriptId) {
      // The authenticated upload stores the background against this book.
    }
    markUnsaved();
  });

  // ============================================================
  // Elements (text + shapes) — draggable, resizable, rotatable
  // ============================================================

  var elements = []; // { id, el, kind, type, x, y, w, h, rotation, opacity, ... }
  var elIdSeq = 1;
  var selectedId = null;

  var propsPanel = document.getElementById('propsPanel');
  var layersList = document.getElementById('layersList');
  var deleteElBtn = document.getElementById('deleteElBtn');
  var duplicateElBtn = document.getElementById('duplicateElBtn');
  var bringForwardBtn = document.getElementById('bringForwardBtn');
  var sendBackwardBtn = document.getElementById('sendBackwardBtn');

  function applyTransform(el, rec) {
    el.style.transform = 'rotate(' + (rec.rotation || 0) + 'deg)';
    el.style.opacity = (rec.opacity !== undefined ? rec.opacity : 1);
  }

  function attachHandles(el) {
    var resizeHandle = document.createElement('div');
    resizeHandle.className = 'cd-resize-handle';
    el.appendChild(resizeHandle);
    var rotateHandle = document.createElement('div');
    rotateHandle.className = 'cd-rotate-handle';
    el.appendChild(rotateHandle);
    return { resizeHandle: resizeHandle, rotateHandle: rotateHandle };
  }

  function createTextElement(type, defaults) {
    var id = 'el' + (elIdSeq++);
    var el = document.createElement('div');
    el.className = 'cd-element text-el';
    el.dataset.id = id;
    el.textContent = defaults.text;
    el.style.left = defaults.x + 'px';
    el.style.top = defaults.y + 'px';
    el.style.width = defaults.w + 'px';
    el.style.height = defaults.h + 'px';
    el.style.fontFamily = defaults.fontFamily || "'Fraunces', serif";
    el.style.fontSize = defaults.fontSize + 'px';
    el.style.fontWeight = defaults.fontWeight || '400';
    el.style.fontStyle = defaults.fontStyle || 'normal';
    el.style.color = defaults.color || '#FAF7F0';
    el.style.textAlign = defaults.textAlign || 'center';
    el.style.letterSpacing = (defaults.letterSpacing || 0) + 'px';
    el.style.justifyContent = { left: 'flex-start', center: 'center', right: 'flex-end' }[defaults.textAlign || 'center'];

    var handles = attachHandles(el);
    canvas.appendChild(el);

    var record = {
      id: id, el: el, kind: 'text', type: type,
      x: defaults.x, y: defaults.y, w: defaults.w, h: defaults.h,
      fontSize: defaults.fontSize, color: defaults.color || '#FAF7F0',
      fontWeight: defaults.fontWeight || '400', fontStyle: defaults.fontStyle || 'normal',
      fontFamily: defaults.fontFamily || "'Fraunces', serif",
      textAlign: defaults.textAlign || 'center', letterSpacing: defaults.letterSpacing || 0,
      text: defaults.text, rotation: defaults.rotation || 0, opacity: defaults.opacity !== undefined ? defaults.opacity : 1
    };
    applyTransform(el, record);
    elements.push(record);

    makeInteractive(el, record, handles);
    el.addEventListener('mousedown', function () { selectElement(id); });

    selectElement(id);
    renderLayers();
    markUnsaved();
    return record;
  }

  function createShapeElement(shapeType, defaults) {
    var id = 'el' + (elIdSeq++);
    var el = document.createElement('div');
    el.className = 'cd-element shape-el' + (shapeType === 'line' ? ' shape-line' : '');
    el.dataset.id = id;
    el.style.left = defaults.x + 'px';
    el.style.top = defaults.y + 'px';
    el.style.width = defaults.w + 'px';
    el.style.height = defaults.h + 'px';

    if (shapeType === 'rect') {
      el.style.background = defaults.fill;
      el.style.border = defaults.strokeWidth + 'px solid ' + defaults.stroke;
    } else if (shapeType === 'circle') {
      el.style.background = defaults.fill;
      el.style.border = defaults.strokeWidth + 'px solid ' + defaults.stroke;
      el.style.borderRadius = '50%';
    } else if (shapeType === 'line') {
      el.style.background = 'none';
      el.style.borderTop = defaults.strokeWidth + 'px solid ' + defaults.stroke;
      el.style.height = defaults.strokeWidth + 'px';
    }

    var handles = attachHandles(el);
    canvas.appendChild(el);

    var record = {
      id: id, el: el, kind: 'shape', type: shapeType,
      x: defaults.x, y: defaults.y, w: defaults.w, h: defaults.h,
      fill: defaults.fill, stroke: defaults.stroke, strokeWidth: defaults.strokeWidth,
      rotation: defaults.rotation || 0, opacity: defaults.opacity !== undefined ? defaults.opacity : 1
    };
    applyTransform(el, record);
    elements.push(record);

    makeInteractive(el, record, handles);
    el.addEventListener('mousedown', function () { selectElement(id); });

    selectElement(id);
    renderLayers();
    markUnsaved();
    return record;
  }

  function selectElement(id) {
    selectedId = id;
    elements.forEach(function (rec) {
      rec.el.classList.toggle('selected', rec.id === id);
    });
    deleteElBtn.disabled = !id;
    duplicateElBtn.disabled = !id;
    bringForwardBtn.disabled = !id;
    sendBackwardBtn.disabled = !id;
    renderProps();
    renderLayers();
  }

  canvas.addEventListener('mousedown', function (e) {
    if (e.target === canvas) selectElement(null);
  });

  function getSelected() {
    return elements.filter(function (r) { return r.id === selectedId; })[0];
  }

  var FONT_OPTIONS = [
    { value: "'Fraunces', serif", label: 'Fraunces' },
    { value: "'Playfair Display', serif", label: 'Playfair Display' },
    { value: "'Bebas Neue', sans-serif", label: 'Bebas Neue' },
    { value: "'Oswald', sans-serif", label: 'Oswald' },
    { value: "'Cormorant Garamond', serif", label: 'Cormorant Garamond' },
    { value: "'Inter', sans-serif", label: 'Inter' },
    { value: "Georgia, serif", label: 'Georgia' },
    { value: "Arial, sans-serif", label: 'Arial' }
  ];

  function renderProps() {
    var rec = getSelected();
    if (!rec) {
      propsPanel.innerHTML = '<div class="no-selection">Select an element on the cover to edit it.</div>';
      return;
    }

    if (rec.kind === 'text') {
      propsPanel.innerHTML =
        '<div class="cd-field"><label>Text</label><input type="text" id="propText" value="' + escapeAttr(rec.text) + '"></div>' +
        '<div class="cd-field"><label>Font</label><select id="propFontFamily">' +
          FONT_OPTIONS.map(function (f) { return '<option value="' + escapeAttr(f.value) + '"' + (rec.fontFamily === f.value ? ' selected' : '') + '>' + f.label + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="cd-field"><label>Font size (px)</label><input type="number" id="propFontSize" value="' + rec.fontSize + '" min="8" max="160"></div>' +
        '<div class="cd-field"><label>Weight</label><select id="propWeight">' +
          '<option value="300"' + (rec.fontWeight === '300' ? ' selected' : '') + '>Light</option>' +
          '<option value="400"' + (rec.fontWeight === '400' ? ' selected' : '') + '>Regular</option>' +
          '<option value="600"' + (rec.fontWeight === '600' ? ' selected' : '') + '>Semibold</option>' +
          '<option value="700"' + (rec.fontWeight === '700' ? ' selected' : '') + '>Bold</option>' +
          '<option value="900"' + (rec.fontWeight === '900' ? ' selected' : '') + '>Black</option>' +
        '</select></div>' +
        '<div class="cd-field"><label>Style</label><select id="propFontStyle">' +
          '<option value="normal"' + (rec.fontStyle === 'normal' ? ' selected' : '') + '>Normal</option>' +
          '<option value="italic"' + (rec.fontStyle === 'italic' ? ' selected' : '') + '>Italic</option>' +
        '</select></div>' +
        '<div class="cd-field"><label>Alignment</label>' +
        '<div class="cd-align-row">' +
          '<button data-align="left" title="Align left"><i class="ti ti-align-left"></i></button>' +
          '<button data-align="center" title="Align center"><i class="ti ti-align-center"></i></button>' +
          '<button data-align="right" title="Align right"><i class="ti ti-align-right"></i></button>' +
        '</div></div>' +
        '<div class="cd-field"><label>Letter spacing (px)</label>' +
          '<div class="cd-range-row"><input type="range" id="propLetterSpacing" min="-2" max="20" step="0.5" value="' + rec.letterSpacing + '"><span class="cd-range-value">' + rec.letterSpacing + '</span></div></div>' +
        '<div class="cd-field"><label>Color</label><input type="color" id="propColor" value="' + rec.color + '"></div>' +
        renderCommonProps(rec);

      document.getElementById('propText').addEventListener('input', function (e) {
        rec.text = e.target.value;
        rec.el.textContent = rec.text;
        reattachHandles(rec);
        renderLayers();
        markUnsaved();
      });
      document.getElementById('propFontFamily').addEventListener('change', function (e) {
        rec.fontFamily = e.target.value;
        rec.el.style.fontFamily = rec.fontFamily;
        markUnsaved();
      });
      document.getElementById('propFontSize').addEventListener('input', function (e) {
        rec.fontSize = parseInt(e.target.value, 10) || rec.fontSize;
        rec.el.style.fontSize = rec.fontSize + 'px';
        markUnsaved();
      });
      document.getElementById('propWeight').addEventListener('change', function (e) {
        rec.fontWeight = e.target.value;
        rec.el.style.fontWeight = rec.fontWeight;
        markUnsaved();
      });
      document.getElementById('propFontStyle').addEventListener('change', function (e) {
        rec.fontStyle = e.target.value;
        rec.el.style.fontStyle = rec.fontStyle;
        markUnsaved();
      });
      propsPanel.querySelectorAll('[data-align]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          rec.textAlign = btn.dataset.align;
          rec.el.style.textAlign = rec.textAlign;
          rec.el.style.justifyContent = { left: 'flex-start', center: 'center', right: 'flex-end' }[rec.textAlign];
          markUnsaved();
        });
      });
      document.getElementById('propLetterSpacing').addEventListener('input', function (e) {
        rec.letterSpacing = parseFloat(e.target.value);
        rec.el.style.letterSpacing = rec.letterSpacing + 'px';
        propsPanel.querySelector('.cd-range-value').textContent = rec.letterSpacing;
        markUnsaved();
      });
      document.getElementById('propColor').addEventListener('input', function (e) {
        rec.color = e.target.value;
        rec.el.style.color = rec.color;
        markUnsaved();
      });
    } else {
      // shape properties
      propsPanel.innerHTML =
        '<div class="cd-field"><label>Fill color</label><input type="color" id="propFill" value="' + rec.fill + '"></div>' +
        '<div class="cd-field"><label>Stroke color</label><input type="color" id="propStroke" value="' + rec.stroke + '"></div>' +
        '<div class="cd-field"><label>Stroke width (px)</label>' +
          '<div class="cd-range-row"><input type="range" id="propStrokeWidth" min="0" max="12" value="' + rec.strokeWidth + '"><span class="cd-range-value">' + rec.strokeWidth + '</span></div></div>' +
        renderCommonProps(rec);

      document.getElementById('propFill').addEventListener('input', function (e) {
        rec.fill = e.target.value;
        if (rec.type !== 'line') rec.el.style.background = rec.fill;
        markUnsaved();
      });
      document.getElementById('propStroke').addEventListener('input', function (e) {
        rec.stroke = e.target.value;
        applyShapeStroke(rec);
        markUnsaved();
      });
      document.getElementById('propStrokeWidth').addEventListener('input', function (e) {
        rec.strokeWidth = parseInt(e.target.value, 10);
        applyShapeStroke(rec);
        propsPanel.querySelector('.cd-range-value').textContent = rec.strokeWidth;
        markUnsaved();
      });
    }

    // common: rotation + opacity, wired after either branch's HTML is in the DOM
    document.getElementById('propRotation').addEventListener('input', function (e) {
      rec.rotation = parseInt(e.target.value, 10);
      applyTransform(rec.el, rec);
      propsPanel.querySelector('#propRotationValue').textContent = rec.rotation + '°';
      markUnsaved();
    });
    document.getElementById('propOpacity').addEventListener('input', function (e) {
      rec.opacity = parseInt(e.target.value, 10) / 100;
      applyTransform(rec.el, rec);
      propsPanel.querySelector('#propOpacityValue').textContent = e.target.value + '%';
      markUnsaved();
    });
  }

  function renderCommonProps(rec) {
    return '<div class="cd-field"><label>Rotation</label>' +
      '<div class="cd-range-row"><input type="range" id="propRotation" min="-180" max="180" value="' + (rec.rotation || 0) + '"><span class="cd-range-value" id="propRotationValue">' + (rec.rotation || 0) + '°</span></div></div>' +
      '<div class="cd-field"><label>Opacity</label>' +
      '<div class="cd-range-row"><input type="range" id="propOpacity" min="0" max="100" value="' + Math.round((rec.opacity !== undefined ? rec.opacity : 1) * 100) + '"><span class="cd-range-value" id="propOpacityValue">' + Math.round((rec.opacity !== undefined ? rec.opacity : 1) * 100) + '%</span></div></div>';
  }

  function applyShapeStroke(rec) {
    if (rec.type === 'line') {
      rec.el.style.borderTop = rec.strokeWidth + 'px solid ' + rec.stroke;
      rec.el.style.height = rec.strokeWidth + 'px';
    } else {
      rec.el.style.border = rec.strokeWidth + 'px solid ' + rec.stroke;
    }
  }

  function reattachHandles(rec) {
    if (!rec.el.querySelector('.cd-resize-handle')) {
      var h = document.createElement('div');
      h.className = 'cd-resize-handle';
      rec.el.appendChild(h);
    }
    if (!rec.el.querySelector('.cd-rotate-handle')) {
      var r = document.createElement('div');
      r.className = 'cd-rotate-handle';
      rec.el.appendChild(r);
    }
  }

  function renderLayers() {
    layersList.innerHTML = '';
    // top of list = topmost layer (reverse DOM order)
    elements.slice().reverse().forEach(function (rec) {
      var row = document.createElement('div');
      row.className = 'layer-row' + (rec.id === selectedId ? ' active' : '');
      row.innerHTML = '<span class="layer-name">' + escapeHtml(labelFor(rec)) + '</span>' +
        '<button data-action="up" title="Bring forward">↑</button>' +
        '<button data-action="down" title="Send backward">↓</button>' +
        '<button data-action="del" title="Delete">✕</button>';
      row.addEventListener('click', function (e) {
        if (e.target.dataset.action) return;
        selectElement(rec.id);
      });
      row.querySelector('[data-action="up"]').addEventListener('click', function () { reorder(rec.id, 1); });
      row.querySelector('[data-action="down"]').addEventListener('click', function () { reorder(rec.id, -1); });
      row.querySelector('[data-action="del"]').addEventListener('click', function () { deleteElement(rec.id); });
      layersList.appendChild(row);
    });
  }

  function labelFor(rec) {
    if (rec.kind === 'shape') {
      return { rect: 'Rectangle', circle: 'Circle', line: 'Line' }[rec.type] || rec.type;
    }
    return { title: 'Title text', author: 'Author text', tagline: 'Tagline text' }[rec.type] || rec.type;
  }

  function reorder(id, dir) {
    var idx = elements.findIndex(function (r) { return r.id === id; });
    var swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= elements.length) return;
    var rec = elements[idx];
    elements.splice(idx, 1);
    elements.splice(swapIdx, 0, rec);
    // reflect z-order in DOM
    elements.forEach(function (r) { canvas.appendChild(r.el); });
    renderLayers();
    markUnsaved();
  }

  function deleteElement(id) {
    var rec = elements.find(function (r) { return r.id === id; });
    if (!rec) return;
    rec.el.remove();
    elements = elements.filter(function (r) { return r.id !== id; });
    if (selectedId === id) selectElement(null);
    renderLayers();
    markUnsaved();
  }

  deleteElBtn.addEventListener('click', function () { if (selectedId) deleteElement(selectedId); });
  duplicateElBtn.addEventListener('click', function () {
    var rec = getSelected();
    if (!rec) return;
    if (rec.kind === 'text') {
      createTextElement(rec.type, {
        text: rec.text, x: rec.x + 16, y: rec.y + 16, w: rec.w, h: rec.h,
        fontSize: rec.fontSize, fontWeight: rec.fontWeight, fontStyle: rec.fontStyle,
        fontFamily: rec.fontFamily, textAlign: rec.textAlign, letterSpacing: rec.letterSpacing,
        color: rec.color, rotation: rec.rotation, opacity: rec.opacity
      });
    } else {
      createShapeElement(rec.type, {
        x: rec.x + 16, y: rec.y + 16, w: rec.w, h: rec.h,
        fill: rec.fill, stroke: rec.stroke, strokeWidth: rec.strokeWidth,
        rotation: rec.rotation, opacity: rec.opacity
      });
    }
  });

  bringForwardBtn.addEventListener('click', function () { if (selectedId) reorder(selectedId, 1); });
  sendBackwardBtn.addEventListener('click', function () { if (selectedId) reorder(selectedId, -1); });

  document.getElementById('addTitleText').addEventListener('click', function () {
    createTextElement('title', { text: window.bookToolState.record.data.title, x: 40, y: 60, w: 200, h: 80, fontSize: 28, fontWeight: '700', color: '#FAF7F0' });
  });
  document.getElementById('addAuthorText').addEventListener('click', function () {
    createTextElement('author', { text: window.bookToolState.record.data.contactName || window.bookToolState.record.data.author, x: 40, y: 160, w: 200, h: 36, fontSize: 16, fontWeight: '400', color: '#FAF7F0' });
  });
  document.getElementById('addTaglineText').addEventListener('click', function () {
    createTextElement('tagline', { text: 'A tagline goes here', x: 40, y: 200, w: 200, h: 40, fontSize: 12, fontWeight: '400', color: '#D8CEB0' });
  });
  document.getElementById('addRectShape').addEventListener('click', function () {
    createShapeElement('rect', { x: 60, y: 240, w: 140, h: 90, fill: '#B23A2E', stroke: '#1C2B33', strokeWidth: 0 });
  });
  document.getElementById('addCircleShape').addEventListener('click', function () {
    createShapeElement('circle', { x: 60, y: 240, w: 100, h: 100, fill: '#7A6A53', stroke: '#1C2B33', strokeWidth: 0 });
  });
  document.getElementById('addLineShape').addEventListener('click', function () {
    createShapeElement('line', { x: 60, y: 240, w: 180, h: 2, fill: 'none', stroke: '#FAF7F0', strokeWidth: 2 });
  });

  // ---------- alignment tools ----------
  document.getElementById('alignHorizCenter').addEventListener('click', function () {
    var rec = getSelected();
    if (!rec) return;
    var frontOffset = frontPanelOffsetPx();
    var frontWidthPx = currentDims.frontW * SCREEN_DPI;
    rec.x = Math.round(frontOffset + (frontWidthPx - rec.w) / 2);
    rec.el.style.left = rec.x + 'px';
    markUnsaved();
  });
  document.getElementById('alignVertCenter').addEventListener('click', function () {
    var rec = getSelected();
    if (!rec) return;
    var frontHeightPx = currentDims.frontH * SCREEN_DPI;
    rec.y = Math.round((frontHeightPx - rec.h) / 2);
    rec.el.style.top = rec.y + 'px';
    markUnsaved();
  });

  // ---------- drag + resize + rotate, with center-snap guides ----------
  function makeInteractive(el, rec, handles) {
    var resizeHandle = handles.resizeHandle;
    var rotateHandle = handles.rotateHandle;
    var dragging = false, resizing = false, rotating = false;
    var startX, startY, startLeft, startTop, startW, startH, startAngle, centerX, centerY;

    el.addEventListener('mousedown', function (e) {
      if (e.target === resizeHandle || e.target === rotateHandle) return;
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      startLeft = parseFloat(el.style.left); startTop = parseFloat(el.style.top);
      e.preventDefault();
    });

    resizeHandle.addEventListener('mousedown', function (e) {
      resizing = true;
      startX = e.clientX; startY = e.clientY;
      startW = parseFloat(el.style.width); startH = parseFloat(el.style.height);
      e.stopPropagation();
      e.preventDefault();
    });

    rotateHandle.addEventListener('mousedown', function (e) {
      rotating = true;
      var box = el.getBoundingClientRect();
      centerX = box.left + box.width / 2;
      centerY = box.top + box.height / 2;
      e.stopPropagation();
      e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
      if (dragging) {
        var dx = e.clientX - startX, dy = e.clientY - startY;
        var newX = Math.max(0, startLeft + dx);
        var newY = Math.max(0, startTop + dy);

        // snap to front-panel center guides within a small threshold
        var frontOffset = frontPanelOffsetPx();
        var frontWidthPx = currentDims.frontW * SCREEN_DPI;
        var frontHeightPx = currentDims.frontH * SCREEN_DPI;
        var centerXTarget = frontOffset + (frontWidthPx - rec.w) / 2;
        var centerYTarget = (frontHeightPx - rec.h) / 2;
        var snapThreshold = 6;
        var snappedH = Math.abs(newX - centerXTarget) < snapThreshold;
        var snappedV = Math.abs(newY - centerYTarget) < snapThreshold;
        if (snappedH) newX = centerXTarget;
        if (snappedV) newY = centerYTarget;
        showCenterGuides(snappedH, snappedV);

        rec.x = newX;
        rec.y = newY;
        el.style.left = rec.x + 'px';
        el.style.top = rec.y + 'px';
      } else if (resizing) {
        var dw = e.clientX - startX, dh = e.clientY - startY;
        rec.w = Math.max(20, startW + dw);
        rec.h = Math.max(rec.kind === 'shape' && rec.type === 'line' ? 1 : 20, startH + dh);
        el.style.width = rec.w + 'px';
        if (!(rec.kind === 'shape' && rec.type === 'line')) el.style.height = rec.h + 'px';
      } else if (rotating) {
        var angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI) + 90;
        rec.rotation = Math.round(angle);
        applyTransform(el, rec);
        if (rec.id === selectedId) {
          var rotInput = document.getElementById('propRotation');
          if (rotInput) {
            rotInput.value = rec.rotation;
            document.getElementById('propRotationValue').textContent = rec.rotation + '°';
          }
        }
      }
    });

    document.addEventListener('mouseup', function () {
      if (dragging || resizing || rotating) markUnsaved();
      dragging = false;
      resizing = false;
      rotating = false;
      showCenterGuides(false, false);
    });
  }

  function showCenterGuides(showH, showV) {
    var hGuide = canvas.querySelector('.cd-guide.center-h');
    var vGuide = canvas.querySelector('.cd-guide.center-v');
    if (hGuide) hGuide.style.display = showH ? 'block' : 'none';
    if (vGuide) vGuide.style.display = showV ? 'block' : 'none';
  }

  // ---------- templates ----------
  var TEMPLATES = {
    centered: function () {
      clearElements();
      canvas.style.backgroundImage = '';
      canvas.style.background = '#1C2B33';
      createTextElement('title', { text: window.bookToolState.record.data.title, x: pctX(15), y: pctY(35), w: pctW(70), h: 90, fontSize: 32, fontWeight: '700', color: '#FAF7F0' });
      createTextElement('author', { text: window.bookToolState.record.data.contactName || window.bookToolState.record.data.author, x: pctX(25), y: pctY(55), w: pctW(50), h: 36, fontSize: 16, fontWeight: '400', color: '#D8CEB0' });
    },
    band: function () {
      clearElements();
      canvas.style.backgroundImage = '';
      canvas.style.background = 'linear-gradient(#F3EEE1 55%, #B23A2E 55%)';
      createTextElement('title', { text: window.bookToolState.record.data.title, x: pctX(12), y: pctY(15), w: pctW(60), h: 90, fontSize: 30, fontWeight: '700', color: '#1C2B33' });
      createTextElement('author', { text: window.bookToolState.record.data.contactName || window.bookToolState.record.data.author, x: pctX(12), y: pctY(60), w: pctW(50), h: 36, fontSize: 16, fontWeight: '400', color: '#FAF7F0' });
    },
    minimal: function () {
      clearElements();
      canvas.style.backgroundImage = '';
      canvas.style.background = '#FAF7F0';
      createTextElement('title', { text: window.bookToolState.record.data.title, x: pctX(15), y: pctY(45), w: pctW(65), h: 60, fontSize: 24, fontWeight: '600', color: '#1C2B33' });
      createTextElement('author', { text: window.bookToolState.record.data.contactName || window.bookToolState.record.data.author, x: pctX(15), y: pctY(52), w: pctW(50), h: 30, fontSize: 13, fontWeight: '400', color: '#7A6A53' });
    },
    bold: function () {
      clearElements();
      canvas.style.backgroundImage = '';
      canvas.style.background = '#B23A2E';
      createTextElement('title', { text: window.bookToolState.record.data.title, x: pctX(10), y: pctY(30), w: pctW(75), h: 100, fontSize: 36, fontWeight: '700', color: '#FAF7F0' });
      createTextElement('tagline', { text: 'A tagline goes here', x: pctX(10), y: pctY(50), w: pctW(60), h: 30, fontSize: 13, fontWeight: '400', color: '#F3EEE1' });
      createTextElement('author', { text: window.bookToolState.record.data.contactName || window.bookToolState.record.data.author, x: pctX(10), y: pctY(62), w: pctW(50), h: 30, fontSize: 15, fontWeight: '400', color: '#F3EEE1' });
    }
  };

  // percentage helpers, scoped to the front-cover panel (right-hand third of wrap)
  function frontPanelOffsetPx() {
    return (currentDims.frontW + currentDims.spineW) * SCREEN_DPI;
  }
  function pctX(pct) { return frontPanelOffsetPx() + (currentDims.frontW * SCREEN_DPI) * (pct / 100); }
  function pctY(pct) { return (currentDims.frontH * SCREEN_DPI) * (pct / 100); }
  function pctW(pct) { return (currentDims.frontW * SCREEN_DPI) * (pct / 100); }

  function clearElements() {
    elements.forEach(function (r) { r.el.remove(); });
    elements = [];
    selectElement(null);
  }

  document.querySelectorAll('.template-thumb').forEach(function (thumb) {
    thumb.addEventListener('click', function () {
      document.querySelectorAll('.template-thumb').forEach(function (t) { t.classList.remove('selected'); });
      thumb.classList.add('selected');
      var fn = TEMPLATES[thumb.dataset.template];
      if (fn) fn();
      renderGuides();
      markUnsaved();
    });
  });

  // ---------- utils ----------
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, '&quot;');
  }

  // ---------- init ----------
  document.getElementById('saveNowButton').addEventListener('click',function(){clearTimeout(saveTimer);saveCoverNow();});
  document.getElementById('coverProofButton').addEventListener('click',async function(){
    var button=this;button.disabled=true;clearTimeout(saveTimer);await saveCoverNow();
    try{
      if(saveState.textContent.indexOf('Could not save')===0)throw Error('Save the current cover before exporting.');
      var scale=2;var output=document.createElement('canvas');output.width=Math.ceil(canvas.offsetWidth*scale);output.height=Math.ceil(canvas.offsetHeight*scale);var ctx=output.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle=currentBackground.type==='color'?currentBackground.value:'#fff';ctx.fillRect(0,0,canvas.offsetWidth,canvas.offsetHeight);
      if(currentBackground.type==='image'){var bg=new Image();bg.src=currentBackground.value;await bg.decode();ctx.drawImage(bg,0,0,canvas.offsetWidth,canvas.offsetHeight);}
      for(var rec of elements){ctx.save();ctx.globalAlpha=rec.opacity===undefined?1:rec.opacity;ctx.translate(rec.x+rec.w/2,rec.y+rec.h/2);ctx.rotate((rec.rotation||0)*Math.PI/180);ctx.translate(-rec.w/2,-rec.h/2);
        if(rec.kind==='shape'){ctx.fillStyle=rec.fill;ctx.strokeStyle=rec.stroke;ctx.lineWidth=rec.strokeWidth||0;if(rec.type==='circle'){ctx.beginPath();ctx.ellipse(rec.w/2,rec.h/2,rec.w/2,rec.h/2,0,0,Math.PI*2);ctx.fill();if(rec.strokeWidth)ctx.stroke();}else{ctx.fillRect(0,0,rec.w,rec.h);if(rec.strokeWidth)ctx.strokeRect(0,0,rec.w,rec.h);}}
        else{ctx.fillStyle=rec.color;ctx.font=(rec.fontStyle||'normal')+' '+(rec.fontWeight||'400')+' '+rec.fontSize+'px '+rec.fontFamily;ctx.textAlign=rec.textAlign||'left';ctx.textBaseline='top';var tx=rec.textAlign==='center'?rec.w/2:rec.textAlign==='right'?rec.w:0;var lines=[];String(rec.text||'').split('\n').forEach(function(paragraph){var line='';paragraph.split(' ').forEach(function(word){if(line&&ctx.measureText(line+' '+word).width>rec.w){lines.push(line);line=word;}else line+=(line?' ':'')+word;});lines.push(line);});lines.forEach(function(line,i){ctx.fillText(line,tx,i*rec.fontSize*1.2,rec.w);});}ctx.restore();}
      var blob=await new Promise(function(resolve){output.toBlob(resolve,'image/png');});if(!blob)throw Error('Could not render cover proof');var form=new FormData();form.set('id',currentManuscriptId);form.set('purpose','cover');form.set('reviewProof','1');form.set('file',new File([blob],'cover-proof.png',{type:'image/png'}));var response=await fetch('/api/books',{method:'POST',body:form});var result=await response.json();if(!response.ok)throw Error(result.error);window.bookToolState.record.version=result.version;saveState.textContent='Cover proof saved for staff review';document.getElementById('toolNotice').textContent='Cover proof uploaded to this book. This is a screen-resolution review proof; upload a vendor-approved print PDF before final production.';
    }catch(error){alert(error.message);}finally{button.disabled=false;}
  });

  computeDimensions();

  // Load a previously saved cover layout for this manuscript, if one
  // exists; otherwise fall back to the default template.
  (async function loadSavedCover() {
    if (currentManuscriptId) {
      var res = await supabaseClient.from('manuscripts').select('cover_layout_json').eq('id', currentManuscriptId).single();
      var layout = res.data ? res.data.cover_layout_json : null;
      if (layout) {
        if (layout.trimSize) { trimSizeEl.value = layout.trimSize; computeDimensions(); }
        if (layout.pageCount) pageCountEl.value = layout.pageCount;computeDimensions();
        if (layout.background) {
          currentBackground = layout.background;
          if (layout.background.type === 'image') {
            canvas.style.background = 'none';
            canvas.style.backgroundImage = 'url(' + layout.background.value + ')';
          } else {
            canvas.style.backgroundImage = '';
            canvas.style.background = layout.background.value;
          }
        }
        (layout.elements || []).forEach(function (rec) {
          if (rec.kind === 'shape') {
            createShapeElement(rec.type, {
              x: rec.x, y: rec.y, w: rec.w, h: rec.h,
              fill: rec.fill, stroke: rec.stroke, strokeWidth: rec.strokeWidth,
              rotation: rec.rotation, opacity: rec.opacity
            });
          } else {
            createTextElement(rec.type, {
              text: rec.text, x: rec.x, y: rec.y, w: rec.w, h: rec.h,
              fontSize: rec.fontSize, fontWeight: rec.fontWeight, fontStyle: rec.fontStyle,
              fontFamily: rec.fontFamily, textAlign: rec.textAlign, letterSpacing: rec.letterSpacing,
              color: rec.color, rotation: rec.rotation, opacity: rec.opacity
            });
          }
        });
        selectElement(null);
        return;
      }
    }
    if(window.bookToolState.record.data.trimSize)trimSizeEl.value=window.bookToolState.record.data.trimSize;if(window.bookToolState.record.data.pageCount)pageCountEl.value=window.bookToolState.record.data.pageCount;computeDimensions();TEMPLATES.centered();
  })();
});
