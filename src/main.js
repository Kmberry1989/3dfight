import './style.css';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import Peer from 'peerjs';
import { FIGHTER_STATE, FRAME_RATE, initializeCombatFighter, queueCombatInput, canAcceptMove, startCombatMove, startCombatDash, changeCombatState, advanceCombatState, applyCombatHit, tickStunState } from './combat/stateMachine.js';
import { FIGHTER_IDENTITY, ROSTER_IDS, validateFighterIdentity } from './combat/fighterIdentity.js';
import { attachCombatHitboxes, updateCombatHitboxes, hideCombatHelpers, attackIntersects } from './combat/hitboxes.js';
import { getMove, ATTACK_ANIMATION_NAMES } from './combat/frameData.js';
import { getStageEntry } from './stages/stageRegistry.js';
import { ACTION, ACTION_BY_NAME, HELD_ACTIONS, ATTACK_ACTIONS, ACTION_ATTACK_TYPE, CONTROL_SCHEME, KEYBOARD_BINDINGS, keyCodeToAction, createActionState, pressAction, releaseAction, setActionHeld, isActionHeld, clearActionState, drainPressedActions, heldActionBitmask, applyActionBitmask, bitmaskToActionNames } from './input/actions.js';
import { initGamepad, pollGamepad } from './input/gamepad.js';
import { FOCUS_MOVE_TYPES, TEMPO_WINDOW, TEMPO_PERFECT_LO, TEMPO_PERFECT_HI, STRIKE_TAP_FRAMES, CHARGE_LEVEL_1, CHARGE_LEVEL_2, FOCUS_THROW_RANGE, getFocusMoveName, getFocusMotif, resolveFocusStrike, selectTempoRoute } from './combat/focusMoves.js';
import { reseedSim, getSimSeed, simRandom, simPick } from './simulation/rng.js';
import { COMBAT_EVENT, onCombatEvent, emitCombatEvent } from './simulation/events.js';
import { fnv1a, hashSimFrame, createReplayRecorder, firstDivergentFrame } from './simulation/replay.js';
import { perfBeginSim, perfEndSim, perfNoteHitboxCheck, perfNoteRender, formatPerfStats } from './debug/perf.js';

// --- 1. SAMPLE-BASED AUDIO ---
const AudioSynth = {
    pools: {},
    manifest: {
        select: ['/audio/gui_selection.ogg', '/audio/gui hover.ogg'],
        swing: ['/audio/swing light.ogg', '/audio/swing light2.ogg', '/audio/swing light3.ogg', '/audio/swing medium.ogg', '/audio/swing heavy.ogg'],
        hit: ['/audio/hit light.ogg', '/audio/hit light2.ogg', '/audio/hit light3.ogg', '/audio/hit medium.ogg', '/audio/hit heavy.ogg', '/audio/hit finish.ogg'],
        block: ['/audio/block hit.ogg'],
        win: ['/audio/hit finish.ogg', '/audio/fall down.ogg']
    },
    makePool(url) {
        if (!this.pools[url]) {
            this.pools[url] = Array.from({ length: 4 }, () => {
                const audio = new Audio(url);
                audio.preload = 'auto';
                return audio;
            });
        }
        return this.pools[url];
    },
    playVariant(variants, { volume = 1, rateMin = 0.96, rateMax = 1.04 } = {}) {
        if (!variants || variants.length === 0) return;
        const url = variants[Math.floor(Math.random() * variants.length)];
        const pool = this.makePool(url);
        const audio = pool.find((entry) => entry.paused || entry.ended) || pool[0];
        audio.pause();
        audio.currentTime = 0;
        audio.volume = Math.min(1, volume * sfxVolume);
        audio.playbackRate = rateMin === rateMax
            ? rateMin
            : rateMin + Math.random() * (rateMax - rateMin);
        audio.play().catch((e) => console.warn('SFX play failed', e));
    },
    playSelect() {
        this.playVariant(this.manifest.select, { volume: 0.7, rateMin: 0.98, rateMax: 1.04 });
    },
    playSwing() {
        this.playVariant(this.manifest.swing, { volume: 0.72, rateMin: 0.92, rateMax: 1.08 });
    },
    playHit() {
        this.playVariant(this.manifest.hit, { volume: 0.8, rateMin: 0.94, rateMax: 1.06 });
    },
    playBlock() {
        this.playVariant(this.manifest.block, { volume: 0.68, rateMin: 0.98, rateMax: 1.02 });
    },
    playWin() {
        this.playVariant(this.manifest.win, { volume: 0.82, rateMin: 1, rateMax: 1 });
    }
};

// --- 2. ASSET MANIFESTS ---
const SHARED_ANIMATIONS = {
    stepForwardShort: '/animations/Short Step Forward.fbx',
    stepForwardLong: '/animations/Long Step Forward.fbx',
    stepBackward: '/animations/Step Backward.fbx',
    punchLight: '/animations/Punch light.fbx',
    punchMedium: '/animations/Punch medium.fbx',
    punchHeavy: '/animations/Punch heavy.fbx',
    kickLight: '/animations/Kicking light.fbx',
    kickMedium: '/animations/Kick medium.fbx',
    kickHeavy: '/animations/Kick heavy.fbx',
    specialLight: '/animations/Spin Flip Kick.fbx',
    specialMedium: '/animations/Leg Sweep.fbx',
    specialHeavy: '/animations/Big Body Blow.fbx',
    // Per-fighter unique special animations (Phase 2 character identity).
    spinFlipKick: '/animations/Spin Flip Kick.fbx',
    sweepKick: '/animations/Leg Sweep.fbx',
    overheadSmash: '/animations/Big Body Blow.fbx',
    flipKick: '/animations/Flip Kick.fbx',
    dropKick: '/animations/Drop Kick.fbx',
    shoulderBarge: '/animations/Flying Shoulder Throw.fbx',
    haymaker: '/animations/Right Hook.fbx',
    // Extra animations wired for the Focus Controls finishers (tempo routes
    // and charged strikes). Loaded once and shared across the roster.
    lungePunchHeavy: '/animations/Lunge Punch heavy.fbx',
    frontTwistFlip: '/animations/Front Twist Flip.fbx',
    backflip: '/animations/Backflip.fbx',
    grabSlam: '/animations/Grab And Slam.fbx',
    block: '/animations/Blocking.fbx',
    hitHighLight: '/animations/Reaction highlight.fbx',
    hitHighMedium: '/animations/Reaction highmedium.fbx',
    hitHighHeavy: '/animations/Reaction highheavy.fbx',
    hitMidLight: '/animations/Reaction midlight.fbx',
    hitMidMedium: '/animations/Reaction midmedium.fbx',
    hitMidHeavy: '/animations/Reaction midheavy.fbx',
    hitLowLight: '/animations/Reaction lowlight.fbx',
    hitLowMedium: '/animations/Reaction lowmedium.fbx',
    hitLowHeavy: '/animations/Reaction lowheavy.fbx',
    deathFall: '/animations/Falling Backwards.fbx',
    deathFlyBack: '/animations/Flying Back Death.fbx',
    deathKnockout: '/animations/Knocked Out.fbx',
    stunned: '/animations/Stunned.fbx',
    dizzy: '/animations/Dizzy Idle.fbx',
    knockdown: '/animations/Getting Hit Backwards.fbx',
    getUp: '/animations/Getting Up.fbx',
    jumpUp: '/animations/Jump.fbx',
    doubleJump: '/animations/Double Jump.fbx',
    jumpDown: '/animations/Jumping Down.fbx',
    // --- Entrance / Prefight shared animations ---
    running: '/animations/Running.fbx',
    runningSlide: '/animations/Running Slide.fbx',
    standingIdleToFightIdle: '/animations/Standing Idle To Fight Idle.fbx'
};

// Keep authored story enemies together. Vite serves `public/` from the site root,
// so the loader converts this source-folder path to the runtime asset URL below.
const ENEMY_FOLDER_PATH = "public/characters/story_enemies/";
const toPublicAssetUrl = (path) => `/${path.replace(/^public\//, '')}`;

const CHARACTERS = {
    kyle: {
        name: 'Kyle',
        path: '/characters/kyle.fbx',
        color: 0x00f0ff,
        animations: {
            idle: '/animations/kyle/Kyle Idle.fbx',
            standingPose: '/animations/kyle/Kyle Standing Pose.fbx',
            intro: '/animations/kyle/Kyle Jumping Down.fbx',
            taunt: '/animations/kyle/Kyle Taunt.fbx',
            victory: '/animations/kyle/Kyle Win.fbx'
        }
    },
    jonah: {
        name: 'Jonah',
        path: '/characters/jonah.fbx',
        color: 0xff2e63,
        animations: {
            idle: '/animations/jonah/Jonah Idle.fbx',
            standingPose: '/animations/jonah/Jonah Standing Pose.fbx',
            intro: '/animations/jonah/Jonah Jumping Down.fbx',
            taunt: '/animations/jonah/Jonah Taunt.fbx',
            victory: '/animations/jonah/Jonah Win.fbx'
        }
    },
    rochelle: {
        name: 'Rochelle',
        path: '/characters/rochelle.fbx',
        color: 0x00ff87,
        animations: {
            idle: '/animations/rochelle/Rochelle Idle.fbx',
            standingPose: '/animations/rochelle/Rochelle Standing Pose.fbx',
            intro: '/animations/rochelle/Rochelle Jumping Down.fbx',
            taunt: '/animations/rochelle/Rochelle Taunt.fbx',
            victory: '/animations/rochelle/Rochelle Win.fbx'
        }
    },
    vickie: {
        name: 'Vickie',
        path: '/characters/vickie.fbx',
        color: 0xff00ff,
        animations: {
            idle: '/animations/vickie/Vickie Idle.fbx',
            standingPose: '/animations/vickie/Vickie Standing Pose.fbx',
            intro: '/animations/vickie/Vickie Jumping Down.fbx',
            taunt: '/animations/vickie/Vickie Taunt.fbx',
            victory: '/animations/vickie/Vickie Win.fbx'
        }
    },
    donald: {
        name: 'Donald',
        path: '/characters/donald.fbx',
        color: 0xffd44d,
        animations: {
            idle: '/animations/donald/Donald Idle.fbx',
            standingPose: '/animations/donald/Donald Standing Pose.fbx',
            intro: '/animations/donald/Donald Jumping Down.fbx',
            taunt: '/animations/donald/Donald Taunt.fbx',
            victory: '/animations/donald/Donald Win.fbx',
            stepForwardShort: '/animations/donald/Donald Short Step Forward.fbx',
            stepForwardLong: '/animations/donald/Donald Long Step Forward.fbx',
            stepBackward: '/animations/donald/Donald Step Backward.fbx'
        }
    },
    eric: {
        name: 'Eric',
        path: '/characters/eric.fbx',
        color: 0xff8c00,
        animations: {
            idle: '/animations/Fighting Idle.fbx',
            standingPose: '/animations/Male Standing Pose (1).fbx',
            intro: '/animations/Front Twist Flip.fbx',
            taunt: '/animations/Standing Taunt Chest Thump.fbx',
            victory: '/animations/Silly Dancing.fbx'
        }
    },
    kristen: {
        name: 'Kristen',
        path: '/characters/kristen.fbx',
        color: 0x00ffcc,
        animations: {
            idle: '/animations/Bouncing Fight Idle.fbx',
            standingPose: '/animations/Female Standing Pose (1).fbx',
            intro: '/animations/Backflip.fbx',
            taunt: '/animations/Threatening.fbx',
            victory: '/animations/Booty Hip Hop Dance.fbx'
        }
    }
};

// Phase 2 content gate: a fighter does not enter the selectable roster until
// the three mandatory unique elements (special, idle stance, taunt) are
// complete. Loud in dev so a regression can never slip through silently.
const identityIssues = validateFighterIdentity(CHARACTERS);
if (identityIssues.length > 0) {
    console.warn('[fighterIdentity] roster gate FAILED:\n' + identityIssues.map((issue) => '  - ' + issue).join('\n'));
} else {
    console.info(`[fighterIdentity] roster gate passed for ${ROSTER_IDS.length} fighters.`);
}

const ENEMIES = {
    thug1: {
        id: 'thug1',
        name: 'South Alley Bruiser',
        path: `${ENEMY_FOLDER_PATH}Slic.fbx`,
        color: 0xf78b54,
        animationProfileId: 'eric',
        stats: { healthMultiplier: 0.95, damageMultiplier: 0.92, guardMultiplier: 0.95 },
        presentation: {
            introText: 'First one through the gate.',
            outroText: 'The alley opens up. Keep moving.'
        }
    },
    thug2: {
        id: 'thug2',
        name: 'Parking Lot Enforcer',
        path: `${ENEMY_FOLDER_PATH}Chic.fbx`,
        color: 0xffd44d,
        animationProfileId: 'donald',
        stats: { healthMultiplier: 1.05, damageMultiplier: 1.02, guardMultiplier: 1.05 },
        presentation: {
            introText: 'Bigger frame. Slower hands. Harder hits.',
            outroText: 'One down. The lot is still crawling.'
        }
    },
    thug3: {
        id: 'thug3',
        name: 'Boardwalk Technician',
        path: `${ENEMY_FOLDER_PATH}Rick.fbx`,
        color: 0x64d6ff,
        animationProfileId: 'jonah',
        stats: { healthMultiplier: 1.08, damageMultiplier: 1.08, guardMultiplier: 1.1 },
        presentation: {
            introText: 'Fast feet, sharp timing.',
            outroText: 'The lights dim. The boss is close.'
        }
    },
    thug4: {
        id: 'thug4',
        name: 'Carousel Boss',
        path: `${ENEMY_FOLDER_PATH}Bric.fbx`,
        color: 0xff4666,
        animationProfileId: 'donald',
        stats: { healthMultiplier: 1.25, damageMultiplier: 1.18, guardMultiplier: 1.2 },
        presentation: {
            introText: 'Final checkpoint. No spectators left.',
            outroText: 'The carousel clears. Chapter complete.'
        }
    }
};

const STORY_CHAPTERS = [
    {
        id: 'chapter-1',
        title: 'Neon Entrance',
        introText: 'Fight through the opening gate and break the first sentry.',
        outroText: 'The first lane is clear.',
        encounters: ['thug1']
    },
    {
        id: 'chapter-2',
        title: 'Concrete Relay',
        introText: 'A second crew rotates in before the dust settles.',
        outroText: 'Two checkpoints down.',
        encounters: ['thug2', 'thug1']
    },
    {
        id: 'chapter-3',
        title: 'Boardwalk Pressure',
        introText: 'Tighter timing. Harder counters.',
        outroText: 'Only the boss route remains.',
        encounters: ['thug3', 'thug2']
    },
    {
        id: 'chapter-4',
        title: 'Carousel Crown',
        introText: 'The boss arrives with one last cleanup squad.',
        outroText: 'Story route cleared.',
        encounters: ['thug4', 'thug3']
    }
];

const MODE = {
    ARCADE_SINGLE: 'arcade_single',
    LOCAL_VERSUS: 'local_versus',
    ONLINE_VERSUS: 'online_versus',
    STORY_SOLO: 'story_solo',
    STORY_COOP_ONLINE: 'story_coop_online',
    TRAINING: 'training'
};

const COMBO_SEQUENCE = ['light', 'medium', 'heavy'];
const COMBO_RESET_DELAY = 0.45;
const FOOT_BONE_KEYWORDS = ['toe_end', 'toebase', 'foot'];
const FOOT_GROUND_OFFSET = 0.025;
const CLOSE_STEP_DISTANCE = 2.9;
const GROUND_Y = 0;
const KNOCKDOWN_REACTION_DISTANCE = 2.35;
const HIT_FADE_DURATION = 0.08;
const KNOCKDOWN_FADE_DURATION = 0.12;
const GET_UP_FADE_DURATION = 0.14;
let showCombatHitboxes = false;

const HIT_REACTION_KEYS = new Set([
    'hitHighLight',
    'hitHighMedium',
    'hitHighHeavy',
    'hitMidLight',
    'hitMidMedium',
    'hitMidHeavy',
    'hitLowLight',
    'hitLowMedium',
    'hitLowHeavy',
    'knockdown',
    'getUp'
]);
const DEATH_ACTION_KEYS = new Set(['deathFall', 'deathFlyBack', 'deathKnockout']);
const CINEMATIC_ACTION_KEYS = new Set(['intro', 'taunt', 'victory', 'standingPose']);

function buildAnimationManifest() {
    const manifest = { ...SHARED_ANIMATIONS };

    Object.entries(CHARACTERS).forEach(([charId, character]) => {
        Object.entries(character.animations || {}).forEach(([actionName, path]) => {
            manifest[`${charId}:${actionName}`] = path;
        });
    });

    return manifest;
}

function getCharacterActionClipKey(charId, actionName) {
    const profile = CHARACTERS[charId];
    if (profile && profile.animations && profile.animations[actionName]) {
        return `${charId}:${actionName}`;
    }

    return SHARED_ANIMATIONS[actionName] ? actionName : null;
}

function getCharacterActionManifest(charId) {
    const manifest = {};
    const semanticKeys = new Set([
        ...Object.keys(SHARED_ANIMATIONS),
        ...Object.keys(CHARACTERS[charId].animations || {})
    ]);

    semanticKeys.forEach((actionName) => {
        const clipKey = getCharacterActionClipKey(charId, actionName);
        if (clipKey) manifest[actionName] = clipKey;
    });

    return manifest;
}

const loaderScreen = document.getElementById('loader-screen');
const progressBar = document.getElementById('progress-bar');
const loadStatusTitle = document.getElementById('load-status-title');
const loadStatusDetail = document.getElementById('load-status-detail');

function normalizeGameMode(mode) {
    if (mode === 'single') return MODE.ARCADE_SINGLE;
    if (mode === 'local') return MODE.LOCAL_VERSUS;
    if (mode === 'online') return MODE.ONLINE_VERSUS;
    if (mode === 'training') return MODE.TRAINING;
    return mode || MODE.LOCAL_VERSUS;
}

function isArcadeMode() {
    return gameMode === MODE.ARCADE_SINGLE;
}

function isOnlineVersusMode() {
    return gameMode === MODE.ONLINE_VERSUS;
}

function isStoryMode() {
    return gameMode === MODE.STORY_SOLO || gameMode === MODE.STORY_COOP_ONLINE;
}

function isStoryCoopMode() {
    return gameMode === MODE.STORY_COOP_ONLINE;
}

function isTrainingMode() {
    return gameMode === MODE.TRAINING;
}

// True when this fighter is driven by a human player (not AI, not a dummy).
function isHumanFighter(fighter) {
    if (!fighter || (fighter.id !== 1 && fighter.id !== 2)) return false;
    if (fighter.id === 1) return true;
    return gameMode === MODE.LOCAL_VERSUS || isOnlineVersusMode() || isTrainingMode() || isStoryCoopMode();
}

// True when this machine should run the Focus Controls simulation for this
// fighter: locally-controlled humans, plus both sides during replay
// playback (the replay re-simulates the recorded input stream). Remote
// fighters in online play are excluded: the owning peer resolves Strike
// locally and transmits the concrete attack type, so running it here too
// would double-fire.
function isFocusSimFighter(fighter) {
    if (!isFocusScheme() || !isHumanFighter(fighter)) return false;
    if (typeof replayPlayback !== 'undefined' && replayPlayback) return true;
    if (isOnlineVersusMode() || isStoryCoopMode()) {
        return (isHost && fighter.id === 1) || (!isHost && fighter.id === 2);
    }
    return true;
}

let gameMode = MODE.LOCAL_VERSUS;
let gamePaused = false;
let peer = null;
let conn = null;
let isHost = false;
let requestedOnlineMode = MODE.ONLINE_VERSUS;
let sfxVolume = 0.5;
let musicVolume = 0.5;
const configuredPeerPort = import.meta.env.VITE_PEER_PORT;
const inferredPeerPort = import.meta.env.DEV
    ? 9000
    : (window.location.port ? Number(window.location.port) : (window.location.protocol === 'https:' ? 443 : 80));
const PEER_SERVER_PORT = configuredPeerPort ? Number(configuredPeerPort) : inferredPeerPort;
const PEER_SERVER_CONFIG = {
    host: import.meta.env.VITE_PEER_HOST || window.location.hostname,
    port: PEER_SERVER_PORT,
    path: import.meta.env.VITE_PEER_PATH || '/peerjs',
    secure: import.meta.env.VITE_PEER_SECURE
        ? import.meta.env.VITE_PEER_SECURE === 'true'
        : window.location.protocol === 'https:'
};
const MUSIC_TRACKS = {
    menu: '/audio/main-menu.ogg',
    characterSelect: '/audio/character-select.ogg',
    fight: '/audio/the_carousel.ogg'
};
const musicPlayers = Object.fromEntries(
    Object.entries(MUSIC_TRACKS).map(([key, src]) => {
        const audio = new Audio(src);
        audio.loop = true;
        audio.volume = 0;
        return [key, audio];
    })
);
let activeMusicKey = null;
let musicFadeInterval = null;

function clearMusicFade() {
    if (musicFadeInterval) {
        clearInterval(musicFadeInterval);
        musicFadeInterval = null;
    }
}

function setAllMusicVolumes() {
    Object.values(musicPlayers).forEach(audio => {
        if (!audio.paused) {
            audio.volume = Math.min(audio.volume, musicVolume);
        }
    });
}

// Pause or resume the music around app inactivity and the pause screen.
// Only tracks that were actually playing get resumed; a track switch
// clears the flags so a stale track can never double up with the new one.
function setMusicPaused(paused) {
    Object.values(musicPlayers).forEach((player) => {
        if (!player) return;
        if (paused) {
            if (!player.paused) {
                player.pause();
                player.dataset.wasPlaying = '1';
            }
        } else if (player.dataset.wasPlaying === '1') {
            player.dataset.wasPlaying = '';
            player.play().catch(() => {});
        }
    });
}

function crossfadeMusic(nextKey) {
    if (activeMusicKey === nextKey) {
        const current = musicPlayers[nextKey];
        if (current) current.volume = musicVolume;
        return;
    }

    clearMusicFade();
    const incoming = nextKey ? musicPlayers[nextKey] : null;
    const outgoing = activeMusicKey ? musicPlayers[activeMusicKey] : null;
    // A track switch invalidates paused-for-inactivity flags: the incoming
    // track is the only one that may play from here.
    Object.values(musicPlayers).forEach((player) => {
        if (player) player.dataset.wasPlaying = '';
    });
    const steps = 12;
    let step = 0;

    if (incoming) {
        incoming.currentTime = incoming.currentTime || 0;
        incoming.volume = 0;
        incoming.play().catch(e => console.warn('Audio play failed', e));
    }

    musicFadeInterval = setInterval(() => {
        step += 1;
        const progress = step / steps;

        if (incoming) incoming.volume = musicVolume * progress;
        if (outgoing) outgoing.volume = musicVolume * (1 - progress);

        if (step >= steps) {
            clearMusicFade();
            if (outgoing) {
                outgoing.pause();
                outgoing.currentTime = 0;
                outgoing.volume = 0;
            }
            if (incoming) incoming.volume = musicVolume;
            activeMusicKey = nextKey;
        }
    }, 35);
}

function playScreenMusic(screenKey) {
    const trackKey = screenKey === 'menu' ? 'menu' : 'characterSelect';
    crossfadeMusic(trackKey);
}

function stopMusicForFight() {
    crossfadeMusic('fight');
}

// GLOBAL TIME CONTROLS (JUICE)
let globalTimeScale = 1.0;
let slowMoTimer = 0;

let comboUI = null;
function createComboUI() {
    comboUI = document.createElement('div');
    comboUI.id = 'combo-counter';
    document.body.appendChild(comboUI);
}

// --- DYNAMIC GUARD BAR INJECTION ---
function injectGuardBars() {
    const p1Hud = document.querySelector('.p1-hud');
    const p2Hud = document.querySelector('.p2-hud');

    if (p1Hud && !document.getElementById('p1-guard-bar')) {
        const guardContainer1 = document.createElement('div');
        guardContainer1.className = 'guard-bar-outer';
        guardContainer1.innerHTML = '<div id="p1-guard-bar" class="guard-bar-inner"></div>';
        p1Hud.appendChild(guardContainer1);
    }

    if (p1Hud && !document.getElementById('p1-meter-bar')) {
        const meterContainer1 = document.createElement('div');
        meterContainer1.className = 'meter-bar-outer';
        meterContainer1.innerHTML = '<div id="p1-meter-bar" class="meter-bar-inner"></div>';
        p1Hud.appendChild(meterContainer1);
    }

    if (p2Hud && !document.getElementById('p2-guard-bar')) {
        const guardContainer2 = document.createElement('div');
        guardContainer2.className = 'guard-bar-outer';
        guardContainer2.innerHTML = '<div id="p2-guard-bar" class="guard-bar-inner"></div>';
        p2Hud.appendChild(guardContainer2);
    }

    if (p2Hud && !document.getElementById('p2-meter-bar')) {
        const meterContainer2 = document.createElement('div');
        meterContainer2.className = 'meter-bar-outer';
        meterContainer2.innerHTML = '<div id="p2-meter-bar" class="meter-bar-inner"></div>';
        p2Hud.appendChild(meterContainer2);
    }
}

function showMainMenu() {
    releaseAllTouchZones();
    resetStoryRun();
    document.getElementById('selector-screen').classList.add('hidden');
    document.getElementById('ladder-screen').classList.add('hidden');
    document.getElementById('story-menu').style.display = 'none';
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('options-menu').style.display = 'none';
    document.getElementById('hud').style.display = 'none';
    document.getElementById('main-menu').style.display = 'flex';
    playScreenMusic('menu');

    setFightEnvironmentVisible(false);
    setSelectEnvironmentVisible(true);
    updateViewportState();
}

function openStoryMenu() {
    releaseAllTouchZones();
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('story-menu').style.display = 'flex';
    playScreenMusic('menu');
}

function closeStoryMenu() {
    releaseAllTouchZones();
    document.getElementById('story-menu').style.display = 'none';
    document.getElementById('main-menu').style.display = 'flex';
    playScreenMusic('menu');
}

window.startGameMode = function (mode) {
    gameMode = normalizeGameMode(mode);
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('story-menu').style.display = 'none';
    showCharacterSelect();
};

