import React, { useState, useEffect, useRef } from 'react';
import { useEditor } from '../context/EditorContext';
import {
  Search,
  Sparkles,
  Move,
  RotateCw,
  Maximize2,
  Bone,
  Layers,
  Grid,
  Save,
  Download,
  FolderOpen,
  Plus,
  Play,
  RotateCcw,
  Sliders,
  Maximize,
  HelpCircle,
  Eye,
  Command,
  Languages,
} from 'lucide-react';

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  category: string;
  action: () => void;
  shortcut?: string;
}

export const CommandPalette: React.FC = () => {
  const {
    showCommandPalette,
    setShowCommandPalette,
    setShowAutoRigModal,
    setShowExportModal,
    setShowStylesModal,
    setShowSettingsModal,
    setShowStartupModal,
    setShowDevPanel,
    newProject,
    loadSample,
    setActiveTool,
    showGrid,
    setShowGrid,
    onionLayers,
    setOnionLayers,
    showBonesOnCanvas,
    setShowBonesOnCanvas,
    isPlaying,
    setIsPlaying,
    focusCamera,
    undo,
    redo,
    language,
    setLanguage,
    advancedMode,
    setAdvancedMode,
    exportProject,
    t,
  } = useEditor();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (showCommandPalette) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [showCommandPalette]);

  if (!showCommandPalette) return null;

  const commands: CommandItem[] = [
    {
      id: 'autorig',
      title: '✨ Auto-Rig AI (Автоматический риггинг)',
      subtitle: 'Нейросеть распознает анатомию и создаст скелет с анимацией',
      icon: <Sparkles className="w-4 h-4 text-amber-400" />,
      category: 'AI',
      action: () => setShowAutoRigModal(true),
      shortcut: 'AI',
    },
    {
      id: 'tool_select',
      title: 'Инструмент: Выделение',
      subtitle: 'Выбирать кости и объекты',
      icon: <Move className="w-4 h-4 text-indigo-400" />,
      category: 'Инструменты',
      action: () => setActiveTool('select'),
      shortcut: 'V',
    },
    {
      id: 'tool_bone',
      title: 'Инструмент: Создать кость',
      subtitle: 'Кликните на холсте для размещения новой кости',
      icon: <Bone className="w-4 h-4 text-emerald-400" />,
      category: 'Инструменты',
      action: () => setActiveTool('bone'),
      shortcut: 'B',
    },
    {
      id: 'tool_move',
      title: 'Инструмент: Перемещение',
      subtitle: 'Перемещать кости в плоскости X/Y',
      icon: <Move className="w-4 h-4 text-sky-400" />,
      category: 'Инструменты',
      action: () => setActiveTool('move'),
      shortcut: 'W',
    },
    {
      id: 'tool_rotate',
      title: 'Инструмент: Вращение',
      subtitle: 'Поворачивать кость вокруг точки опоры',
      icon: <RotateCw className="w-4 h-4 text-indigo-400" />,
      category: 'Инструменты',
      action: () => setActiveTool('rotate'),
      shortcut: 'E',
    },
    {
      id: 'tool_scale',
      title: 'Инструмент: Масштабирование',
      subtitle: 'Изменять размер кости и привязанного спрайта',
      icon: <Maximize2 className="w-4 h-4 text-pink-400" />,
      category: 'Инструменты',
      action: () => setActiveTool('scale'),
      shortcut: 'R',
    },
    {
      id: 'tool_hand',
      title: 'Инструмент: Рука (Панорама)',
      subtitle: 'Свободное перетаскивание холста',
      icon: <Maximize className="w-4 h-4 text-zinc-400" />,
      category: 'Инструменты',
      action: () => setActiveTool('hand'),
      shortcut: 'H',
    },
    {
      id: 'focus',
      title: 'Сфокусировать камеру на персонаже',
      subtitle: 'Центрировать вид на костях',
      icon: <Maximize className="w-4 h-4 text-indigo-400" />,
      category: 'Вид',
      action: () => focusCamera(),
      shortcut: 'F',
    },
    {
      id: 'toggle_grid',
      title: showGrid ? 'Скрыть координатную сетку' : 'Показать координатную сетку',
      subtitle: 'Переключить сетку вьюпорта',
      icon: <Grid className="w-4 h-4 text-zinc-400" />,
      category: 'Вид',
      action: () => setShowGrid(!showGrid),
    },
    {
      id: 'toggle_onion',
      title: onionLayers ? 'Выключить Onion Skin' : 'Включить Onion Skin',
      subtitle: 'Показывать призрачные позы соседних кадров',
      icon: <Layers className="w-4 h-4 text-amber-400" />,
      category: 'Вид',
      action: () => setOnionLayers(!onionLayers),
    },
    {
      id: 'toggle_bones',
      title: showBonesOnCanvas ? 'Скрыть линии костей' : 'Показать линии костей',
      subtitle: 'Оставить только чистые картинки или показать каркас',
      icon: <Eye className="w-4 h-4 text-cyan-400" />,
      category: 'Вид',
      action: () => setShowBonesOnCanvas(!showBonesOnCanvas),
    },
    {
      id: 'playback',
      title: isPlaying ? 'Пауза анимации' : 'Воспроизведение анимации',
      subtitle: 'Запустить или остановить проигрывание',
      icon: <Play className="w-4 h-4 text-emerald-400" />,
      category: 'Анимация',
      action: () => setIsPlaying(!isPlaying),
      shortcut: 'Space',
    },
    {
      id: 'export_project',
      title: 'Экспорт спрайтшита / видео',
      subtitle: 'Открыть диалог экспорта анимации',
      icon: <Download className="w-4 h-4 text-indigo-400" />,
      category: 'Файл',
      action: () => setShowExportModal(true),
    },
    {
      id: 'save_project',
      title: 'Сохранить проект (.skf)',
      subtitle: 'Скачать полный файл проекта с текстурами',
      icon: <Save className="w-4 h-4 text-emerald-400" />,
      category: 'Файл',
      action: () => exportProject('armature.skf'),
      shortcut: '⌘S',
    },
    {
      id: 'new_project',
      title: 'Новый проект',
      subtitle: 'Сбросить сцену и создать новый скелет',
      icon: <Plus className="w-4 h-4 text-emerald-400" />,
      category: 'Файл',
      action: () => newProject(),
    },
    {
      id: 'sample_skellina',
      title: 'Загрузить демо: Skellina',
      subtitle: 'Готовый персонаж с настроенным скелетом',
      icon: <Sparkles className="w-4 h-4 text-purple-400" />,
      category: 'Демо',
      action: () => loadSample('_skellina.skf'),
    },
    {
      id: 'sample_skellington',
      title: 'Загрузить демо: Skellington',
      subtitle: 'Демонстрационный скелет с инверсной кинематикой',
      icon: <Sparkles className="w-4 h-4 text-purple-400" />,
      category: 'Демо',
      action: () => loadSample('_skellington.skf'),
    },
    {
      id: 'toggle_advanced',
      title: advancedMode ? 'Выключить расширенный режим' : 'Включить расширенный режим',
      subtitle: 'Показывать расширенные настройки физики и вертексов',
      icon: <Sliders className="w-4 h-4 text-zinc-400" />,
      category: 'Режим',
      action: () => setAdvancedMode(!advancedMode),
    },
    {
      id: 'switch_lang',
      title: language === 'ru' ? 'Switch language to English' : 'Переключить язык на Русский',
      subtitle: 'Сменить язык интерфейса',
      icon: <Languages className="w-4 h-4 text-zinc-400" />,
      category: 'Язык',
      action: () => setLanguage(language === 'ru' ? 'en' : 'ru'),
    },
    {
      id: 'dev_panel',
      title: 'Панель разработчика и самотесты (Dev Tools)',
      subtitle: 'Проверка координат, матриц, загрузки картинок и AI',
      icon: <Command className="w-4 h-4 text-pink-400" />,
      category: 'Разработчик',
      action: () => setShowDevPanel(true),
      shortcut: 'Shift+D',
    },
  ];

  const filtered = commands.filter(
    c =>
      c.title.toLowerCase().includes(query.toLowerCase()) ||
      (c.subtitle && c.subtitle.toLowerCase().includes(query.toLowerCase())) ||
      c.category.toLowerCase().includes(query.toLowerCase())
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
        setShowCommandPalette(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowCommandPalette(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={() => setShowCommandPalette(false)}
    >
      <div
        className="w-full max-w-xl bg-[#131620] border border-white/[0.12] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.08]">
          <Search className="w-5 h-5 text-indigo-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Быстрый поиск команд, инструментов, настроек..."
            className="flex-1 bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none"
          />
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-[10px] text-zinc-400 font-mono">
            <span>ESC</span>
          </div>
        </div>

        {/* Command list */}
        <div className="max-h-96 overflow-y-auto p-2 flex flex-col gap-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-zinc-500">
              Ничего не найдено по запросу "{query}"
            </div>
          ) : (
            filtered.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={`cp-cmd-${cmd.id}-${idx}`}
                  onClick={() => {
                    cmd.action();
                    setShowCommandPalette(false);
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-2xl cursor-pointer transition select-none ${
                    isSelected
                      ? 'bg-indigo-600/90 text-white shadow-md'
                      : 'hover:bg-white/[0.05] text-zinc-300'
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <div className={`p-2 rounded-xl ${isSelected ? 'bg-white/20' : 'bg-white/[0.06]'}`}>
                      {cmd.icon}
                    </div>
                    <div className="flex flex-col truncate">
                      <span className="text-xs font-semibold">{cmd.title}</span>
                      {cmd.subtitle && (
                        <span className={`text-[11px] truncate ${isSelected ? 'text-indigo-100' : 'text-zinc-500'}`}>
                          {cmd.subtitle}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${isSelected ? 'bg-white/20 text-white' : 'bg-white/[0.04] text-zinc-500'}`}>
                      {cmd.category}
                    </span>
                    {cmd.shortcut && (
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md ${isSelected ? 'bg-white/25 text-white' : 'bg-white/[0.08] text-zinc-400'}`}>
                        {cmd.shortcut}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer tip */}
        <div className="px-5 py-2.5 bg-[#0e1017] border-t border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-500">
          <div className="flex items-center gap-2">
            <span>↑↓ Навигация</span>
            <span>·</span>
            <span>↵ Выбор</span>
          </div>
          <span>SkelForm Studio Command Palette</span>
        </div>
      </div>
    </div>
  );
};
