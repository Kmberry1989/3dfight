import { FIGHTER_STATE, FRAME_RATE, getMove } from './frameData.js';
import { FOCUS_MOVE_TYPES } from './focusMoves.js';

export { FIGHTER_STATE, FRAME_RATE };

export function initializeCombatFighter(fighter) {
  fighter.meter = 0;
  fighter.combat = {
    state: FIGHTER_STATE.IDLE,
    frame: 0,
    stateFrame: 0,
    simFrame: 0,
    move: null,
    chain: 0,
    buffer: [],
    hitIds: new Set(),
    whiff: false,
    armor: 0,
    pushVelocity: 0,
    motionVelocity: 0,
    dashDir: 0,
    dashIFrames: 0,
    activeHitbox: false,
    // Focus Controls bookkeeping: tap-vs-hold decision, charge levels,
    // tempo window, and the fighter's jab-string cycle. Plain numbers and
    // booleans so the deterministic sim hash stays stable.
    tempoFrames: 0,
    focusPending: 0,
    focusPressArmed: false,
    focusCharging: false,
    focusChargeFrames: 0,
    focusChain: 0,
    strikeWasHeld: false
  };
  mirrorLegacyFlags(fighter);
}

export function queueCombatInput(fighter, type, now = performance.now()) {
  if (!fighter?.combat) return;
  fighter.combat.buffer.push({ type, expiresAtFrame: fighter.combat.simFrame + 12 });
  fighter.combat.buffer = fighter.combat.buffer.slice(-4);
}

export function changeCombatState(fighter, state, { move = null, resetMove = false } = {}) {
  const c = fighter.combat; if (!c) return;
  c.state = state; c.stateFrame = 0; c.move = move; c.activeHitbox = false;
  if (state !== FIGHTER_STATE.WALK && state !== FIGHTER_STATE.DASH) c.motionVelocity = 0;
  if (move && resetMove) { c.frame = 0; c.hitIds.clear(); c.whiff = true; c.armor = move.armor || 0; }
  mirrorLegacyFlags(fighter);
}

export function startCombatDash(fighter, direction) {
  const c = fighter?.combat;
  if (!c || fighter.isDead || fighter.isJumping) return false;
  if (![FIGHTER_STATE.IDLE, FIGHTER_STATE.WALK, FIGHTER_STATE.BLOCK].includes(c.state)) return false;
  c.dashDir = direction || fighter.direction || 1;
  c.dashIFrames = c.dashDir !== fighter.direction ? 6 : 0;
  changeCombatState(fighter, FIGHTER_STATE.DASH);
  return true;
}

export function startCombatMove(fighter, type) {
  const c = fighter.combat; if (!c) return false;
  // Chain cancels (from ACTIVE or RECOVERY) escalate the jab string:
  // light -> medium -> heavy. Fresh neutral presses reuse the standing
  // chain step so a completed string flows into the next one.
  const canceling = c.state === FIGHTER_STATE.ACTIVE || c.state === FIGHTER_STATE.RECOVERY;
  const chain = ['punch', 'kick'].includes(type) ? Math.min(c.chain + (canceling ? 1 : 0), 2) : 0;
  const move = getMove(type, chain, fighter.charId);
  if (!move || (move.meterCost && fighter.meter < move.meterCost)) return false;
  if (move.meterCost) fighter.meter -= move.meterCost;
  c.chain = chain;
  changeCombatState(fighter, FIGHTER_STATE.STARTUP, { move, resetMove: true });
  return true;
}

export function canAcceptMove(fighter, type) {
  const c = fighter.combat; if (!c || fighter.isDead) return false;
  // Taunts are only legal from a neutral idle stance: safe context, never a
  // cancel, never accidental. Everything else follows the standard gates.
  if (type === 'taunt') return c.state === FIGHTER_STATE.IDLE;
  if ([FIGHTER_STATE.IDLE, FIGHTER_STATE.WALK, FIGHTER_STATE.BLOCK].includes(c.state)) return true;
  // Air attacks: normals and focus finishers work airborne. Specials,
  // throws, and taunts stay grounded.
  if (c.state === FIGHTER_STATE.JUMP) {
    return type === 'punch' || type === 'kick' || FOCUS_MOVE_TYPES.includes(type);
  }
  if (c.state === FIGHTER_STATE.BLOCKSTUN) return c.stateFrame <= 5;
  // Chain cancels: a normal (punch/kick) cancels into another normal or a
  // special from its first active frame deep into recovery. Throws, focus
  // finishers, and specials-as-source stay out, so tempo routes, dives, and
  // big meter moves keep their commitment.
  if ((c.state === FIGHTER_STATE.ACTIVE || c.state === FIGHTER_STATE.RECOVERY) && c.move) {
    const [from, to] = c.move.cancelWindow;
    const chainSource = /^(punch|kick)-/.test(c.move.id);
    const chainTarget = type === 'punch' || type === 'kick' || type === 'special';
    return chainSource && chainTarget && c.frame >= from && c.frame <= to;
  }
  return false;
}

export function consumeBufferedMove(fighter, now = performance.now()) {
  const c = fighter.combat; if (!c) return false;
  c.buffer = c.buffer.filter((entry) => entry.expiresAtFrame >= c.simFrame);
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
    if (c.stateFrame >= recovery) {
      // Chain bookkeeping: a completed string ends after its heavy (chain
      // resets so the next string starts light again); whiffs, throws, and
      // meter moves never carry the chain forward.
      c.chain = (c.whiff || move.throw || move.meterCost || c.chain >= 2) ? 0 : c.chain + 1;
      // Completing a taunt performance grants its meter reward (sim-side, so
      // replays and peers agree). Getting hit out of it forfeits the reward.
      if (move.taunt && move.tauntMeter) fighter.meter = Math.min(100, fighter.meter + move.tauntMeter);
      // An attack that ends mid-air returns to the airborne state; gravity
      // (advanceCombatFighterStep) keeps falling until landing.
      changeCombatState(fighter, fighter.isJumping ? FIGHTER_STATE.JUMP : FIGHTER_STATE.IDLE);
    }
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
  c.stateFrame++;
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
