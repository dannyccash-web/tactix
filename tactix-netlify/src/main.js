import Phaser from 'phaser';

/*
TACTIX - main.js (stable rebuild)

This version includes:
- New team: PHLOX (purple) with thumbnail assets/phlox-soldier.png
- Team order on Choose Your Team: Azure, Phlox, Vermillion
- Phlox uses Azure roster + MED PACK powerup, but unit 3 is SHOCK TROOPER (lightning bolt icon)
  Shock Trooper stats: cost 6, speed 5, range 1, atk +4, def +3, dmg 4, hp 6
- Shock Trooper stun:
  - On HIT, defender is stunned for their next turn (cannot move or attack)
  - Stunned unit is shown at 50% opacity for that stunned turn (no icon/texture change)
  - Clicking a stunned unit shows a popup that it cannot move or attack this round
- Move/Attack/End Turn buttons always look active; hover brightens outline
- Move button outline = GREEN; End Turn outline = RED (Attack remains amber)
- Purchase points = 12
- Power Ups limited to 5 (only MED PACK for now; teleporter removed)
- Gameplay: Power Ups bar color matches player's team color
- Opponent team is random each game (not player team) and AI roster is randomized to spend max points
- Obstacles are randomly generated each game (still symmetric, max cluster size <= 3)
- Tooltip/overlay text wraps properly (stacked lines, stays inside frame)

Assumes assets exist:
- tactix-title-bg.jpg, tactix-battlefield.jpg, tactix-logo.png
- assets/azure-soldier.png, assets/phlox-soldier.png, assets/vermillion-soldier.png
- assets/audio/tactix-theme.mp3
- assets/blast_1.png, assets/blast_2.png, assets/blast_3.png
*/

(function injectGeoFont(){
  const id = "geo-font-link";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Geo&display=swap";
  document.head.appendChild(link);

  const style = document.createElement("style");
  style.textContent = `body{font-family:"Geo",system-ui,sans-serif;}`;
  document.head.appendChild(style);
})();

const FONT_FAMILY = '"Geo", system-ui, sans-serif';

const UI = {
  h1:     { fontFamily: FONT_FAMILY, fontSize: "34px", color: "#d7e7ff" },
  h2:     { fontFamily: FONT_FAMILY, fontSize: "24px", color: "#ffffff" },
  body:   { fontFamily: FONT_FAMILY, fontSize: "20px", color: "#ffffff" },
  small:  { fontFamily: FONT_FAMILY, fontSize: "16px", color: "#ffffff" },
};

const TOPBAR = { padX: 18, yCenter: 42, backFontPx: 24, logoWidth: 240 };
const SPEAKER_RESERVE_W = 64;

const ATTACK_POP_ROLL_MS  = 900;
const ATTACK_POP_PAUSE_MS = 2000;

const STUNNED_ALPHA = 0.50;

const GAME_DATA = {
  teamColor: null,
  pointsMax: 12,
  roster: [],
  powerUps: []
};

/* ============================
   PLAYER STATS (localStorage)
   ============================ */

const STATS_KEY = "tactix_stats_v2";

// Storage diagnostics (helps when browsers block/evict storage)
let STATS_PERSIST_OK = true;
let STATS_STORAGE_MODE = "localStorage"; // "localStorage" | "memory"
let STATS_STORAGE_ERROR = null;

function _canUseLocalStorage(){
  try{
    if (!("localStorage" in window)) return false;
    const k = "__tactix_ls_test__";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return true;
  }catch(e){
    return false;
  }
}

function requestPersistentStorageBestEffort(){
  // Helps reduce eviction on browsers that support it (won't fix private mode restrictions).
  try{
    if (navigator.storage && navigator.storage.persist){
      navigator.storage.persist().catch(()=>{});
    }
  }catch(e){}
}

function defaultStats(){
  return {
    version: 2,
    wins: 0,
    losses: 0,
    matchesPlayed: 0,
    teamPicks: { azure: 0, phlox: 0, vermillion: 0, citrine: 0 },
    unitPicks: {},
    powerUpPicks: {},
    phloxUnlocked: true,
    mineUnlocked: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function _normalizeStats(parsed){
  const base = defaultStats();
  const out = { ...base, ...(parsed || {}) };
  // ensure nested objects exist
  out.teamPicks = { ...base.teamPicks, ...(out.teamPicks || {}) };
  // legacy typo support
  if (out.teamPicks.vermillio && !out.teamPicks.vermillion){
    out.teamPicks.vermillion = (out.teamPicks.vermillion || 0) + out.teamPicks.vermillio;
  }
  if (out.teamPicks.vermillio) delete out.teamPicks.vermillio;
  out.unitPicks = { ...(out.unitPicks || {}) };
  out.powerUpPicks = { ...(out.powerUpPicks || {}) };
  out.phloxUnlocked = !!out.phloxUnlocked;
  out.mineUnlocked = !!out.mineUnlocked;
  out.version = 2;
  out.createdAt = out.createdAt || base.createdAt;
  out.updatedAt = out.updatedAt || base.updatedAt;
  return out;
}

function loadStats(){
  requestPersistentStorageBestEffort();

  // Prefer localStorage when it truly works
  const lsOk = _canUseLocalStorage();
  if (!lsOk){
    STATS_PERSIST_OK = false;
    STATS_STORAGE_MODE = "memory";
    STATS_STORAGE_ERROR = "localStorage unavailable (private mode, blocked storage, or file:// restrictions).";
    return defaultStats();
  }

  try{
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return defaultStats();
    const parsed = JSON.parse(raw);
    return _normalizeStats(parsed);
  }catch(e){
    // If parsing or access fails, fall back safely
    STATS_PERSIST_OK = false;
    STATS_STORAGE_MODE = "memory";
    STATS_STORAGE_ERROR = String(e && (e.name || e.message) ? (e.name || e.message) : e);
    return defaultStats();
  }
}

function saveStats(stats){
  // Always update the in-memory object (used for UI immediately)
  try{
    stats.updatedAt = new Date().toISOString();
  }catch(e){}

  if (STATS_STORAGE_MODE !== "localStorage") return;

  try{
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }catch(e){
    // If saving fails (Safari private mode often throws QuotaExceededError), stop trying so we don't break gameplay.
    STATS_PERSIST_OK = false;
    STATS_STORAGE_MODE = "memory";
    STATS_STORAGE_ERROR = String(e && (e.name || e.message) ? (e.name || e.message) : e);
  }
}

function favoriteKeyFromCounts(counts){
  let bestKey = null;
  let bestVal = -Infinity;
  for (const [k,v] of Object.entries(counts || {})){
    const n = Number(v) || 0;
    if (n > bestVal){
      bestVal = n;
      bestKey = k;
    }
  }
  return bestVal > 0 ? bestKey : null;
}

let STATS = loadStats();
// Ensure unlock flags match win totals, even if older saves are missing flags
syncUnlocksFromWins();
let MATCH_CTX = null;

function beginMatch(team){
  MATCH_CTX = { team, unitsPicked: {}, startedAt: Date.now() };
  if (team && STATS.teamPicks){
    STATS.teamPicks[team] = (Number(STATS.teamPicks[team]) || 0) + 1;
  }
  saveStats(STATS);
}

function recordUnitPick(unitDef){
  if (!unitDef) return;
  const id = unitDef.id || unitDef.name || "unknown";
  // per-match
  if (MATCH_CTX){
    MATCH_CTX.unitsPicked[id] = (Number(MATCH_CTX.unitsPicked[id]) || 0) + 1;
  }
  // lifetime
  STATS.unitPicks[id] = (Number(STATS.unitPicks[id]) || 0) + 1;
  saveStats(STATS);
}

function endMatch(didWin){
  if (!MATCH_CTX) return;
  STATS.matchesPlayed = (Number(STATS.matchesPlayed) || 0) + 1;

  if (didWin) STATS.wins = (Number(STATS.wins) || 0) + 1;
  else STATS.losses = (Number(STATS.losses) || 0) + 1;

  // Unlock MINE after 3 wins (show the unlock modal once)
  const winsNow = Number(STATS.wins) || 0;
  if (winsNow >= 3 && false){
    STATS.mineUnlocked = true;
    STATS.mineUnlockPending = false;
  }

  // Unlock PHLOX after 5 wins (show the unlock modal once)
  if (winsNow >= 5 && false){
    STATS.phloxUnlocked = true;
    STATS.phloxUnlockPending = false;
  }

  STATS.lastPlayed = new Date().toISOString();
  saveStats(STATS);
  MATCH_CTX = null;
}


function getStatsSummary(){
  const favTeamKey = favoriteKeyFromCounts(STATS.teamPicks);
  const favUnitKey = favoriteKeyFromCounts(STATS.unitPicks);
  const favTeam = favTeamKey ? teamName(favTeamKey) : "—";
  const favUnit = favUnitKey ? (BASE_UNITS[favUnitKey]?.name || favUnitKey.toUpperCase()) : "—";
  return {
    wins: Number(STATS.wins) || 0,
    losses: Number(STATS.losses) || 0,
    matchesPlayed: Number(STATS.matchesPlayed) || 0,
    favoriteTeam: favTeam,
    favoriteUnit: favUnit,
  };
}


function isPhloxUnlocked(){
  const wins = Number(STATS.wins) || 0;
  return !false || wins >= 5;
}


function syncUnlocksFromWins(){
  const w = Number(STATS.wins) || 0;
  const prevMine = !false;
  const prevPhlox = !false;

  // Unlocks are based purely on wins (what the player sees on the stats screen)
  if (w >= 3) STATS.mineUnlocked = true;
  if (w >= 5) STATS.phloxUnlocked = true;

  // If we changed anything, persist it (best-effort)
  if (STATS.mineUnlocked !== prevMine || STATS.phloxUnlocked !== prevPhlox){
    try{ saveStats(STATS); }catch(e){}
  }
}


function consumePhloxUnlockPending(){
  if (STATS.phloxUnlockPending){
    STATS.phloxUnlockPending = false;
    saveStats(STATS);
    return true;
  }
  return false;
}


function isMineUnlocked(){
  const wins = Number(STATS.wins) || 0;
  return !false || wins >= 3;
}

function consumeMineUnlockPending(){
  if (STATS.mineUnlockPending){
    STATS.mineUnlockPending = false;
    saveStats(STATS);
    return true;
  }
  return false;
}


function resetStats(){
  STATS = defaultStats();
  saveStats(STATS);
}


const TEAMS = ["azure", "phlox", "vermillion"];

function teamColorHex(team) {
  if (team === "vermillion") return 0xef4444;
  if (team === "phlox") return 0xa855f7;
  return 0x3b82f6;
}
function teamName(team) {
  if (team === "vermillion") return "VERMILLION";
  if (team === "phlox") return "PHLOX";
  return "AZURE";
}
function randomOtherTeam(team){
  // Exclude PHLOX as an opponent until the player has unlocked it (5 wins).
  let choices = TEAMS.filter(t => t !== team);
  if (!(STATS && STATS.phloxUnlocked)){
    choices = choices.filter(t => t !== "phlox");
  }
  // Safety fallback (shouldn't happen, but keeps game from crashing)
  if (choices.length === 0){
    choices = TEAMS.filter(t => t !== team);
  }
  return choices[Math.floor(Math.random() * choices.length)];
}

function scaleImageToCover(img, screenW, screenH) {
  const sx = screenW / img.width;
  const sy = screenH / img.height;
  img.setScale(Math.max(sx, sy));
}

/* ============================
   MUSIC
   ============================ */

function ensureBGM(scene, key, volume){
  if (!scene.cache.audio.exists(key)) return;

  const muted = !!scene.game._muted;
  scene.sound.mute = muted;

  // Already playing this track
  if (scene.game._bgm && scene.game._bgmKey === key){
    scene.game._bgm.setVolume(volume);
    if (!scene.game._bgm.isPlaying) scene.game._bgm.play();
    return;
  }

  // Swap tracks
  if (scene.game._bgm){
    try { scene.game._bgm.stop(); } catch(e){}
    try { scene.game._bgm.destroy(); } catch(e){}
    scene.game._bgm = null;
  }

  const music = scene.sound.add(key, { loop: true, volume });
  scene.game._bgm = music;
  scene.game._bgmKey = key;
  music.play();
}

function ensureMusicStarted(scene){
  // Non-gameplay screens use the theme
  ensureBGM(scene, "music_theme", 0.35);
}

function ensureBattleMusicStarted(scene){
  // Gameplay uses the score, a bit quieter than the theme
  ensureBGM(scene, "music_score", 0.26);
}

function setMuted(scene, muted){
  scene.game._muted = muted;
  scene.sound.mute = muted;
}



function playSFX(scene, key, volume = 0.85, duck = true){
  if (!scene || !scene.sound) return;
  if (scene.sound.mute) return;
  if (!scene.cache || !scene.cache.audio || !scene.cache.audio.exists(key)) return;

  // Duck background music briefly so SFX are always audible.
  const bgm = scene.game && scene.game._bgm ? scene.game._bgm : null;
  const restoreVol = (bgm && bgm.isPlaying) ? bgm.volume : null;
  if (duck && bgm && bgm.isPlaying){
    bgm.setVolume(Math.max(0, restoreVol * 0.35));
  }

  const s = scene.sound.add(key, { volume });
  s.once("complete", () => {
    try { s.destroy(); } catch(e){}
    if (duck && bgm && bgm.isPlaying && restoreVol !== null){
      bgm.setVolume(restoreVol);
    }
  });
  s.play();
}

function makeSpeakerToggle(scene){
  const container = scene.add.container(0, 0).setDepth(1300);
  const g = scene.add.graphics();
  container.add(g);

  const hit = scene.add.rectangle(0, 0, 44, 34, 0x000000, 0)
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });
  container.add(hit);

  const draw = () => {
    g.clear();

    g.fillStyle(0x0f1720, 0.55);
    g.fillRoundedRect(-22, -17, 44, 34, 8);

    g.lineStyle(2, 0x5aa9ff, 0.35);
    g.strokeRoundedRect(-22, -17, 44, 34, 8);

    g.fillStyle(0xffffff, 0.9);
    g.fillRoundedRect(-14, -6, 8, 12, 2);
    g.beginPath();
    g.moveTo(-6, -10);
    g.lineTo(4, -5);
    g.lineTo(4, 5);
    g.lineTo(-6, 10);
    g.closePath();
    g.fillPath();

    if (!scene.sound.mute){
      g.lineStyle(2, 0xffffff, 0.85);
      g.beginPath();
      g.arc(6, 0, 7, -0.7, 0.7, false);
      g.strokePath();

      g.lineStyle(2, 0xffffff, 0.60);
      g.beginPath();
      g.arc(6, 0, 11, -0.7, 0.7, false);
      g.strokePath();
    } else {
      g.lineStyle(3, 0xef4444, 0.85);
      g.beginPath();
      g.moveTo(8, -10);
      g.lineTo(18, 10);
      g.strokePath();
    }
  };

  const layout = () => {
    container.setPosition(scene.scale.width - TOPBAR.padX - 22, TOPBAR.yCenter);
    draw();
  };

  hit.on("pointerdown", () => {
    scene.sound.context?.resume?.();
    const nowMuted = !scene.sound.mute;
    setMuted(scene, nowMuted);
    draw();
  });

  scene.scale.on("resize", layout);
  layout();

  return { container, hit, layout, redraw: draw, width: 44, height: 34 };
}

function makeTextButton(scene, label, opts){
  const {
    fontSize = 18,
    padX = 14,
    padY = 8,
    radius = 10,
    fillColor = 0x0f1720,
    fillAlpha = 0.55,
    strokeColor = 0x5aa9ff,
    strokeAlpha = 0.35,
    textColor = "#ffffff"
  } = opts || {};

  const container = scene.add.container(0, 0).setDepth(1300);
  const g = scene.add.graphics();
  container.add(g);

  const text = scene.add.text(0, 0, label, {
    fontFamily: FONT_FAMILY,
    fontSize: `${fontSize}px`,
    color: textColor
  }).setOrigin(0.5);
  container.add(text);

  const w = Math.ceil(text.width + padX * 2);
  const h = Math.ceil(text.height + padY * 2);

  const hit = scene.add.rectangle(0, 0, w, h, 0x000000, 0).setOrigin(0.5)
    .setInteractive({ useHandCursor: true });
  container.add(hit);

  const draw = () => {
    g.clear();
    g.fillStyle(fillColor, fillAlpha);
    g.fillRoundedRect(-w/2, -h/2, w, h, radius);
    g.lineStyle(2, strokeColor, strokeAlpha);
    g.strokeRoundedRect(-w/2, -h/2, w, h, radius);
  };
  draw();

  return { container, text, hit, width: w, height: h, redraw: draw };
}