function openLobby(mode = MODE.ONLINE_VERSUS) {
    requestedOnlineMode = normalizeGameMode(mode);
    releaseAllTouchZones();
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('story-menu').style.display = 'none';
    document.getElementById('lobby-screen').style.display = 'flex';
    document.getElementById('lobby-title').textContent = requestedOnlineMode === MODE.STORY_COOP_ONLINE
        ? 'Story Co-op Lobby'
        : 'Online Lobby';
    document.getElementById('lobby-copy').textContent = requestedOnlineMode === MODE.STORY_COOP_ONLINE
        ? 'Connect your partner, then both players lock in heroes for the campaign.'
        : 'Host a room or join one with a code.';
    playScreenMusic('menu');
    if (!peer) {
        document.getElementById('lobby-status').textContent = 'Connecting to signaling server...';
        peer = new Peer(undefined, PEER_SERVER_CONFIG);
        peer.on('open', id => {
            document.getElementById('lobby-status').textContent = 'Connected to lobby server. READY to host or join.';
        });
        peer.on('connection', c => {
            conn = c;
            setupConnection();
        });
        peer.on('error', err => {
            document.getElementById('lobby-status').textContent = 'Error: ' + err.message;
        });
    }
}

function hostGame() {
    if (!peer) return;
    isHost = true;
    document.getElementById('lobby-joincode').value = peer.id;
    document.getElementById('lobby-status').textContent = 'Waiting for peer... Share your code: ' + peer.id;
}

function joinGame() {
    if (!peer) return;
    const code = document.getElementById('lobby-joincode').value;
    if (!code) return;
    isHost = false;
    document.getElementById('lobby-status').textContent = 'Joining ' + code + '...';
    conn = peer.connect(code);
    conn.on('open', () => {
        setupConnection();
    });
}

function setupConnection() {
    document.getElementById('lobby-status').textContent = 'Peer connected! Starting...';
    conn.on('data', data => {
        if (data.type === 'start') {
            gameMode = normalizeGameMode(data.mode || requestedOnlineMode || MODE.ONLINE_VERSUS);
            document.getElementById('lobby-screen').style.display = 'none';
            showCharacterSelect();
        } else if (data.type === 'input' && gameActive) {
            const remotePlayerId = isHost ? 2 : 1;
            applyRemoteActionInput(remotePlayerId, data.action, data.key, data.buffer);
        } else if (data.type === 'select') {
            selectCharacter(data.player, data.charId, true);
        } else if (data.type === 'lockIn') {
            lockInPlayer(data.player, true);
        } else if (data.type === 'fight') {
            startFight(true, data.stage || null);
        } else if (data.type === 'storyEnemyState') {
            applyRemoteStoryEnemyState(data);
        } else if (data.type === 'storyProgress') {
            syncStoryProgress(data.payload);
        }
    });
    if (isHost) {
        setTimeout(() => {
            conn.send({ type: 'start', mode: requestedOnlineMode });
            gameMode = normalizeGameMode(requestedOnlineMode);
            document.getElementById('lobby-screen').style.display = 'none';
            showCharacterSelect();
        }, 1000);
    }
}

// Sends an action-based input over the wire. `key` carries an action name on
// current clients; the receiver also accepts legacy raw key codes.
function sendNetworkInput(type, actionName, bufferAttack = null) {
    if ((isOnlineVersusMode() || isStoryCoopMode()) && conn && conn.open) {
        conn.send({ type: 'input', action: type, key: actionName, buffer: bufferAttack });
    }
}

// Applies a network input to the remote player's action state. Accepts both
// the current action-name format and the legacy key-code format.
function applyRemoteActionInput(remotePlayerId, netAction, keyOrAction, bufferAttack) {
    let actionName = ACTION_BY_NAME[keyOrAction] || null;
    if (!actionName) actionName = keyCodeToAction(remotePlayerId, keyOrAction);
    if (!actionName) return;
    const state = playerActionState(remotePlayerId);
    if (netAction === 'keydown') {
        pressAction(state, actionName);
        const attackType = bufferAttack || ACTION_ATTACK_TYPE[actionName] || null;
        if (attackType) bufferAttackInput(remotePlayerId, attackType);
    } else if (netAction === 'keyup') {
        releaseAction(state, actionName);
    }
}

function closeLobby() {
    releaseAllTouchZones();
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('main-menu').style.display = 'flex';
    playScreenMusic('menu');
}

function openOptions() {
    releaseAllTouchZones();
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('options-menu').style.display = 'flex';
    playScreenMusic('menu');
}

function closeOptions() {
    releaseAllTouchZones();
    document.getElementById('options-menu').style.display = 'none';
    document.getElementById('main-menu').style.display = 'flex';
    playScreenMusic('menu');
}

// --- Control scheme (Classic vs Focus) ---
// Focus Controls: stick + Strike / Special / Guard with contextual strikes,
// tempo combos, and charged strikes. Classic is the original six-button
// layout. The choice persists across sessions.
let controlScheme = CONTROL_SCHEME.CLASSIC;
try {
    const savedScheme = localStorage.getItem('ff-control-scheme');
    if (savedScheme === CONTROL_SCHEME.FOCUS) controlScheme = CONTROL_SCHEME.FOCUS;
} catch (err) { /* storage unavailable: stay classic */ }

function isFocusScheme() {
    return controlScheme === CONTROL_SCHEME.FOCUS;
}

function setControlScheme(scheme) {
    controlScheme = scheme === CONTROL_SCHEME.FOCUS ? CONTROL_SCHEME.FOCUS : CONTROL_SCHEME.CLASSIC;
    try { localStorage.setItem('ff-control-scheme', controlScheme); } catch (err) { /* ignore */ }
    // The zone layout depends on the scheme, so rebuild it (forced).
    touchZoneConfigKey = '';
    if (typeof updateViewportState === 'function') updateViewportState();
    const schemeBtn = document.getElementById('controls-scheme-btn');
    if (schemeBtn) schemeBtn.textContent = isFocusScheme() ? 'Focus' : 'Classic';
    const schemeHint = document.getElementById('controls-scheme-hint');
    if (schemeHint) {
        schemeHint.textContent = isFocusScheme()
            ? 'Left screen half: move & guard zones. Right half: tap Strike to hit, hold to charge, tap on the gold ring for a tempo combo.'
            : 'Left screen half: move & guard zones. Right half: Punch / Kick / Special / Throw zones.';
    }
    // A mid-fight switch must not leave a half-armed strike behind.
    for (const fighter of players) {
        const c = fighter?.combat;
        if (!c) continue;
        c.tempoFrames = 0;
        c.focusPending = 0;
        c.focusPressArmed = false;
        c.focusCharging = false;
        c.focusChargeFrames = 0;
        c.strikeWasHeld = false;
        setTempoRingVisible(fighter, false);
    }
    if (focusHintEl) {
        focusHintEl.textContent = '';
        focusHintEl.style.display = 'none';
    }
}

function toggleControlScheme() {
    setControlScheme(isFocusScheme() ? CONTROL_SCHEME.CLASSIC : CONTROL_SCHEME.FOCUS);
}
window.toggleControlScheme = toggleControlScheme;

function updateAudioOptions() {
    sfxVolume = parseFloat(document.getElementById('sfx-vol').value);
    musicVolume = parseFloat(document.getElementById('music-vol').value);
    setAllMusicVolumes();
    if (activeMusicKey && musicPlayers[activeMusicKey]) {
        musicPlayers[activeMusicKey].volume = musicVolume;
    }
}

function togglePause() {
    if (!gameActive && !gamePaused) return;
    gamePaused = !gamePaused;
    if (gamePaused) releaseAllTouchZones();
    setMusicPaused(gamePaused);
    document.getElementById('pause-screen').style.display = gamePaused ? 'flex' : 'none';
    if (!gamePaused && timerInterval === null && gameActive) {
        startTimer();
    } else if (gamePaused) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    updateViewportState();
}

// The game and its music never run while the page isn't active: tab
// hidden, window blurred, app switched away. On return the pause screen
// waits for the player (manual resume restarts the music); menu music
// resumes on its own.
function pauseForInactivity() {
    if (gameActive && !gamePaused) {
        togglePause();
    } else {
        setMusicPaused(true);
    }
}

function resumeAfterInactivity() {
    if (gamePaused) return;
    setMusicPaused(false);
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseForInactivity();
    else resumeAfterInactivity();
});
window.addEventListener('blur', pauseForInactivity);
window.addEventListener('focus', resumeAfterInactivity);

function quitToMainMenu() {
    gamePaused = false;
    gameActive = false;
    releaseAllTouchZones();
    clearInterval(timerInterval);
    document.getElementById('pause-screen').style.display = 'none';
    document.getElementById('hud').style.display = 'none';
    setTrainingHudVisible(false);
    document.getElementById('gameover-screen').style.display = 'none';
    document.getElementById('ladder-screen').classList.add('hidden');
    if (comboUI) comboUI.classList.remove('show');
    removeFighterList(players);
    removeStoryEnemy();
    removeFighterList(previewFighters);
    showMainMenu();
}

const DOUBLE_TAP_WINDOW = 250;
const lastActionTaps = {};

function resolveKeyBinding(code) {
    for (const playerId of [1, 2]) {
        const action = keyCodeToAction(playerId, code, controlScheme);
        if (action) return { playerId, action };
    }
    return null;
}

function triggerDash(player, dir) {
    if (!player || !player.combat || player.isDead) return false;
    if (player.combat.state === FIGHTER_STATE.DASH || player.isJumping) return false;
    player.dashDir = dir;
    if (!startCombatDash(player, dir)) return false;
    const anim = (dir === player.direction) ? 'stepForwardLong' : 'stepBackward';
    player.fadeTo(anim, 0.05, 2.0); // Play dash animation at 2x speed
    spawnParticles(player.mesh.position, 'dash'); // Minor dash burst
    return true;
}

// Edge effects for a pressed action. `fromReplay` replays a recorded stream:
// discrete actions (attacks, recorded dashes) are dispatched, but live-only
// derivations such as double-tap detection are skipped.
function handleActionPress(playerId, action, fromReplay = false, data = null) {
    const player = players[playerId - 1];
    let bufferAttack = null;
    if ((action === ACTION.MOVE_LEFT || action === ACTION.MOVE_RIGHT) && gameActive && !fromReplay) {
        const now = performance.now();
        const tapKey = playerId + ':' + action;
        if (now - (lastActionTaps[tapKey] || 0) < DOUBLE_TAP_WINDOW) {
            const dir = action === ACTION.MOVE_LEFT ? -1 : 1;
            if (triggerDash(player, dir)) {
                pressAction(playerActionState(playerId), ACTION.DASH, { dir });
            }
        }
        lastActionTaps[tapKey] = now;
    } else if (action === ACTION.DASH && fromReplay) {
        const dir = (data && typeof data.dir === 'number') ? data.dir : (player ? player.direction : 1) || 1;
        triggerDash(player, dir);
    }
    const attackType = ACTION_ATTACK_TYPE[action];
    if (attackType) {
        bufferAttackInput(playerId, attackType);
        bufferAttack = attackType;
        // NOTE: no pressAction here — the caller (keyboard / touch / legacy
        // handlers) already recorded this press for replay. Recording it a
        // second time would double-buffer the attack in replays and fire a
        // phantom chained hit from the duplicate's 12-frame buffer entry.
    } else if (action === ACTION.STRIKE && gameActive) {
        // Focus Controls: a perfect-beat press resolves into a tempo route
        // immediately; taps and holds arm the release-resolved strike.
        // Same single-record rule as above: the caller's pressAction is the
        // one the recorder captures.
        bufferAttack = handleFocusStrikePress(player, playerId);
    } else if (action === ACTION.TAUNT && gameActive) {
        // Taunts dispatch immediately and are never buffered: they are only
        // legal from a neutral idle stance, so a mid-action press whiffs.
        // The caller's pressAction already recorded this for replay, and the
        // replay path re-dispatches it here deterministically.
        requestAttack(player, 'taunt');
    }
    if (!fromReplay) sendActionNetworkInput(playerId, 'keydown', action, bufferAttack);
}

// --- Focus Controls combat ---
//
// Strike press: a perfect-beat press inside the tempo window resolves into
// the fighter's unique tempo route immediately (and is transmitted like any
// other attack). Anything else arms the tap-vs-hold decision window; the
// release edge is resolved inside the simulation so live play, replays, and
// peers agree. Returns a concrete attack type for the network wire when the
// press resolves immediately, else null.
function handleFocusStrikePress(player, playerId) {
    const c = player?.combat;
    if (!c || player.isDead || !isFocusSimFighter(player)) return null;
    if (c.tempoFrames >= TEMPO_PERFECT_LO && c.tempoFrames <= TEMPO_PERFECT_HI) {
        const actions = playerActionState(playerId);
        const towardHeld = isActionHeld(actions, player.direction === 1 ? ACTION.MOVE_RIGHT : ACTION.MOVE_LEFT);
        const awayHeld = isActionHeld(actions, player.direction === 1 ? ACTION.MOVE_LEFT : ACTION.MOVE_RIGHT);
        const routeType = selectTempoRoute({ towardHeld, awayHeld });
        c.tempoFrames = 0;
        setTempoRingVisible(player, false);
        bufferAttackInput(playerId, routeType);
        return routeType;
    }
    c.focusPending = STRIKE_TAP_FRAMES;
    c.focusPressArmed = true;
    c.focusCharging = false;
    c.focusChargeFrames = 0;
    return null;
}

// Fire a resolved focus attack through the standard pipeline. The owning
// peer transmits the concrete type so remote sims play the same attack.
function fireFocusAttack(player, type) {
    if (!requestAttack(player, type)) return false;
    if (!replayPlayback) sendActionNetworkInput(player.id, 'keydown', ACTION.STRIKE, type);
    return true;
}

function fireFocusTapStrike(player, opp) {
    const c = player.combat;
    const actions = playerActionState(player.id);
    const distance = opp?.mesh ? Math.abs(opp.mesh.position.x - player.mesh.position.x) : 99;
    const towardHeld = isActionHeld(actions, player.direction === 1 ? ACTION.MOVE_RIGHT : ACTION.MOVE_LEFT);
    const airborne = player.isJumping || c.state === FIGHTER_STATE.JUMP;
    const resolved = resolveFocusStrike({ distance, towardHeld, airborne });
    let chain = resolved.chain;
    if (chain < 0) {
        // Neutral Strike cycles the fighter's own jab string: light, medium,
        // heavy, then back to light.
        chain = c.focusChain || 0;
        c.focusChain = (chain + 1) % 3;
    } else if (resolved.type === 'kick' && chain === 2) {
        c.focusChain = 0; // the advancing heavy kick resets the jab cycle
    }
    const prevChain = c.chain;
    c.chain = chain;
    if (!fireFocusAttack(player, resolved.type)) c.chain = prevChain;
}

// Per-sim-frame Focus Controls bookkeeping for one fighter: tap-vs-hold
// decision, charge levels, and release edges. (The tempo window itself ticks
// in advanceCombatFighterStep so both online sims stay aligned.) Everything
// here is a pure function of sim state plus the recorded input stream, so
// live play, replays, and both online peers reproduce it exactly.
function updateFocusFighter(p, opp) {
    const c = p.combat;
    if (!c || p.isDead) return;

    const actions = playerActionState(p.id);
    const strikeHeld = isActionHeld(actions, ACTION.STRIKE);
    const grounded = !p.isJumping && c.state !== FIGHTER_STATE.JUMP;
    const neutral = c.state === FIGHTER_STATE.IDLE || c.state === FIGHTER_STATE.WALK || c.state === FIGHTER_STATE.BLOCK;
    // Air attacks are tap-only: no charging mid-air.
    const canStrike = neutral || c.state === FIGHTER_STATE.JUMP;

    // Release edge: a tap becomes the contextual strike; a grounded hold
    // becomes the charged heavy (or falls back to the tap strike below
    // level 1). The focusPressArmed arm covers taps that press and release
    // between two sim frames.
    const released = (c.strikeWasHeld || c.focusPressArmed) && !strikeHeld;
    if (released) {
        if (canStrike) {
            if (grounded && c.focusCharging) {
                const frames = c.focusChargeFrames || 0;
                const chargeType = frames >= CHARGE_LEVEL_2 ? 'focusCharge2' : frames >= CHARGE_LEVEL_1 ? 'focusCharge1' : null;
                if (chargeType) fireFocusAttack(p, chargeType);
                else fireFocusTapStrike(p, opp);
            } else if ((c.focusPending || 0) > 0) {
                fireFocusTapStrike(p, opp);
            }
        }
        c.focusPending = 0;
        c.focusCharging = false;
        c.focusChargeFrames = 0;
    }
    c.strikeWasHeld = strikeHeld;
    c.focusPressArmed = false;

    // Tap-vs-hold decision and charging, while the fighter stays neutral and
    // grounded. Guard cancels the charge with no phantom attack. An airborne
    // hold simply keeps the tap window armed until release.
    if ((c.focusPending || 0) > 0 || c.focusCharging) {
        if (isActionHeld(actions, ACTION.BLOCK)) {
            c.focusPending = 0;
            c.focusCharging = false;
            c.focusChargeFrames = 0;
        } else if (!canStrike) {
            // Hit, dashed, or caught mid-move: the strike fizzles.
            c.focusPending = 0;
            c.focusCharging = false;
            c.focusChargeFrames = 0;
        } else if (strikeHeld && grounded) {
            if ((c.focusPending || 0) > 0) {
                c.focusPending--;
                if (c.focusPending === 0) { c.focusCharging = true; c.focusChargeFrames = 0; }
            } else if (c.focusCharging) {
                c.focusChargeFrames++;
            }
        }
    }
}

// Each peer only transmits its own fighter's inputs (host: player 1, guest: player 2).
function sendActionNetworkInput(playerId, type, action, bufferAttack = null) {
    if (!(isOnlineVersusMode() || isStoryCoopMode())) return;
    if (isHost && playerId !== 1) return;
    if (!isHost && playerId !== 2) return;
    sendNetworkInput(type, action, bufferAttack);
}

window.addEventListener('keydown', (e) => {
    if (isZoomShortcut(e)) {
        e.preventDefault();
        return;
    }

    if (!e.repeat && e.code === 'KeyH') {
        showCombatHitboxes = !showCombatHitboxes;
        [...players, ...activeEnemies].forEach((fighter) => !showCombatHitboxes && hideCombatHelpers(fighter));
        return;
    }

    if (!e.repeat && e.code === 'Backquote') {
        togglePerfOverlay();
        return;
    }

    // Training Lab shortcuts.
    if (!e.repeat && isTrainingMode()) {
        if (e.code === 'KeyF') { toggleTrainingFreeze(); return; }
        if (e.code === 'KeyN') { stepTrainingFrame(); return; }
        if (e.code === 'KeyB') { toggleTrainingDummy(); return; }
        if (e.code === 'KeyR') { resetTrainingScenario(); return; }
    }

    const binding = resolveKeyBinding(e.code);
    if (!binding) {
        // Prevent scrolling
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
            e.preventDefault();
        }
        return;
    }

    const { playerId, action } = binding;
    if (action === ACTION.PAUSE) {
        if (!e.repeat && (gameActive || gamePaused)) togglePause();
        return;
    }

    if (!e.repeat) {
        pressAction(playerActionState(playerId), action);
        handleActionPress(playerId, action, false);
    } else {
        // Key repeat: refresh the remote peer's held state, no new press.
        sendActionNetworkInput(playerId, 'keydown', action);
    }

    // Prevent scrolling
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
    }
});

window.addEventListener('keyup', (e) => {
    const binding = resolveKeyBinding(e.code);
    if (!binding || binding.action === ACTION.PAUSE) return;
    releaseAction(playerActionState(binding.playerId), binding.action);
    sendActionNetworkInput(binding.playerId, 'keyup', binding.action);
});

function isZoomShortcut(event) {
    if (!(event.ctrlKey || event.metaKey)) return false;

    const key = (event.key || '').toLowerCase();
    return key === '+' || key === '=' || key === '-' || key === '_' || key === '0';
}

window.addEventListener('wheel', (event) => {
    if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
    }
}, { passive: false });

function isGameplayInteractionLocked() {
    return document.documentElement.classList.contains('gameplay-touch-lock');
}

const DOUBLE_TAP_ZOOM_WINDOW = 320;
const DOUBLE_TAP_ZOOM_DISTANCE = 32;
let lastGameplayTap = null;

function preventGameplayGesture(event) {
    if (isGameplayInteractionLocked()) event.preventDefault();
}

// Safari's gesture events are non-standard, but remain the most direct way to
// cancel a pinch on iPhone. Capture the gesture before it reaches the game UI.
['gesturestart', 'gesturechange', 'gestureend'].forEach((type) => {
    document.addEventListener(type, preventGameplayGesture, { capture: true, passive: false });
});

document.addEventListener('touchstart', (event) => {
    if (!isGameplayInteractionLocked()) return;

    // Do not suppress the second pointer: combat still needs stick + button input.
    // This only prevents Safari from claiming the native multi-touch gesture.
    if (event.touches.length > 1) event.preventDefault();
}, { capture: true, passive: false });

document.addEventListener('touchmove', (event) => {
    if (isGameplayInteractionLocked()) event.preventDefault();
}, { capture: true, passive: false });

document.addEventListener('touchend', (event) => {
    if (!isGameplayInteractionLocked() || event.changedTouches.length !== 1) return;

    const touch = event.changedTouches[0];
    const now = performance.now();
    const previous = lastGameplayTap;
    const isRapidRepeat = previous && now - previous.time < DOUBLE_TAP_ZOOM_WINDOW &&
        Math.hypot(touch.clientX - previous.x, touch.clientY - previous.y) < DOUBLE_TAP_ZOOM_DISTANCE;

    if (isRapidRepeat) event.preventDefault();
    lastGameplayTap = { time: now, x: touch.clientX, y: touch.clientY };
}, { capture: true, passive: false });

let isFallbackMode = false;
const loadedModels = {};
const loadedAnims = {};

// --- STAGE PROPS ---
let carouselRig = null;  // The spinning carousel_rig.glb object
let stageSceneRoot = null; // The stage environment (scene.glb)
let selectSceneRoot = null;

// --- PLACEHOLDER STAGE STATE (additive; combat simulation untouched) ---
let currentStageId = 'the_carousel';
let selectedStageId = 'the_carousel';
let placeholderStageGroup = null;
let placeholderStageDisposables = [];
let activeStageUpdate = null;
let stageElapsedTime = 0;
let defaultStageBackground = null;
let defaultStageFog = null;

function setFightEnvironmentVisible(visible) {
    const showingRealStage = visible && currentStageId === 'the_carousel';
    if (stageSceneRoot) stageSceneRoot.visible = showingRealStage;
    if (carouselRig) carouselRig.visible = showingRealStage;
    if (placeholderStageGroup) placeholderStageGroup.visible = visible && currentStageId !== 'the_carousel';
    if (typeof gridHelper !== 'undefined') gridHelper.visible = false;
    if (typeof floor !== 'undefined') floor.visible = false;
}

function setSelectEnvironmentVisible(visible) {
    if (selectSceneRoot) selectSceneRoot.visible = visible;
}

// --- PLACEHOLDER STAGE LOADER (visuals only; combat lane is identical) ---
function captureDefaultStageEnvironment() {
    if (defaultStageBackground || typeof scene === 'undefined' || !scene) return;
    defaultStageBackground = scene.background ? scene.background.clone() : new THREE.Color(0x0c0b1f);
    defaultStageFog = scene.fog ? scene.fog.clone() : null;
}

function disposePlaceholderStage() {
    if (placeholderStageGroup && typeof scene !== 'undefined' && scene) {
        scene.remove(placeholderStageGroup);
        placeholderStageGroup = null;
    }
    placeholderStageDisposables.forEach((d) => { try { d.dispose(); } catch (e) { /* already gone */ } });
    placeholderStageDisposables = [];
    activeStageUpdate = null;
}

// Loads a stage by registry id. Real GLB stages reuse the boot-loaded
// carousel assets; placeholder ids build a procedural scene on the spot.
function loadStageById(id) {
    captureDefaultStageEnvironment();
    const entry = getStageEntry(id);
    disposePlaceholderStage();
    currentStageId = entry.id;
    if (entry.kind === 'placeholder' && typeof entry.build === 'function') {
        const built = entry.build(THREE);
        placeholderStageGroup = built.group;
        placeholderStageDisposables = built.disposables || [];
        activeStageUpdate = built.update || null;
        stageElapsedTime = 0;
        scene.add(placeholderStageGroup);
        if (built.background) scene.background = built.background;
        scene.fog = built.fog || null;
    } else {
        if (defaultStageBackground) scene.background = defaultStageBackground;
        scene.fog = defaultStageFog;
    }
    setFightEnvironmentVisible(true);
}

// Stage picker on the character-select screen. Purely visual.
window.selectStage = function (id) {
    const entry = getStageEntry(id);
    selectedStageId = entry.id;
    document.querySelectorAll('.stage-btn').forEach((btn) => {
        btn.classList.toggle('selected', btn.dataset.stage === selectedStageId);
    });
    AudioSynth.playSelect();
};

