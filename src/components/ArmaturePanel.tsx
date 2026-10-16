import React, { useState } from 'react';
import { useEditor } from '../context/EditorContext';
import { Bone } from '../types/skelform';
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Image as ImageIcon,
  Compass,
  Shirt,
  Crosshair,
  Search,
} from 'lucide-react';

export const ArmaturePanel: React.FC = () => {
  const {
    root,
    selectedBoneId,
    setSelectedBoneId,
    addBone,
    deleteBone,
    updateBone,
    saveHistoryState,
    setShowStylesModal,
    t,
  } = useEditor();

  const [searchFilter, setSearchFilter] = useState('');

  const bones = root.bones || [];

  // Group bones into hierarchy tree
  const buildBoneTree = () => {
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

  const { roots, childrenMap } = buildBoneTree();

  const renderBoneItem = (bone: Bone, depth: number = 0, isLastChild: boolean = false) => {
    const children = childrenMap.get(bone.id) || [];
    const hasChildren = children.length > 0;
    const isSelected = bone.id === selectedBoneId;
    const isFolded = !!bone.folded;

    if (searchFilter && !bone.name.toLowerCase().includes(searchFilter.toLowerCase())) {
      // If filtering, also check children
      const matchesChild = children.some(c => c.name.toLowerCase().includes(searchFilter.toLowerCase()));
      if (!matchesChild) return null;
    }

    // Determine limb color from group_color or heuristic
    const groupColor = bone.group_color
      ? `rgb(${bone.group_color.r}, ${bone.group_color.g}, ${bone.group_color.b})`
      : depth === 0
      ? '#a855f7'
      : depth === 1
      ? '#3b82f6'
      : depth === 2
      ? '#eab308'
      : '#f97316';

    const isIkTarget = bone.ik_target_id !== -1 && bone.ik_family_id !== -1;

    return (
      <div key={`armature-bone-${bone.id}`} className="relative flex flex-col">
        {/* Tree branch connector lines */}
        {depth > 0 && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: `${(depth - 1) * 16 + 18}px`,
              top: 0,
              bottom: isLastChild ? '50%' : 0,
              width: '1px',
              backgroundColor: '#42335c',
            }}
          />
        )}
        {depth > 0 && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: `${(depth - 1) * 16 + 18}px`,
              top: '50%',
              width: '12px',
              height: '1px',
              backgroundColor: '#42335c',
            }}
          />
        )}

        <div
          onClick={() => setSelectedBoneId(bone.id)}
          className={`group flex items-center justify-between px-2 py-1.5 cursor-pointer transition select-none text-[12px] rounded-md ${
            isSelected
              ? 'bg-[#4d3284] text-white font-medium shadow-sm'
              : 'hover:bg-[#2e2343] text-gray-300'
          }`}
          style={{ paddingLeft: `${Math.max(6, depth * 16 + 6)}px` }}
        >
          {/* Left: Eye, Lock, Fold, Bone Icon, Name */}
          <div className="flex items-center gap-1.5 overflow-hidden flex-1">
            {/* Visibility Eye */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                saveHistoryState();
                updateBone(bone.id, { hidden: !bone.hidden });
              }}
              className="p-0.5 text-gray-400 hover:text-white transition shrink-0"
              title={bone.hidden ? 'Скрыто (Показать)' : 'Видимо'}
            >
              {bone.hidden ? (
                <EyeOff className="w-3.5 h-3.5 text-red-400/80" />
              ) : (
                <Eye className="w-3.5 h-3.5 text-gray-400 hover:text-gray-200" />
              )}
            </button>

            {/* Lock Toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                saveHistoryState();
                updateBone(bone.id, { locked: !bone.locked });
              }}
              className="p-0.5 text-gray-400 hover:text-white transition shrink-0"
              title={bone.locked ? 'Заблокировано' : 'Разблокировано'}
            >
              {bone.locked ? (
                <Lock className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Unlock className="w-3.5 h-3.5 text-gray-500 opacity-40 group-hover:opacity-100" />
              )}
            </button>

            {/* Fold chevron */}
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateBone(bone.id, { folded: !isFolded });
                }}
                className="p-0.5 text-gray-400 hover:text-white shrink-0"
              >
                {isFolded ? (
                  <ChevronRight className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            ) : (
              <div className="w-3.5 shrink-0" />
            )}

            {/* Bone Color Indicator / Symbol */}
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm border border-white/20"
              style={{ backgroundColor: groupColor }}
              title={`Bone #${bone.id}`}
            />

            {/* Bone Name */}
            <span className="truncate max-w-[125px] font-normal" title={bone.name}>
              {bone.name}
            </span>

            {/* IK Crosshair Badge */}
            {isIkTarget && (
              <span
                className="text-[10px] text-cyan-300 font-mono flex items-center gap-0.5 shrink-0"
                title="IK Target"
              >
                <Crosshair className="w-2.5 h-2.5" />
                <span>{bone.ik_family_id}</span>
              </span>
            )}
          </div>

          {/* Right Badges: Texture 🖼️, Mesh ⬟ */}
          <div className="flex items-center gap-1 shrink-0 ml-1">
            {bone.tex && (
              <span title={`Texture: ${bone.tex}`} className="text-gray-400 hover:text-white">
                <ImageIcon className="w-3.5 h-3.5" />
              </span>
            )}

            {bone.ik_family_id !== -1 && (
              <span
                title={`IK Joint (Family #${bone.ik_family_id})`}
                className="w-2.5 h-2.5 rounded-sm bg-yellow-500/80 shrink-0"
              />
            )}
          </div>
        </div>

        {/* Children Bones Recursion */}
        {!isFolded && (
          <div className="flex flex-col">
            {children.map((child, idx) =>
              renderBoneItem(child, depth + 1, idx === children.length - 1)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="w-68 h-full bg-[#1e172a] border-r border-[#2d233e] flex flex-col select-none shrink-0 z-10">
      {/* 1. Header with Title & Action Buttons (Exact SkelForm Style) */}
      <div className="p-3 border-b border-[#2d233e] space-y-2">
        <h2 className="text-lg font-bold text-white tracking-wide">Armature</h2>

        {/* Action Button Row: [New Bone] & [Styles ▾] */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => addBone(selectedBoneId ?? undefined)}
            className="flex-1 py-1.5 px-3 bg-[#4d3284] hover:bg-[#603fa6] text-white text-xs font-semibold rounded-md transition shadow-sm border border-purple-400/20 flex items-center justify-center gap-1.5"
            title="Добавить новую кость (B)"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Bone</span>
          </button>

          <button
            onClick={() => setShowStylesModal(true)}
            className="py-1.5 px-3 bg-[#4d3284] hover:bg-[#603fa6] text-white text-xs font-semibold rounded-md transition shadow-sm border border-purple-400/20 flex items-center justify-center gap-1.5"
            title="Стили и скины персонажа"
          >
            <Shirt className="w-3.5 h-3.5 text-purple-200" />
            <span>Styles</span>
            <ChevronDown className="w-3 h-3 text-purple-200" />
          </button>
        </div>

        {/* Optional quick search filter */}
        <div className="relative mt-1">
          <Search className="w-3 h-3 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
            placeholder="Search bones..."
            className="w-full bg-[#15101e] border border-[#372a4d] rounded text-[11px] pl-7 pr-2 py-1 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-400"
          />
        </div>
      </div>

      {/* 2. Hierarchy Tree List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {roots.length === 0 ? (
          <div className="p-6 text-center text-xs text-gray-500">
            No bones in armature. Click "New Bone" above to add the root bone.
          </div>
        ) : (
          roots.map((r, idx) => renderBoneItem(r, 0, idx === roots.length - 1))
        )}
      </div>

      {/* 3. Footer summary */}
      <div className="px-3 py-1.5 border-t border-[#2d233e] text-[11px] text-gray-400 flex items-center justify-between">
        <span>Total: {bones.length} bones</span>
        {selectedBoneId !== null && (
          <button
            onClick={() => deleteBone(selectedBoneId)}
            className="text-red-400 hover:text-red-300 flex items-center gap-1 text-[11px]"
            title="Удалить выбранную кость (Del)"
          >
            <Trash2 className="w-3 h-3" />
            <span>Delete</span>
          </button>
        )}
      </div>
    </aside>
  );
};
