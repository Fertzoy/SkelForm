import React, { useState, useRef, useEffect } from 'react';
import { useEditor } from '../context/EditorContext';
import {
  MousePointer2,
  Bone as BoneIcon,
  Move,
  RotateCw,
  Maximize2,
  Hand,
  SlidersHorizontal,
  Grid,
  Layers,
  Eye,
  Maximize,
  Focus,
} from 'lucide-react';
import { ToolType } from '../types/skelform';

export const LeftToolbar: React.FC = () => {
  const {
    activeTool,
    setActiveTool,
    addBone,
    showGrid,
    setShowGrid,
    showBonesOnCanvas,
    setShowBonesOnCanvas,
    onionLayers,
    setOnionLayers,
    focusCamera,
    t,
  } = useEditor();

  const [showViewPopover, setShowViewPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Close view popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowViewPopover(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const tools: { id: ToolType; label: string; shortcut: string; icon: React.ReactNode }[] = [
    {
      id: 'select',
      label: t.select,
      shortcut: 'V',
      icon: <MousePointer2 className="w-5 h-5" />,
    },
    {
      id: 'bone',
      label: t.bone,
      shortcut: 'B',
      icon: <BoneIcon className="w-5 h-5" />,
    },
    {
      id: 'move',
      label: t.move,
      shortcut: 'W',
      icon: <Move className="w-5 h-5" />,
    },
    {
      id: 'rotate',
      label: t.rotate,
      shortcut: 'E',
      icon: <RotateCw className="w-5 h-5" />,
    },
    {
      id: 'scale',
      label: t.scale,
      shortcut: 'R',
      icon: <Maximize2 className="w-5 h-5" />,
    },
    {
      id: 'hand',
      label: t.hand,
      shortcut: 'H',
      icon: <Hand className="w-5 h-5" />,
    },
  ];

  return (
    <aside className="absolute left-5 top-20 z-20 flex flex-col gap-1.5 p-2 bg-[#141722]/90 backdrop-blur-2xl border border-white/[0.08] rounded-3xl shadow-2xl select-none">
      {tools.map(tool => {
        const isActive = activeTool === tool.id;
        return (
          <button
            key={`tb-tool-${tool.id}`}
            onClick={() => {
              if (tool.id === 'bone') {
                setActiveTool('bone');
                // Also trigger bone add if desired
                addBone();
              } else {
                setActiveTool(tool.id);
              }
            }}
            className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center transition-all relative group ${
              isActive
                ? 'bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-500/30 ring-1 ring-white/20'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
            }`}
            title={tool.label}
          >
            {tool.icon}
            <span className="text-[9px] font-mono mt-0.5 opacity-60 leading-none">
              {tool.shortcut}
            </span>

            {/* Floating Tooltip */}
            <div className="absolute left-full ml-3 px-3 py-1.5 bg-[#141722]/95 border border-white/[0.1] rounded-xl shadow-xl text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none z-30">
              {tool.label}
            </div>
          </button>
        );
      })}

      <div className="w-7 h-[1px] bg-white/[0.08] mx-auto my-1" />

      {/* View Options Popover Button (>= 44px) */}
      <div className="relative" ref={popoverRef}>
        <button
          onClick={() => setShowViewPopover(!showViewPopover)}
          className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center transition-all relative group ${
            showViewPopover || showGrid || onionLayers
              ? 'text-indigo-400 bg-white/[0.06]'
              : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
          }`}
          title={t.view}
        >
          <SlidersHorizontal className="w-5 h-5" />
          <span className="text-[9px] font-mono mt-0.5 opacity-60 leading-none">
            {t.view}
          </span>

          <div className="absolute left-full ml-3 px-3 py-1.5 bg-[#141722]/95 border border-white/[0.1] rounded-xl shadow-xl text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none z-30">
            {t.view}
          </div>
        </button>

        {/* View Settings Popover */}
        {showViewPopover && (
          <div className="absolute left-full top-0 ml-3 w-56 bg-[#141722]/98 backdrop-blur-2xl border border-white/[0.12] rounded-3xl shadow-2xl p-2.5 z-50 text-xs flex flex-col gap-1 animate-in fade-in duration-150">
            <div className="px-3 py-1 text-[10px] uppercase font-semibold text-zinc-500 tracking-wider">
              {t.view}
            </div>

            {/* Grid Toggle */}
            <button
              onClick={() => setShowGrid(!showGrid)}
              className="flex items-center justify-between px-3 py-2.5 hover:bg-white/[0.06] rounded-2xl text-zinc-300 transition"
            >
              <div className="flex items-center gap-2.5">
                <Grid className="w-4 h-4 text-zinc-400" />
                <span className="font-medium">{t.grid}</span>
              </div>
              <span className={`text-[10px] font-semibold ${showGrid ? 'text-indigo-400' : 'text-zinc-500'}`}>
                {showGrid ? 'ВКЛ' : 'ВЫКЛ'}
              </span>
            </button>

            {/* Bones over images Toggle */}
            <button
              onClick={() => setShowBonesOnCanvas(!showBonesOnCanvas)}
              className="flex items-center justify-between px-3 py-2.5 hover:bg-white/[0.06] rounded-2xl text-zinc-300 transition"
            >
              <div className="flex items-center gap-2.5">
                <Eye className="w-4 h-4 text-zinc-400" />
                <span className="font-medium">{t.bonesAndImages}</span>
              </div>
              <span className={`text-[10px] font-semibold ${showBonesOnCanvas ? 'text-indigo-400' : 'text-zinc-500'}`}>
                {showBonesOnCanvas ? 'ВКЛ' : 'ВЫКЛ'}
              </span>
            </button>

            {/* Onion Skin Toggle */}
            <button
              onClick={() => setOnionLayers(!onionLayers)}
              className="flex items-center justify-between px-3 py-2.5 hover:bg-white/[0.06] rounded-2xl text-zinc-300 transition"
            >
              <div className="flex items-center gap-2.5">
                <Layers className="w-4 h-4 text-zinc-400" />
                <span className="font-medium">{t.onionSkin}</span>
              </div>
              <span className={`text-[10px] font-semibold ${onionLayers ? 'text-indigo-400' : 'text-zinc-500'}`}>
                {onionLayers ? 'ВКЛ' : 'ВЫКЛ'}
              </span>
            </button>

            {/* Focus Center Button */}
            <button
              onClick={() => {
                focusCamera();
                setShowViewPopover(false);
              }}
              className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/[0.06] rounded-2xl text-zinc-300 transition"
            >
              <Focus className="w-4 h-4 text-indigo-400" />
              <span className="font-medium">{t.focusCenter}</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
