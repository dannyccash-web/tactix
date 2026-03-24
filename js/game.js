// ============================================================
// game.js — Battle scene: units, turns, combat, win/lose
// ============================================================

const Game = (() => {

  // ── State ────────────────────────────────────────────────
  let state = null;

  // ── Phases ───────────────────────────────────────────────
  const PHASE = { MOVE: 'move', ATTACK: 'attack', ENEMY: 'enemy', OVER: 'over' };

  // ── Powerup-use sub-states ───────────────────────────────
  const PUSTATE = { NONE: 0, MED: 1, MINE: 2, TELE_UNIT: 3, TELE_DEST: 4 };

  // ── Animations ───────────────────────────────────────────
  let anims = [];   // { type, progress, ... }
  let pendingAI = false;
  let aiTimer = 0;

  // ── Init ─────────────────────────────────────────────────
  function start(setup) {
    // setup: { mode, playerTeam, playerRoster, playerPowerups }
    Board.generate();

    const playerTeam = Data.TEAMS[setup.playerTeam];
    const aiTeamId   = pickAITeam(setup.playerTeam);
    const aiTeam     = Data.TEAMS[aiTeamId];
    const aiRoster   = buildAIRoster(aiTeam);

    const playerUnits = spawnUnits(setup.playerRoster, 'player', playerTeam);
    const aiUnits     = spawnUnits(aiRoster.units, 'ai', aiTeam);

    // CTF flag
    let flag = null;
    if (setup.mode === 'ctf') {
      flag = findFlagSpawn(playerUnits, aiUnits);
    }

    state = {
      mode: setup.mode,
      phase: PHASE.MOVE,
      turn: 1,
      movePool: Data.MOVE_POOL,

      playerTeam,
      aiTeam,
      playerUnits,
      aiUnits,

      playerPowerups: [...setup.playerPowerups],
      aiPowerups: aiRoster.powerups,

      mines: [],
      flag,

      selectedUnit: null,
      highlights: {},

      puState: PUSTATE.NONE,
      puData: {},   // extra data for multi-step powerup actions

      winner: null,
      winReason: '',

      log: [],

      // UI callbacks injected by screen
      onPhaseChange: null,
      onTurnEnd: null,
      onGameOver: null
    };

    anims = [];
    pendingAI = false;
    aiTimer = 0;
  }

  function pickAITeam(exclude) {
    const ids = Object.keys(Data.TEAMS).filter(id => id !== exclude);
    return ids[Math.floor(Math.random() * ids.length)];
  }

  function buildAIRoster(team) {
    let budget = Data.SQUAD_BUDGET;
    const units = [];
    const available = team.units.map(id => Data.UNITS[id]).sort((a, b) => b.cost - a.cost);

    while (budget > 0 && units.length < 6) {
      const affordable = available.filter(u => u.cost <= budget);
      if (!affordable.length) break;
      const u = affordable[Math.floor(Math.random() * affordable.length)];
      units.push(u.id);
      budget -= u.cost;
    }

    const powerups = [];
    const puList = ['med_pack', 'med_pack', 'mine'];
    for (let i = 0; i < 2; i++) {
      powerups.push(puList[Math.floor(Math.random() * puList.length)]);
    }

    return { units, powerups };
  }

  function spawnUnits(rosterIds, side, team) {
    const spawns = Board.spawnPositions(side, rosterIds.length);
    return rosterIds.map((unitId, i) => {
      const base = Data.UNITS[unitId];
      const pos  = spawns[i] || { col: side === 'player' ? 0 : Board.COLS - 1, row: i % Board.ROWS };
      return createUnit(base, side, team, pos.col, pos.row);
    });
  }

  function createUnit(baseDef, side, team, col, row) {
    return {
      id: Math.random().toString(36).slice(2),
      type: baseDef.id,
      name: baseDef.name,
      side,
      team,
      col, row,
      hp: baseDef.hp,
      maxHp: baseDef.hp,
      speed: baseDef.speed,
      range: baseDef.range,
      atk: baseDef.atk,
      def: baseDef.def,
      dmg: baseDef.dmg,
      special: baseDef.special,
      // Per-turn flags
      movedThisTurn: false,
      speedUsedThisTurn: 0,
      attackedThisTurn: false,
      // Conditions
      stunned: false,
      pendingStun: false,
      poisoned: false,
      onFire: false,
      // Animation
      alpha: 1,
      visualX: null,   // null = use col/row directly
      visualY: null,
      // CTF
      hasFlag: false
    };
  }

  function findFlagSpawn(playerUnits, aiUnits) {
    const cx = Math.floor(Board.COLS / 2);
    const cy = Math.floor(Board.ROWS / 2);
    // Spiral outward from center to find a passable, unoccupied tile
    for (let r = 0; r <= 5; r++) {
      for (let row = cy - r; row <= cy + r; row++) {
        for (let col = cx - r; col <= cx + r; col++) {
          if (Math.abs(col - cx) !== r && Math.abs(row - cy) !== r) continue;
          if (!Board.isPassable(col, row)) continue;
          if (Board.isPlayerBase(col, row) || Board.isAIBase(col, row)) continue;
          if ([...playerUnits, ...aiUnits].some(u => u.col === col && u.row === row)) continue;
          return { col, row, carrier: null };
        }
      }
    }
    return { col: cx, row: cy, carrier: null };
  }

  // ── Accessors ─────────────────────────────────────────────
  function getState() { return state; }

  function allUnits() { return [...state.playerUnits, ...state.aiUnits]; }

  function liveUnits(side) {
    return (side === 'player' ? state.playerUnits : state.aiUnits).filter(u => u.hp > 0);
  }

  function unitAt(col, row) {
    return allUnits().find(u => u.col === col && u.row === row && u.hp > 0);
  }

  // ── Selection & highlights ───────────────────────────────
  function selectUnit(unit) {
    if (!unit || unit.hp <= 0) return;
    state.selectedUnit = unit;
    rebuildHighlights();
  }

  function clearSelection() {
    state.selectedUnit = null;
    state.highlights = {};
  }

  function rebuildHighlights() {
    state.highlights = {};
    const u = state.selectedUnit;
    if (!u) return;

    if (state.phase === PHASE.MOVE && !u.stunned) {
      const maxSteps = Math.min(u.speed - u.speedUsedThisTurn, state.movePool);
      const reach = Board.reachable(u.col, u.row, maxSteps, (c, r) => {
        return !!unitAt(c, r);
      });
      reach.forEach(i => {
        const { col, row } = Board.colRow(i);
        // CTF: non-carrier can't enter base tiles
        if (state.mode === 'ctf' && !u.hasFlag) {
          if (Board.isPlayerBase(col, row) || Board.isAIBase(col, row)) return;
        }
        state.highlights[i] = { type: 'move', color: u.team.color || '#3a8afa' };
      });
    }

    if (state.phase === PHASE.ATTACK && !u.attackedThisTurn && !u.stunned) {
      allUnits().forEach(target => {
        if (target.side === u.side) return;
        if (target.hp <= 0) return;
        const dist = Board.hexDistance(u.col, u.row, target.col, target.row);
        if (dist <= u.range && Board.hasLOS(u.col, u.row, target.col, target.row)) {
          state.highlights[Board.idx(target.col, target.row)] = 'attack';
        }
      });
      // Can also attack mines
      state.mines
        .filter(m => m.owner !== u.side)
        .forEach(m => {
          const dist = Board.hexDistance(u.col, u.row, m.col, m.row);
          if (dist <= u.range && Board.hasLOS(u.col, u.row, m.col, m.row)) {
            state.highlights[Board.idx(m.col, m.row)] = 'attack';
          }
        });
    }

    // CTF base overlays
    if (state.mode === 'ctf') {
      Board.PLAYER_BASE.forEach(b => {
        state.highlights[Board.idx(b.col, b.row)] = 'base_player';
      });
      Board.AI_BASE.forEach(b => {
        state.highlights[Board.idx(b.col, b.row)] = 'base_ai';
      });
    }
  }

  // ── Movement ─────────────────────────────────────────────
  function moveUnit(unit, toCol, toRow, callback) {
    if (unit.stunned) return;
    const maxSpeed = (state.mode === 'ctf' && unit.hasFlag) ? 2 : unit.speed;
    const maxSteps = Math.min(maxSpeed - unit.speedUsedThisTurn, state.movePool);
    const path = Board.findPath(unit.col, unit.row, toCol, toRow, (c, r) => !!unitAt(c, r));
    if (!path || path.length > maxSteps) return;

    // CTF restriction
    if (state.mode === 'ctf' && !unit.hasFlag) {
      if (Board.isPlayerBase(toCol, toRow) || Board.isAIBase(toCol, toRow)) return;
    }

    unit.movedThisTurn = true;
    unit.speedUsedThisTurn += path.length;
    state.movePool -= path.length;

    // Animate step by step, check mine triggers mid-path
    animatePath(unit, path, () => {
      // Check CTF flag pickup
      if (state.mode === 'ctf' && state.flag && !state.flag.carrier) {
        if (unit.col === state.flag.col && unit.row === state.flag.row) {
          state.flag.carrier = unit.id;
          unit.hasFlag = true;
        }
      }

      // Check CTF victory
      if (state.mode === 'ctf' && unit.hasFlag) {
        const baseTiles = unit.side === 'player' ? Board.PLAYER_BASE : Board.AI_BASE;
        if (baseTiles.some(b => b.col === unit.col && b.row === unit.row)) {
          endGame(unit.side === 'player' ? 'player' : 'ai', 'Flag captured!');
          return;
        }
      }

      // Acid tile damage
      const tileType = Board.getTile(unit.col, unit.row);
      if (tileType === Board.TILE.ACID) {
        applyDamage(unit, 2, 'acid');
      }

      clearSelection();
      if (callback) callback();
    });
  }

  function animatePath(unit, path, onDone) {
    if (!path.length) { onDone(); return; }

    let stepIdx = 0;

    function step() {
      if (stepIdx >= path.length) {
        onDone();
        return;
      }
      const { col, row } = path[stepIdx];
      stepIdx++;

      unit.col = col;
      unit.row = row;

      // Mine trigger
      const mine = state.mines.find(m => m.col === col && m.row === row);
      if (mine) {
        triggerMine(mine, unit);
        if (unit.hp <= 0) {
          onDone();
          return;
        }
      }

      // Short delay between steps for animation feel
      setTimeout(step, 80);
    }
    step();
  }

  // ── Combat ───────────────────────────────────────────────
  function attackTarget(attacker, targetCol, targetRow) {
    if (attacker.attackedThisTurn || attacker.stunned || (state.mode === 'ctf' && attacker.hasFlag)) return;

    // Check for mine target
    const mine = state.mines.find(m => m.col === targetCol && m.row === targetRow);
    if (mine) {
      TactixEngine.playSFX('gunshot');
      attacker.attackedThisTurn = true;
      triggerMine(mine, null); // detonation without stepping unit
      clearSelection();
      rebuildHighlights();
      return;
    }

    const defender = unitAt(targetCol, targetRow);
    if (!defender || defender.side === attacker.side || defender.hp <= 0) return;

    attacker.attackedThisTurn = true;

    const atkBase  = Math.ceil(Math.random() * 10);
    const defBase  = Math.ceil(Math.random() * 10);
    const atkRoll  = atkBase + attacker.atk;
    const defRoll  = defBase + defender.def;
    const hit = atkRoll > defRoll;

    if (hit) {
      TactixEngine.playSFX('gunshot');
      applyDamage(defender, attacker.dmg, 'attack');
      applySpecial(attacker, defender);
    } else {
      TactixEngine.playSFX('ricochet');
    }

    spawnCombatAnim(attacker, defender, hit);
    state.combatPopup = {
      attackerPortrait: attacker.team.portrait,
      defenderPortrait: defender.team.portrait,
      attackerColor: attacker.team.color,
      defenderColor: defender.team.color,
      atkBase, defBase, atkMod: attacker.atk, defMod: defender.def,
      atkTotal: atkRoll, defTotal: defRoll, hit, damage: attacker.dmg, timer: 1.25
    };
    logMsg(`${attacker.name} → ${defender.name}: ${hit ? 'HIT ' + attacker.dmg + ' dmg' : 'MISS'} (${atkRoll} vs ${defRoll})`);

    clearSelection();
    checkWin();
  }

  function applyDamage(unit, amount, source) {
    unit.hp = Math.max(0, unit.hp - amount);
    if (unit.hp <= 0) killUnit(unit);
  }

  function applySpecial(attacker, defender) {
    switch (attacker.special) {
      case 'splash':
        Board.neighbors(attacker.col, attacker.row).forEach(nb => {
          const u = unitAt(nb.col, nb.row);
          if (u && u.side !== attacker.side && u.hp > 0) {
            applyDamage(u, 1, 'splash');
          }
        });
        break;
      case 'stun':
        defender.pendingStun = true;
        break;
      case 'poison':
        defender.poisoned = true;
        break;
      case 'fire_dot':
        defender.onFire = true;
        break;
      case 'acid_tile':
        Board.setTile(defender.col, defender.row, Board.TILE.ACID);
        break;
      case 'column_fire':
        // All tiles in defender's column within range become fire
        for (let r = 0; r < Board.ROWS; r++) {
          if (Board.isPassable(defender.col, r) && Board.getTile(defender.col, r) !== Board.TILE.OBSTACLE) {
            Board.setTile(defender.col, r, Board.TILE.FIRE);
            const u = unitAt(defender.col, r);
            if (u && u.side !== attacker.side && u.hp > 0) applyDamage(u, 4, 'fire');
          }
        }
        break;
    }
  }

  function killUnit(unit) {
    unit.hp = 0;
    // Drop CTF flag
    if (unit.hasFlag && state.flag) {
      state.flag.carrier = null;
      state.flag.col = unit.col;
      state.flag.row = unit.row;
      unit.hasFlag = false;
    }
  }

  function triggerMine(mine, stepper) {
    // Remove mine
    state.mines = state.mines.filter(m => m !== mine);
    // Direct hit
    if (stepper) applyDamage(stepper, 2, 'mine');
    // Splash on adjacent
    Board.neighbors(mine.col, mine.row).forEach(nb => {
      const u = unitAt(nb.col, nb.row);
      if (u && u !== stepper && u.hp > 0) applyDamage(u, 1, 'mine_splash');
      // Chain: adjacent mines
      const adj = state.mines.find(m => m.col === nb.col && m.row === nb.row);
      if (adj) triggerMine(adj, null);
    });
    logMsg('Mine detonated!');
  }

  // ── Power-up activation ───────────────────────────────────
  function activatePowerup(puId) {
    // Begin powerup flow
    state.puState = PUSTATE.NONE;
    state.puData = { puId };
    clearSelection();
    state.highlights = {};

    if (puId === 'med_pack') {
      state.puState = PUSTATE.MED;
      // Highlight all friendly damaged units
      liveUnits('player').forEach(u => {
        if (u.hp < u.maxHp) {
          state.highlights[Board.idx(u.col, u.row)] = 'selected';
        }
      });
    } else if (puId === 'mine') {
      state.puState = PUSTATE.MINE;
      // Highlight valid empty tiles
      for (let row = 0; row < Board.ROWS; row++) {
        for (let col = 0; col < Board.COLS; col++) {
          if (Board.isPassable(col, row) && !unitAt(col, row) && !state.mines.find(m => m.col === col && m.row === row)) {
            state.highlights[Board.idx(col, row)] = { type:'mine_place', color: state.playerTeam.color };
          }
        }
      }
    } else if (puId === 'teleporter') {
      state.puState = PUSTATE.TELE_UNIT;
      // Highlight all friendly units
      liveUnits('player').forEach(u => {
        state.highlights[Board.idx(u.col, u.row)] = 'selected';
      });
    }
  }

  function handlePowerupClick(col, row) {
    if (state.puState === PUSTATE.NONE) return false;

    if (state.puState === PUSTATE.MED) {
      const u = unitAt(col, row);
      if (u && u.side === 'player' && u.hp < u.maxHp) {
        u.hp = Math.min(u.maxHp, u.hp + 3);
        u.poisoned = false;
        removePowerup('player', 'med_pack');
        state.puState = PUSTATE.NONE;
        state.highlights = {};
        logMsg(`Med pack used on ${u.name} → HP restored`);
        return true;
      }
    } else if (state.puState === PUSTATE.MINE) {
      if (Board.isPassable(col, row) && !unitAt(col, row)) {
        state.mines.push({ col, row, owner: 'player' });
        removePowerup('player', 'mine');
        state.puState = PUSTATE.NONE;
        state.highlights = {};
        logMsg('Mine placed');
        return true;
      }
    } else if (state.puState === PUSTATE.TELE_UNIT) {
      const u = unitAt(col, row);
      if (u && u.side === 'player') {
        state.puData.teleUnit = u;
        state.puState = PUSTATE.TELE_DEST;
        state.highlights = {};
        // Highlight all empty passable tiles
        for (let r = 0; r < Board.ROWS; r++) {
          for (let c = 0; c < Board.COLS; c++) {
            if (Board.isPassable(c, r) && !unitAt(c, r)) {
              state.highlights[Board.idx(c, r)] = { type:'teleport', color: state.playerTeam.color };
            }
          }
        }
        return true;
      }
    } else if (state.puState === PUSTATE.TELE_DEST) {
      if (Board.isPassable(col, row) && !unitAt(col, row)) {
        const u = state.puData.teleUnit;
        u.col = col;
        u.row = row;
        removePowerup('player', 'teleporter');
        state.puState = PUSTATE.NONE;
        state.highlights = {};
        logMsg(`${u.name} teleported`);
        return true;
      }
    }
    return false;
  }

  function cancelPowerup() {
    state.puState = PUSTATE.NONE;
    state.puData = {};
    state.highlights = {};
  }

  function removePowerup(side, id) {
    const arr = side === 'player' ? state.playerPowerups : state.aiPowerups;
    const i = arr.indexOf(id);
    if (i !== -1) arr.splice(i, 1);
  }

  // ── Phase transitions ─────────────────────────────────────
  function setPhase(phase) {
    state.phase = phase;
    clearSelection();
    if (state.onPhaseChange) state.onPhaseChange(phase);
  }

  function endPlayerTurn() {
    if (state.phase === PHASE.OVER) return;
    clearSelection();
    cancelPowerup();
    setPhase(PHASE.ENEMY);
    pendingAI = true;
    aiTimer = 0.8; // delay before AI moves
  }

  function startNewPlayerTurn() {
    state.turn++;
    state.movePool = Data.MOVE_POOL;

    // Apply turn-start conditions to player units
    applyTurnStartConditions(state.playerUnits);

    // Reset player unit flags
    liveUnits('player').forEach(u => {
      u.movedThisTurn = false;
      u.speedUsedThisTurn = 0;
      u.attackedThisTurn = false;
      if (u.pendingStun) { u.stunned = true; u.pendingStun = false; }
      else { u.stunned = false; }
    });

    setPhase(PHASE.MOVE);
    if (state.onTurnEnd) state.onTurnEnd(state.turn);
  }

  function applyTurnStartConditions(units) {
    units.forEach(u => {
      if (u.hp <= 0) return;
      if (u.poisoned) { applyDamage(u, 1, 'poison'); if (u.hp <= 0) return; }
      if (u.onFire)   { applyDamage(u, 2, 'fire');   u.onFire = false; }
      // Acid tile
      if (Board.getTile(u.col, u.row) === Board.TILE.ACID) {
        applyDamage(u, 2, 'acid_tile');
      }
    });
  }

  // ── Win / lose ────────────────────────────────────────────
  function checkWin() {
    const playerAlive = liveUnits('player').length;
    const aiAlive     = liveUnits('ai').length;

    if (playerAlive === 0 && aiAlive === 0) {
      endGame('draw', 'All units destroyed');
    } else if (playerAlive === 0) {
      endGame('ai', 'All your units were destroyed');
    } else if (aiAlive === 0) {
      endGame('player', 'All enemy units destroyed');
    }
  }

  function endGame(winner, reason) {
    state.winner = winner;
    state.winReason = reason;
    state.phase = PHASE.OVER;
    if (state.onGameOver) state.onGameOver(winner, reason);
  }

  // ── AI turn ───────────────────────────────────────────────
  function runAITurn() {
    // Reset AI unit flags
    state.movePool = Data.MOVE_POOL;
    liveUnits('ai').forEach(u => {
      u.movedThisTurn = false;
      u.speedUsedThisTurn = 0;
      u.attackedThisTurn = false;
      if (u.pendingStun) { u.stunned = true; u.pendingStun = false; }
      else { u.stunned = false; }
    });

    // Apply turn-start conditions to AI units
    applyTurnStartConditions(state.aiUnits);
    checkWin();
    if (state.phase === PHASE.OVER) return;

    // Delegate to AI module
    try {
      AI.takeTurn(state, {
        liveUnits, unitAt, moveUnit: aiMoveUnit, attackTarget,
        removePowerup, applyDamage, triggerMine, logMsg,
        checkWin, endGame, findPath: Board.findPath
      });
    } catch (err) {
      console.error('AI turn failed', err);
      logMsg('AI turn recovered from an error');
    }
  }

  // AI version of move with visual step-through animation
  function aiMoveUnit(unit, toCol, toRow) {
    if (unit.stunned) return;
    const maxSpeed = (state.mode === 'ctf' && unit.hasFlag) ? 2 : unit.speed;
    const maxSteps = Math.min(maxSpeed - unit.speedUsedThisTurn, state.movePool);
    const path = Board.findPath(unit.col, unit.row, toCol, toRow, (c, r) => !!unitAt(c, r));
    if (!path || path.length > maxSteps) return;

    // CTF base restriction for AI carrier
    if (state.mode === 'ctf' && !unit.hasFlag) {
      if (Board.isPlayerBase(toCol, toRow) || Board.isAIBase(toCol, toRow)) return;
    }

    unit.speedUsedThisTurn += path.length;
    state.movePool -= path.length;
    unit.movedThisTurn = true;

    const start = Board.hexCenter(unit.col, unit.row);
    unit.visualX = start.x; unit.visualY = start.y;
    unit.visualPath = path.map(step => Board.hexCenter(step.col, step.row));
    unit.visualPathIndex = 0;
    unit.visualStepTimer = 0;
    unit.visualStepDuration = 0.1;
    state.aiVisualDelay = Math.max(state.aiVisualDelay || 0, path.length * 0.1 + 0.25);

    // Resolve logic immediately while visuals catch up
    for (const step of path) {
      unit.col = step.col;
      unit.row = step.row;
      const mine = state.mines.find(m => m.col === step.col && m.row === step.row);
      if (mine) { triggerMine(mine, unit); if (unit.hp <= 0) return; }
      if (state.mode === 'ctf' && state.flag && !state.flag.carrier) {
        if (unit.col === state.flag.col && unit.row === state.flag.row) {
          state.flag.carrier = unit.id;
          unit.hasFlag = true;
        }
      }
    }

    // CTF win check
    if (state.mode === 'ctf' && unit.hasFlag) {
      const baseTiles = Board.AI_BASE;
      if (baseTiles.some(b => b.col === unit.col && b.row === unit.row)) {
        endGame('ai', 'Flag captured!');
      }
    }
  }

  // ── Update ────────────────────────────────────────────────
  function update(dt) {
    if (!state) return;

    if (state.combatPopup) {
      state.combatPopup.timer -= dt;
      if (state.combatPopup.timer <= 0) state.combatPopup = null;
    }

    allUnits().forEach(u => {
      if (u.visualPath && u.visualPath.length) {
        const target = u.visualPath[0];
        if (u.visualX == null || u.visualY == null) {
          u.visualX = target.x; u.visualY = target.y;
        }
        const speed = Math.min(1, dt / (u.visualStepDuration || 0.1));
        u.visualX += (target.x - u.visualX) * Math.max(0.28, speed);
        u.visualY += (target.y - u.visualY) * Math.max(0.28, speed);
        if (Math.hypot(target.x - u.visualX, target.y - u.visualY) < 1.2) {
          u.visualX = target.x; u.visualY = target.y;
          u.visualPath.shift();
          if (!u.visualPath.length) {
            u.visualPath = null;
            u.visualX = null; u.visualY = null;
          }
        }
      }
    });

    // AI turn timer
    if (state.phase === PHASE.ENEMY && pendingAI) {
      aiTimer -= dt;
      if (aiTimer <= 0) {
        pendingAI = false;
        state.aiVisualDelay = 0;
        runAITurn();
        checkWin();
        if (state.phase !== PHASE.OVER) {
          setTimeout(() => startNewPlayerTurn(), Math.max(1250, (state.aiVisualDelay || 0) * 1000));
        }
      }
    }
  }

  // ── Render ────────────────────────────────────────────────
  function render(ctx) {
    if (!state) return;

    // Draw board
    Board.render(ctx, state.highlights, state.mines);

    // CTF flag
    if (state.mode === 'ctf' && state.flag && !state.flag.carrier) {
      Board.drawFlag(ctx, state.flag.col, state.flag.row);
    }

    // Draw units
    allUnits().forEach(u => drawUnit(ctx, u));

    // Draw animations
    drawAnims(ctx);
  }

  function drawUnit(ctx, unit) {
    if (unit.hp <= 0) return;
    const p = (unit.visualX != null && unit.visualY != null) ? { x: unit.visualX, y: unit.visualY } : Board.hexCenter(unit.col, unit.row);
    const { x, y } = p;

    const spriteImg = TactixEngine.getImage(unit.team.spriteKey);
    if (!spriteImg) return;

    // Soldier sprite is 1024×1536 — a single full-body soldier
    // Draw so feet are just below hex center, scaled to fit within 1.8× hex radius
    const sw = Board.HEX_R * 2.12;    // display width
    const sh = sw * (1536 / 1024);   // maintain aspect ratio → ~2.7 × HEX_R tall
    const sx = x - sw / 2;
    const sy = y - sh + Board.HEX_R * 0.80;  // feet sit near hex center

    if (state.selectedUnit && state.selectedUnit.id === unit.id) {
      Board.drawHexPath(ctx, x, y, Board.HEX_R * 0.92);
      ctx.strokeStyle = unit.team.color || '#ffff80';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    ctx.save();
    ctx.globalAlpha = unit.stunned ? 0.5 : 1;
    if (unit.stunned) ctx.filter = 'brightness(2.2) saturate(0)';
    if (unit.side === 'ai') {
      ctx.translate(x, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(spriteImg, -sw / 2, sy, sw, sh);
    } else {
      ctx.drawImage(spriteImg, sx, sy, sw, sh);
    }
    ctx.filter = 'none';
    ctx.restore();

    // HP bar
    drawHPBar(ctx, x, y, unit);

    // Status icons
    drawStatusIcons(ctx, x, y, unit);

    // Flag indicator
    if (unit.hasFlag) {
      ctx.save();
      ctx.fillStyle = '#f0e040';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚑', x + Board.HEX_R * 0.6, y - Board.HEX_R * 1.1);
      ctx.restore();
    }

  }

  function drawHPBar(ctx, cx, cy, unit) {
    const w = Board.HEX_R * 1.4;
    const h = 4;
    const x = cx - w / 2;
    const y = cy - Board.HEX_R * 0.32;

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x, y, w, h);

    const pct = Math.max(0, unit.hp / unit.maxHp);
    const barColor = pct > 0.5 ? '#4ccc4c' : pct > 0.25 ? '#cccc40' : '#cc3030';
    ctx.fillStyle = barColor;
    ctx.fillRect(x, y, w * pct, h);
  }

  function drawStatusIcons(ctx, cx, cy, unit) {
    const icons = [];
    if (unit.poisoned) icons.push({ color: '#60ee60', label: 'P' });
    if (unit.onFire)   icons.push({ color: '#ff8030', label: 'F' });
    icons.forEach((ic, i) => {
      const x = cx - Board.HEX_R * 0.5 + i * 12;
      const y = cy - Board.HEX_R * 1.0;
      ctx.fillStyle = ic.color;
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ic.label, x, y);
    });
  }

  // ── Combat animations ─────────────────────────────────────
  function spawnCombatAnim(attacker, defender, hit) {
    const from = Board.hexCenter(attacker.col, attacker.row);
    const to   = Board.hexCenter(defender.col, defender.row);
    anims.push({ type: 'shot', from, to, progress: 0, speed: 3, hit });
    if (hit) {
      anims.push({ type: 'hit', pos: to, progress: 0, speed: 2 });
    }
  }

  function drawAnims(ctx) {
    anims = anims.filter(a => {
      a.progress = Math.min(1, a.progress + 0.05 * a.speed);

      if (a.type === 'shot') {
        const x = a.from.x + (a.to.x - a.from.x) * a.progress;
        const y = a.from.y + (a.to.y - a.from.y) * a.progress;
        ctx.save();
        ctx.globalAlpha = 1 - a.progress * 0.5;
        ctx.fillStyle = '#ffe060';
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (a.type === 'hit') {
        const r = a.progress * 20;
        ctx.save();
        ctx.globalAlpha = 1 - a.progress;
        ctx.strokeStyle = '#ff4020';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(a.pos.x, a.pos.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      return a.progress < 1;
    });
  }

  // ── Tooltip data ──────────────────────────────────────────
  function getTooltipFor(col, row) {
    const u = unitAt(col, row);
    if (!u || u.hp <= 0) return null;
    return {
      name: u.name,
      hp: `${u.hp}/${u.maxHp}`,
      spd: u.speed,
      rng: u.range,
      atk: `+${u.atk}`,
      def: `+${u.def}`,
      dmg: u.dmg,
      side: u.side,
      color: u.team.color,
      stunned: u.stunned,
      poisoned: u.poisoned,
      onFire: u.onFire
    };
  }

  // ── Logging ───────────────────────────────────────────────
  function logMsg(msg) {
    state.log.push(msg);
    if (state.log.length > 20) state.log.shift();
  }

  return {
    start,
    getState,
    PHASE, PUSTATE,
    liveUnits, unitAt, allUnits,
    selectUnit, clearSelection, rebuildHighlights,
    moveUnit,
    attackTarget,
    activatePowerup, handlePowerupClick, cancelPowerup,
    setPhase, endPlayerTurn, startNewPlayerTurn,
    update, render,
    getTooltipFor,
    getCombatPopup: () => state?.combatPopup || null,
    logMsg
  };
})();
