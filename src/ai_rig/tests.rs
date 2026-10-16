use super::apply::{build, reorder};
use super::plan::*;
use super::preset::{plan_for, Preset};
use super::scene::{analyze_scene, world_positions};
use super::validate::{validate, Limits, Validated};
use super::*;
use crate::shared::*;

/// (name, world x, world y, texture width, texture height) -> armature with one textured
/// bone per entry, all at rest, no parents.
fn armature_with(parts: &[(&str, f32, f32, f32, f32)]) -> Armature {
    let mut arm = Armature::default();
    let mut textures = vec![];
    for (i, (name, x, y, w, h)) in parts.iter().enumerate() {
        textures.push(Texture {
            name: name.to_string(),
            size: Vec2::new(*w, *h),
            data_id: i as i32,
            ..Default::default()
        });
        arm.bones.push(Bone {
            id: i as i32,
            name: name.to_string(),
            parent_id: -1,
            tex: name.to_string(),
            pos: Vec2::new(*x, *y),
            scale: Vec2::new(1., 1.),
            pivot_scale: Vec2::new(1., 1.),
            ik_target_id: -1,
            ik_family_id: -1,
            ..Default::default()
        });
    }
    arm.styles.push(Style {
        id: 0,
        name: "Default".to_string(),
        active: true,
        textures,
    });
    arm
}

fn pb(id: &str, parent: Option<&str>, sx: f32, sy: f32, ex: f32, ey: f32) -> PlanBone {
    PlanBone {
        id: id.to_string(),
        name: id.to_string(),
        parent_id: parent.map(|p| p.to_string()),
        start: Point { x: sx, y: sy },
        end: Point { x: ex, y: ey },
        role: id.to_string(),
        joint: JointKind::Hinge,
        rotation_limit: None,
    }
}

fn plan_with(strategy: RigStrategy, bones: Vec<PlanBone>, att: Vec<(&str, &str)>) -> AiRigPlan {
    AiRigPlan {
        schema_version: SCHEMA_VERSION,
        analysis: Analysis {
            object_type: ObjectType::Humanoid,
            rig_strategy: strategy,
            confidence: 0.8,
            reason: "test".to_string(),
        },
        bones,
        attachments: att
            .into_iter()
            .map(|(p, b)| Attachment {
                part_id: p.to_string(),
                bone_id: b.to_string(),
            })
            .collect(),
        animation: None,
        warnings: vec![],
    }
}

fn keys(parts: &[&str]) -> Vec<String> {
    parts.iter().map(|s| s.to_string()).collect()
}

#[test]
fn scene_bounds_and_coordinate_conversion() {
    // body 100x200 centered at the origin, arm 40x100 to the right and up
    let arm = armature_with(&[("body", 0., 0., 100., 200.), ("arm", 70., 40., 40., 100.)]);
    let scene = analyze_scene(&arm, None, true).unwrap();
    assert!((scene.min.x + 50.).abs() < 1e-3 && (scene.max.x - 90.).abs() < 1e-3);
    assert!((scene.min.y + 100.).abs() < 1e-3 && (scene.max.y - 100.).abs() < 1e-3);

    // top-left of the image is (min.x, max.y) in world space (Y up)
    let tl = scene.to_world(&Point { x: 0., y: 0. });
    assert!((tl.x + 50.).abs() < 1e-3 && (tl.y - 100.).abs() < 1e-3);
    let br = scene.to_world(&Point { x: 1., y: 1. });
    assert!((br.x - 90.).abs() < 1e-3 && (br.y + 100.).abs() < 1e-3);

    // round trip
    let w = scene.to_world(&Point { x: 0.3, y: 0.7 });
    let p = scene.to_plan(w);
    assert!((p.x - 0.3).abs() < 1e-4 && (p.y - 0.7).abs() < 1e-4);
}

#[test]
fn posed_or_ik_armatures_are_refused() {
    let mut arm = armature_with(&[("a", 0., 0., 10., 10.)]);
    arm.bones[0].rot = 0.5;
    assert!(analyze_scene(&arm, None, true).is_err());
    let mut arm = armature_with(&[("a", 0., 0., 10., 10.)]);
    arm.bones[0].ik_family_id = 3;
    assert!(analyze_scene(&arm, None, true).is_err());
}

