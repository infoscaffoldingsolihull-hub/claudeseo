import * as THREE from 'three';

const HALF_PI = Math.PI / 2;
const UP = new THREE.Vector3(0, 1, 0);

/**
 * First-person walker used by Archaeologist mode and by interior exploration.
 * Gravity, capsule collision, stair stepping, crouch, sprint and head-bob are
 * all handled here; the world only has to answer "what is solid".
 */
export class FirstPersonController {
  constructor(camera, input) {
    this.camera = camera;
    this.input = input;
    this.position = new THREE.Vector3(0, 2, 0);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.eyeHeight = 1.72;
    this.crouchHeight = 1.05;
    this.radius = 0.42;
    this.walkSpeed = 3.4;
    this.runSpeed = 8.5;
    this.crouchSpeed = 1.5;
    this.jumpSpeed = 6.0;
    this.gravity = -19.6;
    this.grounded = false;
    this.crouching = false;
    this.forcedCrouch = false;
    this.height = 1.72;
    this.sensitivity = 0.0021;
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.stepDistance = 0;
    this.onFootstep = null;
    this.flying = false;
    this.enabled = true;
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._desired = new THREE.Vector3();
  }

  teleport(x, y, z, yaw = this.yaw, pitch = 0) {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = pitch;
    this.grounded = false;
  }

  update(dt, collision) {
    if (!this.enabled) return;
    const look = this.input.consumeLook();
    this.yaw -= look.x * this.sensitivity;
    this.pitch -= look.y * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -HALF_PI + 0.02, HALF_PI - 0.02);

    const axes = this.input.axes();
    const sprint = this.input.isDown('ShiftLeft', 'ShiftRight');
    const wantsCrouch = this.input.isDown('ControlLeft', 'ControlRight', 'KeyC');

    // Auto-crouch: the pyramid's passages are 1.20 m high, so a standing
    // visitor simply cannot pass. Duck automatically when there is no headroom,
    // and stand up again the moment there is.
    const feet = this.position.y - this.height;
    this.forcedCrouch =
      !wantsCrouch && !!collision && collision.isSolid(this.position.x, feet + this.eyeHeight + 0.06, this.position.z);
    this.crouching = wantsCrouch || this.forcedCrouch;
    const targetHeight = this.crouching ? this.crouchHeight : this.eyeHeight;
    if (targetHeight !== this.height) {
      this.height = targetHeight;
      this.position.y = feet + this.height;
    }
    const speed = this.crouching ? this.crouchSpeed : sprint ? this.runSpeed : this.walkSpeed;

    this._forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this._right.crossVectors(this._forward, UP).normalize();

    this._desired
      .set(0, 0, 0)
      .addScaledVector(this._forward, -axes.y)
      .addScaledVector(this._right, axes.x);
    if (this._desired.lengthSq() > 1e-6) this._desired.normalize().multiplyScalar(speed);

