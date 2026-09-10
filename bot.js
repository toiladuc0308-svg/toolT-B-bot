import 'dotenv/config';
import { Bot, InlineKeyboard } from 'grammy';
import { sessionManager } from './lib/botSession.js';
import { executeVideoScene, uploadTelegramFile, getProjectsList } from './lib/botEngine.js';
import { buildPairs } from './lib/engine.js';
import { DEFAULT_PROMPT, DEFAULT_MODEL_ID } from './data/config.js';

const token = process.env.TELEGRAM_BOT_TOKEN;
const adminId = process.env.ADMIN_CHAT_ID ? Number(process.env.ADMIN_CHAT_ID) : null;
const concurrencyLimit = Math.max(1, Math.min(20, Number(process.env.CONCURRENCY) || 8));
const timeoutSec = Number(process.env.TIMEOUT_SECONDS) || 900;

if (!token) {
  console.error('❌ LỖI: Chưa cấu hình TELEGRAM_BOT_TOKEN trong file .env!');
  console.info('👉 Vui lòng mở file .env và điền Token từ @BotFather vào.');
  process.exit(1);
}

const bot = new Bot(token);

// Error handler
bot.catch((err) => {
  console.error('[Bot Error]:', err.error || err);
});

// Middleware log tin nhắn & kiểm tra quyền Admin
bot.use(async (ctx, next) => {
  const fromUser = ctx.from?.username || ctx.from?.id;
  const action = ctx.message?.text || (ctx.message?.photo ? 'gửi ảnh' : ctx.message?.video ? 'gửi video' : ctx.callbackQuery?.data ? `bấm nút ${ctx.callbackQuery.data}` : 'khác');
  console.info(`[Telegram] ${fromUser} -> ${action}`);

  if (adminId && ctx.from?.id !== adminId) {
    return ctx.reply('⛔ Bạn không có quyền sử dụng bot này.');
  }
  return next();
});

let currentProject = {
  id: process.env.DEFAULT_PROJECT_ID || 'default',
  name: 'Mặc định',
};

export function getProjectLabel() {
  return currentProject.name || currentProject.id || 'Mặc định';
}

getProjectsList()
  .then((projects) => {
    const found = projects.find((p) => p.id === currentProject.id || p.id_base === currentProject.id);
    if (found) currentProject = { id: found.id, name: found.name };
  })
  .catch(() => {});

let currentPrompt = DEFAULT_PROMPT;
let currentModel = DEFAULT_MODEL_ID;
let currentSettings = {
  ratio: '9:16',
  duration: 'auto', // 'auto' (mặc định theo video ref làm tròn Math.ceil) hoặc '5', '10'
  resolution: '720p',
  mode: 'vip',
};

export const SUPPORTED_MODELS = [
  { id: 'wan_3_0', name: 'WAN 3.0 (Mặc định)' },
  { id: 'seedance_20_pro_edit', name: 'Seedance 2.0 Omni' },
  { id: 'seedance_25_omni', name: 'Seedance 2.5' },
  { id: 'veo_omni_edit', name: 'VEO Omni Edit' },
  { id: 'kling-o3-edit', name: 'Kling 3.0 Edit' },
];

export function getModelName(id) {
  const m = SUPPORTED_MODELS.find((x) => x.id === id);
  return m ? m.name : id;
}

export const MODEL_RESOLUTIONS = {
  wan_3_0: ['720p', '1080p', '480p'],
  seedance_20_pro_edit: ['720p', '1080p', '4k'],
  seedance_25_omni: ['720p', '1080p', '480p'],
  veo_omni_edit: ['720p', '1080p'],
  'kling-o3-edit': ['720p', '1080p'],
};

export const MODEL_MODES = {
  wan_3_0: [
    { type: 'vip', name: 'VIP (Nhanh)' },
    { type: 'cheap', name: 'Cheap (Tiết kiệm)' },
  ],
  seedance_20_pro_edit: [
    { type: 'business_fast', name: 'Fast' },
    { type: 'business_professional', name: 'Professional' },
    { type: 'business_fast_vip', name: 'Fast - VIP' },
    { type: 'business_professional_vip', name: 'Pro - VIP' },
  ],
  seedance_25_omni: [
    { type: 'business_professional', name: 'Professional' },
    { type: 'business_professional_vip', name: 'Pro - VIP' },
  ],
  veo_omni_edit: [
    { type: 'standard', name: 'Standard' },
  ],
  'kling-o3-edit': [
    { type: 'standard', name: 'Standard' },
  ],
};

export function getAvailableResolutions(modelId) {
  return MODEL_RESOLUTIONS[modelId] || ['720p', '1080p', '480p'];
}

export function getAvailableModes(modelId) {
  return MODEL_MODES[modelId] || [{ type: 'standard', name: 'Standard' }];
}

export function getModeName(modelId, modeType) {
  const modes = getAvailableModes(modelId);
  const found = modes.find((m) => m.type === modeType);
  return found ? found.name : (modeType || 'Standard');
}

export function toggleNextResolution() {
  const list = getAvailableResolutions(currentModel);
  const idx = list.indexOf(currentSettings.resolution);
  const nextIdx = (idx + 1) % list.length;
  currentSettings.resolution = list[nextIdx];
}

