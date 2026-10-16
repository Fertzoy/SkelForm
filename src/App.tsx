import React, { useEffect } from 'react';
import { EditorProvider, useEditor } from './context/EditorContext';
import { TopBar } from './components/TopBar';
import { ViewportCanvas } from './components/ViewportCanvas';
import { ArmaturePanel } from './components/ArmaturePanel';
import { BoneInspector } from './components/BoneInspector';
import { TimelinePanel } from './components/TimelinePanel';
import { StartupModal } from './components/modals/StartupModal';
import { StylesModal } from './components/modals/StylesModal';
import { ExportModal } from './components/modals/ExportModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { WarningsModal } from './components/modals/WarningsModal';
import { AutoRigModal } from './components/modals/AutoRigModal';
import { CommandPalette } from './components/CommandPalette';
import { DevPanel } from './components/DevPanel';

const EditorLayout: React.FC = () => {
  const {
    loadFile,
    isPlaying,
    setIsPlaying,
    activeTool,
    setActiveTool,
    undo,
    redo,
    selectedBoneId,
    deleteBone,
    addBone,
    focusCamera,
    editorMode,
    setEditorMode,
    showAutoRigModal,
    setShowAutoRigModal,
    showCommandPalette,
    setShowCommandPalette,
    showDevPanel,
    setShowDevPanel,
  } = useEditor();

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      ) {
        return;
      }

      // ⌘K / Ctrl+K: Command Palette
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setShowCommandPalette(!showCommandPalette);
        return;
      }

      // Shift+D: Dev Panel & Self-tests
      if (e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        setShowDevPanel(!showDevPanel);
        return;
      }

      // Space: Play / Pause
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(!isPlaying);
      }
      // Q: Move tool
      else if (e.key === 'q' || e.key === 'Q') {
        setActiveTool('move');
      }
      // W: Rotate tool
      else if (e.key === 'w' || e.key === 'W') {
        setActiveTool('rotate');
      }
      // E: Scale tool
      else if (e.key === 'e' || e.key === 'E') {
        setActiveTool('scale');
      }
      // V: Select tool
      else if (e.key === 'v' || e.key === 'V') {
        setActiveTool('select');
      }
      // B: Bone tool
      else if (e.key === 'b' || e.key === 'B') {
        setActiveTool('bone');
        addBone(selectedBoneId ?? undefined);
      }
      // H: Hand tool (Pan)
      else if (e.key === 'h' || e.key === 'H') {
        setActiveTool('hand');
      }
      // P: Pivot tool
      else if (e.key === 'p' || e.key === 'P') {
        setActiveTool('pivot');
      }
      // F: Focus camera
      else if (e.key === 'f' || e.key === 'F') {
        focusCamera();
      }
      // Undo
      else if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        undo();
      }
      // Redo
      else if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redo();
      }
      // Delete selected bone
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBoneId !== null) {
        e.preventDefault();
        deleteBone(selectedBoneId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isPlaying,
    setIsPlaying,
    activeTool,
    setActiveTool,
    undo,
    redo,
    selectedBoneId,
    deleteBone,
    addBone,
    focusCamera,
    showCommandPalette,
    setShowCommandPalette,
    showDevPanel,
    setShowDevPanel,
  ]);

  // Drag and Drop listener for .skf / image files
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        loadFile(files[0]);
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [loadFile]);

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-[#1e172a] text-[#e2e8f0]">
      {/* 1. Top macOS title bar + classic desktop menu bar */}
      <TopBar />

      {/* 2. Main 3-Column Workstation Layout (Matching image.png) */}
      <div className="flex-1 flex flex-row overflow-hidden relative">
        {/* Left Column: Armature hierarchy tree panel */}
        <ArmaturePanel />

        {/* Center Column: Viewport Canvas + Expandable Timeline in Animation mode */}
        <main className="flex-1 flex flex-col min-w-0 relative overflow-hidden bg-[#221f2b]">
          <div className="flex-1 relative overflow-hidden">
            <ViewportCanvas />
          </div>

          {/* Bottom Timeline Panel (visible in Animation mode) */}
          {editorMode === 'animation' && <TimelinePanel />}
        </main>

        {/* Right Column: Bone inspector panel */}
        <BoneInspector />
      </div>

      {/* Modals & Overlays */}
      <StartupModal />
      <StylesModal />
      <ExportModal />
      <SettingsModal />
      <WarningsModal />
      <AutoRigModal isOpen={showAutoRigModal} onClose={() => setShowAutoRigModal(false)} />
      <CommandPalette />
      <DevPanel />
    </div>
  );
};

export default function App() {
  return (
    <EditorProvider>
      <EditorLayout />
    </EditorProvider>
  );
}
