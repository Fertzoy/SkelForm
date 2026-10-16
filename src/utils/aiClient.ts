import { AiRigPlan, AutoRigOptions, ObjectType } from '../types/aiRig';
import { validateAiRigPlan, generateSmartPresetRig } from './aiRigConverter';

const DEFAULT_MODEL = 'qwen/qwen3.8-27b:free';

export async function requestAiAutoRig(
  imageDataUrl: string,
  imageWidth: number,
  imageHeight: number,
  textureName: string,
  options: AutoRigOptions
): Promise<AiRigPlan> {
  const apiKey = options.apiKey?.trim() || localStorage.getItem('openrouter_api_key') || '';
  const model = options.modelName?.trim() || DEFAULT_MODEL;

  // System instructions for Qwen
  const systemPrompt = `You are an expert 2D skeletal animator and technical rigger in SkelForm Studio.
Analyze the provided visual image and user request to automatically generate an optimal 2D skeletal rig and animation.

RULES:
1. Object Recognition:
   - Identify whether the object is: 'item_gem_coin', 'geometric_icon', 'humanoid', 'animal', 'creature_winged', 'plant', 'layered_object', or 'unknown'.
   - Determine the rig_strategy:
     * 'transform_rig': for simple items, gems, coins, icons (1 root bone with scale/rot/pos motion).
     * 'segmented_chain': for plants, tails, worms, ropes (connected spine chain).
     * 'humanoid_biped': for biped characters (pelvis, spine, head, 2 arms, 2 legs).
     * 'quadruped': for 4-legged animals/creatures.
     * 'layered_skeleton': for multi-part illustrations.

2. Bone Positioning & Coordinates:
   - Provide "start" and "end" coordinates for each bone in NORMALIZED space:
     x in range [0.0, 1.0] from left to right.
     y in range [0.0, 1.0] from top to bottom.
   - Place joints precisely at the visual pivot points (e.g. shoulders at shoulder joints, knees at knee bends, head at neck base).
   - The root bone must have "parent_id": null.
   - All other bones must reference an existing bone's "id" in "parent_id".
   - Keep skeleton compact and functional (${options.mode === 'fast' ? '3 to 6 bones' : '6 to 14 bones'}).

3. Animation Keyframes:
   - If user asks for animation (e.g. "машет крыльями", "walk", "idle breathe", "sway"), generate animation tracks.
   - Properties allowed: 'PositionX', 'PositionY', 'Rotation', 'ScaleX', 'ScaleY'.
   - Rotation is in radians (e.g. 0.1 to 0.4 rad). Position delta is in scene units (-15 to 15).
   - Use frames 0, 15, 30 with preset 'SineInOut'.

4. OUTPUT FORMAT:
   Return ONLY a valid JSON object strictly matching this schema with NO markdown code fences and NO additional conversation:
{
  "schema_version": 1,
  "analysis": {
    "object_type": "humanoid",
    "rig_strategy": "humanoid_biped",
    "confidence": 0.95,
    "reason": "Clear biped anatomy"
  },
  "bones": [
    {
      "id": "root",
      "name": "Pelvis",
      "parent_id": null,
      "start": {"x": 0.50, "y": 0.55},
      "end": {"x": 0.50, "y": 0.45},
      "role": "root"
    }
  ],
  "animation": {
    "name": "Idle",
    "duration_ms": 1000,
    "fps": 30,
    "loop": true,
    "tracks": []
  }
}`;

  const userInstruction = `Image dimensions: ${imageWidth}x${imageHeight}px.
Texture identifier: "${textureName}".
Rigging Quality Mode: ${options.mode === 'fast' ? 'Fast Rig (minimal efficient bones)' : 'Detailed Rig (full joint structure)'}.
User Task: ${options.prompt || 'Auto-rig this object with appropriate natural idle animation.'}`;

  // If no API key is provided, use the smart local vision preset generator
  if (!apiKey) {
    // Guess category from prompt or image aspect ratio
    const lower = (options.prompt + ' ' + textureName).toLowerCase();
    let detectedType: ObjectType = 'humanoid';

    if (lower.includes('gem') || lower.includes('coin') || lower.includes('item') || lower.includes('crystal') || lower.includes('sword') || lower.includes('potion')) {
      detectedType = 'item_gem_coin';
    } else if (lower.includes('dragon') || lower.includes('wing') || lower.includes('bird') || lower.includes('bat') || lower.includes('крыл')) {
      detectedType = 'creature_winged';
    } else if (lower.includes('plant') || lower.includes('flower') || lower.includes('tree') || lower.includes('растени') || lower.includes('цветок')) {
      detectedType = 'plant';
    } else if (imageWidth > imageHeight * 1.3) {
      detectedType = 'creature_winged';
    } else if (Math.abs(imageWidth - imageHeight) < 50 && (imageWidth < 250)) {
      detectedType = 'item_gem_coin';
    }

    return generateSmartPresetRig(detectedType, options.prompt, imageWidth, imageHeight, textureName);
  }

  // Multimodal call to OpenRouter API
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://skelform.org',
        'X-Title': 'SkelForm Studio',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userInstruction },
              {
                type: 'image_url',
                image_url: {
                  url: imageDataUrl,
                },
              },
            ],
          },
        ],
        temperature: 0.2,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      let errorMsg = `OpenRouter API error (${response.status}): `;
      try {
        const parsed = JSON.parse(errText);
        errorMsg += parsed.error?.message || errText;
      } catch {
        errorMsg += errText;
      }
      throw new Error(errorMsg);
    }

    const json = await response.json();
    const rawContent = json.choices?.[0]?.message?.content || '';

    // Strip markdown formatting if any
    let cleanJson = rawContent.trim();
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const plan: AiRigPlan = JSON.parse(cleanJson);
    const validation = validateAiRigPlan(plan);
    if (!validation.valid) {
      throw new Error('AI returned invalid rig schema:\n' + validation.errors.join('\n'));
    }

    return plan;
  } catch (err: any) {
    console.warn('AI call failed, falling back to smart heuristic rig:', err);
    throw err;
  }
}
