import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  Bone,
  Animation,
  AnimElement,
  Keyframe,
  RootArmatureJson,
  Style,
  TexAtlas,
  Camera,
  TransformMode,
  ToolType,
  WorkspaceZone,
  WarningItem,
} from '../types/skelform';
import { parseSkfBuffer, exportSkfBlob, downloadBlob } from '../utils/skfParser';
import { translations, Language } from '../utils/i18n';

interface EditorContextType {
  root: RootArmatureJson;
  setRoot: React.Dispatch<React.SetStateAction<RootArmatureJson>>;
  atlasImages: Map<number, HTMLImageElement>;
  selectedBoneId: number | null;
  setSelectedBoneId: (id: number | null) => void;
  selectedAnimId: number | null;
  setSelectedAnimId: (id: number | null) => void;
  currentFrame: number;
  setCurrentFrame: (frame: number) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  camera: Camera;
  setCamera: React.Dispatch<React.SetStateAction<Camera>>;
  transformMode: TransformMode;
  setTransformMode: (mode: TransformMode) => void;
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;
  onionLayers: boolean;
  setOnionLayers: (onion: boolean) => void;
  showGrid: boolean;
  setShowGrid: (show: boolean) => void;
  showBonesOnCanvas: boolean;
  setShowBonesOnCanvas: (show: boolean) => void;
  boneTranslucency: number;
  setBoneTranslucency: (t: number) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  t: typeof translations['ru'];
  advancedMode: boolean;
  setAdvancedMode: (v: boolean) => void;
  activeZone: WorkspaceZone | null;
  setActiveZone: (z: WorkspaceZone | null) => void;
  playbackSpeed: number;
  setPlaybackSpeed: (s: number) => void;
  editorMode: 'armature' | 'animation';
  setEditorMode: (mode: 'armature' | 'animation') => void;
  isLooping: boolean;
  setIsLooping: (l: boolean) => void;
  focusCamera: () => void;

  // Modals & Panels
  showStartupModal: boolean;
  setShowStartupModal: (s: boolean) => void;
  showStylesModal: boolean;
  setShowStylesModal: (s: boolean) => void;
  showAtlasModal: boolean;
  setShowAtlasModal: (s: boolean) => void;
  showExportModal: boolean;
  setShowExportModal: (s: boolean) => void;
  showSettingsModal: boolean;
  setShowSettingsModal: (s: boolean) => void;
  showWarningsModal: boolean;
  setShowWarningsModal: (s: boolean) => void;
  showAutoRigModal: boolean;
  setShowAutoRigModal: (s: boolean) => void;
  showCommandPalette: boolean;
  setShowCommandPalette: (s: boolean) => void;
  showDevPanel: boolean;
  setShowDevPanel: (s: boolean) => void;
  warnings: WarningItem[];

  // Operations
  loadSample: (sampleName: '_skellina.skf' | '_skellington.skf') => Promise<void>;
  loadFile: (file: File) => Promise<void>;
  addExternalImage: (file: File) => Promise<string>;

  exportProject: (filename?: string) => Promise<void>;
  newProject: () => void;
  addBone: (parentId?: number) => void;
  deleteBone: (id: number) => void;
  updateBone: (id: number, updates: Partial<Bone>) => void;
  addAnimation: (name?: string) => void;
  deleteAnimation: (id: number) => void;
  recordKeyframe: (boneId: number, element: AnimElement, value?: number, valueStr?: string) => void;
  deleteKeyframe: (boneId: number, frame: number, element: AnimElement) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  saveHistoryState: () => void;
}

const EditorContext = createContext<EditorContextType | null>(null);

const createDefaultRoot = (): RootArmatureJson => ({
  version: '0.5.0',
  baked_ik: false,
  img_format: 'PNG',
  bones: [
    {
      id: 0,
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
    },
  ],
  animations: [
    {
      id: 0,
      name: 'Animation 1',
      fps: 30,
      keyframes: [],
    },
  ],
  styles: [
    {
      id: 0,
      name: 'Default',
      active: true,
      textures: [],
    },
  ],
  atlases: [],
});

