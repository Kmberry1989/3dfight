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
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(250, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.2);
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

        // Distorted sub-bass thump
        const subOsc = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        subOsc.type = 'sawtooth';
        subOsc.frequency.setValueAtTime(120, now);
        subOsc.frequency.linearRampToValueAtTime(40, now + 0.15);
        subGain.gain.setValueAtTime(0.4 * sfxVolume, now);
        subGain.gain.exponentialRampToValueAtTime(0.01 * sfxVolume, now + 0.2);
        subOsc.connect(subGain);
        subGain.connect(this.ctx.destination);
        subOsc.start(now);
        subOsc.stop(now + 0.2);

        // High frequencies impact noise
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
        filter.frequency.value = 600;
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
    deathKnockout: '/animations/Knocked Out.fbx'
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
    'hitLowHeavy'
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

// Loader statuses
const loaderScreen = document.getElementById('loader-screen');
const progressBar = document.getElementById('progress-bar');
const loadStatusTitle = document.getElementById('load-status-title');
const loadStatusDetail = document.getElementById('load-status-detail');

let gameMode = 'local'; // 'single', 'local', 'online'
let gamePaused = false;
let peer = null;
let conn = null;
let isHost = false;
let sfxVolume = 0.5;
let musicVolume = 0.5;
let bgMusic = new Audio('/stages/generic_template/generic-loop.ogg');
bgMusic.loop = true;

function showMainMenu() {
    document.getElementById('selector-screen').classList.add('hidden');
    document.getElementById('hud').style.display = 'none';
    document.getElementById('main-menu').style.display = 'flex';
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
    removeFighterList(players);
    removeFighterList(previewFighters);
    showMainMenu();
    bgMusic.pause();
}

window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && (gameActive || gamePaused)) {
        togglePause();
    }
});

let isFallbackMode = false;
const loadedModels = {};
const loadedAnims = {};

// --- 3. ASSET LOAD PIPELINE ---
async function loadAssets() {
    const fbxLoader = new FBXLoader();

    const charKeys = Object.keys(CHARACTERS);
    const animationManifest = buildAnimationManifest();
    const animKeys = Object.keys(animationManifest);
    const totalFiles = charKeys.length + animKeys.length;
    let loadedCount = 0;

    const updateProgress = (itemName, statusText) => {
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
                        // Give standard names
                        loadedAnims[key].name = key;
                    }
                    updateProgress(key, 'Animation loaded');
                    resolve(true);
                },
                undefined,
                (err) => {
                    console.warn(`Could not load animation FBX: ${key}. Path: ${animationManifest[key]}. Falling back...`, err);
                    updateProgress(key, 'Animation failed');
                    resolve(false); // Continue loading even if one fails
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
                    updateProgress(CHARACTERS[key].name, 'Character loaded');
                    resolve(true);
                },
                undefined,
                (err) => {
                    console.warn(`Could not load character FBX: ${key}. Path: ${CHARACTERS[key].path}. Falling back...`, err);
                    updateProgress(CHARACTERS[key].name, 'Character failed');
                    resolve(false); // Continue
                }
            );
        });
    });

    await Promise.all([...animPromises, ...charPromises]);

    // Check if essential animations or characters failed to load
    const hasAnimations = Object.keys(loadedAnims).length > 0;
    const hasCharacters = Object.keys(loadedModels).length > 0;

    if (!hasAnimations || !hasCharacters) {
        console.warn("Missing Mixamo assets. Entering Retro Box Fallback Mode.");
        isFallbackMode = true;
    }

    // Move to Character Select
    loaderScreen.style.opacity = '0';
    setTimeout(() => {
        loaderScreen.style.display = 'none';
        showMainMenu();
    }, 500);
}

