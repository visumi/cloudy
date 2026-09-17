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
  PointLight,
  Scene,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
  CatmullRomCurve3
} from "three";

type CloudMascotVariant = "default" | "rainy" | "night";

interface CloudMascotProps {
  variant?: CloudMascotVariant;
  onRefresh: () => void | Promise<void>;
  refreshing?: boolean;
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

function createMouth(material: MeshBasicMaterial, expression: "happy" | "sad" | "sleepy") {
  const points = expression === "sleepy"
    ? [
        new Vector3(-0.17, -0.06, 0),
        new Vector3(-0.085, -0.025, 0),
        new Vector3(0, -0.06, 0),
        new Vector3(0.085, -0.095, 0),
        new Vector3(0.17, -0.06, 0)
      ]
    : expression === "sad"
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

export function CloudMascot({ variant = "default", onRefresh, refreshing = false }: CloudMascotProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const hitAreaRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    const hitArea = hitAreaRef.current;
    if (!mount || !hitArea) return;

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
    const character = new Group();
    mascot.add(character);

    const moonGeometry = variant === "night" ? new SphereGeometry(0.46, 48, 32) : null;
    const moonMaterial = variant === "night"
      ? new MeshPhysicalMaterial({
          color: "#f8e8a6",
          roughness: 0.68,
          metalness: 0,
          clearcoat: 0.18,
          clearcoatRoughness: 0.5,
          emissive: "#c99d3d",
          emissiveIntensity: 0.13
        })
      : null;
    const moonCraterGeometry = variant === "night" ? new CircleGeometry(1, 24) : null;
    const moonCraterMaterial = variant === "night"
      ? new MeshBasicMaterial({ color: "#b68f35", transparent: true, opacity: 0.32 })
      : null;
    if (moonGeometry && moonMaterial) {
      const moon = new Mesh(moonGeometry, moonMaterial);
      moon.position.set(0.68, 0.68, -0.34);
      mascot.add(moon);

      if (moonCraterGeometry && moonCraterMaterial) {
        for (const crater of [
          { x: 0.73, y: 1.01, radius: 0.052 },
          { x: 0.96, y: 0.83, radius: 0.042 }
        ]) {
          const craterMesh = new Mesh(moonCraterGeometry, moonCraterMaterial);
          craterMesh.position.set(crater.x, crater.y, 0.13);
          craterMesh.scale.setScalar(crater.radius);
          mascot.add(craterMesh);
        }
      }

      const moonLight = new PointLight("#ffe9a8", 0.48, 3.4, 2);
      moonLight.position.set(0.76, 0.84, -0.08);
      mascot.add(moonLight);
    }

    const cloudGeometry = createCloudGeometry();
    const cloud = new Mesh(cloudGeometry, cloudMaterial);
    const cloudBaseScale = new Vector3(0.82, 0.76, 0.82);
    cloud.scale.copy(cloudBaseScale);
    character.add(cloud);

    const eyeRadius = 0.105;
    const sleepyEyeTilt = 0.16;
    const eyeGeometry = variant === "night"
      ? new CircleGeometry(eyeRadius, 32, Math.PI, Math.PI).translate(0, eyeRadius, 0)
      : new CircleGeometry(eyeRadius, 32);
    const eyeLeft = new Mesh(eyeGeometry, faceMaterial);
    const eyeRight = new Mesh(eyeGeometry, faceMaterial);
    if (variant === "night") {
      const pivotOffsetX = Math.sin(sleepyEyeTilt) * eyeRadius;
      const pivotOffsetY = Math.cos(sleepyEyeTilt) * eyeRadius;
      eyeLeft.position.set(-0.28 + pivotOffsetX, 0.08 - pivotOffsetY, 0.48);
      eyeRight.position.set(0.28 - pivotOffsetX, 0.08 - pivotOffsetY, 0.48);
      eyeLeft.rotation.z = sleepyEyeTilt;
      eyeRight.rotation.z = -sleepyEyeTilt;
    } else {
      eyeLeft.position.set(-0.28, 0.08, 0.48);
      eyeRight.position.set(0.28, 0.08, 0.48);
    }
    eyeLeft.renderOrder = 2;
    eyeRight.renderOrder = 2;
    character.add(eyeLeft, eyeRight);
    const eyeLeftBase = eyeLeft.position.clone();
    const eyeRightBase = eyeRight.position.clone();

    const mouth = createMouth(
      faceMaterial,
      variant === "night" ? "sleepy" : variant === "rainy" ? "sad" : "happy"
    );
    character.add(mouth.group);

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
          character.add(mesh);
          return { ...drop, mesh, material };
        })
      : [];