function openStatsOverlay(scene){
  // Ensure stats exist
  const favTeamKey = favoriteKeyFromCounts(STATS.teamPicks);
  const favUnitKey = favoriteKeyFromCounts(STATS.unitPicks);

  const teamKey = favTeamKey || "azure";
  const unitKey = favUnitKey || "infantry";
  const unitDef = BASE_UNITS[unitKey];

  const overlay = scene.add.container(0, 0).setDepth(6000);

  const backdrop = scene.add.rectangle(0, 0, 10, 10, 0x000000, 0.65)
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });
  overlay.add(backdrop);

  const panelG = scene.add.graphics();
  overlay.add(panelG);

  const title = scene.add.text(0, 0, "PLAYER STATS", {
    fontFamily: FONT_FAMILY,
    fontSize: "36px",
    color: "#ffffff"
  }).setOrigin(0.5);
  overlay.add(title);

  // If storage is blocked (common in some private/incognito modes), stats won't persist.
  if (!STATS_PERSIST_OK){
    const warn = scene.add.text(0, 0, "Note: This browser appears to be blocking storage, so stats may reset.", {
      fontFamily: FONT_FAMILY,
      fontSize: "16px",
      color: "#ffd166",
      align: "center",
      wordWrap: { width: 520 }
    }).setOrigin(0.5);
    overlay.add(warn);
    warn._statsWarn = true;
  }

  const closeBtn = makeTextButton(scene, "✕", { fontSize: 18, padX: 10, padY: 8, strokeAlpha: 0.25 });
  closeBtn.container.setDepth(6001);
  overlay.add(closeBtn.container);

  const lines = [];
  function addLine(labelText, valueObj){
    const label = scene.add.text(0, 0, labelText, { fontFamily: FONT_FAMILY, fontSize: "24px", color: "#cbd5e1" }).setOrigin(0, 0.5).setAlpha(0.95);
    overlay.add(label);
    overlay.add(valueObj);
    lines.push({ label, valueObj });
  }

  const winsVal = scene.add.text(0, 0, String(Number(STATS.wins) || 0), { fontFamily: FONT_FAMILY, fontSize: "24px", color: "#ffffff" }).setOrigin(0, 0.5);
  const lossesVal = scene.add.text(0, 0, String(Number(STATS.losses) || 0), { fontFamily: FONT_FAMILY, fontSize: "24px", color: "#ffffff" }).setOrigin(0, 0.5);
  const matchesVal = scene.add.text(0, 0, String(Number(STATS.matchesPlayed) || 0), { fontFamily: FONT_FAMILY, fontSize: "24px", color: "#ffffff" }).setOrigin(0, 0.5);

  const teamNameTxt = scene.add.text(0, 0, favTeamKey ? teamName(favTeamKey) : "—", {
    fontFamily: FONT_FAMILY,
    fontSize: "24px",
    color: favTeamKey ? Phaser.Display.Color.IntegerToColor(teamColorHex(favTeamKey)).rgba : "#ffffff"
  }).setOrigin(0, 0.5);

  // Favorite unit display: badge + name
  const unitGroup = scene.add.container(0, 0);
  let unitBadge = null;
  const badgeKey = `badge_${teamKey}_${unitKey}`;
  if (scene.textures.exists(badgeKey)){
    unitBadge = scene.add.image(0, 0, badgeKey).setOrigin(0, 0.5).setScale(0.36);
    unitGroup.add(unitBadge);
  }
  const unitNameStr = favUnitKey ? (unitDef?.name || favUnitKey.toUpperCase()) : "—";
  const unitNameTxt = scene.add.text(0, 0, unitNameStr, { fontFamily: FONT_FAMILY, fontSize: "24px", color: "#ffffff" }).setOrigin(0, 0.5);
  unitGroup.add(unitNameTxt);

  addLine("Wins", winsVal);
  addLine("Losses", lossesVal);
  addLine("Matches Played", matchesVal);
  addLine("Favorite Team", teamNameTxt);
  addLine("Favorite Unit", unitGroup);

  const deco = scene.add.graphics();
  overlay.add(deco);

  const layout = () => {
    const w = scene.scale.width, h = scene.scale.height;
    const cx = w/2, cy = h/2;

    backdrop.setPosition(cx, cy);
    backdrop.setSize(w, h);

    // Panel sizing
    const panelW = Math.min(640, w - 60);
    const panelH = Math.min(520, h - 120);
    const left = cx - panelW/2;
    const top = cy - panelH/2;

    panelG.clear();
    panelG.fillStyle(0x0b1020, 0.92);
    panelG.fillRoundedRect(left, top, panelW, panelH, 18);
    panelG.lineStyle(2, 0x5aa9ff, 0.35);
    panelG.strokeRoundedRect(left, top, panelW, panelH, 18);

    title.setPosition(cx, top + 44);
    const warn = overlay.list.find(o => o && o._statsWarn);
    if (warn) warn.setPosition(cx, top + 70);

    // close button
    closeBtn.container.setPosition(left + panelW - 26, top + 26);

    // decorative divider
    deco.clear();
    deco.lineStyle(2, 0xffffff, 0.10);
    deco.beginPath();
    deco.moveTo(left+24, top+86);
    deco.lineTo(left+panelW-24, top+86);
    deco.strokePath();

    // rows
    const rowLeft = left + 42;
    const valueLeft = left + Math.floor(panelW*0.58);
    const rowTop = top + 126;
    const rowGap = 60;

    lines.forEach((r, i) => {
      const y = rowTop + i * rowGap;
      r.label.setPosition(rowLeft, y);

      if (r.valueObj === unitGroup){
        unitGroup.setPosition(valueLeft, y);
        if (unitBadge){
          unitBadge.setPosition(0, 0);
          unitNameTxt.setPosition(44, 0);
        } else {
          unitNameTxt.setPosition(0, 0);
        }
      } else {
        r.valueObj.setPosition(valueLeft, y);
      }
    });
  };

  const close = () => {
    overlay.destroy(true);
    scene.scale.off("resize", layout);
  };

  closeBtn.hit.on("pointerdown", close);
  backdrop.on("pointerdown", close);

  scene.scale.on("resize", layout);
  layout();
}


function showPhloxUnlockOverlay(scene, opts={}){
  const w = scene.scale.width, h = scene.scale.height;
  const cx = w/2, cy = h/2;

  const buttonLabel = opts.buttonLabel || "LET'S GO";
  const nextScene = opts.nextScene || "TeamSelectScene";
  const onGo = (typeof opts.onGo === "function") ? opts.onGo : null;


  const overlay = scene.add.container(0,0).setDepth(5000);

  const backdrop = scene.add.rectangle(cx, cy, w, h, 0x000000, 0.70)
    .setInteractive({ useHandCursor: true });
  overlay.add(backdrop);

  const panelW = Math.min(760, w * 0.86);
  const panelH = Math.min(620, h * 0.80);

  const panel = scene.add.rectangle(cx, cy, panelW, panelH, 0x0b1220, 0.95);
  panel.setStrokeStyle(3, teamColorHex("phlox"), 0.55);
  overlay.add(panel);

  const title = scene.add.text(cx, cy - panelH/2 + 56, "CONGRATULATIONS!", {
    fontFamily: FONT_FAMILY,
    fontSize: "46px",
    color: "#ffffff"
  }).setOrigin(0.5);
  overlay.add(title);

  // Purple hex with the Phlox thumbnail inside (similar to the team select cards)
  const hexR = 110;
  const hexX = cx;
  const hexY = cy - 40;

  const g = scene.add.graphics();
  g.fillStyle(0x0b1220, 0.70);
  g.lineStyle(6, teamColorHex("phlox"), 0.95);

  const pts = [];
  for (let i=0;i<6;i++){
    const a = Phaser.Math.DegToRad(60*i);
    pts.push({ x: hexX + hexR*Math.cos(a), y: hexY + hexR*Math.sin(a) });
  }
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i=1;i<6;i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
  g.fillPath();
  g.strokePath();
  overlay.add(g);

  const img = scene.add.image(hexX, hexY, "thumbPhlox").setOrigin(0.5);
  const innerR = hexR * 0.88;
  const sx = (innerR*2)/img.width;
  const sy = (innerR*2)/img.height;
  img.setScale(Math.max(sx, sy));

  const maskG = scene.make.graphics({ x: 0, y: 0, add: false });
  const innerPts = [];
  for (let i=0;i<6;i++){
    const a = Phaser.Math.DegToRad(60*i);
    innerPts.push({ x: hexX + innerR*Math.cos(a), y: hexY + innerR*Math.sin(a) });
  }
  maskG.fillStyle(0xffffff, 1);
  maskG.beginPath();
  maskG.moveTo(innerPts[0].x, innerPts[0].y);
  for (let i=1;i<6;i++) maskG.lineTo(innerPts[i].x, innerPts[i].y);
  maskG.closePath();
  maskG.fillPath();
  img.setMask(maskG.createGeometryMask());
  overlay.add(img);

  const body = scene.add.text(cx, cy + 110, "You've unlocked a new team.", {
    fontFamily: FONT_FAMILY,
    fontSize: "26px",
    color: "#dbeafe"
  }).setOrigin(0.5);
  overlay.add(body);

  const btnY = cy + panelH/2 - 70;
  const btn = makeButton(scene, cx, btnY, 260, 62, "LET'S GO", () => {
    // Clear the pending flag and go straight to team select
    consumePhloxUnlockPending();
    overlay.destroy(true);
    scene.scene.start("TeamSelectScene");
  }, teamColorHex("phlox"), 26);

  const close = () => {
    overlay.destroy(true);
  };

  // Clicking outside does nothing special (keeps the intended flow), but allow closing if needed.
  backdrop.on("pointerdown", close);

  // Re-layout on resize
  const layout = () => {
    const ww = scene.scale.width, hh = scene.scale.height;
    backdrop.setPosition(ww/2, hh/2);
    backdrop.setSize(ww, hh);
  };
  scene.scale.on("resize", layout);
  overlay.once("destroy", () => scene.scale.off("resize", layout));
}


function showMineUnlockOverlay(scene, opts={}){
  const w = scene.scale.width, h = scene.scale.height;
  const cx = w/2, cy = h/2;

  const buttonLabel = opts.buttonLabel || "LET'S GO";
  const nextScene = opts.nextScene || "TeamSelectScene";
  const onGo = (typeof opts.onGo === "function") ? opts.onGo : null;


  // Ensure badge textures exist for display
  for (const t of TEAMS){
    ensurePowerUpBadges(scene, t);
  }

  const overlay = scene.add.container(0,0).setDepth(5000);

  const backdrop = scene.add.rectangle(cx, cy, w, h, 0x000000, 0.70)
    .setInteractive({ useHandCursor: true });
  overlay.add(backdrop);

  const panelW = Math.min(720, w * 0.86);
  const panelH = Math.min(520, h * 0.78);

  const panel = scene.add.rectangle(cx, cy, panelW, panelH, 0x0b1220, 0.95);
  panel.setStrokeStyle(4, 0xffffff, 0.10);
  overlay.add(panel);

  const title = scene.add.text(cx, cy - panelH/2 + 56, "CONGRATULATIONS!", {
    fontFamily: FONT_FAMILY,
    fontSize: "44px",
    fontStyle: "800",
    color: "#ffffff"
  }).setOrigin(0.5);
  overlay.add(title);

  // Mine icon badge
  const badgeKey = `pwr_azure_mine`;
  const badge = scene.add.image(cx, cy - 30, badgeKey).setOrigin(0.5);
  badge.setScale(1.25);
  overlay.add(badge);

  const body = scene.add.text(cx, cy + 62,
    "YOU'VE UNLOCKED A NEW POWER UP:\nMINE\n\nPlace it on any empty hex.\nUnits that step on (or cross) it take 2 damage,\nand adjacent units take 1 damage.",
    {
      fontFamily: FONT_FAMILY,
      fontSize: "22px",
      color: "#dbeafe",
      align: "center",
      lineSpacing: 8,
      wordWrap: { width: panelW - 100 }
    }
  ).setOrigin(0.5);
  overlay.add(body);

  const btnY = cy + panelH/2 - 70;
  const btn = makeButton(scene, cx, btnY, 280, 62, buttonLabel, () => {
    consumeMineUnlockPending();
    overlay.destroy(true);
    if (onGo) onGo();
    else scene.scene.start(nextScene);
  }, 0x22c55e, 26);

  overlay.add(btn.container);

  const close = () => overlay.destroy(true);
  backdrop.on("pointerdown", close);

  const layout = () => {
    const ww = scene.scale.width, hh = scene.scale.height;
    backdrop.setPosition(ww/2, hh/2);
    backdrop.setSize(ww, hh);
    panel.setPosition(ww/2, hh/2);
    title.setPosition(ww/2, hh/2 - panelH/2 + 56);
    badge.setPosition(ww/2, hh/2 - 30);
    body.setPosition(ww/2, hh/2 + 62);
  };
  scene.scale.on("resize", layout);
  overlay.once("destroy", () => scene.scale.off("resize", layout));
}


/* ============================
   UNITS / POWER UPS
   ============================ */

const BASE_UNITS = {
  infantry:  { id: "infantry",  name: "INFANTRY",      cost: 2, speed: 5, range: 2, atk: 1, def: 1, dmg: 2, hp: 5 },
  sniper:    { id: "sniper",    name: "SNIPER",        cost: 4, speed: 3, range: 5, atk: 3, def: 0, dmg: 3, hp: 4 },
  grenadier: { id: "grenadier", name: "GRENADIER",     cost: 6, speed: 2, range: 4, atk: 2, def: 3, dmg: 5, hp: 6 },
  elite:     { id: "elite",     name: "ELITE",         cost: 6, speed: 7, range: 3, atk: 5, def: 2, dmg: 4, hp: 6 },
  shock:     { id: "shock",     name: "SHOCK TROOPER", cost: 6, speed: 5, range: 1, atk: 4, def: 3, dmg: 3, hp: 6 },
};

const POWER_UPS = {
  med:  { id: "med",  name: "MED PACK", cost: 1, desc: "RESTORE 3 HP (ONE TIME)" },
  mine: { id: "mine", name: "MINE",     cost: 1, desc: "PLACE A MINE (2 DMG + SPLASH)" },
};
const POWERUP_LIMIT = 5;

function catalogForTeam(team){
  if (team === "vermillion"){
    return [ { ...BASE_UNITS.infantry }, { ...BASE_UNITS.sniper }, { ...BASE_UNITS.grenadier } ];
  }
  if (team === "phlox"){
    return [ { ...BASE_UNITS.infantry }, { ...BASE_UNITS.sniper }, { ...BASE_UNITS.shock } ];
  }
  return [ { ...BASE_UNITS.infantry }, { ...BASE_UNITS.sniper }, { ...BASE_UNITS.elite } ];
}

/* Maps an arbitrary unit to the correct roster for the target team */
function mapUnitToTeam(unit, team){
  if (team === "azure"){
    if (unit.id === "grenadier" || unit.id === "shock") return { ...BASE_UNITS.elite };
    if (unit.id === "elite") return { ...BASE_UNITS.elite };
  }
  if (team === "vermillion"){
    if (unit.id === "elite" || unit.id === "shock") return { ...BASE_UNITS.grenadier };
    if (unit.id === "grenadier") return { ...BASE_UNITS.grenadier };
  }
  if (team === "phlox"){
    if (unit.id === "elite" || unit.id === "grenadier") return { ...BASE_UNITS.shock };
    if (unit.id === "shock") return { ...BASE_UNITS.shock };
  }
  if (unit.id === "infantry") return { ...BASE_UNITS.infantry };
  if (unit.id === "sniper") return { ...BASE_UNITS.sniper };
  return { ...unit };
}

/* ============================
   BUTTONS / TOPBAR
   ============================ */

function makeButton(scene, x, y, w, h, label, onClick, accentColor = 0x5aa9ff, fontSize = 30) {
  const container = scene.add.container(x, y).setDepth(500);
  const g = scene.add.graphics();
  const text = scene.add.text(0, 0, label, {
    fontFamily: FONT_FAMILY,
    fontSize: `${fontSize}px`,
    color: "#ffffff"
  }).setOrigin(0.5);

  const hit = scene.add.rectangle(0, 0, w, h, 0x000000, 0)
    .setInteractive({ useHandCursor: true });

  const isDisabled = (typeof onClick !== "function");
  if (isDisabled){
    hit.disableInteractive();
    hit.input && (hit.input.cursor = "default");
  }

  function draw(isHover) {
    g.clear();
    g.fillStyle(0x0b1220, isDisabled ? 0.55 : (isHover ? 0.92 : 0.78));
    g.fillRoundedRect(-w/2, -h/2, w, h, 10);
    g.lineStyle(3, isDisabled ? 0x64748b : accentColor, isDisabled ? 0.35 : (isHover ? 0.90 : 0.45));
    g.strokeRoundedRect(-w/2, -h/2, w, h, 10);
  }
  draw(false);

  if (!isDisabled){
    hit.on("pointerover", () => draw(true));
    hit.on("pointerout", () => draw(false));
    hit.on("pointerdown", () => onClick());
  }

  container.add([g, text, hit]);
  return { container, destroy: () => container.destroy(true) };
}

function arrowPolyPoints(w,h){
  const hw = w/2, hh = h/2;
  const tip = Math.min(26, Math.floor(w*0.18));
  return [
    -hw, -hh,
    hw - tip, -hh,
    hw, 0,
    hw - tip, hh,
    -hw, hh
  ];
}

function makeArrowButton(scene, x, y, w, h, label, onClick, accentColor, fontSize=22, isDisabled=false){
  const container = scene.add.container(x, y).setDepth(600);
  const g = scene.add.graphics();
  const text = scene.add.text(0, 0, label, {
    fontFamily: FONT_FAMILY,
    fontSize: `${fontSize}px`,
    color: "#ffffff"
  }).setOrigin(0.5);

  const hit = scene.add.polygon(0,0, arrowPolyPoints(w,h), 0x000000, 0)
    .setInteractive({ useHandCursor: true });

  // Optional disabled state (prevents hover/click + shows dimmed UI)
  if (isDisabled){
    if (hit.disableInteractive) hit.disableInteractive();
    container.setAlpha(0.55);
  }


  function draw(isHover){
    g.clear();
    g.fillStyle(0x0b1220, 0.88);
    g.beginPath();
    const pts = arrowPolyPoints(w,h);
    g.moveTo(pts[0], pts[1]);
    for (let i=2;i<pts.length;i+=2) g.lineTo(pts[i], pts[i+1]);
    g.closePath();
    g.fillPath();

    g.lineStyle(3, accentColor, isHover ? 0.98 : 0.62);
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i=2;i<pts.length;i+=2) g.lineTo(pts[i], pts[i+1]);
    g.closePath();
    g.strokePath();
  }

  draw(false);
  if (!isDisabled){
    hit.on("pointerover", () => draw(true));
    hit.on("pointerout", () => draw(false));
    hit.on("pointerdown", () => onClick());
  }

  container.add([g, text, hit]);
  return { container, redraw: draw };
}

