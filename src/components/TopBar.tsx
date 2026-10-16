import React, { useState, useRef, useEffect } from 'react';
import { useEditor } from '../context/EditorContext';
import {
  FolderOpen,
  Save,
  Download,
  Plus,
  Undo2,
  Redo2,
  Settings,
  AlertTriangle,
  HelpCircle,
  Sparkles,
  Shirt,
  Command,
  Languages,
  Sliders,
  Terminal,
  ChevronDown,
  Trash2,
  Eye,
  Maximize,
  Layers,
} from 'lucide-react';

export const TopBar: React.FC = () => {
  const {
    newProject,
    exportProject,
    loadFile,
    loadSample,
    undo,
    redo,
    canUndo,
    canRedo,
    selectedBoneId,
    addBone,
    deleteBone,
    focusCamera,
    showGrid,
    setShowGrid,
    showBonesOnCanvas,
    setShowBonesOnCanvas,
    onionLayers,
    setOnionLayers,
    setShowStartupModal,
    setShowStylesModal,
    setShowExportModal,
    setShowSettingsModal,
    setShowWarningsModal,
    setShowAutoRigModal,
    setShowCommandPalette,
    setShowDevPanel,
    warnings,
    language,
    setLanguage,
    t,
  } = useEditor();

  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const menuBarRef = useRef<HTMLDivElement | null>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setActiveMenu(null);
  };

  return (
    <header className="flex flex-col select-none shrink-0 z-40 border-b border-[#2d233e]">
      <input
        ref={fileInputRef}
        type="file"
        accept=".skf,.skfe,.json"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* 1. macOS Style Title Bar */}
      <div className="h-7 px-3 bg-[#1e172a] flex items-center justify-between border-b border-[#291f3a] text-xs text-gray-300">
        {/* Left macOS Window Control Dots */}
        <div className="flex items-center gap-1.5 w-32">
          <button
            onClick={() => {
              if (window.confirm('Очистить проект и начать сначала?')) newProject();
            }}
            className="w-3 h-3 rounded-full bg-[#ff5f56] hover:brightness-110 active:brightness-90 transition shadow-sm border border-black/20"
            title="Закрыть / Новый проект"
          />
          <button
            onClick={() => setShowCommandPalette(true)}
            className="w-3 h-3 rounded-full bg-[#ffbd2e] hover:brightness-110 active:brightness-90 transition shadow-sm border border-black/20"
            title="Командная строка (⌘K)"
          />
          <button
            onClick={focusCamera}
            className="w-3 h-3 rounded-full bg-[#27c93f] hover:brightness-110 active:brightness-90 transition shadow-sm border border-black/20"
            title="Фокус камеры (F)"
          />
        </div>

        {/* Center Application Title */}
        <div className="flex items-center justify-center gap-1 text-[13px] font-medium tracking-tight text-gray-200">
          <span className="font-semibold text-white">SkelForm</span>
          <span className="text-gray-400">- v0.4.0 *</span>
        </div>

        {/* Right Subtle Controls */}
        <div className="flex items-center justify-end gap-2 w-32 text-[11px]">
          {/* Quick Language Toggle */}
          <button
            onClick={() => setLanguage(language === 'ru' ? 'en' : 'ru')}
            className="px-1.5 py-0.5 rounded text-[11px] font-mono text-gray-400 hover:text-white hover:bg-white/[0.08] transition"
            title="Переключить язык (RU / EN)"
          >
            {language.toUpperCase()}
          </button>

          {/* Dev Self-Tests */}
          <button
            onClick={() => setShowDevPanel(true)}
            className="p-1 text-gray-400 hover:text-purple-300 hover:bg-white/[0.08] rounded transition"
            title="Консоль разработчика и тесты (Shift+D)"
          >
            <Terminal className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 2. Classic Desktop Menu Bar */}
      <div
        ref={menuBarRef}
        className="h-6.5 px-3 bg-[#241c33] flex items-center justify-between text-xs text-gray-300"
      >
        <div className="flex items-center gap-0.5">
          {/* FILE MENU */}
          <div className="relative">
            <button
              onClick={() => setActiveMenu(activeMenu === 'file' ? null : 'file')}
              className={`px-2 py-0.5 rounded text-[12px] font-normal transition ${
                activeMenu === 'file'
                  ? 'bg-[#503789] text-white'
                  : 'hover:bg-white/[0.08] text-gray-200'
              }`}
            >
              File
            </button>
            {activeMenu === 'file' && (
              <div className="absolute left-0 top-full mt-0.5 w-56 bg-[#211a2f] border border-[#3b2d56] rounded shadow-xl py-1 z-50 text-xs">
                <button
                  onClick={() => {
                    newProject();
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1 text-left flex justify-between hover:bg-[#503789] hover:text-white text-gray-200"
                >
                  <span>New Project</span>
                  <span className="text-[10px] text-gray-400">Ctrl+N</span>
                </button>
                <button
                  onClick={() => {
                    fileInputRef.current?.click();
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1 text-left flex justify-between hover:bg-[#503789] hover:text-white text-gray-200"
                >
                  <span>Open .skf File...</span>
                  <span className="text-[10px] text-gray-400">Ctrl+O</span>
                </button>
                <div className="my-1 border-t border-[#34274c]" />
                <button
                  onClick={() => {
                    exportProject('armature.skf');
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1 text-left flex justify-between hover:bg-[#503789] hover:text-white text-gray-200"
                >
                  <span>Save .skf Bundle</span>
                  <span className="text-[10px] text-gray-400">Ctrl+S</span>
                </button>
                <button
                  onClick={() => {
                    setShowExportModal(true);
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1 text-left flex justify-between hover:bg-[#503789] hover:text-white text-gray-200"
                >
                  <span>Export Spritesheet / Frames...</span>
                  <span className="text-[10px] text-gray-400">Ctrl+E</span>
                </button>
                <div className="my-1 border-t border-[#34274c]" />
                <div className="px-3 py-0.5 text-[10px] uppercase font-bold text-gray-400">Samples</div>
                <button
                  onClick={() => {
                    loadSample('_skellina.skf');
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1 text-left hover:bg-[#503789] hover:text-white text-gray-200"
                >
                  Load Sample: Skellina
                </button>
                <button
                  onClick={() => {
                    loadSample('_skellington.skf');
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1 text-left hover:bg-[#503789] hover:text-white text-gray-200"
                >
                  Load Sample: Skellington
                </button>
              </div>
            )}
          </div>

          {/* EDIT MENU */}
          <div className="relative">
            <button
              onClick={() => setActiveMenu(activeMenu === 'edit' ? null : 'edit')}
              className={`px-2 py-0.5 rounded text-[12px] font-normal transition ${
                activeMenu === 'edit'
                  ? 'bg-[#503789] text-white'
                  : 'hover:bg-white/[0.08] text-gray-200'
              }`}
            >
              Edit
            </button>
            {activeMenu === 'edit' && (
              <div className="absolute left-0 top-full mt-0.5 w-52 bg-[#211a2f] border border-[#3b2d56] rounded shadow-xl py-1 z-50 text-xs">
                <button
                  onClick={() => {
                    undo();
                    setActiveMenu(null);
                  }}
                  disabled={!canUndo}
                  className="w-full px-3 py-1 text-left flex justify-between hover:bg-[#503789] hover:text-white text-gray-200 disabled:opacity-40"
                >
                  <span>Undo</span>
                  <span className="text-[10px] text-gray-400">Ctrl+Z</span>
                </button>
                <button
                  onClick={() => {
                    redo();
                    setActiveMenu(null);
                  }}
                  disabled={!canRedo}
                  className="w-full px-3 py-1 text-left flex justify-between hover:bg-[#503789] hover:text-white text-gray-200 disabled:opacity-40"
                >
                  <span>Redo</span>
                  <span className="text-[10px] text-gray-400">Ctrl+Y</span>
                </button>
                <div className="my-1 border-t border-[#34274c]" />
                <button
                  onClick={() => {
                    addBone(selectedBoneId ?? undefined);
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1 text-left flex justify-between hover:bg-[#503789] hover:text-white text-gray-200"
                >
                  <span>New Bone</span>
                  <span className="text-[10px] text-gray-400">B</span>
                </button>
                <button
                  onClick={() => {
                    if (selectedBoneId !== null) deleteBone(selectedBoneId);
                    setActiveMenu(null);
                  }}
                  disabled={selectedBoneId === null}
                  className="w-full px-3 py-1 text-left flex justify-between hover:bg-[#503789] hover:text-white text-gray-200 disabled:opacity-40"
                >
                  <span>Delete Bone</span>
                  <span className="text-[10px] text-gray-400">Del</span>
                </button>
                <div className="my-1 border-t border-[#34274c]" />
                <button
                  onClick={() => {
                    setShowAutoRigModal(true);
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1 text-left flex items-center gap-1.5 hover:bg-[#503789] hover:text-white text-indigo-300"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>AI Auto-Rig Wizard</span>
                </button>
              </div>
            )}
          </div>

          {/* VIEW MENU */}
          <div className="relative">
            <button
              onClick={() => setActiveMenu(activeMenu === 'view' ? null : 'view')}
              className={`px-2 py-0.5 rounded text-[12px] font-normal transition ${
                activeMenu === 'view'
                  ? 'bg-[#503789] text-white'
                  : 'hover:bg-white/[0.08] text-gray-200'
              }`}
            >
              View
            </button>
            {activeMenu === 'view' && (
              <div className="absolute left-0 top-full mt-0.5 w-52 bg-[#211a2f] border border-[#3b2d56] rounded shadow-xl py-1 z-50 text-xs">
                <button
                  onClick={() => {
                    focusCamera();
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1 text-left flex justify-between hover:bg-[#503789] hover:text-white text-gray-200"
                >
                  <span>Focus Camera</span>
                  <span className="text-[10px] text-gray-400">F</span>
                </button>
                <div className="my-1 border-t border-[#34274c]" />
                <button
                  onClick={() => {
                    setShowGrid(!showGrid);
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1 text-left flex justify-between hover:bg-[#503789] hover:text-white text-gray-200"
                >
                  <span>Toggle Grid</span>
                  <span className="text-[10px] text-gray-400">{showGrid ? '✓' : ''}</span>
                </button>
                <button
                  onClick={() => {
                    setShowBonesOnCanvas(!showBonesOnCanvas);
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1 text-left flex justify-between hover:bg-[#503789] hover:text-white text-gray-200"
                >
                  <span>Show Bones on Canvas</span>
                  <span className="text-[10px] text-gray-400">{showBonesOnCanvas ? '✓' : ''}</span>
                </button>
                <button
                  onClick={() => {
                    setOnionLayers(!onionLayers);
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1 text-left flex justify-between hover:bg-[#503789] hover:text-white text-gray-200"
                >
                  <span>Onion Skinning</span>
                  <span className="text-[10px] text-gray-400">{onionLayers ? '✓' : ''}</span>
                </button>
              </div>
            )}
          </div>

          {/* SETTINGS MENU */}
          <div className="relative">
            <button
              onClick={() => setActiveMenu(activeMenu === 'settings' ? null : 'settings')}
              className={`px-2 py-0.5 rounded text-[12px] font-normal transition ${
                activeMenu === 'settings'
                  ? 'bg-[#503789] text-white'
                  : 'hover:bg-white/[0.08] text-gray-200'
              }`}
            >
              Settings
            </button>
            {activeMenu === 'settings' && (
              <div className="absolute left-0 top-full mt-0.5 w-52 bg-[#211a2f] border border-[#3b2d56] rounded shadow-xl py-1 z-50 text-xs">
                <button
                  onClick={() => {
                    setShowStylesModal(true);
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1 text-left flex justify-between hover:bg-[#503789] hover:text-white text-gray-200"
                >
                  <span>Styles & Skins...</span>
                </button>
                <button
                  onClick={() => {
                    setShowSettingsModal(true);
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1 text-left flex justify-between hover:bg-[#503789] hover:text-white text-gray-200"
                >
                  <span>Preferences...</span>
                </button>
                <button
                  onClick={() => {
                    setShowWarningsModal(true);
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1 text-left flex justify-between hover:bg-[#503789] hover:text-white text-gray-200"
                >
                  <span>Rig Diagnostics ({warnings.length})</span>
                </button>
                <div className="my-1 border-t border-[#34274c]" />
                <button
                  onClick={() => {
                    setShowDevPanel(true);
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1 text-left flex justify-between hover:bg-[#503789] hover:text-white text-gray-200"
                >
                  <span>Developer Panel...</span>
                  <span className="text-[10px] text-gray-400">Shift+D</span>
                </button>
              </div>
            )}
          </div>

          {/* HELP MENU */}
          <div className="relative">
            <button
              onClick={() => setActiveMenu(activeMenu === 'help' ? null : 'help')}
              className={`px-2 py-0.5 rounded text-[12px] font-normal transition ${
                activeMenu === 'help'
                  ? 'bg-[#503789] text-white'
                  : 'hover:bg-white/[0.08] text-gray-200'
              }`}
            >
              Help
            </button>
            {activeMenu === 'help' && (
              <div className="absolute left-0 top-full mt-0.5 w-56 bg-[#211a2f] border border-[#3b2d56] rounded shadow-xl py-1 z-50 text-xs">
                <button
                  onClick={() => {
                    setShowStartupModal(true);
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1 text-left hover:bg-[#503789] hover:text-white text-gray-200"
                >
                  Welcome & Quickstart
                </button>
                <button
                  onClick={() => {
                    setShowSettingsModal(true);
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1 text-left hover:bg-[#503789] hover:text-white text-gray-200"
                >
                  Keyboard Shortcuts Reference
                </button>
                <div className="my-1 border-t border-[#34274c]" />
                <div className="px-3 py-1 text-[11px] text-gray-400">
                  SkelForm 2D Skeletal Animation Editor (Web Edition)
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Menu Bar Badges */}
        <div className="flex items-center gap-1.5">
          {/* Quick Sample Switcher Buttons */}
          <div className="flex items-center bg-[#1c1529] rounded px-1 py-0.5 border border-[#35274e] text-[10px] gap-1">
            <span className="text-gray-400">Samples:</span>
            <button
              onClick={() => loadSample('_skellina.skf')}
              className="px-1.5 py-0.5 rounded hover:bg-[#503789] text-purple-200 hover:text-white transition"
              title="Загрузить образец Skellina"
            >
              Skellina
            </button>
            <button
              onClick={() => loadSample('_skellington.skf')}
              className="px-1.5 py-0.5 rounded hover:bg-[#503789] text-purple-200 hover:text-white transition"
              title="Загрузить образец Skellington"
            >
              Skellington
            </button>
          </div>

          {/* Warnings Button */}
          {warnings.length > 0 && (
            <button
              onClick={() => setShowWarningsModal(true)}
              className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded text-[11px] flex items-center gap-1 hover:bg-amber-500/30 transition"
              title="Предупреждения рига"
            >
              <AlertTriangle className="w-3 h-3" />
              <span>{warnings.length}</span>
            </button>
          )}

          {/* Quick AI Auto-Rig */}
          <button
            onClick={() => setShowAutoRigModal(true)}
            className="px-2 py-0.5 bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white rounded text-[11px] flex items-center gap-1 shadow-sm transition"
            title="Авто-риггинг по изображению (✨ AI)"
          >
            <Sparkles className="w-3 h-3 text-amber-300" />
            <span>AI Rig</span>
          </button>
        </div>
      </div>
    </header>
  );
};