#[test]
fn transform_preset_keeps_the_picture_and_adds_an_animation() {
    let arm = armature_with(&[("gem", 5., -7., 64., 64.)]);
    let scene = analyze_scene(&arm, Some(0), false).unwrap();
    let plan = plan_for(Preset::Spin, &scene).unwrap();
    let res = finish(plan, scene.clone(), Some(0), false, false, "t".into(), None).unwrap();
    let Outcome::Rig(plan) = &res.outcome else {
        panic!("expected a rig");
    };
    let out = build(&arm, &scene, plan).unwrap();

    assert_eq!(out.bones.len(), 1);
    assert_eq!(out.bones_created, 0);
    // joint is at the center, so the texture is not offset and the bone did not move
    assert!(out.bones[0].pivot_pos.mag() < 1e-3);
    assert!((out.bones[0].pos.x - 5.).abs() < 1e-3 && (out.bones[0].pos.y + 7.).abs() < 1e-3);

    let anim = &out.animations[out.new_anim.unwrap()];
    assert_eq!(anim.fps, 30);
    let rot: Vec<&Keyframe> = anim
        .keyframes
        .iter()
        .filter(|k| k.element == AnimElement::Rotation)
        .collect();
    assert_eq!(rot.len(), 2);
    assert_eq!(rot[0].frame, 0);
    assert_eq!(rot[1].frame, 60); // 2000 ms at 30 fps
    assert!((rot[1].value - std::f32::consts::TAU).abs() < 1e-4);
}

#[test]
fn layered_rig_keeps_every_picture_in_place() {
    let arm = armature_with(&[("body", 0., 0., 100., 200.), ("arm", 70., 40., 40., 100.)]);
    let scene = analyze_scene(&arm, None, true).unwrap();

    // arm joint at the top of the arm texture, body joint at the center of the body
    let body_joint = scene.to_plan(Vec2::new(0., 0.));
    let arm_joint = scene.to_plan(Vec2::new(70., 90.));
    let plan = plan_with(
        RigStrategy::Layered,
        vec![
            pb(
                "body",
                None,
                body_joint.x,
                body_joint.y,
                body_joint.x,
                body_joint.y - 0.2,
            ),
            pb(
                "arm",
                Some("body"),
                arm_joint.x,
                arm_joint.y,
                arm_joint.x,
                arm_joint.y + 0.2,
            ),
        ],
        vec![("p0", "body"), ("p1", "arm")],
    );
    let res = finish(plan, scene.clone(), None, true, false, "t".into(), None).unwrap();
    let Outcome::Rig(plan) = &res.outcome else {
        panic!()
    };
    let out = build(&arm, &scene, plan).unwrap();

    // parent first
    let ids: Vec<i32> = out.bones.iter().map(|b| b.id).collect();
    assert!(ids.iter().position(|i| *i == 0) < ids.iter().position(|i| *i == 1));
    assert_eq!(out.bones.iter().find(|b| b.id == 1).unwrap().parent_id, 0);

    // visual center = world pos + pivot * size must equal the original center
    let world = world_positions(&out.bones).unwrap();
    for (id, center, size) in [
        (0, Vec2::new(0., 0.), Vec2::new(100., 200.)),
        (1, Vec2::new(70., 40.), Vec2::new(40., 100.)),
    ] {
        let b = out.bones.iter().find(|b| b.id == id).unwrap();
        let w = world[&id];
        let c = Vec2::new(w.x + b.pivot_pos.x * size.x, w.y + b.pivot_pos.y * size.y);
        assert!((c.x - center.x).abs() < 1e-2 && (c.y - center.y).abs() < 1e-2);
    }
    // the arm bone sits on the shoulder joint
    assert!((world[&1].x - 70.).abs() < 1e-2 && (world[&1].y - 90.).abs() < 1e-2);
}

