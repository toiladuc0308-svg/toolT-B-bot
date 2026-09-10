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

  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
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
    } catch (e) {
      lastErr = e;
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  }
  throw lastErr;
}

import axios from 'axios';

/**
 * Tải file từ Telegram Server và upload lên Catbox / Litterbox để lấy link trực tiếp HTTPS.
 */
export async function uploadTelegramFile(fileUrl, filename = 'media.mp4') {
  console.info(`[BotEngine] Đang kéo file từ Telegram: ${filename}...`);
  let blob;
  try {
    const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    blob = new Blob([response.data]);
  } catch (err) {
    throw new Error(`Không tải được file từ Telegram (${err.message})`);
  }


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
export async function pollVideoJob(jobId, { timeoutSeconds = 900, projectId = 'default', onProgress, isCancelled } = {}) {
  const maxWaitMs = Math.max(60, Number(timeoutSeconds) || 900) * 1000;
  const deadline = Date.now() + maxWaitMs;
  let attempt = 0;

  while (Date.now() < deadline) {
    if (isCancelled?.()) throw new Error('Task đã bị hủy');
    attempt += 1;
    await new Promise((r) => setTimeout(r, attempt > 1 ? 15000 : 3000));

    const raw = await call79AI('/ai/video', {
      method: 'POST',
      body: {
        id_base: jobId,
        id: jobId,
        videoId: jobId,
        project_id: projectId || 'default',
      },
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
import { pickDurationForSeconds } from './duration.js';

// Cache model options từ 79AI
let cachedModelOptions = new Map();

export async function getModelDurationOptions(modelId = 'wan_3_0') {
  if (cachedModelOptions.has(modelId)) return cachedModelOptions.get(modelId);
  try {
    const res = await call79AI('/ai/models', { method: 'POST', body: { category: 'video' } });
    const list = Array.isArray(res?.data) ? res.data : [];
    const model = list.find((x) => x.model === modelId || x.id_base === modelId);
    const durations = (model?.durations || [])
      .map((d) => {
        const raw = String(d.type || d.name || '').replace(/s$/, '');
        return { type: raw, seconds: Number(raw) || 0 };
      })
      .filter((d) => d.seconds > 0)
      .sort((a, b) => a.seconds - b.seconds);

    if (durations.length > 0) {
      cachedModelOptions.set(modelId, durations);
      return durations;
    }
  } catch (e) {
    console.warn('[botEngine] Không load được model durations từ API, dùng fallback:', e?.message);
  }
  // Fallback cho wan_3_0: 4s -> 30s
  const fallback = Array.from({ length: 27 }, (_, i) => ({ type: String(i + 4), seconds: i + 4 }));
  cachedModelOptions.set(modelId, fallback);
  return fallback;
}

/**
 * Tạo 1 video đơn lẻ qua 79AI
 */
export async function executeVideoScene({
  characterUrl,
  fashionUrl,
  videoUrl,
  refSeconds = 0,
  modelId = DEFAULT_MODEL_ID,
  settings = {},
  prompt = DEFAULT_PROMPT,
  timeoutSeconds = 900,
  projectId = process.env.DEFAULT_PROJECT_ID || 'default',
  onUpdate,
}) {
  onUpdate?.({ status: 'creating', message: 'Đang gửi yêu cầu lên 79AI...' });

  const model = { id_base: modelId };

  // Áp dụng logic làm tròn Math.ceil theo thời lượng video tham chiếu
  let appliedDuration = settings.duration || '5';
  if (refSeconds > 0) {
    const durationOptions = await getModelDurationOptions(modelId);
    const picked = pickDurationForSeconds(durationOptions, refSeconds);
    if (picked) {
      appliedDuration = picked;
      console.info(`[Duration] Video tham chiếu ${refSeconds}s -> Làm tròn trần (Math.ceil) -> Render ${appliedDuration}s`);
    }
  }

  const effectiveSettings = {
    ratio: settings.ratio || '9:16',
    duration: appliedDuration,
    resolution: settings.resolution || '720p',
    ...settings,
    duration: appliedDuration,
  };

  const activeProjectId = projectId || process.env.DEFAULT_PROJECT_ID || 'default';

  const body = buildCreateVideoBody(model, effectiveSettings, {
    prompt: prompt || 'Recreate the video with new character and outfit perfectly',
    referenceUrls: [characterUrl, fashionUrl].filter(Boolean),
    videoUrls: [videoUrl].filter(Boolean),
    project_id: activeProjectId,
  });

  if (effectiveSettings.resolution) body.resolution = effectiveSettings.resolution;
  if (effectiveSettings.mode) body.mode = effectiveSettings.mode;
  if (effectiveSettings.ratio) body.ratio = effectiveSettings.ratio;
  body.project_id = activeProjectId;

  const created = await call79AI('/ai/create-video', { method: 'POST', body });
  const { jobId, raw } = parseMediaCreateResponse(created, 'video');

  onUpdate?.({ status: 'running', jobId, message: raw?.message || 'Đã tiếp nhận -> Đang render...' });

  const result = await pollVideoJob(jobId, {
    timeoutSeconds,
    projectId: activeProjectId,
    onProgress: (p) => {
      const pct = Number(p?.videoInfo?.percent ?? p?.percent ?? 0);
      onUpdate?.({ status: 'running', percent: pct, message: `Đang render (${pct}%)` });
    },
  });

  return result;
}

let cachedProjects = null;
let lastProjectsFetch = 0;

export async function getProjectsList(forceRefresh = false) {
  if (!forceRefresh && cachedProjects && Date.now() - lastProjectsFetch < 60000) {
    return cachedProjects;
  }
  try {
    const res = await call79AI('/ai/projects', { method: 'POST' });
    const list = Array.isArray(res?.data) ? res.data : [];
    cachedProjects = list
      .map((p) => {
        // QUAN TRỌNG: 79AI yêu cầu id_base (UUID) làm project_id thì video mới lưu vào đúng project trong thư viện!
        const effectiveId = String(p.id_base || p.id || '').trim();
        return {
          id: effectiveId,
          id_base: effectiveId,
          numeric_id: String(p.id || '').trim(),
          name: String(p.name || 'Dự án không tên').trim(),
          description: p.description || '',
        };
      })
      .filter((p) => p.id && p.name !== 'undefined');
    lastProjectsFetch = Date.now();
    return cachedProjects;
  } catch (e) {
    console.error('[botEngine] Lỗi lấy danh sách dự án:', e.message);
    return cachedProjects || [{ id: 'default', id_base: 'default', name: 'Mặc định' }];
  }
}

export async function listProjectVideos(projectId = 'default') {
  try {
    const res = await call79AI('/ai/videos', {
      method: 'POST',
      body: { project_id: projectId },
    });
    const list = Array.isArray(res?.data) ? res.data : [];
    return list.map((v) => ({
      id: v.id_base || v.id || '',
      status: v.status || '',
      url: v.download_url || v.video_url || '',
      thumb: v.thumbnail_url || '',
      prompt: v.prompt || '',
      created_time: v.created_time || '',
    }));
  } catch (e) {
    console.error('[botEngine] Lỗi lấy thư viện video:', e.message);
    return [];
  }
}