function makeTopbar(scene, opts){
  const { showLogo = true, showBack = true, backTarget = "TitleScene" } = opts || {};
  const y = TOPBAR.yCenter;

  let logoImg = null;
  if (showLogo){
    logoImg = scene.add.image(TOPBAR.padX, y, "logo").setOrigin(0, 0.5).setDepth(1200);
    logoImg.setScale(TOPBAR.logoWidth / logoImg.width);
  }

  let backText = null;
  if (showBack){
    backText = scene.add.text(0, y, "← BACK", {
      fontFamily: FONT_FAMILY,
      fontSize: `${TOPBAR.backFontPx}px`,
      color: "#ffffff"
    }).setOrigin(1, 0.5).setDepth(1200)
      .setInteractive({ useHandCursor: true });

    backText.on("pointerdown", () => scene.scene.start(backTarget));
  }

  const api = {
    logo: logoImg,
    back: backText,
    backXFn: (opts && opts.backXFn) ? opts.backXFn : null,
    layout: () => {
      const w2 = scene.scale.width;
      if (logoImg) logoImg.setPosition(TOPBAR.padX, TOPBAR.yCenter);
      if (backText) {
        const bx = api.backXFn ? api.backXFn(w2) : (w2 - TOPBAR.padX - SPEAKER_RESERVE_W);
        backText.setPosition(bx, TOPBAR.yCenter);
      }
    }
  };

  api.layout();
  scene.scale.on("resize", api.layout);
  return api;
}

/* ============================
   ICONS / BADGES
   ============================ */

function hexLocalPoints(radius) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = Phaser.Math.DegToRad(60 * i);
    pts.push({ x: radius * Math.cos(a), y: radius * Math.sin(a) });
  }
  return pts;
}

function drawIcon(g, id, x, y, size, color, alpha=1){
  g.fillStyle(color, alpha);
  g.lineStyle(2, color, alpha);

  const s = size;

  if (id === "infantry"){
    // handgun-ish
    g.fillRoundedRect(x - s*0.46, y - s*0.18, s*0.70, s*0.22, 4);
    g.fillRoundedRect(x + s*0.22, y - s*0.16, s*0.20, s*0.12, 3);
    g.fillRoundedRect(x - s*0.10, y - s*0.02, s*0.30, s*0.18, 4);
    g.fillRoundedRect(x - s*0.06, y + s*0.10, s*0.18, s*0.30, 4);
    g.fillRoundedRect(x + s*0.08, y + s*0.12, s*0.14, s*0.10, 4);
  } else if (id === "sniper"){
    g.strokeCircle(x, y, s*0.42);
    g.strokeCircle(x, y, s*0.18);
    g.beginPath(); g.moveTo(x - s*0.55, y); g.lineTo(x + s*0.55, y); g.strokePath();
    g.beginPath(); g.moveTo(x, y - s*0.55); g.lineTo(x, y + s*0.55); g.strokePath();
  } else if (id === "grenadier"){
    g.fillRoundedRect(x - s*0.25, y - s*0.10, s*0.50, s*0.62, 8);
    g.fillRoundedRect(x - s*0.18, y - s*0.30, s*0.36, s*0.18, 6);
    g.fillRoundedRect(x + s*0.10, y - s*0.32, s*0.18, s*0.10, 4);
    g.fillCircle(x + s*0.26, y - s*0.18, s*0.06);
  } else if (id === "elite"){
    const pts = [];
    const spikes = 5;
    const outer = s*0.48;
    const inner = s*0.20;
    for (let i=0;i<spikes*2;i++){
      const r = (i%2===0) ? outer : inner;
      const a = -Math.PI/2 + (Math.PI/spikes)*i;
      pts.push({x: x + Math.cos(a)*r, y: y + Math.sin(a)*r});
    }
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i=1;i<pts.length;i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
    g.fillPath();
  } else if (id === "shock"){
    // lightning bolt
    g.beginPath();
    g.moveTo(x - s*0.10, y - s*0.52);
    g.lineTo(x + s*0.18, y - s*0.10);
    g.lineTo(x + s*0.02, y - s*0.10);
    g.lineTo(x + s*0.14, y + s*0.52);
    g.lineTo(x - s*0.22, y + s*0.06);
    g.lineTo(x - s*0.04, y + s*0.06);
    g.closePath();
    g.fillPath();
  } else if (id === "pwr_med"){
    const w = s*0.18;
    const L = s*0.55;
    g.fillRoundedRect(x - w/2, y - L/2, w, L, 4);
    g.fillRoundedRect(x - L/2, y - w/2, L, w, 4);
  } else if (id === "pwr_mine"){
    // Stylized mine icon (inspired by mine.svg), kept monochrome for UI badges
    const R = s*0.34;
    const ring = Math.max(2, Math.floor(s*0.07));
    g.lineStyle(ring, color, alpha);
    g.strokeCircle(x, y, R);

    // four tabs (N/E/S/W)
    const tabW = s*0.14;
    const tabL = s*0.22;
    g.fillStyle(color, alpha);
    g.fillRoundedRect(x - tabW/2, y - R - tabL*0.55, tabW, tabL, 3);
    g.fillRoundedRect(x - tabW/2, y + R - tabL*0.45, tabW, tabL, 3);
    g.fillRoundedRect(x - R - tabL*0.55, y - tabW/2, tabL, tabW, 3);
    g.fillRoundedRect(x + R - tabL*0.45, y - tabW/2, tabL, tabW, 3);

    // cross braces
    g.lineStyle(Math.max(2, Math.floor(s*0.06)), color, alpha);
    g.lineBetween(x - R*0.78, y, x + R*0.78, y);
    g.lineBetween(x, y - R*0.78, x, y + R*0.78);

    // center dot
    g.fillStyle(color, alpha);
    g.fillCircle(x, y, s*0.10);
  } else if (id === "pwr_med"){
    const w = s*0.18;
    const L = s*0.55;
    g.fillRoundedRect(x - w/2, y - L/2, w, L, 4);
    g.fillRoundedRect(x - L/2, y - w/2, L, w, 4);
  }
}

function makeHexBadgeTexture(scene, key, team, unitId){
  if (scene.textures.exists(key)) return;

  const accent = teamColorHex(team);
  const size = 96;
  const cx = size/2, cy = size/2;
  const r = 44;

  const gfx = scene.make.graphics({ x: 0, y: 0, add: false });
  const pts = hexLocalPoints(r);

  gfx.fillStyle(0x0f1720, 0.96);
  gfx.beginPath();
  gfx.moveTo(cx + pts[0].x, cy + pts[0].y);
  for (let i=1;i<pts.length;i++) gfx.lineTo(cx + pts[i].x, cy + pts[i].y);
  gfx.closePath();
  gfx.fillPath();

  gfx.lineStyle(6, accent, 0.95);
  gfx.beginPath();
  gfx.moveTo(cx + pts[0].x, cy + pts[0].y);
  for (let i=1;i<pts.length;i++) gfx.lineTo(cx + pts[i].x, cy + pts[i].y);
  gfx.closePath();
  gfx.strokePath();

  drawIcon(gfx, unitId, cx, cy+2, 52, 0xffffff, 0.95);

  gfx.generateTexture(key, size, size);
  gfx.destroy();
}

function makePowerUpBadgeTexture(scene, key, team, pwrId){
  if (scene.textures.exists(key)) return;

  const accent = teamColorHex(team);
  const size = 88;
  const cx = size/2, cy = size/2;
  const r = 40;

  const gfx = scene.make.graphics({ x: 0, y: 0, add: false });
  const pts = hexLocalPoints(r);

  gfx.fillStyle(0x0f1720, 0.96);
  gfx.beginPath();
  gfx.moveTo(cx + pts[0].x, cy + pts[0].y);
  for (let i=1;i<pts.length;i++) gfx.lineTo(cx + pts[i].x, cy + pts[i].y);
  gfx.closePath();
  gfx.fillPath();

  gfx.lineStyle(6, accent, 0.95);
  gfx.beginPath();
  gfx.moveTo(cx + pts[0].x, cy + pts[0].y);
  for (let i=1;i<pts.length;i++) gfx.lineTo(cx + pts[i].x, cy + pts[i].y);
  gfx.closePath();
  gfx.strokePath();

  drawIcon(gfx, `pwr_${pwrId}`, cx, cy+2, 48, 0xffffff, 0.95);

  gfx.generateTexture(key, size, size);
  gfx.destroy();
}

function ensureTeamBadges(scene, team){
  const ids = ["infantry","sniper","grenadier","elite","shock"];
  for (const id of ids){
    const key = `badge_${team}_${id}`;
    makeHexBadgeTexture(scene, key, team, id);
  }
}

function ensurePowerUpBadges(scene, team){
  makePowerUpBadgeTexture(scene, `pwr_${team}_med`, team, "med");
  makePowerUpBadgeTexture(scene, `pwr_${team}_mine`, team, "mine");
}


function ensureMineTokenTexture(scene){
  const key = "mine_token";
  if (scene.textures.exists(key)) return;
  const size = 64;
  const cx = size/2, cy = size/2;
  const gfx = scene.make.graphics({ x: 0, y: 0, add: false });
  gfx.clear();
  // transparent background
  drawIcon(gfx, "pwr_mine", cx, cy, 58, 0xffffff, 0.95);
  gfx.generateTexture(key, size, size);
  gfx.destroy();
}


/* ============================
   HEX / BOARD MATH
   ============================ */

class Hex { constructor(q, r){ this.q=q; this.r=r; } key(){ return `${this.q},${this.r}`; } }
const HEX_DIRS = [ new Hex(+1,0), new Hex(+1,-1), new Hex(0,-1), new Hex(-1,0), new Hex(-1,+1), new Hex(0,+1) ];
function addHex(a,b){ return new Hex(a.q+b.q, a.r+b.r); }
function axialDistance(a,b){
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = (-a.q - a.r) - (-b.q - b.r);
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2;
}
function axialToCube(h){ return { x: h.q, z: h.r, y: -h.q - h.r }; }
function cubeToAxial(c){ return new Hex(c.x, c.z); }
function cubeLerp(a,b,t){ return { x: a.x + (b.x-a.x)*t, y: a.y + (b.y-a.y)*t, z: a.z + (b.z-a.z)*t }; }
function cubeRound(c){
  let rx=Math.round(c.x), ry=Math.round(c.y), rz=Math.round(c.z);
  const xDiff=Math.abs(rx-c.x), yDiff=Math.abs(ry-c.y), zDiff=Math.abs(rz-c.z);
  if (xDiff>yDiff && xDiff>zDiff) rx=-ry-rz;
  else if (yDiff>zDiff) ry=-rx-rz;
  else rz=-rx-ry;
  return {x:rx,y:ry,z:rz};
}
function hexLine(a,b){
  const N = axialDistance(a,b);
  const ac = axialToCube(a);
  const bc = axialToCube(b);
  const out=[];
  for (let i=0;i<=N;i++){
    const t = (N===0) ? 0 : (i / N);
    const cr = cubeRound(cubeLerp(ac, bc, t));
    out.push(cubeToAxial(cr));
  }
  return out;
}

class HexLayout {
  constructor(size, originX, originY){ this.size=size; this.originX=originX; this.originY=originY; }
  hexToPixel(h){
    const s=this.size;
    const x=s*(3/2)*h.q;
    const y=s*Math.sqrt(3)*(h.r + h.q/2);
    return {x:x+this.originX, y:y+this.originY};
  }
  hexCorners(cx,cy){
    const out=[];
    for(let i=0;i<6;i++){
      const a=(Math.PI/180)*(60*i);
      out.push({x:cx+this.size*Math.cos(a), y:cy+this.size*Math.sin(a)});
    }
    return out;
  }
}

function offsetToAxial_evenQ(col,row){
  const q=col;
  const r=row-((col-(col&1))/2);
  return new Hex(q,r);
}

class Board {
  constructor(cols,rows){
    this.cols=cols; this.rows=rows;
    this.tiles=new Map();
    for(let c=0;c<cols;c++){
      for(let r=0;r<rows;r++){
        const h=offsetToAxial_evenQ(c,r);
        this.tiles.set(h.key(), {hex:h,col:c,row:r});
      }
    }
  }
  neighbors(hex){
    const out=[];
    for(const d of HEX_DIRS){
      const n=addHex(hex,d);
      if(this.tiles.has(n.key())) out.push(n);
    }
    return out;
  }
  reachable(startHex, maxSteps, blockedSet){
    const frontier=[{hex:startHex, dist:0}];
    const visited=new Map();
    visited.set(startHex.key(), 0);

    while(frontier.length){
      const cur = frontier.shift();
      if(cur.dist >= maxSteps) continue;

      for(const n of this.neighbors(cur.hex)){
        const key = n.key();
        const nd = cur.dist + 1;

        if (blockedSet && blockedSet.has(key) && key !== startHex.key()) continue;

        if (!visited.has(key) || nd < visited.get(key)){
          visited.set(key, nd);
          frontier.push({hex:n, dist:nd});
        }
      }
    }
    return visited;
  }

  shortestPath(startHex, goalHex, blockedSet){
    const startK = startHex.key();
    const goalK = goalHex.key();
    if (startK === goalK) return [startHex];

    const q = [startHex];
    const parent = new Map();
    parent.set(startK, null);

    while (q.length){
      const cur = q.shift();
      const curK = cur.key();
      for (const n of this.neighbors(cur)){
        const k = n.key();
        if (parent.has(k)) continue;
        if (blockedSet && blockedSet.has(k) && k !== goalK) continue;
        parent.set(k, curK);
        if (k === goalK){
          // reconstruct
          const pathKeys = [];
          let t = goalK;
          while (t !== null){
            pathKeys.push(t);
            t = parent.get(t);
          }
          pathKeys.reverse();
          return pathKeys.map(pk => this.tiles.get(pk).hex);
        }
        q.push(n);
      }
    }
    return null;
  }

}

/* ============================
   SCENES: TITLE / TEAM SELECT / SHOP
   ============================ */

class TitleScene extends Phaser.Scene {
  constructor() { super("TitleScene"); }
  preload() {
    this.load.image("titleBg", "tactix-title-bg.jpg");
    this.load.image("logo", "tactix-logo.png");
    this.load.image("battleBg", "tactix-battlefield.jpg");

    this.load.image("thumbAzure", "assets/azure-soldier.png");
    this.load.image("thumbPhlox", "assets/phlox-soldier.png");
    this.load.image("thumbVermillion", "assets/vermillion-soldier.png");

    this.load.audio("music_theme", ["assets/audio/tactix-theme.mp3"]);

    this.load.audio("music_score", ["assets/audio/tactix_score.mp3"]);
    this.load.audio("sfx_hit", ["assets/audio/Gun_Shot.mp3"]);
    this.load.audio("sfx_miss", ["assets/audio/Gun_Ricochet.mp3"]);

    this.load.image("blast1", "assets/blast_1.png");
    this.load.image("blast2", "assets/blast_2.png");
    this.load.image("blast3", "assets/blast_3.png");
    this.load.svg("mine_token", "assets/mine.svg");
  }
  create() {
    const w = this.scale.width, h = this.scale.height;
    const cx = w/2, cy = h/2;

    const bg = this.add.image(cx, cy, "titleBg").setOrigin(0.5);
    scaleImageToCover(bg, w, h);
    this.add.rectangle(cx, cy, w, h, 0x000000, 0.35);

    const logo = this.add.image(cx, cy - Math.min(110, h*0.14), "logo").setOrigin(0.5);
    logo.setScale((w*0.70)/logo.width);

    this.add.text(cx, cy + Math.min(40, h*0.06), "TURN-BASED COMBAT", {
      fontFamily: FONT_FAMILY,
      fontSize: "60px",
      color: "#ffffff"
    }).setOrigin(0.5);

    makeButton(this, cx, cy + Math.min(150, h*0.20), 300, 70, "START", () => {
      this.sound.context?.resume?.();
      ensureMusicStarted(this);
      this.scene.start("TeamSelectScene");
    }, 0x5aa9ff, 30);


    // Player stats (stored locally in your browser)

    this.scale.on("resize", () => this.scene.restart());
  }
}

class TeamSelectScene extends Phaser.Scene {
  constructor() { super("TeamSelectScene"); }

  create() {
    
    syncUnlocksFromWins();
const w = this.scale.width, h = this.scale.height;
    const cx = w/2, cy = h/2;

    ensureMusicStarted(this);

    const bg = this.add.image(cx, cy, "battleBg").setOrigin(0.5);
    scaleImageToCover(bg, w, h);
    this.add.rectangle(cx, cy, w, h, 0x000000, 0.62);

    makeTopbar(this, { showLogo: true, showBack: true, backTarget: "TitleScene" });
    makeSpeakerToggle(this);

    this.add.text(cx, Math.max(96, h*0.16), "CHOOSE YOUR TEAM", UI.h1).setOrigin(0.5);

    const cardY  = cy - h * 0.02;
    const gap    = Math.min(780, w * 0.74);
    const leftX  = cx - gap/2;
    const midX   = cx;
    const rightX = cx + gap/2;

    this.makeTeamCardStatic(leftX, cardY, "azure", "thumbAzure", "EMPHASIS ON SPEED");
    this.makeTeamCardStatic(midX,  cardY, "phlox", "thumbPhlox", "EMPHASIS ON CONTROL", { locked: !isPhloxUnlocked() });
    this.makeTeamCardStatic(rightX, cardY, "vermillion", "thumbVermillion", "EMPHASIS ON DAMAGE");

    this.scale.on("resize", () => this.scene.restart());
  }

