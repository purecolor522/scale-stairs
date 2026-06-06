/* ===========================================================
   音階小教室 — app.js
   音樂理論工具 + Web Audio 音色 + 鋼琴 / 圖解 / 階梯遊戲
   =========================================================== */
'use strict';

/* ---------------------------------------------------------
   1. 音樂理論小工具
   --------------------------------------------------------- */
const LETTERS = ['C','D','E','F','G','A','B'];
// 每個音名(白鍵)的基本音高 class（C=0）
const LETTER_PC = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
// 唱名
const SOLFEGE = { C:'Do', D:'Re', E:'Mi', F:'Fa', G:'Sol', A:'La', B:'Ti' };

// 音階公式（半音數的「間距」）：全=2、半=1
const SCALE_FORMULAS = {
  major:      { name:'大調 Major',        steps:[2,2,1,2,2,2,1] },
  minor:      { name:'自然小調 Minor',    steps:[2,1,2,2,1,2,2] },
  wholeTone:  { name:'全音階 Whole Tone', steps:[2,2,2,2,2,2]   },
  pentatonic: { name:'五聲音階 Pentatonic',steps:[2,2,3,2,3]    },
};

// 給定主音字母 + 公式 → 正確拼寫的音名陣列（含升降記號）
function spellScale(rootLetter, formulaKey){
  const formula = SCALE_FORMULAS[formulaKey];
  const startLetterIdx = LETTERS.indexOf(rootLetter);
  let pc = LETTER_PC[rootLetter];          // 目前音高 class
  const notes = [{ letter: rootLetter, acc: 0, pc }];

  // 全音階/五聲音階沒有「每階換一個字母」的傳統規則，特別處理
  const diatonic = (formulaKey === 'major' || formulaKey === 'minor');

  for (let i = 0; i < formula.steps.length; i++){
    pc = (pc + formula.steps[i]) % 12;
    let letter, acc;
    if (diatonic){
      letter = LETTERS[(startLetterIdx + i + 1) % 7];
      const natural = LETTER_PC[letter];
      acc = ((pc - natural + 12) % 12);     // 需要的調整量（0..11）
      if (acc > 6) acc -= 12;               // 收斂到 -5..6（實際只會是 -2..2）
    } else {
      // 用升記號邏輯找最接近的拼寫
      const sp = pcToSharpSpelling(pc);
      letter = sp.letter; acc = sp.acc;
    }
    notes.push({ letter, acc, pc });
  }
  return notes;
}

// 把音高 class 轉成「以升記號優先」的拼寫
function pcToSharpSpelling(pc){
  const map = {
    0:{letter:'C',acc:0}, 1:{letter:'C',acc:1}, 2:{letter:'D',acc:0},
    3:{letter:'D',acc:1}, 4:{letter:'E',acc:0}, 5:{letter:'F',acc:0},
    6:{letter:'F',acc:1}, 7:{letter:'G',acc:0}, 8:{letter:'G',acc:1},
    9:{letter:'A',acc:0}, 10:{letter:'A',acc:1}, 11:{letter:'B',acc:0},
  };
  return map[((pc%12)+12)%12];
}

function accSymbol(acc){
  if (acc === 0) return '';
  if (acc === 1) return '♯';
  if (acc === 2) return '𝄪';
  if (acc === -1) return '♭';
  if (acc === -2) return '𝄫';
  return '';
}
function noteLabel(note, mode){
  if (mode === 'solfege') return SOLFEGE[note.letter] + accSymbol(note.acc);
  return note.letter + accSymbol(note.acc);
}

// MIDI / 頻率
function freqFromMidi(m){ return 440 * Math.pow(2, (m - 69) / 12); }

/* ---------------------------------------------------------
   2. Web Audio 音色（柔和鋼琴/木琴感）
   --------------------------------------------------------- */
let audioCtx = null;
function ensureAudio(){
  if (!audioCtx){
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playFreq(freq, when = 0, dur = 0.75, vol = 0.22){
  const ctx = ensureAudio();
  const t = ctx.currentTime + when;

  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  osc1.type = 'triangle';
  osc2.type = 'sine';
  osc1.frequency.value = freq;
  osc2.frequency.value = freq;
  osc2.detune.value = 5;                 // 一點點失諧讓聲音更溫暖

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(4200, t);
  filter.frequency.exponentialRampToValueAtTime(1400, t + dur);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);   // attack
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);  // release

  osc1.connect(filter); osc2.connect(filter);
  filter.connect(g); g.connect(ctx.destination);
  osc1.start(t); osc2.start(t);
  osc1.stop(t + dur + 0.05); osc2.stop(t + dur + 0.05);
}
function playMidi(m, when = 0, dur = 0.75, vol = 0.22){ playFreq(freqFromMidi(m), when, dur, vol); }

