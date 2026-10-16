//! OpenRouter client (native builds only: it blocks, so it runs on a worker thread).
//!
//! Guarantees:
//! - the requested model id is sent as is. There is NO `models` array, NO `route`, so
//!   OpenRouter cannot swap a `:free` model for a paid one. The reply's model is checked too.
//! - the model is checked for image input BEFORE any picture is uploaded. If it cannot see
//!   images (or has no live provider) the user gets an error, never a made-up analysis.
//! - a `:free` model must really be priced at zero.

use std::time::Duration;

use serde_json::{json, Value};

const BASE: &str = "https://openrouter.ai/api/v1";

#[derive(Debug, Clone, Default)]
pub struct Capabilities {
    pub image_input: bool,
    pub structured_outputs: bool,
    pub json_mode: bool,
    pub free: bool,
    pub providers: usize,
}

#[derive(Debug, Clone, Default)]
pub struct Reply {
    pub content: String,
    pub model: String,
    pub provider: String,
}

fn agent() -> ureq::Agent {
    let config = ureq::Agent::config_builder()
        .http_status_as_error(false)
        .timeout_global(Some(Duration::from_secs(180)))
        .build();
    ureq::Agent::new_with_config(config)
}

/// `qwen/qwen3.8-27b:free` -> `qwen/qwen3.8-27b`
pub fn base_slug(id: &str) -> &str {
    id.split(':').next().unwrap_or(id)
}

pub fn is_free_id(id: &str) -> bool {
    id.ends_with(":free")
}