#[test]
fn bones_without_art_are_created_and_the_original_is_untouched() {
    let arm = armature_with(&[("body", 0., 0., 100., 200.)]);
    let before = arm.clone();
    let scene = analyze_scene(&arm, None, true).unwrap();
    let plan = plan_with(
        RigStrategy::Layered,
        vec![
            pb("root", None, 0.5, 0.9, 0.5, 0.6),
            pb("body", Some("root"), 0.5, 0.6, 0.5, 0.2),
        ],
        vec![("p0", "body")],
    );
    let res = finish(plan, scene.clone(), None, true, false, "t".into(), None).unwrap();
    let Outcome::Rig(plan) = &res.outcome else {
        panic!()
    };
    let out = build(&arm, &scene, plan).unwrap();
    assert_eq!(out.bones_created, 1);
    assert_eq!(out.bones.len(), 2);
    assert!(arm == before, "build must not modify its input");
}

#[test]
fn validator_rejects_bad_plans() {
    let l = Limits::fast();
    let parts = keys(&["p0", "p1"]);

    // cycle + duplicate + unknown parent + zero length
    let bad = plan_with(
        RigStrategy::Layered,
        vec![
            pb("a", Some("b"), 0.2, 0.2, 0.4, 0.4),
            pb("b", Some("a"), 0.3, 0.3, 0.5, 0.5),
            pb("b", None, 0.3, 0.3, 0.3, 0.3),
            pb("c", Some("zzz"), 0.1, 0.1, 0.2, 0.2),
        ],
        vec![("p0", "a")],
    );
    assert!(validate(bad, &parts, &l).is_err());

    // coordinates outside of the image
    let off = plan_with(
        RigStrategy::Layered,
        vec![pb("root", None, 3.0, 0.2, 0.4, 0.4)],
        vec![("p0", "root")],
    );
    assert!(validate(off, &parts, &l).is_err());

    // unknown part id and two bones driving the same part
    let att = plan_with(
        RigStrategy::Layered,
        vec![
            pb("root", None, 0.2, 0.2, 0.4, 0.4),
            pb("x", Some("root"), 0.3, 0.3, 0.5, 0.5),
        ],
        vec![("p9", "root"), ("p0", "x"), ("p0", "root")],
    );
    assert!(validate(att, &parts, &l).is_err());

    // NaN
    let nan = plan_with(
        RigStrategy::Layered,
        vec![pb("root", None, f32::NAN, 0.2, 0.4, 0.4)],
        vec![("p0", "root")],
    );
    assert!(validate(nan, &parts, &l).is_err());

    // too many bones for fast mode
    let many: Vec<PlanBone> = (0..9)
        .map(|i| {
            let parent = if i == 0 { None } else { Some("b0") };
            pb(
                &format!("b{}", i),
                parent,
                0.1 + i as f32 * 0.05,
                0.2,
                0.5,
                0.5,
            )
        })
        .collect();
    let many = plan_with(RigStrategy::Layered, many, vec![("p0", "b0")]);
    assert!(validate(many, &parts, &l).is_err());
    // ... but fine for detailed
    let ok_many: Vec<PlanBone> = (0..9)
        .map(|i| {
            let parent = if i == 0 { None } else { Some("b0") };
            pb(
                &format!("b{}", i),
                parent,
                0.1 + i as f32 * 0.05,
                0.2,
                0.5,
                0.5,
            )
        })
        .collect();
    let ok_many = plan_with(RigStrategy::Layered, ok_many, vec![("p0", "b0")]);
    assert!(matches!(
        validate(ok_many, &parts, &Limits::detailed()),
        Ok(Validated::Rig(_))
    ));
}

#[test]
fn needs_split_is_reported_not_faked() {
    let mut p = plan_with(RigStrategy::NeedsSplit, vec![], vec![]);
    p.analysis.reason = "Separate the wings and the body.".to_string();
    match validate(p, &keys(&["p0"]), &Limits::fast()) {
        Ok(Validated::NeedsSplit(r)) => assert!(r.contains("wings")),
        _ => panic!("expected NeedsSplit"),
    }
}