// 小音效：答對 / 答錯
function chime(ok){
  const base = ok ? 660 : 200;
  if (ok){ playFreq(base, 0, .18, .18); playFreq(base*1.5, .09, .22, .18); }
  else   { playFreq(base, 0, .2, .16); playFreq(base*0.84, .07, .22, .16); }
}

/* ---------------------------------------------------------
   3. 共用：建立分段按鈕（segmented control）
   --------------------------------------------------------- */
function buildSeg(container, items, activeVal, onPick){
  container.innerHTML = '';
  items.forEach(it => {
    const b = document.createElement('button');
    b.className = 'seg-btn' + (it.val === activeVal ? ' active' : '');
    b.textContent = it.label;
    b.dataset.val = it.val;
    b.addEventListener('click', () => {
      container.querySelectorAll('.seg-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      onPick(it.val);
    });
    container.appendChild(b);
  });
}

const ROOTS = ['C','G','D','A','E','F'];   // 圖解 & 遊戲可選主音

/* ===========================================================
   4. 互動鋼琴鍵盤
   =========================================================== */
const Piano = (() => {
  const el = document.getElementById('pianoEl');
  const readout = document.getElementById('scaleReadout');

  // C4 (midi 60) → C6 (midi 84)，兩個八度
  const START_MIDI = 60, END_MIDI = 84;
  const WHITE_PCS = [0,2,4,5,7,9,11];
  const BLACK_AFTER = [0,2,5,7,9];   // C# D# F# G# A# 出現在這些白鍵之後

  let state = { root:'C', scale:'major', labelMode:'letter' };
  let scalePcs = new Set();
  let rootPc = 0;
  const keyByMidi = {};   // midi -> element

  // 電腦鍵盤對應
  const KEYMAP = { a:60,w:61,s:62,e:63,d:64,f:65,t:66,g:67,y:68,h:69,u:70,j:71,k:72,o:73,l:74,p:75,';':76 };

  function midiToLetter(m){
    const pc = m % 12;
    const sp = pcToSharpSpelling(pc);
    return { letter: sp.letter, acc: sp.acc, octave: Math.floor(m/12)-1 };
  }

  let whiteCount = 0;
  const blackList = [];   // {bm, whiteIndex}

  function build(){
    el.innerHTML = '';
    whiteCount = 0; blackList.length = 0;
    // 先放白鍵
    let whiteIndex = 0;
    for (let m = START_MIDI; m <= END_MIDI; m++){
      if (WHITE_PCS.includes(m % 12)){
        const k = document.createElement('div');
        k.className = 'wkey';
        k.dataset.midi = m;
        const lbl = document.createElement('span');
        lbl.className = 'key-label';
        k.appendChild(lbl);
        attach(k, m);
        el.appendChild(k);
        keyByMidi[m] = k;
        // 記錄此白鍵後面的黑鍵
        if (BLACK_AFTER.includes(m % 12) && m + 1 <= END_MIDI){
          blackList.push({ bm: m + 1, whiteIndex });
        }
        whiteIndex++;
      }
    }
    whiteCount = whiteIndex;
    // 再疊上黑鍵（絕對定位）
    blackList.forEach(({ bm }) => {
      const b = document.createElement('div');
      b.className = 'bkey';
      b.dataset.midi = bm;
      const lbl = document.createElement('span');
      lbl.className = 'key-label';
      b.appendChild(lbl);
      attach(b, bm);
      el.appendChild(b);
      keyByMidi[bm] = b;
    });
    layout();
    refresh();
  }

  // 依容器寬度動態決定琴鍵大小，讓兩個八度在 iPad 上完整顯示、不需橫向捲動
  function layout(){
    const wrap = el.parentElement;                       // .piano-wrap
    const avail = Math.max(280, (wrap.clientWidth || 900) - 8);
    let kw = Math.floor(avail / whiteCount);
    kw = Math.max(30, Math.min(64, kw));
    const wh = Math.round(kw * 3.9);                     // 白鍵高
    const bw = Math.round(kw * 0.62);                    // 黑鍵寬
    const bh = Math.round(wh * 0.62);                    // 黑鍵高

    el.style.height = wh + 'px';
    Object.values(keyByMidi).forEach(k => {
      if (k.classList.contains('wkey')){
        k.style.width = kw + 'px';
        k.style.height = wh + 'px';
      }
    });
    blackList.forEach(({ bm, whiteIndex }) => {
      const b = keyByMidi[bm];
      b.style.width = bw + 'px';
      b.style.height = bh + 'px';
      // 黑鍵中心對齊白鍵右緣（白鍵間有 -2px overlap）
      b.style.left = (whiteIndex * (kw - 2) + kw - bw / 2) + 'px';
    });
  }

  function attach(k, m){
    const press = (e) => { e.preventDefault(); hit(m); };
    k.addEventListener('mousedown', press);
    k.addEventListener('touchstart', press, { passive:false });
  }

  function hit(m){
    playMidi(m, 0, 0.8);
    flash(m);
  }
  function flash(m){
    const k = keyByMidi[m];
    if (!k) return;
    k.classList.add('active');
    setTimeout(() => k.classList.remove('active'), 220);
  }

  function recompute(){
    const notes = spellScale(state.root, state.scale);
    scalePcs = new Set(notes.map(n => n.pc));
    rootPc = LETTER_PC[state.root];
    // readout 文字
    readout.innerHTML = '';
    const intro = document.createElement('span');
    intro.textContent = `${state.root} ${SCALE_FORMULAS[state.scale].name}：`;
    readout.appendChild(intro);
    notes.forEach(n => {
      const s = document.createElement('span');
      s.className = 'note-name';
      s.textContent = noteLabel(n, state.labelMode === 'off' ? 'letter' : state.labelMode);
      readout.appendChild(s);
    });
  }

  function refresh(){
    recompute();
    Object.entries(keyByMidi).forEach(([m, k]) => {
      m = +m;
      const pc = m % 12;
      const info = midiToLetter(m);
      k.classList.toggle('in-scale', scalePcs.has(pc));
      k.classList.toggle('root', pc === rootPc && scalePcs.has(pc));
      const lbl = k.querySelector('.key-label');
      if (state.labelMode === 'off'){
        lbl.textContent = '';
      } else if (state.labelMode === 'solfege'){
        lbl.textContent = scalePcs.has(pc) ? '' : '';
        // 唱名只在音階內的鍵顯示比較乾淨
        lbl.textContent = scalePcs.has(pc) ? (SOLFEGE[info.letter] || '') : '';
        if (info.acc) lbl.textContent = scalePcs.has(pc) ? (SOLFEGE[info.letter]+'♯') : '';
      } else {
        lbl.textContent = info.letter + (info.acc ? '♯' : '');
      }
    });
  }

  function playScale(){
    const notes = spellScale(state.root, state.scale);
    // 找出每個音對應的 midi（從主音 octave 4 起，遞增不回頭）
    let baseMidi = LETTER_PC[state.root] + 60;   // root at octave4
    let prevPc = -1, oct = 0;
    const seq = [];
    notes.forEach((n, i) => {
      let midi = 60 + n.pc;
      if (i === 0){ midi = 60 + n.pc; }
      else {
        // 確保往上：若 pc 比前一個小，升八度
        const prev = seq[seq.length-1];
        while (midi <= prev) midi += 12;
      }
      seq.push(midi);
    });
    seq.forEach((m, i) => {
      playMidi(m, i * 0.34, 0.5);
      setTimeout(() => flash(m), i * 340);
    });
  }

  function init(){
    buildSeg(document.getElementById('pianoRoot'),
      ROOTS.map(r => ({ val:r, label:r })), state.root, v => { state.root = v; refresh(); });
    buildSeg(document.getElementById('pianoScale'),
      Object.entries(SCALE_FORMULAS).map(([k,v]) => ({ val:k, label:v.name })), state.scale,
      v => { state.scale = v; refresh(); });

    // label mode 按鈕
    document.querySelectorAll('#pianoLabel .seg-btn').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#pianoLabel .seg-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        state.labelMode = b.dataset.val;
        refresh();
      });
    });

    document.getElementById('playScaleBtn').addEventListener('click', () => { ensureAudio(); playScale(); });

    // 電腦鍵盤
    const down = new Set();
    window.addEventListener('keydown', e => {
      const m = KEYMAP[e.key.toLowerCase()];
      if (m && !down.has(m)){ down.add(m); hit(m); }
    });
    window.addEventListener('keyup', e => {
      const m = KEYMAP[e.key.toLowerCase()];
      if (m) down.delete(m);
    });

    let rT;
    window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(layout, 120); });
    window.addEventListener('orientationchange', () => setTimeout(layout, 250));

    build();
    // 字型載入後重新量測一次
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  }

  return { init };
})();