    if (this.flying) {
      let vy = 0;
      if (this.input.isDown('Space')) vy += speed;
      if (this.input.isDown('KeyQ')) vy -= speed;
      this.velocity.set(this._desired.x, vy, this._desired.z);
    } else {
      const accel = this.grounded ? 14 : 4;
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, this._desired.x, accel, dt);
      this.velocity.z = THREE.MathUtils.damp(this.velocity.z, this._desired.z, accel, dt);
      this.velocity.y += this.gravity * dt;
      if (this.grounded && this.input.isDown('Space')) {
        this.velocity.y = this.jumpSpeed;
        this.grounded = false;
      }
    }

    const height = this.height;
    const step = this._desired.set(this.velocity.x * dt, this.velocity.y * dt, this.velocity.z * dt);

    if (collision) {
      const result = collision.move(this.position, step, this.radius, height, this.flying);
      this.grounded = result.grounded;
      if (result.hitCeiling && this.velocity.y > 0) this.velocity.y = 0;
      if (result.grounded && this.velocity.y < 0) this.velocity.y = 0;
    } else {
      this.position.add(step);
      this.grounded = this.position.y <= height;
      if (this.grounded) {
        this.position.y = height;
        this.velocity.y = 0;
      }
    }

    // Head bob, driven by distance travelled rather than time.
    const planar = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.grounded && planar > 0.4) {
      this.stepDistance += planar * dt;
      this.bobPhase += (planar / (sprint ? 2.1 : 1.5)) * dt * 6.5;
      this.bobAmount = THREE.MathUtils.damp(this.bobAmount, this.crouching ? 0.02 : sprint ? 0.075 : 0.045, 8, dt);
      const stride = sprint ? 2.35 : 1.55;
      if (this.stepDistance > stride) {
        this.stepDistance = 0;
        if (this.onFootstep) this.onFootstep(this.position, sprint);
      }
    } else {
      this.bobAmount = THREE.MathUtils.damp(this.bobAmount, 0, 8, dt);
    }

    const bobY = Math.sin(this.bobPhase * 2) * this.bobAmount;
    const bobX = Math.cos(this.bobPhase) * this.bobAmount * 0.6;
    this.camera.position.set(this.position.x + bobX * 0.35, this.position.y + bobY, this.position.z);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);
    this.camera.rotateZ(bobX * 0.09);
  }
}

/** Orbit / inspect camera for Project Manager mode. */
export class OrbitController {
  constructor(camera, input) {
    this.camera = camera;
    this.input = input;
    this.target = new THREE.Vector3(0, 40, 0);
    this._targetGoal = this.target.clone();
    this.distance = 520;
    this._distanceGoal = 520;
    this.minDistance = 24;
    this.maxDistance = 3200;
    this.theta = Math.PI * 0.72;
    this.phi = Math.PI * 0.34;
    this._thetaGoal = this.theta;
    this._phiGoal = this.phi;
    this.minPhi = 0.08;
    this.maxPhi = Math.PI * 0.495;
    this.enabled = true;
    this.autoRotate = false;
    this.autoRotateSpeed = 0.045;
    this._offset = new THREE.Vector3();
    this._panX = new THREE.Vector3();
    this._panZ = new THREE.Vector3();
  }

  frame(center, distance, phi = this.phi, theta = this.theta) {
    this._targetGoal.copy(center);
    this._distanceGoal = THREE.MathUtils.clamp(distance, this.minDistance, this.maxDistance);
    this._phiGoal = THREE.MathUtils.clamp(phi, this.minPhi, this.maxPhi);
    this._thetaGoal = theta;
  }

  snap() {
    this.target.copy(this._targetGoal);
    this.distance = this._distanceGoal;
    this.phi = this._phiGoal;
    this.theta = this._thetaGoal;
  }

