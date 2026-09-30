// Lightweight performance counters (Phase 0).
// Exposed through a debug overlay toggled with the Backquote key.

const stats = {
    simMs: 0,
    renderMs: 0,
    fps: 0,
    particles: 0,
    hitboxChecks: 0,
    simStepsPerSecond: 0,
};

let frameCount = 0;
let fpsWindowStart = performance.now();
let stepsThisWindow = 0;

export function perfBeginSim() {
    return performance.now();
}

export function perfEndSim(startTime, steps = 0) {
    stats.simMs = performance.now() - startTime;
    stepsThisWindow += steps;
}

export function perfNoteHitboxCheck() {
    stats.hitboxChecks++;
}

export function perfNoteRender(renderMs, particleCount) {
    stats.renderMs = renderMs;
    stats.particles = particleCount;
    frameCount++;
    const now = performance.now();
    const elapsed = now - fpsWindowStart;
    if (elapsed >= 500) {
        stats.fps = Math.round((frameCount * 1000) / elapsed);
        stats.simStepsPerSecond = Math.round((stepsThisWindow * 1000) / elapsed);
        frameCount = 0;
        stepsThisWindow = 0;
        stats.hitboxChecks = 0;
        fpsWindowStart = now;
    }
}

export function getPerfStats() {
    return stats;
}

export function formatPerfStats() {
    return (
        `FPS ${stats.fps} | sim ${stats.simMs.toFixed(2)}ms (${stats.simStepsPerSecond} steps/s) | ` +
        `render ${stats.renderMs.toFixed(2)}ms | particles ${stats.particles} | hitbox checks/s ${stats.hitboxChecks}`
    );
}
