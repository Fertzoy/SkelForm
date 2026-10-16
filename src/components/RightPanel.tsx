import React, { useState, useRef } from 'react';
import { useEditor } from '../context/EditorContext';
import { Bone, JointConstraint, InverseKinematicsMode } from '../types/skelform';
import { radToDeg, degToRad } from '../utils/math';
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Sliders,
  ChevronUp,
  Search,
  Upload,
  FolderOpen,
  Sparkles,
} from 'lucide-react';

export const RightPanel: React.FC = () => {
  const {
    root,
    setRoot,
    selectedBoneId,
    setSelectedBoneId,
    addBone,
    deleteBone,
    updateBone,
    saveHistoryState,
    recordKeyframe,
    selectedAnimId,
    currentFrame,
    addExternalImage,
    advancedMode,
    t,
  } = useEditor();

  const [activeTab, setActiveTab] = useState<'hierarchy' | 'textures'>('hierarchy');
  const [objectsExpanded, setObjectsExpanded] = useState(true);
  const [propsExpanded, setPropsExpanded] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const bones = root.bones || [];
  const selectedBone = bones.find(b => b.id === selectedBoneId);

  // Group bones for hierarchy tree
  const buildTree = () => {
    const boneMap = new Map<number, Bone>();
    const childrenMap = new Map<number, Bone[]>();

    bones.forEach(b => {
      boneMap.set(b.id, b);
      childrenMap.set(b.id, []);
    });

    const roots: Bone[] = [];
    bones.forEach(b => {
      if (b.parent_id === -1 || !boneMap.has(b.parent_id)) {
        roots.push(b);
      } else {
        childrenMap.get(b.parent_id)?.push(b);
      }
    });

    return { roots, childrenMap };
  };

  const { roots, childrenMap } = buildTree();

  // Textures collection
  const availableTextures: string[] = [];
  (root.styles || []).forEach(style => {
    if (style.active) {
      style.textures.forEach(tex => {
        if (!availableTextures.includes(tex.name)) availableTextures.push(tex.name);
      });
    }
  });

  const handlePropChange = (field: keyof Bone, val: any) => {
    if (!selectedBone) return;
    saveHistoryState();
    updateBone(selectedBone.id, { [field]: val });

    if (selectedAnimId !== null && currentFrame >= 0) {
      if (field === 'pos') {
        recordKeyframe(selectedBone.id, 'PositionX', val.x);
        recordKeyframe(selectedBone.id, 'PositionY', val.y);
      } else if (field === 'rot') {
        recordKeyframe(selectedBone.id, 'Rotation', val);
      } else if (field === 'scale') {
        recordKeyframe(selectedBone.id, 'ScaleX', val.x);
        recordKeyframe(selectedBone.id, 'ScaleY', val.y);
      } else if (field === 'tex') {
        recordKeyframe(selectedBone.id, 'Texture', undefined, val);
      } else if (field === 'zindex') {
        recordKeyframe(selectedBone.id, 'Zindex', val);
      }
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const texName = await addExternalImage(file);
      if (selectedBone) {
        handlePropChange('tex', texName);
      }
    }
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const renderBoneItem = (bone: Bone, depth: number = 0) => {
    if (searchQuery && !bone.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return null;
    }

    const children = childrenMap.get(bone.id) || [];
    const hasChildren = children.length > 0;
    const isSelected = bone.id === selectedBoneId;
    const isFolded = !!bone.folded;

    return (
      <div key={`bone-node-${bone.id}`} className="flex flex-col">
        <div
          onClick={() => {
            setSelectedBoneId(bone.id);
            setConfirmDelete(false);
          }}
          className={`group flex items-center justify-between px-3 py-2 rounded-2xl cursor-pointer transition select-none text-xs ${
            isSelected
              ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white font-semibold shadow-md shadow-indigo-500/20'
              : 'hover:bg-white/[0.05] text-zinc-300'
          }`}
          style={{ paddingLeft: `${Math.max(10, depth * 14 + 10)}px` }}
        >
          <div className="flex items-center gap-2 truncate">
            {hasChildren ? (
              <button
                onClick={e => {
                  e.stopPropagation();
                  updateBone(bone.id, { folded: !isFolded });
                }}
                className="p-0.5 text-zinc-400 hover:text-white"
              >
                {isFolded ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <div className="w-3.5" />
            )}

            <span className="truncate max-w-[125px]">{bone.name}</span>

            {bone.tex && (
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded-md font-mono ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-white/[0.06] text-zinc-400'
                }`}
              >
                img
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
            <button
              onClick={e => {
                e.stopPropagation();
                saveHistoryState();
                updateBone(bone.id, { hidden: !bone.hidden });
              }}
              className="p-1 hover:text-white text-zinc-400"
              title={bone.hidden ? 'Показать' : 'Скрыть'}
            >
              {bone.hidden ? <EyeOff className="w-3.5 h-3.5 text-red-400" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {!isFolded && children.length > 0 && (
          <div className="flex flex-col">
            {children.map(child => renderBoneItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="absolute right-5 top-20 bottom-24 z-20 w-80 flex flex-col gap-3 pointer-events-none select-none">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleImageUpload}
      />

      {/* CARD 1: «ОБЪЕКТЫ» (Дерево + Картинки) */}
      <div className="bg-[#141722]/90 backdrop-blur-2xl border border-white/[0.08] rounded-3xl shadow-2xl overflow-hidden flex flex-col pointer-events-auto transition-all max-h-[50%]">
        {/* Card Header */}
        <div
          onClick={() => setObjectsExpanded(!objectsExpanded)}
          className="h-12 px-5 flex items-center justify-between cursor-pointer border-b border-white/[0.06] hover:bg-white/[0.02] transition"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-bold text-white tracking-wide">{t.objects}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-zinc-400 font-mono">
              {bones.length}
            </span>
          </div>

          <div className="flex items-center gap-2 text-zinc-400">
            <button
              onClick={e => {
                e.stopPropagation();
                addBone(selectedBoneId ?? undefined);
              }}
              className="p-1.5 hover:text-white rounded-xl hover:bg-white/[0.06] transition"
              title="Добавить дочернюю кость"
            >
              <Plus className="w-4 h-4 text-emerald-400" />
            </button>
            {objectsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>

        {objectsExpanded && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Tabs (Иерархия / Картинки) */}
            <div className="px-4 pt-3 pb-2 flex items-center gap-1.5">
              <button
                onClick={() => setActiveTab('hierarchy')}
                className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition ${
                  activeTab === 'hierarchy'
                    ? 'bg-[#252b3d] text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {t.hierarchy}
              </button>
              <button
                onClick={() => setActiveTab('textures')}
                className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                  activeTab === 'textures'
                    ? 'bg-[#252b3d] text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>{t.images}</span>
              </button>
            </div>

            {/* TAB CONTENT */}
            {activeTab === 'hierarchy' ? (
              <div className="flex-1 flex flex-col min-h-0 px-3 pb-3">
                {/* Search input */}
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder={t.searchObjects}
                    className="w-full bg-[#0e1017] border border-white/[0.06] rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Tree List */}
                <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-0.5">
                  {roots.length === 0 ? (
                    <div className="py-6 text-center text-xs text-zinc-500">
                      {t.noObjectsFound}
                    </div>
                  ) : (
                    roots.map(r => renderBoneItem(r, 0))
                  )}
                </div>
              </div>
            ) : (
              /* TAB: ТЕКСТУРЫ И КАРТИНКИ */
              <div className="flex-1 flex flex-col min-h-0 px-4 pb-4 gap-3 overflow-y-auto">
                {/* Большая кнопка добавления картинки */}
                <button
                  onClick={() => imageInputRef.current?.click()}
                  className="w-full py-3 bg-gradient-to-r from-indigo-600/30 to-purple-600/30 hover:from-indigo-600/40 hover:to-purple-600/40 border border-dashed border-indigo-400/40 rounded-2xl text-xs font-semibold text-indigo-300 hover:text-white transition flex items-center justify-center gap-2 shadow-sm"
                >
                  <Upload className="w-4 h-4 text-indigo-400" />
                  <span>{t.addImage}</span>
                </button>

                {/* Available textures list */}
                <div className="flex flex-col gap-1.5">
                  {availableTextures.length === 0 ? (
                    <div className="py-4 text-center text-xs text-zinc-500">
                      {t.dragImagesHere}
                    </div>
                  ) : (
                    availableTextures.map((texName, i) => (
                      <div
                        key={`tex-avail-${texName}-${i}`}
                        onClick={() => {
                          if (selectedBone) handlePropChange('tex', texName);
                        }}
                        className={`px-3 py-2 rounded-xl border flex items-center justify-between cursor-pointer transition text-xs ${
                          selectedBone?.tex === texName
                            ? 'bg-indigo-600/20 border-indigo-500/50 text-white'
                            : 'bg-[#0e1017] border-white/[0.06] hover:border-white/[0.12] text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <ImageIcon className="w-3.5 h-3.5 text-zinc-400" />
                          <span className="truncate">{texName}</span>
                        </div>
                        {selectedBone?.tex === texName && (
                          <span className="text-[10px] text-indigo-400 font-semibold">Назначено</span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CARD 2: «СВОЙСТВА» (Позиция, Поворот, Размер + Дополнительно) */}
      <div className="bg-[#141722]/90 backdrop-blur-2xl border border-white/[0.08] rounded-3xl shadow-2xl overflow-hidden flex flex-col pointer-events-auto transition-all flex-1 min-h-0">
        {/* Card Header */}
        <div
          onClick={() => setPropsExpanded(!propsExpanded)}
          className="h-12 px-5 flex items-center justify-between cursor-pointer border-b border-white/[0.06] hover:bg-white/[0.02] transition shrink-0"
        >
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-bold text-white tracking-wide">{t.properties}</span>
          </div>
          <div className="text-zinc-400">
            {propsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>

        {propsExpanded && (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5 text-xs">
            {!selectedBone ? (
              <div className="py-8 text-center text-zinc-500 text-xs">
                {t.selectAnObject}
              </div>
            ) : (
              <>
                {/* Bone Name */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-zinc-400">{t.name}</label>
                  <input
                    type="text"
                    value={selectedBone.name}
                    onChange={e => handlePropChange('name', e.target.value)}
                    className="w-full bg-[#0e1017] border border-white/[0.08] rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-indigo-500 font-medium"
                  />
                </div>

                {/* Position (X, Y) */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-zinc-400">{t.position}</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center bg-[#0e1017] border border-white/[0.08] rounded-xl px-2.5 py-1">
                      <span className="text-zinc-500 font-mono text-[11px] mr-2">X</span>
                      <input
                        type="number"
                        step="1"
                        value={Math.round(selectedBone.pos.x * 10) / 10}
                        onChange={e =>
                          handlePropChange('pos', {
                            ...selectedBone.pos,
                            x: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full bg-transparent text-white focus:outline-none font-mono text-xs"
                      />
                    </div>
                    <div className="flex items-center bg-[#0e1017] border border-white/[0.08] rounded-xl px-2.5 py-1">
                      <span className="text-zinc-500 font-mono text-[11px] mr-2">Y</span>
                      <input
                        type="number"
                        step="1"
                        value={Math.round(selectedBone.pos.y * 10) / 10}
                        onChange={e =>
                          handlePropChange('pos', {
                            ...selectedBone.pos,
                            y: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full bg-transparent text-white focus:outline-none font-mono text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Rotation (degrees) */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-zinc-400">{t.rotation}</label>
                    <span className="text-[11px] font-mono text-indigo-400">
                      {Math.round(radToDeg(selectedBone.rot))}°
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      value={Math.round(radToDeg(selectedBone.rot))}
                      onChange={e => handlePropChange('rot', degToRad(parseFloat(e.target.value) || 0))}
                      className="flex-1 accent-indigo-500 cursor-pointer h-1.5 bg-white/[0.1] rounded-lg"
                    />
                    <div className="flex items-center bg-[#0e1017] border border-white/[0.08] rounded-xl px-2 py-1 w-16">
                      <input
                        type="number"
                        step="1"
                        value={Math.round(radToDeg(selectedBone.rot))}
                        onChange={e => handlePropChange('rot', degToRad(parseFloat(e.target.value) || 0))}
                        className="w-full bg-transparent text-white focus:outline-none font-mono text-xs text-right"
                      />
                      <span className="text-zinc-500 text-[10px] ml-0.5">°</span>
                    </div>
                  </div>
                </div>

                {/* Scale (X, Y) */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-zinc-400">{t.size}</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center bg-[#0e1017] border border-white/[0.08] rounded-xl px-2.5 py-1">
                      <span className="text-zinc-500 font-mono text-[11px] mr-2">W</span>
                      <input
                        type="number"
                        step="0.1"
                        value={Math.round(selectedBone.scale.x * 100) / 100}
                        onChange={e =>
                          handlePropChange('scale', {
                            ...selectedBone.scale,
                            x: parseFloat(e.target.value) || 1,
                          })
                        }
                        className="w-full bg-transparent text-white focus:outline-none font-mono text-xs"
                      />
                    </div>
                    <div className="flex items-center bg-[#0e1017] border border-white/[0.08] rounded-xl px-2.5 py-1">
                      <span className="text-zinc-500 font-mono text-[11px] mr-2">H</span>
                      <input
                        type="number"
                        step="0.1"
                        value={Math.round(selectedBone.scale.y * 100) / 100}
                        onChange={e =>
                          handlePropChange('scale', {
                            ...selectedBone.scale,
                            y: parseFloat(e.target.value) || 1,
                          })
                        }
                        className="w-full bg-transparent text-white focus:outline-none font-mono text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* COLLAPSIBLE «ДОПОЛНИТЕЛЬНО» */}
                <div className="pt-2 border-t border-white/[0.06] flex flex-col gap-2.5">
                  <button
                    onClick={() => setAdvancedOpen(!advancedOpen)}
                    className="flex items-center justify-between py-1 text-zinc-400 hover:text-white transition font-semibold text-[11px]"
                  >
                    <span>{t.advanced}</span>
                    {advancedOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {advancedOpen && (
                    <div className="flex flex-col gap-3 animate-in fade-in duration-150">
                      {/* Z-Index */}
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-medium text-zinc-400">{t.zIndex}</label>
                        <input
                          type="number"
                          value={selectedBone.zindex}
                          onChange={e => handlePropChange('zindex', parseInt(e.target.value) || 0)}
                          className="w-20 bg-[#0e1017] border border-white/[0.08] rounded-xl px-2 py-1 text-white font-mono text-right"
                        />
                      </div>

                      {/* Texture Slot */}
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-medium text-zinc-400">{t.textureSlot}</label>
                        <select
                          value={selectedBone.tex || ''}
                          onChange={e => handlePropChange('tex', e.target.value)}
                          className="w-full bg-[#0e1017] border border-white/[0.08] rounded-xl px-3 py-1.5 text-white focus:outline-none cursor-pointer truncate"
                        >
                          <option key="tex-opt-none" value="">{t.none}</option>
                          {availableTextures.map((texName, i) => (
                            <option key={`tex-opt-${texName}-${i}`} value={texName}>
                              {texName}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* IK Settings */}
                      <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.06]">
                        <label className="text-[11px] font-semibold text-zinc-400">{t.ikConstraint}</label>
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={selectedBone.ik_target_id}
                            onChange={e => handlePropChange('ik_target_id', parseInt(e.target.value))}
                            className="bg-[#0e1017] border border-white/[0.08] rounded-xl px-2.5 py-1.5 text-white text-xs truncate"
                          >
                            <option key="ik-opt-none" value="-1">{t.none}</option>
                            {bones
                              .filter(b => b.id !== selectedBone.id)
                              .map(b => (
                                <option key={`ik-opt-bone-${b.id}`} value={b.id}>
                                  Цель: {b.name}
                                </option>
                              ))}
                          </select>

                          <select
                            value={selectedBone.ik_constraint}
                            onChange={e => handlePropChange('ik_constraint', e.target.value as JointConstraint)}
                            className="bg-[#0e1017] border border-white/[0.08] rounded-xl px-2.5 py-1.5 text-white text-xs"
                          >
                            <option value="None">Без упора</option>
                            <option value="Clockwise">По часовой</option>
                            <option value="CounterClockwise">Против часовой</option>
                          </select>
                        </div>
                      </div>

                      {/* Delete Bone Button (Red with confirmation) */}
                      <div className="pt-2">
                        {confirmDelete ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                deleteBone(selectedBone.id);
                                setConfirmDelete(false);
                              }}
                              className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl font-semibold transition text-xs"
                            >
                              Подтвердить удаление
                            </button>
                            <button
                              onClick={() => setConfirmDelete(false)}
                              className="px-3 py-2 bg-white/[0.08] hover:bg-white/[0.12] text-zinc-300 rounded-xl transition text-xs"
                            >
                              Отмена
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(true)}
                            className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition font-medium flex items-center justify-center gap-2 border border-red-500/20 text-xs"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Удалить эту кость</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
