(() => {
  "use strict";

  const GRID = 24;
  const ROUNDS = 10;

  const DIFFICULTIES = {
    easy: {
      label: "EASY",
      holdMs: 5000,
      optionCount: 3,
      noiseLitProb: 0.32,
      recallMs: 2800,
      scatterMs: 750,
    },
    medium: {
      label: "MEDIUM",
      holdMs: 3000,
      optionCount: 4,
      noiseLitProb: 0.52,
      recallMs: 2600,
      scatterMs: 650,
    },
    hard: {
      label: "HARD",
      holdMs: 1500,
      optionCount: 4,
      noiseLitProb: 0.72,
      recallMs: 2200,
      scatterMs: 520,
    },
  };

  const PALETTE = {
    c: "#64c8ff",
    m: "#ff64d8",
    y: "#ffff00",
    g: "#00ff88",
    w: "#ffffff",
    a: "#ffaa00",
  };

  const EMOJI_BY_COLOR = {
    c: "🟦",
    m: "🟪",
    y: "🟨",
    g: "🟩",
    w: "⬜",
    a: "🟧",
  };

  const $ = (sel) => document.querySelector(sel);

  const screenTitle = $("#screenTitle");
  const screenGame = $("#screenGame");
  const screenEnd = $("#screenEnd");

  const roundText = $("#roundText");
  const scoreText = $("#scoreText");
  const statusText = $("#statusText");

  const choicesEl = $("#choices");
  const choiceButtons = Array.from(document.querySelectorAll(".choice"));

  const finalText = $("#finalText");
  const shareText = $("#shareText");
  const copyBtn = $("#copyBtn");
  const againBtn = $("#againBtn");
  const copyHint = $("#copyHint");

  const canvas = $("#gridCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });

  function clamp01(x) {
    return Math.max(0, Math.min(1, x));
  }

  function easeInOutCubic(t) {
    if (t < 0.5) return 4 * t * t * t;
    return 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function randInt(n) {
    return Math.floor(Math.random() * n);
  }

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function makeEmptyGrid() {
    return new Array(GRID * GRID).fill(null);
  }

  function idx(x, y) {
    return y * GRID + x;
  }

  function inBounds(x, y) {
    return x >= 0 && x < GRID && y >= 0 && y < GRID;
  }

  function setPx(grid, x, y, colorKey) {
    if (!inBounds(x, y)) return;
    grid[idx(x, y)] = colorKey;
  }

  function getPx(grid, x, y) {
    if (!inBounds(x, y)) return null;
    return grid[idx(x, y)];
  }

  function drawRect(grid, x0, y0, w, h, colorKey) {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) setPx(grid, x, y, colorKey);
    }
  }

  function drawLine(grid, x0, y0, x1, y1, colorKey) {
    let dx = Math.abs(x1 - x0);
    let sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0);
    let sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    while (true) {
      setPx(grid, x, y, colorKey);
      if (x === x1 && y === y1) break;
      let e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  function drawDisk(grid, cx, cy, r, colorKey) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (!inBounds(x, y)) continue;
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r * r) setPx(grid, x, y, colorKey);
      }
    }
  }

  function drawRing(grid, cx, cy, rOuter, rInner, colorKey) {
    const ro2 = rOuter * rOuter;
    const ri2 = rInner * rInner;
    for (let y = cy - rOuter; y <= cy + rOuter; y++) {
      for (let x = cx - rOuter; x <= cx + rOuter; x++) {
        if (!inBounds(x, y)) continue;
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 <= ro2 && d2 >= ri2) setPx(grid, x, y, colorKey);
      }
    }
  }

  function drawTriangleFilled(grid, ax, ay, bx, by, cx, cy, colorKey) {
    const minX = Math.max(0, Math.min(ax, bx, cx));
    const maxX = Math.min(GRID - 1, Math.max(ax, bx, cx));
    const minY = Math.max(0, Math.min(ay, by, cy));
    const maxY = Math.min(GRID - 1, Math.max(ay, by, cy));

    function sign(px, py, x1, y1, x2, y2) {
      return (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
    }

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const d1 = sign(x, y, ax, ay, bx, by);
        const d2 = sign(x, y, bx, by, cx, cy);
        const d3 = sign(x, y, cx, cy, ax, ay);
        const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
        const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
        if (!(hasNeg && hasPos)) setPx(grid, x, y, colorKey);
      }
    }
  }

  function floodErase(grid, colorKeyToErase, xStart, yStart) {
    const target = getPx(grid, xStart, yStart);
    if (target !== colorKeyToErase) return;
    const stack = [[xStart, yStart]];
    while (stack.length) {
      const [x, y] = stack.pop();
      if (!inBounds(x, y)) continue;
      if (getPx(grid, x, y) !== colorKeyToErase) continue;
      setPx(grid, x, y, null);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }

  function dominantColorKey(grid) {
    const counts = new Map();
    for (const c of grid) {
      if (!c) continue;
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    let best = "c";
    let bestCount = -1;
    for (const [k, v] of counts.entries()) {
      if (v > bestCount) {
        best = k;
        bestCount = v;
      }
    }
    return best;
  }

  function makeSpec(name, buildFn) {
    const grid = buildFn();
    return { name, grid, domColor: dominantColorKey(grid) };
  }

  function buildApple() {
    const g = makeEmptyGrid();
    drawDisk(g, 12, 13, 6, "m");
    drawDisk(g, 9, 12, 4, "m");
    drawDisk(g, 15, 12, 4, "m");
    drawRect(g, 11, 5, 2, 4, "a");
    drawTriangleFilled(g, 13, 6, 18, 9, 13, 10, "g");
    drawLine(g, 13, 7, 17, 9, "g");
    floodErase(g, "m", 12, 18);
    return g;
  }

  function buildBanana() {
    const g = makeEmptyGrid();
    for (let t = 0; t < 14; t++) {
      const x = 5 + t;
      const y = 16 - Math.floor(t * 0.55);
      setPx(g, x, y, "y");
      setPx(g, x, y - 1, "y");
      if (t > 2 && t < 12) setPx(g, x, y - 2, "y");
      if (t > 5 && t < 10) setPx(g, x, y - 3, "y");
    }
    setPx(g, 5, 16, "a");
    setPx(g, 18, 9, "a");
    return g;
  }

  function buildFish() {
    const g = makeEmptyGrid();
    drawDisk(g, 11, 12, 5, "c");
    drawTriangleFilled(g, 16, 12, 21, 8, 21, 16, "c");
    drawLine(g, 16, 12, 21, 8, "w");
    drawLine(g, 16, 12, 21, 16, "w");
    setPx(g, 9, 11, "w");
    setPx(g, 9, 11, "w");
    setPx(g, 8, 11, "w");
    setPx(g, 7, 11, "m");
    drawLine(g, 7, 13, 15, 13, "w");
    return g;
  }

  function buildHeart() {
    const g = makeEmptyGrid();
    drawDisk(g, 9, 10, 4, "m");
    drawDisk(g, 15, 10, 4, "m");
    drawTriangleFilled(g, 6, 12, 18, 12, 12, 20, "m");
    return g;
  }

  function buildStar() {
    const g = makeEmptyGrid();
    drawLine(g, 12, 4, 12, 20, "y");
    drawLine(g, 4, 11, 20, 11, "y");
    drawLine(g, 6, 6, 18, 18, "y");
    drawLine(g, 18, 6, 6, 18, "y");
    drawDisk(g, 12, 12, 2, "y");
    return g;
  }

  function buildHouse() {
    const g = makeEmptyGrid();
    drawTriangleFilled(g, 6, 12, 12, 6, 18, 12, "a");
    drawRect(g, 7, 12, 10, 8, "w");
    drawRect(g, 11, 15, 2, 5, "a");
    drawRect(g, 8, 14, 2, 2, "c");
    drawRect(g, 14, 14, 2, 2, "c");
    return g;
  }

  function buildTree() {
    const g = makeEmptyGrid();
    drawDisk(g, 12, 10, 6, "g");
    drawDisk(g, 9, 12, 4, "g");
    drawDisk(g, 15, 12, 4, "g");
    drawRect(g, 11, 14, 2, 7, "a");
    return g;
  }

  function buildCat() {
    const g = makeEmptyGrid();
    drawDisk(g, 12, 13, 6, "w");
    drawTriangleFilled(g, 7, 10, 9, 5, 11, 10, "w");
    drawTriangleFilled(g, 13, 10, 15, 5, 17, 10, "w");
    setPx(g, 10, 13, "g");
    setPx(g, 14, 13, "g");
    setPx(g, 12, 15, "m");
    drawLine(g, 8, 15, 10, 15, "w");
    drawLine(g, 14, 15, 16, 15, "w");
    return g;
  }

  function buildDog() {
    const g = makeEmptyGrid();
    drawDisk(g, 12, 13, 6, "a");
    drawDisk(g, 7, 13, 3, "a");
    drawDisk(g, 17, 13, 3, "a");
    drawRect(g, 5, 12, 3, 6, "a");
    drawRect(g, 16, 12, 3, 6, "a");
    setPx(g, 10, 13, "w");
    setPx(g, 14, 13, "w");
    setPx(g, 12, 16, "m");
    return g;
  }

  function buildSun() {
    const g = makeEmptyGrid();
    drawDisk(g, 12, 12, 5, "y");
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const x0 = 12 + Math.round(Math.cos(ang) * 7);
      const y0 = 12 + Math.round(Math.sin(ang) * 7);
      const x1 = 12 + Math.round(Math.cos(ang) * 10);
      const y1 = 12 + Math.round(Math.sin(ang) * 10);
      drawLine(g, x0, y0, x1, y1, "y");
    }
    return g;
  }

  function buildMoon() {
    const g = makeEmptyGrid();
    drawDisk(g, 13, 12, 6, "c");
    drawDisk(g, 16, 11, 6, "w");
    return g;
  }

  function buildKey() {
    const g = makeEmptyGrid();
    drawRing(g, 9, 12, 4, 2, "a");
    drawRect(g, 12, 11, 8, 2, "a");
    drawRect(g, 18, 10, 2, 4, "a");
    drawRect(g, 16, 12, 2, 3, "a");
    return g;
  }

  function buildCar() {
    const g = makeEmptyGrid();
    drawRect(g, 6, 12, 12, 5, "c");
    drawRect(g, 9, 9, 6, 3, "c");
    drawRect(g, 10, 10, 2, 2, "w");
    drawRect(g, 13, 10, 2, 2, "w");
    drawDisk(g, 8, 18, 2, "w");
    drawDisk(g, 16, 18, 2, "w");
    return g;
  }

  function buildBoat() {
    const g = makeEmptyGrid();
    drawTriangleFilled(g, 12, 6, 12, 15, 19, 15, "w");
    drawLine(g, 12, 6, 12, 18, "a");
    drawLine(g, 5, 16, 19, 16, "c");
    drawLine(g, 6, 17, 18, 17, "c");
    drawLine(g, 7, 18, 17, 18, "c");
    return g;
  }

  function buildCup() {
    const g = makeEmptyGrid();
    drawRect(g, 8, 10, 8, 8, "w");
    drawRect(g, 9, 11, 6, 6, "c");
    drawRing(g, 16, 13, 3, 2, "w");
    drawRect(g, 8, 18, 8, 2, "w");
    return g;
  }

  function buildFlower() {
    const g = makeEmptyGrid();
    drawDisk(g, 12, 12, 2, "y");
    drawDisk(g, 12, 8, 3, "m");
    drawDisk(g, 12, 16, 3, "m");
    drawDisk(g, 8, 12, 3, "m");
    drawDisk(g, 16, 12, 3, "m");
    drawRect(g, 11, 15, 2, 7, "g");
    drawDisk(g, 9, 18, 2, "g");
    return g;
  }

  function buildUmbrella() {
    const g = makeEmptyGrid();
    drawTriangleFilled(g, 6, 12, 12, 6, 18, 12, "m");
    drawLine(g, 6, 12, 18, 12, "w");
    drawLine(g, 12, 12, 12, 20, "w");
    drawLine(g, 12, 20, 10, 22, "w");
    return g;
  }

  function buildClock() {
    const g = makeEmptyGrid();
    drawRing(g, 12, 12, 7, 5, "w");
    drawDisk(g, 12, 12, 5, "c");
    drawLine(g, 12, 12, 12, 8, "w");
    drawLine(g, 12, 12, 15, 12, "w");
    setPx(g, 12, 5, "w");
    setPx(g, 12, 19, "w");
    setPx(g, 5, 12, "w");
    setPx(g, 19, 12, "w");
    return g;
  }

  function buildEye() {
    const g = makeEmptyGrid();
    drawTriangleFilled(g, 4, 12, 12, 7, 20, 12, "w");
    drawTriangleFilled(g, 4, 12, 12, 17, 20, 12, "w");
    drawDisk(g, 12, 12, 4, "c");
    drawDisk(g, 12, 12, 2, "m");
    setPx(g, 11, 11, "w");
    return g;
  }

  function buildSnake() {
    const g = makeEmptyGrid();
    for (let t = 0; t < 18; t++) {
      const x = 4 + t;
      const y = 12 + Math.round(Math.sin(t * 0.55) * 3);
      setPx(g, x, y, "g");
      setPx(g, x, y + 1, "g");
    }
    setPx(g, 21, 12, "m");
    setPx(g, 21, 13, "m");
    return g;
  }

  function buildButterfly() {
    const g = makeEmptyGrid();
    drawDisk(g, 10, 11, 4, "m");
    drawDisk(g, 14, 11, 4, "m");
    drawDisk(g, 10, 15, 3, "c");
    drawDisk(g, 14, 15, 3, "c");
    drawLine(g, 12, 9, 12, 18, "w");
    drawLine(g, 12, 9, 10, 7, "w");
    drawLine(g, 12, 9, 14, 7, "w");
    return g;
  }

  function buildMushroom() {
    const g = makeEmptyGrid();
    drawDisk(g, 12, 10, 7, "m");
    drawDisk(g, 9, 10, 2, "w");
    drawDisk(g, 15, 10, 2, "w");
    drawDisk(g, 12, 8, 2, "w");
    drawRect(g, 10, 14, 4, 7, "w");
    drawRect(g, 11, 15, 2, 5, "a");
    return g;
  }

  const SPECS = [
    makeSpec("APPLE", buildApple),
    makeSpec("BANANA", buildBanana),
    makeSpec("FISH", buildFish),
    makeSpec("HEART", buildHeart),
    makeSpec("STAR", buildStar),
    makeSpec("HOUSE", buildHouse),
    makeSpec("TREE", buildTree),
    makeSpec("CAT", buildCat),
    makeSpec("DOG", buildDog),
    makeSpec("SUN", buildSun),
    makeSpec("MOON", buildMoon),
    makeSpec("KEY", buildKey),
    makeSpec("CAR", buildCar),
    makeSpec("BOAT", buildBoat),
    makeSpec("CUP", buildCup),
    makeSpec("FLOWER", buildFlower),
    makeSpec("UMBRELLA", buildUmbrella),
    makeSpec("CLOCK", buildClock),
    makeSpec("EYE", buildEye),
    makeSpec("SNAKE", buildSnake),
    makeSpec("BUTTERFLY", buildButterfly),
    makeSpec("MUSHROOM", buildMushroom),
  ];

  const audio = (() => {
    let ctxAudio = null;
    let master = null;
    let humOsc = null;
    let humGain = null;

    function ensure() {
      if (ctxAudio) return;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      ctxAudio = new AudioContext();
      master = ctxAudio.createGain();
      master.gain.value = 0.25;
      master.connect(ctxAudio.destination);
    }

    function startHum() {
      ensure();
      if (!ctxAudio || humOsc) return;

      humOsc = ctxAudio.createOscillator();
      humOsc.type = "sawtooth";
      humOsc.frequency.value = 57;

      const humOsc2 = ctxAudio.createOscillator();
      humOsc2.type = "sine";
      humOsc2.frequency.value = 114;

      const filter = ctxAudio.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 280;
      filter.Q.value = 0.7;

      humGain = ctxAudio.createGain();
      humGain.gain.value = 0.02;

      humOsc.connect(filter);
      humOsc2.connect(filter);
      filter.connect(humGain);
      humGain.connect(master);
      humOsc.start();
      humOsc2.start();

      humOsc._pair = humOsc2;
    }

    function stopHum() {
      if (!ctxAudio || !humOsc) return;
      const now = ctxAudio.currentTime;
      humGain.gain.setTargetAtTime(0.0, now, 0.05);
      setTimeout(() => {
        try {
          humOsc.stop();
          humOsc._pair.stop();
        } catch (_) {}
        humOsc = null;
        humGain = null;
      }, 200);
    }

    function blip({ ok }) {
      ensure();
      if (!ctxAudio) return;
      const now = ctxAudio.currentTime;
      const osc = ctxAudio.createOscillator();
      const gain = ctxAudio.createGain();
      const filter = ctxAudio.createBiquadFilter();

      osc.type = "triangle";
      osc.frequency.value = ok ? 720 : 190;

      filter.type = "lowpass";
      filter.frequency.value = ok ? 1500 : 800;
      filter.Q.value = 0.8;

      gain.gain.setValueAtTime(0.0, now);
      gain.gain.linearRampToValueAtTime(ok ? 0.22 : 0.28, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (ok ? 0.14 : 0.18));

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);

      osc.start(now);
      osc.stop(now + 0.2);
    }

    return {
      ensure,
      startHum,
      stopHum,
      ok: () => blip({ ok: true }),
      bad: () => blip({ ok: false }),
    };
  })();

  const render = (() => {
    let dpr = 1;
    let cell = 1;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      cell = canvas.width / GRID;
      ctx.imageSmoothingEnabled = false;
    }

    function drawPixel(x, y, color, intensity) {
      const px = x * cell;
      const py = y * cell;
      const s = cell;

      ctx.globalAlpha = 0.18 * intensity;
      ctx.fillStyle = color;
      ctx.fillRect(px - 0.5 * dpr, py - 0.5 * dpr, s + 1 * dpr, s + 1 * dpr);

      ctx.globalAlpha = 0.85 * intensity;
      ctx.fillStyle = color;
      ctx.fillRect(px, py, s, s);

      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.12 * intensity;
      ctx.fillStyle = "#64c8ff";
      ctx.fillRect(px - 0.35 * dpr, py, s, s);
      ctx.fillStyle = "#ff64d8";
      ctx.fillRect(px + 0.35 * dpr, py, s, s);
      ctx.globalCompositeOperation = "source-over";
    }

    function clear() {
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#050819";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    return { resize, clear, drawPixel };
  })();

  function neighbors4(i) {
    const x = i % GRID;
    const y = (i / GRID) | 0;
    const out = [];
    if (x > 0) out.push(i - 1);
    if (x < GRID - 1) out.push(i + 1);
    if (y > 0) out.push(i - GRID);
    if (y < GRID - 1) out.push(i + GRID);
    return out;
  }

  const game = (() => {
    let difficultyKey = null;
    let difficulty = null;

    let roundIndex = 0;
    let score = 0;
    let results = [];
    let roundSpecs = [];

    let phase = "title";
    let phaseStart = 0;

    let target = null;
    let targetGrid = null;
    let currentGrid = makeEmptyGrid();
    let lockAt = new Float32Array(GRID * GRID).fill(-1);
    let showingChoices = false;

    let recallStart = 0;
    let scatterStart = 0;

    let optionNames = [];
    let correctName = "";

    function setScreen(which) {
      screenTitle.classList.toggle("hidden", which !== "title");
      screenGame.classList.toggle("hidden", which !== "game");
      screenEnd.classList.toggle("hidden", which !== "end");
    }

    function updateHud() {
      const shownRound = phase === "title" ? "--" : String(roundIndex + 1).padStart(2, "0");
      roundText.textContent = `${shownRound} / ${phase === "title" ? "--" : String(ROUNDS).padStart(2, "0")}`;
      scoreText.textContent = String(score);
    }

    function setStatus(text) {
      statusText.textContent = text;
    }

    function hideChoices() {
      showingChoices = false;
      choicesEl.classList.add("hidden");
      for (const btn of choiceButtons) {
        btn.disabled = true;
        btn.classList.remove("correct", "wrong");
      }
    }

    function showChoices() {
      showingChoices = true;
      choicesEl.classList.remove("hidden");
      for (let i = 0; i < choiceButtons.length; i++) {
        const btn = choiceButtons[i];
        const label = optionNames[i];
        if (!label) {
          btn.classList.add("hidden");
          continue;
        }
        btn.classList.remove("hidden");
        btn.textContent = label;
        btn.disabled = false;
      }
    }

    function randomNoiseGrid({ litProb }) {
      const keys = Object.keys(PALETTE);
      for (let i = 0; i < currentGrid.length; i++) {
        if (Math.random() < litProb) {
          currentGrid[i] = keys[randInt(keys.length)];
        } else {
          currentGrid[i] = null;
        }
        lockAt[i] = -1;
      }
    }

    function setTarget(spec) {
      target = spec;
      targetGrid = spec.grid;
      correctName = spec.name;
    }

    function buildOptions() {
      const count = difficulty.optionCount;
      const pool = SPECS.map((s) => s.name).filter((n) => n !== correctName);
      shuffleInPlace(pool);
      const opts = [correctName, ...pool.slice(0, Math.max(0, count - 1))];
      shuffleInPlace(opts);
      optionNames = opts;

      if (count === 3) optionNames.push("");
    }

    function phaseTo(p) {
      phase = p;
      phaseStart = performance.now();
    }

    function startGame(dKey) {
      difficultyKey = dKey;
      difficulty = DIFFICULTIES[difficultyKey];
      roundIndex = 0;
      score = 0;
      results = [];
      roundSpecs = shuffleInPlace(SPECS.slice()).slice(0, ROUNDS);
      hideChoices();
      setScreen("game");
      updateHud();
      audio.startHum();
      startRound();
    }

    function startRound() {
      updateHud();
      hideChoices();
      setStatus("RECALLING...");
      setTarget(roundSpecs[roundIndex]);
      buildOptions();
      randomNoiseGrid({ litProb: difficulty.noiseLitProb });
      recallStart = performance.now();
      phaseTo("recall");
    }

    function endGame() {
      audio.stopHum();
      setScreen("end");
      const final = `${score} / ${ROUNDS} (${difficulty.label})`;
      finalText.textContent = final;

      const squares = results.join("");
      const url = window.location.origin && window.location.origin !== "null" ? window.location.origin : "play.patternretrieval-game.app";
      const share = [
        `PATTERN RETRIEVAL — ${score}/${ROUNDS} (${difficulty.label})`,
        squares,
        url,
      ].join("\n");

      shareText.textContent = share;
      copyHint.textContent = "";
      phaseTo("end");
    }

    function guess(chosen) {
      for (const btn of choiceButtons) btn.disabled = true;

      const ok = chosen === correctName;
      const dom = target.domColor || "c";
      const emoji = ok ? (EMOJI_BY_COLOR[dom] || "🟦") : "⬛";
      results.push(emoji);

      if (ok) {
        score += 1;
        audio.ok();
      } else {
        audio.bad();
      }
      updateHud();

      for (const btn of choiceButtons) {
        if (btn.textContent === correctName) btn.classList.add("correct");
        else if (btn.textContent === chosen) btn.classList.add("wrong");
      }

      phaseTo("feedback");
    }

    function stepRecall(now) {
      const t = clamp01((now - recallStart) / difficulty.recallMs);
      const p = easeInOutCubic(t);
      const temp = 1 - p;

      const passes = 2 + Math.floor(p * 3);
      for (let pass = 0; pass < passes; pass++) {
        const start = randInt(currentGrid.length);
        for (let k = 0; k < currentGrid.length; k++) {
          const i = (start + k) % currentGrid.length;
          const desired = targetGrid[i];
          const cur = currentGrid[i];
          const isDesiredOn = desired !== null;
          const isCurOn = cur !== null;
          if (desired === cur) continue;

          const ns = neighbors4(i);
          let agree = 0;
          for (const j of ns) {
            const nDesired = targetGrid[j];
            const nCur = currentGrid[j];
            if (isDesiredOn) {
              if (nDesired && nCur) agree += 1;
              if (nCur === desired) agree += 1;
            } else {
              if (!nDesired && !nCur) agree += 1;
            }
          }
          const neighborBoost = agree / Math.max(1, ns.length * 2);

          const base = isDesiredOn ? 0.05 : 0.08;
          let prob = base + p * (isDesiredOn ? 0.55 : 0.6) + neighborBoost * 0.35;
          prob += (Math.random() - 0.5) * 0.08 * temp;
          prob = clamp01(prob);

          if (Math.random() < prob) {
            currentGrid[i] = desired;
            if (desired === targetGrid[i] && lockAt[i] < 0) lockAt[i] = now;
          } else if (temp > 0.5 && Math.random() < 0.015) {
            if (Math.random() < 0.25) currentGrid[i] = null;
            else currentGrid[i] = Object.keys(PALETTE)[randInt(6)];
          }
        }
      }

      if (t >= 1) {
        for (let i = 0; i < currentGrid.length; i++) {
          currentGrid[i] = targetGrid[i];
          if (lockAt[i] < 0) lockAt[i] = now;
        }
        phaseTo("hold");
      }
    }

    function stepHold(now) {
      if (now - phaseStart >= difficulty.holdMs) {
        scatterStart = now;
        phaseTo("scatter");
      }
    }

    function stepScatter(now) {
      const t = clamp01((now - scatterStart) / difficulty.scatterMs);
      const p = easeInOutCubic(t);
      const litProb = difficulty.noiseLitProb;
      const keys = Object.keys(PALETTE);

      const flips = Math.floor(currentGrid.length * (0.12 + 0.72 * p));
      for (let n = 0; n < flips; n++) {
        const i = randInt(currentGrid.length);
        if (Math.random() < litProb) currentGrid[i] = keys[randInt(keys.length)];
        else currentGrid[i] = null;
        lockAt[i] = -1;
      }

      if (t >= 1) {
        setStatus("SELECT:");
        showChoices();
        phaseTo("choices");
      }
    }

    function stepFeedback(now) {
      if (now - phaseStart < 850) return;
      roundIndex += 1;
      if (roundIndex >= ROUNDS) {
        endGame();
      } else {
        setStatus("RECALLING...");
        hideChoices();
        phaseTo("transition");
      }
    }

    function stepTransition(now) {
      if (now - phaseStart < 420) return;
      startRound();
    }

    function draw(now) {
      render.clear();

      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          const i = idx(x, y);
          const c = currentGrid[i];
          if (!c) continue;
          const base = 0.9;
          let pulse = 0;
          const t0 = lockAt[i];
          if (t0 >= 0) {
            const dt = (now - t0) / 1000;
            pulse = Math.max(0, Math.cos(dt * 7.8) * 0.22) * Math.exp(-dt * 2.8);
          }
          render.drawPixel(x, y, PALETTE[c] || PALETTE.c, base + pulse);
        }
      }
    }

    function tick(now) {
      if (phase === "recall") stepRecall(now);
      else if (phase === "hold") stepHold(now);
      else if (phase === "scatter") stepScatter(now);
      else if (phase === "feedback") stepFeedback(now);
      else if (phase === "transition") stepTransition(now);

      draw(now);
      requestAnimationFrame(tick);
    }

    function onChoiceClick(e) {
      if (!showingChoices) return;
      audio.ensure();
      const btn = e.currentTarget;
      const chosen = btn.textContent;
      if (!chosen) return;
      guess(chosen);
    }

    function wire() {
      for (const btn of choiceButtons) btn.addEventListener("click", onChoiceClick);

      document.addEventListener("click", () => audio.ensure(), { once: true });
      document.addEventListener("touchstart", () => audio.ensure(), { once: true, passive: true });

      document.querySelectorAll("[data-difficulty]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          audio.ensure();
          const dKey = e.currentTarget.getAttribute("data-difficulty");
          if (!DIFFICULTIES[dKey]) return;
          setScreen("game");
          startGame(dKey);
        });
      });

      againBtn.addEventListener("click", () => {
        hideChoices();
        setScreen("title");
        phaseTo("title");
        updateHud();
      });

      copyBtn.addEventListener("click", async () => {
        const text = shareText.textContent || "";
        try {
          await navigator.clipboard.writeText(text);
          copyHint.textContent = "COPIED TO CLIPBOARD";
        } catch (_) {
          const range = document.createRange();
          range.selectNodeContents(shareText);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          copyHint.textContent = "SELECTED — COPY MANUALLY";
        }
      });
    }

    function init() {
      setScreen("title");
      updateHud();
      setStatus("RECALLING...");
      hideChoices();
      wire();

      render.resize();
      const ro = new ResizeObserver(() => render.resize());
      ro.observe(canvas);

      requestAnimationFrame(tick);
    }

    return { init };
  })();

  game.init();
})();
