/* DSA Pattern Tracker — app logic (no build step, no dependencies). */
(function () {
  'use strict';

  var STORE_KEY = 'dsa-pattern-tracker:v1';
  var TIMER_KEY = 'dsa-pattern-tracker:timer';
  var DEFAULTS = { cleanMinutes: 25, gap1: 3, gap2: 7, dailyNew: 2, coreFirst: false, theme: 'auto' };

  /* ---------- Data ---------- */
  var DATA = window.DSA_DATA;
  var patterns = DATA.patterns.map(function (p, i) {
    return {
      id: p.id, name: p.name, short: p.short || p.name, group: p.group, index: i,
      problems: p.problems.map(function (row) {
        var flags = row[2] || '';
        return { no: row[0], name: row[1], core: flags.indexOf('*') > -1, hard: flags.indexOf('H') > -1, hint: row[3] || '', patternId: p.id };
      })
    };
  });
  var problems = [];
  var byNo = {};
  var patternById = {};
  patterns.forEach(function (p) {
    patternById[p.id] = p;
    p.problems.forEach(function (pr) { problems.push(pr); byNo[pr.no] = pr; });
  });
  var CORE_TOTAL = problems.filter(function (p) { return p.core; }).length;

  /* ---------- State ---------- */
  function normalize(s) {
    s = s && typeof s === 'object' ? s : {};
    var attempts = {};
    if (s.attempts && typeof s.attempts === 'object') {
      Object.keys(s.attempts).forEach(function (k) {
        var no = Number(k);
        if (!byNo[no] || !Array.isArray(s.attempts[k])) return;
        var list = s.attempts[k].filter(function (a) {
          return a && /^\d{4}-\d{2}-\d{2}$/.test(a.d) && (a.r === 'solved' || a.r === 'stuck');
        }).map(function (a) {
          var m = a.m === null || a.m === undefined || a.m === '' ? null : Number(a.m);
          return { d: a.d, r: a.r, m: isFinite(m) && m > 0 ? Math.round(m) : null };
        });
        list.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
        if (list.length) attempts[no] = list;
      });
    }
    var notes = {};
    if (s.notes && typeof s.notes === 'object') {
      Object.keys(s.notes).forEach(function (id) {
        if (!patternById[id]) return;
        var n = s.notes[id] || {};
        notes[id] = { when: String(n.when || ''), template: String(n.template || ''), trap: String(n.trap || ''), updatedAt: n.updatedAt || null };
      });
    }
    var probNotes = {};
    if (s.probNotes && typeof s.probNotes === 'object') {
      Object.keys(s.probNotes).forEach(function (k) {
        if (byNo[Number(k)] && s.probNotes[k]) probNotes[k] = String(s.probNotes[k]);
      });
    }
    var settings = Object.assign({}, DEFAULTS, s.settings || {});
    ['cleanMinutes', 'gap1', 'gap2', 'dailyNew'].forEach(function (k) {
      var v = Math.round(Number(settings[k]));
      settings[k] = isFinite(v) && v > 0 ? v : DEFAULTS[k];
    });
    settings.coreFirst = !!settings.coreFirst;
    if (['auto', 'light', 'dark'].indexOf(settings.theme) < 0) settings.theme = 'auto';
    return { version: 1, attempts: attempts, notes: notes, probNotes: probNotes, settings: settings };
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { /* fall through to a fresh state */ }
    return normalize({});
  }

  var state = load();
  var storageWarned = false;

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      if (!storageWarned) {
        storageWarned = true;
        toast('This browser isn’t saving your progress. Export a backup from Settings.');
      }
    }
  }

  var ui = { filter: 'all', search: '', expanded: null, timer: loadTimer(), lastLog: null };

  function loadTimer() {
    try {
      var t = JSON.parse(localStorage.getItem(TIMER_KEY) || 'null');
      if (t && byNo[t.no] && typeof t.start === 'number') return t;
    } catch (e) { /* ignore */ }
    return null;
  }
  function saveTimer() {
    try {
      if (ui.timer) localStorage.setItem(TIMER_KEY, JSON.stringify(ui.timer));
      else localStorage.removeItem(TIMER_KEY);
    } catch (e) { /* ignore */ }
  }

  /* ---------- Dates ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDate(s) { var p = s.split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); }
  function addDays(s, n) { var d = parseDate(s); d.setDate(d.getDate() + n); return ymd(d); }
  function today() { return ymd(new Date()); }
  function daysBetween(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }
  function fmt(s) { return parseDate(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
  function fmtLong(s) { return parseDate(s).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }); }

  /* ---------- Scheduling rules ----------
     Attempt 1 clean            -> cleared
     Stuck, or over the minute limit -> re-solve after gap1 days (level 1)
     Level 1 clean              -> final re-solve after gap2 days (level 2)
     Level 2 clean              -> cleared
     Any miss at any level      -> back to level 1 */
  function attemptsOf(no) { return state.attempts[no] || []; }
  function isClean(a) { return a.r === 'solved' && (a.m === null || a.m <= state.settings.cleanMinutes); }

  function info(no) {
    var list = attemptsOf(no);
    var st = state.settings;
    var level = 0, due = null, cleared = false, clearedOn = null;
    list.forEach(function (a) {
      var clean = isClean(a);
      if (cleared) {
        if (!clean) { cleared = false; level = 1; due = addDays(a.d, st.gap1); }
        return;
      }
      if (level === 0) {
        if (clean) { cleared = true; clearedOn = a.d; } else { level = 1; due = addDays(a.d, st.gap1); }
      } else if (level === 1) {
        if (clean) { level = 2; due = addDays(a.d, st.gap2); } else { due = addDays(a.d, st.gap1); }
      } else {
        if (clean) { cleared = true; clearedOn = a.d; } else { level = 1; due = addDays(a.d, st.gap1); }
      }
    });
    if (cleared) due = null;
    var t = today();
    var status = !list.length ? 'todo' : cleared ? 'cleared' : (due <= t ? 'due' : 'review');
    return {
      list: list, level: level, due: due, cleared: cleared, clearedOn: clearedOn, status: status,
      overdueDays: status === 'due' ? daysBetween(due, t) : 0
    };
  }

  function stepName(level) {
    var st = state.settings;
    return level === 2 ? st.gap2 + '-day re-solve' : st.gap1 + '-day re-solve';
  }

  function budgetFor(no) {
    var pr = byNo[no];
    if (!attemptsOf(no).length) return pr.hard ? 45 : 30;
    return state.settings.cleanMinutes;
  }

  function todoOrder() {
    var todo = problems.filter(function (p) { return !attemptsOf(p.no).length; });
    if (state.settings.coreFirst) {
      return todo.filter(function (p) { return p.core; }).concat(todo.filter(function (p) { return !p.core; }));
    }
    return todo;
  }

  function nextUpNo() { var t = todoOrder(); return t.length ? t[0].no : null; }

  function patternStats(pt) {
    var s = { total: pt.problems.length, attempted: 0, cleared: 0, review: 0, todo: 0, due: 0 };
    pt.problems.forEach(function (p) {
      var i = info(p.no);
      if (i.status === 'todo') s.todo++; else s.attempted++;
      if (i.status === 'cleared') s.cleared++;
      if (i.status === 'review' || i.status === 'due') s.review++;
      if (i.status === 'due') s.due++;
    });
    return s;
  }

  function notesComplete(id) {
    var n = state.notes[id];
    return !!(n && n.when.trim() && n.template.trim() && n.trap.trim());
  }
  function patternFinished(pt) { return pt.problems.every(function (p) { return attemptsOf(p.no).length > 0; }); }
  function notesOwed(pt) { return patternFinished(pt) && !notesComplete(pt.id); }

  function dueProblems() {
    return problems.map(function (p) { return { p: p, i: info(p.no) }; })
      .filter(function (x) { return x.i.status === 'due'; })
      .sort(function (a, b) { return a.i.due < b.i.due ? -1 : a.i.due > b.i.due ? 1 : a.p.no - b.p.no; });
  }

  /* ---------- Helpers ---------- */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function lcUrl(name) { return 'https://leetcode.com/problemset/?search=' + encodeURIComponent(name); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  var ICON = {
    star: '<svg class="star" width="14" height="14" viewBox="0 0 24 24" fill="#F9B21D" stroke="#E89C00" stroke-width="1.5" stroke-linejoin="round" role="img" aria-label="Core problem"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
    check: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    x: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>',
    chev: '<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    cal: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
    done: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
  };

  function ladderHtml(no) {
    var i = info(no);
    var list = i.list;
    var start = Math.max(0, list.length - 3);
    var dots = list.slice(start).map(function (a, k) {
      var kind = isClean(a) ? 'solved' : (a.r === 'solved' ? 'slow' : 'failed');
      return { kind: kind, n: start + k + 1 };
    });
    if (!i.cleared && list.length && dots.length < 3) dots.push({ kind: i.status === 'due' ? 'due' : 'scheduled', n: list.length + 1 });
    while (dots.length < 3) dots.push({ kind: 'none', n: dots.length ? dots[dots.length - 1].n + 1 : 1 });
    var words = { solved: 'solved clean', slow: 'solved over the time limit', failed: 'got stuck', due: 'due now', scheduled: 'scheduled', none: 'not yet' };
    var html = dots.map(function (d) {
      var inner = d.kind === 'solved' || d.kind === 'slow' ? ICON.check : d.kind === 'failed' ? ICON.x : '<span aria-hidden="true">' + d.n + '</span>';
      return '<span class="adot ' + d.kind + '" role="img" aria-label="Attempt ' + d.n + ': ' + words[d.kind] + '">' + inner + '</span>';
    }).join('');
    if (start > 0) html += '<span class="ladder-more">+' + start + '</span>';
    return '<span class="ladder">' + html + '</span>';
  }

  var STATUS_LABEL = { cleared: 'Cleared', review: 'In review', due: 'Due', todo: 'Not started', next: 'Next up' };

  function statusHtml(no, isNext) {
    var i = info(no);
    var key = i.status === 'todo' && isNext ? 'next' : i.status;
    var label = STATUS_LABEL[key];
    if (key === 'due') label = i.overdueDays > 0 ? 'Overdue' : 'Due today';
    return '<span class="status"><span class="sdot ' + key + '"></span>' + label + '</span>';
  }

  function nextText(i) {
    if (i.status === 'due') return i.overdueDays > 0 ? i.overdueDays + 'd late' : 'Today';
    if (i.status === 'review') return fmt(i.due);
    return '';
  }

  function attemptText(a) {
    var m = a.m ? ', ' + a.m + ' min' : '';
    if (a.r === 'stuck') return 'Stuck or peeked' + m;
    return isClean(a) ? 'Solved clean' + m : 'Solved' + m + ', over ' + state.settings.cleanMinutes + ' min';
  }

  /* ---------- Rendering: chrome ---------- */
  var $ = function (id) { return document.getElementById(id); };

  function applyTheme() {
    var t = state.settings.theme;
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }

  function renderTopStats() {
    var attempted = problems.filter(function (p) { return attemptsOf(p.no).length; }).length;
    var core = problems.filter(function (p) { return p.core && attemptsOf(p.no).length; }).length;
    var due = dueProblems().length;
    $('topStats').innerHTML =
      '<span class="stat-optional">Attempted <strong>' + attempted + '</strong> of ' + problems.length + '</span>' +
      '<span class="stat-optional">Core <strong>' + core + '</strong> of ' + CORE_TOTAL + '</span>' +
      '<a class="due-pill' + (due ? '' : ' zero') + '" href="#today">' + (due ? due + ' due today' : 'Nothing due') + '</a>';
  }

  function renderRail(r) {
    var due = dueProblems().length;
    var html = '<a class="rail-link rail-today" href="#today"' + (r.view === 'today' ? ' aria-current="page"' : '') + '>' + ICON.cal +
      '<span class="rl-name">Today</span>' + (due ? '<span class="rl-badge">' + due + '</span>' : '') + '</a>';
    DATA.groups.forEach(function (g) {
      var items = patterns.filter(function (p) { return p.group === g; });
      html += '<div class="rail-group"><p class="rail-label">' + esc(g) + '</p>';
      items.forEach(function (pt) {
        var s = patternStats(pt);
        var current = r.view === 'pattern' && r.id === pt.id;
        var allClear = s.cleared === s.total;
        html += '<a class="rail-link" href="#p/' + pt.id + '"' + (current ? ' aria-current="page"' : '') + '>' +
          '<span class="rl-name">' + esc(pt.short) + '</span>' +
          (notesOwed(pt) ? '<span class="rl-dot" aria-hidden="true"></span><span class="sr-only">Notes not written</span>' : '') +
          (allClear ? '<span class="rl-done">' + ICON.done + '<span class="sr-only">All cleared</span></span>' : '') +
          '<span class="rl-count">' + s.attempted + '/' + s.total + '</span></a>';
      });
      html += '</div>';
    });
    $('rail').innerHTML = html;
  }

  /* ---------- Rendering: pattern view ---------- */
  function filteredRows(pt) {
    var q = ui.search.trim().toLowerCase();
    return pt.problems.filter(function (p) {
      var i = info(p.no);
      if (ui.filter === 'core' && !p.core) return false;
      if (ui.filter === 'hard' && !p.hard) return false;
      if (ui.filter === 'review' && !(i.status === 'review' || i.status === 'due')) return false;
      if (ui.filter === 'todo' && i.status !== 'todo') return false;
      if (q && p.name.toLowerCase().indexOf(q) < 0 && String(p.no) !== q.replace('#', '')) return false;
      return true;
    });
  }

  function tableHtml(pt) {
    var next = nextUpNo();
    var rows = filteredRows(pt);
    var html = '<div class="ptable"><div class="ptable-inner">' +
      '<div class="prow-grid ptable-head"><span>#</span><span>Problem</span><span>Attempts</span><span>Status</span><span>Next</span><span></span></div>';
    if (!rows.length) html += '<p class="empty">No problems match this filter.</p>';
    rows.forEach(function (p) {
      var i = info(p.no);
      var open = ui.expanded === p.no;
      var isNext = p.no === next;
      html += '<div class="prow' + (open ? ' expanded' : '') + '" id="row-' + p.no + '">' +
        '<button type="button" class="prow-main prow-grid" data-action="toggle" data-no="' + p.no + '" aria-expanded="' + open + '" aria-controls="pd-' + p.no + '">' +
          '<span class="c-no">#' + p.no + '</span>' +
          '<span class="c-name"><span class="pname">' + esc(p.name) + '</span>' +
            (p.core ? ICON.star : '') + (p.hard ? '<span class="hard-tag">Hard</span>' : '') +
            (p.hint ? '<span class="hint-tag">' + esc(p.hint) + '</span>' : '') + '</span>' +
          ladderHtml(p.no) +
          statusHtml(p.no, isNext) +
          '<span class="c-next' + (i.overdueDays > 0 ? ' overdue' : '') + '">' + nextText(i) + '</span>' +
          '<span class="c-act">' + (isNext && !open ? '<span class="start-chip">Start</span>' : ICON.chev) + '</span>' +
        '</button>' +
        (open ? detailHtml(p) : '') +
      '</div>';
    });
    html += '</div></div>';
    return html;
  }

  function detailHtml(p) {
    var i = info(p.no);
    var status;
    if (i.status === 'todo') status = 'Not started. Give attempt 1 up to ' + budgetFor(p.no) + ' minutes. If you’re stuck, read only the approach, write the code yourself, and log it as stuck.';
    else if (i.status === 'due') status = (i.overdueDays > 0 ? 'Overdue by ' + plural(i.overdueDays, 'day') + ': ' : 'Due today: ') + stepName(i.level) + '. Solve it without looking at your old code.';
    else if (i.status === 'review') status = stepName(i.level) + ' on ' + fmt(i.due) + '.';
    else status = 'Cleared on ' + fmt(i.clearedOn) + '. Log another attempt any time to practise it again.';

    var history = i.list.length ? '<ul class="history" aria-label="Attempt history">' + i.list.map(function (a, k) {
      return '<li><span class="h-date">' + fmt(a.d) + '</span><span>Attempt ' + (k + 1) + ': ' + esc(attemptText(a)) + '</span></li>';
    }).join('') + '</ul>' : '';

    var note = state.probNotes[p.no] || '';
    var t = today();

    return '<div class="pdetail" id="pd-' + p.no + '">' +
      '<div class="pd-left">' +
        '<p class="pd-status">' + esc(status) + '</p>' + history +
        '<label class="field notes-field"><span>Trap on this problem</span>' +
          '<textarea rows="2" data-pnote="' + p.no + '" placeholder="What tripped you up? You’ll see it on the next re-solve.">' + esc(note) + '</textarea></label>' +
        '<div class="pd-links"><a href="' + lcUrl(p.name) + '" target="_blank" rel="noopener">Find on LeetCode</a>' +
          (i.list.length ? '<button type="button" class="link-btn danger" data-action="undo-last" data-no="' + p.no + '">Undo last attempt</button>' : '') +
        '</div>' +
      '</div>' +
      '<div class="logbox">' + timerHtml(p.no) +
        '<div class="log-fields">' +
          '<label class="field"><span>Date</span><input type="date" id="d-' + p.no + '" value="' + t + '" max="' + t + '"></label>' +
          '<label class="field"><span>Minutes</span><input type="number" id="m-' + p.no + '" min="1" max="600" inputmode="numeric" placeholder="' + (ui.timer && ui.timer.no === p.no ? 'timer' : '') + '"></label>' +
        '</div>' +
        '<div class="log-buttons">' +
          '<button type="button" class="btn" data-action="log" data-result="stuck" data-no="' + p.no + '" data-src="detail">Stuck or peeked</button>' +
          '<button type="button" class="btn primary" data-action="log" data-result="solved" data-no="' + p.no + '" data-src="detail">Solved without help</button>' +
        '</div>' +
        '<p class="footnote">Clean means solved without help in ' + state.settings.cleanMinutes + ' minutes or less.</p>' +
      '</div>' +
    '</div>';
  }

  function timerHtml(no) {
    var running = ui.timer && ui.timer.no === no;
    var otherRunning = ui.timer && ui.timer.no !== no;
    var budget = budgetFor(no);
    return '<div class="timer" data-timer-box="' + no + '">' +
      '<span class="t-clock" data-timer-clock="' + no + '">' + (running ? clockText() : '0:00') + '</span>' +
      '<span class="t-msg" data-timer-msg="' + no + '">' + (running ? '' : 'Budget ' + budget + ' min' + (otherRunning ? '. Starting stops the timer on #' + ui.timer.no : '')) + '</span>' +
      (running
        ? '<button type="button" class="btn sm quiet" data-action="timer-stop">Reset</button>'
        : '<button type="button" class="btn sm" data-action="timer-start" data-no="' + no + '">Start timer</button>') +
    '</div>';
  }

  function notesCard(pt) {
    var n = state.notes[pt.id] || { when: '', template: '', trap: '', updatedAt: null };
    var owed = notesOwed(pt);
    var stateText = n.updatedAt ? 'Saved ' + fmt(n.updatedAt) : (patternFinished(pt) ? 'Owed' : 'Write after the last problem');
    return '<section class="card" id="notes" aria-labelledby="notesTitle">' +
      '<div class="card-head"><h2 id="notesTitle">' + esc(pt.name) + ' notes</h2>' +
        '<span class="save-state" data-save-state="' + pt.id + '">' + esc(stateText) + '</span>' +
        (owed ? '<span class="count-pill">Owed</span>' : '') + '</div>' +
      '<div class="card-body" style="display:flex;flex-direction:column;gap:14px">' +
        '<label class="field notes-field"><span>When to use it</span><textarea rows="3" data-note="' + pt.id + '" data-key="when" placeholder="The signal in the problem statement that says use this pattern">' + esc(n.when) + '</textarea></label>' +
        '<label class="field notes-field"><span>Template</span><textarea rows="7" class="mono" spellcheck="false" data-note="' + pt.id + '" data-key="template" placeholder="The skeleton code you reuse">' + esc(n.template) + '</textarea></label>' +
        '<label class="field notes-field"><span>Trap I fell into</span><textarea rows="3" data-note="' + pt.id + '" data-key="trap" placeholder="The mistake you made on the first try">' + esc(n.trap) + '</textarea></label>' +
        '<p class="footnote">Saves as you type.</p>' +
      '</div></section>';
  }

  function dueCard() {
    var due = dueProblems();
    var items = due.slice(0, 6).map(function (x) {
      var pt = patternById[x.p.patternId];
      return '<li><a href="#p/' + pt.id + '/' + x.p.no + '"><span class="dl-no">#' + x.p.no + '</span><span class="dl-text">' +
        '<span class="dl-name">' + esc(x.p.name) + '</span><span class="dl-meta">' + esc(pt.short) + ', ' + stepName(x.i.level) + '</span></span></a></li>';
    }).join('');
    return '<section class="card" aria-labelledby="dueTitle"><div class="card-head"><h2 id="dueTitle">Due today</h2>' +
      '<span class="count-pill' + (due.length ? '' : ' zero') + '">' + due.length + '</span></div>' +
      (due.length ? '<ul class="due-list">' + items + '</ul>' : '<p class="empty">No re-solves due.</p>') +
      '<div class="card-body" style="padding-top:10px;padding-bottom:12px"><a href="#today">Open today’s queue</a></div></section>';
  }

  function renderPattern(r) {
    var pt = patternById[r.id];
    var s = patternStats(pt);
    var first = pt.problems[0].no, last = pt.problems[pt.problems.length - 1].no;
    var coreCount = pt.problems.filter(function (p) { return p.core; }).length;
    var hardCount = pt.problems.filter(function (p) { return p.hard; }).length;
    var pc = function (n) { return (n / s.total * 100).toFixed(1) + '%'; };
    var tabs = [
      ['all', 'All ' + s.total], ['core', 'Core ' + coreCount], ['review', 'In review ' + s.review],
      ['todo', 'Not started ' + s.todo], ['hard', 'Hard ' + hardCount]
    ];
    $('main').innerHTML =
      '<div class="pv"><section class="pv-main">' +
        '<div class="pv-head">' +
          '<p class="eyebrow">Pattern ' + (pt.index + 1) + ' of ' + patterns.length + ', problems ' + first + ' to ' + last + '</p>' +
          '<div class="pv-title-row"><h1 class="title" id="pageTitle" tabindex="-1">' + esc(pt.name) + '</h1>' +
            '<a class="btn" href="#notes">Pattern notes</a></div>' +
          '<div class="pv-progress">' +
            '<div class="progress" aria-hidden="true"><span class="seg-cleared" style="width:' + pc(s.cleared) + '"></span><span class="seg-review" style="width:' + pc(s.review) + '"></span></div>' +
            '<div class="legend"><span><i style="background:var(--primary)"></i>' + s.cleared + ' cleared</span>' +
              '<span><i style="background:var(--orange)"></i>' + s.review + ' in review</span>' +
              '<span><i style="background:var(--line)"></i>' + s.todo + ' not started</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="toolbar"><div class="tabs" role="group" aria-label="Filter problems">' +
          tabs.map(function (t) {
            return '<button type="button" class="tab" data-action="filter" data-filter="' + t[0] + '" aria-pressed="' + (ui.filter === t[0]) + '">' + t[1] + '</button>';
          }).join('') + '</div>' +
          '<label class="sr-only" for="search">Search problems</label>' +
          '<input class="search" id="search" type="search" placeholder="Search problems" value="' + esc(ui.search) + '" autocomplete="off">' +
        '</div>' +
        '<div id="tableWrap">' + tableHtml(pt) + '</div>' +
        '<p class="footnote">Stuck, or solved in more than ' + state.settings.cleanMinutes + ' minutes, schedules a re-solve ' + state.settings.gap1 +
          ' days later. A clean re-solve schedules the final one ' + state.settings.gap2 + ' days after that. A clean final re-solve clears it.</p>' +
      '</section>' +
      '<aside class="pv-side" aria-label="Pattern notes and due today">' + notesCard(pt) + dueCard() + '</aside></div>';
  }

  /* ---------- Rendering: today view ---------- */
  function todayPlan() {
    var t = today();
    var resolves = [], fresh = [];
    problems.forEach(function (p) {
      var i = info(p.no);
      var list = i.list;
      var loggedToday = list.some(function (a) { return a.d === t; });
      if (list.length && list[0].d === t) fresh.push({ p: p, i: i, done: true });
      else if (loggedToday) resolves.push({ p: p, i: i, done: true });
      else if (i.status === 'due') resolves.push({ p: p, i: i, done: false });
    });
    resolves.sort(function (a, b) {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (!a.done && a.i.due !== b.i.due) return a.i.due < b.i.due ? -1 : 1;
      return a.p.no - b.p.no;
    });
    var need = Math.max(0, state.settings.dailyNew - fresh.length);
    todoOrder().slice(0, need).forEach(function (p) { fresh.push({ p: p, i: info(p.no), done: false }); });
    fresh.sort(function (a, b) { return a.done !== b.done ? (a.done ? 1 : -1) : a.p.no - b.p.no; });
    var owed = patterns.filter(notesOwed);
    return { resolves: resolves, fresh: fresh, owed: owed };
  }

  function lastAttemptToday(no) {
    var t = today();
    var list = attemptsOf(no).filter(function (a) { return a.d === t; });
    return list.length ? list[list.length - 1] : null;
  }

  function taskHtml(x, kind) {
    var p = x.p, i = x.i, pt = patternById[p.patternId];
    var meta, trap = state.probNotes[p.no];
    if (kind === 'resolve') {
      meta = ladderHtml(p.no) + '<span>' + (x.done ? 'Logged today' : (i.overdueDays > 0 ? stepName(i.level) + ', ' + plural(i.overdueDays, 'day') + ' late' : stepName(i.level) + ', due today')) + '</span>';
    } else {
      meta = '<span>' + (x.done ? 'Logged today' : 'Attempt 1, budget ' + budgetFor(p.no) + ' min') + '</span>';
    }
    var running = ui.timer && ui.timer.no === p.no;
    var actions;
    if (x.done) {
      var a = lastAttemptToday(p.no);
      actions = '<span class="done-mark" tabindex="-1" id="done-' + p.no + '">' + ICON.done + esc(a ? attemptText(a) : 'Logged') + '</span>';
    } else {
      actions =
        '<span class="inline-timer' + (running && elapsedMin() > budgetFor(p.no) ? ' over' : '') + '" data-timer-clock="' + p.no + '" aria-label="Timer">' + (running ? clockText() : '') + '</span>' +
        (running
          ? '<button type="button" class="btn sm quiet" data-action="timer-stop">Reset</button>'
          : '<button type="button" class="btn sm quiet" data-action="timer-start" data-no="' + p.no + '">Start timer</button>') +
        '<label class="sr-only" for="tm-' + p.no + '">Minutes for #' + p.no + '</label>' +
        '<input class="mins" id="tm-' + p.no + '" type="number" min="1" max="600" inputmode="numeric" placeholder="Min">' +
        '<button type="button" class="btn" data-action="log" data-result="stuck" data-no="' + p.no + '" data-src="task">Stuck</button>' +
        '<button type="button" class="btn primary" data-action="log" data-result="solved" data-no="' + p.no + '" data-src="task">Solved</button>';
    }
    return '<div class="task' + (x.done ? ' done' : '') + '" id="task-' + p.no + '">' +
      '<div class="task-info">' +
        '<div class="task-title"><span class="t-no">#' + p.no + '</span>' +
          '<a class="t-name" href="#p/' + pt.id + '/' + p.no + '">' + esc(p.name) + '</a>' +
          (p.core ? ICON.star : '') + (p.hard ? '<span class="hard-tag">Hard</span>' : '') +
          '<span class="chip">' + esc(pt.short) + '</span>' +
          (kind === 'fresh' && !x.done ? '<a class="small" href="' + lcUrl(p.name) + '" target="_blank" rel="noopener">Find on LeetCode</a>' : '') +
        '</div>' +
        '<div class="task-meta">' + meta + '</div>' +
        (kind === 'resolve' && trap && !x.done ? '<p class="task-trap">Last trap: ' + esc(trap) + '</p>' : '') +
      '</div>' +
      '<div class="task-actions">' + actions + '</div>' +
    '</div>';
  }

  function weekCard() {
    var now = new Date();
    var dow = (now.getDay() + 6) % 7;
    var t = today();
    var days = [];
    for (var k = 0; k < 7; k++) days.push(ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow + k)));
    var names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    var cells = days.map(function (d, k) {
      var c = 0;
      Object.keys(state.attempts).forEach(function (no) { state.attempts[no].forEach(function (a) { if (a.d === d) c++; }); });
      var future = d > t;
      return '<div class="wday' + (d === t ? ' today' : '') + '"><span class="wd-name">' + names[k] + '</span>' +
        '<span class="wd-count">' + (future ? '' : c) + '</span>' +
        '<span class="wd-sub">' + (k === 6 ? 'Contest' : '') + '</span></div>';
    }).join('');
    return '<section class="card" aria-labelledby="weekTitle"><div class="card-head"><h2 id="weekTitle">This week</h2></div>' +
      '<div class="card-body"><div class="week">' + cells + '</div>' +
      '<p class="footnote" style="margin-top:10px">Attempts logged per day. Sunday is the LeetCode weekly contest.</p></div></section>';
  }

  function paceCard() {
    var attemptedCore = problems.filter(function (p) { return p.core && attemptsOf(p.no).length; }).length;
    var todo = todoOrder();
    var needed;
    if (state.settings.coreFirst) needed = todo.filter(function (p) { return p.core; }).length;
    else { var lastIdx = -1; todo.forEach(function (p, k) { if (p.core) lastIdx = k; }); needed = lastIdx + 1; }
    var perDay = state.settings.dailyNew;
    var days = Math.ceil(needed / perDay);
    var pct = Math.round(attemptedCore / CORE_TOTAL * 100);
    var msg;
    if (!needed) msg = 'Every core problem has been attempted. Keep the re-solves going.';
    else msg = 'At ' + perDay + ' new a day' + (state.settings.coreFirst ? ', core first' : ', in list order') + ', the last core problem lands around ' + fmt(addDays(today(), Math.max(0, days - 1))) +
      (state.settings.coreFirst ? '.' : '. Turn on “core first” in Settings to get there sooner.');
    return '<section class="card" aria-labelledby="paceTitle"><div class="card-head"><h2 id="paceTitle">Core pace</h2></div>' +
      '<div class="card-body" style="display:flex;flex-direction:column;gap:10px">' +
        '<div class="pace-row"><strong>' + attemptedCore + ' of ' + CORE_TOTAL + ' core attempted</strong><span class="muted">' + pct + '%</span></div>' +
        '<div class="progress" aria-hidden="true"><span class="seg-cleared" style="width:' + pct + '%"></span></div>' +
        '<p class="footnote" style="color:var(--text-2);font-size:13px">' + esc(msg) + '</p>' +
      '</div></section>';
  }

  function rulesCard() {
    var st = state.settings;
    return '<section class="card" aria-labelledby="rulesTitle"><div class="card-head"><h2 id="rulesTitle">How each problem goes</h2></div>' +
      '<div class="card-body"><ol style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--text-2)">' +
        '<li>Attempt 1: 30 minutes (45 for Hard). Stuck? Read only the approach, code it yourself, log it as stuck.</li>' +
        '<li>Re-solve ' + st.gap1 + ' days later without looking.</li>' +
        '<li>Re-solve again ' + st.gap2 + ' days after that. Clean in ' + st.cleanMinutes + ' minutes or less means cleared.</li>' +
        '<li>After a pattern, write when to use it, the template, and the trap.</li>' +
      '</ol></div></section>';
  }

  function renderToday() {
    var plan = todayPlan();
    var t = today();
    var total = plan.resolves.length + plan.fresh.length + plan.owed.length;
    var doneCount = plan.resolves.filter(function (x) { return x.done; }).length + plan.fresh.filter(function (x) { return x.done; }).length;
    var parts = [];
    if (plan.resolves.length) parts.push(plural(plan.resolves.length, 're-solve'));
    if (plan.fresh.length) parts.push(plural(plan.fresh.length, 'new problem'));
    if (plan.owed.length) parts.push(plural(plan.owed.length, 'set', 'sets') + ' of pattern notes');
    var lead = parts.length ? parts.join(', then ') + '. ' + doneCount + ' of ' + total + ' done.' : 'Everything is done. Nice work.';

    var resolvesHtml = plan.resolves.length
      ? plan.resolves.map(function (x) { return taskHtml(x, 'resolve'); }).join('')
      : '<p class="empty">No re-solves due today.</p>';
    var freshHtml = plan.fresh.length
      ? plan.fresh.map(function (x) { return taskHtml(x, 'fresh'); }).join('')
      : '<p class="empty">All 299 problems attempted.</p>';
    var owedHtml = plan.owed.map(function (pt) {
      return '<div class="task"><div class="task-info"><div class="task-title"><span class="t-name">' + esc(pt.name) + '</span></div>' +
        '<p class="task-trap">' + pt.problems.length + ' of ' + pt.problems.length + ' attempted. Write when to use it, the template, and the trap you fell into.</p></div>' +
        '<div class="task-actions"><a class="btn" href="#p/' + pt.id + '">Write notes</a></div></div>';
    }).join('');

    $('main').innerHTML =
      '<div class="tv"><section class="tv-main">' +
        '<div class="tv-head"><p class="eyebrow">' + esc(fmtLong(t)) + '</p>' +
          '<h1 class="title" id="pageTitle" tabindex="-1">Today</h1><p class="lead">' + esc(lead) + '</p></div>' +
        '<section class="card" aria-labelledby="resTitle"><div class="card-head"><h2 id="resTitle">Re-solve first</h2><span class="aside">No peeking at the old solution</span></div>' + resolvesHtml + '</section>' +
        '<section class="card" aria-labelledby="newTitle"><div class="card-head"><h2 id="newTitle">Then ' + plural(plan.fresh.length, 'new problem') + '</h2><span class="aside">' +
          (state.settings.coreFirst ? 'Core first' : 'In list order') + '</span></div>' + freshHtml + '</section>' +
        (plan.owed.length ? '<section class="card" aria-labelledby="owedTitle"><div class="card-head"><h2 id="owedTitle">Notes owed</h2></div>' + owedHtml + '</section>' : '') +
      '</section>' +
      '<aside class="tv-side" aria-label="Week and pace">' + weekCard() + paceCard() + rulesCard() + '</aside></div>';
  }

  /* ---------- Router ---------- */
  function currentRoute() {
    var h = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (h.indexOf('p/') === 0) {
      var parts = h.split('/');
      if (patternById[parts[1]]) {
        var no = Number(parts[2]);
        return { view: 'pattern', id: parts[1], no: byNo[no] && byNo[no].patternId === parts[1] ? no : null };
      }
    }
    return { view: 'today' };
  }

  var lastRouteKey = null;

  function render(opts) {
    opts = opts || {};
    var r = currentRoute();
    var key = r.view + ':' + (r.id || '');
    var routeChanged = key !== lastRouteKey;
    if (routeChanged) {
      ui.filter = 'all';
      ui.search = '';
      ui.expanded = null;
    }
    if (opts.fromHash && r.no) ui.expanded = r.no;
    lastRouteKey = key;

    renderTopStats();
    renderRail(r);
    if (r.view === 'pattern') renderPattern(r); else renderToday();
    document.title = (r.view === 'pattern' ? patternById[r.id].name : 'Today') + ' · DSA tracker';

    if (opts.fromHash) {
      closeDrawer();
      if (r.view === 'pattern' && r.no) {
        var row = document.getElementById('row-' + r.no);
        if (row) {
          row.scrollIntoView({ block: 'center' });
          var btn = row.querySelector('.prow-main');
          if (btn) btn.focus({ preventScroll: true });
        }
      } else if (routeChanged) {
        window.scrollTo(0, 0);
        var title = document.getElementById('pageTitle');
        if (title) title.focus({ preventScroll: true });
      }
    }
  }

  /* ---------- Actions ---------- */
  function clockText() {
    if (!ui.timer) return '0:00';
    var s = Math.max(0, Math.floor((Date.now() - ui.timer.start) / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? h + ':' + pad(m) : m) + ':' + pad(sec);
  }
  function elapsedMin() { return ui.timer ? (Date.now() - ui.timer.start) / 60000 : 0; }

  function tick() {
    if (!ui.timer) return;
    var no = ui.timer.no;
    var budget = budgetFor(no);
    var over = elapsedMin() > budget;
    document.querySelectorAll('[data-timer-clock="' + no + '"]').forEach(function (el) {
      el.textContent = clockText();
      el.classList.toggle('over', over);
    });
    var box = document.querySelector('[data-timer-box="' + no + '"]');
    if (box) box.classList.toggle('over', over);
    var msg = document.querySelector('[data-timer-msg="' + no + '"]');
    if (msg) {
      if (!attemptsOf(no).length) msg.textContent = over ? 'Time’s up. Read the approach, then code it yourself.' : 'Budget ' + budget + ' min';
      else msg.textContent = over ? 'Past ' + budget + ' min, so this one won’t count as clean.' : 'Clean if done by ' + budget + ' min';
    }
  }

  function startTimer(no) {
    ui.timer = { no: no, start: Date.now() };
    saveTimer();
    render();
    tick();
  }
  function stopTimer() {
    ui.timer = null;
    saveTimer();
    render();
  }

  function insertAttempt(no, attempt) {
    var list = state.attempts[no] ? state.attempts[no].slice() : [];
    var idx = list.length;
    while (idx > 0 && list[idx - 1].d > attempt.d) idx--;
    list.splice(idx, 0, attempt);
    state.attempts[no] = list;
  }

  function logAttempt(no, result, src) {
    var minsEl = document.getElementById(src === 'task' ? 'tm-' + no : 'm-' + no);
    var dateEl = src === 'detail' ? document.getElementById('d-' + no) : null;
    var raw = minsEl ? minsEl.value.trim() : '';
    var mins = raw ? Math.round(Number(raw)) : null;
    if (raw && (!isFinite(mins) || mins <= 0)) {
      toast('Enter minutes as a whole number, or leave it empty.');
      if (minsEl) minsEl.focus();
      return;
    }
    if (mins === null && ui.timer && ui.timer.no === no) mins = Math.max(1, Math.ceil(elapsedMin()));
    var d = dateEl && dateEl.value ? dateEl.value : today();
    if (d > today()) d = today();

    var attempt = { d: d, r: result, m: mins };
    insertAttempt(no, attempt);
    if (ui.timer && ui.timer.no === no) { ui.timer = null; saveTimer(); }
    save();
    ui.lastLog = { no: no, attempt: attempt };

    var i = info(no);
    var msg = '#' + no + ': ' + attemptText(attempt) + '. ';
    if (i.cleared) msg += 'Cleared.';
    else msg += 'Next re-solve ' + (i.due === today() ? 'today' : 'on ' + fmt(i.due)) + '.';

    if (src === 'detail' && i.cleared) ui.expanded = null;
    render();
    toast(msg, true);

    var focusEl = src === 'task'
      ? (document.getElementById('done-' + no) || document.getElementById('pageTitle'))
      : document.querySelector('[data-action="toggle"][data-no="' + no + '"]');
    if (focusEl) focusEl.focus({ preventScroll: true });
  }

  function undoLog() {
    var l = ui.lastLog;
    if (!l) return;
    var list = state.attempts[l.no] || [];
    var idx = list.indexOf(l.attempt);
    if (idx > -1) {
      list.splice(idx, 1);
      if (list.length) state.attempts[l.no] = list; else delete state.attempts[l.no];
      save();
      render();
      toast('Undone.');
    }
    ui.lastLog = null;
  }

  function undoLast(no) {
    var list = state.attempts[no];
    if (!list || !list.length) return;
    var removed = list[list.length - 1];
    if (!window.confirm('Remove the last attempt on #' + no + ' (' + fmt(removed.d) + ', ' + attemptText(removed) + ')?')) return;
    list.pop();
    if (!list.length) delete state.attempts[no];
    save();
    render();
    var btn = document.querySelector('[data-action="toggle"][data-no="' + no + '"]');
    if (btn) btn.focus({ preventScroll: true });
    toast('Removed the last attempt on #' + no + '.');
  }

  /* ---------- Toast ---------- */
  var toastTimer = null;
  function toast(text, withUndo) {
    var el = $('toast');
    el.innerHTML = '<span>' + esc(text) + '</span>' + (withUndo ? '<button type="button" data-action="undo-log">Undo</button>' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, withUndo ? 7000 : 4000);
  }

  /* ---------- Drawer (small screens) ---------- */
  function openDrawer() {
    $('rail').classList.add('open');
    $('scrim').hidden = false;
    $('menuBtn').setAttribute('aria-expanded', 'true');
    var first = $('rail').querySelector('a');
    if (first) first.focus();
  }
  function closeDrawer() {
    $('rail').classList.remove('open');
    $('scrim').hidden = true;
    $('menuBtn').setAttribute('aria-expanded', 'false');
  }

  /* ---------- Settings & backup ---------- */
  function field(name) { return $('settingsForm').elements.namedItem(name); }
  function openSettings() {
    var st = state.settings;
    field('cleanMinutes').value = st.cleanMinutes;
    field('gap1').value = st.gap1;
    field('gap2').value = st.gap2;
    field('dailyNew').value = st.dailyNew;
    field('coreFirst').checked = st.coreFirst;
    field('theme').value = st.theme;
    var dlg = $('settings');
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function closeSettings() {
    var dlg = $('settings');
    if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
  }

  function saveSettings() {
    var f = $('settingsForm');
    if (!f.reportValidity()) return;
    state.settings = Object.assign({}, state.settings, {
      cleanMinutes: Math.round(Number(field('cleanMinutes').value)),
      gap1: Math.round(Number(field('gap1').value)),
      gap2: Math.round(Number(field('gap2').value)),
      dailyNew: Math.round(Number(field('dailyNew').value)),
      coreFirst: field('coreFirst').checked,
      theme: field('theme').value
    });
    state = normalize(state);
    save();
    applyTheme();
    closeSettings();
    render();
    toast('Settings saved.');
  }

  function exportBackup() {
    var payload = Object.assign({ app: 'dsa-pattern-tracker', exportedAt: new Date().toISOString() }, state);
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
        if (!parsed || typeof parsed !== 'object' || typeof parsed.attempts !== 'object') throw new Error('bad');
        var next = normalize(parsed);
        var n = Object.keys(next.attempts).length;
        if (!window.confirm('Replace your current progress with this backup (' + plural(n, 'problem') + ' with attempts)?')) return;
        state = next;
        save();
        applyTheme();
        closeSettings();
        render();
        toast('Backup imported.');
      } catch (e) {
        toast('That file isn’t a tracker backup.');
      }
    };
    reader.readAsText(file);
  }

  function resetAll() {
    if (!window.confirm('Delete all attempts, notes and settings in this browser? Export a backup first if you might want them.')) return;
    state = normalize({});
    ui.timer = null;
    saveTimer();
    save();
    applyTheme();
    closeSettings();
    render();
    toast('Everything was reset.');
  }

  /* ---------- Notes autosave ---------- */
  var noteTimers = {};
  function onNoteInput(el) {
    var id = el.getAttribute('data-note');
    var key = el.getAttribute('data-key');
    if (!state.notes[id]) state.notes[id] = { when: '', template: '', trap: '', updatedAt: null };
    state.notes[id][key] = el.value;
    var stateEl = document.querySelector('[data-save-state="' + id + '"]');
    if (stateEl) stateEl.textContent = 'Saving…';
    clearTimeout(noteTimers[id]);
    noteTimers[id] = setTimeout(function () {
      state.notes[id].updatedAt = today();
      save();
      if (stateEl) stateEl.textContent = 'Saved';
      renderRail(currentRoute());
    }, 450);
  }

  var pnoteTimers = {};
  function onProblemNoteInput(el) {
    var no = el.getAttribute('data-pnote');
    var v = el.value;
    clearTimeout(pnoteTimers[no]);
    pnoteTimers[no] = setTimeout(function () {
      if (v.trim()) state.probNotes[no] = v; else delete state.probNotes[no];
      save();
    }, 450);
  }

  /* ---------- Events ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');
    var no = Number(el.getAttribute('data-no'));
    if (action === 'toggle') {
      ui.expanded = ui.expanded === no ? null : no;
      var r = currentRoute();
      var wrap = document.getElementById('tableWrap');
      if (wrap && r.view === 'pattern') {
        wrap.innerHTML = tableHtml(patternById[r.id]);
        var btn = document.querySelector('[data-action="toggle"][data-no="' + no + '"]');
        if (btn) btn.focus({ preventScroll: true });
      }
    } else if (action === 'filter') {
      ui.filter = el.getAttribute('data-filter');
      render();
      var tab = document.querySelector('[data-action="filter"][data-filter="' + ui.filter + '"]');
      if (tab) tab.focus({ preventScroll: true });
    } else if (action === 'log') {
      logAttempt(no, el.getAttribute('data-result'), el.getAttribute('data-src'));
    } else if (action === 'undo-log') {
      $('toast').hidden = true;
      undoLog();
    } else if (action === 'undo-last') {
      undoLast(no);
    } else if (action === 'timer-start') {
      startTimer(no);
    } else if (action === 'timer-stop') {
      stopTimer();
    }
  });

  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el.id === 'search') {
      ui.search = el.value;
      var r = currentRoute();
      var wrap = document.getElementById('tableWrap');
      if (wrap && r.view === 'pattern') wrap.innerHTML = tableHtml(patternById[r.id]);
    } else if (el.hasAttribute('data-note')) {
      onNoteInput(el);
    } else if (el.hasAttribute('data-pnote')) {
      onProblemNoteInput(el);
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && $('rail').classList.contains('open')) {
      closeDrawer();
      $('menuBtn').focus();
    }
  });

  window.addEventListener('hashchange', function () { render({ fromHash: true }); });

  window.addEventListener('storage', function (e) {
    if (e.key === STORE_KEY) { state = load(); applyTheme(); render(); }
  });

  $('menuBtn').addEventListener('click', function () {
    if ($('rail').classList.contains('open')) closeDrawer(); else openDrawer();
  });
  $('scrim').addEventListener('click', closeDrawer);
  $('settingsBtn').addEventListener('click', openSettings);
  $('saveSettingsBtn').addEventListener('click', saveSettings);
  $('settingsForm').addEventListener('submit', function (e) {
    if (e.submitter && e.submitter.value === 'close') return;
    e.preventDefault();
    saveSettings();
  });
  $('exportBtn').addEventListener('click', exportBackup);
  $('resetBtn').addEventListener('click', resetAll);
  $('importFile').addEventListener('change', function (e) {
    importBackup(e.target.files && e.target.files[0]);
    e.target.value = '';
  });

  // Re-render once a minute so "today" rolls over at midnight; tick the timer every second.
  var lastDay = today();
  setInterval(function () {
    tick();
    if (today() !== lastDay) { lastDay = today(); render(); }
  }, 1000);

  /* ---------- Start ---------- */
  applyTheme();
  if (!location.hash) history.replaceState(null, '', '#today');
  render({ fromHash: true });
  tick();
})();
