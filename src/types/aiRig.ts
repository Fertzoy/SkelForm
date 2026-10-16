// Types and Contracts for AI Auto-Rigging and Animation

export type ObjectType =
  | 'humanoid'
  | 'animal'
  | 'creature_winged'
  | 'plant'
  | 'item_gem_coin'
  | 'geometric_icon'
  | 'layered_object'
  | 'unknown';

export type RigStrategy =
  | 'transform_rig'
  | 'segmented_chain'
  | 'humanoid_biped'
  | 'quadruped'
  | 'layered_skeleton';

export interface AiRigAnalysis {
  object_type: ObjectType;
  rig_strategy: RigStrategy;
  confidence: number;
  reason: string;
}

export interface AiRigBone {
  id: string;
  name: string;
  parent_id: string | null;
  /** Normalized coordinate within the image: 0.0 is top-left, 1.0 is bottom-right (X right, Y down) */
  start: { x: number; y: number };
  end: { x: number; y: number };
  role: string;
  ik_family_id?: number;
  ik_target_id?: string;
  ik_constraint?: 'None' | 'Clockwise' | 'CounterClockwise';
  attachment_texture?: string;
}

export interface AiRigKeyframe {
  frame: number;
  value: number;
  value_str?: string;
  preset?: 'Linear' | 'SineIn' | 'SineOut' | 'SineInOut' | 'Snap';
}

export interface AiRigTrack {
  bone_id: string;
  property: 'PositionX' | 'PositionY' | 'Rotation' | 'ScaleX' | 'ScaleY' | 'Texture';
  keyframes: AiRigKeyframe[];
}

export interface AiRigAnimation {
  name: string;
  duration_ms: number;
  fps: number;
  loop: boolean;
  tracks: AiRigTrack[];
}

export interface AiRigAttachment {
  bone_id: string;
  texture_name?: string;
  layer_name?: string;
}

export interface AiRigPlan {
  schema_version: 1;
  analysis: AiRigAnalysis;
  bones: AiRigBone[];
  attachments?: AiRigAttachment[];
  animation?: AiRigAnimation;
  warnings?: string[];
}

export interface AutoRigOptions {
  mode: 'fast' | 'detailed';
  prompt: string;
  apiKey?: string;
  modelName?: string;
}
