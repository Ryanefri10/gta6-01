// The wanted system: stars earned by crime, lost by laying low, and the Bay
// PD response — cruisers that ram, officers on foot, and sirens in the mix.
import { WANTED } from './config.js';
import { Car } from './vehicles.js';
import { Hostile, randomPedPos } from './people.js';

export class WantedSystem {
  constructor(scene, random) {
    this.scene = scene;
    this.random = random;
    this.stars = 0;
    this.decayTimer = 0;
    this.policeCars = [];
    this.footCops = [];
    this.spawnTimer = 0;
    this._crimeCooldown = 0;
  }

  addStars(n, reason) {
    if (this._crimeCooldown > 0 && n <= 1) return this.stars;
    this.stars = Math.min(WANTED.maxStars, this.stars + n);
    this.decayTimer = WANTED.decaySeconds[this.stars] || 30;
    this._crimeCooldown = 1.2;
    return this.stars;
  }

  clear() {
    this.stars = 0;
    this.decayTimer = 0;
    this._removeAllPolice();
  }

  _removeAllPolice() {
    for (const c of this.policeCars) this.scene.remove(c.mesh);
    for (const c of this.footCops) c.alive = false;
    this.policeCars = [];
    this.footCops = this.footCops.filter((c) => false);
  }

  _spawnPoliceCar(playerPos) {
    const angle = this.random.range(0, Math.PI * 2);
    const dist = this.random.range(55, 85);
    const x = Math.max(-200, Math.min(200, playerPos.x + Math.sin(angle) * dist));
    const z = Math.max(-200, Math.min(200, playerPos.z + Math.cos(angle) * dist));
    const car = new Car(this.scene, { name: 'Bay PD Interceptor', color: 0x1d4f9c, topSpeed: 40 }, x, z, angle, true);
    car.occupied = true;
    this.policeCars.push(car);
    return car;
  }

  _spawnFootCop(playerPos) {
    const p = randomPedPos(this.random);
    const x = playerPos.x + (p.x - playerPos.x) * 0.2 + this.random.range(-15, 15);
    const z = playerPos.z + (p.z - playerPos.z) * 0.2 + this.random.range(-15, 15);
    const cop = new Hostile(this.scene, x, z, 'cop');
    this.footCops.push(cop);
    return cop;
  }

  step(dt, player, onRam, onCopShot) {
    if (this._crimeCooldown > 0) this._crimeCooldown -= dt;
    // Lay low and the heat fades, one star at a time.
    if (this.stars > 0) {
      this.decayTimer -= dt;
      if (this.decayTimer <= 0) {
        this.stars -= 1;
        this.decayTimer = this.stars > 0 ? WANTED.decaySeconds[this.stars] : 0;
      }
    }
    const wantCars = this.stars === 0 ? 0 : Math.min(WANTED.maxPoliceCars, this.stars);
    this.spawnTimer -= dt;
    if (this.policeCars.length < wantCars && this.spawnTimer <= 0) {
      this._spawnPoliceCar(player.pos);
      this.spawnTimer = 2.5;
    }
    // Too many cruisers for a quiet street: retire the far ones.
    if (this.policeCars.length > wantCars) {
      const extra = this.policeCars.pop();
      this.scene.remove(extra.mesh);
    }
    // Foot cops join the hunt from 3 stars, while the player is on foot.
    const wantCops = this.stars >= 3 && !player.inCar ? Math.min(3, this.stars - 1) : 0;
    if (this.footCops.filter((c) => c.alive).length < wantCops && this.spawnTimer <= 0) {
      this._spawnFootCop(player.pos);
      this.spawnTimer = 3;
    }
    // Cruisers hunt: steer at the player and ram.
    for (const car of this.policeCars) {
      const dx = player.x - car.x;
      const dz = player.z - car.z;
      const dist = Math.hypot(dx, dz);
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, dh * 1.4));
      if (car._ramCooldown > 0) car._ramCooldown -= dt;
      // After a ram the cruiser backs off instead of grinding on the player.
      const throttle = car._ramCooldown > 0 ? -0.7 : (dist > 6 ? 1 : 0.4);
      car.drive(dt, throttle, steer, false);
      if (dist < 3.4 && car._ramCooldown <= 0) {
        car._ramCooldown = 1.4;
        car.speed = -9;
        // Shove the player's car away from the impact so cars never fuse.
        if (player.inCar) {
          const nx = dx / (dist || 1);
          const nz = dz / (dist || 1);
          player.inCar.x += nx * 1.6;
          player.inCar.z += nz * 1.6;
          player.inCar.syncMesh();
          player.x = player.inCar.x;
          player.z = player.inCar.z;
        }
        if (onRam) onRam(car, dist);
      }
    }
    // Foot cops chase and shoot.
    for (const cop of this.footCops) {
      if (!cop.alive) continue;
      cop.step(dt, player.pos, (self, dist) => {
        if (onCopShot) onCopShot(self, dist);
      });
    }
    this.footCops = this.footCops.filter((c) => c.alive);
  }
}
