// Focus Controls move kits (one per selectable fighter).
//
// Each fighter owns five focus finishers with a unique name, frame data,
// animation, playback rate, and VFX motif:
//   rush / sky / earth  — the three tempo routes (perfect-beat Strike taps)
//   charge1 / charge2   — the two charged-strike levels (hold Strike)
//
// Move objects match the frameData `move()` shape so they flow through the
// standard combat pipeline untouched: getMove -> getAttackDefinition ->
// startCombatMove -> checkHits.

export const FOCUS_MOVE_TYPES = Object.freeze([
  'focusRush', 'focusSky', 'focusEarth', 'focusCharge1', 'focusCharge2',
]);

export const FOCUS_TYPE_TO_KIND = Object.freeze({
  focusRush: 'rush',
  focusSky: 'sky',
  focusEarth: 'earth',
  focusCharge1: 'charge1',
  focusCharge2: 'charge2',
});

// Timing constants (60 fps frames).
export const TEMPO_WINDOW = 20;      // frames after a clean hit to tap Strike
export const TEMPO_PERFECT_LO = 7;   // perfect-zone start (gold ring)
export const TEMPO_PERFECT_HI = 13;  // perfect-zone end
export const STRIKE_TAP_FRAMES = 7;  // tap-vs-hold decision window
export const CHARGE_LEVEL_1 = 25;    // ~0.4s hold
export const CHARGE_LEVEL_2 = 55;    // ~0.9s hold
export const FOCUS_THROW_RANGE = 1.35;

const defineFocusMove = (id, animation, limb, startup, active, recovery, values = {}) => ({
  id, animation, limb, startup, active, recovery,
  cancelWindow: [Math.max(1, startup + active - 1), startup + active + Math.max(1, Math.floor(recovery * 0.45))],
  damage: 5, blockDamage: 1, hitstun: 14, blockstun: 8, hitstop: 4,
  pushback: 0.24, blockPushback: 0.16, lunge: 0.05, meterGain: 8,
  hitbox: { width: 0.34, height: 0.30, depth: 0.34 },
  timeScale: 1,
  noTempo: true, // focus finishers never reopen the tempo window
  ...values
});

const entry = (name, move) => ({ name, move });

