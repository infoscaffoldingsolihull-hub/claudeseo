/**
 * WebGL context, camera, HDR targets and the resize / context-loss policy.
 *
 * The scene renders into a half-float target so the sky, the sun and the
 * chandeliers can carry values well above 1.0; tone mapping happens exactly
 * once, in the composite pass (see postfx.js), which is why
 * `renderer.toneMapping` is deliberately left at NoToneMapping here.  Doing it
 * in both places is the classic way to end up with a washed-out sky.
 */
import * as THREE from 'three';

/** Fullscreen triangle — cheaper than a quad and has no diagonal seam. */
export function fullscreenTriangle() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -1, -1, 0, 3, -1, 0, -1, 3, 0,
  ]), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
    0, 0, 2, 0, 0, 2,
  ]), 2));
  return geometry;
}

export function createView(canvas, tier) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // MSAA is done on the HDR target instead
    alpha: false,
    stencil: false,
    depth: true,
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: false,
    preserveDrawingBuffer: false,
  });

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping; // applied once, in the composite
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = tier.softShadow ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = true;
  renderer.setClearColor(0x000000, 1);

  const camera = new THREE.PerspectiveCamera(58, 1, 0.08, 900);
  camera.position.set(0, 1.68, -26);

  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy
    ? renderer.capabilities.getMaxAnisotropy()
    : 1;
  const isWebGL2 = !!renderer.capabilities.isWebGL2;
  const hdrType = isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType;

  let current = tier;
  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let sceneTarget = null;

  function makeSceneTarget(w, h) {
    const samples = isWebGL2 ? Math.min(current.msaa | 0, 4) : 0;
    const target = new THREE.WebGLRenderTarget(w, h, {
      type: hdrType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: true,
      stencilBuffer: false,
      samples,
    });
    target.texture.colorSpace = THREE.LinearSRGBColorSpace;
    return target;
  }

  const api = {
    renderer,
    camera,
    maxAnisotropy,
    isWebGL2,
    get tier() { return current; },
    get sceneTarget() { return sceneTarget; },
    get width() { return width; },
    get height() { return height; },
    get pixelRatio() { return pixelRatio; },
    /** Drawing-buffer size, which is what the post targets must match. */
    get bufferWidth() { return Math.max(1, Math.round(width * pixelRatio)); },
    get bufferHeight() { return Math.max(1, Math.round(height * pixelRatio)); },

    setSize(w, h) {
      width = Math.max(1, Math.floor(w));
      height = Math.max(1, Math.floor(h));
      const devicePR = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
      pixelRatio = Math.max(0.5, Math.min(devicePR, current.pixelRatio));
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const bw = api.bufferWidth;
      const bh = api.bufferHeight;
      if (sceneTarget) sceneTarget.dispose();
      sceneTarget = makeSceneTarget(bw, bh);
      return { width: bw, height: bh };
    },

    setTier(next) {
      current = next;
      renderer.shadowMap.type = next.softShadow ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      renderer.shadowMap.needsUpdate = true;
      return api.setSize(width, height);
    },

    dispose() {
      if (sceneTarget) sceneTarget.dispose();
      sceneTarget = null;
      renderer.dispose();
    },
  };

  return api;
}

/**
 * Fit a directional light's shadow camera to the visible frustum slice.
 *
 * The fit is to the bounding *sphere* of the slice rather than its box,
 * because a sphere is rotation invariant: turning the camera cannot change
 * the fit, so the shadow edges do not crawl.  The centre is then snapped to
 * the shadow map's own texel grid, which removes the last of the shimmer when
 * the player walks.
 */
export function fitShadowCamera(light, camera, distance, mapSize) {
  const cam = light.shadow.camera;
  const near = camera.near;
  const far = Math.min(camera.far, distance);

  // Corners of the frustum slice, in world space.
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  const aspect = camera.aspect;
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const right = new THREE.Vector3().crossVectors(forward, up).normalize();
  const origin = camera.getWorldPosition(new THREE.Vector3());

  const centreNear = origin.clone().addScaledVector(forward, near);
  const centreFar = origin.clone().addScaledVector(forward, far);
  const hNear = tan * near;
  const wNear = hNear * aspect;
  const hFar = tan * far;
  const wFar = hFar * aspect;

  const corners = [];
  for (const [c, w, h] of [[centreNear, wNear, hNear], [centreFar, wFar, hFar]]) {
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        corners.push(c.clone().addScaledVector(right, sx * w).addScaledVector(up, sy * h));
      }
    }
  }

  const centre = new THREE.Vector3();
  for (const c of corners) centre.add(c);
  centre.multiplyScalar(1 / corners.length);
  let radius = 0;
  for (const c of corners) radius = Math.max(radius, c.distanceTo(centre));
  radius = Math.ceil(radius * 16) / 16;

  const lightDir = light.position.clone().sub(light.target.position).normalize();
  if (lightDir.lengthSq() < 1e-8) lightDir.set(0, 1, 0);

  // Snap the centre to the shadow map's texel grid in the light's own basis.
  const texelSize = (radius * 2) / Math.max(1, mapSize);
  const lookAt = new THREE.Matrix4().lookAt(lightDir, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
  const basis = new THREE.Matrix4().copy(lookAt);
  const inv = new THREE.Matrix4().copy(basis).invert();
  const local = centre.clone().applyMatrix4(inv);
  local.x = Math.floor(local.x / texelSize) * texelSize;
  local.y = Math.floor(local.y / texelSize) * texelSize;
  centre.copy(local).applyMatrix4(basis);

  const depth = Math.max(60, radius * 4);
  light.position.copy(centre).addScaledVector(lightDir, depth * 0.5);
  light.target.position.copy(centre);
  light.target.updateMatrixWorld();

  cam.left = -radius;
  cam.right = radius;
  cam.top = radius;
  cam.bottom = -radius;
  cam.near = 0.5;
  cam.far = depth + radius;
  cam.updateProjectionMatrix();
  light.shadow.bias = -0.0009 - radius * 0.000018;
  light.shadow.normalBias = Math.max(0.02, radius * 0.006);
}