export function toggleNextMode() {
  const list = getAvailableModes(currentModel);
  const idx = list.findIndex((m) => m.type === currentSettings.mode);
  const nextIdx = (idx + 1) % list.length;
  currentSettings.mode = list[nextIdx].type;
}

export function ensureModelSettingsValid() {
  const resList = getAvailableResolutions(currentModel);
  if (!resList.includes(currentSettings.resolution)) {
    currentSettings.resolution = resList[0] || '720p';
  }
  const modeList = getAvailableModes(currentModel);
  if (!modeList.some((m) => m.type === currentSettings.mode)) {
    currentSettings.mode = modeList[0]?.type || 'standard';
  }
}

let runSettings = {
  randomFashion: false,
  randomVideo: false,
  fashionOnce: false,
  videoOnce: false,
};

// Lệnh /reset - Khởi động lại trạng thái bot
bot.command('reset', async (ctx) => {
  sessionManager.reset();
  currentPrompt = DEFAULT_PROMPT;
  currentModel = DEFAULT_MODEL_ID;
  currentSettings = {
    ratio: '9:16',
    duration: 'auto',
    resolution: '720p',
    mode: 'vip',
  };
  runSettings = {
    randomFashion: false,
    randomVideo: false,
    fashionOnce: false,
    videoOnce: false,
  };
  await ctx.reply(
    `🔄 **ĐÃ RESET TOÀN BỘ TRẠNG THÁI BOT!**\n\n` +
    `• Model: \`${getModelName(currentModel)}\` (\`${currentModel}\`)\n` +
    `• Tỉ lệ: \`${currentSettings.ratio}\`\n` +
    `• Độ phân giải: \`${currentSettings.resolution}\`\n` +
    `• Chế độ (Mode): \`${getModeName(currentModel, currentSettings.mode)}\`\n` +
    `• Thời lượng: \`Tự động theo video mẫu (Math.ceil)\`\n` +
    `• Random & Khóa 1 lần: Đã tắt\n` +
    `• Giỏ hàng & Lịch sử khóa: Đã làm trống\n\n` +
    `👉 Sếp có thể gửi lại /caidat hoặc gửi mẻ ảnh & video mới để test nhé!`,
    { parse_mode: 'Markdown' }
  );
});

// Lệnh /start
bot.command('start', async (ctx) => {
  await ctx.reply(
    `👋 **Chào mừng Sếp đến với Trợ Lý Seedance Studio!**\n\n` +
    `🤖 Bot này giúp Sếp nạp mẻ render tự động và kiểm duyệt video siêu tốc trên điện thoại.\n\n` +
    `📌 **Cách nạp mẻ video (1 Ảnh mặt + 1 hoặc nhiều Outfit + Nhiều Video):**\n` +
    `1. Gửi/Chuyển tiếp **Ảnh khuôn mặt** (kèm caption \`#mat\` hoặc gửi đầu tiên).\n` +
    `2. Gửi/Chuyển tiếp **Ảnh trang phục** (kèm caption \`#outfit\` hoặc gửi tiếp theo, có thể nạp nhiều outfit).\n` +
    `3. Gửi/Chuyển tiếp hàng loạt **Video mẫu**.\n` +
    `4. Gõ **/caidat** để bật/tắt Random hoặc Khóa dùng 1 lần.\n` +
    `5. Gõ **/chay** để bắt đầu render ngầm ${concurrencyLimit} luồng!\n\n` +
    `⚡ **Các lệnh điều khiển:**\n` +
    `• /xem - Xem tình trạng mẻ file hiện tại\n` +
    `• /caidat - Đổi Tỉ lệ / Phân giải / Mode / Bật tắt Random & Khóa 1 lần\n` +
    `• /duan - Xem và chọn Dự án lưu video (79AI Projects)\n` +
    `• /model - Xem và chọn Model AI (WAN 3.0, Seedance 2.0 Omni...)\n` +
    `• /prompt - Xem hoặc đổi Prompt tạo video\n` +
    `• /status - Xem tiến độ render\n` +
    `• /chay - Bắt đầu render mẻ\n` +
    `• /huy - Hủy và làm mới mẻ hiện tại\n` +
    `• /reset - Reset toàn bộ bot về mặc định`,
    { parse_mode: 'Markdown' }
  );
});

