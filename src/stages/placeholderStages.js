// src/stages/placeholderStages.js
//
// Procedural PLACEHOLDER stage environments for Family Fighter.
//
// Each entry is a self-contained builder: no external model files, no image
// textures — only Three.js primitives and materials. They are visual stand-ins
// so every screen of the game can be exercised while real stage art is pending.
//
// Contract per builder:
//   build(THREE) -> {
//     group,            // THREE.Group added to the scene
//     update(dt, t),    // optional per-frame ambient animation (no allocations)
//     background,       // THREE.Color for scene.background
//     fog,              // THREE.FogExp2 | null
//     spawnP1, spawnP2, // identical combat lane on every stage: flat y=0
//     cameraFocus,
//     bounds,
//     disposables,      // geometries/materials/helpers to dispose on unload
//     drawCalls,        // approximate mesh count (budget: < 150)
//   }
//
// The combat lane is identical on every stage (flat ground at y=0, spawns at
// x = -3.5 / +3.5), so these affect visuals only.

// Deterministic PRNG so stage dressing is stable between loads.
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Shared unit geometries: reused via mesh.scale, never disposed.
const sharedGeos = new WeakMap();
function getSharedGeos(THREE) {
    let s = sharedGeos.get(THREE);
    if (!s) {
        s = {
            box: new THREE.BoxGeometry(1, 1, 1),
            plane: new THREE.PlaneGeometry(1, 1),
            cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
            sphere: new THREE.SphereGeometry(0.5, 18, 14),
            cone: new THREE.ConeGeometry(0.5, 1, 12),
            torus: new THREE.TorusGeometry(0.5, 0.16, 12, 28),
            octa: new THREE.OctahedronGeometry(0.5),
            tetra: new THREE.TetrahedronGeometry(0.5),
            icosa: new THREE.IcosahedronGeometry(0.5),
            circle: new THREE.CircleGeometry(0.5, 40),
            ring: new THREE.RingGeometry(0.46, 0.5, 56),
        };
        sharedGeos.set(THREE, s);
    }
    return s;
}

const LANE = {
    spawnP1: [-3.5, 0, 0],
    spawnP2: [3.5, 0, 0],
    cameraFocus: [0, 1.2, 0],
    bounds: { minX: -9, maxX: 9, minZ: -5, maxZ: 5 },
};

// Per-build context: tracks everything the stage owns so the loader can
// dispose it cleanly. Shared geometries are never tracked.
function createCtx(THREE) {
    const group = new THREE.Group();
    const geos = getSharedGeos(THREE);
    const disposables = [];
    const track = (obj) => { if (obj && typeof obj.dispose === 'function') disposables.push(obj); return obj; };
    const mat = (opts) => track(new THREE.MeshStandardMaterial(opts));
    const basic = (opts) => track(new THREE.MeshBasicMaterial(opts));

    // kind: shared geometry key. o: { p:[x,y,z], s:[x,y,z], r:[x,y,z], cast, recv }
    const add = (kind, material, o = {}) => {
        const mesh = new THREE.Mesh(geos[kind], material);
        if (o.p) mesh.position.set(o.p[0], o.p[1], o.p[2]);
        if (o.s) mesh.scale.set(o.s[0], o.s[1], o.s[2]);
        if (o.r) mesh.rotation.set(o.r[0], o.r[1], o.r[2]);
        mesh.castShadow = !!o.cast;
        mesh.receiveShadow = o.recv !== false;
        group.add(mesh);
        return mesh;
    };
    const ground = (color, w, d, opts = {}) => {
        const m = add('plane', mat({ color, roughness: opts.rough ?? 0.9, metalness: opts.metal ?? 0.0,
            emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.ei ?? 0 }), { recv: true, cast: false });
        m.rotation.x = -Math.PI / 2;
        m.scale.set(w, d, 1);
        return m;
    };
    const light = (l, x, y, z) => { l.position.set(x, y, z); group.add(l); return l; };

    const finish = (extra) => ({
        group,
        disposables,
        update: null,
        ...LANE,
        drawCalls: 0,
        ...extra,
    });
    // Count meshes once at the end (cheap, build-time only).
    const withDrawCalls = (built) => {
        let n = 0;
        group.traverse((c) => { if (c.isMesh || c.isPoints) n++; });
        built.drawCalls = n;
        return built;
    };
    return { group, geos, disposables, track, mat, basic, add, ground, light, finish, withDrawCalls };
}

