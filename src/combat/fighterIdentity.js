// Character identity registry (Phase 2).
//
// One entry per selectable fighter: archetype, preferred range, effect motif,
// explicit weakness, and the three mandatory unique elements — special move,
// idle stance, taunt. The improvement plan gates roster entry on all three
// being complete, so validateFighterIdentity() asserts that gate in code:
// every fighter present, no two fighters sharing a special (id or animation),
// an idle clip, or a taunt clip.

import { FIGHTER_SPECIALS, getTauntMove } from './frameData.js';

export const FIGHTER_IDENTITY = Object.freeze({
  kyle: Object.freeze({
    archetype: 'Balanced rushdown — closes distance and stays in your face.',
    range: 'Mid, advancing',
    motif: 'Cyan streaks',
    weakness: 'No strong full-screen answer; the spin can be low-profiled.',
    special: Object.freeze({
      name: 'Cyclone Heel',
      purpose: 'Advancing multi-hit spin kick that carries Kyle across mid range under light pressure.',
      counterplay: 'Block the spin and punish the whiffed landing; it travels past a blocking foe.',
    }),
    idle: Object.freeze({
      clip: 'kyle:idle',
      note: 'Light bounce, gloves up — a boxer’s restless rhythm.',
      timeScale: 1.12,
      swayAmp: 0.018,
      swayFreq: 2.2,
    }),
    taunt: Object.freeze({
      clip: 'kyle:taunt',
      flavor: 'Beckoning wave — “come on.”',
      frames: 135,
      meterReward: 8,
    }),
  }),
  jonah: Object.freeze({
    archetype: 'Armored brawler — walks through single hits to deliver one big one.',
    range: 'Close',
    motif: 'Magenta shockwave',
    weakness: 'Slow; armor loses to throws and jumps.',
    special: Object.freeze({
      name: 'Barge Through',
      purpose: 'Armored shoulder charge that plows through pokes and jab pressure.',
      counterplay: 'Jump over it, or throw him — armor does not beat throws.',
    }),
    idle: Object.freeze({
      clip: 'jonah:idle',
      note: 'Heavy sway, low guard — a bar-room bouncer daring you closer.',
      timeScale: 0.88,
      swayAmp: 0.03,
      swayFreq: 1.4,
    }),
    taunt: Object.freeze({
      clip: 'jonah:taunt',
      flavor: 'Throat-slash gesture, slow and deliberate.',
      frames: 135,
      meterReward: 8,
    }),
  }),
  rochelle: Object.freeze({
    archetype: 'Spacing specialist — controls the ground in front of her.',
    range: 'Long mid',
    motif: 'Green arcs',
    weakness: 'Her best tools lose to a well-timed jump-in.',
    special: Object.freeze({
      name: 'Low Tide Sweep',
      purpose: 'Long-range low sweep that ends in a knockdown and sets up okizeme.',
      counterplay: 'Jump it — the 11f startup telegraphs the low.',
    }),
    idle: Object.freeze({
      clip: 'rochelle:idle',
      note: 'Side-to-side step, loose shoulders — a fencer measuring distance.',
      timeScale: 1.05,
      swayAmp: 0.022,
      swayFreq: 1.8,
    }),
    taunt: Object.freeze({
      clip: 'rochelle:taunt',
      flavor: 'Dusting her shoulder off, utterly unimpressed.',
      frames: 135,
      meterReward: 8,
    }),
  }),
  vickie: Object.freeze({
    archetype: 'Guard cracker — breaks turtles with slow, heavy overheads.',
    range: 'Close-mid',
    motif: 'Violet impact rings',
    weakness: 'Long startups can be interrupted; whiffs are very punishable.',
    special: Object.freeze({
      name: 'Overhead Crush',
      purpose: 'Slow overhead smash that dents guard health and discourages holding block.',
      counterplay: 'Interrupt the 18f startup, or backdash the arc.',
    }),
    idle: Object.freeze({
      clip: 'vickie:idle',
      note: 'Coiled crouch, slow breath — a cat about to pounce.',
      timeScale: 0.92,
      swayAmp: 0.015,
      swayFreq: 1.6,
    }),
    taunt: Object.freeze({
      clip: 'vickie:taunt',
      flavor: 'Slow clap, one beat at a time.',
      frames: 135,
      meterReward: 8,
    }),
  }),
  donald: Object.freeze({
    archetype: 'Whiff punisher — lets you swing first, makes you regret it.',
    range: 'Long',
    motif: 'Gold flash',
    weakness: 'Commitment-heavy; a blocked dropkick is a free punish.',
    special: Object.freeze({
      name: 'Flying Dropkick',
      purpose: 'Lunging drop kick that covers ground fast to punish whiffed buttons.',
      counterplay: 'Block it and punish the long landing recovery.',
    }),
    idle: Object.freeze({
      clip: 'donald:idle',
      note: 'Swaggering rock, chin high — showmanship as a stance.',
      timeScale: 0.95,
      swayAmp: 0.026,
      swayFreq: 1.5,
    }),
    taunt: Object.freeze({
      clip: 'donald:taunt',
      flavor: 'Arms spread wide — the whole stage is his.',
      frames: 135,
      meterReward: 8,
    }),
  }),
  eric: Object.freeze({
    archetype: 'Pressure fighter — the fastest special on the roster, up close.',
    range: 'Close',
    motif: 'Ember sparks',
    weakness: 'Stubby range; keep him out and his best tool whiffs.',
    special: Object.freeze({
      name: 'Haymaker Hook',
      purpose: '6f close-range hook for frame traps and scramble situations.',
      counterplay: 'Outrange it — it is the shortest special in the game.',
    }),
    idle: Object.freeze({
      clip: 'eric:idle',
      note: 'Tight, twitchy guard — a street fighter conserving motion.',
      timeScale: 1.2,
      swayAmp: 0.014,
      swayFreq: 2.6,
    }),
    taunt: Object.freeze({
      clip: 'eric:taunt',
      flavor: 'Chest thump, twice — bring it.',
      frames: 135,
      meterReward: 8,
    }),
  }),
  kristen: Object.freeze({
    archetype: 'Anti-air specialist — owns the sky above her.',
    range: 'Mid, vertical',
    motif: 'Teal ribbons',
    weakness: 'Grounded foes outside her vertical lane can bait and punish.',
    special: Object.freeze({
      name: 'Rising Crescent',
      purpose: 'Rising flip kick that answers jump-ins cleanly.',
      counterplay: 'Stay grounded, bait it, punish the 28f recovery.',
    }),
    idle: Object.freeze({
      clip: 'kristen:idle',
      note: 'Constant bounce, light on her toes — a kickboxer who never sits still.',
      timeScale: 1.3,
      swayAmp: 0.02,
      swayFreq: 2.8,
    }),
    taunt: Object.freeze({
      clip: 'kristen:taunt',
      flavor: 'Finger wag — not today.',
      frames: 135,
      meterReward: 8,
    }),
  }),
});

