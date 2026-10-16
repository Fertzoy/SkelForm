//! The Auto-Rig window: settings, generation, result review and apply / revert.

use crate::shared::*;

use super::preset::Preset;
use super::*;

const INPUT_ID: &str = "ai_rig_input";

#[cfg(not(target_arch = "wasm32"))]
fn env_key() -> String {
    std::env::var("OPENROUTER_API_KEY")
        .unwrap_or_default()
        .trim()
        .to_string()
}

#[cfg(target_arch = "wasm32")]
fn env_key() -> String {
    String::new()
}

fn key_from_config(config: &Config) -> String {
    let k = config.ai_api_key.trim();
    if !k.is_empty() {
        return k.to_string();
    }
    env_key()
}

fn model_from_config(config: &Config) -> String {
    let m = config.ai_model.trim();
    if m.is_empty() {
        DEFAULT_MODEL.to_string()
    } else {
        m.to_string()
    }
}

fn is_running(ai: &AiRigUi) -> bool {
    match ai.job.lock() {
        Ok(g) => matches!(*g, JobState::Running(_)),
        Err(_) => false,
    }
}

fn status_text(ai: &AiRigUi) -> String {
    match ai.job.lock() {
        Ok(g) => match &*g {
            JobState::Running(s) => s.clone(),
            _ => String::new(),
        },
        Err(_) => String::new(),
    }
}

