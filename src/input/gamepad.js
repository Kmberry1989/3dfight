// Bluetooth controller support (PS4 DualShock 4 and other standard pads).
//
// Polls the Gamepad API once per animation frame and translates it into the
// same action vocabulary the keyboard and touch zones speak: press on the
// rising edge, release on the falling edge. Assumes the standard mapping
// (pad.mapping === 'standard'), which is what PS4 controllers report over
// Bluetooth on iOS, macOS, and desktop browsers.
//
// The host (main.js) supplies the context each poll: which player the pad
// drives, the control scheme, whether combat input is live, and the
// press/release/togglePause bridges into the action system.

import { ACTION } from './actions.js';

const AXIS_DEADZONE = 0.35;
const PAUSE_BUTTON = 9; // Options

// D-pad button indices under the standard mapping.
const DPAD = { up: 12, down: 13, left: 14, right: 15 };

// Button index -> action resolver (some depend on the control scheme).
// Cross = jump, Square = punch/strike, Triangle = kick/strike,
// Circle = special, shoulders = block, R2 = throw (classic) / block (focus),
// Share = taunt.
const BUTTON_ACTIONS = {
    0: () => ACTION.JUMP,
    1: () => ACTION.SPECIAL,
    2: (focus) => (focus ? ACTION.STRIKE : ACTION.PUNCH),
    3: (focus) => (focus ? ACTION.STRIKE : ACTION.KICK),
    4: () => ACTION.BLOCK,
    5: () => ACTION.BLOCK,
    6: () => ACTION.BLOCK,
    7: (focus) => (focus ? ACTION.BLOCK : ACTION.THROW),
    8: () => ACTION.TAUNT,
};

let prevHeld = new Set();
let prevPauseDown = false;
let statusCallback = null;

function findPad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    let fallback = null;
    for (const pad of pads) {
        if (!pad || !pad.connected) continue;
        // Prefer a DualShock-style controller when several are attached.
        if (/dualshock|wireless controller/i.test(pad.id || '')) return pad;
        if (!fallback) fallback = pad;
    }
    return fallback;
}

function buttonDown(pad, index) {
    const b = pad.buttons && pad.buttons[index];
    return !!b && (b.pressed || b.value > 0.5);
}

function releaseAll(prev, ctx) {
    for (const action of prev) ctx.release(ctx.playerId, action);
}

// ctx: {
//   playerId, isFocusScheme,
//   combatActive: feed combat actions (game running, not paused),
//   pauseToggleActive: allow the Options button to toggle pause,
//   press(playerId, action), release(playerId, action), togglePause(),
// }
export function pollGamepad(ctx) {
    const pad = findPad();
    if (statusCallback) statusCallback(pad);

    if (!pad) {
        if (prevHeld.size) {
            releaseAll(prevHeld, ctx);
            prevHeld = new Set();
        }
        prevPauseDown = false;
        return;
    }

    // Options toggles pause whenever a game is up (pausing and unpausing).
    const pauseDown = buttonDown(pad, PAUSE_BUTTON);
    if (pauseDown && !prevPauseDown && ctx.pauseToggleActive) ctx.togglePause();
    prevPauseDown = pauseDown;

    // Held set this frame: d-pad + left stick movement, plus every mapped
    // face/shoulder button currently down. Collapsing to a set means block
    // held two ways still presses/releases exactly once.
    const held = new Set();
    if (ctx.combatActive) {
        const ax = pad.axes[0] || 0;
        const ay = pad.axes[1] || 0;
        if (ax < -AXIS_DEADZONE || buttonDown(pad, DPAD.left)) held.add(ACTION.MOVE_LEFT);
        if (ax > AXIS_DEADZONE || buttonDown(pad, DPAD.right)) held.add(ACTION.MOVE_RIGHT);
        if (ay < -AXIS_DEADZONE || buttonDown(pad, DPAD.up)) held.add(ACTION.JUMP);
        if (ay > AXIS_DEADZONE || buttonDown(pad, DPAD.down)) held.add(ACTION.BLOCK);
        for (const [index, toAction] of Object.entries(BUTTON_ACTIONS)) {
            if (buttonDown(pad, Number(index))) held.add(toAction(ctx.isFocusScheme));
        }
    }

    // Rising edge -> press (this is also what arms double-tap dash on the
    // d-pad), falling edge -> release.
    for (const action of held) {
        if (!prevHeld.has(action)) ctx.press(ctx.playerId, action);
    }
    for (const action of prevHeld) {
        if (!held.has(action)) ctx.release(ctx.playerId, action);
    }
    prevHeld = held;
}

// onStatus(pad|null): called on connect/disconnect and every poll so the
// host can show or hide its controller indicator.
export function initGamepad(onStatus) {
    statusCallback = typeof onStatus === 'function' ? onStatus : null;
    const notify = () => {
        if (statusCallback) statusCallback(findPad());
    };
    window.addEventListener('gamepadconnected', notify);
    window.addEventListener('gamepaddisconnected', () => {
        if (statusCallback) statusCallback(null);
    });
    notify();
}
