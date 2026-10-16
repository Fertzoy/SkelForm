# SkelForm - 2D Skeletal Animation Editor (React Web Edition)

SkelForm is a 2D skeletal animator designed for quick and easy integration into games or other software with simple techniques and developer-curated runtime documentation.

Rewritten from the original Rust/Wasm implementation to a modern, responsive React + TypeScript application with HTML5 Canvas, FABRIK inverse kinematics, multi-track animation keyframing, skins/styles support, and full `.skf` package import/export compatibility.

## Features

- **2D Skeletal Rigging**: Parent-child bone hierarchy with intuitive tree management, fold/unfold, visibility and lock controls.
- **Interactive Viewport**: Real-time canvas rendering with Move, Rotate, Scale, and Pivot manipulation gizmos.
- **FABRIK Inverse Kinematics**: Forward and Backward Reaching Inverse Kinematics solver supporting Clockwise (CW) and Counter-Clockwise (CCW) joint constraints.
- **Keyframe Timeline**: Multi-track timeline for animating Position, Rotation, Scale, Texture, Z-Index, and Color Tint with easing presets (Linear, Sine-In, Sine-Out, Sine-In-Out, Snap).
- **Styles & Skins**: Hotswappable texture sets for characters (e.g. outfits, skins, alternate appearances).
- **Onion Skinning**: Ghosting of previous and next keyframe poses in transparent red and blue.
- **Full `.skf` Compatibility**: Read and export official zipped `.skf` bundles containing `armature.json`, `editor.json`, and texture atlases.
- **Spritesheet & Sequence Export**: Generate PNG spritesheet grids or individual frame sequence ZIPs for game engines (Unity, Godot, Phaser, etc.).
- **Bundled Sample Characters**: Includes the complete *Skellina* and *Skellington* character rigs.

## Getting Started

```bash
npm install
npm run dev
```

Dev server runs on `http://localhost:3000`.

To build for production:
```bash
npm run build
```
