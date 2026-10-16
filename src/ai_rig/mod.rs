//! Auto-Rig: an AI-assisted (or preset-based) way to create a rig and an animation from a
//! picture, built on top of the real SkelForm data model.
//!
//! Flow: scene -> picture + part list -> model -> `AiRigPlan` -> `validate` -> `apply::build`
//! (pure) -> swapped into the armature with one undo step. The model is only called once per
//! generation; every later edit is plain SkelForm editing.

pub mod apply;
pub mod plan;
pub mod preset;
pub mod prompt;
pub mod scene;
pub mod validate;
pub mod window;

#[cfg(not(target_arch = "wasm32"))]
pub mod openrouter;

use std::sync::{Arc, Mutex};

use crate::shared::*;

use plan::*;
use scene::*;
use validate::*;

pub const DEFAULT_MODEL: &str = "qwen/qwen3.8-27b:free";

#[derive(Clone)]
pub enum Outcome {
    Rig(AiRigPlan),
    /// The image cannot be rigged as it is; the string says what to prepare.
    NeedsSplit(String),
}

#[derive(Clone)]
pub struct AiResult {
    pub outcome: Outcome,
    pub scene: SceneInfo,
    /// Scope the analysis was made with (used to detect that the scene changed afterwards).
    pub selected: Option<i32>,
    pub all: bool,
    pub detailed: bool,
    /// Where the plan came from, shown to the user.
    pub source: String,
    /// Set when the picture had no bone yet: the texture that gets a new bone on apply.
    pub from_texture: Option<String>,
}

#[derive(Default)]
pub enum JobState {
    #[default]
    Idle,
    Running(String),
    Done(Result<AiResult, String>),
}

/// What is needed to take the rig back.
#[derive(Clone)]
pub struct Applied {
    pub snapshot: Armature,
    pub undo_len_before: usize,
    pub summary: String,
}

#[derive(Clone, Default)]
pub struct AiRigUi {
    pub open: bool,
    pub command: String,
    pub detailed: bool,
    pub all_parts: bool,
    pub job: Arc<Mutex<JobState>>,
    pub result: Option<AiResult>,
    pub applied: Option<Applied>,
    pub error: String,
    pub notes: Vec<String>,
}

pub fn selected_bone_id(armature: &Armature, selections: &SelectionState) -> Option<i32> {
    if selections.bone_idx < armature.bones.len() {
        return Some(armature.bones[selections.bone_idx].id);
    }
    selections.bone_ids.first().copied()
}

pub fn limits_for(detailed: bool) -> Limits {
    if detailed {
        Limits::detailed()
    } else {
        Limits::fast()
    }
}

/// Plan joints must be on, or close to, the part they move. Catches coordinates that were
/// not read from the picture.
pub fn check_against_scene(plan: &AiRigPlan, scene: &SceneInfo) -> Vec<String> {
    let mut errs = vec![];
    for at in &plan.attachments {
        let (Some(part), Some(bone)) = (
            scene.parts.iter().find(|p| p.key == at.part_id),
            plan.bones.iter().find(|b| b.id == at.bone_id),
        ) else {
            continue;
        };
        let bb = scene.bbox_norm(part);
        let mx = (bb[2] - bb[0]) * 0.4 + 0.03;
        let my = (bb[3] - bb[1]) * 0.4 + 0.03;
        let s = &bone.start;
        if s.x < bb[0] - mx || s.x > bb[2] + mx || s.y < bb[1] - my || s.y > bb[3] + my {
            errs.push(format!(
                "joint of bone `{}` is far away from part `{}` that it moves; the joint must be on or near that part (part box: left {:.2}, top {:.2}, right {:.2}, bottom {:.2})",
                bone.id, part.key, bb[0], bb[1], bb[2], bb[3]
            ));
        }
    }
    errs
}

/// The armature Auto-Rig works on. If the scope has no textured bone, but exactly one texture
/// is waiting for a bone (a freshly dropped picture), a bone for it is added to a COPY.
pub struct Prepared {
    pub armature: Armature,
    pub selected: Option<i32>,
    pub from_texture: Option<String>,
}

