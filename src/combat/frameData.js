export const FRAME_RATE = 60;

export const FIGHTER_STATE = Object.freeze({
  IDLE: 'IDLE', WALK: 'WALK', JUMP: 'JUMP', DASH: 'DASH',
  STARTUP: 'STARTUP', ACTIVE: 'ACTIVE', RECOVERY: 'RECOVERY',
  BLOCK: 'BLOCK', BLOCKSTUN: 'BLOCKSTUN', HITSTUN: 'HITSTUN',
  KNOCKDOWN: 'KNOCKDOWN', GETUP: 'GETUP', GUARD_BREAK: 'GUARD_BREAK', DEAD: 'DEAD'
});

const move = (id, animation, limb, startup, active, recovery, values = {}) => ({
  id, animation, limb, startup, active, recovery,
  cancelWindow: [Math.max(1, startup + active - 1), startup + active + Math.max(1, Math.floor(recovery * 0.45))],
  damage: 5, blockDamage: 1, hitstun: 14, blockstun: 8, hitstop: 4,
  pushback: 0.24, blockPushback: 0.16, lunge: 0.05, meterGain: 8,
  hitbox: { width: 0.34, height: 0.30, depth: 0.34 },
  ...values
});

export const MOVE_DATA = Object.freeze({
  punch: [
    move('punch-light', 'punchLight', 'hand', 4, 3, 10, { damage: 4, hitstun: 14, blockstun: 8, pushback: .28, lunge: .08 }),
    move('punch-medium', 'punchMedium', 'hand', 7, 4, 14, { damage: 7, hitstun: 19, blockstun: 11, hitstop: 8, pushback: .42, lunge: .13 }),
    move('punch-heavy', 'punchHeavy', 'hand', 12, 5, 22, { damage: 11, hitstun: 28, blockstun: 15, hitstop: 12, pushback: .75, lunge: .2, armor: 1, whiffRecovery: 8, meterGain: 12 })
  ],
  kick: [
    move('kick-light', 'kickLight', 'foot', 4, 3, 10, { damage: 5, hitstun: 15, blockstun: 8, pushback: .32, lunge: .10, hitbox: { width: .42, height: .35, depth: .42 } }),
    move('kick-medium', 'kickMedium', 'foot', 7, 4, 14, { damage: 8, hitstun: 20, blockstun: 11, hitstop: 8, pushback: .48, lunge: .16, hitbox: { width: .46, height: .38, depth: .46 } }),
    move('kick-heavy', 'kickHeavy', 'foot', 12, 5, 22, { damage: 13, hitstun: 30, blockstun: 15, hitstop: 12, pushback: .9, lunge: .24, armor: 1, whiffRecovery: 8, meterGain: 12, hitbox: { width: .52, height: .42, depth: .52 } })
  ],
  special: [
    move('special', 'specialMedium', 'foot', 10, 5, 26, { damage: 15, hitstun: 32, blockstun: 16, hitstop: 12, pushback: 1.0, lunge: .28, meterCost: 50, meterGain: 0, whiffRecovery: 8, armor: 1, hitbox: { width: .58, height: .44, depth: .58 } })
  ],
  throw: [
    move('throw', 'grabSlam', 'throw', 5, 2, 24, { damage: 12, hitstun: 46, hitstop: 8, pushback: .7, lunge: .12, throw: true, meterGain: 10, hitbox: { width: .8, height: .8, depth: .7 } })
  ]
});

import { getFocusMoveType, FOCUS_MOVE_TYPES } from './focusMoves.js';

export function getMove(type, chain = 0, fighterId = null) {
  // Per-fighter specials: each roster fighter owns a unique special move.
  // Unknown ids (story enemies, legacy callers) fall back to the shared table.
  if (type === 'special' && fighterId && FIGHTER_SPECIALS[fighterId]) {
    return FIGHTER_SPECIALS[fighterId];
  }
  if (type === 'taunt') {
    return getTauntMove(fighterId);
  }
  // Focus Controls finishers: tempo routes and charged strikes resolve to
  // the pressing fighter's unique kit.
  if (FOCUS_MOVE_TYPES.includes(type)) {
    return getFocusMoveType(fighterId, type);
  }
  const moves = MOVE_DATA[type];
  if (!moves) return null;
  return moves[Math.min(chain, moves.length - 1)];
}

