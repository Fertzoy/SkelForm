// SkelForm Data Types & Interfaces

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec2I {
  x: number;
  y: number;
}

export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface TintColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Vertex {
  id: number;
  pos: Vec2;
  uv: Vec2;
  init_pos?: Vec2;
  tint?: TintColor;
}

export interface BoneBindVert {
  id: number;
  weight: number;
}

export interface BoneBind {
  bone_id: number;
  is_path: boolean;
  verts: BoneBindVert[];
}

export type JointConstraint = 'None' | 'Clockwise' | 'CounterClockwise' | 'Skip';
export type InverseKinematicsMode = 'FABRIK' | 'Arc' | 'Skip';
export type JointEffector = 'None' | 'Start' | 'Middle' | 'End';

export interface Visuals {
  tex: string;
  tint: TintColor;
  zindex: number;
  pivot_pos: Vec2;
  pivot_rot: number;
  pivot_scale: Vec2;
  vertices?: Vertex[];
  indices?: number[];
  binds?: BoneBind[];
  init_tex?: string;
  init_tint?: TintColor;
  init_zindex?: number;
}

export interface Physics {
  global_pos?: Vec2;
  global_rot?: number;
  global_scale?: Vec2;
  pos_damping?: number;
  scale_damping?: number;
  rot_damping?: number;
  pos_ratio?: number;
  scale_ratio?: number;
  global_orbit?: number;
  global_orbit_diff?: number;
  global_orbit_vel?: number;
  sway?: number;
  rot_bounce?: number;
}

export interface Bone {
  id: number;
  name: string;
  parent_id: number;
  pos: Vec2;
  scale: Vec2;
  rot: number; // in radians
  zindex: number;
  hidden?: boolean;
  tex: string;
  tint: TintColor;
  pivot_pos: Vec2;
  pivot_rot: number;
  pivot_scale: Vec2;

  // IK fields
  ik_family_id: number;
  ik_family_name?: string;
  ik_target_id: number;
  ik_constraint: JointConstraint;
  ik_mode: InverseKinematicsMode;
  ik_mimic_target?: boolean;
  ik_bone_ids?: number[];

  // Mesh & Vertices
  vertices?: Vertex[];
  indices?: number[];
  binds?: BoneBind[];
  verts_edited?: boolean;

  // Physics
  phys_pos_damping?: number;
  phys_rot_damping?: number;
  phys_scale_damping?: number;
  phys_sway?: number;
  phys_rot_bounce?: number;

  // Editor states
  folded?: boolean;
  ik_folded?: boolean;
  meshdef_folded?: boolean;
  phys_folded?: boolean;
  locked?: boolean;
  group_color?: Color;

  // References to external tables in .skf Root
  physics_id?: number;
  visuals_id?: number;
}

export type AnimElement =
  | 'PositionX'
  | 'PositionY'
  | 'Rotation'
  | 'ScaleX'
  | 'ScaleY'
  | 'Zindex'
  | 'Texture'
  | 'IkConstraint'
  | 'Hidden'
  | 'IkMode'
  | 'TintR'
  | 'TintG'
  | 'TintB'
  | 'TintA'
  | 'MimicTarget';

export type HandlePreset =
  | 'Linear'
  | 'SineIn'
  | 'SineOut'
  | 'SineInOut'
  | 'Snap'
  | 'Custom';

export interface Keyframe {
  frame: number;
  bone_id: number;
  element: AnimElement;
  value?: number;
  value_str?: string;
  start_handle: Vec2;
  end_handle: Vec2;
  next_kf?: number;
  handle_preset?: HandlePreset;
}

export interface Animation {
  id: number;
  name: string;
  fps: number;
  keyframes: Keyframe[];
}

export interface Texture {
  name: string;
  offset: Vec2;
  size: Vec2;
  atlas_idx: number;
  ser_offset?: Vec2I;
  ser_size?: Vec2I;
  data_id?: number;
}

export interface Style {
  id: number;
  name: string;
  active: boolean;
  textures: Texture[];
}

export interface TexAtlas {
  filename: string;
  size?: Vec2I;
  imageElement?: HTMLImageElement;
  dataUrl?: string;
}

export interface InverseKinematics {
  id: number;
  constraint: JointConstraint;
  mode: InverseKinematicsMode;
  target_id: number;
  bone_ids: number[];
  mimic_target?: boolean;
}

export interface RootArmatureJson {
  version?: string;
  baked_ik?: boolean;
  img_format?: string;
  clear_color?: Color;
  bones: Bone[];
  animations?: Animation[];
  atlases?: TexAtlas[];
  styles?: Style[];
  visuals?: Visuals[];
  inverse_kinematics?: InverseKinematics[];
  physics?: Physics[];
}

export interface EditorBone {
  folded: boolean;
  ik_folded?: boolean;
  meshdef_folded?: boolean;
  effects_folded?: boolean;
  ik_disabled?: boolean;
  locked?: boolean;
  group_color?: Color;
}

export interface Camera {
  pos: Vec2;
  zoom: number;
}

export interface EditorOptions {
  camera: Camera;
  bones?: EditorBone[];
  styles?: { active: boolean }[];
}

export type TransformMode = 'move' | 'rotate' | 'scale' | 'pivot';
export type ToolType = 'select' | 'bone' | 'move' | 'rotate' | 'scale' | 'hand' | 'pivot';

export interface WorkspaceZone {
  id: string;
  name: string;
  width: number;
  height: number;
}

export interface WarningItem {
  id: string;
  type: 'SameZIndex' | 'NoIkTarget' | 'OnlyIk' | 'UnboundBind' | 'EmptyStyles';
  title: string;
  description: string;
  boneIds?: number[];
  fixAction?: () => void;
}