pub fn prepare(
    armature: &Armature,
    selections: &SelectionState,
    all: bool,
) -> Result<Prepared, String> {
    let selected = selected_bone_id(armature, selections);
    match analyze_scene(armature, selected, all) {
        Ok(_) => Ok(Prepared {
            armature: armature.clone(),
            selected,
            from_texture: None,
        }),
        Err(first) => match find_unassigned_texture(armature, selections) {
            Ok(name) => {
                let arm = bone_from_texture(armature, &name)?;
                let id = arm.bones.last().map(|b| b.id);
                Ok(Prepared {
                    armature: arm,
                    selected: id,
                    from_texture: Some(name),
                })
            }
            Err(_) => Err(first),
        },
    }
}

/// Validate a plan against the real scene and wrap it as a result.
pub fn finish(
    plan: AiRigPlan,
    scene: SceneInfo,
    selected: Option<i32>,
    all: bool,
    detailed: bool,
    source: String,
    from_texture: Option<String>,
) -> Result<AiResult, Vec<String>> {
    let limits = limits_for(detailed);
    let outcome = match validate(plan, &scene.part_keys(), &limits)? {
        Validated::Rig(p) => {
            let errs = check_against_scene(&p, &scene);
            if !errs.is_empty() {
                return Err(errs);
            }
            Outcome::Rig(p)
        }
        Validated::NeedsSplit(reason) => Outcome::NeedsSplit(reason),
    };
    Ok(AiResult {
        outcome,
        scene,
        selected,
        all,
        detailed,
        source,
        from_texture,
    })
}

/// Runs a built-in preset (no model, works on every platform).
pub fn run_preset(
    armature: &Armature,
    selections: &SelectionState,
    kind: preset::Preset,
) -> Result<AiResult, String> {
    let prep = prepare(armature, selections, false)?;
    let scene = analyze_scene(&prep.armature, prep.selected, false)?;
    let plan = preset::plan_for(kind, &scene)?;
    finish(
        plan,
        scene,
        prep.selected,
        false,
        false,
        format!("Built-in preset: {}", kind.label()),
        prep.from_texture,
    )
    .map_err(|e| e.join("\n"))
}

// ------------------------------------------------------------------------ model job (native)

#[cfg(not(target_arch = "wasm32"))]
pub struct JobParams {
    pub key: String,
    pub model: String,
    pub command: String,
    pub png: Vec<u8>,
    pub img_w: u32,
    pub img_h: u32,
    pub scene: SceneInfo,
    pub selected: Option<i32>,
    pub all: bool,
    pub detailed: bool,
    pub from_texture: Option<String>,
}