/* ===========================================================
   5. 圖解音階（note boxes + 全/半音弧線）
   =========================================================== */
const Diagram = (() => {
  const row = document.getElementById('noteRow');
  const svg = document.getElementById('arrowLayer');
  const pill = document.getElementById('keyPill');
  let root = 'C';

  function render(){
    const notes = spellScale(root, 'major');
    pill.textContent = `${root} 大調`;
    row.innerHTML = '';
    const steps = SCALE_FORMULAS.major.steps;   // 2,2,1,2,2,2,1

    notes.forEach((n, i) => {
      const box = document.createElement('div');
      box.className = 'note-box';
      if (n.acc !== 0) box.classList.add('altered');
      if (i === 0 || i === notes.length-1) box.classList.add('root-note');
      box.innerHTML = n.letter + (n.acc ? `<span class="acc">${accSymbol(n.acc)}</span>` : '');

      box.addEventListener('click', () => {
        ensureAudio();
        const midi = 60 + n.pc + (n.pc < notes[0].pc ? 12 : 0);
        playMidi(i === notes.length-1 ? 72 + (n.pc) % 12 : midi, 0, 0.7);
        box.classList.add('active');
        setTimeout(() => box.classList.remove('active'), 200);
      });
      row.appendChild(box);
    });

    requestAnimationFrame(drawArcs);
  }

  const SVGNS = 'http://www.w3.org/2000/svg';
  function drawArcs(){
    const zone = svg.parentElement;               // .note-zone（固定高度，viewBox 1:1）
    const zb = zone.getBoundingClientRect();
    svg.setAttribute('width', zb.width);
    svg.setAttribute('height', zb.height);
    svg.setAttribute('viewBox', `0 0 ${zb.width} ${zb.height}`);
    svg.innerHTML = '';
    const boxes = [...row.children];
    if (!boxes.length) return;
    const steps = SCALE_FORMULAS.major.steps;
    const yTop = boxes[0].getBoundingClientRect().bottom - zb.top + 8;   // 箭線起點
    const dip = 30;

    for (let i = 0; i < boxes.length - 1; i++){
      const a = boxes[i].getBoundingClientRect();
      const b = boxes[i+1].getBoundingClientRect();
      const x1 = a.left - zb.left + a.width/2;
      const x2 = b.left - zb.left + b.width/2;
      const whole = steps[i] === 2;
      const color = whole ? getCss('--coral') : getCss('--green');
      const midX = (x1 + x2) / 2;

      const path = document.createElementNS(SVGNS,'path');
      path.setAttribute('d', `M ${x1+20} ${yTop} Q ${midX} ${yTop+dip} ${x2-24} ${yTop+6}`);
      path.setAttribute('fill','none');
      path.setAttribute('stroke', color);
      path.setAttribute('stroke-width','4');
      path.setAttribute('stroke-linecap','round');
      svg.appendChild(path);

      // 箭頭
      const head = document.createElementNS(SVGNS,'path');
      head.setAttribute('d', `M ${x2-30} ${yTop-2} L ${x2-21} ${yTop+6} L ${x2-32} ${yTop+10} Z`);
      head.setAttribute('fill', color);
      svg.appendChild(head);

      // 全 / 半 文字標籤
      const txt = document.createElementNS(SVGNS,'text');
      txt.setAttribute('x', midX);
      txt.setAttribute('y', yTop + dip + 22);
      txt.setAttribute('text-anchor','middle');
      txt.setAttribute('fill', color);
      txt.setAttribute('font-family',"'Baloo 2','Noto Sans TC',sans-serif");
      txt.setAttribute('font-weight','800');
      txt.setAttribute('font-size','18');
      txt.textContent = whole ? '全音' : '半音';
      svg.appendChild(txt);
    }
  }

  function getCss(v){ return getComputedStyle(document.body).getPropertyValue(v).trim() || '#000'; }

  function init(){
    buildSeg(document.getElementById('diagramRoot'),
      ROOTS.map(r => ({ val:r, label:r + ' 大調' })), root, v => { root = v; render(); });
    render();
    window.addEventListener('resize', () => requestAnimationFrame(drawArcs));
  }
  return { init };
})();

