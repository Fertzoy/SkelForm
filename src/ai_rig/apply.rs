//! Turns a validated `AiRigPlan` into real SkelForm data (bones + an `Animation`).
//!
//! `build` is a pure function: it never touches the armature it is given. The caller decides
//! when to swap the result in (and records an undo snapshot first), so a bad plan can never
//! damage the project.
//!
//! How the engine maps to the plan (verified against the source):
//! - A bone is a joint (`pos`, `rot`, `scale`), positions are relative to the parent.
//! - A textured bone draws its texture centered on `pos + pivot_pos * size` (at rest),
//!   which is how the PSD importer keeps layers in place while the bone sits on the joint.
//! - So "attaching" a part to a plan bone = moving the part's bone onto the plan joint and
//!   setting `pivot_pos` so the picture does not move. The art is never moved or merged.
//! - Parents must come before children in `armature.bones` (see `renderer::inheritance`),
//!   and children must follow their parent contiguously (the armature window relies on it).

use std::collections::{HashMap, HashSet};

use crate::shared::*;

use super::plan::*;
use super::scene::{world_positions, PartInfo, SceneInfo};

pub struct RigOutput {
    pub bones: Vec<Bone>,
    pub animations: Vec<Animation>,
    /// Index (in `animations`) of the animation that was generated, if any.
    pub new_anim: Option<usize>,
    pub bones_created: usize,
    pub parts_rigged: usize,
    /// Non-fatal remarks that are shown to the user.
    pub notes: Vec<String>,
}

pub fn build(base: &Armature, scene: &SceneInfo, plan: &AiRigPlan) -> Result<RigOutput, String> {
    let world_old = world_positions(&base.bones)?;
    let mut notes: Vec<String> = vec![];

    // plan bone id -> part
    let mut part_of: HashMap<&str, &PartInfo> = HashMap::new();
    for at in &plan.attachments {
        let part = scene
            .parts
            .iter()
            .find(|p| p.key == at.part_id)
            .ok_or_else(|| {
                format!(
                    "Part `{}` is no longer in the scene. Run Auto-Rig again.",
                    at.part_id
                )
            })?;
        part_of.insert(at.bone_id.as_str(), part);
    }
    if plan.analysis.rig_strategy == RigStrategy::Transform
        && plan.attachments.is_empty()
        && plan.bones.len() == 1
    {
        if scene.parts.len() != 1 {
            return Err("Transform rig needs exactly one part to drive.".to_string());
        }
        part_of.insert(plan.bones[0].id.as_str(), &scene.parts[0]);
    }

    // Working copy. `Armature::new_bone` only needs the bone list.
    let mut arm = Armature::default();
    arm.bones = base.bones.clone();

    let managed_parts: HashSet<i32> = part_of.values().map(|p| p.bone_id).collect();

    // 1. place joints, create bones for joints without art
    let mut engine_id: HashMap<&str, i32> = HashMap::new();
    let mut new_world: HashMap<i32, Vec2> = world_old.clone();
    let mut bones_created = 0;
    for pb in &plan.bones {
        let joint = scene.to_world(&pb.start);
        if let Some(part) = part_of.get(pb.id.as_str()) {
            engine_id.insert(pb.id.as_str(), part.bone_id);
            new_world.insert(part.bone_id, joint);
            let bone = arm
                .find_bone_mut(part.bone_id)
                .ok_or_else(|| format!("Bone of part \"{}\" disappeared.", part.name))?;
            // keep the picture exactly where it is: center = pos + pivot * size
            bone.pivot_pos = Vec2::new(
                (part.center.x - joint.x) / part.size.x,
                (part.center.y - joint.y) / part.size.y,
            );
        } else {
            let (_, idx) = arm.new_bone(-1);
            let bone = &mut arm.bones[idx];
            bone.name = pb.name.clone();
            bone.folded = false;
            let id = bone.id;
            engine_id.insert(pb.id.as_str(), id);
            new_world.insert(id, joint);
            bones_created += 1;
        }
    }

    // 2. hierarchy
    for pb in &plan.bones {
        let eid = engine_id[pb.id.as_str()];
        let new_parent = match &pb.parent_id {
            Some(p) => engine_id[p.as_str()],
            None => {
                // the plan's root keeps the art's original parent (e.g. the PSD "Root"),
                // unless that would put it under one of its own new descendants
                let original = base.bones.iter().find(|b| b.id == eid).map(|b| b.parent_id);
                match original {
                    Some(p) if !chain_hits(&base.bones, p, &managed_parts) => p,
                    Some(_) => {
                        notes.push(format!(
                            "Root bone `{}` was moved to the top level of the hierarchy.",
                            pb.name
                        ));
                        -1
                    }
                    None => -1,
                }
            }
        };
        let bone = arm
            .find_bone_mut(eid)
            .ok_or_else(|| "A rigged bone disappeared.".to_string())?;
        bone.parent_id = new_parent;
    }

    // 3. local positions for ALL bones, so the rest pose looks exactly as before
    for i in 0..arm.bones.len() {
        let id = arm.bones[i].id;
        let parent = arm.bones[i].parent_id;
        let w = *new_world
            .get(&id)
            .ok_or_else(|| "Internal error: missing world position.".to_string())?;
        let p = if parent == -1 {
            Vec2::new(0., 0.)
        } else {
            *new_world
                .get(&parent)
                .ok_or_else(|| "Internal error: missing parent position.".to_string())?
        };
        let b = &mut arm.bones[i];
        b.pos = Vec2::new(w.x - p.x, w.y - p.y);
        b.init_pos = b.pos;
        b.init_rot = b.rot;
        b.init_scale = b.scale;
    }

    let bones = reorder(arm.bones)?;

    // 4. animation
    let mut animations = base.animations.clone();
    let mut new_anim = None;
    if let Some(anim) = &plan.animation {
        let mut built = build_animation(anim, plan, &engine_id, &bones, scene, &mut notes)?;
        let ids: Vec<i32> = animations.iter().map(|a| a.id).collect();
        built.id = generate_id(ids);
        let mut name = anim.name.trim().to_string();
        let mut n = 2;
        while animations.iter().any(|a| a.name == name) {
            name = format!("{} {}", anim.name.trim(), n);
            n += 1;
        }
        built.name = name;
        animations.push(built);
        new_anim = Some(animations.len() - 1);
    }

    let rigged: HashSet<i32> = engine_id.values().copied().collect();
    if base
        .animations
        .iter()
        .any(|a| a.keyframes.iter().any(|k| rigged.contains(&k.bone_id)))
    {
        notes.push(
            "Existing animations that move the rigged bones may need to be keyed again."
                .to_string(),
        );
    }

    Ok(RigOutput {
        bones,
        animations,
        new_anim,
        bones_created,
        parts_rigged: managed_parts.len(),
        notes,
    })
}

