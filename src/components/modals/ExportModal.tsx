import React, { useState, useRef } from 'react';
import { useEditor } from '../../context/EditorContext';
import { evaluateArmature } from '../../utils/animator';
import { Texture, Bone, Vec2 } from '../../types/skelform';
import { worldToScreen } from '../../utils/math';
import { Download, FileJson, Image as ImageIcon, X, Sparkles, Layers } from 'lucide-react';
import JSZip from 'jszip';
import { downloadBlob } from '../../utils/skfParser';

export const ExportModal: React.FC = () => {
  const {
    root,
    camera,
    atlasImages,
    showExportModal,
    setShowExportModal,
    exportProject,
    selectedAnimId,
  } = useEditor();

  const [exportTab, setExportTab] = useState<'armature' | 'spritesheet' | 'sequences'>('armature');
  const [spritesPerRow, setSpritesPerRow] = useState<number>(6);
  const [spriteSize, setSpriteSize] = useState<number>(128);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  if (!showExportModal) return null;

  const currentAnim = root.animations?.find(a => a.id === selectedAnimId) || root.animations?.[0];
  const maxAnimFrame = Math.max(30, ...(currentAnim?.keyframes.map(k => k.frame) || [30]));

  const findTexture = (texName: string): Texture | undefined => {
    if (!texName) return undefined;
    for (const style of root.styles || []) {
      if (!style.active) continue;
      const found = style.textures.find(t => t.name === texName);
      if (found) return found;
    }
    return undefined;
  };

  const renderSingleFrameToCanvas = (
    targetCanvas: HTMLCanvasElement,
    frame: number,
    size: number
  ) => {
    targetCanvas.width = size;
    targetCanvas.height = size;
    const ctx = targetCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, size, size);

    const evaluatedBones = evaluateArmature(root.bones, currentAnim || null, frame, true);
    const sortedBones = [...evaluatedBones].sort((a, b) => a.zindex - b.zindex);

    const cx = size / 2;
    const cy = size / 2;
    const frameZoom = camera.zoom * (size / 400);

    for (const bone of sortedBones) {
      if (bone.hidden) continue;
      const tex = findTexture(bone.tex);
      const atlasImg = tex ? atlasImages.get(tex.atlas_idx ?? 0) : null;
      if (!tex || !atlasImg) continue;

      ctx.save();
      ctx.globalAlpha = bone.tint?.a ?? 1;

      // Position relative to camera center
      const posX = cx + (bone.worldPos.x - camera.pos.x) * frameZoom;
      const posY = cy - (bone.worldPos.y - camera.pos.y) * frameZoom;

      ctx.translate(posX, posY);
      ctx.rotate(-bone.worldRot);
      ctx.scale(bone.worldScale.x * frameZoom, bone.worldScale.y * frameZoom);

      const pivotX = tex.size.x * bone.pivot_pos.x;
      const pivotY = tex.size.y * -bone.pivot_pos.y;
      const drawX = -tex.size.x / 2 + pivotX;
      const drawY = -tex.size.y / 2 + pivotY;

      ctx.drawImage(
        atlasImg,
        tex.offset.x,
        tex.offset.y,
        tex.size.x,
        tex.size.y,
        drawX,
        drawY,
        tex.size.x,
        tex.size.y
      );

      ctx.restore();
    }
  };

  const exportSpritesheet = async () => {
    setIsExporting(true);
    try {
      const totalFrames = maxAnimFrame + 1;
      const cols = spritesPerRow;
      const rows = Math.ceil(totalFrames / cols);

      const sheetCanvas = document.createElement('canvas');
      sheetCanvas.width = cols * spriteSize;
      sheetCanvas.height = rows * spriteSize;
      const sheetCtx = sheetCanvas.getContext('2d');
      if (!sheetCtx) return;

      const frameCanvas = document.createElement('canvas');

      for (let f = 0; f < totalFrames; f++) {
        renderSingleFrameToCanvas(frameCanvas, f, spriteSize);
        const col = f % cols;
        const row = Math.floor(f / cols);
        sheetCtx.drawImage(frameCanvas, col * spriteSize, row * spriteSize);
      }

      sheetCanvas.toBlob(blob => {
        if (blob) {
          downloadBlob(blob, `${currentAnim?.name || 'animation'}_spritesheet.png`);
        }
        setIsExporting(false);
      });
    } catch (e) {
      console.error(e);
      setIsExporting(false);
    }
  };

  const exportSequences = async () => {
    setIsExporting(true);
    try {
      const zip = new JSZip();
      const totalFrames = maxAnimFrame + 1;
      const frameCanvas = document.createElement('canvas');

      for (let f = 0; f < totalFrames; f++) {
        renderSingleFrameToCanvas(frameCanvas, f, spriteSize);
        const dataUrl = frameCanvas.toDataURL('image/png');
        const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
        const padIndex = String(f).padStart(4, '0');
        zip.file(`frame_${padIndex}.png`, base64, { base64: true });
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(zipBlob, `${currentAnim?.name || 'animation'}_frames.zip`);
      setIsExporting(false);
    } catch (e) {
      console.error(e);
      setIsExporting(false);
    }
  };

  const exportJson = () => {
    const jsonStr = JSON.stringify(root, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    downloadBlob(blob, 'armature.json');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-lg bg-[#20192e] border border-[#412e69] rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#251d38] border-b border-[#2c2440] flex items-center justify-between">
          <div className="flex items-center gap-2 text-yellow-300 font-bold text-sm">
            <Download className="w-4 h-4" />
            <span>Export Armature & Media</span>
          </div>
          <button
            onClick={() => setShowExportModal(false)}
            className="p-1 text-gray-400 hover:text-white rounded hover:bg-[#412e69]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-[#2c2440] bg-[#191325]">
          <button
            onClick={() => setExportTab('armature')}
            className={`flex-1 py-2.5 text-xs font-semibold text-center transition border-b-2 ${
              exportTab === 'armature'
                ? 'border-purple-400 text-white bg-[#251d38]'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            Armature File (.skf)
          </button>
          <button
            onClick={() => setExportTab('spritesheet')}
            className={`flex-1 py-2.5 text-xs font-semibold text-center transition border-b-2 ${
              exportTab === 'spritesheet'
                ? 'border-purple-400 text-white bg-[#251d38]'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            Spritesheet
          </button>
          <button
            onClick={() => setExportTab('sequences')}
            className={`flex-1 py-2.5 text-xs font-semibold text-center transition border-b-2 ${
              exportTab === 'sequences'
                ? 'border-purple-400 text-white bg-[#251d38]'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            Image Sequences
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 space-y-4">
          {exportTab === 'armature' && (
            <div className="space-y-4 text-xs text-gray-300">
              <p>
                Export the complete 2D armature rig, skins, textures, and keyframed animations into the official <strong>.skf</strong> file package for use in games or further editing.
              </p>

              <div className="space-y-2">
                <button
                  onClick={() => exportProject('armature.skf')}
                  className="w-full p-3 bg-[#332252] hover:bg-[#452b73] border border-[#5b3d9c] rounded-lg text-left transition flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-[#5b3d9c] rounded text-white">
                      <Download className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-white">Export .SKF Bundle</div>
                      <div className="text-[11px] text-gray-400">Complete package (JSON + Atlases)</div>
                    </div>
                  </div>
                  <span className="text-xs text-purple-300 font-medium">Download</span>
                </button>

                <button
                  onClick={exportJson}
                  className="w-full p-3 bg-[#1e172a] hover:bg-[#2b1f3d] border border-[#2c2440] rounded-lg text-left transition flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-600 rounded text-white">
                      <FileJson className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-white">Export Raw JSON</div>
                      <div className="text-[11px] text-gray-400">armature.json definition</div>
                    </div>
                  </div>
                  <span className="text-xs text-blue-300 font-medium">Download</span>
                </button>
              </div>
            </div>
          )}

          {exportTab === 'spritesheet' && (
            <div className="space-y-3 text-xs text-gray-300">
              <p>
                Export animation <strong>"{currentAnim?.name}"</strong> ({maxAnimFrame + 1} frames) as a 2D spritesheet.
              </p>

              <div className="grid grid-cols-2 gap-3 bg-[#191325] p-3 rounded-lg border border-[#2c2440]">
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Sprites Per Row</label>
                  <input
                    type="number"
                    min="1"
                    max="32"
                    value={spritesPerRow}
                    onChange={e => setSpritesPerRow(Math.max(1, parseInt(e.target.value) || 6))}
                    className="w-full px-2 py-1 bg-[#120d1c] border border-[#412e69] rounded text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Sprite Size (px)</label>
                  <input
                    type="number"
                    min="32"
                    max="1024"
                    step="32"
                    value={spriteSize}
                    onChange={e => setSpriteSize(Math.max(32, parseInt(e.target.value) || 128))}
                    className="w-full px-2 py-1 bg-[#120d1c] border border-[#412e69] rounded text-white"
                  />
                </div>
              </div>

              <button
                onClick={exportSpritesheet}
                disabled={isExporting}
                className="w-full py-2.5 bg-[#5b3d9c] hover:bg-[#7c3aed] disabled:opacity-50 text-white font-medium rounded-lg transition flex items-center justify-center gap-2"
              >
                <ImageIcon className="w-4 h-4" />
                <span>{isExporting ? 'Generating Spritesheet...' : 'Export Spritesheet PNG'}</span>
              </button>
            </div>
          )}

          {exportTab === 'sequences' && (
            <div className="space-y-3 text-xs text-gray-300">
              <p>
                Export each frame of <strong>"{currentAnim?.name}"</strong> as an individual transparent PNG in a compressed ZIP file.
              </p>

              <div className="bg-[#191325] p-3 rounded-lg border border-[#2c2440]">
                <label className="text-[10px] text-gray-400 block mb-1">Frame Dimensions (px)</label>
                <input
                  type="number"
                  min="32"
                  max="1024"
                  step="32"
                  value={spriteSize}
                  onChange={e => setSpriteSize(Math.max(32, parseInt(e.target.value) || 128))}
                  className="w-full px-2 py-1 bg-[#120d1c] border border-[#412e69] rounded text-white"
                />
              </div>

              <button
                onClick={exportSequences}
                disabled={isExporting}
                className="w-full py-2.5 bg-[#5b3d9c] hover:bg-[#7c3aed] disabled:opacity-50 text-white font-medium rounded-lg transition flex items-center justify-center gap-2"
              >
                <Layers className="w-4 h-4" />
                <span>{isExporting ? 'Exporting Frames...' : 'Download Frame Sequences (.zip)'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#191325] border-t border-[#2c2440] flex justify-end">
          <button
            onClick={() => setShowExportModal(false)}
            className="px-4 py-1.5 bg-[#2c2440] hover:bg-[#412e69] text-gray-200 text-xs rounded transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
