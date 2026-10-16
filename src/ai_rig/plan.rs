//! `AiRigPlan`: the typed contract between the multimodal model and the app.
//!
//! The model never touches the `.skf` format. It only fills in this structure, which is
//! validated (`validate.rs`) and converted to real SkelForm data (`apply.rs`) by plain code.
//!
//! Coordinate system of every `Point`:
//! - normalized to the image that was sent to the model (0..1 on both axes)
//! - origin (0, 0) is the TOP-LEFT corner of that image
//! - x grows to the right, y grows DOWNWARDS
//! - (1, 1) is the bottom-right corner

use serde::{Deserialize, Serialize};

pub const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ObjectType {
    GameItem,
    GeometricIcon,
    Plant,
    Humanoid,
    Animal,
    WingedCreature,
    LayeredObject,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RigStrategy {
    /// Whole image (or one part) is moved with bone transforms. No skeleton needed.
    Transform,
    /// Separate parts (layers / bones with their own textures) get a bone hierarchy.
    Layered,
    /// The image cannot be rigged as it is (e.g. a character painted as one texture).
    NeedsSplit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JointKind {
    Root,
    Hinge,
    Ball,
    Fixed,
    Chain,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Analysis {
    pub object_type: ObjectType,
    pub rig_strategy: RigStrategy,
    pub confidence: f32,
    pub reason: String,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Point {
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RotationLimit {
    pub min_deg: f32,
    pub max_deg: f32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PlanBone {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    /// The joint: the point this bone pivots around.
    pub start: Point,
    /// Where the bone points to (the next joint / tip). Informational for the engine.
    pub end: Point,
    pub role: String,
    pub joint: JointKind,
    /// SkelForm has no per-bone angle limits. They are used to clamp generated animation.
    pub rotation_limit: Option<RotationLimit>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Attachment {
    /// A part key that the app listed in the request (e.g. "p12").
    pub part_id: String,
    pub bone_id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Property {
    /// Degrees, relative to the rest pose.
    RotationDeg,
    /// Fraction of the whole object's width, relative to the rest pose. Positive = right.
    OffsetX,
    /// Fraction of the whole object's height, relative to the rest pose. Positive = DOWN.
    OffsetY,
    /// Multiplier of the rest scale (1 = unchanged).
    ScaleX,
    ScaleY,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Easing {
    Linear,
    EaseIn,
    EaseOut,
    EaseInOut,
    Hold,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Key {
    pub time_ms: u32,
    pub value: f32,
    pub easing: Easing,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Track {
    pub bone_id: String,
    pub property: Property,
    pub keyframes: Vec<Key>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PlanAnimation {
    pub name: String,
    pub duration_ms: u32,
    pub fps: u32,
    #[serde(rename = "loop")]
    pub looping: bool,
    pub tracks: Vec<Track>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct AiRigPlan {
    pub schema_version: u32,
    pub analysis: Analysis,
    pub bones: Vec<PlanBone>,
    pub attachments: Vec<Attachment>,
    #[serde(default)]
    pub animation: Option<PlanAnimation>,
    #[serde(default)]
    pub warnings: Vec<String>,
}

/// Pulls the JSON object out of a model reply (models like to wrap it in ``` fences or prose)
/// and parses it strictly. Errors contain the JSON path of the problem.
pub fn parse_plan(reply: &str) -> Result<AiRigPlan, String> {
    let json =
        extract_json_object(reply).ok_or_else(|| "reply contains no JSON object".to_string())?;
    let mut de = serde_json::Deserializer::from_str(json);
    let parsed: Result<AiRigPlan, _> = serde_path_to_error::deserialize(&mut de);
    parsed.map_err(|e| format!("invalid plan at `{}`: {}", e.path(), e.inner()))
}

pub fn extract_json_object(reply: &str) -> Option<&str> {
    let start = reply.find('{')?;
    let end = reply.rfind('}')?;
    if end <= start {
        return None;
    }
    Some(&reply[start..=end])
}

fn point_schema() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["x", "y"],
        "properties": { "x": {"type": "number"}, "y": {"type": "number"} }
    })
}

/// The JSON Schema that is sent to OpenRouter (`response_format`) and described in the prompt.
/// It mirrors the structs above (all fields required, no extra fields).
pub fn json_schema() -> serde_json::Value {
    let object_types = [
        "game_item",
        "geometric_icon",
        "plant",
        "humanoid",
        "animal",
        "winged_creature",
        "layered_object",
        "unknown",
    ];
    serde_json::json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["schema_version", "analysis", "bones", "attachments", "animation", "warnings"],
        "properties": {
            "schema_version": {"type": "integer", "enum": [SCHEMA_VERSION]},
            "analysis": {
                "type": "object",
                "additionalProperties": false,
                "required": ["object_type", "rig_strategy", "confidence", "reason"],
                "properties": {
                    "object_type": {"type": "string", "enum": object_types},
                    "rig_strategy": {"type": "string", "enum": ["transform", "layered", "needs_split"]},
                    "confidence": {"type": "number"},
                    "reason": {"type": "string"}
                }
            },
            "bones": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["id", "name", "parent_id", "start", "end", "role", "joint", "rotation_limit"],
                    "properties": {
                        "id": {"type": "string"},
                        "name": {"type": "string"},
                        "parent_id": {"type": ["string", "null"]},
                        "start": point_schema(),
                        "end": point_schema(),
                        "role": {"type": "string"},
                        "joint": {"type": "string", "enum": ["root", "hinge", "ball", "fixed", "chain"]},
                        "rotation_limit": {
                            "anyOf": [
                                {"type": "null"},
                                {
                                    "type": "object",
                                    "additionalProperties": false,
                                    "required": ["min_deg", "max_deg"],
                                    "properties": {"min_deg": {"type": "number"}, "max_deg": {"type": "number"}}
                                }
                            ]
                        }
                    }
                }
            },
            "attachments": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["part_id", "bone_id"],
                    "properties": {"part_id": {"type": "string"}, "bone_id": {"type": "string"}}
                }
            },
            "animation": {
                "anyOf": [
                    {"type": "null"},
                    {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["name", "duration_ms", "fps", "loop", "tracks"],
                        "properties": {
                            "name": {"type": "string"},
                            "duration_ms": {"type": "integer"},
                            "fps": {"type": "integer"},
                            "loop": {"type": "boolean"},
                            "tracks": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "additionalProperties": false,
                                    "required": ["bone_id", "property", "keyframes"],
                                    "properties": {
                                        "bone_id": {"type": "string"},
                                        "property": {"type": "string", "enum": ["rotation_deg", "offset_x", "offset_y", "scale_x", "scale_y"]},
                                        "keyframes": {
                                            "type": "array",
                                            "items": {
                                                "type": "object",
                                                "additionalProperties": false,
                                                "required": ["time_ms", "value", "easing"],
                                                "properties": {
                                                    "time_ms": {"type": "integer"},
                                                    "value": {"type": "number"},
                                                    "easing": {"type": "string", "enum": ["linear", "ease_in", "ease_out", "ease_in_out", "hold"]}
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                ]
            },
            "warnings": {"type": "array", "items": {"type": "string"}}
        }
    })
}
