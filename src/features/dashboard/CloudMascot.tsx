import { useEffect, useRef } from "react";
import {
  AmbientLight,
  CircleGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Scene,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
  CatmullRomCurve3
} from "three";

function createCloudGeometry() {
  const shape = new Shape();
  shape.moveTo(-1.05, -0.28);
  shape.bezierCurveTo(-1.2, -0.15, -1.17, 0.2, -1, 0.3);
  shape.bezierCurveTo(-1.05, 0.72, -0.8, 0.88, -0.53, 0.8);
  shape.bezierCurveTo(-0.4, 1.22, 0.4, 1.22, 0.53, 0.8);
  shape.bezierCurveTo(0.8, 0.88, 1.05, 0.72, 1, 0.3);
  shape.bezierCurveTo(1.17, 0.2, 1.2, -0.15, 1.05, -0.28);
  shape.bezierCurveTo(0.6, -0.5, -0.6, -0.5, -1.05, -0.28);
  shape.closePath();

  const geometry = new ExtrudeGeometry(shape, {
    bevelEnabled: true,
    bevelSegments: 8,
    bevelSize: 0.12,
    bevelThickness: 0.11,
    curveSegments: 24,
    depth: 0.62,
    steps: 2
  });
  geometry.center();
  return geometry;
}

function createMouth(material: MeshBasicMaterial) {
  const points = [
    new Vector3(-0.16, 0.01, 0),
    new Vector3(-0.1, -0.08, 0),
    new Vector3(0, -0.12, 0),
    new Vector3(0.1, -0.08, 0),
    new Vector3(0.16, 0.01, 0)
  ];
  const curve = new CatmullRomCurve3(points);
  const tubeGeometry = new TubeGeometry(curve, 20, 0.034, 12, false);
  const capGeometry = new SphereGeometry(0.034, 20, 12);
  const mouth = new Group();
  mouth.add(new Mesh(tubeGeometry, material));
  for (const point of [points[0], points.at(-1)!]) {
    const cap = new Mesh(capGeometry, material);
    cap.position.copy(point);
    mouth.add(cap);
  }
  mouth.position.set(0, -0.12, 0.48);
  mouth.renderOrder = 2;
  return { group: mouth, tubeGeometry, capGeometry };
}

export function CloudMascot() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new Scene();
    scene.background = null;
    const camera = new PerspectiveCamera(28, 1, 0.1, 100);
    camera.position.set(0, 0.05, 5.2);

    const renderer = new WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.setClearColor(new Color("#ffffff"), 0);
    renderer.domElement.setAttribute("aria-hidden", "true");
    mount.appendChild(renderer.domElement);

    const keyLight = new DirectionalLight("#fff7e9", 3.8);
    keyLight.position.set(-2.5, 3.5, 4);
    scene.add(keyLight);
    const fillLight = new DirectionalLight("#8dbbff", 1.4);
    fillLight.position.set(3, -0.5, 2);
    scene.add(fillLight);
    scene.add(new AmbientLight("#b4c8e8", 1.2));

    const cloudMaterial = new MeshPhysicalMaterial({
      color: "#f9fbff",
      roughness: 0.42,
      metalness: 0,
      clearcoat: 0.35,
      clearcoatRoughness: 0.28
    });
    const faceMaterial = new MeshBasicMaterial({
      color: "#08090b",
      depthTest: false,
      depthWrite: false,
      side: DoubleSide
    });

    const mascot = new Group();
    mascot.position.y = -0.12;
    scene.add(mascot);

    const cloudGeometry = createCloudGeometry();
    const cloud = new Mesh(cloudGeometry, cloudMaterial);
    cloud.scale.set(0.82, 0.76, 0.82);
    mascot.add(cloud);

    const eyeGeometry = new CircleGeometry(0.105, 32);
    const eyeLeft = new Mesh(eyeGeometry, faceMaterial);
    const eyeRight = new Mesh(eyeGeometry, faceMaterial);
    eyeLeft.position.set(-0.28, 0.08, 0.48);
    eyeRight.position.set(0.28, 0.08, 0.48);
    eyeLeft.renderOrder = 2;
    eyeRight.renderOrder = 2;
    mascot.add(eyeLeft, eyeRight);

    const mouth = createMouth(faceMaterial);
    mascot.add(mouth.group);

    let animationFrame = 0;
    const startedAt = performance.now();
    let nextBlink = startedAt + 3200;
    let blinkStarted = 0;
    let isBlinking = false;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const { width, height } = mount.getBoundingClientRect();
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const animate = (now: number) => {
      eyeLeft.position.z = 0.48;
      eyeRight.position.z = 0.48;

      if (!reduceMotion && !isBlinking && now >= nextBlink) {
        isBlinking = true;
        blinkStarted = now;
      }
      if (isBlinking) {
        const blinkProgress = (now - blinkStarted) / 170;
        const blinkScale = blinkProgress < 0.5 ? 1 - blinkProgress * 2 : (blinkProgress - 0.5) * 2;
        eyeLeft.scale.y = Math.max(blinkScale, 0.08);
        eyeRight.scale.y = Math.max(blinkScale, 0.08);
        if (blinkProgress >= 1) {
          isBlinking = false;
          nextBlink = now + 3000 + Math.random() * 3200;
        }
      } else {
        eyeLeft.scale.y = 1;
        eyeRight.scale.y = 1;
      }

      mascot.position.y = -0.12 + (reduceMotion ? 0 : Math.sin(now * 0.0013) * 0.018);
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      renderer.dispose();
      cloudMaterial.dispose();
      faceMaterial.dispose();
      eyeGeometry.dispose();
      cloudGeometry.dispose();
      mouth.tubeGeometry.dispose();
      mouth.capGeometry.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="cloud-mascot" role="img" aria-label="Nuvem 3D do Cloudy" />;
}
