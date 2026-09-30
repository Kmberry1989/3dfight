// Simulation event log (Phase 0).
//
// The combat simulation decides gameplay and emits events; presentation
// (particles, audio, camera, HUD) subscribes to those events. The sim never
// calls presentation code directly, and presentation never mutates sim state.
export const COMBAT_EVENT = Object.freeze({
    HIT: 'Hit',
    BLOCK: 'Block',
    GUARD_BREAK: 'GuardBreak',
    THROW: 'Throw',
    KO: 'KO',
});

const listeners = new Set();

export function onCombatEvent(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

export function emitCombatEvent(event) {
    listeners.forEach((fn) => {
        try {
            fn(event);
        } catch (err) {
            console.error('[combat-events]', err);
        }
    });
}

export function clearCombatEventListeners() {
    listeners.clear();
}

export function listenerCount() {
    return listeners.size;
}
