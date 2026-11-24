/* 밑줄 — BYOK 설정 (localStorage) */

// ⚠️ 저장소 키 접두어는 'imyongssok_' 그대로 둔다.
//    앱 이름은 임용쏙 → 밑줄로 바뀌었지만(2026-11-24), 키를 바꾸면
//    기존 사용자의 오답노트·개념노트·학습통계가 통째로 사라진다.
//    브라우저는 키 이름이 다르면 그냥 "없는 값"으로 보기 때문.
const SETTINGS_KEY = 'imyongssok_settings_v1';

const DEFAULT_MODELS = {
  claude: 'claude-sonnet-5',
  gemini: 'gemini-3.8-flash',
  openai: 'gpt-4o',
};

function getSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const s = raw ? JSON.parse(raw) : {};
    return {
      provider: s.provider || 'claude',
      keys: Object.assign({ claude: '', gemini: '', openai: '' }, s.keys || {}),
      models: Object.assign({ claude: '', gemini: '', openai: '' }, s.models || {}),
      verify: s.verify !== false,       // 2단계 출제 검증 (기본 ON)
      useTrends: s.useTrends !== false, // 최신 교육 동향 출제 반영 (기본 ON)
    };
  } catch (e) {
    return { provider: 'claude', keys: { claude: '', gemini: '', openai: '' }, models: { claude: '', gemini: '', openai: '' }, verify: true, useTrends: true };
  }
}

function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

// 모델 ID 자동 보정 (잘못된 입력 방지)
function resolveModel(provider) {
  const s = getSettings();
  let m = (s.models[provider] || '').trim();
  if (!m) return DEFAULT_MODELS[provider];
  if (provider === 'claude' && !/^claude-/.test(m)) return DEFAULT_MODELS.claude;
  if (provider === 'gemini' && !/^gemini-/.test(m)) return DEFAULT_MODELS.gemini;
  return m;
}

function hasKey() {
  const s = getSettings();
  return !!(s.keys[s.provider] || '').trim();
}

/* ---------- 설정에 저장된 옛 모델 이름 자동 비우기 ----------
   ⚠️ 왜 필요한가 — resolveModel 은 저장된 값이 있으면 그걸 기본값보다 우선한다.
      그래서 「모델」 칸에 예전 이름(claude-sonnet-4-6 등)을 직접 적어 뒀다면
      앱의 기본값을 올려도 그 사람은 계속 옛 모델로 간다(쏙에서 겪은 함정).
      게다가 claude-3 계열은 thinking 항목 자체를 못 받아서, 지금 코드가 보내는
      thinking:{type:'disabled'} 때문에 호출이 그냥 실패한다.

   원칙 — "확실히 지난 것"만 비우고 **등급을 내리지는 않는다.**
      · 비움: claude-3 계열 / 4.0·4.1 / sonnet-4-5 / sonnet-4-6
      · 그대로: opus 4.6 이상·5 (비우면 sonnet 으로 내려가므로),
                haiku-4-5(현행·일부러 고를 수 있음), sonnet-5, fable-5,
                그리고 못 알아보는 값(남이 일부러 적은 것일 수 있다)
      비운 뒤에는 칸이 빈 채로 남아 DEFAULT_MODELS 가 적용된다. opus 를 쓰고
      싶으면 칸에 claude-opus-5 를 적으면 된다. */
const STALE_CLAUDE_MODELS = [
  /^claude-3-/,                                   // 3 · 3.5 · 3.7
  /^claude-(sonnet|opus)-4(-1)?(-\d{8})?$/,       // 4.0 · 4.1
  /^claude-sonnet-4-5/,                           // 4.5
  /^claude-sonnet-4-6/,                           // 4.6
];
const MODELFIX_KEY = 'imyongssok_modelfix_v1';

function migrateStaleModel() {
  try {
    const s = getSettings();
    const m = (s.models.claude || '').trim();
    if (!m) return;
    if (!STALE_CLAUDE_MODELS.some(re => re.test(m))) return;
    s.models.claude = '';                     // 비우면 DEFAULT_MODELS.claude 적용
    saveSettings(s);                          // ⚠️ API 키는 그대로 — s 를 통째로 다시 저장
    localStorage.setItem(MODELFIX_KEY, JSON.stringify({ from: m, to: DEFAULT_MODELS.claude }));
    console.log('[밑줄] 설정에 적혀 있던 옛 모델 ' + m + ' → 기본값 ' + DEFAULT_MODELS.claude + ' 로 바꿨습니다.');
  } catch (e) { /* 설정이 깨져 있으면 건드리지 않는다 */ }
}

// 설정을 읽는 쪽(ai.js·app.js)보다 먼저 돌아야 해서 이 파일 로드 시점에 한 번 실행.
// 칸이 비워지면 다음 로드에선 아무것도 안 하므로 여러 번 돌아도 안전하다.
migrateStaleModel();

// 바뀐 걸 알려 줄 문구 (설정 모달에서 한 번 보여 주고 지운다)
function takeModelFixNotice() {
  try {
    const raw = localStorage.getItem(MODELFIX_KEY);
    if (!raw) return '';
    localStorage.removeItem(MODELFIX_KEY);
    const f = JSON.parse(raw);
    return '모델 칸에 적혀 있던 ' + f.from + ' 은(는) 지난 모델이라 비웠습니다 — 이제 ' + f.to + ' 로 붙습니다.';
  } catch (e) { return ''; }
}