/// True if walking up from `start` meets any id of `set`.
fn chain_hits(bones: &[Bone], start: i32, set: &HashSet<i32>) -> bool {
    let mut cur = start;
    for _ in 0..=bones.len() {
        if cur == -1 {
            return false;
        }
        if set.contains(&cur) {
            return true;
        }
        match bones.iter().find(|b| b.id == cur) {
            Some(b) => cur = b.parent_id,
            None => return false,
        }
    }
    true
}

/// Depth-first order: every bone directly followed by its subtree, parents first.
pub fn reorder(bones: Vec<Bone>) -> Result<Vec<Bone>, String> {
    let ids: HashSet<i32> = bones.iter().map(|b| b.id).collect();
    let mut children: HashMap<i32, Vec<usize>> = HashMap::new();
    let mut roots: Vec<usize> = vec![];
    for (i, b) in bones.iter().enumerate() {
        if b.parent_id == -1 || !ids.contains(&b.parent_id) {
            roots.push(i);
        } else {
            children.entry(b.parent_id).or_default().push(i);
        }
    }

    let mut order: Vec<usize> = Vec::with_capacity(bones.len());
    let mut stack: Vec<usize> = roots.into_iter().rev().collect();
    while let Some(i) = stack.pop() {
        order.push(i);
        if let Some(kids) = children.get(&bones[i].id) {
            for k in kids.iter().rev() {
                stack.push(*k);
            }
        }
    }
    if order.len() != bones.len() {
        return Err("The resulting hierarchy contains a cycle.".to_string());
    }
    Ok(order.into_iter().map(|i| bones[i].clone()).collect())
}

fn preset_of(e: Easing) -> HandlePreset {
    match e {
        Easing::Linear => HandlePreset::Linear,
        Easing::EaseIn => HandlePreset::SineIn,
        Easing::EaseOut => HandlePreset::SineOut,
        Easing::EaseInOut => HandlePreset::SineInOut,
        Easing::Hold => HandlePreset::Snap,
    }
}

