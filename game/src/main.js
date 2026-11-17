// Neon Bay — boot and the one loop: input is read every frame, the world
// advances in fixed 1/60 s steps, the renderer paints what is there. Screens:
// title, play, paused and wasted. ?shot=drive|foot|chase|mission (&seed=N)
// stages that scene instead of the title screen and sets window.__shotReady
// once it has painted, for screenshots.
import { MISSIONS, SAVE_KEY } from './config.js';
import { makeRandom } from './random.js';
import { Input } from './input.js';
import { SoundEngine } from './audio.js';
import { createRenderer } from './render.js';
import { createWorld } from './world.js';
import { Hud } from './hud.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1;

const canvas = document.getElementById('gl');
const statusEl = document.getElementById('status');
const titleScreen = document.getElementById('titleScreen');
const pauseScreen = document.getElementById('pauseScreen');
const wastedScreen = document.getElementById('wastedScreen');
const random = makeRandom(seed);
const renderer = createRenderer(canvas);
const game = createWorld(renderer.scene, random);
const hud = new Hud();
const sound = new SoundEngine();
const input = new Input(canvas);
window.__game = game;

function announce(message) { statusEl.textContent = message; }

function showScreen(name) {
  titleScreen.style.display = name === 'title' ? 'flex' : 'none';
  pauseScreen.style.display = name === 'paused' ? 'flex' : 'none';
  wastedScreen.style.display = name === 'wasted' ? 'flex' : 'none';
  hud.show(name === 'play');
}

function saveGame(silent) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(game.saveData()));
    if (!silent) hud.toast('GAME SAVED', 'Progress stored in this browser.');
  } catch { if (!silent) hud.toast('SAVE FAILED', 'This browser blocks local storage.'); }
}

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function startGame(fromSave) {
  sound.unlock();
  if (fromSave) {
    const save = readSave();
    if (save) game.loadSave(save);
    else game.reset();
  } else {
    game.reset();
  }
  screen = 'play';
  showScreen('play');
  const m = game.missions.mission;
  if (m) {
    hud.toast(m.title, m.brief, 4);
    sound.missionStart();
  }
  announce('Playing Neon Bay. ' + (m ? m.title : 'Free roam.'));
}

function respawn() {
  const lost = Math.floor(game.cash * 0.1);
  game.cash -= lost;
  game.player.health = 100;
  game.player.x = 0; game.player.z = 0; game.player.heading = Math.PI;
  if (game.player.inCar) game.player.exitCar();
  game.player.mesh.visible = true;
  game.player.mesh.position.set(0, 0, 0);
  game.wanted.clear();
  document.getElementById('wastedText').textContent =
    `The Bay PD scraped you off the boardwalk. You wake up at Mercy General, $${lost.toLocaleString('en-US')} lighter.`;
  screen = 'play';
  showScreen('play');
  hud.toast('BACK ON YOUR FEET', 'Vega still has jobs for you.', 3);
  announce('Respawned at Mercy General.');
}

const hooks = {
  onJump() { sound.jump(); },
  onCrash() { sound.hit(); hud.flashDamage(); },
  onRam() { sound.hit(); hud.flashDamage(); },
  onPlayerShot() { hud.flashDamage(); },
  onRunOver() { sound.hit(); hud.toast('HIT AND RUN', 'The Bay PD saw that.', 2); },
  onSteal() { sound.carDoor(); sound.engineStart(); hud.toast('CAR STOLEN', 'The heat is on — lose the cops.', 2.5); },
  onEnterCar() { sound.carDoor(); sound.engineStart(); },
  onExitCar() { sound.carDoor(); },
  onPunch(res) {
    sound.punch();
    if (res.killed) { sound.cash(); hud.toast(res.kind === 'ped' ? 'PEDESTRIAN DOWN' : 'TARGET DOWN', '+$50', 1.8); }
  },
  onPunchMiss() { sound.punch(); },
  onCashDrop() { sound.pickup(); hud.toast('CASH PICKUP', '+$100', 1.6); },
  onStage() { sound.pickup(); },
  onAllMissionsDone() {
    sound.missionComplete();
    hud.toast('NEON BAY IS YOURS', 'All of Vega\'s jobs are done. Free roam!', 4);
  },
};

game.onMissionComplete = (m) => {
  sound.missionComplete();
  hud.toast('MISSION COMPLETE', `${m.title} — +$${m.reward.toLocaleString('en-US')}`, 3.5);
};
game.onMissionStart = (m) => {
  sound.missionStart();
  hud.toast(m.title, m.brief, 4);
};

// Buttons.
document.getElementById('btnStart').addEventListener('click', () => startGame(false));
document.getElementById('btnContinue').addEventListener('click', () => startGame(true));
document.getElementById('btnResume').addEventListener('click', () => { screen = 'play'; showScreen('play'); announce('Playing.'); });
document.getElementById('btnSave').addEventListener('click', () => saveGame(false));
document.getElementById('btnRestart').addEventListener('click', () => { startGame(false); });
document.getElementById('btnQuitTitle').addEventListener('click', () => { screen = 'title'; showScreen('title'); refreshContinue(); });
document.getElementById('btnRespawn').addEventListener('click', respawn);
document.getElementById('btnMuteTitle').addEventListener('click', (e) => {
  sound.unlock();
  sound.setMuted(!sound.muted);
  e.target.textContent = sound.muted ? 'SOUND: OFF' : 'SOUND: ON';
});

function refreshContinue() {
  document.getElementById('btnContinue').style.display = readSave() ? 'inline-block' : 'none';
}

let screen = 'title';

