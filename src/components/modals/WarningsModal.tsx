import React from 'react';
import { useEditor } from '../../context/EditorContext';
import { AlertTriangle, CheckCircle2, X, Wrench } from 'lucide-react';

export const WarningsModal: React.FC = () => {
  const {
    showWarningsModal,
    setShowWarningsModal,
    warnings,
    setSelectedBoneId,
  } = useEditor();

  if (!showWarningsModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-md bg-[#20192e] border border-amber-600/50 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#251d38] border-b border-[#2c2440] flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span>Rig Warnings ({warnings.length})</span>
          </div>
          <button
            onClick={() => setShowWarningsModal(false)}
            className="p-1 text-gray-400 hover:text-white rounded hover:bg-[#412e69]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
          {warnings.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-xs flex flex-col items-center">
              <CheckCircle2 className="w-8 h-8 text-green-400 mb-2" />
              <p className="font-medium text-white">No Warnings Found</p>
              <p className="text-[11px] text-gray-500 mt-1">Armature rig hierarchy is healthy.</p>
            </div>
          ) : (
            warnings.map((w, idx) => (
              <div
                key={`warn-${w.id}-${idx}`}
                className="p-3 bg-[#191325] border border-amber-900/40 rounded-lg space-y-2 text-xs"
              >
                <div className="flex items-start justify-between">
                  <div className="font-semibold text-amber-300">{w.title}</div>
                </div>
                <p className="text-[11px] text-gray-300">{w.description}</p>

                <div className="flex items-center gap-2 pt-1">
                  {w.boneIds && w.boneIds.length > 0 && (
                    <button
                      onClick={() => {
                        setSelectedBoneId(w.boneIds![0]);
                        setShowWarningsModal(false);
                      }}
                      className="text-[10px] text-purple-300 hover:text-white underline"
                    >
                      Inspect Bone #{w.boneIds[0]}
                    </button>
                  )}
                  {w.fixAction && (
                    <button
                      onClick={w.fixAction}
                      className="ml-auto px-2 py-1 bg-amber-900/80 hover:bg-amber-800 text-amber-200 text-[10px] rounded flex items-center gap-1 font-medium"
                    >
                      <Wrench className="w-3 h-3" /> Auto-Fix
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#191325] border-t border-[#2c2440] flex justify-end">
          <button
            onClick={() => setShowWarningsModal(false)}
            className="px-4 py-1.5 bg-[#412e69] hover:bg-[#5b3d9c] text-white text-xs font-medium rounded transition"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