// --- 3. ASSET LOAD PIPELINE ---
async function loadAssets() {
    const fbxLoader = new FBXLoader();
    const gltfLoader = new GLTFLoader();
    const ktx2Loader = new KTX2Loader()
        .setTranscoderPath('/basis/')
        .detectSupport(renderer);
    gltfLoader.setKTX2Loader(ktx2Loader);
    gltfLoader.setMeshoptDecoder(MeshoptDecoder);

    const charKeys = Object.keys(CHARACTERS);
    const enemyKeys = Object.keys(ENEMIES);
    const animationManifest = buildAnimationManifest();
    const animKeys = Object.keys(animationManifest);
    // +2 for the stage scene.glb and carousel_rig.glb
    const totalFiles = charKeys.length + enemyKeys.length + animKeys.length + 2;
    let loadedCount = 0;

    const updateProgress = (itemName) => {
        loadedCount++;
        const percentage = Math.min(100, Math.floor((loadedCount / totalFiles) * 100));
        progressBar.style.width = percentage + '%';
        loadStatusTitle.textContent = `Syncing Simulation (${percentage}%)`;
        loadStatusDetail.textContent = `Loaded ${itemName}...`;
    };

    // Load all animations
    const animPromises = animKeys.map(key => {
        return new Promise((resolve) => {
            fbxLoader.load(animationManifest[key],
                (fbx) => {
                    if (fbx.animations && fbx.animations.length > 0) {
                        loadedAnims[key] = fbx.animations[0];
                        loadedAnims[key].name = key;
                    }
                    updateProgress(key);
                    resolve(true);
                },
                undefined,
                (err) => {
                    console.warn(`Could not load animation FBX: ${key}. Path: ${animationManifest[key]}. Falling back...`, err);
                    updateProgress(key);
                    resolve(false);
                }
            );
        });
    });

    // Load all characters
    const charPromises = charKeys.map(key => {
        return new Promise((resolve) => {
            fbxLoader.load(CHARACTERS[key].path,
                (fbx) => {
                    loadedModels[key] = fbx;
                    updateProgress(CHARACTERS[key].name);
                    resolve(true);
                },
                undefined,
                (err) => {
                    console.warn(`Could not load character FBX: ${key}. Path: ${CHARACTERS[key].path}. Falling back...`, err);
                    updateProgress(CHARACTERS[key].name);
                    resolve(false);
                }
            );
        });
    });

    const enemyPromises = storyEnemyManager.preload(ENEMIES, updateProgress);

    // Load the carousel stage environment (scene.glb)
    const stagePromise = new Promise((resolve) => {
        gltfLoader.load('/stages/the_carousel/scene.glb',
            (gltf) => {
                stageSceneRoot = gltf.scene;
                stageSceneRoot.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        child.frustumCulled = false;
                    }
                });
                // Position the stage environment behind and below the fight floor
                stageSceneRoot.position.set(0, -0.25, -2);
                scene.add(stageSceneRoot);
                updateProgress('Stage Environment');
                resolve(true);
            },
            undefined,
            (err) => {
                console.warn('Could not load stage scene.glb:', err);
                updateProgress('Stage Environment');
                resolve(false);
            }
        );
    });

    // Load the carousel rig (spinning background prop)
    const carouselPromise = new Promise((resolve) => {
        gltfLoader.load('/stages/the_carousel/carousel_rig.glb',
            (gltf) => {
                carouselRig = gltf.scene;
                carouselRig.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = false;
                        child.receiveShadow = false;
                        child.frustumCulled = false;
                    }
                });

                // Center the carousel's geometric origin so it spins cleanly
                const box = new THREE.Box3().setFromObject(carouselRig);
                const center = new THREE.Vector3();
                box.getCenter(center);
                // Shift children so the rig pivots around its horizontal centre;
                // keep them at their original Y so the mesh isn't offset vertically.
                carouselRig.children.forEach(child => {
                    child.position.x -= center.x;
                    child.position.z -= center.z;
                });

                // Scale to fit nicely in the background
                const size2 = new THREE.Vector3();
                box.getSize(size2);
                const maxDim = Math.max(size2.x, size2.y, size2.z);
                const targetSize = 9.7;
                let finalScale = 1;
                if (isFinite(maxDim) && maxDim > 0.001) {
                    finalScale = targetSize / maxDim;
                    carouselRig.scale.setScalar(finalScale);
                }

                // Recompute the bounding box AFTER applying scale so the Y
                // placement is accurate — then pin the bottom edge to the floor.
                carouselRig.updateMatrixWorld(true);
                const scaledBox = new THREE.Box3().setFromObject(carouselRig);
                const bottomY = scaledBox.min.y;          // world Y of lowest point
                const desiredFloorY = -0.25;              // match the fight-floor plane
                // Bring the rig slightly forward toward the fighter spawn line
                // while keeping it behind gameplay space.
                carouselRig.position.set(0, desiredFloorY - bottomY, -12.8);

                scene.add(carouselRig);
                updateProgress('Carousel Rig');
                resolve(true);
            },
            undefined,
            (err) => {
                console.warn('Could not load carousel_rig.glb:', err);
                updateProgress('Carousel Rig');
                resolve(false);
            }
        );
    });

    await Promise.all([...animPromises, ...charPromises, ...enemyPromises, stagePromise, carouselPromise]);

    const hasAnimations = Object.keys(loadedAnims).length > 0;
    const hasCharacters = Object.keys(loadedModels).length > 0;

    if (!hasAnimations || !hasCharacters) {
        console.warn("Missing Mixamo assets. Entering Retro Box Fallback Mode.");
        isFallbackMode = true;
    }

    loaderScreen.style.opacity = '0';
    setTimeout(() => {
        loaderScreen.style.display = 'none';
        showMainMenu();
    }, 500);
}

window.addEventListener('DOMContentLoaded', () => {
    initTouchZones();
    initGamepad((pad) => {
        const pill = document.getElementById('gamepad-pill');
        if (!pill) return;
        if (pad) {
            pill.hidden = false;
            const label = document.getElementById('gamepad-pill-text');
            if (label) label.textContent = 'Controller connected' + (pad.id ? ': ' + pad.id.slice(0, 28) : '');
        } else {
            pill.hidden = true;
        }
    });
    createComboUI();
    // Apply the persisted control scheme to the touch layout and options label.
    setControlScheme(controlScheme);
    loadAssets();

    const singleBtn = document.getElementById('menu-single-btn');
    const storyBtn = document.getElementById('menu-story-btn');
    const localBtn = document.getElementById('menu-local-btn');
    const onlineBtn = document.getElementById('menu-online-btn');
    const optionsBtn = document.getElementById('menu-options-btn');
    const bindMenuAction = (button, action) => {
        if (!button) return;
        let handledPointer = false;

        button.addEventListener('pointerup', (event) => {
            handledPointer = true;
            event.preventDefault();
            action();
            setTimeout(() => { handledPointer = false; }, 0);
        });

        button.addEventListener('touchend', (event) => {
            event.preventDefault();
            action();
        }, { passive: false });

        button.addEventListener('click', (event) => {
            if (handledPointer) {
                handledPointer = false;
                return;
            }
            event.preventDefault();
            action();
        });
    };

    bindMenuAction(storyBtn, () => openStoryMenu());
    bindMenuAction(singleBtn, () => startGameMode(MODE.ARCADE_SINGLE));
    bindMenuAction(localBtn, () => startGameMode(MODE.LOCAL_VERSUS));
    bindMenuAction(onlineBtn, () => openLobby(MODE.ONLINE_VERSUS));
    bindMenuAction(optionsBtn, () => openOptions());
});

// --- 4. CHARACTER SELECT CONTROL LOGIC ---
const selections = {
    1: 'kyle',
    2: 'jonah'
};

let p1Locked = false;
let p2Locked = false;
let isBossMatch = false;
const tournamentRun = {
    playerCharId: null,
    ladder: [],
    currentIndex: 0,
    status: 'idle'
};
const storyRun = {
    campaignId: 'family-fighter-v1',
    chapterIndex: 0,
    encounterIndex: 0,
    player1CharId: null,
    player2CharId: null,
    onlineEnabled: false,
    status: 'idle'
};

function getCurrentStoryChapter() {
    return STORY_CHAPTERS[storyRun.chapterIndex] || STORY_CHAPTERS[0];
}

function getCurrentStoryEnemyId() {
    const chapter = getCurrentStoryChapter();
    return chapter?.encounters?.[storyRun.encounterIndex] || chapter?.encounters?.[0] || 'thug1';
}

function getStoryChapterProgressLabel() {
    return `Chapter ${storyRun.chapterIndex + 1} · Wave ${storyRun.encounterIndex + 1}`;
}

function initializeStoryRun() {
    storyRun.chapterIndex = 0;
    storyRun.encounterIndex = 0;
    storyRun.player1CharId = selections[1];
    storyRun.player2CharId = isStoryCoopMode() ? selections[2] : null;
    storyRun.onlineEnabled = isStoryCoopMode();
    storyRun.status = 'in_progress';
}

function advanceStoryRun() {
    const chapter = getCurrentStoryChapter();
    if (storyRun.encounterIndex < chapter.encounters.length - 1) {
        storyRun.encounterIndex += 1;
        storyRun.status = 'between_encounters';
        return 'encounter';
    }

    if (storyRun.chapterIndex < STORY_CHAPTERS.length - 1) {
        storyRun.chapterIndex += 1;
        storyRun.encounterIndex = 0;
        storyRun.status = 'between_encounters';
        return 'chapter';
    }

    storyRun.status = 'complete';
    return 'complete';
}

function resetStoryRun() {
    storyRun.chapterIndex = 0;
    storyRun.encounterIndex = 0;
    storyRun.player1CharId = null;
    storyRun.player2CharId = null;
    storyRun.onlineEnabled = false;
    storyRun.status = 'idle';
}

function syncStoryProgress(payload) {
    if (!payload) return;
    storyRun.chapterIndex = payload.chapterIndex ?? storyRun.chapterIndex;
    storyRun.encounterIndex = payload.encounterIndex ?? storyRun.encounterIndex;
    storyRun.player1CharId = payload.player1CharId ?? storyRun.player1CharId;
    storyRun.player2CharId = payload.player2CharId ?? storyRun.player2CharId;
    storyRun.onlineEnabled = payload.onlineEnabled ?? storyRun.onlineEnabled;
    storyRun.status = payload.status ?? storyRun.status;
}

function getPortraitPath(charId) {
    return `/characters/portrait_${CHARACTERS[charId].name}.png`;
}

function isMobilePortraitLayout() {
    return window.matchMedia('(max-width: 600px) and (orientation: portrait), (max-width: 480px)').matches;
}

function applySelectorLayoutMode() {
    const selectorScreen = document.getElementById('selector-screen');
    const singlePane = !(isOnlineVersusMode() || isStoryCoopMode());
    selectorScreen.classList.toggle('single-pane-selector', singlePane);
    document.body.classList.toggle('selector-mobile-portraits', singlePane && isMobilePortraitLayout());
}

function buildTournamentLadder(selectedCharId) {
    const opponents = Object.keys(CHARACTERS).filter(charId => charId !== selectedCharId);
    const shuffled = opponents.sort(() => Math.random() - 0.5);
    shuffled.push(selectedCharId);
    return shuffled;
}

function getCurrentLadderOpponent() {
    return tournamentRun.ladder[tournamentRun.currentIndex] || selections[2];
}

function startSinglePlayerRun(selectedCharId) {
    tournamentRun.playerCharId = selectedCharId;
    tournamentRun.ladder = buildTournamentLadder(selectedCharId);
    tournamentRun.currentIndex = 0;
    tournamentRun.status = 'in_progress';
    selections[1] = selectedCharId;
    selections[2] = getCurrentLadderOpponent();
}

function advanceTournamentRun() {
    tournamentRun.currentIndex += 1;
    if (tournamentRun.currentIndex >= tournamentRun.ladder.length) {
        tournamentRun.status = 'complete';
        return false;
    }

    selections[2] = getCurrentLadderOpponent();
    tournamentRun.status = 'between_rounds';
    return true;
}

function endTournamentRun(result) {
    tournamentRun.status = result;
}

function renderTournamentLadder(result = 'advance') {
    const ladderTitle = document.getElementById('ladder-title');
    const ladderSubtitle = document.getElementById('ladder-subtitle');
    const ladderPlayerName = document.getElementById('ladder-player-name');
    const ladderNextName = document.getElementById('ladder-next-name');
    const ladderRungs = document.getElementById('ladder-rungs');
    const continueBtn = document.getElementById('ladder-continue-btn');
    const nextOpponent = getCurrentLadderOpponent();

    ladderTitle.textContent = result === 'complete' ? 'Tournament Cleared' : 'Round Cleared';
    ladderSubtitle.textContent = result === 'complete'
        ? 'You ran the whole ladder. Step back into the menu when you are ready.'
        : `Advance to face ${CHARACTERS[nextOpponent].name}.`;
    ladderPlayerName.textContent = CHARACTERS[tournamentRun.playerCharId].name;
    ladderNextName.textContent = result === 'complete' ? 'Champion' : CHARACTERS[nextOpponent].name;
    continueBtn.textContent = result === 'complete' ? 'Play Again' : 'Continue';
    continueBtn.onclick = result === 'complete'
        ? () => showCharacterSelect()
        : () => window.continueTournament();

    ladderRungs.innerHTML = tournamentRun.ladder.map((charId, index) => {
        const rungState = index < tournamentRun.currentIndex
            ? 'complete'
            : index === tournamentRun.currentIndex
                ? 'current'
                : 'pending';
        const status = rungState === 'complete'
            ? 'Cleared'
            : rungState === 'current'
                ? 'Next Fight'
                : 'Awaiting';

        return `
            <div class="ladder-rung ${rungState}">
                <span class="ladder-rung-label">Rung ${index + 1}</span>
                <div class="ladder-rung-art">
                    <img src="${getPortraitPath(charId)}" alt="${CHARACTERS[charId].name}">
                </div>
                <div class="ladder-rung-name">${CHARACTERS[charId].name}</div>
                <div class="ladder-rung-status">${status}</div>
            </div>
        `;
    }).join('');
}

function showTournamentLadderScreen(result = 'advance') {
    releaseAllTouchZones();
    document.getElementById('gameover-screen').style.display = 'none';
    document.getElementById('selector-screen').classList.add('hidden');
    document.getElementById('ladder-screen').classList.remove('hidden');
    document.getElementById('hud').style.display = 'none';
    removeFighterList(players);
    removeStoryEnemy();
    removeFighterList(previewFighters);
    renderTournamentLadder(result);
    playScreenMusic('characterSelect');
    updateViewportState();
}

function renderStoryProgressScreen(result = 'advance') {
    const chapter = getCurrentStoryChapter();
    const ladderTitle = document.getElementById('ladder-title');
    const ladderSubtitle = document.getElementById('ladder-subtitle');
    const ladderPlayerName = document.getElementById('ladder-player-name');
    const ladderNextName = document.getElementById('ladder-next-name');
    const ladderRungs = document.getElementById('ladder-rungs');
    const continueBtn = document.getElementById('ladder-continue-btn');
    const currentEnemy = ENEMIES[getCurrentStoryEnemyId()];

    ladderTitle.textContent = result === 'complete' ? 'Story Cleared' : chapter.title;
    ladderSubtitle.textContent = result === 'complete'
        ? 'The campaign route is clear. Step back in any time for another run.'
        : `${chapter.introText} ${getStoryChapterProgressLabel()}.`;
    ladderPlayerName.textContent = CHARACTERS[storyRun.player1CharId || selections[1]]?.name || 'Player 1';
    ladderNextName.textContent = currentEnemy?.name || 'Unknown Enemy';
    continueBtn.textContent = result === 'complete' ? 'Play Again' : 'Continue';
    continueBtn.onclick = result === 'complete'
        ? () => showCharacterSelect()
        : () => window.continueStory();

    ladderRungs.innerHTML = STORY_CHAPTERS.map((entry, index) => {
        const rungState = index < storyRun.chapterIndex
            ? 'complete'
            : index === storyRun.chapterIndex
                ? 'current'
                : 'pending';
        return `
            <div class="ladder-rung ${rungState}">
                <span class="ladder-rung-label">Chapter ${index + 1}</span>
                <div class="ladder-rung-name">${entry.title}</div>
                <div class="ladder-rung-status">${entry.encounters.map((enemyId) => ENEMIES[enemyId].name).join(' / ')}</div>
            </div>
        `;
    }).join('');
}

function showStoryProgressScreen(result = 'advance') {
    releaseAllTouchZones();
    document.getElementById('gameover-screen').style.display = 'none';
    document.getElementById('selector-screen').classList.add('hidden');
    document.getElementById('ladder-screen').classList.remove('hidden');
    document.getElementById('hud').style.display = 'none';
    removeFighterList(players);
    removeStoryEnemy();
    removeFighterList(previewFighters);
    renderStoryProgressScreen(result);
    playScreenMusic('characterSelect');
    updateViewportState();
}

window.continueTournament = function () {
    document.getElementById('ladder-screen').classList.add('hidden');
    tournamentRun.status = 'in_progress';
    if (tournamentRun.currentIndex >= tournamentRun.ladder.length) {
        showCharacterSelect();
        return;
    }
    startFight();
};

window.continueStory = function () {
    document.getElementById('ladder-screen').classList.add('hidden');
    storyRun.status = 'in_progress';
    startFight();
};

window.handlePortraitClick = function(charId) {
    let player = 1;
    if ((isOnlineVersusMode() || isStoryCoopMode()) && typeof isHost !== 'undefined' && !isHost) {
        player = 2;
    }
    selectCharacter(player, charId);
};


function selectCharacter(player, charId, isNetworkSync = false) {
    if (!(isOnlineVersusMode() || isStoryCoopMode())) player = 1;

    // If clicking the currently selected character, lock them in (double click confirm)
    if (!isNetworkSync && selections[player] === charId && !((player === 1 && p1Locked) || (player === 2 && p2Locked))) {
        lockInPlayer(player);
        return;
    }

    AudioSynth.playSelect();
    selections[player] = charId;
    if (!isNetworkSync && (isOnlineVersusMode() || isStoryCoopMode()) && conn && conn.open) {
        conn.send({ type: 'select', player, charId });
    }

    // Update cards in the player's side-panel (legacy hidden grid)
    const panel = document.getElementById(`p${player}-select-panel`);
    if (panel) {
        panel.querySelectorAll('.character-card').forEach(card => {
            card.classList.toggle('selected', card.dataset.char === charId);
        });
    }

    // Update cards in the shared portrait bar at the top
    const mainPortraitRow = document.getElementById('main-portrait-row');
    if (mainPortraitRow) {
        mainPortraitRow.querySelectorAll('.character-card').forEach(card => {
            card.classList.toggle('selected', card.dataset.char === charId);
        });
    }

    document.getElementById(`p${player}-preview-name`).textContent = CHARACTERS[charId].name;
    document.getElementById('select-player-state').textContent = isArcadeMode()
        ? 'Tournament fighter selected'
        : isStoryMode()
            ? 'Story fighter selected'
            : (isOnlineVersusMode() ? '' : 'Ready your fighter');
    refreshCharacterSelectPreviews();

    // The single preview model is always at index 0
    const previewActor = previewFighters[0];
    if (previewActor && previewActor.actions && previewActor.actions['taunt']) {
        const tauntAction = previewActor.actions['taunt'];
        tauntAction.setLoop(THREE.LoopPingPong, Infinity);
        tauntAction.clampWhenFinished = false;
        playPreferredAction(previewActor, 'taunt', 'standingPose', 0.1);
    }
}

window.lockInPlayer = function (player, isNetworkSync = false) {
    if (!(isOnlineVersusMode() || isStoryCoopMode())) player = 1;
    AudioSynth.playSelect();
    if (player === 1) {
        p1Locked = true;
        document.getElementById('p1-locked-status').style.display = 'block';
        document.getElementById('p1-lock-btn').style.display = 'none';
        if (!isNetworkSync && (isOnlineVersusMode() || isStoryCoopMode()) && conn && conn.open) {
            conn.send({ type: 'lockIn', player: 1 });
        }
    } else if (player === 2) {
        p2Locked = true;
        document.getElementById('p2-locked-status').style.display = 'block';
        document.getElementById('p2-lock-btn').style.display = 'none';
        if (!isNetworkSync && (isOnlineVersusMode() || isStoryCoopMode()) && conn && conn.open) {
            conn.send({ type: 'lockIn', player: 2 });
        }
    }

    // Refresh previews to immediately focus on next player (if any)
    refreshCharacterSelectPreviews();

    if (isArcadeMode()) {
        startSinglePlayerRun(selections[1]);
    } else if (isStoryMode() && storyRun.status === 'idle') {
        initializeStoryRun();
    }

    const everyoneReady = isStoryCoopMode() || isOnlineVersusMode() ? (p1Locked && p2Locked) : p1Locked;
    if (everyoneReady) {
        setTimeout(() => { startFight(); }, 500);
    }
};

function refreshCharacterSelectPreviews() {
    if (document.getElementById('selector-screen').classList.contains('hidden')) return;

    removeFighterList(previewFighters);

    if (isArcadeMode()) {
        selections[2] = tournamentRun.playerCharId ? getCurrentLadderOpponent() : selections[2];
    }

    let activePlayer = 1;
    if ((isOnlineVersusMode() || isStoryCoopMode()) && typeof isHost !== 'undefined' && !isHost) {
        activePlayer = 2;
    }

    // Sync the top portrait bar with the active player's selection
    const mainPortraitRow = document.getElementById('main-portrait-row');
    if (mainPortraitRow) {
        mainPortraitRow.querySelectorAll('.character-card').forEach(card => {
            card.classList.toggle('selected', card.dataset.char === selections[activePlayer]);
        });
    }

    document.getElementById('select-opponent-name').textContent = isStoryMode()
        ? `${getCurrentStoryChapter().title} · ${ENEMIES[getCurrentStoryEnemyId()]?.name || getCurrentStoryEnemyId()}`
        : CHARACTERS[selections[2]].name;

    if (!(isOnlineVersusMode() || isStoryCoopMode()) && isMobilePortraitLayout()) {
        setCameraMode('select', { shotDurationMs: 2000 });
        return;
    }

    const preview = spawnFighter(selections[activePlayer], 0.0, true);
    setPresentationRotation(preview, 'select');
    preview.mesh.position.y = 0.58;
    preview.mesh.position.z = 3.2; // Zoomed out a little bit
    if (selections[activePlayer] === 'jonah') {
        preview.mesh.position.z += 1.0; // Fix Jonah displaying too far back
    }
    playPreferredAction(preview, 'idle', 'standingPose', 0.01);
    previewFighters.push(preview);
    startPreviewTauntCycle(preview);

    setCameraMode('select', { shotDurationMs: 2000 });
}

function showCharacterSelect() {
    clearScheduledEvents();
    clearInterval(timerInterval);
    gameActive = false;
    simSuspended = false;
    stopReplayPlayback();
    stopReplayRecording();
    setTrainingHudVisible(false);
    releaseAllTouchZones();
    p1Locked = false;
    p2Locked = false;
    globalTimeScale = 1.0;
    slowMoTimer = 0;

    document.getElementById('gameover-screen').style.display = 'none';
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('story-menu').style.display = 'none';
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('options-menu').style.display = 'none';
    document.getElementById('ladder-screen').classList.add('hidden');
    document.getElementById('selector-screen').classList.remove('hidden');
    document.getElementById('hud').style.display = 'none';
    document.getElementById('select-mode-kicker').textContent = isTrainingMode()
        ? 'Training Lab'
        : isArcadeMode()
            ? 'Arcade Tournament Ladder'
            : isStoryMode()
                ? (isStoryCoopMode() ? 'Online Co-op Story' : 'Solo Story')
                : isOnlineVersusMode()
                    ? 'Online Match Setup'
                    : 'Local Exhibition';
    document.getElementById('select-rules-title').textContent = isTrainingMode()
        ? 'Training Lab'
        : isArcadeMode()
            ? 'Arcade'
            : isStoryMode()
                ? 'Story Mode'
                : isOnlineVersusMode()
                    ? 'Online Multiplayer'
                    : 'Local Multiplayer';
    document.getElementById('select-rules-desc').textContent = isTrainingMode()
        ? 'Practice against a configurable dummy. B toggles block, F freezes, N steps a frame, R resets, H shows hitboxes.'
        : isArcadeMode()
            ? 'Choose one fighter and climb the full tournament ladder.'
            : isStoryMode()
                ? (isStoryCoopMode()
                    ? 'Both players lock in heroes, then fight through sequential thug encounters online.'
                    : 'Choose one fighter and clear each chapter of the thug campaign.')
            : isOnlineVersusMode()
                ? 'Each player locks in a fighter before the match starts.'
                : 'Pick a fighter and jump straight into a local exhibition.';
    document.getElementById('select-player-state').textContent = isTrainingMode()
        ? 'Choose your fighter (Player 2 is the dummy)'
        : isArcadeMode()
            ? 'Choose your tournament fighter'
            : isStoryMode()
                ? 'Choose your story fighter'
                : (isOnlineVersusMode() ? '' : 'Choose your fighter');

    selectSpotlightP1.visible = true;
    selectSpotlightP2.visible = true;
    actionSpotlight.visible = false;
    
    setFightEnvironmentVisible(false);
    setSelectEnvironmentVisible(true);

    document.getElementById('p1-locked-status').style.display = 'none';
    document.getElementById('p1-lock-btn').style.display = 'block';
    document.getElementById('p2-locked-status').style.display = 'none';
    document.getElementById('p2-lock-btn').style.display = 'block';

    if (isArcadeMode()) {
        tournamentRun.playerCharId = null;
        tournamentRun.ladder = [];
        tournamentRun.currentIndex = 0;
        tournamentRun.status = 'idle';
        selections[2] = 'jonah';
        resetStoryRun();
    } else if (isStoryMode()) {
        resetStoryRun();
    } else {
        tournamentRun.status = 'idle';
        resetStoryRun();
    }

    applySelectorLayoutMode();

    removeFighterList(players);
    removeStoryEnemy();
    removeFighterList(previewFighters);
    refreshCharacterSelectPreviews();
    playScreenMusic('characterSelect');
    updateViewportState();
}

// --- 5. INITIAL ENGINE SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c0b1f);
scene.fog = new THREE.FogExp2(0x0c0b1f, 0.045);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 3.5, 9.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
scene.add(ambientLight);

const actionSpotlight = new THREE.SpotLight(0xa855f7, 2.5, 25, Math.PI / 4.5, 0.5, 1);
actionSpotlight.position.set(0, 10, 0);
actionSpotlight.castShadow = true;
actionSpotlight.shadow.mapSize.width = 1024;
actionSpotlight.shadow.mapSize.height = 1024;
actionSpotlight.shadow.bias = -0.001;
scene.add(actionSpotlight);

const selectSpotlightP1 = new THREE.SpotLight(0xffffff, 4.0, 30, Math.PI / 4, 0.5, 1);
selectSpotlightP1.position.set(-1.0, 6, 7);
selectSpotlightP1.target.position.set(0.0, 1.5, 3.8);
selectSpotlightP1.castShadow = true;
scene.add(selectSpotlightP1);
scene.add(selectSpotlightP1.target);

