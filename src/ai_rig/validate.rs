//! Strict validation of an `AiRigPlan`. Nothing from the model reaches the project
//! before it passes through here.

use std::collections::{HashMap, HashSet};

use super::plan::*;

/// Hard limits that depend on the selected mode.
#[derive(Debug, Clone)]
pub struct Limits {
    pub max_bones: usize,
    pub max_tracks: usize,
    pub max_keys: usize,
    pub max_duration_ms: u32,
    /// Longest side of the image that is sent to the model, in pixels.
    pub max_image_side: u32,
    /// Output token budget for the model reply.
    pub max_reply_tokens: u32,
}

impl Limits {
    pub fn fast() -> Self {
        Limits {
            max_bones: 8,
            max_tracks: 6,
            max_keys: 6,
            max_duration_ms: 4000,
            max_image_side: 512,
            max_reply_tokens: 2500,
        }
    }

    pub fn detailed() -> Self {
        Limits {
            max_bones: 32,
            max_tracks: 40,
            max_keys: 12,
            max_duration_ms: 10000,
            max_image_side: 1024,
            max_reply_tokens: 6000,
        }
    }
}

pub const MIN_FPS: u32 = 10;
pub const MAX_FPS: u32 = 60;
pub const MIN_DURATION_MS: u32 = 200;
/// Allowed range of a point. Joints may sit slightly outside the image.
pub const POINT_MIN: f32 = -0.1;
pub const POINT_MAX: f32 = 1.1;

