// Seeded PRNG for simulation randomness (Phase 0).
//
// Any random choice that can affect a match (AI branches, death animation
// picks, ...) must draw from this stream instead of Math.random(), so that a
// recorded match replays deterministically. Presentation-only randomness
// (particles, audio variants) may keep using Math.random().
// mulberry32: small, fast, deterministic across engines.
let simSeed = 1;
let simState = 1;

export function reseedSim(seed) {
    simSeed = (seed >>> 0) || 1;
    simState = simSeed;
}

export function getSimSeed() {
    return simSeed;
}

export function simRandom() {
    simState |= 0;
    simState = (simState + 0x6D2B79F5) | 0;
    let t = Math.imul(simState ^ (simState >>> 15), simState | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function simRandomInt(min, max) {
    return min + Math.floor(simRandom() * (max - min + 1));
}

export function simPick(list) {
    if (!list || list.length === 0) return null;
    return list[Math.floor(simRandom() * list.length)];
}
