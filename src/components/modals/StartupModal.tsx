import React from 'react';
import { useEditor } from '../../context/EditorContext';
import { Sparkles, FilePlus, FolderOpen, BookOpen, ExternalLink, X, Wand2 } from 'lucide-react';

export const StartupModal: React.FC = () => {
  const {
    showStartupModal,
    setShowStartupModal,
    loadSample,
    newProject,
    loadFile,
    setShowAutoRigModal,
  } = useEditor();

  if (!showStartupModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 select-none animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-[#151821] border border-white/[0.08] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-[#191d28]/70 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-500 flex items-center justify-center text-white font-bold text-sm shadow-md">
              S
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">
                SkelForm Studio
              </h2>
              <p className="text-[11px] text-zinc-400">
                2D редактор скелетной анимации и AI Auto-Rig
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowStartupModal(false)}
            className="p-1.5 text-zinc-400 hover:text-white rounded-xl hover:bg-white/[0.06] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/[0.06] p-6 gap-6">
          {/* Left 2 Cols: Start & Samples */}
          <div className="md:col-span-2 space-y-4">
            <p className="text-xs text-zinc-300">
              Начните с чистого холста, откройте файл или опробуйте готовых персонажей с ригом:
            </p>

            {/* Quick Action Buttons */}
            <div className="grid grid-cols-3 gap-2.5">
              <button
                onClick={newProject}
                className="flex items-center gap-2.5 p-3 bg-[#0e1015] hover:bg-[#1a1e29] border border-white/[0.06] rounded-2xl text-left transition group shadow-sm"
              >
                <div className="p-2 bg-indigo-600 rounded-xl text-white group-hover:scale-105 transition shadow-sm">
                  <FilePlus className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">С нуля</div>
                  <div className="text-[10px] text-zinc-400">Пустой риг</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setShowStartupModal(false);
                  setShowAutoRigModal(true);
                }}
                className="flex items-center gap-2.5 p-3 bg-gradient-to-br from-indigo-950/80 to-purple-950/80 hover:from-indigo-900/80 hover:to-purple-900/80 border border-indigo-500/30 rounded-2xl text-left transition group shadow-md"
              >
                <div className="p-2 bg-amber-400 text-black rounded-xl group-hover:scale-105 transition shadow-sm">
                  <Wand2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1">Auto-Rig</div>
                  <div className="text-[10px] text-indigo-300">AI из картинки</div>
                </div>
              </button>

              <label className="flex items-center gap-2.5 p-3 bg-[#0e1015] hover:bg-[#1a1e29] border border-white/[0.06] rounded-2xl text-left transition group shadow-sm cursor-pointer">
                <input
                  type="file"
                  accept=".skf,.skfe,.json"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) loadFile(f);
                  }}
                />
                <div className="p-2 bg-blue-600 rounded-xl text-white group-hover:scale-105 transition shadow-sm">
                  <FolderOpen className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">Открыть</div>
                  <div className="text-[10px] text-zinc-400">.skf / .json</div>
                </div>
              </label>
            </div>

            {/* Preloaded Samples Section */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-indigo-400 font-bold mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Образцы персонажей
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {/* Skellina Card */}
                <div
                  onClick={() => loadSample('_skellina.skf')}
                  className="p-3 bg-[#0e1015] hover:bg-[#1a1e29] border border-white/[0.06] rounded-2xl cursor-pointer transition group shadow-sm"
                >
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <img
                      src="/assets/skellina_icon.png"
                      alt="Skellina"
                      className="w-8 h-8 rounded-xl bg-[#161922] p-0.5 border border-white/[0.08]"
                      onError={e => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                    <div>
                      <div className="font-bold text-xs text-white group-hover:text-indigo-300 transition">
                        Skellina
                      </div>
                      <div className="text-[10px] text-zinc-500">2 скина, 2 анимации</div>
                    </div>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Персонаж с 2-суставными конечностями и платьем принцессы.
                  </p>
                </div>

                {/* Skellington Card */}
                <div
                  onClick={() => loadSample('_skellington.skf')}
                  className="p-3 bg-[#0e1015] hover:bg-[#1a1e29] border border-white/[0.06] rounded-2xl cursor-pointer transition group shadow-sm"
                >
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <img
                      src="/assets/skellington_icon.png"
                      alt="Skellington"
                      className="w-8 h-8 rounded-xl bg-[#161922] p-0.5 border border-white/[0.08]"
                      onError={e => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                    <div>
                      <div className="font-bold text-xs text-white group-hover:text-indigo-300 transition">
                        Skellington
                      </div>
                      <div className="text-[10px] text-zinc-500">FABRIK IK & Mesh</div>
                    </div>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Резиновые конечности с инверсной кинематикой и деформацией.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Col: Resources & Tips */}
          <div className="space-y-3.5 pl-0 md:pl-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-indigo-400" /> Документация
            </div>

            <ul className="space-y-1.5 text-xs text-zinc-300">
              <li>
                <a
                  href="https://skelform.org/user-docs"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between p-2.5 rounded-xl bg-[#0e1015] hover:bg-[#1a1e29] border border-white/[0.06] transition text-zinc-200 hover:text-white"
                >
                  <span>Руководство</span>
                  <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
                </a>
              </li>
              <li>
                <a
                  href="https://skelform.org/dev-docs"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between p-2.5 rounded-xl bg-[#0e1015] hover:bg-[#1a1e29] border border-white/[0.06] transition text-zinc-200 hover:text-white"
                >
                  <span>Runtime API</span>
                  <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
                </a>
              </li>
            </ul>

            <div className="p-3 bg-[#0e1015] rounded-2xl border border-white/[0.06] text-[11px] text-zinc-400 leading-relaxed">
              <span className="font-semibold text-white block mb-1">Горячие клавиши:</span>
              Пробел — пуск/пауза анимации. W/E/R — перемещение, вращение, масштаб. MMB / Alt+Drag — панорамирование.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-[#191d28]/70 border-t border-white/[0.06] flex justify-end">
          <button
            onClick={() => setShowStartupModal(false)}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition shadow-md"
          >
            В редактор
          </button>
        </div>
      </div>
    </div>
  );
};
