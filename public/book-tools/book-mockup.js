// ============================================================
// Meridian Press — Book mockup generator
//
// Builds a real 3D book (front cover, spine, page-edge, back)
// using CSS 3D transforms — translateZ + rotateY to form an actual
// box, not a flat image with a skew. Pulls the real cover design
// from Supabase when available (cover_layout_json / cover_draft_url
// on the author's most recent manuscript), falling back to a
// generated placeholder cover from the title/author fields.
// ============================================================

document.addEventListener('DOMContentLoaded', async function () {
  var session = window.MeridianSession ? await MeridianSession.requireRole('author', 'login.html') : null;
  if (!session && window.MeridianSession) return;

  var BOOK_WIDTH = 260;   // px, front-cover width at 100% scale
  var BOOK_HEIGHT = 380;  // px, front-cover height at 100% scale

  var stage = document.getElementById('bmStage');
  var bookGroup = document.getElementById('bmBookGroup');
  var book = document.getElementById('bmBook');
  var faceFront = document.getElementById('bmFaceFront');
  var faceSpine = document.getElementById('bmFaceSpine');
  var facePages = document.getElementById('bmFacePages');
  var faceBack = document.getElementById('bmFaceBack');
  var shadow = document.getElementById('bmShadow');
  var sourceNote = document.getElementById('mockupSourceNote');

  var state = { rotateY: -30, rotateX: 8, thickness: 30, scale: 100 };

  // ---------- angle presets ----------
  var ANGLE_PRESETS = {
    threequarter: { rotateY: -30, rotateX: 8 },
    front: { rotateY: 0, rotateX: 0 },
    side: { rotateY: -55, rotateX: 4 },
    dramatic: { rotateY: -40, rotateX: 20 }
  };

  document.getElementById('anglePresets').querySelectorAll('.bm-preset-thumb').forEach(function (thumb) {
    thumb.addEventListener('click', function () {
      document.querySelectorAll('#anglePresets .bm-preset-thumb').forEach(function (t) { t.classList.remove('selected'); });
      thumb.classList.add('selected');
      var preset = ANGLE_PRESETS[thumb.dataset.preset];
      state.rotateY = preset.rotateY;
      state.rotateX = preset.rotateX;
      document.getElementById('rotateY').value = state.rotateY;
      document.getElementById('rotateX').value = state.rotateX;
      updateSliderLabels();
      renderBook();
    });
  });

  // ---------- background presets ----------
  document.querySelectorAll('.bm-preset-grid .bm-preset-thumb[data-bg]').forEach(function (thumb) {
    thumb.addEventListener('click', function () {
      document.querySelectorAll('.bm-preset-thumb[data-bg]').forEach(function (t) { t.classList.remove('selected'); });
      thumb.classList.add('selected');
      stage.className = 'bm-stage ' + thumb.dataset.bg;
    });
  });

  // ---------- sliders ----------
  var rotateYInput = document.getElementById('rotateY');
  var rotateXInput = document.getElementById('rotateX');
  var thicknessInput = document.getElementById('bookThickness');
  var scaleInput = document.getElementById('bookScale');

  function updateSliderLabels() {
    document.getElementById('rotateYValue').textContent = rotateYInput.value + '°';
    document.getElementById('rotateXValue').textContent = rotateXInput.value + '°';
    document.getElementById('bookThicknessValue').textContent = thicknessInput.value + 'px';
    document.getElementById('bookScaleValue').textContent = scaleInput.value + '%';
  }

  [rotateYInput, rotateXInput, thicknessInput, scaleInput].forEach(function (input) {
    input.addEventListener('input', function () {
      state.rotateY = parseInt(rotateYInput.value, 10);
      state.rotateX = parseInt(rotateXInput.value, 10);
      state.thickness = parseInt(thicknessInput.value, 10);
      state.scale = parseInt(scaleInput.value, 10);
      updateSliderLabels();
      renderBook();
    });
  });

  // ---------- build the 3D book faces ----------
  function renderBook() {
    var scaleFactor = state.scale / 100;
    var w = BOOK_WIDTH * scaleFactor;
    var h = BOOK_HEIGHT * scaleFactor;
    var thickness = state.thickness * scaleFactor;

    bookGroup.style.transform =
      'translate(-50%, -50%) rotateX(' + state.rotateX + 'deg) rotateY(' + state.rotateY + 'deg)';

    book.style.width = w + 'px';
    book.style.height = h + 'px';

    // Front cover: sits at the "near" face of the box (z = +thickness/2)
    faceFront.style.width = w + 'px';
    faceFront.style.height = h + 'px';
    faceFront.style.transform = 'translateZ(' + (thickness / 2) + 'px)';

    // Back cover: at the far face
    faceBack.style.width = w + 'px';
    faceBack.style.height = h + 'px';
    faceBack.style.transform = 'translateZ(' + (-thickness / 2) + 'px) rotateY(180deg)';

    // Spine: rotated 90° around Y, positioned at the left edge
    faceSpine.style.width = thickness + 'px';
    faceSpine.style.height = h + 'px';
    faceSpine.style.transform = 'translateX(' + (-thickness / 2) + 'px) rotateY(-90deg)';
    faceSpine.style.left = '0px';
    faceSpine.style.top = '0px';

    // Page edge: opposite the spine, at the right
    facePages.style.width = thickness + 'px';
    facePages.style.height = h + 'px';
    facePages.style.transform = 'translateX(' + (w - thickness / 2) + 'px) rotateY(90deg)';
    facePages.style.left = '0px';
    facePages.style.top = '0px';

    // ground shadow, scaled and softened based on tilt
    var shadowWidth = w * 0.9;
    var shadowHeight = 40 * scaleFactor;
    shadow.style.width = shadowWidth + 'px';
    shadow.style.height = shadowHeight + 'px';
    shadow.style.left = '50%';
    shadow.style.top = 'calc(50% + ' + (h / 2 + thickness * 0.3) + 'px)';
    shadow.style.transform = 'translate(-50%, -50%) rotateX(' + (90 - Math.abs(state.rotateX)) + 'deg)';
  }

  // ---------- cover content: real design or placeholder ----------
  async function loadCoverContent() {
    var titleInput = document.getElementById('mockupTitle');
    var authorInput = document.getElementById('mockupAuthor');

    if (session) {
      // Opened from the dashboard as book-mockup.html?id=<manuscript_id> so
      // the mockup always matches the book actually selected there. With no
      // id (e.g. a bare bookmark) we no longer guess "most recent
      // manuscript" — that risks showing the wrong book's cover under
      // another book's title; it falls through to the placeholder instead.
      var manuscriptId = new URLSearchParams(window.location.search).get('id');
      var res = manuscriptId
        ? await supabaseClient.from('manuscripts').select('title, cover_layout_json, cover_draft_url').eq('id', manuscriptId).maybeSingle()
        : { data: null };

      if (res.data) {
        titleInput.value = res.data.title || titleInput.value;authorInput.value=res.data.author_name||session.name||'';

        if (res.data.cover_layout_json) {
          sourceNote.textContent = 'Using your saved cover design';
          renderRealCover(res.data.cover_layout_json);
          return;
        }
        if (res.data.cover_draft_url) {
          sourceNote.textContent = 'Using your uploaded cover background';
          var urlRes = supabaseClient.storage.from('covers').getPublicUrl(res.data.cover_draft_url);
          faceFront.style.backgroundImage = 'url(' + urlRes.data.publicUrl + ')';
          faceFront.innerHTML = '';
          return;
        }
      }
    }

    sourceNote.textContent = 'No saved cover found — showing a placeholder';
    renderPlaceholderCover(titleInput.value, authorInput.value);
    titleInput.addEventListener('input', function () { renderPlaceholderCover(titleInput.value, authorInput.value); });
    authorInput.addEventListener('input', function () { renderPlaceholderCover(titleInput.value, authorInput.value); });
  }

  function renderPlaceholderCover(title, author) {
    faceFront.style.backgroundImage = '';
    faceFront.innerHTML =
      '<div class="bm-cover-fallback">' +
        '<div class="bm-fb-title">' + escapeHtml(title || 'Untitled') + '</div>' +
        '<div class="bm-fb-author">' + escapeHtml(author || '') + '</div>' +
      '</div>';
  }

  function renderRealCover(layout) {
    faceFront.innerHTML = '';
    faceFront.style.position = 'relative';
    faceFront.style.overflow = 'hidden';

    if (layout.background) {
      if (layout.background.type === 'image') {
        faceFront.style.backgroundImage = 'url(' + layout.background.value + ')';
      } else {
        faceFront.style.backgroundImage = '';
        faceFront.style.background = layout.background.value;
      }
    }

    // The saved layout's coordinates are in the cover designer's full
    // wraparound canvas space (back + spine + front). Re-render only the
    // front-panel elements here, remapped into this face's own local
    // coordinate space, scaled to fit BOOK_WIDTH x BOOK_HEIGHT.
    var frontElements = (layout.elements || []);
    if (!frontElements.length) return;

    // Determine the front panel's bounds from the layout, approximated as
    // the right-most third of the saved canvas (matches cover-designer.js's
    // own front/spine/back split), then scale into this face's box.
    var maxX = Math.max.apply(null, frontElements.map(function (e) { return e.x + e.w; }).concat([1]));
    var minFrontX = maxX * 0.55; // front panel starts roughly here on the saved canvas
    var scaleX = BOOK_WIDTH / (maxX - minFrontX);
    var scaleY = scaleX; // keep proportions

    frontElements.forEach(function (rec) {
      if (rec.x + rec.w < minFrontX) return; // skip elements that live on the back/spine
      var el = document.createElement('div');
      var localX = (rec.x - minFrontX) * scaleX;
      var localY = rec.y * scaleY;
      el.style.position = 'absolute';
      el.style.left = localX + 'px';
      el.style.top = localY + 'px';
      el.style.width = (rec.w * scaleX) + 'px';
      el.style.height = (rec.h * scaleY) + 'px';
      el.style.transform = 'rotate(' + (rec.rotation || 0) + 'deg)';
      el.style.opacity = rec.opacity !== undefined ? rec.opacity : 1;

      if (rec.kind === 'shape') {
        el.style.background = rec.type === 'line' ? 'none' : rec.fill;
        if (rec.type === 'circle') el.style.borderRadius = '50%';
        if (rec.strokeWidth) {
          if (rec.type === 'line') el.style.borderTop = (rec.strokeWidth * scaleY) + 'px solid ' + rec.stroke;
          else el.style.border = (rec.strokeWidth * scaleY) + 'px solid ' + rec.stroke;
        }
      } else {
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = { left: 'flex-start', center: 'center', right: 'flex-end' }[rec.textAlign || 'center'];
        el.style.fontFamily = rec.fontFamily || "'Fraunces', serif";
        el.style.fontSize = ((rec.fontSize || 16) * scaleY) + 'px';
        el.style.fontWeight = rec.fontWeight || '400';
        el.style.fontStyle = rec.fontStyle || 'normal';
        el.style.color = rec.color || '#FAF7F0';
        el.style.letterSpacing = ((rec.letterSpacing || 0) * scaleY) + 'px';
        el.style.textAlign = rec.textAlign || 'center';
        el.textContent = rec.text || '';
      }
      faceFront.appendChild(el);
    });
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- PNG export ----------
  document.getElementById('downloadMockupBtn').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Rendering…';
    html2canvas(stage, { backgroundColor: null, scale: 2 }).then(function (canvas) {
      var link = document.createElement('a');
      link.download = 'book-mockup.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      btn.disabled = false;
      btn.textContent = 'Download PNG';
    }).catch(function (err) {
      alert('Could not render the mockup image: ' + err.message);
      btn.disabled = false;
      btn.textContent = 'Download PNG';
    });
  });

  // ---------- init ----------
  updateSliderLabels();
  renderBook();
  await loadCoverContent();
});