// ---------------------------------------------------------------------------
// 1. NEON ROOFTOP — night city rooftop, cyan/magenta rim glow
// ---------------------------------------------------------------------------
function buildNeonRooftop(THREE) {
    const ctx = createCtx(THREE);
    const rand = mulberry32(1337);

    ctx.ground(0x15151f, 46, 28, { rough: 0.95 });

    // Glowing rooftop edge strips
    const stripMat = ctx.mat({ color: 0x000000, emissive: 0x00f0ff, emissiveIntensity: 2.4 });
    ctx.add('box', stripMat, { p: [0, 0.03, 6.2], s: [22, 0.05, 0.14] });
    ctx.add('box', stripMat, { p: [0, 0.03, -6.2], s: [22, 0.05, 0.14] });
    ctx.add('box', stripMat, { p: [11, 0.03, 0], s: [0.14, 0.05, 12.5] });
    ctx.add('box', stripMat, { p: [-11, 0.03, 0], s: [0.14, 0.05, 12.5] });

    // Background building silhouettes with lit window bands
    const bldMat = ctx.mat({ color: 0x0c0c18, roughness: 1 });
    const winMat = ctx.mat({ color: 0x111111, emissive: 0xffd27a, emissiveIntensity: 1.4 });
    for (let i = 0; i < 12; i++) {
        const w = 3 + rand() * 3.5, h = 4 + rand() * 11, d = 3 + rand() * 3;
        const x = -26 + rand() * 52, z = -32 + rand() * 16;
        ctx.add('box', bldMat, { p: [x, h / 2 - 0.5, z], s: [w, h, d] });
        if (i % 3 === 0) {
            const bandY = 1.5 + rand() * (h - 3);
            ctx.add('box', winMat, { p: [x, bandY, z + d / 2 + 0.06], s: [w * 0.7, 0.5, 0.1] });
            ctx.add('box', winMat, { p: [x, bandY + 1.4, z + d / 2 + 0.06], s: [w * 0.7, 0.5, 0.1] });
        }
    }

    // Water tower silhouette
    const woodMat = ctx.mat({ color: 0x2a1f18, roughness: 1 });
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.add('box', woodMat, { p: [-10.5 + lx * 0.9, 1.5, -11 + lz * 0.9], s: [0.18, 3, 0.18] });
    }
    ctx.add('cylinder', woodMat, { p: [-10.5, 4.1, -11], s: [2.8, 2.2, 2.8] });
    ctx.add('cone', ctx.mat({ color: 0x1d150f, roughness: 1 }), { p: [-10.5, 5.6, -11], s: [3.2, 1.2, 3.2] });

    // Antenna with blinking beacon
    ctx.add('cylinder', ctx.mat({ color: 0x222228, roughness: 0.6, metalness: 0.6 }),
        { p: [11, 3.5, -13], s: [0.16, 7, 0.16] });
    const beaconMat = ctx.mat({ color: 0x220000, emissive: 0xff2222, emissiveIntensity: 2.5 });
    ctx.add('sphere', beaconMat, { p: [11, 7.15, -13], s: [0.44, 0.44, 0.44] });

    // AC units
    const acMat = ctx.mat({ color: 0x3a3f4a, roughness: 0.7, metalness: 0.4 });
    ctx.add('box', acMat, { p: [-6, 0.35, 5], s: [1.3, 0.7, 1.3] });
    ctx.add('box', acMat, { p: [5.5, 0.35, 5.4], s: [1.1, 0.7, 1.1] });
    ctx.add('box', acMat, { p: [-2, 0.35, -5.6], s: [1.4, 0.7, 1.2] });

    // Cyan / magenta rim glow
    ctx.light(new THREE.PointLight(0x00f0ff, 2.6, 26, 2), -6, 4.5, 3);
    ctx.light(new THREE.PointLight(0xff007f, 2.2, 26, 2), 6, 4.5, -3);

    return ctx.withDrawCalls(ctx.finish({
        background: new THREE.Color(0x070716),
        fog: new THREE.FogExp2(0x070716, 0.022),
        update: (dt, t) => { beaconMat.emissiveIntensity = 1.6 + Math.sin(t * 4.2) * 1.2; },
    }));
}

