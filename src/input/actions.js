// Action-based input layer (Phase 0).
//
// Every input device (keyboard, touch, and later gamepad) speaks the same
// vocabulary of named actions. Combat code reads actions, never raw key
// codes. This also makes online packets compact and replayable: a frame of
// input is a held-action bitmask plus the discrete actions pressed since the
// previous simulation frame.

// Canonical action names.
export const ACTION = Object.freeze({
    MOVE_LEFT: 'MoveLeft',
    MOVE_RIGHT: 'MoveRight',
    JUMP: 'Jump',
    BLOCK: 'Block',
    PUNCH: 'Punch',
    KICK: 'Kick',
    SPECIAL: 'Special',
    THROW: 'Throw',
    TAUNT: 'Taunt',
    DASH: 'Dash',
    PAUSE: 'Pause',
});

export const ACTION_BY_NAME = Object.freeze(
    Object.fromEntries(Object.values(ACTION).map((name) => [name, name]))
);

// Actions that stay active while the control is held.
export const HELD_ACTIONS = new Set([ACTION.MOVE_LEFT, ACTION.MOVE_RIGHT, ACTION.JUMP, ACTION.BLOCK]);

// Actions that fire once per press and resolve into a combat move.
export const ATTACK_ACTIONS = new Set([ACTION.PUNCH, ACTION.KICK, ACTION.SPECIAL, ACTION.THROW]);

// Action -> combat move type used by queueCombatInput.
export const ACTION_ATTACK_TYPE = Object.freeze({
    [ACTION.PUNCH]: 'punch',
    [ACTION.KICK]: 'kick',
    [ACTION.SPECIAL]: 'special',
    [ACTION.THROW]: 'throw',
});

// Default keyboard bindings: player id -> key code -> action name.
// Player 1: WASD + Space/Shift/C/E. Player 2: arrows + P/O/I/U.
export const KEYBOARD_BINDINGS = Object.freeze({
    1: Object.freeze({
        KeyA: ACTION.MOVE_LEFT,
        KeyD: ACTION.MOVE_RIGHT,
        KeyW: ACTION.JUMP,
        KeyS: ACTION.BLOCK,
        Space: ACTION.PUNCH,
        ShiftLeft: ACTION.KICK,
        KeyC: ACTION.SPECIAL,
        KeyE: ACTION.THROW,
        KeyT: ACTION.TAUNT,
        Escape: ACTION.PAUSE,
    }),
    2: Object.freeze({
        ArrowLeft: ACTION.MOVE_LEFT,
        ArrowRight: ACTION.MOVE_RIGHT,
        ArrowUp: ACTION.JUMP,
        ArrowDown: ACTION.BLOCK,
        KeyP: ACTION.PUNCH,
        KeyO: ACTION.KICK,
        KeyI: ACTION.SPECIAL,
        KeyU: ACTION.THROW,
        KeyY: ACTION.TAUNT,
        Escape: ACTION.PAUSE,
    }),
});

export function keyCodeToAction(playerId, code) {
    const bindings = KEYBOARD_BINDINGS[playerId];
    return bindings ? bindings[code] || null : null;
}

// Reverse lookup: which (player, key) pairs produce this action. Used to
// keep the online wire format backward compatible with peers that still
// send raw key codes.
export function findKeyBinding(actionName) {
    for (const playerId of [1, 2]) {
        const bindings = KEYBOARD_BINDINGS[playerId];
        for (const code of Object.keys(bindings)) {
            if (bindings[code] === actionName) return { playerId, code };
        }
    }
    return null;
}

// Bit positions for the held-action bitmask (replay recording / netcode).
export const ACTION_BIT_INDEX = Object.freeze({
    [ACTION.MOVE_LEFT]: 0,
    [ACTION.MOVE_RIGHT]: 1,
    [ACTION.JUMP]: 2,
    [ACTION.BLOCK]: 3,
    [ACTION.PUNCH]: 4,
    [ACTION.KICK]: 5,
    [ACTION.SPECIAL]: 6,
    [ACTION.THROW]: 7,
    [ACTION.DASH]: 8,
    [ACTION.PAUSE]: 9,
    // Taunt sits at bit 10: old peers simply ignore the unknown bit, and the
    // action-name wire path resolves it by name, so this stays compatible.
    [ACTION.TAUNT]: 10,
});

// Per-player action state: currently held actions plus the discrete actions
// pressed since the last simulation frame (in order).
export function createActionState() {
    return { held: new Set(), pressed: [] };
}

export function pressAction(state, action, data = null) {
    if (!state || !action) return;
    if (HELD_ACTIONS.has(action)) state.held.add(action);
    state.pressed.push({ action, data });
}

export function releaseAction(state, action) {
    if (!state || !action) return;
    state.held.delete(action);
}

export function setActionHeld(state, action, held) {
    if (!state || !action) return;
    if (held) state.held.add(action);
    else state.held.delete(action);
}

export function isActionHeld(state, action) {
    return !!state && state.held.has(action);
}

export function clearActionState(state) {
    if (!state) return;
    state.held.clear();
    state.pressed.length = 0;
}

// Drain the pressed list (the recorder calls this once per sim frame).
export function drainPressedActions(state) {
    if (!state) return [];
    const events = state.pressed.slice();
    state.pressed.length = 0;
    return events;
}

export function heldActionBitmask(state) {
    if (!state) return 0;
    let mask = 0;
    state.held.forEach((action) => {
        const bit = ACTION_BIT_INDEX[action];
        if (bit !== undefined) mask |= 1 << bit;
    });
    return mask;
}

export function applyActionBitmask(state, mask) {
    if (!state) return;
    state.held.clear();
    for (const [action, bit] of Object.entries(ACTION_BIT_INDEX)) {
        if (mask & (1 << bit)) state.held.add(action);
    }
}

export function bitmaskToActionNames(mask) {
    const names = [];
    for (const [action, bit] of Object.entries(ACTION_BIT_INDEX)) {
        if (mask & (1 << bit)) names.push(action);
    }
    return names;
}