export const FOCUS_KITS = Object.freeze({
  // Kyle — balanced rushdown. Cyan streaks.
  kyle: Object.freeze({
    motif: Object.freeze([0x00f0ff, 0xffffff, 0x80ffff]),
    rush: entry('Cyclone Rush', defineFocusMove('focus-kyle-rush', 'punchMedium', 'hand', 6, 4, 20,
      { timeScale: 1.7, damage: 14, hitstun: 22, blockstun: 12, hitstop: 8, pushback: .5, lunge: .18, meterGain: 10 })),
    sky: entry('Rising Heel', defineFocusMove('focus-kyle-sky', 'flipKick', 'foot', 10, 6, 26,
      { timeScale: 1.2, damage: 15, hitstun: 34, blockstun: 15, hitstop: 10, pushback: .8, lunge: .12, meterGain: 10, hitbox: { width: .46, height: .5, depth: .46 } })),
    earth: entry('Tremor Sweep', defineFocusMove('focus-kyle-earth', 'sweepKick', 'foot', 12, 5, 28,
      { timeScale: 1.1, damage: 16, hitstun: 30, blockstun: 14, hitstop: 12, pushback: .9, lunge: .14, meterGain: 10, hitbox: { width: .6, height: .32, depth: .5 } })),
    charge1: entry('Haymaker Rush', defineFocusMove('focus-kyle-charge1', 'haymaker', 'hand', 14, 4, 30,
      { damage: 16, hitstun: 32, blockstun: 16, hitstop: 12, pushback: 1.0, lunge: .3, armor: 1, meterGain: 10, hitbox: { width: .5, height: .45, depth: .5 } })),
    charge2: entry('Titan Blow', defineFocusMove('focus-kyle-charge2', 'lungePunchHeavy', 'hand', 18, 5, 34,
      { damage: 22, hitstun: 40, blockstun: 20, hitstop: 16, pushback: 1.2, blockPushback: .7, lunge: .34, armor: 2, meterGain: 12, hitbox: { width: .56, height: .5, depth: .56 } })),
  }),
  // Jonah — armored brawler. Magenta shockwave.
  jonah: Object.freeze({
    motif: Object.freeze([0xff2e63, 0xffffff, 0xff9db4]),
    rush: entry('Brawler Flurry', defineFocusMove('focus-jonah-rush', 'punchHeavy', 'hand', 8, 4, 22,
      { timeScale: 1.4, damage: 15, hitstun: 24, blockstun: 12, hitstop: 8, pushback: .55, lunge: .15, meterGain: 10 })),
    sky: entry('Sky Barge', defineFocusMove('focus-jonah-sky', 'frontTwistFlip', 'torso', 12, 6, 28,
      { timeScale: 1.1, damage: 16, hitstun: 34, blockstun: 15, hitstop: 10, pushback: .85, lunge: .16, meterGain: 10, hitbox: { width: .55, height: .55, depth: .55 } })),
    earth: entry('Seismic Slam', defineFocusMove('focus-jonah-earth', 'overheadSmash', 'hand', 14, 4, 30,
      { damage: 17, hitstun: 32, blockstun: 15, hitstop: 12, pushback: .95, lunge: .12, meterGain: 10, hitbox: { width: .58, height: .5, depth: .55 } })),
    charge1: entry('Rush Hour', defineFocusMove('focus-jonah-charge1', 'lungePunchHeavy', 'hand', 14, 4, 30,
      { timeScale: 1.1, damage: 16, hitstun: 32, blockstun: 16, hitstop: 12, pushback: 1.0, lunge: .3, armor: 1, meterGain: 10 })),
    charge2: entry('Wrecking Ball', defineFocusMove('focus-jonah-charge2', 'spinFlipKick', 'foot', 18, 6, 34,
      { damage: 22, hitstun: 40, blockstun: 20, hitstop: 16, pushback: 1.25, blockPushback: .7, lunge: .3, armor: 2, meterGain: 12, hitbox: { width: .6, height: .55, depth: .6 } })),
  }),
  // Rochelle — spacing specialist. Green arcs.
  rochelle: Object.freeze({
    motif: Object.freeze([0x00ff87, 0xffffff, 0xa8ffc9]),
    rush: entry('Thorn Flurry', defineFocusMove('focus-rochelle-rush', 'kickMedium', 'foot', 6, 4, 20,
      { timeScale: 1.7, damage: 14, hitstun: 22, blockstun: 12, hitstop: 8, pushback: .5, lunge: .2, meterGain: 10, hitbox: { width: .46, height: .38, depth: .46 } })),
    sky: entry('High Tide', defineFocusMove('focus-rochelle-sky', 'flipKick', 'foot', 9, 6, 24,
      { timeScale: 1.3, damage: 15, hitstun: 34, blockstun: 15, hitstop: 10, pushback: .8, lunge: .14, meterGain: 10, hitbox: { width: .46, height: .5, depth: .46 } })),
    earth: entry('Rip Current', defineFocusMove('focus-rochelle-earth', 'dropKick', 'foot', 12, 5, 28,
      { damage: 16, hitstun: 30, blockstun: 14, hitstop: 12, pushback: .9, lunge: .16, meterGain: 10, hitbox: { width: .6, height: .45, depth: .55 } })),
    charge1: entry('Longshot', defineFocusMove('focus-rochelle-charge1', 'lungePunchHeavy', 'hand', 13, 4, 28,
      { damage: 15, hitstun: 30, blockstun: 15, hitstop: 12, pushback: .95, lunge: .38, armor: 1, meterGain: 10 })),
    charge2: entry('Tsunami Kick', defineFocusMove('focus-rochelle-charge2', 'dropKick', 'foot', 17, 6, 32,
      { timeScale: 0.9, damage: 21, hitstun: 38, blockstun: 18, hitstop: 16, pushback: 1.2, blockPushback: .7, lunge: .34, armor: 2, meterGain: 12, hitbox: { width: .6, height: .45, depth: .55 } })),
  }),
  // Vickie — guard cracker. Violet impact rings.
  vickie: Object.freeze({
    motif: Object.freeze([0xff00ff, 0xffffff, 0xffa8ff]),
    rush: entry('Cat Scratch', defineFocusMove('focus-vickie-rush', 'punchMedium', 'hand', 5, 4, 18,
      { timeScale: 1.8, damage: 13, hitstun: 20, blockstun: 11, hitstop: 8, pushback: .45, lunge: .16, meterGain: 10 })),
    sky: entry('Pounce', defineFocusMove('focus-vickie-sky', 'frontTwistFlip', 'torso', 10, 6, 26,
      { timeScale: 1.2, damage: 15, hitstun: 34, blockstun: 15, hitstop: 10, pushback: .8, lunge: .15, meterGain: 10, hitbox: { width: .52, height: .52, depth: .52 } })),
    earth: entry('Burial', defineFocusMove('focus-vickie-earth', 'dropKick', 'foot', 13, 5, 28,
      { damage: 16, hitstun: 30, blockstun: 14, hitstop: 12, pushback: .9, lunge: .13, meterGain: 10, hitbox: { width: .6, height: .45, depth: .55 } })),
    charge1: entry('Crushing Blow', defineFocusMove('focus-vickie-charge1', 'haymaker', 'hand', 15, 4, 30,
      { timeScale: 0.95, damage: 17, hitstun: 34, blockstun: 17, hitstop: 14, pushback: 1.05, lunge: .2, armor: 1, meterGain: 10, hitbox: { width: .5, height: .45, depth: .5 } })),
    charge2: entry('Extinction', defineFocusMove('focus-vickie-charge2', 'lungePunchHeavy', 'hand', 19, 5, 36,
      { timeScale: 0.9, damage: 23, hitstun: 42, blockstun: 20, hitstop: 16, pushback: 1.3, blockPushback: .75, lunge: .3, armor: 2, meterGain: 12 })),
  }),
  // Donald — whiff punisher. Gold flash.
  donald: Object.freeze({
    motif: Object.freeze([0xffd44d, 0xffffff, 0xfff0b8]),
    rush: entry('Showtime Flurry', defineFocusMove('focus-donald-rush', 'kickMedium', 'foot', 6, 4, 20,
      { timeScale: 1.6, damage: 14, hitstun: 22, blockstun: 12, hitstop: 8, pushback: .5, lunge: .18, meterGain: 10, hitbox: { width: .46, height: .38, depth: .46 } })),
    sky: entry('Encore Kick', defineFocusMove('focus-donald-sky', 'backflip', 'foot', 10, 6, 26,
      { timeScale: 1.1, damage: 15, hitstun: 34, blockstun: 15, hitstop: 10, pushback: .8, lunge: .13, meterGain: 10, hitbox: { width: .46, height: .5, depth: .46 } })),
    earth: entry('Curtain Call', defineFocusMove('focus-donald-earth', 'sweepKick', 'foot', 12, 5, 28,
      { damage: 16, hitstun: 30, blockstun: 14, hitstop: 12, pushback: .9, lunge: .15, meterGain: 10, hitbox: { width: .6, height: .32, depth: .5 } })),
    charge1: entry('Spotlight Lunge', defineFocusMove('focus-donald-charge1', 'lungePunchHeavy', 'hand', 13, 4, 28,
      { timeScale: 1.05, damage: 16, hitstun: 32, blockstun: 16, hitstop: 12, pushback: 1.0, lunge: .3, armor: 1, meterGain: 10 })),
    charge2: entry('Standing Ovation', defineFocusMove('focus-donald-charge2', 'spinFlipKick', 'foot', 17, 6, 32,
      { timeScale: 0.95, damage: 22, hitstun: 40, blockstun: 20, hitstop: 16, pushback: 1.25, blockPushback: .7, lunge: .32, armor: 2, meterGain: 12, hitbox: { width: .6, height: .55, depth: .6 } })),
  }),
  // Eric — pressure fighter. Ember sparks.
  eric: Object.freeze({
    motif: Object.freeze([0xff8c00, 0xffe000, 0xffffff]),
    rush: entry('Ember Flurry', defineFocusMove('focus-eric-rush', 'punchLight', 'hand', 5, 3, 18,
      { timeScale: 1.9, damage: 13, hitstun: 20, blockstun: 11, hitstop: 8, pushback: .45, lunge: .15, meterGain: 10 })),
    sky: entry('Spark Kick', defineFocusMove('focus-eric-sky', 'flipKick', 'foot', 8, 5, 24,
      { timeScale: 1.35, damage: 14, hitstun: 32, blockstun: 14, hitstop: 10, pushback: .75, lunge: .14, meterGain: 10, hitbox: { width: .46, height: .5, depth: .46 } })),
    earth: entry('Ash Fall', defineFocusMove('focus-eric-earth', 'sweepKick', 'foot', 11, 5, 26,
      { timeScale: 1.15, damage: 15, hitstun: 28, blockstun: 13, hitstop: 12, pushback: .85, lunge: .14, meterGain: 10, hitbox: { width: .6, height: .32, depth: .5 } })),
    charge1: entry('Sucker Punch', defineFocusMove('focus-eric-charge1', 'punchHeavy', 'hand', 13, 4, 28,
      { damage: 16, hitstun: 32, blockstun: 16, hitstop: 12, pushback: 1.0, lunge: .22, armor: 1, meterGain: 10 })),
    charge2: entry('Inferno Rush', defineFocusMove('focus-eric-charge2', 'lungePunchHeavy', 'hand', 16, 5, 32,
      { timeScale: 0.95, damage: 21, hitstun: 38, blockstun: 18, hitstop: 16, pushback: 1.2, blockPushback: .7, lunge: .34, armor: 2, meterGain: 12 })),
  }),
  // Kristen — anti-air specialist. Teal ribbons.
  kristen: Object.freeze({
    motif: Object.freeze([0x00ffcc, 0xffffff, 0xa8fff0]),
    rush: entry('Ribbon Flurry', defineFocusMove('focus-kristen-rush', 'kickLight', 'foot', 5, 3, 18,
      { timeScale: 1.9, damage: 13, hitstun: 20, blockstun: 11, hitstop: 8, pushback: .45, lunge: .16, meterGain: 10, hitbox: { width: .42, height: .35, depth: .42 } })),
    sky: entry('Moonrise', defineFocusMove('focus-kristen-sky', 'frontTwistFlip', 'torso', 9, 6, 24,
      { timeScale: 1.25, damage: 15, hitstun: 34, blockstun: 15, hitstop: 10, pushback: .8, lunge: .14, meterGain: 10, hitbox: { width: .52, height: .55, depth: .52 } })),
    earth: entry('Low Ribbon', defineFocusMove('focus-kristen-earth', 'sweepKick', 'foot', 11, 5, 26,
      { timeScale: 1.2, damage: 15, hitstun: 28, blockstun: 13, hitstop: 12, pushback: .85, lunge: .15, meterGain: 10, hitbox: { width: .6, height: .32, depth: .5 } })),
    charge1: entry('Comet Kick', defineFocusMove('focus-kristen-charge1', 'dropKick', 'foot', 13, 5, 28,
      { damage: 16, hitstun: 32, blockstun: 16, hitstop: 12, pushback: 1.0, lunge: .26, armor: 1, meterGain: 10, hitbox: { width: .6, height: .45, depth: .55 } })),
    charge2: entry('Supernova', defineFocusMove('focus-kristen-charge2', 'spinFlipKick', 'foot', 17, 6, 32,
      { timeScale: 0.9, damage: 22, hitstun: 40, blockstun: 20, hitstop: 16, pushback: 1.25, blockPushback: .7, lunge: .3, armor: 2, meterGain: 12, hitbox: { width: .6, height: .55, depth: .6 } })),
  }),
});