// ---------------------------------------------------------------------------
// 2. DOJO DAWN — warm sunrise dojo, wooden floor, paper walls
// ---------------------------------------------------------------------------
function buildDojoDawn(THREE) {
    const ctx = createCtx(THREE);

    ctx.ground(0x7c5230, 46, 28, { rough: 0.85 });

    // Plank seams
    const seamMat = ctx.mat({ color: 0x5f3d22, roughness: 1 });
    for (let i = 0; i < 14; i++) {
        ctx.add('box', seamMat, { p: [0, 0.008, -13 + i * 2], s: [46, 0.015, 0.07] });
    }

    // Rising sun + halo
    const sunMat = ctx.basic({ color: 0xffb154 });
    const sun = ctx.add('circle', sunMat, { p: [0, 7, -34], s: [6, 6, 6] });
    const haloMat = ctx.basic({ color: 0xff8a3d, transparent: true, opacity: 0.28,
        blending: THREE.AdditiveBlending, depthWrite: false });
    ctx.add('circle', haloMat, { p: [0, 7, -34.4], s: [11, 11, 11] });
    void sun;

    // Shoji back wall: wooden frames + glowing paper
    const frameMat = ctx.mat({ color: 0x4a2e18, roughness: 0.9 });
    const paperMat = ctx.mat({ color: 0xfff1d6, emissive: 0xffcf8e, emissiveIntensity: 0.5, roughness: 1 });
    for (let i = 0; i < 6; i++) {
        const x = -7 + i * 2.8;
        ctx.add('box', frameMat, { p: [x, 1.8, -9.5], s: [2.8, 3.6, 0.14] });
        ctx.add('plane', paperMat, { p: [x, 1.8, -9.42], s: [2.4, 3.2, 1] });
    }
    // Side shoji panels
    for (const sx of [-1, 1]) {
        for (let i = 0; i < 2; i++) {
            const z = -6 + i * 4;
            ctx.add('box', frameMat, { p: [sx * 11.5, 1.8, z], s: [0.14, 3.6, 2.8] });
            ctx.add('plane', paperMat, { p: [sx * 11.42, 1.8, z], s: [2.4, 3.2, 1], r: [0, -sx * Math.PI / 2, 0] });
        }
    }

    // Hanging paper lanterns (pivot groups so they sway from the cord)
    const lanterns = [];
    const cordMat = ctx.mat({ color: 0x2a1c10, roughness: 1 });
    const lampMat = ctx.mat({ color: 0xffe0b0, emissive: 0xffb95e, emissiveIntensity: 1.5 });
    [-4.5, 0, 4.5].forEach((x, i) => {
        const pivot = new THREE.Group();
        pivot.position.set(x, 6, -6.5);
        const cord = new THREE.Mesh(ctx.geos.cylinder, cordMat);
        cord.position.y = -0.8; cord.scale.set(0.06, 1.6, 0.06);
        const lamp = new THREE.Mesh(ctx.geos.sphere, lampMat);
        lamp.position.y = -1.9; lamp.scale.set(1, 1.15, 1);
        pivot.add(cord, lamp);
        ctx.group.add(pivot);
        lanterns.push({ pivot, phase: i * 2.1 });
    });

    ctx.light(new THREE.PointLight(0xff9a4d, 2.6, 26, 2), 0, 5, -3);

    return ctx.withDrawCalls(ctx.finish({
        background: new THREE.Color(0x2e1c26),
        fog: new THREE.FogExp2(0x40262c, 0.028),
        update: (dt, t) => {
            for (const l of lanterns) {
                l.pivot.rotation.z = Math.sin(t * 0.9 + l.phase) * 0.07;
                l.pivot.rotation.x = Math.cos(t * 0.7 + l.phase) * 0.05;
            }
            haloMat.opacity = 0.24 + Math.sin(t * 0.8) * 0.05;
        },
    }));
}

