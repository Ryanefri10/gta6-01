// The world: every entity in Neon Bay and one step() that moves them all —
// the player, traffic, pedestrians, gang, police, missions, cash drops and
// combat. It knows no screens and no DOM; the caller passes hooks for sound
// and toasts and reads the events it returns.
import * as THREE from 'three';
import { CASH_DROPS, CAR, MISSIONS, PLAYER, WANTED } from './config.js';
import { buildCity, resolveCollisions } from './city.js';
import { Traffic } from './vehicles.js';
import { Crowd, Hostile } from './people.js';
import { Player } from './player.js';
import { WantedSystem } from './wanted.js';
import { MissionManager } from './missions.js';

// Gang holdouts on the open dockside ground east of the 150 road — never
// inside a building, so the shootout always has somewhere to happen.
const GANG_SPOTS = [
  [165, -135], [178, -150], [160, -165], [182, -138], [170, -168],
];

export function createWorld(scene, random) {
  const city = buildCity(scene, random);
  const traffic = new Traffic(scene, random, city.colliders);
  const crowd = new Crowd(scene, random);
  const player = new Player(scene, 0, 0);
  const wanted = new WantedSystem(scene, random);
  const missions = new MissionManager(scene);

  const game = {
    scene, city, traffic, crowd, player, wanted, missions,
    cash: 0,
    gang: [],
    cashDrops: [],
    time: 0,
    gunshotAt: null,
    onMissionComplete: null,
    onMissionStart: null,
  };

  // Cash drops: spinning gold discs the player can walk or drive over.
  const dropGeo = new THREE.CylinderGeometry(0.9, 0.9, 0.18, 16);
  const dropMat = new THREE.MeshBasicMaterial({ color: 0x7dffb0 });
  for (const [x, z] of CASH_DROPS) {
    const mesh = new THREE.Mesh(dropGeo, dropMat);
    mesh.position.set(x, 0.5, z);
    scene.add(mesh);
    game.cashDrops.push({ x, z, mesh, taken: false, phase: random.range(0, 6) });
  }

  // Tracer pool for gunshots: one fading line per shot.
  const tracers = [];
  function spawnTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true }));
    scene.add(line);
    tracers.push({ line, life: 0.09 });
  }

  game.spawnGang = function () {
    if (game.gang.some((g) => g.alive)) return;
    for (const [x, z] of GANG_SPOTS) {
      game.gang.push(new Hostile(scene, x + random.range(-3, 3), z + random.range(-3, 3), 'gang'));
    }
  };

  game.nearestCar = function (maxDist) {
    let best = null; let bestD = maxDist;
    const all = [...traffic.cars, ...wanted.policeCars];
    for (const car of all) {
      if (!car.alive) continue;
      const d = Math.hypot(car.x - player.x, car.z - player.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  };

  // E: steal / enter the nearest car, or step out of the one being driven.
  // Returns 'stole' | 'entered' | 'exited' | null.
  game.tryEnterExitCar = function () {
    if (player.inCar) {
      player.exitCar();
      return 'exited';
    }
    const car = game.nearestCar(4.2);
    if (!car) return null;
    const wasStolen = !car.stolen && car.occupied;
    if (car.isPolice) wanted.addStars(1);
    else if (wasStolen) wanted.addStars(WANTED.stealStars);
    player.enterCar(car, wasStolen);
    return wasStolen || car.isPolice ? 'stole' : 'entered';
  };

  // Click: fire the pistol from the camera through the crosshair. Returns the
  // hit description for sound/toast, or null when the shot missed everything.
  game.shoot = function (camera) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    ray.far = PLAYER.gunRange;
    const origin = ray.ray.origin.clone();
    // Find the closest hostile / pedestrian the ray passes near.
    let best = null; let bestT = Infinity;
    const targets = [];
    for (const g of game.gang) if (g.alive) targets.push({ obj: g, r: 1.1, hostile: true });
    for (const c of wanted.footCops) if (c.alive) targets.push({ obj: c, r: 1.1, hostile: true });
    for (const p of crowd.peds) if (p.alive) targets.push({ obj: p, r: 1.0, hostile: false });
    for (const t of targets) {
      const to = new THREE.Vector3(t.obj.x - origin.x, 1.2 - origin.y, t.obj.z - origin.z);
      const along = to.dot(ray.ray.direction);
      if (along < 0 || along > PLAYER.gunRange) continue;
      const closest = origin.clone().addScaledVector(ray.ray.direction, along);
      const perp = Math.hypot(closest.x - t.obj.x, closest.z - t.obj.z);
      if (perp < t.r && along < bestT) { bestT = along; best = t; }
    }
    const end = origin.clone().addScaledVector(ray.ray.direction, best ? bestT : 70);
    spawnTracer(origin.clone().addScaledVector(ray.ray.direction, 1.5), end);
    game.gunshotAt = { x: player.x, z: player.z };
    if (!best) return { hit: false };
    const killed = best.obj.damage ? best.obj.damage(PLAYER.gunDamage) : false;
    if (best.obj instanceof Hostile) {
      if (killed) {
        if (best.obj.kind === 'gang') missions.registerKill();
        game.cash += 50;
        if (best.obj.isCop) wanted.addStars(WANTED.killCopStars);
        return { hit: true, killed: true, kind: best.obj.kind };
      }
      return { hit: true, killed: false, kind: best.obj.kind };
    }
    // A pedestrian went down: a crime, and the crowd scatters.
    if (killed) {
      best.obj.remove();
      wanted.addStars(WANTED.killPedStars);
      return { hit: true, killed: true, kind: 'ped' };
    }
    return { hit: true, killed: false, kind: 'ped' };
  };

  // F: punch the nearest person in front of the player.
  game.punch = function () {
    const fx = Math.sin(player.heading);
    const fz = Math.cos(player.heading);
    let best = null; let bestD = PLAYER.punchRange;
    const consider = (obj) => {
      const dx = obj.x - player.x;
      const dz = obj.z - player.z;
      const d = Math.hypot(dx, dz);
      if (d < bestD && (dx * fx + dz * fz) > 0) { bestD = d; best = obj; }
    };
    for (const g of game.gang) if (g.alive) consider(g);
    for (const c of wanted.footCops) if (c.alive) consider(c);
    for (const p of crowd.peds) if (p.alive) consider(p);
    if (!best) return null;
    const killed = best.damage ? best.damage(PLAYER.punchDamage) : false;
    if (best instanceof Hostile) {
      if (killed) {
        if (best.kind === 'gang') missions.registerKill();
        game.cash += 50;
        if (best.isCop) wanted.addStars(WANTED.killCopStars);
        return { hit: true, killed: true, kind: best.kind };
      }
      return { hit: true, killed: false, kind: best.kind };
    }
    if (killed) {
      best.remove();
      wanted.addStars(WANTED.killPedStars);
      return { hit: true, killed: true, kind: 'ped' };
    }
    return { hit: true, killed: false, kind: 'ped' };
  };

  function stepCashDrops(dt) {
    for (const drop of game.cashDrops) {
      if (drop.taken) continue;
      drop.phase += dt;
      drop.mesh.rotation.y += dt * 2;
      drop.mesh.position.y = 0.5 + Math.sin(drop.phase * 2) * 0.15;
      const d = Math.hypot(player.x - drop.x, player.z - drop.z);
      if (d < 2.6) {
        drop.taken = true;
        scene.remove(drop.mesh);
        game.cash += 100;
        game._lastCashEvent = 'cashdrop';
      }
    }
  }

  game.reset = function () {
    player.health = PLAYER.maxHealth;
    player.x = 0; player.z = 0; player.heading = Math.PI;
    player.y = 0; player.vy = 0;
    if (player.inCar) player.exitCar();
    player.mesh.visible = true;
    player.mesh.position.set(0, 0, 0);
    game.cash = 0;
    wanted.clear();
    missions.reset();
    for (const g of game.gang) { if (g.alive) scene.remove(g.mesh); }
    game.gang = [];
    for (const drop of game.cashDrops) {
      if (drop.taken) { drop.taken = false; scene.add(drop.mesh); }
    }
  };

  game.loadSave = function (save) {
    game.reset();
    game.cash = save.cash || 0;
    player.health = save.health ?? PLAYER.maxHealth;
    player.x = save.x || 0;
    player.z = save.z || 0;
    player.heading = save.heading ?? Math.PI;
    missions.index = Math.min(save.missionIndex || 0, MISSIONS.length - 1);
    missions.stage = save.missionStage || 0;
    missions.done = !!save.missionsDone;
    if (save.wanted) wanted.stars = Math.min(save.wanted, 5);
    player.mesh.position.set(player.x, 0, player.z);
    player.mesh.rotation.y = player.heading;
  };

  game.saveData = function () {
    return {
      cash: game.cash,
      health: Math.round(player.health),
      x: Math.round(player.x * 10) / 10,
      z: Math.round(player.z * 10) / 10,
      heading: player.heading,
      missionIndex: missions.index,
      missionStage: missions.stage,
      missionsDone: missions.done,
      wanted: wanted.stars,
    };
  };

  // One fixed step. `hooks` carries the sound/toast callbacks the game needs;
  // returns an event object the caller turns into toasts and sounds.
  game.step = function (dt, input, hooks) {
    game.time += dt;
    const events = { cashDrop: false, wasted: false, missionEvent: null, rammed: false, copShot: false };
    game._lastCashEvent = null;

    if (player.inCar) {
      const crashed = player.driveStep(dt, input, city.colliders);
      if (crashed) {
        if (player.damage(6)) events.wasted = true;
        if (hooks.onCrash) hooks.onCrash();
      }
      // Bumping traffic: push both cars apart and bleed speed.
      for (const car of traffic.cars) {
        if (car === player.inCar || car.stolen) continue;
        const d = Math.hypot(car.x - player.inCar.x, car.z - player.inCar.z);
        if (d < 4.4 && d > 0.01) {
          const push = (4.4 - d) / 2;
          const nx = (car.x - player.inCar.x) / d;
          const nz = (car.z - player.inCar.z) / d;
          car.x += nx * push; car.z += nz * push;
          player.inCar.x -= nx * push; player.inCar.z -= nz * push;
          car.speed *= 0.7; player.inCar.speed *= 0.75;
          car.syncMesh();
        }
      }
      // Running a pedestrian over is a crime.
      const ped = crowd.nearest(player.x, player.z, 2.6);
      if (ped && Math.abs(player.inCar.speed) > 6) {
        ped.remove();
        wanted.addStars(WANTED.killPedStars);
        if (hooks.onRunOver) hooks.onRunOver();
      }
    } else {
      player.step(dt, input, city.colliders, () => hooks.onJump?.());
      if (input.pressed('f')) {
        const res = game.punch();
        if (res) hooks.onPunch?.(res);
        else hooks.onPunchMiss?.();
      }
    }

    if (input.pressed('e')) {
      const res = game.tryEnterExitCar();
      if (res === 'stole') hooks.onSteal?.();
      else if (res === 'entered') hooks.onEnterCar?.();
      else if (res === 'exited') hooks.onExitCar?.();
    }

    traffic.step(dt, player.inCar, player.pos);
    crowd.step(dt, player.pos, !!game.gunshotAt);
    game.gunshotAt = null;

    // Gang members only appear once the player reaches the docks.
    if (missions.index === 2 && missions.stage >= 1 && game.gang.length === 0) game.spawnGang();
    for (const g of game.gang) {
      if (!g.alive) continue;
      g.step(dt, player.pos, (self, dist) => {
        // Gang fire is wild: most shots miss, a few sting.
        if (Math.random() < 0.35 && dist < 40) {
          if (player.damage(7)) events.wasted = true;
          events.copShot = true;
          hooks.onPlayerShot?.();
        }
      });
    }

    wanted.step(dt, player, (car) => {
      // A cruiser ram: hurts the player (or his car) and shakes the camera.
      if (player.inCar) { player.inCar.speed *= 0.5; if (player.damage(4)) events.wasted = true; }
      else if (player.damage(9)) events.wasted = true;
      events.rammed = true;
      hooks.onRam?.();
    }, (cop, dist) => {
      if (Math.random() < 0.5 && dist < 35) {
        if (player.damage(6)) events.wasted = true;
        events.copShot = true;
        hooks.onPlayerShot?.();
      }
    });

    const me = missions.step(dt, game);
    if (me) {
      events.missionEvent = me;
      // The completed mission's reward toast already fired through
      // game.onMissionComplete inside missions._advance; here only the
      // all-done fanfare and the stage-change chime are left to the caller.
      if (me === 'all-done') hooks.onAllMissionsDone?.();
      if (me === 'stage') hooks.onStage?.();
    }

    stepCashDrops(dt);
    if (game._lastCashEvent === 'cashdrop') { events.cashDrop = true; hooks.onCashDrop?.(); }

    // Clouds drift; water shimmers.
    for (const cloud of city.clouds) {
      cloud.position.x += dt * 1.2;
      if (cloud.position.x > 450) cloud.position.x = -450;
    }
    city.water.material.color.setHSL(0.54, 0.62, 0.42 + Math.sin(game.time * 0.5) * 0.03);

    // Tracers fade out.
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      tracers[i].life -= dt;
      if (tracers[i].life <= 0) {
        scene.remove(tracers[i].line);
        tracers[i].line.geometry.dispose();
        tracers.splice(i, 1);
      }
    }
    return events;
  };

  return game;
}
