import JSZip from 'jszip';
import {
  Bone,
  RootArmatureJson,
  EditorOptions,
  Camera,
  Style,
  TexAtlas,
  Visuals,
  InverseKinematics,
} from '../types/skelform';

export interface ParsedSkfData {
  root: RootArmatureJson;
  editorOptions?: EditorOptions;
  atlases: TexAtlas[];
  atlasImages: Map<number, HTMLImageElement>;
}

export async function parseSkfBuffer(data: ArrayBuffer | Uint8Array): Promise<ParsedSkfData> {
  const zip = await JSZip.loadAsync(data);

  // 1. Read armature.json
  const armatureFile = zip.file('armature.json');
  if (!armatureFile) {
    throw new Error('Invalid .skf file: missing armature.json');
  }
  const armatureJsonText = await armatureFile.async('string');
  const root: RootArmatureJson = JSON.parse(armatureJsonText);

  // 2. Read editor.json (optional)
  let editorOptions: EditorOptions | undefined;
  const editorFile = zip.file('editor.json');
  if (editorFile) {
    try {
      const editorJsonText = await editorFile.async('string');
      editorOptions = JSON.parse(editorJsonText);
    } catch (e) {
      console.warn('Failed to parse editor.json', e);
    }
  }

  // 3. Reconcile Visuals and IK into Bones
  const visualsMap = new Map<number, Visuals>();
  if (root.visuals) {
    root.visuals.forEach((v, idx) => visualsMap.set(idx, v));
  }

  const ikMap = new Map<number, InverseKinematics>();
  if (root.inverse_kinematics) {
    root.inverse_kinematics.forEach(ik => ikMap.set(ik.id, ik));
  }

  // Populate bones
  root.bones = (root.bones || []).map((b, idx) => {
    const bone: Bone = {
      ...b,
      tex: b.tex || '',
      tint: b.tint || { r: 1, g: 1, b: 1, a: 1 },
      pivot_pos: b.pivot_pos || { x: 0, y: 0 },
      pivot_rot: b.pivot_rot || 0,
      pivot_scale: b.pivot_scale || { x: 1, y: 1 },
      ik_family_id: b.ik_family_id ?? -1,
      ik_target_id: b.ik_target_id ?? -1,
      ik_constraint: b.ik_constraint || 'None',
      ik_mode: b.ik_mode || 'FABRIK',
    };

    // Merge Visuals if visuals_id is specified or fallback by index
    if (bone.visuals_id !== undefined && visualsMap.has(bone.visuals_id)) {
      const vis = visualsMap.get(bone.visuals_id)!;
      bone.tex = vis.tex || bone.tex;
      if (vis.tint) bone.tint = vis.tint;
      if (vis.zindex !== undefined) bone.zindex = vis.zindex;
      if (vis.pivot_pos) bone.pivot_pos = vis.pivot_pos;
      if (vis.pivot_rot !== undefined) bone.pivot_rot = vis.pivot_rot;
      if (vis.pivot_scale) bone.pivot_scale = vis.pivot_scale;
      if (vis.vertices) bone.vertices = vis.vertices;
      if (vis.indices) bone.indices = vis.indices;
      if (vis.binds) bone.binds = vis.binds;
    } else if (visualsMap.has(idx) && !bone.tex) {
      const vis = visualsMap.get(idx)!;
      bone.tex = vis.tex || bone.tex;
      if (vis.tint) bone.tint = vis.tint;
      if (vis.zindex !== undefined) bone.zindex = vis.zindex;
      if (vis.pivot_pos) bone.pivot_pos = vis.pivot_pos;
      if (vis.pivot_rot !== undefined) bone.pivot_rot = vis.pivot_rot;
      if (vis.pivot_scale) bone.pivot_scale = vis.pivot_scale;
      if (vis.vertices) bone.vertices = vis.vertices;
      if (vis.indices) bone.indices = vis.indices;
      if (vis.binds) bone.binds = vis.binds;
    }

    // Merge Inverse Kinematics
    if (bone.ik_family_id !== -1 && ikMap.has(bone.ik_family_id)) {
      const ik = ikMap.get(bone.ik_family_id)!;
      bone.ik_constraint = ik.constraint || bone.ik_constraint;
      bone.ik_mode = ik.mode || bone.ik_mode;
      bone.ik_target_id = ik.target_id ?? bone.ik_target_id;
      bone.ik_mimic_target = ik.mimic_target ?? bone.ik_mimic_target;
      bone.ik_bone_ids = ik.bone_ids || bone.ik_bone_ids;
    }

    // Apply editor options if available
    if (editorOptions?.bones && editorOptions.bones[idx]) {
      const eb = editorOptions.bones[idx];
      bone.folded = eb.folded;
      bone.ik_folded = eb.ik_folded;
      bone.meshdef_folded = eb.meshdef_folded;
      bone.locked = eb.locked;
      if (eb.group_color) bone.group_color = eb.group_color;
    }

    return bone;
  });

  // Normalize textures in styles
  if (root.styles) {
    root.styles.forEach((style, sIdx) => {
      const defaultActive = sIdx === 0 || style.active === true;
      style.active = editorOptions?.styles?.[sIdx]?.active ?? defaultActive;
      style.textures.forEach(tex => {
        if (tex.ser_offset) tex.offset = { x: tex.ser_offset.x, y: tex.ser_offset.y };
        if (tex.ser_size) tex.size = { x: tex.ser_size.x, y: tex.ser_size.y };
      });
    });
  }

  // 4. Load Texture Atlases
  const atlases: TexAtlas[] = root.atlases || [];
  const atlasImages = new Map<number, HTMLImageElement>();

  for (let i = 0; i < 10; i++) {
    const filenames = [`atlas${i}.png`, `atlas${i}.jpg`, `atlas${i}.jpeg`];
    for (const fn of filenames) {
      const atlasFile = zip.file(fn);
      if (atlasFile) {
        const blob = await atlasFile.async('blob');
        const dataUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.src = dataUrl;
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });
        atlasImages.set(i, img);

        const existingAtlas = atlases.find(a => a.filename === fn || a.filename === `atlas${i}.png`);
        if (existingAtlas) {
          existingAtlas.imageElement = img;
          existingAtlas.dataUrl = dataUrl;
        } else {
          atlases.push({
            filename: fn,
            imageElement: img,
            dataUrl: dataUrl,
            size: { x: img.naturalWidth || 1024, y: img.naturalHeight || 1024 },
          });
        }
        break;
      }
    }
  }

  return {
    root,
    editorOptions,
    atlases,
    atlasImages,
  };
}

