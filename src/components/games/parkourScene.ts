// Bostie Parkour: the 3D run. One obstacle at a time; each one opens a question window of
// exactly ASK_SECONDS during which the world slows right down but never stops. The page
// owns the questions and buttons; this module owns the simulation and the picture.
import * as THREE from "three";

export const ASK_SECONDS = 6;
const SPEED = 15; // metres a second at full run
const TRIGGER = 17; // an obstacle this far ahead opens its question
const HIT = 1.0; // closer than this without a move is a collision
const SPAN = 98; // scenery repeats over this length

export type RunCallbacks = {
  /** Obstacle `index` (0-based) is close: show its question. */
  onAsk: (index: number) => void;
  /** Seconds left to answer, sent every frame while a question is open. */
  onTick: (remaining: number) => void;
  /** Time ran out: counts as a wrong answer. */
  onTimeout: () => void;
  onCleared: (cleared: number) => void;
  onEnd: (won: boolean, cleared: number) => void;
};
export type Run = { answer: (correct: boolean) => void; dispose: () => void };

const mat = (color: number) => new THREE.MeshLambertMaterial({ color });
const box = (w: number, h: number, d: number, color: number) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

/** Bostie in simple shapes: black and white coat, pink ears, yellow bandana. Faces -z, the way he runs. */
function buildBostie() {
  const dog = new THREE.Group();
  const BLACK = 0x1c1c1f, WHITE = 0xf6f2e8, PINK = 0xf2a0b5, GOLD = 0xf0b429;
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), mat(BLACK));
  body.scale.set(0.95, 0.9, 1.45);
  dog.add(at(body, 0, 0.95, 0.1));
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), mat(WHITE));
  chest.scale.set(0.9, 1, 0.8);
  dog.add(at(chest, 0, 0.88, -0.52));
  const head = new THREE.Group();
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.46, 16, 12), mat(BLACK)));
  const blaze = box(0.2, 0.5, 0.5, WHITE);
  head.add(at(blaze, 0, 0.12, -0.24));
  head.add(at(box(0.42, 0.26, 0.3, WHITE), 0, -0.14, -0.4)); // muzzle
  head.add(at(box(0.14, 0.1, 0.08, BLACK), 0, -0.05, -0.56)); // nose
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.46, 4), mat(BLACK));
    head.add(at(ear, side * 0.27, 0.52, 0.02));
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 4), mat(PINK));
    head.add(at(inner, side * 0.27, 0.5, -0.07));
    head.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), mat(WHITE)), side * 0.2, 0.08, -0.4)); // eyes
    head.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), mat(BLACK)), side * 0.2, 0.08, -0.46));
  }
  dog.add(at(head, 0, 1.55, -0.72));
  const bandana = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.11, 8, 16), mat(GOLD));
  bandana.rotation.x = Math.PI / 2.4;
  dog.add(at(bandana, 0, 1.2, -0.5));
  const legs: THREE.Group[] = [];
  for (const [x, z] of [[-0.3, -0.42], [0.3, -0.42], [-0.3, 0.6], [0.3, 0.6]]) {
    const leg = new THREE.Group();
    leg.add(at(box(0.2, 0.5, 0.2, BLACK), 0, -0.25, 0));
    leg.add(at(box(0.22, 0.2, 0.26, WHITE), 0, -0.58, -0.02)); // white socks
    dog.add(at(leg, x, 0.72, z));
    legs.push(leg);
  }
  dog.add(at(box(0.12, 0.12, 0.22, BLACK), 0, 1.15, 0.9)); // stubby tail
  const stars = new THREE.Group();
  for (let i = 0; i < 3; i++) stars.add(at(new THREE.Mesh(new THREE.OctahedronGeometry(0.13), mat(GOLD)), Math.cos((i * 2 * Math.PI) / 3) * 0.5, 0, Math.sin((i * 2 * Math.PI) / 3) * 0.5));
  stars.visible = false;
  dog.add(at(stars, 0, 2.35, -0.6));
  return { dog, head, legs, stars };
}

