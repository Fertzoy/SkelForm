//! Built-in transform rigs that need no model. They produce a normal `AiRigPlan`, so they go
//! through exactly the same validation and application path as a model answer.

use super::plan::*;
use super::scene::SceneInfo;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Preset {
    Spin,
    Bob,
    Pulse,
    Sway,
}

impl Preset {
    pub const ALL: [Preset; 4] = [Preset::Spin, Preset::Bob, Preset::Pulse, Preset::Sway];

    pub fn label(&self) -> &'static str {
        match self {
            Preset::Spin => "Spin",
            Preset::Bob => "Bob (float)",
            Preset::Pulse => "Pulse (scale)",
            Preset::Sway => "Sway",
        }
    }

    fn name(&self) -> &'static str {
        match self {
            Preset::Spin => "Spin",
            Preset::Bob => "Bob",
            Preset::Pulse => "Pulse",
            Preset::Sway => "Sway",
        }
    }
}

fn key(time_ms: u32, value: f32, easing: Easing) -> Key {
    Key {
        time_ms,
        value,
        easing,
    }
}

pub fn plan_for(preset: Preset, scene: &SceneInfo) -> Result<AiRigPlan, String> {
    if scene.parts.len() != 1 {
        return Err(
            "Presets animate one image. Select a single textured bone (scope: Selected bone)."
                .to_string(),
        );
    }
    let part = &scene.parts[0];
    let mut part_name: String = part
        .name
        .chars()
        .filter(|c| !c.is_control())
        .take(40)
        .collect();
    if part_name.trim().is_empty() {
        part_name = "Main".to_string();
    }
    let c = scene.to_plan(part.center);
    let bb = scene.bbox_norm(part);
    // a short bone pointing up from the center; only its start (the joint) matters to the engine
    let tip = Point {
        x: c.x,
        y: (c.y - ((bb[3] - bb[1]) * 0.25).max(0.02)).max(-0.05),
    };

    let (name, duration, tracks) = match preset {
        Preset::Spin => (
            "Spin",
            2000,
            vec![Track {
                bone_id: "main".into(),
                property: Property::RotationDeg,
                keyframes: vec![key(0, 0., Easing::Linear), key(2000, 360., Easing::Linear)],
            }],
        ),
        Preset::Bob => (
            "Bob",
            1600,
            vec![Track {
                bone_id: "main".into(),
                property: Property::OffsetY,
                keyframes: vec![
                    key(0, 0., Easing::EaseInOut),
                    key(800, -0.06, Easing::EaseInOut),
                    key(1600, 0., Easing::EaseInOut),
                ],
            }],
        ),
        Preset::Pulse => {
            let k = vec![
                key(0, 1., Easing::EaseInOut),
                key(500, 1.12, Easing::EaseInOut),
                key(1000, 1., Easing::EaseInOut),
            ];
            (
                "Pulse",
                1000,
                vec![
                    Track {
                        bone_id: "main".into(),
                        property: Property::ScaleX,
                        keyframes: k.clone(),
                    },
                    Track {
                        bone_id: "main".into(),
                        property: Property::ScaleY,
                        keyframes: k,
                    },
                ],
            )
        }
        Preset::Sway => (
            "Sway",
            2000,
            vec![Track {
                bone_id: "main".into(),
                property: Property::RotationDeg,
                keyframes: vec![
                    key(0, 0., Easing::EaseInOut),
                    key(500, 7., Easing::EaseInOut),
                    key(1500, -7., Easing::EaseInOut),
                    key(2000, 0., Easing::EaseInOut),
                ],
            }],
        ),
    };

    Ok(AiRigPlan {
        schema_version: SCHEMA_VERSION,
        analysis: Analysis {
            object_type: ObjectType::GameItem,
            rig_strategy: RigStrategy::Transform,
            confidence: 1.0,
            reason: format!("Built-in {} preset (no model used).", preset.name()),
        },
        bones: vec![PlanBone {
            id: "main".into(),
            name: part_name,
            parent_id: None,
            start: c,
            end: tip,
            role: "root".into(),
            joint: JointKind::Root,
            rotation_limit: None,
        }],
        attachments: vec![Attachment {
            part_id: part.key.clone(),
            bone_id: "main".into(),
        }],
        animation: Some(PlanAnimation {
            name: name.into(),
            duration_ms: duration,
            fps: 30,
            looping: true,
            tracks,
        }),
        warnings: vec![],
    })
}
