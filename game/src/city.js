// Neon Bay itself: the ground, road grid, buildings with procedural facade
// textures, palms, boardwalk, beach and water, plus the sun, sky and clouds.
// Also owns the collision boxes and the road network the traffic drives on.
import * as THREE from 'three';
import { WORLD } from './config.js';

function facadeTexture(random, baseColor, floors) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = baseColor;
  g.fillRect(0, 0, 128, 256);
  // Window grid, some lit warm, some dark.
  const rows = Math.max(3, floors);
  for (let r = 0; r < rows; r += 1) {
    for (let col = 0; col < 4; col += 1) {
      const lit = random.chance(0.35);
      g.fillStyle = lit ? '#ffd98a' : (random.chance(0.5) ? '#1d2f45' : '#274b66');
      g.fillRect(10 + col * 30, 12 + r * (232 / rows), 18, 14);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2f7fc9');
  grad.addColorStop(0.45, '#7ec3ee');
  grad.addColorStop(0.72, '#ffd9a0');
  grad.addColorStop(1, '#ffb26b');
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function isOnRoad(x, z) {
  for (const r of WORLD.roadAt) {
    if (Math.abs(x - r) <= WORLD.roadHalf + 1.5) return true;
    if (Math.abs(z - r) <= WORLD.roadHalf + 1.5) return true;
  }
  return false;
}

export function nearestRoad(x, z) {
  let best = { axis: 'x', line: 0, dist: Infinity };
  for (const r of WORLD.roadAt) {
    const dx = Math.abs(x - r);
    const dz = Math.abs(z - r);
    if (dx < best.dist) best = { axis: 'x', line: r, dist: dx };
    if (dz < best.dist) best = { axis: 'z', line: r, dist: dz };
  }
  return best;
}

export function buildCity(scene, random) {
  const colliders = []; // {minX,maxX,minZ,maxZ}
  const buildings = []; // {x,z,w,d,h} for the minimap

  // Sky dome (gradient), sun and fog for the late-afternoon look.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);
  scene.fog = new THREE.Fog(0xf6c98f, 260, 720);

  const sun = new THREE.DirectionalLight(0xffe3b0, 2.6);
  sun.position.set(180, 260, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 800;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x9fd4ff, 0x8a6a4a, 0.9));

  // Ground: city slab, sand strip and animated water.
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x74856a, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.05, 0);
  ground.receiveShadow = true;
  scene.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 60),
    new THREE.MeshStandardMaterial({ color: 0xe8cf9a, roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.02, WORLD.beachZ + 18);
  sand.receiveShadow = true;
  scene.add(sand);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 400),
    new THREE.MeshStandardMaterial({ color: 0x1e7fa8, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.92 }),
  );
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.05, WORLD.waterZ + 180);
  scene.add(water);

  // Roads: dark asphalt strips with pale centre dashes.
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x2e3138, roughness: 0.95 });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8d2a8 });
  const L = WORLD.halfSize * 2 + 40;
  for (const r of WORLD.roadAt) {
    for (const [w, d, x, z] of [[L, WORLD.roadWidth, 0, r], [WORLD.roadWidth, L, r, 0]]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat);
      road.rotation.x = -Math.PI / 2; road.position.set(x, 0.03, z);
      road.receiveShadow = true;
      scene.add(road);
    }
    // Centre dashes along both directions.
    for (let t = -WORLD.halfSize; t < WORLD.halfSize; t += 12) {
      for (const [x, z, ry] of [[t, r, 0], [r, t, Math.PI / 2]]) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.5), dashMat);
        dash.rotation.x = -Math.PI / 2; dash.rotation.z = ry; dash.position.set(x, 0.06, z);
        scene.add(dash);
      }
    }
  }

  // Boardwalk planks along the beach.
  const walk = new THREE.Mesh(
    new THREE.PlaneGeometry(L, 10),
    new THREE.MeshStandardMaterial({ color: 0xa9805a, roughness: 1 }),
  );
  walk.rotation.x = -Math.PI / 2; walk.position.set(0, 0.04, WORLD.beachZ - 2);
  walk.receiveShadow = true;
  scene.add(walk);

  // Buildings: one or two per block, taller toward the centre, with lit windows.
  // Blocks sit BETWEEN the road lines: centres at -112.5, -37.5, 37.5, 112.5.
  const palette = ['#c96f4a', '#d9a441', '#7fa8c9', '#b06a8f', '#8fb573', '#a08fd0', '#e0d6c2', '#5f8f9e'];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  const roofGeo = new THREE.BoxGeometry(1, 0.6, 1);
  roofGeo.translate(0, 0.3, 0);
  for (let bi = 0; bi < 4; bi += 1) {
    for (let bj = 0; bj < 4; bj += 1) {
      // The Coral Hotel (bi 3, bj 1) and Marina Tower (bi 3, bj 3) blocks hold
      // the landmark towers instead of random buildings.
      if (bi === 3 && (bj === 1 || bj === 3)) continue;
      const cx = -112.5 + bi * 75;
      const cz = -112.5 + bj * 75;
      const count = random.chance(0.35) ? 2 : 1;
      for (let k = 0; k < count; k += 1) {
        const w = random.range(16, 26);
        const d = random.range(16, 26);
        const dist = Math.abs(cx) + Math.abs(cz);
        const h = random.range(9, 20) + Math.max(0, (220 - dist) / 220) * random.range(10, 46);
        const x = cx + (k === 0 ? -8 : 10) + random.range(-3, 3);
        const z = cz + (k === 0 ? -6 : 8) + random.range(-3, 3);
        const color = random.pick(palette);
        const mat = new THREE.MeshStandardMaterial({ map: facadeTexture(random, color, Math.round(h / 4)), roughness: 0.85 });
        const b = new THREE.Mesh(boxGeo, mat);
        b.scale.set(w, h, d);
        b.position.set(x, 0, z);
        b.castShadow = true; b.receiveShadow = true;
        scene.add(b);
        const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 1 }));
        roof.scale.set(w + 0.6, 1, d + 0.6);
        roof.position.set(x, h, z);
        scene.add(roof);
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        buildings.push({ x, z, w, d, h });
        // Rooftop beacon on the tallest towers.
        if (h > 42) {
          const beacon = new THREE.Mesh(
            new THREE.SphereGeometry(0.7, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xff4444 }),
          );
          beacon.position.set(x, h + 1.2, z);
          scene.add(beacon);
        }
      }
    }
  }

  // Landmark towers: the Coral Hotel (west) and the Marina Tower (east).
  function landmark(x, z, h, color, label) {
    const mat = new THREE.MeshStandardMaterial({ map: facadeTexture(random, color, Math.round(h / 3)), roughness: 0.8 });
    const t = new THREE.Mesh(boxGeo, mat);
    t.scale.set(30, h, 30);
    t.position.set(x, 0, z);
    t.castShadow = true;
    scene.add(t);
    colliders.push({ minX: x - 15, maxX: x + 15, minZ: z - 15, maxZ: z + 15 });
    buildings.push({ x, z, w: 30, d: 30, h });
    return t;
  }
  landmark(112, -38, 58, '#e8b64c', 'Coral Hotel');
  landmark(112, 112, 66, '#7fc9d9', 'Marina Tower');

  // Palm trees along the boardwalk and avenues.
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 6, 6);
  const frondGeo = new THREE.ConeGeometry(2.6, 2.2, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 1 });
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x2fae5f, roughness: 0.9 });
  function palm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 3; trunk.castShadow = true;
    const fronds = new THREE.Mesh(frondGeo, frondMat);
    fronds.position.y = 6.8; fronds.scale.y = 0.7; fronds.castShadow = true;
    g.add(trunk, fronds);
    g.position.set(x, 0, z);
    scene.add(g);
  }
  for (let x = -210; x <= 210; x += 18) palm(x + random.range(-2, 2), WORLD.beachZ - 10);
  for (let i = 0; i < 26; i += 1) {
    const r = random.pick(WORLD.roadAt);
    palm(r + random.pick([-11, 11]), random.range(-190, 150));
    palm(random.range(-190, 190), r + random.pick([-11, 11]));
  }

  // Clouds: flat white blobs drifting slowly.
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false });
  const clouds = [];
  for (let i = 0; i < 14; i += 1) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 3; j += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(random.range(6, 12), 8, 6), cloudMat);
      puff.position.set(j * 8 - 8, random.range(-1, 1), random.range(-3, 3));
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set(random.range(-400, 400), random.range(90, 150), random.range(-400, 400));
    scene.add(cloud);
    clouds.push(cloud);
  }

  // Street lamps at intersections.
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 7, 6);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x333a44, roughness: 0.6, metalness: 0.6 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const rx of WORLD.roadAt) {
    for (const rz of WORLD.roadAt) {
      const pole = new THREE.Mesh(poleGeo, lampMat);
      pole.position.set(rx + 9, 3.5, rz + 9);
      scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), bulbMat);
      bulb.position.set(rx + 9, 7.1, rz + 9);
      scene.add(bulb);
    }
  }

  return { colliders, buildings, water, clouds };
}

// Circle (player / car) vs building AABB: push the circle out, return the
// corrected position. Roads and beach are open, so only buildings block.
export function resolveCollisions(colliders, x, z, radius) {
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * radius;
        z = cz + (dz / d) * radius;
      } else {
        x = c.maxX + radius;
      }
    }
  }
  const H = WORLD.halfSize;
  x = Math.max(-H, Math.min(H, x));
  z = Math.max(-H, Math.min(H + 40, z));
  return { x, z };
}
