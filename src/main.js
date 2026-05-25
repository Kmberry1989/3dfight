import './style.css';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import Peer from 'peerjs';

// --- 1. WEB AUDIO SYNTHESIZER ---
const AudioSynth = {
    ctx: null,
    init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    },
    playSelect() {
        this.init();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
        gain.gain.setValueAtTime(0.15 * sfxVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.01 * sfxVolume, now + 0.15);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
    },
    playSwing() {
        this.init();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const pitchMod = 0.85 + Math.random() * 0.3;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(250 * pitchMod, now);
        osc.frequency.exponentialRampToValueAtTime(60 * pitchMod, now + 0.2);
        gain.gain.setValueAtTime(0.3 * sfxVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.01 * sfxVolume, now + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
    },
    playHit() {
        this.init();
        const now = this.ctx.currentTime;
        const pitchMod = 0.8 + Math.random() * 0.4;

        const subOsc = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        subOsc.type = 'sawtooth';
        subOsc.frequency.setValueAtTime(120 * pitchMod, now);
        subOsc.frequency.linearRampToValueAtTime(40 * pitchMod, now + 0.15);
        subGain.gain.setValueAtTime(0.4 * sfxVolume, now);
        subGain.gain.exponentialRampToValueAtTime(0.01 * sfxVolume, now + 0.2);
        subOsc.connect(subGain);
        subGain.connect(this.ctx.destination);
        subOsc.start(now);
        subOsc.stop(now + 0.2);

        const bufferSize = this.ctx.sampleRate * 0.1;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 600 * pitchMod;
        filter.Q.value = 3.0;

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.5 * sfxVolume, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01 * sfxVolume, now + 0.1);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);
        noise.start(now);
        noise.stop(now + 0.1);
    },
    playBlock() {
        this.init();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1800, now);
        osc.frequency.linearRampToValueAtTime(1400, now + 0.08);
        gain.gain.setValueAtTime(0.2 * sfxVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.005 * sfxVolume, now + 0.1);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
    },
    playWin() {
        this.init();
        const now = this.ctx.currentTime;
        const notes = [261.63, 329.63, 392.00, 523.25]; // C major chord
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * 0.08);
            gain.gain.setValueAtTime(0.15 * sfxVolume, now + idx * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001 * sfxVolume, now + idx * 0.08 + 0.6);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + idx * 0.08);
            osc.stop(now + idx * 0.08 + 0.6);
        });
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

const COMBO_SEQUENCE = ['light', 'medium', 'heavy'];
const COMBO_RESET_DELAY = 0.45;
const FOOT_BONE_KEYWORDS = ['toe_end', 'toebase', 'foot'];
const FOOT_GROUND_OFFSET = 0.025;
const CLOSE_STEP_DISTANCE = 2.9;

const ATTACKS = {
    punch: {
        light: {
            animation: 'punchLight',
            limbKeywords: ['righthand', 'hand'],
            hitWindow: [0.20, 0.45],
            queueWindowStart: 0.42,
            chainAt: 0.72,
            damage: 4,
            blockDamage: 1,
            knockback: 0.22,
            blockKnockback: 0.14,
            reactionTravel: 0.22,
            forwardTravel: 0.34,
            settleBack: 0.05,
            minSpacing: 0.92,
            reaction: 'hitMidLight',
            comboEnder: false
        },
        medium: {
            animation: 'punchMedium',
            limbKeywords: ['righthand', 'hand'],
            hitWindow: [0.26, 0.54],
            queueWindowStart: 0.46,
            chainAt: 0.76,
            damage: 7,
            blockDamage: 2,
            knockback: 0.38,
            blockKnockback: 0.18,
            reactionTravel: 0.38,
            forwardTravel: 0.48,
            settleBack: 0.06,
            minSpacing: 0.88,
            reaction: 'hitMidMedium',
            comboEnder: false
        },
        heavy: {
            animation: 'punchHeavy',
            limbKeywords: ['righthand', 'hand'],
            hitWindow: [0.32, 0.62],
            queueWindowStart: 1,
            chainAt: 1,
            damage: 11,
            blockDamage: 3,
            knockback: 0.62,
            blockKnockback: 0.22,
            reactionTravel: 0.62,
            forwardTravel: 0.66,
            settleBack: 0.08,
            windupBackstep: 0.12,
            minSpacing: 0.84,
            reaction: 'hitMidHeavy',
            comboEnder: true
        }
    },
    kick: {
        light: {
            animation: 'kickLight',
            limbKeywords: ['rightfoot', 'foot', 'leg'],
            hitWindow: [0.24, 0.48],
            queueWindowStart: 0.42,
            chainAt: 0.74,
            damage: 5,
            blockDamage: 1,
            reachX: 1.4,
            reachY: 1.2,
            knockback: 0.28,
            blockKnockback: 0.16,
            reactionTravel: 0.28,
            forwardTravel: 0.42,
            settleBack: 0.05,
            minSpacing: 0.98,
            reaction: 'hitLowLight',
            comboEnder: false
        },
        medium: {
            animation: 'kickMedium',
            limbKeywords: ['rightfoot', 'foot', 'leg'],
            hitWindow: [0.30, 0.56],
            queueWindowStart: 0.48,
            chainAt: 0.80,
            damage: 8,
            blockDamage: 2,
            knockback: 0.46,
            blockKnockback: 0.20,
            reactionTravel: 0.46,
            forwardTravel: 0.58,
            settleBack: 0.07,
            minSpacing: 0.94,
            reaction: 'hitLowMedium',
            comboEnder: false
        },
        heavy: {
            animation: 'kickHeavy',
            limbKeywords: ['rightfoot', 'foot', 'leg'],
            hitWindow: [0.36, 0.66],
            queueWindowStart: 1,
            chainAt: 1,
            damage: 13,
            blockDamage: 3,
            knockback: 0.78,
            blockKnockback: 0.24,
            reactionTravel: 0.78,
            forwardTravel: 0.78,
            settleBack: 0.10,
            windupBackstep: 0.16,
            minSpacing: 0.90,
            reaction: 'hitLowHeavy',
            comboEnder: true
        }
    },
    special: {
        light: {
            animation: 'specialLight',
            limbKeywords: ['rightfoot', 'foot', 'leg'],
            hitWindow: [0.24, 0.48],
            queueWindowStart: 0.42,
            chainAt: 0.74,
            damage: 6,
            blockDamage: 2,
            reachX: 1.6,
            reachY: 1.2,
            knockback: 0.35,
            blockKnockback: 0.20,
            reactionTravel: 0.35,
            forwardTravel: 0.42,
            settleBack: 0.05,
            minSpacing: 0.98,
            reaction: 'hitMidLight',
            comboEnder: false
        },
        medium: {
            animation: 'specialMedium',
            limbKeywords: ['rightfoot', 'foot', 'leg'],
            hitWindow: [0.30, 0.56],
            queueWindowStart: 0.48,
            chainAt: 0.80,
            damage: 9,
            blockDamage: 3,
            reachX: 1.6,
            reachY: 1.2,
            knockback: 0.5,
            blockKnockback: 0.25,
            reactionTravel: 0.5,
            forwardTravel: 0.58,
            settleBack: 0.07,
            minSpacing: 0.94,
            reaction: 'hitLowMedium',
            comboEnder: false
        },
        heavy: {
            animation: 'specialHeavy',
            limbKeywords: ['rightarm', 'arm', 'hand'],
            hitWindow: [0.36, 0.66],
            queueWindowStart: 1,
            chainAt: 1,
            damage: 15,
            blockDamage: 4,
            reachX: 1.6,
            reachY: 1.2,
            knockback: 0.85,
            blockKnockback: 0.3,
            reactionTravel: 0.85,
            forwardTravel: 0.78,
            settleBack: 0.10,
            windupBackstep: 0.16,
            minSpacing: 0.90,
            reaction: 'hitHighHeavy',
            comboEnder: true
        }
    },
    jumpAttack: {
        light: {
            animation: 'jumpDown',
            limbKeywords: ['rightfoot', 'foot', 'leg'],
            hitWindow: [0.10, 0.80],
            queueWindowStart: 1,
            chainAt: 1,
            damage: 8,
            blockDamage: 2,
            reachX: 1.6,
            reachY: 1.6,
            knockback: 0.5,
            blockKnockback: 0.2,
            reactionTravel: 0.5,
            forwardTravel: 0,
            settleBack: 0,
            minSpacing: 0.9,
            reaction: 'hitMidHeavy',
            comboEnder: true
        },
        medium: {
            animation: 'jumpDown',
            limbKeywords: ['rightfoot', 'foot', 'leg'],
            hitWindow: [0.10, 0.80],
            queueWindowStart: 1,
            chainAt: 1,
            damage: 8,
            blockDamage: 2,
            reachX: 1.6,
            reachY: 1.6,
            knockback: 0.5,
            blockKnockback: 0.2,
            reactionTravel: 0.5,
            forwardTravel: 0,
            settleBack: 0,
            minSpacing: 0.9,
            reaction: 'hitMidHeavy',
            comboEnder: true
        },
        heavy: {
            animation: 'jumpDown',
            limbKeywords: ['rightfoot', 'foot', 'leg'],
            hitWindow: [0.10, 0.80],
            queueWindowStart: 1,
            chainAt: 1,
            damage: 8,
            blockDamage: 2,
            reachX: 1.6,
            reachY: 1.6,
            knockback: 0.5,
            blockKnockback: 0.2,
            reactionTravel: 0.5,
            forwardTravel: 0,
            settleBack: 0,
            minSpacing: 0.9,
            reaction: 'hitMidHeavy',
            comboEnder: true
        }
    }
};

