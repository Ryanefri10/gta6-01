// The screenshot scenes behind ?shot=drive|foot|chase|mission. Each one sets
// up a real state of the game — a stolen car mid-drive, a walk through
// traffic, a four-star police chase, a mission in progress — then plays it
// forward with a simple autopilot so the frame is what real play looks like,
// and the same seed always gives the same frame.
import { CAR_MODELS } from './config.js';

const STEP = 1 / 60;

function playForward(game, seconds, drive) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const input = {
      _keys: drive ? new Set(['w']) : new Set(),
      down(...names) { return names.some((n) => this._keys.has(n)); },
      pressed() { return false; },
    };
    game.step(STEP, input, {});
    if (game.player.health <= 0) break;
  }
}

function putInCar(game, x, z, heading) {
  const car = game.traffic.cars[0];
  car.x = x; car.z = z; car.heading = heading;
  car.speed = 14;
  car.stolen = true;
  // A bright hero car for the shot: repaint the body Sunset red.
  car.model = { name: 'Sunset Sedan', color: 0xd94f3d, topSpeed: 36 };
  car.mesh.children[0].material.color.setHex(0xd94f3d);
  car.syncMesh();
  game.player.enterCar(car, true);
  game.player.heading = heading;
  game.player.x = x; game.player.z = z;
  return car;
}

// Stage one named scene on a fresh game; returns the screen the loop should
// run in (always play — the HUD is the point).
export function stageShot(name, game) {
  game.reset();
  game.cash = 2450;
  if (name === 'foot') {
    // On foot at a busy downtown crossing, traffic rolling past.
    game.player.x = -4; game.player.z = -8; game.player.heading = Math.PI * 0.9;
    game.player.mesh.position.set(-4, 0, -8);
    playForward(game, 4, false);
    return { screen: 'play' };
  }
  if (name === 'chase') {
    // Four stars, three cruisers closing in on a stolen coupe, eastbound on
    // the 75 road so the chase stays on asphalt. One cruiser is pulled up
    // right behind the player so the pursuit reads in the frame.
    putInCar(game, -40, 75, Math.PI / 2);
    game.wanted.addStars(4);
    game.wanted._crimeCooldown = 99;
    game.wanted.decayTimer = 999;
    game.wanted.step(0.01, game.player, null, null);
    game.wanted.step(0.01, game.player, null, null);
    const lead = game.wanted.policeCars[0];
    if (lead) {
      lead.x = game.player.x - 20; lead.z = 75; lead.heading = Math.PI / 2;
      lead.speed = 26;
      lead.syncMesh();
    }
    playForward(game, 3, true);
    game.wanted.stars = 4;
    game.wanted.decayTimer = 999;
    return { screen: 'play' };
  }
  if (name === 'mission') {
    // Mission 2 in progress: package grabbed, heat on, racing to the hotel.
    game.missions.index = 1;
    game.missions.stage = 1;
    game.wanted.addStars(2);
    game.wanted._crimeCooldown = 99;
    game.wanted.decayTimer = 999;
    putInCar(game, -20, -75, Math.PI / 2);
    playForward(game, 1.5, true);
    game.wanted.stars = 2;
    game.wanted.decayTimer = 999;
    return { screen: 'play' };
  }
  // Default: drive — a stolen Sunset Sedan racing north up the 0 road
  // through downtown, the skyline ahead of it.
  putInCar(game, 0, 150, Math.PI);
  game.missions.index = 0;
  game.missions.stage = 1;
  playForward(game, 3, true);
  return { screen: 'play' };
}
