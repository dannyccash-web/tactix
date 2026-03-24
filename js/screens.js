// ============================================================
// screens.js  —  All screens, styled to match the visual guide
// ============================================================

const Screens = (() => {

  const E = TactixEngine;

  // ── DOM helpers ───────────────────────────────────────────
  function el(tag, styles, attrs) {
    const d = document.createElement(tag);
    if (styles) Object.assign(d.style, styles);
    if (attrs)  Object.assign(d, attrs);
    return d;
  }

  // ── Shared CSS ────────────────────────────────────────────
  (function injectCSS() {
    if (document.getElementById('tx-styles')) return;
    const s = document.createElement('style');
    s.id = 'tx-styles';
    s.textContent = `
      .tx-btn {
        font-family:'Iceberg',monospace;
        font-size:13px; letter-spacing:2px;
        color:#eef6fb; background:rgba(14,26,38,.68);
        border:1.5px solid #7da4b3;
        padding:7px 20px; cursor:pointer;
        transition:background .12s,border-color .12s,color .12s, box-shadow .12s;
        text-transform:uppercase;
      }
      .tx-btn:hover { background:rgba(22,42,58,.82); border-color:#a6c0cd; color:#ffffff; }
      .tx-btn.primary { border-color:#2a8a50; color:#3ad870; background:rgba(10,24,16,.78); box-shadow:0 0 16px rgba(58,216,112,.15) inset; }
      .tx-btn.primary:hover { background:rgba(18,38,24,.9); border-color:#4aee88; }
      .tx-btn:disabled { opacity:.3; pointer-events:none; }

      .phase-btn {
        font-family:'Iceberg',monospace; font-size:13px; letter-spacing:2px;
        padding:7px 22px; cursor:pointer; border:1.5px solid; background:transparent;
        transition:background .1s, opacity .15s;
      }
      .phase-btn.move   { border-color:#2a8a2a; color:#4ad84a; }
      .phase-btn.attack { border-color:#b8941a; color:#e8c040; }
      .phase-btn.endturn{ border-color:#8a3a3a; color:#d86060; }
      .phase-btn:hover  { background:rgba(255,255,255,.07); }
      .phase-btn.dimmed { opacity:.28; pointer-events:none; }
      .phase-btn.active { background:rgba(255,255,255,.1); }

      .pu-icon {
        width:42px; height:48px;
        display:flex; align-items:center; justify-content:center;
        cursor:pointer; color:#90b8c8;
        background:transparent;
        transition:transform .12s, filter .12s, opacity .12s;
        user-select:none; flex-shrink:0;
      }
      .pu-icon:hover  { transform:translateY(-1px); filter:brightness(1.08); }
      .pu-icon.active { filter:drop-shadow(0 0 10px rgba(240,224,64,.45)); }
      .pu-icon.enemy  { opacity:.72; cursor:default; }

      .tx-overlay {
        position:absolute; inset:0;
        background:rgba(0,0,0,.72);
        display:flex; align-items:center; justify-content:center;
        z-index:50;
      }
      .tx-panel {
        background:rgba(5,14,22,.97);
        border:1px solid #1e3848;
      }
      .menu-tab-btn {
        font-family:'Iceberg',monospace; font-size:14px; letter-spacing:2px;
        padding:14px 24px; background:transparent;
        border:none; border-right:1px solid #162430;
        color:#364e5c; cursor:pointer;
        transition:color .12s;
      }
      .menu-tab-btn:hover { color:#8ab0c0; }
      .menu-tab-btn.active { color:#c8dce8; border-bottom:2px solid #4a90b0; }

      .squad-card {
        display:flex; align-items:center; gap:12px;
        padding:8px 10px; margin-bottom:6px;
        background:rgba(8,20,32,.7);
        border:1px solid #182838;
        transition:background .1s;
      }
      .squad-card:hover { background:rgba(20,50,78,.7); }
      .roster-row {
        display:flex; align-items:center; gap:10px;
        padding:6px 10px; margin-bottom:5px;
        background:rgba(8,20,32,.6);
        border:1px solid #0e1e2c;
      }
      .combat-overlay {
        position:absolute; left:50%; top:58%; transform:translate(-50%,-50%);
        width:520px; pointer-events:none; z-index:14;
      }
    `;
    document.head.appendChild(s);
  })();

  // ──────────────────────────────────────────────────────────
  // TITLE SCREEN
  // ──────────────────────────────────────────────────────────
  function Title() {
    let fade = 0;

    function handleClick() {
      E.unlockAudio();
      E.setScreen(GameSelect());
    }

    function enter() {
      E.playMusic('score');
      E.getCanvas().addEventListener('click', handleClick, { once: true });
    }

    function destroy() {
      E.getCanvas().removeEventListener('click', handleClick);
    }

    function update(dt) {
      fade = Math.min(1, fade + dt * 1.5);
    }

    function render(ctx) {
      E.drawBackground(ctx, 'bg1', 1);
      ctx.save();
      ctx.globalAlpha = fade;

      const logo = E.getImage('logo');
      if (logo) {
        const lw = 820;
        const lh = logo.height * (lw / logo.width);
        ctx.drawImage(logo, (1280 - lw) / 2, 52 + lh, lw, lh);
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.font = '34px Iceberg';
      ctx.fillStyle = '#466070';
      ctx.fillText('TURN-BASED COMBAT', 640, 410);

      const bw = 250, bh = 64;
      const bx = 640 - bw / 2, by = 480;
      ctx.fillStyle = 'rgba(14,26,38,.68)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#7da4b3';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.font = '30px Iceberg';
      ctx.fillStyle = '#eef6fb';
      ctx.fillText('START', 640, by + bh / 2 + 1);

      ctx.restore();
    }


    return { enter, destroy, update, render };
  }

  // ──────────────────────────────────────────────────────────
  // GAME SELECT
  // ──────────────────────────────────────────────────────────
  function GameSelect() {
    let fade = 0;
    let hovered = null;
    let selectedMode = null;

    const MELEE_CX = 390, CTF_CX = 890, CARD_CY = 384, CARD_R = 138;

    function hitHex(mx, my, cx, cy, r) {
      return Math.hypot(mx - cx, my - cy) < r * 0.92;
    }

    function buildNav() {
      buildTopBar('CHOOSE YOUR GAME', () => E.setScreen(Title()), selectedMode ? () => E.setScreen(TeamSelect(selectedMode)) : null, !!selectedMode);
    }

    function handleClick(e) {
      const {mx, my} = canvasMouse(e);
      if (hitHex(mx, my, MELEE_CX, CARD_CY, CARD_R)) selectedMode = 'melee';
      else if (hitHex(mx, my, CTF_CX, CARD_CY, CARD_R)) selectedMode = 'ctf';
      else return;
      buildNav();
    }

    function handleMove(e) {
      const {mx, my} = canvasMouse(e);
      if (hitHex(mx, my, MELEE_CX, CARD_CY, CARD_R)) hovered = 'melee';
      else if (hitHex(mx, my, CTF_CX, CARD_CY, CARD_R)) hovered = 'ctf';
      else hovered = null;
    }

    function enter() {
      E.getCanvas().addEventListener('click', handleClick);
      E.getCanvas().addEventListener('mousemove', handleMove);
      buildNav();
    }
    function destroy() {
      E.getCanvas().removeEventListener('click', handleClick);
      E.getCanvas().removeEventListener('mousemove', handleMove);
    }

    function update(dt) { fade = Math.min(1, fade + dt * 2); }

    function render(ctx) {
      E.drawBackground(ctx, 'bg2', 1);
      E.drawDim(ctx, 0.42);
      ctx.save();
      ctx.globalAlpha = fade;

      drawModeHex(ctx, MELEE_CX, CARD_CY, CARD_R, 'melee_icon', 'MELEE', hovered === 'melee' || selectedMode === 'melee');
      drawModeHex(ctx, CTF_CX, CARD_CY, CARD_R, 'capture_the_flag_icon', 'CAPTURE THE FLAG', hovered === 'ctf' || selectedMode === 'ctf');

      ctx.restore();
    }

    function drawModeHex(ctx, cx, cy, r, iconKey, label, hot) {
      ctx.save();
      hexPath6(ctx, cx, cy, hot ? r + 6 : r);
      ctx.fillStyle = hot ? 'rgba(22,46,70,.84)' : 'rgba(12,28,44,.78)';
      ctx.fill();
      ctx.shadowColor = hot ? 'rgba(90,170,220,.42)' : 'transparent';
      ctx.shadowBlur = hot ? 24 : 0;
      ctx.strokeStyle = hot ? '#5aa9cd' : '#29455a';
      ctx.lineWidth = hot ? 2.8 : 2;
      ctx.stroke();
      ctx.shadowBlur = 0;

      const icon = E.getImage(iconKey);
      if (icon) {
        const maxW = hot ? 154 : 146;
        const maxH = hot ? 112 : 106;
        const scale = Math.min(maxW / icon.width, maxH / icon.height);
        const w = Math.round(icon.width * scale);
        const h = Math.round(icon.height * scale);
        ctx.drawImage(icon, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
      }

      ctx.font = '24px Iceberg';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = hot ? '#fff' : '#c7d8e2';
      ctx.fillText(label, cx, cy + r + 28);
      ctx.restore();
    }

    return { enter, destroy, update, render };
  }

  // ──────────────────────────────────────────────────────────
  // TEAM SELECT
  // ──────────────────────────────────────────────────────────
  function TeamSelect(mode) {
    let fade = 0;
    let hovered = null;
    let selectedTeam = null;

    const layout = [
      { id: 'vermillion', x: 180, y: 430 },
      { id: 'azure',      x: 410, y: 300 },
      { id: 'virent',     x: 640, y: 430 },
      { id: 'phlox',      x: 870, y: 300 },
      { id: 'magma',      x: 1100, y: 430 }
    ];
    const teams = layout.map(item => Data.TEAMS[item.id]);
    const R = 118;

    function hit(mx, my, cx, cy, r) {
      return Math.hypot(mx - cx, my - cy) < r * 0.92;
    }

    function buildNav() {
      buildTopBar('SELECT YOUR TEAM', () => E.setScreen(GameSelect()), selectedTeam ? () => E.setScreen(SquadBuilder(mode, selectedTeam)) : null, !!selectedTeam);
    }

    function handleClick(e) {
      const {mx,my} = canvasMouse(e);
      layout.forEach((pos, i) => {
        if (hit(mx, my, pos.x, pos.y, R)) selectedTeam = teams[i].id;
      });
      buildNav();
    }
    function handleMove(e) {
      const {mx,my} = canvasMouse(e);
      hovered = null;
      layout.forEach((pos, i) => {
        if (hit(mx, my, pos.x, pos.y, R)) hovered = teams[i].id;
      });
    }

    function enter() {
      E.getCanvas().addEventListener('click', handleClick);
      E.getCanvas().addEventListener('mousemove', handleMove);
      buildNav();
    }
    function destroy() {
      E.getCanvas().removeEventListener('click', handleClick);
      E.getCanvas().removeEventListener('mousemove', handleMove);
    }

    function update(dt) { fade = Math.min(1, fade + dt * 2); }

    function render(ctx) {
      E.drawBackground(ctx, 'bg2', 1);
      E.drawDim(ctx, 0.44);
      ctx.save();
      ctx.globalAlpha = fade;
      teams.forEach((team, i) => drawTeamHex(ctx, layout[i].x, layout[i].y, R, team, hovered === team.id || selectedTeam === team.id));
      ctx.restore();
    }

    function drawTeamHex(ctx, cx, cy, r, team, hot) {
      const portrait = E.getImage(team.portrait);
      const rr = hot ? r + 5 : r;
      ctx.save();
      hexPath6(ctx, cx, cy, rr);
      ctx.fillStyle = 'rgba(8,18,28,.74)';
      ctx.fill();
      ctx.shadowColor = hot ? (team.glowColor || team.color) : 'transparent';
      ctx.shadowBlur = hot ? 26 : 0;
      ctx.strokeStyle = team.color;
      ctx.lineWidth = hot ? 3 : 2;
      ctx.stroke();
      ctx.shadowBlur = 0;

      if (portrait) {
        ctx.save();
        hexPath6(ctx, cx, cy, rr - 2);
        ctx.clip();
        const zoom = hot ? 1.14 : 1.06;
        const w = rr * 2.08 * zoom;
        const h = w;
        ctx.drawImage(portrait, cx - w / 2, cy - h * 0.58, w, h);
        ctx.restore();
      }

      ctx.font = `${hot ? 20 : 18}px Iceberg`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#eef6fb';
      ctx.shadowColor = 'rgba(0,0,0,.95)';
      ctx.shadowBlur = 10;
      ctx.fillText(team.name, cx, cy + rr * 0.75);
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    return { enter, destroy, update, render };
  }

  // ──────────────────────────────────────────────────────────
  // SQUAD BUILDER
  // ──────────────────────────────────────────────────────────
  function SquadBuilder(mode, teamId) {
    const team = Data.TEAMS[teamId];
    let roster   = [];
    let powerups = [];

    function totalCost() {
      return roster.reduce((s,id)  => s + Data.UNITS[id].cost, 0)
           + powerups.reduce((s,id) => s + Data.POWERUPS[id].cost, 0);
    }

    function addUnit(id) {
      if (totalCost() + Data.UNITS[id].cost > Data.SQUAD_BUDGET) return;
      roster.push(id); buildUI();
    }
    function removeUnit(i) { roster.splice(i,1); buildUI(); }
    function addPowerup(id) {
      if (powerups.length >= Data.POWERUP_CAP) return;
      if (totalCost() + Data.POWERUPS[id].cost > Data.SQUAD_BUDGET) return;
      powerups.push(id); buildUI();
    }
    function removePowerup(i) { powerups.splice(i,1); buildUI(); }

    function buildUI() {
      const ui = E.getUI(); ui.innerHTML = '';
      const cost = totalCost();
      const rem  = Data.SQUAD_BUDGET - cost;
      const canReady = roster.length > 0;

      // ── Top nav bar ───────────────────────────────────────
      const nav = el('div', {
        position:'absolute', top:'0', left:'0', right:'0', height:'48px',
        background:'rgba(3,10,18,.95)', borderBottom:'1px solid #162434',
        display:'flex', alignItems:'center', padding:'0 24px', gap:'16px'
      });

      const title = el('div', {
        fontFamily:'Iceberg,monospace', fontSize:'19px', letterSpacing:'4px', color:'#e7f2f8'
      });
      title.textContent = 'BUILD YOUR SQUAD';


      const backBtn = txBtn('BACK', () => E.setScreen(TeamSelect(mode)));
      const readyBtn = txBtn('READY', () => {
        E.setScreen(Battle(mode, teamId, [...roster], [...powerups]));
      });
      readyBtn.classList.add('primary');
      if (!canReady) readyBtn.disabled = true;

      nav.append(title, backBtn, readyBtn);
      ui.appendChild(nav);

      // ── Two-column layout ─────────────────────────────────
      const body = el('div', {
        position:'absolute', top:'48px', left:'0', right:'0', bottom:'0',
        display:'flex'
      });

      // Left: available pool
      const left = el('div', {
        width:'46%', padding:'16px 18px',
        background:'rgba(4,12,20,.90)',
        borderRight:'1px solid #162434', overflowY:'auto'
      });

      sectionHeader(left, 'SOLDIERS');
      team.units.forEach(uid => left.appendChild(buildUnitCard(uid, rem)));

      sectionHeader(left, 'POWER UPS', {marginTop:'18px'});
      Object.values(Data.POWERUPS).forEach(pu =>
        left.appendChild(buildPUCard(pu, rem, powerups.length))
      );

      // Right: your squad
      const right = el('div', {
        flex:'1', padding:'18px 20px',
        background:'rgba(5,14,24,.88)', overflowY:'auto'
      });

      const squadHdr = el('div', {
        fontFamily:'Iceberg,monospace', fontSize:'19px', letterSpacing:'3px',
        color:'#e6f1f7', marginBottom:'14px', display:'flex', justifyContent:'space-between'
      });
      squadHdr.innerHTML = `<span>YOUR SQUAD</span><span style="color:${rem>=0?'#f0d34f':'#c84444'}">${cost}/${Data.SQUAD_BUDGET} PTS</span>`;
      right.appendChild(squadHdr);

      if (!roster.length && !powerups.length) {
        const hint = el('div', {
          fontFamily:'RobotoMono,monospace', fontSize:'11px', color:'#283848', marginTop:'20px'
        });
        hint.textContent = 'Add soldiers and power-ups from the left panel.';
        right.appendChild(hint);
      }

      roster.forEach((uid, i) => {
        const u = Data.UNITS[uid];
        right.appendChild(rosterRow(u.name, u.cost, team.color, () => removeUnit(i), unitIconKey(u.id), false));
      });

      if (powerups.length) {
        sectionHeader(right, 'POWER UPS', {marginTop:'14px'});
        powerups.forEach((pid, i) => {
          const pu = Data.POWERUPS[pid];
          right.appendChild(rosterRow(pu.name, pu.cost, team.color, () => removePowerup(i), powerupIconKey(pu.id), true));
        });
      }

      // READY button below squad panel
      const readyRow = el('div', {
        position:'absolute', bottom:'68px', right:'28px'
      });
      const readyBig = txBtn('READY', () => {
        if (!canReady) return;
        E.setScreen(Battle(mode, teamId, [...roster], [...powerups]));
      });
      readyBig.classList.add('primary');
      readyBig.style.cssText += ';font-size:16px;padding:11px 42px;';
      if (!canReady) readyBig.disabled = true;
      readyRow.appendChild(readyBig);
      ui.appendChild(readyRow);

      body.append(left, right);
      ui.appendChild(body);
    }

    function buildUnitCard(uid, rem) {
      const u = Data.UNITS[uid];
      const card = el('div'); card.className = 'squad-card';

      const iconHex = buildHexIcon(unitIconKey(u.id), team.color, false, 50, 58, 30);

      const info = el('div', { flex:'1' });
      const nm = el('div', { fontFamily:'Iceberg,monospace', fontSize:'16px', color:'#f1f7fb', letterSpacing:'1px' });
      nm.textContent = u.name;
      const st = el('div', { fontFamily:'RobotoMono,monospace', fontSize:'9px', color:'#9cb3c0', marginTop:'2px' });
      st.textContent = `SPEED ${u.speed}  RANGE ${u.range}  ATK +${u.atk}  DEF +${u.def}  DMG ${u.dmg}  HP ${u.hp}`;
      info.append(nm, st);
      if (u.special) {
        const sp = el('div', { fontFamily:'RobotoMono,monospace', fontSize:'9px', color:team.color, marginTop:'2px' });
        sp.textContent = specialLabel(u.special);
        info.appendChild(sp);
      }

      const costEl = el('div', { fontFamily:'Iceberg,monospace', fontSize:'15px', color: u.cost<=rem?'#f0d34f':'#c84444', flexShrink:'0' });
      costEl.textContent = u.cost + 'pts.';

      const addBtn = txBtn('+', () => addUnit(uid));
      addBtn.style.cssText += ';padding:4px 11px;font-size:16px;flex-shrink:0;';
      if (u.cost > rem) addBtn.disabled = true;

      card.append(iconHex, info, costEl, addBtn);
      return card;
    }

    function buildPUCard(pu, rem, curCount) {
      const card = el('div'); card.className = 'squad-card';

      const iconHex = buildHexIcon(powerupIconKey(pu.id), team.color, true, 50, 58, 28);

      const info = el('div', { flex:'1' });
      const nm = el('div', { fontFamily:'Iceberg,monospace', fontSize:'16px', color:'#ffffff', letterSpacing:'1px' });
      nm.textContent = pu.name;
      const desc = el('div', { fontFamily:'RobotoMono,monospace', fontSize:'9px', color:'#ffffff', marginTop:'2px' });
      desc.textContent = pu.desc;
      info.append(nm, desc);

      const costEl = el('div', { fontFamily:'Iceberg,monospace', fontSize:'15px', color: pu.cost<=rem?'#f0d34f':'#c84444', flexShrink:'0' });
      costEl.textContent = pu.cost + 'pts.';

      const addBtn = txBtn('+', () => addPowerup(pu.id));
      addBtn.style.cssText += ';padding:4px 11px;font-size:16px;flex-shrink:0;';
      if (pu.cost > rem || curCount >= Data.POWERUP_CAP) addBtn.disabled = true;

      card.append(iconHex, info, costEl, addBtn);
      return card;
    }

    function rosterRow(name, cost, color, onRemove, iconKey, isPowerup) {
      const row = el('div'); row.className = 'roster-row';
      if (iconKey) row.appendChild(buildHexIcon(iconKey, color, isPowerup, 40, 46, 22));
      const rm  = txBtn('−', onRemove); rm.style.cssText += ';padding:2px 9px;font-size:15px;';
      const nm  = el('div', { fontFamily:'Iceberg,monospace', fontSize:'12px', color, flex:'1', letterSpacing:'1px' });
      nm.textContent = name;
      const cs  = el('div', { fontFamily:'RobotoMono,monospace', fontSize:'10px', color:'#4a6070' });
      cs.textContent = cost + 'pts.';
      row.append(nm, cs, rm);
      return row;
    }

    function enter() { buildUI(); }
    function update() {}
    function render() {}
    function destroy() {}

    return { enter, update, render, destroy };
  }

  // ──────────────────────────────────────────────────────────
  // BATTLE SCREEN
  // ──────────────────────────────────────────────────────────
  function Battle(mode, teamId, roster, powerups) {
    let tooltipData = null;
    let tooltipPos  = { x: 0, y: 0 };
    let menuOpen    = false;
    let menuTab     = 'roster';
    let gameOver    = false;

    // ── Canvas events ─────────────────────────────────────
    function handleClick(e) {
      if (menuOpen || gameOver) return;
      const state = Game.getState();
      if (!state) return;
      const ph = state.phase;
      if (ph === Game.PHASE.ENEMY || ph === Game.PHASE.OVER) return;

      const {mx, my} = canvasMouse(e);
      const tile = Board.tileAtPoint(mx, my);
      if (!tile) return;
      const { col, row } = tile;

      // Powerup flow first
      if (state.puState !== Game.PUSTATE.NONE) {
        const consumed = Game.handlePowerupClick(col, row);
        if (consumed) buildUI();
        return;
      }

      const tileIdx = Board.idx(col, row);
      const hl      = state.highlights[tileIdx];

      if (ph === Game.PHASE.MOVE) {
        if ((hl === 'move' || (hl && hl.type === 'move')) && state.selectedUnit) {
          Game.moveUnit(state.selectedUnit, col, row, () => buildUI());
        } else {
          const unit = Game.unitAt(col, row);
          if (unit && unit.side === 'player') Game.selectUnit(unit);
          else Game.clearSelection();
        }
      } else if (ph === Game.PHASE.ATTACK) {
        if ((hl === 'attack' || (hl && hl.type === 'attack')) && state.selectedUnit) {
          Game.attackTarget(state.selectedUnit, col, row);
          buildUI();
        } else {
          const unit = Game.unitAt(col, row);
          if (unit && unit.side === 'player' && !unit.attackedThisTurn && !unit.stunned)
            Game.selectUnit(unit);
          else Game.clearSelection();
        }
      }
    }

    function handleMove(e) {
      if (menuOpen) { tooltipData = null; return; }
      const {mx, my} = canvasMouse(e);
      tooltipPos = { x: mx, y: my };
      const tile = Board.tileAtPoint(mx, my);
      tooltipData = tile ? Game.getTooltipFor(tile.col, tile.row) : null;
    }

    // ── Screen lifecycle ──────────────────────────────────
    function enter() {
      Game.start({ mode, playerTeam: teamId, playerRoster: roster, playerPowerups: powerups });
      const state = Game.getState();
      state.onPhaseChange = () => buildUI();
      state.onGameOver = (winner, reason) => {
        gameOver = true;
        setTimeout(() => showEndOverlay(winner, reason), 900);
      };
      E.getCanvas().addEventListener('click', handleClick);
      E.getCanvas().addEventListener('mousemove', handleMove);
      buildUI();
    }

    function destroy() {
      E.getCanvas().removeEventListener('click', handleClick);
      E.getCanvas().removeEventListener('mousemove', handleMove);
    }

    function update(dt) { Game.update(dt); }

    function render(ctx) {
      E.drawBackground(ctx, 'bg2', 1);
      E.drawDim(ctx, 0.38);
      Game.render(ctx);
      if (tooltipData && !menuOpen) drawTooltip(ctx, tooltipPos.x, tooltipPos.y, tooltipData);
      const popup = Game.getCombatPopup && Game.getCombatPopup();
      if (popup) drawCombatPopup(ctx, popup);
    }

    // ── HUD ───────────────────────────────────────────────
    function buildUI() {
      if (gameOver) return;
      const ui = E.getUI(); ui.innerHTML = '';
      const state = Game.getState(); if (!state) return;

      const ph          = state.phase;
      const playerTurn  = ph === Game.PHASE.MOVE || ph === Game.PHASE.ATTACK;
      const aiTurn      = ph === Game.PHASE.ENEMY;

      // ── Top bar ───────────────────────────────────────
      const topBar = el('div', {
        position:'absolute', top:'0', left:'0', right:'0', height:'48px',
        background:'rgba(3,9,16,.93)', borderBottom:'1px solid #111e2a',
        display:'flex', alignItems:'center', padding:'0 16px', gap:'10px',
        zIndex:'10'
      });

      // Mode label (top-left)
      const modeLabel = el('div', {
        fontFamily:'Iceberg,monospace', fontSize:'15px', letterSpacing:'3px', color:'#7a9aaa',
        marginRight:'12px'
      });
      modeLabel.textContent = mode === 'ctf' ? 'CAPTURE THE FLAG' : 'MELEE';
      topBar.appendChild(modeLabel);

      // Phase buttons (MOVE | ATTACK | END TURN)
      const moveBtn   = phaseBtn('MOVE',     'move',    ph === Game.PHASE.MOVE,   !playerTurn);
      const attackBtn = phaseBtn('ATTACK',   'attack',  ph === Game.PHASE.ATTACK, !playerTurn);
      const endBtn    = phaseBtn('END TURN', 'endturn', false,                    !playerTurn);

      moveBtn.addEventListener('click', () => {
        if (ph !== Game.PHASE.MOVE) { Game.cancelPowerup(); Game.setPhase(Game.PHASE.MOVE); }
      });
      attackBtn.addEventListener('click', () => {
        if (ph !== Game.PHASE.ATTACK) { Game.cancelPowerup(); Game.setPhase(Game.PHASE.ATTACK); }
      });
      endBtn.addEventListener('click', () => {
        Game.clearSelection(); Game.cancelPowerup(); Game.endPlayerTurn();
      });

      topBar.append(moveBtn, attackBtn, endBtn);

      const phaseText = el('div', { fontFamily:'Iceberg,monospace', fontSize:'13px', color: aiTurn ? '#d86040' : '#7a9aaa',
        borderLeft:'1px solid #162430', paddingLeft:'12px', marginLeft:'2px' });
      phaseText.textContent = aiTurn ? 'ENEMY TURN' : 'YOUR TURN';
      topBar.appendChild(phaseText);

      if (playerTurn) {
        const mp = el('div', { fontFamily:'RobotoMono,monospace', fontSize:'10px', color:'#3a6070',
          paddingLeft:'4px', marginLeft:'2px' });
        mp.textContent = `MOVES: ${state.movePool}`;
        topBar.appendChild(mp);
      }

      // Spacer
      topBar.appendChild(el('div', { flex:'1' }));

      // Turn counter
      const turnEl = el('div', { fontFamily:'RobotoMono,monospace', fontSize:'10px', color:'#364858' });
      turnEl.textContent = `TURN ${state.turn}`;
      topBar.appendChild(turnEl);

      // BACK & MENU buttons (top-right, as in visual guide)
      const backBtn2 = txBtn('BACK', () => E.setScreen(TeamSelect(mode)));
      backBtn2.style.fontSize = '11px';
      const menuBtn2 = txBtn('MENU', () => { menuOpen = true; buildUI(); });
      menuBtn2.style.fontSize = '11px';
      topBar.append(backBtn2, menuBtn2);

      ui.appendChild(topBar);

      // ── Bottom power-up bar ────────────────────────────
      const puBar = el('div', {
        position:'absolute', bottom:'0', left:'0', right:'0', height:'52px',
        background:'rgba(3,9,16,.92)', borderTop:'1px solid #111e2a',
        display:'flex', alignItems:'center', padding:'0 20px', gap:'16px',
        zIndex:'10'
      });

      const puLabel = el('div', { fontFamily:'Iceberg,monospace', fontSize:'10px',
        letterSpacing:'2px', color:'#7a9aaa' });
      puLabel.textContent = 'POWER UPS';
      puBar.appendChild(puLabel);

      state.playerPowerups.forEach((pid) => {
        const ico = el('div'); ico.className = 'pu-icon';
        ico.appendChild(buildHexIcon(powerupIconKey(pid), state.playerTeam.color, true, 34, 39, 18));
        ico.title = Data.POWERUPS[pid].name;
        const active = state.puData && state.puData.puId === pid && state.puState !== Game.PUSTATE.NONE;
        if (active) ico.classList.add('active');
        if (playerTurn) {
          ico.addEventListener('click', () => {
            if (active) { Game.cancelPowerup(); buildUI(); }
            else        { Game.activatePowerup(pid); buildUI(); }
          });
        } else {
          ico.style.opacity = '0.3'; ico.style.pointerEvents = 'none';
        }
        puBar.appendChild(ico);
      });

      if (!state.playerPowerups.length) {
        const none = el('div', { fontFamily:'RobotoMono,monospace', fontSize:'10px', color:'#1e2e3c' });
        none.textContent = 'none';
        puBar.appendChild(none);
      }

      puBar.appendChild(el('div', { flex:'1' }));

      const enemyLabel = el('div', { fontFamily:'Iceberg,monospace', fontSize:'10px',
        letterSpacing:'2px', color:'#7a9aaa' });
      enemyLabel.textContent = 'ENEMY POWER UPS';
      puBar.appendChild(enemyLabel);

      state.aiPowerups.forEach(pid => {
        const ico = el('div'); ico.className = 'pu-icon enemy';
        ico.appendChild(buildHexIcon(powerupIconKey(pid), state.aiTeam.color, true, 34, 39, 18));
        ico.title = Data.POWERUPS[pid].name;
        puBar.appendChild(ico);
      });

      if (!state.aiPowerups.length) {
        const none = el('div', { fontFamily:'RobotoMono,monospace', fontSize:'10px', color:'#1e2e3c' });
        none.textContent = 'none';
        puBar.appendChild(none);
      }

      ui.appendChild(puBar);

      // Menu overlay
      if (menuOpen) buildMenuOverlay(ui, state);
    }

    // ── Menu overlay (matches visual guide) ───────────────
    function buildMenuOverlay(ui, state) {
      const overlay = el('div'); overlay.className = 'tx-overlay';
      overlay.addEventListener('click', e => {
        if (e.target === overlay) { menuOpen = false; buildUI(); }
      });

      const panel = el('div'); panel.className = 'tx-panel';
      Object.assign(panel.style, {
        width:'560px', minHeight:'380px', display:'flex', flexDirection:'column'
      });

      // Tab bar (left sidebar style as in guide)
      const tabSidebar = el('div', {
        display:'flex', flexDirection:'column',
        borderRight:'1px solid #0e1e2c', minWidth:'140px'
      });

      ['ROSTER','SETTINGS','RULES'].forEach(tab => {
        const t = el('button'); t.className = 'menu-tab-btn';
        if (menuTab === tab.toLowerCase()) t.classList.add('active');
        t.textContent = tab;
        t.addEventListener('click', () => { menuTab = tab.toLowerCase(); buildUI(); });
        tabSidebar.appendChild(t);
      });

      const closeBtn = txBtn('✕', () => { menuOpen = false; buildUI(); });
      closeBtn.style.cssText += ';margin-top:auto;border:none;padding:10px 14px;font-size:13px;';
      tabSidebar.appendChild(closeBtn);

      // Content area
      const content = el('div', { padding:'18px 20px', flex:'1', overflowY:'auto' });

      if (menuTab === 'roster') {
        ['player','ai'].forEach(side => {
          const hdr = el('div', { fontFamily:'Iceberg,monospace', fontSize:'11px', letterSpacing:'2px',
            color: side==='player' ? '#3a7aa0' : '#a04040', marginBottom:'10px', marginTop: side==='ai'?'16px':'0' });
          hdr.textContent = side==='player' ? 'YOUR UNITS' : 'ENEMY UNITS';
          content.appendChild(hdr);
          Game.liveUnits(side).forEach(u => {
            const row = el('div', { display:'flex', gap:'10px', alignItems:'center',
              padding:'5px 0', borderBottom:'1px solid #0c1c28' });
            const nm = el('div', { fontFamily:'Iceberg,monospace', fontSize:'12px',
              color: side==='player' ? (u.team.color||'#b8ccd8') : '#c07050', flex:'1' });
            nm.textContent = u.name;
            const hp = el('div', { fontFamily:'RobotoMono,monospace', fontSize:'10px',
              color: u.hp > u.maxHp*.5 ? '#4ac870' : '#c84444' });
            hp.textContent = `${u.hp}/${u.maxHp} HP`;
            const conds = [];
            if (u.stunned)  conds.push('STUNNED');
            if (u.poisoned) conds.push('POISONED');
            if (u.onFire)   conds.push('ON FIRE');
            const cd = el('div', { fontFamily:'RobotoMono,monospace', fontSize:'9px', color:'#c08030' });
            cd.textContent = conds.join(' ');
            row.append(nm, hp, cd);
            content.appendChild(row);
          });
        });
      } else if (menuTab === 'settings') {
        const p = el('div', { fontFamily:'RobotoMono,monospace', fontSize:'11px', color:'#4a6878', lineHeight:'1.8' });
        p.textContent = 'Volume controls coming in a future update.\n\nClick outside the panel to close.';
        content.appendChild(p);
        const quitBtn = txBtn('QUIT TO TITLE', () => { E.setScreen(Title()); E.playMusic('score'); });
        quitBtn.style.marginTop = '20px';
        content.appendChild(quitBtn);
      } else {
        const pre = el('pre', { fontFamily:'RobotoMono,monospace', fontSize:'10px',
          color:'#6a8898', lineHeight:'1.7', whiteSpace:'pre-wrap' });
        pre.textContent = [
          'TURN STRUCTURE',
          '  MOVE phase → ATTACK phase → END TURN',
          '  10 shared movement points per side per turn.',
          '',
          'MOVEMENT',
          '  Select a unit then click a blue-highlighted tile.',
          '  Units cannot pass through other units or obstacles.',
          '',
          'COMBAT',
          '  Select a unit in ATTACK phase.',
          '  Click a red-highlighted enemy.',
          '  Roll d10 + ATK vs d10 + DEF. Hit if attack > defense.',
          '',
          'POWER-UPS',
          '  Click a power-up icon, then follow on-board prompts.',
          '  Med Pack: +3 HP.  Mine: place explosive.',
          '  Teleporter: warp a friendly unit anywhere.',
          '',
          'MELEE WIN',
          '  Eliminate all enemy units.',
          '',
          'CTF WIN',
          '  Carry the flag to your own base (top-left corner).',
        ].join('\n');
        content.appendChild(pre);
      }

      const inner = el('div', { display:'flex', flex:'1' });
      inner.append(tabSidebar, content);
      panel.appendChild(inner);
      overlay.appendChild(panel);
      ui.appendChild(overlay);
    }

    // ── End game overlay ──────────────────────────────────
    function showEndOverlay(winner, reason) {
      const ui = E.getUI();
      const overlay = el('div'); overlay.className = 'tx-overlay';

      const panel = el('div'); panel.className = 'tx-panel';
      Object.assign(panel.style, { textAlign:'center', padding:'52px 44px', minWidth:'400px' });

      const isWin = winner==='player', isDraw = winner==='draw';
      const col = isWin ? '#3ad870' : isDraw ? '#c8c060' : '#d83030';

      const resultEl = el('div', { fontFamily:'Iceberg,monospace', fontSize:'44px',
        letterSpacing:'7px', color:col, textShadow:`0 0 32px ${col}`, marginBottom:'14px' });
      resultEl.textContent = isWin ? 'VICTORY' : isDraw ? 'DRAW' : 'DEFEAT';

      const reasonEl = el('div', { fontFamily:'RobotoMono,monospace', fontSize:'12px',
        color:'#5a7888', marginBottom:'38px' });
      reasonEl.textContent = reason;

      if (isWin)        E.playMusic('win');
      else if (!isDraw) E.playMusic('loss');

      const again = txBtn('PLAY AGAIN', () => E.setScreen(Battle(mode, teamId, roster, powerups)));
      again.classList.add('primary');
      const home  = txBtn('MAIN MENU',  () => { E.setScreen(Title()); E.playMusic('score'); });

      const btnRow = el('div', { display:'flex', justifyContent:'center', gap:'14px' });
      btnRow.append(again, home);

      panel.append(resultEl, reasonEl, btnRow);
      overlay.appendChild(panel);
      ui.appendChild(overlay);
    }

    // ── Tooltip ───────────────────────────────────────────
    function drawTooltip(ctx, mx, my, data) {
      const W=195, H=128;
      let tx = mx+16, ty = my - H/2;
      if (tx+W > 1272) tx = mx-W-16;
      if (ty < 8)  ty = 8;
      if (ty+H > 712) ty = 712-H;

      ctx.save();
      ctx.fillStyle   = 'rgba(3,11,18,.96)';
      ctx.strokeStyle = data.color || '#2a4858';
      ctx.lineWidth   = 1.5;
      ctx.fillRect(tx, ty, W, H);
      ctx.strokeRect(tx, ty, W, H);

      const px = tx+10;
      const draw = (text, color, y) => {
        ctx.font = '10px RobotoMono'; ctx.textAlign='left'; ctx.textBaseline='middle';
        ctx.fillStyle = color; ctx.fillText(text, px, y);
      };

      ctx.font = 'bold 12px Iceberg'; ctx.fillStyle = data.color||'#c8dce8';
      ctx.textAlign='left'; ctx.textBaseline='middle';
      ctx.fillText(data.name, px, ty+16);

      draw(`HP ${data.hp}`, '#f0d34f', ty+34);
      draw(`SPD ${data.spd}   RNG ${data.rng}`, '#8ab8c8', ty+50);
      draw(`ATK ${data.atk}   DEF ${data.def}   DMG ${data.dmg}`, '#8ab8c8', ty+65);

      const conds = [];
      if (data.stunned)  conds.push('STUNNED');
      if (data.poisoned) conds.push('POISONED');
      if (data.onFire)   conds.push('ON FIRE');
      if (conds.length)  draw(conds.join(' · '), '#d08030', ty+80);


      ctx.restore();
    }

    return { enter, destroy, update, render };
  }

  // ──────────────────────────────────────────────────────────
  // Shared utilities
  // ──────────────────────────────────────────────────────────

  function txBtn(label, onClick) {
    const b = document.createElement('button');
    b.className = 'tx-btn'; b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function phaseBtn(label, cls, isActive, isDimmed) {
    const b = document.createElement('button');
    b.className = `phase-btn ${cls}`;
    if (isActive) b.classList.add('active');
    if (isDimmed) b.classList.add('dimmed');
    b.textContent = label;
    return b;
  }

  function sectionHeader(parent, text, extraStyle) {
    const h = el('div', Object.assign({
      fontFamily:'Iceberg,monospace', fontSize:'16px', letterSpacing:'3px',
      color:'#c6d8e2', marginBottom:'10px', paddingBottom:'6px',
      borderBottom:'1px solid #121e2c'
    }, extraStyle || {}));
    h.textContent = text;
    parent.appendChild(h);
  }

  function buildTopBar(title, onBack, onReady = null, readyEnabled = false) {
    const ui = E.getUI();
    ui.innerHTML = '';
    const nav = el('div', {
      position:'absolute', top:'0', left:'0', right:'0', height:'48px',
      background:'rgba(3,10,18,.95)', borderBottom:'1px solid #162434',
      display:'flex', alignItems:'center', padding:'0 24px', gap:'16px'
    });
    const titleEl = el('div', {
      fontFamily:'Iceberg,monospace', fontSize:'19px', letterSpacing:'4px', color:'#e7f2f8'
    });
    titleEl.textContent = title;
    const spacer = el('div', { flex:'1' });
    const backBtn = txBtn('BACK', onBack);
    if (onReady) {
      const readyBtn = txBtn('READY', onReady);
      readyBtn.classList.add('primary');
      if (!readyEnabled) readyBtn.disabled = true;
      nav.append(titleEl, spacer, backBtn, readyBtn);
    } else {
      nav.append(titleEl, spacer, backBtn);
    }
    ui.appendChild(nav);
  }

  // Point-top hexagon path for UI cards
  function hexPath6(ctx, cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (Math.PI / 3) * i;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function buildHexIcon(iconKey, accentColor, isPowerup, w = 50, h = 58, iconMax = null) {
    const ratioW = Math.round(h * 0.8660254);
    if (Math.abs((w / h) - 0.8660254) > 0.04) w = ratioW;
    const wrap = el('div', {
      width:`${w}px`, height:`${h}px`, flexShrink:'0', position:'relative'
    });
    const clip = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';
    const outline = el('div', {
      position:'absolute', inset:'0',
      clipPath: clip,
      background: accentColor,
      boxShadow:`0 0 10px ${accentColor}55`
    });
    const inner = el('div', {
      position:'absolute', left:'2px', top:'2px', right:'2px', bottom:'2px',
      clipPath: clip,
      background: isPowerup ? 'rgba(16,24,34,.95)' : 'rgba(8,18,28,.92)',
      display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden'
    });
    const icon = E.getImage(iconKey);
    if (icon) {
      const maxSide = iconMax || (isPowerup ? Math.min(w, h) * 0.52 : Math.min(w, h) * 0.60);
      const scale = Math.min(maxSide / icon.width, maxSide / icon.height);
      const img = el('img', {
        width:`${Math.round(icon.width * scale)}px`,
        height:`${Math.round(icon.height * scale)}px`,
        objectFit:'contain',
        filter:'drop-shadow(0 0 6px rgba(255,255,255,.18))'
      }, { src: icon.src, draggable:false });
      inner.appendChild(img);
    } else {
      const fallback = el('div', { fontFamily:'Iceberg,monospace', fontSize:'22px', color:'#fff' });
      fallback.textContent = isPowerup ? '+' : '•';
      inner.appendChild(fallback);
    }
    wrap.append(outline, inner);
    return wrap;
  }


function drawCombatPopup(ctx, data) {
  const x = 366, y = 208, w = 548, h = 154;
  const alpha = Math.max(0, Math.min(1, data.timer / 0.18, 1));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(3,11,18,.94)';
  ctx.strokeStyle = data.hit ? '#58c878' : '#d86060';
  ctx.lineWidth = 2;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);

  drawPopupPortrait(ctx, x + 72, y + 78, 42, data.attackerPortrait, data.attackerColor);
  drawPopupPortrait(ctx, x + w - 72, y + 78, 42, data.defenderPortrait, data.defenderColor);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '18px Iceberg';
  ctx.fillStyle = '#dfeaf1';
  ctx.fillText('ATTACK', x + 176, y + 24);
  ctx.fillText('DEFENSE', x + w - 176, y + 24);

  ctx.font = '12px RobotoMono';
  ctx.fillStyle = '#8fb0bf';
  ctx.fillText(`d10 ${data.atkBase} + ${data.atkMod}`, x + 176, y + 50);
  ctx.fillText(`d10 ${data.defBase} + ${data.defMod}`, x + w - 176, y + 50);

  ctx.font = '34px Iceberg';
  ctx.fillStyle = data.attackerColor;
  ctx.fillText(String(data.atkTotal), x + 176, y + 88);
  ctx.fillStyle = data.defenderColor;
  ctx.fillText(String(data.defTotal), x + w - 176, y + 88);

  ctx.font = '30px Iceberg';
  ctx.fillStyle = data.hit ? '#58c878' : '#d86060';
  ctx.fillText(data.hit ? 'HIT' : 'MISS', x + w / 2, y + 72);

  if (data.hit) {
    ctx.font = '12px RobotoMono';
    ctx.fillStyle = '#f0d34f';
    ctx.fillText(`${data.damage} DMG`, x + w / 2, y + 102);
  }
  ctx.restore();
}

function drawPopupPortrait(ctx, cx, cy, r, key, stroke) {
  const img = E.getImage(key);
  ctx.save();
  hexPath6(ctx, cx, cy, r);
  ctx.fillStyle = 'rgba(8,18,28,.74)';
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.stroke();
  if (img) {
    ctx.save();
    hexPath6(ctx, cx, cy, r - 2);
    ctx.clip();
    const w = r * 2.2, h = w;
    ctx.drawImage(img, cx - w / 2, cy - h * 0.58, w, h);
    ctx.restore();
  }
  ctx.restore();
}

  function canvasMouse(e) {
    const rect = E.getCanvas().getBoundingClientRect();
    return {
      mx: (e.clientX - rect.left) * (1280 / rect.width),
      my: (e.clientY - rect.top)  * (720  / rect.height)
    };
  }

  function unitIconKey(id) {
    const m = {
      infantry:'infantry_icon',
      sniper:'sniper_icon',
      elite:'elite_icon',
      grenadier:'grenadier_icon',
      shock_trooper:'shock_trooper_icon',
      slasher:'slasher_icon',
      assassin:'assassin_icon',
      acid_thrower:'acid_thrower_icon',
      grunt:'infantry_icon',
      sharpshooter:'sniper_icon',
      fire_caller:'fire_caller_icon'
    };
    return m[id] || 'infantry_icon';
  }
  function powerupIconKey(id) {
    const m = { med_pack:'med_pack_icon', mine:'mine_icon', teleporter:'teleporter_icon' };
    return m[id] || 'med_pack_icon';
  }
  function specialLabel(s) {
    const m = {splash:'SPLASH DAMAGE',stun:'STUN ON HIT',poison:'POISON ON HIT',
               acid_tile:'ACID TILE ON HIT',fire_dot:'FIRE DOT ON HIT',column_fire:'COLUMN FIRE'};
    return m[s] || s;
  }

  return { Title, GameSelect, TeamSelect, SquadBuilder, Battle };
})();