// Lệnh /status - Xem tiến độ render
bot.command('status', async (ctx) => {
  const s = sessionManager.getSummary();
  const durSec = sessionManager.session.startedAt ? Math.round((Date.now() - sessionManager.session.startedAt) / 1000) : 0;
  await ctx.reply(
    `📊 **TIẾN ĐỘ RENDER HIỆN TẠI:**\n\n` +
    `• Trạng thái: **${s.status === 'running' ? '⏳ ĐANG RENDER' : '💤 ĐANG RẢNH'}**\n` +
    `• Thời gian chạy: ${durSec > 0 ? `${durSec} giây` : '0s'}\n` +
    `• Số video nạp vào: ${s.videoCount}\n` +
    `• Số outfit nạp vào: ${s.fashionCount}\n` +
    `• Random: Outfit [${runSettings.randomFashion ? '✅ BẬT' : '❌ TẮT'}] | Video [${runSettings.randomVideo ? '✅ BẬT' : '❌ TẮT'}]\n` +
    `• Khóa 1 lần: Outfit [${runSettings.fashionOnce ? '✅ BẬT' : '❌ TẮT'}] | Video [${runSettings.videoOnce ? '✅ BẬT' : '❌ TẮT'}]\n` +
    (sessionManager.session.usedVideo.length > 0 || sessionManager.session.usedFashion.length > 0
      ? `• Đã render/khóa: ${sessionManager.session.usedFashion.length} outfit, ${sessionManager.session.usedVideo.length} video\n`
      : '') +
    `\n👉 Dùng /caidat để đổi cấu hình hoặc /xem để kiểm tra file.`,
    { parse_mode: 'Markdown' }
  );
});

// Lệnh /xem
bot.command('xem', async (ctx) => {
  const s = sessionManager.getSummary();
  const txt =
    `📋 **Tình trạng mẻ hiện tại:**\n\n` +
    `• Ảnh mặt: ${s.hasCharacter ? '✅ Đã nạp' : '❌ Chưa có'}\n` +
    `• Ảnh trang phục: ${s.fashionCount > 0 ? `✅ Đã nạp (${s.fashionCount} outfit)` : '❌ Chưa có'}\n` +
    `• Số video mẫu: **${s.videoCount} video**\n\n` +
    `🎲 **Chế độ Random:**\n` +
    `• Random Outfit: [${runSettings.randomFashion ? '✅ BẬT' : '❌ TẮT'}] | Random Video: [${runSettings.randomVideo ? '✅ BẬT' : '❌ TẮT'}]\n` +
    `🔒 **Khóa Dùng 1 lần:**\n` +
    `• Khóa Outfit 1 lần: [${runSettings.fashionOnce ? '✅ BẬT' : '❌ TẮT'}] | Khóa Video 1 lần: [${runSettings.videoOnce ? '✅ BẬT' : '❌ TẮT'}]\n` +
    (runSettings.fashionOnce || runSettings.videoOnce ? `• Đã khóa: ${sessionManager.session.usedFashion.length} outfit, ${sessionManager.session.usedVideo.length} video\n` : '') +
    `\n• Trạng thái: **${s.status === 'running' ? '⏳ ĐANG RENDER' : '💤 SẴN SÀNG'}**\n\n` +
    (s.isReady ? '👉 Đã đủ điều kiện! Gõ **/chay** để bắt đầu render.' : '⚠️ Cần đủ 1 ảnh mặt + ít nhất 1 ảnh outfit + ít nhất 1 video để chạy.');
  await ctx.reply(txt, { parse_mode: 'Markdown' });
});

// Lệnh /prompt - Xem hoặc đổi Prompt
bot.command('prompt', async (ctx) => {
  const newPrompt = ctx.match?.trim();
  if (newPrompt) {
    currentPrompt = newPrompt;
    return ctx.reply(`✅ **Đã cập nhật Prompt mới:**\n\n\`${currentPrompt}\``, { parse_mode: 'Markdown' });
  }
  await ctx.reply(
    `📝 **CẤU HÌNH PROMPT HIỆN TẠI:**\n\n\`\`\`\n${currentPrompt}\n\`\`\`\n\n` +
    `👉 Để đổi prompt khác, Sếp gõ:\n\`/prompt <nội dung prompt mới>\``,
    { parse_mode: 'Markdown' }
  );
});

// Helper format hiển thị thời lượng
function formatDurationLabel(dur) {
  if (dur === 'auto') return 'Tự động theo video mẫu (Math.ceil)';
  return `${dur}s (Cố định)`;
}

function formatCaidatText() {
  return (
    `⚙️ **CẤU HÌNH MODEL & THÔNG SỐ RENDER:**\n\n` +
    `• **Dự án (Project):** \`${getProjectLabel()}\` (\`${currentProject.id}\`)\n` +
    `• **Model AI:** \`${getModelName(currentModel)}\` (\`${currentModel}\`)\n` +
    `• **Tỉ lệ khung hình:** \`${currentSettings.ratio}\`\n` +
    `• **Độ phân giải:** \`${currentSettings.resolution}\`\n` +
    `• **Chế độ (Mode):** \`${getModeName(currentModel, currentSettings.mode)}\`\n` +
    `• **Thời lượng video:** \`${formatDurationLabel(currentSettings.duration)}\`\n` +
    `• **Số luồng song song:** \`${concurrencyLimit} luồng\`\n\n` +
    `🎲 **Chế độ Random:**\n` +
    `• Random Outfit: ${runSettings.randomFashion ? '✅ BẬT' : '❌ TẮT'}\n` +
    `• Random Video: ${runSettings.randomVideo ? '✅ BẬT' : '❌ TẮT'}\n\n` +
    `🔒 **Chế độ Dùng 1 lần:**\n` +
    `• Khóa Outfit 1 lần: ${runSettings.fashionOnce ? '✅ BẬT' : '❌ TẮT'}\n` +
    `• Khóa Video 1 lần: ${runSettings.videoOnce ? '✅ BẬT' : '❌ TẮT'}\n` +
    (sessionManager.session.usedFashion.length > 0 || sessionManager.session.usedVideo.length > 0
      ? `• Đã khóa: ${sessionManager.session.usedFashion.length} outfit, ${sessionManager.session.usedVideo.length} video\n`
      : '') +
    `\n👉 Bấm các nút bên dưới để đổi thiết lập:`
  );
}