fn rest_value(p: Property) -> f32 {
    match p {
        Property::RotationDeg | Property::OffsetX | Property::OffsetY => 0.,
        Property::ScaleX | Property::ScaleY => 1.,
    }
}

fn build_animation(
    anim: &PlanAnimation,
    plan: &AiRigPlan,
    engine_id: &HashMap<&str, i32>,
    bones: &[Bone],
    scene: &SceneInfo,
    notes: &mut Vec<String>,
) -> Result<Animation, String> {
    let fps = anim.fps as f64;
    let frame_of = |ms: u32| -> i32 { ((ms as f64) * fps / 1000.).round() as i32 };
    let mut out = Animation {
        fps: anim.fps as i32,
        ..Default::default()
    };

    for track in &anim.tracks {
        let eid = *engine_id
            .get(track.bone_id.as_str())
            .ok_or_else(|| format!("Animation targets unknown bone `{}`.", track.bone_id))?;
        let bone = bones
            .iter()
            .find(|b| b.id == eid)
            .ok_or_else(|| "An animated bone disappeared.".to_string())?;
        let limit = plan
            .bones
            .iter()
            .find(|b| b.id == track.bone_id)
            .and_then(|b| b.rotation_limit);

        let mut keys: Vec<Key> = track.keyframes.clone();
        keys.sort_by_key(|k| k.time_ms);

        // always start from the rest pose at frame 0
        if keys[0].time_ms > 0 {
            keys.insert(
                0,
                Key {
                    time_ms: 0,
                    value: rest_value(track.property),
                    easing: Easing::Linear,
                },
            );
        }

        // clamp to the bone's rotation limit (the engine has no such limit of its own)
        if track.property == Property::RotationDeg {
            if let Some(l) = limit {
                let mut clamped = false;
                for k in keys.iter_mut() {
                    let v = k.value.clamp(l.min_deg, l.max_deg);
                    if v != k.value {
                        clamped = true;
                        k.value = v;
                    }
                }
                if clamped {
                    notes.push(format!(
                        "Rotation of `{}` was limited to {}..{} degrees.",
                        track.bone_id, l.min_deg, l.max_deg
                    ));
                }
            }
        }

        // a looping animation must end where it started (a full turn is fine for rotation)
        if anim.looping {
            let first = keys[0].value;
            let last_time = keys.last().unwrap().time_ms;
            if last_time < anim.duration_ms {
                keys.push(Key {
                    time_ms: anim.duration_ms,
                    value: first,
                    easing: Easing::Linear,
                });
            } else {
                let last = keys.last_mut().unwrap();
                let closes = if track.property == Property::RotationDeg {
                    let turns = (last.value - first) / 360.;
                    (turns - turns.round()).abs() < 1e-3
                } else {
                    (last.value - first).abs() < 1e-4
                };
                if !closes {
                    last.value = first;
                    notes.push(format!(
                        "Track {:?} of `{}` did not loop cleanly; its last key was set to the first.",
                        track.property, track.bone_id
                    ));
                }
            }
        }

        let mut prev_frame = -1;
        for k in &keys {
            let mut frame = frame_of(k.time_ms);
            if frame <= prev_frame {
                frame = prev_frame + 1;
            }
            prev_frame = frame;

            let (element, value) = match track.property {
                Property::RotationDeg => (AnimElement::Rotation, bone.rot + k.value.to_radians()),
                Property::OffsetX => (AnimElement::PositionX, bone.pos.x + k.value * scene.width()),
                Property::OffsetY => (
                    AnimElement::PositionY,
                    bone.pos.y - k.value * scene.height(),
                ),
                Property::ScaleX => (AnimElement::ScaleX, bone.scale.x * k.value),
                Property::ScaleY => (AnimElement::ScaleY, bone.scale.y * k.value),
            };
            let preset = preset_of(k.easing);
            let (start_handle, end_handle) = crate::utils::interp_preset(preset.clone());
            out.keyframes.push(Keyframe {
                frame,
                bone_id: eid,
                element,
                value,
                value_str: String::new(),
                start_handle,
                end_handle,
                next_kf: -1,
                handle_preset: preset,
                ..Default::default()
            });
        }
    }
    out.sort_keyframes();
    Ok(out)
}