type Obstacle = { mesh: THREE.Group; move: "jump" | "dodge" };
/** The hazards on the road. Low ones are jumped; the parked car is too tall, so Bostie swerves. */
function buildObstacle(kind: number): Obstacle {
  const g = new THREE.Group();
  switch (kind % 5) {
    case 0: { // rock
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.85), mat(0x8a8f96));
      rock.scale.set(1.3, 0.8, 1);
      g.add(at(rock, 0, 0.6, 0));
      return { mesh: g, move: "jump" };
    }
    case 1: { // traffic barrier
      for (let i = 0; i < 4; i++) g.add(at(box(0.75, 0.5, 0.3, i % 2 ? 0xffffff : 0xf26b1d), -1.125 + i * 0.75, 0.95, 0));
      g.add(at(box(0.16, 1.2, 0.5, 0x444a50), -1.3, 0.6, 0), at(box(0.16, 1.2, 0.5, 0x444a50), 1.3, 0.6, 0));
      return { mesh: g, move: "jump" };
    }
    case 2: { // parked car
      g.add(at(box(2.1, 0.75, 4, 0xe2a11b), 0, 0.75, 0), at(box(1.8, 0.7, 2.1, 0xf3d27a), 0, 1.45, 0.1));
      for (const [x, z] of [[-1, -1.3], [1, -1.3], [-1, 1.3], [1, 1.3]]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12), mat(0x222222));
        wheel.rotation.z = Math.PI / 2;
        g.add(at(wheel, x, 0.38, z));
      }
      return { mesh: g, move: "dodge" };
    }
    case 3: { // traffic cones
      for (const x of [-0.9, 0, 0.9]) {
        g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.95, 12), mat(0xf26b1d)), x, 0.5, 0));
        g.add(at(box(0.7, 0.08, 0.7, 0x222222), x, 0.04, 0));
      }
      return { mesh: g, move: "jump" };
    }
    default: { // tea chests, straight off the ship
      g.add(at(box(1.1, 0.9, 1.1, 0x9a6a3a), -0.6, 0.45, 0), at(box(1.1, 0.9, 1.1, 0x86572c), 0.6, 0.45, 0.1), at(box(1, 0.8, 1, 0xa87a48), 0, 1.3, 0));
      return { mesh: g, move: "jump" };
    }
  }
}

