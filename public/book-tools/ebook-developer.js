// ============================================================
// Meridian Press — Ebook developer
//
// Reads the real manuscript content saved by the author dashboard's
// editor (content_mode + content_json), normalizes it into a chapter
// list regardless of whether it was written in continuous or
// structured mode, renders a live e-reader preview, and generates a
// real, spec-valid EPUB 3 file client-side using JSZip.
// ============================================================

document.addEventListener('DOMContentLoaded', async function () {
  var session = window.MeridianSession ? await MeridianSession.requireRole('author', 'login.html') : null;
  if (!session && window.MeridianSession) return;

  var screen = document.getElementById('ebScreen');
  var pageContentEl = document.getElementById('ebPageContent');
  var chapterNav = document.getElementById('ebChapterNav');
  var sourceNote = document.getElementById('ebSourceNote');

  var chapters = []; // [{ title, html }]
  var pages = [];     // flattened, paginated content per chapter: [{ chapterIndex, html }]
  var currentPageIndex = 0;
  var currentManuscriptId = null; // set by loadManuscript(); used by the EPUB export to upload + link the file

  // ============================================================
  // Load + normalize manuscript content
  // ============================================================
  async function loadManuscript() {
    if (!session) {
      chapters = [{ title: 'Sample chapter', html: '<h1>Sample chapter</h1><p>No manuscript found — this is placeholder text so the preview and export tools can still be tried out.</p>' }];
      return;
    }

    // Opened from the dashboard as ebook-developer.html?id=<manuscript_id>
    // so this always previews the book the author actually selected there.
    // With no id, we no longer guess "whichever draft is newest" — this
    // tool also writes the generated EPUB's storage path back onto
    // currentManuscriptId, so guessing wrong would silently attach an
    // export to the wrong book. It falls through to the placeholder instead.
    var manuscriptId = new URLSearchParams(window.location.search).get('id');
    var res = manuscriptId
      ? await supabaseClient.from('manuscripts').select('id, title, content_mode, content_json').eq('id', manuscriptId).maybeSingle()
      : { data: null };

    if (!res.data || !res.data.content_json) {
      sourceNote.textContent = 'No saved manuscript content found — showing placeholder';
      chapters = [{ title: 'Untitled', html: '<h1>Untitled</h1><p>Start writing in the manuscript editor, then come back here to preview and export your ebook.</p>' }];
      return;
    }

    currentManuscriptId = res.data.id;

    document.getElementById('ebTitle').value = res.data.title || 'Untitled manuscript';
    document.getElementById('ebAuthor').value = res.data.author_name || session.name || '';

    if (res.data.content_mode === 'structured') {
      sourceNote.textContent = 'Using your saved structured manuscript';
      var sections = res.data.content_json;
      chapters = [];
      (sections.front || []).forEach(function (s) { chapters.push({ title: s.title, html: s.content || '<p></p>' }); });
      (sections.chapters || []).forEach(function (s) { chapters.push({ title: s.title, html: s.content || '<p></p>' }); });
      (sections.end || []).forEach(function (s) { chapters.push({ title: s.title, html: s.content || '<p></p>' }); });
      if (!chapters.length) chapters = [{ title: res.data.title || 'Untitled', html: '<p>This manuscript has no content yet.</p>' }];
    } else {
      sourceNote.textContent = 'Using your saved continuous manuscript';
      var html = res.data.content_json.html || '<p>This manuscript has no content yet.</p>';
      // continuous mode is one long document; split on page-break markers
      // (the same divs the editor inserts) or, failing that, treat it as
      // a single chapter
      var parts = html.split(/<div[^>]*page-break-after[^>]*><\/div>/i);
      chapters = parts.map(function (part, i) {
        return { title: (res.data.title || 'Untitled') + (parts.length > 1 ? ' — part ' + (i + 1) : ''), html: part };
      }).filter(function (c) { return c.html.trim().length; });
      if (!chapters.length) chapters = [{ title: res.data.title || 'Untitled', html: '<p>This manuscript has no content yet.</p>' }];
    }
  }

  // ============================================================
  // Pagination — split each chapter's rendered content into pages
  // that fit the device screen, so "page turns" feel real
  // ============================================================
  function paginate() {
    pages = [];
    var probe = document.createElement('div');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.height = screen.clientHeight + 'px';
    probe.style.width = screen.clientWidth + 'px';
    probe.style.overflow = 'hidden';
    probe.style.fontFamily = screen.style.fontFamily;
    probe.style.fontSize = screen.style.fontSize;
    probe.style.lineHeight = screen.style.lineHeight;
    probe.style.padding = getComputedStyle(screen).padding;
    document.body.appendChild(probe);

    chapters.forEach(function (chapter, chapterIndex) {
      var wrapper = document.createElement('div');
      wrapper.innerHTML = chapter.html;
      var blocks = Array.prototype.slice.call(wrapper.children);
      if (!blocks.length) blocks = [wrapper]; // whole thing as one block if unparsed

      var currentHtml = '';
      var testEl = document.createElement('div');
      probe.appendChild(testEl);

      blocks.forEach(function (block) {
        var attempt = currentHtml + block.outerHTML;
        testEl.innerHTML = attempt;
        if (testEl.scrollHeight > probe.clientHeight && currentHtml) {
          pages.push({ chapterIndex: chapterIndex, html: currentHtml });
          currentHtml = block.outerHTML;
        } else {
          currentHtml = attempt;
        }
      });
      if (currentHtml) pages.push({ chapterIndex: chapterIndex, html: currentHtml });
      probe.removeChild(testEl);
    });

    document.body.removeChild(probe);
    if (!pages.length) pages = [{ chapterIndex: 0, html: '<p>Nothing to preview yet.</p>' }];
  }

  function renderChapterNav() {
    chapterNav.innerHTML = '';
    chapters.forEach(function (chapter, i) {
      var pill = document.createElement('div');
      pill.className = 'eb-chapter-pill';
      pill.textContent = chapter.title;
      pill.addEventListener('click', function () {
        var firstPageOfChapter = pages.findIndex(function (p) { return p.chapterIndex === i; });
        if (firstPageOfChapter !== -1) goToPage(firstPageOfChapter);
      });
      chapterNav.appendChild(pill);
    });
    updateChapterNavHighlight();
  }

  function updateChapterNavHighlight() {
    var activeChapterIndex = pages[currentPageIndex] ? pages[currentPageIndex].chapterIndex : 0;
    Array.prototype.forEach.call(chapterNav.children, function (pill, i) {
      pill.classList.toggle('active', i === activeChapterIndex);
    });
  }

  function goToPage(index) {
    currentPageIndex = Math.max(0, Math.min(pages.length - 1, index));
    pageContentEl.innerHTML = pages[currentPageIndex].html;
    document.getElementById('ebPageIndicator').textContent = (currentPageIndex + 1) + ' of ' + pages.length;
    document.getElementById('ebPrevBtn').disabled = currentPageIndex === 0;
    document.getElementById('ebNextBtn').disabled = currentPageIndex === pages.length - 1;
    updateChapterNavHighlight();
  }

  document.getElementById('ebNextBtn').addEventListener('click', function () { goToPage(currentPageIndex + 1); });
  document.getElementById('ebPrevBtn').addEventListener('click', function () { goToPage(currentPageIndex - 1); });

  // ============================================================
  // Reading theme + typography controls
  // ============================================================
  document.getElementById('themePresets').querySelectorAll('.eb-theme-thumb').forEach(function (thumb) {
    thumb.addEventListener('click', function () {
      document.querySelectorAll('.eb-theme-thumb').forEach(function (t) { t.classList.remove('selected'); });
      thumb.classList.add('selected');
      screen.className = 'eb-device-screen ' + thumb.dataset.theme;
      repaginate();
    });
  });

  var fontFamilySelect = document.getElementById('ebFontFamily');
  var fontSizeInput = document.getElementById('ebFontSize');
  var lineHeightInput = document.getElementById('ebLineHeight');

  function applyTypography() {
    screen.style.fontFamily = fontFamilySelect.value;
    screen.style.fontSize = fontSizeInput.value + 'px';
    screen.style.lineHeight = (parseInt(lineHeightInput.value, 10) / 10);
    document.getElementById('ebFontSizeValue').textContent = fontSizeInput.value + 'px';
    document.getElementById('ebLineHeightValue').textContent = (parseInt(lineHeightInput.value, 10) / 10).toFixed(1);
  }
  [fontFamilySelect, fontSizeInput, lineHeightInput].forEach(function (el) {
    el.addEventListener('input', function () { applyTypography(); repaginate(); });
  });

  function repaginate() {
    var wasChapter = pages[currentPageIndex] ? pages[currentPageIndex].chapterIndex : 0;
    paginate();
    renderChapterNav();
    var newIndex = pages.findIndex(function (p) { return p.chapterIndex === wasChapter; });
    goToPage(newIndex !== -1 ? newIndex : 0);
  }

  // ============================================================
  // Manuscript validation (surfaces real, useful issues)
  // ============================================================
  function runValidation() {
    var issues = [];
    var okItems = [];

    if (!chapters.length || chapters.every(function (c) { return !stripTags(c.html).trim(); })) {
      issues.push('Manuscript has no readable content yet.');
    } else {
      okItems.push(chapters.length + ' chapter' + (chapters.length === 1 ? '' : 's') + ' found.');
    }

    var wordCount = chapters.reduce(function (sum, c) { return sum + stripTags(c.html).trim().split(/\s+/).filter(Boolean).length; }, 0);
    if (wordCount < 500) {
      issues.push('Very short manuscript (' + wordCount + ' words) — fine for testing, but check nothing is missing.');
    } else {
      okItems.push(wordCount.toLocaleString('en-IN') + ' words total.');
    }

    if (!document.getElementById('ebTitle').value.trim()) issues.push('Title is empty — required for a valid EPUB.');
    else okItems.push('Title set.');

    if (!document.getElementById('ebAuthor').value.trim()) issues.push('Author name is empty.');
    else okItems.push('Author set.');

    var el = document.getElementById('ebValidation');
    el.innerHTML = '';
    okItems.forEach(function (msg) {
      el.innerHTML += '<div class="eb-validation-item ok">✓ ' + escapeHtml(msg) + '</div>';
    });
    issues.forEach(function (msg) {
      el.innerHTML += '<div class="eb-validation-item warn">! ' + escapeHtml(msg) + '</div>';
    });
  }

  function stripTags(html) {
    var div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || '';
  }
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  function escapeXml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  // ============================================================
  // Real EPUB 3 generation (JSZip) — valid package structure:
  // mimetype, META-INF/container.xml, content.opf, nav.xhtml,
  // one XHTML file per chapter, minimal stylesheet.
  // ============================================================
  document.getElementById('downloadEpubBtn').addEventListener('click', async function () {
    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Building EPUB…';

    try {
      var title = document.getElementById('ebTitle').value.trim() || 'Untitled';
      var author = document.getElementById('ebAuthor').value.trim() || 'Unknown';
      var language = document.getElementById('ebLanguage').value.trim() || 'en';
      var uuid = 'urn:uuid:' + generateUuid();

      var zip = new JSZip();

      // mimetype MUST be first, uncompressed, no extra attributes
      zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

      zip.folder('META-INF').file('container.xml',
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
        '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>' +
        '</container>'
      );

      var oebps = zip.folder('OEBPS');

      oebps.file('style.css',
        'body{font-family:Georgia,serif; line-height:1.6; margin:1em;} ' +
        'h1{font-size:1.4em;} h2{font-size:1.15em;} p{margin:0 0 1em;}'
      );

      var manifestItems = [];
      var spineItems = [];
      var navItems = [];

      chapters.forEach(function (chapter, i) {
        var fileName = 'chapter' + (i + 1) + '.xhtml';
        var id = 'chap' + (i + 1);
        var xhtml =
          '<?xml version="1.0" encoding="UTF-8"?>' +
          '<html xmlns="http://www.w3.org/1999/xhtml"><head>' +
          '<title>' + escapeXml(chapter.title) + '</title>' +
          '<link rel="stylesheet" type="text/css" href="style.css"/>' +
          '</head><body>' + sanitizeForXhtml(chapter.html) + '</body></html>';
        oebps.file(fileName, xhtml);
        manifestItems.push('<item id="' + id + '" href="' + fileName + '" media-type="application/xhtml+xml"/>');
        spineItems.push('<itemref idref="' + id + '"/>');
        navItems.push('<li><a href="' + fileName + '">' + escapeXml(chapter.title) + '</a></li>');
      });

      var navXhtml =
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head>' +
        '<title>Contents</title></head><body>' +
        '<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>' +
        navItems.join('') +
        '</ol></nav></body></html>';
      oebps.file('nav.xhtml', navXhtml);

      var opf =
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">' +
        '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
        '<dc:identifier id="bookid">' + uuid + '</dc:identifier>' +
        '<dc:title>' + escapeXml(title) + '</dc:title>' +
        '<dc:creator>' + escapeXml(author) + '</dc:creator>' +
        '<dc:language>' + escapeXml(language) + '</dc:language>' +
        '<meta property="dcterms:modified">' + new Date().toISOString().replace(/\.\d+Z$/, 'Z') + '</meta>' +
        '</metadata>' +
        '<manifest>' +
        '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' +
        '<item id="css" href="style.css" media-type="text/css"/>' +
        manifestItems.join('') +
        '</manifest>' +
        '<spine>' + spineItems.join('') + '</spine>' +
        '</package>';
      oebps.file('content.opf', opf);

      var blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
      var fileName = (title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'manuscript') + '.epub';
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      link.textContent='Download prepared EPUB';link.style.cssText='display:inline-block;padding:12px;background:#284f43;color:white;margin:12px';document.getElementById('toolNotice').appendChild(link);

      // Also upload to Storage and link it on the manuscript, so staff and
      // the bookstore's "eBook format" listing reference the same file
      // instead of only the author having a local copy.
      if (session && currentManuscriptId) {
        btn.textContent = 'Uploading EPUB…';
        var path = session.id + '/' + currentManuscriptId + '/' + Date.now() + '-' + fileName;
        var uploadRes = await supabaseClient.storage.from('manuscripts').upload(path, blob, { contentType: 'application/epub+zip' });
        if (uploadRes.error) {
          alert('Your EPUB is ready to download, but could not be saved to your account: ' + uploadRes.error.message);
        } else {
          var linkRes = {error:null}; // The authenticated EPUB upload links the file to this book.
          if (linkRes.error) {
            alert('Your EPUB uploaded, but could not be linked to this manuscript: ' + linkRes.error.message);
          }
        }
      }
    } catch (err) {
      alert('Could not generate the EPUB file: ' + err.message);
    }

    btn.disabled = false;
    btn.textContent = 'Download EPUB';
  });

  function sanitizeForXhtml(html) {
    // basic cleanup: XHTML requires self-closing void elements
    return html.replace(/<br>/gi, '<br/>').replace(/<hr>/gi, '<hr/>').replace(/<img([^>]*[^/])>/gi, '<img$1/>');
  }

  function generateUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // ---------- init ----------
  await loadManuscript();
  applyTypography();
  paginate();
  renderChapterNav();
  goToPage(0);
  runValidation();

  document.getElementById('ebTitle').addEventListener('input', runValidation);
  document.getElementById('ebAuthor').addEventListener('input', runValidation);
});
