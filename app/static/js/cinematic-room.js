import * as THREE from "three";

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;
  uniform sampler2D uScene;
  uniform vec2 uResolution;
  uniform vec2 uTextureSize;
  uniform vec2 uPointer;
  uniform float uTime;
  uniform float uMotion;
  uniform float uMobile;
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float softBox(vec2 p, vec2 low, vec2 high, float feather) {
    vec2 a = smoothstep(low, low + feather, p);
    vec2 b = 1.0 - smoothstep(high - feather, high, p);
    return a.x * a.y * b.x * b.y;
  }

  void main() {
    float screenAspect = uResolution.x / max(uResolution.y, 1.0);
    float imageAspect = uTextureSize.x / max(uTextureSize.y, 1.0);
    vec2 cover = vec2(1.0);
    if (screenAspect > imageAspect) cover.y = imageAspect / screenAspect;
    else cover.x = screenAspect / imageAspect;

    vec2 center = vec2(mix(0.5, 0.715, uMobile), 0.5);
    vec2 uv = (vUv - 0.5) * cover + center;
    float windowMask = softBox(uv, vec2(0.36, 0.11), vec2(0.965, 0.92), 0.035);
    float skyMask = softBox(uv, vec2(0.38, 0.39), vec2(0.96, 0.91), 0.07);
    float curtainMask = smoothstep(0.875, 0.985, uv.x) * smoothstep(0.06, 0.9, uv.y);

    vec2 parallax = uPointer * vec2(0.0065, 0.0045) * uMotion;
    uv += parallax * mix(0.38, 1.0, windowMask);
    uv.x += sin(uTime * 0.23 + uv.y * 8.0) * 0.0011 * curtainMask * uMotion;

    vec2 personCenter = vec2(0.755, 0.33);
    float personInfluence = exp(-distance(uv, personCenter) * 19.0);
    uv.y += sin(uTime * 0.72) * 0.00075 * personInfluence * uMotion;

    vec3 color = texture2D(uScene, clamp(uv, 0.001, 0.999)).rgb;
    vec2 cloudUv = uv + vec2(uTime * 0.00016, 0.0) * uMotion;
    vec3 cloudLayer = texture2D(uScene, clamp(cloudUv, 0.001, 0.999)).rgb;
    color = mix(color, cloudLayer, skyMask * 0.055 * uMotion);

    float sheenCenter = 0.53 + uPointer.x * 0.055 + sin(uTime * 0.09) * 0.018;
    float sheen = exp(-abs(uv.x - sheenCenter) * 92.0) * windowMask;
    color += vec3(0.17, 0.23, 0.29) * sheen * 0.14;

    float pointerLight = 1.0 - smoothstep(0.0, 0.34, distance(vUv, uPointer * 0.12 + vec2(0.68, 0.55)));
    color += vec3(0.045, 0.065, 0.08) * pointerLight * windowMask * uMotion;

    vec2 dustFlow = vUv + vec2(0.0, uTime * 0.0025 * uMotion);
    vec2 dustGrid = floor(dustFlow * vec2(90.0, 58.0));
    vec2 dustCell = fract(dustFlow * vec2(90.0, 58.0));
    float dustSeed = hash(dustGrid);
    float dust = step(0.989, dustSeed) * (1.0 - smoothstep(0.0, 0.12, distance(dustCell, vec2(dustSeed, fract(dustSeed * 7.1)))));
    color += vec3(0.28, 0.30, 0.27) * dust * windowMask * 0.42;

    float vignette = 1.0 - smoothstep(0.2, 0.94, distance(vUv, vec2(0.52, 0.52)));
    color *= mix(0.62, 1.0, vignette);
    float grain = hash(gl_FragCoord.xy + fract(uTime) * 731.0) - 0.5;
    color += grain * 0.016;
    gl_FragColor = vec4(color, 1.0);
  }
`;

function qualityProfile() {
  const memory = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const mobile = window.matchMedia("(max-width: 760px)").matches;
  const constrained = memory <= 4 || cores <= 4;
  return { mobile, pixelRatio: Math.min(window.devicePixelRatio || 1, mobile || constrained ? 1.25 : 1.75) };
}

export function createCinematicRoom(container, options = {}) {
  const profile = qualityProfile();
  const renderer = new THREE.WebGLRenderer({ alpha: false, antialias: !profile.mobile, powerPreference: "high-performance" });
  renderer.setPixelRatio(profile.pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = "cinematic-room-canvas";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const pointerTarget = new THREE.Vector2();
  const pointerCurrent = new THREE.Vector2();
  const clock = new THREE.Clock();
  let resizeObserver = null;
  let disposed = false;
  let visible = !document.hidden;

  const uniforms = {
    uScene: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTextureSize: { value: new THREE.Vector2(1672, 941) },
    uPointer: { value: pointerCurrent },
    uTime: { value: 0 },
    uMotion: { value: options.reducedMotion ? 0 : 1 },
    uMobile: { value: profile.mobile ? 1 : 0 },
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false });
  const geometry = new THREE.PlaneGeometry(2, 2);
  scene.add(new THREE.Mesh(geometry, material));

  const textureLoader = new THREE.TextureLoader();
  textureLoader.load(options.imageUrl, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    uniforms.uScene.value = texture;
    uniforms.uTextureSize.value.set(texture.image.width, texture.image.height);
    options.onReady?.();
  }, undefined, () => {
    dispose();
    options.onReady?.();
  });

  function resize() {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    renderer.setSize(width, height, false);
    uniforms.uResolution.value.set(width * profile.pixelRatio, height * profile.pixelRatio);
    uniforms.uMobile.value = width <= 760 ? 1 : 0;
  }

  function handlePointer(event) {
    const bounds = container.getBoundingClientRect();
    pointerTarget.set(
      THREE.MathUtils.clamp((event.clientX - bounds.left) / bounds.width - 0.5, -0.5, 0.5),
      THREE.MathUtils.clamp(0.5 - (event.clientY - bounds.top) / bounds.height, -0.5, 0.5),
    );
  }

  function resetPointer() {
    pointerTarget.set(0, 0);
  }

  function render() {
    if (disposed || !visible || !uniforms.uScene.value) return;
    uniforms.uTime.value = clock.getElapsedTime();
    pointerCurrent.lerp(pointerTarget, options.reducedMotion ? 1 : 0.035);
    renderer.render(scene, camera);
  }

  function handleVisibility() {
    visible = !document.hidden;
    renderer.setAnimationLoop(visible ? render : null);
    if (visible) clock.start();
  }

  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();
  container.addEventListener("pointermove", handlePointer, { passive: true });
  container.addEventListener("pointerleave", resetPointer);
  document.addEventListener("visibilitychange", handleVisibility);
  renderer.setAnimationLoop(render);

  function dispose() {
    if (disposed) return;
    disposed = true;
    renderer.setAnimationLoop(null);
    resizeObserver?.disconnect();
    container.removeEventListener("pointermove", handlePointer);
    container.removeEventListener("pointerleave", resetPointer);
    document.removeEventListener("visibilitychange", handleVisibility);
    uniforms.uScene.value?.dispose();
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return { dispose };
}
