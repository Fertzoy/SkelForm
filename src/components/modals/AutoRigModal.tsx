import React, { useState, useRef, useEffect } from 'react';
import { useEditor } from '../../context/EditorContext';
import { AiRigPlan, AutoRigOptions, ObjectType } from '../../types/aiRig';
import { requestAiAutoRig } from '../../utils/aiClient';
import { convertAiRigToSkelForm, generateSmartPresetRig } from '../../utils/aiRigConverter';
import {
  Sparkles,
  Wand2,
  Check,
  X,
  Upload,
  Cpu,
  Zap,
  Layers,
  Settings2,
  AlertCircle,
  Play,
  ArrowRight,
  Eye,
  Key,
} from 'lucide-react';

interface AutoRigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AutoRigModal: React.FC<AutoRigModalProps> = ({ isOpen, onClose }) => {
  const {
    root,
    setRoot,
    selectedBoneId,
    atlasImages,
    setSelectedBoneId,
    setSelectedAnimId,
    setCurrentFrame,
    setIsPlaying,
    saveHistoryState,
  } = useEditor();

  const [prompt, setPrompt] = useState<string>(
    'Создай подходящий скелет. Пусть персонаж медленно дышит и плавно покачивается.'
  );
  const [rigMode, setRigMode] = useState<'fast' | 'detailed'>('fast');
  const [apiKey, setApiKey] = useState<string>(
    () => localStorage.getItem('openrouter_api_key') || ''
  );
  const [modelName, setModelName] = useState<string>('qwen/qwen3.8-27b:free');
  const [showApiSettings, setShowApiSettings] = useState<boolean>(false);

  // Image source state
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>('');
  const [imageDims, setImageDims] = useState<{ width: number; height: number }>({ width: 300, height: 300 });
  const [textureName, setTextureName] = useState<string>('RiggedTexture');