const selectSpotlightP2 = new THREE.SpotLight(0xffffff, 4.0, 30, Math.PI / 4, 0.5, 1);
selectSpotlightP2.position.set(1.0, 6, 7);
selectSpotlightP2.target.position.set(0.0, 1.5, 3.8);
selectSpotlightP2.castShadow = true;
scene.add(selectSpotlightP2);
scene.add(selectSpotlightP2.target);

const blueRimLight = new THREE.DirectionalLight(0x00f0ff, 0.9);
blueRimLight.position.set(-8, 5, -2);
scene.add(blueRimLight);

const redRimLight = new THREE.DirectionalLight(0xff007f, 0.9);
redRimLight.position.set(8, 5, -2);
scene.add(redRimLight);

const floorGeo = new THREE.BoxGeometry(22, 0.5, 7);
const floorMat = new THREE.MeshStandardMaterial({
    color: 0x111026,
    roughness: 0.15,
    metalness: 0.8
});
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.position.y = -0.25;
floor.receiveShadow = true;
scene.add(floor);

const gridHelper = new THREE.GridHelper(22, 22, 0xbd00ff, 0x1f1947);
gridHelper.position.y = 0.01;
scene.add(gridHelper);

selectSceneRoot = new THREE.Group();
selectSceneRoot.visible = false;
scene.add(selectSceneRoot);

const selectBackdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 12),
    new THREE.MeshBasicMaterial({
        color: 0x0f1531,
        transparent: true,
        opacity: 0.92
    })
);
selectBackdrop.position.set(0, 4.1, -8.4);
selectSceneRoot.add(selectBackdrop);

const selectBackdropGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 9.6),
    new THREE.MeshBasicMaterial({
        color: 0x1d2f6f,
        transparent: true,
        opacity: 0.24
    })
);
selectBackdropGlow.position.set(0, 4.1, -8.2);
selectSceneRoot.add(selectBackdropGlow);

const selectFloor = new THREE.Mesh(
    new THREE.CylinderGeometry(4.3, 5.8, 0.5, 48),
    new THREE.MeshStandardMaterial({
        color: 0x11172f,
        emissive: 0x0e1f4f,
        emissiveIntensity: 0.18,
        roughness: 0.48,
        metalness: 0.45
    })
);
selectFloor.position.set(0, -0.26, 3.72);
selectFloor.receiveShadow = true;
selectFloor.castShadow = false;
selectSceneRoot.add(selectFloor);

const selectRing = new THREE.Mesh(
    new THREE.TorusGeometry(5.15, 0.11, 18, 90),
    new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.85,
        roughness: 0.2,
        metalness: 0.8
    })
);
selectRing.rotation.x = Math.PI / 2;
selectRing.position.set(0, -0.01, 3.72);
selectSceneRoot.add(selectRing);

const selectColumnGeo = new THREE.CylinderGeometry(0.22, 0.22, 5.8, 24);
const selectColumnMat = new THREE.MeshStandardMaterial({
    color: 0x1d2748,
    emissive: 0x13254d,
    emissiveIntensity: 0.2,
    roughness: 0.4,
    metalness: 0.55
});
[
    [-7.2, 2.4, -5.2],
    [7.2, 2.4, -5.2],
    [-9.1, 2.7, -9.0],
    [9.1, 2.7, -9.0]
].forEach(([x, y, z]) => {
    const column = new THREE.Mesh(selectColumnGeo, selectColumnMat);
    column.position.set(x, y, z);
    column.castShadow = false;
    column.receiveShadow = false;
    selectSceneRoot.add(column);
});

const selectAccentLightA = new THREE.PointLight(0x00f0ff, 2.8, 18, 2);
selectAccentLightA.position.set(-5.8, 3.2, -1.8);
selectSceneRoot.add(selectAccentLightA);

const selectAccentLightB = new THREE.PointLight(0xff007f, 2.2, 18, 2);
selectAccentLightB.position.set(5.8, 3.1, -1.8);
selectSceneRoot.add(selectAccentLightB);

const wallGeo = new THREE.BoxGeometry(0.5, 1, 7);
const wallMat = new THREE.MeshBasicMaterial({ color: 0xbd00ff, transparent: true, opacity: 0.1 });
const leftWall = new THREE.Mesh(wallGeo, wallMat); leftWall.position.set(-10, 0.5, 0);
const rightWall = new THREE.Mesh(wallGeo, wallMat); rightWall.position.set(10, 0.5, 0);
scene.add(leftWall, rightWall);

// --- 6. COMIC PARTICLE EFFECTS FACTORY ---
const particles = [];
const hitRings = [];

function spawnHitRing(position, damage) {
    const ring = new THREE.Mesh(
        new THREE.RingGeometry(.06, .095, 20),
        new THREE.MeshBasicMaterial({ color: damage >= 11 ? 0xff4aa8 : 0xffdf45, transparent: true, opacity: .95, side: THREE.DoubleSide })
    );
    ring.position.copy(position);
    ring.lookAt(camera.position);
    scene.add(ring);
    hitRings.push({ mesh: ring, life: .1, maxLife: .1 });
}

// --- Focus Controls presentation ---
// Tempo ring: after a clean hit a ring shrinks over the attacker; it burns
// gold inside the perfect zone — tap Strike then for the fighter's tempo
// route. Charge aura: motif-colored sparks gather while holding Strike.
function getTempoRing(player) {
    if (!player.tempoRing) {
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.28, 0.36, 32),
            new THREE.MeshBasicMaterial({ color: 0xffd44d, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
        );
        ring.visible = false;
        scene.add(ring);
        player.tempoRing = ring;
    }
    return player.tempoRing;
}

function setTempoRingVisible(player, visible) {
    if (player?.tempoRing) {
        player.tempoRing.visible = visible;
        if (!visible) player.tempoRing.material.opacity = 0;
    }
}

let focusHintEl = null;

function updateFocusPresentation(p) {
    if (!p?.mesh) return;
    const c = p.combat;
    const active = gameActive && isFocusScheme() && c && !p.isDead && (c.tempoFrames || 0) > 0 && isHumanFighter(p);
    const ring = p.tempoRing || (active ? getTempoRing(p) : null);
    if (ring) {
        if (!active) {
            ring.visible = false;
        } else {
            const t = c.tempoFrames;
            const perfect = t >= TEMPO_PERFECT_LO && t <= TEMPO_PERFECT_HI;
            ring.visible = true;
            ring.position.set(p.mesh.position.x, 2.35, p.mesh.position.z);
            ring.lookAt(camera.position);
            const progress = 1 - t / TEMPO_WINDOW;
            ring.scale.setScalar(1.6 - progress * 0.9);
            ring.material.color.setHex(perfect ? 0xffd44d : 0xffffff);
            ring.material.opacity = perfect ? 0.95 : 0.35 + 0.2 * Math.sin(performance.now() / 90);
        }
    }
    // Charge aura while holding Strike (presentation-only; sim never reads it).
    if (gameActive && isFocusScheme() && c && !p.isDead && c.focusCharging && isHumanFighter(p) && (c.simFrame & 3) === 0) {
        const pos = p.mesh.position.clone();
        pos.y += 1.1;
        spawnParticles(pos, 'shield', 3, getFocusMotif(p.charId));
    }
    if (p.id === 1) updateFocusHint(p);
}

function updateFocusHint(p) {
    if (!focusHintEl) focusHintEl = document.getElementById('focus-hint');
    if (!focusHintEl) return;
    const c = p.combat;
    let text = '';
    let perfect = false;
    if (isFocusScheme() && c && !p.isDead && isHumanFighter(p)) {
        const t = c.tempoFrames || 0;
        if (t >= TEMPO_PERFECT_LO && t <= TEMPO_PERFECT_HI) {
            const actions = playerActionState(p.id);
            const towardHeld = isActionHeld(actions, p.direction === 1 ? ACTION.MOVE_RIGHT : ACTION.MOVE_LEFT);
            const awayHeld = isActionHeld(actions, p.direction === 1 ? ACTION.MOVE_LEFT : ACTION.MOVE_RIGHT);
            const kind = selectTempoRoute({ towardHeld, awayHeld }).replace('focus', '').toLowerCase();
            text = `PERFECT — Strike: ${getFocusMoveName(p.charId, kind)}`;
            perfect = true;
        } else if (c.focusCharging) {
            const frames = c.focusChargeFrames || 0;
            const maxed = frames >= CHARGE_LEVEL_2;
            const leveled = frames >= CHARGE_LEVEL_1;
            text = `Charging ${getFocusMoveName(p.charId, maxed ? 'charge2' : 'charge1')} — ${maxed ? 'MAX' : leveled ? 'Lv1' : '…'}`;
        } else if (t > 0) {
            text = 'Tempo… wait for gold';
        }
    }
    focusHintEl.textContent = text;
    focusHintEl.classList.toggle('perfect', perfect);
    focusHintEl.style.display = text ? 'block' : 'none';
}

/**
 * Spawn comic-style hit particles.
 *
 * @param {THREE.Vector3} position   world-space origin
 * @param {'hit'|'guard'|'guardbreak'|'super'|'shield'|'confetti'|'landing'|'dash'} type
 * @param {number} count             number of pieces (default varies by type)
 * @param {number[]|null} colorOverride  optional palette replacing the type's colors
 */
function spawnParticles(position, type = 'hit', count = -1, colorOverride = null) {
    // --- Type definitions ---
    const TYPES = {
        // Direct hit — bright star-burst pieces in punch yellow/orange
        hit: {
            count: count < 0 ? 22 : count,
            colors: [0xFFE000, 0xFF8C00, 0xFF4500, 0xFFFFFF],
            size: () => Math.random() * 0.045 + 0.02,
            shape: 'star',
            spread: 3.2,
            upBias: 0.6,
            gravity: 12,
            life: () => Math.random() * 0.7 + 0.55,
            decay: () => Math.random() * 1.4 + 1.0,
            spin: true,
        },
        // Heavy KO hit — large POW stars, purple/pink
        super: {
            count: count < 0 ? 32 : count,
            colors: [0xBD00FF, 0xFF007F, 0xFF4500, 0xFFE000, 0xFFFFFF],
            size: () => Math.random() * 0.07 + 0.03,
            shape: 'diamond',
            spread: 4.5,
            upBias: 0.9,
            gravity: 9,
            life: () => Math.random() * 0.8 + 0.7,
            decay: () => Math.random() * 1.0 + 0.8,
            spin: true,
        },
        // Guard block — cyan sparks, ring outward
        guard: {
            count: count < 0 ? 14 : count,
            colors: [0x00F0FF, 0x80FFFF, 0xFFFFFF],
            size: () => Math.random() * 0.032 + 0.016,
            shape: 'box',
            spread: 2.0,
            upBias: 0.0,
            gravity: 3,
            life: () => Math.random() * 0.5 + 0.35,
            decay: () => Math.random() * 2.0 + 1.5,
            spin: false,
            radial: true,   // emit radially outward, no upward bias
        },
        // Guard break — white shard explosion
        guardbreak: {
            count: count < 0 ? 40 : count,
            colors: [0xFFFFFF, 0xE0E0FF, 0xBD00FF, 0xFF007F],
            size: () => Math.random() * 0.058 + 0.024,
            shape: 'diamond',
            spread: 5.0,
            upBias: 0.5,
            gravity: 14,
            life: () => Math.random() * 0.9 + 0.6,
            decay: () => Math.random() * 1.2 + 0.7,
            spin: true,
        },
        // Shield / energy ring
        shield: {
            count: count < 0 ? 12 : count,
            colors: [0x00F0FF, 0x0080FF, 0x80FFFF],
            size: () => Math.random() * 0.03 + 0.016,
            shape: 'box',
            spread: 2.2,
            upBias: 0.0,
            gravity: 0,
            life: () => Math.random() * 0.45 + 0.3,
            decay: () => Math.random() * 2.5 + 1.8,
            spin: false,
            radial: true,
        },
        // Confetti — multi-color flat quads thrown upward (victory / special)
        confetti: {
            count: count < 0 ? 50 : count,
            colors: [0xFF007F, 0x00F0FF, 0xFFE000, 0xBD00FF, 0x00FF88, 0xFF4500],
            size: () => Math.random() * 0.04 + 0.018,
            shape: 'flat',
            spread: 5.0,
            upBias: 2.2,
            gravity: 6,
            life: () => Math.random() * 1.2 + 0.9,
            decay: () => Math.random() * 0.8 + 0.5,
            spin: true,
        },
        // Landing dust — grey puffs
        landing: {
            count: count < 0 ? 10 : count,
            colors: [0xAAAAAA, 0x888888, 0xCCCCCC],
            size: () => Math.random() * 0.03 + 0.014,
            shape: 'box',
            spread: 1.6,
            upBias: 0.4,
            gravity: 5,
            life: () => Math.random() * 0.5 + 0.3,
            decay: () => Math.random() * 2.0 + 1.5,
            spin: false,
        },
        // Dash burst — white ring
        dash: {
            count: count < 0 ? 8 : count,
            colors: [0xFFFFFF, 0xCCEEFF],
            size: () => Math.random() * 0.028 + 0.014,
            shape: 'box',
            spread: 1.8,
            upBias: 0.2,
            gravity: 4,
            life: () => Math.random() * 0.4 + 0.2,
            decay: () => Math.random() * 2.5 + 2.0,
            spin: false,
            radial: true,
        },
    };

    const def = TYPES[type] || TYPES.hit;
    const palette = colorOverride || def.colors;

    for (let i = 0; i < def.count; i++) {
        const colorHex = palette[Math.floor(Math.random() * palette.length)];
        const s = def.size();

        let geo;
        if (def.shape === 'star') {
            // Flattened octahedron approximation for a star-like shard
            geo = new THREE.OctahedronGeometry(s, 0);
        } else if (def.shape === 'diamond') {
            geo = new THREE.OctahedronGeometry(s, 0);
        } else if (def.shape === 'flat') {
            geo = new THREE.BoxGeometry(s * 2.5, s * 0.3, s);
        } else {
            geo = new THREE.BoxGeometry(s, s, s);
        }

        const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 1 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(position);
        // Random vertical offset so pieces don't all originate from one point
        mesh.position.y += Math.random() * 0.6;

        let velocity;
        if (def.radial) {
            const angle = (i / def.count) * Math.PI * 2 + Math.random() * 0.4;
            const r = (Math.random() * 0.5 + 0.5) * def.spread;
            velocity = new THREE.Vector3(
                Math.cos(angle) * r,
                def.upBias * (Math.random() * 0.5 + 0.5),
                Math.sin(angle) * r * 0.4
            );
        } else {
            velocity = new THREE.Vector3(
                (Math.random() * 2 - 1) * def.spread,
                (Math.random() + def.upBias) * def.spread * 0.6,
                (Math.random() * 2 - 1) * def.spread * 0.4
            );
        }

        const spinRate = def.spin
            ? new THREE.Vector3(
                (Math.random() - 0.5) * 12,
                (Math.random() - 0.5) * 12,
                (Math.random() - 0.5) * 12
            )
            : null;

        scene.add(mesh);
        particles.push({
            mesh,
            velocity,
            spinRate,
            gravity: def.gravity,
            life: def.life(),
            decay: def.decay(),
        });
    }
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.mesh.position.addScaledVector(p.velocity, dt);
        p.velocity.y -= p.gravity * dt;

        if (p.spinRate) {
            p.mesh.rotation.x += p.spinRate.x * dt;
            p.mesh.rotation.y += p.spinRate.y * dt;
            p.mesh.rotation.z += p.spinRate.z * dt;
        }

        p.life -= p.decay * dt;
        p.mesh.material.opacity = Math.max(0, p.life);
        p.mesh.scale.setScalar(Math.max(0.01, p.life));

        if (p.life <= 0) {
            scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
            particles.splice(i, 1);
        }
    }
    for (let index = hitRings.length - 1; index >= 0; index--) {
        const ring = hitRings[index];
        ring.life -= dt;
        const progress = 1 - Math.max(0, ring.life) / ring.maxLife;
        ring.mesh.scale.setScalar(1 + progress * 8);
        ring.mesh.material.opacity = Math.max(0, 1 - progress);
        if (ring.life <= 0) {
            scene.remove(ring.mesh);
            ring.mesh.geometry.dispose();
            ring.mesh.material.dispose();
            hitRings.splice(index, 1);
        }
    }
}

// --- 7. FIGHTER MODEL GENERATOR FACTORY ---
function getFighterProfile(fighterId, options = {}) {
    return options.profile || CHARACTERS[fighterId] || ENEMIES[fighterId] || null;
}

function cloneSkinnedMesh(source) {
    return cloneSkeleton(source);
}

let players = [];
let previewFighters = [];
let storyEnemy = null;
const activeEnemies = [];
const scheduledEvents = [];
const cameraDirector = {
    mode: 'select',
    focusPlayerId: 1,
    winnerId: 0,
    modeStartedAt: performance.now(),
    shotDurationMs: 2200
};

const INTRO_DROP_HEIGHT = 0;
const INTRO_STAGGER_MS = 240;
const TAUNT_BUFFER_MS = 220;

function scheduleEvent(callback, delayMs) {
    const id = setTimeout(callback, delayMs);
    scheduledEvents.push(id);
    return id;
}

function clearScheduledEvents() {
    while (scheduledEvents.length > 0) {
        clearTimeout(scheduledEvents.pop());
    }
}

function setCameraMode(mode, options = {}) {
    cameraDirector.mode = mode;
    cameraDirector.focusPlayerId = options.focusPlayerId ?? cameraDirector.focusPlayerId;
    cameraDirector.winnerId = options.winnerId ?? cameraDirector.winnerId;
    cameraDirector.shotDurationMs = options.shotDurationMs ?? cameraDirector.shotDurationMs;
    cameraDirector.modeStartedAt = performance.now();
}

function setPresentationRotation(actor, phase = 'select') {
    if (!actor || !actor.mesh) return;

    if (phase === 'combat') {
        actor.mesh.rotation.y = actor.id === 1 ? Math.PI / 2 : -Math.PI / 2;
        return;
    }

    const rotationByPhase = {
        select: 0.46,
        intro: 0.18,
        taunt: 0.26
    };

    const baseRotation = rotationByPhase[phase] ?? 0.3;
    actor.mesh.rotation.y = actor.id === 1 ? baseRotation : -baseRotation;
}

function startPreviewTauntCycle(fighter) {
    if (!fighter) return;

    const scheduleNextTaunt = () => {
        const delay = 5000 + Math.random() * 2000;
        fighter._tauntInterval = setTimeout(() => {
            if (!fighter.mesh || !fighter.actions) return;

            const tauntAction = fighter.actions['taunt'];
            if (tauntAction) {
                tauntAction.setLoop(THREE.LoopOnce, 1);
                tauntAction.clampWhenFinished = true;
                playPreferredAction(fighter, 'taunt', 'idle', 0.15);

                const tauntDuration = tauntAction.getClip().duration / (getActionTimeScale(fighter, 'taunt') || 1);
                fighter._returnToIdleTimeout = setTimeout(() => {
                    if (!fighter.mesh || !fighter.actions) return;
                    playPreferredAction(fighter, 'idle', 'standingPose', 0.25);
                    scheduleNextTaunt();
                }, (tauntDuration + 0.3) * 1000);
            } else {
                scheduleNextTaunt();
            }
        }, delay);
    };

    scheduleNextTaunt();
}

function updateViewportState() {
    const isTouchDevice =
        (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
    const isTouchLandscape = isTouchDevice && window.matchMedia('(orientation: landscape)').matches;

    document.body.classList.toggle('touch-landscape', isTouchLandscape);
    applySelectorLayoutMode();

    if (!document.getElementById('selector-screen').classList.contains('hidden')) {
        removeFighterList(previewFighters);
        refreshCharacterSelectPreviews();
    }

    const isGameplayActive =
        gameActive &&
        !gamePaused &&
        document.getElementById('selector-screen').classList.contains('hidden') &&
        document.getElementById('hud').style.display !== 'none';

    document.documentElement.classList.toggle('gameplay-touch-lock', isGameplayActive);
    if (!isGameplayActive) lastGameplayTap = null;

    const shouldShowTouchControls = isTouchDevice && isGameplayActive;

    const touchControls = document.getElementById('touch-controls');
    if (touchControls) {
        touchControls.classList.toggle('active', shouldShowTouchControls);
    }
    if (!shouldShowTouchControls) releaseAllTouchZones();

    refreshTouchZones();
    if (shouldShowTouchControls) maybeShowZoneHint();

    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) {
        pauseBtn.style.display = isGameplayActive ? 'flex' : 'none';
    }
}

// --- Touch combat zones ---
//
// The touch surface is divided into invisible screen quadrants instead of
// buttons: the left side owns movement and defense, the right side owns
// attacks. Tapping a zone presses its action; holding works for block,
// strike charge, and movement. Touches are tracked by identifier so
// holding block on the left while striking on the right works.

let touchZoneDefs = []; // { x, y, w, h, action, player, label, el }
let touchZoneConfigKey = '';
const touchZoneTouches = new Map(); // touch identifier -> zone def

function localPlayerId() {
    return (isOnlineVersusMode() || isStoryCoopMode()) ? (isHost ? 1 : 2) : 1;
}

function zoneActionDown(zone) {
    const state = playerActionState(zone.player);
    pressAction(state, zone.action);
    handleActionPress(zone.player, zone.action, false);
    zone.el.classList.add('fired');
}

function zoneActionUp(touchId) {
    const zone = touchZoneTouches.get(touchId);
    if (!zone) return;
    releaseAction(playerActionState(zone.player), zone.action);
    zone.el.classList.remove('fired');
    touchZoneTouches.delete(touchId);
}

// Release every zone-held action (pause, mode change, hidden tab, ...).
function releaseAllTouchZones() {
    for (const touchId of [...touchZoneTouches.keys()]) zoneActionUp(touchId);
}

function zoneAt(clientX, clientY) {
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    return touchZoneDefs.find((z) =>
        clientX >= z.x * w && clientX < (z.x + z.w) * w &&
        clientY >= z.y * h && clientY < (z.y + z.h) * h) || null;
}

function buildTouchZones() {
    const container = document.getElementById('touch-zones');
    if (!container) return;
    releaseAllTouchZones();
    container.innerHTML = '';
    touchZoneDefs = [];

    const focus = isFocusScheme();
    const defs = [];
    const Z = (x, y, w, h, action, player, label) => defs.push({ x, y, w, h, action, player, label });

    // Movement / defense shapes.
    const moveQuad = (x0, player) => { // 2x2 inside a half-width block
        Z(x0, 0, 0.25, 0.5, ACTION.JUMP, player, 'Jump');
        Z(x0 + 0.25, 0, 0.25, 0.5, ACTION.BLOCK, player, 'Block');
        Z(x0, 0.5, 0.25, 0.5, ACTION.MOVE_LEFT, player, '\u25C0');
        Z(x0 + 0.25, 0.5, 0.25, 0.5, ACTION.MOVE_RIGHT, player, '\u25B6');
    };
    const moveColumn = (x0, player) => { // 4 stacked inside a quarter-width column
        Z(x0, 0, 0.25, 0.25, ACTION.JUMP, player, 'Jump');
        Z(x0, 0.25, 0.25, 0.25, ACTION.MOVE_LEFT, player, '\u25C0');
        Z(x0, 0.5, 0.25, 0.25, ACTION.MOVE_RIGHT, player, '\u25B6');
        Z(x0, 0.75, 0.25, 0.25, ACTION.BLOCK, player, 'Block');
    };
    // Attack shapes.
    const attackQuad = (x0, player) => { // classic 2x2 inside a half-width block
        Z(x0, 0, 0.25, 0.5, ACTION.PUNCH, player, 'Punch');
        Z(x0 + 0.25, 0, 0.25, 0.5, ACTION.KICK, player, 'Kick');
        Z(x0, 0.5, 0.25, 0.5, ACTION.SPECIAL, player, 'Special');
        Z(x0 + 0.25, 0.5, 0.25, 0.5, ACTION.THROW, player, 'Throw');
    };
    const attackColumn = (x0, player) => { // classic 4 stacked
        Z(x0, 0, 0.25, 0.25, ACTION.PUNCH, player, 'Punch');
        Z(x0, 0.25, 0.25, 0.25, ACTION.KICK, player, 'Kick');
        Z(x0, 0.5, 0.25, 0.25, ACTION.SPECIAL, player, 'Special');
        Z(x0, 0.75, 0.25, 0.25, ACTION.THROW, player, 'Throw');
    };
    const focusAttacks = (x0, w, player) => { // focus: two tall zones
        Z(x0, 0, w, 0.5, ACTION.STRIKE, player, 'Strike');
        Z(x0, 0.5, w, 0.5, ACTION.SPECIAL, player, 'Special');
    };

    if (gameMode === MODE.LOCAL_VERSUS) {
        // Each player owns half the screen, mirrored: movement on the
        // outside column, attacks on the inside column.
        for (const player of [1, 2]) {
            const leftSide = player === 1;
            moveColumn(leftSide ? 0 : 0.75, player);
            const atkX = leftSide ? 0.25 : 0.5;
            if (focus) focusAttacks(atkX, 0.25, player);
            else attackColumn(atkX, player);
        }
    } else {
        const player = localPlayerId();
        moveQuad(0, player);
        if (focus) focusAttacks(0.5, 0.5, player);
        else attackQuad(0.5, player);
    }

    for (const def of defs) {
        const el = document.createElement('div');
        el.className = 'touch-zone';
        el.style.left = (def.x * 100) + '%';
        el.style.top = (def.y * 100) + '%';
        el.style.width = (def.w * 100) + '%';
        el.style.height = (def.h * 100) + '%';
        el.dataset.label = def.label;
        def.el = el;
        container.appendChild(el);
    }
    touchZoneDefs = defs;
}

// Rebuild the zones when the mode, scheme, or local player changes.
function refreshTouchZones() {
    const key = gameMode + '|' + controlScheme + '|' + localPlayerId();
    const container = document.getElementById('touch-zones');
    if (key === touchZoneConfigKey && container && container.childElementCount) return;
    touchZoneConfigKey = key;
    buildTouchZones();
}

