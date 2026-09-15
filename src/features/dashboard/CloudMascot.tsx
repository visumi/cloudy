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

type CloudMascotVariant = "default" | "rainy";

interface CloudMascotProps {
  variant?: CloudMascotVariant;
}

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

function createMouth(material: MeshBasicMaterial, expression: "happy" | "sad") {
  const points = expression === "sad"
    ? [
        new Vector3(-0.16, -0.1, 0),
        new Vector3(-0.1, -0.02, 0),
        new Vector3(0, 0.025, 0),
        new Vector3(0.1, -0.02, 0),
        new Vector3(0.16, -0.1, 0)
      ]
    : [
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

function createRaindropGeometry() {
  const shape = new Shape();
  shape.moveTo(0, 0.22);
  shape.bezierCurveTo(-0.012, 0.16, -0.032, 0.05, -0.032, -0.08);
  shape.bezierCurveTo(-0.032, -0.2, -0.014, -0.27, 0, -0.29);
  shape.bezierCurveTo(0.014, -0.27, 0.032, -0.2, 0.032, -0.08);
  shape.bezierCurveTo(0.032, 0.05, 0.012, 0.16, 0, 0.22);
  shape.closePath();

  const geometry = new ExtrudeGeometry(shape, {
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.009,
    bevelThickness: 0.009,
    curveSegments: 12,
    depth: 0.045,
    steps: 1
  });
  geometry.center();
  return geometry;
}

export function CloudMascot({ variant = "default" }: CloudMascotProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new Scene();
    scene.background = null;
    const camera = new PerspectiveCamera(28, 1, 0.1, 100);
    camera.position.set(0, variant === "rainy" ? -0.24 : 0.05, 5.2);

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
      color: variant === "rainy" ? "#e7f1f7" : "#f9fbff",
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

    const mouth = createMouth(faceMaterial, variant === "rainy" ? "sad" : "happy");
    mascot.add(mouth.group);

    const raindropGeometry = variant === "rainy" ? createRaindropGeometry() : null;
    const raindrops = variant === "rainy" && raindropGeometry
      ? [
          { x: -0.78, delay: 0.04, speed: 1.08, width: 0.78, length: 0.72, opacity: 0.58 },
          { x: -0.64, delay: 0.61, speed: 0.94, width: 0.9, length: 0.9, opacity: 0.72 },
          { x: -0.49, delay: 0.29, speed: 1.12, width: 0.7, length: 0.62, opacity: 0.54 },
          { x: -0.35, delay: 0.82, speed: 1.02, width: 0.86, length: 0.8, opacity: 0.68 },
          { x: -0.2, delay: 0.46, speed: 0.9, width: 0.74, length: 1, opacity: 0.76 },
          { x: -0.07, delay: 0.12, speed: 1.16, width: 0.82, length: 0.7, opacity: 0.6 },
          { x: 0.08, delay: 0.72, speed: 0.98, width: 0.76, length: 0.88, opacity: 0.7 },
          { x: 0.23, delay: 0.37, speed: 1.1, width: 0.88, length: 0.66, opacity: 0.62 },
          { x: 0.37, delay: 0.92, speed: 0.92, width: 0.72, length: 0.94, opacity: 0.74 },
          { x: 0.51, delay: 0.2, speed: 1.04, width: 0.84, length: 0.76, opacity: 0.64 },
          { x: 0.65, delay: 0.54, speed: 1.14, width: 0.7, length: 0.86, opacity: 0.7 },
          { x: 0.79, delay: 0.76, speed: 0.96, width: 0.8, length: 0.64, opacity: 0.56 }
        ].map((drop) => {
          const material = new MeshPhysicalMaterial({
            color: "#80d2f3",
            roughness: 0.3,
            metalness: 0,
            clearcoat: 0.62,
            clearcoatRoughness: 0.22,
            transparent: true,
            opacity: drop.opacity
          });
          const mesh = new Mesh(raindropGeometry, material);
          mesh.position.set(drop.x, -0.64, 0.12);
          mesh.scale.set(drop.width, drop.length, 0.8);
          mascot.add(mesh);
          return { ...drop, mesh, material };
        })
      : [];

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
      for (const drop of raindrops) {
        if (reduceMotion) {
          drop.mesh.position.y = -0.58 - drop.delay * 0.38;
          drop.material.opacity = drop.opacity;
          continue;
        }

        const progress = ((now * 0.00072 * drop.speed + drop.delay) % 1);
        drop.mesh.position.y = -0.54 - progress * 0.48;
        drop.material.opacity = Math.pow(Math.sin(progress * Math.PI), 0.7) * drop.opacity;
      }
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
      raindrops.forEach(({ material }) => material.dispose());
      raindropGeometry?.dispose();
      eyeGeometry.dispose();
      cloudGeometry.dispose();
      mouth.tubeGeometry.dispose();
      mouth.capGeometry.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [variant]);

  return <div ref={mountRef} className={`cloud-mascot cloud-mascot--${variant} cloud-mascot--ready`} role="img" aria-label={variant === "rainy" ? "Nuvem 3D chuvosa do Cloudy" : "Nuvem 3D do Cloudy"} />;
}