#[test]
fn animation_is_validated_and_clamped() {
    let arm = armature_with(&[("wing", 0., 0., 80., 40.)]);
    let scene = analyze_scene(&arm, None, true).unwrap();
    let mut plan = plan_with(
        RigStrategy::Transform,
        vec![pb("main", None, 0.5, 0.5, 0.5, 0.2)],
        vec![("p0", "main")],
    );
    plan.bones[0].rotation_limit = Some(RotationLimit {
        min_deg: -10.,
        max_deg: 10.,
    });
    plan.animation = Some(PlanAnimation {
        name: "Flap".into(),
        duration_ms: 1000,
        fps: 30,
        looping: true,
        tracks: vec![Track {
            bone_id: "main".into(),
            property: Property::RotationDeg,
            keyframes: vec![
                Key {
                    time_ms: 0,
                    value: 0.,
                    easing: Easing::EaseInOut,
                },
                Key {
                    time_ms: 500,
                    value: 40.,
                    easing: Easing::EaseInOut,
                },
                Key {
                    time_ms: 1000,
                    value: 5.,
                    easing: Easing::EaseInOut,
                },
            ],
        }],
    });
    let res = finish(plan, scene.clone(), None, true, false, "t".into(), None).unwrap();
    let Outcome::Rig(plan) = &res.outcome else {
        panic!()
    };
    let out = build(&arm, &scene, plan).unwrap();
    let anim = &out.animations[out.new_anim.unwrap()];
    let rots: Vec<f32> = anim.keyframes.iter().map(|k| k.value).collect();
    // clamped to 10 degrees, loop closed back to the first value
    assert!(rots.iter().all(|v| v.abs() <= 10f32.to_radians() + 1e-5));
    assert!((rots[0] - rots[rots.len() - 1]).abs() < 1e-5);
    assert!(out.notes.iter().any(|n| n.contains("limited")));

    // out-of-order keys are rejected
    let mut bad = plan.clone();
    bad.animation.as_mut().unwrap().tracks[0].keyframes[1].time_ms = 0;
    assert!(validate(bad, &scene.part_keys(), &Limits::fast()).is_err());
}

#[test]
fn joints_far_from_their_part_are_rejected() {
    let arm = armature_with(&[("a", -100., 0., 50., 50.), ("b", 100., 0., 50., 50.)]);
    let scene = analyze_scene(&arm, None, true).unwrap();
    // part a is on the left; a joint on the far right is not read from the picture
    let plan = plan_with(
        RigStrategy::Layered,
        vec![pb("root", None, 0.95, 0.5, 0.95, 0.2)],
        vec![("p0", "root")],
    );
    assert!(finish(plan, scene, None, true, false, "t".into(), None).is_err());
}