export const ROSTER_IDS = Object.freeze(Object.keys(FIGHTER_IDENTITY));

// Content gate: a fighter does not enter the selectable roster until the
// three mandatory unique elements are complete. Returns a list of issue
// strings; empty means the gate passes.
export function validateFighterIdentity(characters) {
  const issues = [];
  const seenSpecialIds = new Map();
  const seenSpecialAnims = new Map();
  const seenIdleClips = new Map();
  const seenTauntClips = new Map();

  for (const id of ROSTER_IDS) {
    const identity = FIGHTER_IDENTITY[id];
    const character = characters?.[id];
    if (!identity) { issues.push(`${id}: missing identity entry`); continue; }
    if (!character) { issues.push(`${id}: missing CHARACTERS entry`); continue; }

    const special = FIGHTER_SPECIALS[id];
    if (!special) {
      issues.push(`${id}: no unique special in FIGHTER_SPECIALS`);
    } else {
      if (seenSpecialIds.has(special.id)) issues.push(`${id}: special id ${special.id} duplicated by ${seenSpecialIds.get(special.id)}`);
      else seenSpecialIds.set(special.id, id);
      if (seenSpecialAnims.has(special.animation)) issues.push(`${id}: special animation ${special.animation} duplicated by ${seenSpecialAnims.get(special.animation)}`);
      else seenSpecialAnims.set(special.animation, id);
      if (!special.meterCost) issues.push(`${id}: special missing meter cost`);
    }

    const idleClip = `${id}:idle`;
    if (!character.animations?.idle) {
      issues.push(`${id}: no idle clip wired`);
    } else if (seenIdleClips.has(character.animations.idle)) {
      issues.push(`${id}: idle clip shared with ${seenIdleClips.get(character.animations.idle)}`);
    } else {
      seenIdleClips.set(character.animations.idle, id);
    }
    if (identity.idle.clip !== idleClip) {
      issues.push(`${id}: identity idle clip ${identity.idle.clip} does not match wired manifest key ${idleClip}`);
    }

    const tauntMove = getTauntMove(id);
    if (!tauntMove) {
      issues.push(`${id}: no taunt move`);
    } else if (!character.animations?.taunt) {
      issues.push(`${id}: no taunt clip wired`);
    } else if (seenTauntClips.has(character.animations.taunt)) {
      issues.push(`${id}: taunt clip shared with ${seenTauntClips.get(character.animations.taunt)}`);
    } else {
      seenTauntClips.set(character.animations.taunt, id);
    }
  }
  return issues;
}