function buildCaidatKeyboard() {
  const modeLabel = getModeName(currentModel, currentSettings.mode);
  return new InlineKeyboard()
    .text(`📁 Dự án: ${getProjectLabel()}`, 'menu:projects')
    .row()
    .text(`🤖 Model: ${getModelName(currentModel)}`, 'menu:model')
    .row()
    .text(`📐 Tỉ lệ: ${currentSettings.ratio}`, 'toggle:ratio')
    .text(`📺 Phân giải: ${currentSettings.resolution}`, 'toggle:resolution')
    .row()
    .text(`⏱️ ${currentSettings.duration === 'auto' ? 'Auto (Ref)' : `${currentSettings.duration}s`}`, 'toggle:duration')
    .text(`⚡ Mode: ${modeLabel}`, 'toggle:mode')
    .row()
    .text(`🎲 Rnd Outfit: ${runSettings.randomFashion ? '✅ BẬT' : '❌ TẮT'}`, 'toggle:rnd_fashion')
    .text(`🎲 Rnd Video: ${runSettings.randomVideo ? '✅ BẬT' : '❌ TẮT'}`, 'toggle:rnd_video')
    .row()
    .text(`🔒 Outfit 1 lần: ${runSettings.fashionOnce ? '✅ BẬT' : '❌ TẮT'}`, 'toggle:once_fashion')
    .text(`🔒 Video 1 lần: ${runSettings.videoOnce ? '✅ BẬT' : '❌ TẮT'}`, 'toggle:once_video');
}

async function formatProjectsText() {
  return (
    `📁 **DANH SÁCH DỰ ÁN (PROJECT) TRÊN 79AI:**\n\n` +
    `• **Dự án đang chọn:** \`${getProjectLabel()}\` (ID: \`${currentProject.id}\`)\n\n` +
    `👉 Bấm chọn dự án Sếp muốn lưu video vào:`
  );
}

async function buildProjectsKeyboard(forceRefresh = false) {
  const projects = await getProjectsList(forceRefresh);
  const kb = new InlineKeyboard();
  for (const p of projects) {
    const isSelected = p.id === currentProject.id || p.id_base === currentProject.id;
    kb.text(`${isSelected ? '✅ ' : ''}${p.name}`, `set_project:${p.id}`).row();
  }
  kb.text('🔄 Làm mới danh sách', 'refresh:projects');
  kb.text('🔙 Quay lại Cài đặt', 'menu:caidat');
  return kb;
}

// Lệnh /duan hoặc /project - Xem và chọn Dự án lưu video
bot.command(['duan', 'project'], async (ctx) => {
  const arg = ctx.match?.trim();
  if (arg) {
    const projects = await getProjectsList();
    const found = projects.find(
      (p) => p.id === arg || p.id_base === arg || p.name.toLowerCase().includes(arg.toLowerCase())
    );
    if (found) {
      currentProject = { id: found.id, name: found.name };
      return ctx.reply(`✅ **Đã chuyển sang Dự án:** \`${found.name}\` (ID: \`${found.id}\`)`, {
        parse_mode: 'Markdown',
      });
    } else {
      currentProject = { id: arg, name: arg };
      return ctx.reply(`✅ **Đã chuyển sang Dự án ID:** \`${currentProject.id}\``, {
        parse_mode: 'Markdown',
      });
    }
  }

  const text = await formatProjectsText();
  const kb = await buildProjectsKeyboard();
  await ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: kb,
  });
});

function formatModelSelectText() {
  return (
    `🤖 **DANH SÁCH MODEL AI TẠO VIDEO (79AI):**\n\n` +
    `• **Model đang chọn:** \`${getModelName(currentModel)}\` (\`${currentModel}\`)\n\n` +
    `👉 Bấm nút bên dưới để chọn model Sếp muốn render:`
  );
}

function buildModelSelectKeyboard() {
  const kb = new InlineKeyboard();
  for (const m of SUPPORTED_MODELS) {
    const isSelected = m.id === currentModel;
    kb.text(`${isSelected ? '✅ ' : ''}${m.name}`, `set_model:${m.id}`).row();
  }
  kb.text('🔙 Quay lại Cài đặt', 'menu:caidat');
  return kb;
}

// Lệnh /model - Xem và chọn Model AI
bot.command('model', async (ctx) => {
  const arg = ctx.match?.trim();
  if (arg) {
    const found = SUPPORTED_MODELS.find(
      (m) => m.id === arg || m.name.toLowerCase().includes(arg.toLowerCase())
    );
    if (found) {
      currentModel = found.id;
      ensureModelSettingsValid();
      return ctx.reply(`✅ **Đã chuyển sang Model:** \`${found.name}\` (\`${found.id}\`)`, {
        parse_mode: 'Markdown',
      });
    } else {
      currentModel = arg;
      ensureModelSettingsValid();
      return ctx.reply(`✅ **Đã chuyển sang Model tùy chỉnh:** \`${currentModel}\``, {
        parse_mode: 'Markdown',
      });
    }
  }

  await ctx.reply(formatModelSelectText(), {
    parse_mode: 'Markdown',
    reply_markup: buildModelSelectKeyboard(),
  });
});

