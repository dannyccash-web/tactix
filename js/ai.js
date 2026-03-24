
// ============================================================
// ai.js — AI turn logic for Melee and CTF modes
// ============================================================

const AI = (() => {

  function takeTurn(state, api) {
    const { liveUnits, unitAt, moveUnit, attackTarget, removePowerup, logMsg, checkWin } = api;

    const aiUnits = liveUnits('ai');
    const playerUnits = liveUnits('player');
    if (!aiUnits.length || !playerUnits.length) return;

    const medIdx = state.aiPowerups.indexOf('med_pack');
    if (medIdx !== -1) {
      const hurt = aiUnits.filter(u => u.hp > 0 && u.hp < u.maxHp / 2);
      if (hurt.length) {
        const target = hurt.reduce((a, b) => a.hp < b.hp ? a : b);
        target.hp = Math.min(target.maxHp, target.hp + 3);
        target.poisoned = false;
        removePowerup('ai', 'med_pack');
        logMsg(`AI used Med Pack on ${target.name}`);
      }
    }

    aiUnits.sort((a, b) => nearestEnemyDist(a, playerUnits) - nearestEnemyDist(b, playerUnits));

    for (const unit of aiUnits) {
      if (unit.hp <= 0 || unit.stunned) continue;
      if (!liveUnits('player').length) break;

      if (state.mode === 'ctf') doCtfMove(unit, state, api);
      else doMeleeMove(unit, state, api);

      checkWin();
      if (state.phase === 'over') return;
    }

    const mineIdx = state.aiPowerups.indexOf('mine');
    const stillPlayers = liveUnits('player');
    if (mineIdx !== -1 && stillPlayers.length > 0) {
      const target = stillPlayers.find(u => u.hasFlag) || stillPlayers[0];
      const nearTiles = Board.neighbors(target.col, target.row).filter(nb =>
        Board.isPassable(nb.col, nb.row) &&
        !unitAt(nb.col, nb.row) &&
        !state.mines.find(m => m.col === nb.col && m.row === nb.row)
      );
      if (nearTiles.length) {
        const t = nearTiles[0];
        state.mines.push({ col: t.col, row: t.row, owner: 'ai' });
        removePowerup('ai', 'mine');
        logMsg('AI placed a mine');
      }
    }
  }

  function doMeleeMove(unit, state, api) {
    const { liveUnits, attackTarget, moveUnit } = api;
    const playerUnits = liveUnits('player');
    if (!playerUnits.length) return;

    const attackable = playerUnits.filter(p =>
      p.hp > 0 &&
      Board.hexDistance(unit.col, unit.row, p.col, p.row) <= unit.range &&
      Board.hasLOS(unit.col, unit.row, p.col, p.row)
    );
    if (attackable.length) {
      const t = pickBestVictim(unit, attackable);
      attackTarget(unit, t.col, t.row);
      return;
    }

    const target = pickMeleeTarget(unit, playerUnits);
    const maxSteps = Math.min(unit.speed - unit.speedUsedThisTurn, state.movePool);
    if (target && maxSteps > 0) {
      const dest = bestApproach(unit, target, maxSteps, api);
      if (dest) moveUnit(unit, dest.col, dest.row);
    }

    const postAttackable = liveUnits('player').filter(p =>
      p.hp > 0 &&
      Board.hexDistance(unit.col, unit.row, p.col, p.row) <= unit.range &&
      Board.hasLOS(unit.col, unit.row, p.col, p.row)
    );
    if (postAttackable.length && !unit.attackedThisTurn) {
      const t = pickBestVictim(unit, postAttackable);
      attackTarget(unit, t.col, t.row);
    }
  }

  function doCtfMove(unit, state, api) {
    const { liveUnits, attackTarget, moveUnit } = api;
    const playerUnits = liveUnits('player');
    const playerCarrier = playerUnits.find(u => u.hasFlag);

    if (unit.hasFlag) {
      doCarrierMove(unit, state, api);
      return;
    }

    if (playerCarrier) {
      const dist = Board.hexDistance(unit.col, unit.row, playerCarrier.col, playerCarrier.row);
      if (dist <= unit.range && Board.hasLOS(unit.col, unit.row, playerCarrier.col, playerCarrier.row)) {
        attackTarget(unit, playerCarrier.col, playerCarrier.row);
        return;
      }
    }

    const looseFlag = state.flag && !state.flag.carrier ? state.flag : null;
    const target = looseFlag || playerCarrier || pickMeleeTarget(unit, playerUnits);
    const maxSteps = Math.min(unit.speed - unit.speedUsedThisTurn, state.movePool);
    if (target && maxSteps > 0) {
      const dest = bestApproach(unit, target, maxSteps, api);
      if (dest) moveUnit(unit, dest.col, dest.row);
    }

    const attackable = liveUnits('player').filter(p =>
      p.hp > 0 &&
      Board.hexDistance(unit.col, unit.row, p.col, p.row) <= unit.range &&
      Board.hasLOS(unit.col, unit.row, p.col, p.row)
    );
    if (attackable.length && !unit.attackedThisTurn) {
      const t = playerCarrier && attackable.includes(playerCarrier) ? playerCarrier : pickBestVictim(unit, attackable);
      attackTarget(unit, t.col, t.row);
    }
  }

  function doCarrierMove(unit, state, api) {
    const { moveUnit } = api;
    const maxSteps = Math.min(2, unit.speed - unit.speedUsedThisTurn, state.movePool);
    if (maxSteps <= 0) return;
    let bestBase = null, bestDist = Infinity;
    for (const b of Board.AI_BASE) {
      const d = Board.hexDistance(unit.col, unit.row, b.col, b.row);
      if (d < bestDist) { bestDist = d; bestBase = b; }
    }
    if (!bestBase) return;
    const dest = bestApproach(unit, bestBase, maxSteps, api);
    if (dest) moveUnit(unit, dest.col, dest.row);
  }

  function pickMeleeTarget(unit, enemies) {
    const withDist = enemies.map(e => ({
      e,
      dist: Board.hexDistance(unit.col, unit.row, e.col, e.row),
      killable: e.hp <= unit.dmg
    }));
    withDist.sort((a, b) => {
      if (a.killable && !b.killable) return -1;
      if (!a.killable && b.killable) return 1;
      if (a.e.hasFlag && !b.e.hasFlag) return -1;
      if (!a.e.hasFlag && b.e.hasFlag) return 1;
      if (a.e.hp !== b.e.hp) return a.e.hp - b.e.hp;
      return a.dist - b.dist;
    });
    return withDist[0]?.e || null;
  }

  function pickBestVictim(attacker, enemies) {
    const withScore = enemies.map(e => {
      let score = 0;
      if (e.hp <= attacker.dmg) score += 1000;
      if (e.hasFlag) score += 600;
      score += Math.max(0, 10 - e.hp);
      score -= Board.hexDistance(attacker.col, attacker.row, e.col, e.row);
      return { e, score };
    });
    withScore.sort((a, b) => b.score - a.score);
    return withScore[0].e;
  }

  function nearestEnemyDist(unit, enemies) {
    return Math.min(...enemies.map(e => Board.hexDistance(unit.col, unit.row, e.col, e.row)));
  }

  function bestApproach(unit, target, maxSteps, api) {
    const { unitAt } = api;
    const startIdx = Board.idx(unit.col, unit.row);
    const dist = new Map([[startIdx, 0]]);
    const queue = [{ col: unit.col, row: unit.row }];
    let best = null;
    let bestKey = null;

    while (queue.length) {
      const cur = queue.shift();
      const curIdx = Board.idx(cur.col, cur.row);
      const d = dist.get(curIdx);
      if (d > maxSteps) continue;

      const distToTarget = Board.hexDistance(cur.col, cur.row, target.col, target.row);
      const key = [Math.max(0, distToTarget - unit.range), distToTarget, -d].join('|');
      if ((cur.col !== unit.col || cur.row !== unit.row) && (bestKey === null || key < bestKey)) {
        bestKey = key;
        best = cur;
      }

      for (const nb of Board.neighbors(cur.col, cur.row)) {
        const ni = Board.idx(nb.col, nb.row);
        if (dist.has(ni)) continue;
        if (!Board.isPassable(nb.col, nb.row)) continue;
        if (unitAt(nb.col, nb.row)) continue;
        dist.set(ni, d + 1);
        queue.push(nb);
      }
    }
    return best;
  }

  return { takeTurn };
})();