export const EditorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [root, setRoot] = useState<RootArmatureJson>(createDefaultRoot());
  const [atlasImages, setAtlasImages] = useState<Map<number, HTMLImageElement>>(new Map());
  const [selectedBoneId, setSelectedBoneId] = useState<number | null>(0);
  const [selectedAnimId, setSelectedAnimId] = useState<number | null>(0);
  const [currentFrame, setCurrentFrame] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [camera, setCamera] = useState<Camera>({ pos: { x: 0, y: 0 }, zoom: 1 });
  const [transformMode, setTransformMode] = useState<TransformMode>('move');
  const [activeTool, setActiveToolState] = useState<ToolType>('move');
  const [onionLayers, setOnionLayers] = useState<boolean>(false);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showBonesOnCanvas, setShowBonesOnCanvas] = useState<boolean>(true);
  const [boneTranslucency, setBoneTranslucency] = useState<number>(0.25);
  const [language, setLanguage] = useState<Language>('ru');
  const [advancedMode, setAdvancedMode] = useState<boolean>(false);
  const [activeZone, setActiveZone] = useState<WorkspaceZone | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [editorMode, setEditorMode] = useState<'armature' | 'animation'>('armature');
  const [isLooping, setIsLooping] = useState<boolean>(true);

  // Modals & Panels
  const [showStartupModal, setShowStartupModal] = useState<boolean>(false);
  const [showStylesModal, setShowStylesModal] = useState<boolean>(false);
  const [showAtlasModal, setShowAtlasModal] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showWarningsModal, setShowWarningsModal] = useState<boolean>(false);
  const [showAutoRigModal, setShowAutoRigModal] = useState<boolean>(false);
  const [showCommandPalette, setShowCommandPalette] = useState<boolean>(false);
  const [showDevPanel, setShowDevPanel] = useState<boolean>(false);

  // Tool switcher
  const setActiveTool = useCallback((tool: ToolType) => {
    setActiveToolState(tool);
    if (tool === 'move') setTransformMode('move');
    else if (tool === 'rotate') setTransformMode('rotate');
    else if (tool === 'scale') setTransformMode('scale');
    else if (tool === 'pivot') setTransformMode('pivot');
  }, []);

  // Undo / Redo
  const [undoStack, setUndoStack] = useState<RootArmatureJson[]>([]);
  const [redoStack, setRedoStack] = useState<RootArmatureJson[]>([]);

  const saveHistoryState = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-30), JSON.parse(JSON.stringify(root))]);
    setRedoStack([]);
  }, [root]);

  const undo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack(r => [...r, JSON.parse(JSON.stringify(root))]);
    setUndoStack(u => u.slice(0, -1));
    setRoot(prev);
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(u => [...u, JSON.parse(JSON.stringify(root))]);
    setRedoStack(r => r.slice(0, -1));
    setRoot(next);
  };

  // Focus Camera on character
  const focusCamera = useCallback(() => {
    const bones = root.bones || [];
    if (bones.length === 0) {
      setCamera({ pos: { x: 0, y: 0 }, zoom: 1 });
      return;
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    bones.forEach(b => {
      minX = Math.min(minX, b.pos.x);
      maxX = Math.max(maxX, b.pos.x);
      minY = Math.min(minY, b.pos.y);
      maxY = Math.max(maxY, b.pos.y);
    });
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setCamera({ pos: { x: centerX, y: centerY }, zoom: 0.85 });
  }, [root.bones]);

  // Add external image file directly as texture
  const addExternalImage = useCallback(async (file: File): Promise<string> => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const cleanName = file.name.replace(/\.[^/.]+$/, '');
    const atlasIdx = root.atlases ? root.atlases.length : 0;

    const newAtlas: TexAtlas = {
      filename: file.name,
      size: { x: img.width, y: img.height },
      imageElement: img,
      dataUrl: url,
    };

    const newTexture = {
      name: cleanName,
      offset: { x: 0, y: 0 },
      size: { x: img.width, y: img.height },
      atlas_idx: atlasIdx,
    };

    saveHistoryState();
    setAtlasImages(prev => {
      const next = new Map(prev);
      next.set(atlasIdx, img);
      return next;
    });

    setRoot(prev => {
      const styles = [...(prev.styles || [])];
      if (styles.length === 0) {
        styles.push({ id: 0, name: 'Default', active: true, textures: [newTexture] });
      } else {
        styles[0] = {
          ...styles[0],
          textures: [...styles[0].textures, newTexture],
        };
      }
      return {
        ...prev,
        atlases: [...(prev.atlases || []), newAtlas],
        styles,
      };
    });

    return cleanName;
  }, [root.atlases, saveHistoryState]);

  // Playback timer
  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!isPlaying) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const currentAnim = root.animations?.find(a => a.id === selectedAnimId);
    const fps = (currentAnim?.fps || 30) * playbackSpeed;
    const frameDuration = 1000 / fps;

    let accumulatedTime = 0;
    lastTimeRef.current = performance.now();

    const loop = (time: number) => {
      const delta = time - lastTimeRef.current;
      lastTimeRef.current = time;
      accumulatedTime += delta;

      if (accumulatedTime >= frameDuration) {
        const framesToAdvance = Math.floor(accumulatedTime / frameDuration);
        accumulatedTime %= frameDuration;

        setCurrentFrame(prev => {
          const maxFrame = Math.max(
            30,
            ...(currentAnim?.keyframes.map(k => k.frame) || [30])
          );
          if (prev + framesToAdvance > maxFrame) {
            if (isLooping) {
              return (prev + framesToAdvance) % (maxFrame + 1);
            } else {
              setIsPlaying(false);
              return maxFrame;
            }
          }
          return prev + framesToAdvance;
        });
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, root.animations, selectedAnimId, playbackSpeed, isLooping]);

  // Load sample file
  const loadSample = async (sampleName: '_skellina.skf' | '_skellington.skf') => {
    try {
      const res = await fetch(`/samples/${sampleName}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch sample: ${res.statusText}`);
      }
      const buffer = await res.arrayBuffer();
      const parsed = await parseSkfBuffer(buffer);

      setRoot(parsed.root);
      setAtlasImages(parsed.atlasImages);

      if (parsed.editorOptions?.camera) {
        setCamera(parsed.editorOptions.camera);
      } else {
        setCamera({ pos: { x: 0, y: 0 }, zoom: 0.6 });
      }

      if (parsed.root.bones.length > 0) {
        setSelectedBoneId(parsed.root.bones[0].id);
      }
      if (parsed.root.animations && parsed.root.animations.length > 0) {
        setSelectedAnimId(parsed.root.animations[0].id);
      }
      setCurrentFrame(0);
      setIsPlaying(false);
      setShowStartupModal(false);
    } catch (e) {
      console.error('Error loading sample', e);
      alert('Could not load sample: ' + (e as Error).message);
    }
  };

  const loadFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const parsed = await parseSkfBuffer(buffer);
      setRoot(parsed.root);
      setAtlasImages(parsed.atlasImages);
      if (parsed.editorOptions?.camera) {
        setCamera(parsed.editorOptions.camera);
      }
      if (parsed.root.bones.length > 0) {
        setSelectedBoneId(parsed.root.bones[0].id);
      }
      if (parsed.root.animations && parsed.root.animations.length > 0) {
        setSelectedAnimId(parsed.root.animations[0].id);
      }
      setCurrentFrame(0);
      setIsPlaying(false);
      setShowStartupModal(false);
    } catch (e) {
      console.error('Error loading file', e);
      alert('Error loading SKF file: ' + (e as Error).message);
    }
  };

  const exportProject = async (filename: string = 'armature.skf') => {
    try {
      const blob = await exportSkfBlob(root, camera, atlasImages);
      downloadBlob(blob, filename);
    } catch (e) {
      console.error('Failed to export', e);
      alert('Failed to export SKF: ' + (e as Error).message);
    }
  };

  const newProject = () => {
    saveHistoryState();
    setRoot(createDefaultRoot());
    setAtlasImages(new Map());
    setSelectedBoneId(0);
    setSelectedAnimId(0);
    setCurrentFrame(0);
    setIsPlaying(false);
    setCamera({ pos: { x: 0, y: 0 }, zoom: 1 });
    setShowStartupModal(false);
  };

  const addBone = (parentId?: number) => {
    saveHistoryState();
    setRoot(prev => {
      const parent = parentId !== undefined ? parentId : (selectedBoneId ?? -1);
      const existingIds = prev.bones.map(b => b.id);
      const newId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 0;
      const highestZ = Math.max(0, ...prev.bones.map(b => b.zindex));

      const newBone: Bone = {
        id: newId,
        name: `Bone ${newId}`,
        parent_id: parent,
        pos: { x: 0, y: parent !== -1 ? -40 : 0 },
        scale: { x: 1, y: 1 },
        rot: 0,
        zindex: highestZ + 1,
        tex: '',
        tint: { r: 1, g: 1, b: 1, a: 1 },
        pivot_pos: { x: 0, y: 0 },
        pivot_rot: 0,
        pivot_scale: { x: 1, y: 1 },
        ik_family_id: -1,
        ik_target_id: -1,
        ik_constraint: 'None',
        ik_mode: 'FABRIK',
      };

      return {
        ...prev,
        bones: [...prev.bones, newBone],
      };
    });
  };

  const deleteBone = (id: number) => {
    saveHistoryState();
    setRoot(prev => {
      const toDelete = new Set<number>([id]);
      // Also collect all children
      let added = true;
      while (added) {
        added = false;
        for (const b of prev.bones) {
          if (!toDelete.has(b.id) && toDelete.has(b.parent_id)) {
            toDelete.add(b.id);
            added = true;
          }
        }
      }

      const filteredBones = prev.bones.filter(b => !toDelete.has(b.id));
      const filteredAnims = prev.animations?.map(a => ({
        ...a,
        keyframes: a.keyframes.filter(k => !toDelete.has(k.bone_id)),
      }));

      return {
        ...prev,
        bones: filteredBones,
        animations: filteredAnims,
      };
    });

    if (selectedBoneId === id) {
      setSelectedBoneId(root.bones.find(b => b.id !== id)?.id ?? null);
    }
  };

  const updateBone = (id: number, updates: Partial<Bone>) => {
    setRoot(prev => ({
      ...prev,
      bones: prev.bones.map(b => (b.id === id ? { ...b, ...updates } : b)),
    }));
  };

  const addAnimation = (name?: string) => {
    saveHistoryState();
    setRoot(prev => {
      const existingIds = (prev.animations || []).map(a => a.id);
      const newId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 0;
      const newAnim: Animation = {
        id: newId,
        name: name || `Animation ${newId + 1}`,
        fps: 30,
        keyframes: [],
      };
      return {
        ...prev,
        animations: [...(prev.animations || []), newAnim],
      };
    });
  };

  const deleteAnimation = (id: number) => {
    saveHistoryState();
    setRoot(prev => {
      const nextAnims = (prev.animations || []).filter(a => a.id !== id);
      return {
        ...prev,
        animations: nextAnims,
      };
    });
    if (selectedAnimId === id) {
      setSelectedAnimId(root.animations?.find(a => a.id !== id)?.id ?? null);
    }
  };

  const recordKeyframe = (
    boneId: number,
    element: AnimElement,
    value?: number,
    valueStr?: string
  ) => {
    if (selectedAnimId === null) return;
    setRoot(prev => {
      const anims = (prev.animations || []).map(a => {
        if (a.id !== selectedAnimId) return a;

        // Check if keyframe already exists at currentFrame for this bone and element
        const existingIdx = a.keyframes.findIndex(
          k => k.bone_id === boneId && k.frame === currentFrame && k.element === element
        );

        const newKf: Keyframe = {
          bone_id: boneId,
          frame: currentFrame,
          element,
          value,
          value_str: valueStr,
          start_handle: { x: 0, y: 0 },
          end_handle: { x: 0, y: 0 },
          handle_preset: 'Linear',
        };

        let newKfs: Keyframe[];
        if (existingIdx !== -1) {
          newKfs = [...a.keyframes];
          newKfs[existingIdx] = { ...newKfs[existingIdx], ...newKf };
        } else {
          newKfs = [...a.keyframes, newKf];
        }

        newKfs.sort((x, y) => x.frame - y.frame);
        return { ...a, keyframes: newKfs };
      });

      return { ...prev, animations: anims };
    });
  };

  const deleteKeyframe = (boneId: number, frame: number, element: AnimElement) => {
    if (selectedAnimId === null) return;
    saveHistoryState();
    setRoot(prev => ({
      ...prev,
      animations: prev.animations?.map(a => {
        if (a.id !== selectedAnimId) return a;
        return {
          ...a,
          keyframes: a.keyframes.filter(
            k => !(k.bone_id === boneId && k.frame === frame && k.element === element)
          ),
        };
      }),
    }));
  };

  // Warnings calculation
  const warnings: WarningItem[] = [];
  // 1. Same Z-index check
  const zindexCounts = new Map<number, number[]>();
  root.bones.forEach(b => {
    if (!zindexCounts.has(b.zindex)) zindexCounts.set(b.zindex, []);
    zindexCounts.get(b.zindex)!.push(b.id);
  });
  zindexCounts.forEach((ids, z) => {
    if (ids.length > 1) {
      warnings.push({
        id: `same-z-${z}`,
        type: 'SameZIndex',
        title: `Same Z-Index (${z})`,
        description: `${ids.length} bones share Z-index ${z}. This can cause rendering flickering.`,
        boneIds: ids,
        fixAction: () => {
          saveHistoryState();
          setRoot(prev => ({
            ...prev,
            bones: prev.bones.map(b => (ids.includes(b.id) ? { ...b, zindex: b.zindex + 1 } : b)),
          }));
        },
      });
    }
  });

  // 2. Missing IK target check
  root.bones.forEach(b => {
    if (b.ik_family_id !== -1 && b.ik_target_id !== -1) {
      const exists = root.bones.some(target => target.id === b.ik_target_id);
      if (!exists) {
        warnings.push({
          id: `no-ik-target-${b.id}`,
          type: 'NoIkTarget',
          title: `No IK Target on ${b.name}`,
          description: `Bone "${b.name}" has IK Target set to #${b.ik_target_id}, which does not exist.`,
          boneIds: [b.id],
          fixAction: () => {
            saveHistoryState();
            updateBone(b.id, { ik_target_id: -1 });
          },
        });
      }
    }
  });

  // 3. Empty styles
  (root.styles || []).forEach(s => {
    if (s.textures.length === 0) {
      warnings.push({
        id: `empty-style-${s.id}`,
        type: 'EmptyStyles',
        title: `Empty Style: ${s.name}`,
        description: `Style "${s.name}" has 0 textures assigned.`,
      });
    }
  });

  return (
    <EditorContext.Provider
      value={{
        root,
        setRoot,
        atlasImages,
        selectedBoneId,
        setSelectedBoneId,
        selectedAnimId,
        setSelectedAnimId,
        currentFrame,
        setCurrentFrame,
        isPlaying,
        setIsPlaying,
        camera,
        setCamera,
        transformMode,
        setTransformMode,
        activeTool,
        setActiveTool,
        onionLayers,
        setOnionLayers,
        showGrid,
        setShowGrid,
        showBonesOnCanvas,
        setShowBonesOnCanvas,
        boneTranslucency,
        setBoneTranslucency,
        language,
        setLanguage,
        t: translations[language],
        advancedMode,
        setAdvancedMode,
        activeZone,
        setActiveZone,
        playbackSpeed,
        setPlaybackSpeed,
        editorMode,
        setEditorMode,
        isLooping,
        setIsLooping,
        focusCamera,
        showStartupModal,
        setShowStartupModal,
        showStylesModal,
        setShowStylesModal,
        showAtlasModal,
        setShowAtlasModal,
        showExportModal,
        setShowExportModal,
        showSettingsModal,
        setShowSettingsModal,
        showWarningsModal,
        setShowWarningsModal,
        showAutoRigModal,
        setShowAutoRigModal,
        showCommandPalette,
        setShowCommandPalette,
        showDevPanel,
        setShowDevPanel,
        warnings,
        loadSample,
        loadFile,
        addExternalImage,
        exportProject,
        newProject,
        addBone,
        deleteBone,
        updateBone,
        addAnimation,
        deleteAnimation,
        recordKeyframe,
        deleteKeyframe,
        undo,
        redo,
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
        saveHistoryState,
      }}
    >
      {children}
    </EditorContext.Provider>
  );
};

export const useEditor = () => {
  const context = useContext(EditorContext);
  if (!context) throw new Error('useEditor must be used within EditorProvider');
  return context;
};
