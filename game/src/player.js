// The player: Jax Marlow on foot and behind the wheel. On foot he runs,
// jumps and aims with the mouse; in a car the same keys drive. Entering a car
// is a steal unless the car is already his — and stealing is a crime.
import * as THREE from 'three';
import { CAR, PLAYER } from './config.js';
import { buildPersonMesh } from './people.js';
import { resolveCollisions } from './city.js';

export class Player {
  constructor(scene, x, z) {
    this.scene = scene;
    this.mesh = buildPersonMesh(0xff8c42, 0xf2c89b, { cap: 0x22242e });
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.x = x; this.z = z;
    this.heading = Math.PI; // facing north, into the city
    this.y = 0;             // jump height
    this.vy = 0;
    this.health = PLAYER.maxHealth;
    this.inCar = null;      // the Car being driven, or null
    this.walkPhase = 0;
    this.punchTimer = 0;
    this.shootTimer = 0;
    this.invulnerable = 0;
  }

  get pos() { return { x: this.x, z: this.z }; }

  get speed() {
    if (this.inCar) return Math.abs(this.inCar.speed);
    return 0;
  }

  damage(amount) {
    if (this.invulnerable > 0) return false;
    this.health = Math.max(0, this.health - amount);
    this.invulnerable = 0.5;
    return this.health <= 0;
  }

  heal(amount) { this.health = Math.min(PLAYER.maxHealth, this.health + amount); }

  step(dt, input, colliders, onJump) {
    if (this.inCar) return; // the car moves; the player rides along
    if (this.invulnerable > 0) this.invulnerable -= dt;
    if (this.punchTimer > 0) this.punchTimer -= dt;
    if (this.shootTimer > 0) this.shootTimer -= dt;

    const fwd = (input.down('w', 'arrowup') ? 1 : 0) - (input.down('s', 'arrowdown') ? 1 : 0);
    const strafe = (input.down('d', 'arrowright') ? 1 : 0) - (input.down('a', 'arrowleft') ? 1 : 0);
    const running = input.down('shift');
    const speed = (running ? PLAYER.runSpeed : PLAYER.walkSpeed) * (fwd !== 0 || strafe !== 0 ? 1 : 0);
    // A/D turn, W/S move: the classic third-person scheme, camera behind.
    if (input.down('a', 'arrowleft')) this.heading += 2.6 * dt;
    if (input.down('d', 'arrowright')) this.heading -= 2.6 * dt;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    // Forward is where the player faces; W walks forward, S backs up.
    let mx = fx * fwd;
    let mz = fz * fwd;
    // Strafe is perpendicular.
    mx += fz * strafe * 0.6;
    mz += -fx * strafe * 0.6;
    const len = Math.hypot(mx, mz);
    if (len > 0.001) { mx /= len; mz /= len; }
    this.x += mx * speed * dt;
    this.z += mz * speed * dt;
    const fixed = resolveCollisions(colliders, this.x, this.z, PLAYER.radius);
    this.x = fixed.x; this.z = fixed.z;

    if (input.pressed(' ') && this.y === 0) {
      this.vy = PLAYER.jumpSpeed;
      if (onJump) onJump();
    }
    if (this.y > 0 || this.vy !== 0) {
      this.vy -= 26 * dt;
      this.y = Math.max(0, this.y + this.vy * dt);
      if (this.y === 0) this.vy = 0;
    }

    this.walkPhase += dt * speed * 1.6;
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.heading;
    const swing = Math.sin(this.walkPhase) * (speed > 0 ? 0.55 : 0);
    this.mesh.userData.armL.rotation.x = swing;
    this.mesh.userData.armR.rotation.x = -swing;
  }

  // Step the car the player drives, from the same keys. Returns true when the
  // car hit a building hard enough to hurt.
  driveStep(dt, input, colliders) {
    const car = this.inCar;
    if (!car) return false;
    const throttle = (input.down('w', 'arrowup') ? 1 : 0) - (input.down('s', 'arrowdown') ? 1 : 0);
    const steer = (input.down('a', 'arrowleft') ? 1 : 0) - (input.down('d', 'arrowright') ? 1 : 0);
    const handbrake = input.down(' ');
    const prevSpeed = car.speed;
    car.drive(dt, throttle, steer, handbrake);
    // The chase camera follows the player's heading, so it must track the car.
    this.heading = car.heading;
    const fixed = resolveCollisions(colliders, car.x, car.z, CAR.radius);
    const hitWall = Math.abs(fixed.x - car.x) > 0.01 || Math.abs(fixed.z - car.z) > 0.01;
    car.x = fixed.x; car.z = fixed.z;
    if (hitWall && Math.abs(prevSpeed) > 12) {
      car.speed *= -0.25;
      return true;
    }
    car.syncMesh();
    this.x = car.x; this.z = car.z;
    this.mesh.position.set(car.x, 0, car.z);
    this.mesh.visible = false;
    return false;
  }

  enterCar(car, wasStolen) {
    this.inCar = car;
    car.occupied = true;
    car.stolen = car.stolen || wasStolen;
    this.mesh.visible = false;
    this.x = car.x; this.z = car.z;
  }

  exitCar() {
    const car = this.inCar;
    if (!car) return null;
    this.inCar = null;
    car.occupied = false;
    // Step out to the driver's side.
    const sx = Math.cos(car.heading);
    const sz = -Math.sin(car.heading);
    this.x = car.x + sx * 2.2;
    this.z = car.z + sz * 2.2;
    this.heading = car.heading;
    this.mesh.visible = true;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    return car;
  }
}