#[cfg(not(target_arch = "wasm32"))]
fn set_status(status: &Arc<Mutex<JobState>>, msg: &str) {
    if let Ok(mut s) = status.lock() {
        *s = JobState::Running(msg.to_string());
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub fn spawn_job(p: JobParams, status: Arc<Mutex<JobState>>) {
    set_status(&status, "Checking the model...");
    std::thread::spawn(move || {
        let res = run_job(&p, &status);
        if let Ok(mut s) = status.lock() {
            *s = JobState::Done(res);
        }
    });
}

#[cfg(not(target_arch = "wasm32"))]
fn run_job(p: &JobParams, status: &Arc<Mutex<JobState>>) -> Result<AiResult, String> {
    use serde_json::json;

    let limits = limits_for(p.detailed);
    let caps = openrouter::preflight(&p.key, &p.model)?;
    let schema = json_schema();
    let parts = p.scene.part_keys();

    let mut messages = vec![
        json!({"role": "system", "content": prompt::system_prompt(&limits)}),
        openrouter::user_message(
            &prompt::user_prompt(&p.command, &p.scene, p.img_w, p.img_h, p.detailed),
            &p.png,
        ),
    ];

    let mut last_errors: Vec<String> = vec![];
    for attempt in 0..2 {
        set_status(
            status,
            if attempt == 0 {
                "Waiting for the model..."
            } else {
                "Asking the model to fix its answer..."
            },
        );
        let body =
            openrouter::request_body(&p.model, &messages, &caps, &schema, limits.max_reply_tokens);
        let reply = openrouter::chat(&p.key, &p.model, &body)?;

        let checked = match parse_plan(&reply.content) {
            Ok(plan) => finish(
                plan,
                p.scene.clone(),
                p.selected,
                p.all,
                p.detailed,
                if reply.provider.is_empty() {
                    p.model.clone()
                } else {
                    format!("{} via {}", p.model, reply.provider)
                },
                p.from_texture.clone(),
            ),
            Err(e) => Err(vec![e]),
        };
        match checked {
            Ok(result) => return Ok(result),
            Err(errs) => {
                let echoed: String = reply.content.chars().take(6000).collect();
                messages.push(json!({"role": "assistant", "content": echoed}));
                messages.push(json!({"role": "user", "content": prompt::repair_prompt(&errs)}));
                last_errors = errs;
            }
        }
    }
    Err(format!(
        "The model's answer did not pass validation, so nothing was changed:\n- {}",
        last_errors.join("\n- ")
    ))
}

// ------------------------------------------------------------------------ apply / revert

/// Applies the pending result to the real armature as ONE undoable step.
/// On any error the armature is left untouched.
pub fn apply_pending(
    armature: &mut Armature,
    undo_states: &mut UndoStates,
    selections: &mut SelectionState,
    edit_mode: &mut EditMode,
    ui: &mut Ui,
) {
    let Some(result) = ui.ai_rig.result.clone() else {
        return;
    };
    let Outcome::Rig(plan) = &result.outcome else {
        ui.ai_rig.error = "This result has no rig to apply.".to_string();
        return;
    };

    // the base the plan was made for: the project, plus a bone for a freshly dropped picture
    let (base, base_selected) = match &result.from_texture {
        Some(name) => match bone_from_texture(armature, name) {
            Ok(a) => {
                let id = a.bones.last().map(|b| b.id);
                (a, id)
            }
            Err(e) => {
                ui.ai_rig.error = e;
                return;
            }
        },
        None => (armature.clone(), result.selected),
    };

    // the scene must still be what the model analysed
    let now = match analyze_scene(&base, base_selected, result.all) {
        Ok(s) => s,
        Err(e) => {
            ui.ai_rig.error = e;
            return;
        }
    };
    if !now.same_as(&result.scene) {
        ui.ai_rig.error = "The scene changed after the analysis. Run Auto-Rig again.".to_string();
        return;
    }

    let out = match apply::build(&base, &result.scene, plan) {
        Ok(o) => o,
        Err(e) => {
            ui.ai_rig.error = e;
            return;
        }
    };

    let snapshot = armature.clone();
    let undo_len_before = undo_states.undo_actions.len();
    undo_states.new_undo_armature(armature);

    armature.bones = out.bones;
    armature.animations = out.animations;
    armature.animated_bones = armature.bones.clone();

    selections.bone_idx = usize::MAX;
    selections.bone_ids = vec![];
    if let Some(idx) = out.new_anim {
        selections.anim = idx;
        selections.anim_frame = 0;
        edit_mode.anim_open = true;
    }

    let summary = format!(
        "{} part(s) rigged, {} bone(s) created{}.",
        out.parts_rigged,
        out.bones_created,
        match out.new_anim {
            Some(i) => format!(", animation \"{}\" added", armature.animations[i].name),
            None => String::new(),
        }
    );
    ui.ai_rig.notes = out.notes;
    ui.ai_rig.error = String::new();
    ui.ai_rig.applied = Some(Applied {
        snapshot,
        undo_len_before,
        summary,
    });
    ui.ai_rig.result = None;
}

/// Puts the project back exactly as it was before the rig was applied.
pub fn revert_applied(
    armature: &mut Armature,
    undo_states: &mut UndoStates,
    selections: &mut SelectionState,
    ui: &mut Ui,
) {
    let Some(applied) = ui.ai_rig.applied.take() else {
        return;
    };
    *armature = applied.snapshot;
    undo_states.undo_actions.truncate(applied.undo_len_before);
    undo_states.redo_actions.clear();
    undo_states.temp_actions.clear();
    selections.bone_idx = usize::MAX;
    selections.bone_ids = vec![];
    selections.anim = usize::MAX;
    selections.anim_frame = -1;
    ui.ai_rig.notes = vec![];
}

#[cfg(test)]
mod tests;
