// People: pedestrians who stroll the sidewalks and flee gunfire, Harbor
// Kings gang members who guard the docks, and Bay PD officers on foot.
// Everyone is a small articulated figure built from boxes — no assets.
import * as THREE from 'three';
import { PED_NAMES, PLAYER, WORLD } from './config.js';
import { isOnRoad } from './city.js';

const SHIRTS = [0xe8b64c, 0x4cc9e8, 0xe84c7a, 0x7ae84c, 0xd9d9d9, 0x9a6ee8, 0xe86a4c, 0x4ce8c9];
const SKINS = [0xf2c89b, 0xc98d5f, 0x8a5a34, 0xf7d7b0];

export function buildPersonMesh(shirtColor, skinColor, opts) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: opts?.pants ?? 0x2a3340, roughness: 0.95 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.32), pants);
  legs.position.y = 0.43; legs.castShadow = true;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.75, 0.38), shirt);
  torso.position.y = 1.22; torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.82; head.castShadow = true;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), shirt);
  armL.position.set(-0.46, 1.2, 0);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), shirt);
  armR.position.set(0.46, 1.2, 0);
  // A pistol in the right hand for armed people.
  if (opts?.armed) {
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.42), new THREE.MeshStandardMaterial({ color: 0x14181d }));
    gun.position.set(0.46, 0.86, 0.2);
    g.add(gun);
  }
  if (opts?.cap) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.46), new THREE.MeshStandardMaterial({ color: opts.cap }));
    cap.position.y = 2.06;
    g.add(cap);
  }
  g.add(legs, torso, head, armL, armR);
  g.userData.armL = armL; g.userData.armR = armR;
  return g;
}

export class Pedestrian {
  constructor(scene, random, x, z) {
    this.scene = scene;
    this.random = random;
    this.mesh = buildPersonMesh(
      random.pick(SHIRTS), random.pick(SKINS),
      { cap: random.chance(0.3) ? random.pick([0xd94f3d, 0x3d7dd9, 0xf2c230]) : null },
    );
    this.x = x; this.z = z;
    this.heading = random.range(0, Math.PI * 2);
    this.speed = random.range(1.2, 2.4);
    this.name = random.pick(PED_NAMES);
    this.alive = true;
    this.health = 30;
    this.fleeing = false;
    this.fleeTimer = 0;
    this.walkPhase = random.range(0, Math.PI * 2);
    this.target = this._pickTarget();
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
  }

  _pickTarget() {
    // Sidewalk-ish targets: just off a road, or along the boardwalk.
    if (this.random.chance(0.25)) return { x: this.random.range(-180, 180), z: WORLD.beachZ - 8 };
    const road = this.random.pick(WORLD.roadAt);
    if (this.random.chance(0.5)) return { x: this.random.range(-190, 190), z: road + this.random.pick([-11, 11]) };
    return { x: road + this.random.pick([-11, 11]), z: this.random.range(-190, 180) };
  }

  step(dt, danger) {
    if (!this.alive) return;
    if (danger) { this.fleeing = true; this.fleeTimer = 2.5; }
    if (this.fleeTimer > 0) {
      this.fleeTimer -= dt;
      if (this.fleeTimer <= 0) this.fleeing = false;
    }
    const speed = this.fleeing ? 5.2 : this.speed;
    const dx = this.target.x - this.x;
    const dz = this.target.z - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 2) { this.target = this._pickTarget(); return; }
    const want = Math.atan2(dx, dz);
    let dh = want - this.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.heading += Math.max(-3 * dt, Math.min(3 * dt, dh));
    this.x += Math.sin(this.heading) * speed * dt;
    this.z += Math.cos(this.heading) * speed * dt;
    this.walkPhase += dt * speed * 3.2;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    const swing = Math.sin(this.walkPhase) * 0.5;
    this.mesh.userData.armL.rotation.x = swing;
    this.mesh.userData.armR.rotation.x = -swing;
  }

  remove() {
    this.alive = false;
    this.scene.remove(this.mesh);
  }

  // One pistol round (34) drops a pedestrian; a punch (25) takes two.
  damage(amount) {
    this.health -= amount;
    if (this.health <= 0) { this.remove(); return true; }
    return false;
  }
}

// An armed hostile: gang member or cop on foot. Chases the player when close,
// shoots inaccurately, and can be shot or punched down.
export class Hostile {
  constructor(scene, x, z, kind) {
    this.scene = scene;
    this.kind = kind; // 'gang' | 'cop'
    this.isCop = kind === 'cop';
    this.mesh = buildPersonMesh(
      this.isCop ? 0x1d4f9c : 0x8a1f2d,
      0xf2c89b,
      { armed: true, cap: this.isCop ? 0x1d4f9c : 0x8a1f2d, pants: this.isCop ? 0x16233a : 0x2a1a1a },
    );
    this.x = x; this.z = z;
    this.heading = 0;
    this.health = this.isCop ? 60 : 50;
    this.alive = true;
    this.speed = this.isCop ? 5.4 : 4.4;
    this.shootTimer = 1.5;
    this.walkPhase = 0;
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
  }

  step(dt, playerPos, onShoot) {
    if (!this.alive) return;
    const dx = playerPos.x - this.x;
    const dz = playerPos.z - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 55) {
      const want = Math.atan2(dx, dz);
      let dh = want - this.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.heading += Math.max(-4 * dt, Math.min(4 * dt, dh));
      if (dist > 14) {
        this.x += Math.sin(this.heading) * this.speed * dt;
        this.z += Math.cos(this.heading) * this.speed * dt;
        this.walkPhase += dt * 9;
      } else {
        this.shootTimer -= dt;
        if (this.shootTimer <= 0) {
          this.shootTimer = this.isCop ? 1.1 : 1.6;
          if (onShoot) onShoot(this, dist);
        }
      }
    }
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    const swing = Math.sin(this.walkPhase) * 0.4;
    this.mesh.userData.armL.rotation.x = swing;
    this.mesh.userData.armR.rotation.x = -swing;
  }

  damage(amount) {
    this.health -= amount;
    if (this.health <= 0) { this.alive = false; this.scene.remove(this.mesh); return true; }
    return false;
  }
}

export class Crowd {
  constructor(scene, random) {
    this.scene = scene;
    this.random = random;
    this.peds = [];
    for (let i = 0; i < 24; i += 1) {
      const road = random.pick(WORLD.roadAt);
      const x = random.chance(0.5) ? random.range(-190, 190) : road + random.pick([-11, 11]);
      const z = random.chance(0.5) ? road + random.pick([-11, 11]) : random.range(-190, 180);
      this.peds.push(new Pedestrian(scene, random, x, z));
    }
  }

  step(dt, dangerPos, gunshot) {
    for (const p of this.peds) {
      const danger = gunshot && p.alive && Math.hypot(p.x - dangerPos.x, p.z - dangerPos.z) < 30;
      p.step(dt, danger);
    }
  }

  // Nearest living pedestrian to a point (for punching / running over).
  nearest(x, z, maxDist) {
    let best = null; let bestD = maxDist;
    for (const p of this.peds) {
      if (!p.alive) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }
}

export function randomPedPos(random) {
  const road = random.pick(WORLD.roadAt);
  if (random.chance(0.5)) return { x: random.range(-190, 190), z: road + random.pick([-11, 11]) };
  return { x: road + random.pick([-11, 11]), z: random.range(-190, 180) };
}
