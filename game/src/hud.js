// The HUD: DOM panels for health, cash, wanted stars and the objective, plus
// a live canvas minimap of Neon Bay — roads, buildings, water, the player,
// traffic, police and the mission marker.
import { WORLD } from './config.js';

const STAR_ON = '★';
const STAR_OFF = '☆';

export class Hud {
  constructor() {
    this.root = document.getElementById('hud');
    this.cashEl = document.getElementById('cash');
    this.healthEl = document.getElementById('healthfill');
    this.ammoEl = document.getElementById('ammo');
    this.carEl = document.getElementById('carname');
    this.wantedEl = document.getElementById('wanted');
    this.objTitle = document.getElementById('objTitle');
    this.objText = document.getElementById('objText');
    this.toastEl = document.getElementById('toast');
    this.crossEl = document.getElementById('crosshair');
    this.speedEl = document.getElementById('speedo');
    this.vignette = document.getElementById('vignette');
    this.map = document.getElementById('minimap');
    this.mapCtx = this.map.getContext('2d');
    this._toastTimer = 0;
    this._lastCash = -1;
    this._lastStars = -1;
    this._lastHealth = -1;
  }

  show(on) { this.root.classList.toggle('on', on); }

  toast(title, sub, seconds) {
    this.toastEl.innerHTML = title + (sub ? `<small>${sub}</small>` : '');
    this.toastEl.style.display = 'block';
    this._toastTimer = seconds || 2.6;
  }

  flashDamage() {
    this.vignette.style.opacity = '1';
    setTimeout(() => { this.vignette.style.opacity = '0'; }, 130);
  }

  update(dt, game) {
    if (this._toastTimer > 0) {
      this._toastTimer -= dt;
      if (this._toastTimer <= 0) this.toastEl.style.display = 'none';
    }
    const p = game.player;
    if (game.cash !== this._lastCash) {
      this._lastCash = game.cash;
      this.cashEl.textContent = `$${game.cash.toLocaleString('en-US')}`;
    }
    const hp = Math.round(p.health);
    if (hp !== this._lastHealth) {
      this._lastHealth = hp;
      this.healthEl.style.width = `${hp}%`;
      this.healthEl.style.background = hp > 50
        ? 'linear-gradient(90deg,#37e08b,#7dffb0)'
        : hp > 25 ? 'linear-gradient(90deg,#e0a337,#ffd23e)' : 'linear-gradient(90deg,#e03737,#ff7d7d)';
    }
    const stars = game.wanted.stars;
    if (stars !== this._lastStars) {
      this._lastStars = stars;
      let html = '';
      for (let i = 0; i < 5; i += 1) html += `<span class="${i < stars ? '' : 'dim'}">${i < stars ? STAR_ON : STAR_OFF}</span>`;
      this.wantedEl.innerHTML = html;
    }
    const m = game.missions.mission;
    this.objTitle.textContent = game.missions.done ? 'FREE ROAM — NEON BAY' : (m ? m.title : 'NEON BAY');
    this.objText.textContent = game.missions.objectiveText();
    this.carEl.textContent = p.inCar ? `🚗 ${p.inCar.model.name}` : 'ON FOOT';
    this.crossEl.style.display = p.inCar ? 'none' : 'block';
    if (p.inCar) {
      const kmh = Math.round(Math.abs(p.inCar.speed) * 3.6);
      this.speedEl.style.display = 'block';
      this.speedEl.innerHTML = `${kmh}<small> KM/H</small>`;
    } else {
      this.speedEl.style.display = 'none';
    }
    this._drawMinimap(game);
  }

  _drawMinimap(game) {
    const ctx = this.mapCtx;
    const S = 180;
    const H = WORLD.halfSize + 30;
    const toMap = (x, z) => [((x + H) / (2 * H)) * S, ((z + H) / (2 * H)) * S];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#0d2733';
    ctx.fillRect(0, 0, S, S);
    // Water at the south edge.
    ctx.fillStyle = '#1e7fa8';
    const [, wy] = toMap(0, WORLD.waterZ);
    ctx.fillRect(0, wy, S, S - wy);
    ctx.fillStyle = '#e8cf9a';
    const [, by] = toMap(0, WORLD.beachZ);
    ctx.fillRect(0, by, S, wy - by);
    // Roads.
    ctx.strokeStyle = '#3a414d';
    ctx.lineWidth = 5;
    for (const r of WORLD.roadAt) {
      const [x1, y1] = toMap(r, -H);
      const [x2, y2] = toMap(r, H);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const [x3, y3] = toMap(-H, r);
      const [x4, y4] = toMap(H, r);
      ctx.beginPath(); ctx.moveTo(x3, y3); ctx.lineTo(x4, y4); ctx.stroke();
    }
    // Buildings.
    ctx.fillStyle = '#5a6b7a';
    for (const b of game.city.buildings) {
      const [bx, bz] = toMap(b.x - b.w / 2, b.z - b.d / 2);
      const w = (b.w / (2 * H)) * S;
      const d = (b.d / (2 * H)) * S;
      ctx.fillRect(bx, bz, Math.max(1.5, w), Math.max(1.5, d));
    }
    // Cash drops.
    ctx.fillStyle = '#7dffb0';
    for (const drop of game.cashDrops) {
      if (!drop.taken) {
        const [dx, dz] = toMap(drop.x, drop.z);
        ctx.beginPath(); ctx.arc(dx, dz, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Mission marker, pulsing.
    const mp = game.missions.markerPos();
    if (mp && !game.missions.done) {
      const [mx, mz] = toMap(mp.x, mp.z);
      const r = 5 + Math.sin(performance.now() / 200) * 1.5;
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath(); ctx.arc(mx, mz, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(mx, mz, r + 3, 0, Math.PI * 2); ctx.stroke();
    }
    // Traffic (white), police (red/blue), gang (orange).
    const dot = (x, z, color, size) => {
      const [px, pz] = toMap(x, z);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(px, pz, size, 0, Math.PI * 2); ctx.fill();
    };
    for (const car of game.traffic.cars) if (car !== game.player.inCar) dot(car.x, car.z, '#ffffff', 2);
    for (const cop of game.wanted.policeCars) dot(cop.x, cop.z, '#ff4444', 3);
    for (const g of game.gang) if (g.alive) dot(g.x, g.z, '#ff8c42', 2.5);
    // The player: a yellow arrow pointing where he faces.
    const [px, pz] = toMap(game.player.x, game.player.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-game.player.heading + Math.PI);
    ctx.fillStyle = '#ffd23e';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-5, 5);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
