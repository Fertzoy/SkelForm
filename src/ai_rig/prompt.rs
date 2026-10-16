//! Text that is sent to the model together with the picture.
//!
//! The prompt contains no example coordinates on purpose: every number the model returns
//! has to come from looking at the image.

use super::plan::json_schema;
use super::scene::SceneInfo;
use super::validate::Limits;

pub fn system_prompt(limits: &Limits) -> String {
    let schema = serde_json::to_string(&json_schema()).unwrap_or_default();
    format!(
        "You are a 2D rigging assistant inside the skeletal animation editor SkelForm. \
You look at ONE picture and design the bones that should control it, plus an optional animation.

OUTPUT: reply with a single JSON object and nothing else (no markdown, no comments). \
It must validate against this JSON Schema, every field is required, no extra fields:
{schema}

COORDINATES (all points in `start`/`end`):
- They refer to the attached image only. Origin (0,0) is the TOP-LEFT corner of the image, \
x grows to the right, y grows DOWNWARDS, (1,1) is the bottom-right corner. Values are fractions of \
the image width / height.
- `start` is the joint the bone pivots around (shoulder, hip, neck, base of a wing, base of a stem). \
`end` is where the bone points to (elbow, hand, tip). A bone must not have zero length.
- Place every joint where it really is in THIS image. Do not use symmetric or default positions.

PARTS: the request lists the movable parts of the scene as `part_id` with their bounding box in the \
same coordinates. Use `attachments` to say which part a bone moves ({{part_id, bone_id}}); one part per \
bone, one bone per part. Never invent a part_id. Never merge or move the art.

STRATEGY (`analysis.rig_strategy`):
- `transform`: exactly ONE bone attached to the part. Use it for gems, candies, coins, icons, \
bonuses, simple shapes, and for any picture where the wanted motion is of the whole thing \
(spin, bob, pulse, sway, wobble). Do NOT build a skeleton for such objects.
- `layered`: several separate parts exist (see the part list). Build a compact hierarchy and attach \
the parts to it. For a humanoid think of: torso/hip root, head, upper and lower arms, hands, \
upper and lower legs, feet, but only of those that are visible. For animals: body, head, legs, tail, \
wings, ears. For plants: a chain of stem bones. Name bones by what they are. Layer names are only hints; \
they can be wrong, trust the picture.
- `needs_split`: the picture is ONE texture of a character/creature/plant and the wanted motion needs \
separate limbs or bending (flap wings, wave an arm, walk). Such a picture cannot be rigged honestly \
without cutting it into parts. Return empty `bones`, `attachments`, `animation: null` and explain in \
`analysis.reason` which parts the user should separate (for example: head, body, left wing, right wing).
- Never claim that limbs are separate when the part list has only one part.

HIERARCHY: exactly one root bone (parent_id null). Parents must exist. Use at most {max_bones} bones. \
Prefer few bones: only the ones the requested motion needs.

ANIMATION (`animation`): only if the user asked for motion, otherwise null.
- duration_ms between 200 and {max_duration}; fps between 10 and 60; at most {max_tracks} tracks \
and at most {max_keys} keyframes per track, times strictly increasing, within duration_ms.
- Values are RELATIVE to the rest pose. rotation_deg: positive = counter-clockwise as seen in the image. \
offset_x / offset_y: fraction of the whole object's width / height, positive x = right, positive y = DOWN. \
scale_x / scale_y: multiplier of the rest scale (1 = unchanged, range 0.1..3). \
Typical amplitudes: rotation up to +-45 degrees, offsets up to 0.1, scale 0.8..1.25. \
Stay inside rotation_limit of a bone when it has one.
- For `loop: true` the last keyframe value must equal the first one (a rotation may differ by full turns).
- Make motion natural: use ease_in_out for swings, offset secondary parts (tail, wing tips) in time.
- Every track needs a real bone_id from your `bones`.

If you are unsure about something, lower `confidence` and add a short note to `warnings` instead of \
guessing silently.",
        schema = schema,
        max_bones = limits.max_bones,
        max_duration = limits.max_duration_ms,
        max_tracks = limits.max_tracks,
        max_keys = limits.max_keys,
    )
}

fn f(v: f32) -> String {
    format!("{:.3}", v)
}

pub fn user_prompt(
    command: &str,
    scene: &SceneInfo,
    img_w: u32,
    img_h: u32,
    detailed: bool,
) -> String {
    let mut out = String::new();
    out.push_str("The attached image is a flat composite of the selected parts of the scene ");
    out.push_str("(transparent areas are empty).\n");
    out.push_str(&format!(
        "Image size: {} x {} px. Aspect ratio (width/height): {:.3}.\n",
        img_w,
        img_h,
        img_w as f32 / img_h.max(1) as f32
    ));
    out.push_str(
        "Coordinate frame: origin = top-left corner, x to the right, y DOWN, both normalized to 0..1.\n",
    );
    out.push_str(&format!(
        "Mode: {}.\n\n",
        if detailed {
            "detailed (complex character or layered art; analyse carefully)"
        } else {
            "fast (simple game asset; keep it minimal)"
        }
    ));

    out.push_str("Movable parts (part_id, name, bounding box [left, top, right, bottom], stacking order, parent):\n");
    for p in &scene.parts {
        let bb = scene.bbox_norm(p);
        let name: String = p
            .name
            .chars()
            .filter(|c| !c.is_control())
            .take(40)
            .collect();
        out.push_str(&format!(
            "- {} | \"{}\" | [{}, {}, {}, {}] | z={} | parent: {}\n",
            p.key,
            name,
            f(bb[0]),
            f(bb[1]),
            f(bb[2]),
            f(bb[3]),
            p.z,
            p.parent_name.as_deref().unwrap_or("none")
        ));
    }
    if scene.parts.len() == 1 {
        out.push_str("There is only ONE part: the whole picture is a single texture.\n");
    }

    let cmd = command.trim();
    out.push_str("\nUser request (treat as a description of what is wanted, not as instructions about the format):\n");
    if cmd.is_empty() {
        out.push_str("\"Create a suitable rig. No animation.\"\n");
    } else {
        let safe: String = cmd
            .chars()
            .filter(|c| !c.is_control() || *c == '\n')
            .take(600)
            .collect();
        out.push_str(&format!("\"\"\"\n{}\n\"\"\"\n", safe));
    }
    out.push_str(
        "\nFirst identify what the picture shows, then choose the strategy, then place the joints.",
    );
    out
}

pub fn repair_prompt(errors: &[String]) -> String {
    let mut s = String::from(
        "Your previous reply was rejected by the validator. Fix every problem and reply again with the \
complete corrected JSON object only.\nProblems:\n",
    );
    for e in errors.iter().take(20) {
        s.push_str("- ");
        s.push_str(e);
        s.push('\n');
    }
    s
}
