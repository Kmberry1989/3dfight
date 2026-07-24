import { FIGHTER_STATE, FRAME_RATE, getMove } from './frameData.js';

export { FIGHTER_STATE, FRAME_RATE };

export function initializeCombatFighter(fighter) {
  fighter.meter = 0;
  fighter.combat = { state: FIGHTER_STATE.IDLE, frame: 0, stateFrame: 0, move: null, chain: 0, buffer: [], hitIds: new Set(), whiff: false, armor: 0, pushVelocity: 0, dashIFrames: 0, activeHitbox: false };
  mirrorLegacyFlags(fighter);
}

export function queueCombatInput(fighter, type, now = performance.now()) {
  if (!fighter?.combat) return;
  fighter.combat.buffer.push({ type, expiresAt: now + 200 });
  fighter.combat.buffer = fighter.combat.buffer.slice(-4);
}

export function changeCombatState(fighter, state, { move = null, resetMove = false } = {}) {
  const c = fighter.combat; if (!c) return;
  c.state = state; c.stateFrame = 0; c.move = move; c.activeHitbox = false;
  if (move && resetMove) { c.frame = 0; c.hitIds.clear(); c.whiff = true; c.armor = move.armor || 0; }
  mirrorLegacyFlags(fighter);
}

export function startCombatMove(fighter, type) {
  const c = fighter.combat; if (!c) return false;
  const chain = ['punch', 'kick'].includes(type) ? Math.min(c.chain + (c.state === FIGHTER_STATE.RECOVERY ? 1 : 0), 2) : 0;
  const move = getMove(type, chain);
  if (!move || (move.meterCost && fighter.meter < move.meterCost)) return false;
  if (move.meterCost) fighter.meter -= move.meterCost;
  c.chain = chain;
  changeCombatState(fighter, FIGHTER_STATE.STARTUP, { move, resetMove: true });
  return true;
}

export function canAcceptMove(fighter, type) {
  const c = fighter.combat; if (!c || fighter.isDead) return false;
  if ([FIGHTER_STATE.IDLE, FIGHTER_STATE.WALK, FIGHTER_STATE.BLOCK].includes(c.state)) return true;
  if (c.state === FIGHTER_STATE.BLOCKSTUN) return c.stateFrame <= 5;
  if (c.state === FIGHTER_STATE.RECOVERY && c.move) {
    const [from, to] = c.move.cancelWindow;
    return c.frame >= from && c.frame <= to && !c.move.throw;
  }
  return false;
}

export function consumeBufferedMove(fighter, now = performance.now()) {
  const c = fighter.combat; if (!c) return false;
  c.buffer = c.buffer.filter((entry) => entry.expiresAt >= now);
  const entry = c.buffer[0];
  if (!entry || !canAcceptMove(fighter, entry.type)) return false;
  if (startCombatMove(fighter, entry.type)) { c.buffer.shift(); return true; }
  return false;
}

export function advanceCombatState(fighter) {
  const c = fighter.combat; if (!c) return { startedActive: false, endedHitstop: false };
  c.stateFrame++;
  const move = c.move;
  if (!move) return { startedActive: false, endedHitstop: false };
  c.frame++;
  if (c.state === FIGHTER_STATE.STARTUP && c.frame >= move.startup) { changeCombatState(fighter, FIGHTER_STATE.ACTIVE, { move }); return { startedActive: true }; }
  if (c.state === FIGHTER_STATE.ACTIVE && c.stateFrame >= move.active) { changeCombatState(fighter, FIGHTER_STATE.RECOVERY, { move }); }
  if (c.state === FIGHTER_STATE.RECOVERY) {
    const recovery = move.recovery + (c.whiff ? (move.whiffRecovery || 0) : 0);
    if (c.stateFrame >= recovery) { c.chain = c.whiff || move.throw || move.meterCost ? 0 : Math.min(c.chain + 1, 2); changeCombatState(fighter, FIGHTER_STATE.IDLE); }
  }
  return { startedActive: false };
}

export function applyCombatHit(defender, attacker, move, blocked) {
  const c = defender.combat; if (!c) return;
  c.pushVelocity += attacker.direction * (blocked ? move.blockPushback : move.pushback) * FRAME_RATE;
  c.stunFrames = blocked ? move.blockstun : move.hitstun;
  if (blocked) changeCombatState(defender, FIGHTER_STATE.BLOCKSTUN);
  else changeCombatState(defender, move.damage >= 11 || move.throw ? FIGHTER_STATE.KNOCKDOWN : FIGHTER_STATE.HITSTUN);
}

export function tickStunState(fighter) {
  const c = fighter.combat; if (!c) return;
  const limit = c.state === FIGHTER_STATE.BLOCKSTUN || c.state === FIGHTER_STATE.HITSTUN ? (c.stunFrames || 8) : c.state === FIGHTER_STATE.KNOCKDOWN ? 42 : c.state === FIGHTER_STATE.GUARD_BREAK ? 90 : 0;
  if (limit && c.stateFrame >= limit) changeCombatState(fighter, c.state === FIGHTER_STATE.KNOCKDOWN ? FIGHTER_STATE.GETUP : FIGHTER_STATE.IDLE);
  if (c.state === FIGHTER_STATE.GETUP && c.stateFrame >= 28) changeCombatState(fighter, FIGHTER_STATE.IDLE);
}

function mirrorLegacyFlags(fighter) {
  const state = fighter.combat.state;
  fighter.isAttacking = [FIGHTER_STATE.STARTUP, FIGHTER_STATE.ACTIVE, FIGHTER_STATE.RECOVERY].includes(state);
  fighter.isBlocking = state === FIGHTER_STATE.BLOCK || state === FIGHTER_STATE.BLOCKSTUN;
  fighter.isHit = [FIGHTER_STATE.HITSTUN, FIGHTER_STATE.KNOCKDOWN, FIGHTER_STATE.GETUP].includes(state);
  fighter.isStunned = state === FIGHTER_STATE.GUARD_BREAK;
}