/** Boston along the road: brick rows, the gold-domed State House, a sign on stilts, a cable bridge, trees. */
function buildScenery(low: boolean) {
  const items: THREE.Object3D[] = [];
  const BRICK = [0xb5523b, 0x8a3b2c, 0xc9a27e, 0x6f7f8f, 0xa64b3c, 0xd9c3a1];
  const step = low ? 14 : 7;
  for (let z = 0, n = 0; z < SPAN; z += step, n++) {
    for (const side of [-1, 1]) {
      const g = new THREE.Group();
      const slot = (n + (side > 0 ? 3 : 0)) % 7;
      if (slot === 2) { // State House
        g.add(at(box(5.5, 3.2, 4, 0xb5523b), 0, 1.6, 0), at(box(3, 0.9, 3, 0xf6f2e8), 0, 3.65, 0));
        const dome = new THREE.Mesh(new THREE.SphereGeometry(1.25, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xf0b429, emissive: 0x6b4a00 }));
        g.add(at(dome, 0, 4.1, 0));
      } else if (slot === 5) { // a big sign on stilts
        g.add(at(box(0.25, 5, 0.25, 0x555a60), -1.2, 2.5, 0), at(box(0.25, 5, 0.25, 0x555a60), 1.2, 2.5, 0), at(box(4, 3, 0.3, 0xffffff), 0, 6.2, 0));
        const tri = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.8, 3), mat(0xda291c));
        tri.rotation.y = Math.PI / 6;
        g.add(at(tri, 0, 6.3, -side * 0.3));
      } else if (slot === 0 && !low) { // cable-stayed bridge tower
        const a = box(0.5, 9, 0.5, 0xe8e8ea), b = box(0.5, 9, 0.5, 0xe8e8ea);
        a.rotation.z = 0.16;
        b.rotation.z = -0.16;
        g.add(at(a, -0.75, 4.5, 0), at(b, 0.75, 4.5, 0), at(box(0.7, 3, 0.6, 0xe8e8ea), 0, 10, 0));
      } else {
        const h = 3 + ((n * 7 + (side > 0 ? 3 : 0)) % 5) * 1.3;
        g.add(at(box(5, h, 4.5, BRICK[(n + (side > 0 ? 2 : 0)) % BRICK.length]), 0, h / 2, 0));
        if (!low) for (let w = 0; w < 3; w++) g.add(at(box(0.1, 0.9, 0.7, 0xfff3c4), -side * 2.52, Math.min(h - 1, 2.2), -1.5 + w * 1.5)); // lit windows facing the road
      }
      items.push(at(g, side * 11, 0, -z));
      if (!low) {
        const tree = new THREE.Group();
        tree.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 1.2, 6), mat(0x6b4a2b)), 0, 0.6, 0), at(new THREE.Mesh(new THREE.SphereGeometry(0.85, 8, 6), mat(0x2f8f4e)), 0, 1.8, 0));
        items.push(at(tree, side * 6.6, 0, -z - 3.5));
      }
    }
    items.push(at(box(0.3, 0.02, 2.4, 0xfff3c4), 0, 0.02, -z)); // centre line dashes
    if (!(n % 2)) items.push(at(box(0.3, 0.02, 2.4, 0xfff3c4), 0, 0.02, -z - step / 2));
  }
  return items;
}

