(() => {
  const TOTAL_QUESTIONS = 25;
  const POINTS_PER_CORRECT = 4; // 25問 × 4点 = 100点満点
  // sw.js / version.json / sw-register.js の LOCAL_VERSION と揃える
  const APP_VERSION = "1.0.6";
  const STORAGE_KEY = "rikkuku-scores";
  const AUTO_ENTER_KEY = "rikkuku-auto-enter";
  const HISTORY_WEEKS = 4;
  const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

  const screens = {
    start: document.getElementById("screen-start"),
    quiz: document.getElementById("screen-quiz"),
    result: document.getElementById("screen-result"),
  };

  const els = {
    startBtn: document.getElementById("btn-start"),
    homeBtn: document.getElementById("btn-home"),
    form: document.getElementById("answer-form"),
    input: document.getElementById("answer-input"),
    qLeft: document.getElementById("q-left"),
    qRight: document.getElementById("q-right"),
    progressLabel: document.getElementById("progress-label"),
    progressBar: document.getElementById("progress-bar"),
    feedback: document.getElementById("feedback"),
    feedbackText: document.getElementById("feedback-text"),
    scoreValue: document.getElementById("score-value"),
    correctCount: document.getElementById("correct-count"),
    stamp: document.getElementById("stamp"),
    stampText: document.getElementById("stamp-text"),
    calendar: document.getElementById("calendar"),
    historyRange: document.getElementById("history-range"),
    streak: document.getElementById("streak"),
    combo: document.getElementById("combo"),
    appVersion: document.getElementById("app-version"),
    autoEnter: document.getElementById("auto-enter"),
  };

  if (els.appVersion) {
    els.appVersion.textContent = `v${APP_VERSION}`;
  }

  function loadAutoEnter() {
    try {
      const raw = localStorage.getItem(AUTO_ENTER_KEY);
      if (raw === null) return true;
      return raw === "1";
    } catch {
      return true;
    }
  }

  function saveAutoEnter(enabled) {
    try {
      localStorage.setItem(AUTO_ENTER_KEY, enabled ? "1" : "0");
    } catch {
      // ignore
    }
  }

  let autoEnterEnabled = loadAutoEnter();
  if (els.autoEnter) {
    els.autoEnter.checked = autoEnterEnabled;
    els.autoEnter.addEventListener("change", () => {
      autoEnterEnabled = els.autoEnter.checked;
      saveAutoEnter(autoEnterEnabled);
      els.input.focus({ preventScroll: true });
    });
  }

  /** @type {{ a: number, b: number, answer: number }[]} */
  let queue = [];
  let index = 0;
  let correct = 0;
  let locking = false;

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function toDateKey(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  /** 月曜始まりの週の先頭 */
  function startOfWeekMonday(date) {
    const d = startOfDay(date);
    const day = d.getDay(); // 0=日
    const offset = day === 0 ? -6 : 1 - day;
    return addDays(d, offset);
  }

  function historyWindow(today = new Date()) {
    const weekStart = startOfWeekMonday(today);
    const start = addDays(weekStart, -7 * (HISTORY_WEEKS - 1));
    const end = addDays(weekStart, 6);
    return { start, end };
  }

  function loadScores() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  /** 壊れたエントリだけ除き、全期間の記録は残す */
  function normalizeScores(scores) {
    /** @type {Record<string, { score: number, correct: number }>} */
    const next = {};
    Object.entries(scores).forEach(([key, value]) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(key) && value && typeof value.score === "number") {
        next[key] = {
          score: value.score,
          correct:
            typeof value.correct === "number"
              ? value.correct
              : Math.round(value.score / POINTS_PER_CORRECT),
        };
      }
    });
    return next;
  }

  function saveScores(scores) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
  }

  function recordScore(score, correctCount) {
    const scores = normalizeScores(loadScores());
    const key = toDateKey(new Date());
    const prev = scores[key];
    // 同じ日は高い方を残す
    if (!prev || score > prev.score) {
      scores[key] = { score, correct: correctCount };
      saveScores(scores);
    }
  }

  function stampForScore(score) {
    if (score >= 100) {
      return { kind: "perfect", text: "よくできました", short: "よく" };
    }
    if (score >= 90) {
      return { kind: "almost", text: "あとすこし", short: "あと" };
    }
    return { kind: "try", text: "がんばりましょう", short: "がん" };
  }

  function calcStreak(scores, today = startOfDay(new Date())) {
    const todayKey = toDateKey(today);
    const yesterdayKey = toDateKey(addDays(today, -1));

    // 今日まだ未実施なら昨日から数える（途切れ判定は一昨日まで）
    let cursor = scores[todayKey]
      ? today
      : scores[yesterdayKey]
        ? addDays(today, -1)
        : null;

    if (!cursor) return 0;

    let streak = 0;
    while (scores[toDateKey(cursor)]) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }
    return streak;
  }

  /** 100点の連続。未実施日は無視し、100点未満の実施日で途切れる */
  function calcCombo(scores) {
    const keys = Object.keys(scores).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    let combo = 0;
    for (const key of keys) {
      if (scores[key].score >= 100) {
        combo += 1;
      } else {
        break;
      }
    }
    return combo;
  }

  function renderStreak(scores, today = startOfDay(new Date())) {
    const streak = calcStreak(scores, today);
    const combo = calcCombo(scores);
    if (els.combo) els.combo.textContent = `${combo}コンボ！`;
    els.streak.textContent = `${streak}日れんぞく！`;
  }

  function formatRangeLabel(start, end) {
    const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
    return `${fmt(start)} 〜 ${fmt(end)}`;
  }

  function renderCalendar() {
    const today = startOfDay(new Date());
    const { start, end } = historyWindow(today);
    const scores = normalizeScores(loadScores());

    els.historyRange.textContent = formatRangeLabel(start, end);
    renderStreak(scores, today);
    els.calendar.replaceChildren();

    const todayKey = toDateKey(today);
    const totalDays = HISTORY_WEEKS * 7;

    for (let i = 0; i < totalDays; i += 1) {
      const date = addDays(start, i);
      const key = toDateKey(date);
      const isFuture = date > today;
      const entry = scores[key];
      const stamp = entry ? stampForScore(entry.score) : null;

      const cell = document.createElement("div");
      cell.className = "cal-day";
      cell.setAttribute("role", "gridcell");
      if (key === todayKey) cell.classList.add("is-today");
      if (isFuture) cell.classList.add("is-future");
      if (stamp) cell.classList.add("has-stamp");

      const num = document.createElement("span");
      num.className = "cal-day-num";
      num.textContent = `${date.getMonth() + 1}/${date.getDate()}`;

      const label = `${date.getMonth() + 1}月${date.getDate()}日（${WEEKDAY_LABELS[date.getDay()]}）`;
      if (stamp) {
        cell.setAttribute("aria-label", `${label} ${entry.score}点 ${stamp.text}`);
        const mark = document.createElement("span");
        mark.className = "cal-stamp";
        mark.dataset.kind = stamp.kind;
        mark.textContent = stamp.short;
        mark.setAttribute("aria-hidden", "true");
        const score = document.createElement("span");
        score.className = "cal-score";
        score.textContent = `${entry.score}`;
        score.setAttribute("aria-hidden", "true");
        cell.append(num, mark, score);
      } else {
        cell.setAttribute("aria-label", isFuture ? `${label}（これから）` : `${label} まだない`);
        cell.append(num);
      }

      els.calendar.append(cell);
    }
  }

  function buildPool() {
    const pool = [];
    for (let a = 2; a <= 9; a += 1) {
      for (let b = 2; b <= 9; b += 1) {
        pool.push({ a, b, answer: a * b });
      }
    }
    return pool;
  }

  function shuffle(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function pickQuestions() {
    return shuffle(buildPool()).slice(0, TOTAL_QUESTIONS);
  }

  function showScreen(name) {
    Object.entries(screens).forEach(([key, el]) => {
      const active = key === name;
      el.classList.toggle("is-active", active);
      el.hidden = !active;
    });
  }

  function updateProgress() {
    const current = Math.min(index + 1, TOTAL_QUESTIONS);
    els.progressLabel.textContent = `${current} / ${TOTAL_QUESTIONS}`;
    els.progressBar.style.width = `${(index / TOTAL_QUESTIONS) * 100}%`;
  }

  function clearFeedback() {
    els.feedback.hidden = true;
    els.feedbackText.textContent = "";
    els.feedback.className = "feedback-overlay";
  }

  function expectedDigits(answer) {
    return String(answer).length;
  }

  function showQuestion() {
    const q = queue[index];
    els.qLeft.textContent = String(q.a);
    els.qRight.textContent = String(q.b);
    els.input.value = "";
    els.input.maxLength = expectedDigits(q.answer);
    clearFeedback();
    locking = false;
    updateProgress();
    requestAnimationFrame(() => {
      els.input.focus({ preventScroll: true });
    });
  }

  function finish() {
    const score = correct * POINTS_PER_CORRECT;
    const stamp = stampForScore(score);

    recordScore(score, correct);

    els.scoreValue.textContent = String(score);
    els.correctCount.textContent = String(correct);
    els.stamp.dataset.kind = stamp.kind;
    els.stampText.textContent = stamp.text;
    els.stamp.classList.remove("is-shown");

    showScreen("result");
    playResultSound(stamp.kind);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        els.stamp.classList.add("is-shown");
      });
    });
  }

  function startQuiz() {
    queue = pickQuestions();
    index = 0;
    correct = 0;
    showScreen("quiz");
    showQuestion();
  }

  /** @type {AudioContext | null} */
  let audioCtx = null;

  function getAudioContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioCtx) audioCtx = new AudioCtx();
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function tone(ctx, { frequency, start, duration, type = "sine", gain = 0.18, slideTo }) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    if (slideTo != null) {
      osc.frequency.linearRampToValueAtTime(slideTo, start + duration);
    }
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain, start + 0.02);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  function chord(ctx, freqs, start, duration, gain = 0.08) {
    freqs.forEach((frequency) => {
      tone(ctx, { frequency, start, duration, type: "triangle", gain });
    });
  }

  function playJudgementSound(ok) {
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    if (ok) {
      // ピンポン
      tone(ctx, { frequency: 880, start: t, duration: 0.12, type: "sine", gain: 0.2 });
      tone(ctx, { frequency: 1174.7, start: t + 0.14, duration: 0.18, type: "sine", gain: 0.22 });
      return;
    }

    // ブブー
    tone(ctx, {
      frequency: 180,
      start: t,
      duration: 0.22,
      type: "square",
      gain: 0.08,
      slideTo: 140,
    });
    tone(ctx, {
      frequency: 160,
      start: t + 0.28,
      duration: 0.28,
      type: "square",
      gain: 0.07,
      slideTo: 110,
    });
  }

  function playResultSound(kind) {
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    if (kind === "perfect") {
      // パンパカパーン
      tone(ctx, { frequency: 523.25, start: t, duration: 0.11, type: "triangle", gain: 0.16 });
      tone(ctx, { frequency: 392.0, start: t + 0.12, duration: 0.1, type: "triangle", gain: 0.15 });
      tone(ctx, { frequency: 440.0, start: t + 0.23, duration: 0.1, type: "triangle", gain: 0.15 });
      tone(ctx, { frequency: 493.88, start: t + 0.34, duration: 0.1, type: "triangle", gain: 0.15 });
      chord(ctx, [523.25, 659.25, 783.99], t + 0.46, 0.55, 0.1);
      return;
    }

    if (kind === "almost") {
      // パパーン（Win95起動音っぽい明るい和音）
      chord(ctx, [261.63, 329.63, 392.0], t, 0.28, 0.09);
      chord(ctx, [329.63, 415.3, 523.25], t + 0.3, 0.7, 0.1);
      tone(ctx, { frequency: 659.25, start: t + 0.32, duration: 0.65, type: "sine", gain: 0.08 });
      return;
    }

    // がんばりましょう：テンテンテン…
    tone(ctx, { frequency: 349.23, start: t, duration: 0.12, type: "triangle", gain: 0.12 });
    tone(ctx, { frequency: 349.23, start: t + 0.22, duration: 0.12, type: "triangle", gain: 0.11 });
    tone(ctx, { frequency: 349.23, start: t + 0.44, duration: 0.12, type: "triangle", gain: 0.1 });
    tone(ctx, {
      frequency: 277.18,
      start: t + 0.7,
      duration: 0.55,
      type: "triangle",
      gain: 0.09,
      slideTo: 220,
    });
  }

  function flashFeedback(ok, message, { sound = true } = {}) {
    els.feedbackText.textContent = message;
    els.feedback.className = `feedback-overlay ${ok ? "is-correct" : "is-wrong"}`;
    els.feedback.hidden = false;
    if (sound) playJudgementSound(ok);
  }

  function advanceAfterAnswer() {
    clearFeedback();
    index += 1;
    if (index >= TOTAL_QUESTIONS) {
      finish();
    } else {
      showQuestion();
    }
  }

  function submitAnswer(event) {
    event.preventDefault();
    if (locking) return;

    const raw = els.input.value.trim();
    if (!/^\d+$/.test(raw)) {
      flashFeedback(false, "数字でこたえてね", { sound: false });
      window.setTimeout(() => {
        clearFeedback();
        els.input.focus({ preventScroll: true });
      }, 2000);
      return;
    }

    locking = true;
    const value = Number(raw);
    const q = queue[index];
    const ok = value === q.answer;

    els.progressBar.style.width = `${((index + 1) / TOTAL_QUESTIONS) * 100}%`;

    if (ok) {
      correct += 1;
      playJudgementSound(true);
      // 正解は音のみ。ピンポンが鳴る分だけ待って次へ
      window.setTimeout(advanceAfterAnswer, 350);
      return;
    }

    flashFeedback(false, `ざんねん…\n${q.a}×${q.b}=${q.answer}`);
    window.setTimeout(advanceAfterAnswer, 2000);
  }

  els.input.addEventListener("beforeinput", (event) => {
    if (event.inputType && event.inputType.startsWith("delete")) return;
    if (event.inputType === "insertLineBreak") return;
    const data = event.data ?? "";
    if (data && !/^\d+$/.test(data)) {
      event.preventDefault();
    }
  });

  els.input.addEventListener("input", () => {
    if (locking || !queue[index]) return;

    const digits = expectedDigits(queue[index].answer);
    els.input.value = els.input.value.replace(/\D/g, "").slice(0, digits);

    if (autoEnterEnabled && els.input.value.length === digits) {
      els.form.requestSubmit();
    }
  });

  function goHome() {
    clearFeedback();
    queue = [];
    index = 0;
    correct = 0;
    locking = false;
    els.stamp.classList.remove("is-shown");
    renderCalendar();
    showScreen("start");
  }

  els.startBtn.addEventListener("click", () => {
    getAudioContext();
    startQuiz();
  });
  els.homeBtn.addEventListener("click", goHome);
  els.form.addEventListener("submit", submitAnswer);

  renderCalendar();
})();