const ATTACK_ACTION_KEYS = new Set(
    Object.values(ATTACKS).flatMap(branch =>
        Object.values(branch).map(attack => attack.animation)
    )
);
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

let gameMode = 'local';
let gamePaused = false;
let peer = null;
let conn = null;
let isHost = false;
let sfxVolume = 0.5;
let musicVolume = 0.5;
let bgMusic = new Audio('/stages/the_carousel/generic-loop.ogg');
bgMusic.loop = true;

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

    if (p2Hud && !document.getElementById('p2-guard-bar')) {
        const guardContainer2 = document.createElement('div');
        guardContainer2.className = 'guard-bar-outer';
        guardContainer2.innerHTML = '<div id="p2-guard-bar" class="guard-bar-inner"></div>';
        p2Hud.appendChild(guardContainer2);
    }
}

function showMainMenu() {
    document.getElementById('selector-screen').classList.add('hidden');
    document.getElementById('hud').style.display = 'none';
    document.getElementById('main-menu').style.display = 'flex';
    
    if (typeof gridHelper !== 'undefined') gridHelper.visible = true;
    if (typeof floor !== 'undefined') floor.visible = true;
}

window.startGameMode = function (mode) {
    gameMode = mode;
    if (mode === 'single') {
        tournamentOpponents = Object.keys(CHARACTERS).sort(() => 0.5 - Math.random());
        currentTournamentRound = 0;
    }
    document.getElementById('main-menu').style.display = 'none';
    showCharacterSelect();
};

function openLobby() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('lobby-screen').style.display = 'flex';
    if (!peer) {
        document.getElementById('lobby-status').textContent = 'Connecting to signaling server...';
        peer = new Peer();
        peer.on('open', id => {
            document.getElementById('lobby-status').textContent = 'Connected. READY to host or join.';
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
            gameMode = 'online';
            document.getElementById('lobby-screen').style.display = 'none';
            showCharacterSelect();
        } else if (data.type === 'input' && gameActive) {
            const remotePlayerId = isHost ? 2 : 1;
            if (data.action === 'keydown') {
                keys[data.key] = true;
                if (data.buffer) bufferAttackInput(remotePlayerId, data.buffer);
            } else if (data.action === 'keyup') {
                keys[data.key] = false;
            }
        } else if (data.type === 'select') {
            selectCharacter(data.player, data.charId, true);
        } else if (data.type === 'fight') {
            startFight(true);
        }
    });
    if (isHost) {
        setTimeout(() => {
            conn.send({ type: 'start' });
            gameMode = 'online';
            document.getElementById('lobby-screen').style.display = 'none';
            showCharacterSelect();
        }, 1000);
    }
}

function sendNetworkInput(action, key, buffer = null) {
    if (gameMode === 'online' && conn && conn.open) {
        conn.send({ type: 'input', action, key, buffer });
    }
}

function closeLobby() {
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('main-menu').style.display = 'flex';
}

function openOptions() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('options-menu').style.display = 'flex';
}

function closeOptions() {
    document.getElementById('options-menu').style.display = 'none';
    document.getElementById('main-menu').style.display = 'flex';
}

function updateAudioOptions() {
    sfxVolume = parseFloat(document.getElementById('sfx-vol').value);
    musicVolume = parseFloat(document.getElementById('music-vol').value);
    bgMusic.volume = musicVolume;
}

function togglePause() {
    if (!gameActive && !gamePaused) return;
    gamePaused = !gamePaused;
    document.getElementById('pause-screen').style.display = gamePaused ? 'flex' : 'none';
    if (!gamePaused && timerInterval === null && gameActive) {
        startTimer();
    } else if (gamePaused) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function quitToMainMenu() {
    gamePaused = false;
    gameActive = false;
    clearInterval(timerInterval);
    document.getElementById('pause-screen').style.display = 'none';
    document.getElementById('hud').style.display = 'none';
    document.getElementById('gameover-screen').style.display = 'none';
    if (comboUI) comboUI.classList.remove('show');
    removeFighterList(players);
    removeFighterList(previewFighters);
    showMainMenu();
    bgMusic.pause();
}

const DOUBLE_TAP_WINDOW = 250;
const lastTaps = { KeyA: 0, KeyD: 0, ArrowLeft: 0, ArrowRight: 0 };

window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && (gameActive || gamePaused)) {
        togglePause();
    }

    if (e.code) keys[e.code] = true;

    // --- DOUBLE-TAP DASH LOGIC ---
    if (!e.repeat && gameActive) {
        const now = performance.now();
        if (['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
            if (now - lastTaps[e.code] < DOUBLE_TAP_WINDOW) {
                const player = (e.code === 'KeyA' || e.code === 'KeyD') ? players[0] : players[1];
                if (player && !player.isAttacking && !player.isHit && !player.isDead && !player.isStunned && !player.isJumping && !player.isDashing) {
                    player.isDashing = true;
                    player.dashDir = (e.code === 'KeyA' || e.code === 'ArrowLeft') ? -1 : 1;
                    player.dashTimer = 0.25;
                    const anim = (player.dashDir === player.direction) ? 'stepForwardLong' : 'stepBackward';
                    player.fadeTo(anim, 0.05, 2.0); // Play dash animation at 2x speed
                    spawnParticles(player.mesh.position, 'dash'); // Minor dash burst
                }
            }
            lastTaps[e.code] = now;
        }
    }

    let bufferHit = null;
    if (!e.repeat) {
        if (e.code === 'Space') { bufferAttackInput(1, 'punch'); bufferHit = 'punch'; }
        if (e.code === 'ShiftLeft') { bufferAttackInput(1, 'kick'); bufferHit = 'kick'; }
        if (e.code === 'KeyC') { bufferAttackInput(1, 'special'); bufferHit = 'special'; }
        if (e.code === 'KeyP') { bufferAttackInput(2, 'punch'); bufferHit = 'punch'; }
        if (e.code === 'KeyO') { bufferAttackInput(2, 'kick'); bufferHit = 'kick'; }
        if (e.code === 'KeyI') { bufferAttackInput(2, 'special'); bufferHit = 'special'; }
    }

    if (gameMode === 'online') {
        if (isHost && (e.code === 'KeyA' || e.code === 'KeyD' || e.code === 'KeyS' || e.code === 'KeyW' || e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'KeyC')) {
            sendNetworkInput('keydown', e.code, bufferHit);
        } else if (!isHost && (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'KeyP' || e.code === 'KeyO' || e.code === 'KeyI')) {
            sendNetworkInput('keydown', e.code, bufferHit);
        }
    }

    // Prevent scrolling
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
    }
});

