/* ==========================================================
   밑줄 — 학습 기록 내보내기 / 가져오기

   왜 필요한가: 브라우저 저장소는 "주소마다 따로"다. 그래서
   ① 주소가 바뀌거나(임용쏙 → 밑줄로 개명하며 주소도 바뀜)
   ② 다른 기기·브라우저에서 이어 하거나
   ③ 브라우저를 정리하면
   오답노트·개념노트·학습통계·필기가 통째로 사라진다. 그동안 이 앱에는
   백업 수단이 아예 없었다.

   ⚠️ API 키는 일부러 빼고 내보낸다. 파일이 메일·메신저로 돌아다닐 수 있어서다.
      새 기기에서는 설정에 키만 한 번 다시 넣으면 된다.
   ========================================================== */

// 이 앱이 쓰는 저장소 키는 전부 이 접두어로 시작한다
// (imyongssok_ 는 옛 이름 시절 키 — 바꾸면 기존 기록이 날아가므로 그대로 둔다)
const BACKUP_PREFIX = /^(imyongssok_|gn_)/;

function collectBackup() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !BACKUP_PREFIX.test(k)) continue;
    data[k] = localStorage.getItem(k);
  }
  // 설정에서 API 키만 지운다 (나머지 설정 — 제공자·모델·토글 — 은 남긴다)
  if (data[SETTINGS_KEY]) {
    try {
      const s = JSON.parse(data[SETTINGS_KEY]);
      if (s && s.keys) s.keys = { claude: '', gemini: '', openai: '' };
      data[SETTINGS_KEY] = JSON.stringify(s);
    } catch (e) { delete data[SETTINGS_KEY]; }
  }
  return data;
}

// 무엇이 얼마나 들었는지 사람이 읽을 수 있게
function backupSummary(data) {
  const n = key => { try { const v = JSON.parse(data[key] || 'null'); return Array.isArray(v) ? v.length : (v ? Object.keys(v).length : 0); } catch (e) { return 0; } };
  const inks = Object.keys(data).filter(k => /^gn_ink_/.test(k));
  let strokes = 0, memos = 0;
  inks.forEach(k => { try { strokes += (JSON.parse(data[k]).s || []).length; } catch (e) {} });
  Object.keys(data).filter(k => /^gn_memo_/.test(k)).forEach(k => { try { memos += (JSON.parse(data[k]).m || []).length; } catch (e) {} });
  const parts = [];
  const notes = n('imyongssok_notes_v1'); if (notes) parts.push('오답노트 ' + notes + '문항');
  const con = n('imyongssok_concepts_v1'); if (con) parts.push('개념노트 ' + con + '주제');
  const st = n('imyongssok_stats_v1'); if (st) parts.push('학습통계 ' + st + '건');
  if (strokes) parts.push('필기 ' + strokes + '획');
  if (memos) parts.push('메모지 ' + memos + '장');
  return parts.length ? parts.join(' · ') : '아직 쌓인 기록이 없습니다';
}