// ---------------------------------------------------------------------------
// 3. SCRAPYARD DUSK — industrial yard, orange haze, crates and barrels
// ---------------------------------------------------------------------------
function buildScrapyardDusk(THREE) {
    const ctx = createCtx(THREE);
    const rand = mulberry32(4242);

    ctx.ground(0x38302a, 46, 28, { rough: 1 });

    // Crate piles
    const crateMats = [0x6b4a2f, 0x7a5230, 0x5c3f28].map((c) => ctx.mat({ color: c, roughness: 1 }));
    const piles = [[-8, -4], [8.5, -5], [-9, 3.5]];
    piles.forEach(([px, pz], pi) => {
        const n = 2 + Math.floor(rand() * 2);
        for (let i = 0; i < n; i++) {
            const s = 1.2 + rand() * 1.0;
            ctx.add('box', crateMats[(pi + i) % 3], {
                p: [px + (rand() - 0.5) * 0.8, s / 2 + (i > 1 ? 1.4 : 0), pz + (rand() - 0.5) * 0.8],
                s: [s, s, s], r: [0, rand() * Math.PI, 0],
            });
        }
    });

    // Barrel clusters
    const barrelMats = [0x8a2f1f, 0x2f6b6b, 0x707070].map((c) =>
        ctx.mat({ color: c, roughness: 0.6, metalness: 0.5 }));
    const barrelSpots = [[6.5, 4.5], [7.6, 4.2], [7, 5.4], [-6, -6.5], [-7.1, -6.2], [-6.5, -5.4], [6.2, -6.8]];
    barrelSpots.forEach(([x, z], i) => {
        const tipped = i === 6;
        ctx.add('cylinder', barrelMats[i % 3], {
            p: [x, tipped ? 0.45 : 0.58, z],
            s: [0.9, 1.15, 0.9],
            r: tipped ? [0, 0, Math.PI / 2] : [0, rand() * Math.PI, 0],
        });
    });

    // Tire stacks
    const tireMat = ctx.mat({ color: 0x161616, roughness: 1 });
    [[9, 2.5], [-8.5, -1], [7.5, -3.5]].forEach(([x, z]) => {
        for (let i = 0; i < 3; i++) {
            ctx.add('torus', tireMat, { p: [x, 0.2 + i * 0.38, z], r: [Math.PI / 2, 0, 0] });
        }
    });

    // Corrugated fence backdrop
    const fenceMat = ctx.mat({ color: 0x4a382e, roughness: 1 });
    const railMat = ctx.mat({ color: 0x33271f, roughness: 1 });
    for (let i = 0; i < 10; i++) {
        const h = 2.6 + rand() * 0.8;
        ctx.add('box', fenceMat, { p: [-9 + i * 2, h / 2, -10.5], s: [0.9, h, 0.08] });
    }
    ctx.add('box', railMat, { p: [0, 1.0, -10.55], s: [19, 0.12, 0.1] });
    ctx.add('box', railMat, { p: [0, 2.4, -10.55], s: [19, 0.12, 0.1] });

    // Smokestack with warning light
    ctx.add('cylinder', ctx.mat({ color: 0x3a3a3f, roughness: 0.8, metalness: 0.4 }),
        { p: [-11.5, 5, -8], s: [1.8, 10, 1.8] });
    const warnMat = ctx.mat({ color: 0x220a00, emissive: 0xff6a1a, emissiveIntensity: 2.2 });
    ctx.add('sphere', warnMat, { p: [-11.5, 10.3, -8], s: [0.5, 0.5, 0.5] });

    // Crane silhouette
    const craneMat = ctx.mat({ color: 0x2c2620, roughness: 1 });
    ctx.add('box', craneMat, { p: [13, 4.5, -15], s: [0.7, 9, 0.7] });
    ctx.add('box', craneMat, { p: [11, 8.6, -15], s: [7, 0.6, 0.6] });
    ctx.add('cylinder', craneMat, { p: [8.2, 7, -15], s: [0.06, 3, 0.06] });
    ctx.add('box', craneMat, { p: [8.2, 5.4, -15], s: [0.4, 0.4, 0.4] });

    ctx.light(new THREE.PointLight(0xff7a2a, 3.0, 30, 2), 0, 6, 1);

    return ctx.withDrawCalls(ctx.finish({
        background: new THREE.Color(0x221006),
        fog: new THREE.FogExp2(0x3a1c0c, 0.032),
        update: (dt, t) => { warnMat.emissiveIntensity = 1.4 + Math.sin(t * 3.4) * 1.0; },
    }));
}