// First-run coach marks: labeled zones that fade away after a few seconds.
function maybeShowZoneHint() {
    const hint = document.getElementById('touch-zones-hint');
    if (!hint || !hint.hidden || !touchZoneDefs.length) return;
    let seen = false;
    try { seen = localStorage.getItem('ff-touch-zones-hint') === '1'; } catch (err) { /* ignore */ }
    if (seen) return;
    hint.innerHTML = '';
    for (const def of touchZoneDefs) {
        const el = document.createElement('div');
        el.className = 'touch-zone-hint';
        el.style.left = (def.x * 100) + '%';
        el.style.top = (def.y * 100) + '%';
        el.style.width = (def.w * 100) + '%';
        el.style.height = (def.h * 100) + '%';
        el.textContent = def.label;
        hint.appendChild(el);
    }
    hint.hidden = false;
    hint.classList.remove('fading');
    clearTimeout(hint._hideTimer);
    hint._hideTimer = setTimeout(() => {
        hint.classList.add('fading');
        setTimeout(() => { hint.hidden = true; }, 650);
        try { localStorage.setItem('ff-touch-zones-hint', '1'); } catch (err) { /* ignore */ }
    }, 4000);
}

function initTouchZones() {
    const container = document.getElementById('touch-zones');
    if (!container || container.dataset.bound) {
        buildTouchZones();
        return;
    }
    container.dataset.bound = '1';

    container.addEventListener('touchstart', (event) => {
        event.preventDefault();
        for (const touch of event.changedTouches) {
            if (touchZoneTouches.has(touch.identifier)) continue;
            const zone = zoneAt(touch.clientX, touch.clientY);
            if (!zone) continue;
            touchZoneTouches.set(touch.identifier, zone);
            zoneActionDown(zone);
        }
    }, { passive: false });

    const endTouch = (event) => {
        event.preventDefault();
        for (const touch of event.changedTouches) zoneActionUp(touch.identifier);
    };
    container.addEventListener('touchend', endTouch, { passive: false });
    container.addEventListener('touchcancel', endTouch, { passive: false });
    container.addEventListener('contextmenu', (event) => event.preventDefault());

    const refreshTouchViewport = () => {
        releaseAllTouchZones();
        updateViewportState();
    };

    window.addEventListener('resize', refreshTouchViewport);
    window.addEventListener('orientationchange', refreshTouchViewport);
    window.visualViewport?.addEventListener('resize', refreshTouchViewport);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) releaseAllTouchZones();
    });
    buildTouchZones();
}

function removeFighterList(list) {
    list.forEach((fighter) => {
        if (fighter && fighter.mesh) {
            scene.remove(fighter.mesh);
        }
        // Focus Controls: dispose the tempo ring (it lives on the scene,
        // not on the fighter mesh).
        if (fighter && fighter.tempoRing) {
            scene.remove(fighter.tempoRing);
            fighter.tempoRing.geometry.dispose();
            fighter.tempoRing.material.dispose();
            fighter.tempoRing = null;
        }
        if (fighter && fighter._tauntInterval) {
            clearTimeout(fighter._tauntInterval);
            fighter._tauntInterval = null;
        }
        if (fighter && fighter._returnToIdleTimeout) {
            clearTimeout(fighter._returnToIdleTimeout);
            fighter._returnToIdleTimeout = null;
        }
    });
    list.length = 0;
}

function removeStoryEnemy() {
    // A defeated enemy has already left activeEnemies, but its mesh stays for
    // the victory beat. Remove that retained scene object before the next wave.
    if (storyEnemy?.mesh) scene.remove(storyEnemy.mesh);
    storyEnemyManager.clear();
    storyEnemy = null;
}

function getActiveCombatants() {
    return [...players, ...(storyEnemy ? [storyEnemy] : [])].filter(Boolean);
}

function findCombatantById(id) {
    return getActiveCombatants().find((actor) => actor.id === id) || null;
}

function playPreferredAction(actor, actionName, fallback = 'idle', fade = 0.12) {
    if (!actor || !actor.actions) return;
    const resolvedAction = actor.actions[actionName] ? actionName : fallback;
    if (resolvedAction && actor.actions[resolvedAction]) {
        actor.fadeTo(resolvedAction, fade, getActionTimeScale(actor, resolvedAction));
    }
}

function getActionTimeScale(actor, actionName) {
    if (!actor || !actor.actions || !actor.actions[actionName]) return 1;

    const targetDurations = {
        intro: 2.45,
        taunt: 2.25,
        victory: 8.0
    };

    const targetDuration = targetDurations[actionName];
    if (!targetDuration) return 1;

    const clipDuration = actor.actions[actionName].getClip().duration;
    return THREE.MathUtils.clamp(clipDuration / targetDuration, 1, 3);
}

function getRandomDeathAction(actor) {
    if (!actor || !actor.actions) return null;
    const available = Array.from(DEATH_ACTION_KEYS).filter((actionName) => actor.actions[actionName]);
    if (available.length === 0) return null;
    return available[Math.floor(simRandom() * available.length)];
}

function isRootMotionNode(nodeName = '') {
    const normalizedName = nodeName.toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalizedName === 'hips' ||
        normalizedName === 'root' ||
        normalizedName === 'pelvis' ||
        normalizedName === 'armature' ||
        normalizedName === 'mixamorighips' ||
        /(^|\/)(rootnode|armature)$/i.test(nodeName);
}

function stripRootMotionFromClip(clip, model, referenceRootY = 0) {
    if (!clip) return;

    clip.tracks.forEach((track) => {
        const isVectorPositionTrack =
            track instanceof THREE.VectorKeyframeTrack ||
            track.name.endsWith('.position');
        if (!isVectorPositionTrack || !track.values || track.values.length < 3) return;

        const nodeName = track.name.split('.')[0] || '';
        if (!isRootMotionNode(nodeName)) return;

        const baseX = track.values[0];
        const baseY = track.values[1];
        const baseZ = track.values[2];
        // Mixamo clips store absolute root coordinates from their authoring
        // skeleton. Apply the target rig's rest pose instead, otherwise a
        // compact FBX enemy inherits an offset meant for a 50+ unit rig.
        const targetRoot = model?.getObjectByName(nodeName);
        const rootX = targetRoot?.position.x ?? baseX;
        const rootY = targetRoot?.position.y ?? (Number.isFinite(referenceRootY) ? referenceRootY : baseY);
        const rootZ = targetRoot?.position.z ?? baseZ;
        for (let i = 0; i < track.values.length; i += 3) {
            track.values[i] = rootX;
            track.values[i + 1] = rootY;
            track.values[i + 2] = rootZ;
        }
    });
}

function retargetClipForModel(clip, model) {
    if (!clip || !model) return clip;

    const availableNodes = new Set();
    model.traverse((child) => {
        if (child.name) availableNodes.add(child.name);
    });

    const retargetedTracks = [];
    clip.tracks.forEach((track) => {
        const [rawNodeName, propertyPath = ''] = track.name.split('.');
        if (!rawNodeName) return;

        let nodeName = rawNodeName;
        if (!availableNodes.has(nodeName)) {
            nodeName = nodeName.replace(/^mixamorig(?=[A-Z])/, 'mixamorig:');
        }
        if (!availableNodes.has(nodeName)) return;

        const clonedTrack = track.clone();
        clonedTrack.name = propertyPath ? `${nodeName}.${propertyPath}` : nodeName;
        retargetedTracks.push(clonedTrack);
    });

    const nextClip = clip.clone();
    nextClip.tracks = retargetedTracks;
    return nextClip;
}

function groundFighter(player) {
    if (!player || !player.mesh) return;
    player.mesh.position.y = GROUND_Y;
}

function sanitizeGroundedState(player, { preserveHitState = false } = {}) {
    if (!player) return;
    player.velocityY = 0;
    player.isJumping = false;
    player.jumps = 0;
    groundFighter(player);
    if (!preserveHitState && !player.combat) {
        player.isHit = false;
    }
}

function reconcileGroundedState(player, reason = '') {
    if (!player || !player.mesh) return;
    const airborneByJump = player.isJumping && (
        player.currentState === 'jumpUp' ||
        player.currentState === 'jumpDown' ||
        player.currentState === 'doubleJump'
    );
    if (airborneByJump) return;
    const preserveHitState = player.combat
        ? [FIGHTER_STATE.HITSTUN, FIGHTER_STATE.KNOCKDOWN, FIGHTER_STATE.GETUP].includes(player.combat.state)
        : player.isHit;
    sanitizeGroundedState(player, { preserveHitState });
}

function createPlayerMesh(charId, isPlayer1, options = {}) {
    const container = new THREE.Group();
    const profile = getFighterProfile(charId, options);

    const useBoxFallback = isFallbackMode || !loadedModels[charId];

    if (useBoxFallback) {
        const baseColor = profile?.color || 0xffffff;
        const torsoMat = new THREE.MeshStandardMaterial({
            color: baseColor,
            roughness: 0.1,
            metalness: 0.9,
            emissive: baseColor,
            emissiveIntensity: 0.25
        });

        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.5), torsoMat);
        torso.position.y = 1.1;
        torso.castShadow = true;
        torso.receiveShadow = true;
        container.add(torso);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), torsoMat);
        head.position.y = 1.9;
        head.castShadow = true;
        container.add(head);

        const dummyFist = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        dummyFist.name = "RightHand";
        dummyFist.position.set(0.5, 1.2, 0.4);
        container.add(dummyFist);

        const dummyFoot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        dummyFoot.name = "RightFoot";
        dummyFoot.position.set(0.4, 0.2, 0.4);
        container.add(dummyFoot);

        scene.add(container);
        return { model: container, mixer: null, actions: {} };
    } else {
        const originalModel = loadedModels[charId];
        const model = cloneSkinnedMesh(originalModel);

        // FBX2glTF exports these fighter rigs laying along +Z. Rotate once into
        // the engine's Y-up combat space before sizing or grounding them.
        if ((profile?.path || '').endsWith('.glb')) {
            model.rotation.x = -Math.PI / 2;
        }

        model.traverse(child => {
            if (child.isMesh) {
                child.visible = true;
                child.castShadow = true;
                child.receiveShadow = true;
                child.frustumCulled = false;

                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach((mat) => {
                    if (!mat) return;
                    mat.transparent = false;
                    mat.opacity = 1;
                    mat.alphaTest = 0;
                    mat.depthWrite = true;
                    mat.side = THREE.DoubleSide;
                    mat.roughness = Math.min(mat.roughness !== undefined ? mat.roughness : 0.7, 0.7);
                    mat.metalness = Math.min(mat.metalness !== undefined ? mat.metalness : 0.15, 0.2);
                    if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
                    if (child.isSkinnedMesh) mat.skinning = true;
                    mat.needsUpdate = true;
                });
            }
        });

        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);

        const trueHeight = Math.max(size.x, size.y, size.z);

        let scaleFactor = 1.0;
        if (isFinite(trueHeight) && trueHeight > 0.01) {
            scaleFactor = 2.0 / trueHeight;
        } else {
            console.warn(`Fighter model [${charId}] invalid trueHeight. Defaulting to scale 1.0.`);
        }
        model.scale.setScalar(scaleFactor);

        container.add(model);
        scene.add(container);

        const mixer = new THREE.AnimationMixer(model);
        const actions = {};
        const actionManifest = getCharacterActionManifest(options.animationProfileId || charId);

        Object.entries(actionManifest).forEach(([actionName, clipKey]) => {
            const clip = loadedAnims[clipKey];
            if (!clip) return;

            const clonedClip = retargetClipForModel(clip, model);
            clonedClip.name = actionName;
            let referenceRootY = 0;
            clonedClip.tracks.forEach((track) => {
                const isVectorPositionTrack =
                    track instanceof THREE.VectorKeyframeTrack ||
                    track.name.endsWith('.position');
                if (!isVectorPositionTrack || !track.values || track.values.length < 2) return;

                const nodeName = track.name.split('.')[0] || '';
                const isRootNode = isRootMotionNode(nodeName);
                if (isRootNode) referenceRootY = track.values[1];
            });
            stripRootMotionFromClip(clonedClip, model, referenceRootY);

            const action = mixer.clipAction(clonedClip);
            actions[actionName] = action;

            if (ATTACK_ANIMATION_NAMES.has(actionName) || HIT_REACTION_KEYS.has(actionName) || CINEMATIC_ACTION_KEYS.has(actionName) || DEATH_ACTION_KEYS.has(actionName)) {
                action.setLoop(THREE.LoopOnce);
                action.clampWhenFinished = true;
            }

            if (actionName === 'jumpUp' || actionName === 'jumpDown') {
                action.setLoop(THREE.LoopOnce);
                action.clampWhenFinished = true;
            }
        });

        if (actions.idle) {
            actions.idle.play();
            mixer.update(0);
        }

        model.updateMatrixWorld(true);
        const box2 = new THREE.Box3().setFromObject(model);
        const lowestFootY = getLowestFootBoneY(model);
        const groundReferenceY = isFinite(lowestFootY) ? lowestFootY - FOOT_GROUND_OFFSET : box2.min.y;

        if (isFinite(groundReferenceY)) {
            model.position.y -= groundReferenceY;
        } else {
            console.warn(`Fighter model [${charId}] invalid ground reference. Defaulting Y offset to 0.`);
            model.position.y = 0;
        }

        return { model: container, mixer: mixer, actions: actions };
    }
}

function spawnFighter(charId, startX, isPlayer1, options = {}) {
    const profile = getFighterProfile(charId, options);
    const statProfile = profile?.stats || {};
    const setup = createPlayerMesh(charId, isPlayer1, options);

    const player = {
        id: options.id ?? (isPlayer1 ? 1 : 2),
        charId: charId,
        name: options.displayName || profile?.name || charId,
        // Per-fighter idle identity (null for story enemies: they keep the
        // default shared idle presentation).
        idleStyle: FIGHTER_IDENTITY[charId]?.idle || null,
        mesh: setup.model,
        mixer: setup.mixer,
        actions: setup.actions,
        color: profile?.color || 0xffffff,
        team: options.team || 'hero',
        role: options.role || 'fighter',
        health: Math.round(100 * (options.healthMultiplier || statProfile.healthMultiplier || 1)),
        guardHealth: Math.round(100 * (options.guardMultiplier || statProfile.guardMultiplier || 1)), // NEW: Stamina
        damageMultiplier: options.damageMultiplier || statProfile.damageMultiplier || 1,
        velocity: 0,
        direction: isPlayer1 ? 1 : -1,

        currentState: 'idle',
        isDead: false,
        isJumping: false, // NEW: Airborne State
        jumps: 0,
        wWasPressed: false,
        upWasPressed: false,
        velocityY: 0,
        dashDir: 0,

        hasDealtDamage: false,
        introMotion: null,
        attackLimbKeywords: [],

        fistPos: new THREE.Vector3(),
        torsoPos: new THREE.Vector3(),

        fadeTo(animName, duration = 0.15, timeScale = 1.0) {
            if (isFallbackMode || !this.actions[animName]) return;

            const nextAction = this.actions[animName];
            const currentAction = this.actions[this.currentState];

            if (currentAction === nextAction) return;

            nextAction.reset();
            nextAction.setEffectiveWeight(1.0);
            nextAction.setEffectiveTimeScale(timeScale);

            if (currentAction) {
                currentAction.crossFadeTo(nextAction, duration, true);
            } else {
                nextAction.play();
            }

            nextAction.play();
            this.currentState = animName;
        }
    };

    player.mesh.position.set(startX, 0, 0);
    player.mesh.rotation.y = isPlayer1 ? Math.PI / 2 : -Math.PI / 2;

    if ((options.isBoss || isBossMatch) && !isPlayer1) {
        player.mesh.traverse(child => {
            if (child.isMesh) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach(mat => {
                    mat.emissive = new THREE.Color(0xff0000);
                    mat.emissiveIntensity = 0.6;
                    mat.color = new THREE.Color(0x330000);
                });
            }
        });

        const bossLight = new THREE.PointLight(0xff0000, 2.0, 10);
        bossLight.position.set(0, 1.5, 0);
        player.mesh.add(bossLight);
    }

    if (player.actions.idle) {
        player.actions.idle.play();
    }

    initializeCombatFighter(player);
    attachCombatHitboxes(player, scene);

    return player;
}

/**
 * Owns Story Mode's FBX templates and live enemy instances. Each call to spawn
 * creates a skeleton clone through spawnFighter and a dedicated AnimationMixer.
 */
class StoryEnemyManager {
    preload(enemyDefinitions, onProgress) {
        const fbxLoader = new FBXLoader();
        return Object.entries(enemyDefinitions).map(([enemyId, definition]) => new Promise((resolve) => {
            fbxLoader.load(
                toPublicAssetUrl(definition.path),
                (fbx) => {
                    loadedModels[enemyId] = fbx;
                    onProgress(definition.name);
                    resolve(true);
                },
                undefined,
                (error) => {
                    console.warn(`Could not load story enemy FBX: ${enemyId}. Path: ${definition.path}.`, error);
                    onProgress(definition.name);
                    resolve(false);
                }
            );
        }));
    }

    spawn(enemyId, startX, options = {}) {
        const profile = ENEMIES[enemyId];
        const enemy = spawnFighter(enemyId, startX, false, {
            id: 99,
            profile,
            animationProfileId: profile.animationProfileId,
            displayName: profile.name,
            team: 'enemy',
            role: 'enemy',
            isBoss: enemyId === 'thug4',
            ...options
        });

        activeEnemies.push(enemy);
        return enemy;
    }

    remove(enemy, { removeMesh = false } = {}) {
        const index = activeEnemies.indexOf(enemy);
        if (index !== -1) activeEnemies.splice(index, 1);
        if (removeMesh && enemy?.mesh) scene.remove(enemy.mesh);
    }

    clear() {
        activeEnemies.splice(0).forEach((enemy) => {
            if (enemy?.mesh) scene.remove(enemy.mesh);
        });
    }

    update(deltaTime) {
        activeEnemies.slice().forEach((enemy) => {
            // This also catches scripted or networked HP changes that did not
            // originate in the local hit check.
            if (enemy.health <= 0) {
                this.remove(enemy);
                if (!enemy.isDead) triggerDeath(enemy);
                return;
            }

            enemy.mixer?.update(deltaTime);
            if (!enemy.mesh) return;
            if (!enemy.isJumping || enemy.isHit || enemy.currentState === 'knockdown' || enemy.currentState === 'getUp') {
                reconcileGroundedState(enemy, 'story-enemy-mixer');
            } else if (enemy.mesh.position.y < GROUND_Y) {
                reconcileGroundedState(enemy, 'story-enemy-below-ground');
            }
        });
    }
}

const storyEnemyManager = new StoryEnemyManager();

// --- 9. ACTION-BASED INPUT SYSTEM ---
// Every device feeds named actions (see src/input/actions.js). Combat reads
// these per-player action states, never raw key codes.
const playerActionStates = { 1: createActionState(), 2: createActionState() };
function playerActionState(playerId) {
    return playerActionStates[playerId] || playerActionStates[1];
}
function bufferAttackInput(playerId, attackType) {
    const fighter = [...players, ...activeEnemies].find((actor) => actor?.id === playerId) || (storyEnemy?.id === playerId ? storyEnemy : null);
    if (fighter?.combat) queueCombatInput(fighter, attackType);
}

let aiNextActionTime = 0;
let aiCurrentAction = 'idle';
let aiHitCount = 0;
let storyEnemyFocusPlayerId = 1;
let storyEnemyFocusChangeAt = 0;

function getLivingHeroes() {
    return players.filter((actor) => actor && !actor.isDead);
}

function getNearestLivingHero(enemy = storyEnemy) {
    const heroes = getLivingHeroes();
    if (!enemy || heroes.length === 0) return null;
    return heroes.reduce((best, hero) => {
        if (!best) return hero;
        const bestDist = Math.abs(best.mesh.position.x - enemy.mesh.position.x);
        const nextDist = Math.abs(hero.mesh.position.x - enemy.mesh.position.x);
        return nextDist < bestDist ? hero : best;
    }, null);
}

function getStoryEnemyTarget() {
    if (!storyEnemy) return null;
    const heroes = getLivingHeroes();
    if (heroes.length === 0) return null;

    const preferred = players.find((hero) => hero && hero.id === storyEnemyFocusPlayerId && !hero.isDead);
    if (preferred && performance.now() < storyEnemyFocusChangeAt) {
        return preferred;
    }

    const nearest = getNearestLivingHero(storyEnemy) || heroes[0];
    storyEnemyFocusPlayerId = nearest?.id || 1;
    storyEnemyFocusChangeAt = performance.now() + 1200;
    return nearest;
}

function applyRemoteStoryEnemyState(data) {
    if (!storyEnemy || !data) return;
    storyEnemy.aiState = data.state || 'idle';
    storyEnemy.aiTargetPlayerId = data.targetPlayerId || 1;
    storyEnemy.aiNextActionTime = performance.now() + (data.nextActionDelayMs || 0);
    if (data.buffer) {
        storyEnemy.pendingRemoteBuffer = data.buffer;
    }
}

function broadcastStoryEnemyState(state, targetPlayerId, nextActionDelayMs, buffer = null) {
    if (!isStoryCoopMode() || !isHost || !conn || !conn.open) return;
    conn.send({ type: 'storyEnemyState', state, targetPlayerId, nextActionDelayMs, buffer });
}

function resolveStoryEnemyTarget() {
    if (!storyEnemy) return null;
    const target = players.find((hero) => hero && hero.id === storyEnemy.aiTargetPlayerId && !hero.isDead);
    return target || getStoryEnemyTarget();
}

function resetCombo(player) {
    if (player.combat) player.combat.chain = 0;
}

function getAttackDefinition(type, comboIndex, charId = null) {
    const index = type === 'special' || type === 'throw' || type === 'taunt' ? 0 : Math.min(comboIndex, COMBO_SEQUENCE.length - 1);
    const attack = getMove(type, index, charId);
    if (!attack) return null;
    const strength = COMBO_SEQUENCE[Math.min(index, COMBO_SEQUENCE.length - 1)];
    return {
        ...attack,
        type,
        strength,
        comboIndex: index,
        hitWindow: [attack.startup / (attack.startup + attack.active + attack.recovery), (attack.startup + attack.active) / (attack.startup + attack.active + attack.recovery)],
        chainAt: (attack.startup + attack.active + Math.floor(attack.recovery * .45)) / (attack.startup + attack.active + attack.recovery),
        queueWindowStart: attack.startup / (attack.startup + attack.active + attack.recovery),
        comboEnder: index >= 2 || type === 'special' || type === 'throw',
        reaction: attack.damage >= 11 ? 'hitMidHeavy' : attack.damage >= 7 ? 'hitMidMedium' : 'hitMidLight',
        reactionTravel: attack.pushback,
        blockKnockback: attack.blockPushback,
        forwardTravel: attack.lunge,
        minSpacing: .82
    };
}

function getClipDuration(player, actionKey = player.currentState) {
    if (!isFallbackMode && player.actions[actionKey]) {
        return player.actions[actionKey].getClip().duration;
    }
    return 1.0;
}

function getLowestFootBoneY(root) {
    const worldPos = new THREE.Vector3();
    let minY = Infinity;

    root.updateMatrixWorld(true);
    root.traverse((child) => {
        if (!child.isBone) return;

        const boneName = child.name.toLowerCase();
        if (!FOOT_BONE_KEYWORDS.some(keyword => boneName.includes(keyword))) return;

        child.getWorldPosition(worldPos);
        minY = Math.min(minY, worldPos.y);
    });

    return minY;
}

function getPhaseProgress(progress, start, end) {
    if (end <= start) return progress >= end ? 1 : 0;
    return THREE.MathUtils.smootherstep(progress, start, end);
}

function getLocomotionAnimation(player, opponent) {
    if (!opponent || player.velocity === 0) return 'idle';

    const moveDirection = Math.sign(player.velocity);
    const opponentOffset = opponent.mesh.position.x - player.mesh.position.x;
    const opponentDirection = Math.sign(opponentOffset) || player.direction || moveDirection;
    const movingTowardOpponent = moveDirection === opponentDirection;

    if (!movingTowardOpponent) {
        return 'stepBackward';
    }

    return Math.abs(opponentOffset) > CLOSE_STEP_DISTANCE ? 'stepForwardLong' : 'stepForwardShort';
}

function getAttackTravelDistance(attack, animPercent) {
    const forwardTravel = attack.forwardTravel || 0;
    const settleBack = attack.settleBack || 0;
    const windupBackstep = attack.windupBackstep || 0;

    if (forwardTravel <= 0 && settleBack <= 0 && windupBackstep <= 0) return 0;

    const startupEnd = Math.max(0.12, Math.min(attack.hitWindow[0], 0.26));
    const strikeEnd = Math.max(startupEnd + 0.08, attack.hitWindow[1]);
    const followEnd = Math.max(strikeEnd + 0.08, Math.min(attack.chainAt, 0.88));

    const windupTravel = forwardTravel * 0.18;
    const strikeTravel = forwardTravel * 0.57;
    const followTravel = forwardTravel * 0.25;
    const backstepTravel = getPhaseProgress(animPercent, 0, startupEnd * 0.8) * windupBackstep;

    return (
        -backstepTravel +
        getPhaseProgress(animPercent, 0, startupEnd) * windupTravel +
        getPhaseProgress(animPercent, startupEnd, strikeEnd) * strikeTravel +
        getPhaseProgress(animPercent, strikeEnd, followEnd) * followTravel -
        getPhaseProgress(animPercent, followEnd, 1) * settleBack
    );
}

function getReactionTravelDistance(player, animPercent) {
    const distance = player.reactionDistance || 0;
    if (distance <= 0) return 0;
    return getPhaseProgress(animPercent, 0.04, 0.82) * distance;
}

function clampAttackTravelX(player, opponent, candidateX) {
    let clampedX = Math.max(-9.5, Math.min(9.5, candidateX));

    if (!opponent || opponent.isDead || !player.currentAttack) {
        return clampedX;
    }

    const minSpacing = player.currentAttack.minSpacing || 0.9;

    if (player.direction > 0) {
        const forwardLimit = opponent.mesh.position.x - minSpacing;
        if (forwardLimit >= player.mesh.position.x) {
            clampedX = Math.min(clampedX, forwardLimit);
        } else {
            clampedX = Math.min(clampedX, player.mesh.position.x);
        }
    } else {
        const forwardLimit = opponent.mesh.position.x + minSpacing;
        if (forwardLimit <= player.mesh.position.x) {
            clampedX = Math.max(clampedX, forwardLimit);
        } else {
            clampedX = Math.max(clampedX, player.mesh.position.x);
        }
    }

    return clampedX;
}

