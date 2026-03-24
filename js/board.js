// ============================================================
// board.js — Hex grid geometry, tile rendering, pathfinding, LOS
// ============================================================

const Board = (() => {

  const COLS = Data.BOARD_COLS;
  const ROWS = Data.BOARD_ROWS;

  // Board art in the visual guide uses flat-top hexes, then the whole board is
  // sheared and vertically compressed to create an isometric feel.
  const HEX_R   = 30;
  const HEX_W   = HEX_R * 2;
  const HEX_H   = Math.sqrt(3) * HEX_R;
  const STEP_X  = HEX_R * 1.5;
  const STEP_Y  = HEX_H;
  const COL_Y_OFFSET = HEX_H / 2;

  const SHEAR   = Math.tan(Math.PI / 6); // 30 degrees
  const SCALE_Y = 0.75;

  const GAME_TOP    = 48;
  const GAME_BOTTOM = 56;
  const GAME_H      = 720 - GAME_TOP - GAME_BOTTOM;

  const TILE = { EMPTY: 0, OBSTACLE: 1, ACID: 2, FIRE: 3 };

  let tiles = [];
  let tileAngles = [];

  function baseCenter(col, row) {
    return {
      x: col * STEP_X,
      y: row * STEP_Y + ((col % 2) ? COL_Y_OFFSET : 0)
    };
  }

  function transformPoint(x, y) {
    return {
      x: x + y * SHEAR,
      y: y * SCALE_Y
    };
  }

  function transformedCenterAtOrigin(col, row) {
    const p = baseCenter(col, row);
    return transformPoint(p.x, p.y);
  }

  function transformedHexBounds(col, row) {
    const c = baseCenter(col, row);
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      const px = c.x + HEX_R * Math.cos(a);
      const py = c.y + HEX_R * Math.sin(a);
      pts.push(transformPoint(px, py));
    }
    return pts;
  }

  const allBounds = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      allBounds.push(...transformedHexBounds(col, row));
    }
  }
  const MIN_X = Math.min(...allBounds.map(p => p.x));
  const MAX_X = Math.max(...allBounds.map(p => p.x));
  const MIN_Y = Math.min(...allBounds.map(p => p.y));
  const MAX_Y = Math.max(...allBounds.map(p => p.y));
  const BOARD_W = MAX_X - MIN_X;
  const BOARD_H = MAX_Y - MIN_Y;

  let ORIGIN_X = (1280 - BOARD_W) / 2 - MIN_X;
  let ORIGIN_Y = GAME_TOP + (GAME_H - BOARD_H) / 2 - MIN_Y + 8;

  function generate(obstacleCount) {
    obstacleCount = obstacleCount || Data.OBSTACLE_COUNT;
    tiles = new Array(COLS * ROWS).fill(TILE.EMPTY);
    tileAngles = tiles.map(() => Math.random() * Math.PI * 2);

    const reserved = new Set();
    for (let r = 0; r < ROWS; r++) {
      reserved.add(idx(0, r));
      reserved.add(idx(COLS - 1, r));
    }
    PLAYER_BASE.forEach(b => reserved.add(idx(b.col, b.row)));
    AI_BASE.forEach(b => reserved.add(idx(b.col, b.row)));

    let attempts = 0, placed = 0;
    while (placed < Math.floor(obstacleCount / 2) && attempts < 800) {
      attempts++;
      const col = 2 + Math.floor(Math.random() * (Math.floor(COLS / 2) - 2));
      const row = Math.floor(Math.random() * ROWS);
      const i = idx(col, row);
      const mc = COLS - 1 - col;
      const mi = idx(mc, row);
      if (!reserved.has(i) && !reserved.has(mi) && tiles[i] === TILE.EMPTY) {
        tiles[i] = TILE.OBSTACLE;
        tiles[mi] = TILE.OBSTACLE;
        placed++;
      }
    }
  }

  function idx(col, row) { return col + row * COLS; }
  function colRow(i) { return { col: i % COLS, row: Math.floor(i / COLS) }; }
  function getTile(c, r) { return (c < 0 || c >= COLS || r < 0 || r >= ROWS) ? TILE.OBSTACLE : tiles[idx(c, r)]; }
  function setTile(c, r, t) { if (c >= 0 && c < COLS && r >= 0 && r < ROWS) tiles[idx(c, r)] = t; }
  function isPassable(c, r) { const t = getTile(c, r); return t === TILE.EMPTY || t === TILE.ACID || t === TILE.FIRE; }

  function toAxial(col, row) {
    return { q: col, r: row - Math.floor((col + (col & 1)) / 2) };
  }
  function axialToOffset(q, r) {
    return { col: q, row: r + Math.floor((q + (q & 1)) / 2) };
  }
  function hexDistance(c1, r1, c2, r2) {
    const a = toAxial(c1, r1), b = toAxial(c2, r2);
    const dq = a.q - b.q, dr = a.r - b.r;
    return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
  }

  function neighbors(col, row) {
    const even = [[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[0,1]];
    const odd  = [[1,1],[1,0],[0,-1],[-1,0],[-1,1],[0,1]];
    const offs = (col % 2 === 0) ? even : odd;
    return offs.map(([dc,dr]) => ({ col: col + dc, row: row + dr }))
      .filter(({ col:c, row:r }) => c >= 0 && c < COLS && r >= 0 && r < ROWS);
  }

  function findPath(fc, fr, tc, tr, occupiedFn) {
    if (fc === tc && fr === tr) return [];
    if (!isPassable(tc, tr)) return null;
    const start = idx(fc, fr), goal = idx(tc, tr);
    const visited = new Map([[start, null]]);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift();
      if (cur === goal) break;
      const { col, row } = colRow(cur);
      for (const nb of neighbors(col, row)) {
        const ni = idx(nb.col, nb.row);
        if (visited.has(ni)) continue;
        if (!isPassable(nb.col, nb.row)) continue;
        if (occupiedFn && occupiedFn(nb.col, nb.row) && ni !== goal) continue;
        visited.set(ni, cur);
        queue.push(ni);
      }
    }
    if (!visited.has(goal)) return null;
    const path = [];
    let cur = goal;
    while (cur !== start) {
      path.unshift(colRow(cur));
      cur = visited.get(cur);
    }
    return path;
  }

  function reachable(fc, fr, maxSteps, occupiedFn) {
    const result = new Set();
    const dist = new Map([[idx(fc, fr), 0]]);
    const queue = [idx(fc, fr)];
    while (queue.length) {
      const cur = queue.shift();
      const d = dist.get(cur);
      if (d >= maxSteps) continue;
      const { col, row } = colRow(cur);
      for (const nb of neighbors(col, row)) {
        const ni = idx(nb.col, nb.row);
        if (dist.has(ni)) continue;
        if (!isPassable(nb.col, nb.row)) continue;
        if (occupiedFn && occupiedFn(nb.col, nb.row)) continue;
        dist.set(ni, d + 1);
        result.add(ni);
        queue.push(ni);
      }
    }
    return result;
  }

  function hasLOS(c1, r1, c2, r2) {
    const dist = hexDistance(c1, r1, c2, r2);
    if (dist === 0) return true;
    const a1 = toAxial(c1, r1), a2 = toAxial(c2, r2);
    for (let i = 1; i < dist; i++) {
      const t = i / dist;
      const q = a1.q + (a2.q - a1.q) * t;
      const r = a1.r + (a2.r - a1.r) * t;
      const rq = Math.round(q), rr = Math.round(r);
      const off = axialToOffset(rq, rr);
      if (getTile(off.col, off.row) === TILE.OBSTACLE) return false;
    }
    return true;
  }

  function hexCenter(col, row) {
    const p = transformedCenterAtOrigin(col, row);
    return { x: ORIGIN_X + p.x, y: ORIGIN_Y + p.y };
  }

  function drawHexPath(ctx, cx, cy, r = HEX_R) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      const x = r * Math.cos(a);
      const y = r * Math.sin(a);
      const tx = x + y * SHEAR;
      const ty = y * SCALE_Y;
      if (i === 0) ctx.moveTo(cx + tx, cy + ty);
      else ctx.lineTo(cx + tx, cy + ty);
    }
    ctx.closePath();
  }

  function drawTextureTile(ctx, cx, cy, r, imageKey, angle, alpha = 1) {
    const img = TactixEngine.getImage(imageKey);
    if (!img) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    drawHexPath(ctx, cx, cy, r);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    const sz = r * 3.1;
    ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz);
    ctx.restore();
  }

  function render(ctx, highlights = {}, mines = []) {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const i = idx(col, row);
        const type = tiles[i];
        const { x, y } = hexCenter(col, row);
        const angle = tileAngles[i];

        if (type === TILE.OBSTACLE) {
          drawTextureTile(ctx, x, y, HEX_R, 'rock_texture', angle);
        } else if (type === TILE.ACID) {
          drawTextureTile(ctx, x, y, HEX_R, 'dirt_texture', angle);
          drawTextureTile(ctx, x, y, HEX_R, 'acid_texture', 0, 0.92);
        } else if (type === TILE.FIRE) {
          drawTextureTile(ctx, x, y, HEX_R, 'dirt_texture', angle);
          drawTextureTile(ctx, x, y, HEX_R, 'fire_texture', 0, 0.92);
        } else {
          drawTextureTile(ctx, x, y, HEX_R, 'dirt_texture', angle);
        }

        drawHexPath(ctx, x, y, HEX_R);
        ctx.strokeStyle = type === TILE.OBSTACLE ? '#4f5e66' : '#61767f';
        ctx.lineWidth = 1;
        ctx.stroke();

        const rawHl = highlights[i];
        const hl = typeof rawHl === 'string' ? { type: rawHl } : rawHl;
        if (hl) {
          drawHexPath(ctx, x, y, HEX_R);
          const moveStroke = hl.color || 'rgba(58,138,250,0.88)';
          const hlStyles = {
            move:         { fill: withAlpha(moveStroke, 0.28), stroke: moveStroke, lw:2 },
            attack:       { fill:'rgba(250,60,60,0.28)',  stroke:'rgba(250,60,60,0.88)',  lw:2 },
            selected:     { fill:'rgba(255,255,80,0.18)', stroke:'rgba(255,255,80,0.92)', lw:2.5 },
            base_player:  { fill:'rgba(58,138,250,0.14)', stroke:'rgba(58,138,250,0.45)', lw:1.5 },
            base_ai:      { fill:'rgba(250,80,80,0.14)',  stroke:'rgba(250,80,80,0.45)',  lw:1.5 },
            flag:         { fill:'rgba(255,230,50,0.32)', stroke:'rgba(255,230,50,0.90)', lw:2.5 },
            teleport:     { fill: withAlpha(moveStroke, 0.24), stroke: moveStroke, lw:2 },
            mine_place:   { fill: withAlpha(moveStroke, 0.20), stroke: moveStroke, lw:2 },
          };
          const s = hlStyles[hl.type];
          if (s) {
            ctx.fillStyle = s.fill;
            ctx.fill();
            ctx.strokeStyle = s.stroke;
            ctx.lineWidth = s.lw;
            ctx.stroke();
          }
        }

        const mine = mines.find(m => m.col === col && m.row === row);
        if (mine) drawMineToken(ctx, x, y, mine.owner);
      }
    }
  }

  function withAlpha(hex, alpha) {
    if (!hex || !hex.startsWith('#')) return hex;
    const raw = hex.slice(1);
    const full = raw.length === 3 ? raw.split('').map(ch => ch + ch).join('') : raw;
    const r = parseInt(full.slice(0,2),16), g = parseInt(full.slice(2,4),16), b = parseInt(full.slice(4,6),16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function drawMineToken(ctx, cx, cy, owner) {
    ctx.save();
    ctx.translate(cx, cy);
    const s = 7;
    ctx.beginPath();
    ctx.moveTo(0, -s); ctx.lineTo(s, 0); ctx.lineTo(0, s); ctx.lineTo(-s, 0);
    ctx.closePath();
    ctx.fillStyle = owner === 'player' ? 'rgba(58,138,250,0.92)' : 'rgba(250,58,58,0.92)';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-3,-3); ctx.lineTo(3,3); ctx.moveTo(3,-3); ctx.lineTo(-3,3);
    ctx.stroke();
    ctx.restore();
  }

  function drawFlag(ctx, col, row) {
    const { x, y } = hexCenter(col, row);
    ctx.save();
    ctx.translate(x, y - 4);
    ctx.strokeStyle = '#e8d050';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 8); ctx.lineTo(0, -12); ctx.stroke();
    ctx.fillStyle = '#f0e040';
    ctx.beginPath();
    ctx.moveTo(0, -12); ctx.lineTo(12, -7); ctx.lineTo(0, -2); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function tileAtPoint(px, py) {
    let best = null, bestDist = Infinity;
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const { x, y } = hexCenter(col, row);
        const d = Math.hypot(px - x, py - y);
        if (d < HEX_R * 1.05 && d < bestDist) {
          bestDist = d;
          best = { col, row };
        }
      }
    }
    return best;
  }

  const PLAYER_BASE = [{col:0,row:0},{col:0,row:1},{col:1,row:0}];
  const AI_BASE     = [{col:COLS-1,row:ROWS-1},{col:COLS-1,row:ROWS-2},{col:COLS-2,row:ROWS-1}];

  function isPlayerBase(col, row) { return PLAYER_BASE.some(b => b.col === col && b.row === row); }
  function isAIBase(col, row) { return AI_BASE.some(b => b.col === col && b.row === row); }

  function spawnPositions(side, count) {
    const col = side === 'player' ? 0 : COLS - 1;
    const positions = [];
    const desiredRows = [];
    if (count <= 1) desiredRows.push(Math.floor(ROWS / 2));
    else {
      for (let i = 0; i < count; i++) {
        desiredRows.push(Math.round((i * (ROWS - 1)) / Math.max(1, count - 1)));
      }
    }
    for (const r of desiredRows) {
      if (isPassable(col, r) && !positions.find(p => p.row === r)) positions.push({ col, row: r });
    }
    for (let r = 0; r < ROWS && positions.length < count; r++) {
      if (isPassable(col, r) && !positions.find(p => p.row === r)) positions.push({ col, row: r });
    }
    return positions.slice(0, count);
  }

  function recalcOrigin(canvasW, canvasH) {
    const gameH = canvasH - GAME_TOP - GAME_BOTTOM;
    ORIGIN_X = (canvasW - BOARD_W) / 2 - MIN_X;
    ORIGIN_Y = GAME_TOP + (gameH - BOARD_H) / 2 - MIN_Y + 8;
  }

  return {
    TILE, COLS, ROWS, HEX_R, HEX_W, HEX_H,
    generate, idx, colRow,
    getTile, setTile, isPassable,
    hexDistance, neighbors,
    findPath, reachable,
    hasLOS, hexCenter,
    drawHexPath, render,
    drawFlag, drawMineToken,
    tileAtPoint,
    PLAYER_BASE, AI_BASE,
    isPlayerBase, isAIBase,
    spawnPositions, recalcOrigin
  };
})();