// Run loading
window.addEventListener('DOMContentLoaded', () => {
    initTouchControls();
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

function selectCharacter(player, charId) {
    AudioSynth.playSelect();
    selections[player] = charId;

    // Highlight in grid
    const panel = document.getElementById(`p${player}-select-panel`);
    panel.querySelectorAll('.character-card').forEach(card => {
        if (card.dataset.char === charId) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    });

    // Update preview name
    document.getElementById(`p${player}-preview-name`).textContent = CHARACTERS[charId].name;
    refreshCharacterSelectPreviews();

    const previewActor = previewFighters[player - 1];
    if (previewActor && previewActor.actions && previewActor.actions['taunt']) {
        const tauntAction = previewActor.actions['taunt'];
        // Set taunt to ping-pong loop infinitely
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

    if (p1Locked && (gameMode === 'single' || p2Locked)) {
        setTimeout(() => { startFight(); }, 500);
    }
};

function refreshCharacterSelectPreviews() {
    if (document.getElementById('selector-screen').classList.contains('hidden')) return;

    removeFighterList(previewFighters);

    // In single player, auto-assign P2 to the current tournament opponent
    if (gameMode === 'single') {
        selections[2] = tournamentOpponents[currentTournamentRound];
    }

    const p1Preview = spawnFighter(selections[1], -1.0, true);
    const p2Preview = spawnFighter(selections[2], 1.0, false);

    setPresentationRotation(p1Preview, 'select');
    p1Preview.mesh.position.y = 0.58;
    p1Preview.mesh.position.z = 3.0; // Bring to foreground
    playPreferredAction(p1Preview, 'standingPose', 'idle', 0.01);
    previewFighters.push(p1Preview);

    setPresentationRotation(p2Preview, 'select');
    p2Preview.mesh.position.y = 0.58;
    p2Preview.mesh.position.z = 3.0;
    playPreferredAction(p2Preview, 'standingPose', 'idle', 0.01);
    previewFighters.push(p2Preview);
    
    setCameraMode('select', { shotDurationMs: 2000 });
}

function showCharacterSelect() {
    clearScheduledEvents();
    clearInterval(timerInterval);
    gameActive = false;
    p1Locked = false;
    p2Locked = false;

    document.getElementById('gameover-screen').style.display = 'none';
    document.getElementById('selector-screen').classList.remove('hidden');
    document.getElementById('hud').style.display = 'none';
    document.getElementById('instructions').style.display = 'none';

    selectSpotlightP1.visible = true;
    selectSpotlightP2.visible = true;
    actionSpotlight.visible = false;

    // Reset UI lock state
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

// --- LIGHTS & ARENA ENVIRONMENT ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
scene.add(ambientLight);

// Stage Spotlight following action
const actionSpotlight = new THREE.SpotLight(0xa855f7, 2.5, 25, Math.PI / 4.5, 0.5, 1);
actionSpotlight.position.set(0, 10, 0);
actionSpotlight.castShadow = true;
actionSpotlight.shadow.mapSize.width = 1024;
actionSpotlight.shadow.mapSize.height = 1024;
actionSpotlight.shadow.bias = -0.001;
scene.add(actionSpotlight);

// Character Select Spotlights
const selectSpotlightP1 = new THREE.SpotLight(0xffffff, 4.0, 30, Math.PI / 4, 0.5, 1);
selectSpotlightP1.position.set(-1.0, 6, 7);
selectSpotlightP1.target.position.set(-1.0, 1.5, 3);
selectSpotlightP1.castShadow = true;
scene.add(selectSpotlightP1);
scene.add(selectSpotlightP1.target);

const selectSpotlightP2 = new THREE.SpotLight(0xffffff, 4.0, 30, Math.PI / 4, 0.5, 1);
selectSpotlightP2.position.set(1.0, 6, 7);
selectSpotlightP2.target.position.set(1.0, 1.5, 3);
selectSpotlightP2.castShadow = true;
scene.add(selectSpotlightP2);
scene.add(selectSpotlightP2.target);

// Side Rim Highlights (Cyberpunk neon accentuation)
const blueRimLight = new THREE.DirectionalLight(0x00f0ff, 0.9);
blueRimLight.position.set(-8, 5, -2);
scene.add(blueRimLight);

const redRimLight = new THREE.DirectionalLight(0xff007f, 0.9);
redRimLight.position.set(8, 5, -2);
scene.add(redRimLight);

// Grid platform floor
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

// Left/Right Stage Boundaries (for grid layout references)
const wallGeo = new THREE.BoxGeometry(0.5, 1, 7);
const wallMat = new THREE.MeshBasicMaterial({ color: 0xbd00ff, transparent: true, opacity: 0.1 });
const leftWall = new THREE.Mesh(wallGeo, wallMat); leftWall.position.set(-10, 0.5, 0);
const rightWall = new THREE.Mesh(wallGeo, wallMat); rightWall.position.set(10, 0.5, 0);
scene.add(leftWall, rightWall);

// --- 6. PARTICLE PHYSICS SPARK FACTORY ---
const particles = [];

function spawnParticles(position, colorHex, count = 15, isShield = false) {
    const particleGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);

    for (let i = 0; i < count; i++) {
        const mat = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 1
        });
        const mesh = new THREE.Mesh(particleGeo, mat);
        mesh.position.copy(position);

        // Random spherical distribution
        let velocity;
        if (isShield) {
            // Shield rings spray out vertically
            const angle = Math.random() * Math.PI * 2;
            velocity = new THREE.Vector3(
                Math.cos(angle) * (Math.random() * 2 + 1),
                Math.sin(angle) * (Math.random() * 2 + 1),
                (Math.random() * 2 - 1) * 0.5
            );
        } else {
            // Hit sparks spray outwards
            velocity = new THREE.Vector3(
                (Math.random() * 2 - 1) * 3,
                (Math.random() * 2 - 0.2) * 2.5,
                (Math.random() * 2 - 1) * 1.5
            );
        }

        scene.add(mesh);
        particles.push({
            mesh: mesh,
            velocity: velocity,
            life: 1.0,
            decay: Math.random() * 1.8 + 1.8,
            isShield: isShield
        });
    }
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.mesh.position.addScaledVector(p.velocity, dt);

        // Gravity on sparks, float on shield
        if (!p.isShield) {
            p.velocity.y -= 9.8 * dt;
        }

        p.life -= p.decay * dt;
        p.mesh.material.opacity = p.life;
        p.mesh.scale.setScalar(p.life);

        if (p.life <= 0) {
            scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
            particles.splice(i, 1);
        }
    }
}