function applyAttackTravel(player, opponent, animPercent) {
    if (!player.currentAttack || player.isJumping) return; // Prevent horizontal glide if attacking while jumping

    const desiredTravel = getAttackTravelDistance(player.currentAttack, THREE.MathUtils.clamp(animPercent, 0, 1));
    const deltaTravel = desiredTravel - player.attackTravel;

    if (Math.abs(deltaTravel) < 0.0001) return;

    const startX = player.mesh.position.x;
    const candidateX = startX + deltaTravel * player.direction;
    const clampedX = clampAttackTravelX(player, opponent, candidateX);

    player.mesh.position.x = clampedX;
    player.attackTravel += (clampedX - startX) * player.direction;
}

function applyReactionTravel(player, animPercent) {
    if (!player.reactionDirection || !player.reactionDistance) return;

    const desiredTravel = getReactionTravelDistance(player, THREE.MathUtils.clamp(animPercent, 0, 1));
    const deltaTravel = desiredTravel - player.reactionTravel;

    if (Math.abs(deltaTravel) < 0.0001) return;

    const startX = player.mesh.position.x;
    const candidateX = startX + deltaTravel * player.reactionDirection;
    const clampedX = Math.max(-9.5, Math.min(9.5, candidateX));

    player.mesh.position.x = clampedX;
    player.reactionTravel += (clampedX - startX) * player.reactionDirection;
}

function startIntroMotion(player, onComplete) {
    const targetX = player.id === 1 ? -3.4 : 3.4;
    const startX = targetX + (player.direction * -9.0); // Start far offscreen

    // Phase durations in ms
    const runningDuration = 1600;
    const runningClipMs = Math.round(getClipDuration(player, 'runningSlide') * 1000);
    const slideDurationMs = Math.max(runningClipMs, 600);
    const tauntClipMs = Math.round(
        (getClipDuration(player, 'taunt') / Math.max(getActionTimeScale(player, 'taunt'), 1)) * 1000
    );
    const tauntDurationMs = Math.max(tauntClipMs, 900);

    const totalDuration = (runningDuration + slideDurationMs + tauntDurationMs) / 1000;

    player.introPhase = 'running'; // tracked for camera
    player.introMotion = {
        elapsed: 0,
        duration: totalDuration,
        startX,
        targetX,
        runEndFrac: runningDuration / (totalDuration * 1000),
    };
    player.mesh.position.y = 0.2; // Raised during running/sliding
    player.mesh.position.x = startX;

    // Phase 1: Running approach
    setPresentationRotation(player, 'combat');
    playPreferredAction(player, 'running', 'idle', 0.05);

    // Phase 2: Running Slide — camera widens to catch full-body floor animation
    scheduleEvent(() => {
        if (!player.introMotion) return;
        player.introPhase = 'slide';
        playPreferredAction(player, 'runningSlide', 'idle', 0.12);

        // Phase 3: Taunt
        scheduleEvent(() => {
            if (!player.introMotion) return;
            player.introPhase = 'taunt';
            player.mesh.position.x = targetX;
            player.mesh.position.y = 0.0; // Return to floor for taunt and idle
            setPresentationRotation(player, 'taunt'); // Face the camera
            playPreferredAction(player, 'taunt', 'idle', 0.10);

            scheduleEvent(() => {
                player.introPhase = null;
                player.introMotion = null;
                playPreferredAction(player, 'standingPose', 'idle', 0.15);
                if (onComplete) onComplete();
            }, tauntDurationMs);
        }, slideDurationMs);
    }, runningDuration);
}

function updateIntroMotion(player, dt) {
    if (!player.introMotion) return;

    player.introMotion.elapsed += dt;
    const progress = THREE.MathUtils.clamp(player.introMotion.elapsed / player.introMotion.duration, 0, 1);

    // Only slide position during the running approach phase
    const runFrac = player.introMotion.runEndFrac;
    if (progress < runFrac) {
        const runProgress = progress / runFrac;
        const settleProgress = getPhaseProgress(runProgress, 0.0, 1.0);
        player.mesh.position.x = THREE.MathUtils.lerp(
            player.introMotion.startX, player.introMotion.targetX, settleProgress
        );
    }
    // Position is snapped to targetX during slide/taunt phases (done in scheduleEvent)
}

function startAttack(player, attackDef) {
    if (!attackDef || !startCombatMove(player, attackDef.type)) return false;
    attackDef = player.combat.move;
    player.hasDealtDamage = false;
    player.attackLimbKeywords = attackDef.limbKeywords;
    // Dive kicks latch their travel direction at launch so a mid-dive
    // cross-over (which flips facing) can't boomerang the dive.
    player.combat.diveDir = attackDef.dive ? player.direction : undefined;

    const actionDuration = getClipDuration(player, attackDef.animation);
    const moveDuration = (attackDef.startup + attackDef.active + attackDef.recovery) / FRAME_RATE;
    // Focus finishers carry their own playback rate (flurries snap, heavies
    // hang) on top of the automatic clip-to-move retiming.
    const focusTimeScale = attackDef.timeScale || 1;
    player.fadeTo(attackDef.animation, player.combat.chain === 0 ? 0.1 : 0.07, (actionDuration / moveDuration) * focusTimeScale);
    return true;
}

function requestAttack(player, type) {
    if (!player?.combat || !canAcceptMove(player, type)) return false;
    return startAttack(player, getAttackDefinition(type, player.combat.chain, player.charId));
}

function processBufferedAttack(player) {
    if (!player?.combat) return;
    player.combat.buffer = player.combat.buffer.filter((entry) => entry.expiresAtFrame >= player.combat.simFrame);
    const buffered = player.combat.buffer[0];
    if (!buffered) return;
    if (requestAttack(player, buffered.type)) {
        player.combat.buffer.shift();
    }
}

// --- 10. BONE WORLD POSITIONING EXTRACTOR ---
function getLimbWorldPos(player, keywords) {
    let foundBone = null;
    player.mesh.traverse(child => {
        if (foundBone) return;

        const name = child.name.toLowerCase();
        const matchesKeyword = keywords.some(kw => name.includes(kw));

        if (child.isBone && matchesKeyword) {
            foundBone = child;
        } else if (isFallbackMode && child.name && matchesKeyword) {
            foundBone = child;
        }
    });

    const worldPos = new THREE.Vector3();
    if (foundBone) {
        foundBone.getWorldPosition(worldPos);
    } else {
        player.mesh.getWorldPosition(worldPos);
        worldPos.x += player.direction * 0.9;
        worldPos.y += 1.2;
    }
    return worldPos;
}

// --- 11. COMBAT COLLISION CHECKS ---
// Hitstop is frame-indexed (not wall-clock) so replays stay deterministic.
let hitStopFrames = 0;
let globalHitComboCount = 0;
let comboResetTimeout = null;

function flashFighter(player) {
    player.mesh.traverse(child => {
        if (child.isMesh && child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(mat => {
                if (mat.emissive) {
                    const originalEmissive = mat.emissive.getHex();
                    mat.emissive.setHex(0xffffff);
                    setTimeout(() => {
                        if (mat) mat.emissive.setHex(originalEmissive);
                    }, 120);
                }
            });
        }
    });
}

function updateComboUI() {
    if (!comboUI) return;
    if (globalHitComboCount >= 2) {
        comboUI.textContent = `${globalHitComboCount} HITS!`;
        comboUI.classList.add('show');
        comboUI.style.animation = 'none';
        comboUI.offsetHeight;
        comboUI.style.animation = null;

        clearTimeout(comboResetTimeout);
        comboResetTimeout = setTimeout(() => {
            comboUI.classList.remove('show');
            globalHitComboCount = 0;
        }, 1500);
    } else {
        comboUI.classList.remove('show');
    }
}

function checkHits(attacker, defender) {
    const move = attacker?.combat?.move;
    // Taunts are performances, not attacks: they can never connect.
    if (!move || move.taunt || attacker.combat.state !== FIGHTER_STATE.ACTIVE || defender.isDead || attacker.combat.hitIds.has(defender.id)) return;
    if (defender.combat?.dashIFrames > 0 || (move.throw && defender.combat?.state === FIGHTER_STATE.ACTIVE)) return;
    updateCombatHitboxes(attacker, showCombatHitboxes);
    updateCombatHitboxes(defender, showCombatHitboxes);
    perfNoteHitboxCheck();
    if (!attackIntersects(attacker, defender)) return;

    attacker.combat.hitIds.add(defender.id);
    attacker.combat.whiff = false;
    const hitPoint = new THREE.Vector3();
    attacker.combat.hitboxes.attack.getCenter(hitPoint);
    const blocked = defender.combat?.state === FIGHTER_STATE.BLOCK && !move.throw;
    const armored = !blocked && defender.combat?.state === FIGHTER_STATE.STARTUP && defender.combat.armor > 0 && !move.throw;
    const scale = attacker.damageMultiplier || 1;
    const frame = defender.combat.simFrame;
    if (blocked) {
        defender.guardHealth = Math.max(0, defender.guardHealth - move.damage * 4.5 * scale);
        defender.health = Math.max(0, defender.health - move.blockDamage * scale);
        attacker.meter = Math.min(100, attacker.meter + Math.max(3, move.meterGain / 2));
        applyCombatHit(defender, attacker, move, true);
        if (defender.guardHealth <= 0) {
            changeCombatState(defender, FIGHTER_STATE.GUARD_BREAK);
            emitCombatEvent({ type: COMBAT_EVENT.GUARD_BREAK, attacker, defender, move, point: hitPoint.clone(), frame });
        } else {
            emitCombatEvent({ type: COMBAT_EVENT.BLOCK, attacker, defender, move, point: hitPoint.clone(), frame });
        }
    } else {
        defender.health = Math.max(0, defender.health - move.damage * scale);
        defender.meter = Math.min(100, defender.meter + 4);
        attacker.meter = Math.min(100, attacker.meter + move.meterGain);
        if (armored) defender.combat.armor--;
        else applyCombatHit(defender, attacker, move, false);
        emitCombatEvent({
            type: move.throw ? COMBAT_EVENT.THROW : COMBAT_EVENT.HIT,
            attacker, defender, move, armored,
            point: hitPoint.clone(), frame,
        });
        // Focus Controls: a clean hit opens the tempo window for the
        // attacker. Focus finishers never reopen it (move.noTempo).
        if (isFocusScheme() && !move.noTempo && isHumanFighter(attacker) && attacker.combat && !attacker.isDead) {
            attacker.combat.tempoFrames = TEMPO_WINDOW;
        }
    }
    hitStopFrames = move.hitstop;
    if (defender.health <= 0) triggerDeath(defender);
}

// Presentation subscriber for combat events (item 3). The simulation above
// only mutates gameplay state and emits events; everything here is visual /
// audio feedback and must never feed back into the simulation.
function handleCombatEvent(event) {
    const { type, attacker, defender, move, point } = event;
    updateHealthBars();
    if (move) triggerScreenShake(move.damage * .02, .12);
    if (type === COMBAT_EVENT.BLOCK) {
        spawnParticles(point, 'guard');
        AudioSynth.playBlock();
    } else if (type === COMBAT_EVENT.GUARD_BREAK) {
        defender.fadeTo('dizzy', .1);
        spawnParticles(point, 'guardbreak');
        AudioSynth.playBlock();
    } else if (type === COMBAT_EVENT.HIT || type === COMBAT_EVENT.THROW) {
        if (!event.armored) {
            defender.fadeTo(move.damage >= 11 || move.throw ? 'knockdown' : move.damage >= 7 ? 'hitMidMedium' : 'hitMidLight', move.throw ? .12 : HIT_FADE_DURATION);
        }
        flashFighter(defender);
        globalHitComboCount++; updateComboUI();
        if (move.id && move.id.startsWith('focus-')) {
            // Focus finishers burst in the attacker's motif colors.
            spawnParticles(point, 'super', -1, getFocusMotif(attacker.charId));
        } else {
            spawnParticles(point, move.damage >= 11 ? 'super' : 'hit');
        }
        spawnHitRing(point, move.damage);
        AudioSynth.playHit();
    } else if (type === COMBAT_EVENT.KO) {
        event.player.fadeTo(event.deathAction || 'deathFall', 0.1);
        triggerScreenShake(0.4, 0.3);
    }
}

onCombatEvent(handleCombatEvent);

function triggerDeath(player) {
    player.isDead = true;
    resetCombo(player);
    changeCombatState(player, FIGHTER_STATE.DEAD);
    reconcileGroundedState(player, 'death');
    // The death-animation draw is part of the seeded sim stream; the fadeTo
    // itself runs in the KO presentation subscriber.
    const deathAction = getRandomDeathAction(player) || 'deathFall';
    emitCombatEvent({ type: COMBAT_EVENT.KO, player, deathAction, frame: player.combat?.simFrame ?? 0 });
    if (isStoryMode()) {
        if (player.role === 'enemy') {
            // Remove defeated enemies from the active update set immediately.
            // Keep the mesh in-scene for the short death/victory presentation.
            storyEnemyManager.remove(player);
            endRound('heroes');
        } else if (getLivingHeroes().length === 0) {
            endRound('enemy');
        }
    } else if (isTrainingMode()) {
        // Lab rule: the round never ends — reset the scenario shortly after the KO.
        scheduleEvent(() => { if (isTrainingMode() && gameActive) resetTrainingScenario(); }, 1500);
    } else {
        endRound(player.id === 1 ? 2 : 1);
    }
}

function getHealthColor(health) {
    let hue;
    if (health > 50) {
        const t = (health - 50) / 50;
        hue = 60 + t * 70;
    } else {
        const t = health / 50;
        hue = t * 60;
    }
    return {
        bright: `hsl(${hue}, 100%, 50%)`,
        dark: `hsl(${hue}, 100%, 22%)`
    };
}

function updateHealthBars() {
    const leftActor = isStoryMode()
        ? ((isStoryCoopMode() && !isHost) ? players[1] : players[0])
        : players[0];
    const rightActor = isStoryMode() ? storyEnemy : players[1];
    const p1Bar = document.getElementById('p1-bar');
    const p2Bar = document.getElementById('p2-bar');
    const p1Guard = document.getElementById('p1-guard-bar');
    const p2Guard = document.getElementById('p2-guard-bar');
    const p1Meter = document.getElementById('p1-meter-bar');
    const p2Meter = document.getElementById('p2-meter-bar');

    if (p1Bar && leftActor) {
        const h1 = Math.max(0, Math.min(100, leftActor.health));
        p1Bar.style.width = h1 + '%';
        const color1 = getHealthColor(h1);
        p1Bar.style.background = `linear-gradient(90deg, ${color1.dark}, ${color1.bright})`;
        p1Bar.style.boxShadow = `0 0 10px ${color1.bright}`;

        if (p1Guard) {
            const g1 = Math.max(0, Math.min(100, leftActor.guardHealth));
            p1Guard.style.width = g1 + '%';
            p1Guard.style.backgroundColor = leftActor.isStunned ? '#ff0000' : (g1 < 30 ? '#ff8800' : '#ffffff');
        }
        if (p1Meter) p1Meter.style.width = `${Math.max(0, Math.min(100, leftActor.meter || 0))}%`;
    }

    if (p2Bar && rightActor) {
        const h2 = Math.max(0, Math.min(100, rightActor.health));
        p2Bar.style.width = h2 + '%';
        const color2 = getHealthColor(h2);
        p2Bar.style.background = `linear-gradient(270deg, ${color2.dark}, ${color2.bright})`;
        p2Bar.style.boxShadow = `0 0 10px ${color2.bright}`;

        if (p2Guard) {
            const g2 = Math.max(0, Math.min(100, rightActor.guardHealth));
            p2Guard.style.width = g2 + '%';
            p2Guard.style.backgroundColor = rightActor.isStunned ? '#ff0000' : (g2 < 30 ? '#ff8800' : '#ffffff');
        }
        if (p2Meter) p2Meter.style.width = `${Math.max(0, Math.min(100, rightActor.meter || 0))}%`;
    }
}

// --- 12. CAMERA SCREEN SHAKE ---
let shakeTime = 0;
let shakeIntensity = 0;

function triggerScreenShake(intensity = 0.22, duration = 0.25) {
    shakeTime = duration;
    shakeIntensity = intensity;
}

function updateCameraShake(dt) {
    if (shakeTime > 0) {
        const dy = (Math.random() - 0.5) * shakeIntensity;
        camera.position.y += dy;

        shakeTime -= dt;
        shakeIntensity = THREE.MathUtils.lerp(shakeIntensity, 0, 0.1);
    }
}

function updateCameraDirector() {
    let targetCamX = camera.position.x;
    let targetCamY = camera.position.y;
    let targetCamZ = camera.position.z;
    let lookTarget = null;

    if (cameraDirector.mode === 'select' && previewFighters.length > 0) {
        targetCamX = 0;
        targetCamY = 2.75;
        targetCamZ = 6.35;
        lookTarget = new THREE.Vector3(0, 1.42, 1.02);
    } else if (getActiveCombatants().length >= 2) {
        const cast = getActiveCombatants().sort((a, b) => a.mesh.position.x - b.mesh.position.x);
        const p1 = cast[0];
        const p2 = cast[cast.length - 1];
        const midX = (p1.mesh.position.x + p2.mesh.position.x) / 2;
        const distance = Math.abs(p1.mesh.position.x - p2.mesh.position.x);
        const shotProgress = cameraDirector.shotDurationMs > 0
            ? THREE.MathUtils.clamp((performance.now() - cameraDirector.modeStartedAt) / cameraDirector.shotDurationMs, 0, 1)
            : 1;

        if (cameraDirector.mode === 'intro') {
            const focus = findCombatantById(cameraDirector.focusPlayerId) || p1;
            const sideBias = focus.id === 1 ? -0.15 : 0.15;
            const isSliding = focus.introPhase === 'slide';

            if (isSliding) {
                // Wider, lower shot to capture the full Running Slide on the ground
                targetCamX = focus.mesh.position.x + sideBias * 2;
                targetCamY = focus.mesh.position.y + THREE.MathUtils.lerp(0.75, 1.5, shotProgress);
                targetCamZ = THREE.MathUtils.lerp(6.5, 8.0, shotProgress);
                lookTarget = new THREE.Vector3(
                    focus.mesh.position.x,
                    focus.mesh.position.y + 0.65,
                    0.28
                );
            } else {
                targetCamX = focus.mesh.position.x + sideBias;
                targetCamY = focus.mesh.position.y + THREE.MathUtils.lerp(1.15, 2.25, shotProgress);
                targetCamZ = THREE.MathUtils.lerp(4.7, 7.35, shotProgress);
                lookTarget = new THREE.Vector3(
                    focus.mesh.position.x,
                    focus.mesh.position.y + THREE.MathUtils.lerp(1.7, 1.05, shotProgress),
                    0.28
                );
            }
        } else if (cameraDirector.mode === 'taunt') {
            const focus = findCombatantById(cameraDirector.focusPlayerId) || p1;
            const sideBias = focus.id === 1 ? -0.45 : 0.45;
            targetCamX = focus.mesh.position.x + sideBias;
            targetCamY = THREE.MathUtils.lerp(2.55, 2.95, shotProgress);
            targetCamZ = THREE.MathUtils.lerp(5.35, 6.25, shotProgress);
            lookTarget = new THREE.Vector3(focus.mesh.position.x, 1.42, 0.08);
        } else if (cameraDirector.mode === 'countdown') {
            targetCamX = midX;
            targetCamY = 3.15;
            targetCamZ = 8.0;
            lookTarget = new THREE.Vector3(midX, 1.25, 0);
        } else if (cameraDirector.mode === 'victory' && cameraDirector.winnerId > 0) {
            const winner = findCombatantById(cameraDirector.winnerId) || p1;
            const sideBias = winner.id === 1 ? -0.42 : 0.42;
            targetCamX = winner.mesh.position.x + THREE.MathUtils.lerp(sideBias * 2.1, sideBias, shotProgress);
            targetCamY = THREE.MathUtils.lerp(2.8, 3.35, shotProgress);
            targetCamZ = THREE.MathUtils.lerp(7.2, 4.8, shotProgress);
            lookTarget = new THREE.Vector3(
                winner.mesh.position.x,
                THREE.MathUtils.lerp(1.5, 1.28, shotProgress),
                0.08
            );
        } else {
            targetCamX = midX;
            targetCamY = THREE.MathUtils.clamp(2.0 + distance * 0.15, 2.5, 4.0);
            targetCamZ = THREE.MathUtils.clamp(5.5 + distance * 0.5, 6.0, 11.0);
            lookTarget = new THREE.Vector3(midX, 1.2, 0);
        }

        actionSpotlight.position.x = midX;
        actionSpotlight.target.position.set(midX, 0, 0);
        actionSpotlight.target.updateMatrixWorld();
    }

    if (!lookTarget) return;

    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetCamX, 0.08);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetCamY, 0.08);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetCamZ, 0.08);
    camera.lookAt(lookTarget);
}

// --- 13. ROUND LOOP TIMERS & GAME STATES ---
let gameActive = false;
let roundTime = 99;
let timerInterval = null;

function getActionDurationMs(actor, actionName, fallbackMs = 1000) {
    if (!actor) return fallbackMs;
    const duration = getClipDuration(actor, actionName);
    if (!Number.isFinite(duration) || duration <= 0) return fallbackMs;
    return Math.round((duration / getActionTimeScale(actor, actionName)) * 1000);
}

function startCountdownSequence() {
    const announce = document.getElementById('announcement');

    // Prefight: both players snap to combat facing and play Standing Idle To Fight Idle
    getActiveCombatants().forEach((player) => {
        if (!player) return;
        player.introMotion = null;
        reconcileGroundedState(player, 'countdown');
        setPresentationRotation(player, 'combat');

        const siftAction = player.actions && player.actions['standingIdleToFightIdle'];
        if (siftAction) {
            siftAction.setLoop(THREE.LoopOnce, 1);
            siftAction.clampWhenFinished = true;
        }
        playPreferredAction(player, 'standingIdleToFightIdle', 'idle', 0.10);

        // After the transition animation completes, hold in idle
        const siftDurationMs = player.actions && player.actions['standingIdleToFightIdle']
            ? Math.round(getClipDuration(player, 'standingIdleToFightIdle') * 1000) + 100
            : 1000;
        scheduleEvent(() => {
            if (!player.actions) return;
            playPreferredAction(player, 'idle', 'idle', 0.15);
        }, siftDurationMs);
    });

    setCameraMode('countdown', { shotDurationMs: 2400 });

    const runCountdown = (count) => {
        if (count > 0) {
            announce.textContent = count;
            announce.classList.add('active');
            AudioSynth.playSelect();
            scheduleEvent(() => {
                announce.classList.remove('active');
                scheduleEvent(() => runCountdown(count - 1), 100);
            }, 800);
        } else {
            announce.textContent = "FIGHT!";
            announce.classList.add('active');
            AudioSynth.playSwing();

            scheduleEvent(() => {
                announce.classList.remove('active');
                setCameraMode('fight', { shotDurationMs: 2600 });
                gameActive = true;
                updateViewportState();
                // Training Lab: the round timer stays frozen.
                if (!isTrainingMode()) startTimer();
            }, 1000);
        }
    };

    runCountdown(3);
}


// --- SCREEN WIPE TRANSITION SYSTEM ---
const _wipeEl = document.getElementById('screen-wipe');
const _wipeNameEl = document.getElementById('wipe-name-card');

/**
 * Performs a fast whole-screen wipe transition.
 *
 * @param {'cut' | 'open' | 'close' | 'flash'} type
 *   'close'  — panels slide in (hides scene)
 *   'open'   — panels slide out (reveals scene)
 *   'cut'    — close then open (hard cut between shots)
 *   'flash'  — a single white-flash frame
 * @param {number} durationMs  — how long panels take to animate
 * @param {string|null} label  — optional name to flash in the centre
 * @param {Function|null} onMidpoint — called when screen is fully covered (only for 'cut'/'close')
 * @param {Function|null} onDone    — called after animation fully completes
 */
function screenWipe(type, durationMs = 280, label = null, onMidpoint = null, onDone = null) {
    if (!_wipeEl) { if (onMidpoint) onMidpoint(); if (onDone) onDone(); return; }

    const setDur = (ms) => _wipeEl.style.setProperty('--wipe-dur', `${ms}ms`);
    const clearClasses = () => _wipeEl.classList.remove(
        'wipe-closing', 'wipe-closed', 'wipe-opening', 'flash-white'
    );
    const resetPanels = () => {
        _wipeEl.querySelectorAll('.wipe-panel').forEach(p => p.style.animation = 'none');
        _wipeEl.offsetHeight; // force reflow
        _wipeEl.querySelectorAll('.wipe-panel').forEach(p => p.style.animation = '');
    };
    const showLabel = (text) => {
        if (!text || !_wipeNameEl) return;
        _wipeNameEl.textContent = text;
        _wipeNameEl.classList.remove('name-in', 'name-out');
        _wipeNameEl.offsetHeight;
        _wipeNameEl.classList.add('name-in');
    };
    const hideLabel = () => {
        if (!_wipeNameEl) return;
        _wipeNameEl.classList.remove('name-in');
        _wipeNameEl.offsetHeight;
        _wipeNameEl.classList.add('name-out');
    };

    if (type === 'flash') {
        clearClasses();
        const flashDur = durationMs || 300;
        _wipeEl.style.setProperty('--flash-dur', `${flashDur}ms`);
        _wipeEl.offsetHeight;
        _wipeEl.classList.add('flash-white');
        setTimeout(() => { clearClasses(); if (onDone) onDone(); }, flashDur);
        return;
    }

    if (type === 'close') {
        clearClasses();
        resetPanels();
        setDur(durationMs);
        _wipeEl.classList.add('wipe-closing');
        setTimeout(() => {
            _wipeEl.classList.remove('wipe-closing');
            _wipeEl.classList.add('wipe-closed');
            if (label) showLabel(label);
            if (onMidpoint) onMidpoint();
            if (onDone) onDone();
        }, durationMs);
        return;
    }

    if (type === 'open') {
        hideLabel();
        clearClasses();
        _wipeEl.classList.add('wipe-closed'); // ensure panels are in
        _wipeEl.offsetHeight;
        _wipeEl.classList.remove('wipe-closed');
        resetPanels();
        setDur(durationMs);
        _wipeEl.classList.add('wipe-opening');
        setTimeout(() => {
            clearClasses();
            if (onDone) onDone();
        }, durationMs);
        return;
    }

    if (type === 'cut') {
        // Close → midpoint callback → open
        const half = Math.round(durationMs / 2);
        screenWipe('close', half, label, () => {
            if (onMidpoint) onMidpoint();
            scheduleEvent(() => {
                screenWipe('open', half, null, null, onDone);
            }, label ? 420 : 60);
        });
    }
}