export function getFocusKit(fighterId) {
  return FOCUS_KITS[fighterId] || FOCUS_KITS.kyle;
}

export function getFocusMove(fighterId, kind) {
  const kit = getFocusKit(fighterId);
  const found = kit[kind];
  return found ? found.move : null;
}

export function getFocusMoveType(fighterId, moveType) {
  const kind = FOCUS_TYPE_TO_KIND[moveType];
  return kind ? getFocusMove(fighterId, kind) : null;
}

export function getFocusMoveName(fighterId, kind) {
  const kit = getFocusKit(fighterId);
  return kit[kind] ? kit[kind].name : kind;
}

export function getFocusMotif(fighterId) {
  return getFocusKit(fighterId).motif;
}

// Contextual strike resolution: which basic attack a tap-Strike becomes.
// Pure function of sim state so live play, replays, and peers agree.
export function resolveFocusStrike({ distance, towardHeld, airborne }) {
  if (!airborne && distance <= FOCUS_THROW_RANGE) return { type: 'throw', chain: 0 };
  if (airborne) return { type: 'kick', chain: 1 };
  if (towardHeld) return { type: 'kick', chain: 2 };
  return { type: 'punch', chain: -1 }; // -1: use the fighter's own focus chain cycle
}

// Tempo route selection from held direction at perfect-beat press time.
export function selectTempoRoute({ towardHeld, awayHeld }) {
  if (towardHeld) return 'focusSky';
  if (awayHeld) return 'focusEarth';
  return 'focusRush';
}