function handleKeys() {
  // take() consumes just these keys, so a single Escape never toggles pause
  // twice and E/F/Space survive for the world step below.
  if (input.take('escape')) {
    if (screen === 'play') { screen = 'paused'; showScreen('paused'); announce('Paused.'); }
    else if (screen === 'paused') { screen = 'play'; showScreen('play'); announce('Playing.'); }
  }
  if (input.take('m')) {
    sound.unlock();
    sound.setMuted(!sound.muted);
    hud.toast(sound.muted ? 'SOUND OFF' : 'SOUND ON', '', 1.2);
  }
}

function stepGame(dt) {
  // Hold-to-fire: the pistol keeps firing while the mouse is held.
  if (screen === 'play' && !game.player.inCar && input.mouse.down && game.player.shootTimer <= 0) {
    game.player.shootTimer = 0.22;
    const res = game.shoot(renderer.camera);
    sound.shoot();
    if (res && res.hit && !res.killed) sound.hit();
    if (res && res.killed) {
      sound.cash();
      hud.toast(res.kind === 'ped' ? 'PEDESTRIAN DOWN' : 'TARGET DOWN', '+$50', 1.6);
    }
  }
  if (input.consumeClick() && screen === 'play' && !game.player.inCar && game.player.shootTimer <= 0) {
    game.player.shootTimer = 0.22;
    const res = game.shoot(renderer.camera);
    sound.shoot();
    if (res && res.killed) { sound.cash(); hud.toast(res.kind === 'ped' ? 'PEDESTRIAN DOWN' : 'TARGET DOWN', '+$50', 1.6); }
  }
  const events = game.step(dt, input, hooks);
  sound.setEngine(game.player.inCar ? Math.abs(game.player.inCar.speed) / 38 : 0, !!game.player.inCar);
  // Any path that drops health to zero ends the run — the event flags cover
  // rams and gunfire, this poll covers anything else (a direct hit included).
  if (events.wasted || game.player.health <= 0) {
    screen = 'wasted';
    showScreen('wasted');
    sound.wasted();
    announce('Wasted. The Bay PD got you.');
  }
  return events;
}

function runShot(name) {
  const staged = stageShot(name, game);
  screen = 'play';
  showScreen('play');
  hud.toast(game.missions.mission ? game.missions.mission.title : 'NEON BAY', game.missions.objectiveText(), 5);
  // The staged scene keeps playing itself forward (W held) so the frame stays
  // alive while the screenshot driver waits; god-mode keeps the chase shot
  // from ending in a WASTED screen mid-capture.
  const driveShots = new Set(['drive', 'chase', 'mission']);
  const auto = {
    _keys: driveShots.has(name) ? new Set(['w']) : new Set(),
    down(...names) { return names.some((n) => this._keys.has(n)); },
    pressed() { return false; },
    mouse: { down: false },
    consumeClick() { return false; },
  };
  let painted = 0;
  let last = performance.now();
  let acc = 0;
  let parked = false; // the cover shot parks short of its marker, it never completes the mission on camera
  function frame(now) {
    requestAnimationFrame(frame);
    // The HUD runs on real elapsed time (unclamped): at a low headless frame
    // rate the clamped sim dt would otherwise stretch every toast for ages.
    const rawDt = (now - last) / 1000;
    const frameDt = Math.min(rawDt, MAX_FRAME);
    acc += frameDt;
    last = now;
    while (acc >= STEP) {
      // Ease off the gas near the mission marker so the shot ends parked at it.
      const mp = game.missions.markerPos();
      if (mp && game.player.inCar) {
        const d = Math.hypot(game.player.x - mp.x, game.player.z - mp.z);
        if ((name === 'drive' || name === 'mission') && d < 80) { auto._keys.delete('w'); parked = true; }
        else if (!parked && driveShots.has(name)) auto._keys.add('w');
      }
      game.step(STEP, auto, {});
      if (game.player.health < 40) game.player.health = 100;
      acc -= STEP;
    }
    renderer.updateCamera(1 / 60, game.player);
    renderer.render();
    hud.update(rawDt, game);
    painted += 1;
    if (painted === 2) window.__shotReady = true;
  }
  requestAnimationFrame(frame);
}

function runGame() {
  refreshContinue();
  showScreen('title');
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const rawDt = (now - last) / 1000;
    const frameDt = Math.min(rawDt, MAX_FRAME);
    acc += frameDt;
    last = now;
    handleKeys();
    if (screen === 'play') {
      // One-shot presses (E, F, Space) are consumed after the FIRST fixed
      // step that reads them. Consuming them after the whole batch instead
      // lets a slow frame's many steps see the same press — one E would
      // enter AND exit the car repeatedly, one F would punch a dozen times.
      let firstStep = true;
      while (acc >= STEP) {
        stepGame(STEP);
        acc -= STEP;
        if (firstStep) { input.consumePressed(); firstStep = false; }
      }
      renderer.updateCamera(STEP, game.player);
      renderer.render();
      hud.update(rawDt, game);
    } else if (screen === 'title') {
      // A slow orbit over the city behind the title card.
      const t = now / 1000;
      renderer.camera.position.set(Math.sin(t * 0.05) * 150, 70, Math.cos(t * 0.05) * 150);
      renderer.camera.lookAt(0, 10, 40);
      renderer.render();
      acc = 0;
    } else {
      acc = 0;
      renderer.updateCamera(STEP, game.player);
      renderer.render();
    }
    // One-shot presses (E to enter a car, F to punch, Space to jump) are
    // consumed after the first fixed step that reads them (see the step
    // loop above). If no step ran, the press survives for the next frame —
    // unless the game is not playing at all, where a stale press must
    // never queue up.
    if (screen !== 'play') input.consumePressed();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') { screen = 'paused'; showScreen('paused'); announce('Paused.'); }
  });
  announce('Neon Bay. Press Start to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