#[derive(Debug)]
pub enum Validated {
    Rig(AiRigPlan),
    /// The model says the image cannot be rigged as it is. The string is the reason.
    NeedsSplit(String),
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 32
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn valid_text(s: &str, max: usize) -> bool {
    let t = s.trim();
    !t.is_empty() && s.chars().count() <= max && !s.chars().any(|c| c.is_control())
}

fn valid_point(p: &Point) -> bool {
    p.x.is_finite()
        && p.y.is_finite()
        && p.x >= POINT_MIN
        && p.x <= POINT_MAX
        && p.y >= POINT_MIN
        && p.y <= POINT_MAX
}

/// `parts` are the part keys that were listed in the request.
pub fn validate(
    mut plan: AiRigPlan,
    parts: &[String],
    limits: &Limits,
) -> Result<Validated, Vec<String>> {
    let mut errs: Vec<String> = vec![];

    if plan.schema_version != SCHEMA_VERSION {
        errs.push(format!(
            "schema_version must be {}, got {}",
            SCHEMA_VERSION, plan.schema_version
        ));
    }

    let a = &plan.analysis;
    if !a.confidence.is_finite() || a.confidence < 0. || a.confidence > 1. {
        errs.push("analysis.confidence must be a number from 0 to 1".to_string());
    }
    if !valid_text(&a.reason, 400) {
        errs.push("analysis.reason must be a non-empty string (max 400 chars)".to_string());
    }

    if a.rig_strategy == RigStrategy::NeedsSplit {
        if !errs.is_empty() {
            return Err(errs);
        }
        return Ok(Validated::NeedsSplit(a.reason.trim().to_string()));
    }
    let strategy = a.rig_strategy;

    // ---- bones
    if plan.bones.is_empty() {
        errs.push("bones must not be empty for this strategy".to_string());
    }
    if plan.bones.len() > limits.max_bones {
        errs.push(format!(
            "too many bones: {} (max {} in this mode)",
            plan.bones.len(),
            limits.max_bones
        ));
    }

    let mut ids: HashSet<&str> = HashSet::new();
    for (i, b) in plan.bones.iter().enumerate() {
        if !valid_id(&b.id) {
            errs.push(format!("bones[{}].id `{}` is not a valid id", i, b.id));
        } else if !ids.insert(b.id.as_str()) {
            errs.push(format!("duplicate bone id `{}`", b.id));
        }
        if !valid_text(&b.name, 40) {
            errs.push(format!("bones[{}].name must be 1-40 printable chars", i));
        }
        if !valid_text(&b.role, 40) {
            errs.push(format!("bones[{}].role must be 1-40 printable chars", i));
        }
        if !valid_point(&b.start) || !valid_point(&b.end) {
            errs.push(format!(
                "bones[{}] (`{}`): start/end must be finite and inside {}..{}",
                i, b.id, POINT_MIN, POINT_MAX
            ));
        } else {
            let dx = b.end.x - b.start.x;
            let dy = b.end.y - b.start.y;
            if (dx * dx + dy * dy).sqrt() < 0.005 {
                errs.push(format!("bone `{}` has zero length (start == end)", b.id));
            }
        }
        if let Some(l) = &b.rotation_limit {
            let ok = l.min_deg.is_finite()
                && l.max_deg.is_finite()
                && l.min_deg <= 0.
                && l.max_deg >= 0.
                && l.min_deg >= -360.
                && l.max_deg <= 360.;
            if !ok {
                errs.push(format!(
                    "bone `{}`: rotation_limit must satisfy -360 <= min_deg <= 0 <= max_deg <= 360",
                    b.id
                ));
            }
        }
    }

    // parents
    let by_id: HashMap<&str, &PlanBone> = plan.bones.iter().map(|b| (b.id.as_str(), b)).collect();
    let mut roots = 0;
    for b in &plan.bones {
        match &b.parent_id {
            None => roots += 1,
            Some(p) => {
                if p == &b.id {
                    errs.push(format!("bone `{}` is its own parent", b.id));
                } else if !by_id.contains_key(p.as_str()) {
                    errs.push(format!("bone `{}` has unknown parent `{}`", b.id, p));
                }
            }
        }
    }
    if !plan.bones.is_empty() && roots != 1 {
        errs.push(format!(
            "exactly one root bone is required, found {}",
            roots
        ));
    }
    // cycles
    for b in &plan.bones {
        let mut cur = b;
        let mut steps = 0;
        while let Some(p) = &cur.parent_id {
            steps += 1;
            if steps > plan.bones.len() {
                errs.push(format!("bone `{}` is part of a parent cycle", b.id));
                break;
            }
            match by_id.get(p.as_str()) {
                Some(next) => cur = *next,
                None => break,
            }
        }
    }

    // ---- attachments
    let known_parts: HashSet<&str> = parts.iter().map(|p| p.as_str()).collect();
    let mut used_parts: HashSet<&str> = HashSet::new();
    let mut used_bones: HashSet<&str> = HashSet::new();
    for (i, at) in plan.attachments.iter().enumerate() {
        if !known_parts.contains(at.part_id.as_str()) {
            errs.push(format!(
                "attachments[{}].part_id `{}` was not listed in the request",
                i, at.part_id
            ));
        }
        if !by_id.contains_key(at.bone_id.as_str()) {
            errs.push(format!(
                "attachments[{}].bone_id `{}` is not a bone of the plan",
                i, at.bone_id
            ));
        }
        if !used_parts.insert(at.part_id.as_str()) {
            errs.push(format!("part `{}` is attached more than once", at.part_id));
        }
        if !used_bones.insert(at.bone_id.as_str()) {
            errs.push(format!(
                "bone `{}` drives more than one part (one part per bone)",
                at.bone_id
            ));
        }
    }

    match strategy {
        RigStrategy::Transform => {
            if plan.bones.len() != 1 {
                errs.push("transform strategy needs exactly one bone".to_string());
            }
            if plan.attachments.len() > 1 {
                errs.push("transform strategy allows at most one attachment".to_string());
            }
            if plan.attachments.is_empty() && parts.len() != 1 {
                errs.push(
                    "transform strategy must attach its bone to a part when several parts exist"
                        .to_string(),
                );
            }
        }
        RigStrategy::Layered => {
            if plan.attachments.is_empty() {
                errs.push("layered strategy needs at least one attachment".to_string());
            }
        }
        RigStrategy::NeedsSplit => {}
    }

    // ---- animation
    if let Some(anim) = &plan.animation {
        validate_animation(anim, &by_id, limits, &mut errs);
    }

    if plan.warnings.len() > 20 {
        plan.warnings.truncate(20);
    }
    plan.warnings
        .retain(|w| w.chars().count() <= 300 && !w.chars().any(|c| c.is_control()));

    if errs.is_empty() {
        Ok(Validated::Rig(plan))
    } else {
        errs.truncate(20);
        Err(errs)
    }
}

fn validate_animation(
    anim: &PlanAnimation,
    bones: &HashMap<&str, &PlanBone>,
    limits: &Limits,
    errs: &mut Vec<String>,
) {
    if !valid_text(&anim.name, 48) {
        errs.push("animation.name must be 1-48 printable chars".to_string());
    }
    if anim.duration_ms < MIN_DURATION_MS || anim.duration_ms > limits.max_duration_ms {
        errs.push(format!(
            "animation.duration_ms must be {}..{} in this mode",
            MIN_DURATION_MS, limits.max_duration_ms
        ));
    }
    if anim.fps < MIN_FPS || anim.fps > MAX_FPS {
        errs.push(format!("animation.fps must be {}..{}", MIN_FPS, MAX_FPS));
    }
    if anim.tracks.is_empty() {
        errs.push("animation.tracks must not be empty (use animation: null for rig only)".into());
    }
    if anim.tracks.len() > limits.max_tracks {
        errs.push(format!(
            "too many tracks: {} (max {} in this mode)",
            anim.tracks.len(),
            limits.max_tracks
        ));
    }

    let mut seen: HashSet<(&str, Property)> = HashSet::new();
    for (t, track) in anim.tracks.iter().enumerate() {
        if !bones.contains_key(track.bone_id.as_str()) {
            errs.push(format!(
                "tracks[{}].bone_id `{}` is not a bone of the plan",
                t, track.bone_id
            ));
        }
        if !seen.insert((track.bone_id.as_str(), track.property)) {
            errs.push(format!(
                "tracks[{}]: duplicate track for bone `{}` and property {:?}",
                t, track.bone_id, track.property
            ));
        }
        if track.keyframes.len() < 2 || track.keyframes.len() > limits.max_keys {
            errs.push(format!(
                "tracks[{}] needs 2..{} keyframes in this mode, got {}",
                t,
                limits.max_keys,
                track.keyframes.len()
            ));
        }

        let (lo, hi) = match track.property {
            Property::RotationDeg => (-360., 360.),
            Property::OffsetX | Property::OffsetY => (-1., 1.),
            Property::ScaleX | Property::ScaleY => (0.1, 3.),
        };
        let mut prev: Option<u32> = None;
        for (k, key) in track.keyframes.iter().enumerate() {
            if !key.value.is_finite() || key.value < lo || key.value > hi {
                errs.push(format!(
                    "tracks[{}].keyframes[{}].value must be finite and within {}..{} for {:?}",
                    t, k, lo, hi, track.property
                ));
            }
            if key.time_ms > anim.duration_ms {
                errs.push(format!(
                    "tracks[{}].keyframes[{}].time_ms exceeds duration_ms",
                    t, k
                ));
            }
            if let Some(p) = prev {
                if key.time_ms <= p {
                    errs.push(format!(
                        "tracks[{}].keyframes must have strictly increasing time_ms",
                        t
                    ));
                    break;
                }
            }
            prev = Some(key.time_ms);
        }
    }
}
