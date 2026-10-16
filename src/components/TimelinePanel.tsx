import React, { useState, useRef, useEffect } from 'react';
import { useEditor } from '../context/EditorContext';
import { Animation, AnimElement, HandlePreset, Keyframe } from '../types/skelform';
import {
  Play,
  Pause,
  SkipBack,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Copy,
  Layers,
  Diamond,
} from 'lucide-react';

export const TimelinePanel: React.FC = () => {
  const {
    root,
    selectedAnimId,
    setSelectedAnimId,
    currentFrame,
    setCurrentFrame,
    isPlaying,
    setIsPlaying,
    onionLayers,
    setOnionLayers,
    addAnimation,
    deleteAnimation,
    deleteKeyframe,
    updateBone,
    saveHistoryState,
    selectedBoneId,
    setSelectedBoneId,
  } = useEditor();

  const [selectedKeyframe, setSelectedKeyframe] = useState<Keyframe | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);

  const animations = root.animations || [];
  const currentAnim = animations.find(a => a.id === selectedAnimId) || null;

  // Max frame calculated from keyframes
  const allFrames = currentAnim?.keyframes.map(k => k.frame) || [];
  const maxFrame = Math.max(60, ...(allFrames.length > 0 ? allFrames : [60])) + 15;

  const frameWidth = 14; // pixels per frame

  // Group keyframes by bone and element for multi-track rendering
  const bones = root.bones || [];

  // Filter or prioritize selected bone tracks
  const tracksByBone = bones.map(bone => {
    const kfs = (currentAnim?.keyframes || []).filter(k => k.bone_id === bone.id);
    const elements: AnimElement[] = Array.from(new Set(kfs.map(k => k.element)));
    return {
      bone,
      elements,
      keyframes: kfs,
    };
  });

  const handleKeyframePresetChange = (preset: HandlePreset) => {
    if (!selectedKeyframe || !currentAnim) return;
    saveHistoryState();
    const nextKfs = currentAnim.keyframes.map(k => {
      if (
        k.bone_id === selectedKeyframe.bone_id &&
        k.frame === selectedKeyframe.frame &&
        k.element === selectedKeyframe.element
      ) {
        return { ...k, handle_preset: preset };
      }
      return k;
    });
    currentAnim.keyframes = nextKfs;
    setSelectedKeyframe(prev => (prev ? { ...prev, handle_preset: preset } : null));
  };

  const handleDeleteSelectedKf = () => {
    if (!selectedKeyframe) return;
    deleteKeyframe(selectedKeyframe.bone_id, selectedKeyframe.frame, selectedKeyframe.element);
    setSelectedKeyframe(null);
  };

  return (
    <div className="h-48 bg-[#1e172c] border-t border-[#2c2440] flex flex-col select-none text-xs text-gray-300">
      {/* Timeline Controls Header */}
      <div className="h-10 px-3 bg-[#241c35] border-b border-[#2c2440] flex items-center justify-between">
        {/* Left: Animation Selector & Add/Delete */}
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-300 text-xs">Animation:</span>
          <select
            value={selectedAnimId ?? ''}
            onChange={e => {
              const id = parseInt(e.target.value);
              setSelectedAnimId(isNaN(id) ? null : id);
              setCurrentFrame(0);
              setSelectedKeyframe(null);
            }}
            className="px-2 py-1 bg-[#161122] border border-[#412e69] rounded text-white text-xs focus:outline-none"
          >
            {animations.map(a => (
              <option key={`tp-anim-${a.id}`} value={a.id}>
                {a.name || `Animation ${a.id}`}
              </option>
            ))}
          </select>

          <button
            onClick={() => addAnimation()}
            className="p-1 hover:bg-[#412e69] text-purple-300 rounded transition"
            title="New Animation"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          {animations.length > 1 && selectedAnimId !== null && (
            <button
              onClick={() => deleteAnimation(selectedAnimId)}
              className="p-1 hover:bg-red-950/60 text-red-400 rounded transition"
              title="Delete Animation"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Center: Playback Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentFrame(0)}
            className="p-1 text-gray-400 hover:text-white hover:bg-[#412e69] rounded transition"
            title="First Frame"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setCurrentFrame(Math.max(0, currentFrame - 1))}
            className="p-1 text-gray-400 hover:text-white hover:bg-[#412e69] rounded transition"
            title="Previous Frame"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`p-1.5 rounded-full transition shadow-md ${
              isPlaying ? 'bg-amber-600 text-white' : 'bg-[#7c3aed] text-white hover:bg-[#6d28d9]'
            }`}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 translate-x-0.5" />}
          </button>
          <button
            onClick={() => setCurrentFrame(currentFrame + 1)}
            className="p-1 text-gray-400 hover:text-white hover:bg-[#412e69] rounded transition"
            title="Next Frame"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1.5 ml-2 bg-[#161122] px-2 py-0.5 rounded border border-[#412e69]">
            <span className="text-[10px] text-gray-400">Frame:</span>
            <input
              type="number"
              min="0"
              value={currentFrame}
              onChange={e => setCurrentFrame(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-12 bg-transparent text-right text-white font-mono focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1 bg-[#161122] px-2 py-0.5 rounded border border-[#412e69]">
            <span className="text-[10px] text-gray-400">FPS:</span>
            <span className="text-white font-mono">{currentAnim?.fps || 30}</span>
          </div>
        </div>

        {/* Right: Selected Keyframe Interpolation & Actions */}
        <div className="flex items-center gap-2">
          {selectedKeyframe && (
            <div className="flex items-center gap-1.5 bg-[#161122] px-2 py-1 rounded border border-[#5b3d9c]/60">
              <Diamond className="w-3 h-3 text-purple-400 fill-purple-400" />
              <span className="text-[10px] text-purple-300 font-medium">Easing:</span>
              <select
                value={selectedKeyframe.handle_preset || 'Linear'}
                onChange={e => handleKeyframePresetChange(e.target.value as HandlePreset)}
                className="bg-transparent text-[11px] text-white focus:outline-none cursor-pointer"
              >
                <option value="Linear" className="bg-[#20192e]">Linear</option>
                <option value="SineIn" className="bg-[#20192e]">Sine-In</option>
                <option value="SineOut" className="bg-[#20192e]">Sine-Out</option>
                <option value="SineInOut" className="bg-[#20192e]">Sine-In-Out</option>
                <option value="Snap" className="bg-[#20192e]">Snap</option>
              </select>
              <button
                onClick={handleDeleteSelectedKf}
                className="ml-1 p-0.5 text-red-400 hover:text-red-300"
                title="Delete Keyframe"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}

          <button
            onClick={() => setOnionLayers(!onionLayers)}
            className={`p-1.5 rounded transition ${
              onionLayers ? 'bg-[#5b3d9c] text-white' : 'text-gray-400 hover:text-white'
            }`}
            title="Toggle Onion Skinning"
          >
            <Layers className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Timeline Grid & Tracks Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Track Headers (Bone & Property names) */}
        <div className="w-52 h-full bg-[#20192e] border-r border-[#2c2440] overflow-y-auto flex-shrink-0">
          <div className="h-6 px-3 bg-[#191325] border-b border-[#2c2440] flex items-center text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
            Track / Bone
          </div>
          <div className="divide-y divide-[#2c2440]/40">
            {tracksByBone.map(({ bone, elements }) => (
              <div key={`tp-bone-${bone.id}`} className="text-xs">
                <div
                  onClick={() => setSelectedBoneId(bone.id)}
                  className={`px-3 py-1 flex items-center justify-between cursor-pointer transition ${
                    selectedBoneId === bone.id
                      ? 'bg-[#412e69]/70 text-purple-200 font-semibold'
                      : 'hover:bg-[#251d38] text-gray-300'
                  }`}
                >
                  <span className="truncate">{bone.name}</span>
                  <span className="text-[10px] text-gray-500 font-mono">#{bone.id}</span>
                </div>
                {selectedBoneId === bone.id &&
                  elements.map(elem => (
                    <div
                      key={`tp-elem-${bone.id}-${elem}`}
                      className="px-6 py-0.5 text-[11px] text-gray-400 hover:text-gray-200 hover:bg-[#251d38]/50 flex items-center justify-between"
                    >
                      <span>{elem}</span>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </div>

        {/* Timeline Ruler & Keyframes Area */}
        <div
          ref={timelineScrollRef}
          className="flex-1 overflow-x-auto overflow-y-auto relative bg-[#171221]"
          onClick={e => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left + e.currentTarget.scrollLeft;
            const clickedFrame = Math.max(0, Math.floor(clickX / frameWidth));
            setCurrentFrame(clickedFrame);
          }}
        >
          {/* Ruler */}
          <div
            className="h-6 bg-[#191325] border-b border-[#2c2440] flex relative"
            style={{ width: `${maxFrame * frameWidth}px` }}
          >
            {Array.from({ length: maxFrame }).map((_, f) => (
              <div
                key={`tp-ruler-${f}`}
                style={{ left: `${f * frameWidth}px`, width: `${frameWidth}px` }}
                className="absolute top-0 bottom-0 border-r border-[#2c2440]/50 flex items-center justify-center pointer-events-none"
              >
                {f % 5 === 0 && (
                  <span className="text-[9px] text-gray-500 font-mono">{f}</span>
                )}
              </div>
            ))}
          </div>

          {/* Current Frame Playhead Needle */}
          <div
            className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-20 pointer-events-none"
            style={{
              left: `${currentFrame * frameWidth + frameWidth / 2}px`,
            }}
          >
            <div className="w-2.5 h-2.5 bg-red-500 transform -translate-x-[4px] -translate-y-0.5 rotate-45" />
          </div>

          {/* Keyframe Track Rows */}
          <div style={{ width: `${maxFrame * frameWidth}px` }}>
            {tracksByBone.map(({ bone, elements, keyframes }) => (
              <div key={`tp-row-${bone.id}`} className="relative">
                {/* Bone Summary Row */}
                <div className="h-6 border-b border-[#2c2440]/30 relative flex items-center">
                  {keyframes.map((kf, idx) => {
                    const isSelected =
                      selectedKeyframe &&
                      selectedKeyframe.bone_id === kf.bone_id &&
                      selectedKeyframe.frame === kf.frame &&
                      selectedKeyframe.element === kf.element;

                    return (
                      <div
                        key={`tp-kf-${kf.bone_id}-${kf.element}-${kf.frame}-${idx}`}
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedKeyframe(kf);
                          setCurrentFrame(kf.frame);
                          setSelectedBoneId(kf.bone_id);
                        }}
                        style={{
                          left: `${kf.frame * frameWidth + frameWidth / 2 - 5}px`,
                        }}
                        className={`absolute w-2.5 h-2.5 transform rotate-45 cursor-pointer transition ${
                          isSelected
                            ? 'bg-amber-300 border border-white shadow-lg z-10 scale-125'
                            : 'bg-purple-400 hover:bg-purple-200 border border-purple-800'
                        }`}
                        title={`Frame ${kf.frame}: ${kf.element} (${kf.value ?? kf.value_str})`}
                      />
                    );
                  })}
                </div>

                {/* Sub-rows for each element if bone is selected */}
                {selectedBoneId === bone.id &&
                  elements.map(elem => {
                    const elemKfs = keyframes.filter(k => k.element === elem);
                    return (
                      <div
                        key={`tp-subrow-${bone.id}-${elem}`}
                        className="h-5 border-b border-[#2c2440]/20 bg-[#140f1d] relative flex items-center"
                      >
                        {elemKfs.map((kf, idx) => {
                          const isSelected =
                            selectedKeyframe &&
                            selectedKeyframe.bone_id === kf.bone_id &&
                            selectedKeyframe.frame === kf.frame &&
                            selectedKeyframe.element === kf.element;

                          return (
                            <div
                              key={`tp-subkf-${kf.bone_id}-${kf.element}-${kf.frame}-${idx}`}
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedKeyframe(kf);
                                setCurrentFrame(kf.frame);
                              }}
                              style={{
                                left: `${kf.frame * frameWidth + frameWidth / 2 - 4}px`,
                              }}
                              className={`absolute w-2 h-2 transform rotate-45 cursor-pointer transition ${
                                isSelected
                                  ? 'bg-amber-300 border border-white scale-125 z-10'
                                  : 'bg-indigo-400 hover:bg-indigo-200'
                              }`}
                            />
                          );
                        })}
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
