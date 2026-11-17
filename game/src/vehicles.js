// Cars: one mesh factory for every vehicle, traffic that follows the road
// grid, and police cruisers that chase the player. A car is a group with a
// body, cabin, wheels and headlights; traffic cars are never driven by the
// player, police cars are, in the sense that they hunt.
import * as THREE from 'three';
import { CAR, CAR_MODELS, WORLD } from './config.js';
import { nearestRoad } from './city.js';

const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 12);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

export function buildCarMesh(model, isPolice) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({
    color: isPolice ? 0x1d4f9c : model.color,
    roughness: 0.35, metalness: 0.55,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, 4.4), paint);
  body.position.y = 0.62; body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.55, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x18222e, roughness: 0.15, metalness: 0.7 }),
  );
  cabin.position.set(0, 1.18, -0.25); cabin.castShadow = true;
  g.add(cabin);
  if (isPolice) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.3, 1.1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
    band.position.set(0, 0.72, 0.4);
    g.add(band);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.3), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    bar.position.set(0, 1.52, -0.25);
    g.add(bar);
    const lightR = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.28), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    lightR.position.set(-0.28, 1.62, -0.25);
    const lightB = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.28), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    lightB.position.set(0.28, 1.62, -0.25);
    g.add(lightR, lightB);
    g.userData.lightR = lightR; g.userData.lightB = lightB;
  }
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const sx of [-0.7, 0.7]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.08), headMat);
    h.position.set(sx, 0.66, 2.22);
    g.add(h);
  }
  g.userData.wheels = [];
  for (const [wx, wz] of [[-1.0, 1.45], [1.0, 1.45], [-1.0, -1.45], [1.0, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    w.castShadow = true;
    g.add(w);
    g.userData.wheels.push(w);
  }
  return g;
}

export class Car {
  constructor(scene, model, x, z, heading, isPolice) {
    this.model = model;
    this.isPolice = !!isPolice;
    this.mesh = buildCarMesh(model, isPolice);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.x = x; this.z = z; this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.occupied = false;   // a pedestrian is driving it (traffic)
    this.stolen = false;     // the player has taken it at least once
    this.alive = true;
    this.health = 100;
    this.spin = 0;           // wheel spin for the visual
  }

  get pos() { return { x: this.x, z: this.z }; }

  syncMesh() {
    this.mesh.position.x = this.x;
    this.mesh.position.z = this.z;
    this.mesh.rotation.y = this.heading;
    this.spin += this.speed * 0.016 * 2;
    for (const w of this.mesh.userData.wheels) w.rotation.x = this.spin;
    if (this.isPolice) {
      const on = Math.floor(performance.now() / 260) % 2 === 0;
      this.mesh.userData.lightR.material.color.setHex(on ? 0xff2222 : 0x551111);
      this.mesh.userData.lightB.material.color.setHex(on ? 0x112255 : 0x2266ff);
    }
  }

  // Arcade driving: accelerate, steer (scaled by speed), grip-limited drift.
  drive(dt, throttle, steerInput, handbrake) {
    const top = this.model.topSpeed || CAR.maxSpeed;
    if (throttle > 0) this.speed += CAR.accel * throttle * dt;
    else if (throttle < 0) {
      if (this.speed > 0.5) this.speed -= CAR.brake * dt;
      else this.speed -= CAR.reverseAccel * dt;
    } else {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 10 * dt);
    }
    if (handbrake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 30 * dt);
    this.speed = Math.max(-CAR.maxReverse, Math.min(top, this.speed));
    const steerTarget = steerInput * CAR.steer * Math.min(1, Math.abs(this.speed) / 8);
    this.steer += (steerTarget - this.steer) * Math.min(1, CAR.grip * dt);
    this.heading += this.steer * dt * Math.sign(this.speed || 1) * (this.speed < 0 ? -1 : 1);
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    this.x += fx * this.speed * dt;
    this.z += fz * this.speed * dt;
    this.syncMesh();
  }
}

// Traffic: cars that cruise the road grid, turn at intersections, and brake
// for the car ahead. They keep the city feeling alive without any scripting.
export class Traffic {
  constructor(scene, random, colliders) {
    this.scene = scene;
    this.random = random;
    this.colliders = colliders;
    this.cars = [];
    for (let i = 0; i < 14; i += 1) this.spawnCar(true);
  }

  spawnCar(anywhere) {
    const model = this.random.pick(CAR_MODELS);
    const road = this.random.pick(WORLD.roadAt);
    const along = this.random.range(-180, 180);
    const lane = this.random.pick([-3.5, 3.5]);
    let x; let z; let heading;
    if (this.random.chance(0.5)) { x = along; z = road + lane; heading = lane > 0 ? Math.PI : 0; }
    else { x = road + lane; z = along; heading = lane > 0 ? -Math.PI / 2 : Math.PI / 2; }
    // Keep spawns off the player's start corner.
    if (Math.abs(x) < 12 && Math.abs(z) < 12) { x += 40; }
    const car = new Car(this.scene, model, x, z, heading, false);
    car.occupied = true;
    car.speed = this.random.range(7, 13);
    car._axis = Math.abs(z - road) < 1 ? 'x' : 'z';
    car._road = road;
    car._lane = lane;
    this.cars.push(car);
    return car;
  }

  _carAhead(car) {
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    for (const other of this.cars) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const along = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (along > 0 && along < 12 && side < 3) return true;
    }
    return false;
  }

  step(dt, playerCar, playerPos) {
    for (const car of this.cars) {
      if (car.stolen || car === playerCar) continue; // player drives it now
      // At an intersection, sometimes turn onto the cross street.
      const near = nearestRoad(car.x, car.z);
      if (near.dist < 2 && this.random.chance(dt * 0.5)) {
        if (car._axis === 'x' && near.axis === 'z') {
          car._axis = 'z'; car._road = near.line;
          car.heading = car._lane > 0 ? -Math.PI / 2 : Math.PI / 2;
        } else if (car._axis === 'z' && near.axis === 'x') {
          car._axis = 'x'; car._road = near.line;
          car.heading = car._lane > 0 ? Math.PI : 0;
        }
      }
      const target = this._carAhead(car) ? 0 : this.random.range(8, 12);
      car.speed += (target - car.speed) * Math.min(1, 2 * dt);
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      car.x += fx * car.speed * dt;
      car.z += fz * car.speed * dt;
      // Wrap around the city edge so traffic never runs out.
      if (car.x > 205) car.x = -205;
      if (car.x < -205) car.x = 205;
      if (car.z > 205) car.z = -205;
      if (car.z < -205) car.z = 205;
      car.syncMesh();
    }
  }
}
