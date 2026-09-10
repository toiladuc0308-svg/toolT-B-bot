export const DEFAULT_MODEL_ID = 'wan_3_0';

export const DEFAULT_PROMPT = `Create a highly accurate Seedance video recreation using the references below.

REFERENCE MAPPING — STRICT LOCK:
@image1 = Face identity, facial features, skin tone, and hairstyle ONLY.
@image2 = Outfit, clothing details, fabric, colors, fit, accessories, and shoes ONLY.
@video1 = Original video structure, female character's actions, gestures, body movement, pose timing, facial expressions, camera movement, camera angle, framing, scene, background, lighting, color tone, pacing, and visual style ONLY.

TASK:
Recreate @video1 as closely and accurately as possible.
Completely replace the original female character in @video1 with a new character who has the exact face and hairstyle from @image1 and the exact outfit from @image2.

CHARACTER IDENTITY RULES:
Preserve the face from @image1 exactly.
Copy the same face shape, eyes, nose, mouth, jawline, cheeks, skin tone, facial proportions, and overall identity.
Copy the hairstyle from @image1 exactly, including length, volume, bangs, parting, texture, and hair shape.
Do not beautify the face.
Do not make the character younger, older, cuter, slimmer, or more stylized.
Do not change gender.
Do not create a new face.
Do not mix the face with @image2 or @video1.

OUTFIT RULES:
Use @image2 as the only source for the outfit.
Copy the clothing exactly: same top, bottom, colors, fabric texture, fit, folds, seams, accessories, and shoes if visible.
Do not take any outfit detail from @image1.
Do not use the original outfit from @video1.
Do not redesign, simplify, or stylize the outfit.
The outfit must stay consistent during the entire video from every angle.

VIDEO RECREATION RULES:
Keep @video1's scene exactly the same.
Keep the background, environment layout, props, lighting, shadows, color grading, camera angle, camera motion, lens perspective, framing, and pacing unchanged.
The new character must perform the exact same actions as the original female character in @video1.
Copy every movement precisely: body posture, walking path, hand gestures, head turns, facial expressions, eye direction, timing, speed, rhythm, and interaction with objects`;

export const DEFAULT_RUN_SETTINGS = {
  durationFromVideo: true,
  randomFashion: false,
  randomVideo: false,
  fashionOnce: false,
  videoOnce: false,
  notifyTelegram: true,
  notifyAttachMedia: false,
  notifyMediaCount: 0,
  sendGroupMedia: true,
  groupMediaCount: 5,
  timeoutSeconds: 3600,
};

export const DEFAULT_SESSION_SETTINGS = {
  concurrency: 2,
  maxVideos: 8,
  columns: 4,
};

export default { DEFAULT_MODEL_ID, DEFAULT_PROMPT, DEFAULT_RUN_SETTINGS, DEFAULT_SESSION_SETTINGS };