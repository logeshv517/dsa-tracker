/* DSA tracker — simple version.
   1) Tick a problem as solved, see Medium/Hard at a glance.
   2) Save the problem link plus any study links (YouTube, GFG, articles).
   3) Keep one set of notes per pattern. */
(function () {
  'use strict';

  var KEY = 'dsa-tracker:v2';
  var OLD_KEY = 'dsa-pattern-tracker:v1';
  var LAST_KEY = 'dsa-tracker:last-pattern';

  /* ---------- Data ---------- */
  var DATA = window.DSA_DATA;
  var patterns = DATA.patterns.map(function (p, i) {
    return {
      id: p.id, name: p.name, short: p.short || p.name, group: p.group, index: i,
      problems: p.problems.map(function (r) {
        var f = r[2] || '';
        return { no: r[0], name: r[1], core: f.indexOf('*') > -1, hard: f.indexOf('H') > -1, hint: r[3] || '', patternId: p.id };
      })
    };
  });
  var problems = [], byNo = {}, byId = {};
  patterns.forEach(function (pt) {
    byId[pt.id] = pt;
    pt.problems.forEach(function (p) { problems.push(p); byNo[p.no] = p; });
  });
  var HARD_TOTAL = problems.filter(function (p) { return p.hard; }).length;
  var MED_TOTAL = problems.length - HARD_TOTAL;

  /* ---------- Helpers ---------- */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fmtDate(s) {
    var p = s.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  function fmtTime(d) { return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  var $ = function (id) { return document.getElementById(id); };

  function slugify(title) {
    return title.toLowerCase().replace(/[()`'?,.:!]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function leetcodeUrl(p) { return 'https://leetcode.com/problems/' + slugify(p.name) + '/'; }

  function cleanUrl(raw) {
    var u = String(raw || '').trim();
    if (!u) return '';
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = 'https://' + u;
    try {
      var parsed = new URL(u);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
      if (!parsed.hostname || parsed.hostname.indexOf('.') < 0) return null;
      return parsed.href;
    } catch (e) { return null; }
  }

  var KNOWN = [
    { re: /(^|\.)(youtube\.com|youtu\.be)$/, name: 'YouTube', kind: 'video' },
    { re: /(^|\.)geeksforgeeks\.org$/, name: 'GFG', kind: 'article' },
    { re: /(^|\.)leetcode\.(com|cn)$/, name: 'LeetCode', kind: 'code' },
    { re: /(^|\.)neetcode\.io$/, name: 'NeetCode', kind: 'video' },
    { re: /(^|\.)takeuforward\.org$/, name: 'Striver', kind: 'article' },
    { re: /(^|\.)github\.com$/, name: 'GitHub', kind: 'code' },
    { re: /(^|\.)docs\.google\.com$/, name: 'Google Doc', kind: 'article' },
    { re: /(^|\.)(notion\.so|notion\.site)$/, name: 'Notion', kind: 'article' },
    { re: /(^|\.)programiz\.com$/, name: 'Programiz', kind: 'article' },
    { re: /(^|\.)w3schools\.com$/, name: 'W3Schools', kind: 'article' },
    { re: /(^|\.)algo\.monster$/, name: 'AlgoMonster', kind: 'article' }
  ];
  function linkMeta(url) {
    var host = '';
    try { host = new URL(url).hostname.replace(/^www\.|^m\./, ''); } catch (e) { host = 'link'; }
    for (var i = 0; i < KNOWN.length; i++) if (KNOWN[i].re.test(host)) return { name: KNOWN[i].name, kind: KNOWN[i].kind };
    return { name: host, kind: 'link' };
  }

  var ICONS = {
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    star: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
    video: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.6 7.2a2.6 2.6 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.6 2.6 0 0 0 2.4 7.2 27 27 0 0 0 2 12a27 27 0 0 0 .4 4.8 2.6 2.6 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8A27 27 0 0 0 22 12a27 27 0 0 0-.4-4.8zM10 15V9l5.2 3z"/></svg>',
    article: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M14 3v5h5M8 13h8M8 17h5"/></svg>',
    code: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/></svg>',
    link: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    note: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
    trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    left: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    right: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    auto: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>'
  };

  /* ---------- State ---------- */
  function blank() { return { version: 2, solved: {}, links: {}, notes: {}, theme: 'auto' }; }

  function normalize(s) {
    var out = blank();
    if (!s || typeof s !== 'object') return out;
    if (s.solved && typeof s.solved === 'object') {
      Object.keys(s.solved).forEach(function (k) {
        if (byNo[Number(k)] && /^\d{4}-\d{2}-\d{2}$/.test(s.solved[k])) out.solved[k] = s.solved[k];
      });
    }
    if (s.links && typeof s.links === 'object') {
      Object.keys(s.links).forEach(function (k) {
        if (!byNo[Number(k)]) return;
        var l = s.links[k] || {};
        var problem = l.problem ? cleanUrl(l.problem) : '';
        var extra = Array.isArray(l.extra) ? l.extra.map(function (x) {
          var u = x && cleanUrl(x.url);
          return u ? { url: u, label: String(x.label || '').slice(0, 40) } : null;
        }).filter(Boolean) : [];
        if (problem || extra.length) out.links[k] = { problem: problem || '', extra: extra };
      });
    }
    if (s.notes && typeof s.notes === 'object') {
      Object.keys(s.notes).forEach(function (id) {
        if (byId[id] && typeof s.notes[id] === 'string' && s.notes[id]) out.notes[id] = s.notes[id];
      });
    }
    if (['auto', 'light', 'dark'].indexOf(s.theme) > -1) out.theme = s.theme;
    return out;
  }

  // Older version stored attempts and 3-part notes. Carry over what still applies.
  function migrateV1(old) {
    var s = blank();
    if (old && old.attempts) {
      Object.keys(old.attempts).forEach(function (no) {
        var solved = (old.attempts[no] || []).filter(function (a) { return a && a.r === 'solved'; });
        if (solved.length) s.solved[no] = solved[solved.length - 1].d;
      });
    }
    if (old && old.notes) {
      Object.keys(old.notes).forEach(function (id) {
        var n = old.notes[id] || {}, parts = [];
        if (n.when) parts.push('When to use it:\n' + n.when);
        if (n.template) parts.push('Template:\n' + n.template);
        if (n.trap) parts.push('Trap I fell into:\n' + n.trap);
        if (parts.length) s.notes[id] = parts.join('\n\n');
      });
    }
    if (old && old.settings && old.settings.theme) s.theme = old.settings.theme;
    return normalize(s);
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return normalize(JSON.parse(raw));
      var old = localStorage.getItem(OLD_KEY);
      if (old) { var m = migrateV1(JSON.parse(old)); localStorage.setItem(KEY, JSON.stringify(m)); return m; }
    } catch (e) { /* start fresh */ }
    return blank();
  }

  var state = load();
  var warned = false;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { if (!warned) { warned = true; toast('This browser isn’t saving. Download a backup.'); } }
  }

  var ui = { status: 'all', diff: 'all', q: '' };

  /* ---------- Derived ---------- */
  function isSolved(no) { return !!state.solved[no]; }
  function stats(list) {
    var s = { total: list.length, solved: 0, med: 0, hard: 0, medSolved: 0, hardSolved: 0 };
    list.forEach(function (p) {
      var ok = isSolved(p.no);
      if (ok) s.solved++;
      if (p.hard) { s.hard++; if (ok) s.hardSolved++; } else { s.med++; if (ok) s.medSolved++; }
    });
    return s;
  }
  function problemLink(p) {
    var l = state.links[p.no];
    return l && l.problem ? l.problem : leetcodeUrl(p);
  }
  function extraLinks(p) { var l = state.links[p.no]; return l ? l.extra : []; }

  /* ---------- Theme ---------- */
  function applyTheme() {
    if (state.theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', state.theme);
    var label = { auto: 'Theme: match device', light: 'Theme: light', dark: 'Theme: dark' }[state.theme];
    $('themeBtn').setAttribute('aria-label', label + '. Click to change');
    $('themeBtn').title = label;
    $('themeIcon').innerHTML = ICONS[state.theme === 'auto' ? 'auto' : state.theme === 'light' ? 'sun' : 'moon'];
  }

  /* ---------- Routing ---------- */
  function route() {
    var h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    var m = /^p\/([a-z0-9-]+)/.exec(h);
    if (m && byId[m[1]]) return byId[m[1]];
    var last = null;
    try { last = localStorage.getItem(LAST_KEY); } catch (e) { /* ignore */ }
    return byId[last] || patterns[0];
  }

  /* ---------- Rendering ---------- */
  function renderSidebar(current) {
    var all = stats(problems);
    var html =
      '<div class="overall">' +
        '<div class="overall-top"><span class="overall-num">' + all.solved + ' <small>of ' + all.total + ' solved</small></span>' +
        '<span class="overall-pct">' + pct(all.solved, all.total) + '%</span></div>' +
        '<div class="bar" aria-hidden="true"><span style="width:' + pct(all.solved, all.total) + '%"></span></div>' +
        '<div class="overall-split"><span>Medium <b>' + all.medSolved + '</b>/' + MED_TOTAL + '</span><span>Hard <b>' + all.hardSolved + '</b>/' + HARD_TOTAL + '</span></div>' +
      '</div>';
    DATA.groups.forEach(function (g) {
      html += '<div class="group"><p class="group-label">' + esc(g) + '</p>';
      patterns.filter(function (p) { return p.group === g; }).forEach(function (pt) {
        var s = stats(pt.problems);
        var isCur = !ui.q && current && current.id === pt.id;
        var hasNote = !!(state.notes[pt.id] && state.notes[pt.id].trim());
        html += '<a class="pat' + (s.solved === s.total ? ' complete' : '') + '" href="#/p/' + pt.id + '"' + (isCur ? ' aria-current="page"' : '') + '>' +
          '<span class="pat-row"><span class="pat-name">' + esc(pt.short) + '</span>' +
          (hasNote ? '<span class="pat-note" title="Has notes">' + ICONS.note + '<span class="sr-only">Has notes</span></span>' : '') +
          '<span class="pat-count">' + s.solved + '/' + s.total + '</span></span>' +
          '<span class="bar" aria-hidden="true"><span style="width:' + pct(s.solved, s.total) + '%"></span></span></a>';
      });
      html += '</div>';
    });
    $('sidebar').innerHTML = html;
  }

  function mobilePicker(current) {
    var all = stats(problems);
    var opts = DATA.groups.map(function (g) {
      return '<optgroup label="' + esc(g) + '">' + patterns.filter(function (p) { return p.group === g; }).map(function (pt) {
        var s = stats(pt.problems);
        return '<option value="' + pt.id + '"' + (current && current.id === pt.id && !ui.q ? ' selected' : '') + '>' + esc(pt.short) + ' (' + s.solved + '/' + s.total + ')</option>';
      }).join('') + '</optgroup>';
    }).join('');
    return '<div class="mobile-picker">' +
      '<div class="mobile-overall"><span><b>' + all.solved + '</b> of ' + all.total + ' solved</span>' +
        '<div class="bar" aria-hidden="true"><span style="width:' + pct(all.solved, all.total) + '%"></span></div></div>' +
      '<label class="sr-only" for="patternPicker">Pattern</label>' +
      '<select id="patternPicker">' + opts + '</select></div>';
  }

  function diffBadge(p) {
    return p.hard ? '<span class="diff hard">Hard</span>' : '<span class="diff medium">Medium</span>';
  }

  function rowHtml(p, opts) {
    opts = opts || {};
    var solved = isSolved(p.no);
    var extra = extraLinks(p);
    var chips = '<a class="lchip code" href="' + esc(problemLink(p)) + '" target="_blank" rel="noopener">' + ICONS.code +
      '<span>' + esc(linkMeta(problemLink(p)).name) + '</span><span class="sr-only"> (opens in a new tab)</span></a>';
    extra.forEach(function (x) {
      var meta = linkMeta(x.url);
      var label = x.label || meta.name;
      chips += '<a class="lchip ' + meta.kind + '" href="' + esc(x.url) + '" target="_blank" rel="noopener" title="' + esc(x.url) + '">' +
        ICONS[meta.kind] + '<span>' + esc(label) + '</span><span class="sr-only"> (opens in a new tab)</span></a>';
    });
    var sub = [];
    if (opts.showPattern) sub.push('<a class="pat-chip" href="#/p/' + p.patternId + '">' + esc(byId[p.patternId].short) + '</a>');
    if (p.hint) sub.push('<span>' + esc(p.hint) + '</span>');
    if (solved) sub.push('<span class="solved-on">Solved ' + esc(fmtDate(state.solved[p.no])) + '</span>');

    return '<div class="row' + (solved ? ' is-solved' : '') + '" id="row-' + p.no + '">' +
      '<span class="check"><input type="checkbox" id="cb-' + p.no + '" data-solve="' + p.no + '"' + (solved ? ' checked' : '') +
        ' aria-label="Solved: #' + p.no + ' ' + esc(p.name) + '">' + ICONS.check + '</span>' +
      '<div class="row-main">' +
        '<div class="row-title"><span class="num">#' + p.no + '</span>' +
          '<a class="pname" href="' + esc(problemLink(p)) + '" target="_blank" rel="noopener">' + esc(p.name) + '<span class="sr-only"> (opens in a new tab)</span></a>' +
          diffBadge(p) +
          (p.core ? '<span class="star" title="Core problem">' + ICONS.star + '<span class="sr-only">Core problem</span></span>' : '') +
        '</div>' +
        (sub.length ? '<div class="row-sub">' + sub.join('') + '</div>' : '') +
      '</div>' +
      '<div class="links">' + chips + '</div>' +
      '<div class="edit"><button type="button" class="edit-btn" data-links="' + p.no + '" aria-label="Edit links for #' + p.no + ' ' + esc(p.name) + '">' +
        ICONS.edit + '<span class="edit-label">' + (extra.length ? 'Links' : 'Add link') + '</span></button></div>' +
    '</div>';
  }

  function filtered(list) {
    return list.filter(function (p) {
      if (ui.status === 'todo' && isSolved(p.no)) return false;
      if (ui.status === 'solved' && !isSolved(p.no)) return false;
      if (ui.diff === 'medium' && p.hard) return false;
      if (ui.diff === 'hard' && !p.hard) return false;
      return true;
    });
  }

  function toolbarHtml(list) {
    var s = stats(list);
    function seg(group, value, label, n) {
      var on = ui[group] === value;
      return '<button type="button" data-filter="' + group + '" data-value="' + value + '" aria-pressed="' + on + '">' + label +
        (n !== undefined ? '<span class="n">' + n + '</span>' : '') + '</button>';
    }
    return '<div class="toolbar">' +
      '<div class="seg" role="group" aria-label="Show">' + seg('status', 'all', 'All', s.total) + seg('status', 'todo', 'To do', s.total - s.solved) + seg('status', 'solved', 'Solved', s.solved) + '</div>' +
      '<div class="seg" role="group" aria-label="Difficulty">' + seg('diff', 'all', 'Any') + seg('diff', 'medium', 'Medium', s.med) + seg('diff', 'hard', 'Hard', s.hard) + '</div>' +
    '</div>';
  }

  function listHtml(list, opts) {
    var rows = filtered(list);
    if (!rows.length) {
      var msg = ui.status === 'todo' ? 'Everything here is solved.' : ui.status === 'solved' ? 'Nothing solved here yet. Tick a problem when you finish it.' : 'No problems match.';
      return '<div class="list"><p class="empty">' + msg + '</p></div>';
    }
    return '<div class="list">' + rows.map(function (p) { return rowHtml(p, opts); }).join('') + '</div>';
  }

  function notesHtml(pt) {
    var text = state.notes[pt.id] || '';
    return '<section class="notes" aria-labelledby="notesTitle">' +
      '<div class="notes-head"><h2 id="notesTitle">' + esc(pt.short) + ' notes</h2>' +
        '<span class="save-state" id="saveState">' + (text ? 'Saved' : 'Not started') + '</span></div>' +
      '<label class="sr-only" for="notesBox">Notes for ' + esc(pt.name) + '</label>' +
      '<textarea id="notesBox" data-notes="' + pt.id + '" spellcheck="false" placeholder="' + esc(
        'When to use it:\n- \n\nTemplate:\n\n\nTrap I fell into:\n- '
      ) + '">' + esc(text) + '</textarea>' +
      '<div class="notes-foot"><span>Saves as you type</span>' +
        (text ? '' : '<button type="button" class="text-btn" id="outlineBtn">Start with an outline</button>') + '</div>' +
    '</section>';
  }

  function pagerHtml(pt) {
    var prev = patterns[pt.index - 1], next = patterns[pt.index + 1];
    return '<nav class="pager" aria-label="Patterns">' +
      (prev ? '<a href="#/p/' + prev.id + '">' + ICONS.left + '<span><span class="dir">Previous</span> ' + esc(prev.short) + '</span></a>' : '<span class="spacer"></span>') +
      (next ? '<a href="#/p/' + next.id + '"><span><span class="dir">Next</span> ' + esc(next.short) + '</span>' + ICONS.right + '</a>' : '') +
    '</nav>';
  }

  function renderPattern(pt) {
    var s = stats(pt.problems);
    var first = pt.problems[0].no, last = pt.problems[pt.problems.length - 1].no;
    $('main').innerHTML =
      '<div class="page">' +
        '<div class="col">' +
          mobilePicker(pt) +
          '<header class="head">' +
            '<p class="eyebrow">Pattern ' + (pt.index + 1) + ' of ' + patterns.length + ', problems ' + first + ' to ' + last + '</p>' +
            '<h1 class="title" id="pageTitle" tabindex="-1">' + esc(pt.name) + '</h1>' +
            '<div class="head-meta"><span class="count-chip">' + s.total + ' problems</span>' +
              (s.med ? '<span class="diff medium">' + s.med + ' Medium</span>' : '') +
              (s.hard ? '<span class="diff hard">' + s.hard + ' Hard</span>' : '') + '</div>' +
            '<div class="head-progress"><div class="bar" aria-hidden="true"><span style="width:' + pct(s.solved, s.total) + '%"></span></div>' +
              '<span class="head-progress-text"><b>' + s.solved + '</b> of ' + s.total + ' solved</span></div>' +
          '</header>' +
          '<div id="listArea">' + toolbarHtml(pt.problems) + listHtml(pt.problems) + '</div>' +
          pagerHtml(pt) +
        '</div>' +
        notesHtml(pt) +
      '</div>';
  }

  function renderSearch() {
    var q = ui.q.trim().toLowerCase().replace(/^#/, '');
    var hits = problems.filter(function (p) {
      return p.name.toLowerCase().indexOf(q) > -1 || String(p.no) === q || byId[p.patternId].name.toLowerCase().indexOf(q) > -1;
    });
    $('main').innerHTML =
      '<div class="page single"><div class="col">' +
        mobilePicker(null) +
        '<header class="head"><p class="eyebrow">Search</p>' +
          '<h1 class="title" id="pageTitle" tabindex="-1">' + hits.length + ' result' + (hits.length === 1 ? '' : 's') + ' for “' + esc(ui.q.trim()) + '”</h1></header>' +
        '<div id="listArea">' + toolbarHtml(hits) + listHtml(hits, { showPattern: true }) + '</div>' +
      '</div></div>';
  }

  var currentPattern = null;
  function render() {
    currentPattern = route();
    renderSidebar(currentPattern);
    if (ui.q.trim()) renderSearch(); else renderPattern(currentPattern);
    document.title = (ui.q.trim() ? 'Search' : currentPattern.name) + ' · DSA tracker';
  }

  function refreshList() {
    var area = $('listArea');
    if (!area) return;
    var focusedId = document.activeElement && document.activeElement.id;
    var list = ui.q.trim() ? null : currentPattern.problems;
    if (list) area.innerHTML = toolbarHtml(list) + listHtml(list);
    else { renderSearch(); }
    if (focusedId) { var el = $(focusedId); if (el) el.focus({ preventScroll: true }); }
  }

  function refreshCounts() {
    renderSidebar(currentPattern);
    if (ui.q.trim()) return;
    var s = stats(currentPattern.problems);
    var bar = document.querySelector('.head-progress .bar > span');
    var txt = document.querySelector('.head-progress-text');
    if (bar) bar.style.width = pct(s.solved, s.total) + '%';
    if (txt) txt.innerHTML = '<b>' + s.solved + '</b> of ' + s.total + ' solved';
    var picker = $('patternPicker');
    if (picker) {
      var opt = picker.querySelector('option[value="' + currentPattern.id + '"]');
      if (opt) opt.textContent = currentPattern.short + ' (' + s.solved + '/' + s.total + ')';
    }
  }

  /* ---------- Links dialog ---------- */
  var editingNo = null;

  function extraItemHtml(x, i) {
    return '<li class="extra-item">' +
      '<label class="sr-only" for="xu-' + i + '">Link ' + (i + 1) + ' URL</label>' +
      '<input class="input url-input" id="xu-' + i + '" type="url" inputmode="url" placeholder="Paste a YouTube, GFG or article link" value="' + esc(x.url || '') + '" autocomplete="off">' +
      '<label class="sr-only" for="xl-' + i + '">Link ' + (i + 1) + ' label</label>' +
      '<input class="input label-input" id="xl-' + i + '" type="text" maxlength="40" placeholder="' + esc(x.url ? linkMeta(cleanUrl(x.url) || x.url).name : 'Label (optional)') + '" value="' + esc(x.label || '') + '">' +
      '<button type="button" class="icon-btn ghost remove-btn" data-remove-extra aria-label="Remove link ' + (i + 1) + '">' + ICONS.trash + '</button>' +
    '</li>';
  }

  function readExtraRows() {
    return Array.prototype.map.call($('extraList').querySelectorAll('.extra-item'), function (li) {
      return { url: li.querySelector('.url-input').value, label: li.querySelector('.label-input').value };
    });
  }

  function drawExtraRows(rows) {
    $('extraList').innerHTML = rows.length
      ? rows.map(extraItemHtml).join('')
      : '<li class="extra-empty">No study links yet. Add a video or article you used for this problem.</li>';
  }

  function openLinks(no) {
    var p = byNo[no];
    editingNo = no;
    $('linksTitle').textContent = 'Links for #' + p.no + ' ' + p.name;
    $('linksSub').textContent = (p.hard ? 'Hard' : 'Medium') + ', ' + byId[p.patternId].name;
    var l = state.links[no] || { problem: '', extra: [] };
    $('problemUrl').value = l.problem || leetcodeUrl(p);
    drawExtraRows(l.extra.length ? l.extra.slice() : [{ url: '', label: '' }]);
    $('linksError').hidden = true;
    showDialog($('linksDialog'));
    var firstEmpty = $('extraList').querySelector('.url-input');
    if (firstEmpty && !firstEmpty.value) firstEmpty.focus(); else $('problemUrl').focus();
  }

  function saveLinks(e) {
    e.preventDefault();
    var p = byNo[editingNo];
    var err = $('linksError');
    Array.prototype.forEach.call(document.querySelectorAll('#linksForm .invalid'), function (el) { el.classList.remove('invalid'); });

    var rawProblem = $('problemUrl').value.trim();
    var problem = rawProblem ? cleanUrl(rawProblem) : '';
    if (problem === null) {
      $('problemUrl').classList.add('invalid');
      err.textContent = 'The problem link isn’t a valid web address.';
      err.hidden = false;
      $('problemUrl').focus();
      return;
    }
    if (problem === leetcodeUrl(p)) problem = '';

    var extra = [], bad = null;
    Array.prototype.forEach.call($('extraList').querySelectorAll('.extra-item'), function (li) {
      var urlEl = li.querySelector('.url-input');
      var raw = urlEl.value.trim();
      if (!raw) return;
      var u = cleanUrl(raw);
      if (!u) { urlEl.classList.add('invalid'); if (!bad) bad = urlEl; return; }
      extra.push({ url: u, label: li.querySelector('.label-input').value.trim().slice(0, 40) });
    });
    if (bad) {
      err.textContent = 'One of the study links isn’t a valid web address.';
      err.hidden = false;
      bad.focus();
      return;
    }

    if (problem || extra.length) state.links[editingNo] = { problem: problem, extra: extra };
    else delete state.links[editingNo];
    save();
    hideDialog($('linksDialog'));
    refreshList();
    var btn = document.querySelector('[data-links="' + editingNo + '"]');
    if (btn) btn.focus({ preventScroll: true });
    toast('Links saved for #' + editingNo + '.');
  }

  /* ---------- Dialog helpers ---------- */
  function showDialog(d) { if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', ''); }
  function hideDialog(d) { if (typeof d.close === 'function') d.close(); else d.removeAttribute('open'); }

  /* ---------- Backup ---------- */
  function exportBackup() {
    var payload = Object.assign({ app: 'dsa-tracker', exportedAt: new Date().toISOString() }, state);
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'dsa-tracker-backup-' + today() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('Backup downloaded.');
  }

  function importBackup(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(String(reader.result));
        if (!parsed || typeof parsed !== 'object') throw new Error('bad');
        var next = parsed.attempts && !parsed.solved ? migrateV1(parsed) : normalize(parsed);
        var n = Object.keys(next.solved).length;
        if (!window.confirm('Replace what’s in this browser with this backup? It has ' + n + ' solved problem' + (n === 1 ? '' : 's') + '.')) return;
        state = next;
        save();
        applyTheme();
        hideDialog($('backupDialog'));
        render();
        toast('Backup restored.');
      } catch (e) {
        toast('That file isn’t a tracker backup.');
      }
    };
    reader.readAsText(file);
  }

  function resetAll() {
    if (!window.confirm('Clear every tick, link and note in this browser? Download a backup first if you might need them.')) return;
    state = blank();
    save();
    applyTheme();
    hideDialog($('backupDialog'));
    render();
    toast('Cleared.');
  }

  /* ---------- Toast ---------- */
  var toastTimer;
  function toast(msg, undoFn) {
    var t = $('toast');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (undoFn ? '<button type="button" id="toastUndo">Undo</button>' : '');
    t.hidden = false;
    if (undoFn) $('toastUndo').onclick = function () { t.hidden = true; undoFn(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, undoFn ? 6000 : 3000);
  }

  /* ---------- Notes autosave ---------- */
  var notesTimer;
  function onNotesInput(el) {
    var id = el.getAttribute('data-notes');
    var s = $('saveState');
    if (s) { s.textContent = 'Saving…'; s.classList.remove('saved'); }
    clearTimeout(notesTimer);
    notesTimer = setTimeout(function () {
      if (el.value.trim()) state.notes[id] = el.value; else delete state.notes[id];
      save();
      if (s) { s.textContent = 'Saved ' + fmtTime(new Date()); s.classList.add('saved'); }
      renderSidebar(currentPattern);
      var ob = $('outlineBtn');
      if (ob && el.value.trim()) ob.remove();
    }, 400);
  }

  /* ---------- Events ---------- */
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.hasAttribute('data-solve')) {
      var no = el.getAttribute('data-solve');
      if (el.checked) state.solved[no] = today(); else delete state.solved[no];
      save();
      var keepFocus = 'cb-' + no;
      refreshList();
      refreshCounts();
      var cb = $(keepFocus);
      if (cb) cb.focus({ preventScroll: true });
      else if (el.checked) toast('#' + no + ' marked solved.', function () { delete state.solved[no]; save(); refreshList(); refreshCounts(); });
    } else if (el.id === 'patternPicker') {
      ui.q = '';
      $('search').value = '';
      location.hash = '#/p/' + el.value;
    }
  });

  document.addEventListener('click', function (e) {
    var pat = e.target.closest('.pat');
    if (pat && ui.q && pat.getAttribute('href') === location.hash) {
      e.preventDefault();
      ui.q = '';
      $('search').value = '';
      render();
      return;
    }
    var t = e.target.closest('[data-filter], [data-links], [data-remove-extra], [data-close], #outlineBtn, #addExtra, #resetProblemUrl');
    if (!t) return;
    if (t.hasAttribute('data-filter')) {
      ui[t.getAttribute('data-filter')] = t.getAttribute('data-value');
      var key = t.getAttribute('data-filter') + ':' + t.getAttribute('data-value');
      refreshList();
      var again = document.querySelector('[data-filter="' + key.split(':')[0] + '"][data-value="' + key.split(':')[1] + '"]');
      if (again) again.focus({ preventScroll: true });
    } else if (t.hasAttribute('data-links')) {
      openLinks(Number(t.getAttribute('data-links')));
    } else if (t.hasAttribute('data-remove-extra')) {
      var rows = readExtraRows();
      var idx = Array.prototype.indexOf.call($('extraList').children, t.closest('.extra-item'));
      rows.splice(idx, 1);
      drawExtraRows(rows);
      var next = $('extraList').querySelector('.url-input');
      (next || $('addExtra')).focus();
    } else if (t.hasAttribute('data-close')) {
      hideDialog(t.closest('dialog'));
    } else if (t.id === 'outlineBtn') {
      var box = $('notesBox');
      box.value = 'When to use it:\n- \n\nTemplate:\n\n\nTrap I fell into:\n- ';
      box.focus();
      box.setSelectionRange(18, 18);
      onNotesInput(box);
    } else if (t.id === 'addExtra') {
      var r = readExtraRows();
      r.push({ url: '', label: '' });
      drawExtraRows(r);
      var inputs = $('extraList').querySelectorAll('.url-input');
      inputs[inputs.length - 1].focus();
    } else if (t.id === 'resetProblemUrl') {
      $('problemUrl').value = leetcodeUrl(byNo[editingNo]);
      $('problemUrl').focus();
    }
  });

  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el.id === 'search') {
      ui.q = el.value;
      render();
    } else if (el.hasAttribute('data-notes')) {
      onNotesInput(el);
    } else if (el.classList.contains('url-input')) {
      var u = cleanUrl(el.value);
      var label = el.closest('.extra-item').querySelector('.label-input');
      label.placeholder = u ? linkMeta(u).name : 'Label (optional)';
      el.classList.remove('invalid');
    }
  });

  $('search').addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && this.value) { this.value = ''; ui.q = ''; render(); }
  });

  // Tab inside the notes box inserts two spaces (handy for code). Press Esc first to leave the box with Tab.
  var notesEscaped = false;
  document.addEventListener('keydown', function (e) {
    var el = e.target;
    if (!el || el.id !== 'notesBox') return;
    if (e.key === 'Escape') { notesEscaped = true; return; }
    if (e.key === 'Tab' && !e.shiftKey && !notesEscaped) {
      e.preventDefault();
      var s = el.selectionStart, en = el.selectionEnd;
      el.value = el.value.slice(0, s) + '  ' + el.value.slice(en);
      el.selectionStart = el.selectionEnd = s + 2;
      onNotesInput(el);
    }
  });
  document.addEventListener('focusin', function (e) { if (e.target && e.target.id === 'notesBox') notesEscaped = false; });

  $('linksForm').addEventListener('submit', saveLinks);
  $('themeBtn').addEventListener('click', function () {
    state.theme = { auto: 'light', light: 'dark', dark: 'auto' }[state.theme];
    save();
    applyTheme();
  });
  $('backupBtn').addEventListener('click', function () { showDialog($('backupDialog')); });
  $('exportBtn').addEventListener('click', exportBackup);
  $('resetBtn').addEventListener('click', resetAll);
  $('importFile').addEventListener('change', function (e) { importBackup(e.target.files && e.target.files[0]); e.target.value = ''; });

  window.addEventListener('hashchange', function () {
    ui.status = 'all';
    ui.diff = 'all';
    if (ui.q) { ui.q = ''; $('search').value = ''; }
    render();
    try { localStorage.setItem(LAST_KEY, currentPattern.id); } catch (e) { /* ignore */ }
    window.scrollTo(0, 0);
    var title = $('pageTitle');
    if (title) title.focus({ preventScroll: true });
  });

  window.addEventListener('storage', function (e) {
    if (e.key === KEY) { state = load(); applyTheme(); render(); }
  });

  /* ---------- Start ---------- */
  applyTheme();
  render();
  if (!/^#\/p\//.test(location.hash)) history.replaceState(null, '', '#/p/' + currentPattern.id);
  try { localStorage.setItem(LAST_KEY, currentPattern.id); } catch (e) { /* ignore */ }
})();
