import {
  Bone,
  Animation,
  AnimElement,
  Keyframe,
  Vec2,
  JointConstraint,
  InverseKinematicsMode,
} from '../types/skelform';
import {
  Transform2D,
  combineTransforms,
  interpolateValue,
  rotateVec,
  subVec,
  addVec,
  vecDist,
  vecNormalize,
  scaleVec,
} from './math';
import { solveFABRIK } from './ik';

export interface EvaluatedBone extends Bone {
  worldTransform: Transform2D;
  worldPos: Vec2;
  worldRot: number;
  worldScale: Vec2;
  isIkDriven?: boolean;
}

/**
 * Animate and evaluate bones at a specific frame, applying keyframes, IK, and hierarchy.
 */
export function evaluateArmature(
  baseBones: Bone[],
  currentAnim: Animation | null,
  frame: number,
  enableIk: boolean = true
): EvaluatedBone[] {
  // 1. Clone base bones and interpolate animated properties
  const bones: Bone[] = baseBones.map(b => ({
    ...b,
    pos: { ...b.pos },
    scale: { ...b.scale },
    tint: { ...b.tint },
    pivot_pos: { ...b.pivot_pos },
    pivot_scale: { ...b.pivot_scale },
  }));

  if (currentAnim && currentAnim.keyframes.length > 0 && frame >= 0) {
    for (const b of bones) {
      applyKeyframesToBone(b, currentAnim.keyframes, frame);
    }
  }

  // 2. Forward Kinematics: compute initial world transforms
  const boneMap = new Map<number, Bone>();
  bones.forEach(b => boneMap.set(b.id, b));

  const evaluated = new Map<number, EvaluatedBone>();

  function getTransform(boneId: number): EvaluatedBone {
    if (evaluated.has(boneId)) return evaluated.get(boneId)!;
    const b = boneMap.get(boneId);
    if (!b) {
      // Dummy root
      return {
        id: -1,
        name: 'Root',
        parent_id: -1,
        pos: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rot: 0,
        zindex: 0,
        tex: '',
        tint: { r: 1, g: 1, b: 1, a: 1 },
        pivot_pos: { x: 0, y: 0 },
        pivot_rot: 0,
        pivot_scale: { x: 1, y: 1 },
        ik_family_id: -1,
        ik_target_id: -1,
        ik_constraint: 'None',
        ik_mode: 'FABRIK',
        worldTransform: { x: 0, y: 0, rot: 0, scaleX: 1, scaleY: 1 },
        worldPos: { x: 0, y: 0 },
        worldRot: 0,
        worldScale: { x: 1, y: 1 },
      };
    }

    const localTransform: Transform2D = {
      x: b.pos.x,
      y: b.pos.y,
      rot: b.rot,
      scaleX: b.scale.x,
      scaleY: b.scale.y,
    };

    let worldTransform: Transform2D;
    if (b.parent_id === -1 || !boneMap.has(b.parent_id)) {
      worldTransform = localTransform;
    } else {
      const parentEval = getTransform(b.parent_id);
      worldTransform = combineTransforms(parentEval.worldTransform, localTransform);
    }

    const evalBone: EvaluatedBone = {
      ...b,
      worldTransform,
      worldPos: { x: worldTransform.x, y: worldTransform.y },
      worldRot: worldTransform.rot,
      worldScale: { x: worldTransform.scaleX, y: worldTransform.scaleY },
    };

    evaluated.set(boneId, evalBone);
    return evalBone;
  }

  bones.forEach(b => getTransform(b.id));

  // 3. Apply Inverse Kinematics (FABRIK)
  if (enableIk) {
    applyInverseKinematics(bones, evaluated, boneMap);
  }

  // Convert to ordered array matching original bones
  return bones.map(b => evaluated.get(b.id)!);
}

