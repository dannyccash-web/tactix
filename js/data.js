// ============================================================
// data.js — All static game data: teams, units, power-ups
// ============================================================

const Data = (() => {

  // ── Unit definitions ─────────────────────────────────────
  // special: null | 'splash' | 'stun' | 'poison' | 'acid_tile' | 'fire_tile' | 'column_fire'
  const UNITS = {
    infantry: {
      id: 'infantry', name: 'INFANTRY', cost: 2,
      speed: 5, range: 2, atk: 1, def: 1, dmg: 2, hp: 5,
      special: null
    },
    sniper: {
      id: 'sniper', name: 'SNIPER', cost: 4,
      speed: 3, range: 5, atk: 3, def: 0, dmg: 3, hp: 4,
      special: null
    },
    elite: {
      id: 'elite', name: 'ELITE', cost: 6,
      speed: 7, range: 3, atk: 5, def: 2, dmg: 4, hp: 6,
      special: null
    },
    grenadier: {
      id: 'grenadier', name: 'GRENADIER', cost: 6,
      speed: 3, range: 4, atk: 2, def: 5, dmg: 5, hp: 6,
      special: 'splash'
    },
    shock_trooper: {
      id: 'shock_trooper', name: 'SHOCK TROOPER', cost: 6,
      speed: 5, range: 1, atk: 4, def: 3, dmg: 4, hp: 6,
      special: 'stun'
    },
    slasher: {
      id: 'slasher', name: 'SLASHER', cost: 3,
      speed: 6, range: 1, atk: 3, def: 1, dmg: 2, hp: 5,
      special: 'poison'
    },
    assassin: {
      id: 'assassin', name: 'ASSASSIN', cost: 5,
      speed: 3, range: 5, atk: 3, def: 0, dmg: 3, hp: 4,
      special: 'poison'
    },
    acid_thrower: {
      id: 'acid_thrower', name: 'ACID THROWER', cost: 7,
      speed: 5, range: 3, atk: 4, def: 3, dmg: 4, hp: 6,
      special: 'acid_tile'
    },
    grunt: {
      id: 'grunt', name: 'GRUNT', cost: 3,
      speed: 6, range: 2, atk: 1, def: 1, dmg: 2, hp: 5,
      special: 'fire_dot'
    },
    sharpshooter: {
      id: 'sharpshooter', name: 'SHARPSHOOTER', cost: 5,
      speed: 3, range: 5, atk: 3, def: 0, dmg: 3, hp: 4,
      special: 'fire_dot'
    },
    fire_caller: {
      id: 'fire_caller', name: 'FIRE CALLER', cost: 7,
      speed: 5, range: 10, atk: 4, def: 3, dmg: 4, hp: 6,
      special: 'column_fire'
    }
  };

  // ── Power-up definitions ─────────────────────────────────
  const POWERUPS = {
    med_pack: {
      id: 'med_pack', name: 'MED PACK', cost: 1,
      desc: 'Restores 3 HP to a friendly unit.',
      icon: 'med_pack'
    },
    mine: {
      id: 'mine', name: 'MINE', cost: 1,
      desc: '2 damage + splash to adjacent units.',
      icon: 'mine'
    },
    teleporter: {
      id: 'teleporter', name: 'TELEPORTER', cost: 2,
      desc: 'Move a friendly unit anywhere on the board.',
      icon: 'teleporter'
    }
  };

  // ── Team definitions ─────────────────────────────────────
  const TEAMS = {
    azure: {
      id: 'azure',
      name: 'AZURE',
      tagline: 'Emphasis on Speed',
      color: '#3a9fd4',
      glowColor: 'rgba(58,159,212,0.7)',
      bgClass: 'azure',
      units: ['infantry', 'sniper', 'elite'],
      spriteKey: 'azure_soldier_sprite',
      soldierKey: 'azure-soldier',
      portrait: 'azure-soldier'
    },
    phlox: {
      id: 'phlox',
      name: 'PHLOX',
      tagline: 'Emphasis on Control',
      color: '#9b59d4',
      glowColor: 'rgba(155,89,212,0.7)',
      units: ['infantry', 'sniper', 'shock_trooper'],
      spriteKey: 'phlox_soldier_sprite',
      soldierKey: 'phlox-soldier',
      portrait: 'phlox-soldier'
    },
    vermillion: {
      id: 'vermillion',
      name: 'VERMILLION',
      tagline: 'Emphasis on Damage',
      color: '#d43a3a',
      glowColor: 'rgba(212,58,58,0.7)',
      units: ['infantry', 'sniper', 'grenadier'],
      spriteKey: 'vermillion_soldier_sprite',
      soldierKey: 'vermillion-soldier',
      portrait: 'vermillion-soldier'
    },
    virent: {
      id: 'virent',
      name: 'VIRENT',
      tagline: 'Emphasis on Poison',
      color: '#3ad45a',
      glowColor: 'rgba(58,212,90,0.7)',
      units: ['slasher', 'assassin', 'acid_thrower'],
      spriteKey: 'virent_soldier_sprite',
      soldierKey: 'virent-soldier',
      portrait: 'virent-soldier'
    },
    magma: {
      id: 'magma',
      name: 'MAGMA',
      tagline: 'Emphasis on Fire',
      color: '#d47a1a',
      glowColor: 'rgba(212,122,26,0.7)',
      units: ['grunt', 'sharpshooter', 'fire_caller'],
      spriteKey: 'magma_soldier_sprite',
      soldierKey: 'magma_soldier',
      portrait: 'magma_soldier'
    }
  };

  const SQUAD_BUDGET = 15;
  const POWERUP_CAP = 5;
  const MOVE_POOL = 10;
  const OBSTACLE_COUNT = 20;
  const BOARD_COLS = 20;
  const BOARD_ROWS = 10;

  return { UNITS, POWERUPS, TEAMS, SQUAD_BUDGET, POWERUP_CAP, MOVE_POOL, OBSTACLE_COUNT, BOARD_COLS, BOARD_ROWS };
})();