// Lệnh /caidat - Xem và đổi Model / Tỉ lệ / Random / 1 Lần
bot.command('caidat', async (ctx) => {
  await ctx.reply(formatCaidatText(), {
    parse_mode: 'Markdown',
    reply_markup: buildCaidatKeyboard(),
  });
});

// Lệnh /huy
bot.command('huy', async (ctx) => {
  sessionManager.reset();
  await ctx.reply('🗑 Đã hủy mẻ và xóa giỏ hàng hiện tại. Sếp có thể gửi mẻ mới!');
});

// Xử lý khi nhận ảnh
bot.on(':photo', async (ctx) => {
  const photos = ctx.message.photo;
  const highestPhoto = photos[photos.length - 1];
  const fileId = highestPhoto.file_id;
  const caption = (ctx.message.caption || '').toLowerCase();

  if (caption.includes('#mat') || caption.includes('#face') || (!sessionManager.session.character && !caption.includes('#outfit') && !caption.includes('#do'))) {
    sessionManager.setCharacter({ fileId, name: 'character.jpg' });
    await ctx.reply('✅ **Đã nhận ẢNH KHUÔN MẶT** (Nhân vật)', { parse_mode: 'Markdown' });
  } else {
    sessionManager.addFashion({ fileId, name: `outfit_${sessionManager.session.fashions.length + 1}.jpg` });
    const count = sessionManager.session.fashions.length;
    await ctx.reply(`✅ **Đã nhận ẢNH TRANG PHỤC #${count}** (Tổng: ${count} outfit)`, { parse_mode: 'Markdown' });
  }
});

// Xử lý khi nhận video hoặc file đính kèm
bot.on([':video', ':document'], async (ctx) => {
  const doc = ctx.message.document;
  const vid = ctx.message.video;

  if (vid) {
    const sec = Number(vid.duration) || 0;
    sessionManager.addVideo({
      fileId: vid.file_id,
      name: vid.file_name || `ref_${Date.now()}.mp4`,
      seconds: sec,
    });
    const count = sessionManager.session.videos.length;
    await ctx.reply(`🎬 Đã nhận Video mẫu #${count} (${sec > 0 ? `${sec}s` : 'chưa rõ s'} | Tổng: ${count} video)`);
  } else if (doc && (doc.mime_type?.startsWith('video/') || doc.file_name?.endsWith('.mp4'))) {
    sessionManager.addVideo({
      fileId: doc.file_id,
      name: doc.file_name || `ref_${Date.now()}.mp4`,
      seconds: 0,
    });
    const count = sessionManager.session.videos.length;
    await ctx.reply(`🎬 Đã nhận Video mẫu #${count} (Tổng: ${count} video)`);
  }
});

// Bộ nhớ kết quả để hỗ trợ nút QC duyệt
const qcStore = new Map();