#[test]
fn replies_are_parsed_strictly() {
    let good = r#"```json
{"schema_version":1,"analysis":{"object_type":"game_item","rig_strategy":"transform","confidence":0.9,"reason":"gem"},
"bones":[{"id":"main","name":"Gem","parent_id":null,"start":{"x":0.5,"y":0.5},"end":{"x":0.5,"y":0.3},"role":"root","joint":"root","rotation_limit":null}],
"attachments":[{"part_id":"p0","bone_id":"main"}],"animation":null,"warnings":[]}
```"#;
    assert!(parse_plan(good).is_ok());

    // an invented field must be refused
    let extra = good.replace("\"warnings\":[]", "\"warnings\":[],\"skf_magic\":1");
    let err = parse_plan(&extra).unwrap_err();
    assert!(err.contains("skf_magic"));

    assert!(parse_plan("sorry, I cannot do that").is_err());
    assert!(parse_plan("{\"schema_version\":1}").is_err());
}

#[test]
fn schema_lists_every_field_as_required() {
    let s = json_schema();
    let top: Vec<&str> = s["required"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap())
        .collect();
    for f in [
        "schema_version",
        "analysis",
        "bones",
        "attachments",
        "animation",
        "warnings",
    ] {
        assert!(top.contains(&f), "{} missing", f);
    }
    assert_eq!(s["additionalProperties"], false);
}

#[test]
fn reorder_puts_children_after_their_parent() {
    let mk = |id: i32, parent: i32| Bone {
        id,
        parent_id: parent,
        ..Default::default()
    };
    let out = reorder(vec![mk(2, 1), mk(1, 0), mk(0, -1), mk(3, 0)]).unwrap();
    let pos = |id: i32| out.iter().position(|b| b.id == id).unwrap();
    assert!(pos(0) < pos(1) && pos(1) < pos(2) && pos(0) < pos(3));
    assert!(reorder(vec![mk(0, 1), mk(1, 0)]).is_err());
}

#[test]
fn apply_and_revert_restore_the_project_exactly() {
    let arm = armature_with(&[("gem", 0., 0., 64., 64.)]);
    let mut armature = arm.clone();
    let mut undo = UndoStates::default();
    let mut sel = SelectionState::default();
    sel.bone_idx = 0;
    let mut edit = EditMode::default();
    let mut ui = Ui::default();

    ui.ai_rig.result = Some(run_preset(&armature, &sel, Preset::Bob).unwrap());
    apply_pending(&mut armature, &mut undo, &mut sel, &mut edit, &mut ui);
    assert!(ui.ai_rig.error.is_empty(), "{}", ui.ai_rig.error);
    assert_eq!(armature.animations.len(), 1);
    assert_eq!(undo.undo_actions.len(), 1);
    assert!(edit.anim_open);

    revert_applied(&mut armature, &mut undo, &mut sel, &mut ui);
    assert!(armature == arm);
    assert_eq!(undo.undo_actions.len(), 0);
}

#[test]
fn a_changed_scene_blocks_apply() {
    let mut armature = armature_with(&[("gem", 0., 0., 64., 64.)]);
    let mut undo = UndoStates::default();
    let mut sel = SelectionState::default();
    sel.bone_idx = 0;
    let mut edit = EditMode::default();
    let mut ui = Ui::default();

    ui.ai_rig.result = Some(run_preset(&armature, &sel, Preset::Pulse).unwrap());
    armature.bones[0].pos = Vec2::new(300., 0.); // user moved the gem meanwhile
    let before = armature.clone();
    apply_pending(&mut armature, &mut undo, &mut sel, &mut edit, &mut ui);
    assert!(!ui.ai_rig.error.is_empty());
    assert!(armature == before);
    assert!(undo.undo_actions.is_empty());
}

#[test]
fn a_dropped_picture_gets_a_bone_automatically() {
    // the texture exists in the style, but no bone shows it yet
    let mut armature = armature_with(&[("coin", 0., 0., 48., 48.)]);
    armature.bones.clear();
    let original = armature.clone();
    let mut sel = SelectionState::default();
    sel.bone_idx = usize::MAX;
    let mut undo = UndoStates::default();
    let mut edit = EditMode::default();
    let mut ui = Ui::default();

    let result = run_preset(&armature, &sel, Preset::Spin).unwrap();
    assert_eq!(result.from_texture.as_deref(), Some("coin"));
    // nothing was created before the user applies
    assert!(armature.bones.is_empty());

    ui.ai_rig.result = Some(result);
    apply_pending(&mut armature, &mut undo, &mut sel, &mut edit, &mut ui);
    assert!(ui.ai_rig.error.is_empty(), "{}", ui.ai_rig.error);
    assert_eq!(armature.bones.len(), 1);
    assert_eq!(armature.bones[0].tex, "coin");
    assert_eq!(armature.animations.len(), 1);

    revert_applied(&mut armature, &mut undo, &mut sel, &mut ui);
    assert!(armature == original);
}

#[test]
fn several_unassigned_textures_are_not_guessed() {
    let mut armature = armature_with(&[("a", 0., 0., 10., 10.), ("b", 0., 0., 10., 10.)]);
    armature.bones.clear();
    let mut sel = SelectionState::default();
    sel.bone_idx = usize::MAX;
    assert!(run_preset(&armature, &sel, Preset::Spin).is_err());
}