  makeTeamCardStatic(x, y, teamKey, thumbKey, subtitle, opts){
    const w = this.scale.width, h = this.scale.height;
    const radius = Math.min(190, Math.max(150, Math.floor(Math.min(w, h) * 0.18)));
    const locked = !!(opts && opts.locked);
    const accent = teamColorHex(teamKey);

    const g = this.add.graphics();

    const pts = [];
    for (let i=0;i<6;i++){
      const a = Phaser.Math.DegToRad(60*i);
      pts.push({ x: x + radius*Math.cos(a), y: y + radius*Math.sin(a) });
    }

    g.fillStyle(0x0b1220, 0.60);
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i=1;i<6;i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
    g.fillPath();

    g.lineStyle(6, locked ? 0x334155 : accent, locked ? 0.35 : 0.85);
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i=1;i<6;i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
    g.strokePath();

    const img = this.add.image(x, y, thumbKey).setOrigin(0.5);
    if (locked){
      img.setTint(0x111827);
      img.setAlpha(0.45);
    }
    const innerR = radius * 0.92;
    const sx = (innerR*2)/img.width;
    const sy = (innerR*2)/img.height;
    img.setScale(Math.max(sx, sy));

    const maskG = this.make.graphics({ x: 0, y: 0, add: false });
    const innerPts = [];
    for (let i=0;i<6;i++){
      const a = Phaser.Math.DegToRad(60*i);
      innerPts.push({ x: x + innerR*Math.cos(a), y: y + innerR*Math.sin(a) });
    }
    maskG.fillStyle(0xffffff, 1);
    maskG.beginPath();
    maskG.moveTo(innerPts[0].x, innerPts[0].y);
    for (let i=1;i<6;i++) maskG.lineTo(innerPts[i].x, innerPts[i].y);
    maskG.closePath();
    maskG.fillPath();
    img.setMask(maskG.createGeometryMask());

    const nameY = y + radius + Math.max(34, h * 0.045);
    const displayName = (locked && teamKey === "phlox") ? "?????" : teamName(teamKey);
    const displaySub = (locked && teamKey === "phlox") ? "" : subtitle;
    this.add.text(x, nameY, displayName, UI.h1).setOrigin(0.5);
    this.add.text(x, nameY + 30, displaySub, UI.small).setOrigin(0.5);

    if (locked && teamKey === "phlox"){
      makeButton(this, x, nameY + 86, 280, 62, "PLAY TO UNLOCK", null, 0x64748b, 24);
    } else {
      makeButton(this, x, nameY + 86, 280, 62, "SELECT", () => {
        GAME_DATA.teamColor = teamKey;
        beginMatch(teamKey);
        this.scene.start("ShopScene");
      }, accent, 28);
    }
  }
}

class ShopScene extends Phaser.Scene {
  constructor() { super("ShopScene"); }

  create() {
    
    syncUnlocksFromWins();
ensureMusicStarted(this);

    const w = this.scale.width, h = this.scale.height, cx = w/2, cy = h/2;
    const bg = this.add.image(cx, cy, "battleBg").setOrigin(0.5);
    scaleImageToCover(bg, w, h);
    this.add.rectangle(cx, cy, w, h, 0x000000, 0.72);

    makeTopbar(this, { showLogo: true, showBack: true, backTarget: "TeamSelectScene" });
    makeSpeakerToggle(this);

    GAME_DATA.roster = [];
    GAME_DATA.powerUps = [];
    GAME_DATA.pointsMax = 15;

    const team = GAME_DATA.teamColor ?? "azure";
    this.catalog = catalogForTeam(team);

    for (const t of TEAMS) {
      ensureTeamBadges(this, t);
      ensurePowerUpBadges(this, t);
    }
    ensureMineTokenTexture(this);

    this.add.text(cx, 96, "BUILD YOUR SQUAD", UI.h1).setOrigin(0.5);

    this.pointsText = this.add.text(cx, 140, "", UI.body).setOrigin(0.5);
    this.msgText = this.add.text(cx, h - 120, "", { ...UI.body, color: "#fca5a5" }).setOrigin(0.5);

    const gap = 24;
    const panelW = Math.min(760, Math.floor(w * 0.60));
    const panelH = Math.min(650, h - 300);
    const rightW = Math.max(340, Math.min(440, Math.floor(w * 0.30)));

    const totalW = panelW + gap + rightW;
    const leftX = Math.max(40, Math.floor((w - totalW) / 2));
    const rightX = leftX + panelW + gap;
    const topY = 180;

    this.leftPanel = { x: leftX, y: topY, w: panelW, h: panelH };
    this.rightPanel = { x: rightX, y: topY, w: rightW, h: panelH };

    this.drawPanel(leftX, topY, panelW, panelH, 0.78);
    this.drawPanel(rightX, topY, rightW, panelH, 0.78);

    this.add.text(leftX + 20, topY + 18, "SOLDIERS", UI.h2);
    this.add.text(rightX + 20, topY + 18, "YOUR SQUAD", UI.h2);

    // Right panel list container with mask + scroll (this one is fine)
    this.rosterContainer = this.add.container(0, 0);
    this.rosterMaskG = this.make.graphics({ x: 0, y: 0, add: false });
    this.rosterContainer.setMask(this.rosterMaskG.createGeometryMask());
    this.updateRosterMask();
    this.scrollRight = { y: 0, max: 0 };

    this.input.on("wheel", (pointer, dx, dy) => {
      if (this.isPointerOverPanel(pointer.x, pointer.y, this.rightPanel)) {
        this.scrollRight.y = Phaser.Math.Clamp(this.scrollRight.y + (dy * 0.35), 0, this.scrollRight.max);
        this.rosterContainer.y = -this.scrollRight.y;
      }
    });

    // Left panel: no scrolling needed (only 3 soldiers + 1 power up)
    const listStartY = topY + 86;
    const rowH = 110;

    this.catalog.forEach((u, idx) => {
      const y = listStartY + idx * rowH;

      const badgeKey = `badge_${team}_${u.id}`;
      const badge = this.add.image(leftX + 62, y, badgeKey).setOrigin(0.5);
      badge.setScale(0.92);

      this.add.text(leftX + 120, y - 36, u.name, UI.h2);
      this.add.text(leftX + 120, y - 10, `COST ${u.cost}   SPEED ${u.speed}   RANGE ${u.range}`, UI.body);
      this.add.text(leftX + 120, y + 16, `ATK +${u.atk}   DEF +${u.def}   DMG ${u.dmg}   HP ${u.hp}`, UI.body);

      makeButton(this, leftX + panelW - 150, y, 130, 46, "ADD", () => this.addUnit(u), 0x22c55e, 22);
    });

    const pwrHeaderY = listStartY + this.catalog.length * rowH - 18;// tighter gap so Soldiers + Power Ups fit
    this.add.text(leftX + 20, pwrHeaderY, "POWER UPS", UI.h2);

    const pwrRowH = 110;
    const pwrRowY = pwrHeaderY + 62;// reduced header-to-row gap
    this.drawPowerUpRow(team, leftX, panelW, pwrRowY, POWER_UPS.med);

    // Mine is hidden until unlocked (5 wins)
    if (isMineUnlocked()){
      this.drawPowerUpRow(team, leftX, panelW, pwrRowY + pwrRowH, POWER_UPS.mine);
    }

    makeButton(this, cx, h - 70, 320, 70, "READY", () => {
      this.msgText.setText("");
      if (GAME_DATA.roster.length === 0) {
        this.msgText.setText("ADD AT LEAST ONE UNIT.");
        return;
      }
      this.scene.start("BattleScene", {
        playerTeam: team,
        playerRoster: GAME_DATA.roster.map(u => ({ ...u })),
        powerUps: GAME_DATA.powerUps.map(p => ({ ...p })),
      });
    }, 0x22c55e, 30);

    this.updateUI();
    this.scale.on("resize", () => this.scene.restart());
  }

  drawPanel(x, y, w, h, alpha = 0.65) {
    const g = this.add.graphics();
    g.fillStyle(0x0f1720, alpha);
    g.fillRoundedRect(x, y, w, h, 14);
    g.lineStyle(2, 0x5aa9ff, 0.18);
    g.strokeRoundedRect(x, y, w, h, 14);
  }

  drawPowerUpRow(team, leftX, panelW, y, pwrDef){
    const badgeKey = `pwr_${team}_${pwrDef.id}`;
    const badge = this.add.image(leftX + 62, y, badgeKey).setOrigin(0.5);
    badge.setScale(0.98);

    this.add.text(leftX + 120, y - 22, pwrDef.name, UI.h2);
    this.add.text(leftX + 120, y + 14, `COST ${pwrDef.cost}   ${pwrDef.desc}`, UI.body);

    makeButton(this, leftX + panelW - 150, y, 130, 46, "ADD", () => this.addPowerUp(pwrDef), 0x22c55e, 22);
  }

  pointsSpent() {
    const unitPts = GAME_DATA.roster.reduce((sum, u) => sum + u.cost, 0);
    const pwrPts  = GAME_DATA.powerUps.reduce((sum, p) => sum + p.cost, 0);
    return unitPts + pwrPts;
  }
  pointsRemaining() { return GAME_DATA.pointsMax - this.pointsSpent(); }

  addUnit(unitDef) {
    if (this.pointsRemaining() < unitDef.cost) {
      this.msgText.setText("NOT ENOUGH POINTS.");
      return;
    }
    this.msgText.setText("");
    GAME_DATA.roster.push({ ...unitDef });
    recordUnitPick(unitDef);
    this.updateUI();
  }

  addPowerUp(pwrDef){
    if (GAME_DATA.powerUps.length >= POWERUP_LIMIT){
      this.msgText.setText(`POWER UPS LIMITED TO ${POWERUP_LIMIT}.`);
      return;
    }
    if (this.pointsRemaining() < pwrDef.cost){
      this.msgText.setText("NOT ENOUGH POINTS.");
      return;
    }
    this.msgText.setText("");
    GAME_DATA.powerUps.push({ id: pwrDef.id, name: pwrDef.name, cost: pwrDef.cost, used: false });
    this.updateUI();
  }

  removeUnit(index) {
    GAME_DATA.roster.splice(index, 1);
    this.updateUI();
  }

  removePowerUp(index){
    GAME_DATA.powerUps.splice(index, 1);
    this.updateUI();
  }

  isPointerOverPanel(px, py, p){
    return (px >= p.x && px <= p.x + p.w && py >= p.y && py <= p.y + p.h);
  }

  updateRosterMask(){
    const p = this.rightPanel;
    const x = p.x + 18;
    const y = p.y + 70;
    const w = p.w - 36;
    const h = p.h - 90;

    this.rosterMaskG.clear();
    this.rosterMaskG.fillStyle(0xffffff, 1);
    this.rosterMaskG.fillRect(x, y, w, h);

    this.rosterClip = { x, y, w, h };
  }

  updateUI() {
    const team = GAME_DATA.teamColor ?? "azure";
    this.pointsText.setText(
      `TEAM ${teamName(team)}   |   POINTS ${this.pointsSpent()}/${GAME_DATA.pointsMax}   (REMAINING ${this.pointsRemaining()})`
    );

    this.rosterContainer.removeAll(true);

    const x0 = this.rightPanel.x + 22;
    const y0 = this.rightPanel.y + 84;
    const lineH = 52;

    GAME_DATA.roster.forEach((u, i) => {
      const y = y0 + i * lineH;

      const t = this.add.text(x0, y, `${u.name} (-${u.cost})`, UI.body).setInteractive({ useHandCursor: true });
      const hint = this.add.text(x0 + Math.min(this.rightPanel.w - 190, 250), y, "CLICK TO REMOVE", UI.small)
        .setInteractive({ useHandCursor: true });

      const remove = () => this.removeUnit(i);
      t.on("pointerdown", remove);
      hint.on("pointerdown", remove);

      this.rosterContainer.add([t, hint]);
    });

    const pwrStartY = y0 + GAME_DATA.roster.length * lineH + 10;
    const pHdr = this.add.text(x0, pwrStartY, "POWER UPS", UI.h2);
    this.rosterContainer.add(pHdr);

    GAME_DATA.powerUps.forEach((p, idx) => {
      const y = pwrStartY + 32 + idx * lineH;

      const t = this.add.text(x0, y, `${p.name} (-${p.cost})`, UI.body).setInteractive({ useHandCursor: true });
      const hint = this.add.text(x0 + Math.min(this.rightPanel.w - 190, 250), y, "CLICK TO REMOVE", UI.small)
        .setInteractive({ useHandCursor: true });

      const remove = () => this.removePowerUp(idx);
      t.on("pointerdown", remove);
      hint.on("pointerdown", remove);

      this.rosterContainer.add([t, hint]);
    });

    const contentBottom = pwrStartY + 32 + GAME_DATA.powerUps.length * lineH;
    const contentHeight = contentBottom - (this.rightPanel.y + 70);
    const visibleHeight = this.rosterClip.h;

    this.scrollRight.max = Math.max(0, Math.ceil(contentHeight - visibleHeight));
    this.scrollRight.y = Phaser.Math.Clamp(this.scrollRight.y, 0, this.scrollRight.max);
    this.rosterContainer.y = -this.scrollRight.y;
  }
}

/* ============================
   BATTLE SCENE
   ============================ */

class BattleScene extends Phaser.Scene {
  constructor(){ super("BattleScene"); }

  init(data){
    this._initData = data || null;

    this.playerTeam = data?.playerTeam ?? "azure";
    this.aiTeam = randomOtherTeam(this.playerTeam);

    this.playerRoster = Array.isArray(data?.playerRoster) ? data.playerRoster : [];
    this.powerUps = Array.isArray(data?.powerUps) ? data.powerUps.map(p => ({ ...p })) : [];

    // Mines placed on the battlefield
    this.mines = [];
    this.mineSprites = new Map();

    // AI uses max points, randomized each game
    this.aiRoster = this.buildRandomAiRoster(this.aiTeam, GAME_DATA.pointsMax);
    // Map to the correct team roster (ensures correct special unit)
    this.aiRoster = this.aiRoster.map(u => mapUnitToTeam(u, this.aiTeam));
  }

  buildRandomAiRoster(team, pointsMax){
    const catalog = catalogForTeam(team);
    let points = pointsMax;

    const picks = [];
    let safety = 300;

    while (points >= 2 && safety-- > 0){
      const affordable = catalog.filter(u => u.cost <= points);
      if (affordable.length === 0) break;

      // bias toward bigger units, but still random
      const sorted = affordable.slice().sort((a,b)=>b.cost-a.cost);
      const roll = Math.random();
      let chosen = null;
      if (roll < 0.55) chosen = sorted[0];
      else if (roll < 0.85) chosen = sorted[Math.min(1, sorted.length-1)];
      else chosen = sorted[Math.min(2, sorted.length-1)];
      if (!chosen) chosen = affordable[Math.floor(Math.random()*affordable.length)];

      picks.push({ ...chosen });
      points -= chosen.cost;

      if (picks.length >= 6) break;
    }

    // if points remain but nothing affordable (shouldn't happen), done
    if (picks.length === 0) picks.push({ ...BASE_UNITS.infantry });

    return picks;
  }

