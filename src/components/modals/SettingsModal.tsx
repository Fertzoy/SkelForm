import React, { useState } from 'react';
import { useEditor } from '../../context/EditorContext';
import { Settings, Keyboard, Sliders, Palette, X } from 'lucide-react';

export const SettingsModal: React.FC = () => {
  const {
    showSettingsModal,
    setShowSettingsModal,
    boneTranslucency,
    setBoneTranslucency,
    showGrid,
    setShowGrid,
  } = useEditor();

  const [activeTab, setActiveTab] = useState<'general' | 'keyboard'>('general');

  if (!showSettingsModal) return null;

  const shortcuts = [
    { key: 'Space', desc: 'Play / Pause Animation' },
    { key: 'Q', desc: 'Move Transform Mode' },
    { key: 'W', desc: 'Rotate Transform Mode' },
    { key: 'E', desc: 'Scale Transform Mode' },
    { key: 'R', desc: 'Pivot Edit Mode' },
    { key: '⌘ / Ctrl + Z', desc: 'Undo' },
    { key: '⌘ / Ctrl + Y', desc: 'Redo' },
    { key: 'Alt + Drag / MMB', desc: 'Pan Camera' },
    { key: 'Mouse Wheel', desc: 'Zoom In / Out' },
    { key: 'Delete / Backspace', desc: 'Delete Selected Bone / Keyframe' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-md bg-[#20192e] border border-[#412e69] rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#251d38] border-b border-[#2c2440] flex items-center justify-between">
          <div className="flex items-center gap-2 text-purple-300 font-bold text-sm">
            <Settings className="w-4 h-4" />
            <span>Editor Settings</span>
          </div>
          <button
            onClick={() => setShowSettingsModal(false)}
            className="p-1 text-gray-400 hover:text-white rounded hover:bg-[#412e69]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#2c2440] bg-[#191325]">
          <button
            onClick={() => setActiveTab('general')}
            className={`flex-1 py-2 text-xs font-semibold text-center transition border-b-2 ${
              activeTab === 'general'
                ? 'border-purple-400 text-white bg-[#251d38]'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            General & View
          </button>
          <button
            onClick={() => setActiveTab('keyboard')}
            className={`flex-1 py-2 text-xs font-semibold text-center transition border-b-2 ${
              activeTab === 'keyboard'
                ? 'border-purple-400 text-white bg-[#251d38]'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            Keyboard Shortcuts
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs text-gray-300">
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="font-medium">Unselected Bone Translucency</span>
                  <span className="font-mono text-purple-300">{Math.round(boneTranslucency * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="1"
                  step="0.05"
                  value={boneTranslucency}
                  onChange={e => setBoneTranslucency(parseFloat(e.target.value))}
                  className="w-full accent-purple-500"
                />
                <span className="text-[10px] text-gray-500">
                  How transparent other bones appear when one bone is selected.
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-[#191325] rounded-lg border border-[#2c2440]">
                <div>
                  <div className="font-medium text-white">Show Grid Lines</div>
                  <div className="text-[10px] text-gray-400">Display canvas orientation grid</div>
                </div>
                <input
                  type="checkbox"
                  checked={showGrid}
                  onChange={e => setShowGrid(e.target.checked)}
                  className="w-4 h-4 rounded text-purple-600 bg-[#120d1c] border-[#412e69]"
                />
              </div>
            </div>
          )}

          {activeTab === 'keyboard' && (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {shortcuts.map((s, idx) => (
                <div
                  key={`shortcut-${s.key}-${idx}`}
                  className="flex items-center justify-between p-2 rounded bg-[#191325] border border-[#2c2440]"
                >
                  <span className="text-gray-300">{s.desc}</span>
                  <kbd className="px-2 py-0.5 bg-[#251d38] border border-[#412e69] rounded text-[11px] font-mono text-purple-300">
                    {s.key}
                  </kbd>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#191325] border-t border-[#2c2440] flex justify-end">
          <button
            onClick={() => setShowSettingsModal(false)}
            className="px-4 py-1.5 bg-[#412e69] hover:bg-[#5b3d9c] text-white text-xs font-medium rounded transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
