import React, { useState } from 'react';
import { useEditor } from '../../context/EditorContext';
import { Style, Texture } from '../../types/skelform';
import { Shirt, Plus, Trash2, Check, X, Image as ImageIcon, Eye } from 'lucide-react';

export const StylesModal: React.FC = () => {
  const {
    root,
    setRoot,
    showStylesModal,
    setShowStylesModal,
    saveHistoryState,
  } = useEditor();

  const [selectedStyleId, setSelectedStyleId] = useState<number>(
    root.styles?.[0]?.id ?? 0
  );
  const [newStyleName, setNewStyleName] = useState('');

  if (!showStylesModal) return null;

  const styles = root.styles || [];
  const currentStyle = styles.find(s => s.id === selectedStyleId) || styles[0];

  const handleToggleStyleActive = (styleId: number) => {
    saveHistoryState();
    setRoot(prev => ({
      ...prev,
      styles: (prev.styles || []).map(s =>
        s.id === styleId ? { ...s, active: !s.active } : s
      ),
    }));
  };

  const handleAddStyle = () => {
    if (!newStyleName.trim()) return;
    saveHistoryState();
    const existingIds = styles.map(s => s.id);
    const newId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 0;
    const newStyle: Style = {
      id: newId,
      name: newStyleName.trim(),
      active: true,
      textures: [],
    };
    setRoot(prev => ({
      ...prev,
      styles: [...(prev.styles || []), newStyle],
    }));
    setSelectedStyleId(newId);
    setNewStyleName('');
  };

  const handleDeleteStyle = (styleId: number) => {
    if (styles.length <= 1) {
      alert('Armature must have at least one style.');
      return;
    }
    saveHistoryState();
    setRoot(prev => ({
      ...prev,
      styles: (prev.styles || []).filter(s => s.id !== styleId),
    }));
    if (selectedStyleId === styleId) {
      const remaining = styles.filter(s => s.id !== styleId);
      setSelectedStyleId(remaining[0]?.id ?? 0);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-2xl bg-[#20192e] border border-[#412e69] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#251d38] border-b border-[#2c2440] flex items-center justify-between">
          <div className="flex items-center gap-2 text-purple-300 font-bold text-sm">
            <Shirt className="w-4 h-4" />
            <span>Styles & Skins Manager</span>
          </div>
          <button
            onClick={() => setShowStylesModal(false)}
            className="p-1 text-gray-400 hover:text-white rounded hover:bg-[#412e69]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Info Banner */}
        <div className="px-5 py-2.5 bg-[#191325] border-b border-[#2c2440] text-xs text-gray-300 leading-relaxed">
          Styles allow hotswapping textures to create multiple outfits or skins. Bones use textures from the first active style top-down containing the bone's texture name.
        </div>

        {/* Content: 2 Columns */}
        <div className="flex-1 grid grid-cols-2 divide-x divide-[#2c2440] overflow-hidden min-h-[300px]">
          {/* Left: Styles list */}
          <div className="p-4 flex flex-col overflow-y-auto">
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Style Sets ({styles.length})
            </div>

            <div className="flex-1 space-y-1 overflow-y-auto">
              {styles.map((style, idx) => (
                <div
                  key={`style-${style.id}-${idx}`}
                  onClick={() => setSelectedStyleId(style.id)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer border transition text-xs ${
                    selectedStyleId === style.id
                      ? 'bg-[#412e69] border-[#7c3aed] text-white font-medium shadow'
                      : 'bg-[#181223] border-[#2c2440] text-gray-300 hover:bg-[#251d38]'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="truncate">{style.name}</span>
                    <span className="text-[10px] text-gray-400">
                      ({style.textures.length} tex)
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                    {/* Active Checkbox */}
                    <button
                      onClick={() => handleToggleStyleActive(style.id)}
                      className={`p-1 rounded text-xs transition ${
                        style.active
                          ? 'bg-purple-600 text-white'
                          : 'bg-[#2a1f3d] text-gray-500 hover:text-gray-300'
                      }`}
                      title={style.active ? 'Style is Active' : 'Style is Inactive'}
                    >
                      <Eye className="w-3 h-3" />
                    </button>

                    {/* Delete */}
                    {styles.length > 1 && (
                      <button
                        onClick={() => handleDeleteStyle(style.id)}
                        className="p-1 hover:text-red-400 text-gray-500 rounded"
                        title="Delete Style"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Add New Style Input */}
            <div className="mt-3 pt-3 border-t border-[#2c2440] flex gap-2">
              <input
                type="text"
                placeholder="New style name..."
                value={newStyleName}
                onChange={e => setNewStyleName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddStyle()}
                className="flex-1 px-2.5 py-1.5 bg-[#140f1d] border border-[#412e69] rounded text-white text-xs focus:outline-none"
              />
              <button
                onClick={handleAddStyle}
                className="px-3 py-1.5 bg-[#5b3d9c] hover:bg-[#7c3aed] text-white text-xs rounded transition flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>

          {/* Right: Textures in Selected Style */}
          <div className="p-4 flex flex-col overflow-y-auto">
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Textures in "{currentStyle?.name}"</span>
              <span>{currentStyle?.textures.length || 0} textures</span>
            </div>

            {(!currentStyle || currentStyle.textures.length === 0) ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-gray-500 text-xs">
                <ImageIcon className="w-8 h-8 text-gray-600 mb-2" />
                <p>No textures in this style.</p>
                <p className="text-[11px] text-gray-600 mt-1">
                  Textures defined in the atlas will appear here.
                </p>
              </div>
            ) : (
              <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
                {currentStyle.textures.map((tex, idx) => (
                  <div
                    key={`style-tex-${tex.name}-${idx}`}
                    className="flex items-center justify-between p-2 rounded bg-[#181223] border border-[#2c2440] text-xs text-gray-200"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <ImageIcon className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                      <span className="truncate font-medium">{tex.name}</span>
                    </div>
                    <div className="text-[10px] text-gray-400 font-mono">
                      {tex.size.x} × {tex.size.y} px
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#191325] border-t border-[#2c2440] flex justify-end">
          <button
            onClick={() => setShowStylesModal(false)}
            className="px-4 py-1.5 bg-[#412e69] hover:bg-[#5b3d9c] text-white text-xs font-medium rounded transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