  update(dt, collision) {
    if (!this.enabled) return;
    const look = this.input.consumeLook();
    const dragging = this.input.buttons.has(0) || this.input.touch.active;
    const panning = this.input.buttons.has(2) || this.input.buttons.has(1);

    if (panning) {
      const scale = this.distance * 0.0016;
      this._panX.set(Math.cos(this.theta), 0, -Math.sin(this.theta));
      this._panZ.set(Math.sin(this.theta), 0, Math.cos(this.theta));
      this._targetGoal.addScaledVector(this._panX, -look.x * scale);
      this._targetGoal.addScaledVector(this._panZ, -look.y * scale);
    } else if (dragging) {
      this._thetaGoal -= look.x * 0.0042;
      this._phiGoal = THREE.MathUtils.clamp(this._phiGoal - look.y * 0.0042, this.minPhi, this.maxPhi);
    }

    const wheel = this.input.consumeWheel();
    if (wheel) {
      this._distanceGoal = THREE.MathUtils.clamp(
        this._distanceGoal * (1 + wheel * 0.13),
        this.minDistance,
        this.maxDistance
      );
    }

    const axes = this.input.axes();
    if (axes.x || axes.y) {
      const scale = this.distance * 0.55 * dt;
      this._panX.set(Math.cos(this.theta), 0, -Math.sin(this.theta));
      this._panZ.set(Math.sin(this.theta), 0, Math.cos(this.theta));
      this._targetGoal.addScaledVector(this._panX, axes.x * scale);
      this._targetGoal.addScaledVector(this._panZ, axes.y * scale);
    }
    if (this.input.isDown('KeyQ')) this._distanceGoal = Math.min(this.maxDistance, this._distanceGoal * (1 + dt));
    if (this.input.isDown('KeyE')) this._distanceGoal = Math.max(this.minDistance, this._distanceGoal * (1 - dt));
    if (this.autoRotate && !dragging) this._thetaGoal += this.autoRotateSpeed * dt;

    this.theta = THREE.MathUtils.damp(this.theta, this._thetaGoal, 9, dt);
    this.phi = THREE.MathUtils.damp(this.phi, this._phiGoal, 9, dt);
    this.distance = THREE.MathUtils.damp(this.distance, this._distanceGoal, 7, dt);
    this.target.x = THREE.MathUtils.damp(this.target.x, this._targetGoal.x, 8, dt);
    this.target.y = THREE.MathUtils.damp(this.target.y, this._targetGoal.y, 8, dt);
    this.target.z = THREE.MathUtils.damp(this.target.z, this._targetGoal.z, 8, dt);

    const sinPhi = Math.sin(this.phi);
    this._offset.set(
      sinPhi * Math.sin(this.theta),
      Math.cos(this.phi),
      sinPhi * Math.cos(this.theta)
    ).multiplyScalar(this.distance);

    this.camera.position.copy(this.target).add(this._offset);
    if (collision) {
      const floor = collision.groundAt(this.camera.position.x, this.camera.position.z) + 3.5;
      if (this.camera.position.y < floor) this.camera.position.y = floor;
    }
    this.camera.lookAt(this.target);
  }
}

/** Cinematic 6-DOF drone with inertia, roll and an optional automatic orbit. */
export class DroneController {
  constructor(camera, input) {
    this.camera = camera;
    this.input = input;
    this.position = new THREE.Vector3(0, 180, 520);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = -0.18;
    this.roll = 0;
    this.speed = 34;
    this.boost = 4.2;
    this.sensitivity = 0.0019;
    this.enabled = true;
    this.auto = false;
    this.autoCenter = new THREE.Vector3(0, 70, 0);
    this.autoRadius = 460;
    this.autoHeight = 210;
    this.autoAngle = 0;
    this.autoSpeed = 0.055;
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._desired = new THREE.Vector3();
  }

  setAutoOrbit(center, radius, height, speed = 0.055) {
    this.auto = true;
    this.autoCenter.copy(center);
    this.autoRadius = radius;
    this.autoHeight = height;
    this.autoSpeed = speed;
    this.autoAngle = Math.atan2(this.position.z - center.z, this.position.x - center.x);
  }

  update(dt) {
    if (!this.enabled) return;
    const look = this.input.consumeLook();
    if (look.x || look.y) this.auto = false;

    if (this.auto) {
      this.autoAngle += this.autoSpeed * dt;
      const x = this.autoCenter.x + Math.cos(this.autoAngle) * this.autoRadius;
      const z = this.autoCenter.z + Math.sin(this.autoAngle) * this.autoRadius;
      const y = this.autoCenter.y + this.autoHeight;
      this.position.set(
        THREE.MathUtils.damp(this.position.x, x, 2.2, dt),
        THREE.MathUtils.damp(this.position.y, y, 2.2, dt),
        THREE.MathUtils.damp(this.position.z, z, 2.2, dt)
      );
      this.camera.position.copy(this.position);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(this.autoCenter);
      this.roll = THREE.MathUtils.damp(this.roll, -0.05, 3, dt);
      this.camera.rotateZ(this.roll);
      const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
      this.yaw = e.y;
      this.pitch = e.x;
      return;
    }

    this.yaw -= look.x * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch - look.y * this.sensitivity, -HALF_PI + 0.03, HALF_PI - 0.03);