function applyKeyframesToBone(bone: Bone, keyframes: Keyframe[], frame: number) {
  const boneKfs = keyframes.filter(k => k.bone_id === bone.id);
  if (boneKfs.length === 0) return;

  const getElementValue = (elem: AnimElement, defaultVal: number): number => {
    const kfs = boneKfs.filter(k => k.element === elem).sort((a, b) => a.frame - b.frame);
    if (kfs.length === 0) return defaultVal;

    // Find keyframe exactly at or before
    let prevIdx = -1;
    let nextIdx = -1;

    for (let i = 0; i < kfs.length; i++) {
      if (kfs[i].frame <= frame) {
        prevIdx = i;
      }
      if (kfs[i].frame > frame && nextIdx === -1) {
        nextIdx = i;
      }
    }

    if (prevIdx === -1) return kfs[0].value ?? defaultVal;
    if (nextIdx === -1) return kfs[prevIdx].value ?? defaultVal;

    const prev = kfs[prevIdx];
    const next = kfs[nextIdx];
    const dur = next.frame - prev.frame;
    const t = frame - prev.frame;

    return interpolateValue(
      t,
      dur,
      prev.value ?? defaultVal,
      next.value ?? defaultVal,
      next.handle_preset || 'Linear',
      next.start_handle,
      next.end_handle
    );
  };

  const getElementString = (elem: AnimElement, defaultStr: string): string => {
    const kfs = boneKfs.filter(k => k.element === elem && k.frame <= frame).sort((a, b) => a.frame - b.frame);
    if (kfs.length === 0) return defaultStr;
    return kfs[kfs.length - 1].value_str ?? defaultStr;
  };

  bone.pos.x = getElementValue('PositionX', bone.pos.x);
  bone.pos.y = getElementValue('PositionY', bone.pos.y);
  bone.rot = getElementValue('Rotation', bone.rot);
  bone.scale.x = getElementValue('ScaleX', bone.scale.x);
  bone.scale.y = getElementValue('ScaleY', bone.scale.y);
  bone.tint.r = getElementValue('TintR', bone.tint.r);
  bone.tint.g = getElementValue('TintG', bone.tint.g);
  bone.tint.b = getElementValue('TintB', bone.tint.b);
  bone.tint.a = getElementValue('TintA', bone.tint.a);

  // Discrete properties
  const zKfs = boneKfs.filter(k => k.element === 'Zindex' && k.frame <= frame);
  if (zKfs.length > 0) bone.zindex = zKfs[zKfs.length - 1].value ?? bone.zindex;

  const hidKfs = boneKfs.filter(k => k.element === 'Hidden' && k.frame <= frame);
  if (hidKfs.length > 0) bone.hidden = (hidKfs[hidKfs.length - 1].value ?? 0) > 0.5;

  const ikConsKfs = boneKfs.filter(k => k.element === 'IkConstraint' && k.frame <= frame);
  if (ikConsKfs.length > 0) {
    bone.ik_constraint = (ikConsKfs[ikConsKfs.length - 1].value_str as JointConstraint) || bone.ik_constraint;
  }

  bone.tex = getElementString('Texture', bone.tex);
}

function applyInverseKinematics(
  bones: Bone[],
  evaluated: Map<number, EvaluatedBone>,
  boneMap: Map<number, Bone>
) {
  // Group bones by IK family
  const families = new Map<number, Bone[]>();
  bones.forEach(b => {
    if (b.ik_family_id !== -1) {
      if (!families.has(b.ik_family_id)) families.set(b.ik_family_id, []);
      families.get(b.ik_family_id)!.push(b);
    }
  });

  for (const [familyId, chainBones] of families.entries()) {
    if (chainBones.length < 2) continue;

    // Sort chain in hierarchy order (parent to child)
    chainBones.sort((a, b) => {
      let curr: Bone | undefined = b;
      while (curr && curr.parent_id !== -1) {
        if (curr.parent_id === a.id) return -1;
        curr = boneMap.get(curr.parent_id);
      }
      return 1;
    });

    const rootBone = chainBones[0];
    const targetId = rootBone.ik_target_id;
    if (targetId === -1 || !evaluated.has(targetId)) continue;

    const targetEval = evaluated.get(targetId)!;
    const targetPos = targetEval.worldPos;

    // Collect world points and lengths along chain
    const points: Vec2[] = chainBones.map(b => ({ ...evaluated.get(b.id)!.worldPos }));

    // Add end point (tip of the last bone)
    const endBone = chainBones[chainBones.length - 1];
    const endEval = evaluated.get(endBone.id)!;
    const endLength = Math.max(20, vecDist(endBone.pos, { x: 0, y: 0 }) || 40);
    const endTip = addVec(
      endEval.worldPos,
      rotateVec({ x: endLength * endEval.worldScale.x, y: 0 }, endEval.worldRot)
    );
    points.push(endTip);

    const lengths: number[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      lengths.push(Math.max(1, vecDist(points[i], points[i + 1])));
    }

    // Solve FABRIK
    const solvedPoints = solveFABRIK(
      points,
      lengths,
      targetPos,
      rootBone.ik_constraint,
      12,
      0.5
    );

    // Update evaluated world transforms for the chain
    for (let i = 0; i < chainBones.length; i++) {
      const b = chainBones[i];
      const eb = evaluated.get(b.id)!;
      eb.isIkDriven = true;
      eb.worldPos = solvedPoints[i];

      // Calculate new world rotation from current point to next point
      const nextPoint = solvedPoints[i + 1];
      const delta = subVec(nextPoint, solvedPoints[i]);
      const newWorldRot = Math.atan2(delta.y, delta.x);
      eb.worldRot = newWorldRot;
      eb.worldTransform.x = eb.worldPos.x;
      eb.worldTransform.y = eb.worldPos.y;
      eb.worldTransform.rot = newWorldRot;
    }
  }
}