window.addEventListener('keyup', (e) => {
    if (e.code) keys[e.code] = false;

    if (gameMode === 'online') {
        if (isHost && (e.code === 'KeyA' || e.code === 'KeyD' || e.code === 'KeyS' || e.code === 'KeyW' || e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'KeyC')) {
            sendNetworkInput('keyup', e.code);
        } else if (!isHost && (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'KeyP' || e.code === 'KeyO' || e.code === 'KeyI')) {
            sendNetworkInput('keyup', e.code);
        }
    }
});

let isFallbackMode = false;
const loadedModels = {};
const loadedAnims = {};

// --- STAGE PROPS ---
let carouselRig = null;  // The spinning carousel_rig.glb object
let stageSceneRoot = null; // The stage environment (scene.glb)

// --- 3. ASSET LOAD PIPELINE ---
async function loadAssets() {
    const fbxLoader = new FBXLoader();
    const gltfLoader = new GLTFLoader();

    const charKeys = Object.keys(CHARACTERS);
    const animationManifest = buildAnimationManifest();
    const animKeys = Object.keys(animationManifest);
    // +2 for the stage scene.glb and carousel_rig.glb
    const totalFiles = charKeys.length + animKeys.length + 2;
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
                const targetSize = 8;
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
                // Push the rig back and lift it so its base sits on desiredFloorY
                carouselRig.position.set(0, desiredFloorY - bottomY, -14);

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

    await Promise.all([...animPromises, ...charPromises, stagePromise, carouselPromise]);

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
    initTouchControls();
    createComboUI();
    loadAssets();
});

// --- 4. CHARACTER SELECT CONTROL LOGIC ---
const selections = {
    1: 'kyle',
    2: 'jonah'
};

let p1Locked = false;
let p2Locked = false;
let tournamentOpponents = [];
let currentTournamentRound = 0;
let isBossMatch = false;

window.handlePortraitClick = function(charId) {
    let player = 1;
    if (gameMode === 'online' && typeof isHost !== 'undefined' && !isHost) {
        player = 2;
    } else if (gameMode === 'local' && p1Locked) {
        player = 2;
    }
    selectCharacter(player, charId);
};