/* ===========================================================
   6. 音階階梯遊戲
   =========================================================== */
const Game = (() => {
  const stage    = document.getElementById('staircase');
  const arrows   = document.getElementById('stairArrows');
  const mascot   = document.getElementById('mascot');
  const vpiano   = document.getElementById('vpiano');
  const promptEl = document.getElementById('gamePrompt');
  const wholeBtn = document.getElementById('wholeBtn');
  const halfBtn  = document.getElementById('halfBtn');
  const scoreEl  = document.getElementById('gameScore');
  const streakEl = document.getElementById('gameStreak');
  const hintToggle = document.getElementById('hintToggle');

  const PATTERN = SCALE_FORMULAS.major.steps;   // [2,2,1,2,2,2,1]
  let root = 'C';
  let placed = [];          // 已放好的音 [{letter,acc,pc}]
  let stepIndex = 0;        // 目前要決定第幾個間距
  let score = 0, streak = 0;
  let busy = false;
  let vkeys = {};           // semitoneOffset(0..12) -> {el, cy, isBlack}
  let climber = null;       // 直式鋼琴上往上爬的指標

  const BLACK_PCS = [1,3,6,8,10];
  function cumOffset(i){ let o = 0; for (let k = 0; k < i; k++) o += PATTERN[k]; return o; }

  function layoutFor(i, total){
    // i:0..total-1，從左下到右上
    const W = stage.clientWidth, H = stage.clientHeight;
    const padX = 70, padY = 60;
    const usableW = W - padX*2, usableH = H - padY*2;
    const x = padX + (usableW) * (i / (total-1));
    const yFromBottom = padY + (usableH) * (i / (total-1));
    return { x, y: H - yFromBottom };
  }

  function placeStep(note, i, kind){
    const total = PATTERN.length + 1;   // 8 個音
    const { x, y } = layoutFor(i, total);
    const div = document.createElement('div');
    let cls = 'stair-step ';
    cls += (i === 0) ? 'root' : (i === total-1 ? 'top' : 'tread');
    div.className = cls;
    div.style.left = x + 'px';
    div.style.top  = y + 'px';
    div.innerHTML = note.letter + (note.acc ? `<span class="acc">${accSymbol(note.acc)}</span>` : '');
    stage.appendChild(div);
    requestAnimationFrame(() => div.classList.add('show'));
    moveMascot(x, y);
    return { x, y };
  }

  function moveMascot(x, y){
    mascot.style.left = x + 'px';
    mascot.style.top  = (y - 46) + 'px';
    mascot.classList.remove('hop'); void mascot.offsetWidth; mascot.classList.add('hop');
  }

  function drawArrow(from, to, whole){
    const color = whole
      ? getComputedStyle(document.body).getPropertyValue('--coral').trim()
      : getComputedStyle(document.body).getPropertyValue('--green').trim();
    const sb = stage.getBoundingClientRect();
    arrows.setAttribute('width', sb.width);
    arrows.setAttribute('height', sb.height);
    arrows.setAttribute('viewBox', `0 0 ${sb.width} ${sb.height}`);
    const midX = (from.x + to.x)/2, midY = (from.y + to.y)/2 - 34;
    const p = document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d', `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`);
    p.setAttribute('fill','none');
    p.setAttribute('stroke', color);
    p.setAttribute('stroke-width','5');
    p.setAttribute('stroke-linecap','round');
    p.style.opacity = 0;
    arrows.appendChild(p);
    requestAnimationFrame(() => { p.style.transition='opacity .3s'; p.style.opacity=1; });
  }

  function currentMidi(noteIdx){
    // 連續往上的 midi
    let midi = 60 + placed[0].pc;
    for (let k=1;k<=noteIdx;k++){ midi += PATTERN[k-1]; }
    return midi;
  }

  // 建立一台「從主音到高八度」的直式鋼琴（低音在下、高音在上）
  function buildVPiano(){
    vpiano.innerHTML = '';
    vkeys = {};
    const H = vpiano.clientHeight || 340;
    const slot = H / 8;                       // 8 個白鍵
    const rootPc = LETTER_PC[root];
    let whiteIndex = 0;

    for (let s = 0; s <= 12; s++){
      const pc = (rootPc + s) % 12;
      const isBlack = BLACK_PCS.includes(pc);
      const k = document.createElement('div');
      let cy;
      if (isBlack){
        const h = slot * 0.62;
        cy = H - whiteIndex * slot;            // 落在前一個白鍵的上緣（兩白鍵交界）
        k.className = 'vkey black';
        k.style.height = h + 'px';
        k.style.top = (cy - h / 2) + 'px';
      } else {
        cy = H - (whiteIndex + 0.5) * slot;
        k.className = 'vkey white';
        k.style.height = slot + 'px';
        k.style.top = (H - (whiteIndex + 1) * slot) + 'px';
        const lab = document.createElement('span');
        lab.className = 'vlabel';
        const sp = pcToSharpSpelling(pc);
        lab.textContent = sp.letter + accSymbol(sp.acc);
        k.appendChild(lab);
        whiteIndex++;
      }
      vpiano.appendChild(k);
      vkeys[s] = { el: k, cy, isBlack };
    }
    // 爬升指標
    climber = document.createElement('div');
    climber.className = 'vclimber';
    vpiano.appendChild(climber);
  }

  // 點亮第 i 個音對應的琴鍵，並讓指標爬上去
  function lightVKey(i, animate){
    const off = cumOffset(i);
    const vk = vkeys[off];
    if (!vk) return;
    Object.values(vkeys).forEach(v => v.el.classList.remove('current'));
    vk.el.classList.add('lit', 'current');
    if (i === 0) vk.el.classList.add('vroot');
    if (climber){
      climber.style.top = vk.cy + 'px';
      if (animate){
        climber.classList.remove('bump'); void climber.offsetWidth; climber.classList.add('bump');
      }
    }
  }

  function reset(){
    placed = []; stepIndex = 0; busy = false;
    stage.innerHTML = '';
    arrows.innerHTML = '';
    buildVPiano();
    const rootNote = { letter: root, acc:0, pc: LETTER_PC[root] };
    placed.push(rootNote);
    placeStep(rootNote, 0, 'root');
    lightVKey(0, false);
    setButtons(true);
    updateStats();
    showPrompt(`小音符站在 ${root} 上囉！現在要往上一階——該選「全音」還是「半音」呢？`, '');
    updateHint();
  }

  function updateHint(){
    if (stepIndex >= PATTERN.length){ return; }
    const correctWhole = PATTERN[stepIndex] === 2;
    if (hintToggle.checked){
      wholeBtn.style.outline = correctWhole ? '4px solid #fff4cf' : 'none';
      halfBtn.style.outline  = !correctWhole ? '4px solid #fff4cf' : 'none';
    } else {
      wholeBtn.style.outline = 'none';
      halfBtn.style.outline  = 'none';
    }
  }

  function choose(whole){
    if (busy || stepIndex >= PATTERN.length) return;
    const correctWhole = PATTERN[stepIndex] === 2;
    const total = PATTERN.length + 1;

    if (whole === correctWhole){
      busy = true;
      // 計算下一個音
      const notes = spellScale(root, 'major');
      const nextNote = notes[stepIndex + 1];
      const i = stepIndex + 1;
      const fromPos = layoutFor(stepIndex, total);
      const toPos   = layoutFor(i, total);
      drawArrow(fromPos, toPos, whole);
      placed.push(nextNote);
      placeStep(nextNote, i, '');
      lightVKey(i, true);                 // 直式鋼琴：琴鍵亮起 + 指標往上爬
      playMidi(currentMidi(i), 0, 0.6);
      chime(true);
      score += hintToggle.checked ? 5 : 10;
      streak += 1;
      stepIndex++;
      updateStats();

      if (stepIndex >= PATTERN.length){
        finish();
      } else {
        showPrompt(`太棒了！這是 ${noteLabel(nextNote,'letter')}（${SOLFEGE[nextNote.letter]||''}）。繼續往上爬！`, 'good');
        setTimeout(() => { busy = false; updateHint(); }, 420);
      }
    } else {
      // 答錯
      mascot.classList.remove('wrong'); void mascot.offsetWidth; mascot.classList.add('wrong');
      chime(false);
      streak = 0; updateStats();
      const need = correctWhole ? '全音' : '半音';
      showPrompt(`再想想看～大調公式是「全 全 半 全 全 全 半」，第 ${stepIndex+1} 步應該是「${need}」喔！`, 'bad');
      updateHint();
    }
  }

  function finish(){
    setButtons(false);
    const notes = placed.map(n => noteLabel(n,'letter')).join('  ');
    showPrompt(`🎉 完成 ${root} 大調音階！${notes}　你蓋出了一整座音階階梯！`, 'good');
    // 播放整段 + 撒花
    placed.forEach((n,i) => playMidi(currentMidi(i), i*0.28, 0.5));
    celebrate();
  }

  function setButtons(on){
    wholeBtn.disabled = !on;
    halfBtn.disabled = !on;
  }
  function showPrompt(t, cls){ promptEl.textContent = t; promptEl.className = 'game-prompt ' + (cls||''); }
  function updateStats(){ scoreEl.textContent = score; streakEl.textContent = streak; }

  function init(){
    buildSeg(document.getElementById('gameRoot'),
      ROOTS.map(r => ({ val:r, label:r })), root, v => { root = v; reset(); });
    wholeBtn.addEventListener('click', () => { ensureAudio(); choose(true); });
    halfBtn.addEventListener('click',  () => { ensureAudio(); choose(false); });
    hintToggle.addEventListener('change', updateHint);
    document.getElementById('resetGameBtn').addEventListener('click', reset);
    const relayout = () => {
      // 重新排版已放好的步階
      const total = PATTERN.length + 1;
      const positions = [];
      [...stage.children].forEach((c, i) => {
        const { x, y } = layoutFor(i, total);
        c.style.left = x+'px'; c.style.top = y+'px';
        positions[i] = { x, y };
        if (i === placed.length-1) moveMascot(x,y);
      });
      // 重畫階梯箭線
      arrows.innerHTML = '';
      for (let i = 0; i < placed.length - 1; i++){
        drawArrow(positions[i], positions[i+1], PATTERN[i] === 2);
      }
      // 重建直式鋼琴並點亮已完成的音
      buildVPiano();
      for (let i = 0; i < placed.length; i++) lightVKey(i, false);
    };
    let gT;
    window.addEventListener('resize', () => { clearTimeout(gT); gT = setTimeout(relayout, 120); });
    window.addEventListener('orientationchange', () => setTimeout(relayout, 250));
    reset();
  }
  return { init };
})();

