// Rendering only: the WebGL renderer, the chase camera that follows the
// player (on foot or in a car), and the resize handling. No game rules here.
import * as THREE from 'three';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  // Chase camera state: distance and height ease toward the mode's values,
  // and the yaw follows the player's heading so W always means "ahead".
  const cam = { yaw: Math.PI, dist: 10, height: 5, lookY: 1.6 };

  function updateCamera(dt, player) {
    const driving = !!player.inCar;
    const targetDist = driving ? 13.5 : 9.5;
    const targetHeight = driving ? 5.5 : 4.6;
    cam.dist += (targetDist - cam.dist) * Math.min(1, 3 * dt);
    cam.height += (targetHeight - cam.height) * Math.min(1, 3 * dt);
    let dh = player.heading - cam.yaw;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    cam.yaw += dh * Math.min(1, 4.5 * dt);
    const px = player.x;
    const pz = player.z;
    const py = player.y || 0;
    const cx = px - Math.sin(cam.yaw) * cam.dist;
    const cz = pz - Math.cos(cam.yaw) * cam.dist;
    camera.position.set(cx, py + cam.height, cz);
    camera.lookAt(px + Math.sin(cam.yaw) * 4, py + cam.lookY, pz + Math.cos(cam.yaw) * 4);
  }

  function render() { renderer.render(scene, camera); }

  return { renderer, scene, camera, updateCamera, render, resize };
}