// Lệnh /chay: Khởi động render
bot.command(['chay', 'run'], async (ctx) => {
  const s = sessionManager.getSummary();
  if (!s.isReady) {
    return ctx.reply('⚠️ Chưa đủ file! Vui lòng nạp đủ: 1 ảnh mặt + ít nhất 1 ảnh trang phục + ít nhất 1 video mẫu.');
  }

  if (sessionManager.session.status === 'running') {
    return ctx.reply('⏳ Một mẻ render đang chạy rồi Sếp ơi! Gõ /status để xem tiến độ.');
  }

  // Chuẩn bị danh sách fashion và video cho buildPairs
  const fashionItems = sessionManager.session.fashions.map((f) => ({
    ...f,
    url: f.fileId,
  }));

  const videoItems = sessionManager.session.videos.map((v) => ({
    ...v,
    url: v.fileId,
  }));

  let pairs;
  try {
    pairs = buildPairs({
      characterUrl: sessionManager.session.character.fileId,
      fashion: fashionItems,
      videos: videoItems,
      maxVideos: videoItems.length,
      randomFashion: runSettings.randomFashion,
      randomVideo: runSettings.randomVideo,
      usedFashion: sessionManager.session.usedFashion,
      usedVideo: sessionManager.session.usedVideo,
      fashionOnce: runSettings.fashionOnce,
      videoOnce: runSettings.videoOnce,
    });
  } catch (err) {
    return ctx.reply(`⚠️ ${err.message}`);
  }

  sessionManager.session.status = 'running';
  sessionManager.session.startedAt = Date.now();

  const pairStatus = pairs.map((p, i) => ({
    index: i + 1,
    status: 'pending',
    percent: 0,
    message: 'Chờ luồng...',
  }));

  function renderProgressBar(percent) {
    const totalBars = 10;
    const filled = Math.min(totalBars, Math.max(0, Math.round((percent / 100) * totalBars)));
    const empty = totalBars - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  const dashboardMsg = await ctx.reply(
    `🚀 **KHỞI ĐỘNG MẺ RENDER (${pairs.length} video - ${concurrencyLimit} luồng)**\n\n` +
    `📁 Dự án: \`${getProjectLabel()}\` (ID: \`${currentProject.id}\`)\n` +
    `🤖 Model: \`${getModelName(currentModel)}\` | 📺 ${currentSettings.resolution} | ⚡ ${getModeName(currentModel, currentSettings.mode)}\n` +
    `🎲 Random: Outfit [${runSettings.randomFashion ? '✅' : '❌'}] | Video [${runSettings.randomVideo ? '✅' : '❌'}]\n` +
    `🔒 Khóa 1 lần: Outfit [${runSettings.fashionOnce ? '✅' : '❌'}] | Video [${runSettings.videoOnce ? '✅' : '❌'}]\n\n` +
    `⏳ Đang chuẩn bị tải tài nguyên lên máy chủ...`,
    { parse_mode: 'Markdown' }
  );

  let lastEditTime = 0;
  let editScheduled = false;

  async function updateDashboard(force = false) {
    const now = Date.now();
    if (!force && now - lastEditTime < 3000) {
      if (!editScheduled) {
        editScheduled = true;
        setTimeout(() => {
          editScheduled = false;
          updateDashboard(false);
        }, 3000 - (now - lastEditTime));
      }
      return;
    }
    lastEditTime = now;

    let text =
      `🚀 **TIẾN ĐỘ RENDER MẺ (${pairs.length} video - ${concurrencyLimit} luồng)**\n\n` +
      `📁 Dự án: \`${getProjectLabel()}\` | 🤖 Model: \`${getModelName(currentModel)}\`\n` +
      `📺 Phân giải: \`${currentSettings.resolution}\` | ⚡ Mode: \`${getModeName(currentModel, currentSettings.mode)}\`\n` +
      `📊 **Tiến độ tổng:** ${doneCount}/${pairs.length} hoàn tất ${errorCount > 0 ? `(⚠️ ${errorCount} lỗi)` : ''}\n` +
      `─────────────────────────\n`;

    const displayList = pairStatus.slice(0, 8);
    for (const item of displayList) {
      if (item.status === 'done') {
        text += `• Video #${item.index}: ✅ **Hoàn tất**\n`;
      } else if (item.status === 'error') {
        text += `• Video #${item.index}: ❌ **Lỗi:** ${item.message}\n`;
      } else if (item.status === 'rendering') {
        text += `• Video #${item.index}: [${renderProgressBar(item.percent)}] **${item.percent}%**\n`;
      } else if (item.status === 'uploading') {
        text += `• Video #${item.index}: 📤 Đang tải file lên server...\n`;
      } else {
        text += `• Video #${item.index}: ⏳ Đang chờ lượt...\n`;
      }
    }

    if (pairs.length > 8) {
      text += `• ... và ${pairs.length - 8} video khác đang xếp hàng\n`;
    }

    text += `\n☕ Video render xong sẽ được gửi ngay bên dưới kèm nút duyệt!`;

    try {
      await bot.api.editMessageText(ctx.chat.id, dashboardMsg.message_id, text, {
        parse_mode: 'Markdown',
      });
    } catch (e) {
      // Bỏ qua lỗi rate limit
    }
  }

  // Map cache direct URLs để không tải trùng nhiều lần
  const directUrlCache = new Map();
  async function getDirectUrl(fileId, filename) {
    if (directUrlCache.has(fileId)) return directUrlCache.get(fileId);
    const fileInfo = await bot.api.getFile(fileId);
    const teleUrl = `https://api.telegram.org/file/bot${token}/${fileInfo.file_path}`;
    const directUrl = await uploadTelegramFile(teleUrl, filename);
    directUrlCache.set(fileId, directUrl);
    return directUrl;
  }

  // 1. Tải link ảnh nhân vật trước
  let charDirectUrl;
  try {
    charDirectUrl = await getDirectUrl(sessionManager.session.character.fileId, 'character.jpg');
  } catch (err) {
    sessionManager.session.status = 'idle';
    return ctx.reply(`❌ Lỗi tải ảnh mặt lên server: ${err.message}`);
  }

  // 2. Chạy hàng đợi cuốn chiếu theo pairs
  let cursor = 0;
  let doneCount = 0;
  let errorCount = 0;

  const runWorker = async (workerId) => {
    while (cursor < pairs.length) {
      const idx = cursor;
      cursor += 1;
      const pair = pairs[idx];
      const sceneId = `sc_${Date.now()}_${idx + 1}`;

      try {
        console.info(`[Worker ${workerId}] Đang xử lý video #${idx + 1}/${pairs.length} (ref: ${pair.video.seconds || 0}s)`);

        // Đánh dấu đã dùng nếu bật chế độ 1 lần
        if (runSettings.fashionOnce && !sessionManager.session.usedFashion.includes(pair.fashion.fileId)) {
          sessionManager.session.usedFashion.push(pair.fashion.fileId);
        }
        if (runSettings.videoOnce && !sessionManager.session.usedVideo.includes(pair.video.fileId)) {
          sessionManager.session.usedVideo.push(pair.video.fileId);
        }

        pairStatus[idx].status = 'uploading';
        updateDashboard();

        const fashionDirectUrl = await getDirectUrl(pair.fashion.fileId, pair.fashion.name || 'fashion.jpg');
        const vidDirectUrl = await getDirectUrl(pair.video.fileId, pair.video.name || 'clip.mp4');

        pairStatus[idx].status = 'rendering';
        pairStatus[idx].percent = 5;
        updateDashboard();

        const out = await executeVideoScene({
          characterUrl: charDirectUrl,
          fashionUrl: fashionDirectUrl,
          videoUrl: vidDirectUrl,
          refSeconds: pair.video.seconds || 0,
          modelId: currentModel,
          settings: currentSettings,
          prompt: currentPrompt,
          timeoutSeconds: timeoutSec,
          projectId: currentProject.id,
          onUpdate: (up) => {
            if (typeof up.percent === 'number' && up.percent > 0) {
              pairStatus[idx].percent = Math.max(pairStatus[idx].percent, up.percent);
            }
            updateDashboard();
          },
        });

        doneCount += 1;
        pairStatus[idx].status = 'done';
        pairStatus[idx].percent = 100;
        updateDashboard(true);

        qcStore.set(sceneId, {
          url: out.url,
          index: idx + 1,
          charDirectUrl,
          fashionDirectUrl,
          vidDirectUrl,
          refSeconds: pair.video.seconds || 0,
        });

        // Tạo bàn phím duyệt QC
        const keyboard = new InlineKeyboard()
          .text('✅ Duyệt', `qc:pass:${sceneId}`)
          .text('🔄 Làm lại', `qc:retry:${sceneId}`)
          .text('❌ Bỏ qua', `qc:skip:${sceneId}`);

        await bot.api.sendVideo(ctx.chat.id, out.url, {
          caption: `✨ **Video #${idx + 1}/${pairs.length} HOÀN TẤT**\n\n👉 Sếp xem và bấm nút duyệt bên dưới:`,
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      } catch (e) {
        errorCount += 1;
        pairStatus[idx].status = 'error';
        pairStatus[idx].message = e.message || 'Lỗi';
        updateDashboard(true);
        console.error(`[Worker ${workerId}] Lỗi video #${idx + 1}:`, e);
        await bot.api.sendMessage(ctx.chat.id, `⚠️ **Video #${idx + 1} lỗi:** ${e.message}`);
      }
    }
  };

  const activeWorkers = Math.min(concurrencyLimit, pairs.length);
  Promise.all(Array.from({ length: activeWorkers }).map((_, wId) => runWorker(wId + 1))).then(async () => {
    sessionManager.session.status = 'idle';
    await updateDashboard(true);
    await bot.api.sendMessage(
      ctx.chat.id,
      `🎉 **ĐÃ HOÀN TẤT TOÀN BỘ MẺ RENDER!**\n\n` +
      `📁 Dự án: \`${getProjectLabel()}\`\n` +
      `• Tổng số: ${pairs.length} video\n` +
      `• Thành công: ${doneCount}\n` +
      `• Lỗi: ${errorCount}\n\n` +
      `Sếp có thể nạp mẻ tiếp theo bằng cách gửi ảnh và video mới!`
    );
  });
});

// Xử lý nút bấm kiểm duyệt (QC Inline Keyboard)
bot.callbackQuery(/^qc:(pass|retry|skip):(.+)$/, async (ctx) => {
  const action = ctx.match[1];
  const sceneId = ctx.match[2];
  const item = qcStore.get(sceneId);

  if (!item) {
    return ctx.answerCallbackQuery({ text: 'Dữ liệu video đã hết hạn hoặc không tìm thấy.', show_alert: true });
  }

  if (action === 'pass') {
    await ctx.answerCallbackQuery({ text: '✅ Đã duyệt video!' });
    await ctx.editMessageCaption({
      caption: `✅ **ĐÃ DUYỆT (Video #${item.index})**\n\nLink gốc: ${item.url}\n👉 *Sếp chỉ việc chuyển tiếp (forward) tin nhắn này cho khách!*`,
      parse_mode: 'Markdown',
    });
  } else if (action === 'retry') {
    await ctx.answerCallbackQuery({ text: '🔄 Đang gửi lệnh render lại...' });
    await ctx.editMessageCaption({
      caption: `🔄 **Đang tạo lại Video #${item.index}...** Vui lòng đợi trong giây lát!`,
      parse_mode: 'Markdown',
    });

    executeVideoScene({
      characterUrl: item.charDirectUrl,
      fashionUrl: item.fashionDirectUrl,
      videoUrl: item.vidDirectUrl,
      refSeconds: item.refSeconds || 0,
      modelId: currentModel,
      settings: currentSettings,
      prompt: currentPrompt,
      timeoutSeconds: timeoutSec,
      projectId: currentProject.id,
    }).then(async (out) => {
      const newKeyboard = new InlineKeyboard()
        .text('✅ Duyệt', `qc:pass:${sceneId}`)
        .text('🔄 Làm lại', `qc:retry:${sceneId}`)
        .text('❌ Bỏ qua', `qc:skip:${sceneId}`);

      await bot.api.sendVideo(ctx.chat.id, out.url, {
        caption: `✨ **Video #${item.index} (LÀM LẠI) ĐÃ XONG**\n\n👉 Sếp kiểm tra lại giúp em:`,
        parse_mode: 'Markdown',
        reply_markup: newKeyboard,
      });
    }).catch(async (e) => {
      await bot.api.sendMessage(ctx.chat.id, `❌ Render lại video #${item.index} thất bại: ${e.message}`);
    });
  } else if (action === 'skip') {
    await ctx.answerCallbackQuery({ text: '❌ Đã bỏ qua video này' });
    await ctx.editMessageCaption({
      caption: `❌ **ĐÃ BỎ QUA (Video #${item.index})**`,
      parse_mode: 'Markdown',
    });
  }
});

// Chuyển sang menu chọn model
bot.callbackQuery('menu:model', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(formatModelSelectText(), {
    parse_mode: 'Markdown',
    reply_markup: buildModelSelectKeyboard(),
  });
});

// Chuyển sang menu chọn dự án
bot.callbackQuery('menu:projects', async (ctx) => {
  await ctx.answerCallbackQuery();
  const text = await formatProjectsText();
  const kb = await buildProjectsKeyboard();
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: kb,
  });
});

