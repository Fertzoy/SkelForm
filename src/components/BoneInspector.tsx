import React, { useState } from 'react';
import { useEditor } from '../context/EditorContext';
import { Bone, JointConstraint, InverseKinematicsMode } from '../types/skelform';
import { radToDeg, degToRad } from '../utils/math';
import {
  ChevronDown,
  ChevronRight,
  Trash2,
  Lock,
  Unlock,
  ArrowUp,
  Image as ImageIcon,
  Compass,
  Pentagon,
  Sparkles,
} from 'lucide-react';

export const BoneInspector: React.FC = () => {
  const {
    root,
    selectedBoneId,
    updateBone,
    deleteBone,
    saveHistoryState,
    recordKeyframe,
    selectedAnimId,
    currentFrame,
    t,
  } = useEditor();

  const [visualsOpen, setVisualsOpen] = useState(true);
  const [meshOpen, setMeshOpen] = useState(true);
  const [ikOpen, setIkOpen] = useState(true);
  const [physicsOpen, setPhysicsOpen] = useState(true);

  const bone = root.bones.find(b => b.id === selectedBoneId);

  if (!bone) {
    return (
      <aside className="w-72 h-full bg-[#1e172a] border-l border-[#2d233e] p-4 text-xs text-gray-500 flex flex-col items-center justify-center text-center select-none shrink-0 z-10">
        <div className="w-12 h-12 rounded-full bg-[#291f3a] border border-[#3b2d56] flex items-center justify-center mb-3 text-purple-400">
          🦴
        </div>
        <p className="font-medium text-gray-400">Кость не выбрана</p>
        <p className="text-[11px] text-gray-500 mt-1">
          Выберите кость в дереве Armature или кликните по ней во вьюпорте.
        </p>
      </aside>
    );
  }

  // Collect all available textures across styles
  const availableTextures: string[] = [''];
  (root.styles || []).forEach(style => {
    style.textures.forEach(tex => {
      if (!availableTextures.includes(tex.name)) availableTextures.push(tex.name);
    });
  });

  const handlePropChange = (field: keyof Bone, val: any) => {
    saveHistoryState();
    updateBone(bone.id, { [field]: val });

    // Auto-record keyframe if timeline is active
    if (selectedAnimId !== null && currentFrame >= 0) {
      if (field === 'pos') {
        recordKeyframe(bone.id, 'PositionX', val.x);
        recordKeyframe(bone.id, 'PositionY', val.y);
      } else if (field === 'rot') {
        recordKeyframe(bone.id, 'Rotation', val);
      } else if (field === 'scale') {
        recordKeyframe(bone.id, 'ScaleX', val.x);
        recordKeyframe(bone.id, 'ScaleY', val.y);
      } else if (field === 'tex') {
        recordKeyframe(bone.id, 'Texture', undefined, val);
      } else if (field === 'zindex') {
        recordKeyframe(bone.id, 'Zindex', val);
      }
    }
  };

  const raiseZIndex = () => {
    saveHistoryState();
    const currentZ = bone.zindex;
    const updated = root.bones.map(b => (b.zindex >= currentZ ? { ...b, zindex: b.zindex + 1 } : b));
    updateBone(bone.id, { zindex: currentZ + 1 });
  };

  // Convert group color to hex for input
  const groupColorHex = bone.group_color
    ? `#${bone.group_color.r.toString(16).padStart(2, '0')}${bone.group_color.g
        .toString(16)
        .padStart(2, '0')}${bone.group_color.b.toString(16).padStart(2, '0')}`
    : '#e2ea00';

  const handleColorChange = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16) || 0;
    const g = parseInt(hex.slice(3, 5), 16) || 0;
    const b = parseInt(hex.slice(5, 7), 16) || 0;
    handlePropChange('group_color', { r, g, b, a: 1 });
  };

  return (
    <aside className="w-72 h-full bg-[#1e172a] border-l border-[#2d233e] flex flex-col text-xs text-gray-300 select-none overflow-y-auto shrink-0 z-10">
      {/* 1. Header: "Bone" title & yellow color swatch / lock / trash (Exact SkelForm Style) */}
      <div className="p-3 border-b border-[#2d233e] flex items-center justify-between">
        <h2 className="text-lg font-bold text-white tracking-wide">Bone</h2>

        <div className="flex items-center gap-2">
          {/* Yellow Group Color Swatch */}
          <label
            className="w-8 h-4.5 rounded cursor-pointer border border-white/20 block shadow-sm"
            style={{ backgroundColor: groupColorHex }}
            title="Цвет кости / группы"
          >
            <input
              type="color"
              value={groupColorHex}
              onChange={e => handleColorChange(e.target.value)}
              className="opacity-0 w-0 h-0 block"
            />
          </label>

          {/* Lock Button */}
          <button
            onClick={() => handlePropChange('locked', !bone.locked)}
            className="p-1 hover:text-white transition"
            title={bone.locked ? 'Заблокировано' : 'Разблокировано'}
          >
            {bone.locked ? (
              <Lock className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Unlock className="w-3.5 h-3.5 text-gray-400" />
            )}
          </button>

          {/* Delete Bone Button */}
          <button
            onClick={() => deleteBone(bone.id)}
            className="p-1 hover:text-red-400 text-gray-400 transition"
            title="Удалить кость (Del)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Transform Inputs (Name, Position X/Y, Scale W/H, Rotation) */}
      <div className="p-3 space-y-2.5 border-b border-[#2d233e]">
        {/* Name */}
        <div className="flex items-center gap-2">
          <span className="w-16 text-[11px] text-gray-400 font-medium shrink-0">Name:</span>
          <input
            type="text"
            value={bone.name}
            onChange={e => handlePropChange('name', e.target.value)}
            className="flex-1 bg-[#140f1f] border border-[#382a50] rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-purple-400"
          />
        </div>

        {/* Position: X [ 70.42 ] Y [ 464.2 ] */}
        <div className="flex items-center gap-2">
          <span className="w-16 text-[11px] text-gray-400 font-medium shrink-0">Position:</span>
          <div className="flex-1 grid grid-cols-2 gap-1.5">
            <div className="flex items-center gap-1 bg-[#140f1f] border border-[#382a50] rounded px-1.5 py-0.5">
              <span className="text-[10px] text-gray-400">X</span>
              <input
                type="number"
                step="0.5"
                value={Math.round(bone.pos.x * 100) / 100}
                onChange={e =>
                  handlePropChange('pos', { ...bone.pos, x: parseFloat(e.target.value) || 0 })
                }
                className="w-full bg-transparent text-right text-white text-xs focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-1 bg-[#140f1f] border border-[#382a50] rounded px-1.5 py-0.5">
              <span className="text-[10px] text-gray-400">Y</span>
              <input
                type="number"
                step="0.5"
                value={Math.round(bone.pos.y * 100) / 100}
                onChange={e =>
                  handlePropChange('pos', { ...bone.pos, y: parseFloat(e.target.value) || 0 })
                }
                className="w-full bg-transparent text-right text-white text-xs focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Scale: W [ 1 ] H [ 1 ] */}
        <div className="flex items-center gap-2">
          <span className="w-16 text-[11px] text-gray-400 font-medium shrink-0">Scale:</span>
          <div className="flex-1 grid grid-cols-2 gap-1.5">
            <div className="flex items-center gap-1 bg-[#140f1f] border border-[#382a50] rounded px-1.5 py-0.5">
              <span className="text-[10px] text-gray-400">W</span>
              <input
                type="number"
                step="0.1"
                value={Math.round(bone.scale.x * 100) / 100}
                onChange={e =>
                  handlePropChange('scale', { ...bone.scale, x: parseFloat(e.target.value) || 1 })
                }
                className="w-full bg-transparent text-right text-white text-xs focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-1 bg-[#140f1f] border border-[#382a50] rounded px-1.5 py-0.5">
              <span className="text-[10px] text-gray-400">H</span>
              <input
                type="number"
                step="0.1"
                value={Math.round(bone.scale.y * 100) / 100}
                onChange={e =>
                  handlePropChange('scale', { ...bone.scale, y: parseFloat(e.target.value) || 1 })
                }
                className="w-full bg-transparent text-right text-white text-xs focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Rotation */}
        <div className="flex items-center gap-2">
          <span className="w-16 text-[11px] text-gray-400 font-medium shrink-0">Rotation:</span>
          <div className="flex-1 bg-[#140f1f] border border-[#382a50] rounded px-2 py-0.5 flex items-center">
            <input
              type="number"
              step="1"
              value={Math.round(radToDeg(bone.rot))}
              onChange={e => handlePropChange('rot', degToRad(parseFloat(e.target.value) || 0))}
              className="w-full bg-transparent text-right text-white text-xs focus:outline-none"
            />
            <span className="text-[10px] text-gray-500 ml-1">°</span>
          </div>
        </div>
      </div>

      {/* 3. Collapsible Sections */}
      <div className="p-2 space-y-2">
        {/* Section 1: Texture & Visuals */}
        <div className="border border-[#2d233e] rounded bg-[#231c31] overflow-hidden">
          <button
            onClick={() => setVisualsOpen(!visualsOpen)}
            className="w-full px-2.5 py-1.5 bg-[#2a1f3d] flex items-center justify-between text-xs font-semibold text-gray-200 hover:text-white"
          >
            <div className="flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-purple-300" />
              <span>Texture & Visuals</span>
            </div>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${visualsOpen ? '' : '-rotate-90'}`}
            />
          </button>

          {visualsOpen && (
            <div className="p-2.5 space-y-2">
              {/* Texture dropdown */}
              <div className="flex items-center gap-2">
                <span className="w-16 text-[11px] text-gray-400">Texture:</span>
                <select
                  value={bone.tex}
                  onChange={e => handlePropChange('tex', e.target.value)}
                  className="flex-1 bg-[#4d3284] border border-purple-400/30 rounded px-2 py-1 text-white text-xs focus:outline-none"
                >
                  <option key="bi-tex-none" value="">None</option>
                  {availableTextures
                    .filter(t => t.length > 0)
                    .map((t, idx) => (
                      <option key={`bi-tex-item-${t}-${idx}`} value={t}>
                        {t}
                      </option>
                    ))}
                </select>
              </div>

              {/* Z-Index */}
              <div className="flex items-center gap-2">
                <span className="w-16 text-[11px] text-gray-400">Z-Index:</span>
                <div className="flex-1 flex items-center gap-1">
                  <input
                    type="number"
                    value={bone.zindex}
                    onChange={e => handlePropChange('zindex', parseInt(e.target.value) || 0)}
                    className="flex-1 bg-[#140f1f] border border-[#382a50] rounded px-2 py-0.5 text-right text-white text-xs focus:outline-none"
                  />
                  <button
                    onClick={raiseZIndex}
                    className="px-2 py-1 bg-[#4d3284] hover:bg-[#603fa6] text-white rounded text-[10px] flex items-center justify-center font-bold"
                    title="Поднять слой выше"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Tint */}
              <div className="flex items-center gap-2">
                <span className="w-16 text-[11px] text-gray-400">Tint:</span>
                <div className="flex-1 flex items-center gap-2">
                  <div className="w-full h-5 rounded bg-white border border-gray-400/30 flex items-center justify-center text-[10px] text-gray-700 font-mono">
                    #ffffff
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Mesh Deformation */}
        <div className="border border-[#2d233e] rounded bg-[#231c31] overflow-hidden">
          <button
            onClick={() => setMeshOpen(!meshOpen)}
            className="w-full px-2.5 py-1.5 bg-[#2a1f3d] flex items-center justify-between text-xs font-semibold text-gray-200 hover:text-white"
          >
            <div className="flex items-center gap-1.5">
              <Pentagon className="w-3.5 h-3.5 text-emerald-400" />
              <span>Mesh Deformation</span>
            </div>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${meshOpen ? '' : '-rotate-90'}`}
            />
          </button>

          {meshOpen && (
            <div className="p-2.5 space-y-2">
              <button
                className="w-full py-1.5 px-3 bg-[#4d3284] hover:bg-[#603fa6] text-white text-xs font-semibold rounded transition"
              >
                Edit Vertices B
              </button>

              <div className="flex items-center gap-1">
                <button className="flex-1 py-1 bg-[#1c1628] hover:bg-[#281f3a] text-gray-300 border border-[#382a50] rounded text-[11px]">
                  Trace
                </button>
                <button className="flex-1 py-1 bg-[#1c1628] hover:bg-[#281f3a] text-gray-300 border border-[#382a50] rounded text-[11px]">
                  Center
                </button>
                <button className="flex-1 py-1 bg-[#1c1628] hover:bg-[#281f3a] text-gray-300 border border-[#382a50] rounded text-[11px]">
                  Reset
                </button>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <span className="w-16 text-[11px] text-gray-400">Binds:</span>
                <select className="flex-1 bg-[#140f1f] border border-[#382a50] rounded px-2 py-1 text-gray-200 text-xs focus:outline-none">
                  <option key="bi-binds-none">None</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Section 3: Inverse Kinematics */}
        <div className="border border-[#2d233e] rounded bg-[#231c31] overflow-hidden">
          <button
            onClick={() => setIkOpen(!ikOpen)}
            className="w-full px-2.5 py-1.5 bg-[#2a1f3d] flex items-center justify-between text-xs font-semibold text-gray-200 hover:text-white"
          >
            <div className="flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-amber-400" />
              <span>Inverse Kinematics</span>
            </div>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${ikOpen ? '' : '-rotate-90'}`}
            />
          </button>

          {ikOpen && (
            <div className="p-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-20 text-[11px] text-gray-400">Family Index:</span>
                <select
                  value={bone.ik_family_id}
                  onChange={e => handlePropChange('ik_family_id', parseInt(e.target.value) || -1)}
                  className="flex-1 bg-[#4d3284] border border-purple-400/30 rounded px-2 py-1 text-white text-xs focus:outline-none"
                >
                  <option key="bi-ik-none" value={-1}>None</option>
                  <option key="bi-ik-fam-0" value={0}>Family #0</option>
                  <option key="bi-ik-fam-1" value={1}>Family #1</option>
                  <option key="bi-ik-fam-2" value={2}>Family #2</option>
                  <option key="bi-ik-fam-3" value={3}>Family #3</option>
                  <option key="bi-ik-fam-4" value={4}>Family #4</option>
                </select>
              </div>

              {bone.ik_family_id !== -1 && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="w-20 text-[11px] text-gray-400">IK Target:</span>
                    <select
                      value={bone.ik_target_id}
                      onChange={e => handlePropChange('ik_target_id', parseInt(e.target.value) || -1)}
                      className="flex-1 bg-[#140f1f] border border-[#382a50] rounded px-2 py-1 text-gray-200 text-xs focus:outline-none"
                    >
                      <option key="bi-ikt-none" value={-1}>[None - Unbound]</option>
                      {root.bones
                        .filter(b => b.id !== bone.id)
                        .map(b => (
                          <option key={`bi-ikt-bone-${b.id}`} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="w-20 text-[11px] text-gray-400">Constraint:</span>
                    <select
                      value={bone.ik_constraint || 'None'}
                      onChange={e => handlePropChange('ik_constraint', e.target.value as JointConstraint)}
                      className="flex-1 bg-[#140f1f] border border-[#382a50] rounded px-2 py-1 text-gray-200 text-xs focus:outline-none"
                    >
                      <option key="bi-jc-none" value="None">None</option>
                      <option key="bi-jc-cw" value="Clockwise">Clockwise (CW)</option>
                      <option key="bi-jc-ccw" value="CounterClockwise">Counter-Clockwise (CCW)</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Section 4: Physics */}
        <div className="border border-[#2d233e] rounded bg-[#231c31] overflow-hidden">
          <button
            onClick={() => setPhysicsOpen(!physicsOpen)}
            className="w-full px-2.5 py-1.5 bg-[#2a1f3d] flex items-center justify-between text-xs font-semibold text-gray-200 hover:text-white"
          >
            <span>Physics</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${physicsOpen ? '' : '-rotate-90'}`}
            />
          </button>

          {physicsOpen && (
            <div className="p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-400">Resistance:</span>
                <input
                  type="number"
                  defaultValue="0"
                  className="w-20 bg-[#140f1f] border border-[#382a50] rounded px-2 py-0.5 text-right text-white text-xs focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-400">Pos. Elasticity:</span>
                <input
                  type="number"
                  defaultValue="0"
                  className="w-20 bg-[#140f1f] border border-[#382a50] rounded px-2 py-0.5 text-right text-white text-xs focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-400">Scale Elasticity:</span>
                <input
                  type="number"
                  defaultValue="0"
                  className="w-20 bg-[#140f1f] border border-[#382a50] rounded px-2 py-0.5 text-right text-white text-xs focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-400">Rot. Bounce:</span>
                <input
                  type="number"
                  defaultValue="0"
                  className="w-20 bg-[#140f1f] border border-[#382a50] rounded px-2 py-0.5 text-right text-white text-xs focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