    const axes = this.input.axes();
    const fast = this.input.isDown('ShiftLeft', 'ShiftRight') ? this.boost : 1;
    const slow = this.input.isDown('AltLeft', 'AltRight') ? 0.22 : 1;
    const speed = this.speed * fast * slow;

    this._forward.set(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    this._right.crossVectors(this._forward, UP).normalize();

    this._desired
      .set(0, 0, 0)
      .addScaledVector(this._forward, -axes.y)
      .addScaledVector(this._right, axes.x);
    if (this.input.isDown('Space')) this._desired.y += 1;
    if (this.input.isDown('KeyQ')) this._desired.y -= 1;
    if (this._desired.lengthSq() > 1e-6) this._desired.normalize().multiplyScalar(speed);

    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, this._desired.x, 3.4, dt);
    this.velocity.y = THREE.MathUtils.damp(this.velocity.y, this._desired.y, 3.4, dt);
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, this._desired.z, 3.4, dt);
    this.position.addScaledVector(this.velocity, dt);
    this.position.y = Math.max(this.position.y, 1.5);

    const bank = THREE.MathUtils.clamp(-axes.x * 0.28 - look.x * 0.0015, -0.45, 0.45);
    this.roll = THREE.MathUtils.damp(this.roll, bank, 4, dt);

    this.camera.position.copy(this.position);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);
    this.camera.rotateZ(this.roll);
  }
}

const EASINGS = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
};

/**
 * Keyframe camera player used by Tour Guide (presentation) mode and by the
 * "fly to" transitions between points of interest.
 */
export class CinematicPlayer {
  constructor(camera) {
    this.camera = camera;
    this.keyframes = [];
    this.index = -1;
    this.time = 0;
    this.playing = false;
    this.paused = false;
    this.onBeat = null;
    this.onComplete = null;
    this._fromPos = new THREE.Vector3();
    this._fromLook = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._currentLook = new THREE.Vector3();
  }

  play(keyframes, { startPosition = null, startLook = null } = {}) {
    this.keyframes = keyframes;
    this.index = -1;
    this.time = 0;
    this.playing = keyframes.length > 0;
    this.paused = false;
    this._currentLook.copy(startLook || this._currentLook);
    if (startPosition) this.camera.position.copy(startPosition);
    this._advance();
  }

  stop() {
    this.playing = false;
    this.keyframes = [];
    this.index = -1;
  }

  next() {
    if (!this.playing) return;
    this.time = this.keyframes[this.index] ? this.keyframes[this.index].duration : 0;
  }

  previous() {
    if (!this.playing || this.index <= 0) return;
    this.index -= 2;
    this.time = 0;
    this._advance();
  }

  _advance() {
    this._fromPos.copy(this.camera.position);
    this._fromLook.copy(this._currentLook);
    this.index++;
    this.time = 0;
    if (this.index >= this.keyframes.length) {
      this.playing = false;
      if (this.onComplete) this.onComplete();
      return;
    }
    if (this.onBeat) this.onBeat(this.keyframes[this.index], this.index);
  }

  update(dt) {
    if (!this.playing || this.paused) return false;
    const kf = this.keyframes[this.index];
    if (!kf) return false;
    this.time += dt;
    const t = Math.min(1, kf.duration > 0 ? this.time / kf.duration : 1);
    const ease = EASINGS[kf.ease || 'inOut'](t);

    this._pos.copy(this._fromPos).lerp(kf.position, ease);
    this._look.copy(this._fromLook).lerp(kf.lookAt, ease);
    if (kf.arc) {
      // Lift the path so long transitions sweep over the plateau rather than through it.
      this._pos.y += Math.sin(ease * Math.PI) * kf.arc;
    }
    this.camera.position.copy(this._pos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this._look);
    if (kf.roll) this.camera.rotateZ(Math.sin(ease * Math.PI) * kf.roll);
    this._currentLook.copy(this._look);

    if (t >= 1) this._advance();
    return true;
  }
}