function startTauntPhaseSequence() {
    const p1 = players[0];
    const p2 = players[1];

    setCameraMode('taunt', { focusPlayerId: p1.id, shotDurationMs: 1000 });

    scheduleEvent(() => {
        // Wipe in → show P1 taunt → wipe to P2 taunt → wipe to countdown
        screenWipe('cut', 240, p1.name, () => {
            // midpoint: scene hidden — swap camera to P1 taunt
            const p1DurationMs = playTauntShot(p1);

            scheduleEvent(() => {
                // P1 taunt done — cut to P2
                screenWipe('cut', 240, p2.name, () => {
                    playPreferredAction(p1, 'idle', 'idle', 0.12);
                    const p2DurationMs = playTauntShot(p2);

                    scheduleEvent(() => {
                        // Both taunts done — hard flash into countdown
                        screenWipe('cut', 220, null, () => {
                            playPreferredAction(p2, 'idle', 'idle', 0.12);
                            startCountdownSequence();
                        });
                    }, p2DurationMs + TAUNT_BUFFER_MS);
                });
            }, p1DurationMs + 120);
        });
    }, 600);
}


function playTauntShot(player) {
    if (!player) return 900;

    reconcileGroundedState(player, 'taunt-shot');
    player.introMotion = null;
    setPresentationRotation(player, 'taunt');
    playPreferredAction(player, 'taunt', 'idle', 0.08);

    const durationMs = Math.min(getActionDurationMs(player, 'taunt', 900), 2200);
    setCameraMode('taunt', { focusPlayerId: player.id, shotDurationMs: durationMs });
    return durationMs;
}

function playPreFightSequence() {
    if (players.length !== 2) return;

    const [p1, p2] = players;
    [p1, p2].forEach((player) => {
        reconcileGroundedState(player, 'prefight');
        setPresentationRotation(player, 'intro');
        playPreferredAction(player, 'standingPose', 'idle', 0.05);
    });

    // Estimate full entrance duration: running + slide + taunt
    function getEntranceDurationMs(player) {
        const runningMs = 1600;
        const slideMs = Math.max(Math.round(getClipDuration(player, 'runningSlide') * 1000), 600);
        const tauntMs = Math.max(
            Math.round((getClipDuration(player, 'taunt') / Math.max(getActionTimeScale(player, 'taunt'), 1)) * 1000),
            900
        );
        return runningMs + slideMs + tauntMs;
    }

    // Wipe in with P1's name, then start their entrance
    screenWipe('cut', 280, p1.name.toUpperCase(), () => {
        const p1EntranceDurationMs = getEntranceDurationMs(p1);
        setCameraMode('intro', { focusPlayerId: p1.id, shotDurationMs: p1EntranceDurationMs });

        startIntroMotion(p1, () => {
            // P1 done — wipe to P2 entrance
            screenWipe('cut', 280, p2.name.toUpperCase(), () => {
                const p2EntranceDurationMs = getEntranceDurationMs(p2);
                setCameraMode('intro', { focusPlayerId: p2.id, shotDurationMs: p2EntranceDurationMs });

                scheduleEvent(() => {
                    startIntroMotion(p2, () => {
                        // Both entrances done — flash into taunt phase
                        screenWipe('flash', 360, null, null, () => {
                            startTauntPhaseSequence();
                        });
                    });
                }, 200);
            });
        });
    });
}

function getStoryProgressPayload(status = storyRun.status) {
    return {
        chapterIndex: storyRun.chapterIndex,
        encounterIndex: storyRun.encounterIndex,
        player1CharId: storyRun.player1CharId,
        player2CharId: storyRun.player2CharId,
        onlineEnabled: storyRun.onlineEnabled,
        status
    };
}

function spawnStoryEncounter() {
    const enemyId = getCurrentStoryEnemyId();
    const isCoop = isStoryCoopMode();

    const hero1 = spawnFighter(selections[1], isCoop ? -5.0 : -3.4, true, {
        id: 1,
        team: 'hero',
        role: 'hero'
    });
    players.push(hero1);

    if (isCoop) {
        const hero2 = spawnFighter(selections[2], -2.8, false, {
            id: 2,
            team: 'hero',
            role: 'hero'
        });
        hero2.direction = 1;
        players.push(hero2);
    }

    storyEnemy = storyEnemyManager.spawn(enemyId, 3.8);
    storyEnemy.aiState = 'idle';
    storyEnemy.aiTargetPlayerId = 1;
    storyEnemy.aiNextActionTime = 0;
    storyEnemy.pendingRemoteBuffer = null;
    storyEnemy.direction = -1;
}

window.startFight = function (isNetworkCommand = false, networkStageId = null) {
    if ((isOnlineVersusMode() || isStoryCoopMode()) && !isNetworkCommand) {
        if (conn && conn.open) conn.send({ type: 'fight', stage: selectedStageId });
    }

    // Item 2: reseed the deterministic sim stream every fight.
    reseedSim((((Date.now() ^ (++fightSeedCounter * 0x9E3779B9)) >>> 0) || 1));
    // Stage visuals only — the combat lane is identical on every stage.
    loadStageById(isNetworkCommand && networkStageId ? networkStageId : selectedStageId);

    if (isArcadeMode()) {
        if (!tournamentRun.playerCharId || tournamentRun.status === 'idle') {
            startSinglePlayerRun(selections[1]);
        }
        selections[2] = getCurrentLadderOpponent();
        isBossMatch = selections[2] === selections[1];
    } else if (isStoryMode()) {
        if (storyRun.status === 'idle') {
            initializeStoryRun();
        }
        isBossMatch = getCurrentStoryEnemyId() === 'thug4';
        if (isStoryCoopMode() && isHost && conn && conn.open) {
            conn.send({ type: 'storyProgress', payload: getStoryProgressPayload('in_progress') });
        }
    } else {
        isBossMatch = false;
    }

    AudioSynth.playSelect();
    clearScheduledEvents();
    if (timerInterval) clearInterval(timerInterval);
    stopMusicForFight();

    document.getElementById('announcement').classList.remove('active');
    document.getElementById('gameover-screen').style.display = 'none';
    document.getElementById('ladder-screen').classList.add('hidden');
    document.getElementById('selector-screen').classList.add('hidden');
    document.getElementById('hud').style.display = 'flex';
    setTrainingHudVisible(isTrainingMode());
    updateViewportState();

    removeFighterList(previewFighters);
    removeFighterList(players);
    removeStoryEnemy();

    if (isStoryMode()) {
        spawnStoryEncounter();
    } else {
        const p1 = spawnFighter(selections[1], -3.4, true);
        const p2 = spawnFighter(selections[2], 3.4, false);
        players.push(p1, p2);
    }
    releaseAllTouchZones();

    const leftHudActor = isStoryMode()
        ? ((isStoryCoopMode() && !isHost) ? players[1] : players[0])
        : players[0];
    const rightHudActor = isStoryMode() ? storyEnemy : players[1];
    document.getElementById('p1-name-display').textContent = leftHudActor?.name || 'Player 1';
    document.getElementById('p2-name-display').textContent = rightHudActor?.name || 'Player 2';

    injectGuardBars();
    updateHealthBars();

    globalHitComboCount = 0;
    updateComboUI();

    gameActive = false;
    selectSpotlightP1.visible = false;
    selectSpotlightP2.visible = false;
    actionSpotlight.visible = true;
    
    setFightEnvironmentVisible(true);
    setSelectEnvironmentVisible(false);
    roundTime = 99;
    document.getElementById('timer').textContent = roundTime;
    if (isStoryMode()) {
        setCameraMode('countdown', { focusPlayerId: 1, winnerId: 0 });
        startCountdownSequence();
    } else {
        setCameraMode('intro', { focusPlayerId: 1, winnerId: 0 });
        playPreFightSequence();
    }
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (!gameActive) return;
        roundTime--;
        document.getElementById('timer').textContent = roundTime;

        if (roundTime <= 0) {
            clearInterval(timerInterval);
            if (isStoryMode()) {
                const heroHealth = getLivingHeroes().reduce((sum, hero) => sum + Math.max(hero.health, 0), 0);
                const enemyHealth = Math.max(storyEnemy?.health || 0, 0);
                if (heroHealth > enemyHealth) {
                    endRound('heroes');
                } else if (enemyHealth > heroHealth) {
                    endRound('enemy');
                } else {
                    endRound('draw');
                }
            } else {
                const p1Health = players[0].health;
                const p2Health = players[1].health;
                if (p1Health > p2Health) {
                    endRound(1);
                } else if (p2Health > p1Health) {
                    endRound(2);
                } else {
                    endRound(0);
                }
            }
        }
    }, 1000);
}

function endRound(winnerNum) {
    gameActive = false;
    clearInterval(timerInterval);
    clearScheduledEvents();
    releaseAllTouchZones();

    const overlay = document.getElementById('gameover-screen');
    const winnerText = document.getElementById('winner-title');
    const primaryBtn = document.getElementById('gameover-primary-btn');
    const secondaryBtn = document.getElementById('gameover-secondary-btn');
    if (isStoryMode()) {
        const storyWinner = winnerNum === 'heroes' ? players.find((hero) => hero && !hero.isDead) || players[0] : storyEnemy;
        const storyLoser = winnerNum === 'heroes' ? storyEnemy : players.find((hero) => hero && !hero.isDead);
        const victoryShowcaseMs = 4200;

        if (storyWinner) {
            if (storyWinner.combat && !storyWinner.isDead) changeCombatState(storyWinner, FIGHTER_STATE.IDLE);
            sanitizeGroundedState(storyWinner);
            playPreferredAction(storyWinner, winnerNum === 'heroes' ? 'victory' : 'idle', 'idle', 0.1);
        }
        if (storyLoser && !storyLoser.isDead) {
            playPreferredAction(storyLoser, 'idle', 'idle', 0.15);
        }

        scheduleEvent(() => {
            if (winnerNum === 'heroes') {
                winnerText.textContent = 'CHAPTER CLEAR';
                winnerText.className = 'win-p1';
                AudioSynth.playWin();
                const advanceState = advanceStoryRun();
                if (isStoryCoopMode() && isHost && conn && conn.open) {
                    conn.send({ type: 'storyProgress', payload: getStoryProgressPayload(storyRun.status) });
                }
                if (advanceState === 'complete') {
                    primaryBtn.textContent = 'Story Board';
                    primaryBtn.onclick = () => showStoryProgressScreen('complete');
                    secondaryBtn.textContent = 'Main Menu';
                    secondaryBtn.onclick = () => quitToMainMenu();
                } else {
                    primaryBtn.textContent = 'Continue Story';
                    primaryBtn.onclick = () => showStoryProgressScreen('advance');
                    secondaryBtn.textContent = 'Fighter Select';
                    secondaryBtn.onclick = () => backToSelect();
                }
            } else if (winnerNum === 'enemy') {
                storyRun.status = 'failed';
                winnerText.textContent = `${storyEnemy?.name || 'Enemy'} WINS`;
                winnerText.className = 'win-p2';
                primaryBtn.textContent = 'Retry Chapter';
                primaryBtn.onclick = () => {
                    storyRun.status = 'in_progress';
                    document.getElementById('gameover-screen').style.display = 'none';
                    startFight();
                };
                secondaryBtn.textContent = 'Main Menu';
                secondaryBtn.onclick = () => quitToMainMenu();
            } else {
                winnerText.textContent = 'DRAW SEQUENCE';
                winnerText.className = '';
                primaryBtn.textContent = 'Retry';
                primaryBtn.onclick = () => {
                    document.getElementById('gameover-screen').style.display = 'none';
                    startFight();
                };
                secondaryBtn.textContent = 'Fighter Select';
                secondaryBtn.onclick = () => backToSelect();
            }

            overlay.style.transition = 'opacity 600ms ease';
            overlay.style.opacity = '0';
            overlay.style.display = 'flex';
            requestAnimationFrame(() => {
                requestAnimationFrame(() => { overlay.style.opacity = '1'; });
            });
        }, victoryShowcaseMs);
        return;
    }

    const winner = winnerNum > 0 ? players[winnerNum - 1] : null;
    const loser  = winnerNum > 0 ? players[winnerNum === 1 ? 1 : 0] : null;
    const victoryShowcaseMs = 8000;

    if (winner) {
        setCameraMode('victory', { winnerId: winnerNum, shotDurationMs: victoryShowcaseMs });
        if (winner.combat) changeCombatState(winner, FIGHTER_STATE.IDLE);
        sanitizeGroundedState(winner);
        playPreferredAction(winner, 'victory', 'idle', 0.1);

        if (loser && !loser.isDead) {
            if (loser.combat) changeCombatState(loser, FIGHTER_STATE.IDLE);
            sanitizeGroundedState(loser);
            playPreferredAction(loser, 'idle', 'idle', 0.15);
        }

        // Burst confetti over the winner on win
        const confettiPos = winner.mesh.position.clone();
        confettiPos.y += 1.5;
        spawnParticles(confettiPos, 'confetti');
    } else {
        setCameraMode('fight', { winnerId: 0 });
    }

    const victoryClipMs = winner
        ? Math.max(victoryShowcaseMs, getActionDurationMs(winner, 'victory', victoryShowcaseMs))
        : 0;
    const fadeMs   = 600;    // CSS opacity transition
    const overlayDelayMs = victoryClipMs;

    scheduleEvent(() => {
        if (winnerNum === 0) {
            winnerText.textContent = 'DRAW SEQUENCE';
            winnerText.className = '';
        } else {
            winnerText.textContent = `${players[winnerNum - 1].name} WINS`;
            winnerText.className = winnerNum === 1 ? 'win-p1' : 'win-p2';
            AudioSynth.playWin();
        }

        if (isArcadeMode()) {
            if (winnerNum === 1) {
                const hasNextFight = advanceTournamentRun();
                if (hasNextFight) {
                    showTournamentLadderScreen('advance');
                    return;
                }
                endTournamentRun('complete');
                primaryBtn.textContent = 'Tournament Ladder';
                primaryBtn.onclick = () => showTournamentLadderScreen('complete');
                secondaryBtn.textContent = 'Main Menu';
                secondaryBtn.onclick = () => quitToMainMenu();
            } else {
                endTournamentRun('failed');
                primaryBtn.textContent = 'Try Again';
                primaryBtn.onclick = () => showCharacterSelect();
                secondaryBtn.textContent = 'Main Menu';
                secondaryBtn.onclick = () => quitToMainMenu();
            }
        } else {
            primaryBtn.textContent = 'Rematch';
            primaryBtn.onclick = () => rematch();
            secondaryBtn.textContent = 'Fighter Select';
            secondaryBtn.onclick = () => backToSelect();
        }

        // Fade the overlay in over the 3D scene
        overlay.style.transition = `opacity ${fadeMs}ms ease`;
        overlay.style.opacity = '0';
        overlay.style.display = 'flex';
        requestAnimationFrame(() => {
            requestAnimationFrame(() => { overlay.style.opacity = '1'; });
        });
    }, overlayDelayMs);
}


function rematch() {
    document.getElementById('gameover-screen').style.display = 'none';
    releaseAllTouchZones();
    if (isStoryMode() && storyRun.status === 'complete') {
        resetStoryRun();
        initializeStoryRun();
    }
    startFight();
}

function backToSelect() {
    document.getElementById('gameover-screen').style.display = 'none';
    releaseAllTouchZones();
    if (isArcadeMode() && tournamentRun.status === 'between_rounds') {
        showTournamentLadderScreen('advance');
        return;
    }
    if (isStoryMode() && storyRun.status === 'between_encounters') {
        showStoryProgressScreen('advance');
        return;
    }
    showCharacterSelect();
}

function advanceCombatFighterStep(p, opp, frameDt = 1 / FRAME_RATE) {
    if (!p?.combat) return;
    const c = p.combat;
    c.simFrame++;
    updateCombatHitboxes(p, showCombatHitboxes);
    if (!showCombatHitboxes) hideCombatHelpers(p);

    c.pushVelocity = THREE.MathUtils.lerp(c.pushVelocity, 0, 0.22);
    c.dashIFrames = Math.max(0, c.dashIFrames - 1);

    // Focus Controls: the tempo window ticks on sim frames for every
    // fighter on every sim (both online peers agree because checkHits is
    // deterministic). The rest of the focus bookkeeping runs only for
    // locally-controlled fighters (see isFocusSimFighter).
    if (c.tempoFrames > 0) c.tempoFrames--;

    // Focus Controls per-frame bookkeeping (tap-vs-hold, charge).
    if (isFocusSimFighter(p)) updateFocusFighter(p, opp);

    if (c.state === FIGHTER_STATE.BLOCKSTUN || c.state === FIGHTER_STATE.HITSTUN || c.state === FIGHTER_STATE.KNOCKDOWN || c.state === FIGHTER_STATE.GETUP || c.state === FIGHTER_STATE.GUARD_BREAK) {
        tickStunState(p);
    } else if (c.state === FIGHTER_STATE.STARTUP || c.state === FIGHTER_STATE.ACTIVE || c.state === FIGHTER_STATE.RECOVERY) {
        const prevAttackState = c.state;
        const phase = advanceCombatState(p);
        const move = c.move;
        if (phase.startedActive) AudioSynth.playSwing();
        if (move && (c.state === FIGHTER_STATE.STARTUP || c.state === FIGHTER_STATE.ACTIVE)) {
            const lungeStep = (move.lunge || 0) / Math.max(1, move.startup + move.active);
            p.mesh.position.x = THREE.MathUtils.clamp(p.mesh.position.x + lungeStep * p.direction, -9.5, 9.5);
        }
        // An air attack that ends before landing hands the pose back to the
        // jump/fall animation instead of freezing on the clamped end frame.
        if (prevAttackState === FIGHTER_STATE.RECOVERY && c.state === FIGHTER_STATE.JUMP) {
            p.fadeTo(p.velocityY >= 0 ? 'jumpUp' : 'jumpDown', 0.15);
        }
    } else if (c.state === FIGHTER_STATE.DASH) {
        c.stateFrame++;
        p.mesh.position.x = THREE.MathUtils.clamp(p.mesh.position.x + c.dashDir * .05, -9.5, 9.5);
        if (c.stateFrame >= 12) changeCombatState(p, FIGHTER_STATE.IDLE);
    }

    // Only the fixed-step state owns committed horizontal movement.
    if (c.state === FIGHTER_STATE.IDLE || c.state === FIGHTER_STATE.WALK || c.state === FIGHTER_STATE.BLOCK || c.state === FIGHTER_STATE.JUMP) {
        p.mesh.position.x = THREE.MathUtils.clamp(p.mesh.position.x + c.motionVelocity * frameDt, -9.5, 9.5);
    }
    p.mesh.position.x = THREE.MathUtils.clamp(p.mesh.position.x + c.pushVelocity * frameDt, -9.5, 9.5);

    // Air physics: gravity applies for the whole airborne arc, including
    // mid-air attacks and air stuns (juggles fall). A dive kick overrides
    // gravity with its fixed down-forward velocity during its active
    // window. Landing cancels an air attack into IDLE — except a dive,
    // which lands straight into its recovery.
    if (p.isJumping && !p.isDead) {
        const dive = c.move?.dive;
        if (dive && c.state === FIGHTER_STATE.ACTIVE) {
            p.velocityY = dive.vy;
            const diveDir = c.diveDir ?? p.direction;
            p.mesh.position.x = THREE.MathUtils.clamp(p.mesh.position.x + dive.vx * diveDir * frameDt, -9.5, 9.5);
        } else {
            p.velocityY -= 20.0 * frameDt;
        }
        p.mesh.position.y += p.velocityY * frameDt;
        if (p.velocityY < 0 && p.mesh.position.y > GROUND_Y && c.state === FIGHTER_STATE.JUMP && p.currentState !== 'jumpDown') p.fadeTo('jumpDown', 0.2);
        if (p.mesh.position.y <= GROUND_Y) {
            const inAirAttack = c.state === FIGHTER_STATE.STARTUP || c.state === FIGHTER_STATE.ACTIVE || c.state === FIGHTER_STATE.RECOVERY;
            const diveMove = inAirAttack ? c.move : null;
            sanitizeGroundedState(p);
            if (c.state === FIGHTER_STATE.JUMP || inAirAttack) {
                if (diveMove?.dive) {
                    changeCombatState(p, FIGHTER_STATE.RECOVERY, { move: diveMove });
                } else {
                    changeCombatState(p, FIGHTER_STATE.IDLE);
                }
                p.fadeTo('idle', 0.1);
            }
            spawnParticles(p.mesh.position, 'landing');
        }
    }

    if (c.state === FIGHTER_STATE.ACTIVE && opp) checkHits(p, opp);
    if (c.state === FIGHTER_STATE.IDLE) {
        p.fadeTo('idle', .12);
        // Per-fighter idle identity: motion rhythm (clip timeScale) plus a
        // subtle stance sway. Presentation-only; the sim never reads it.
        const idleStyle = p.idleStyle;
        if (idleStyle) {
            if (p.actions.idle) p.actions.idle.setEffectiveTimeScale(idleStyle.timeScale);
            p.mesh.rotation.z = Math.sin(performance.now() / 1000 * idleStyle.swayFreq) * idleStyle.swayAmp;
        }
    } else if (p.mesh.rotation.z !== 0) {
        p.mesh.rotation.z = 0;
    }
    if (c.state === FIGHTER_STATE.IDLE || c.state === FIGHTER_STATE.WALK || c.state === FIGHTER_STATE.BLOCK || c.state === FIGHTER_STATE.RECOVERY || c.state === FIGHTER_STATE.BLOCKSTUN || c.state === FIGHTER_STATE.JUMP) processBufferedAttack(p);
    if (c.state !== FIGHTER_STATE.BLOCK && c.state !== FIGHTER_STATE.BLOCKSTUN && c.state !== FIGHTER_STATE.GUARD_BREAK && p.guardHealth < 100) {
        p.guardHealth = Math.min(100, p.guardHealth + 15 * frameDt);
    }
    p.velocity = c.state === FIGHTER_STATE.DASH ? c.dashDir * 3 : c.motionVelocity;
    updateCombatHitboxes(p, showCombatHitboxes);
}

function updateHumanControl(player, playerId, opponent, frameDt) {
    if (!player) return;
    const actions = playerActionState(playerId);
    const combat = player.combat;

    player.velocity = 0;

    if (combat && [FIGHTER_STATE.IDLE, FIGHTER_STATE.WALK, FIGHTER_STATE.BLOCK].includes(combat.state) && !player.isDead) {
        const jumpHeld = isActionHeld(actions, ACTION.JUMP);
        if (jumpHeld && !player.jumpWasHeld && player.jumps < 2) {
            player.isJumping = true;
            player.velocityY = playerId === 1 ? 5.0 : 4.0;
            player.jumps++;
            changeCombatState(player, FIGHTER_STATE.JUMP);
            if (player.jumps > 1) {
                player.fadeTo('doubleJump', 0.1);
                spawnParticles(player.mesh.position, 'dash');
                AudioSynth.playSwing();
            } else {
                player.fadeTo('jumpUp', 0.1);
            }
        }
        player.jumpWasHeld = jumpHeld;

        if (!player.isJumping && combat.state !== FIGHTER_STATE.DASH) {
            if (isActionHeld(actions, ACTION.BLOCK)) {
                resetCombo(player);
                player.fadeTo('block', 0.1);
            } else {
            if (isActionHeld(actions, ACTION.MOVE_LEFT)) player.velocity = -2.5;
            if (isActionHeld(actions, ACTION.MOVE_RIGHT)) player.velocity = 2.5;

                if (player.velocity !== 0) {
                    player.fadeTo(getLocomotionAnimation(player, opponent), 0.12);
                } else {
                    player.fadeTo('idle', 0.15);
                }
            }
        }
    }
    syncCombatIntent(player, isActionHeld(actions, ACTION.BLOCK));
}

function syncCombatIntent(player, blockHeld = false) {
    if (!player?.combat) return;
    const c = player.combat;
    if (player.isJumping) {
        // Airborne: the JUMP state owns neutral air time, but an in-flight
        // air attack keeps its state until it lands or finishes.
        const inAirAttack = c.state === FIGHTER_STATE.STARTUP || c.state === FIGHTER_STATE.ACTIVE || c.state === FIGHTER_STATE.RECOVERY;
        if (c.state !== FIGHTER_STATE.JUMP && !inAirAttack) changeCombatState(player, FIGHTER_STATE.JUMP);
        c.motionVelocity = 0;
        player.velocity = 0;
        return;
    }
    if (c.state === FIGHTER_STATE.JUMP) changeCombatState(player, FIGHTER_STATE.IDLE);
    if ([FIGHTER_STATE.IDLE, FIGHTER_STATE.WALK, FIGHTER_STATE.BLOCK].includes(c.state)) {
        if (blockHeld) {
            if (c.state !== FIGHTER_STATE.BLOCK) { changeCombatState(player, FIGHTER_STATE.BLOCK); player.fadeTo('block', .08); }
            c.motionVelocity = 0;
        } else if (player.velocity !== 0) {
            if (c.state !== FIGHTER_STATE.WALK) changeCombatState(player, FIGHTER_STATE.WALK);
            c.motionVelocity = THREE.MathUtils.lerp(c.motionVelocity || 0, player.velocity, .32);
            player.velocity = c.motionVelocity;
        } else {
            c.motionVelocity = THREE.MathUtils.lerp(c.motionVelocity || 0, 0, .28);
            player.velocity = Math.abs(c.motionVelocity) < .025 ? 0 : c.motionVelocity;
            if (c.state !== FIGHTER_STATE.IDLE && player.velocity === 0) { changeCombatState(player, FIGHTER_STATE.IDLE); player.fadeTo('idle', .12); }
        }
    } else {
        c.motionVelocity = 0;
        player.velocity = 0;
    }
}

