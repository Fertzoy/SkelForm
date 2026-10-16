import React, { useState } from 'react';
import { useEditor } from '../context/EditorContext';
import { AnimElement, HandlePreset, Keyframe } from '../types/skelform';
import {
  Play,
  Pause,
  SkipBack,
  ChevronLeft,
  ChevronRight,
  Repeat,
  Plus,
  Trash2,
  Diamond,
  ChevronUp,
  ChevronDown,
  Layers,
  Gauge,
} from 'lucide-react';

export const BottomPlayer: React.FC = () => {
  const {
    root,
    selectedAnimId,
    setSelectedAnimId,
    currentFrame,
    setCurrentFrame,
    isPlaying,
    setIsPlaying,
    deleteKeyframe,
    saveHistoryState,
    selectedBoneId,
    setSelectedBoneId,
    playbackSpeed,
    setPlaybackSpeed,
    isLooping,
    setIsLooping,
    recordKeyframe,
    t,
  } = useEditor();

  const [isTimelineExpanded, setIsTimelineExpanded] = useState(false);
  const [selectedKeyframe, setSelectedKeyframe] = useState<Keyframe | null>(null);

  const animations = root.animations || [];
  const currentAnim = animations.find(a => a.id === selectedAnimId) || null;

  const allFrames = currentAnim?.keyframes.map(k => k.frame) || [];
  const maxAnimFrame = Math.max(30, ...(allFrames.length > 0 ? allFrames : [30]));
  const timelineMaxFrame = maxAnimFrame + 15;
  const frameWidth = 16;

  const bones = root.bones || [];
  const tracksByBone = bones.map(bone => {
    const kfs = (currentAnim?.keyframes || []).filter(k => k.bone_id === bone.id);
    const elements: AnimElement[] = Array.from(new Set(kfs.map(k => k.element)));
    return { bone, elements, keyframes: kfs };
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

  const handleAddKeyframeOnCurrent = () => {
    if (selectedBoneId === null) return;
    const bone = bones.find(b => b.id === selectedBoneId);
    if (!bone) return;
    recordKeyframe(bone.id, 'PositionX', bone.pos.x);
    recordKeyframe(bone.id, 'PositionY', bone.pos.y);
    recordKeyframe(bone.id, 'Rotation', bone.rot);
  };

  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2.5 select-none pointer-events-none max-w-4xl w-[94vw]">
      {/* EXPANDABLE TIMELINE SHEET */}
      {isTimelineExpanded && (
        <div className="w-full h-56 bg-[#141722]/98 backdrop-blur-2xl border border-white/[0.08] rounded-3xl shadow-2xl flex flex-col overflow-hidden pointer-events-auto transition-all animate-in fade-in duration-150">
          {/* Timeline Subheader: Keyframe Easing tools & Animation info */}
          <div className="h-11 px-5 bg-[#171b26] border-b border-white/[0.06] flex items-center justify-between text-xs">
            <div className="flex items-center gap-3 text-zinc-300 font-semibold">
              <Layers className="w-4 h-4 text-indigo-400" />
              <span>
                {t.timeline}: {currentAnim?.name || 'Animation'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleAddKeyframeOnCurrent}
                disabled={selectedBoneId === null}
                className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 hover:text-white border border-indigo-500/30 rounded-xl transition text-[11px] font-semibold disabled:opacity-30"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t.addKeyframe}</span>
              </button>

              {selectedKeyframe && (
                <div className="flex items-center gap-2 bg-[#0e1017] px-3 py-1 rounded-xl border border-white/[0.08]">
                  <Diamond className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                  <span className="text-[11px] text-zinc-400">Интерполяция:</span>
                  <select
                    value={selectedKeyframe.handle_preset || 'Linear'}
                    onChange={e => handleKeyframePresetChange(e.target.value as HandlePreset)}
                    className="bg-transparent text-[11px] text-white focus:outline-none cursor-pointer"
                  >
                    <option value="Linear" className="bg-[#141722]">Линейная</option>
                    <option value="SineInOut" className="bg-[#141722]">Плавная (SineInOut)</option>
                    <option value="SineIn" className="bg-[#141722]">Разгон (SineIn)</option>
                    <option value="SineOut" className="bg-[#141722]">Торможение (SineOut)</option>
                    <option value="Snap" className="bg-[#141722]">Резкий скачок</option>
                  </select>
                  <button
                    onClick={handleDeleteSelectedKf}
                    className="p-1 hover:text-red-400 text-zinc-400 transition ml-1"
                    title={t.deleteKeyframe}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Timeline Tracks & Ruler */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left Bone track labels */}
            <div className="w-52 bg-[#10131a] border-r border-white/[0.06] overflow-y-auto">
              {tracksByBone.map(({ bone }) => (
                <div
                  key={`bp-bone-label-${bone.id}`}
                  onClick={() => setSelectedBoneId(bone.id)}
                  className={`px-4 py-2 flex items-center justify-between cursor-pointer transition text-xs ${
                    selectedBoneId === bone.id
                      ? 'bg-indigo-600/30 text-white font-semibold border-l-2 border-indigo-500'
                      : 'hover:bg-white/[0.04] text-zinc-400'
                  }`}
                >
                  <span className="truncate">{bone.name}</span>
                  <span className="text-[9px] text-zinc-500 font-mono">#{bone.id}</span>
                </div>
              ))}
            </div>

            {/* Right Ruler & Keyframe Diamonds */}
            <div
              className="flex-1 overflow-x-auto overflow-y-auto relative bg-[#0b0d12]"
              onClick={e => {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left + e.currentTarget.scrollLeft;
                const clickedFrame = Math.max(0, Math.floor(clickX / frameWidth));
                setCurrentFrame(clickedFrame);
              }}
            >
              {/* Ruler */}
              <div
                className="h-7 bg-[#13161f] border-b border-white/[0.06] flex relative"
                style={{ width: `${timelineMaxFrame * frameWidth}px` }}
              >
                {Array.from({ length: timelineMaxFrame }).map((_, f) => (
                  <div
                    key={`bp-ruler-frame-${f}`}
                    style={{ left: `${f * frameWidth}px`, width: `${frameWidth}px` }}
                    className="absolute top-0 bottom-0 border-r border-white/[0.03] flex items-center justify-center pointer-events-none"
                  >
                    {f % 5 === 0 && (
                      <span className="text-[9px] text-zinc-500 font-mono font-medium">{f}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Playhead Needle */}
              <div
                className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-20 pointer-events-none"
                style={{ left: `${currentFrame * frameWidth + frameWidth / 2}px` }}
              >
                <div className="w-3 h-3 bg-red-500 transform -translate-x-[5px] rotate-45 shadow-md" />
              </div>

              {/* Tracks */}
              <div style={{ width: `${timelineMaxFrame * frameWidth}px` }}>
                {tracksByBone.map(({ bone, keyframes }) => (
                  <div
                    key={`bp-track-row-${bone.id}`}
                    className="h-8 border-b border-white/[0.03] relative flex items-center"
                  >
                    {keyframes.map((kf, idx) => {
                      const isSelected =
                        selectedKeyframe &&
                        selectedKeyframe.bone_id === kf.bone_id &&
                        selectedKeyframe.frame === kf.frame &&
                        selectedKeyframe.element === kf.element;

                      return (
                        <div
                          key={`bp-kf-${kf.bone_id}-${kf.frame}-${kf.element}-${idx}`}
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedKeyframe(kf);
                            setCurrentFrame(kf.frame);
                            setSelectedBoneId(kf.bone_id);
                          }}
                          style={{ left: `${kf.frame * frameWidth + frameWidth / 2 - 5}px` }}
                          className={`absolute w-3 h-3 transform rotate-45 cursor-pointer transition ${
                            isSelected
                              ? 'bg-amber-300 border-2 border-white shadow-xl scale-125 z-10'
                              : 'bg-indigo-400 hover:bg-white border border-indigo-700'
                          }`}
                          title={`Кадр ${kf.frame}: ${kf.element}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING CAPSULE PLAYER BAR (>= 44px comfortable controls, rounded-3xl) */}
      <div className="h-14 px-5 bg-[#141722]/90 backdrop-blur-2xl border border-white/[0.08] rounded-3xl shadow-2xl flex items-center justify-between gap-4 pointer-events-auto w-full max-w-3xl">
        {/* Play / Pause & Step Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCurrentFrame(0)}
            className="w-9 h-9 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06] rounded-xl transition"
            title={t.toStart}
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={() => setCurrentFrame(Math.max(0, currentFrame - 1))}
            className="w-9 h-9 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06] rounded-xl transition"
            title={t.stepBack}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Primary Play/Pause Button (48x48px touch target) */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition shadow-lg ${
              isPlaying
                ? 'bg-amber-500 text-black hover:bg-amber-400 shadow-amber-500/25 ring-1 ring-amber-400'
                : 'bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white hover:from-indigo-500 hover:to-indigo-400 shadow-indigo-600/30 ring-1 ring-white/20'
            }`}
            title={isPlaying ? `${t.pause} (Space)` : `${t.play} (Space)`}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 translate-x-0.5" />}
          </button>

          <button
            onClick={() => setCurrentFrame(currentFrame + 1)}
            className="w-9 h-9 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06] rounded-xl transition"
            title={t.stepForward}
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Loop toggle */}
          <button
            onClick={() => setIsLooping(!isLooping)}
            className={`w-9 h-9 flex items-center justify-center rounded-xl transition ${
              isLooping ? 'text-indigo-400 bg-white/[0.06]' : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title={t.loop}
          >
            <Repeat className="w-4 h-4" />
          </button>
        </div>

        {/* Current Frame Scrubber Slider */}
        <div className="flex-1 flex items-center gap-3">
          <span className="font-mono text-xs text-white min-w-[28px] text-right font-bold">
            {currentFrame}
          </span>
          <input
            type="range"
            min="0"
            max={maxAnimFrame}
            value={currentFrame}
            onChange={e => setCurrentFrame(parseInt(e.target.value) || 0)}
            className="flex-1 accent-indigo-500 cursor-pointer h-2 bg-white/[0.1] rounded-lg"
          />
          <span className="font-mono text-xs text-zinc-400 min-w-[28px]">
            {maxAnimFrame}
          </span>
        </div>

        {/* Speed Selector */}
        <div className="flex items-center gap-1 bg-[#0e1017] px-2 py-1 rounded-xl border border-white/[0.06]">
          <Gauge className="w-3.5 h-3.5 text-zinc-500" />
          <select
            value={playbackSpeed}
            onChange={e => setPlaybackSpeed(parseFloat(e.target.value) || 1)}
            className="bg-transparent text-[11px] text-zinc-300 font-mono focus:outline-none cursor-pointer"
          >
            <option value="0.5" className="bg-[#141722]">0.5x</option>
            <option value="1" className="bg-[#141722]">1.0x</option>
            <option value="1.5" className="bg-[#141722]">1.5x</option>
            <option value="2" className="bg-[#141722]">2.0x</option>
          </select>
        </div>

        {/* Animation Switcher & Expand Toggle */}
        <div className="flex items-center gap-2">
          <select
            value={selectedAnimId ?? ''}
            onChange={e => {
              const id = parseInt(e.target.value);
              setSelectedAnimId(isNaN(id) ? null : id);
              setCurrentFrame(0);
            }}
            className="h-9 px-3 bg-[#0e1017] border border-white/[0.08] rounded-xl text-white text-xs font-medium focus:outline-none cursor-pointer max-w-[130px] truncate"
          >
            {animations.map(a => (
              <option key={`bp-anim-${a.id}`} value={a.id}>
                {a.name || `Анимация ${a.id}`}
              </option>
            ))}
          </select>

          {/* Toggle Timeline Sheet ▴ / ▾ */}
          <button
            onClick={() => setIsTimelineExpanded(!isTimelineExpanded)}
            className={`h-9 flex items-center gap-1.5 px-3 rounded-xl border text-xs font-semibold transition ${
              isTimelineExpanded
                ? 'bg-indigo-600 border-indigo-400/50 text-white shadow-md'
                : 'bg-white/[0.04] border-white/[0.08] text-zinc-300 hover:text-white hover:bg-white/[0.08]'
            }`}
          >
            <span>{t.timeline}</span>
            {isTimelineExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
};
