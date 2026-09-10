/**
 * Engine cho Telegram Bot (chạy trên Node.js độc lập).
 * Kết nối trực tiếp API 79AI / Gommo không cần qua browser hay iframe.
 */

import { buildCreateVideoBody } from './modelCatalog.js';
import { parseMediaCreateResponse, normalizeMediaCreateResponse, unwrapGenerationInfo, getPayloadStatus, resolveMediaUrl, isFailedMediaStatus, resolveFailureMessage } from './mediaJobs.js';

const GOMMO_API_BASE = 'https://api.gommo.net/api/apps/go-mmo';
const CATBOX_API = 'https://catbox.moe/user/api.php';
const LITTERBOX_API = 'https://litterbox.catbox.moe/resources/internals/api.php';
const DEFAULT_DOMAIN = '79ai.net';

/**
 * Gọi API 79AI / Gommo trong môi trường Node.js.
 */
export async function call79AI(endpoint, { method = 'POST', params = {}, body = {}, token, domain } = {}) {
  const accessToken = token || process.env.GOMMO_TOKEN || '';
  const apiDomain = domain || process.env.GOMMO_DOMAIN || DEFAULT_DOMAIN;
  const url = `${GOMMO_API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const formData = new URLSearchParams();
  if (accessToken) formData.append('access_token', accessToken);
  formData.append('domain', apiDomain);

  const combined = { ...params, ...body };
  for (const [k, v] of Object.entries(combined)) {
    if (v !== undefined && v !== null) {
      if (typeof v === 'object') {
        formData.append(k, JSON.stringify(v));
      } else {
        formData.append(k, String(v));
      }
    }
  }

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    },
    body: formData.toString(),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`79AI API Error ${res.status}: ${txt}`);
  }

  return await res.json();
}

/**
 * Tải file từ Telegram Server và upload lên Catbox / Litterbox để lấy link trực tiếp HTTPS.
 */
export async function uploadTelegramFile(fileUrl, filename = 'media.mp4') {
  console.info(`[BotEngine] Đang kéo file từ Telegram: ${filename}...`);
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`Không tải được file từ Telegram (${response.status})`);
  const blob = await response.blob();

  // 1. Thử Catbox
  try {
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', blob, filename);
    const res = await fetch(CATBOX_API, { method: 'POST', body: form });
    const directUrl = (await res.text()).trim();
    if (directUrl && directUrl.startsWith('http')) {
      console.info(`[BotEngine] Upload Catbox thành công: ${directUrl}`);
      return directUrl;
    }
  } catch (e) {
    console.warn('[BotEngine] Catbox lỗi, thử Litterbox:', e?.message);
  }

  // 2. Thử Litterbox (giữ 72h)
  try {
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('time', '72h');
    form.append('fileToUpload', blob, filename);
    const res = await fetch(LITTERBOX_API, { method: 'POST', body: form });
    const directUrl = (await res.text()).trim();
    if (directUrl && directUrl.startsWith('http')) {
      console.info(`[BotEngine] Upload Litterbox thành công: ${directUrl}`);
      return directUrl;
    }
  } catch (e) {
    console.warn('[BotEngine] Litterbox lỗi:', e?.message);
  }

  throw new Error('Không thể tạo link trực tiếp từ file Telegram');
}

/**
 * Polling kiểm tra trạng thái video job trên 79AI
 */
export async function pollVideoJob(jobId, { timeoutSeconds = 900, onProgress, isCancelled } = {}) {
  const maxWaitMs = Math.max(60, Number(timeoutSeconds) || 900) * 1000;
  const deadline = Date.now() + maxWaitMs;
  let attempt = 0;

  while (Date.now() < deadline) {
    if (isCancelled?.()) throw new Error('Task đã bị hủy');
    attempt += 1;
    await new Promise((r) => setTimeout(r, attempt > 1 ? 15000 : 3000));

    const raw = await call79AI('/ai/video', {
      method: 'POST',
      body: { id_base: jobId, id: jobId, videoId: jobId },
    });

    const payload = normalizeMediaCreateResponse(raw);
    onProgress?.(payload);

    const info = unwrapGenerationInfo(payload, 'video');
    const status = getPayloadStatus(payload) || getPayloadStatus(info);
    const url = resolveMediaUrl(payload, info, 'video');

    if (payload.is_failed || isFailedMediaStatus(status)) {
      throw new Error(resolveFailureMessage(info, resolveFailureMessage(payload, 'Render video thất bại')));
    }

    if (url && (payload.is_ready || status === 'SUCCESS' || status === 'done')) {
      return { url, status: 'SUCCESS' };
    }
  }

  throw new Error(`Timeout: Quá ${timeoutSeconds}s server chưa trả kết quả`);
}

import { DEFAULT_MODEL_ID, DEFAULT_PROMPT } from '../data/config.js';

/**
 * Tạo 1 video đơn lẻ qua 79AI
 */
export async function executeVideoScene({
  characterUrl,
  fashionUrl,
  videoUrl,
  modelId = DEFAULT_MODEL_ID,
  settings = {},
  prompt = DEFAULT_PROMPT,
  timeoutSeconds = 900,
  onUpdate,
}) {
  onUpdate?.({ status: 'creating', message: 'Đang gửi yêu cầu lên 79AI...' });

  const model = { id_base: modelId };
  const effectiveSettings = {
    ratio: settings.ratio || '9:16',
    duration: settings.duration || '5',
    resolution: settings.resolution || '720p',
    ...settings,
  };

  const body = buildCreateVideoBody(model, effectiveSettings, {
    prompt: prompt || 'Recreate the video with new character and outfit perfectly',
    referenceUrls: [characterUrl, fashionUrl].filter(Boolean),
    videoUrls: [videoUrl].filter(Boolean),
    project_id: process.env.DEFAULT_PROJECT_ID || 'default',
  });

  const projectId = process.env.DEFAULT_PROJECT_ID || 'default';
  if (projectId) body.project_id = projectId;

  const created = await call79AI('/ai/create-video', { method: 'POST', body });
  const { jobId, raw } = parseMediaCreateResponse(created, 'video');

  onUpdate?.({ status: 'running', jobId, message: raw?.message || 'Đã tiếp nhận -> Đang render...' });

  const result = await pollVideoJob(jobId, {
    timeoutSeconds,
    onProgress: (p) => {
      const pct = Number(p?.videoInfo?.percent ?? p?.percent ?? 0);
      onUpdate?.({ status: 'running', percent: pct, message: `Đang render (${pct}%)` });
    },
  });

  return result;
}