export async function exportSkfBlob(
  root: RootArmatureJson,
  camera: Camera,
  atlasImages: Map<number, HTMLImageElement>
): Promise<Blob> {
  const zip = new JSZip();

  // 1. Prepare armature.json
  const exportRoot: RootArmatureJson = {
    version: root.version || '0.5.0',
    baked_ik: root.baked_ik || false,
    img_format: root.img_format || 'PNG',
    clear_color: root.clear_color,
    bones: root.bones.map(b => ({
      ...b,
      // Stripped runtime-only fields
    })),
    animations: root.animations,
    atlases: root.atlases?.map(a => ({ filename: a.filename, size: a.size })),
    styles: root.styles,
    visuals: root.visuals,
    inverse_kinematics: root.inverse_kinematics,
    physics: root.physics,
  };

  zip.file('armature.json', JSON.stringify(exportRoot, null, 2));

  // 2. Prepare editor.json
  const editorOptions: EditorOptions = {
    camera,
    bones: root.bones.map(b => ({
      folded: !!b.folded,
      ik_folded: !!b.ik_folded,
      meshdef_folded: !!b.meshdef_folded,
      locked: !!b.locked,
      group_color: b.group_color,
    })),
    styles: root.styles?.map(s => ({ active: !!s.active })),
  };
  zip.file('editor.json', JSON.stringify(editorOptions, null, 2));

  // 3. readme.md
  zip.file(
    'readme.md',
    '# SkelForm Armature\nCreated and exported with SkelForm 2D Skeletal Animation Editor.\nhttps://skelform.org\n'
  );

  // 4. Add atlas images
  for (const [idx, img] of atlasImages.entries()) {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width || 1024;
    canvas.height = img.naturalHeight || img.height || 1024;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
      zip.file(`atlas${idx}.png`, base64Data, { base64: true });
    }
  }

  return await zip.generateAsync({ type: 'blob' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