// --- 7. FIGHTER MODEL GENERATOR FACTORY ---
// Helper to perform a deep clone of a skinned mesh, rebinding bones correctly (Three.js SkeletonUtils.clone port)
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

function updateViewportState() {
    const touchLandscape =
        (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 || 'ontouchstart' in window) &&
        window.innerWidth > window.innerHeight;

    document.body.classList.toggle('touch-landscape', touchLandscape);

    const shouldShowTouchControls =
        touchLandscape &&
        document.getElementById('selector-screen').classList.contains('hidden') &&
        document.getElementById('hud').style.display !== 'none';

    const touchControls = document.getElementById('touch-controls');
    if (touchControls) {
        touchControls.classList.toggle('active', shouldShowTouchControls);
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

    // Check if we need to use box fallback for this specific character
    const useBoxFallback = isFallbackMode || !loadedModels[charId];

    if (useBoxFallback) {
        // Stylized Box Mesh Fallback
        const baseColor = CHARACTERS[charId].color;
        const torsoMat = new THREE.MeshStandardMaterial({
            color: baseColor,
            roughness: 0.1,
            metalness: 0.9,
            emissive: baseColor,
            emissiveIntensity: 0.25
        });

        // Torso
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.5), torsoMat);
        torso.position.y = 1.1;
        torso.castShadow = true;
        torso.receiveShadow = true;
        container.add(torso);

        // Head
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), torsoMat);
        head.position.y = 1.9;
        head.castShadow = true;
        container.add(head);

        // Hand/Foot attachments for simple hits tracking
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
        // Source character FBX shares the same Mixamo rig as the animation FBXs.
        const originalModel = loadedModels[charId];
        const model = cloneSkinnedMesh(originalModel);

        // Enable shadows and tweak materials safely
        model.traverse(child => {
            if (child.isMesh) {
                child.visible = true;
                child.castShadow = true;
                child.receiveShadow = true;
                child.frustumCulled = false; // Prevents disappearing when moving

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

        // Auto-scale model dynamically with safety bounds
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

        // Set up animation actions
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

            // Configure attack/action clips to play only once
            if (ATTACK_ACTION_KEYS.has(actionName) || HIT_REACTION_KEYS.has(actionName) || CINEMATIC_ACTION_KEYS.has(actionName) || DEATH_ACTION_KEYS.has(actionName)) {
                action.setLoop(THREE.LoopOnce);
                action.clampWhenFinished = true;
            }
        });

        if (actions.idle) {
            actions.idle.play();
            mixer.update(0);
        }

        // Ground fighters from the animated foot/toe bones instead of the overall mesh box.
        // The FBX coats and helper geometry extend below the visible feet, which made the
        // old Box3-based grounding leave the characters hovering above the stage.
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
        velocity: 0,
        direction: isPlayer1 ? 1 : -1,

        // Combat state machine
        currentState: 'idle',
        isAttacking: false,
        isBlocking: false,
        isHit: false,
        isDead: false,
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
        attackLimbKeywords: [], // Tracking bone keywords for active attack (hand/foot)

        // Dynamic collision calculations
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

    // Ground positioning
    player.mesh.position.set(startX, 0, 0);

    // Set Initial Facing Direction
    player.mesh.rotation.y = isPlayer1 ? Math.PI / 2 : -Math.PI / 2;

    if (isBossMatch && !isPlayer1) {
        // Apply Boss Materials
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

        // Attach red point light to the Boss
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

window.addEventListener('keydown', (e) => {
    if (e.code) keys[e.code] = true;

    let bufferHit = null;
    if (!e.repeat) {
        if (e.code === 'Space') { bufferAttackInput(1, 'punch'); bufferHit = 'punch'; }
        if (e.code === 'ShiftLeft') { bufferAttackInput(1, 'kick'); bufferHit = 'kick'; }
        if (e.code === 'KeyP') { bufferAttackInput(2, 'punch'); bufferHit = 'punch'; }
        if (e.code === 'KeyO') { bufferAttackInput(2, 'kick'); bufferHit = 'kick'; }
    }

    if (gameMode === 'online') {
        if (isHost && (e.code === 'KeyA' || e.code === 'KeyD' || e.code === 'KeyS' || e.code === 'Space' || e.code === 'ShiftLeft')) {
            sendNetworkInput('keydown', e.code, bufferHit);
        } else if (!isHost && (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'ArrowDown' || e.code === 'KeyP' || e.code === 'KeyO')) {
            sendNetworkInput('keydown', e.code, bufferHit);
        }
    }

    // Prevent scrolling on Space / Arrows
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
    }
});
window.addEventListener('keyup', (e) => {
    if (e.code) keys[e.code] = false;

    if (gameMode === 'online') {
        if (isHost && (e.code === 'KeyA' || e.code === 'KeyD' || e.code === 'KeyS' || e.code === 'Space' || e.code === 'ShiftLeft')) {
            sendNetworkInput('keyup', e.code);
        } else if (!isHost && (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'ArrowDown' || e.code === 'KeyP' || e.code === 'KeyO')) {
            sendNetworkInput('keyup', e.code);
        }
    }
});

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
    if (!player.currentAttack) return;

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

function startIntroMotion(player) {
    player.introMotion = {
        elapsed: 0,
        duration: Math.max(getClipDuration(player, 'intro') / getActionTimeScale(player, 'intro'), 0.85),
        startY: INTRO_DROP_HEIGHT
    };
    player.mesh.position.y = INTRO_DROP_HEIGHT;
    playPreferredAction(player, 'intro', 'idle', 0.05);
}

function updateIntroMotion(player, dt) {
    if (!player.introMotion) return;

    player.introMotion.elapsed += dt;
    const progress = THREE.MathUtils.clamp(player.introMotion.elapsed / player.introMotion.duration, 0, 1);
    const settleProgress = getPhaseProgress(progress, 0.05, 0.9);
    player.mesh.position.y = THREE.MathUtils.lerp(player.introMotion.startY, 0, settleProgress);

    if (progress >= 1) {
        player.mesh.position.y = 0;
        player.introMotion = null;
    }
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

    player.fadeTo(attackDef.animation, attackDef.comboIndex === 0 ? 0.1 : 0.07);
    AudioSynth.playSwing();
}

function requestAttack(player, type) {
    if (player.isHit || player.isDead) return true;
    if (player.isBlocking && !player.isAttacking) return true;

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

        // Match bone (skinned) or dummy attachments (fallback mode)
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
        // Hard fallback: Project relative coordinates based on facing direction
        player.mesh.getWorldPosition(worldPos);
        worldPos.x += player.direction * 0.9;
        worldPos.y += 1.2;
    }
    return worldPos;
}

