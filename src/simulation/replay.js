// Deterministic replay harness (Phase 0).
//
// Records, per simulation frame, the action inputs each fighter saw plus a
// hash of the resulting sim state. A recording can be played back through the
// same simulation path; the exit gate is that two playbacks of the same
// recording produce the same digest.
//
// The hash covers gameplay state only (positions, health, meter, state
// machine, buffers). Presentation state (particles, audio, camera, anim
// clips) is excluded on purpose.

export function fnv1a(str) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function round2(n) {
    return Math.round(n * 100) / 100;
}

// Canonical per-fighter sim snapshot. Keep this in sync with anything the
// simulation reads when resolving a frame.
export function hashFighterCombat(fighter) {
    const c = fighter.combat;
    if (!c) return `${fighter.id}:no-combat`;
    const move = c.move;
    const parts = [
        fighter.id,
        round2(fighter.mesh.position.x),
        round2(fighter.mesh.position.y),
        fighter.direction,
        fighter.isDead ? 1 : 0,
        Math.round(fighter.health * 1000),
        Math.round(fighter.meter * 1000),
        Math.round(fighter.guardHealth * 1000),
        c.state,
        c.frame,
        c.stateFrame,
        c.simFrame,
        move ? move.id : '-',
        c.chain,
        c.buffer.map((entry) => entry.type).join('+'),
        c.armor,
        Math.round(c.pushVelocity * 1000),
        Math.round(c.motionVelocity * 1000),
        c.dashIFrames,
        fighter.jumps,
    ];
    return parts.join('|');
}

export function hashSimFrame(fighters) {
    return fnv1a(fighters.map(hashFighterCombat).join('~'));
}

export function createReplayRecorder() {
    return {
        active: false,
        seed: 0,
        frames: [],
        start(seed) {
            this.active = true;
            this.seed = seed >>> 0;
            this.frames = [];
        },
        stop() {
            this.active = false;
        },
        // heldMasks: {1: mask, 2: mask}; pressed: {1: [{action, data}], 2: [...]}
        recordFrame(frameIndex, heldMasks, pressed, frameHash) {
            if (!this.active) return;
            this.frames.push({
                i: frameIndex,
                held: { 1: heldMasks[1] || 0, 2: heldMasks[2] || 0 },
                pressed: {
                    1: (pressed[1] || []).map((e) => ({ action: e.action, data: e.data ?? null })),
                    2: (pressed[2] || []).map((e) => ({ action: e.action, data: e.data ?? null })),
                },
                hash: frameHash,
            });
        },
        digest() {
            return fnv1a(this.frames.map((f) => f.hash).join(','));
        },
        frameCount() {
            return this.frames.length;
        },
        toJSON() {
            return JSON.stringify({ seed: this.seed, frames: this.frames });
        },
    };
}

export function loadRecording(json) {
    const data = JSON.parse(json);
    if (!data || !Array.isArray(data.frames)) throw new Error('Invalid replay data');
    return data;
}

// Compare two digests frame-by-frame; returns the first divergent frame
// index, or -1 when the recordings are identical.
export function firstDivergentFrame(framesA, framesB) {
    const n = Math.min(framesA.length, framesB.length);
    for (let i = 0; i < n; i++) {
        if (framesA[i].hash !== framesB[i].hash) return i;
    }
    return framesA.length === framesB.length ? -1 : n;
}