    let animationFrame = 0;
    const startedAt = performance.now();
    let nextBlink = startedAt + 3200;
    let blinkStarted = 0;
    let isBlinking = false;
    let hoverTarget = 0;
    let hoverCurrent = 0;
    let pointerTargetX = 0;
    let pointerTargetY = 0;
    let pointerCurrentX = 0;
    let pointerCurrentY = 0;
    let reactionStartedAt = Number.NEGATIVE_INFINITY;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const onPointerMove = (event: PointerEvent) => {
      if (reduceMotion || event.pointerType === "touch") return;
      pointerTargetX = Math.max(-1, Math.min(1, (event.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2));
      pointerTargetY = Math.max(-1, Math.min(1, -(event.clientY / Math.max(window.innerHeight, 1) - 0.5) * 2));
    };
    const onPointerEnter = (event: PointerEvent) => {
      if (event.pointerType !== "touch") hoverTarget = 1;
    };
    const onPointerLeave = () => {
      hoverTarget = 0;
    };
    const onWindowBlur = () => {
      pointerTargetX = 0;
      pointerTargetY = 0;
    };
    const onFocus = () => { hoverTarget = 1; };
    const onBlur = () => onPointerLeave();
    const onClick = () => { reactionStartedAt = performance.now(); };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("blur", onWindowBlur);
    hitArea.addEventListener("pointerenter", onPointerEnter, { passive: true });
    hitArea.addEventListener("pointerleave", onPointerLeave);
    hitArea.addEventListener("focus", onFocus);
    hitArea.addEventListener("blur", onBlur);
    hitArea.addEventListener("click", onClick);

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
      const trackingEase = variant === "rainy" ? 0.055 : variant === "night" ? 0.07 : 0.1;
      const trackingRange = variant === "rainy" ? 0.72 : variant === "night" ? 0.5 : 1;
      if (reduceMotion) {
        hoverCurrent = hoverTarget;
        pointerCurrentX = 0;
        pointerCurrentY = 0;
      } else {
        hoverCurrent += (hoverTarget - hoverCurrent) * 0.1;
        pointerCurrentX += (pointerTargetX - pointerCurrentX) * trackingEase;
        pointerCurrentY += (pointerTargetY - pointerCurrentY) * trackingEase;
      }

      eyeLeft.position.set(
        eyeLeftBase.x + pointerCurrentX * 0.045 * trackingRange,
        eyeLeftBase.y + pointerCurrentY * 0.035 * trackingRange,
        0.48
      );
      eyeRight.position.set(
        eyeRightBase.x + pointerCurrentX * 0.045 * trackingRange,
        eyeRightBase.y + pointerCurrentY * 0.035 * trackingRange,
        0.48
      );

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

      let reactionLift = 0;
      let reactionTilt = 0;
      let reactionScale = 1;
      if (!reduceMotion) {
        const reactionProgress = (now - reactionStartedAt) / 460;
        if (reactionProgress >= 0 && reactionProgress <= 1) {
          const variantStrength = variant === "rainy" ? 0.78 : variant === "night" ? 0.62 : 1;
          reactionLift = Math.sin(reactionProgress * Math.PI) * 0.17 * variantStrength;
          reactionTilt = Math.sin(reactionProgress * Math.PI * 2) * (1 - reactionProgress) * 0.045 * variantStrength;
          reactionScale = 1 + Math.sin(reactionProgress * Math.PI) * 0.025 * variantStrength;
        }
      }

      const hoverScale = 1 + hoverCurrent * 0.03;
      character.scale.setScalar(hoverScale * reactionScale);
      character.position.y = reactionLift;
      character.rotation.z = reactionTilt;
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
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("blur", onWindowBlur);
      hitArea.removeEventListener("pointerenter", onPointerEnter);
      hitArea.removeEventListener("pointerleave", onPointerLeave);
      hitArea.removeEventListener("focus", onFocus);
      hitArea.removeEventListener("blur", onBlur);
      hitArea.removeEventListener("click", onClick);
      renderer.dispose();
      cloudMaterial.dispose();
      faceMaterial.dispose();
      raindrops.forEach(({ material }) => material.dispose());
      raindropGeometry?.dispose();
      moonGeometry?.dispose();
      moonMaterial?.dispose();
      moonCraterGeometry?.dispose();
      moonCraterMaterial?.dispose();
      eyeGeometry.dispose();
      cloudGeometry.dispose();
      mouth.tubeGeometry.dispose();
      mouth.capGeometry.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [variant]);

  const label = variant === "rainy"
    ? "Nuvem 3D chuvosa do Cloudy"
    : variant === "night"
      ? "Nuvem 3D sonolenta do Cloudy com a lua ao fundo"
      : "Nuvem 3D do Cloudy";

  return (
    <div ref={mountRef} className={`cloud-mascot cloud-mascot--${variant} cloud-mascot--ready`}>
      <button
        ref={hitAreaRef}
        className="cloud-mascot-hit-area"
        type="button"
        aria-label="Atualizar itens da plataforma"
        aria-busy={refreshing}
        aria-disabled={refreshing}
        title={`${label}. Clique para atualizar os itens.`}
        onClick={() => { if (!refreshing) void onRefresh(); }}
      />
    </div>
  );
}