// ---------------------------------------------------------------------------
// Character identity: unique specials + taunts (Phase 2).
//
// Every selectable fighter owns exactly one special with a distinct gameplay
// purpose, animation, and counterplay. Meter cost is standardized at 50 so the
// "special ready" read stays uniform while the moves themselves differ.
// Counterplay notes are documented per move for the future move-guide UI.
// ---------------------------------------------------------------------------
export const FIGHTER_SPECIALS = Object.freeze({
  // Kyle — balanced rushdown. Advancing spinning kick; closes distance fast,
  // punishable on whiff because the spin carries him past a blocking foe.
  kyle: move('special-kyle-cyclone-heel', 'spinFlipKick', 'foot', 9, 6, 24,
    { damage: 14, hitstun: 30, blockstun: 14, hitstop: 12, pushback: .9, blockPushback: .5, lunge: .3, meterCost: 50, meterGain: 0, armor: 1, whiffRecovery: 10, hitbox: { width: .6, height: .5, depth: .6 } }),
  // Jonah — armored brawler. Shoulder barge plows through single pokes.
  // Counterplay: jump over it, or throw him (armor does not beat throws).
  jonah: move('special-jonah-barge', 'shoulderBarge', 'torso', 14, 4, 28,
    { damage: 16, hitstun: 34, blockstun: 16, hitstop: 14, pushback: 1.1, blockPushback: .6, lunge: .35, meterCost: 50, meterGain: 0, armor: 2, whiffRecovery: 12, hitbox: { width: .62, height: .6, depth: .55 } }),
  // Rochelle — long-range low check. Sweep ends in knockdown; the classic
  // answer is to jump it, which the 11f startup telegraphs.
  rochelle: move('special-rochelle-low-tide', 'sweepKick', 'foot', 11, 4, 26,
    { damage: 12, hitstun: 30, blockstun: 14, hitstop: 12, pushback: .8, blockPushback: .45, lunge: .22, meterCost: 50, meterGain: 0, whiffRecovery: 10, hitbox: { width: .66, height: .3, depth: .5 } }),
  // Vickie — guard cracker. Slow overhead smash; the 18f startup is the
  // counterplay window — interrupt it or backdash the arc.
  vickie: move('special-vickie-crush', 'overheadSmash', 'hand', 18, 3, 30,
    { damage: 18, hitstun: 38, blockstun: 20, hitstop: 16, pushback: 1.2, blockPushback: .7, lunge: .18, meterCost: 50, meterGain: 0, armor: 1, whiffRecovery: 14, hitbox: { width: .58, height: .55, depth: .58 } }),
  // Donald — whiff punisher. Lunging drop kick covers ground fast; block it
  // and the long landing recovery is yours.
  donald: move('special-donald-dropkick', 'dropKick', 'foot', 12, 5, 30,
    { damage: 15, hitstun: 32, blockstun: 16, hitstop: 12, pushback: 1.0, blockPushback: .55, lunge: .42, meterCost: 50, meterGain: 0, whiffRecovery: 14, hitbox: { width: .6, height: .45, depth: .55 } }),
  // Eric — pressure. The fastest special on the roster (6f startup) but
  // stubby; keep him out and it whiffs harmlessly.
  eric: move('special-eric-haymaker', 'haymaker', 'hand', 6, 3, 22,
    { damage: 13, hitstun: 28, blockstun: 14, hitstop: 10, pushback: .7, blockPushback: .4, lunge: .16, meterCost: 50, meterGain: 0, whiffRecovery: 8, hitbox: { width: .5, height: .45, depth: .5 } }),
  // Kristen — anti-air. Rising flip kick; bait it and punish the 28f
  // recovery, or stay grounded and out of its vertical lane.
  kristen: move('special-kristen-crescent', 'flipKick', 'foot', 8, 6, 28,
    { damage: 14, hitstun: 30, blockstun: 14, hitstop: 12, pushback: .85, blockPushback: .5, lunge: .12, meterCost: 50, meterGain: 0, whiffRecovery: 12, hitbox: { width: .52, height: .62, depth: .52 } }),
});

// Taunts run through the same move pipeline so the lock-in is deterministic
// and replay-safe: the fighter is committed for the full performance, which
// is the "safe context" the design calls for — never a cancel, never free.
// Completing the taunt grants a small meter reward (the classic risk/reward).
// Each fighter's taunt plays their own unique taunt clip; frame data is
// standardized so the risk reads the same for everyone.
const TAUNT_TOTAL_FRAMES = 135; // matches the normalized 2.25s taunt clip pacing
const tauntMove = (id) => move(id, 'taunt', 'none', TAUNT_TOTAL_FRAMES - 2, 1, 1,
  { damage: 0, blockDamage: 0, hitstun: 0, blockstun: 0, hitstop: 0, pushback: 0, blockPushback: 0, lunge: 0, meterGain: 0, taunt: true, tauntMeter: 8, hitbox: { width: 0, height: 0, depth: 0 } });

const TAUNT_MOVES = Object.freeze({
  kyle: tauntMove('taunt-kyle'),
  jonah: tauntMove('taunt-jonah'),
  rochelle: tauntMove('taunt-rochelle'),
  vickie: tauntMove('taunt-vickie'),
  donald: tauntMove('taunt-donald'),
  eric: tauntMove('taunt-eric'),
  kristen: tauntMove('taunt-kristen'),
});

const DEFAULT_TAUNT_MOVE = tauntMove('taunt-default');

export function getTauntMove(fighterId = null) {
  return (fighterId && TAUNT_MOVES[fighterId]) || DEFAULT_TAUNT_MOVE;
}

// Animation names owned by the live move data. The presentation layer uses
// this to mark one-shot attack clips (LoopOnce, clamp when finished).
// This is the single source of truth; the old ATTACKS table is gone.
const FIGHTER_ATTACK_ANIMATIONS = [
  ...Object.values(FIGHTER_SPECIALS).map((special) => special.animation),
  'taunt',
  // Focus Controls finishers pull from the shared pool plus these extras.
  'lungePunchHeavy',
  'frontTwistFlip',
  'backflip',
];
export const ATTACK_ANIMATION_NAMES = Object.freeze(new Set(
  [...Object.values(MOVE_DATA).flatMap((moves) => moves.map((move) => move.animation)),
   ...FIGHTER_ATTACK_ANIMATIONS]
));