fn error_message(status: u16, body: &str) -> String {
    let api_msg = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|v| {
            v.get("error")
                .and_then(|e| e.get("message"))
                .and_then(|m| m.as_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_default();
    let detail = if api_msg.is_empty() {
        body.chars().take(200).collect::<String>()
    } else {
        api_msg
    };
    match status {
        401 => {
            "OpenRouter rejected the API key (401). Check the key in the Auto-Rig window.".into()
        }
        402 => format!(
            "OpenRouter needs credits for this request (402): {}",
            detail
        ),
        403 => format!("The request was refused (403): {}", detail),
        404 => format!(
            "OpenRouter has no available provider for this model right now (404): {}",
            detail
        ),
        408 | 504 => "The model took too long to answer. Try again later.".into(),
        429 => format!(
            "Rate limit reached (429). Free models are limited per minute and per day: {}",
            detail
        ),
        s if s >= 500 => format!("OpenRouter or the provider failed ({}): {}", s, detail),
        s => format!("OpenRouter error {}: {}", s, detail),
    }
}

fn get_json(agent: &ureq::Agent, key: &str, url: &str) -> Result<Value, String> {
    let mut resp = agent
        .get(url)
        .header("Authorization", &format!("Bearer {}", key))
        .call()
        .map_err(|e| format!("Network error: {}", e))?;
    let status = resp.status().as_u16();
    let body = resp
        .body_mut()
        .read_to_string()
        .map_err(|e| format!("Could not read the response: {}", e))?;
    if status >= 400 {
        return Err(error_message(status, &body));
    }
    serde_json::from_str(&body).map_err(|e| format!("OpenRouter sent invalid JSON: {}", e))
}

/// Asks OpenRouter what the model can do. Does not upload anything.
pub fn preflight(key: &str, model: &str) -> Result<Capabilities, String> {
    if model.trim().is_empty() || model.contains(char::is_whitespace) {
        return Err("The model id is empty or invalid.".to_string());
    }
    let agent = agent();
    let url = format!("{}/models/{}/endpoints", BASE, model.trim());
    let v = get_json(&agent, key, &url)?;
    let data = v
        .get("data")
        .ok_or_else(|| "Unexpected answer from /models/.../endpoints.".to_string())?;

    let image_input = data
        .pointer("/architecture/input_modalities")
        .and_then(|m| m.as_array())
        .map(|a| a.iter().any(|x| x.as_str() == Some("image")))
        .unwrap_or(false);

    let endpoints = data
        .get("endpoints")
        .and_then(|e| e.as_array())
        .cloned()
        .unwrap_or_default();

    let supports = |ep: &Value, name: &str| -> bool {
        ep.get("supported_parameters")
            .and_then(|p| p.as_array())
            .map(|a| a.iter().any(|x| x.as_str() == Some(name)))
            .unwrap_or(false)
    };
    let zero = |ep: &Value, field: &str| -> bool {
        ep.pointer(&format!("/pricing/{}", field))
            .and_then(|p| p.as_str().map(|s| s.to_string()))
            .and_then(|s| s.parse::<f64>().ok())
            .map(|n| n == 0.)
            .unwrap_or(false)
    };

    let mut caps = Capabilities {
        image_input,
        providers: endpoints.len(),
        ..Default::default()
    };
    caps.structured_outputs = endpoints.iter().any(|e| supports(e, "structured_outputs"));
    caps.json_mode = endpoints.iter().any(|e| supports(e, "response_format"));
    caps.free = !endpoints.is_empty()
        && endpoints
            .iter()
            .all(|e| zero(e, "prompt") && zero(e, "completion"));

    if endpoints.is_empty() {
        return Err(format!(
            "`{}` has no live providers on OpenRouter right now, so it cannot answer. \
Free models are sometimes withdrawn. Pick another model id in the Auto-Rig window, \
or use the local presets, which need no model.",
            model
        ));
    }
    if !caps.image_input {
        return Err(format!(
            "`{}` does not accept images, so it cannot look at your picture. \
Pick a vision model. No analysis was made.",
            model
        ));
    }
    if is_free_id(model) && !caps.free {
        return Err(format!(
            "`{}` is no longer free. Auto-Rig will not silently use a paid model; \
choose a model explicitly if you want to pay.",
            model
        ));
    }
    Ok(caps)
}

/// Builds the chat request. `messages` is the full conversation (system + user (+ repair)).
pub fn request_body(
    model: &str,
    messages: &[Value],
    caps: &Capabilities,
    schema: &Value,
    max_tokens: u32,
) -> Value {
    let mut body = json!({
        "model": model.trim(),
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": max_tokens,
    });
    if caps.structured_outputs {
        body["response_format"] = json!({
            "type": "json_schema",
            "json_schema": { "name": "ai_rig_plan", "strict": true, "schema": schema }
        });
        // only providers that really honour response_format may serve the request
        body["provider"] = json!({ "require_parameters": true });
    } else if caps.json_mode {
        body["response_format"] = json!({ "type": "json_object" });
        body["provider"] = json!({ "require_parameters": true });
    }
    body
}

pub fn user_message(text: &str, png: &[u8]) -> Value {
    let url = format!("data:image/png;base64,{}", super::scene::base64(png));
    json!({
        "role": "user",
        "content": [
            { "type": "text", "text": text },
            { "type": "image_url", "image_url": { "url": url } }
        ]
    })
}

pub fn chat(key: &str, requested_model: &str, body: &Value) -> Result<Reply, String> {
    let agent = agent();
    let payload = serde_json::to_string(body).map_err(|e| e.to_string())?;
    let mut resp = agent
        .post(&format!("{}/chat/completions", BASE))
        .header("Authorization", &format!("Bearer {}", key))
        .header("Content-Type", "application/json")
        .header("X-Title", "SkelForm Studio")
        .send(payload.as_bytes())
        .map_err(|e| format!("Network error: {}", e))?;
    let status = resp.status().as_u16();
    let text = resp
        .body_mut()
        .read_to_string()
        .map_err(|e| format!("Could not read the response: {}", e))?;
    if status >= 400 {
        return Err(error_message(status, &text));
    }
    let v: Value =
        serde_json::from_str(&text).map_err(|e| format!("OpenRouter sent invalid JSON: {}", e))?;

    // errors can also arrive with HTTP 200
    if let Some(err) = v.get("error") {
        let msg = err
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("unknown error");
        let code = err.get("code").and_then(|c| c.as_u64()).unwrap_or(500) as u16;
        return Err(error_message(
            code,
            &json!({"error": {"message": msg}}).to_string(),
        ));
    }

    let model = v
        .get("model")
        .and_then(|m| m.as_str())
        .unwrap_or("")
        .to_string();
    if !model.is_empty() && base_slug(&model) != base_slug(requested_model) {
        return Err(format!(
            "OpenRouter answered with `{}` instead of `{}`. The reply was discarded \
because Auto-Rig never switches models behind your back.",
            model, requested_model
        ));
    }

    let choice = v
        .pointer("/choices/0")
        .ok_or_else(|| "The model returned no choices.".to_string())?;
    let finish = choice
        .get("finish_reason")
        .and_then(|f| f.as_str())
        .unwrap_or("");
    let content = choice
        .pointer("/message/content")
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .to_string();
    if content.trim().is_empty() {
        return Err(if finish == "length" {
            "The model ran out of tokens before answering (it may have spent them on reasoning). \
Try Detailed mode or a shorter request."
                .to_string()
        } else {
            "The model returned an empty answer.".to_string()
        });
    }
    if finish == "length" {
        return Err(
            "The model's answer was cut off (token limit). Try Detailed mode or a shorter request."
                .to_string(),
        );
    }

    Ok(Reply {
        content,
        model,
        provider: v
            .get("provider")
            .and_then(|p| p.as_str())
            .unwrap_or("")
            .to_string(),
    })
}
