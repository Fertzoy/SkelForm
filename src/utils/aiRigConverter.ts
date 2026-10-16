import {
  AiRigPlan,
  AiRigBone,
  AiRigAnimation,
  ObjectType,
  RigStrategy,
} from '../types/aiRig';
import {
  Bone,
  Animation,
  Keyframe,
  AnimElement,
  Vec2,
  RootArmatureJson,
  Texture,
} from '../types/skelform';
import { rotateVec, subVec, degToRad } from './math';

export interface ConvertResult {
  bones: Bone[];
  animation?: Animation;
  warnings: string[];
}

/**
 * Validates AiRigPlan against schema rules
 */
export function validateAiRigPlan(plan: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!plan || typeof plan !== 'object') {
    return { valid: false, errors: ['Plan must be a JSON object'] };
  }

  if (plan.schema_version !== 1) {
    errors.push('schema_version must be 1');
  }

  if (!plan.analysis || !plan.analysis.object_type || !plan.analysis.rig_strategy) {
    errors.push('analysis missing object_type or rig_strategy');
  }

  if (!Array.isArray(plan.bones) || plan.bones.length === 0) {
    errors.push('bones array must contain at least 1 bone');
    return { valid: false, errors };
  }

  const boneIds = new Set<string>();
  let hasRoot = false;

  for (const b of plan.bones) {
    if (!b.id || typeof b.id !== 'string') errors.push('Bone must have valid string id');
    if (boneIds.has(b.id)) errors.push(`Duplicate bone id: ${b.id}`);
    boneIds.add(b.id);

    if (b.parent_id === null || b.parent_id === '') {
      hasRoot = true;
    }

    if (!b.start || typeof b.start.x !== 'number' || typeof b.start.y !== 'number') {
      errors.push(`Bone ${b.id} missing valid start coordinates`);
    }
    if (!b.end || typeof b.end.x !== 'number' || typeof b.end.y !== 'number') {
      errors.push(`Bone ${b.id} missing valid end coordinates`);
    }
  }

  if (!hasRoot) {
    errors.push('Skeleton must have at least one root bone with parent_id: null');
  }

  // Validate parent hierarchy references (no dangling parents)
  for (const b of plan.bones) {
    if (b.parent_id && !boneIds.has(b.parent_id)) {
      errors.push(`Bone "${b.id}" references non-existent parent "${b.parent_id}"`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Converts AiRigPlan into SkelForm's internal data model (Bones & Animation)
 */
export function convertAiRigToSkelForm(
  plan: AiRigPlan,
  textureWidth: number = 400,
  textureHeight: number = 400,
  textureName: string = ''
): ConvertResult {
  const warnings: string[] = plan.warnings ? [...plan.warnings] : [];

  // 1. Assign numeric IDs to bones and map string IDs to numeric IDs
  const idMap = new Map<string, number>();
  plan.bones.forEach((b, idx) => {
    idMap.set(b.id, idx);
  });

  // Calculate world positions for each bone
  // Normalized coords: 0,0 is top-left, 1,1 is bottom-right.
  // SkelForm coords: Center is (0,0), X right, Y up positive.
  const toWorldPoint = (norm: { x: number; y: number }): Vec2 => {
    return {
      x: (norm.x - 0.5) * textureWidth,
      y: (0.5 - norm.y) * textureHeight, // Y inverted: up is positive
    };
  };

  const worldPosMap = new Map<string, Vec2>();
  const worldRotMap = new Map<string, number>();

  plan.bones.forEach(b => {
    const startW = toWorldPoint(b.start);
    const endW = toWorldPoint(b.end);
    worldPosMap.set(b.id, startW);

    const dx = endW.x - startW.x;
    const dy = endW.y - startW.y;
    const rot = Math.atan2(dy, dx);
    worldRotMap.set(b.id, rot);
  });

  // 2. Build SkelForm bones with local parent offsets
  const skelBones: Bone[] = plan.bones.map((b, idx) => {
    const numId = idMap.get(b.id)!;
    const parentNumId = b.parent_id ? (idMap.get(b.parent_id) ?? -1) : -1;

    const worldStart = worldPosMap.get(b.id)!;
    const worldRot = worldRotMap.get(b.id)!;

    let localPos: Vec2;
    let localRot: number;

    if (parentNumId === -1 || !b.parent_id) {
      localPos = { ...worldStart };
      localRot = worldRot;
    } else {
      const parentWorldPos = worldPosMap.get(b.parent_id)!;
      const parentWorldRot = worldRotMap.get(b.parent_id)!;

      // Delta in world space
      const deltaW = subVec(worldStart, parentWorldPos);
      // Rotate by negative parent rotation to get parent-local space
      localPos = rotateVec(deltaW, -parentWorldRot);
      localRot = worldRot - parentWorldRot;
    }

    // Attach texture to root or designated bone
    const shouldHaveTexture =
      b.attachment_texture ||
      (idx === 0 && textureName) ||
      (plan.analysis.rig_strategy === 'transform_rig' && idx === 0);

    const bone: Bone = {
      id: numId,
      name: b.name || `Bone_${numId}`,
      parent_id: parentNumId,
      pos: localPos,
      scale: { x: 1, y: 1 },
      rot: localRot,
      zindex: idx,
      tex: shouldHaveTexture ? (b.attachment_texture || textureName) : '',
      tint: { r: 1, g: 1, b: 1, a: 1 },
      pivot_pos: { x: 0, y: 0 },
      pivot_rot: 0,
      pivot_scale: { x: 1, y: 1 },
      ik_family_id: b.ik_family_id ?? -1,
      ik_target_id: b.ik_target_id ? (idMap.get(b.ik_target_id) ?? -1) : -1,
      ik_constraint: b.ik_constraint || 'None',
      ik_mode: 'FABRIK',
    };

    return bone;
  });

  // 3. Build Animation if provided
  let skelAnim: Animation | undefined;
  if (plan.animation && plan.animation.tracks && plan.animation.tracks.length > 0) {
    const keyframes: Keyframe[] = [];

    plan.animation.tracks.forEach(track => {
      const numId = idMap.get(track.bone_id);
      if (numId === undefined) return;

      const element = track.property as AnimElement;

      track.keyframes.forEach(kf => {
        keyframes.push({
          bone_id: numId,
          frame: kf.frame,
          element,
          value: kf.value,
          value_str: kf.value_str,
          start_handle: { x: 0, y: 0 },
          end_handle: { x: 0, y: 0 },
          handle_preset: kf.preset || 'SineInOut',
        });
      });
    });

    keyframes.sort((a, b) => a.frame - b.frame);

    skelAnim = {
      id: 0,
      name: plan.animation.name || 'AI Animation',
      fps: plan.animation.fps || 30,
      keyframes,
    };
  }

  return {
    bones: skelBones,
    animation: skelAnim,
    warnings,
  };
}

/**
 * High-quality heuristic AI auto-rig generator for offline testing or instant smart rigging
 */
export function generateSmartPresetRig(
  objectType: ObjectType,
  prompt: string,
  width: number,
  height: number,
  textureName: string
): AiRigPlan {
  const isDetailed = prompt.toLowerCase().includes('detailed') || prompt.toLowerCase().includes('full');

  switch (objectType) {
    case 'item_gem_coin':
    case 'geometric_icon':
      return {
        schema_version: 1,
        analysis: {
          object_type: 'item_gem_coin',
          rig_strategy: 'transform_rig',
          confidence: 0.95,
          reason: 'Identified as a collectible game item; best suited for dynamic transform animation.',
        },
        bones: [
          {
            id: 'root',
            name: 'Item Root',
            parent_id: null,
            start: { x: 0.5, y: 0.5 },
            end: { x: 0.5, y: 0.2 },
            role: 'root',
            attachment_texture: textureName,
          },
        ],
        animation: {
          name: 'Floating Shimmer',
          duration_ms: 1200,
          fps: 30,
          loop: true,
          tracks: [
            {
              bone_id: 'root',
              property: 'PositionY',
              keyframes: [
                { frame: 0, value: 0, preset: 'SineInOut' },
                { frame: 15, value: 18, preset: 'SineInOut' },
                { frame: 30, value: 0, preset: 'SineInOut' },
              ],
            },
            {
              bone_id: 'root',
              property: 'Rotation',
              keyframes: [
                { frame: 0, value: 0, preset: 'SineInOut' },
                { frame: 8, value: 0.08, preset: 'SineInOut' },
                { frame: 22, value: -0.08, preset: 'SineInOut' },
                { frame: 30, value: 0, preset: 'SineInOut' },
              ],
            },
            {
              bone_id: 'root',
              property: 'ScaleX',
              keyframes: [
                { frame: 0, value: 1, preset: 'SineInOut' },
                { frame: 15, value: 1.06, preset: 'SineInOut' },
                { frame: 30, value: 1, preset: 'SineInOut' },
              ],
            },
            {
              bone_id: 'root',
              property: 'ScaleY',
              keyframes: [
                { frame: 0, value: 1, preset: 'SineInOut' },
                { frame: 15, value: 1.06, preset: 'SineInOut' },
                { frame: 30, value: 1, preset: 'SineInOut' },
              ],
            },
          ],
        },
      };

    case 'plant':
      return {
        schema_version: 1,
        analysis: {
          object_type: 'plant',
          rig_strategy: 'segmented_chain',
          confidence: 0.92,
          reason: 'Organic flexible stem/plant shape; constructed continuous bending spine chain.',
        },
        bones: [
          { id: 'base', name: 'Stem Base', parent_id: null, start: { x: 0.5, y: 0.88 }, end: { x: 0.5, y: 0.65 }, role: 'root', attachment_texture: textureName },
          { id: 'mid', name: 'Stem Mid', parent_id: 'base', start: { x: 0.5, y: 0.65 }, end: { x: 0.5, y: 0.42 }, role: 'spine' },
          { id: 'top', name: 'Stem Top', parent_id: 'mid', start: { x: 0.5, y: 0.42 }, end: { x: 0.5, y: 0.18 }, role: 'head' },
        ],
        animation: {
          name: 'Wind Sway',
          duration_ms: 1500,
          fps: 30,
          loop: true,
          tracks: [
            {
              bone_id: 'mid',
              property: 'Rotation',
              keyframes: [
                { frame: 0, value: 0, preset: 'SineInOut' },
                { frame: 12, value: 0.12, preset: 'SineInOut' },
                { frame: 25, value: -0.12, preset: 'SineInOut' },
                { frame: 36, value: 0, preset: 'SineInOut' },
              ],
            },
            {
              bone_id: 'top',
              property: 'Rotation',
              keyframes: [
                { frame: 0, value: 0, preset: 'SineInOut' },
                { frame: 14, value: 0.22, preset: 'SineInOut' },
                { frame: 27, value: -0.22, preset: 'SineInOut' },
                { frame: 36, value: 0, preset: 'SineInOut' },
              ],
            },
          ],
        },
      };

    case 'creature_winged':
      return {
        schema_version: 1,
        analysis: {
          object_type: 'creature_winged',
          rig_strategy: 'humanoid_biped',
          confidence: 0.91,
          reason: 'Creature with wings and torso detected; created core body with left/right wing pivots and head control.',
        },
        bones: [
          { id: 'torso', name: 'Torso', parent_id: null, start: { x: 0.5, y: 0.6 }, end: { x: 0.5, y: 0.4 }, role: 'root', attachment_texture: textureName },
          { id: 'head', name: 'Head', parent_id: 'torso', start: { x: 0.5, y: 0.4 }, end: { x: 0.5, y: 0.2 }, role: 'head' },
          { id: 'wing_l_root', name: 'Left Wing Root', parent_id: 'torso', start: { x: 0.42, y: 0.45 }, end: { x: 0.25, y: 0.35 }, role: 'wing_l' },
          { id: 'wing_l_tip', name: 'Left Wing Tip', parent_id: 'wing_l_root', start: { x: 0.25, y: 0.35 }, end: { x: 0.1, y: 0.25 }, role: 'wing_l' },
          { id: 'wing_r_root', name: 'Right Wing Root', parent_id: 'torso', start: { x: 0.58, y: 0.45 }, end: { x: 0.75, y: 0.35 }, role: 'wing_r' },
          { id: 'wing_r_tip', name: 'Right Wing Tip', parent_id: 'wing_r_root', start: { x: 0.75, y: 0.35 }, end: { x: 0.9, y: 0.25 }, role: 'wing_r' },
          { id: 'tail', name: 'Tail', parent_id: 'torso', start: { x: 0.5, y: 0.65 }, end: { x: 0.5, y: 0.85 }, role: 'tail' },
        ],
        animation: {
          name: 'Wing Flap & Bob',
          duration_ms: 1200,
          fps: 30,
          loop: true,
          tracks: [
            {
              bone_id: 'wing_l_root',
              property: 'Rotation',
              keyframes: [
                { frame: 0, value: -0.2, preset: 'SineInOut' },
                { frame: 12, value: 0.35, preset: 'SineInOut' },
                { frame: 24, value: -0.2, preset: 'SineInOut' },
              ],
            },
            {
              bone_id: 'wing_r_root',
              property: 'Rotation',
              keyframes: [
                { frame: 0, value: 0.2, preset: 'SineInOut' },
                { frame: 12, value: -0.35, preset: 'SineInOut' },
                { frame: 24, value: 0.2, preset: 'SineInOut' },
              ],
            },
            {
              bone_id: 'head',
              property: 'Rotation',
              keyframes: [
                { frame: 0, value: 0, preset: 'SineInOut' },
                { frame: 10, value: 0.08, preset: 'SineInOut' },
                { frame: 24, value: 0, preset: 'SineInOut' },
              ],
            },
            {
              bone_id: 'tail',
              property: 'Rotation',
              keyframes: [
                { frame: 0, value: 0, preset: 'SineInOut' },
                { frame: 8, value: 0.15, preset: 'SineInOut' },
                { frame: 18, value: -0.15, preset: 'SineInOut' },
                { frame: 24, value: 0, preset: 'SineInOut' },
              ],
            },
          ],
        },
      };

    case 'humanoid':
    default:
      return {
        schema_version: 1,
        analysis: {
          object_type: 'humanoid',
          rig_strategy: 'humanoid_biped',
          confidence: 0.94,
          reason: 'Bipedal character detected; standard anatomical spine, head, dual arms and legs hierarchy.',
        },
        bones: [
          { id: 'pelvis', name: 'Pelvis', parent_id: null, start: { x: 0.5, y: 0.55 }, end: { x: 0.5, y: 0.45 }, role: 'root', attachment_texture: textureName },
          { id: 'chest', name: 'Chest', parent_id: 'pelvis', start: { x: 0.5, y: 0.45 }, end: { x: 0.5, y: 0.32 }, role: 'spine' },
          { id: 'head', name: 'Head', parent_id: 'chest', start: { x: 0.5, y: 0.32 }, end: { x: 0.5, y: 0.15 }, role: 'head' },
          // Arms
          { id: 'arm_l', name: 'Arm L', parent_id: 'chest', start: { x: 0.42, y: 0.35 }, end: { x: 0.32, y: 0.48 }, role: 'arm_l' },
          { id: 'forearm_l', name: 'Forearm L', parent_id: 'arm_l', start: { x: 0.32, y: 0.48 }, end: { x: 0.28, y: 0.62 }, role: 'arm_l' },
          { id: 'arm_r', name: 'Arm R', parent_id: 'chest', start: { x: 0.58, y: 0.35 }, end: { x: 0.68, y: 0.48 }, role: 'arm_r' },
          { id: 'forearm_r', name: 'Forearm R', parent_id: 'arm_r', start: { x: 0.68, y: 0.48 }, end: { x: 0.72, y: 0.62 }, role: 'arm_r' },
          // Legs
          { id: 'leg_l', name: 'Thigh L', parent_id: 'pelvis', start: { x: 0.44, y: 0.55 }, end: { x: 0.42, y: 0.72 }, role: 'leg_l' },
          { id: 'calf_l', name: 'Calf L', parent_id: 'leg_l', start: { x: 0.42, y: 0.72 }, end: { x: 0.42, y: 0.9 }, role: 'leg_l' },
          { id: 'leg_r', name: 'Thigh R', parent_id: 'pelvis', start: { x: 0.56, y: 0.55 }, end: { x: 0.58, y: 0.72 }, role: 'leg_r' },
          { id: 'calf_r', name: 'Calf R', parent_id: 'leg_r', start: { x: 0.58, y: 0.72 }, end: { x: 0.58, y: 0.9 }, role: 'leg_r' },
        ],
        animation: {
          name: 'Idle Breathing & Sway',
          duration_ms: 1400,
          fps: 30,
          loop: true,
          tracks: [
            {
              bone_id: 'chest',
              property: 'PositionY',
              keyframes: [
                { frame: 0, value: 0, preset: 'SineInOut' },
                { frame: 15, value: -4, preset: 'SineInOut' },
                { frame: 30, value: 0, preset: 'SineInOut' },
              ],
            },
            {
              bone_id: 'head',
              property: 'Rotation',
              keyframes: [
                { frame: 0, value: 0, preset: 'SineInOut' },
                { frame: 12, value: 0.05, preset: 'SineInOut' },
                { frame: 25, value: -0.05, preset: 'SineInOut' },
                { frame: 30, value: 0, preset: 'SineInOut' },
              ],
            },
            {
              bone_id: 'arm_l',
              property: 'Rotation',
              keyframes: [
                { frame: 0, value: 0, preset: 'SineInOut' },
                { frame: 15, value: 0.1, preset: 'SineInOut' },
                { frame: 30, value: 0, preset: 'SineInOut' },
              ],
            },
            {
              bone_id: 'arm_r',
              property: 'Rotation',
              keyframes: [
                { frame: 0, value: 0, preset: 'SineInOut' },
                { frame: 15, value: -0.1, preset: 'SineInOut' },
                { frame: 30, value: 0, preset: 'SineInOut' },
              ],
            },
          ],
        },
      };
  }
}