// Làm mới danh sách dự án
bot.callbackQuery('refresh:projects', async (ctx) => {
  await ctx.answerCallbackQuery({ text: '🔄 Đang làm mới danh sách...' });
  const text = await formatProjectsText();
  const kb = await buildProjectsKeyboard(true);
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: kb,
  });
});

// Chọn dự án trực tiếp
bot.callbackQuery(/^set_project:(.+)$/, async (ctx) => {
  const selectedId = ctx.match[1];
  const projects = await getProjectsList();
  const found = projects.find((p) => p.id === selectedId || p.id_base === selectedId);
  currentProject = {
    id: selectedId,
    name: found ? found.name : selectedId,
  };
  await ctx.answerCallbackQuery({ text: `✅ Đã chọn dự án: ${currentProject.name}!` });
  const text = await formatProjectsText();
  const kb = await buildProjectsKeyboard();
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: kb,
  });
});

// Quay lại bảng cài đặt chính
bot.callbackQuery('menu:caidat', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(formatCaidatText(), {
    parse_mode: 'Markdown',
    reply_markup: buildCaidatKeyboard(),
  });
});

// Chọn model trực tiếp từ danh sách
bot.callbackQuery(/^set_model:(.+)$/, async (ctx) => {
  const selectedId = ctx.match[1];
  currentModel = selectedId;
  ensureModelSettingsValid();
  await ctx.answerCallbackQuery({ text: `✅ Đã chọn ${getModelName(selectedId)}!` });
  await ctx.editMessageText(formatModelSelectText(), {
    parse_mode: 'Markdown',
    reply_markup: buildModelSelectKeyboard(),
  });
});

