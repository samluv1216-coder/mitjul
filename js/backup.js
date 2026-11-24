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
