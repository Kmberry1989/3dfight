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

export function getMove(type, chain = 0) {
  const moves = MOVE_DATA[type];
  if (!moves) return null;
  return moves[Math.min(chain, moves.length - 1)];
}
