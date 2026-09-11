(function () {
  "use strict";

  /* ============ Persistência ============ */

  const STORAGE_DECK = "hanziQuiz.deck.v1";
  const STORAGE_STATS = "hanziQuiz.stats.v1";

  function loadDeck() {
    try {
      const raw = localStorage.getItem(STORAGE_DECK);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveDeck() {
    localStorage.setItem(STORAGE_DECK, JSON.stringify(deck));
  }

  function loadStats() {
    try {
      const raw = localStorage.getItem(STORAGE_STATS);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveStats() {
    localStorage.setItem(STORAGE_STATS, JSON.stringify(stats));
  }

  let deck = loadDeck();       // [{hanzi, pinyin, pt}]
  let stats = loadStats();     // { [hanzi]: {correct, wrong} }

  /* ============ CSV parsing ============ */

  function parseCsvLine(line) {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else { inQuotes = false; }
        } else {
          cur += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        out.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  }

  const HEADER_WORDS = ["hanzi", "ideograma", "caracter", "carácter", "汉字", "漢字", "字"];

  function parseCsv(text) {
    const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return [];
    const rows = lines.map(parseCsvLine);
    let start = 0;
    const firstCellLower = (rows[0][0] || "").toLowerCase();
    if (HEADER_WORDS.includes(firstCellLower)) start = 1;

    const result = [];
    for (let i = start; i < rows.length; i++) {
      const r = rows[i];
      if (r.length < 3) continue;
      const hanzi = (r[0] || "").trim();
      const pinyin = (r[1] || "").trim();
      const pt = (r[2] || "").trim();
      if (!hanzi) continue;
      result.push({ hanzi, pinyin, pt });
    }
    return result;
  }

  function toCsv(rows) {
    const esc = (v) => {
      if (v == null) return "";
      const s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = ["ideograma,pronuncia,traducao"];
    rows.forEach((r) => lines.push([esc(r.hanzi), esc(r.pinyin), esc(r.pt)].join(",")));
    return lines.join("\n");
  }

  function mergeImport(rows, mode) {
    let added = 0, updated = 0;

    if (mode === "replace") {
      const dedup = new Map();
      rows.forEach((r) => dedup.set(r.hanzi, r));
      deck = Array.from(dedup.values());
      added = deck.length;
    } else {
      rows.forEach((r) => {
        const idx = deck.findIndex((d) => d.hanzi === r.hanzi);
        if (idx >= 0) {
          if (deck[idx].pinyin !== r.pinyin || deck[idx].pt !== r.pt) {
            deck[idx] = { ...deck[idx], pinyin: r.pinyin, pt: r.pt };
            updated++;
          }
        } else {
          deck.push(r);
          added++;
        }
      });
    }
    saveDeck();
    return { added, updated };
  }

  /* ============ Utilidades ============ */

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function el(id) { return document.getElementById(id); }

  /* ============ Navegação de abas ============ */

  const tabButtons = document.querySelectorAll(".tab-btn");
  const views = document.querySelectorAll(".view");

  function goToView(name) {
    tabButtons.forEach((b) => {
      const active = b.dataset.view === name;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    });
    views.forEach((v) => v.classList.toggle("is-active", v.id === "view-" + name));
    if (name === "quiz") refreshQuizView();
    if (name === "data") renderDataTable();
    if (name === "stats") renderStats();
  }

  tabButtons.forEach((b) => b.addEventListener("click", () => goToView(b.dataset.view)));
  document.querySelectorAll("[data-goto]").forEach((b) =>
    b.addEventListener("click", () => goToView(b.dataset.goto))
  );

  /* ============ Quiz ============ */

  const FIELD_LABEL = {
    hanzi: "Ideograma",
    pinyin: "Pronúncia (pinyin)",
    pt: "Tradução (português)",
  };
  const ANSWER_VERB = {
    hanzi: "Escolha o ideograma",
    pinyin: "Escolha a pronúncia",
    pt: "Escolha a tradução",
  };

  let quizMode = "all";       // 'all' | 'errors'
  let quizPool = [];          // shuffled remaining words for current round
  let currentQuestion = null; // {word, promptField, answerField, correct}
  let score = { correct: 0, total: 0 };
  let streak = 0;

  function currentSource() {
    if (quizMode === "errors") {
      return deck.filter((w) => (stats[w.hanzi] && stats[w.hanzi].wrong > 0));
    }
    return deck;
  }

  function refillPool() {
    quizPool = shuffle(currentSource());
  }

  function refreshQuizView() {
    const empty = el("quiz-empty");
    const body = el("quiz-body");
    if (deck.length === 0) {
      empty.hidden = false;
      body.hidden = true;
      return;
    }
    empty.hidden = true;
    body.hidden = false;
    if (!currentQuestion) {
      refillPool();
      nextQuestion();
    }
  }

  function recordStat(hanzi, correct) {
    if (!stats[hanzi]) stats[hanzi] = { correct: 0, wrong: 0 };
    if (correct) stats[hanzi].correct++;
    else stats[hanzi].wrong++;
    saveStats();
  }

  function nextQuestion() {
    el("feedback").textContent = "";
    el("feedback").className = "feedback";

    const source = currentSource();
    if (source.length === 0) {
      el("options").innerHTML = "";
      el("prompt-display").textContent = "—";
      el("prompt-label").textContent = "Sem palavras nesse modo";
      el("answer-label").textContent = quizMode === "errors"
        ? "Você ainda não errou nenhuma palavra neste modo."
        : "Cadastre palavras na aba Dados.";
      currentQuestion = null;
      return;
    }
    if (source.length < 4) {
      el("answer-label").textContent = "Cadastre pelo menos 4 palavras para ter 4 opções por pergunta.";
    }

    if (quizPool.length === 0) refillPool();
    const word = quizPool.pop();

    const fields = ["hanzi", "pinyin", "pt"];
    const promptField = fields[Math.floor(Math.random() * 3)];
    const remaining = fields.filter((f) => f !== promptField);
    const answerField = remaining[Math.floor(Math.random() * remaining.length)];

    const correct = word[answerField];

    // distratores: valores únicos do mesmo campo, de outras palavras
    const seenValues = new Set([correct]);
    const candidates = shuffle(source.filter((w) => w.hanzi !== word.hanzi));
    const distractors = [];
    for (const c of candidates) {
      const v = c[answerField];
      if (!v || seenValues.has(v)) continue;
      seenValues.add(v);
      distractors.push(v);
      if (distractors.length === 3) break;
    }

    const options = shuffle([correct, ...distractors]);

    currentQuestion = { word, promptField, answerField, correct };

    el("prompt-label").textContent = FIELD_LABEL[promptField];
    el("prompt-display").lang = promptField === "hanzi" || promptField === "pinyin" ? "zh" : "pt";
    el("prompt-display").textContent = word[promptField];
    el("answer-label").textContent = ANSWER_VERB[answerField];

    const optsEl = el("options");
    optsEl.innerHTML = "";
    const keys = ["1", "2", "3", "4"];
    options.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.className = "option-btn";
      btn.type = "button";
      btn.lang = answerField === "hanzi" || answerField === "pinyin" ? "zh" : "pt";
      btn.innerHTML = `<span class="opt-key">${keys[i] || ""}</span><span>${escapeHtml(opt)}</span>`;
      btn.addEventListener("click", () => answerQuestion(opt, btn));
      optsEl.appendChild(btn);
    });
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function answerQuestion(selected, btnEl) {
    if (!currentQuestion) return;
    const { word, correct } = currentQuestion;
    const isCorrect = selected === correct;

    document.querySelectorAll(".option-btn").forEach((b) => {
      b.disabled = true;
      const label = b.querySelector("span:last-child").textContent;
      if (label === correct) b.classList.add("is-correct");
    });
    if (!isCorrect) btnEl.classList.add("is-wrong");

    score.total++;
    if (isCorrect) { score.correct++; streak++; }
    else { streak = 0; }
    recordStat(word.hanzi, isCorrect);

    const fb = el("feedback");
    if (isCorrect) {
      fb.textContent = "Certo!";
      fb.className = "feedback is-correct";
    } else {
      fb.textContent = `Não foi dessa vez — a resposta certa era "${correct}".`;
      fb.className = "feedback is-wrong";
    }

    el("score-correct").textContent = score.correct;
    el("score-total").textContent = score.total;
    el("streak-count").textContent = streak;

    currentQuestion = { ...currentQuestion, answered: true };
  }

  el("next-btn").addEventListener("click", () => {
    if (currentQuestion && !currentQuestion.answered) return;
    nextQuestion();
  });
  el("skip-btn").addEventListener("click", () => {
    nextQuestion();
  });

  document.querySelectorAll(".mode-btn").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".mode-btn").forEach((x) => {
        x.classList.remove("is-active");
        x.setAttribute("aria-checked", "false");
      });
      b.classList.add("is-active");
      b.setAttribute("aria-checked", "true");
      quizMode = b.dataset.mode;
      currentQuestion = null;
      refillPool();
      nextQuestion();
    });
  });

  document.addEventListener("keydown", (e) => {
    if (!el("view-quiz").classList.contains("is-active")) return;
    if (["1", "2", "3", "4"].includes(e.key)) {
      const idx = Number(e.key) - 1;
      const btns = document.querySelectorAll(".option-btn");
      if (btns[idx] && !btns[idx].disabled) btns[idx].click();
    } else if (e.key === "Enter" || e.key === " ") {
      if (currentQuestion && currentQuestion.answered) {
        e.preventDefault();
        nextQuestion();
      }
    }
  });

  /* ============ Dados (import / tabela) ============ */

  el("csv-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    el("file-drop-label").textContent = file.name;
    const reader = new FileReader();
    reader.onload = () => runImport(String(reader.result));
    reader.readAsText(file, "utf-8");
  });

  el("paste-import-btn").addEventListener("click", () => {
    const text = el("csv-paste").value;
    if (text.trim()) runImport(text);
  });

  function getImportMode() {
    const checked = document.querySelector('input[name="import-mode"]:checked');
    return checked ? checked.value : "merge";
  }

  function runImport(text) {
    const rows = parseCsv(text);
    if (rows.length === 0) {
      el("import-result").textContent = "Não encontrei linhas válidas nesse CSV.";
      return;
    }
    const { added, updated } = mergeImport(rows, getImportMode());
    el("import-result").textContent =
      `Importado: ${added} nova(s), ${updated} atualizada(s). Total agora: ${deck.length}.`;
    currentQuestion = null;
    renderDataTable();
  }

  function renderDataTable() {
    el("word-count").textContent = deck.length;
    const tbody = el("data-tbody");
    tbody.innerHTML = "";
    deck.forEach((w, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(w.hanzi)}</td>
        <td>${escapeHtml(w.pinyin)}</td>
        <td>${escapeHtml(w.pt)}</td>
        <td class="row-actions">
          <button class="edit-btn" data-i="${i}">editar</button>
          <button class="delete-btn" data-i="${i}">excluir</button>
        </td>`;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll(".delete-btn").forEach((b) =>
      b.addEventListener("click", () => {
        const i = Number(b.dataset.i);
        deck.splice(i, 1);
        saveDeck();
        currentQuestion = null;
        renderDataTable();
      })
    );
    tbody.querySelectorAll(".edit-btn").forEach((b) =>
      b.addEventListener("click", () => editRow(Number(b.dataset.i)))
    );
  }

  function editRow(i) {
    const w = deck[i];
    const tr = el("data-tbody").children[i];
    tr.innerHTML = `
      <td><input type="text" value="${escapeHtml(w.hanzi)}" data-f="hanzi"></td>
      <td><input type="text" value="${escapeHtml(w.pinyin)}" data-f="pinyin"></td>
      <td><input type="text" value="${escapeHtml(w.pt)}" data-f="pt"></td>
      <td class="row-actions">
        <button class="save-btn">salvar</button>
        <button class="cancel-btn">cancelar</button>
      </td>`;
    tr.querySelector(".save-btn").addEventListener("click", () => {
      const hanzi = tr.querySelector('[data-f="hanzi"]').value.trim();
      const pinyin = tr.querySelector('[data-f="pinyin"]').value.trim();
      const pt = tr.querySelector('[data-f="pt"]').value.trim();
      if (!hanzi) return;
      deck[i] = { hanzi, pinyin, pt };
      saveDeck();
      currentQuestion = null;
      renderDataTable();
    });
    tr.querySelector(".cancel-btn").addEventListener("click", renderDataTable);
  }

  el("add-row-btn").addEventListener("click", () => {
    deck.push({ hanzi: "", pinyin: "", pt: "" });
    saveDeck();
    renderDataTable();
    editRow(deck.length - 1);
  });

  el("export-btn").addEventListener("click", () => {
    const csv = toCsv(deck);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hanzi-deck.csv";
    a.click();
    URL.revokeObjectURL(url);
  });

  el("clear-all-btn").addEventListener("click", () => {
    if (!confirm("Apagar todas as palavras cadastradas? Isso não afeta as estatísticas.")) return;
    deck = [];
    saveDeck();
    currentQuestion = null;
    renderDataTable();
  });

  /* ============ Estatísticas ============ */

  function renderStats() {
    el("stat-total-words").textContent = deck.length;
    el("stat-total-answers").textContent = score.total;
    el("stat-accuracy").textContent = score.total
      ? Math.round((score.correct / score.total) * 100) + "%"
      : "—";

    const tbody = el("stats-tbody");
    tbody.innerHTML = "";
    const rows = deck
      .map((w) => ({ w, s: stats[w.hanzi] || { correct: 0, wrong: 0 } }))
      .filter((r) => r.s.correct > 0 || r.s.wrong > 0)
      .sort((a, b) => b.s.wrong - a.s.wrong || b.s.correct - a.s.correct);

    el("stats-empty-hint").hidden = rows.length > 0;

    rows.forEach(({ w, s }) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(w.hanzi)}</td>
        <td>${escapeHtml(w.pinyin)}</td>
        <td>${escapeHtml(w.pt)}</td>
        <td>${s.correct}</td>
        <td>${s.wrong}</td>`;
      tbody.appendChild(tr);
    });
  }

  el("reset-stats-btn").addEventListener("click", () => {
    if (!confirm("Zerar todas as estatísticas de acertos e erros?")) return;
    stats = {};
    saveStats();
    score = { correct: 0, total: 0 };
    streak = 0;
    el("score-correct").textContent = 0;
    el("score-total").textContent = 0;
    el("streak-count").textContent = 0;
    renderStats();
  });

  /* ============ Início ============ */

  renderDataTable();
  refreshQuizView();
})();