/// Moves a finished background job into the UI state.
fn poll_job(ai: &mut AiRigUi) {
    let done = match ai.job.lock() {
        Ok(mut g) => {
            if matches!(*g, JobState::Done(_)) {
                Some(std::mem::take(&mut *g))
            } else {
                None
            }
        }
        Err(_) => None,
    };
    if let Some(JobState::Done(res)) = done {
        match res {
            Ok(r) => {
                ai.result = Some(r);
                ai.error = String::new();
            }
            Err(e) => {
                ai.error = e;
            }
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn start_generation(
    ai: &mut AiRigUi,
    config: &Config,
    armature: &Armature,
    selections: &SelectionState,
) -> Result<(), String> {
    if is_running(ai) {
        return Ok(());
    }
    let key = key_from_config(config);
    if key.is_empty() {
        return Err(
            "Enter your OpenRouter API key first (or set OPENROUTER_API_KEY). \
You can still use the built-in presets without it."
                .to_string(),
        );
    }
    let prep = prepare(armature, selections, ai.all_parts)?;
    let scene = analyze_scene(&prep.armature, prep.selected, ai.all_parts)?;
    let limits = limits_for(ai.detailed);
    let img = render_scene(&prep.armature, &scene, limits.max_image_side)?;
    let png = encode_png(&img)?;

    ai.result = None;
    ai.error = String::new();
    spawn_job(
        JobParams {
            key,
            model: model_from_config(config),
            command: ai.command.clone(),
            png,
            img_w: img.width(),
            img_h: img.height(),
            scene,
            selected: prep.selected,
            all: ai.all_parts,
            detailed: ai.detailed,
            from_texture: prep.from_texture,
        },
        ai.job.clone(),
    );
    Ok(())
}

pub fn draw(
    ctx: &egui::Context,
    shared_ui: &mut Ui,
    config: &mut Config,
    armature: &Armature,
    selections: &SelectionState,
    events: &mut EventState,
) {
    poll_job(&mut shared_ui.ai_rig);

    let warn: egui::Color32 = config.colors.warning_text.into();
    let mut open = shared_ui.ai_rig.open;
    let mut typing = false;
    let mut save_config = false;

    egui::Window::new("Auto-Rig")
        .open(&mut open)
        .collapsible(false)
        .resizable(true)
        .default_width(430.)
        .show(ctx, |ui| {
            let running = is_running(&shared_ui.ai_rig);

            // ---------------------------------------------------------------- what to rig
            ui.label("What to rig");
            ui.horizontal(|ui| {
                ui.radio_value(&mut shared_ui.ai_rig.all_parts, false, "Selected bone");
                ui.radio_value(&mut shared_ui.ai_rig.all_parts, true, "All textured bones");
            });
            ui.horizontal(|ui| {
                ui.radio_value(&mut shared_ui.ai_rig.detailed, false, "Fast rig")
                    .on_hover_text("Small image, few bones, short answer. For ordinary game assets.");
                ui.radio_value(&mut shared_ui.ai_rig.detailed, true, "Detailed rig")
                    .on_hover_text("Larger image and more bones, for complex or layered characters. Costs more tokens.");
            });
            ui.add_space(4.);

            ui.label("Describe the rig and the motion you want");
            let r = ui.add(
                egui::TextEdit::multiline(&mut shared_ui.ai_rig.command)
                    .desired_rows(3)
                    .desired_width(f32::INFINITY)
                    .hint_text("e.g. Make the dragon flap its wings slowly and sway its tail"),
            );
            typing |= r.has_focus();

            // ---------------------------------------------------------------- model + key
            #[cfg(not(target_arch = "wasm32"))]
            {
                ui.add_space(4.);
                egui::CollapsingHeader::new("Model and API key")
                    .default_open(key_from_config(config).is_empty())
                    .show(ui, |ui| {
                        ui.label("OpenRouter model id");
                        let r = ui.add(
                            egui::TextEdit::singleline(&mut config.ai_model)
                                .hint_text(DEFAULT_MODEL)
                                .desired_width(f32::INFINITY),
                        );
                        typing |= r.has_focus();
                        ui.label("API key");
                        let r = ui.add(
                            egui::TextEdit::singleline(&mut config.ai_api_key)
                                .password(true)
                                .hint_text("sk-or-...")
                                .desired_width(f32::INFINITY),
                        );
                        typing |= r.has_focus();
                        ui.small(
                            "The key is saved in the SkelForm config file on this computer. \
If empty, the OPENROUTER_API_KEY environment variable is used.",
                        );
                        ui.small(
                            "Only an image of the chosen parts and a short description are sent. \
The model is never switched automatically.",
                        );
                    });
            }

            // ---------------------------------------------------------------- generate
            ui.add_space(6.);
            ui.horizontal(|ui| {
                #[cfg(not(target_arch = "wasm32"))]
                {
                    let label = if shared_ui.ai_rig.result.is_some() {
                        "Regenerate with AI"
                    } else {
                        "Generate rig with AI"
                    };
                    let b = ui.add_enabled(!running, egui::Button::new(label));
                    if b.clicked() {
                        save_config = true;
                        if let Err(e) =
                            start_generation(&mut shared_ui.ai_rig, config, armature, selections)
                        {
                            shared_ui.ai_rig.error = e;
                        }
                    }
                }
                #[cfg(target_arch = "wasm32")]
                ui.label("AI generation is available in the desktop version. Presets work here.");

                if running {
                    ui.spinner();
                    ui.label(status_text(&shared_ui.ai_rig));
                }
            });

            ui.horizontal_wrapped(|ui| {
                ui.label("Built-in, no AI:");
                for preset in Preset::ALL {
                    if ui.add_enabled(!running, egui::Button::new(preset.label())).clicked() {
                        match run_preset(armature, selections, preset) {
                            Ok(r) => {
                                shared_ui.ai_rig.result = Some(r);
                                shared_ui.ai_rig.error = String::new();
                            }
                            Err(e) => shared_ui.ai_rig.error = e,
                        }
                    }
                }
            });

            if !shared_ui.ai_rig.error.is_empty() {
                ui.add_space(4.);
                ui.colored_label(warn, shared_ui.ai_rig.error.clone());
            }

            // ---------------------------------------------------------------- review
            if let Some(result) = shared_ui.ai_rig.result.clone() {
                ui.separator();
                ui.label(format!("Result from: {}", result.source));
                match &result.outcome {
                    Outcome::NeedsSplit(reason) => {
                        ui.colored_label(
                            warn,
                            "This image cannot be rigged as it is, so no skeleton was created.",
                        );
                        ui.label(reason.clone());
                        ui.small(
                            "Split the art into separate layers (for example import a PSD with one \
group per part), then run Auto-Rig again. A whole-object preset still works.",
                        );
                        if ui.button("Dismiss").clicked() {
                            shared_ui.ai_rig.result = None;
                        }
                    }
                    Outcome::Rig(plan) => {
                        let a = &plan.analysis;
                        ui.label(format!(
                            "Detected: {:?}, strategy: {:?}, confidence {:.0}%",
                            a.object_type,
                            a.rig_strategy,
                            a.confidence * 100.
                        ));
                        ui.small(a.reason.clone());

                        egui::ScrollArea::vertical()
                            .max_height(150.)
                            .id_salt("ai_rig_bones")
                            .show(ui, |ui| {
                                for b in &plan.bones {
                                    let parent = b.parent_id.as_deref().unwrap_or("-");
                                    let part = plan
                                        .attachments
                                        .iter()
                                        .find(|at| at.bone_id == b.id)
                                        .and_then(|at| {
                                            result.scene.parts.iter().find(|p| p.key == at.part_id)
                                        })
                                        .map(|p| format!(" -> {}", p.name))
                                        .unwrap_or_default();
                                    ui.label(format!(
                                        "{}  ({}, parent: {}){}",
                                        b.name, b.role, parent, part
                                    ));
                                }
                            });
                        if let Some(anim) = &plan.animation {
                            ui.label(format!(
                                "Animation \"{}\": {} ms, {} fps, {} track(s){}",
                                anim.name,
                                anim.duration_ms,
                                anim.fps,
                                anim.tracks.len(),
                                if anim.looping { ", loops" } else { "" }
                            ));
                        } else {
                            ui.label("No animation (rig only).");
                        }
                        for w in &plan.warnings {
                            ui.colored_label(warn, w.clone());
                        }

                        ui.add_space(4.);
                        ui.horizontal(|ui| {
                            if ui
                                .button("Apply to project")
                                .on_hover_text("One undo step. Nothing is changed before this.")
                                .clicked()
                            {
                                events.apply_ai_rig();
                            }
                            if ui.button("Discard").clicked() {
                                shared_ui.ai_rig.result = None;
                            }
                        });
                    }
                }
            }

            // ---------------------------------------------------------------- after apply
            if let Some(applied) = shared_ui.ai_rig.applied.clone() {
                ui.separator();
                ui.label(applied.summary.clone());
                ui.small(
                    "The bones are now real bones of your project: move, rotate, re-parent or delete \
them with the normal tools, edit the animation in the timeline. Ctrl+Z also works.",
                );
                for n in shared_ui.ai_rig.notes.clone() {
                    ui.colored_label(warn, n);
                }
                ui.horizontal(|ui| {
                    if ui.button("Keep").clicked() {
                        shared_ui.ai_rig.applied = None;
                        shared_ui.ai_rig.notes = vec![];
                    }
                    if ui
                        .button("Revert")
                        .on_hover_text(
                            "Restore the project to the state before Auto-Rig. Edits made since are lost.",
                        )
                        .clicked()
                    {
                        events.revert_ai_rig();
                    }
                });
            }
        });

    shared_ui.ai_rig.open = open;

    // keep editor shortcuts (delete, undo, ...) from firing while typing in this window
    if typing {
        shared_ui.rename_id = INPUT_ID.to_string();
    } else if shared_ui.rename_id == INPUT_ID {
        shared_ui.rename_id = String::new();
    }

    if save_config {
        crate::utils::save_config(config);
    }
}
