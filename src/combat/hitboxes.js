import * as THREE from 'three';

const HURTBOXES = [
  ['head', ['head'], new THREE.Vector3(.25, .25, .25)],
  ['torso', ['spine', 'chest', 'hips'], new THREE.Vector3(.38, .55, .28)],
  ['legs', ['leg', 'thigh'], new THREE.Vector3(.32, .48, .25)]
];

function findBone(root, terms) {
  let found = null;
  root.traverse((node) => {
    if (!found && (node.isBone || node.isObject3D) && terms.some((term) => node.name?.toLowerCase().includes(term))) found = node;
  });
  return found;
}

function worldBox(anchor, halfSize) {
  const position = new THREE.Vector3();
  anchor.getWorldPosition(position);
  return new THREE.Box3(position.clone().sub(halfSize), position.clone().add(halfSize));
}

export function attachCombatHitboxes(fighter, scene) {
  const root = fighter.mesh;
  fighter.combat.hitboxes = { hurt: [], attack: null, helpers: [] };
  HURTBOXES.forEach(([name, terms, halfSize]) => {
    const anchor = findBone(root, terms) || root;
    fighter.combat.hitboxes.hurt.push({ name, anchor, halfSize, box: new THREE.Box3() });
  });
  fighter.combat.hitboxes.attackAnchors = {
    hand: findBone(root, ['righthand', 'hand']) || root,
    foot: findBone(root, ['rightfoot', 'foot', 'leg']) || root,
    throw: root
  };
  fighter.combat.hitboxScene = scene;
}

export function updateCombatHitboxes(fighter, showDebug = false) {
  const data = fighter.combat?.hitboxes;
  if (!data) return;
  fighter.mesh.updateMatrixWorld(true);
  data.helperIndex = 0;
  if (showDebug) data.helpers.forEach((helper) => { helper.visible = false; });
  data.hurt.forEach((hurt) => {
    hurt.box.copy(worldBox(hurt.anchor, hurt.halfSize));
    if (showDebug) ensureHelper(data, hurt.box, 0x31d6ff);
  });
  const move = fighter.combat.move;
  const active = fighter.combat.state === 'ACTIVE' && move;
  if (!active) { data.attack = null; return; }
  const anchor = data.attackAnchors[move.limb] || fighter.mesh;
  const size = new THREE.Vector3(move.hitbox.width, move.hitbox.height, move.hitbox.depth);
  const box = worldBox(anchor, size);
  if (move.throw) {
    const base = new THREE.Vector3(); fighter.mesh.getWorldPosition(base);
    box.setFromCenterAndSize(base.add(new THREE.Vector3(fighter.direction * .68, 1.1, 0)), new THREE.Vector3(1.35, 1.35, 1.05));
  }
  data.attack = box;
  if (showDebug) ensureHelper(data, box, move.throw ? 0xff76d5 : 0xffd43b);
}

function ensureHelper(data, box, color) {
  const index = data.helperIndex++;
  let helper = data.helpers[index];
  if (!helper) {
    helper = new THREE.Box3Helper(new THREE.Box3(), color);
    data.helpers[index] = helper;
    data.hitboxScene?.add(helper);
  }
  helper.box.copy(box); helper.visible = true;
}

export function hideCombatHelpers(fighter) {
  fighter.combat?.hitboxes?.helpers?.forEach((helper) => { helper.visible = false; });
}

export function attackIntersects(attacker, defender) {
  const attack = attacker.combat?.hitboxes?.attack;
  return !!attack && defender.combat?.hitboxes?.hurt.some((hurt) => attack.intersectsBox(hurt.box));
}