function updateStoryEnemyControl(frameDt) {
    if (!storyEnemy) return;

    if (storyEnemy.pendingRemoteBuffer) {
        bufferAttackInput(storyEnemy.id, storyEnemy.pendingRemoteBuffer);
        storyEnemy.pendingRemoteBuffer = null;
    }

    storyEnemy.velocity = 0;
    const target = resolveStoryEnemyTarget();
    if (!target) return;
    const combat = storyEnemy.combat;

    if ((isStoryCoopMode() && isHost) || gameMode === MODE.STORY_SOLO) {
        if (combat && [FIGHTER_STATE.IDLE, FIGHTER_STATE.WALK, FIGHTER_STATE.BLOCK].includes(combat.state) && !storyEnemy.isDead) {
            if (performance.now() > storyEnemy.aiNextActionTime && !storyEnemy.isJumping && combat.state !== FIGHTER_STATE.DASH) {
                const dist = Math.abs(storyEnemy.mesh.position.x - target.mesh.position.x);
                let nextState = 'idle';
                let nextDelay = 500;
                let buffer = null;

                if (dist > 2.2) {
                    nextState = 'forward';
                    nextDelay = 320 + simRandom() * 300;
                } else if (dist < 1.0) {
                    nextState = 'backward';
                    nextDelay = 260 + simRandom() * 220;
                } else if (simRandom() < 0.8) {
                    buffer = simRandom() < 0.5 ? 'punch' : 'kick';
                    nextState = 'idle';
                    nextDelay = 540 + simRandom() * 480;
                } else {
                    nextState = 'block';
                    nextDelay = 420 + simRandom() * 260;
                }

                storyEnemy.aiState = nextState;
                storyEnemy.aiTargetPlayerId = target.id;
                storyEnemy.aiNextActionTime = performance.now() + nextDelay;
                if (buffer) {
                    bufferAttackInput(storyEnemy.id, buffer);
                }
                broadcastStoryEnemyState(nextState, target.id, nextDelay, buffer);
            }
        }
    }

    if (storyEnemy.aiState === 'block') {
        resetCombo(storyEnemy);
        storyEnemy.fadeTo('block', 0.1);
    } else if (storyEnemy.aiState === 'forward') {
        storyEnemy.velocity = storyEnemy.direction * 2.4;
    } else if (storyEnemy.aiState === 'backward') {
        storyEnemy.velocity = storyEnemy.direction * -2.0;
    }

    syncCombatIntent(storyEnemy, storyEnemy.aiState === 'block');
    if (combat?.state === FIGHTER_STATE.WALK && storyEnemy.velocity !== 0) {
        storyEnemy.fadeTo(getLocomotionAnimation(storyEnemy, target), 0.12);
    } else if ([FIGHTER_STATE.IDLE, FIGHTER_STATE.BLOCK].includes(combat?.state)) {
        storyEnemy.fadeTo('idle', 0.15);
    }
}

// Auto-facing: a pair of opponents always ends up facing each other.
// Everyday maneuvering turns smoothly, but an actual cross-over (their
// x-order flips past a small hysteresis band) snaps instantly so nobody
// is left fighting backwards after someone jumps or dives over.
function updateFacing(a, b) {
    if (!a?.mesh || !b?.mesh || a.isDead || b.isDead) return;
    const dx = a.mesh.position.x - b.mesh.position.x;
    if (Math.abs(dx) < 0.12) return; // too close to call: hold current facing
    const order = dx < 0 ? 1 : -1;
    const crossed = a._faceOrder !== undefined && a._faceOrder !== order;
    a._faceOrder = order;
    b._faceOrder = order;
    const aTarget = order === 1 ? Math.PI / 2 : -Math.PI / 2;
    const bTarget = order === 1 ? -Math.PI / 2 : Math.PI / 2;
    if (crossed) {
        a.mesh.rotation.y = aTarget;
        b.mesh.rotation.y = bTarget;
    } else {
        a.mesh.rotation.y = THREE.MathUtils.lerp(a.mesh.rotation.y, aTarget, 0.15);
        b.mesh.rotation.y = THREE.MathUtils.lerp(b.mesh.rotation.y, bTarget, 0.15);
    }
    a.direction = order;
    b.direction = -order;
}

function updateStoryModeFrame(frameDt) {
    const enemy = storyEnemy;
    const hero1 = players[0];
    const hero2 = players[1];

    updateHumanControl(hero1, 1, enemy, frameDt);
    if (hero2) updateHumanControl(hero2, 2, enemy, frameDt);
    updateStoryEnemyControl(frameDt);

    const targetForEnemy = resolveStoryEnemyTarget();
    if (enemy && targetForEnemy) {
        const minimumSpacing = 1.05;
        const separation = enemy.mesh.position.x - targetForEnemy.mesh.position.x;
        if (Math.abs(separation) < minimumSpacing) {
            const side = Math.sign(separation) || (enemy.direction || 1);
            enemy.mesh.position.x = THREE.MathUtils.clamp(
                targetForEnemy.mesh.position.x + side * minimumSpacing,
                -9.5,
                9.5
            );
        }
    }

    [hero1, hero2].filter(Boolean).forEach((hero) => {
        if (!enemy) return;
        updateFacing(hero, enemy);
    });

    if (enemy && targetForEnemy) {
        updateFacing(enemy, targetForEnemy);
    }

}

function updateVersusModeFrame(frameDt) {
    const p1 = players[0];
    const p2 = players[1];
    if (!p1 || !p2) return;

    updateHumanControl(p1, 1, p2, frameDt);

    p2.velocity = 0;
    const p2Combat = p2.combat;
    if (isTrainingMode()) {
        updateTrainingDummy(p2, p1, frameDt);
    } else if (isArcadeMode() && p2Combat && [FIGHTER_STATE.IDLE, FIGHTER_STATE.WALK, FIGHTER_STATE.BLOCK].includes(p2Combat.state) && !p2.isDead) {
        if (performance.now() > aiNextActionTime && !p2.isJumping && p2Combat.state !== FIGHTER_STATE.DASH) {
            const dist = Math.abs(p2.mesh.position.x - p1.mesh.position.x);
            if (aiHitCount >= 3 && simRandom() < 0.5) {
                aiHitCount = 0;
                aiCurrentAction = 'backward';
                aiNextActionTime = performance.now() + 800;
            } else if (dist > 1.8) {
                aiCurrentAction = 'forward';
                aiNextActionTime = performance.now() + 300 + simRandom() * 400;
            } else if (simRandom() < 0.85) {
                bufferAttackInput(2, simRandom() < 0.5 ? 'punch' : 'kick');
                aiCurrentAction = 'idle';
                aiNextActionTime = performance.now() + 600 + simRandom() * 600;
            } else {
                aiCurrentAction = 'block';
                aiNextActionTime = performance.now() + 500 + simRandom() * 500;
            }
        }
        if (aiCurrentAction === 'forward') p2.velocity = p2.direction * 2.5;
        if (aiCurrentAction === 'backward') p2.velocity = p2.direction * -2.5;
        syncCombatIntent(p2, aiCurrentAction === 'block');
        if (p2Combat.state === FIGHTER_STATE.WALK) p2.fadeTo(getLocomotionAnimation(p2, p1), 0.12);
        if (p2Combat.state === FIGHTER_STATE.BLOCK) p2.fadeTo('block', 0.1);
        if (p2Combat.state === FIGHTER_STATE.IDLE) p2.fadeTo('idle', 0.15);
    } else {
        updateHumanControl(p2, 2, p1, frameDt);
    }

    updateFacing(p1, p2);
}

// --- Performance overlay (item 4) ---
let perfOverlayVisible = false;

function togglePerfOverlay() {
    perfOverlayVisible = !perfOverlayVisible;
    const el = document.getElementById('perf-overlay');
    if (el) {
        el.style.display = perfOverlayVisible ? 'block' : 'none';
        if (perfOverlayVisible) el.textContent = formatPerfStats();
    }
}

// --- 13B. DETERMINISTIC REPLAY (item 2) ---
// The simulation draws randomness from a seeded stream (reseeded every
// fight in startFight). A recording captures, per sim step, each fighter's
// held-action bitmask plus the discrete presses that landed during that
// step, alongside a hash of the resulting sim state. Playing a recording
// back re-injects those inputs at the top of each step; the exit gate is
// digest equality across two playbacks of the same recording.
let fightSeedCounter = 0;
let replayRecorder = createReplayRecorder();
let replayPlayback = null; // { frames, index } while a recording plays back
let simSuspended = false;  // training frame-step: freeze the sim loop
let replayStepIndex = 0;
let pendingHeld = { 1: 0, 2: 0 };
let pendingPressed = { 1: [], 2: [] };

function simFighters() {
    const list = [...players];
    if (Array.isArray(activeEnemies)) list.push(...activeEnemies);
    if (storyEnemy) list.push(storyEnemy);
    return list.filter(Boolean);
}

function beginSimFrame() {
    const s1 = playerActionState(1);
    const s2 = playerActionState(2);
    if (replayPlayback) {
        const rec = replayPlayback.frames[replayPlayback.index];
        if (!rec) { stopReplayPlayback(); return; }
        applyActionBitmask(s1, rec.held[1]);
        applyActionBitmask(s2, rec.held[2]);
        // Discrete presses, dispatched as replay: attacks buffer and recorded
        // dashes fire, but live-only derivations (double-tap detection,
        // network send) are skipped inside handleActionPress.
        for (const entry of rec.pressed[1]) handleActionPress(1, entry.action, true, entry.data);
        for (const entry of rec.pressed[2]) handleActionPress(2, entry.action, true, entry.data);
        replayPlayback.index++;
        pendingHeld = { 1: rec.held[1], 2: rec.held[2] };
        pendingPressed = { 1: [], 2: [] };
    } else {
        pendingHeld = { 1: heldActionBitmask(s1), 2: heldActionBitmask(s2) };
        pendingPressed = { 1: drainPressedActions(s1), 2: drainPressedActions(s2) };
        if (isTrainingMode()) {
            for (const entry of pendingPressed[1]) logTrainingInput(replayStepIndex, 1, entry.action);
            for (const entry of pendingPressed[2]) logTrainingInput(replayStepIndex, 2, entry.action);
        }
    }
}

function endSimFrame() {
    const frameIndex = replayStepIndex++;
    if (!replayRecorder.active) return;
    replayRecorder.recordFrame(frameIndex, pendingHeld, pendingPressed, hashSimFrame(simFighters()));
}

function startReplayRecording() {
    replayPlayback = null;
    replayStepIndex = 0;
    replayRecorder.start(getSimSeed());
}

function stopReplayRecording() {
    replayRecorder.stop();
}

function startReplayPlayback(recording) {
    replayRecorder.stop();
    reseedSim(recording.seed);
    // Drop any live presses queued during the hiatus so they can't leak
    // into the scenario after playback ends.
    drainPressedActions(playerActionState(1));
    drainPressedActions(playerActionState(2));
    replayPlayback = { frames: recording.frames, index: 0 };
}

function stopReplayPlayback() {
    replayPlayback = null;
}

function isReplayPlaying() {
    return !!replayPlayback;
}

// --- 13C. TRAINING LAB (item 6) ---
// Versus rules with a configurable dummy, frame-step control, an input
// history panel, and record/verify wiring for the deterministic replay
// harness above. The round timer stays frozen and KOs reset the scenario
// instead of ending the round.
let trainingDummyMode = 'idle'; // 'idle' | 'block'
let trainingStatusMessage = '';
const trainingInputLog = [];
const TRAINING_INPUT_LOG_MAX = 24;

function updateTrainingDummy(dummy, player, frameDt) {
    dummy.velocity = 0;
    const combat = dummy.combat;
    if (!combat || dummy.isDead) { syncCombatIntent(dummy, false); return; }
    if ([FIGHTER_STATE.IDLE, FIGHTER_STATE.WALK, FIGHTER_STATE.BLOCK].includes(combat.state)) {
        if (trainingDummyMode === 'block') {
            syncCombatIntent(dummy, true);
        } else {
            syncCombatIntent(dummy, false);
            dummy.fadeTo('idle', 0.15);
        }
    } else {
        syncCombatIntent(dummy, false);
    }
}

function resetTrainingScenario() {
    if (!isTrainingMode()) return;
    stopReplayPlayback();
    stopReplayRecording();
    clearScheduledEvents();
    simSuspended = false;
    hitStopFrames = 0;
    combatAccumulator = 0;
    removeFighterList(players);
    const p1 = spawnFighter(selections[1], -3.4, true);
    const p2 = spawnFighter(selections[2], 3.4, false);
    players.push(p1, p2);
    // The intro choreography mutates mesh.position (covered by the replay
    // hash), so the lab scenario explicitly runs without it: same spawn
    // pose every reset keeps recordings and verify passes comparable.
    for (const [fighter, x] of [[p1, -3.4], [p2, 3.4]]) {
        fighter.introMotion = null;
        fighter.introPhase = null;
        fighter.mesh.position.set(x, 0, 0);
    }
    clearActionState(playerActionState(1));
    clearActionState(playerActionState(2));
    globalHitComboCount = 0;
    updateComboUI();
    // Same seed as the current fight, so a re-run of the scenario is identical.
    reseedSim(getSimSeed());
    replayStepIndex = 0;
    trainingInputLog.length = 0;
    gameActive = true;
    document.getElementById('gameover-screen').style.display = 'none';
    updateHealthBars();
    setTrainingStatus('Scenario reset.');
    updateTrainingHud();
}

function toggleTrainingDummy() {
    if (!isTrainingMode() || !gameActive) return;
    trainingDummyMode = trainingDummyMode === 'block' ? 'idle' : 'block';
    setTrainingStatus(`Dummy: ${trainingDummyMode}.`);
    updateTrainingHud();
}

function toggleTrainingFreeze() {
    if (!isTrainingMode() || !gameActive || isReplayPlaying()) return;
    simSuspended = !simSuspended;
    setTrainingStatus(simSuspended ? 'Frozen — N steps one frame.' : 'Running.');
    updateTrainingHud();
}

function stepTrainingFrame() {
    if (!isTrainingMode() || !gameActive || !simSuspended || isReplayPlaying()) return;
    simSuspended = false;
    advanceCombatSimulation(COMBAT_STEP);
    simSuspended = true;
    updateTrainingHud();
}

function toggleTrainingRecording() {
    if (!isTrainingMode() || !gameActive || isReplayPlaying()) return;
    if (replayRecorder.active) {
        stopReplayRecording();
        setTrainingStatus(`Recording stopped — ${replayRecorder.frameCount()} frames. Press Verify to check determinism.`);
    } else {
        resetTrainingScenario();
        startReplayRecording();
        setTrainingStatus('Recording… fight, then press Record again to stop.');
    }
    updateTrainingHud();
}

// Exit gate: reset the scenario, play the recording back twice through the
// real fixed-step path, and compare per-frame digests (and against the
// original recording). Runs synchronously; the rAF loop cannot interleave.
function verifyTrainingRecording() {
    if (!isTrainingMode()) return;
    const frames = replayRecorder.frames;
    if (!frames || frames.length === 0) {
        setTrainingStatus('Nothing recorded yet — press Record, fight, stop, then Verify.');
        updateTrainingHud();
        return;
    }
    if (!gameActive) {
        setTrainingStatus('Start or reset the scenario (R) before verifying.');
        updateTrainingHud();
        return;
    }
    const seed = replayRecorder.seed;
    const passes = [];
    try {
        for (let pass = 0; pass < 2; pass++) {
            resetTrainingScenario();
            reseedSim(seed);
            startReplayPlayback({ seed, frames });
            const hashes = [];
            for (let i = 0; i < frames.length && gameActive; i++) {
                advanceCombatSimulation(COMBAT_STEP);
                hashes.push(hashSimFrame(simFighters()));
            }
            stopReplayPlayback();
            passes.push(hashes);
        }
    } finally {
        stopReplayPlayback();
    }
    const asFrames = (hashes) => hashes.map((hash) => ({ hash }));
    const divAB = firstDivergentFrame(asFrames(passes[0]), asFrames(passes[1]));
    const divRec = firstDivergentFrame(frames, asFrames(passes[0]));
    let result;
    if (passes[0].length !== frames.length || passes[1].length !== frames.length) {
        result = `INCOMPLETE — the round ended early (KO?). Verify needs a KO-free recording of ${frames.length} frames.`;
    } else if (divAB !== -1) {
        result = `FAIL — playbacks diverged at frame ${divAB}.`;
    } else if (divRec !== -1) {
        result = `FAIL — playback diverged from the recording at frame ${divRec}.`;
    } else {
        result = `PASS — ${frames.length} frames, two playbacks identical (digest ${fnv1a(passes[0].join(','))}).`;
    }
    resetTrainingScenario();
    setTrainingStatus(result);
    updateTrainingHud();
}

function setTrainingStatus(msg) {
    trainingStatusMessage = msg;
    const el = document.getElementById('training-status');
    if (el) el.textContent = msg;
}

function logTrainingInput(frameIndex, playerId, action) {
    trainingInputLog.push({ frame: frameIndex, playerId, action });
    if (trainingInputLog.length > TRAINING_INPUT_LOG_MAX) trainingInputLog.splice(0, trainingInputLog.length - TRAINING_INPUT_LOG_MAX);
    const el = document.getElementById('training-input-log');
    if (el) {
        el.innerHTML = trainingInputLog.map((e) => `<div><span class="tlog-frame">f${e.frame}</span> P${e.playerId} ${e.action}</div>`).join('');
        el.scrollTop = el.scrollHeight;
    }
}

function updateTrainingHud() {
    if (!isTrainingMode()) return;
    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    set('training-dummy-mode', `Dummy: ${trainingDummyMode}`);
    set('training-freeze-state', simSuspended ? 'Frozen (N = step)' : 'Running');
    set('training-rec-state', replayRecorder.active ? `Recording… ${replayRecorder.frameCount()}f` : (isReplayPlaying() ? 'Playing back…' : 'Idle'));
    setTrainingStatus(trainingStatusMessage);
}

function setTrainingHudVisible(visible) {
    const el = document.getElementById('training-hud');
    if (el) el.style.display = visible ? 'block' : 'none';
    if (visible) updateTrainingHud();
}

// --- 14. TICK RUNTIME ENGINE LOOP ---
const clock = new THREE.Clock();
const COMBAT_STEP = 1 / FRAME_RATE;
let combatAccumulator = 0;

function advanceCombatSimulation(step = COMBAT_STEP) {
    if (!gameActive || simSuspended) return;
    beginSimFrame();
    if (isStoryMode()) {
        const enemy = storyEnemy;
        const heroes = players.filter(Boolean);
        updateStoryModeFrame(step);
        heroes.forEach((hero) => advanceCombatFighterStep(hero, enemy, step));
        if (enemy) advanceCombatFighterStep(enemy, resolveStoryEnemyTarget(), step);
    } else if (players.length === 2) {
        updateVersusModeFrame(step);
        advanceCombatFighterStep(players[0], players[1], step);
        advanceCombatFighterStep(players[1], players[0], step);
    }
    endSimFrame();
}

function animate() {
    requestAnimationFrame(animate);

    // Bluetooth controller (PS4 etc.): translate the pad into the same
    // action vocabulary as keyboard and touch zones. Polled every frame so
    // edges land before the fixed-step simulation consumes them.
    pollGamepad({
        playerId: localPlayerId(),
        isFocusScheme: isFocusScheme(),
        combatActive: gameActive && !gamePaused,
        pauseToggleActive: gameActive,
        press: (pid, action) => {
            const st = playerActionState(pid);
            pressAction(st, action);
            handleActionPress(pid, action, false);
        },
        release: (pid, action) => releaseAction(playerActionState(pid), action),
        togglePause: () => togglePause(),
    });

    if (gamePaused) return;

    const rawDt = clock.getDelta();
    const realDt = Math.min(rawDt, 0.1);

    if (slowMoTimer > 0) {
        slowMoTimer -= realDt;
        if (slowMoTimer <= 0) {
            globalTimeScale = 1.0;
        }
    }

    const frameDt = realDt * globalTimeScale;

    combatAccumulator = Math.min(combatAccumulator + frameDt, COMBAT_STEP * 4);
    const simStart = perfBeginSim();
    let simSteps = 0;
    while (combatAccumulator >= COMBAT_STEP) {
        // Frame-indexed hitstop: freeze the simulation for exactly
        // move.hitstop sim steps while presentation keeps running.
        if (hitStopFrames > 0) {
            hitStopFrames--;
        } else {
            advanceCombatSimulation(COMBAT_STEP);
            simSteps++;
        }
        combatAccumulator -= COMBAT_STEP;
    }
    perfEndSim(simStart, simSteps);

    updateParticles(frameDt);

    players.forEach((player) => {
        updateIntroMotion(player, frameDt);
    });

    if (storyEnemy) {
        updateIntroMotion(storyEnemy, frameDt);
    }


    players.forEach(p => {
        if (p.mixer) p.mixer.update(frameDt);
        if (p.mesh) {
            if (!p.isJumping || p.isHit || p.currentState === 'knockdown' || p.currentState === 'getUp' || p.isDead) {
                reconcileGroundedState(p, 'post-mixer');
            } else if (p.mesh.position.y < GROUND_Y) {
                reconcileGroundedState(p, 'below-ground');
            }
        }
        updateFocusPresentation(p);
    });
    storyEnemyManager.update(frameDt);
    previewFighters.forEach((fighter) => {
        if (fighter.mixer) fighter.mixer.update(frameDt);
        if (fighter.mesh && fighter.mesh.position.y < GROUND_Y) fighter.mesh.position.y = GROUND_Y;
    });

    // Slowly spin the carousel rig in the background
    if (carouselRig) {
        carouselRig.rotation.y += 0.24 * realDt; // faster ambient spin for the select backdrop
    }

    // Placeholder stage ambient animation (visuals only, no allocations)
    if (activeStageUpdate) {
        stageElapsedTime += realDt;
        activeStageUpdate(realDt, stageElapsedTime);
    }

    updateCameraDirector();
    updateCameraShake(realDt);

    const renderStart = performance.now();
    renderer.render(scene, camera);
    perfNoteRender(performance.now() - renderStart, particles.length);
    if (perfOverlayVisible) {
        const perfEl = document.getElementById('perf-overlay');
        if (perfEl) perfEl.textContent = formatPerfStats();
    }
}

function resizeRendererToViewport() {
    const viewport = window.visualViewport;
    const w = Math.round(viewport?.width || window.innerWidth);
    const h = Math.round(viewport?.height || window.innerHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}

window.addEventListener('resize', resizeRendererToViewport);
window.visualViewport?.addEventListener('resize', resizeRendererToViewport);
window.visualViewport?.addEventListener('scroll', resizeRendererToViewport);

animate();

window.openStoryMenu = openStoryMenu;
window.closeStoryMenu = closeStoryMenu;
window.openLobby = openLobby;
window.closeLobby = closeLobby;
window.hostGame = hostGame;
window.joinGame = joinGame;
window.openOptions = openOptions;
window.closeOptions = closeOptions;
window.updateAudioOptions = updateAudioOptions;
window.selectCharacter = selectCharacter;
window.quitToMainMenu = quitToMainMenu;
window.togglePause = togglePause;
window.toggleTrainingDummy = toggleTrainingDummy;
window.toggleTrainingFreeze = toggleTrainingFreeze;
window.stepTrainingFrame = stepTrainingFrame;
window.resetTrainingScenario = resetTrainingScenario;
window.toggleTrainingRecording = toggleTrainingRecording;
window.verifyTrainingRecording = verifyTrainingRecording;
window.advanceTime = (ms) => {
    const steps = Math.max(1, Math.round(ms / (1000 / FRAME_RATE)));
    for (let index = 0; index < steps; index++) advanceCombatSimulation(COMBAT_STEP);
    updateHealthBars();
    updateCameraDirector();
    renderer.render(scene, camera);
};
function summarizeCombatBox(box) {
    if (!box || !box.min || !box.max || !Number.isFinite(box.min.x)) return null;
    return {
        min: [Number(box.min.x.toFixed(2)), Number(box.min.y.toFixed(2)), Number(box.min.z.toFixed(2))],
        max: [Number(box.max.x.toFixed(2)), Number(box.max.y.toFixed(2)), Number(box.max.z.toFixed(2))]
    };
}
window.render_game_to_text = () => JSON.stringify({
    mode: gameMode,
    active: gameActive,
    story: isStoryMode() ? {
        chapter: storyRun.chapterIndex + 1,
        wave: storyRun.encounterIndex + 1,
        status: storyRun.status
    } : null,
    coordinateSystem: 'x increases right; y increases upward; z is stage depth',
    heroes: players.map((hero) => ({
        id: hero.id,
        health: Math.max(0, Math.round(hero.health)),
        meter: Math.round(hero.meter || 0),
        position: Number(hero.mesh?.position.x.toFixed(2) || 0),
        velocity: Number((hero.velocity || 0).toFixed(2)),
        state: hero.combat?.state || hero.currentState,
        frame: hero.combat?.frame || 0,
        stateFrame: hero.combat?.stateFrame || 0,
        move: hero.combat?.move?.id || null,
        armor: hero.combat?.armor || 0,
        buffered: hero.combat?.buffer.map((entry) => entry.type) || [],
        hitboxActive: !!hero.combat?.hitboxes?.attack,
        attackBox: summarizeCombatBox(hero.combat?.hitboxes?.attack),
        hurtBox: summarizeCombatBox(hero.combat?.hitboxes?.hurt?.[1]?.box)
    })),
    activeEnemies: activeEnemies.map((enemy) => ({
        id: enemy.charId,
        health: Math.max(0, Math.round(enemy.health)),
        position: Number(enemy.mesh?.position.x.toFixed(2) || 0),
        state: enemy.combat?.state || enemy.currentState,
        stateFrame: enemy.combat?.stateFrame || 0,
        move: enemy.combat?.move?.id || null,
        armor: enemy.combat?.armor || 0,
        meter: Math.round(enemy.meter || 0),
        hitboxActive: !!enemy.combat?.hitboxes?.attack
    }))
});