  create(){
    ensureBattleMusicStarted(this);

    for (const t of TEAMS) {
      ensureTeamBadges(this, t);
      ensurePowerUpBadges(this, t);
    }
    ensureMineTokenTexture(this);

    const w0 = this.scale.width, h0 = this.scale.height;
    const bg = this.add.image(w0/2, h0/2, "battleBg").setOrigin(0.5).setDepth(-10);
    scaleImageToCover(bg, w0, h0);
    this.bgImage = bg;
    this.dimRect = this.add.rectangle(w0/2, h0/2, w0, h0, 0x000000, 0.45).setDepth(-9);

    const topbar = makeTopbar(this, { showLogo: true, showBack: true, backTarget: "ShopScene" });
    const speaker = makeSpeakerToggle(this);

    const statsBtn = makeTextButton(this, "STATS", { fontSize: 18, padX: 14, padY: 8 });
    statsBtn.hit.on("pointerdown", () => openStatsOverlay(this));

    const layoutTopRight = () => {
      const w = this.scale.width;
      const gap = 14;

      // Speaker is rightmost
      speaker.layout();

      // STATS sits to the left of the speaker toggle (44px wide)
      const speakerLeft = w - TOPBAR.padX - 44;
      const statsCenterX = speakerLeft - gap - (statsBtn.width / 2);
      statsBtn.container.setPosition(statsCenterX, TOPBAR.yCenter);

      // BACK sits to the left of STATS (right-aligned). We use backXFn so makeTopbar
      // can keep handling resize consistently.
      const statsLeft = statsCenterX - (statsBtn.width / 2);
      topbar.backXFn = () => (statsLeft - gap);
      topbar.layout();
    };

    this.scale.on("resize", layoutTopRight);
    layoutTopRight();

    this.SIDE_PLAYER = "player";
    this.SIDE_AI = "ai";
    this.activeSide = this.SIDE_PLAYER;

    this.PHASE_MOVE = "MOVE";
    this.PHASE_ATTACK = "ATTACK";
    this.phase = this.PHASE_MOVE;

    this.turnMoveMax = 10;
    this.turnMoveRemaining = 10;
    this.moveLocked = false;

    this.COLS = 16;
    this.ROWS = 9;
    this.board = new Board(this.COLS, this.ROWS);
    this.layout = new HexLayout(30, 0, 0);

    this.gBoard = this.add.graphics().setDepth(0);
    this.gOverlay = this.add.graphics().setDepth(20);

    // Random symmetric obstacles each game
    this.obstacles = this.makeObstaclesSymmetricRandom(16);

    this.blasts = this.add.container(0,0).setDepth(60);

    this.tileSeeds = new Map();
    for (const t of this.board.tiles.values()){
      this.tileSeeds.set(t.hex.key(), this.seedFromKey(t.hex.key()));
    }

    // Left roster panel
    this.leftPanel = this.add.container(0, 0).setDepth(900);
    this.leftPanelBg = this.add.graphics();
    this.leftPanel.add(this.leftPanelBg);

    this.turnBanner = this.add.text(14, 12, "", {
      fontFamily: FONT_FAMILY,
      fontSize: "36px",
      color: "#ffffff"
    });
    this.panelInfo  = this.add.text(14, 54, "", {
      fontFamily: FONT_FAMILY,
      fontSize: "18px",
      color: "#ffffff"
    });

    this.leftPanel.add([this.turnBanner, this.panelInfo]);
    this.rosterG = this.add.graphics();
    this.leftPanel.add(this.rosterG);
    this.rosterTexts = [];
    this.powerUpButtons = [];

    // Button outlines: MOVE green, ATTACK amber, END TURN red
    this.btnMove = makeArrowButton(this, 0, 0, 160, 44, "1. MOVE", () => this.onMoveButton(), 0x22c55e, 22);
    this.btnAttack= makeArrowButton(this, 0, 0, 190, 44, "2. ATTACK", () => this.onAttackButton(), 0xfbbf24, 22);
    this.btnEnd   = makeArrowButton(this, 0, 0, 205, 44, "3. END TURN", () => this.onEndTurnButton(), 0xef4444, 22);

    // Tooltip (unit hover)
    this.tipW = 260;
    this.tipH = 132;

    this.tooltip = this.add.container(0,0).setVisible(false).setDepth(1000);
    const tipBg = this.add.graphics();
    tipBg.fillStyle(0x0f1720, 0.92);
    tipBg.fillRoundedRect(0,0,this.tipW,this.tipH,10);
    tipBg.lineStyle(2,0x5aa9ff,0.25);
    tipBg.strokeRoundedRect(0,0,this.tipW,this.tipH,10);

    this.tipName = this.add.text(12,10,"", {
      fontFamily: FONT_FAMILY,
      fontSize: "22px",
      color: "#ffffff"
    });

    this.tipBody = this.add.text(12,40,"", {
      fontFamily: FONT_FAMILY,
      fontSize: "16px",
      color: "#ffffff",
      wordWrap: { width: 236, useAdvancedWrap: true },
      lineSpacing: 3
    });

    this.tooltip.add([tipBg, this.tipName, this.tipBody]);

    this.makeModal();
    this.makeAttackPopup();

    this.playerUnits = [];
    this.aiUnits = [];

    this.selectedSide = null;
    this.selectedIndex = null;
    this.reachableMap = null;
    this.attackableSet = null;

    this.inputEnabled = true;

    this.spawnUnitsEvenly();

    this.input.on("pointerdown", async (p) => {
      if (!this.inputEnabled) return;
      if (this.activeSide !== this.SIDE_PLAYER) return;

      const clickedHex = this.pixelToNearestHexOnBoard(p.x, p.y);
      if (!clickedHex) return;
      const key = clickedHex.key();

      // Mine placement mode
      if (this._pendingMinePlace){
        this.placeMineAt(clickedHex, true);
        return;
      }

      // Med Pack targeting mode (click units only)
      if (this._pendingMed){
        return;
      }

      if (this.phase === this.PHASE_MOVE){
        if (this.moveLocked) return;
        if (this.selectedSide !== this.SIDE_PLAYER || this.selectedIndex === null) return;
        if (!this.reachableMap) return;
        if (!this.reachableMap.has(key)) return;


        const dist = this.reachableMap.get(key);
        if (dist <= 0) return;

        const unit = this.playerUnits[this.selectedIndex];
        if (!unit || !unit.alive) return;

        if (unit.stunnedActive){
          this.showModalOk("THIS UNIT IS STUNNED AND CANNOT MOVE THIS TURN.");
          return;
        }

        const unitRemaining = unit.data.speed - unit.moveUsed;
        if (dist > unitRemaining) return;
        if (dist > this.turnMoveRemaining) return;

        // Build blocked set (obstacles + units) for pathing
        const blocked = this.buildOccupiedSet();
        for (const o of this.obstacles) blocked.add(o);
        blocked.delete(unit.hex.key());

        const path = this.board.shortestPath(unit.hex, clickedHex, blocked);
        // Fallback: if for some reason we can't build a path, do the simple teleport move
        if (!path || path.length < 2){
          unit.moveUsed += dist;
          this.turnMoveRemaining -= dist;
          unit.hex = clickedHex;
          this.positionAllUnits();
          this.computeMoveReachForSelected();
          this.redrawAll();
          return;
        }

        // Walk the path step-by-step (animated) so mines can trigger even if crossed.
        this.inputEnabled = false;
        this.moveLocked = true;

        let stepsTaken = 0;
        for (let i = 1; i < path.length; i++){
          if (stepsTaken >= dist) break;

          const nextHex = path[i];

          // Animate the unit moving into place (similar to AI movement)
          await this.tweenUnitToHex(unit, nextHex, 150);

          unit.hex = nextHex;
          stepsTaken += 1;

          // Mine triggers when stepped on (or crossed)
          if (this.checkMineTriggerOnUnit(unit)){
            // Movement stops on detonation
            break;
          }

          if (!unit.alive) break;
        }

        this.moveLocked = false;
        this.inputEnabled = true;

        unit.moveUsed += stepsTaken;
        this.turnMoveRemaining -= stepsTaken;

        this.positionAllUnits();
        this.computeMoveReachForSelected();
        if (this.checkWinLose()) return;
        this.redrawAll();
      } else if (this.phase === this.PHASE_ATTACK){
        this.tryAttackAtHex(key);
      }
    });

    this.scale.on("resize", (gs) => {
      this.bgImage.setPosition(gs.width/2, gs.height/2);
      scaleImageToCover(this.bgImage, gs.width, gs.height);
      this.dimRect.setPosition(gs.width/2, gs.height/2);
      this.dimRect.setSize(gs.width, gs.height);

      this.layoutUI(gs.width, gs.height);
      this.fitBoard(gs.width, gs.height);
      this.redrawAll();
    });

    this.layoutUI(this.scale.width, this.scale.height);
    this.fitBoard(this.scale.width, this.scale.height);

    this.startTurn(this.SIDE_PLAYER);
  }

  /* ---------- UTIL / RNG ---------- */

  seedFromKey(key){
    let seed = 0;
    for (let i=0;i<key.length;i++) seed = (seed*31 + key.charCodeAt(i)) >>> 0;
    return seed >>> 0;
  }
  rndFromSeed(seedObj){
    seedObj.v = (1664525 * seedObj.v + 1013904223) >>> 0;
    return seedObj.v / 4294967296;
  }

  /* ---------- MODAL ---------- */
  makeModal(){
    const w = this.scale.width, h = this.scale.height;

    this.modal = this.add.container(0,0).setDepth(5000).setVisible(false);
    this.modalMode = "ok";
    this.modalYesCb = null;

    const dim = this.add.rectangle(0,0,w,h,0x000000,0.55).setOrigin(0);
    this.modalDim = dim;

    const box = this.add.graphics();
    box.fillStyle(0x0f1720, 0.96);
    box.fillRoundedRect(0,0,560,220,14);
    box.lineStyle(2,0x5aa9ff,0.35);
    box.strokeRoundedRect(0,0,560,220,14);

    this.modalText = this.add.text(280, 80, "", {
      fontFamily: FONT_FAMILY, fontSize: "24px", color: "#ffffff", align: "center", wordWrap: { width: 520 }
    }).setOrigin(0.5);

    this.modalOkBtn = makeButton(this, 280, 170, 160, 52, "OK", () => this.hideModal(), 0x22c55e, 24);

    this.modalYesBtn = makeButton(this, 190, 170, 160, 52, "YES", () => {
      const cb = this.modalYesCb;
      this.hideModal();
      if (cb) cb();
    }, 0x22c55e, 24);

    this.modalNoBtn = makeButton(this, 370, 170, 160, 52, "NO", () => this.hideModal(), 0x5aa9ff, 24);

    const wrap = this.add.container((w-560)/2, (h-220)/2);
    wrap.add([box, this.modalText, this.modalOkBtn.container, this.modalYesBtn.container, this.modalNoBtn.container]);

    this.modalWrap = wrap;
    this.modal.add([dim, wrap]);

    const layout = (gs) => {
      const W = gs?.width ?? this.scale.width;
      const H = gs?.height ?? this.scale.height;
      this.modalDim.setSize(W, H);
      this.modalWrap.setPosition((W-560)/2, (H-220)/2);
    };
    this.scale.on("resize", layout);

    this.setModalMode("ok");
  }

  setModalMode(mode){
    this.modalMode = mode;
    const ok = (mode === "ok");
    this.modalOkBtn.container.setVisible(ok);
    this.modalYesBtn.container.setVisible(!ok);
    this.modalNoBtn.container.setVisible(!ok);
  }

  showModalOk(msg){
    this.setModalMode("ok");
    this.modalText.setText(msg);
    this.modal.setVisible(true);
    this.inputEnabled = false;
  }

  showModalConfirm(msg, yesCb){
    this.setModalMode("confirm");
    this.modalYesCb = yesCb;
    this.modalText.setText(msg);
    this.modal.setVisible(true);
    this.inputEnabled = false;
  }

  hideModal(){
    this.modal.setVisible(false);
    this.inputEnabled = true;
    this.modalYesCb = null;
  }

  /* ---------- ATTACK POPUP ---------- */
  makeAttackPopup(){
    const w = this.scale.width, h = this.scale.height;

    this.attackPop = this.add.container(0,0).setDepth(6000).setVisible(false);

    const dim = this.add.rectangle(0,0,w,h,0x000000,0.60).setOrigin(0);
    this.attackPopDim = dim;

    const cardW = 720, cardH = 380;
    const wrap = this.add.container((w-cardW)/2, (h-cardH)/2);

    const bg = this.add.graphics();
    bg.fillStyle(0x0f1720, 0.96);
    bg.fillRoundedRect(0,0,cardW,cardH,14);
    bg.lineStyle(2,0x5aa9ff,0.35);
    bg.strokeRoundedRect(0,0,cardW,cardH,14);

    const leftX = 190;
    const rightX = cardW - 190;
    const thumbY = 110;
    const rollY = 305;

    const drawHexOutline = (g, cx, cy, r, color, alpha, lineW=5) => {
      g.lineStyle(lineW, color, alpha);
      const pts = [];
      for (let i=0;i<6;i++){
        const a = (Math.PI/3)*i - Math.PI/6;
        pts.push({ x: cx + Math.cos(a)*r, y: cy + Math.sin(a)*r });
      }
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i=1;i<pts.length;i++) g.lineTo(pts[i].x, pts[i].y);
      g.closePath();
      g.strokePath();
    };

    // Hex outlines (team-colored) + masks for cropping thumbnails
    this.apHexG = this.add.graphics();
    this.apLeftHex = { x: leftX, y: thumbY, r: 88, innerR: 82 };
    this.apRightHex = { x: rightX, y: thumbY, r: 88, innerR: 82 };

    // masks (filled hexes) created once; these must live in the same container space as the thumbs
    this.apLeftMaskG = this.add.graphics().setVisible(false);
    this.apRightMaskG = this.add.graphics().setVisible(false);

    const fillHexMask = (mg, cx, cy, r) => {
      const pts = [];
      for (let i=0;i<6;i++){
        const a = (Math.PI/3)*i - Math.PI/6;
        pts.push({ x: cx + Math.cos(a)*r, y: cy + Math.sin(a)*r });
      }
      mg.clear();
      mg.fillStyle(0xffffff, 1);
      mg.beginPath();
      mg.moveTo(pts[0].x, pts[0].y);
      for (let i=1;i<pts.length;i++) mg.lineTo(pts[i].x, pts[i].y);
      mg.closePath();
      mg.fillPath();
    };

    // Keep masks in world coordinates so container transforms don't break GeometryMask
    this._attackPopUpdateMasks = () => {
      const wx = wrap.x;
      const wy = wrap.y;
      fillHexMask(this.apLeftMaskG, wx + this.apLeftHex.x, wy + this.apLeftHex.y, this.apLeftHex.innerR);
      fillHexMask(this.apRightMaskG, wx + this.apRightHex.x, wy + this.apRightHex.y, this.apRightHex.innerR);
      this.apLeftMask = this.apLeftMaskG.createGeometryMask();
      this.apRightMask = this.apRightMaskG.createGeometryMask();
    };

    this._attackPopUpdateMasks();

    this.apLeftThumb = this.add.image(leftX, thumbY, "thumbAzure").setOrigin(0.5);
    this.apRightThumb = this.add.image(rightX, thumbY, "thumbVermillion").setOrigin(0.5);

    const thumbScale = 140 / this.apLeftThumb.width;
    this.apLeftThumb.setScale(thumbScale);
    this.apRightThumb.setScale(thumbScale);

    // Unit icon + text blocks (centered under thumbnails)
    this.apAtkIconC = this.add.container(leftX, 205);
    this.apAtkIconG = this.add.graphics();
    this.apAtkIconC.add(this.apAtkIconG);

    this.apDefIconC = this.add.container(rightX, 205);
    this.apDefIconG = this.add.graphics();
    this.apDefIconC.add(this.apDefIconG);

    this.apAtkName = this.add.text(leftX, 238, "", { fontFamily: FONT_FAMILY, fontSize: "26px", color: "#ffffff" }).setOrigin(0.5);
    this.apAtkLine = this.add.text(leftX, 268, "", { fontFamily: FONT_FAMILY, fontSize: "20px", color: "#ffffff" }).setOrigin(0.5);

    this.apDefName = this.add.text(rightX, 238, "", { fontFamily: FONT_FAMILY, fontSize: "26px", color: "#ffffff" }).setOrigin(0.5);
    this.apDefLine = this.add.text(rightX, 268, "", { fontFamily: FONT_FAMILY, fontSize: "20px", color: "#ffffff" }).setOrigin(0.5);

    // Roll numbers + modifier slide-in
    this.apAtkRoll = this.add.text(leftX, rollY, "?", { fontFamily: FONT_FAMILY, fontSize: "74px", color: "#ffffff" }).setOrigin(0.5);
    this.apDefRoll = this.add.text(rightX, rollY, "?", { fontFamily: FONT_FAMILY, fontSize: "74px", color: "#ffffff" }).setOrigin(0.5);

    this.apAtkTotal = this.add.text(leftX + 88, rollY, "", { fontFamily: FONT_FAMILY, fontSize: "30px", color: "#ffffff" }).setOrigin(0.5).setAlpha(0);
    this.apDefTotal = this.add.text(rightX - 88, rollY, "", { fontFamily: FONT_FAMILY, fontSize: "30px", color: "#ffffff" }).setOrigin(0.5).setAlpha(0);

    this.apResult = this.add.text(cardW/2, 152, "", { fontFamily: FONT_FAMILY, fontSize: "42px", color: "#ffffff" }).setOrigin(0.5).setAlpha(0);

    wrap.add([
      bg,
      this.apHexG,
      this.apLeftThumb, this.apRightThumb,
      this.apAtkIconC, this.apAtkName, this.apAtkLine,
      this.apDefIconC, this.apDefName, this.apDefLine,
      this.apAtkRoll, this.apDefRoll, this.apAtkTotal, this.apDefTotal,
      this.apResult
    ]);

    this.attackPopWrap = wrap;
    this.attackPop.add([dim, this.apLeftMaskG, this.apRightMaskG, wrap]);

