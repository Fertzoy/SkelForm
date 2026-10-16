//! Reads the real scene (bones + textures) and prepares what the model gets to see:
//! the coordinate frame, the part list and a composite picture of the selected parts.
//!
//! World coordinates are the ones SkelForm uses for bone positions: Y grows UP.
//! Plan coordinates are image coordinates: origin top-left, Y grows DOWN.
//! `SceneInfo::to_world` is the single place where the two are converted.

use std::collections::HashMap;

use crate::shared::*;

use super::plan::Point;

const EPS: f32 = 1e-4;

#[derive(Debug, Clone)]
pub struct PartInfo {
    /// Key the model uses to refer to this part, e.g. "p12".
    pub key: String,
    pub bone_id: i32,
    pub name: String,
    /// Center of the texture in world space (rest pose).
    pub center: Vec2,
    /// Texture size in world units (= pixels).
    pub size: Vec2,
    pub z: i32,
    pub parent_name: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SceneInfo {
    pub parts: Vec<PartInfo>,
    /// World-space rectangle that covers every part (min.y < max.y, Y up).
    pub min: Vec2,
    pub max: Vec2,
}

impl SceneInfo {
    pub fn width(&self) -> f32 {
        self.max.x - self.min.x
    }

    pub fn height(&self) -> f32 {
        self.max.y - self.min.y
    }

    pub fn part_keys(&self) -> Vec<String> {
        self.parts.iter().map(|p| p.key.clone()).collect()
    }

    /// Plan (image) coordinates -> SkelForm world coordinates.
    pub fn to_world(&self, p: &Point) -> Vec2 {
        Vec2::new(
            self.min.x + p.x * self.width(),
            self.max.y - p.y * self.height(),
        )
    }

    /// SkelForm world coordinates -> plan (image) coordinates.
    pub fn to_plan(&self, w: Vec2) -> Point {
        Point {
            x: (w.x - self.min.x) / self.width(),
            y: (self.max.y - w.y) / self.height(),
        }
    }

    /// True if `other` describes the same parts at the same places.
    pub fn same_as(&self, other: &SceneInfo) -> bool {
        if self.parts.len() != other.parts.len() {
            return false;
        }
        self.parts.iter().all(|a| {
            other.parts.iter().any(|b| {
                a.key == b.key
                    && (a.center.x - b.center.x).abs() < 0.5
                    && (a.center.y - b.center.y).abs() < 0.5
                    && (a.size.x - b.size.x).abs() < 0.5
                    && (a.size.y - b.size.y).abs() < 0.5
            })
        })
    }