function exportBackup() {
  const data = collectBackup();
  const keys = Object.keys(data);
  if (!keys.length) { alert('내보낼 기록이 없습니다.'); return; }
  const blob = new Blob([JSON.stringify({ app: 'mitjul', v: 1, savedAt: new Date().toISOString(), data }, null, 1)],
    { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date();
  const pad = x => String(x).padStart(2, '0');
  a.href = url;
  a.download = `밑줄_학습기록_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('backupResult').textContent = '✅ 내보냈습니다 — ' + backupSummary(data) +
    '\n(API 키는 안전을 위해 빠져 있습니다)';
}

/* ──────────────────────────────────────────────────────────
   옛 주소 → 새 주소 한 번에 옮기기

   파일을 내려받았다 다시 올리는 게 번거로워서 만든 길.
   옛 주소에서 버튼을 누르면 기록을 주소 뒤 `#` 조각에 실어 새 주소로 넘어가고,
   새 주소가 그걸 읽어 저장한 뒤 주소를 즉시 깨끗하게 지운다.

   ⚠️ 처음엔 창을 새로 열어 postMessage 로 건네려 했는데 그만뒀다.
      팝업이 막히거나, 어떤 환경에서는 window.open 이 새 창을 띄우지 않고
      **같은 탭을 그냥 이동**시켜 버린다(실제로 겪음). 그러면 opener 가 없어
      주고받기가 조용히 실패하고 옛 탭까지 사라진다.
   ⚠️ iframe 으로 남의 주소 저장소를 읽는 방법도 안 된다 — 요즘 브라우저는
      끼워 넣은 iframe 의 저장소를 따로 떼어 둬서(storage partitioning) 빈 값이 온다.
   `#` 조각은 서버로 전송되지 않으므로 기록이 밖으로 새지 않는다(API 키는 애초에 빠져 있다).
   ────────────────────────────────────────────────────────── */
const HANDOFF_OLD = 'imyong-ssok.samluv.workers.dev';
const HANDOFF_NEW = 'mitjul.samluv.workers.dev';

// 이 창이 보내는 쪽인지 받는 쪽인지
// (localhost 는 시험용 — 8803 을 옛 주소, 8802 를 새 주소로 본다)
function handoffRole() {
  const h = location.hostname, p = location.port;
  if (h === HANDOFF_OLD) return 'old';
  if (h === HANDOFF_NEW) return 'new';
  if (h === 'localhost' || h === '127.0.0.1') {
    if (p === '8803') return 'old';
    if (p === '8802') return 'new';
  }
  return null;
}
function handoffPeerOrigin(role) {
  const h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return location.protocol + '//' + h + ':' + (role === 'old' ? '8802' : '8803');
  return 'https://' + (role === 'old' ? HANDOFF_NEW : HANDOFF_OLD);
}

const HANDOFF_DONE_KEY = 'gn_handoff_done_v1';
const HANDOFF_MAX = 1500000;   // 주소에 실을 수 있는 현실적인 한계 (약 1.5MB)

function startHandoff(statusEl) {
  const data = collectBackup();
  if (!Object.keys(data).length) { statusEl.textContent = '옮길 기록이 없습니다.'; return; }

  const payload = encodeURIComponent(JSON.stringify(data));
  if (payload.length > HANDOFF_MAX) {
    statusEl.textContent = '❌ 기록이 너무 커서(주로 필기) 이 방법으로는 못 옮깁니다.\n' +
      '아래 ⚙️ 설정 → 「⬇️ 내보내기」로 파일을 받아 새 주소에서 「⬆️ 가져오기」 해 주세요.';
    return;
  }
  // 넘어간 뒤 돌아오더라도 안내줄이 다시 뜨지 않게 미리 표시해 둔다
  try { localStorage.setItem(HANDOFF_DONE_KEY, new Date().toISOString()); } catch (e) {}
  statusEl.textContent = '새 주소로 넘어갑니다…';
  location.href = handoffPeerOrigin('old') + '/#handoff=' + payload;
}

// 받는 쪽 — 주소 뒤에 #handoff= 가 붙어 들어왔을 때만 동작한다
function listenHandoff() {
  if (handoffRole() !== 'new') return;
  const m = /^#handoff=([\s\S]+)$/.exec(location.hash || '');
  if (!m) return;

  // 주소를 먼저 지운다 — 새로 고침하거나 주소를 공유해도 기록이 따라다니지 않게
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}

  let data = null;
  try { data = JSON.parse(decodeURIComponent(m[1])); } catch (e) {}
  if (!data || typeof data !== 'object') { showHandoffResult(null); return; }

  let n = 0;
  for (const k of Object.keys(data)) {
    if (!BACKUP_PREFIX.test(k)) continue;            // 엉뚱한 키는 거른다
    if (k === SETTINGS_KEY && hasKey()) continue;    // 이미 키를 넣어 뒀으면 설정은 건드리지 않는다
    try { localStorage.setItem(k, data[k]); n++; } catch (e) {
      showHandoffResult(null, '저장 공간이 모자랍니다 (' + n + '개까지 넣었습니다).');
      return;
    }
  }
  showHandoffResult(backupSummary(collectBackup()));
}

function showHandoffResult(summary, err) {
  const bar = document.getElementById('moveBar');
  if (!bar) return;
  bar.classList.remove('hidden');
  document.querySelector('.move-acts').classList.add('hidden');
  const t = document.querySelector('.move-text');   // 아래에서 통째로 갈아 끼운다
  t.innerHTML = err || !summary
    ? '<b>❌ 기록을 옮기지 못했습니다</b><br><small>' +
      (err || '넘어온 내용을 읽을 수 없었습니다.') +
      ' 옛 주소에서 ⚙️ 설정 → 「⬇️ 내보내기」로 파일을 받아 여기서 「⬆️ 가져오기」 해 주세요.</small>'
    : '<b>✅ 기록을 옮겼습니다</b> — ' + summary +
      '<br><small>API 키는 안전을 위해 넘어오지 않습니다. ⚙️ 설정에서 한 번만 다시 넣어 주세요. ' +
      '옛 주소의 기록도 그대로 남아 있습니다.</small>';
}

// 옛 주소에 기록이 남아 있으면 위쪽에 안내줄을 띄운다
function initMoveBar() {
  const bar = document.getElementById('moveBar');
  if (!bar || handoffRole() !== 'old') return;
  let moved = null;
  try { moved = localStorage.getItem(HANDOFF_DONE_KEY); } catch (e) {}
  if (moved) return;
  if (!Object.keys(collectBackup()).length) return;
  document.getElementById('moveSummary').textContent = backupSummary(collectBackup());
  bar.classList.remove('hidden');
  document.getElementById('btnMoveNow').addEventListener('click', () => startHandoff(document.getElementById('moveStatus')));
  document.getElementById('btnMoveLater').addEventListener('click', () => {
    bar.classList.add('hidden');
  });
}

function importBackup(file) {
  const out = $('backupResult');
  const r = new FileReader();
  r.onload = () => {
    let o;
    try { o = JSON.parse(r.result); } catch (e) { out.textContent = '❌ 읽을 수 없는 파일입니다.'; return; }
    const data = o && o.data;
    if (!data || typeof data !== 'object' || !Object.keys(data).length) {
      out.textContent = '❌ 학습 기록이 들어 있지 않은 파일입니다.';
      return;
    }
    const bad = Object.keys(data).filter(k => !BACKUP_PREFIX.test(k));
    if (bad.length) { out.textContent = '❌ 이 앱의 기록 파일이 아닙니다.'; return; }

    const now = backupSummary(collectBackup());
    const incoming = backupSummary(data);
    if (!confirm(
      '가져올 기록 — ' + incoming + '\n' +
      '지금 이 브라우저 — ' + now + '\n\n' +
      '⚠️ 같은 항목은 파일 내용으로 덮어씁니다. 되돌릴 수 없습니다.\n계속할까요?'
    )) { out.textContent = '취소했습니다.'; return; }

    // 설정은 통째로 덮어쓰면 지금 넣어 둔 API 키까지 지워진다 → 키는 지킨다
    let keep = null;
    try { keep = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch (e) {}
    let n = 0;
    for (const k of Object.keys(data)) {
      try { localStorage.setItem(k, data[k]); n++; } catch (e) {
        out.textContent = '❌ 저장 공간이 모자랍니다 (' + n + '개까지 넣었습니다).';
        return;
      }
    }
    if (keep && keep.keys) {
      try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        s.keys = keep.keys;
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
      } catch (e) {}
    }
    out.textContent = '✅ 가져왔습니다 — ' + incoming + '\n화면을 새로 고칩니다…';
    setTimeout(() => location.reload(), 1200);
  };
  r.onerror = () => { out.textContent = '❌ 파일을 읽지 못했습니다.'; };
  r.readAsText(file);
}