    const layout = (gs) => {
      const W = gs?.width ?? this.scale.width;
      const H = gs?.height ?? this.scale.height;
      this.attackPopDim.setSize(W, H);
      this.attackPopWrap.setPosition((W-cardW)/2, (H-cardH)/2);
      if (this._attackPopUpdateMasks) this._attackPopUpdateMasks();
    };
    this.scale.on("resize", layout);
  }

  teamThumbKey(team){
    if (team === "vermillion") return "thumbVermillion";
    if (team === "phlox") return "thumbPhlox";
    return "thumbAzure";
  }

  showAttackPopup(payload){
    this.inputEnabled = false;

    this.apLeftThumb.setTexture(this.teamThumbKey(payload.atkTeam));
    this.apRightThumb.setTexture(this.teamThumbKey(payload.defTeam));


    // Crop thumbnails into hexagons and outline in team colors
    const atkAccent = teamColorHex(payload.atkTeam);
    const defAccent = teamColorHex(payload.defTeam);

    // Scale thumbs to cover the inner hex area
    const fitThumb = (img, innerR) => {
      const sx = (innerR*2)/img.width;
      const sy = (innerR*2)/img.height;
      img.setScale(Math.max(sx, sy));
    };
    fitThumb(this.apLeftThumb, this.apLeftHex.innerR);
    fitThumb(this.apRightThumb, this.apRightHex.innerR);

    // masks applied after overlay is positioned

    // redraw outlines
    this.apHexG.clear();
    const draw = (cx, cy, r, color) => {
      this.apHexG.lineStyle(5, color, 0.85);
      const pts = [];
      for (let i=0;i<6;i++){
        const a = (Math.PI/3)*i - Math.PI/6;
        pts.push({ x: cx + Math.cos(a)*r, y: cy + Math.sin(a)*r });
      }
      this.apHexG.beginPath();
      this.apHexG.moveTo(pts[0].x, pts[0].y);
      for (let i=1;i<pts.length;i++) this.apHexG.lineTo(pts[i].x, pts[i].y);
      this.apHexG.closePath();
      this.apHexG.strokePath();
    };
    draw(this.apLeftHex.x, this.apLeftHex.y, this.apLeftHex.r, atkAccent);
    draw(this.apRightHex.x, this.apRightHex.y, this.apRightHex.r, defAccent);


    this.apAtkName.setText(`${payload.attacker.data.name.replace(/^ENEMY\s+/, "")}`);
    this.apDefName.setText(`${payload.defender.data.name.replace(/^ENEMY\s+/, "")}`);

    this.apAtkLine.setText(`ATK +${payload.attacker.data.atk}   DMG ${payload.attacker.data.dmg}`);
    this.apDefLine.setText(`DEF +${payload.defender.data.def}   HP ${payload.defender.hp}/${payload.defender.maxHp}`);

    this.apAtkIconG.clear();
    this.apDefIconG.clear();
    drawIcon(this.apAtkIconG, payload.attacker.data.id, 0, 0, 30, 0xffffff, 0.95);
    drawIcon(this.apDefIconG, payload.defender.data.id, 0, 0, 30, 0xffffff, 0.95);

    // Reset visuals
    this.apAtkRoll.setScale(1).setText("?");
    this.apDefRoll.setScale(1).setText("?");
    this.apAtkTotal.setAlpha(0).setText("");
    this.apDefTotal.setAlpha(0).setText("");
    this.apResult.setAlpha(0).setText("");

    this.attackPop.setVisible(true);
    if (this._attackPopUpdateMasks) this._attackPopUpdateMasks();
    this.apLeftThumb.setMask(this.apLeftMask);
    this.apRightThumb.setMask(this.apRightMask);

    // Phase 1: roulette roll numbers for both
    const rollDuration = ATTACK_POP_ROLL_MS;
    const tick = 60;

    let elapsed = 0;
    const timer = this.time.addEvent({
      delay: tick,
      loop: true,
      callback: () => {
        elapsed += tick;
        this.apAtkRoll.setText(String(1 + Math.floor(Math.random()*10)));
        this.apDefRoll.setText(String(1 + Math.floor(Math.random()*10)));

        if (elapsed >= rollDuration){
          timer.remove(false);

          // Land on the actual rolled values
          this.apAtkRoll.setText(String(payload.aRoll));
          this.apDefRoll.setText(String(payload.dRoll));

          // Phase 2: slide modifier into the roll, then update to total
          const atkMod = payload.attacker.data.atk || 0;
          const defMod = payload.defender.data.def || 0;

          // Start modifier slightly offset, slide over the roll number
          this.apAtkTotal.setText((atkMod>=0?"+":"") + atkMod).setAlpha(1);
          this.apDefTotal.setText((defMod>=0?"+":"") + defMod).setAlpha(1);

          const atkStartX = this.apAtkRoll.x + 88;
          const defStartX = this.apDefRoll.x - 88;
          this.apAtkTotal.setPosition(atkStartX, this.apAtkRoll.y);
          this.apDefTotal.setPosition(defStartX, this.apDefRoll.y);

          const applyTotals = () => {
            // Pop totals into place
            this.apAtkRoll.setText(String(payload.aTotal));
            this.apDefRoll.setText(String(payload.dTotal));

            this.tweens.add({ targets: this.apAtkRoll, scale: 1.10, duration: 120, yoyo: true, ease: "Sine.easeInOut" });
            this.tweens.add({ targets: this.apDefRoll, scale: 1.10, duration: 120, yoyo: true, ease: "Sine.easeInOut" });

            // Fade modifiers out after the update
            this.tweens.add({ targets: [this.apAtkTotal, this.apDefTotal], alpha: 0, duration: 200, ease: "Sine.easeInOut" });

            // Phase 3: flash outcome between thumbnails
            const isHit = !!payload.hit;
            this.apResult.setText(isHit ? "HIT!" : "MISS!").setAlpha(0);

            this.tweens.add({
              targets: this.apResult,
              alpha: 1,
              duration: 120,
              ease: "Sine.easeInOut",
              yoyo: true,
              repeat: 5
            });

            // Hold the result screen for 2 seconds, then close
            this.time.delayedCall(2000, () => {
              this.attackPop.setVisible(false);
              this.inputEnabled = true;
            });
          };

          // Slide mods toward the roll number
          this.tweens.add({
            targets: this.apAtkTotal,
            x: this.apAtkRoll.x + 38,
            duration: 220,
            ease: "Sine.easeInOut"
          });
          this.tweens.add({
            targets: this.apDefTotal,
            x: this.apDefRoll.x - 38,
            duration: 220,
            ease: "Sine.easeInOut",
            onComplete: applyTotals
          });
        }
      }
    });
  }

  /* ---------- POWER UPS ---------- */

  getAvailablePowerUps(){
    return (this.powerUps || []).filter(p => !p.used);
  }
  consumePowerUp(type){
    const idx = (this.powerUps || []).findIndex(p => !p.used && p.id === type);
    if (idx >= 0) this.powerUps[idx].used = true;
  }
  applyMedPackToUnit(u){
    if (!u || !u.alive) return;
    u.hp = Math.min(u.maxHp, u.hp + 3);
    u.redraw();
    this.consumePowerUp("med");
  }

  /* ---------- BUTTONS / PHASE ---------- */

  onMoveButton(){
    if (this.activeSide !== this.SIDE_PLAYER){
      this.showModalOk("IT IS NOT YOUR TURN.");
      return;
    }
    if (this.moveLocked){
      this.showModalOk("MOVEMENT PHASE IS OVER FOR THIS TURN.");
      return;
    }
    if (this.turnMoveRemaining <= 0){
      this.showModalOk("NO MOVEMENT POINTS LEFT THIS TURN.");
      return;
    }
    this.clearSelection();
    this.phase = this.PHASE_MOVE;
    this.redrawAll();
  }

  anyAttackAvailableForPlayer(){
    const attackers = this.playerUnits.filter(u => u.alive && !u.attacked && !u.stunnedActive);
    const defenders = this.aiUnits.filter(u => u.alive);
    for (const a of attackers){
      for (const d of defenders){
        if (axialDistance(a.hex, d.hex) <= a.data.range && this.hasLineOfSight(a.hex, d.hex)) return true;
      }
    }
    return false;
  }

  goToAttackPhase(){
    this.moveLocked = true;
    this.clearSelection();
    this.phase = this.PHASE_ATTACK;
    this.redrawAll();
  }

  onAttackButton(){
    if (this.activeSide !== this.SIDE_PLAYER){
      this.showModalOk("IT IS NOT YOUR TURN.");
      return;
    }
    if (!this.anyAttackAvailableForPlayer()){
      this.showModalOk("NO ENEMY UNITS ARE AVAILABLE TO ATTACK.");
      return;
    }
    if (!this.moveLocked && this.turnMoveRemaining > 0){
      this.showModalConfirm(
        `YOU STILL HAVE ${this.turnMoveRemaining} MOVEMENT LEFT.\nARE YOU SURE YOU'RE FINISHED MOVING?`,
        () => this.goToAttackPhase()
      );
      return;
    }
    this.goToAttackPhase();
  }

  onEndTurnButton(){
    if (this.activeSide !== this.SIDE_PLAYER){
      this.showModalOk("IT IS NOT YOUR TURN.");
      return;
    }
    this.startTurn(this.SIDE_AI);
  }

  /* ---------- OBSTACLES (random symmetric, max cluster 3) ---------- */
  makeObstaclesSymmetricRandom(total){
    const targetPairs = Math.floor(total/2);
    const set = new Set();

    let seed = ((Date.now() ^ (Math.random()*1e9|0)) >>> 0);
    const rnd = () => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const mirrorKey = (hex) => {
      const tile = this.board.tiles.get(hex.key());
      if (!tile) return null;
      const mc = (this.COLS - 1) - tile.col;
      const mr = tile.row;
      const mh = offsetToAxial_evenQ(mc, mr);
      return mh.key();
    };

    const maxComponentSize = (temp) => {
      const seen = new Set();
      let max = 0;
      for (const kk of temp){
        if (seen.has(kk)) continue;
        const q = [kk];
        seen.add(kk);
        let count = 0;
        while (q.length){
          const cur = q.shift();
          count++;
          const hx = this.board.tiles.get(cur)?.hex;
          if (!hx) continue;
          for (const n of this.board.neighbors(hx)){
            const nk = n.key();
            if (!temp.has(nk) || seen.has(nk)) continue;
            seen.add(nk);
            q.push(nk);
          }
        }
        max = Math.max(max, count);
      }
      return max;
    };

    const candidates = [];
    for (let c=4; c<=11; c++){
      for (let r=1; r<=7; r++){
        candidates.push(offsetToAxial_evenQ(c,r));
      }
    }

    let pairs = 0;
    let guard = 0;
    while (pairs < targetPairs && guard++ < 9000){
      const h = candidates[Math.floor(rnd()*candidates.length)];
      const k1 = h.key();
      const k2 = mirrorKey(h);
      if (!k2) continue;
      if (set.has(k1) || set.has(k2)) continue;

      const temp = new Set(set);
      temp.add(k1); temp.add(k2);

      if (maxComponentSize(temp) > 3) continue;

      set.add(k1); set.add(k2);
      pairs++;
    }

    // fallback fill (still mirrored)
    guard = 0;
    while (set.size < total && guard++ < 3000){
      const h = candidates[Math.floor(rnd()*candidates.length)];
      const k1 = h.key();
      const k2 = mirrorKey(h);
      if (!k2) continue;
      if (set.has(k1) || set.has(k2)) continue;

      const temp = new Set(set);
      temp.add(k1); temp.add(k2);
      if (maxComponentSize(temp) > 3) continue;

      set.add(k1); set.add(k2);
    }

    return set;
  }

  /* ---------- TURN / AI / LOS / COMBAT ---------- */

  startTurn(side){
    this.activeSide = side;
    this.phase = this.PHASE_MOVE;
    this.turnMoveRemaining = this.turnMoveMax;
    this.moveLocked = false;

    const units = (side === this.SIDE_PLAYER) ? this.playerUnits : this.aiUnits;
    for (const u of units){
      if (!u.alive) continue;

      u.moveUsed = 0;
      u.attacked = false;

      // Apply stun for this unit's next turn only:
      // if stunnedTurns > 0 at the start of their turn => stunnedActive for this turn, then consume it
      if (u.stunnedTurns && u.stunnedTurns > 0){
        u.stunnedActive = true;
        u.stunnedTurns = 0; // consume
      } else {
        u.stunnedActive = false;
      }

      // Visual: opacity during stunned turn
      u.go.setAlpha(u.stunnedActive ? STUNNED_ALPHA : 1);
    }

    this.clearSelection();
    this.redrawAll();

    if (side === this.SIDE_PLAYER){
      this.flashYourTurnBanner();
      this.inputEnabled = true;
    } else {
      this.inputEnabled = false;
      this.time.delayedCall(250, () => this.runAiTurnAnimated());
    }
  }

  flashYourTurnBanner(){
    if (!this.turnBanner) return;
    this.tweens.killTweensOf(this.turnBanner);
    this.turnBanner.setAlpha(1);
    this.tweens.add({
      targets: this.turnBanner,
      alpha: 0.25,
      duration: 160,
      yoyo: true,
      repeat: 5,
      ease: "Sine.easeInOut",
      onComplete: () => this.turnBanner.setAlpha(1)
    });
  }

  tweenUnitToHex(unit, hex, duration=180){
    return new Promise((resolve) => {
      const p = this.layout.hexToPixel(hex);
      this.tweens.add({
        targets: unit.go,
        x: p.x,
        y: p.y,
        duration,
        ease: "Sine.easeInOut",
        onComplete: () => resolve()
      });
    });
  }

  buildOccupiedSet(){
    const s = new Set(this.obstacles);
    for (const u of this.playerUnits) if (u.alive) s.add(u.hex.key());
    for (const u of this.aiUnits) if (u.alive) s.add(u.hex.key());
    return s;
  }

  nearestUnit(fromHex, units){
    let best=null, bestD=Infinity;
    for (const u of units){
      if (!u.alive) continue;
      const d = axialDistance(fromHex, u.hex);
      if (d < bestD){ bestD=d; best=u; }
    }
    return best;
  }

  async runAiTurnAnimated(){
    this.phase = this.PHASE_MOVE;
    this.turnMoveRemaining = this.turnMoveMax;
    this.clearSelection();
    this.redrawAll();

    const ai = this.aiUnits.filter(u => u.alive);
    const player = this.playerUnits.filter(u => u.alive);

    // Movement: skip stunned AI units
    for (const u of ai){
      if (this.turnMoveRemaining <= 0) break;
      if (u.stunnedActive) continue;

      let unitRemaining = Math.max(0, u.data.speed - u.moveUsed);

      while (unitRemaining > 0 && this.turnMoveRemaining > 0){
        const target = this.nearestUnit(u.hex, player);
        if (!target) break;

        const curD = axialDistance(u.hex, target.hex);
        let best = null;
        let bestD = curD;

        const occ = this.buildOccupiedSet();
        occ.delete(u.hex.key());

        for (const n of this.board.neighbors(u.hex)){
          if (occ.has(n.key())) continue;
          const d = axialDistance(n, target.hex);
          if (d < bestD){
            bestD = d;
            best = n;
          }
        }
        if (!best) break;

        u.hex = best;
        u.moveUsed += 1;
        unitRemaining -= 1;
        this.turnMoveRemaining -= 1;

        await this.tweenUnitToHex(u, u.hex, 170);
        u.redraw();
        this.redrawAll();

        // Mine trigger
        if (this.checkMineTriggerOnUnit(u)){
          if (this.checkWinLose()) return;
          break;
        }

        await new Promise(r => this.time.delayedCall(60, r));
      }
      await new Promise(r => this.time.delayedCall(140, r));
    }

    this.phase = this.PHASE_ATTACK;
    this.redrawAll();

    // Attack: skip stunned AI units
    for (const u of ai){
      if (!u.alive || u.attacked) continue;
      if (u.stunnedActive) continue;


      const inRange = player.filter(p => p.alive && axialDistance(u.hex, p.hex) <= u.data.range);
      const canSee = inRange.filter(p => this.hasLineOfSight(u.hex, p.hex));

      if (canSee.length === 0){
        // If no player is attackable, AI may choose to destroy a nearby mine.
        const minesInRange = (this.mines || []).filter(m => m && axialDistance(u.hex, m.hex) <= u.data.range && this.hasLineOfSight(u.hex, m.hex));
        if (minesInRange.length === 0) continue;

        // Pick the closest mine
        minesInRange.sort((a,b) => axialDistance(u.hex, a.hex) - axialDistance(u.hex, b.hex));
        u.attacked = true;
        this.detonateMine(minesInRange[0], "attack");
        this.redrawAll();
        await new Promise(r => this.time.delayedCall(220, r));
        continue;
      }

      canSee.sort((a,b) => a.hp - b.hp);
      await this.resolveAttackWithPopup(u, canSee[0]);
      if (this.checkWinLose()) return;

      await new Promise(r => this.time.delayedCall(180, r));
    }

    // End AI turn: next player turn clears any non-consumed stun visuals automatically when their turn starts
    this.startTurn(this.SIDE_PLAYER);
  }

  hasLineOfSight(a, b){
    const line = hexLine(a, b);
    for (let i = 1; i < line.length - 1; i++){
      if (this.obstacles.has(line[i].key())) return false;
    }
    return true;
  }

  rollD10(){ return 1 + Math.floor(Math.random() * 10); }

  applyDamageToUnit(unit, amount){
    if (!unit || !unit.alive) return;
    unit.hp -= amount;
    if (unit.hp <= 0){
      unit.alive = false;
      unit.go.setVisible(false);
      unit.hit.disableInteractive();
    }
  }


  /* ---------- MINES ---------- */

  mineAt(hexKey){
    return (this.mines || []).find(m => m && m.hexKey === hexKey) || null;
  }

  isHexOccupiedByUnit(hexKey){
    for (const u of this.playerUnits) if (u.alive && u.hex.key() === hexKey) return true;
    for (const u of this.aiUnits) if (u.alive && u.hex.key() === hexKey) return true;
    return false;
  }

  placeMineAt(hex, silent=false){
    const hexKey = hex.key();
    if (this.obstacles.has(hexKey)){
      if (!silent) this.showModalOk("YOU CAN\'T PLACE A MINE ON AN OBSTACLE.");
      return false;
    }
    if (this.isHexOccupiedByUnit(hexKey)){
      if (!silent) this.showModalOk("THAT SPACE IS OCCUPIED.");
      return false;
    }
    if (this.mineAt(hexKey)){
      if (!silent) this.showModalOk("THERE IS ALREADY A MINE THERE.");
      return false;
    }

    // consume one mine power up
    const idx = (this.powerUps || []).findIndex(p => !p.used && p.id === "mine");
    if (idx < 0){
      if (!silent) this.showModalOk("NO MINES AVAILABLE.");
      return false;
    }
    this.powerUps[idx].used = true;

    const p = this.layout.hexToPixel(hex);
    const img = this.add.image(p.x, p.y, "mine_token").setOrigin(0.5);
    img.setDepth(350); // above board, below units
    // Scale mine to comfortably fit inside a hex
    const target = this.layout.size * 1.2;
    const m = Math.max(img.width || 1, img.height || 1);
    img.setScale(target / m);

    const mineObj = { hexKey, hex, img };
    this.mines.push(mineObj);
    this.mineSprites.set(hexKey, img);

    this._pendingMinePlace = false;
    if (!silent) this.showModalOk("MINE PLACED.");
    this.redrawAll();
    return true;
  }

  detonateMine(mineObj, cause, triggerUnit){
    if (!mineObj) return;
    const hex = mineObj.hex;
    const hexKey = mineObj.hexKey;

    // remove visual + record
    mineObj.img?.destroy?.();
    this.mineSprites.delete(hexKey);
    this.mines = (this.mines || []).filter(m => m !== mineObj);

    // small blast flash
    const p = this.layout.hexToPixel(hex);
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(p.x, p.y, 30);
    g.setDepth(900);
    this.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() });

    const neighbors = this.board.neighbors(hex).map(h => h.key());
    const allUnits = [...this.playerUnits, ...this.aiUnits];

    if (cause === "step"){
      if (triggerUnit && triggerUnit.alive){
        this.applyDamageToUnit(triggerUnit, 2);
      }
      for (const u of allUnits){
        if (!u.alive) continue;
        if (neighbors.includes(u.hex.key())){
          this.applyDamageToUnit(u, 1);
        }
      }
    } else if (cause === "attack"){
      for (const u of allUnits){
        if (!u.alive) continue;
        if (neighbors.includes(u.hex.key())){
          this.applyDamageToUnit(u, 1);
        }
      }
    }

    this.positionAllUnits();
    this.redrawAll();
  }

  checkMineTriggerOnUnit(unit){
    if (!unit || !unit.alive) return false;
    const k = unit.hex.key();
    const mineObj = this.mineAt(k);
    if (!mineObj) return false;
    this.detonateMine(mineObj, "step", unit);
    return true;
  }

  computeAttackOutcome(attacker, defender){
    const aRoll = this.rollD10();
    const dRoll = this.rollD10();
    const aTotal = aRoll + attacker.data.atk;
    const dTotal = dRoll + defender.data.def;
    const hit = aTotal > dTotal;
    return { aRoll, dRoll, aTotal, dTotal, hit };
  }

  spawnBlastAtHex(hex){
    const p = this.layout.hexToPixel(hex);
    const keys = ["blast1","blast2","blast3"];
    const k = keys[Math.floor(Math.random()*keys.length)];
    if (!this.textures.exists(k)) return;

    const img = this.add.image(p.x, p.y, k).setDepth(65);
    this.blasts.add(img);

    const targetW = this.layout.size * 2.1;
    img.setScale(targetW / img.width);
    img.setAlpha(0.95);
  }

  async resolveAttackWithPopup(attacker, defender){
    // Stunned units cannot attack
    if (attacker.stunnedActive){
      attacker.attacked = true;
      this.redrawAll();
      return;
    }

    if (!this.hasLineOfSight(attacker.hex, defender.hex)){
      attacker.attacked = true;
      this.redrawAll();

      this.showAttackPopup({
        atkTeam: (attacker.side === "player") ? this.playerTeam : this.aiTeam,
        defTeam: (defender.side === "player") ? this.playerTeam : this.aiTeam,
        attacker, defender,
        aRoll: 0, dRoll: 0, aTotal: 0, dTotal: 0,
        hit: false
      });
      await new Promise(r => this.time.delayedCall(ATTACK_POP_ROLL_MS + ATTACK_POP_PAUSE_MS + 250, r));

      playSFX(this, "sfx_miss", 0.85, true);
      return;
    }

    const out = this.computeAttackOutcome(attacker, defender);

    this.showAttackPopup({
      atkTeam: (attacker.side === "player") ? this.playerTeam : this.aiTeam,
      defTeam: (defender.side === "player") ? this.playerTeam : this.aiTeam,
      attacker, defender,
      ...out
    });

    await new Promise(r => this.time.delayedCall(ATTACK_POP_ROLL_MS + ATTACK_POP_PAUSE_MS + 250, r));

    playSFX(this, out.hit ? "sfx_hit" : "sfx_miss", out.hit ? 0.82 : 0.8, true);

    if (out.hit){
      this.spawnBlastAtHex(defender.hex);

      this.applyDamageToUnit(defender, attacker.data.dmg);

      // Grenadier splash
      if (attacker.data.id === "grenadier"){
        const adj = this.board.neighbors(defender.hex);
        const allUnits = [...this.playerUnits, ...this.aiUnits];
        for (const h of adj){
          const k = h.key();
          for (const u of allUnits){
            if (!u.alive) continue;
            if (u.hex.key() === k) this.applyDamageToUnit(u, 1);
          }
        }
      }

      // Shock Trooper stun: defender is stunned on THEIR NEXT TURN
      if (attacker.data.id === "shock" && defender.alive){
        defender.stunnedTurns = 1; // will convert to stunnedActive when their side's startTurn runs
        // Do NOT change texture/icon; only opacity when their turn begins.
      }
    }

    attacker.attacked = true;
    this.positionAllUnits();
    this.redrawAll();
  }

  checkWinLose(){
    const playerAlive = this.playerUnits.some(u => u.alive);
    const aiAlive = this.aiUnits.some(u => u.alive);

    if (!playerAlive || !aiAlive){
      this.showEndOverlay(playerAlive ? "YOU WIN" : "YOU LOSE");
      return true;
    }
    return false;
  }

  showEndOverlay(text){
    this.inputEnabled = false;


    if (!this._statsRecorded){
      this._statsRecorded = true;
      endMatch(text === "YOU WIN");
    }

    // If this win unlocked something, show the congratulations overlay instead
    // of the normal rematch/new game screen.
    const didWin = (text === "YOU WIN");
    if (didWin && STATS){
      const team = this.playerTeam;
      if (STATS.mineUnlockPending){
        showMineUnlockOverlay(this, {
          buttonLabel: "LET'S GO",
          nextScene: "TeamSelectScene",
          onGo: () => {
            GAME_DATA.teamColor = team;
            this.scene.start("TeamSelectScene");
          }
        });
        return;
      }
      if (STATS.phloxUnlockPending){
        showPhloxUnlockOverlay(this, {
          buttonLabel: "LET'S GO",
          nextScene: "TeamSelectScene",
          onGo: () => {
            GAME_DATA.teamColor = team;
            this.scene.start("TeamSelectScene");
          }
        });
        return;
      }
    }

    const w = this.scale.width, h = this.scale.height;
    const cx = w/2, cy = h/2;

    const overlay = this.add.container(0,0).setDepth(2000);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.70);
    g.fillRect(0,0,w,h);

    const t = this.add.text(cx, cy - 120, text, {
      fontFamily: FONT_FAMILY,
      fontSize: "72px",
      color: "#ffffff"
    }).setOrigin(0.5);

    overlay.add([g, t]);

    const btnRematch = makeButton(this, cx, cy - 10, 320, 68, "REMATCH", () => {
      this.scene.restart(this._initData || {
        playerTeam: this.playerTeam,
        playerRoster: this.playerRoster.map(u => ({ ...u })),
        powerUps: this.powerUps.map(p => ({ ...p })),
      });
    }, 0x22c55e, 28);

    const btnNew = makeButton(this, cx, cy + 80, 320, 68, "NEW GAME", () => {
      this.scene.start("TitleScene");
    }, 0x5aa9ff, 28);

    overlay.add([btnRematch.container, btnNew.container]);
  }

  clearSelection(){
    this.selectedSide = null;
    this.selectedIndex = null;
    this.reachableMap = null;
    this.attackableSet = null;
  }

  selectPlayerUnit(index){
    if (!this.inputEnabled) return;
    if (this.activeSide !== this.SIDE_PLAYER) return;

    const token = this.playerUnits[index];
    if (!token || !token.alive) return;

    if (token.stunnedActive){
      this.showModalOk("THIS UNIT IS STUNNED AND CANNOT MOVE OR ATTACK THIS TURN.");
      return;
    }

    if (this.phase === this.PHASE_MOVE){
      if (this.moveLocked) return;
      this.selectedSide = this.SIDE_PLAYER;
      this.selectedIndex = index;
      this.computeMoveReachForSelected();
      this.redrawAll();
      return;
    }

    if (this.phase === this.PHASE_ATTACK){
      if (token.attacked) return;
      this.selectedSide = this.SIDE_PLAYER;
      this.selectedIndex = index;
      this.computeAttackablesForSelected();
      this.redrawAll();
    }
  }

  computeMoveReachForSelected(){
    if (this.selectedSide !== this.SIDE_PLAYER || this.selectedIndex === null) { this.reachableMap=null; return; }

    const u = this.playerUnits[this.selectedIndex];
    if (!u || !u.alive) { this.reachableMap=null; return; }
    if (u.stunnedActive) { this.reachableMap=null; return; }

    const unitRemaining = Math.max(0, u.data.speed - u.moveUsed);
    const maxSteps = Math.min(unitRemaining, this.turnMoveRemaining);

    const blocked = new Set(this.obstacles);
    for (const pu of this.playerUnits) if (pu.alive) blocked.add(pu.hex.key());
    for (const au of this.aiUnits) if (au.alive) blocked.add(au.hex.key());
    blocked.delete(u.hex.key());

    this.reachableMap = this.board.reachable(u.hex, maxSteps, blocked);
  }

  computeAttackablesForSelected(){
    this.attackableSet = new Set();
    if (this.selectedSide !== this.SIDE_PLAYER || this.selectedIndex === null) return;

    const attacker = this.playerUnits[this.selectedIndex];
    if (!attacker || !attacker.alive) return;
    if (attacker.stunnedActive) return;

    const rng = attacker.data.range;

    for (const enemy of this.aiUnits){
      if (!enemy.alive) continue;
      if (axialDistance(attacker.hex, enemy.hex) <= rng && this.hasLineOfSight(attacker.hex, enemy.hex)){
        this.attackableSet.add(enemy.hex.key());
      }
    }

    // Mines are attackable (any hit destroys them)
    for (const mineObj of (this.mines || [])){
      if (!mineObj) continue;
      const mineHex = mineObj.hex;
      if (axialDistance(attacker.hex, mineHex) <= rng && this.hasLineOfSight(attacker.hex, mineHex)){
        this.attackableSet.add(mineObj.hexKey);
      }
    }
  }

  async tryAttackAtHex(hexKey){
    if (this.phase !== this.PHASE_ATTACK) return;
    if (this.activeSide !== this.SIDE_PLAYER) return;
    if (this.selectedSide !== this.SIDE_PLAYER || this.selectedIndex === null) return;
    if (!this.attackableSet || !this.attackableSet.has(hexKey)) return;

    const attacker = this.playerUnits[this.selectedIndex];
    if (!attacker || !attacker.alive) return;
    if (attacker.stunnedActive){
      this.showModalOk("THIS UNIT IS STUNNED AND CANNOT ATTACK THIS TURN.");
      return;
    }

    const mineObj = this.mineAt(hexKey);
    if (mineObj){
      // Any attack destroys the mine (no roll). Mine detonates with 1 splash damage to adjacent hexes.
      this.detonateMine(mineObj, "attack");
      this.clearSelection();
      if (this.checkWinLose()) return;
      this.redrawAll();
      return;
    }

    const target = this.aiUnits.find(u => u.alive && u.hex.key() === hexKey);
    if (!target) return;

    await this.resolveAttackWithPopup(attacker, target);

    this.clearSelection();
    if (this.checkWinLose()) return;
    this.redrawAll();
  }

  /* ---------- SPAWN ---------- */

  evenRows(count){
    if (count <= 0) return [];
    if (count === 1) return [Math.floor(this.ROWS/2)];
    const rows = [];
    for (let i=0;i<count;i++){
      const t = (i + 1) / (count + 1);
      rows.push(Math.round(t * (this.ROWS - 1)));
    }
    return rows;
  }

  findNearestFreeOnColumn(col, desiredRow){
    for (let d=0; d<this.ROWS; d++){
      const candidates = [desiredRow - d, desiredRow + d];
      for (const r of candidates){
        if (r < 0 || r >= this.ROWS) continue;
        const hex = offsetToAxial_evenQ(col, r);
        const key = hex.key();
        if (!this.obstacles.has(key)) return hex;
      }
    }
    for (let r=0;r<this.ROWS;r++){
      const hex = offsetToAxial_evenQ(col, r);
      if (!this.obstacles.has(hex.key())) return hex;
    }
    return offsetToAxial_evenQ(col, desiredRow);
  }

  spawnUnitsEvenly(){
    this.playerUnits = [];
    this.aiUnits = [];

    const playerRows = this.evenRows(this.playerRoster.length);
    const aiRows = this.evenRows(this.aiRoster.length);

    this.playerRoster.forEach((ud, i) => {
      const desired = playerRows[i] ?? 0;
      const hex = this.findNearestFreeOnColumn(0, desired);
      this.playerUnits.push(this.makeToken("player", ud, hex, this.playerTeam));
    });

    this.aiRoster.forEach((ud, i) => {
      const desired = aiRows[i] ?? 0;
      const hex = this.findNearestFreeOnColumn(this.COLS - 1, desired);
      this.aiUnits.push(this.makeToken("ai", { ...ud, name: `ENEMY ${ud.name}` }, hex, this.aiTeam));
    });

    this.positionAllUnits();
  }

  /* ---------- TOKENS ---------- */

  makeToken(side, data, hex, teamKey){
    const go = this.add.container(0,0).setDepth(120);

    const badgeKey = `badge_${teamKey}_${data.id}`;
    const badge = this.add.image(0, 0, badgeKey).setOrigin(0.5);
    badge.setScale(0.78);
    go.add(badge);

    const hpG = this.add.graphics();
    go.add(hpG);

    const token = {
      side,
      data: { ...data },
      hex,
      go,
      badge,
      hpG,
      hp: data.hp,
      maxHp: data.hp,
      alive: true,
      moveUsed: 0,
      attacked: false,
      stunnedTurns: 0,     // pending stun for next turn
      stunnedActive: false,// true during the stunned turn
      hit: null,
      redraw: () => {}
    };

    const drawHp = () => {
      hpG.clear();
      const bw = 40, bh = 6;
      const ratio = token.maxHp > 0 ? Phaser.Math.Clamp(token.hp / token.maxHp, 0, 1) : 0;

      hpG.fillStyle(0x0b0f14, 0.92);
      hpG.fillRoundedRect(-bw/2, 24, bw, bh, 3);

      hpG.fillStyle(0x22c55e, 1);
      hpG.fillRoundedRect(-bw/2, 24, bw * ratio, bh, 3);
    };

    token.redraw = drawHp;
    drawHp();

    const hit = this.add.circle(0,0,30,0x000000,0).setInteractive({ useHandCursor: true });
    go.add(hit);
    token.hit = hit;

    hit.on("pointerover", () => {
      const extra = (side === "player")
        ? `\nMOVE ${token.moveUsed}/${token.data.speed}  ATTACKED ${token.attacked ? "YES" : "NO"}`
        : "";

      const stunLine = token.stunnedActive ? `\nSTATUS: STUNNED` : "";

      this.tipName.setText(`${token.data.name}`);

      this.tipBody.setText(
        `HP ${token.hp}/${token.maxHp} | SPD ${token.data.speed} | RNG ${token.data.range}\n` +
        `ATK +${token.data.atk}  DEF +${token.data.def}  DMG ${token.data.dmg}` +
        `${extra}${stunLine}`
      );

      this.tooltip.setVisible(true);

      const worldX = token.go.x;
      const isLeft = worldX < (this.scale.width / 2);

      // Place tooltip beside the unit, never on top of it
      const halfW = (token.go.displayWidth ? token.go.displayWidth/2 : 32);
      const offsetX = halfW + 14;

      const px = isLeft ? (worldX + offsetX) : (worldX - this.tipW - offsetX);
      const py = token.go.y - (this.tipH/2);

      this.tooltip.setPosition(
        Phaser.Math.Clamp(px, 10, this.scale.width - this.tipW - 10),
        Phaser.Math.Clamp(py, 10, this.scale.height - this.tipH - 10)
      );
    });
    hit.on("pointerout", () => this.tooltip.setVisible(false));

    hit.on("pointerdown", () => {
      if (!this.inputEnabled) return;
      if (!token.alive) return;

      // Clicking stunned unit: show popup (both sides—only matters on their own turn, but clearer)
      if (token.stunnedActive && token.side === "player" && this.activeSide === this.SIDE_PLAYER){
        this.showModalOk("THIS UNIT IS STUNNED AND CANNOT MOVE OR ATTACK THIS TURN.");
        return;
      }
      if (token.stunnedActive && token.side === "ai" && this.activeSide === this.SIDE_PLAYER){
        // no popup needed; but safe to ignore
      }

      if (side === "player") {
        this.selectPlayerUnit(this.playerUnits.indexOf(token));
      } else {
        if (this.activeSide === "player" && this.phase === this.PHASE_ATTACK) {
          this.tryAttackAtHex(token.hex.key());
        }
      }
    });

    return token;
  }

  positionAllUnits(){
    for (const u of this.playerUnits){
      const p = this.layout.hexToPixel(u.hex);
      u.go.setPosition(p.x, p.y);
      u.redraw();
    }
    for (const u of this.aiUnits){
      const p = this.layout.hexToPixel(u.hex);
      u.go.setPosition(p.x, p.y);
      u.redraw();
    }
  }

  /* ---------- BOARD FIT ---------- */

  computeBounds(layout){
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for (const t of this.board.tiles.values()){
      const p = layout.hexToPixel(t.hex);
      const c = layout.hexCorners(p.x,p.y);
      for (const k of c){
        minX=Math.min(minX,k.x); minY=Math.min(minY,k.y);
        maxX=Math.max(maxX,k.x); maxY=Math.max(maxY,k.y);
      }
    }
    return { minX, minY, width: maxX-minX, height: maxY-minY };
  }

  fitBoard(w,h){
    const leftPanelW = this._panelW ?? Math.min(360, Math.max(270, Math.floor(w * 0.26)));
    const marginLeft = (this._panelX ?? 10) + leftPanelW + 50;
    const marginRight = 40;
    const marginTop = this._boardMarginTop ?? 110;
    const marginBottom = 40;

    const testSize = 10;
    const b1 = this.computeBounds(new HexLayout(testSize, 0, 0));
    const scale = Math.min(
      (w - marginLeft - marginRight) / b1.width,
      (h - marginTop - marginBottom) / b1.height
    );
    const size = Phaser.Math.Clamp(testSize * scale, 12, 80);

    const layout = new HexLayout(size, 0, 0);
    const b2 = this.computeBounds(layout);

    this.layout.size = size;
    this.layout.originX = marginLeft + ((w - marginLeft - marginRight) - b2.width) / 2 - b2.minX;
    this.layout.originY = marginTop + ((h - marginTop - marginBottom) - b2.height) / 2 - b2.minY;
  }

  layoutUI(w, h){
    const panelW = Math.min(360, Math.max(270, Math.floor(w * 0.26)));
    const panelH = Math.min(h - 140, 600);

    const panelX = 10;
    const marginTopForBoard = 110;
    const panelY = marginTopForBoard;

    this.leftPanel.setPosition(panelX, panelY);

    this.leftPanelBg.clear();
    this.leftPanelBg.fillStyle(0x0f1720, 0.70);
    this.leftPanelBg.fillRoundedRect(0, 0, panelW, panelH, 14);
    this.leftPanelBg.lineStyle(2, 0x5aa9ff, 0.20);
    this.leftPanelBg.strokeRoundedRect(0, 0, panelW, panelH, 14);

    const btnY = TOPBAR.yCenter;
    let x = panelX + panelW + 30;

    this.btnMove.container.setPosition(x + 80, btnY);
    x += 175;
    this.btnAttack.container.setPosition(x + 95, btnY);
    x += 215;
    this.btnEnd.container.setPosition(x + 105, btnY);

    this._panelW = panelW;
    this._panelH = panelH;
    this._panelX = panelX;
    this._boardMarginTop = marginTopForBoard;
  }

  pixelToNearestHexOnBoard(px, py){
    let best=null, bestD=Infinity;
    for (const t of this.board.tiles.values()){
      const c = this.layout.hexToPixel(t.hex);
      const dx = c.x - px;
      const dy = c.y - py;
      const d = dx*dx + dy*dy;
      if (d < bestD){ bestD=d; best=t.hex; }
    }
    const max = (this.layout.size * 0.95) ** 2;
    if (bestD > max) return null;
    return best;
  }

  /* ---------- TILE TEXTURES ---------- */

  drawTanTileDust(hexKey, corners){
    const seedObj = { v: this.tileSeeds.get(hexKey) ?? this.seedFromKey(hexKey) };
    const cx = corners.reduce((s,p)=>s+p.x,0)/6;
    const cy = corners.reduce((s,p)=>s+p.y,0)/6;

    const specks = 14;
    for (let i=0;i<specks;i++){
      const rx = (this.rndFromSeed(seedObj)-0.5) * this.layout.size * 1.2;
      const ry = (this.rndFromSeed(seedObj)-0.5) * this.layout.size * 1.2;
      const r  = 0.8 + this.rndFromSeed(seedObj) * 1.4;
      this.gBoard.fillStyle(0x7a6a45, 0.10);
      this.gBoard.fillCircle(cx + rx, cy + ry, r);
    }

    const scratches = 6;
    for (let s=0;s<scratches;s++){
      const x0 = cx + (this.rndFromSeed(seedObj)-0.5) * this.layout.size * 1.3;
      const y0 = cy + (this.rndFromSeed(seedObj)-0.5) * this.layout.size * 1.3;
      const ang = this.rndFromSeed(seedObj) * Math.PI;
      const len = this.layout.size * (0.35 + this.rndFromSeed(seedObj) * 0.55);
      const x1 = x0 + Math.cos(ang)*len;
      const y1 = y0 + Math.sin(ang)*len;

      this.gBoard.lineStyle(1, 0x5b5137, 0.18);
      this.gBoard.beginPath();
      this.gBoard.moveTo(x0, y0);
      this.gBoard.lineTo(x1, y1);
      this.gBoard.strokePath();
    }
  }

  drawObstacleSpeckle(hexKey, corners){
    const seedObj = { v: this.tileSeeds.get(hexKey) ?? this.seedFromKey(hexKey) };
    const cx = corners.reduce((s,p)=>s+p.x,0)/6;
    const cy = corners.reduce((s,p)=>s+p.y,0)/6;

    const blobs = 7;
    for (let i=0;i<blobs;i++){
      const rx = (this.rndFromSeed(seedObj)-0.5) * this.layout.size * 1.1;
      const ry = (this.rndFromSeed(seedObj)-0.5) * this.layout.size * 1.1;
      const r  = 2.2 + this.rndFromSeed(seedObj) * 4.6;
      this.gBoard.fillStyle(0x374151, 0.26);
      this.gBoard.fillCircle(cx + rx, cy + ry, r);
    }

    const specks = 28;
    for (let i=0;i<specks;i++){
      const rx = (this.rndFromSeed(seedObj)-0.5) * this.layout.size * 1.4;
      const ry = (this.rndFromSeed(seedObj)-0.5) * this.layout.size * 1.4;
      const r  = 0.9 + this.rndFromSeed(seedObj) * 1.8;
      this.gBoard.fillStyle(0x111827, 0.18);
      this.gBoard.fillCircle(cx + rx, cy + ry, r);
    }
  }

  redrawBoard(){
    this.gBoard.clear();
    const outline = 0x3a4653;

    for (const t of this.board.tiles.values()){
      const p = this.layout.hexToPixel(t.hex);
      const corners = this.layout.hexCorners(p.x,p.y);

      const key = t.hex.key();
      const isObstacle = this.obstacles.has(key);

      const fill = isObstacle ? 0x6b7280 : 0xcbbf9a;
      this.gBoard.fillStyle(fill, 0.95);

      this.gBoard.beginPath();
      this.gBoard.moveTo(corners[0].x, corners[0].y);
      for (let i=1;i<6;i++) this.gBoard.lineTo(corners[i].x, corners[i].y);
      this.gBoard.closePath();
      this.gBoard.fillPath();

      if (isObstacle) this.drawObstacleSpeckle(key, corners);
      else this.drawTanTileDust(key, corners);

      this.gBoard.lineStyle(2, outline, isObstacle ? 0.85 : 0.70);
      this.gBoard.beginPath();
      this.gBoard.moveTo(corners[0].x, corners[0].y);
      for (let i=1;i<6;i++) this.gBoard.lineTo(corners[i].x, corners[i].y);
      this.gBoard.closePath();
      this.gBoard.strokePath();
    }
  }

  redrawOverlay(){
    this.gOverlay.clear();

    // Mine placement highlight
    if (this._pendingMinePlace){
      for (const t of this.board.tiles.values()){
        const key = t.hex.key();
        if (this.obstacles.has(key)) continue;
        if (this.isHexOccupiedByUnit(key)) continue;
        if (this.mineAt(key)) continue;
        const p = this.layout.hexToPixel(t.hex);
        const corners = this.layout.hexCorners(p.x,p.y);
        this.gOverlay.fillStyle(0xa855f7, 0.18);
        this.gOverlay.beginPath();
        this.gOverlay.moveTo(corners[0].x, corners[0].y);
        for (let i=1;i<6;i++) this.gOverlay.lineTo(corners[i].x, corners[i].y);
        this.gOverlay.closePath();
        this.gOverlay.fillPath();
        this.gOverlay.lineStyle(2, 0xa855f7, 0.35);
        this.gOverlay.beginPath();
        this.gOverlay.moveTo(corners[0].x, corners[0].y);
        for (let i=1;i<6;i++) this.gOverlay.lineTo(corners[i].x, corners[i].y);
        this.gOverlay.closePath();
        this.gOverlay.strokePath();
      }
      return; // don't show move/attack overlays while placing a mine
    }

    
    // Med Pack targeting highlight (only units missing HP)
    if (this._pendingMed){
      for (const u of (this.playerUnits || [])){
        if (!u || !u.alive) continue;
        if (u.hp >= u.maxHp) continue;
        const tile = this.board.tiles.get(u.hex.key());
        if (!tile) continue;
        const p = this.layout.hexToPixel(tile.hex);
        const corners = this.layout.hexCorners(p.x,p.y);
        this.gOverlay.fillStyle(0x22c55e, 0.18);
        this.gOverlay.beginPath();
        this.gOverlay.moveTo(corners[0].x, corners[0].y);
        for (let i=1;i<6;i++) this.gOverlay.lineTo(corners[i].x, corners[i].y);
        this.gOverlay.closePath();
        this.gOverlay.fillPath();
        this.gOverlay.lineStyle(3, 0x86efac, 0.55);
        this.gOverlay.beginPath();
        this.gOverlay.moveTo(corners[0].x, corners[0].y);
        for (let i=1;i<6;i++) this.gOverlay.lineTo(corners[i].x, corners[i].y);
        this.gOverlay.closePath();
        this.gOverlay.strokePath();
      }
    }

if (this.activeSide === "player" && this.phase === this.PHASE_MOVE && this.reachableMap){
      for (const [key, dist] of this.reachableMap.entries()){
        if (dist === 0) continue;
        const tile = this.board.tiles.get(key);
        if (!tile) continue;

        const p = this.layout.hexToPixel(tile.hex);
        const corners = this.layout.hexCorners(p.x,p.y);

        this.gOverlay.fillStyle(0x22c55e, 0.22);
        this.gOverlay.beginPath();
        this.gOverlay.moveTo(corners[0].x, corners[0].y);
        for (let i=1;i<6;i++) this.gOverlay.lineTo(corners[i].x, corners[i].y);
        this.gOverlay.closePath();
        this.gOverlay.fillPath();

        this.gOverlay.lineStyle(3, 0x86efac, 0.50);
        this.gOverlay.beginPath();
        this.gOverlay.moveTo(corners[0].x, corners[0].y);
        for (let i=1;i<6;i++) this.gOverlay.lineTo(corners[i].x, corners[i].y);
        this.gOverlay.closePath();
        this.gOverlay.strokePath();
      }
    }

    if (this.activeSide === "player" && this.phase === this.PHASE_ATTACK && this.attackableSet){
      for (const key of this.attackableSet){
        const tile = this.board.tiles.get(key);
        if (!tile) continue;

        const p = this.layout.hexToPixel(tile.hex);
        const corners = this.layout.hexCorners(p.x,p.y);

        this.gOverlay.fillStyle(0xef4444, 0.18);
        this.gOverlay.beginPath();
        this.gOverlay.moveTo(corners[0].x, corners[0].y);
        for (let i=1;i<6;i++) this.gOverlay.lineTo(corners[i].x, corners[i].y);
        this.gOverlay.closePath();
        this.gOverlay.fillPath();

        this.gOverlay.lineStyle(4, 0xfca5a5, 0.50);
        this.gOverlay.beginPath();
        this.gOverlay.moveTo(corners[0].x, corners[0].y);
        for (let i=1;i<6;i++) this.gOverlay.lineTo(corners[i].x, corners[i].y);
        this.gOverlay.closePath();
        this.gOverlay.strokePath();
      }
    }
  }

  redrawRosterPanel(){
    for (const t of this.rosterTexts) t.destroy();
    this.rosterTexts = [];
    for (const b of this.powerUpButtons) b.destroy();
    this.powerUpButtons = [];

    const whose = (this.activeSide === "player") ? "YOUR TURN" : "OPPONENT TURN";
    const phase = this.phase;

    this.turnBanner.setText(whose);

    let line1 = `PHASE: ${phase}`;
    let line2 = "";
    if (phase === this.PHASE_MOVE){
      line2 = `MOVE LEFT: ${this.turnMoveRemaining}/${this.turnMoveMax}`;
    } else {
      const units = (this.activeSide === "player") ? this.playerUnits : this.aiUnits;
      const left = units.filter(u => u.alive && !u.attacked && !u.stunnedActive).length;
      line2 = `ATTACKS LEFT: ${left}`;
    }
    this.panelInfo.setText(`${line1}\n${line2}`);

    this.rosterG.clear();

    const panelW = this._panelW ?? 320;
    const startX = 14;
    let y = 104;

    const addPanelText = (x, y, str, style) => {
      const t = this.add.text(x, y, str, style);
      this.leftPanel.add(t);
      this.rosterTexts.push(t);
      return t;
    };

    const drawSide = (label, teamKey, units) => {
      // NOTE: previous iteration referenced an undefined `opts` here (crashed on battle start).
      // If we later want to support a "locked" roster view, pass an options arg explicitly.
      const accent = teamColorHex(teamKey);

      this.rosterG.fillStyle(accent, 0.55);
      this.rosterG.fillRoundedRect(startX, y, panelW - 28, 26, 8);
      this.rosterG.lineStyle(2, accent, 0.85);
      this.rosterG.strokeRoundedRect(startX, y, panelW - 28, 26, 8);

      addPanelText(startX + 10, y + 4, label, {
        fontFamily: FONT_FAMILY, fontSize: "18px", color: "#ffffff"
      });

      y += 34;

      const rowH = 44;
      const iconX = startX + 22;
      const nameX = startX + 52;
      const barX = startX + 162;
      const barW = panelW - 28 - (barX - startX) - 60;
      const barH = 10;
      const hpTextX = startX + (panelW - 28) - 56;

      for (const u of units){
        if (!u.alive) continue;

        this.rosterG.fillStyle(0x0b1220, 0.55);
        this.rosterG.fillRoundedRect(startX, y, panelW - 28, rowH - 6, 8);

        drawIcon(this.rosterG, u.data.id, iconX, y + 18, 22, 0xffffff, 0.95);

        const ratio = u.maxHp > 0 ? Phaser.Math.Clamp(u.hp / u.maxHp, 0, 1) : 0;
        const barY = y + 16;

        this.rosterG.fillStyle(0x0b0f14, 0.92);
        this.rosterG.fillRoundedRect(barX, barY, barW, barH, 4);

        this.rosterG.fillStyle(0x22c55e, 1);
        this.rosterG.fillRoundedRect(barX, barY, Math.max(0, barW * ratio), barH, 4);

        const nm = u.data.name.replace(/^ENEMY\s+/, "");
        const suffix = u.stunnedActive ? " (STUNNED)" : "";
        addPanelText(nameX, y + 10, `${nm}${suffix}`, {
          fontFamily: FONT_FAMILY, fontSize: "18px", color: "#ffffff"
        });

        addPanelText(hpTextX, y + 10, `${u.hp}/${u.maxHp}`, {
          fontFamily: FONT_FAMILY, fontSize: "18px", color: "#ffffff"
        });

        y += rowH;
        if (y > (this._panelH ?? 600) - 170) break;
      }

      y += 10;
    };

    drawSide(`YOUR UNITS (${teamName(this.playerTeam)})`, this.playerTeam, this.playerUnits);

    // Power Ups section between
    const avail = this.getAvailablePowerUps();
    if (avail.length > 0){
      const barCol = teamColorHex(this.playerTeam);

      this.rosterG.fillStyle(barCol, 0.30);
      this.rosterG.fillRoundedRect(startX, y, panelW - 28, 26, 8);
      this.rosterG.lineStyle(2, barCol, 0.65);
      this.rosterG.strokeRoundedRect(startX, y, panelW - 28, 26, 8);
      addPanelText(startX + 10, y + 4, "POWER UPS", { fontFamily: FONT_FAMILY, fontSize: "18px", color: "#ffffff" });
      y += 38;

      const iconSize = 50;
      const gap = 12;
      let x = startX + 10;

      for (const pwr of avail){
        const tex = `pwr_${this.playerTeam}_${pwr.id}`;
        const icon = this.add.image(x + iconSize/2, y + iconSize/2, tex).setOrigin(0.5);
        icon.setScale(iconSize / icon.width);

        const hit = this.add.rectangle(x + iconSize/2, y + iconSize/2, iconSize+6, iconSize+6, 0x000000, 0)
          .setInteractive({ useHandCursor: true });

        hit.on("pointerdown", () => {
          if (this.activeSide !== this.SIDE_PLAYER){
            this.showModalOk("IT IS NOT YOUR TURN.");
            return;
          }
          if (pwr.id === "med"){
            this._pendingMed = true;
            this._pendingMinePlace = false;
            this.redrawAll();
          } else if (pwr.id === "mine"){
            this._pendingMinePlace = true;
            this._pendingMed = false;
            this.redrawAll();
          }

        });

        this.leftPanel.add(icon);
        this.leftPanel.add(hit);

        this.powerUpButtons.push(icon);
        this.powerUpButtons.push(hit);

        x += iconSize + gap;
      }

      y += iconSize + 14;
    }

    drawSide(`ENEMY UNITS (${teamName(this.aiTeam)})`, this.aiTeam, this.aiUnits);
  }

  redrawAll(){
    this.redrawBoard();
    this.positionAllUnits();
    this.redrawOverlay();
    this.redrawRosterPanel();
  }

  /* ---------- POINTER MED PACK TARGETING (simple, stable) ---------- */
  // We use modal as instruction, then next click on a player unit consumes med pack.
  update(){
    // nothing here, but left for Phaser hook
  }

  /* ---------- END: required by our simple med pack flow ---------- */
  consumePendingMedOnUnit(token){
    if (!this._pendingMed) return false;

    const idx = (this.powerUps || []).findIndex(p => !p.used && p.id === "med");
    if (idx < 0){
      // Should not happen; fail silently.
      this._pendingMed = false;
      return true;
    }

    if (!token || !token.alive) return true;
    if (token.hp >= token.maxHp) return true; // not eligible; keep pending

    // Consume med pack
    this._pendingMed = false;
    token.hp = Math.min(token.maxHp, token.hp + 3);
    token.redraw();
    this.powerUps[idx].used = true;
    this.redrawAll();
    return true;
  }
}

