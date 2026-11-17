// Missions: Vega's three jobs, each a short chain of stages with a glowing
// marker in the world, objective text on the HUD, and a cash reward at the
// end. The marker is a beacon column the player can see across the city.
import * as THREE from 'three';
import { MISSIONS } from './config.js';

export class MissionManager {
  constructor(scene) {
    this.scene = scene;
    this.index = 0;           // which mission is active
    this.stage = 0;           // which stage of it
    this.kills = 0;           // kills in the current eliminate stage
    this.done = false;        // all missions finished
    this.marker = this._buildMarker();
    this.marker.visible = false;
    scene.add(this.marker);
    this._flash = 0;
  }

  _buildMarker() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3.4, 4.6, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.0, 2.6, 70, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 35;
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(1.3, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
    );
    core.position.y = 1.2;
    g.add(ring, beam, core);
    g.userData.ring = ring;
    return g;
  }

  get mission() { return MISSIONS[this.index] || null; }
  get stageDef() { const m = this.mission; return m ? m.stages[this.stage] : null; }

  objectiveText() {
    if (this.done) return 'All Vega\'s jobs done — Neon Bay is yours. Grab cash drops, steal cars, stay free.';
    const s = this.stageDef;
    if (!s) return '';
    if (s.kind === 'eliminate') return s.text.replace('(0/5)', `(${this.kills}/${s.count})`);
    return s.text;
  }

  // The world position the marker (and minimap) should point at, or null.
  markerPos() {
    const s = this.stageDef;
    if (!s || !s.pos) return null;
    return { x: s.pos[0], z: s.pos[1] };
  }

  // Returns an event string when something happens: 'stage' | 'mission' | 'all-done' | null.
  step(dt, game) {
    this._flash += dt;
    if (this.marker.visible) {
      const s = 1 + Math.sin(this._flash * 3) * 0.12;
      this.marker.scale.set(s, 1, s);
      this.marker.rotation.y += dt * 0.8;
    }
    if (this.done) { this.marker.visible = false; return null; }
    const s = this.stageDef;
    if (!s) return null;
    const pos = game.player.pos;
    if (s.kind === 'goto') {
      const mp = { x: s.pos[0], z: s.pos[1] };
      this.marker.visible = true;
      this.marker.position.set(mp.x, 0, mp.z);
      const d = Math.hypot(pos.x - mp.x, pos.z - mp.z);
      if (d < s.radius) return this._advance(game);
    } else if (s.kind === 'steal') {
      this.marker.visible = false;
      if (game.player.inCar) return this._advance(game);
    } else if (s.kind === 'eliminate') {
      const mp = { x: s.pos?.[0] ?? 150, z: s.pos?.[1] ?? -150 };
      this.marker.visible = true;
      this.marker.position.set(mp.x, 0, mp.z);
      if (this.kills >= s.count) return this._advance(game);
    }
    return null;
  }

  _advance(game) {
    const m = this.mission;
    this.stage += 1;
    if (this.stage >= m.stages.length) {
      game.cash += m.reward;
      game.onMissionComplete?.(m);
      this.index += 1;
      this.stage = 0;
      this.kills = 0;
      if (this.index >= MISSIONS.length) {
        this.done = true;
        this.marker.visible = false;
        return 'all-done';
      }
      game.onMissionStart?.(MISSIONS[this.index]);
      return 'mission';
    }
    // Heat scripted into mission 2's pickup.
    const next = this.stageDef;
    if (m.heatOnPickup && this.stage === 1) game.wanted.addStars(m.heatOnPickup);
    return 'stage';
  }

  // Called by the game when the player downs a gang member during the
  // eliminate stage.
  registerKill() {
    const s = this.stageDef;
    if (s && s.kind === 'eliminate') this.kills += 1;
  }

  reset() {
    this.index = 0; this.stage = 0; this.kills = 0; this.done = false;
  }
}