export function startRun(canvas: HTMLCanvasElement, opts: { obstacles: number; low: boolean; still: boolean } & RunCallbacks): Run {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.low, powerPreference: opts.low ? "low-power" : "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.low ? 1 : 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd3f5);
  scene.fog = new THREE.Fog(0x9fd3f5, 45, 95);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8fa58a, 1.15));
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.3);
  sun.position.set(6, 12, 8);
  scene.add(sun);

  scene.add(at(box(60, 0.1, 260, 0x7fbf6a), 0, -0.06, -90)); // grass
  scene.add(at(box(9, 0.1, 260, 0x3f454b), 0, -0.02, -90)); // road
  for (const side of [-1, 1]) scene.add(at(box(2.4, 0.16, 260, 0xcfd3d6), side * 5.7, 0.02, -90)); // sidewalks
  const scenery = buildScenery(opts.low);
  scene.add(...scenery);

  const { dog, head, legs, stars } = buildBostie();
  scene.add(dog);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 140);
  const resize = () => {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  let phase: "run" | "ask" | "pass" | "crash" | "down" | "won" = "run";
  let index = 0; // obstacle being approached
  let cleared = 0;
  let dist = TRIGGER + SPEED * 1.6; // metres to the obstacle
  let slow = 0;
  let askT = 0, endT = 0, runT = 0, moveT = -1;
  let ended = false;
  let obstacle = buildObstacle(0);
  scene.add(obstacle.mesh);

  const fail = (timeout: boolean) => {
    phase = "crash";
    if (timeout) opts.onTimeout();
  };

  let last = performance.now();
  let raf = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    // Real elapsed time, so the six seconds are six seconds on any device. A long gap
    // (tab in the background) counts as a short one, which pauses the run and the clock.
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    let speed = SPEED;

    if (phase === "run") {
      dist -= SPEED * dt;
      if (dist <= TRIGGER) {
        phase = "ask";
        askT = 0;
        // Slow enough that the obstacle is still out of reach when the clock runs out.
        slow = (dist - HIT - 0.8) / (ASK_SECONDS + 0.3);
        opts.onAsk(index);
      }
    } else if (phase === "ask") {
      speed = slow;
      askT += dt;
      dist -= slow * dt;
      opts.onTick(Math.max(0, ASK_SECONDS - askT));
      if (askT >= ASK_SECONDS) fail(true);
    } else if (phase === "pass") {
      dist -= SPEED * dt;
      const startAt = obstacle.move === "jump" ? 4.6 : 7.5;
      if (moveT < 0 && dist <= startAt) moveT = 0;
      if (dist < -4.5) {
        cleared++;
        opts.onCleared(cleared);
        scene.remove(obstacle.mesh);
        moveT = -1;
        if (cleared >= opts.obstacles) {
          phase = "won";
          endT = 0;
        } else {
          index++;
          obstacle = buildObstacle(index);
          scene.add(obstacle.mesh);
          dist = TRIGGER + SPEED * 1.2;
          phase = "run";
        }
      }
    } else if (phase === "crash") {
      dist -= SPEED * dt;
      if (dist <= HIT) {
        phase = "down";
        endT = 0;
      }
    } else {
      endT += dt;
      speed = phase === "won" ? SPEED * Math.max(0, 1 - endT / 1.2) : 0;
      if (endT > (phase === "won" ? 2 : 1.6) && !ended) {
        ended = true;
        opts.onEnd(phase === "won", cleared);
      }
    }

    // The world slides past Bostie.
    const shift = speed * dt;
    for (const o of scenery) {
      o.position.z += shift;
      if (o.position.z > 14) o.position.z -= SPAN;
    }
    obstacle.mesh.position.set(0, 0, -dist);

    // Bostie.
    runT += dt * (speed / SPEED) * 11;
    let y = 0, x = 0, roll = 0, pitch = 0;
    if (moveT >= 0) moveT += dt;
    if (phase === "pass" && moveT >= 0) {
      if (obstacle.move === "jump") {
        const t = Math.min(1, moveT / 0.72);
        y = Math.sin(Math.PI * t) * 2.5;
        pitch = Math.sin(Math.PI * t) * -0.35;
      } else {
        const t = Math.min(1, moveT / 1.0);
        x = Math.sin(Math.PI * t) * 3.1;
        roll = Math.cos(Math.PI * t) * -0.3;
      }
    }
    if (phase === "won") {
      y = Math.abs(Math.sin(endT * 7)) * 1.2;
      dog.rotation.y = endT * 6;
    } else dog.rotation.y = 0;
    if (phase === "down") {
      const t = Math.min(1, endT / 0.35);
      roll = (t * Math.PI) / 2;
      y = 0.25 * t - 0.1;
      stars.visible = true;
      stars.rotation.y = endT * 5;
    }
    const bob = opts.still ? 0 : Math.abs(Math.sin(runT)) * 0.12 * (speed / SPEED);
    dog.position.set(x, y + bob, 0);
    dog.rotation.z = roll;
    dog.rotation.x = pitch;
    const stride = phase === "down" ? 0 : Math.sin(runT) * 0.9 * Math.min(1, speed / SPEED + 0.25);
    legs[0].rotation.x = stride;
    legs[3].rotation.x = stride;
    legs[1].rotation.x = -stride;
    legs[2].rotation.x = -stride;
    head.rotation.z = phase === "ask" ? Math.sin(now / 160) * 0.12 : 0; // looking about, worried

    camera.position.set(3.4 + x * 0.35, 3.6 + (opts.still ? 0 : bob * 0.5), 7.2);
    camera.lookAt(x * 0.5, 1.5, -6);
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  return {
    answer(correct) {
      if (phase !== "ask") return; // one answer per obstacle: later taps do nothing
      if (correct) phase = "pass";
      else fail(false);
    },
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      scene.add(obstacle.mesh);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
    },
  };
}