// ---------------------------------------------------------------------------
// 4. GLACIER NIGHT — icy blue night, aurora gradient, ice shards
// ---------------------------------------------------------------------------
function buildGlacierNight(THREE) {
    const ctx = createCtx(THREE);
    const rand = mulberry32(9001);

    ctx.ground(0xaed6f5, 46, 28, { rough: 0.15, metal: 0.08, emissive: 0x14324a, ei: 0.3 });

    // Aurora: gradient plane with per-vertex colors, additive
    const auroraGeo = new THREE.PlaneGeometry(64, 15, 40, 8);
    {
        const pos = auroraGeo.attributes.position;
        const colors = new Float32Array(pos.count * 3);
        const cTop = new THREE.Color(0x2bff9e), cMid = new THREE.Color(0x1a9a8a), cBot = new THREE.Color(0x3a1a6a);
        const tmp = new THREE.Color();
        for (let i = 0; i < pos.count; i++) {
            const ny = (pos.getY(i) + 7.5) / 15; // 0 bottom .. 1 top
            if (ny < 0.45) tmp.lerpColors(cBot, cMid, ny / 0.45);
            else tmp.lerpColors(cMid, cTop, (ny - 0.45) / 0.55);
            colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
        }
        auroraGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    ctx.track(auroraGeo);
    const auroraMat = ctx.basic({ vertexColors: true, transparent: true, opacity: 0.45,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const aurora = new THREE.Mesh(auroraGeo, auroraMat);
    aurora.position.set(0, 10, -32);
    ctx.group.add(aurora);

    // Ice shards flanking the lane
    const shardMat = ctx.mat({ color: 0x9fd0ff, roughness: 0.12, metalness: 0.25,
        emissive: 0x2a6a9a, emissiveIntensity: 0.4 });
    for (let i = 0; i < 12; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const h = 2 + rand() * 3.2, r = 0.5 + rand() * 0.6;
        ctx.add(i % 3 === 0 ? 'octa' : 'cone', shardMat, {
            p: [side * (6 + rand() * 6), h / 2 - 0.2, -8 + rand() * 14],
            s: [r * 2, h, r * 2],
            r: [(rand() - 0.5) * 0.5, rand() * Math.PI, (rand() - 0.5) * 0.5],
        });
    }

    // Background ice walls
    const wallMat = ctx.mat({ color: 0x5a86b8, roughness: 0.3 });
    ctx.add('box', wallMat, { p: [-13, 2.5, -15], s: [9, 7, 2.5], r: [0, 0.3, 0] });
    ctx.add('box', wallMat, { p: [0, 3, -17], s: [11, 8, 2.5] });
    ctx.add('box', wallMat, { p: [13, 2.5, -15], s: [9, 7, 2.5], r: [0, -0.3, 0] });

    // Drifting snow sparkles (one Points draw call; positions mutated in place)
    const SNOW_N = 90;
    const snowGeo = new THREE.BufferGeometry();
    const snowPos = new Float32Array(SNOW_N * 3);
    for (let i = 0; i < SNOW_N; i++) {
        snowPos[i * 3] = -20 + rand() * 40;
        snowPos[i * 3 + 1] = 0.5 + rand() * 8.5;
        snowPos[i * 3 + 2] = -18 + rand() * 22;
    }
    snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
    ctx.track(snowGeo);
    const snowMat = ctx.track(new THREE.PointsMaterial({ color: 0xcfeaff, size: 0.14,
        sizeAttenuation: true, transparent: true, opacity: 0.8, depthWrite: false }));
    const snow = new THREE.Points(snowGeo, snowMat);
    ctx.group.add(snow);

    ctx.light(new THREE.PointLight(0x6ab8ff, 2.6, 30, 2), 0, 5, 3);

    return ctx.withDrawCalls(ctx.finish({
        background: new THREE.Color(0x040912),
        fog: new THREE.FogExp2(0x0a1830, 0.02),
        update: (dt, t) => {
            auroraMat.opacity = 0.38 + Math.sin(t * 0.7) * 0.12;
            const arr = snowGeo.attributes.position.array;
            for (let i = 0; i < SNOW_N; i++) {
                arr[i * 3 + 1] += dt * 0.35;
                if (arr[i * 3 + 1] > 9) arr[i * 3 + 1] = 0.5;
            }
            snowGeo.attributes.position.needsUpdate = true;
        },
    }));
}

// ---------------------------------------------------------------------------
// 5. VOID ARENA — minimal dark arena, floating geometry, single spotlight
// ---------------------------------------------------------------------------
function buildVoidArena(THREE) {
    const ctx = createCtx(THREE);
    const rand = mulberry32(777);

    // Dark disc floor
    const floorMesh = ctx.add('circle', ctx.mat({ color: 0x0c0c15, roughness: 0.35, metalness: 0.6 }),
        { p: [0, 0, 0], s: [22, 22, 22], recv: true });
    floorMesh.rotation.x = -Math.PI / 2;

    // Glowing combat-lane rings
    const laneMat = ctx.mat({ color: 0x000000, emissive: 0x00f0ff, emissiveIntensity: 2.0 });
    const lane = ctx.add('ring', laneMat, { p: [0, 0.02, 0], s: [9.2, 9.2, 9.2] });
    lane.rotation.x = -Math.PI / 2;
    const coreMat = ctx.mat({ color: 0x000000, emissive: 0xff007f, emissiveIntensity: 1.6 });
    const core = ctx.add('ring', coreMat, { p: [0, 0.02, 0], s: [2, 2, 2] });
    core.rotation.x = -Math.PI / 2;

    // Techy polar grid (one draw call)
    const polar = new THREE.PolarGridHelper(11, 12, 5, 48, 0x223344, 0x111722);
    polar.position.y = 0.01;
    polar.material.transparent = true;
    polar.material.opacity = 0.5;
    ctx.track(polar.geometry);
    ctx.track(polar.material);
    ctx.group.add(polar);

    // Floating geometric platforms
    const floaters = [];
    const kinds = ['box', 'tetra', 'octa', 'icosa'];
    const glowA = ctx.mat({ color: 0x14141f, emissive: 0x00f0ff, emissiveIntensity: 0.55, roughness: 0.5 });
    const glowB = ctx.mat({ color: 0x14141f, emissive: 0xff007f, emissiveIntensity: 0.55, roughness: 0.5 });
    for (let i = 0; i < 9; i++) {
        const ang = (i / 9) * Math.PI * 2 + rand() * 0.4;
        const rad = 8.5 + rand() * 4.5;
        const baseY = 2 + rand() * 4.5;
        const sc = 0.7 + rand() * 0.9;
        const m = ctx.add(kinds[i % 4], i % 2 === 0 ? glowA : glowB, {
            p: [Math.cos(ang) * rad, baseY, Math.sin(ang) * rad - 2],
            s: [sc * 2, sc * 2, sc * 2],
            r: [rand() * Math.PI, rand() * Math.PI, 0],
        });
        floaters.push({ mesh: m, baseY, phase: rand() * Math.PI * 2, speed: 0.5 + rand() * 0.7, rot: 0.15 + rand() * 0.3 });
    }

    // Single strong spotlight + visible cone
    const spot = new THREE.SpotLight(0xffffff, 30, 40, 0.5, 0.6, 1);
    spot.position.set(0, 13, 5);
    ctx.light(spot, 0, 13, 5);
    spot.target.position.set(0, 0, 0);
    ctx.group.add(spot.target);
    const coneMat = ctx.basic({ color: 0xffffff, transparent: true, opacity: 0.05,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const coneGeo = new THREE.ConeGeometry(4.2, 13, 24, 1, true);
    ctx.track(coneGeo);
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(0, 6.5, 2.4);
    ctx.group.add(cone);

    return ctx.withDrawCalls(ctx.finish({
        background: new THREE.Color(0x000000),
        fog: null,
        update: (dt, t) => {
            for (const f of floaters) {
                f.mesh.position.y = f.baseY + Math.sin(t * f.speed + f.phase) * 0.5;
                f.mesh.rotation.y += dt * f.rot;
            }
        },
    }));
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
export const PLACEHOLDER_STAGES = [
    {
        id: 'neon_rooftop',
        name: 'Neon Rooftop',
        notes: 'PLACEHOLDER — procedurally built night-city rooftop. Cyan/magenta rim glow, building silhouettes, blinking antenna beacon.',
        build: buildNeonRooftop,
    },
    {
        id: 'dojo_dawn',
        name: 'Dojo Dawn',
        notes: 'PLACEHOLDER — procedurally built sunrise dojo. Wooden plank floor, glowing shoji walls, swaying paper lanterns.',
        build: buildDojoDawn,
    },
    {
        id: 'scrapyard_dusk',
        name: 'Scrapyard Dusk',
        notes: 'PLACEHOLDER — procedurally built industrial scrapyard. Orange haze, crate piles, barrels, tire stacks, pulsing stack light.',
        build: buildScrapyardDusk,
    },
    {
        id: 'glacier_night',
        name: 'Glacier Night',
        notes: 'PLACEHOLDER — procedurally built arctic night. Vertex-colored aurora, ice shards, drifting snow sparkles.',
        build: buildGlacierNight,
    },
    {
        id: 'void_arena',
        name: 'Void Arena',
        notes: 'PLACEHOLDER — procedurally built minimal void. Floating geometric platforms, glowing lane rings, single spotlight.',
        build: buildVoidArena,
    },
];