// --- 11. COMBAT COLLISION CHECKS ---
function checkHits(attacker, defender) {
    if (attacker.hasDealtDamage || !attacker.isAttacking || defender.isDead || !attacker.currentAttack) return;

    const clipDuration = getClipDuration(attacker, attacker.currentAttack.animation);
    const animPercent = attacker.actionTimer / clipDuration;
    const [hitStart, hitEnd] = attacker.currentAttack.hitWindow;

    // Attack triggers hit registration around the middle phase of the animation (0.35 to 0.65)
    if (animPercent >= hitStart && animPercent <= hitEnd) {
        const limbPos = getLimbWorldPos(attacker, attacker.attackLimbKeywords);
        const defenderPos = new THREE.Vector3();
        defender.mesh.getWorldPosition(defenderPos);

        // Compute distance in 2D X-Y Plane
        const dx = Math.abs(limbPos.x - defenderPos.x);
        const dy = Math.abs(limbPos.y - (defenderPos.y + 1.1)); // Compared against Torso Height (Y=1.1)

        const reachX = attacker.currentAttack.reachX || 0.8;
        const reachY = attacker.currentAttack.reachY || 1.0;

        if (dx < reachX && dy < reachY) {
            attacker.hasDealtDamage = true;

            if (defender.isBlocking) {
                // MITIGATED BLOCK
                defender.health = Math.max(0, defender.health - attacker.currentAttack.blockDamage);
                updateHealthBars();

                spawnParticles(limbPos, 0x00f0ff, 12, true); // Blue shield arcs
                AudioSynth.playBlock();

                // Slight knockback pushes player back
                defender.mesh.position.x += attacker.direction * attacker.currentAttack.blockKnockback;
            } else {
                // UNPROTECTED DIRECT HIT
                defender.health = Math.max(0, defender.health - attacker.currentAttack.damage);
                updateHealthBars();

                spawnParticles(limbPos, 0xff0055, 20, false); // Orange/Red sparks burst
                AudioSynth.playHit();
                triggerScreenShake();

                // Trigger hit reaction
                if (defender.health <= 0) {
                    triggerDeath(defender);
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
    resetCombo(player);
    attackInputBuffer[player.id] = null;
    player.fadeTo(attackDef ? attackDef.reaction : 'hitMidMedium', 0.05);
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

function updateHealthBars() {
    document.getElementById('p1-bar').style.width = players[0].health + '%';
    document.getElementById('p2-bar').style.width = players[1].health + '%';
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
            targetCamX = focus.mesh.position.x + sideBias;
            targetCamY = focus.mesh.position.y + THREE.MathUtils.lerp(1.15, 2.25, shotProgress);
            targetCamZ = THREE.MathUtils.lerp(4.7, 7.35, shotProgress);
            lookTarget = new THREE.Vector3(
                focus.mesh.position.x,
                focus.mesh.position.y + THREE.MathUtils.lerp(1.7, 1.05, shotProgress),
                0.28
            );
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
            targetCamY = THREE.MathUtils.clamp(2.5 + distance * 0.12, 3.2, 5.0);
            targetCamZ = THREE.MathUtils.clamp(7.5 + distance * 0.45, 8.5, 14.0);
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
    players.forEach((player) => {
        if (!player) return;
        player.introMotion = null;
        player.mesh.position.y = 0;
        playPreferredAction(player, 'idle', 'idle', 0.1);
        setPresentationRotation(player, 'combat');
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

function startTauntPhaseSequence() {
    const p1 = players[0];
    const p2 = players[1];
    
    // Set camera to P1 and wait for travel
    setCameraMode('taunt', { focusPlayerId: p1.id, shotDurationMs: 1000 });
    
    scheduleEvent(() => {
        const p1DurationMs = playTauntShot(p1);
        
        scheduleEvent(() => {
            playPreferredAction(p1, 'idle', 'idle', 0.12);
            // Set camera to P2 and wait for travel
            setCameraMode('taunt', { focusPlayerId: p2.id, shotDurationMs: 1000 });
            
            scheduleEvent(() => {
                const p2DurationMs = playTauntShot(p2);
                
                scheduleEvent(() => {
                    playPreferredAction(p2, 'idle', 'idle', 0.12);
                    startCountdownSequence();
                }, p2DurationMs + TAUNT_BUFFER_MS);
            }, 800); // Wait 800ms for camera to reach P2
        }, p1DurationMs + 120);
    }, 800); // Wait 800ms for camera to reach P1
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

    const p1IntroDurationMs = getActionDurationMs(p1, 'intro', 2500);
    setCameraMode('intro', { focusPlayerId: p1.id, shotDurationMs: p1IntroDurationMs });
    
    scheduleEvent(() => {
        startIntroMotion(p1);

        scheduleEvent(() => {
            playPreferredAction(p1, 'standingPose', 'idle', 0.08);
            const p2IntroDurationMs = getActionDurationMs(p2, 'intro', 2500);
            setCameraMode('intro', { focusPlayerId: p2.id, shotDurationMs: p2IntroDurationMs });
            
            scheduleEvent(() => {
                startIntroMotion(p2);

                scheduleEvent(() => {
                    playPreferredAction(p2, 'standingPose', 'idle', 0.08);
                    startTauntPhaseSequence();
                }, p2IntroDurationMs + 120);
            }, 800); // Wait 800ms for camera to reach P2
        }, p1IntroDurationMs + INTRO_STAGGER_MS);
    }, 800); // Wait 800ms for camera to reach P1
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

    // Clean previous players if any
    removeFighterList(previewFighters);
    removeFighterList(players);

    // Spawn selected fighters
    const p1 = spawnFighter(selections[1], -3.4, true);
    const p2 = spawnFighter(selections[2], 3.4, false);
    players.push(p1, p2);
    attackInputBuffer[1] = null;
    attackInputBuffer[2] = null;

    // Display UI labels
    document.getElementById('p1-name-display').textContent = p1.name;
    document.getElementById('p2-name-display').textContent = p2.name;

    updateHealthBars();

    // Trigger 3,2,1 Countdown sequence
    gameActive = false;
    selectSpotlightP1.visible = false;
    selectSpotlightP2.visible = false;
    actionSpotlight.visible = true;
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
            // Evaluate Draw or Higher Health Winner
            const p1Health = players[0].health;
            const p2Health = players[1].health;
            if (p1Health > p2Health) {
                endRound(1);
            } else if (p2Health > p1Health) {
                endRound(2);
            } else {
                endRound(0); // Draw
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
    const loser = winnerNum > 0 ? players[winnerNum === 1 ? 1 : 0] : null;

    if (winner) {
        setCameraMode('victory', { winnerId: winnerNum });
        winner.isAttacking = false;
        winner.isHit = false;
        winner.attackTravel = 0;
        playPreferredAction(winner, 'victory', 'idle', 0.1);

        if (loser && !loser.isDead) {
            playPreferredAction(loser, 'idle', 'idle', 0.15);
        }
    } else {
        setCameraMode('fight', { winnerId: 0 });
    }

    const overlayDelayMs = winner ? Math.max(1800, Math.min(3000, getActionDurationMs(winner, 'victory', 2200))) : 1800;

    scheduleEvent(() => {
        if (winnerNum === 0) {
            winnerText.textContent = "DRAW SEQUENCE";
            winnerText.className = "";
        } else {
            winnerText.textContent = `${players[winnerNum - 1].name} WINS`;
            winnerText.className = winnerNum === 1 ? 'win-p1' : 'win-p2';
            AudioSynth.playWin();
        }

        overlay.style.display = 'flex';
        overlay.style.opacity = '1';
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

    const dt = clock.getDelta();

    // Limit delta time spike on browser tab blur
    const frameDt = Math.min(dt, 0.1);

    // Update particle systems
    updateParticles(frameDt);

    players.forEach((player) => {
        updateIntroMotion(player, frameDt);
    });

    if (gameActive && players.length === 2) {
        const p1 = players[0];
        const p2 = players[1];

        // --- locomotion Input Polls ---
        // P1 Locomotion
        p1.velocity = 0;
        p1.isBlocking = false;
        if (!p1.isAttacking && !p1.isHit && !p1.isDead) {
            if (keys['KeyS']) {
                p1.isBlocking = true;
                resetCombo(p1);
                p1.fadeTo('block', 0.1);
            } else {
                if (keys['KeyA']) p1.velocity = -2.0;
                if (keys['KeyD']) p1.velocity = 2.0;

                if (p1.velocity !== 0) {
                    p1.fadeTo(getLocomotionAnimation(p1, p2), 0.12);
                } else {
                    p1.fadeTo('idle', 0.15);
                }
            }
        }

        // P2 Locomotion
        p2.velocity = 0;
        p2.isBlocking = false;
        if (!p2.isAttacking && !p2.isHit && !p2.isDead) {
            if (gameMode === 'single') {
                // AI Logic
                if (performance.now() > aiNextActionTime) {
                    const dist = Math.abs(p2.mesh.position.x - p1.mesh.position.x);

                    // Retreat logic: if hit count is high, sometimes back away
                    if (aiHitCount >= 3 && Math.random() < 0.5) {
                        aiHitCount = 0; // reset
                        aiCurrentAction = 'backward';
                        aiNextActionTime = performance.now() + 800; // step backward for 0.8s
                    } else if (dist > 1.8) {
                        aiCurrentAction = 'forward';
                        aiNextActionTime = performance.now() + 300 + Math.random() * 400; // move for 0.3-0.7s
                    } else {
                        // in range, maybe attack or block
                        if (Math.random() < 0.7) {
                            const attackType = Math.random() < 0.5 ? 'punch' : 'kick';
                            bufferAttackInput(2, attackType);
                            aiCurrentAction = 'idle';
                            aiNextActionTime = performance.now() + 600 + Math.random() * 600; // delay next action
                        } else {
                            aiCurrentAction = 'block';
                            aiNextActionTime = performance.now() + 500 + Math.random() * 500;
                        }
                    }
                }

                if (aiCurrentAction === 'block') {
                    p2.isBlocking = true;
                } else if (aiCurrentAction === 'forward') {
                    p2.velocity = p2.direction * 2.0;
                } else if (aiCurrentAction === 'backward') {
                    p2.velocity = p2.direction * -2.0;
                }

                if (p2.isBlocking) {
                    resetCombo(p2);
                    p2.fadeTo('block', 0.1);
                } else {
                    if (p2.velocity !== 0) {
                        p2.fadeTo(getLocomotionAnimation(p2, p1), 0.12);
                    } else {
                        p2.fadeTo('idle', 0.15);
                    }
                }
            } else {
                // Local or Online Mode
                if (keys['ArrowDown']) {
                    p2.isBlocking = true;
                    resetCombo(p2);
                    p2.fadeTo('block', 0.1);
                } else {
                    if (keys['ArrowLeft']) p2.velocity = -2.0;
                    if (keys['ArrowRight']) p2.velocity = 2.0;

                    if (p2.velocity !== 0) {
                        p2.fadeTo(getLocomotionAnimation(p2, p1), 0.12);
                    } else {
                        p2.fadeTo('idle', 0.15);
                    }
                }
            }
        }

        processBufferedAttack(p1);
        processBufferedAttack(p2);

        // Move and clamp inside boundaries
        p1.mesh.position.x = Math.max(-9.5, Math.min(9.5, p1.mesh.position.x + p1.velocity * frameDt));
        p2.mesh.position.x = Math.max(-9.5, Math.min(9.5, p2.mesh.position.x + p2.velocity * frameDt));

        // Dynamic facing tracking (turn to confront opponent)
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

        // --- Combat Action Timers Update ---
        players.forEach(p => {
            const opp = p.id === 1 ? p2 : p1;

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

                    p.fadeTo('idle', 0.2);
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
                    p.isHit = false;
                    p.actionTimer = 0;
                    p.reactionTravel = 0;
                    p.reactionDistance = 0;
                    p.reactionDirection = 0;
                    p.fadeTo('idle', 0.2);
                }
            }
        });
    }

    // Update animations skeleton mixers
    players.forEach(p => {
        if (p.mixer) p.mixer.update(frameDt);
    });
    previewFighters.forEach((fighter) => {
        if (fighter.mixer) fighter.mixer.update(frameDt);
        if (cameraDirector.mode === 'select') {
            fighter.mesh.rotation.y += frameDt * 0.4; // Slowly revolve in showcase
        }
    });

    updateCameraDirector();

    // Add camera screenshake displacement
    updateCameraShake(frameDt);

    // Periodic diagnostic logging removed

    renderer.render(scene, camera);
}

// --- 15. RESIZE VIEWPORT ADAPTER ---
window.addEventListener('resize', () => {
    const isPortrait = window.innerHeight > window.innerWidth;
    const w = isPortrait ? window.innerHeight : window.innerWidth;
    const h = isPortrait ? window.innerWidth : window.innerHeight;

    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
});

// Initialize Render Frame tick
animate();
// Expose UI functions to global window for index.html onclick handlers
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
