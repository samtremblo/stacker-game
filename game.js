(function () {
  var W = 1080, H = 1920;
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');

  var COLS = 7;
  var ROWS = 10;

  var FRAME = 40;                 // chrome bezel thickness
  var MARQUEE_H = 300;            // top marquee panel (title + score)
  var BOTTOM_BAR_H = 110;         // bottom decorative cabinet strip

  var PLAY_LEFT = FRAME + 16;
  var PLAY_RIGHT = W - FRAME - 16;
  var PLAY_TOP = FRAME + MARQUEE_H;
  var PLAY_BOTTOM = H - FRAME - BOTTOM_BAR_H;

  var CELL_W = (PLAY_RIGHT - PLAY_LEFT) / COLS;
  var CELL_H = (PLAY_BOTTOM - PLAY_TOP) / ROWS;
  var CELL_PAD = 7;

  var GRAVITY = 2600;
  var START_WIDTH = 3;             // moving block width for the first row, out of COLS
  var SPEED_WINDOW = 2.2;          // seconds to react before the speed bonus hits zero
  var BASE_INTERVAL = 180;         // ms per column step on row 1
  var MIN_INTERVAL = 38;           // ms per column step, fastest the game gets
  var DIFFICULTY_FACTOR = 0.8;     // each row's step interval is multiplied by this
  var MAX_WIN_PERCENT = 25;        // payout cap: final row is rigged to fail once win rate hits this
  var ROW_START_DELAY_MIN = 80;    // ms before a new row's block starts moving
  var ROW_START_DELAY_MAX = 420;   // randomized so players can't just find a rhythm

  var LOCKED_FILL = '#2f7dfb';
  var LOCKED_FILL_LIGHT = '#6fa8ff';
  var LOCKED_GLOW = '#3d84ff';
  var ACTIVE_FILL = '#e7e9ee';
  var UNLIT_FILL = '#1c1e26';

  var rows, current, fallers, confetti, score, best, combo, state, stateChangedAt, lastT, tSec;
  var gamesPlayed, gamesWon;

  var TWINKLE_COUNT = 16;
  var twinkles = [];
  for (var ti = 0; ti < TWINKLE_COUNT; ti++) {
    twinkles.push({
      x: FRAME + Math.random() * (W - FRAME * 2),
      y: FRAME + Math.random() * (H - FRAME * 2),
      phase: Math.random() * Math.PI * 2,
      speed: 0.8 + Math.random() * 1.6
    });
  }

  function easeOutBack(t) {
    var c1 = 1.70158, c3 = c1 + 1;
    t = Math.max(0, Math.min(1, t));
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  function colX(col) { return PLAY_LEFT + col * CELL_W; }
  function rowY(rowIndex) { return PLAY_BOTTOM - (rowIndex + 1) * CELL_H; }

  function showHome() {
    rows = [{ startCol: 0, width: COLS }];
    fallers = [];
    confetti = [];
    score = 0;
    combo = 0;
    state = 'home';
    stateChangedAt = tSec;
  }

  function spawnConfetti() {
    confetti = [];
    for (var i = 0; i < 60; i++) {
      confetti.push({
        x: FRAME + Math.random() * (W - FRAME * 2),
        y: FRAME - Math.random() * H,
        vx: (Math.random() - 0.5) * 160,
        vy: 160 + Math.random() * 220,
        size: 8 + Math.random() * 12,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 6,
        color: Math.random() < 0.5 ? LOCKED_FILL_LIGHT : '#ffffff'
      });
    }
  }

  function reset() {
    rows = [{ startCol: 0, width: COLS }]; // base row: fully lit, freebie
    fallers = [];
    score = 0;
    combo = 0;
    state = 'playing';
    spawnCurrent();
  }

  function spawnCurrent() {
    var top = rows[rows.length - 1];
    var level = rows.length;
    var interval = Math.max(MIN_INTERVAL, BASE_INTERVAL * Math.pow(DIFFICULTY_FACTOR, level - 1));
    var width = (level === 1) ? START_WIDTH : top.width;
    current = { width: width, pos: 0, dir: 1, stepInterval: interval, timer: 0, spawnAt: tSec };
  }

  function placeBlock() {
    if (state === 'home' || state === 'gameover' || state === 'win') { reset(); return; }
    if (state !== 'playing') return;

    var top = rows[rows.length - 1];
    var curStart = current.pos, curEnd = current.pos + current.width;
    var topStart = top.startCol, topEnd = top.startCol + top.width;
    var overlapStart = Math.max(curStart, topStart);
    var overlapEnd = Math.min(curEnd, topEnd);
    var overlapWidth = overlapEnd - overlapStart;
    var targetRow = rows.length;

    // house rule: on the final row, the win rate is capped — once too many
    // players have won, this drop is rigged to miss no matter how it lands
    var isFinalRow = targetRow === ROWS - 1;
    var winPercent = gamesPlayed > 0 ? (gamesWon / gamesPlayed) * 100 : 0;
    if (isFinalRow && winPercent >= MAX_WIN_PERCENT) {
      overlapWidth = 0;
    }

    if (overlapWidth <= 0) {
      dropFallerCols(curStart, current.width, targetRow);
      finishGame('gameover');
      return;
    }

    var perfect = overlapWidth === current.width; // whole block landed on the platform, nothing cut off

    if (curStart < overlapStart) dropFallerCols(curStart, overlapStart - curStart, targetRow);
    var rightCut = curEnd - overlapEnd;
    if (rightCut > 0) dropFallerCols(overlapEnd, rightCut, targetRow);

    rows.push({ startCol: overlapStart, width: overlapWidth });
    combo = perfect ? combo + 1 : 0;

    var elapsed = tSec - current.spawnAt;
    var accuracyPoints = Math.round((overlapWidth / current.width) * 100);
    var speedPoints = Math.round(Math.max(0, 1 - elapsed / SPEED_WINDOW) * 100);
    score += accuracyPoints + speedPoints + combo * 10;
    best = Math.max(best, score);
    localStorage.setItem('stackerBest', String(best));

    if (rows.length === ROWS) {
      finishGame('win');
    } else {
      state = 'falling';
      var startDelay = ROW_START_DELAY_MIN + Math.random() * (ROW_START_DELAY_MAX - ROW_START_DELAY_MIN);
      setTimeout(function () { if (state === 'falling') state = 'playing'; spawnCurrent(); }, startDelay);
    }
  }

  function finishGame(result) {
    gamesPlayed++;
    if (result === 'win') gamesWon++;
    localStorage.setItem('stackerGamesPlayed', String(gamesPlayed));
    localStorage.setItem('stackerGamesWon', String(gamesWon));
    updateStatsDisplay();

    state = 'falling';
    setTimeout(function () {
      state = result;
      stateChangedAt = tSec;
      if (result === 'win') spawnConfetti();
    }, 500);
  }

  function dropFallerCols(colStart, widthCols, rowIndex) {
    fallers.push({
      x: colX(colStart), width: widthCols * CELL_W,
      y: rowY(rowIndex), vy: 0, vx: (Math.random() - 0.5) * 220,
      rot: 0, vr: (Math.random() - 0.5) * 4, alpha: 1
    });
  }

  function update(dt) {
    tSec += dt;

    if (state === 'playing') {
      current.timer += dt * 1000;
      if (current.timer >= current.stepInterval) {
        current.timer = 0;
        current.pos += current.dir;
        var maxPos = COLS - current.width;
        if (current.pos < 0) { current.pos = 0; current.dir = 1; }
        else if (current.pos > maxPos) { current.pos = maxPos; current.dir = -1; }
      }
    }

    for (var i = fallers.length - 1; i >= 0; i--) {
      var f = fallers[i];
      f.vy += GRAVITY * dt;
      f.y += f.vy * dt;
      f.x += f.vx * dt;
      f.rot += f.vr * dt;
      f.alpha -= dt * 0.7;
      if (f.y > H + 200 || f.alpha <= 0) fallers.splice(i, 1);
    }

    if (state === 'win') {
      for (var j = 0; j < confetti.length; j++) {
        var c = confetti[j];
        c.vy += GRAVITY * 0.35 * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.rot += c.vr * dt;
        if (c.y > H + 40) {
          c.y = FRAME - 20;
          c.x = FRAME + Math.random() * (W - FRAME * 2);
          c.vy = 160 + Math.random() * 220;
        }
      }
    }
  }

  function drawLamp(x, y, w, h, kind, pulse) {
    var rx = x + CELL_PAD, ry = y + CELL_PAD, rw = w - CELL_PAD * 2, rh = h - CELL_PAD * 2;
    ctx.save();
    if (kind === 'locked') {
      ctx.shadowColor = LOCKED_GLOW;
      ctx.shadowBlur = 22;
      var grad = ctx.createLinearGradient(0, ry, 0, ry + rh);
      grad.addColorStop(0, LOCKED_FILL_LIGHT);
      grad.addColorStop(1, LOCKED_FILL);
      ctx.fillStyle = grad;
    } else if (kind === 'active') {
      var b = pulse ? pulse * 12 : 0;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 14 + b;
      ctx.fillStyle = ACTIVE_FILL;
    } else {
      ctx.shadowBlur = 0;
      ctx.fillStyle = UNLIT_FILL;
    }
    roundRect(rx, ry, rw, rh, 10);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = kind === 'unlit' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 3;
    roundRect(rx, ry, rw, rh, 10);
    ctx.stroke();
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBezel() {
    var grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#33363e');
    grad.addColorStop(0.5, '#101115');
    grad.addColorStop(1, '#2a2c33');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#08090b';
    ctx.fillRect(FRAME, FRAME, W - FRAME * 2, H - FRAME * 2);

    // corner bolts
    [[FRAME / 2, FRAME / 2], [W - FRAME / 2, FRAME / 2], [FRAME / 2, H - FRAME / 2], [W - FRAME / 2, H - FRAME / 2]].forEach(function (p) {
      var bg = ctx.createRadialGradient(p[0] - 4, p[1] - 4, 1, p[0], p[1], 12);
      bg.addColorStop(0, '#cfd3da');
      bg.addColorStop(1, '#3d4048');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 12, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawMarquee() {
    var panelGrad = ctx.createLinearGradient(0, FRAME, 0, FRAME + MARQUEE_H);
    panelGrad.addColorStop(0, '#16171d');
    panelGrad.addColorStop(1, '#08090b');
    ctx.fillStyle = panelGrad;
    ctx.fillRect(FRAME, FRAME, W - FRAME * 2, MARQUEE_H);

    // title
    ctx.textAlign = 'center';
    ctx.font = '900 118px Impact, "Arial Black", Arial, sans-serif';
    ctx.fillStyle = '#eef0f4';
    ctx.shadowColor = 'rgba(255,255,255,0.35)';
    ctx.shadowBlur = 22;
    ctx.fillText('STACKER', W / 2, FRAME + 118);
    ctx.shadowBlur = 0;

    // score panel (left) / best panel (right)
    drawDigitalPanel(FRAME + 40, FRAME + 150, 430, 120, 'SCORE', String(score));
    drawDigitalPanel(W - FRAME - 470, FRAME + 150, 430, 120, 'BEST', String(best));
  }

  function drawDigitalPanel(x, y, w, h, label, value) {
    ctx.fillStyle = '#0a0b0e';
    roundRect(x, y, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = '#33363f';
    ctx.lineWidth = 3;
    roundRect(x, y, w, h, 12);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.font = '700 26px Arial, sans-serif';
    ctx.fillStyle = '#8a8f9c';
    ctx.fillText(label, x + w / 2, y + 34);

    ctx.font = '700 58px "Courier New", monospace';
    ctx.fillStyle = LOCKED_FILL_LIGHT;
    ctx.shadowColor = LOCKED_GLOW;
    ctx.shadowBlur = 16;
    ctx.fillText(value, x + w / 2, y + 92);
    ctx.shadowBlur = 0;
  }

  function drawBottomBar() {
    var y = H - FRAME - BOTTOM_BAR_H;
    var grad = ctx.createLinearGradient(0, y, 0, H - FRAME);
    grad.addColorStop(0, '#050608');
    grad.addColorStop(1, '#16171d');
    ctx.fillStyle = grad;
    ctx.fillRect(FRAME, y, W - FRAME * 2, BOTTOM_BAR_H);
  }

  function drawGrid() {
    for (var r = 0; r < ROWS; r++) {
      var y = rowY(r);
      for (var c = 0; c < COLS; c++) {
        drawLamp(colX(c), y, CELL_W, CELL_H, 'unlit');
      }
    }

    // settled rows
    for (var r2 = 0; r2 < rows.length; r2++) {
      var row = rows[r2];
      var y2 = rowY(r2);
      for (var c2 = row.startCol; c2 < row.startCol + row.width; c2++) {
        drawLamp(colX(c2), y2, CELL_W, CELL_H, 'locked');
      }
    }

    // active moving bar (not locked in yet)
    if (state === 'playing') {
      var yc = rowY(rows.length);
      var pulse = (Math.sin(tSec * 10) + 1) / 2;
      for (var c3 = current.pos; c3 < current.pos + current.width; c3++) {
        drawLamp(colX(c3), yc, CELL_W, CELL_H, 'active', pulse);
      }
    }
  }

  function drawFallers() {
    for (var i = 0; i < fallers.length; i++) {
      var f = fallers[i];
      ctx.save();
      ctx.globalAlpha = Math.max(0, f.alpha);
      ctx.translate(f.x + f.width / 2, f.y + CELL_H / 2);
      ctx.rotate(f.rot);
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 14;
      ctx.fillStyle = ACTIVE_FILL;
      roundRect(-f.width / 2 + CELL_PAD, -CELL_H / 2 + CELL_PAD, f.width - CELL_PAD * 2, CELL_H - CELL_PAD * 2, 10);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawTwinkles() {
    for (var i = 0; i < twinkles.length; i++) {
      var t = twinkles[i];
      var b = (Math.sin(tSec * t.speed + t.phase) + 1) / 2;
      ctx.save();
      ctx.shadowColor = LOCKED_GLOW;
      ctx.shadowBlur = 10;
      ctx.fillStyle = 'rgba(160,195,255,' + (0.06 + b * 0.22) + ')';
      ctx.beginPath();
      ctx.arc(t.x, t.y, 3 + b * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawConfetti() {
    for (var i = 0; i < confetti.length; i++) {
      var c = confetti[i];
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.size / 2, -c.size / 4, c.size, c.size / 2);
      ctx.restore();
    }
  }

  function drawOverlay() {
    if (state !== 'home' && state !== 'gameover' && state !== 'win') return;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(FRAME, FRAME, W - FRAME * 2, H - FRAME * 2);
    drawTwinkles();

    var elapsed = tSec - stateChangedAt;
    var pop = easeOutBack(elapsed / 0.5);

    if (state === 'home') {
      var homePulse = (Math.sin(tSec * 3) + 1) / 2;
      var breathe = 1 + Math.sin(tSec * 1.4) * 0.02;
      var bob = Math.sin(tSec * 4) * 10;

      ctx.textAlign = 'center';
      ctx.save();
      ctx.translate(W / 2, H / 2 - 40);
      ctx.scale(pop * breathe, pop * breathe);
      ctx.font = '900 150px Impact, "Arial Black", Arial, sans-serif';
      ctx.lineWidth = 10;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText('STACKER', 0, 0);
      ctx.fillStyle = '#eef0f4';
      ctx.shadowColor = 'rgba(255,255,255,0.4)';
      ctx.shadowBlur = 30;
      ctx.fillText('STACKER', 0, 0);
      ctx.shadowBlur = 0;
      ctx.restore();

      ctx.save();
      ctx.translate(W / 2, H / 2 + 80 + bob);
      ctx.font = '800 54px Arial, sans-serif';
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText('PUSH TO START', 0, 0);
      ctx.fillStyle = LOCKED_FILL_LIGHT;
      ctx.shadowColor = LOCKED_GLOW;
      ctx.shadowBlur = 14 + homePulse * 18;
      ctx.fillText('PUSH TO START', 0, 0);
      ctx.shadowBlur = 0;
      ctx.restore();
      return;
    }

    var win = state === 'win';
    var pulse = (Math.sin(tSec * 6) + 1) / 2;
    var shake = win ? 0 : Math.max(0, 0.3 - elapsed) * 10;
    var shakeX = win ? 0 : (Math.random() - 0.5) * shake;
    var shakeY = win ? 0 : (Math.random() - 0.5) * shake;

    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(W / 2 + shakeX, H / 2 - 40 + shakeY);
    ctx.scale(pop, pop);
    ctx.font = '900 150px Impact, "Arial Black", Arial, sans-serif';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(win ? 'WINNER!' : 'GAME OVER', 0, 0);
    ctx.fillStyle = win ? LOCKED_FILL_LIGHT : '#eef0f4';
    ctx.shadowColor = win ? LOCKED_GLOW : 'rgba(255,255,255,0.5)';
    ctx.shadowBlur = 30 + pulse * 26;
    ctx.fillText(win ? 'WINNER!' : 'GAME OVER', 0, 0);
    ctx.shadowBlur = 0;
    ctx.restore();

    ctx.font = '800 62px Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('SCORE ' + score, W / 2, H / 2 + 70);
    ctx.fillStyle = '#9aa0ad';
    ctx.font = '700 44px Arial, sans-serif';
    ctx.fillText('BEST ' + best, W / 2, H / 2 + 130);

    ctx.font = '700 42px Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,' + (0.5 + pulse * 0.5) + ')';
    ctx.fillText('INSERT COIN — TAP TO RESTART', W / 2, H / 2 + 250);

    if (win) drawConfetti();
  }

  function render() {
    drawBezel();
    if (state === 'home' || state === 'gameover' || state === 'win') {
      drawOverlay();
      return;
    }
    drawMarquee();
    drawGrid();
    drawFallers();
    drawBottomBar();
    drawOverlay();
  }

  function loop(t) {
    if (!lastT) lastT = t;
    var dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  best = parseInt(localStorage.getItem('stackerBest') || '0', 10);
  gamesPlayed = parseInt(localStorage.getItem('stackerGamesPlayed') || '0', 10);
  gamesWon = parseInt(localStorage.getItem('stackerGamesWon') || '0', 10);
  tSec = 0;

  var difficultySlider = document.getElementById('difficultySlider');
  var difficultyValueEl = document.getElementById('difficultyValue');
  var payoutSlider = document.getElementById('payoutSlider');
  var payoutValueEl = document.getElementById('payoutValue');
  var statsPlayedEl = document.getElementById('statsPlayed');
  var statsWonEl = document.getElementById('statsWon');
  var statsWinRateEl = document.getElementById('statsWinRate');

  function difficultyFromSlider(v) { return 0.95 - (v - 1) * 0.035; }

  function updateStatsDisplay() {
    statsPlayedEl.textContent = gamesPlayed;
    statsWonEl.textContent = gamesWon;
    var pct = gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0;
    statsWinRateEl.textContent = pct + '%';
  }

  difficultySlider.addEventListener('input', function (e) {
    var v = parseInt(e.target.value, 10);
    DIFFICULTY_FACTOR = difficultyFromSlider(v);
    difficultyValueEl.textContent = v;
  });

  payoutSlider.addEventListener('input', function (e) {
    var v = parseInt(e.target.value, 10);
    MAX_WIN_PERCENT = v;
    payoutValueEl.textContent = v + '%';
  });

  DIFFICULTY_FACTOR = difficultyFromSlider(parseInt(difficultySlider.value, 10));
  MAX_WIN_PERCENT = parseInt(payoutSlider.value, 10);
  updateStatsDisplay();

  showHome();
  requestAnimationFrame(loop);

  document.getElementById('scene').addEventListener('click', placeBlock);
  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space') { e.preventDefault(); placeBlock(); }
  });
})();
