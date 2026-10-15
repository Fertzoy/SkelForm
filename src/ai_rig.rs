//! Multimodal Auto-Rig & Animate integration for SkelForm.
//!
//! Qwen returns a versioned, typed plan. We validate it locally and only translate it
//! into SkelForm's existing Bone, Vertex, BoneBind, Animation and Keyframe data on Apply.

use crate::shared::*;
use image::{DynamicImage, GenericImageView, ImageFormat};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    io::Cursor,
    sync::{Arc, Mutex},
};

pub const DEFAULT_MODEL: &str = "qwen/qwen3.8-27b:free";
const OPENROUTER_CHAT_URL: &str = "https://openrouter.ai/api/v1/chat/completions";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AiRigPlan {
    pub schema_version: u32,
    pub analysis: AiRigAnalysis,
    pub bones: Vec<AiRigBone>,
    #[serde(default)]
    pub attachments: Vec<AiRigAttachment>,
    pub animation: AiRigAnimation,
    #[serde(default)]
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AiRigAnalysis {
    pub object_type: String,
    pub rig_strategy: String,
    pub confidence: f32,
    pub reason: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AiRigBone {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub start: AiRigPoint,
    pub end: AiRigPoint,
    pub role: String,
    pub joint_type: String,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AiRigPoint {
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AiRigAttachment {
    pub bone_id: String,
    pub layer_name: String,
    pub mode: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AiRigAnimation {
    pub name: String,
    pub duration_ms: u32,
    pub fps: u32,
    #[serde(rename = "loop")]
    pub looping: bool,
    pub tracks: Vec<AiRigTrack>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AiRigTrack {
    pub bone_id: String,
    pub element: String,
    pub keys: Vec<AiRigKey>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AiRigKey {
    pub frame: u32,
    pub value: f32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AiRigLayer {
    pub name: String,
    pub order: usize,
    pub width: u32,
    pub height: u32,
    pub atlas_x: f32,
    pub atlas_y: f32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct SelectedTransform {
    x: f32,
    y: f32,
    rotation: f32,
    scale_x: f32,
    scale_y: f32,
}

#[derive(Default)]
struct AiRigJob {
    running: bool,
    result: Option<Result<AiRigPlan, String>>,
}

/// Temporary editor state only: credentials and drafts are not serialized into .skf.
#[derive(Clone, Default)]
pub struct AiRigUiState {
    pub open: bool,
    pub prompt: String,
    pub api_key: String,
    pub detailed: bool,
    pub target_texture: String,
    pub target_bone_id: Option<i32>,
    pub status: String,
    pub source_image: Option<DynamicImage>,
    pub source_layers: Vec<AiRigLayer>,
    pub preview_texture: Option<egui::TextureHandle>,
    pub plan: Option<AiRigPlan>,
    pub show_original_only: bool,
    pub drag_joint: Option<(usize, bool)>,
    job: Arc<Mutex<AiRigJob>>,
}

impl AiRigUiState {
    pub fn begin(&mut self, texture_name: String, bone_id: Option<i32>) {
        self.open = true;
        self.target_texture = texture_name;
        self.target_bone_id = bone_id;
        self.status.clear();
        self.prompt = "Create a suitable rig and a subtle idle animation for this image.".into();
        self.plan = None;
        self.source_image = None;
        self.source_layers.clear();
        self.preview_texture = None;
        self.show_original_only = false;
        self.drag_joint = None;
        if let Ok(mut job) = self.job.lock() {
            job.running = false;
            job.result = None;
        }
    }
}

fn normalized_to_local(point: AiRigPoint, width: f32, height: f32) -> Vec2 {
    Vec2::new((point.x - 0.5) * width, (0.5 - point.y) * height)
}

fn rotate(point: Vec2, angle: f32) -> Vec2 {
    let (sin, cos) = angle.sin_cos();
    Vec2::new(point.x * cos - point.y * sin, point.x * sin + point.y * cos)
}

fn point_segment_distance(point: Vec2, start: Vec2, end: Vec2) -> f32 {
    let segment = end - start;
    let len_sq = segment.x * segment.x + segment.y * segment.y;
    if len_sq <= f32::EPSILON {
        return (point - start).mag();
    }
    let rel = point - start;
    let t = ((rel.x * segment.x + rel.y * segment.y) / len_sq).clamp(0.0, 1.0);
    (point - (start + segment * t)).mag()
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 48
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
}

pub fn validate_plan(plan: &AiRigPlan, detailed: bool, known_layers: &[String]) -> Result<(), String> {
    let max_bones = if detailed { 48 } else { 16 };
    let max_keys = if detailed { 240 } else { 80 };
    let max_duration_ms = if detailed { 30_000 } else { 12_000 };

    if plan.schema_version != 1 {
        return Err(format!("Unsupported AiRigPlan schema version {}.", plan.schema_version));
    }
    if !matches!(plan.analysis.object_type.as_str(),
        "gem" | "candy" | "coin" | "game_item" | "geometric" | "icon" | "plant" | "flower"
        | "organic" | "humanoid" | "animal" | "creature" | "winged_creature" | "layered_object" | "unknown")
    {
        return Err("The model returned an unsupported object_type.".into());
    }
    if !matches!(plan.analysis.rig_strategy.as_str(),
        "transform_rig" | "mesh_deformation_rig" | "layer_based_rig")
    {
        return Err("The model returned an unsupported rig_strategy.".into());
    }
    if !plan.analysis.confidence.is_finite() || !(0.0..=1.0).contains(&plan.analysis.confidence) {
        return Err("analysis.confidence must be finite and in [0, 1].".into());
    }
    if plan.analysis.reason.trim().is_empty() || plan.analysis.reason.len() > 700 {
        return Err("The model's analysis reason is empty or too long.".into());
    }
    if plan.bones.is_empty() || plan.bones.len() > max_bones {
        return Err(format!("Bone count must be between 1 and {max_bones} for the selected mode."));
    }

    let mut ids: HashSet<&str> = HashSet::new();
    let mut bones_by_id: HashMap<&str, &AiRigBone> = HashMap::new();
    for bone in &plan.bones {
        if !valid_id(&bone.id) || !ids.insert(bone.id.as_str()) {
            return Err(format!("Bone id '{}' is invalid or duplicated.", bone.id));
        }
        if bone.name.trim().is_empty() || bone.name.len() > 64 || bone.role.len() > 64 {
            return Err(format!("Bone '{}' has an invalid name or role.", bone.id));
        }
        if !matches!(bone.joint_type.as_str(), "hinge" | "ball" | "fixed" | "unknown") {
            return Err(format!("Bone '{}' has an unsupported joint type.", bone.id));
        }
        for (label, point) in [("start", bone.start), ("end", bone.end)] {
            if !point.x.is_finite() || !point.y.is_finite()
                || !(0.0..=1.0).contains(&point.x) || !(0.0..=1.0).contains(&point.y)
            {
                return Err(format!("Bone '{}' {} coordinates must be normalized to [0, 1].", bone.id, label));
            }
        }
        let dx = bone.end.x - bone.start.x;
        let dy = bone.end.y - bone.start.y;
        if (dx * dx + dy * dy).sqrt() < 0.002 {
            return Err(format!("Bone '{}' has near-zero length.", bone.id));
        }
        bones_by_id.insert(bone.id.as_str(), bone);
    }

    if plan.bones.iter().filter(|bone| bone.parent_id.is_none()).count() != 1 {
        return Err("A rig must have exactly one root bone.".into());
    }
    for bone in &plan.bones {
        if let Some(parent) = bone.parent_id.as_deref() {
            if parent == bone.id || !bones_by_id.contains_key(parent) {
                return Err(format!("Bone '{}' references missing/invalid parent '{}'.", bone.id, parent));
            }
        }
        let mut seen = HashSet::new();
        let mut current = Some(bone.id.as_str());
        while let Some(id) = current {
            if !seen.insert(id) {
                return Err(format!("Cycle detected in the hierarchy at '{}'.", id));
            }
            current = bones_by_id.get(id).and_then(|entry| entry.parent_id.as_deref());
        }
    }

    match plan.analysis.rig_strategy.as_str() {
        "transform_rig" if plan.bones.len() != 1 =>
            return Err("transform_rig must use exactly one bone for a simple object.".into()),
        "mesh_deformation_rig" if plan.bones.len() < 2 =>
            return Err("mesh_deformation_rig requires at least two meaningful bones.".into()),
        "layer_based_rig" if plan.attachments.is_empty() =>
            return Err("layer_based_rig must specify explicit attachments.".into()),
        _ => {}
    }

    let mut seen_attachments = HashSet::new();
    for attachment in &plan.attachments {
        if !bones_by_id.contains_key(attachment.bone_id.as_str()) {
            return Err(format!("Attachment references unknown bone '{}'.", attachment.bone_id));
        }
        if !known_layers.iter().any(|name| name == &attachment.layer_name) {
            return Err(format!("Attachment references unavailable texture/layer '{}'.", attachment.layer_name));
        }
        if !matches!(attachment.mode.as_str(), "transform" | "mesh_weight") {
            return Err(format!("Unsupported attachment mode '{}'.", attachment.mode));
        }
        if !seen_attachments.insert((attachment.bone_id.as_str(), attachment.layer_name.as_str())) {
            return Err("Duplicate attachment detected.".into());
        }
    }

    if plan.animation.name.trim().is_empty() || plan.animation.name.len() > 64 {
        return Err("Animation name must be non-empty and no longer than 64 characters.".into());
    }
    if !(1..=60).contains(&plan.animation.fps) {
        return Err("Animation FPS must be in [1, 60].".into());
    }
    if !(250..=max_duration_ms).contains(&plan.animation.duration_ms) {
        return Err(format!("Animation duration must be between 250 and {max_duration_ms} ms."));
    }
    if plan.animation.tracks.is_empty() {
        return Err("Animation contains no tracks; refusing to apply an unanimated rig.".into());
    }

    let last_frame = ((plan.animation.duration_ms as f32 * plan.animation.fps as f32) / 1000.0).round() as u32;
    let mut total_keys = 0usize;
    for track in &plan.animation.tracks {
        if !bones_by_id.contains_key(track.bone_id.as_str()) {
            return Err(format!("Animation track references unknown bone '{}'.", track.bone_id));
        }
        if !matches!(track.element.as_str(), "rotation" | "scale_x" | "scale_y") {
            return Err(format!("Unsupported animation element '{}'.", track.element));
        }
        if track.keys.len() < 2 || track.keys.len() > 8 {
            return Err("Each animation track must contain 2 to 8 keys.".into());
        }
        let mut last_seen: Option<u32> = None;
        for key in &track.keys {
            if key.frame > last_frame || !key.value.is_finite() {
                return Err(format!("Track for '{}' contains an invalid key.", track.bone_id));
            }
            if let Some(previous) = last_seen {
                if key.frame <= previous {
                    return Err(format!("Track for '{}' is not sorted by ascending frame.", track.bone_id));
                }
            }
            if track.element == "rotation" && key.value.abs() > std::f32::consts::TAU * 4.0 {
                return Err("Rotation key is outside the supported range [-8π, 8π].".into());
            }
            if (track.element == "scale_x" || track.element == "scale_y")
                && !(0.02..=20.0).contains(&key.value)
            {
                return Err("Scale key must be between 0.02 and 20.".into());
            }
            last_seen = Some(key.frame);
            total_keys += 1;
        }
        if track.keys.first().map(|key| key.frame) != Some(0)
            || track.keys.last().map(|key| key.frame) != Some(last_frame)
        {
            return Err(format!("Track '{}' must start at frame 0 and end at frame {}.", track.bone_id, last_frame));
        }
    }
    if total_keys > max_keys {
        return Err(format!("The animation has {total_keys} keys; the selected mode allows {max_keys}."));
    }
    if plan.warnings.len() > 16 || plan.warnings.iter().any(|warning| warning.len() > 300) {
        return Err("The model returned too many or excessively long warnings.".into());
    }
    Ok(())
}

fn ai_rig_schema() -> Value {
    let point = json!({
        "type":"object","additionalProperties":false,
        "required":["x","y"],
        "properties":{
            "x":{"type":"number","minimum":0,"maximum":1},
            "y":{"type":"number","minimum":0,"maximum":1}
        }
    });
    json!({
        "type":"object","additionalProperties":false,
        "required":["schema_version","analysis","bones","attachments","animation","warnings"],
        "properties":{
            "schema_version":{"type":"integer","const":1},
            "analysis":{
                "type":"object","additionalProperties":false,
                "required":["object_type","rig_strategy","confidence","reason"],
                "properties":{
                    "object_type":{"type":"string","enum":["gem","candy","coin","game_item","geometric","icon","plant","flower","organic","humanoid","animal","creature","winged_creature","layered_object","unknown"]},
                    "rig_strategy":{"type":"string","enum":["transform_rig","mesh_deformation_rig","layer_based_rig"]},
                    "confidence":{"type":"number","minimum":0,"maximum":1},
                    "reason":{"type":"string","maxLength":700}
                }
            },
            "bones":{
                "type":"array","minItems":1,"maxItems":48,
                "items":{
                    "type":"object","additionalProperties":false,
                    "required":["id","name","parent_id","start","end","role","joint_type"],
                    "properties":{
                        "id":{"type":"string","minLength":1,"maxLength":48},
                        "name":{"type":"string","minLength":1,"maxLength":64},
                        "parent_id":{"anyOf":[{"type":"string"},{"type":"null"}]},
                        "start":point,
                        "end":point,
                        "role":{"type":"string","maxLength":64},
                        "joint_type":{"type":"string","enum":["hinge","ball","fixed","unknown"]}
                    }
                }
            },
            "attachments":{
                "type":"array","maxItems":80,
                "items":{
                    "type":"object","additionalProperties":false,
                    "required":["bone_id","layer_name","mode"],
                    "properties":{
                        "bone_id":{"type":"string"},
                        "layer_name":{"type":"string"},
                        "mode":{"type":"string","enum":["transform","mesh_weight"]}
                    }
                }
            },
            "animation":{
                "type":"object","additionalProperties":false,
                "required":["name","duration_ms","fps","loop","tracks"],
                "properties":{
                    "name":{"type":"string","minLength":1,"maxLength":64},
                    "duration_ms":{"type":"integer","minimum":250,"maximum":30000},
                    "fps":{"type":"integer","minimum":1,"maximum":60},
                    "loop":{"type":"boolean"},
                    "tracks":{
                        "type":"array","minItems":1,"maxItems":144,
                        "items":{
                            "type":"object","additionalProperties":false,
                            "required":["bone_id","element","keys"],
                            "properties":{
                                "bone_id":{"type":"string"},
                                "element":{"type":"string","enum":["rotation","scale_x","scale_y"]},
                                "keys":{
                                    "type":"array","minItems":2,"maxItems":8,
                                    "items":{
                                        "type":"object","additionalProperties":false,
                                        "required":["frame","value"],
                                        "properties":{
                                            "frame":{"type":"integer","minimum":0},
                                            "value":{"type":"number"}
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            "warnings":{"type":"array","maxItems":16,"items":{"type":"string","maxLength":300}}
        }
    })
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let a = chunk[0] as u32;
        let b = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let c = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let value = (a << 16) | (b << 8) | c;
        output.push(TABLE[((value >> 18) & 63) as usize] as char);
        output.push(TABLE[((value >> 12) & 63) as usize] as char);
        output.push(if chunk.len() > 1 { TABLE[((value >> 6) & 63) as usize] as char } else { '=' });
        output.push(if chunk.len() > 2 { TABLE[(value & 63) as usize] as char } else { '=' });
    }
    output
}

fn resize_for_mode(source: &DynamicImage, detailed: bool) -> DynamicImage {
    let max_edge = if detailed { 1280u32 } else { 768u32 };
    let (width, height) = source.dimensions();
    if width.max(height) <= max_edge {
        return source.clone();
    }
    let scale = max_edge as f32 / width.max(height) as f32;
    let target_width = ((width as f32 * scale).round() as u32).max(1);
    let target_height = ((height as f32 * scale).round() as u32).max(1);
    DynamicImage::ImageRgba8(image::imageops::resize(
        &source.to_rgba8(), target_width, target_height, image::imageops::FilterType::Lanczos3
    ))
}

fn request_plan(
    source: DynamicImage,
    user_prompt: String,
    detailed: bool,
    api_key: String,
    layers: Vec<AiRigLayer>,
    viewport: (f32, f32),
    target_transform: Option<SelectedTransform>,
) -> Result<AiRigPlan, String> {
    if api_key.trim().is_empty() {
        return Err("Missing OpenRouter API key. Enter it for this session or set OPENROUTER_API_KEY.".into());
    }
    let image = resize_for_mode(&source, detailed);
    let (width, height) = image.dimensions();
    let mut png = Cursor::new(Vec::new());
    image.write_to(&mut png, ImageFormat::Png)
        .map_err(|error| format!("Could not encode selected image as PNG: {error}"))?;
    let image_url = format!("data:image/png;base64,{}", base64_encode(&png.into_inner()));
    let layer_info = json!({
        "meaning":"These entries are textures from the active SkelForm style/atlas. Their names may describe parts, but their offsets are atlas coordinates, not guaranteed PSD-canvas origins.",
        "entries": layers,
    });
    let technical_context = json!({
        "selected_image":{"width":width,"height":height,"origin":"top-left","x_axis":"increases right","y_axis":"increases down"},
        "coordinates":"Normalize joint coordinates to the selected image crop. x and y are in [0,1]; (0,0) is top-left. Do not use atlas coordinates as joint coordinates.",
        "viewport_logical_size":{"width":viewport.0,"height":viewport.1},
        "selected_object_transform":target_transform,
        "available_style_textures":layer_info,
        "mode":if detailed {"Detailed Rig"} else {"Fast Rig"},
    });
    let limits = if detailed {
        "Use at most 48 bones and 240 total keyframes; duration must be at most 30 seconds."
    } else {
        "Use at most 16 bones and 80 total keyframes; duration must be at most 12 seconds."
    };
    let text_prompt = format!(
        "You plan a real rig for SkelForm, a 2D skeletal animation editor. Inspect the actual image pixels, silhouette, transparency and visible anatomy. User request: {user_prompt}\n\
         Technical context: {technical_context}\n\
         Categories: gem, candy, coin, game_item, geometric, icon, plant, flower, organic, humanoid, animal, creature, winged_creature, layered_object or unknown.\n\
         Strategy: transform_rig for a simple object animated as a whole; mesh_deformation_rig when the image alpha silhouette allows modest mesh deformation; layer_based_rig only when distinct existing textures reliably correspond to parts. Never claim that a single flat PNG has been separated into limbs. Existing style textures are only candidate layer hints, not proof of source PSD canvas coordinates.\n\
         Make a compact acyclic hierarchy with exactly one root, semantic IDs and no zero-length segments. Joint coordinates are normalized to the selected crop: origin top-left, X right, Y down. Choose positions from this image.\n\
         The engine accepts only rotation, scale_x and scale_y animation tracks. Rotation values are local radians; scales are positive multipliers. Every track starts at frame 0 and ends at round(duration_ms*fps/1000); for looping animation the last value must equal the first. Stay within the schema constraints. {limits}\n\
         Return only JSON conforming to the supplied AiRigPlan version 1 JSON Schema. No markdown or prose outside JSON."
    );

    let request_body = json!({
        "model":DEFAULT_MODEL,
        "temperature":0.15,
        "max_tokens":if detailed {6000} else {2500},
        "response_format":{
            "type":"json_schema",
            "json_schema":{"name":"skelform_ai_rig_plan_v1","strict":true,"schema":ai_rig_schema()}
        },
        "messages":[
            {"role":"system","content":"Return valid JSON for the requested schema. Analyze the supplied pixels; do not infer unsupported image layers or engine capabilities."},
            {"role":"user","content":[
                {"type":"text","text":text_prompt},
                {"type":"image_url","image_url":{"url":image_url}}
            ]}
        ]
    });

    #[cfg(not(target_arch = "wasm32"))]
    {
        let auth = format!("Bearer {}", api_key.trim());
        let mut response = ureq::post(OPENROUTER_CHAT_URL)
            .header("Authorization", &auth)
            .header("Content-Type", "application/json")
            .header("HTTP-Referer", "https://skelform.org")
            .header("X-Title", "SkelForm Auto-Rig")
            .send_json(&request_body)
            .map_err(|error| format!("OpenRouter request failed for {DEFAULT_MODEL}: {error}. No paid-model fallback was attempted."))?;
        let body = response.body_mut().read_to_string()
            .map_err(|error| format!("Could not read OpenRouter response: {error}"))?;
        let response_json: Value = serde_json::from_str(&body)
            .map_err(|error| format!("OpenRouter response was not valid JSON: {error}"))?;
        let content = response_json.pointer("/choices/0/message/content").and_then(Value::as_str)
            .ok_or_else(|| {
                let message = response_json.pointer("/error/message").and_then(Value::as_str)
                    .unwrap_or("The provider did not return choices[0].message.content.");
                format!("No successful multimodal response from {DEFAULT_MODEL}: {message}")
            })?;
        let plan: AiRigPlan = serde_json::from_str(content)
            .map_err(|error| format!("Response did not match AiRigPlan v1: {error}"))?;
        let available: Vec<String> = layers.iter().map(|layer| layer.name.clone()).collect();
        validate_plan(&plan, detailed, &available)?;
        Ok(plan)
    }
    #[cfg(target_arch = "wasm32")]
    {
        let _ = (request_body, viewport, target_transform, layers);
        Err("OpenRouter image analysis is supported in the desktop build only; no mock result was generated.".into())
    }
}

fn load_source(state: &mut AiRigUiState, armature: &Armature, context: &egui::Context) {
    if state.source_image.is_some() || state.target_texture.is_empty() {
        return;
    }
    let Some(style) = armature.styles.iter().find(|style| {
        style.active && style.textures.iter().any(|texture| texture.name == state.target_texture)
    }) else {
        state.status = "Selected texture is not in an active style. Activate the style containing it and reopen Auto-Rig.".into();
        return;
    };
    let Some(texture) = style.textures.iter().find(|texture| texture.name == state.target_texture) else {
        state.status = "Selected texture no longer exists.".into();
        return;
    };
    let Some(data) = armature.tex_data(texture) else {
        state.status = "Selected texture has no decoded image data.".into();
        return;
    };
    let atlas = data.image.clone();
    let (atlas_width, atlas_height) = atlas.dimensions();
    let x = texture.offset.x.round().max(0.0) as u32;
    let y = texture.offset.y.round().max(0.0) as u32;
    let width = texture.size.x.round().max(0.0) as u32;
    let height = texture.size.y.round().max(0.0) as u32;
    if width == 0 || height == 0 || x >= atlas_width || y >= atlas_height {
        state.status = "Invalid texture crop. Refusing to send an empty image or the whole atlas.".into();
        return;
    }
    let crop = atlas.crop_imm(x, y, width.min(atlas_width - x), height.min(atlas_height - y));
    state.source_layers = style.textures.iter().enumerate().map(|(order, entry)| AiRigLayer {
        name: entry.name.clone(),
        order,
        width: entry.size.x.max(0.0) as u32,
        height: entry.size.y.max(0.0) as u32,
        atlas_x: entry.offset.x,
        atlas_y: entry.offset.y,
    }).collect();

    let preview = resize_for_mode(&crop, true).to_rgba8();
    let color_image = egui::ColorImage::from_rgba_unmultiplied(
        [preview.width() as usize, preview.height() as usize],
        preview.as_raw(),
    );
    state.preview_texture = Some(context.load_texture(
        format!("ai_rig_preview_{}_{}", state.target_texture, texture.data_id),
        color_image,
        egui::TextureOptions::LINEAR,
    ));
    state.source_image = Some(crop);
    if state.status.starts_with("Selected texture") {
        state.status.clear();
    }
}

fn start_analysis(state: &mut AiRigUiState, armature: &Armature, camera: &Camera) {
    let Some(source) = state.source_image.clone() else {
        state.status = "No valid selected-image crop is available. Select a texture in an active style.".into();
        return;
    };
    let api_key = if !state.api_key.trim().is_empty() {
        state.api_key.clone()
    } else {
        #[cfg(not(target_arch = "wasm32"))]
        { std::env::var("OPENROUTER_API_KEY").unwrap_or_default() }
        #[cfg(target_arch = "wasm32")]
        { String::new() }
    };
    if api_key.trim().is_empty() {
        state.status = "Enter an OpenRouter API key or set OPENROUTER_API_KEY. The key is kept in memory and is not saved to .skf.".into();
        return;
    }
    let Some(style) = armature.styles.iter().find(|style| {
        style.active && style.textures.iter().any(|texture| texture.name == state.target_texture)
    }) else {
        state.status = "Selected texture is no longer in an active style.".into();
        return;
    };
    let available_layers: Vec<String> = style.textures.iter().map(|texture| texture.name.clone()).collect();
    let layers = state.source_layers.clone();
    let prompt = state.prompt.clone();
    let detailed = state.detailed;
    let viewport = (camera.window.x, camera.window.y);
    let transform = state.target_bone_id
        .and_then(|id| armature.bones.iter().find(|bone| bone.id == id))
        .map(|bone| SelectedTransform {
            x: bone.pos.x, y: bone.pos.y, rotation: bone.rot,
            scale_x: bone.scale.x, scale_y: bone.scale.y,
        });
    let job = state.job.clone();
    if let Ok(mut current) = job.lock() {
        if current.running {
            state.status = "An analysis is already running.".into();
            return;
        }
        current.running = true;
        current.result = None;
    }
    state.status = format!("Sending the selected image to {}. No project archive is sent.", DEFAULT_MODEL);
    #[cfg(not(target_arch = "wasm32"))]
    {
        std::thread::spawn(move || {
            let result = request_plan(source, prompt, detailed, api_key, layers, viewport, transform)
                .and_then(|plan| {
                    validate_plan(&plan, detailed, &available_layers)?;
                    Ok(plan)
                });
            if let Ok(mut current) = job.lock() {
                current.result = Some(result);
                current.running = false;
            }
        });
    }
    #[cfg(target_arch = "wasm32")]
    {
        let result = request_plan(source, prompt, detailed, api_key, layers, viewport, transform)
            .and_then(|plan| {
                validate_plan(&plan, detailed, &available_layers)?;
                Ok(plan)
            });
        if let Ok(mut current) = job.lock() {
            current.result = Some(result);
            current.running = false;
        }
    }
}

fn poll_job(state: &mut AiRigUiState) {
    let result = if let Ok(mut job) = state.job.lock() { job.result.take() } else { None };
    if let Some(result) = result {
        match result {
            Ok(plan) => {
                state.status = format!("Analysis complete: {} · {} · confidence {:.0}%. Review the draft before applying.",
                    plan.analysis.object_type, plan.analysis.rig_strategy, plan.analysis.confidence * 100.0);
                state.plan = Some(plan);
            }
            Err(error) => {
                state.status = error;
                state.plan = None;
            }
        }
    }
}

fn prepare_mesh(
    plan: &AiRigPlan,
    source: &DynamicImage,
    detailed: bool,
) -> Result<(Vec<Vertex>, Vec<u32>, Vec<Vec<f32>>), String> {
    let gap = if detailed { 6.0 } else { 12.0 };
    let (mut vertices, indices) = crate::editor::trace_mesh(source, gap, 1.0);
    if vertices.len() < 3 || indices.len() < 3 {
        return Err("SkelForm could not trace a usable alpha-silhouette mesh. Use a transparent cutout or separate the artwork into layers; nothing was applied.".into());
    }
    if vertices.len() > 2500 {
        return Err(format!("The generated mesh has {} vertices; the safety limit is 2500. Use Fast Rig or simplify the transparent silhouette.", vertices.len()));
    }
    let width = source.width() as f32;
    let height = source.height() as f32;
    let segments: Vec<(Vec2, Vec2, f32)> = plan.bones.iter().map(|bone| {
        let start = normalized_to_local(bone.start, width, height);
        let end = normalized_to_local(bone.end, width, height);
        (start, end, (end.y - start.y).atan2(end.x - start.x))
    }).collect();

    let mut weights_by_bone = vec![vec![0.0f32; vertices.len()]; plan.bones.len()];
    for (vertex_idx, vertex) in vertices.iter_mut().enumerate() {
        // trace_mesh uses x and -y pixels. Convert to the centered local space used by textures.
        vertex.pos.x -= width * 0.5;
        vertex.pos.y += height * 0.5;
        vertex.id = vertex_idx as u32;
        let desired = vertex.pos;
        let mut nearest: Vec<(usize, f32)> = segments.iter().enumerate()
            .map(|(index, (start, end, _))| (index, point_segment_distance(desired, *start, *end)))
            .collect();
        nearest.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
        nearest.truncate(nearest.len().min(3));
        if nearest.is_empty() {
            return Err("No valid rig segments were returned for mesh binding.".into());
        }
        let radius = (width.min(height) * 0.035).max(1.0);
        let mut blended: Vec<(usize, f32)> = nearest.iter()
            .map(|(index, distance)| (*index, 1.0 / (distance + radius).powi(2)))
            .collect();
        let total: f32 = blended.iter().map(|(_, weight)| *weight).sum();
        for (index, weight) in &mut blended {
            *weight /= total.max(f32::EPSILON);
            weights_by_bone[*index][vertex_idx] = *weight;
        }

        // Solve the weighted rest pose so the original silhouette does not jump on Apply.
        // In the image-local frame each bind contributes R(theta) * local + joint_start.
        let mut a = 0.0;
        let mut b = 0.0;
        let mut c = 0.0;
        let mut d = 0.0;
        let mut offset = Vec2::ZERO;
        for (index, weight) in blended {
            let (start, _, angle) = segments[index];
            let (sin, cos) = angle.sin_cos();
            a += weight * cos;
            b -= weight * sin;
            c += weight * sin;
            d += weight * cos;
            offset += start * weight;
        }
        let determinant = a * d - b * c;
        if determinant.abs() > 0.02 {
            let rhs = desired - offset;
            vertex.pos = Vec2::new((d * rhs.x - b * rhs.y) / determinant, (-c * rhs.x + a * rhs.y) / determinant);
        } else {
            let (nearest_index, _) = nearest[0];
            let (start, _, angle) = segments[nearest_index];
            vertex.pos = rotate(desired - start, -angle);
        }
    }
    Ok((vertices, indices, weights_by_bone))
}

fn build_animation(
    plan: &AiRigPlan,
    bone_map: &HashMap<String, i32>,
    existing: &[Animation],
) -> Result<Animation, String> {
    let mut keyframes = Vec::new();
    let (start_handle, end_handle) = crate::utils::interp_preset(HandlePreset::SineInOut);
    for track in &plan.animation.tracks {
        let bone_id = *bone_map.get(&track.bone_id)
            .ok_or_else(|| format!("No engine bone maps to animation track '{}'.", track.bone_id))?;
        let element = match track.element.as_str() {
            "rotation" => AnimElement::Rotation,
            "scale_x" => AnimElement::ScaleX,
            "scale_y" => AnimElement::ScaleY,
            _ => return Err(format!("Unsupported engine animation element '{}'.", track.element)),
        };
        for key in &track.keys {
            keyframes.push(Keyframe {
                frame: key.frame as i32,
                bone_id,
                element: element.clone(),
                value: key.value,
                start_handle,
                end_handle,
                handle_preset: HandlePreset::SineInOut,
                ..Default::default()
            });
        }
    }
    keyframes.sort_by(|a, b| a.frame.cmp(&b.frame));
    Ok(Animation {
        name: plan.animation.name.clone(),
        id: existing.iter().map(|animation| animation.id).max().unwrap_or(-1) + 1,
        fps: plan.animation.fps as i32,
        keyframes,
        elapsed: None,
    })
}

fn apply_plan(
    state: &mut AiRigUiState,
    armature: &mut Armature,
    selections: &mut SelectionState,
    undo_states: &mut UndoStates,
    unsaved: &mut bool,
) -> Result<(), String> {
    let Some(plan) = state.plan.clone() else {
        return Err("There is no validated plan to apply.".into());
    };
    let known_layers: Vec<String> = state.source_layers.iter().map(|layer| layer.name.clone()).collect();
    validate_plan(&plan, state.detailed, &known_layers)?;
    let Some(source_image) = state.source_image.as_ref() else {
        return Err("Original selected image is missing. Reopen Auto-Rig and analyze again.".into());
    };
    let target_texture = state.target_texture.clone();
    let target_bone_id = state.target_bone_id.or_else(|| {
        armature.bones.iter().find(|bone| bone.tex == target_texture).map(|bone| bone.id)
    });

    if plan.analysis.rig_strategy == "layer_based_rig" {
        let mut bone_map = HashMap::new();
        for attachment in &plan.attachments {
            let Some(existing_bone) = armature.bones.iter().find(|bone| bone.tex == attachment.layer_name) else {
                return Err(format!("No existing SkelForm bone is bound to texture/layer '{}'. Atlas rectangles do not prove original PSD canvas positions, so no synthetic layer rig was created.", attachment.layer_name));
            };
            if bone_map.insert(attachment.bone_id.clone(), existing_bone.id).is_some() {
                return Err(format!("AI bone '{}' is attached to more than one engine bone; choose a single attachment.", attachment.bone_id));
            }
        }
        for bone in &plan.bones {
            if !bone_map.contains_key(&bone.id) {
                return Err(format!("AI bone '{}' has no existing layer attachment. Import or bind each part first; no layers were moved.", bone.id));
            }
        }
        let animation = build_animation(&plan, &bone_map, &armature.animations)?;
        undo_states.new_undo_bones(&armature.bones);
        undo_states.new_undo_anims(&armature.animations);
        armature.animations.push(animation);
        *unsaved = true;
        state.status = "Animation applied to existing layer-bound bones. Original texture positions were preserved.".into();
        return Ok(());
    }

    if target_texture.is_empty() {
        return Err("No texture is selected. Open Auto-Rig from a textured bone or a texture in the active Styles panel.".into());
    }
    if !armature.styles.iter().any(|style| style.active && style.textures.iter().any(|texture| texture.name == target_texture)) {
        return Err("The target image is not available in an active SkelForm style.".into());
    }

    // Validate the target and build potentially failing geometry before mutating scene data.
    if let Some(id) = target_bone_id {
        if !armature.bones.iter().any(|bone| bone.id == id) {
            return Err("Selected base bone no longer exists.".into());
        }
    }
    let prepared = if plan.analysis.rig_strategy == "mesh_deformation_rig" {
        Some(prepare_mesh(&plan, source_image, state.detailed)?)
    } else {
        None
    };

    undo_states.new_undo_bones(&armature.bones);
    undo_states.new_undo_anims(&armature.animations);

    let base_id = if let Some(id) = target_bone_id {
        id
    } else {
        let id = armature.bones.iter().map(|bone| bone.id).max().unwrap_or(-1) + 1;
        let mut base = Bone::default();
        base.id = id;
        base.name = format!("{} Root", state.target_texture);
        base.parent_id = -1;
        base.pos = Vec2::ZERO;
        base.scale = Vec2::new(1.0, 1.0);
        base.pivot_scale = Vec2::new(1.0, 1.0);
        armature.bones.push(base);
        armature.set_bone_tex(id, target_texture.clone(), usize::MAX, -1);
        id
    };

    let mut bone_map: HashMap<String, i32> = HashMap::new();
    if plan.analysis.rig_strategy == "transform_rig" {
        bone_map.insert(plan.bones[0].id.clone(), base_id);
    } else {
        let width = source_image.width() as f32;
        let height = source_image.height() as f32;
        let mut pending = plan.bones.clone();
        let mut local_transforms: HashMap<String, (Vec2, f32)> = HashMap::new();
        while !pending.is_empty() {
            let mut changed = false;
            let mut unresolved = Vec::new();
            for ai_bone in pending {
                let parent_ready = ai_bone.parent_id.as_ref().map_or(true, |parent| bone_map.contains_key(parent));
                if !parent_ready {
                    unresolved.push(ai_bone);
                    continue;
                }
                let start = normalized_to_local(ai_bone.start, width, height);
                let end = normalized_to_local(ai_bone.end, width, height);
                let angle = (end.y - start.y).atan2(end.x - start.x);
                let (parent_id, local_pos, local_rot) = if let Some(parent_key) = ai_bone.parent_id.as_ref() {
                    let (parent_start, parent_angle) = *local_transforms.get(parent_key)
                        .ok_or_else(|| format!("Missing parent transform for '{}'.", parent_key))?;
                    (bone_map[parent_key], rotate(start - parent_start, -parent_angle), angle - parent_angle)
                } else {
                    (base_id, start, angle)
                };
                let id = armature.bones.iter().map(|bone| bone.id).max().unwrap_or(-1) + 1;
                let mut bone = Bone::default();
                bone.id = id;
                bone.name = ai_bone.name.clone();
                bone.parent_id = parent_id;
                bone.pos = local_pos;
                bone.rot = local_rot;
                bone.scale = Vec2::new(1.0, 1.0);
                bone.pivot_scale = Vec2::new(1.0, 1.0);
                armature.bones.push(bone);
                bone_map.insert(ai_bone.id.clone(), id);
                local_transforms.insert(ai_bone.id.clone(), (start, angle));
                changed = true;
            }
            if !changed {
                let unresolved_id = unresolved.first().map(|bone| bone.id.as_str()).unwrap_or("unknown");
                return Err(format!("Could not build the hierarchy; unresolved bone '{}'.", unresolved_id));
            }
            pending = unresolved;
        }

        if let Some((vertices, indices, weights)) = prepared {
            let base = armature.bones.iter_mut().find(|bone| bone.id == base_id).unwrap();
            base.vertices = vertices;
            base.indices = indices;
            base.binds.clear();
            base.verts_edited = true;
            for (plan_index, ai_bone) in plan.bones.iter().enumerate() {
                let generated_id = bone_map[&ai_bone.id];
                let mut bind = BoneBind { bone_id: generated_id, is_path: false, verts: Vec::with_capacity(base.vertices.len()) };
                for vertex in &base.vertices {
                    bind.verts.push(BoneBindVert {
                        id: vertex.id as i32,
                        weight: weights[plan_index][vertex.id as usize].clamp(0.0, 1.0),
                    });
                }
                base.binds.push(bind);
            }
        }
    }

    let animation = build_animation(&plan, &bone_map, &armature.animations)?;
    let animation_name = animation.name.clone();
    armature.animations.push(animation);
    selections.bone_idx = armature.bones.iter().position(|bone| bone.id == base_id).unwrap_or(0);
    selections.bone_ids = vec![base_id];
    *unsaved = true;
    state.status = if plan.analysis.rig_strategy == "mesh_deformation_rig" {
        format!("Applied a real alpha-mesh deformation rig and animation '{}'. Use Undo to revert.", animation_name)
    } else {
        format!("Applied a transform rig and animation '{}'. Use Undo to revert.", animation_name)
    };
    Ok(())
}

pub fn draw(
    context: &egui::Context,
    shared_ui: &mut crate::shared::Ui,
    config: &Config,
    _events: &mut EventState,
    selections: &mut SelectionState,
    armature: &mut Armature,
    undo_states: &mut UndoStates,
    camera: &Camera,
) {
    egui::Area::new(egui::Id::new("skelform_ai_rig_entry"))
        .anchor(egui::Align2::RIGHT_TOP, egui::vec2(-14.0, 14.0))
        .order(egui::Order::Foreground)
        .show(context, |ui| {
            if ui.button("✦ Auto-Rig").on_hover_text("Analyze a selected texture using Qwen vision").clicked() {
                if let Some(bone) = armature.sel_bone(selections) {
                    shared_ui.ai_rig.begin(bone.tex.clone(), Some(bone.id));
                } else if let Some(style) = armature.sel_style(selections) {
                    if let Some(texture_index) = selections.tex_ids.first().copied() {
                        if let Some(texture) = style.textures.get(texture_index.max(0) as usize) {
                            let name = texture.name.clone();
                            let id = armature.bones.iter().find(|bone| bone.tex == name).map(|bone| bone.id);
                            shared_ui.ai_rig.begin(name, id);
                        } else {
                            shared_ui.ai_rig.begin(String::new(), None);
                        }
                    } else {
                        shared_ui.ai_rig.begin(String::new(), None);
                    }
                } else {
                    shared_ui.ai_rig.begin(String::new(), None);
                }
            }
        });

    let (state, unsaved) = (&mut shared_ui.ai_rig, &mut shared_ui.is_unsaved);
    if !state.open {
        return;
    }
    load_source(state, armature, context);
    poll_job(state);

    let mut open = state.open;
    let mut should_apply = false;
    let mut should_reject = false;
    let max_bones = if state.detailed { 48 } else { 16 };
    egui::Window::new("Auto-Rig & Animate")
        .open(&mut open)
        .default_width(760.0)
        .default_height(740.0)
        .resizable(true)
        .vscroll(true)
        .show(context, |ui| {
            ui.label(format!("Multimodal model: {}", DEFAULT_MODEL));
            ui.label(format!("Selected image: {}", if state.target_texture.is_empty() { "(none)".to_string() } else { state.target_texture.clone() }));
            ui.horizontal(|ui| {
                ui.selectable_value(&mut state.detailed, false, "Fast Rig");
                ui.selectable_value(&mut state.detailed, true, "Detailed Rig");
                ui.label(if state.detailed { "≤48 bones / ≤240 keys" } else { "≤16 bones / ≤80 keys" });
            });
            ui.label("OpenRouter API key (session only; alternatively set OPENROUTER_API_KEY):");
            ui.add(egui::TextEdit::singleline(&mut state.api_key).password(true).hint_text("sk-or-…"));
            ui.label("Describe the desired movement:");
            ui.add(egui::TextEdit::multiline(&mut state.prompt).desired_rows(3).desired_width(f32::INFINITY));

            let running = state.job.lock().map(|job| job.running).unwrap_or(false);
            ui.horizontal(|ui| {
                if ui.add_enabled(!running && state.source_image.is_some(), egui::Button::new("Analyze image / Rebuild rig")).clicked() {
                    start_analysis(state, armature, camera);
                }
                if ui.add_enabled(!running && state.plan.is_some(), egui::Button::new("Discard plan and re-analyze")).clicked() {
                    state.plan = None;
                    start_analysis(state, armature, camera);
                }
                if ui.button("Toggle original-only preview").clicked() {
                    state.show_original_only = !state.show_original_only;
                }
            });
            if !state.status.is_empty() {
                ui.label(egui::RichText::new(&state.status).color(
                    if state.status.contains("failed") || state.status.contains("Error") || state.status.contains("error")
                        || state.status.contains("No ") || state.status.contains("Missing") || state.status.contains("refusing") {
                        egui::Color32::LIGHT_RED
                    } else {
                        config.colors.light_accent.into()
                    }
                ));
            }
            if state.source_image.is_none() {
                ui.label("No image crop is available. Open this tool from a texture in an active Styles panel or a textured bone.");
            }

            if let Some(plan) = state.plan.as_mut() {
                ui.separator();
                ui.label(format!("Detected: {} · strategy: {} · confidence {:.0}%",
                    plan.analysis.object_type, plan.analysis.rig_strategy, plan.analysis.confidence * 100.0));
                ui.label(&plan.analysis.reason);

                if let Some(texture) = state.preview_texture.as_ref() {
                    let (w, h) = state.source_image.as_ref()
                        .map(|source| (source.width().max(1) as f32, source.height().max(1) as f32))
                        .unwrap_or((1.0, 1.0));
                    let factor = (560.0 / w).min(390.0 / h).min(1.0);
                    let size = egui::vec2((w * factor).max(1.0), (h * factor).max(1.0));
                    let (rect, response) = ui.allocate_exact_size(size, egui::Sense::click_and_drag());
                    ui.painter().image(
                        texture.id(), rect,
                        egui::Rect::from_min_max(egui::pos2(0.0, 0.0), egui::pos2(1.0, 1.0)),
                        egui::Color32::WHITE
                    );
                    if !state.show_original_only {
                        for bone in &plan.bones {
                            let start = egui::pos2(rect.left() + bone.start.x * rect.width(), rect.top() + bone.start.y * rect.height());
                            let end = egui::pos2(rect.left() + bone.end.x * rect.width(), rect.top() + bone.end.y * rect.height());
                            ui.painter().line_segment([start, end], egui::Stroke::new(2.0, egui::Color32::from_rgb(90, 220, 255)));
                            ui.painter().circle_filled(start, 4.5, egui::Color32::YELLOW);
                            ui.painter().circle_filled(end, 4.5, egui::Color32::from_rgb(255, 120, 110));
                            ui.painter().text(end + egui::vec2(5.0, -4.0), egui::Align2::LEFT_BOTTOM, &bone.name,
                                egui::FontId::proportional(11.0), egui::Color32::WHITE);
                        }
                    }
                    if response.drag_started() {
                        if let Some(pointer) = response.interact_pointer_pos() {
                            let mut nearest: Option<(usize, bool, f32)> = None;
                            for (index, bone) in plan.bones.iter().enumerate() {
                                for (is_end, point) in [(false, bone.start), (true, bone.end)] {
                                    let pos = egui::pos2(rect.left() + point.x * rect.width(), rect.top() + point.y * rect.height());
                                    let distance = pos.distance(pointer);
                                    if nearest.map_or(true, |(_, _, best)| distance < best) {
                                        nearest = Some((index, is_end, distance));
                                    }
                                }
                            }
                            state.drag_joint = nearest.filter(|(_, _, distance)| *distance <= 18.0).map(|(index, is_end, _)| (index, is_end));
                        }
                    }
                    if response.dragged() {
                        if let (Some((index, is_end)), Some(pointer)) = (state.drag_joint, response.interact_pointer_pos()) {
                            if let Some(bone) = plan.bones.get_mut(index) {
                                let point = AiRigPoint {
                                    x: ((pointer.x - rect.left()) / rect.width()).clamp(0.0, 1.0),
                                    y: ((pointer.y - rect.top()) / rect.height()).clamp(0.0, 1.0),
                                };
                                if is_end { bone.end = point; } else { bone.start = point; }
                            }
                        }
                    }
                    if response.drag_stopped() { state.drag_joint = None; }
                    ui.label("Drag yellow start joints or red end joints. Local edits do not call Qwen again.");
                }

                ui.horizontal(|ui| {
                    if ui.add_enabled(plan.bones.len() < max_bones, egui::Button::new("Add bone")).clicked() {
                        let index = plan.bones.len() + 1;
                        let root_id = plan.bones.iter().find(|bone| bone.parent_id.is_none()).map(|bone| bone.id.clone());
                        plan.bones.push(AiRigBone {
                            id: format!("manual_{index}"), name: format!("Bone {index}"), parent_id: root_id,
                            start: AiRigPoint { x: 0.45, y: 0.5 }, end: AiRigPoint { x: 0.55, y: 0.5 },
                            role: "manual".into(), joint_type: "hinge".into()
                        });
                    }
                    ui.label("Parent hierarchy");
                });
                let bone_ids: Vec<(String, String)> = plan.bones.iter().map(|bone| (bone.id.clone(), bone.name.clone())).collect();
                let mut delete_index = None;
                for index in 0..plan.bones.len() {
                    let is_root = plan.bones[index].parent_id.is_none();
                    ui.horizontal(|ui| {
                        ui.label(&plan.bones[index].name);
                        ui.label(format!("[{}]", plan.bones[index].id));
                        egui::ComboBox::from_id_salt(format!("ai_rig_parent_{}", plan.bones[index].id))
                            .selected_text(plan.bones[index].parent_id.clone().unwrap_or_else(|| "(root)".into()))
                            .show_ui(ui, |ui| {
                                if !is_root {
                                    ui.selectable_value(&mut plan.bones[index].parent_id, None, "(root)");
                                }
                                for (id, name) in &bone_ids {
                                    if id != &plan.bones[index].id {
                                        ui.selectable_value(&mut plan.bones[index].parent_id, Some(id.clone()), name);
                                    }
                                }
                            });
                        if ui.add_enabled(!is_root, egui::Button::new("Remove")).clicked() {
                            delete_index = Some(index);
                        }
                    });
                }
                if let Some(index) = delete_index {
                    let removed = plan.bones[index].id.clone();
                    let parent = plan.bones[index].parent_id.clone();
                    plan.bones.remove(index);
                    for bone in &mut plan.bones {
                        if bone.parent_id.as_deref() == Some(removed.as_str()) {
                            bone.parent_id = parent.clone();
                        }
                    }
                    plan.animation.tracks.retain(|track| track.bone_id != removed);
                    plan.attachments.retain(|attachment| attachment.bone_id != removed);
                }
                if !plan.warnings.is_empty() {
                    ui.separator();
                    ui.label("Model warnings:");
                    for warning in &plan.warnings {
                        ui.label(format!("• {warning}"));
                    }
                }
                if plan.animation.looping {
                    ui.label("Animation is marked for looping. SkelForm's current Animation data stores keyframes/FPS but has no separate loop flag; the generated keys are loop-friendly.");
                }
                match plan.analysis.rig_strategy.as_str() {
                    "layer_based_rig" => ui.label("Layer-based mode animates only pre-existing bones bound to matching texture names. Atlas offsets are not assumed to be PSD-canvas coordinates."),
                    "mesh_deformation_rig" => ui.label("Mesh deformation uses SkelForm's alpha-traced vertices and weighted BoneBind data. A single PNG is not split into independent limbs."),
                    _ => ui.label("Transform Rig animates the selected object as one textured bone; extra decorative joints are intentionally avoided.")
                };
                ui.horizontal(|ui| {
                    if ui.button("Apply rig + animation").clicked() { should_apply = true; }
                    if ui.button("Reject").clicked() { should_reject = true; }
                });
            }
        });

    if should_apply {
        match apply_plan(state, armature, selections, undo_states, unsaved) {
            Ok(()) => {}
            Err(error) => state.status = error,
        }
    }
    if should_reject {
        state.plan = None;
        open = false;
    }
    state.open = open;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_plan() -> AiRigPlan {
        serde_json::from_value(json!({
            "schema_version":1,
            "analysis":{"object_type":"humanoid","rig_strategy":"mesh_deformation_rig","confidence":0.9,"reason":"Visible body joints"},
            "bones":[
                {"id":"torso","name":"Torso","parent_id":null,"start":{"x":0.5,"y":0.75},"end":{"x":0.5,"y":0.4},"role":"torso","joint_type":"ball"},
                {"id":"head","name":"Head","parent_id":"torso","start":{"x":0.5,"y":0.4},"end":{"x":0.5,"y":0.2},"role":"head","joint_type":"ball"}
            ],
            "attachments":[],
            "animation":{"name":"Idle","duration_ms":1000,"fps":30,"loop":true,"tracks":[
                {"bone_id":"torso","element":"rotation","keys":[{"frame":0,"value":0.0},{"frame":30,"value":0.0}]}
            ]},
            "warnings":[]
        })).unwrap()
    }

    #[test]
    fn validates_a_small_mesh_rig() {
        assert!(validate_plan(&sample_plan(), false, &[]).is_ok());
    }

    #[test]
    fn rejects_out_of_bounds_coordinates() {
        let mut plan = sample_plan();
        plan.bones[0].start.x = 1.1;
        assert!(validate_plan(&plan, false, &[]).unwrap_err().contains("normalized"));
    }

    #[test]
    fn rejects_parent_cycles() {
        let mut plan = sample_plan();
        plan.bones[0].parent_id = Some("head".into());
        assert!(validate_plan(&plan, false, &[]).unwrap_err().contains("root"));
    }

    #[test]
    fn rejects_fake_skeletons_for_transform_mode() {
        let mut plan = sample_plan();
        plan.analysis.rig_strategy = "transform_rig".into();
        assert!(validate_plan(&plan, false, &[]).unwrap_err().contains("exactly one bone"));
    }
}