    /// Part bounds in plan coordinates: [left, top, right, bottom].
    pub fn bbox_norm(&self, part: &PartInfo) -> [f32; 4] {
        let (w, h) = (self.width(), self.height());
        [
            (part.center.x - part.size.x / 2. - self.min.x) / w,
            (self.max.y - (part.center.y + part.size.y / 2.)) / h,
            (part.center.x + part.size.x / 2. - self.min.x) / w,
            (self.max.y - (part.center.y - part.size.y / 2.)) / h,
        ]
    }
}

/// World position of every bone, assuming the neutral pose (rotation 0, scale 1).
/// Fails if the armature is posed or uses IK, since Auto-Rig must not change how it looks.
pub fn world_positions(bones: &[Bone]) -> Result<HashMap<i32, Vec2>, String> {
    for b in bones {
        let posed = b.rot.abs() > EPS
            || (b.scale.x - 1.).abs() > EPS
            || (b.scale.y - 1.).abs() > EPS
            || b.pivot_rot.abs() > EPS;
        if posed {
            return Err(format!(
                "Bone \"{}\" is rotated or scaled. Auto-Rig needs the rest pose: reset it first.",
                b.name
            ));
        }
        // (0, 0) is the unset default; anything else but (1, 1) rescales the picture
        let ps = b.pivot_scale;
        let unit = (ps.x - 1.).abs() < EPS && (ps.y - 1.).abs() < EPS;
        let unset = ps.x.abs() < EPS && ps.y.abs() < EPS;
        if !b.tex.is_empty() && !unit && !unset {
            return Err(format!(
                "Bone \"{}\" has a pivot scale. Auto-Rig needs the rest pose: reset it first.",
                b.name
            ));
        }
        if b.ik_family_id != -1 || b.ik_target_id != -1 {
            return Err(format!(
                "Bone \"{}\" uses inverse kinematics. Auto-Rig does not modify IK rigs.",
                b.name
            ));
        }
    }

    let by_id: HashMap<i32, &Bone> = bones.iter().map(|b| (b.id, b)).collect();
    let mut out = HashMap::new();
    for b in bones {
        let mut x = 0.;
        let mut y = 0.;
        let mut cur = b;
        let mut steps = 0;
        loop {
            x += cur.pos.x;
            y += cur.pos.y;
            if cur.parent_id == -1 {
                break;
            }
            steps += 1;
            if steps > bones.len() {
                return Err(format!("Bone \"{}\" is part of a parent cycle.", b.name));
            }
            match by_id.get(&cur.parent_id) {
                Some(p) => cur = *p,
                None => {
                    return Err(format!(
                        "Bone \"{}\" has a missing parent (id {}).",
                        cur.name, cur.parent_id
                    ))
                }
            }
        }
        out.insert(b.id, Vec2::new(x, y));
    }
    Ok(out)
}

pub fn is_textured(armature: &Armature, bone: &Bone) -> bool {
    !bone.tex.is_empty() && armature.tex_of(bone.id).is_some()
}

/// `selected`: the selected bone. `all`: use every visible textured bone,
/// otherwise only the selected one.
pub fn analyze_scene(
    armature: &Armature,
    selected: Option<i32>,
    all: bool,
) -> Result<SceneInfo, String> {
    let world = world_positions(&armature.bones)?;

    let candidates: Vec<&Bone> = armature
        .bones
        .iter()
        .filter(|b| !b.hidden && is_textured(armature, b))
        .filter(|b| all || Some(b.id) == selected)
        .collect();

    if candidates.is_empty() {
        return Err(if all {
            "No bone with a texture was found. Drop an image or PSD onto the scene first."
                .to_string()
        } else {
            "Select a bone that has a texture, or switch the scope to All parts.".to_string()
        });
    }

    let mut parts = vec![];
    let mut min = Vec2::new(f32::MAX, f32::MAX);
    let mut max = Vec2::new(f32::MIN, f32::MIN);
    for b in candidates {
        let tex = armature.tex_of(b.id).unwrap();
        if tex.size.x < 1. || tex.size.y < 1. {
            return Err(format!("Texture of bone \"{}\" has no size.", b.name));
        }
        let w = world[&b.id];
        // at rest the texture center sits at `pos + pivot * size`
        let center = Vec2::new(
            w.x + b.pivot_pos.x * tex.size.x,
            w.y + b.pivot_pos.y * tex.size.y,
        );
        min.x = min.x.min(center.x - tex.size.x / 2.);
        min.y = min.y.min(center.y - tex.size.y / 2.);
        max.x = max.x.max(center.x + tex.size.x / 2.);
        max.y = max.y.max(center.y + tex.size.y / 2.);

        let parent_name = armature
            .bones
            .iter()
            .find(|p| p.id == b.parent_id)
            .map(|p| p.name.clone());
        parts.push(PartInfo {
            key: format!("p{}", b.id),
            bone_id: b.id,
            name: b.name.clone(),
            center,
            size: tex.size,
            z: b.zindex,
            parent_name,
        });
    }

    if !(max.x - min.x > 0.) || !(max.y - min.y > 0.) {
        return Err("The selected parts have no visible area.".to_string());
    }
    Ok(SceneInfo { parts, min, max })
}

/// Composite of all parts (z-ordered), scaled to fit `max_side`. Transparency is kept.
/// Returns the RGBA canvas; the aspect ratio of the scene is preserved.
pub fn render_scene(
    armature: &Armature,
    scene: &SceneInfo,
    max_side: u32,
) -> Result<image::RgbaImage, String> {
    let longest = scene.width().max(scene.height());
    // small icons are enlarged (up to 4x) so the model has something to look at
    let scale = (max_side as f32 / longest).min(4.);
    let cw = ((scene.width() * scale).round() as u32).max(1);
    let ch = ((scene.height() * scale).round() as u32).max(1);
    let mut canvas = image::RgbaImage::new(cw, ch);

    let mut order: Vec<&PartInfo> = scene.parts.iter().collect();
    order.sort_by_key(|p| p.z);

    for part in order {
        let bone = armature
            .bones
            .iter()
            .find(|b| b.id == part.bone_id)
            .ok_or_else(|| "A part disappeared while preparing the image.".to_string())?;
        let tex = armature
            .tex_of(bone.id)
            .ok_or_else(|| format!("Part \"{}\" lost its texture.", part.name))?;
        let data = armature
            .tex_data(tex)
            .ok_or_else(|| format!("Texture data of \"{}\" is missing.", part.name))?;

        let pw = ((part.size.x * scale).round() as u32).max(1);
        let ph = ((part.size.y * scale).round() as u32).max(1);
        let rgba = data.image.to_rgba8();
        let resized = if rgba.width() == pw && rgba.height() == ph {
            rgba
        } else {
            image::imageops::resize(&rgba, pw, ph, image::imageops::FilterType::Triangle)
        };

        let x = ((part.center.x - part.size.x / 2. - scene.min.x) * scale).round() as i64;
        let y = ((scene.max.y - (part.center.y + part.size.y / 2.)) * scale).round() as i64;
        image::imageops::overlay(&mut canvas, &resized, x, y);
    }
    Ok(canvas)
}

pub fn encode_png(img: &image::RgbaImage) -> Result<Vec<u8>, String> {
    let mut buf: Vec<u8> = vec![];
    image::DynamicImage::ImageRgba8(img.clone())
        .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
        .map_err(|e| format!("PNG encoding failed: {}", e))?;
    Ok(buf)
}

pub fn base64(bytes: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b = [
            chunk[0],
            *chunk.get(1).unwrap_or(&0),
            *chunk.get(2).unwrap_or(&0),
        ];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 {
            T[(n >> 6) as usize & 63] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            T[n as usize & 63] as char
        } else {
            '='
        });
    }
    out
}

