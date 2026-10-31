// ============================================================
// Meridian Press — Manuscript editor
//
// Loads and saves a real manuscript row (content_mode/content_json, same
// fields the dashboard's built-in editor uses) plus real comment threads
// in manuscript_comments / manuscript_comment_messages (see
// supabase/editor_comments_schema.sql). Opened as
// editor.html?id=<manuscript_id>.
// ============================================================

document.addEventListener('DOMContentLoaded', async function () {

  // ---------- session + manuscript id ----------
  var session = window.MeridianSession ? await MeridianSession.requireRole(null, 'login.html') : null;
  if (!session && window.MeridianSession) return; // requireRole already redirected

  var manuscriptId = new URLSearchParams(window.location.search).get('id');
  var saveState = document.getElementById('saveState');
  if (!manuscriptId) {
    if (saveState) saveState.textContent = 'No manuscript selected';
  }

  // ---------- role state ----------
  // Defaults to 'staff' acting as editor when the signed-in user is staff,
  // otherwise 'author' — matches who's actually looking at the page,
  // rather than an arbitrary default.
  var currentRole = (session && session.role === 'staff') ? 'editor' : 'author';
  var btnAuthorRole = document.getElementById('btnAuthorRole');
  var btnEditorRole = document.getElementById('btnEditorRole');
  var addCommentBtn = document.getElementById('addCommentBtn');

  function setRole(role) {
    currentRole = role;
    btnAuthorRole.classList.toggle('active', role === 'author');
    btnEditorRole.classList.toggle('active', role === 'editor');
    renderComments();
  }
  btnAuthorRole.addEventListener('click', function () { setRole('author'); });
  btnEditorRole.addEventListener('click', function () { setRole('editor'); });

  // ---------- page size presets (inches, at 96dpi CSS reference) ----------
  var TRIM_SIZES = {
    '5x8':      { w: 5,   h: 8 },
    '5.5x8.5':  { w: 5.5, h: 8.5 },
    '6x9':      { w: 6,   h: 9 },
    '8.5x8.5': { w: 8.5, h: 8.5 },
    '8.5x11':   { w: 8.5, h: 11 }
  };
  var DPI = 96; // on-screen approximation; real print pagination is confirmed at proofing

  var trimSizeEl   = document.getElementById('trimSize');
  var marginTop    = document.getElementById('marginTop');
  var marginBottom = document.getElementById('marginBottom');
  var marginLeft   = document.getElementById('marginLeft');
  var marginRight  = document.getElementById('marginRight');
  var bodyFontEl   = document.getElementById('bodyFont');
  var fontSizeEl   = document.getElementById('fontSize');
  var lineHeightEl = document.getElementById('lineHeight');

  var editorPage = document.getElementById('editorPage');
  var manuscriptBody = document.getElementById('manuscriptBody');

  var statWords = document.getElementById('statWords');
  var statPages = document.getElementById('statPages');
  var statComments = document.getElementById('statComments');
  var docTitleEl = document.getElementById('docTitle');

  function applyPageLayout() {
    var size = TRIM_SIZES[trimSizeEl.value];
    editorPage.style.width = (size.w * DPI) + 'px';
    editorPage.style.minHeight = (size.h * DPI) + 'px';
    editorPage.style.setProperty('--page-margin-top', marginTop.value + 'in');
    editorPage.style.setProperty('--page-margin-bottom', marginBottom.value + 'in');
    editorPage.style.setProperty('--page-margin-left', marginLeft.value + 'in');
    editorPage.style.setProperty('--page-margin-right', marginRight.value + 'in');
    updateStats();
  }

  function applyTypography() {
    manuscriptBody.style.fontFamily = bodyFontEl.value;
    manuscriptBody.style.fontSize = fontSizeEl.value + 'pt';
    manuscriptBody.style.lineHeight = lineHeightEl.value;
    updateStats();
  }

  [trimSizeEl, marginTop, marginBottom, marginLeft, marginRight].forEach(function (el) {
    el.addEventListener('change', function(){applyPageLayout();markUnsaved();});
  });
  [bodyFontEl, fontSizeEl, lineHeightEl].forEach(function (el) {
    el.addEventListener('change', function(){applyTypography();markUnsaved();});
  });

  // ---------- word count + page estimate ----------
  function updateStats() {
    var text = manuscriptBody.innerText || '';
    var words = text.trim().length ? text.trim().split(/\s+/).length : 0;
    statWords.textContent = words.toLocaleString('en-IN');

    // Rough estimate: average words-per-page depends on trim size, font size,
    // and line spacing. This is a simplified model — real pagination is set
    // at the proofing stage using the actual print layout engine.
    var size = TRIM_SIZES[trimSizeEl.value];
    var usableAreaSqIn = (size.w - parseFloat(marginLeft.value) - parseFloat(marginRight.value)) *
                          (size.h - parseFloat(marginTop.value) - parseFloat(marginBottom.value));
    var fontPt = parseFloat(fontSizeEl.value);
    var lineMult = parseFloat(lineHeightEl.value);
    var wordsPerSqInAt11pt = 16; // rough single-spaced density baseline
    var densityAdj = (11 / fontPt) * (1.6 / lineMult);
    var wordsPerPage = Math.max(80, Math.round(usableAreaSqIn * wordsPerSqInAt11pt * densityAdj));

    var pages = Math.max(1, Math.ceil(words / wordsPerPage));
    statPages.textContent = pages.toLocaleString('en-IN');
  }

  manuscriptBody.addEventListener('input', function () {
    updateStats();
    markUnsaved();
  });

  // ---------- real autosave ----------
  // Tracks whether the loaded manuscript used the dashboard's "structured"
  // (per-chapter) editor or its "continuous" (single flow) editor, so this
  // standalone editor saves back in the SAME shape it loaded — it must
  // never flatten a structured manuscript's chapters into one continuous
  // blob (that would silently destroy the chapter breakdown), and must
  // never wrap a continuous manuscript into a fake single "chapter".
  var structuredModel = {front:[],chapters:[],end:[]};
  var contentMode = 'continuous'; // 'continuous' | 'structured', set by loadManuscript()

  var saveTimer = null;
  function markUnsaved() {
    if (saveState) saveState.textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 900);
  }

  // Serializes the DOM back into the same per-section shape it was loaded
  // from. Each section is wrapped at load time in a
  // <div data-sec-group data-sec-id data-sec-title> marker (see
  // renderStructuredContent below) so edits inside a section stay scoped to
  // it; sections the editor never saw (because they were empty) are passed
  // through unchanged by merging onto the originally-loaded model.
  function serializeStructuredContent() {
    var result = { front: [], chapters: [], end: [] };
    manuscriptBody.querySelectorAll(':scope > [data-sec-id]').forEach(function (wrap) {
      var group = wrap.getAttribute('data-sec-group');
      if (!result[group]) return;
      var bodyEl = wrap.querySelector('.editor-sec-body');
      result[group].push({
        id: wrap.getAttribute('data-sec-id'),
        title: wrap.getAttribute('data-sec-title') || '',
        content: bodyEl ? bodyEl.innerHTML : ''
      });
    });
    return result;
  }

  async function saveNow() {
    if (!manuscriptId || !supabaseClient) {
      if (saveState) saveState.textContent = 'Not saved — no manuscript open';
      return;
    }

    var updateFields = { title: docTitleEl.value, page_setup: {trimSize:trimSizeEl.value,marginTop:marginTop.value,marginBottom:marginBottom.value,marginLeft:marginLeft.value,marginRight:marginRight.value,bodyFont:bodyFontEl.value,fontSize:fontSizeEl.value,lineHeight:lineHeightEl.value} };
    if (contentMode === 'structured') {
      updateFields.content_mode = 'structured';
      updateFields.content_json = serializeStructuredContent();
    } else {
      updateFields.content_mode = 'continuous';
      updateFields.content_json = { html: manuscriptBody.innerHTML };
    }

    var res = await supabaseClient.from('manuscripts').update(updateFields).eq('id', manuscriptId);

    if (res.error) {
      console.error('Could not save manuscript content', res.error);
      if (saveState) {
        saveState.textContent = 'Could not save — check your connection';
        saveState.style.color = 'var(--brick, #b23b2e)';
      }
      return;
    }
    if (saveState) {
      saveState.style.color = '';
      saveState.textContent = 'All changes saved';
    }
  }

  // Renders a structured manuscript's chapters/front/end matter as a
  // sequence of clearly-labeled, independently-editable sections, each
  // tagged with the same id/title/group it will be saved back under.
  function renderStructuredContent(contentJson) {
    structuredModel=contentJson;
    manuscriptBody.innerHTML = '';
    var groups = [['front', 'Front matter'], ['chapters', 'Chapters'], ['end', 'End matter']];
    groups.forEach(function (pair) {
      var groupKey = pair[0];
      (contentJson[groupKey] || []).forEach(function (sec) {
        var wrap = document.createElement('div');
        wrap.setAttribute('data-sec-id', sec.id);
        wrap.setAttribute('data-sec-group', groupKey);
        wrap.setAttribute('data-sec-title', sec.title || '');
        wrap.style.marginBottom = '2em';

        var heading = document.createElement('h2');
        heading.className = 'editor-sec-heading';
        heading.contentEditable = 'false';
        heading.style.opacity = '0.7';
        heading.textContent = sec.title || 'Untitled section';
        wrap.appendChild(heading);

        var bodyEl = document.createElement('div');
        bodyEl.className = 'editor-sec-body';
        bodyEl.innerHTML = sec.content || '';
        wrap.appendChild(bodyEl);

        manuscriptBody.appendChild(wrap);
      });
    });
  }

  async function loadManuscript() {
    if (!manuscriptId || !supabaseClient) return;
    var res = await supabaseClient.from('manuscripts')
      .select('title, content_mode, content_json').eq('id', manuscriptId).maybeSingle();
    if (res.error) {
      console.error('Could not load manuscript', res.error);
      if (saveState) saveState.textContent = 'Could not load this manuscript';
      return;
    }
    if (!res.data) {
      if (saveState) saveState.textContent = 'Manuscript not found';
      return;
    }
    if (res.data.title) docTitleEl.value = res.data.title;

    if (res.data.content_mode === 'structured' && res.data.content_json) {
      contentMode = 'structured';
      renderStructuredContent(res.data.content_json);
      if (saveState) saveState.textContent = 'Editing a structured manuscript — saved per chapter, same as the dashboard editor';
    } else {
      contentMode = 'continuous';
      if (res.data.content_json && res.data.content_json.html) {
        manuscriptBody.innerHTML = res.data.content_json.html;
      }
    }
    var setup=res.data.page_setup||{};[trimSizeEl,marginTop,marginBottom,marginLeft,marginRight,bodyFontEl,fontSizeEl,lineHeightEl].forEach(function(el){if(setup[el.id]!==undefined)el.value=setup[el.id];});applyPageLayout();applyTypography();updateStats();
  }

  // ---------- toolbar commands ----------
  document.querySelectorAll('.editor-toolbar button[data-cmd]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      manuscriptBody.focus();
      var cmd = btn.dataset.cmd;
      if (cmd === 'insertPageBreak') {
        document.execCommand('insertHTML', false,
          '<div style="page-break-after:always; border-top:1px dashed var(--rule-dark); margin:1.5em 0; height:0;"></div>');
      } else if (cmd === 'formatBlock') {
        document.execCommand('formatBlock', false, btn.dataset.value);
      } else {
        document.execCommand(cmd, false, null);
      }
      markUnsaved();
    });
  });

  docTitleEl.addEventListener('input', markUnsaved);

  // ============================================================
  // Comments
  // ============================================================

  // Loaded from / saved to manuscript_comments + manuscript_comment_messages
  // (see supabase/editor_comments_schema.sql) — not local-only state, so a
  // reload no longer wipes them.
  var comments = []; // { id, quote, resolved, messages: [{id, author, role, text, ts}] }
  var pendingRange = null;

  async function loadComments() {
    if (!manuscriptId || !supabaseClient) return;
    var threadsRes = await supabaseClient.from('manuscript_comments')
      .select('id, quote, resolved').eq('manuscript_id', manuscriptId).order('created_at');
    if (threadsRes.error) { console.error('Could not load comments', threadsRes.error); return; }

    var threads = threadsRes.data || [];
    for (var i = 0; i < threads.length; i++) {
      var msgRes = await supabaseClient.from('manuscript_comment_messages')
        .select('id, author_name, role, body, created_at')
        .eq('comment_id', threads[i].id).order('created_at');
      threads[i].messages = (msgRes.data || []).map(function (m) {
        return { id: m.id, author: m.author_name, role: m.role, text: m.body, ts: m.created_at };
      });
    }
    comments = threads;
    renderComments();
  }

  var commentPopover = document.getElementById('commentPopover');
  var popoverCommentBtn = document.getElementById('popoverCommentBtn');
  var commentsList = document.getElementById('commentsList');

  // selection -> show inline "+ comment" popover (editor role can comment on
  // manuscript text; author can comment when replying, handled per-thread)
  document.addEventListener('selectionchange', function () {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !manuscriptBody.contains(sel.anchorNode)) {
      commentPopover.style.display = 'none';
      addCommentBtn.disabled = true;
      return;
    }
    addCommentBtn.disabled = false;

    var range = sel.getRangeAt(0);
    pendingRange = range.cloneRange();
    var rect = range.getBoundingClientRect();
    commentPopover.style.left = (rect.left + window.scrollX) + 'px';
    commentPopover.style.top = (rect.top + window.scrollY - 38) + 'px';
    commentPopover.style.display = 'block';
  });

  async function createCommentFromSelection() {
    if (!pendingRange || pendingRange.collapsed) return;
    var text = pendingRange.toString().trim();
    if (!text) return;
    if (!manuscriptId || !supabaseClient) {
      alert('Open this editor from a manuscript (editor.html?id=...) to leave comments.');
      return;
    }

    var insertRes = await supabaseClient.from('manuscript_comments')
      .insert({ manuscript_id: manuscriptId, quote: text, resolved: false })
      .select('id').single();
    if (insertRes.error) {
      console.error('Could not create comment', insertRes.error);
      alert('Could not save that comment: ' + insertRes.error.message);
      return;
    }
    var commentId = insertRes.data.id;

    var span = document.createElement('span');
    span.className = 'comment-highlight';
    span.dataset.commentId = commentId;

    try {
      pendingRange.surroundContents(span);
    } catch (e) {
      // range spans multiple elements — fall back to extract/wrap
      var frag = pendingRange.extractContents();
      span.appendChild(frag);
      pendingRange.insertNode(span);
    }

    comments.push({ id: commentId, quote: text, resolved: false, messages: [] });

    commentPopover.style.display = 'none';
    window.getSelection().removeAllRanges();
    renderComments(commentId);
    markUnsaved(); // persists the highlight span into the saved manuscript content
  }

  popoverCommentBtn.addEventListener('click', createCommentFromSelection);
  addCommentBtn.addEventListener('click', createCommentFromSelection);

  function findComment(id) {
    return comments.filter(function (c) { return c.id === id; })[0];
  }

  function renderComments(focusId) {
    statComments.textContent = comments.filter(function (c) { return !c.resolved; }).length;

    if (!comments.length) {
      commentsList.innerHTML = '<div class="no-comments">No comments yet. Select text in the manuscript and click "+ Comment" to leave feedback.</div>';
      return;
    }

    commentsList.innerHTML = '';
    comments.forEach(function (thread) {
      var el = document.createElement('div');
      el.className = 'comment-thread' + (thread.resolved ? ' resolved' : '');
      el.dataset.commentId = thread.id;

      var quote = document.createElement('div');
      quote.className = 'ct-quote';
      quote.textContent = '"' + thread.quote.slice(0, 90) + (thread.quote.length > 90 ? '…' : '') + '"';
      el.appendChild(quote);

      thread.messages.forEach(function (msg) {
        var m = document.createElement('div');
        m.className = 'comment-msg';
        m.innerHTML = '<span class="cm-author">' + escapeHtml(msg.author) + '</span>' +
          '<span class="cm-role">' + escapeHtml(msg.role) + '</span>' +
          '<div class="cm-text">' + escapeHtml(msg.text) + '</div>';
        el.appendChild(m);
      });

      // reply box — both roles can reply
      var replyWrap = document.createElement('div');
      replyWrap.className = 'comment-reply';
      var input = document.createElement('input');
      input.type = 'text';
      input.placeholder = thread.messages.length === 0 ? 'Leave a comment…' : 'Reply…';
      var sendBtn = document.createElement('button');
      sendBtn.textContent = thread.messages.length === 0 ? 'Comment' : 'Reply';
      sendBtn.addEventListener('click', async function () {
        var val = input.value.trim();
        if (!val) return;
        sendBtn.disabled = true;

        var authorName = (session && session.name) || (currentRole === 'editor' ? 'Editor' : 'Author');
        var insertRes = await supabaseClient.from('manuscript_comment_messages').insert({
          comment_id: thread.id,
          author_id: session ? session.id : null,
          author_name: authorName,
          role: currentRole,
          body: val
        }).select('id, created_at').single();

        sendBtn.disabled = false;
        if (insertRes.error) {
          console.error('Could not save reply', insertRes.error);
          alert('Could not save that reply: ' + insertRes.error.message);
          return;
        }

        thread.messages.push({
          id: insertRes.data.id,
          author: authorName,
          role: currentRole,
          text: val,
          ts: insertRes.data.created_at
        });
        input.value = '';
        renderComments();
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') sendBtn.click();
      });
      replyWrap.appendChild(input);
      replyWrap.appendChild(sendBtn);
      el.appendChild(replyWrap);

      // resolve/reopen — either role can resolve
      var actions = document.createElement('div');
      actions.className = 'ct-actions';
      var resolveBtn = document.createElement('button');
      resolveBtn.textContent = thread.resolved ? 'Reopen' : 'Mark resolved';
      resolveBtn.addEventListener('click', async function () {
        var newResolved = !thread.resolved;
        resolveBtn.disabled = true;
        var res = await supabaseClient.from('manuscript_comments')
          .update({ resolved: newResolved }).eq('id', thread.id);
        resolveBtn.disabled = false;
        if (res.error) {
          console.error('Could not update comment', res.error);
          alert('Could not update that comment: ' + res.error.message);
          return;
        }
        thread.resolved = newResolved;
        var span = manuscriptBody.querySelector('[data-comment-id="' + thread.id + '"]');
        if (span) span.classList.toggle('resolved', thread.resolved);
        renderComments();
      });
      actions.appendChild(resolveBtn);
      el.appendChild(actions);

      commentsList.appendChild(el);

      if (thread.id === focusId) {
        input.focus();
      }
    });
  }

  // clicking a highlighted span scrolls to + highlights its thread in the sidebar
  manuscriptBody.addEventListener('click', function (e) {
    var span = e.target.closest('.comment-highlight');
    if (!span) return;
    var id = span.dataset.commentId;
    var threadEl = commentsList.querySelector('[data-comment-id="' + id + '"]');
    if (threadEl) {
      threadEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      threadEl.style.borderColor = 'var(--brick)';
      setTimeout(function () { threadEl.style.borderColor = ''; }, 900);
    }
  });

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- init ----------
  btnAuthorRole.classList.toggle('active', currentRole === 'author');
  btnEditorRole.classList.toggle('active', currentRole === 'editor');
  applyPageLayout();
  applyTypography();
  document.getElementById('saveNowButton').addEventListener('click',function(){clearTimeout(saveTimer);saveNow();});
  document.getElementById('printManuscript').addEventListener('click',function(){window.print();});

  function sectionControls(){var list=document.getElementById('chapterList');list.replaceChildren();if(contentMode!=='structured')return;['front','chapters','end'].forEach(function(group){(structuredModel[group]||[]).forEach(function(section){var button=document.createElement('button');button.type='button';button.textContent=section.title||'Untitled section';button.style.cssText='display:block;width:100%;text-align:left;margin:5px 0';button.addEventListener('click',function(){var target=Array.from(manuscriptBody.querySelectorAll('[data-sec-id]')).find(function(el){return el.getAttribute('data-sec-id')===section.id;});if(target)target.scrollIntoView({block:'center',behavior:'smooth'});});list.appendChild(button);});});}
  function addSection(group){if(contentMode==='structured')structuredModel=serializeStructuredContent();else{structuredModel={front:[],chapters:[{id:'chapter-'+Date.now(),title:'Chapter One',content:manuscriptBody.innerHTML}],end:[]};contentMode='structured';}var title=prompt('Section title');if(!title)return;structuredModel[group].push({id:group+'-'+Date.now(),title:title,content:'<p><br></p>'});renderStructuredContent(structuredModel);sectionControls();markUnsaved();}
  document.getElementById('addChapter').addEventListener('click',function(){addSection('chapters');});document.getElementById('addFrontMatter').addEventListener('click',function(){addSection('front');});document.getElementById('addEndMatter').addEventListener('click',function(){addSection('end');});
  await loadManuscript();
  sectionControls();
  if(saveState)saveState.textContent='All changes saved';
  updateStats();
  await loadComments(); // calls renderComments() once threads + messages are in
});