function selectCharacter(player, charId) {
    // If clicking the currently selected character, lock them in (double click confirm)
    if (selections[player] === charId && !((player === 1 && p1Locked) || (player === 2 && p2Locked))) {
        lockInPlayer(player);
        return;
    }

    AudioSynth.playSelect();
    selections[player] = charId;

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

window.lockInPlayer = function (player) {
    AudioSynth.playSelect();
    if (player === 1) {
        p1Locked = true;
        document.getElementById('p1-locked-status').style.display = 'block';
        document.getElementById('p1-lock-btn').style.display = 'none';
        if (gameMode === 'online') sendNetworkInput('lockIn', 'p1');
    } else if (player === 2) {
        p2Locked = true;
        document.getElementById('p2-locked-status').style.display = 'block';
        document.getElementById('p2-lock-btn').style.display = 'none';
        if (gameMode === 'online') sendNetworkInput('lockIn', 'p2');
    }

    // Refresh previews to immediately focus on next player (if any)
    refreshCharacterSelectPreviews();

    if (p1Locked && (gameMode === 'single' || p2Locked)) {
        setTimeout(() => { startFight(); }, 500);
    }
};

function refreshCharacterSelectPreviews() {
    if (document.getElementById('selector-screen').classList.contains('hidden')) return;

    removeFighterList(previewFighters);

    if (gameMode === 'single') {
        selections[2] = tournamentOpponents[currentTournamentRound];
    }

    let activePlayer = 1;
    if (gameMode === 'online' && typeof isHost !== 'undefined' && !isHost) {
        activePlayer = 2;
    } else if (gameMode === 'local' && p1Locked) {
        activePlayer = 2;
    }

    // Sync the top portrait bar with the active player's selection
    const mainPortraitRow = document.getElementById('main-portrait-row');
    if (mainPortraitRow) {
        mainPortraitRow.querySelectorAll('.character-card').forEach(card => {
            card.classList.toggle('selected', card.dataset.char === selections[activePlayer]);
        });
    }

    // Spawn only the active player for "focus on player"
    const preview = spawnFighter(selections[activePlayer], 0.0, true);
    setPresentationRotation(preview, 'select');
    preview.mesh.position.y = 0.58;
    preview.mesh.position.z = 3.8; // Move a bit closer for better single-player view
    playPreferredAction(preview, 'idle', 'standingPose', 0.01);
    previewFighters.push(preview);
    startPreviewTauntCycle(preview);

    setCameraMode('select', { shotDurationMs: 2000 });
}

function showCharacterSelect() {
    clearScheduledEvents();
    clearInterval(timerInterval);
    gameActive = false;
    p1Locked = false;
    p2Locked = false;
    globalTimeScale = 1.0;
    slowMoTimer = 0;

    document.getElementById('gameover-screen').style.display = 'none';
    document.getElementById('selector-screen').classList.remove('hidden');
    document.getElementById('hud').style.display = 'none';
    document.getElementById('instructions').style.display = 'none';

    selectSpotlightP1.visible = true;
    selectSpotlightP2.visible = true;
    actionSpotlight.visible = false;
    
    if (typeof gridHelper !== 'undefined') gridHelper.visible = true;
    if (typeof floor !== 'undefined') floor.visible = true;

    document.getElementById('p1-locked-status').style.display = 'none';
    document.getElementById('p1-lock-btn').style.display = 'block';
    document.getElementById('p2-locked-status').style.display = 'none';
    document.getElementById('p2-lock-btn').style.display = 'block';

    if (gameMode === 'single') {
        document.getElementById('p2-select-panel').style.display = 'none';
        document.getElementById('p1-select-panel').style.marginLeft = '0';
    } else {
        document.getElementById('p2-select-panel').style.display = 'flex';
    }

    removeFighterList(players);
    removeFighterList(previewFighters);
    refreshCharacterSelectPreviews();
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

const wallGeo = new THREE.BoxGeometry(0.5, 1, 7);
const wallMat = new THREE.MeshBasicMaterial({ color: 0xbd00ff, transparent: true, opacity: 0.1 });
const leftWall = new THREE.Mesh(wallGeo, wallMat); leftWall.position.set(-10, 0.5, 0);
const rightWall = new THREE.Mesh(wallGeo, wallMat); rightWall.position.set(10, 0.5, 0);
scene.add(leftWall, rightWall);

// --- 6. COMIC PARTICLE EFFECTS FACTORY ---
const particles = [];

/**
 * Spawn comic-style hit particles.
 *
 * @param {THREE.Vector3} position   world-space origin
 * @param {'hit'|'guard'|'guardbreak'|'super'|'shield'|'confetti'|'landing'|'dash'} type
 * @param {number} count             number of pieces (default varies by type)
 */
function spawnParticles(position, type = 'hit', count = -1) {
    // --- Type definitions ---
    const TYPES = {
        // Direct hit — bright star-burst pieces in punch yellow/orange
        hit: {
            count: count < 0 ? 22 : count,
            colors: [0xFFE000, 0xFF8C00, 0xFF4500, 0xFFFFFF],
            size: () => Math.random() * 0.14 + 0.06,
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
            size: () => Math.random() * 0.22 + 0.10,
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
            size: () => Math.random() * 0.10 + 0.05,
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
            size: () => Math.random() * 0.18 + 0.07,
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
            size: () => Math.random() * 0.09 + 0.05,
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
            size: () => Math.random() * 0.12 + 0.05,
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
            size: () => Math.random() * 0.09 + 0.04,
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
            size: () => Math.random() * 0.08 + 0.04,
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

    for (let i = 0; i < def.count; i++) {
        const colorHex = def.colors[Math.floor(Math.random() * def.colors.length)];
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
}

// --- 7. FIGHTER MODEL GENERATOR FACTORY ---
function cloneSkinnedMesh(source) {
    function parallelTraverse(a, b, callback) {
        callback(a, b);
        for (let i = 0; i < a.children.length; i++) {
            parallelTraverse(a.children[i], b.children[i], callback);
        }
    }

    const sourceLookup = new Map();
    const cloneLookup = new Map();
    const clone = source.clone();

    parallelTraverse(source, clone, function (sourceNode, clonedNode) {
        sourceLookup.set(clonedNode, sourceNode);
        cloneLookup.set(sourceNode, clonedNode);
    });

    clone.traverse(function (node) {
        if (!node.isSkinnedMesh) return;
        const clonedMesh = node;
        const sourceMesh = sourceLookup.get(node);
        const sourceBones = sourceMesh.skeleton.bones;

        clonedMesh.skeleton = sourceMesh.skeleton.clone();
        clonedMesh.bindMatrix.copy(sourceMesh.bindMatrix);
        clonedMesh.skeleton.bones = sourceBones.map(function (bone) {
            return cloneLookup.get(bone);
        });

        clonedMesh.bind(clonedMesh.skeleton, clonedMesh.bindMatrix);
    });

    return clone;
}

let players = [];
let previewFighters = [];
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

    document.body.classList.toggle('touch-landscape', isTouchDevice);

    const isGameplayActive =
        document.getElementById('selector-screen').classList.contains('hidden') &&
        document.getElementById('hud').style.display !== 'none';

    const shouldShowTouchControls = isTouchDevice && isGameplayActive;

    const touchControls = document.getElementById('touch-controls');
    if (touchControls) {
        touchControls.classList.toggle('active', shouldShowTouchControls);

        const isSinglePlayerLayout = (gameMode === 'single' || gameMode === 'online');
        touchControls.classList.toggle('single-player-mode', isSinglePlayerLayout);
    }

    const sideP1 = document.getElementById('touch-side-p1');
    const sideP2 = document.getElementById('touch-side-p2');
    if (sideP1 && sideP2) {
        if (gameMode === 'single') {
            sideP1.style.display = '';
            sideP2.style.display = 'none';
        } else if (gameMode === 'online') {
            if (isHost) {
                sideP1.style.display = '';
                sideP2.style.display = 'none';
            } else {
                sideP1.style.display = 'none';
                sideP2.style.display = '';
            }
        } else {
            sideP1.style.display = '';
            sideP2.style.display = '';
        }
    }

    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) {
        pauseBtn.style.display = isGameplayActive ? 'flex' : 'none';
    }
}

function initTouchControls() {
    const touchButtons = document.querySelectorAll('#touch-controls .touch-btn');
    touchButtons.forEach((button) => {
        const keyCode = button.dataset.key;
        const bufferedAttack = button.dataset.buffer;
        const playerId = Number(button.dataset.player || 0);

        const press = (event) => {
            event.preventDefault();
            if (event.pointerId !== undefined) button.setPointerCapture?.(event.pointerId);
            if (keyCode) keys[keyCode] = true;
            if (bufferedAttack && playerId) bufferAttackInput(playerId, bufferedAttack);
            button.classList.add('pressed');
        };

        const release = (event) => {
            event.preventDefault();
            if (keyCode) keys[keyCode] = false;
            button.classList.remove('pressed');
        };

        button.addEventListener('pointerdown', press);
        button.addEventListener('pointerup', release);
        button.addEventListener('pointercancel', release);
        button.addEventListener('pointerleave', release);
        button.addEventListener('contextmenu', (event) => event.preventDefault());
    });

    window.addEventListener('resize', updateViewportState);
    window.addEventListener('orientationchange', updateViewportState);
    updateViewportState();
}

function removeFighterList(list) {
    list.forEach((fighter) => {
        if (fighter && fighter.mesh) {
            scene.remove(fighter.mesh);
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
        victory: 4.25
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
    return available[Math.floor(Math.random() * available.length)];
}

function createPlayerMesh(charId, isPlayer1) {
    const container = new THREE.Group();

    const useBoxFallback = isFallbackMode || !loadedModels[charId];

    if (useBoxFallback) {
        const baseColor = CHARACTERS[charId].color;
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
        const actionManifest = getCharacterActionManifest(charId);

        Object.entries(actionManifest).forEach(([actionName, clipKey]) => {
            const clip = loadedAnims[clipKey];
            if (!clip) return;

            const clonedClip = clip.clone();
            clonedClip.name = actionName;

            const action = mixer.clipAction(clonedClip);
            actions[actionName] = action;

            if (ATTACK_ACTION_KEYS.has(actionName) || HIT_REACTION_KEYS.has(actionName) || CINEMATIC_ACTION_KEYS.has(actionName) || DEATH_ACTION_KEYS.has(actionName)) {
                action.setLoop(THREE.LoopOnce);
                action.clampWhenFinished = true;
            }

            // Stunned naturally loops. Jumps play once.
            if (actionName === 'jumpUp' || actionName === 'jumpDown') {
                action.setLoop(THREE.LoopOnce);
                action.clampWhenFinished = true;
            }
        });

        // Strip vertical (Y) root-motion translation from locomotion clips so
        // characters never float up or sink into the floor while running/sliding.
        const ROOT_MOTION_STRIP_KEYS = new Set(['running', 'runningSlide']);
        Object.entries(actions).forEach(([actionName, action]) => {
            if (!ROOT_MOTION_STRIP_KEYS.has(actionName)) return;
            const clip = action.getClip();
            clip.tracks = clip.tracks.filter(track => {
                // Remove any position.y track on the root/hips bone
                const isPositionY = track.name.endsWith('.position') ||
                    (track instanceof THREE.VectorKeyframeTrack && track.name.includes('position'));
                const onRoot = /^(mixamorig:)?hips|root|pelvis/i.test(track.name.split('.')[0]);
                // Keep everything except Y-translation on the root bone
                if (isPositionY && onRoot) {
                    // Zero-out Y channel: keep X and Z, force Y=0 every frame
                    if (track.name.endsWith('.position') && track.values) {
                        for (let i = 1; i < track.values.length; i += 3) {
                            track.values[i] = 0; // Y = 0
                        }
                    }
                }
                return true; // keep the track, just flattened
            });
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

function spawnFighter(charId, startX, isPlayer1) {
    const setup = createPlayerMesh(charId, isPlayer1);

    const player = {
        id: isPlayer1 ? 1 : 2,
        charId: charId,
        name: CHARACTERS[charId].name,
        mesh: setup.model,
        mixer: setup.mixer,
        actions: setup.actions,
        color: CHARACTERS[charId].color,
        health: 100,
        guardHealth: 100, // NEW: Stamina
        velocity: 0,
        direction: isPlayer1 ? 1 : -1,

        currentState: 'idle',
        isAttacking: false,
        isBlocking: false,
        isHit: false,
        isDead: false,
        isStunned: false, // NEW: Guard Break State
        stunTimer: 0,
        isJumping: false, // NEW: Airborne State
        jumps: 0,
        wWasPressed: false,
        upWasPressed: false,
        velocityY: 0,
        isDashing: false, // NEW: Double-Tap Dash State
        dashTimer: 0,
        dashDir: 0,

        actionTimer: 0,
        hasDealtDamage: false,
        comboCount: 0,
        comboTimer: 0,
        queuedAttackType: null,
        currentAttack: null,
        attackTravel: 0,
        reactionTravel: 0,
        reactionDistance: 0,
        reactionDirection: 0,
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

    if (isBossMatch && !isPlayer1) {
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

    return player;
}

// --- 9. DYNAMIC CONTROL SYSTEM ---
const keys = {};
const attackInputBuffer = {
    1: null,
    2: null
};

function bufferAttackInput(playerId, attackType) {
    attackInputBuffer[playerId] = attackType;
}

let aiNextActionTime = 0;
let aiCurrentAction = 'idle';
let aiHitCount = 0;

function resetCombo(player) {
    player.comboCount = 0;
    player.comboTimer = 0;
    player.queuedAttackType = null;
    player.currentAttack = null;
}

function getAttackDefinition(type, comboIndex) {
    const strength = COMBO_SEQUENCE[Math.min(comboIndex, COMBO_SEQUENCE.length - 1)];
    const attack = ATTACKS[type][strength];
    return {
        ...attack,
        type,
        strength,
        comboIndex: Math.min(comboIndex, COMBO_SEQUENCE.length - 1)
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
    player.mesh.position.y = 0;
    player.mesh.position.x = startX;

    // Phase 1: Running approach
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
    player.isAttacking = true;
    player.hasDealtDamage = false;
    player.actionTimer = 0;
    player.attackLimbKeywords = attackDef.limbKeywords;
    player.currentAttack = attackDef;
    player.queuedAttackType = null;
    player.comboTimer = 0;
    player.comboCount = Math.min(attackDef.comboIndex + 1, COMBO_SEQUENCE.length - 1);
    player.attackTravel = 0;
    player.reactionTravel = 0;
    player.reactionDistance = 0;
    player.reactionDirection = 0;
    player.isDashing = false; // Attacking cancels dash

    player.fadeTo(attackDef.animation, attackDef.comboIndex === 0 ? 0.1 : 0.07);
    AudioSynth.playSwing();
}

function requestAttack(player, type) {
    if (player.isHit || player.isDead || player.isStunned) return true;
    if (player.isBlocking && !player.isAttacking) return true;

    if (player.isJumping || player.mesh.position.y > 0) {
        if (!player.isAttacking) {
            startAttack(player, getAttackDefinition('jumpAttack', 0));
        }
        return true;
    }

    if (!player.isAttacking && player.comboTimer <= 0 && player.comboCount !== 0) {
        resetCombo(player);
    }

    if (player.isAttacking) {
        if (!player.currentAttack || player.currentAttack.comboEnder || player.queuedAttackType) return true;

        const animPercent = player.actionTimer / getClipDuration(player, player.currentAttack.animation);
        if (animPercent < player.currentAttack.queueWindowStart) {
            return false;
        }

        player.queuedAttackType = type;
        return true;
    }

    startAttack(player, getAttackDefinition(type, player.comboCount));
    return true;
}

function processBufferedAttack(player) {
    const bufferedType = attackInputBuffer[player.id];
    if (!bufferedType) return;

    if (requestAttack(player, bufferedType)) {
        attackInputBuffer[player.id] = null;
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
let hitStopTime = 0;
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
    if (attacker.hasDealtDamage || !attacker.isAttacking || defender.isDead || !attacker.currentAttack) return;

    const clipDuration = getClipDuration(attacker, attacker.currentAttack.animation);
    const animPercent = attacker.actionTimer / clipDuration;
    const [hitStart, hitEnd] = attacker.currentAttack.hitWindow;

    if (animPercent >= hitStart && animPercent <= hitEnd) {
        const limbPos = getLimbWorldPos(attacker, attacker.attackLimbKeywords);
        const defenderPos = new THREE.Vector3();
        defender.mesh.getWorldPosition(defenderPos);

        const dx = Math.abs(limbPos.x - defenderPos.x);
        const dy = Math.abs(limbPos.y - (defenderPos.y + 1.1));

        const reachX = attacker.currentAttack.reachX || 0.8;
        const reachY = attacker.currentAttack.reachY || 1.0;

        if (dx < reachX && dy < reachY) {
            attacker.hasDealtDamage = true;

            if (defender.isBlocking) {
                // GUARD DAMAGE (STAMINA)
                const damageToGuard = attacker.currentAttack.damage * 4.5; // Scale heavy hits to drain fast
                defender.guardHealth -= damageToGuard;

                if (defender.guardHealth <= 0) {
                    // --- GUARD BREAK ACTIVATED ---
                    defender.isBlocking = false;
                    defender.isStunned = true;
                    defender.stunTimer = 2.0; // Stunned for 2 seconds
                    defender.guardHealth = 0; // Force empty

                    resetCombo(defender);
                    attackInputBuffer[defender.id] = null;
                    defender.fadeTo('dizzy', 0.1);

                    hitStopTime = 0.15;
                    spawnParticles(limbPos, 'guardbreak'); // Shatter explosion
                    AudioSynth.playHit();
                    triggerScreenShake(0.5, 0.3);

                    defender.mesh.position.x += attacker.direction * 0.6; // Heavy pushback
                } else {
                    // Standard block Mitigated
                    defender.health = Math.max(0, defender.health - attacker.currentAttack.blockDamage);
                    hitStopTime = 0.05;
                    spawnParticles(limbPos, 'guard');
                    AudioSynth.playBlock();
                    defender.mesh.position.x += attacker.direction * attacker.currentAttack.blockKnockback;
                }
                updateHealthBars();
            } else {
                // UNPROTECTED DIRECT HIT
                defender.health = Math.max(0, defender.health - attacker.currentAttack.damage);
                updateHealthBars();

                hitStopTime = attacker.currentAttack.strength === 'heavy' ? 0.12 : 0.08;
                flashFighter(defender);

                globalHitComboCount++;
                updateComboUI();

                // Comic hit effect — super burst for heavy KOs, regular stars for normal hits
                const isKO = defender.health <= 0;
                const isHeavy = attacker.currentAttack.strength === 'heavy';
                spawnParticles(limbPos, isKO ? 'super' : (isHeavy ? 'super' : 'hit'));
                AudioSynth.playHit();

                triggerScreenShake(attacker.currentAttack.strength === 'heavy' ? 0.35 : 0.22, 0.25);

                if (defender.health <= 0) {
                    triggerDeath(defender);
                    globalTimeScale = 0.25;
                    slowMoTimer = 0.5;
                    triggerScreenShake(0.6, 0.4);
                } else {
                    triggerHitReaction(defender, attacker.currentAttack, attacker.direction);
                }
            }
        }
    }
}

function triggerHitReaction(player, attackDef, incomingDirection = 0) {
    player.isHit = true;
    player.isAttacking = false;
    player.actionTimer = 0;
    player.attackTravel = 0;
    player.reactionTravel = 0;
    player.reactionDistance = attackDef ? (attackDef.reactionTravel || attackDef.knockback || 0) : 0;
    player.reactionDirection = incomingDirection;

    // Clear stun and airborne flags if interrupted
    player.isStunned = false;
    player.isJumping = false;

    resetCombo(player);
    attackInputBuffer[player.id] = null;
    
    let reactionAnim = attackDef ? attackDef.reaction : 'hitMidMedium';
    if ((attackDef && attackDef.strength === 'heavy') || player.mesh.position.y > 0) {
        reactionAnim = 'knockdown';
        // Give a bit more pushback for knockdown
        player.reactionDistance *= 1.5;
    }
    
    player.fadeTo(reactionAnim, 0.05);
}

function triggerDeath(player) {
    player.isDead = true;
    player.isHit = false;
    player.isAttacking = false;
    player.attackTravel = 0;
    player.reactionTravel = 0;
    player.reactionDistance = 0;
    player.reactionDirection = 0;
    resetCombo(player);
    attackInputBuffer[player.id] = null;
    player.fadeTo(getRandomDeathAction(player) || 'deathFall', 0.1);
    endRound(player.id === 1 ? 2 : 1);
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
    const p1Bar = document.getElementById('p1-bar');
    const p2Bar = document.getElementById('p2-bar');
    const p1Guard = document.getElementById('p1-guard-bar');
    const p2Guard = document.getElementById('p2-guard-bar');

    if (p1Bar && players[0]) {
        const h1 = Math.max(0, Math.min(100, players[0].health));
        p1Bar.style.width = h1 + '%';
        const color1 = getHealthColor(h1);
        p1Bar.style.background = `linear-gradient(90deg, ${color1.dark}, ${color1.bright})`;
        p1Bar.style.boxShadow = `0 0 10px ${color1.bright}`;

        if (p1Guard) {
            const g1 = Math.max(0, Math.min(100, players[0].guardHealth));
            p1Guard.style.width = g1 + '%';
            p1Guard.style.backgroundColor = players[0].isStunned ? '#ff0000' : (g1 < 30 ? '#ff8800' : '#ffffff');
        }
    }

    if (p2Bar && players[1]) {
        const h2 = Math.max(0, Math.min(100, players[1].health));
        p2Bar.style.width = h2 + '%';
        const color2 = getHealthColor(h2);
        p2Bar.style.background = `linear-gradient(270deg, ${color2.dark}, ${color2.bright})`;
        p2Bar.style.boxShadow = `0 0 10px ${color2.bright}`;

        if (p2Guard) {
            const g2 = Math.max(0, Math.min(100, players[1].guardHealth));
            p2Guard.style.width = g2 + '%';
            p2Guard.style.backgroundColor = players[1].isStunned ? '#ff0000' : (g2 < 30 ? '#ff8800' : '#ffffff');
        }
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
        const dx = (Math.random() - 0.5) * shakeIntensity;
        const dy = (Math.random() - 0.5) * shakeIntensity;
        camera.position.x += dx;
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
    } else if (players.length === 2) {
        const p1 = players[0];
        const p2 = players[1];
        const midX = (p1.mesh.position.x + p2.mesh.position.x) / 2;
        const distance = Math.abs(p1.mesh.position.x - p2.mesh.position.x);
        const shotProgress = cameraDirector.shotDurationMs > 0
            ? THREE.MathUtils.clamp((performance.now() - cameraDirector.modeStartedAt) / cameraDirector.shotDurationMs, 0, 1)
            : 1;

        if (cameraDirector.mode === 'intro') {
            const focus = players[Math.max(0, cameraDirector.focusPlayerId - 1)] || p1;
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
            const focus = players[Math.max(0, cameraDirector.focusPlayerId - 1)] || p1;
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
            const winner = players[cameraDirector.winnerId - 1] || p1;
            const elapsed = (performance.now() - cameraDirector.modeStartedAt) / 1000;
            const sideBias = winner.id === 1 ? -0.9 : 0.9;
            targetCamX = winner.mesh.position.x + sideBias;
            targetCamY = 3.0 + Math.min(elapsed, 1.6) * 0.14;
            targetCamZ = Math.max(5.9, 7.8 - Math.min(elapsed, 2.4) * 0.75);
            lookTarget = new THREE.Vector3(winner.mesh.position.x, 1.45, 0);
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
    players.forEach((player) => {
        if (!player) return;
        player.introMotion = null;
        player.mesh.position.y = 0;
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
                startTimer();
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
function screenWipe(type, durationMs = 180, label = null, onMidpoint = null, onDone = null) {
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
        screenWipe('cut', 160, p1.name, () => {
            // midpoint: scene hidden — swap camera to P1 taunt
            const p1DurationMs = playTauntShot(p1);

            scheduleEvent(() => {
                // P1 taunt done — cut to P2
                screenWipe('cut', 160, p2.name, () => {
                    playPreferredAction(p1, 'idle', 'idle', 0.12);
                    const p2DurationMs = playTauntShot(p2);

                    scheduleEvent(() => {
                        // Both taunts done — hard flash into countdown
                        screenWipe('cut', 140, null, () => {
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

    player.mesh.position.y = 0;
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
        player.mesh.position.y = 0;
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
    screenWipe('cut', 180, p1.name.toUpperCase(), () => {
        const p1EntranceDurationMs = getEntranceDurationMs(p1);
        setCameraMode('intro', { focusPlayerId: p1.id, shotDurationMs: p1EntranceDurationMs });

        startIntroMotion(p1, () => {
            // P1 done — wipe to P2 entrance
            screenWipe('cut', 180, p2.name.toUpperCase(), () => {
                const p2EntranceDurationMs = getEntranceDurationMs(p2);
                setCameraMode('intro', { focusPlayerId: p2.id, shotDurationMs: p2EntranceDurationMs });

                scheduleEvent(() => {
                    startIntroMotion(p2, () => {
                        // Both entrances done — flash into taunt phase
                        screenWipe('flash', 240, null, null, () => {
                            startTauntPhaseSequence();
                        });
                    });
                }, 200);
            });
        });
    });
}

window.startFight = function (isNetworkCommand = false) {
    if (gameMode === 'online' && !isNetworkCommand) {
        if (conn && conn.open) conn.send({ type: 'fight' });
    }

    if (gameMode === 'single') {
        if (currentTournamentRound >= tournamentOpponents.length) {
            selections[2] = selections[1];
            isBossMatch = true;
        } else {
            selections[2] = tournamentOpponents[currentTournamentRound];
            isBossMatch = false;
        }
    } else {
        isBossMatch = false;
    }

    AudioSynth.playSelect();
    clearScheduledEvents();
    if (timerInterval) clearInterval(timerInterval);
    bgMusic.play().catch(e => console.warn('Audio play failed', e));

    document.getElementById('announcement').classList.remove('active');
    document.getElementById('gameover-screen').style.display = 'none';
    document.getElementById('selector-screen').classList.add('hidden');
    document.getElementById('hud').style.display = 'flex';
    document.getElementById('instructions').style.display = 'flex';
    updateViewportState();

    removeFighterList(previewFighters);
    removeFighterList(players);

    const p1 = spawnFighter(selections[1], -3.4, true);
    const p2 = spawnFighter(selections[2], 3.4, false);
    players.push(p1, p2);
    attackInputBuffer[1] = null;
    attackInputBuffer[2] = null;

    document.getElementById('p1-name-display').textContent = p1.name;
    document.getElementById('p2-name-display').textContent = p2.name;

    injectGuardBars();
    updateHealthBars();

    globalHitComboCount = 0;
    updateComboUI();

    gameActive = false;
    selectSpotlightP1.visible = false;
    selectSpotlightP2.visible = false;
    actionSpotlight.visible = true;
    
    if (typeof gridHelper !== 'undefined') gridHelper.visible = false;
    if (typeof floor !== 'undefined') floor.visible = false;
    roundTime = 99;
    document.getElementById('timer').textContent = roundTime;
    setCameraMode('intro', { focusPlayerId: 1, winnerId: 0 });
    playPreFightSequence();
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (!gameActive) return;
        roundTime--;
        document.getElementById('timer').textContent = roundTime;

        if (roundTime <= 0) {
            clearInterval(timerInterval);
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
    }, 1000);
}

function endRound(winnerNum) {
    gameActive = false;
    clearInterval(timerInterval);
    clearScheduledEvents();

    const overlay = document.getElementById('gameover-screen');
    const winnerText = document.getElementById('winner-title');
    const winner = winnerNum > 0 ? players[winnerNum - 1] : null;
    const loser  = winnerNum > 0 ? players[winnerNum === 1 ? 1 : 0] : null;

    if (winner) {
        setCameraMode('victory', { winnerId: winnerNum });
        winner.isAttacking = false;
        winner.isHit = false;
        winner.attackTravel = 0;
        playPreferredAction(winner, 'victory', 'idle', 0.1);

        if (loser && !loser.isDead) {
            playPreferredAction(loser, 'idle', 'idle', 0.15);
        }

        // Burst confetti over the winner on win
        const confettiPos = winner.mesh.position.clone();
        confettiPos.y += 1.5;
        spawnParticles(confettiPos, 'confetti');
    } else {
        setCameraMode('fight', { winnerId: 0 });
    }

    // Let the full victory animation play out, then add a 1.5 s hold before
    // fading the gameover overlay in over the 3D scene.
    const victoryClipMs = winner
        ? Math.max(2800, getActionDurationMs(winner, 'victory', 3200))
        : 0;
    const holdMs   = 1500;   // extra appreciative pause after animation ends
    const fadeMs   = 600;    // CSS opacity transition
    const overlayDelayMs = victoryClipMs + holdMs;

    scheduleEvent(() => {
        if (winnerNum === 0) {
            winnerText.textContent = 'DRAW SEQUENCE';
            winnerText.className = '';
        } else {
            winnerText.textContent = `${players[winnerNum - 1].name} WINS`;
            winnerText.className = winnerNum === 1 ? 'win-p1' : 'win-p2';
            AudioSynth.playWin();
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
    startFight();
}

function backToSelect() {
    document.getElementById('gameover-screen').style.display = 'none';
    showCharacterSelect();
}

// --- 14. TICK RUNTIME ENGINE LOOP ---
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    if (gamePaused) return;

    const rawDt = clock.getDelta();
    const realDt = Math.min(rawDt, 0.1);

    if (hitStopTime > 0) {
        hitStopTime -= realDt;
        updateCameraShake(realDt);
        renderer.render(scene, camera);
        return;
    }

    if (slowMoTimer > 0) {
        slowMoTimer -= realDt;
        if (slowMoTimer <= 0) {
            globalTimeScale = 1.0;
        }
    }

    const frameDt = realDt * globalTimeScale;

    updateParticles(frameDt);

    players.forEach((player) => {
        updateIntroMotion(player, frameDt);
    });

    if (gameActive && players.length === 2) {
        const p1 = players[0];
        const p2 = players[1];

        // --- P1 LOCOMOTION & STATE ---
        p1.velocity = 0;
        p1.isBlocking = false;
        if (!p1.isAttacking && !p1.isHit && !p1.isDead && !p1.isStunned) {

            // Trigger Jump
            const currentWPressed = keys['KeyW'];
            if (currentWPressed && !p1.wWasPressed && p1.jumps < 2) {
                p1.isJumping = true;
                p1.velocityY = 5.0;
                p1.jumps++;
                if (p1.jumps > 1) {
                    p1.fadeTo('doubleJump', 0.1);
                    spawnParticles(p1.mesh.position, 'dash'); // Double jump burst
                    AudioSynth.playSwing();
                } else {
                    p1.fadeTo('jumpUp', 0.1);
                }
            }
            p1.wWasPressed = currentWPressed;

            if (keys['KeyS'] && !p1.isJumping && !p1.isDashing) {
                p1.isBlocking = true;
                resetCombo(p1);
                p1.fadeTo('block', 0.1);
            } else if (!p1.isDashing) {
                // Horizontal tracking (allowed slightly in air for classic feel)
                if (keys['KeyA']) p1.velocity = -2.5;
                if (keys['KeyD']) p1.velocity = 2.5;

                if (!p1.isJumping) {
                    if (p1.velocity !== 0) {
                        p1.fadeTo(getLocomotionAnimation(p1, p2), 0.12);
                    } else {
                        p1.fadeTo('idle', 0.15);
                    }
                }
            }
        }

        // --- DASH OVERRIDE P1 ---
        if (p1.isDashing) {
            p1.velocity = p1.dashDir * 8.0;
            p1.dashTimer -= frameDt;
            if (p1.dashTimer <= 0) p1.isDashing = false;
        }

        // --- P2 LOCOMOTION & STATE ---
        p2.velocity = 0;
        p2.isBlocking = false;
        if (!p2.isAttacking && !p2.isHit && !p2.isDead && !p2.isStunned) {
            if (gameMode === 'single') {
                // Primitive AI
                if (performance.now() > aiNextActionTime && !p2.isJumping && !p2.isDashing) {
                    const dist = Math.abs(p2.mesh.position.x - p1.mesh.position.x);

                    if (aiHitCount >= 3 && Math.random() < 0.5) {
                        aiHitCount = 0;
                        aiCurrentAction = 'backward';
                        aiNextActionTime = performance.now() + 800;
                    } else if (dist > 1.8) {
                        aiCurrentAction = 'forward';
                        aiNextActionTime = performance.now() + 300 + Math.random() * 400;
                    } else {
                        if (Math.random() < 0.7) {
                            const attackType = Math.random() < 0.5 ? 'punch' : 'kick';
                            bufferAttackInput(2, attackType);
                            aiCurrentAction = 'idle';
                            aiNextActionTime = performance.now() + 600 + Math.random() * 600;
                        } else {
                            aiCurrentAction = 'block';
                            aiNextActionTime = performance.now() + 500 + Math.random() * 500;
                        }
                    }
                }

                if (aiCurrentAction === 'block') {
                    p2.isBlocking = true;
                } else if (aiCurrentAction === 'forward') {
                    p2.velocity = p2.direction * 2.5;
                } else if (aiCurrentAction === 'backward') {
                    p2.velocity = p2.direction * -2.5;
                }

                if (p2.isBlocking) {
                    resetCombo(p2);
                    p2.fadeTo('block', 0.1);
                } else if (!p2.isJumping) {
                    if (p2.velocity !== 0) {
                        p2.fadeTo(getLocomotionAnimation(p2, p1), 0.12);
                    } else {
                        p2.fadeTo('idle', 0.15);
                    }
                }
            } else {
                // P2 Human
                const currentUpPressed = keys['ArrowUp'];
                if (currentUpPressed && !p2.upWasPressed && p2.jumps < 2) {
                    p2.isJumping = true;
                    p2.velocityY = 4.0;
                    p2.jumps++;
                    if (p2.jumps > 1) {
                        p2.fadeTo('doubleJump', 0.1);
                        spawnParticles(p2.mesh.position, 'dash'); // Double jump burst
                        AudioSynth.playSwing();
                    } else {
                        p2.fadeTo('jumpUp', 0.1);
                    }
                }
                p2.upWasPressed = currentUpPressed;

                if (keys['ArrowDown'] && !p2.isJumping && !p2.isDashing) {                    p2.isBlocking = true;
                    resetCombo(p2);
                    p2.fadeTo('block', 0.1);
                } else if (!p2.isDashing) {
                    if (keys['ArrowLeft']) p2.velocity = -2.5;
                    if (keys['ArrowRight']) p2.velocity = 2.5;

                    if (!p2.isJumping) {
                        if (p2.velocity !== 0) {
                            p2.fadeTo(getLocomotionAnimation(p2, p1), 0.12);
                        } else {
                            p2.fadeTo('idle', 0.15);
                        }
                    }
                }
            }
        }

        // --- DASH OVERRIDE P2 ---
        if (p2.isDashing) {
            p2.velocity = p2.dashDir * 8.0;
            p2.dashTimer -= frameDt;
            if (p2.dashTimer <= 0) p2.isDashing = false;
        }

        processBufferedAttack(p1);
        processBufferedAttack(p2);

        // Clamped Boundary Moving
        p1.mesh.position.x = Math.max(-9.5, Math.min(9.5, p1.mesh.position.x + p1.velocity * frameDt));
        p2.mesh.position.x = Math.max(-9.5, Math.min(9.5, p2.mesh.position.x + p2.velocity * frameDt));

        // Face tracking logic
        if (p1.mesh.position.x < p2.mesh.position.x) {
            p1.mesh.rotation.y = THREE.MathUtils.lerp(p1.mesh.rotation.y, Math.PI / 2, 0.15);
            p1.direction = 1;
            p2.mesh.rotation.y = THREE.MathUtils.lerp(p2.mesh.rotation.y, -Math.PI / 2, 0.15);
            p2.direction = -1;
        } else {
            p1.mesh.rotation.y = THREE.MathUtils.lerp(p1.mesh.rotation.y, -Math.PI / 2, 0.15);
            p1.direction = -1;
            p2.mesh.rotation.y = THREE.MathUtils.lerp(p2.mesh.rotation.y, Math.PI / 2, 0.15);
            p2.direction = 1;
        }

        // --- Combat Actions & Physics States ---
        players.forEach(p => {
            const opp = p.id === 1 ? p2 : p1;

            // Guard Regen
            if (!p.isBlocking && !p.isStunned && p.guardHealth < 100) {
                p.guardHealth = Math.min(100, p.guardHealth + 15 * frameDt); // Regen 15 per sec
                updateHealthBars();
            }

            // Stun Recovery
            if (p.isStunned) {
                p.stunTimer -= frameDt;
                if (p.stunTimer <= 0) {
                    p.isStunned = false;
                    p.guardHealth = 100;
                    p.fadeTo('idle', 0.2);
                }
            }

            // Jump Physics Loop
            if (p.isJumping || p.mesh.position.y > 0) {
                p.velocityY -= 20.0 * frameDt; // Gravity Constant
                p.mesh.position.y += p.velocityY * frameDt;

                if (p.velocityY < 0 && p.currentState !== 'jumpDown' && !p.isAttacking && !p.isHit && !p.isStunned) {
                    p.fadeTo('jumpDown', 0.2);
                }

                if (p.mesh.position.y <= 0) {
                    p.mesh.position.y = 0;
                    p.isJumping = false;
                    p.jumps = 0;
                    p.velocityY = 0;
                    if (!p.isAttacking && !p.isHit && !p.isDead && !p.isStunned) p.fadeTo('idle', 0.1);
                    spawnParticles(p.mesh.position, 'landing'); // Landing dust
                }
            }

            if (!p.isAttacking && !p.isHit && !p.isDead && p.comboTimer > 0) {
                p.comboTimer = Math.max(0, p.comboTimer - frameDt);
                if (p.comboTimer === 0) {
                    resetCombo(p);
                }
            }

            if (p.isAttacking) {
                p.actionTimer += frameDt;
                const clipDur = getClipDuration(p, p.currentAttack ? p.currentAttack.animation : p.currentState);
                const animPercent = p.actionTimer / clipDur;

                applyAttackTravel(p, opp, animPercent);
                checkHits(p, opp);

                if (p.queuedAttackType && p.currentAttack && !p.currentAttack.comboEnder && animPercent >= p.currentAttack.chainAt) {
                    startAttack(p, getAttackDefinition(p.queuedAttackType, p.comboCount));
                    return;
                }

                if (p.actionTimer >= clipDur) {
                    if (p.queuedAttackType && p.currentAttack && !p.currentAttack.comboEnder) {
                        startAttack(p, getAttackDefinition(p.queuedAttackType, p.comboCount));
                        return;
                    }

                    const finishedAttack = p.currentAttack;
                    p.isAttacking = false;
                    p.actionTimer = 0;
                    p.currentAttack = null;
                    p.queuedAttackType = null;
                    p.attackTravel = 0;

                    if (finishedAttack && finishedAttack.comboEnder) {
                        resetCombo(p);
                    } else {
                        p.comboTimer = COMBO_RESET_DELAY;
                    }

                    if (!p.isJumping) p.fadeTo('idle', 0.2);
                }
            }

            if (p.isHit) {
                p.actionTimer += frameDt;

                let clipDur = 0.5;
                const reactionKey = p.currentState;
                if (!isFallbackMode && p.actions[reactionKey]) {
                    clipDur = p.actions[reactionKey].getClip().duration;
                }
                const reactionProgress = p.actionTimer / clipDur;
                applyReactionTravel(p, reactionProgress);
                if (p.actionTimer >= clipDur) {
                    if (p.currentState === 'knockdown') {
                        p.fadeTo('getUp', 0.1);
                        p.actionTimer = 0; // Reset timer for getUp animation
                    } else {
                        p.isHit = false;
                        p.actionTimer = 0;
                        p.reactionTravel = 0;
                        p.reactionDistance = 0;
                        p.reactionDirection = 0;
                        if (!p.isJumping) p.fadeTo('idle', 0.2);
                    }
                }
            }
        });
    }

    players.forEach(p => {
        if (p.mixer) p.mixer.update(frameDt);
        // Prevent any animation root-motion from sinking the fighter below ground
        if (p.mesh && p.mesh.position.y < 0) p.mesh.position.y = 0;
    });
    previewFighters.forEach((fighter) => {
        if (fighter.mixer) fighter.mixer.update(frameDt);
        if (fighter.mesh && fighter.mesh.position.y < 0) fighter.mesh.position.y = 0;
    });

    // Slowly spin the carousel rig in the background
    if (carouselRig) {
        carouselRig.rotation.y += 0.15 * realDt; // ~8.6°/sec — one full revolution every ~42s
    }

    updateCameraDirector();
    updateCameraShake(realDt);

    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    const isPortrait = window.innerHeight > window.innerWidth;
    const w = isPortrait ? window.innerHeight : window.innerWidth;
    const h = isPortrait ? window.innerWidth : window.innerHeight;

    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
});

animate();

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