/* ===========================================================
   7. 撒花特效
   =========================================================== */
function celebrate(){
  const box = document.getElementById('confetti');
  const colors = ['#f2997f','#f7e08c','#9cb87f','#b6cad6','#f3c5cf','#5f743f'];
  for (let i = 0; i < 70; i++){
    const s = document.createElement('span');
    s.style.left = Math.random()*100 + 'vw';
    s.style.background = colors[i % colors.length];
    s.style.animationDuration = (2 + Math.random()*1.8) + 's';
    s.style.animationDelay = (Math.random()*0.5) + 's';
    s.style.transform = `rotate(${Math.random()*360}deg)`;
    box.appendChild(s);
    setTimeout(() => s.remove(), 4200);
  }
}

/* ===========================================================
   8. 啟動
   =========================================================== */
window.addEventListener('DOMContentLoaded', () => {
  Piano.init();
  Diagram.init();
  Game.init();

  // iOS / Safari：第一次觸碰時解鎖音訊
  const unlock = () => {
    const ctx = ensureAudio();
    if (ctx.state === 'suspended') ctx.resume();
    // 播放一個極短的無聲緩衝以喚醒
    try {
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf; src.connect(ctx.destination); src.start(0);
    } catch (e) {}
    window.removeEventListener('touchend', unlock);
    window.removeEventListener('mousedown', unlock);
  };
  window.addEventListener('touchend', unlock, { passive:true });
  window.addEventListener('mousedown', unlock);
});