/* Patch: intercept player unit click to allow med-pack targeting without a complex mode system */
(function patchBattleSceneMedPack(){
  const origMakeToken = BattleScene.prototype.makeToken;
  BattleScene.prototype.makeToken = function(side, data, hex, teamKey){
    const token = origMakeToken.call(this, side, data, hex, teamKey);

    if (side === "player"){
      const originalDown = token.hit.listenerCount("pointerdown") ? null : null;

      // Remove existing pointerdown listeners and re-add with med-pack hook.
      token.hit.removeAllListeners("pointerdown");
      token.hit.on("pointerdown", () => {
        if (!this.inputEnabled) return;
        if (!token.alive) return;

        if (this._pendingMed){
          // Using med pack ignores stun status (healing is allowed)
          this.consumePendingMedOnUnit(token);
          return;
        }

        if (token.stunnedActive && this.activeSide === this.SIDE_PLAYER){
          this.showModalOk("THIS UNIT IS STUNNED AND CANNOT MOVE OR ATTACK THIS TURN.");
          return;
        }

        this.selectPlayerUnit(this.playerUnits.indexOf(token));
      });
    }

    if (side === "ai"){
      token.hit.removeAllListeners("pointerdown");
      token.hit.on("pointerdown", () => {
        if (!this.inputEnabled) return;
        if (!token.alive) return;
        if (this.activeSide === "player" && this.phase === this.PHASE_ATTACK) {
          this.tryAttackAtHex(token.hex.key());
        }
      });
    }

    return token;
  };
})();

/* ============================
   GAME CONFIG
   ============================ */

new Phaser.Game({
  type: Phaser.AUTO,
  backgroundColor: "#0b0f14",
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight
  },
  scene: [TitleScene, TeamSelectScene, ShopScene, BattleScene],
});