  // Generation state
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [generatedPlan, setGeneratedPlan] = useState<AiRigPlan | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize with currently selected bone texture or active style texture if available
  useEffect(() => {
    if (!isOpen) return;

    setErrorMsg(null);
    setGeneratedPlan(null);

    // Try finding selected bone's texture
    const selectedBone = root.bones.find(b => b.id === selectedBoneId);
    let targetTexName = selectedBone?.tex || '';

    // If no texture on bone, check active style
    if (!targetTexName) {
      for (const style of root.styles || []) {
        if (style.active && style.textures.length > 0) {
          targetTexName = style.textures[0].name;
          break;
        }
      }
    }

    if (targetTexName) {
      // Find texture details
      for (const style of root.styles || []) {
        const tex = style.textures.find(t => t.name === targetTexName);
        if (tex) {
          setTextureName(tex.name);
          const atlasImg = atlasImages.get(tex.atlas_idx ?? 0);
          if (atlasImg) {
            // Crop texture slice to canvas
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = tex.size.x || 200;
            cropCanvas.height = tex.size.y || 200;
            const ctx = cropCanvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(
                atlasImg,
                tex.offset.x,
                tex.offset.y,
                tex.size.x,
                tex.size.y,
                0,
                0,
                cropCanvas.width,
                cropCanvas.height
              );
              const url = cropCanvas.toDataURL('image/png');
              setImagePreviewUrl(url);
              setImageDims({ width: cropCanvas.width, height: cropCanvas.height });
              return;
            }
          }
        }
      }
    }

    // Default placeholder sample if no textures yet
    if (!imagePreviewUrl) {
      setImagePreviewUrl('/assets/skellington_icon.png');
      setImageDims({ width: 300, height: 300 });
      setTextureName('Character');
    }
  }, [isOpen, selectedBoneId, root.bones, root.styles, atlasImages]);

  if (!isOpen) return null;

  const handleImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setImagePreviewUrl(dataUrl);
        setImageDims({ width: img.naturalWidth || 300, height: img.naturalHeight || 300 });
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        setTextureName(nameWithoutExt);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    setGeneratedPlan(null);

    try {
      const options: AutoRigOptions = {
        mode: rigMode,
        prompt,
        apiKey,
        modelName,
      };

      const plan = await requestAiAutoRig(
        imagePreviewUrl,
        imageDims.width,
        imageDims.height,
        textureName,
        options
      );

      setGeneratedPlan(plan);
    } catch (err: any) {
      console.error('Auto-Rig failed:', err);
      setErrorMsg(err.message || 'Auto-Rig failed. Please verify API key or network.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = () => {
    if (!generatedPlan) return;

    saveHistoryState();

    // Ensure texture exists in active style
    let updatedStyles = [...(root.styles || [])];
    if (updatedStyles.length === 0) {
      updatedStyles.push({ id: 0, name: 'Default', active: true, textures: [] });
    }

    const activeStyle = updatedStyles.find(s => s.active) || updatedStyles[0];
    let texExists = activeStyle.textures.some(t => t.name === textureName);
    if (!texExists) {
      activeStyle.textures.push({
        name: textureName,
        offset: { x: 0, y: 0 },
        size: { x: imageDims.width, y: imageDims.height },
        atlas_idx: 0,
      });
    }

    // Convert plan to real SkelForm bones and animation
    const { bones, animation, warnings } = convertAiRigToSkelForm(
      generatedPlan,
      imageDims.width,
      imageDims.height,
      textureName
    );

    // Merge into armature
    setRoot(prev => {
      const updatedAnims = animation
        ? [animation, ...(prev.animations || []).filter(a => a.name !== animation.name)]
        : prev.animations;

      return {
        ...prev,
        bones,
        animations: updatedAnims,
        styles: updatedStyles,
      };
    });

    if (bones.length > 0) {
      setSelectedBoneId(bones[0].id);
    }

    if (animation) {
      setSelectedAnimId(animation.id);
      setCurrentFrame(0);
      setIsPlaying(true);
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 select-none">
      <div className="w-full max-w-4xl bg-[#1e172e] border border-[#5b3d9c] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#281b45] to-[#3b246a] border-b border-[#412e69] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#7c3aed] text-white rounded-xl shadow-lg">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                <span>AI Auto-Rigging & Animation</span>
                <span className="text-[10px] px-2 py-0.5 bg-purple-500/30 text-purple-200 border border-purple-400/40 rounded-full font-mono">
                  Qwen Vision
                </span>
              </h2>
              <p className="text-xs text-purple-200/80">
                Automatic anatomy recognition, bone placement, and animation from a single prompt.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-[#2c2440] overflow-y-auto">
          {/* Left Column: Image & Quality mode (5 cols) */}
          <div className="md:col-span-5 p-5 space-y-4 flex flex-col">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-200 uppercase tracking-wider">
                1. Target Graphic
              </span>
              <span className="text-[11px] text-gray-400 font-mono">
                {imageDims.width} × {imageDims.height} px
              </span>
            </div>

            {/* Image Preview Box & Drag-Drop */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="relative aspect-square w-full bg-[#130d1e] border-2 border-dashed border-[#412e69] hover:border-purple-400 rounded-xl overflow-hidden cursor-pointer flex flex-col items-center justify-center group transition shadow-inner"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleImageUpload(f);
                }}
              />

              {imagePreviewUrl ? (
                <>
                  <img
                    src={imagePreviewUrl}
                    alt="Target for Auto-Rig"
                    className="max-w-full max-h-full object-contain p-2"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition text-xs text-white gap-1.5">
                    <Upload className="w-4 h-4" /> Change Image
                  </div>
                </>
              ) : (
                <div className="text-center p-4 text-gray-400">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-purple-400" />
                  <p className="text-xs font-medium text-white">Click or Drop PNG here</p>
                  <p className="text-[10px] text-gray-500 mt-1">Supports PNG, WebP, PSD</p>
                </div>
              )}
            </div>

            {/* Quality Mode Selector */}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-gray-200 uppercase tracking-wider block">
                2. Rigging Mode
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRigMode('fast')}
                  className={`p-2.5 rounded-lg border text-left transition flex items-start gap-2 ${
                    rigMode === 'fast'
                      ? 'bg-[#412e69] border-purple-400 text-white shadow'
                      : 'bg-[#161022] border-[#2c2440] text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Zap className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-white">Fast Rig</div>
                    <div className="text-[10px] text-gray-300">3–6 bones, low latency</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setRigMode('detailed')}
                  className={`p-2.5 rounded-lg border text-left transition flex items-start gap-2 ${
                    rigMode === 'detailed'
                      ? 'bg-[#412e69] border-purple-400 text-white shadow'
                      : 'bg-[#161022] border-[#2c2440] text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Cpu className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-white">Detailed Rig</div>
                    <div className="text-[10px] text-gray-300">8–14 bones, full limbs</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Collapsible OpenRouter API Config */}
            <div className="border border-[#2c2440] rounded-lg p-2.5 bg-[#161022] space-y-2">
              <button
                type="button"
                onClick={() => setShowApiSettings(!showApiSettings)}
                className="w-full flex items-center justify-between text-left text-xs font-medium text-gray-300 hover:text-white"
              >
                <div className="flex items-center gap-1.5 text-purple-300">
                  <Key className="w-3.5 h-3.5" />
                  <span>OpenRouter AI Key & Model</span>
                </div>
                <span className="text-[10px] text-gray-500">{apiKey ? 'Configured' : 'Local Heuristic'}</span>
              </button>

              {showApiSettings && (
                <div className="pt-2 border-t border-[#2c2440] space-y-2 text-xs">
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-0.5">OpenRouter API Key</label>
                    <input
                      type="password"
                      placeholder="sk-or-v1-..."
                      value={apiKey}
                      onChange={e => {
                        setApiKey(e.target.value);
                        localStorage.setItem('openrouter_api_key', e.target.value.trim());
                      }}
                      className="w-full px-2.5 py-1.5 bg-[#0f0a17] border border-[#412e69] rounded text-white text-xs font-mono focus:outline-none"
                    />
                    <span className="text-[10px] text-gray-500 block mt-0.5">
                      Leave empty to use built-in intelligent vision auto-rig presets offline.
                    </span>
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-400 block mb-0.5">Multimodal Model</label>
                    <input
                      type="text"
                      value={modelName}
                      onChange={e => setModelName(e.target.value)}
                      className="w-full px-2.5 py-1 bg-[#0f0a17] border border-[#412e69] rounded text-white text-xs font-mono focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Prompt & Results Preview (7 cols) */}
          <div className="md:col-span-7 p-5 space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              {/* Prompt Input */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-gray-200 uppercase tracking-wider block">
                  3. Rig & Animation Command
                </span>
                <textarea
                  rows={3}
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="Describe desired movement (e.g. 'Машет крыльями, покачивает головой и плавно парит')..."
                  className="w-full px-3 py-2 bg-[#140f1f] border border-[#412e69] rounded-xl text-white text-xs leading-relaxed focus:outline-none focus:border-purple-400"
                />

                {/* Quick chip suggestions */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setPrompt('Создай подходящий скелет. Пусть персонаж медленно дышит и покачивается.')}
                    className="px-2 py-1 bg-[#251d38] hover:bg-[#38265c] text-[10px] text-purple-200 rounded-md transition"
                  >
                    🧍 Humanoid Idle
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrompt('Создай скелет крыльев и хвоста. Пусть существо парит и плавно машет крыльями.')}
                    className="px-2 py-1 bg-[#251d38] hover:bg-[#38265c] text-[10px] text-purple-200 rounded-md transition"
                  >
                    🐉 Winged Creature
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrompt('Оформи как парящий предмет: мягкое покачивание вверх-вниз и лёгкое сияние масштабом.')}
                    className="px-2 py-1 bg-[#251d38] hover:bg-[#38265c] text-[10px] text-purple-200 rounded-md transition"
                  >
                    💎 Floating Item
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrompt('Создай гибкую цепочку стебля. Пусть плавно колышется от ветра.')}
                    className="px-2 py-1 bg-[#251d38] hover:bg-[#38265c] text-[10px] text-purple-200 rounded-md transition"
                  >
                    🌿 Flexible Plant
                  </button>
                </div>
              </div>

              {/* Generate Action Button */}
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isLoading}
                className="w-full py-3 bg-gradient-to-r from-[#6d28d9] to-[#7c3aed] hover:from-[#5b21b6] hover:to-[#6d28d9] disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2"
              >
                <Wand2 className="w-4 h-4" />
                <span>{isLoading ? 'Analyzing Image & Synthesizing Rig...' : 'Analyze Image & Build Rig'}</span>
              </button>

              {/* Error Message Display */}
              {errorMsg && (
                <div className="p-3 bg-red-950/70 border border-red-800/80 rounded-xl text-red-200 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
                  <div>
                    <div className="font-bold">Generation Error</div>
                    <div className="text-[11px] mt-0.5">{errorMsg}</div>
                  </div>
                </div>
              )}

              {/* Generated Plan Review */}
              {generatedPlan && (
                <div className="p-3.5 bg-[#140f1e] border border-[#5b3d9c]/60 rounded-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-[#2c2440] pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">Analysis Result:</span>
                      <span className="px-2 py-0.5 bg-green-950 border border-green-700/60 text-green-300 text-[10px] rounded-full font-mono font-bold uppercase">
                        {generatedPlan.analysis.object_type}
                      </span>
                      <span className="px-2 py-0.5 bg-purple-950 border border-purple-700/60 text-purple-300 text-[10px] rounded-full font-mono">
                        {generatedPlan.analysis.rig_strategy}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400">
                      Confidence: {Math.round(generatedPlan.analysis.confidence * 100)}%
                    </span>
                  </div>

                  <p className="text-[11px] text-gray-300 leading-relaxed italic">
                    "{generatedPlan.analysis.reason}"
                  </p>

                  {/* Bones & Animation Summary */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 bg-[#1c152a] rounded-lg border border-[#2c2440]">
                      <span className="text-[10px] text-purple-300 font-bold block mb-1">
                        SKELETON BONES ({generatedPlan.bones.length})
                      </span>
                      <div className="max-h-24 overflow-y-auto space-y-0.5 text-[11px]">
                        {generatedPlan.bones.map((b, idx) => (
                          <div key={`rig-bone-${b.id}-${idx}`} className="flex justify-between text-gray-300">
                            <span>{b.name}</span>
                            <span className="text-gray-500 font-mono text-[9px]">{b.role}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="p-2 bg-[#1c152a] rounded-lg border border-[#2c2440]">
                      <span className="text-[10px] text-amber-300 font-bold block mb-1">
                        ANIMATION TRACKS ({generatedPlan.animation?.tracks.length || 0})
                      </span>
                      {generatedPlan.animation ? (
                        <div className="text-[11px] space-y-1">
                          <div className="font-semibold text-white">{generatedPlan.animation.name}</div>
                          <div className="text-gray-400">
                            {generatedPlan.animation.fps} FPS · {generatedPlan.animation.duration_ms} ms
                          </div>
                          <div className="text-[10px] text-purple-300">
                            Tracks for {generatedPlan.animation.tracks.map(t => t.bone_id).join(', ')}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-500 text-[11px]">No keyframes generated</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Modal Actions */}
            <div className="pt-4 border-t border-[#2c2440] flex items-center justify-between">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-[#251d38] hover:bg-[#342450] text-gray-300 text-xs rounded-xl transition"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleApply}
                disabled={!generatedPlan}
                className="px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Apply Rig & Play Animation</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