// Xử lý nút bấm cài đặt (/caidat)
bot.callbackQuery(/^toggle:(ratio|duration|resolution|mode|model|rnd_fashion|rnd_video|once_fashion|once_video)$/, async (ctx) => {
  const type = ctx.match[1];
  if (type === 'ratio') {
    const ratios = ['9:16', '16:9', '1:1', '3:4', '4:3'];
    const idx = ratios.indexOf(currentSettings.ratio);
    currentSettings.ratio = ratios[(idx + 1) % ratios.length];
  } else if (type === 'resolution') {
    toggleNextResolution();
  } else if (type === 'mode') {
    toggleNextMode();
  } else if (type === 'duration') {
    if (currentSettings.duration === 'auto') currentSettings.duration = '5';
    else if (currentSettings.duration === '5') currentSettings.duration = '10';
    else currentSettings.duration = 'auto';
  } else if (type === 'model') {
    currentModel = currentModel === 'wan_3_0' ? 'seedance_20_pro_edit' : 'wan_3_0';
    ensureModelSettingsValid();
  } else if (type === 'rnd_fashion') {
    runSettings.randomFashion = !runSettings.randomFashion;
  } else if (type === 'rnd_video') {
    runSettings.randomVideo = !runSettings.randomVideo;
  } else if (type === 'once_fashion') {
    runSettings.fashionOnce = !runSettings.fashionOnce;
  } else if (type === 'once_video') {
    runSettings.videoOnce = !runSettings.videoOnce;
  }

  await ctx.answerCallbackQuery({ text: '✅ Đã cập nhật thiết lập!' });

  await ctx.editMessageText(formatCaidatText(), {
    parse_mode: 'Markdown',
    reply_markup: buildCaidatKeyboard(),
  });
});

// Khởi động bot
console.info('🚀 Đang khởi động Telegram Assistant Bot...');
bot.start({
  onStart: (botInfo) => {
    console.info(`✅ Bot @${botInfo.username} đã sẵn sàng chạy!`);
    console.info(`👉 Đang lắng nghe lệnh từ Admin ID: ${adminId || '(Chưa cấu hình, hãy điền vào .env)'}`);
  },
});
