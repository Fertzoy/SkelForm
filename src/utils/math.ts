import { Vec2, HandlePreset } from '../types/skelform';

export function vec2(x: number = 0, y: number = 0): Vec2 {
  return { x, y };
}

export function addVec(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subVec(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scaleVec(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}

export function mulVec(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x * b.x, y: a.y * b.y };
}

export function divVec(a: Vec2, s: number): Vec2 {
  if (s === 0) return { x: 0, y: 0 };
  return { x: a.x / s, y: a.y / s };
}

export function vecMag(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function vecNormalize(v: Vec2): Vec2 {
  const m = vecMag(v);
  if (m === 0) return { x: 0, y: 0 };
  return { x: v.x / m, y: v.y / m };
}

export function vecDist(a: Vec2, b: Vec2): number {
  return vecMag(subVec(a, b));
}

export function rotateVec(p: Vec2, rad: number): Vec2 {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos,
  };
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

// Transform world coordinates to canvas pixel space
export function worldToScreen(
  worldPos: Vec2,
  cameraPos: Vec2,
  cameraZoom: number,
  canvasWidth: number,
  canvasHeight: number
): Vec2 {
  // Center is canvas center
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;
  return {
    x: cx + (worldPos.x - cameraPos.x) * cameraZoom,
    y: cy - (worldPos.y - cameraPos.y) * cameraZoom, // SkelForm Y is up positive
  };
}

// Transform canvas pixel coordinates to world space
export function screenToWorld(
  screenPos: Vec2,
  cameraPos: Vec2,
  cameraZoom: number,
  canvasWidth: number,
  canvasHeight: number
): Vec2 {
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;
  return {
    x: cameraPos.x + (screenPos.x - cx) / cameraZoom,
    y: cameraPos.y - (screenPos.y - cy) / cameraZoom,
  };
}

/**
 * Keyframe interpolation matching SkelForm's utils::interp
 */
export function interpolateValue(
  t: number,
  duration: number,
  startVal: number,
  endVal: number,
  preset: HandlePreset = 'Linear',
  startHandle?: Vec2,
  endHandle?: Vec2
): number {
  if (duration <= 0) return endVal;
  const progress = clamp(t / duration, 0, 1);

  switch (preset) {
    case 'Snap':
      return progress >= 1 ? endVal : startVal;
    case 'SineIn':
      return lerp(startVal, endVal, 1 - Math.cos((progress * Math.PI) / 2));
    case 'SineOut':
      return lerp(startVal, endVal, Math.sin((progress * Math.PI) / 2));
    case 'SineInOut':
      return lerp(startVal, endVal, -(Math.cos(Math.PI * progress) - 1) / 2);
    case 'Custom':
      if (startHandle && endHandle) {
        // Cubic bezier approximation
        const cp1x = clamp(startHandle.x, 0, 1);
        const cp1y = startHandle.y;
        const cp2x = clamp(endHandle.x, 0, 1);
        const cp2y = endHandle.y;
        const eased = cubicBezierProgress(progress, cp1x, cp1y, cp2x, cp2y);
        return lerp(startVal, endVal, eased);
      }
      return lerp(startVal, endVal, progress);
    case 'Linear':
    default:
      return lerp(startVal, endVal, progress);
  }
}

function cubicBezierProgress(t: number, p1x: number, p1y: number, p2x: number, p2y: number): number {
  // Approximate parametric cubic bezier with 10 iterations
  let low = 0;
  let high = 1;
  let s = t;
  for (let i = 0; i < 10; i++) {
    const x = 3 * (1 - s) * (1 - s) * s * p1x + 3 * (1 - s) * s * s * p2x + s * s * s;
    if (Math.abs(x - t) < 0.001) break;
    if (x < t) low = s;
    else high = s;
    s = (low + high) / 2;
  }
  return 3 * (1 - s) * (1 - s) * s * p1y + 3 * (1 - s) * s * s * p2y + s * s * s;
}

export interface Transform2D {
  x: number;
  y: number;
  rot: number; // radians
  scaleX: number;
  scaleY: number;
}

export function combineTransforms(parent: Transform2D, local: Transform2D): Transform2D {
  // local pos rotated and scaled by parent
  const rotatedPos = rotateVec(
    { x: local.x * parent.scaleX, y: local.y * parent.scaleY },
    parent.rot
  );

  return {
    x: parent.x + rotatedPos.x,
    y: parent.y + rotatedPos.y,
    rot: parent.rot + local.rot,
    scaleX: parent.scaleX * local.scaleX,
    scaleY: parent.scaleY * local.scaleY,
  };
}

export function transformPoint(p: Vec2, t: Transform2D): Vec2 {
  const scaled = { x: p.x * t.scaleX, y: p.y * t.scaleY };
  const rotated = rotateVec(scaled, t.rot);
  return { x: t.x + rotated.x, y: t.y + rotated.y };
}
