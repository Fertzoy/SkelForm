import { Bone, JointConstraint, Vec2 } from '../types/skelform';
import { addVec, subVec, vecDist, vecNormalize, scaleVec, rotateVec } from './math';

/**
 * Solve FABRIK for a chain of bones reaching for targetPos.
 * Positions are in world space.
 */
export function solveFABRIK(
  points: Vec2[],
  lengths: number[],
  targetPos: Vec2,
  constraint: JointConstraint = 'None',
  iterations: number = 10,
  tolerance: number = 0.5
): Vec2[] {
  const n = points.length;
  if (n < 2) return points;

  const totalLength = lengths.reduce((acc, l) => acc + l, 0);
  const rootPos = { ...points[0] };
  const distToTarget = vecDist(rootPos, targetPos);

  // If target is unreachable, stretch straight towards target
  if (distToTarget >= totalLength) {
    const dir = vecNormalize(subVec(targetPos, rootPos));
    const result = [{ ...rootPos }];
    for (let i = 0; i < n - 1; i++) {
      result.push(addVec(result[i], scaleVec(dir, lengths[i])));
    }
    return result;
  }

  // Target is reachable: apply iterative backward-forward reaching
  const currentPoints = points.map(p => ({ ...p }));

  for (let iter = 0; iter < iterations; iter++) {
    // Check if end reached target
    if (vecDist(currentPoints[n - 1], targetPos) < tolerance) {
      break;
    }

    // STAGE 1: BACKWARD REACH (from end to root)
    currentPoints[n - 1] = { ...targetPos };
    for (let i = n - 2; i >= 0; i--) {
      const dir = vecNormalize(subVec(currentPoints[i], currentPoints[i + 1]));
      currentPoints[i] = addVec(currentPoints[i + 1], scaleVec(dir, lengths[i]));
    }

    // STAGE 2: FORWARD REACH (from root to end)
    currentPoints[0] = { ...rootPos };
    for (let i = 0; i < n - 1; i++) {
      const dir = vecNormalize(subVec(currentPoints[i + 1], currentPoints[i]));
      currentPoints[i + 1] = addVec(currentPoints[i], scaleVec(dir, lengths[i]));
    }

    // Apply constraints on 3-point joints (e.g. knee/elbow in Clockwise or CCW)
    if (constraint === 'Clockwise' || constraint === 'CounterClockwise') {
      applyJointConstraint(currentPoints, constraint);
    }
  }

  return currentPoints;
}

function applyJointConstraint(points: Vec2[], constraint: JointConstraint) {
  if (points.length < 3) return;

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    // Vector from prev to next
    const base = subVec(next, prev);
    // Vector from prev to curr
    const toCurr = subVec(curr, prev);

    // Cross product in 2D indicates which side curr is relative to base
    const cross = base.x * toCurr.y - base.y * toCurr.x;

    const shouldBeCW = constraint === 'Clockwise';
    const isCW = cross < 0;

    if (shouldBeCW !== isCW) {
      // Reflect curr across base line
      const baseLen = vecDist(prev, next);
      if (baseLen > 0.001) {
        const u = vecNormalize(base);
        const normal = { x: -u.y, y: u.x }; // perpendicular
        const projLen = toCurr.x * u.x + toCurr.y * u.y;
        const perpDist = toCurr.x * normal.x + toCurr.y * normal.y;
        // Flip perpendicular component
        points[i] = {
          x: prev.x + u.x * projLen - normal.x * perpDist,
          y: prev.y + u.y * projLen - normal.y * perpDist,
        };
      }
    }
  }
}