/// A dropped picture is only a texture of a style; no bone uses it yet. Finds the one texture
/// that Auto-Rig should wrap in a bone: the selected texture, or the only one without a bone.
pub fn find_unassigned_texture(
    armature: &Armature,
    selections: &SelectionState,
) -> Result<String, String> {
    let style = armature
        .sel_style(selections)
        .filter(|s| s.active)
        .or_else(|| armature.styles.iter().find(|s| s.active))
        .ok_or_else(|| "There is no active style with textures.".to_string())?;

    if selections.tex_ids.len() == 1 {
        if let Some(t) = style.textures.get(selections.tex_ids[0] as usize) {
            if !t.name.is_empty() {
                return Ok(t.name.clone());
            }
        }
    }

    let used: std::collections::HashSet<&str> =
        armature.bones.iter().map(|b| b.tex.as_str()).collect();
    let free: Vec<&Texture> = style
        .textures
        .iter()
        .filter(|t| !t.name.is_empty() && !used.contains(t.name.as_str()))
        .collect();
    match free.len() {
        1 => Ok(free[0].name.clone()),
        0 => Err("There is no texture without a bone. Drop an image or PSD onto the scene.".into()),
        _ => Err(
            "Several textures have no bone yet. Select one texture in the Styles window \
(or create a bone for it), then run Auto-Rig."
                .into(),
        ),
    }
}

/// Copy of `armature` with one new bone (at the origin) that shows texture `tex_name`.
/// Deterministic, so it can be repeated when the result is applied.
pub fn bone_from_texture(armature: &Armature, tex_name: &str) -> Result<Armature, String> {
    let mut arm = armature.clone();
    let (_, idx) = arm.new_bone(-1);
    let id = arm.bones[idx].id;
    arm.bones[idx].name = tex_name.to_string();
    arm.set_bone_tex(id, tex_name.to_string(), usize::MAX, -1);
    if arm.tex_of(id).is_none() {
        return Err(format!("Texture \"{}\" is not available.", tex_name));
    }
    let b = &mut arm.bones[idx];
    b.init_pos = b.pos;
    b.init_rot = b.rot;
    b.init_scale = b.scale;
    Ok(arm)
}
