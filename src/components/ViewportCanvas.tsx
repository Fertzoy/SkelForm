import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useEditor } from '../context/EditorContext';
import { evaluateArmature, EvaluatedBone } from '../utils/animator';
import {
  worldToScreen,
  screenToWorld,
  rotateVec,
  subVec,
  addVec,
  vecDist,
  vecMag,
  radToDeg,
  degToRad,
  Transform2D,
} from '../utils/math';
import { Bone, Texture, Vec2, Camera, ToolType } from '../types/skelform';
import {
  Move,
  RotateCw,
  Maximize2,
  Crosshair,
  ZoomIn,
  ZoomOut,
  Maximize,
  Layers,
  Grid,
  Image as ImageIcon,
  Circle,
  Diamond,
  Pentagon,
  Camera as CameraIcon,
  Compass,
} from 'lucide-react';

export const ViewportCanvas: React.FC = () => {
  const {
    root,
    atlasImages,
    selectedBoneId,
    setSelectedBoneId,
    selectedAnimId,
    currentFrame,
    camera,
    setCamera,
    transformMode,
    setTransformMode,
    activeTool,
    setActiveTool,
    editorMode,
    setEditorMode,
    onionLayers,
    setOnionLayers,
    showGrid,
    setShowGrid,
    showBonesOnCanvas,
    setShowBonesOnCanvas,
    boneTranslucency,
    activeZone,
    setActiveZone,
    focusCamera,
    recordKeyframe,
    updateBone,
    addBone,
    saveHistoryState,
    t,
  } = useEditor();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Local visibility toggles matching the 5 bottom-left icons in SkelForm
  const [showTextures, setShowTextures] = useState(true);
  const [showIkHandles, setShowIkHandles] = useState(true);
  const [showMeshDef, setShowMeshDef] = useState(true);

  // Dragging state
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Vec2>({ x: 0, y: 0 });
  const [isDraggingBone, setIsDraggingBone] = useState(false);
  const [dragStartMouseWorld, setDragStartMouseWorld] = useState<Vec2>({ x: 0, y: 0 });
  const [dragStartBoneProps, setDragStartBoneProps] = useState<{
    pos: Vec2;
    rot: number;
    scale: Vec2;
    pivot_pos: Vec2;
  } | null>(null);

  // Resize canvas to match container
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current && containerRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth;
        canvasRef.current.height = containerRef.current.clientHeight;
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Find texture metadata in active styles
  const findTexture = useCallback(
    (texName: string): Texture | undefined => {
      if (!texName) return undefined;
      for (const style of root.styles || []) {
        if (!style.active) continue;
        const found = style.textures.find(t => t.name === texName);
        if (found) return found;
      }
      return undefined;
    },
    [root.styles]
  );

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;

      // 1. Clear background (SkelForm Dark Charcoal Palette #221f2b)
      ctx.fillStyle = '#221f2b';
      ctx.fillRect(0, 0, width, height);

      // 2. Draw subtle grid and center crosshair
      if (showGrid) {
        drawGrid(ctx, width, height, camera.pos, camera.zoom);
      }

      // 3. Evaluate bone positions for current frame
      const currentAnim = (root.animations || []).find(a => a.id === selectedAnimId);
      const evaluatedBones = evaluateArmature(root.bones || [], currentAnim || null, currentFrame);

      // 4. Onion Skinning (if enabled)
      if (onionLayers && currentAnim) {
        if (currentFrame > 2) {
          const prevBones = evaluateArmature(root.bones, currentAnim, currentFrame - 3);
          drawArmaturePass(ctx, prevBones, width, height, camera, findTexture, atlasImages, '#ef4444');
        }
        if (currentFrame + 3 <= 60) {
          const nextBones = evaluateArmature(root.bones, currentAnim, currentFrame + 3);
          drawArmaturePass(ctx, nextBones, width, height, camera, findTexture, atlasImages, '#3b82f6');
        }
      }

      // 5. Draw Textures Pass
      if (showTextures) {
        drawArmaturePass(
          ctx,
          evaluatedBones,
          width,
          height,
          camera,
          findTexture,
          atlasImages,
          undefined,
          selectedBoneId,
          boneTranslucency
        );
      }

      // 6. Draw Bones & Joints Skeleton Pass (SkelForm colorful limbs)
      if (showBonesOnCanvas) {
        drawSkeletonBones(ctx, evaluatedBones, width, height, camera, selectedBoneId, showIkHandles);
      }

      // 7. Draw Active Selection Ring Gizmo (Signature SkelForm concentric purple ring)
      if (selectedBoneId !== null) {
        const activeBone = evaluatedBones.find(b => b.id === selectedBoneId);
        if (activeBone && !activeBone.hidden) {
          drawGizmo(ctx, activeBone, width, height, camera, transformMode);
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [
    root,
    atlasImages,
    selectedBoneId,
    selectedAnimId,
    currentFrame,
    camera,
    transformMode,
    onionLayers,
    showGrid,
    showBonesOnCanvas,
    showTextures,
    showIkHandles,
    boneTranslucency,
    findTexture,
  ]);

  // Mouse event handling
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseScreen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const mouseWorld = screenToWorld(mouseScreen, camera.pos, camera.zoom, canvas.width, canvas.height);

    // Middle mouse or Hand tool -> Pan
    if (e.button === 1 || e.altKey || activeTool === 'hand') {
      setIsPanning(true);
      setPanStart(mouseScreen);
      return;
    }

    if (e.button === 0) {
      // Check bone joint picking
      const currentAnim = (root.animations || []).find(a => a.id === selectedAnimId);
      const evaluatedBones = evaluateArmature(root.bones || [], currentAnim || null, currentFrame);

      let clickedBoneId: number | null = null;
      for (let i = evaluatedBones.length - 1; i >= 0; i--) {
        const bone = evaluatedBones[i];
        if (bone.hidden || bone.locked) continue;
        const screenPos = worldToScreen(bone.worldPos, camera.pos, camera.zoom, canvas.width, canvas.height);
        const dist = Math.hypot(screenPos.x - mouseScreen.x, screenPos.y - mouseScreen.y);
        if (dist <= 18) {
          clickedBoneId = bone.id;
          break;
        }
      }

      if (clickedBoneId !== null) {
        setSelectedBoneId(clickedBoneId);
        const bone = root.bones.find(b => b.id === clickedBoneId);
        if (bone) {
          setIsDraggingBone(true);
          setDragStartMouseWorld(mouseWorld);
          setDragStartBoneProps({
            pos: { ...bone.pos },
            rot: bone.rot,
            scale: { ...bone.scale },
            pivot_pos: { ...bone.pivot_pos },
          });
          saveHistoryState();
        }
      } else {
        // Click on background: start pan
        setIsPanning(true);
        setPanStart(mouseScreen);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseScreen = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    if (isPanning) {
      const dx = (mouseScreen.x - panStart.x) / camera.zoom;
      const dy = (mouseScreen.y - panStart.y) / camera.zoom;
      setCamera(prev => ({
        ...prev,
        pos: { x: prev.pos.x - dx, y: prev.pos.y + dy },
      }));
      setPanStart(mouseScreen);
      return;
    }

    if (isDraggingBone && selectedBoneId !== null && dragStartBoneProps) {
      const mouseWorld = screenToWorld(mouseScreen, camera.pos, camera.zoom, canvas.width, canvas.height);
      const deltaWorld = subVec(mouseWorld, dragStartMouseWorld);

      if (transformMode === 'move') {
        const newPos = {
          x: dragStartBoneProps.pos.x + deltaWorld.x,
          y: dragStartBoneProps.pos.y + deltaWorld.y,
        };
        updateBone(selectedBoneId, { pos: newPos });
        if (selectedAnimId !== null) {
          recordKeyframe(selectedBoneId, 'PositionX', newPos.x);
          recordKeyframe(selectedBoneId, 'PositionY', newPos.y);
        }
      } else if (transformMode === 'rotate') {
        const initialAngle = Math.atan2(dragStartMouseWorld.y - dragStartBoneProps.pos.y, dragStartMouseWorld.x - dragStartBoneProps.pos.x);
        const currentAngle = Math.atan2(mouseWorld.y - dragStartBoneProps.pos.y, mouseWorld.x - dragStartBoneProps.pos.x);
        const deltaRot = currentAngle - initialAngle;
        const newRot = dragStartBoneProps.rot + deltaRot;
        updateBone(selectedBoneId, { rot: newRot });
        if (selectedAnimId !== null) {
          recordKeyframe(selectedBoneId, 'Rotation', newRot);
        }
      } else if (transformMode === 'scale') {
        const scaleFactor = 1 + deltaWorld.x / 100;
        const newScale = {
          x: Math.max(0.05, dragStartBoneProps.scale.x * scaleFactor),
          y: Math.max(0.05, dragStartBoneProps.scale.y * scaleFactor),
        };
        updateBone(selectedBoneId, { scale: newScale });
        if (selectedAnimId !== null) {
          recordKeyframe(selectedBoneId, 'ScaleX', newScale.x);
          recordKeyframe(selectedBoneId, 'ScaleY', newScale.y);
        }
      }
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setIsDraggingBone(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setCamera(prev => ({
      ...prev,
      zoom: Math.max(0.1, Math.min(10, prev.zoom * zoomFactor)),
    }));
  };

  return (
    <div ref={containerRef} className="relative w-full h-full bg-[#221f2b] overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        className="w-full h-full block cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={e => e.preventDefault()}
      />

      {/* 1. TOP-LEFT: Transform Tools Pill Group: [Move Q] [Rotate W] [Scale E] (Exact SkelForm Style) */}
      <div className="absolute top-3 left-3 z-20 flex items-center bg-[#291f3a] border border-[#3d2d57] rounded-md p-1 shadow-lg gap-1">
        <button
          onClick={() => setActiveTool('move')}
          className={`px-3 py-1 text-xs font-semibold rounded transition flex items-center gap-1.5 ${
            transformMode === 'move'
              ? 'bg-[#593aa3] text-white shadow-sm'
              : 'text-purple-200 hover:text-white hover:bg-white/[0.08]'
          }`}
          title="Инструмент перемещения (Q / W)"
        >
          <span>Move Q</span>
        </button>

        <button
          onClick={() => setActiveTool('rotate')}
          className={`px-3 py-1 text-xs font-semibold rounded transition flex items-center gap-1.5 ${
            transformMode === 'rotate'
              ? 'bg-[#593aa3] text-white shadow-sm'
              : 'text-purple-200 hover:text-white hover:bg-white/[0.08]'
          }`}
          title="Инструмент вращения (W / E)"
        >
          <span>Rotate W</span>
        </button>

        <button
          onClick={() => setActiveTool('scale')}
          className={`px-3 py-1 text-xs font-semibold rounded transition flex items-center gap-1.5 ${
            transformMode === 'scale'
              ? 'bg-[#593aa3] text-white shadow-sm'
              : 'text-purple-200 hover:text-white hover:bg-white/[0.08]'
          }`}
          title="Инструмент масштабирования (E / R)"
        >
          <span>Scale E</span>
        </button>
      </div>

      {/* 2. TOP-RIGHT: Mode Switcher Pill Group: [Armature] [Animation] (Exact SkelForm Style) */}
      <div className="absolute top-3 right-3 z-20 flex items-center bg-[#291f3a] border border-[#3d2d57] rounded-md p-1 shadow-lg gap-1">
        <button
          onClick={() => setEditorMode('armature')}
          className={`px-3.5 py-1 text-xs font-semibold rounded transition ${
            editorMode === 'armature'
              ? 'bg-[#593aa3] text-white shadow-sm'
              : 'text-purple-200 hover:text-white hover:bg-white/[0.08]'
          }`}
          title="Режим скелета и риггинга"
        >
          Armature
        </button>

        <button
          onClick={() => setEditorMode('animation')}
          className={`px-3.5 py-1 text-xs font-semibold rounded transition ${
            editorMode === 'animation'
              ? 'bg-[#593aa3] text-white shadow-sm'
              : 'text-purple-200 hover:text-white hover:bg-white/[0.08]'
          }`}
          title="Режим анимации и таймлайна"
        >
          Animation
        </button>
      </div>

      {/* 3. BOTTOM-LEFT: Vertical 5 Icon Toolbar (Exact SkelForm Style) */}
      <div className="absolute bottom-4 left-4 z-20 flex flex-col bg-[#291f3a] border border-[#3d2d57] rounded-md p-1 shadow-lg gap-1">
        {/* 1. Texture Visibility */}
        <button
          onClick={() => setShowTextures(!showTextures)}
          className={`w-7 h-7 flex items-center justify-center rounded transition ${
            showTextures ? 'text-purple-200 hover:bg-white/[0.08]' : 'text-gray-500 bg-black/20'
          }`}
          title={showTextures ? 'Скрыть текстуры' : 'Показать текстуры'}
        >
          <ImageIcon className="w-4 h-4" />
        </button>

        {/* 2. Bone Skeleton Visibility */}
        <button
          onClick={() => setShowBonesOnCanvas(!showBonesOnCanvas)}
          className={`w-7 h-7 flex items-center justify-center rounded transition ${
            showBonesOnCanvas ? 'text-purple-200 hover:bg-white/[0.08]' : 'text-gray-500 bg-black/20'
          }`}
          title={showBonesOnCanvas ? 'Скрыть кости' : 'Показать кости'}
        >
          <Circle className="w-4 h-4" />
        </button>

        {/* 3. IK Target Handles */}
        <button
          onClick={() => setShowIkHandles(!showIkHandles)}
          className={`w-7 h-7 flex items-center justify-center rounded transition ${
            showIkHandles ? 'text-purple-200 hover:bg-white/[0.08]' : 'text-gray-500 bg-black/20'
          }`}
          title="Отображение инверсной кинематики (IK)"
        >
          <Diamond className="w-4 h-4" />
        </button>

        {/* 4. Mesh Deformation */}
        <button
          onClick={() => setShowMeshDef(!showMeshDef)}
          className={`w-7 h-7 flex items-center justify-center rounded transition ${
            showMeshDef ? 'text-purple-200 hover:bg-white/[0.08]' : 'text-gray-500 bg-black/20'
          }`}
          title="Сетка деформации вершин"
        >
          <Pentagon className="w-4 h-4" />
        </button>

        {/* 5. Grid Toggle */}
        <button
          onClick={() => setShowGrid(!showGrid)}
          className={`w-7 h-7 flex items-center justify-center rounded transition ${
            showGrid ? 'text-purple-200 hover:bg-white/[0.08]' : 'text-gray-500 bg-black/20'
          }`}
          title={showGrid ? 'Скрыть сетку' : 'Показать сетку'}
        >
          <Grid className="w-4 h-4" />
        </button>
      </div>

      {/* 4. BOTTOM-RIGHT: Camera Focus Icon (Exact SkelForm Style) */}
      <div className="absolute bottom-4 right-4 z-20 flex items-center bg-[#291f3a] border border-[#3d2d57] rounded-md p-1 shadow-lg">
        <button
          onClick={focusCamera}
          className="w-7 h-7 flex items-center justify-center text-purple-200 hover:text-white hover:bg-white/[0.08] rounded transition"
          title="Фокус камеры на персонаже (F)"
        >
          <CameraIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// Canvas Drawing Helper Functions

function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  camPos: Vec2,
  zoom: number
) {
  const gridSize = 50 * zoom;
  if (gridSize < 8) return;

  const cx = width / 2;
  const cy = height / 2;

  const startX = ((cx - camPos.x * zoom) % gridSize) - gridSize;
  const startY = ((cy + camPos.y * zoom) % gridSize) - gridSize;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;

  ctx.beginPath();
  for (let x = startX; x < width + gridSize; x += gridSize) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = startY; y < height + gridSize; y += gridSize) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();

  // Origin Axes Crosshair Line (Center)
  const origin = worldToScreen({ x: 0, y: 0 }, camPos, zoom, width, height);
  ctx.strokeStyle = 'rgba(147, 112, 219, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, origin.y);
  ctx.lineTo(width, origin.y);
  ctx.moveTo(origin.x, 0);
  ctx.lineTo(origin.x, height);
  ctx.stroke();
}

function drawArmaturePass(
  ctx: CanvasRenderingContext2D,
  bones: EvaluatedBone[],
  width: number,
  height: number,
  camera: Camera,
  findTexture: (name: string) => Texture | undefined,
  atlasImages: Map<number, HTMLImageElement>,
  tintOverride?: string,
  selectedId?: number | null,
  translucency: number = 0.25
) {
  // Sort bones by Z-index
  const sortedBones = [...bones].sort((a, b) => a.zindex - b.zindex);

  for (const bone of sortedBones) {
    if (bone.hidden) continue;

    const tex = findTexture(bone.tex);
    const atlasImg = tex ? atlasImages.get(tex.atlas_idx ?? 0) : null;

    if (!tex || !atlasImg) continue;

    ctx.save();

    let alpha = 1;
    if (tintOverride) {
      alpha = 0.35;
    } else if (selectedId !== undefined && selectedId !== null && bone.id !== selectedId) {
      alpha = translucency;
    }

    ctx.globalAlpha = alpha * (bone.tint?.a ?? 1);

    const screenPos = worldToScreen(bone.worldPos, camera.pos, camera.zoom, width, height);

    ctx.translate(screenPos.x, screenPos.y);
    ctx.rotate(-bone.worldRot);

    const scaleX = bone.worldScale.x * camera.zoom;
    const scaleY = bone.worldScale.y * camera.zoom;
    ctx.scale(scaleX, scaleY);

    const pivotX = tex.size.x * bone.pivot_pos.x;
    const pivotY = tex.size.y * -bone.pivot_pos.y;

    const drawW = tex.size.x;
    const drawH = tex.size.y;
    const drawX = -drawW / 2 + pivotX;
    const drawY = -drawH / 2 + pivotY;

    if (tintOverride) {
      ctx.fillStyle = tintOverride;
      ctx.fillRect(drawX, drawY, drawW, drawH);
    } else {
      ctx.drawImage(
        atlasImg,
        tex.offset.x,
        tex.offset.y,
        tex.size.x,
        tex.size.y,
        drawX,
        drawY,
        drawW,
        drawH
      );
    }

    ctx.restore();
  }
}

function drawSkeletonBones(
  ctx: CanvasRenderingContext2D,
  bones: EvaluatedBone[],
  width: number,
  height: number,
  camera: Camera,
  selectedId: number | null,
  showIk: boolean
) {
  const boneMap = new Map<number, EvaluatedBone>();
  bones.forEach(b => boneMap.set(b.id, b));

  for (const bone of bones) {
    if (bone.hidden) continue;

    const p1 = worldToScreen(bone.worldPos, camera.pos, camera.zoom, width, height);

    // Pick limb color based on group_color or bone name
    let limbColor = '#eab308'; // Default yellow
    if (bone.group_color) {
      limbColor = `rgb(${bone.group_color.r}, ${bone.group_color.g}, ${bone.group_color.b})`;
    } else {
      const lower = bone.name.toLowerCase();
      if (lower.includes('right') || lower.includes('shoulder')) limbColor = '#e2ea00'; // Yellow
      else if (lower.includes('left')) limbColor = '#3b82f6'; // Blue
      else if (lower.includes('leg') || lower.includes('foot')) limbColor = '#f97316'; // Orange
      else if (lower.includes('torso') || lower.includes('spine') || lower.includes('neck')) limbColor = '#06b6d4'; // Cyan
      else limbColor = '#a855f7'; // Purple
    }

    // Connect to parent
    if (bone.parent_id !== -1 && boneMap.has(bone.parent_id)) {
      const parent = boneMap.get(bone.parent_id)!;
      const p0 = worldToScreen(parent.worldPos, camera.pos, camera.zoom, width, height);

      const isSelected = bone.id === selectedId || parent.id === selectedId;

      ctx.beginPath();
      ctx.strokeStyle = isSelected ? '#a87ffb' : limbColor;
      ctx.lineWidth = isSelected ? 3.5 : 2.5;
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }

    // Connect to IK target if driven by IK
    if (showIk && bone.ik_family_id !== -1 && bone.ik_target_id !== -1 && boneMap.has(bone.ik_target_id)) {
      const target = boneMap.get(bone.ik_target_id)!;
      const tPos = worldToScreen(target.worldPos, camera.pos, camera.zoom, width, height);

      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(tPos.x, tPos.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw Joint Circle Dot
    const isSelected = bone.id === selectedId;
    const jointRadius = isSelected ? 6.5 : 5;

    ctx.beginPath();
    ctx.arc(p1.x, p1.y, jointRadius, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? '#e2ea00' : limbColor;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawGizmo(
  ctx: CanvasRenderingContext2D,
  bone: EvaluatedBone,
  width: number,
  height: number,
  camera: Camera,
  mode: string
) {
  const p = worldToScreen(bone.worldPos, camera.pos, camera.zoom, width, height);

  ctx.save();
  ctx.translate(p.x, p.y);

  // 1. Signature SkelForm Concentric Purple Rings (matching image.png)
  const innerR = 36;
  const outerR = 52;

  // Inner translucent lavender/purple fill
  ctx.beginPath();
  ctx.arc(0, 0, innerR, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(168, 127, 251, 0.32)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(190, 155, 255, 0.75)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Outer ring with radial tick marks
  ctx.beginPath();
  ctx.arc(0, 0, outerR, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(190, 155, 255, 0.85)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 8 Radial Ticks
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
    const x1 = Math.cos(a) * (outerR - 5);
    const y1 = Math.sin(a) * (outerR - 5);
    const x2 = Math.cos(a) * (outerR + 5);
    const y2 = Math.sin(a) * (outerR + 5);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // 2. Specific Transform Handles
  if (mode === 'move') {
    const arrowLen = 55;

    // X Axis (Red)
    ctx.strokeStyle = '#ef4444';
    ctx.fillStyle = '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(arrowLen, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(arrowLen + 7, 0);
    ctx.lineTo(arrowLen - 2, -5);
    ctx.lineTo(arrowLen - 2, 5);
    ctx.closePath();
    ctx.fill();

    // Y Axis (Green, pointing up in world space = negative canvas Y)
    ctx.strokeStyle = '#22c55e';
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -arrowLen);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -arrowLen - 7);
    ctx.lineTo(-5, -arrowLen + 2);
    ctx.lineTo(5, -arrowLen + 2);
    ctx.closePath();
    ctx.fill();
  } else if (mode === 'rotate') {
    // Orientation needle pointing in bone rotation direction
    ctx.rotate(-bone.worldRot);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(outerR + 8, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(outerR + 8, 0, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  } else if (mode === 'scale') {
    const boxDist = 50;
    ctx.strokeStyle = '#f472b6';
    ctx.fillStyle = '#f472b6';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(boxDist, 0);
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -boxDist);
    ctx.stroke();

    ctx.fillRect(boxDist - 4, -4, 8, 8);
    ctx.fillRect(-4, -boxDist - 4, 8, 8);
  }

  ctx.restore();
}
