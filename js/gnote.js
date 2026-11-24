/* ==========================================================
   임용쏙 — 📘 기출노트 탭 (내용 읽기 + ✏️ 필기 + 🙋 질문하기)

   개인 Claude 아티팩트 3개를 옮겨온 것. 아티팩트는 claude.ai 안에서만
   동작했지만(질문하기가 window.claude.use('sample') 에 의존),
   여기서는 임용쏙의 BYOK 설정(callChatStream)을 쓰므로 클로드 계정이
   없어도 열린다. 노트 읽기와 필기는 키조차 필요 없다.

   ⚠️ 원본과 달라진 곳 두 가지
   1) 필기 좌표를 문서 기준 → #gnoteRoot 기준으로 바꿨다.
      임용쏙은 위에 헤더·탭이 있어서 문서 기준으로 저장하면 헤더 높이가
      바뀔 때 저장해 둔 획이 통째로 밀린다.
   2) 인쇄는 캔버스가 아니라 SVG 로 다시 그린다.
      캔버스는 position:fixed 라 첫 쪽에만 찍히고, 노트 전체 높이로
      키우면 브라우저 캔버스 한계(약 16,384px)를 넘어 조용히 빈칸이 된다.
   ========================================================== */
(function () {
  'use strict';

  var SUB_KEY = 'gn_subject_v1';
  var root, sheet, titleEl, subEl, picker, cur = null, loaded = {};

  function $(id) { return document.getElementById(id); }
  function subjectBy(key) {
    for (var i = 0; i < GNOTE_SUBJECTS.length; i++) if (GNOTE_SUBJECTS[i].key === key) return GNOTE_SUBJECTS[i];
    return GNOTE_SUBJECTS[0];
  }
  function visible() { return !!(root && root.offsetParent !== null); }

  /* ─────────────── 과목 전환 ─────────────── */

  function renderPicker() {
    picker.innerHTML = '';
    GNOTE_SUBJECTS.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'gn-sub' + (cur && cur.key === s.key ? ' on' : '');
      b.textContent = s.label;
      b.addEventListener('click', function () { if (!cur || cur.key !== s.key) use(s.key); });
      picker.appendChild(b);
    });
  }

  function use(key) {
    var s = subjectBy(key);
    cur = s;
    try { localStorage.setItem(SUB_KEY, s.key); } catch (e) {}
    root.className = 'gn-root s-' + s.key;
    if (titleEl) titleEl.textContent = s.title;
    if (subEl) subEl.textContent = s.sub;
    renderPicker();
    Ask.reset(s);

    if (loaded[s.key]) { sheet.innerHTML = loaded[s.key]; afterContent(); return; }
    sheet.innerHTML = '<div class="gn-loading">노트를 불러오는 중…</div>';
    fetch(s.file, { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (html) {
        loaded[s.key] = html;
        if (cur.key !== s.key) return;      // 그 사이에 다른 과목을 눌렀으면 버린다
        sheet.innerHTML = html;
        afterContent();
      })
      .catch(function (e) {
        sheet.innerHTML = '<div class="gn-loading">노트를 불러오지 못했습니다 (' + e.message + ').<br>' +
          '새로 고쳐 보세요. 파일을 직접 열었다면(file://) 브라우저가 막는 것이라 주소로 접속해야 합니다.</div>';
      });
  }

  function afterContent() {
    Pen.use(cur.key);
    window.scrollTo(0, 0);
  }

  /* ─────────────── ✏️ 필기 ─────────────── */

  var Pen = (function () {
    var cv, ctx, fab, bar, tip, layer, tabs, mask, ioText, printInk;
    var PENS = {
      c1: { color: '#1B1A18', w: 2.4, a: 1 }, c2: { color: '#C62828', w: 2.4, a: 1 },
      c3: { color: '#1565C0', w: 2.4, a: 1 }, c4: { color: '#FFE082', w: 17, a: .45 }
    };
    var MMC = ['#FFF59D', '#F8BBD0', '#B3E5FC', '#C8E6C9'];
    var SIZES = [[200, 110], [250, 150], [340, 250]];
    var on = false, pen = 'c1', erasing = false, penOnly = true, wired = false;
    var strokes = [], cur2 = null, layoutW = 0, memos = [], mseq = 1, skey = '';

    function inkKey() { return 'gn_ink_' + skey + '_v1'; }
    function memoKey() { return 'gn_memo_' + skey + '_v1'; }

    // 노트 영역의 왼쪽 위 — 저장된 좌표의 기준점
    function originX() { return root.getBoundingClientRect().left + (window.scrollX || 0); }
    function originY() { return root.getBoundingClientRect().top + (window.scrollY || 0); }
    function rootW() { return root.clientWidth || 860; }
    function sx() { var w = rootW(); return (layoutW && w && layoutW !== w) ? w / layoutW : 1; }

    function flash(msg, ms) {
      tip.textContent = msg; tip.classList.add('on');
      if (flash._t) clearTimeout(flash._t);
      flash._t = setTimeout(function () { tip.classList.remove('on'); }, ms || 1600);
    }

    // ── 저장 ──
    var st = null, mt = null;
    function saveInk() {
      if (st) clearTimeout(st);
      st = setTimeout(function () {
        try { localStorage.setItem(inkKey(), JSON.stringify({ w: layoutW || rootW(), s: strokes })); }
        catch (e) { flash('저장 공간이 꽉 찼습니다. 「내보내기」로 옮긴 뒤 지워 주세요.', 3400); }
      }, 350);
    }
    function saveMemo() {
      if (mt) clearTimeout(mt);
      mt = setTimeout(function () {
        try { localStorage.setItem(memoKey(), JSON.stringify({ w: layoutW || rootW(), m: memos })); }
        catch (e) { flash('저장 공간이 꽉 찼습니다.', 3000); }
      }, 350);
    }
    function load() {
      strokes = []; memos = []; layoutW = 0; mseq = 1; cur2 = null;
      try { var a = JSON.parse(localStorage.getItem(inkKey()) || 'null'); if (a) { strokes = a.s || []; layoutW = a.w || 0; } } catch (e) {}
      try { var b = JSON.parse(localStorage.getItem(memoKey()) || 'null'); if (b) { memos = b.m || []; if (!layoutW) layoutW = b.w || 0; } } catch (e) {}
      if (!layoutW) layoutW = rootW();
      memos.forEach(function (m) { if (m.id >= mseq) mseq = m.id + 1; });
    }

    // ── 캔버스 ──
    function fit() {
      if (!visible()) return;
      var dpr = window.devicePixelRatio || 1, W = window.innerWidth || 800, H = window.innerHeight || 600;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    function draw() {
      if (!ctx || !ctx.clearRect) return;
      var W = window.innerWidth || 800, H = window.innerHeight || 600;
      ctx.clearRect(0, 0, W, H);
      if (!visible()) return;
      var ox = (window.scrollX || 0) - originX(), oy = (window.scrollY || 0) - originY(), k = sx();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (var i = 0; i < strokes.length; i++) {
        var s = strokes[i], p = s.p;
        if (!p || p.length < 4) continue;
        if (s.y1 - oy > H || s.y2 - oy < 0) continue;
        ctx.globalAlpha = s.a; ctx.strokeStyle = s.c; ctx.lineWidth = s.w;
        ctx.beginPath(); ctx.moveTo(p[0] * k - ox, p[1] - oy);
        for (var j = 2; j < p.length; j += 2) ctx.lineTo(p[j] * k - ox, p[j + 1] - oy);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    function pt(e) {
      return [
        Math.round((e.clientX + (window.scrollX || 0) - originX()) / sx()),
        Math.round(e.clientY + (window.scrollY || 0) - originY())
      ];
    }
    function hit(x, y) {
      for (var i = strokes.length - 1; i >= 0; i--) {
        var s = strokes[i], p = s.p, r = Math.max(11, s.w);
        for (var j = 0; j < p.length; j += 2) if (Math.abs(p[j] - x) < r && Math.abs(p[j + 1] - y) < r) return i;
      }
      return -1;
    }
    function down(e) {
      if (!on) return;
      if (penOnly && e.pointerType && e.pointerType !== 'pen') {
        cv.style.pointerEvents = 'none';
        setTimeout(function () { if (on) cv.style.pointerEvents = 'auto'; }, 700);
        return;
      }
      var q = pt(e);
      if (erasing) {
        var i = hit(q[0], q[1]);
        if (i >= 0) { strokes.splice(i, 1); draw(); saveInk(); }
        if (e.preventDefault) e.preventDefault();
        return;
      }
      var P = PENS[pen];
      cur2 = { c: P.color, w: P.w, a: P.a, p: [q[0], q[1]], y1: q[1], y2: q[1] };
      strokes.push(cur2);
      if (cv.setPointerCapture) cv.setPointerCapture(e.pointerId);
      if (e.preventDefault) e.preventDefault();
    }
    function move(e) {
      if (!on) return;
      if (erasing) {
        if (e.buttons) { var r = pt(e), i = hit(r[0], r[1]); if (i >= 0) { strokes.splice(i, 1); draw(); saveInk(); } }
        return;
      }
      if (!cur2) return;
      var q = pt(e), p = cur2.p, n = p.length;
      if (n >= 2 && Math.abs(p[n - 2] - q[0]) < 2 && Math.abs(p[n - 1] - q[1]) < 2) return;
      p.push(q[0], q[1]);
      if (q[1] < cur2.y1) cur2.y1 = q[1];
      if (q[1] > cur2.y2) cur2.y2 = q[1];
      draw();
      if (e.preventDefault) e.preventDefault();
    }
    function up() {
      if (cur2) {
        if (cur2.p.length < 4) cur2.p.push(cur2.p[0] + 1, cur2.p[1] + 1);
        cur2 = null; saveInk(); flash('저장됨', 900);
      }
    }

    // ── 메모지 ──
    function titleOf(m) {
      if (m.n) return m.n;
      var first = (m.t || '').split('\n')[0].trim();
      return first ? first.slice(0, 22) : '메모';
    }
    function renderMemo(m) {
      var el = document.createElement('div');
      el.className = 'mm';
      el.style.left = m.x + 'px'; el.style.top = m.y + 'px';
      el.style.width = (m.w || 250) + 'px'; el.style.height = (m.h || 150) + 'px';
      el.style.background = m.c || MMC[0];

      var h = document.createElement('div'); h.className = 'mm-h';
      var ti = document.createElement('input'); ti.className = 'mm-t'; ti.type = 'text';
      ti.value = m.n || ''; ti.placeholder = '제목'; ti.title = '제목 — 접으면 이 이름으로 보입니다';
      ti.autocomplete = 'off';
      var fBtn = document.createElement('button'); fBtn.type = 'button'; fBtn.textContent = '▸'; fBtn.title = '접어서 옆에 두기';
      var sBtn = document.createElement('button'); sBtn.type = 'button'; sBtn.textContent = '⤢'; sBtn.title = '크기 바꾸기';
      var cBtn = document.createElement('button'); cBtn.type = 'button'; cBtn.textContent = '🎨'; cBtn.title = '색 바꾸기';
      var xBtn = document.createElement('button'); xBtn.type = 'button'; xBtn.textContent = '✕'; xBtn.title = '삭제';
      h.appendChild(ti); h.appendChild(fBtn); h.appendChild(sBtn); h.appendChild(cBtn); h.appendChild(xBtn);

      var ta = document.createElement('textarea');
      ta.value = m.t || ''; ta.placeholder = '여기에 적거나 붙여넣으세요';
      var rz = document.createElement('div'); rz.className = 'mm-rz';
      el.appendChild(h); el.appendChild(ta); el.appendChild(rz);
      layer.appendChild(el);

      ta.addEventListener('input', function () { m.t = ta.value; saveMemo(); });
      ti.addEventListener('input', function () { m.n = ti.value; saveMemo(); });
      fBtn.addEventListener('click', function () {
        m.f = true; saveMemo(); renderAll();
        flash('오른쪽에 「' + titleOf(m) + '」로 접어 뒀습니다', 2200);
      });
      sBtn.addEventListener('click', function () {
        var i = 0, cw = m.w || 250;
        for (var k = 0; k < SIZES.length; k++) if (Math.abs(SIZES[k][0] - cw) < 30) i = k;
        var nx = SIZES[(i + 1) % SIZES.length];
        m.w = nx[0]; m.h = nx[1];
        el.style.width = m.w + 'px'; el.style.height = m.h + 'px'; saveMemo();
        flash(['작게', '보통', '크게'][(i + 1) % SIZES.length], 1000);
      });
      cBtn.addEventListener('click', function () {
        var i = MMC.indexOf(m.c || MMC[0]); m.c = MMC[(i + 1) % MMC.length];
        el.style.background = m.c; saveMemo();
      });
      xBtn.addEventListener('click', function () {
        memos = memos.filter(function (z) { return z.id !== m.id; });
        saveMemo(); renderAll(); flash('메모지를 지웠습니다');
      });

      if (window.PointerEvent) {
        h.addEventListener('pointerdown', function (e) {
          if (e.target !== h) return;                    // 제목칸·버튼은 통과
          var sxp = e.clientX, syp = e.clientY, x0 = m.x, y0 = m.y;
          if (h.setPointerCapture) h.setPointerCapture(e.pointerId);
          var mv = function (ev) {
            m.x = Math.max(0, x0 + (ev.clientX - sxp)); m.y = Math.max(0, y0 + (ev.clientY - syp));
            el.style.left = m.x + 'px'; el.style.top = m.y + 'px';
          };
          var uf = function () { h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', uf); saveMemo(); };
          h.addEventListener('pointermove', mv); h.addEventListener('pointerup', uf);
          if (e.preventDefault) e.preventDefault();
        });
        rz.addEventListener('pointerdown', function (e) {
          var sxp = e.clientX, syp = e.clientY, w0 = m.w || 250, h0 = m.h || 150;
          if (rz.setPointerCapture) rz.setPointerCapture(e.pointerId);
          var mv = function (ev) {
            m.w = Math.max(150, w0 + (ev.clientX - sxp)); m.h = Math.max(90, h0 + (ev.clientY - syp));
            el.style.width = m.w + 'px'; el.style.height = m.h + 'px';
          };
          var uf = function () { rz.removeEventListener('pointermove', mv); rz.removeEventListener('pointerup', uf); saveMemo(); };
          rz.addEventListener('pointermove', mv); rz.addEventListener('pointerup', uf);
          if (e.preventDefault) e.preventDefault();
        });
      }
      return el;
    }
    function renderTab(m) {
      var t = document.createElement('button');
      t.type = 'button'; t.className = 'mm-tab';
      t.style.background = m.c || MMC[0];
      var s = document.createElement('span'); s.textContent = titleOf(m);
      t.appendChild(s);
      t.title = '눌러서 펼치기';
      t.addEventListener('click', function () {
        m.f = false; saveMemo(); renderAll();
        var y = Math.max(0, originY() + m.y - 100);     // 메모지가 있는 자리로 데려간다
        if (window.scrollTo) window.scrollTo({ top: y, behavior: 'smooth' });
        flash('「' + titleOf(m) + '」를 펼쳤습니다', 1600);
      });
      tabs.appendChild(t);
      return t;
    }
    function renderAll() {
      layer.innerHTML = ''; tabs.innerHTML = '';
      for (var i = 0; i < memos.length; i++) {
        if (memos[i].f) renderTab(memos[i]); else renderMemo(memos[i]);
      }
    }
    function addMemo(text) {
      var y = Math.round((window.scrollY || 0) - originY() + 90);
      var m = {
        id: mseq++, n: '', x: Math.max(10, Math.round((rootW() - 270) / 2)),
        y: Math.max(10, y), w: 250, h: text ? 220 : 150, c: MMC[0], t: text || '', f: false
      };
      memos.push(m); renderAll(); saveMemo();
      flash(text ? '답을 메모지에 붙였습니다 — 제목을 달아 두면 접었을 때 찾기 쉽습니다' : '메모지를 붙였습니다', text ? 3000 : 1600);
      return m;
    }

    // ── 인쇄용: 획을 SVG 로 다시 그린다 ──
    function buildPrintInk() {
      printInk.innerHTML = '';
      if (!strokes.length) return;
      var NS = 'http://www.w3.org/2000/svg', k = sx();
      var w = rootW(), h = Math.max(root.scrollHeight, 1);
      var svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('width', w); svg.setAttribute('height', h);
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      for (var i = 0; i < strokes.length; i++) {
        var s = strokes[i], p = s.p;
        if (!p || p.length < 4) continue;
        var pts = [];
        for (var j = 0; j < p.length; j += 2) pts.push((p[j] * k).toFixed(1) + ',' + p[j + 1]);
        var ln = document.createElementNS(NS, 'polyline');
        ln.setAttribute('points', pts.join(' '));
        ln.setAttribute('fill', 'none');
        ln.setAttribute('stroke', s.c);
        ln.setAttribute('stroke-width', s.w);
        ln.setAttribute('stroke-opacity', s.a);
        ln.setAttribute('stroke-linecap', 'round');
        ln.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(ln);
      }
      printInk.appendChild(svg);
    }

    // ── 도구 ──
    function selPen(k) {
      pen = k; erasing = false;
      ['C1', 'C2', 'C3', 'C4'].forEach(function (n) {
        var b = $('pn' + n);
        if (b) b.classList[('c' + n[1]) === k ? 'add' : 'remove']('sel');
      });
      $('pnEraser').classList.remove('sel');
    }
    function setOn(v) {
      on = v;
      root.classList[on ? 'add' : 'remove']('pn-on');
      fab.classList[on ? 'add' : 'remove']('on');
      bar.classList[on ? 'add' : 'remove']('on');
      cv.style.pointerEvents = on ? 'auto' : 'none';
      fab.textContent = on ? '✏️ 필기 중' : '✏️ 필기';
      if (on) flash(penOnly ? '펜으로 쓰세요 — 손가락으로 넘깁니다' : '손가락·펜으로 쓸 수 있습니다', 2600);
    }
    function bundle() { return JSON.stringify({ v: 1, w: layoutW || rootW(), s: strokes, m: memos }); }

    function wire() {
      if (wired) return;
      wired = true;

      if (window.PointerEvent) {
        cv.addEventListener('pointerdown', down);
        cv.addEventListener('pointermove', move);
        cv.addEventListener('pointerup', up);
        cv.addEventListener('pointercancel', up);
      }
      window.addEventListener('scroll', draw, { passive: true });
      window.addEventListener('resize', fit);

      ['C1', 'C2', 'C3', 'C4'].forEach(function (n) {
        var b = $('pn' + n);
        if (b) b.addEventListener('click', function () { selPen('c' + n[1]); });
      });
      var erBtn = $('pnEraser');
      erBtn.addEventListener('click', function () {
        erasing = !erasing;
        erBtn.classList[erasing ? 'add' : 'remove']('sel');
        if (erasing) ['C1', 'C2', 'C3', 'C4'].forEach(function (n) { var b = $('pn' + n); if (b) b.classList.remove('sel'); });
        else selPen(pen);
        flash(erasing ? '지울 획을 톡 누르세요' : '펜으로 돌아왔습니다');
      });
      $('pnUndo').addEventListener('click', function () {
        if (!strokes.length) return flash('되돌릴 필기가 없습니다');
        strokes.pop(); draw(); saveInk(); flash('되돌렸습니다', 900);
      });
      $('pnMemo').addEventListener('click', function () { addMemo(''); });
      var fgBtn = $('pnFinger');
      fgBtn.addEventListener('click', function () {
        penOnly = !penOnly;
        fgBtn.textContent = penOnly ? '손가락 끄기' : '손가락 켜기';
        cv.style.pointerEvents = on ? 'auto' : 'none';
        flash(penOnly ? '펜으로만 씁니다 — 손가락으로 넘기세요' : '손가락으로도 씁니다 — 넘기려면 필기를 끄세요', 2600);
      });

      // 전체 지우기 — 되돌릴 수 없으니 두 번 누르게 한다
      var clBtn = $('pnClear'), armed = false, armT = null;
      clBtn.addEventListener('click', function () {
        if (!strokes.length && !memos.length) return flash('지울 것이 없습니다');
        if (!armed) {
          armed = true; clBtn.classList.add('warn'); clBtn.textContent = '정말 지울까요?';
          flash('한 번 더 누르면 이 과목의 필기와 메모지가 모두 지워집니다', 3000);
          armT = setTimeout(function () { armed = false; clBtn.classList.remove('warn'); clBtn.textContent = '전체 지우기'; }, 4000);
          return;
        }
        if (armT) clearTimeout(armT);
        armed = false; clBtn.classList.remove('warn'); clBtn.textContent = '전체 지우기';
        strokes = []; memos = []; renderAll(); draw(); saveInk(); saveMemo();
        flash('모두 지웠습니다');
      });

      $('pnIO').addEventListener('click', function () {
        ioText.value = bundle();
        mask.classList.add('on');
        setTimeout(function () { if (ioText.focus) ioText.focus(); if (ioText.select) ioText.select(); }, 60);
      });
      $('pnMaskClose').addEventListener('click', function () { mask.classList.remove('on'); });
      mask.addEventListener('click', function (e) { if (e.target === mask) mask.classList.remove('on'); });
      $('pnCopy').addEventListener('click', function () {
        var done = function () { flash('복사했습니다 — 메모앱이나 메일에 붙여 두세요', 2600); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ioText.value).then(done, fallback);
        else fallback();
        function fallback() {
          try { ioText.select(); document.execCommand('copy'); done(); }
          catch (e) { flash('복사가 막혀 있습니다. 글을 직접 선택해 복사해 주세요', 3000); }
        }
      });
      $('pnImport').addEventListener('click', function () {
        try {
          var o = JSON.parse(ioText.value);
          if (!o || (!Array.isArray(o.s) && !Array.isArray(o.m))) throw 0;
          strokes = Array.isArray(o.s) ? o.s : [];
          memos = Array.isArray(o.m) ? o.m : [];
          layoutW = o.w || rootW();
          mseq = 1; memos.forEach(function (m) { if (m.id >= mseq) mseq = m.id + 1; });
          renderAll(); draw(); saveInk(); saveMemo();
          mask.classList.remove('on');
          flash('필기 ' + strokes.length + '획, 메모지 ' + memos.length + '장을 불러왔습니다', 2800);
        } catch (e) { flash('형식이 맞지 않습니다. 복사한 글 전체를 넣어 주세요', 3000); }
      });

      fab.addEventListener('click', function () { setOn(!on); });
    }

    return {
      use: function (subjectKey) {
        cv = $('pnCanvas'); if (!cv || !cv.getContext) return;
        ctx = cv.getContext('2d');
        fab = $('pnFab'); bar = $('pnBar'); tip = $('pnTip');
        layer = $('mmLayer'); tabs = $('mmTabs');
        mask = $('pnMask'); ioText = $('pnIOText'); printInk = $('pnPrintInk');
        if (!layer || !tabs || !printInk) return;

        wire();
        skey = subjectKey;
        load(); renderAll(); selPen('c1'); setOn(false); fit();
        if (strokes.length && layoutW && Math.abs(layoutW - rootW()) > 40)
          flash('화면 폭이 달라져 필기 위치가 조금 어긋날 수 있습니다', 3200);
      },
      addMemo: function (t) { return addMemo(t); },
      hasMemo: function () { return !!layer; },
      buildPrintInk: buildPrintInk,
      refresh: function () { fit(); }
    };
  })();

  /* ─────────────── 🙋 질문하기 ─────────────── */

  var Ask = (function () {
    var fab, wrap, log, inp, send, chips, tier, grab, szBtn;
    var sys = '', turns = [], busy = false, ctl = null, wired = false, greeted = false;
    var MIN = 112;

    function esc(s) {
      return s.replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }
    // 과외 프롬프트가 「대비표」를 요구하므로 파이프 표까지 그려 준다
    function md(s) {
      var inline = function (t) {
        return esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
      };
      var lines = String(s).split('\n'), html = '', inList = false, i = 0;
      var isRow = function (L) { return /^\s*\|.*\|\s*$/.test(L); };
      var cells = function (L) { return L.trim().replace(/^\||\|$/g, '').split('|').map(function (x) { return x.trim(); }); };
      function closeList() { if (inList) { html += '</ul>'; inList = false; } }
      while (i < lines.length) {
        var L = lines[i];
        if (isRow(L) && i + 1 < lines.length && /^\s*\|[\s:\-|]+\|\s*$/.test(lines[i + 1])) {
          closeList();
          var head = cells(L); i += 2;
          html += '<table class="tt-tbl"><thead><tr>' +
            head.map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') + '</tr></thead><tbody>';
          while (i < lines.length && isRow(lines[i])) {
            html += '<tr>' + cells(lines[i]).map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>';
            i++;
          }
          html += '</tbody></table>';
          continue;
        }
        var m = L.match(/^\s*[-·•]\s+(.*)$/);
        if (m) { if (!inList) { html += '<ul>'; inList = true; } html += '<li>' + inline(m[1]) + '</li>'; }
        else {
          closeList();
          html += L.trim() ? '<div>' + inline(L) + '</div>' : '<div style="height:.5em"></div>';
        }
        i++;
      }
      closeList();
      return html;
    }
    function bubble(cls, text) {
      var d = document.createElement('div');
      d.className = 'tt-msg ' + cls;
      if (cls === 'ai') d.innerHTML = md(text); else d.textContent = text;
      log.appendChild(d); log.scrollTop = log.scrollHeight;
      return d;
    }
    function grow() { inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 140) + 'px'; }

    // 답 아래에 「메모지로」·「복사」를 붙인다
    function addActs(el, text) {
      if (!text) return;
      var row = document.createElement('div'); row.className = 'tt-acts';
      if (Pen.hasMemo()) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'tt-act';
        b.textContent = '📝 메모지로';
        b.addEventListener('click', function () {
          Pen.addMemo(text);
          b.textContent = '✓ 붙였습니다'; b.disabled = true;
        });
        row.appendChild(b);
      }
      var c = document.createElement('button'); c.type = 'button'; c.className = 'tt-act';
      c.textContent = '📋 복사';
      c.addEventListener('click', function () {
        var done = function () { c.textContent = '✓ 복사됨'; setTimeout(function () { c.textContent = '📋 복사'; }, 1600); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fb);
        else fb();
        function fb() {
          try {
            var t = document.createElement('textarea'); t.value = text;
            document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); done();
          } catch (e) { c.textContent = '복사 불가'; }
        }
      });
      row.appendChild(c);
      el.appendChild(row);
    }

    // ── 크기 조절 (접기 / 보통 / 크게 + 손잡이 드래그) ──
    function vh(p) { return Math.round((window.innerHeight || 800) * p / 100); }
    function snaps() { return [MIN, vh(46), vh(88)]; }
    function labelFor(h) { var s = snaps(); return h <= s[0] + 30 ? '펼치기' : (h >= s[2] - 30 ? '접기' : '크게'); }
    function setH(h, save) {
      var s = snaps(), max = vh(92);
      h = Math.max(MIN, Math.min(max, Math.round(h)));
      wrap.style.setProperty('--tt-h', h + 'px');
      if (h <= s[0] + 8) wrap.classList.add('tt-min'); else wrap.classList.remove('tt-min');
      szBtn.textContent = labelFor(h);
      if (save !== false) { try { localStorage.setItem('gn_ttH', String(h)); } catch (e) {} }
      return h;
    }
    function curH() {
      if (wrap.getBoundingClientRect) { var r = wrap.getBoundingClientRect().height; if (r) return r; }
      var v = wrap.style.getPropertyValue ? wrap.style.getPropertyValue('--tt-h') : '';
      return parseInt(v, 10) || vh(46);
    }
    function cycle() {
      var s = snaps(), h = curH();
      if (h <= s[0] + 30) setH(s[1]);
      else if (h < s[2] - 30) setH(s[2]);
      else setH(s[0]);
    }

    // 아이패드·폰: 자판이 올라오면 창을 그 위로 띄운다
    var vv = window.visualViewport;
    function liftForKb() {
      if (!vv) return;
      if ((window.innerWidth || 0) >= 1024) { wrap.style.bottom = ''; return; }
      var kb = Math.max(0, Math.round((window.innerHeight || 0) - vv.height - vv.offsetTop));
      wrap.style.bottom = kb > 40 ? kb + 'px' : '';
    }

    function open() {
      var saved = 0; try { saved = parseInt(localStorage.getItem('gn_ttH'), 10) || 0; } catch (e) {}
      setH(saved || vh(46), false);
      wrap.classList.add('on'); fab.style.display = 'none';
      liftForKb();
      setTimeout(function () { if (!inp.disabled) inp.focus(); liftForKb(); }, 80);
      hello();
    }
    function close() {
      wrap.classList.remove('on'); fab.style.display = 'inline-flex';
      wrap.style.bottom = '';
      if (ctl) ctl.abort();
    }

    function lockUI() { inp.disabled = true; send.disabled = true; send.onclick = null; chips.style.display = 'none'; }
    function idleBtn() { send.textContent = '보내기'; send.disabled = false; send.onclick = function () { ask(); }; }
    function busyBtn() { send.textContent = '중단'; send.disabled = false; send.onclick = function () { if (ctl) ctl.abort(); }; }

    // 열었을 때 한 번만 인사 — 키가 없으면 어디서 넣는지 알려 준다
    function hello() {
      if (greeted) return;
      greeted = true;
      if (!hasKey()) {
        lockUI();
        bubble('ai', '**질문하기는 AI API 키가 있어야 씁니다.**\n\n' +
          '- 우측 상단 **⚙️ 설정**에서 키를 넣으면 바로 됩니다\n' +
          '- **Gemini 키는 무료**로 발급됩니다 — aistudio.google.com/apikey\n' +
          '- 키는 이 브라우저에만 저장되고 외부로 보내지 않습니다');
        bubble('ai', '**노트 읽기와 ✏️ 필기는 키 없이 그대로 됩니다.** 키 없이도 공부하실 수 있습니다.');
        return;
      }
      idleBtn();
      bubble('ai', '**무엇이든 물어보세요.** 개념 설명, 짝 개념 비교, 답안 쓰는 법, 문제 출제까지 됩니다.\n\n' +
        '아래 버튼을 누르거나 직접 적어 주세요.');
    }

    function trim() {
      var bytes = 0;
      for (var i = 0; i < turns.length; i++) bytes += turns[i].content.length * 2;
      while (bytes > 90000 && turns.length > 4) {
        bytes -= (turns[0].content.length + turns[1].content.length) * 2;
        turns.splice(0, 2);   // 오래된 주고받기부터 버린다 (지시는 sys 로 따로 나가 있다)
      }
    }

    function ask() {
      if (busy) return;
      var q = inp.value.trim();
      if (!q) return;
      if (!hasKey()) {
        bubble('err', '⚙️ 설정에서 AI API 키를 먼저 등록해 주세요.');
        return;
      }
      bubble('me', q);
      inp.value = ''; grow();
      chips.style.display = 'none';
      turns.push({ role: 'user', content: q });
      trim();

      busy = true;
      var hold = bubble('ai', '');
      hold.className = 'tt-msg tt-think';
      hold.textContent = '생각하는 중';
      var started = false;
      ctl = new AbortController();
      busyBtn();
      tier.textContent = getSettings().provider;

      callChatStream(sys, turns, {
        maxTokens: 3000,
        signal: ctl.signal,
        onText: function (t) {
          if (!started) { started = true; hold.className = 'tt-msg ai'; }
          hold.innerHTML = md(t);
          log.scrollTop = log.scrollHeight;
        }
      }).then(function (r) {
        var text = (r && r.text) || '';
        if (!text.trim()) {
          hold.remove();
          bubble('err', '답이 비어 돌아왔습니다. 질문을 조금 더 구체적으로 적어 주세요.');
          return;
        }
        hold.className = 'tt-msg ai'; hold.innerHTML = md(text);
        turns.push({ role: 'assistant', content: text });
        addActs(hold, text);
        if (r.truncated) bubble('err', '답이 길어 중간에 끊겼습니다. 더 좁혀서 물어보세요.');
      }).catch(function (e) {
        var aborted = (e && (e.name === 'AbortError' || /abort/i.test(String(e.message || ''))));
        if (aborted) {
          if (started) { hold.className = 'tt-msg ai'; }    // 받은 만큼은 남겨 둔다
          else hold.remove();
          return;
        }
        if (!started) hold.remove();
        bubble('err', humanizeError(e));
      }).then(function () {
        busy = false; ctl = null; tier.textContent = '';
        idleBtn();
        log.scrollTop = log.scrollHeight;
      });
    }

    function wire() {
      if (wired) return;
      wired = true;
      grow();
      inp.addEventListener('input', grow);
      szBtn.addEventListener('click', cycle);
      fab.addEventListener('click', open);
      $('ttClose').addEventListener('click', close);
      chips.addEventListener('click', function (e) {
        var b = e.target.closest('.tt-chip');
        if (!b || busy || inp.disabled) return;
        inp.value = b.textContent; grow(); ask();
      });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!busy) ask(); }
      });
      if (vv && vv.addEventListener) {
        vv.addEventListener('resize', liftForKb);
        vv.addEventListener('scroll', liftForKb);
      }
      if (grab.addEventListener && window.PointerEvent) {
        grab.addEventListener('pointerdown', function (e) {
          var startY = e.clientY, startH = curH();
          if (grab.setPointerCapture) grab.setPointerCapture(e.pointerId);
          var move2 = function (ev) { setH(startH - (ev.clientY - startY), false); };
          var up2 = function () {
            grab.removeEventListener('pointermove', move2);
            grab.removeEventListener('pointerup', up2);
            grab.removeEventListener('pointercancel', up2);
            var s = snaps(), h = curH(), best = s[0], d = 1e9;
            for (var i = 0; i < s.length; i++) { var dd = Math.abs(s[i] - h); if (dd < d) { d = dd; best = s[i]; } }
            setH(d < 60 ? best : h);
          };
          grab.addEventListener('pointermove', move2);
          grab.addEventListener('pointerup', up2);
          grab.addEventListener('pointercancel', up2);
          if (e.preventDefault) e.preventDefault();
        });
      }
      fab.classList.add('on');
    }

    return {
      reset: function (subject) {
        fab = $('ttFab'); wrap = $('ttWrap'); log = $('ttLog'); inp = $('ttIn');
        send = $('ttSend'); chips = $('ttChips'); tier = $('ttTier');
        grab = $('ttGrab'); szBtn = $('ttSize');
        if (!fab || !wrap) return;
        wire();

        sys = subject.sys;
        turns = [];
        greeted = false;
        if (ctl) ctl.abort();
        log.innerHTML = '';
        inp.disabled = false; inp.value = ''; grow();
        idleBtn();
        chips.style.display = '';
        chips.innerHTML = '';
        subject.chips.forEach(function (c) {
          var b = document.createElement('button');
          b.type = 'button'; b.className = 'tt-chip'; b.textContent = c;
          chips.appendChild(b);
        });
        if (wrap.classList.contains('on')) hello();   // 열어 둔 상태로 과목을 바꾼 경우
      }
    };
  })();

  /* ─────────────── 인쇄 ─────────────── */

  function printNote() {
    Pen.buildPrintInk();
    document.body.classList.add('print-gnote');
    var clear = function () { document.body.classList.remove('print-gnote'); };
    if (window.onafterprint !== undefined) window.addEventListener('afterprint', clear, { once: true });
    setTimeout(function () { window.print(); setTimeout(clear, 1500); }, 60);
  }

  /* ─────────────── 시작 ─────────────── */

  function init() {
    root = $('gnoteRoot'); sheet = $('gnoteSheet');
    titleEl = $('gnoteTitle'); subEl = $('gnoteSub'); picker = $('gnotePicker');
    if (!root || !sheet || !picker) return;

    var btn = $('gnotePrint');
    if (btn) btn.addEventListener('click', printNote);

    var saved = '';
    try { saved = localStorage.getItem(SUB_KEY) || ''; } catch (e) {}

    var tabBtn = document.querySelector('.tab-btn[data-tab="gnote"]');
    var entered = false;
    function enter() {
      if (!entered) { entered = true; use(saved || GNOTE_SUBJECTS[0].key); }
      else setTimeout(function () { Pen.refresh(); }, 0);   // 숨어 있던 동안 멈춰 있던 캔버스를 다시 맞춘다
    }
    if (tabBtn) tabBtn.addEventListener('click', enter);
    if (root.offsetParent !== null) enter();                // 새로 고쳤을 때 이 탭이 열려 있으면
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
