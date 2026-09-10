import 'dotenv/config';
import { Bot, InlineKeyboard } from 'grammy';
import { sessionManager } from './lib/botSession.js';
import { executeVideoScene, uploadTelegramFile } from './lib/botEngine.js';

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

// Middleware kiểm tra quyền Admin
bot.use(async (ctx, next) => {
  if (adminId && ctx.from?.id !== adminId) {
    return ctx.reply('⛔ Bạn không có quyền sử dụng bot này.');
  }
  return next();
});

// Lệnh /start
bot.command('start', async (ctx) => {
  await ctx.reply(
    `👋 **Chào mừng Sếp đến với Trợ Lý Seedance Studio!**\n\n` +
    `🤖 Bot này giúp Sếp nạp mẻ render tự động và kiểm duyệt video siêu tốc trên điện thoại.\n\n` +
    `📌 **Cách nạp mẻ video (2 Ảnh + Nhiều Video):**\n` +
    `1. Gửi/Chuyển tiếp **Ảnh khuôn mặt** (kèm caption \`#mat\` hoặc gửi đầu tiên).\n` +
    `2. Gửi/Chuyển tiếp **Ảnh trang phục** (kèm caption \`#outfit\` hoặc gửi thứ hai).\n` +
    `3. Gửi/Chuyển tiếp hàng loạt **Video mẫu**.\n` +
    `4. Gõ **/chay** để bắt đầu cày ngầm ${concurrencyLimit} luồng!\n\n` +
    `⚡ **Các lệnh điều khiển:**\n` +
    `• /xem - Xem mẻ file hiện tại\n` +
    `• /status - Xem tiến độ render\n` +
    `• /chay - Bắt đầu render mẻ\n` +
    `• /huy - Hủy và làm mới mẻ hiện tại`,
    { parse_mode: 'Markdown' }
  );
});

// Lệnh /xem
bot.command('xem', async (ctx) => {
  const s = sessionManager.getSummary();
  const txt =
    `📋 **Tình trạng mẻ hiện tại:**\n\n` +
    `• Ảnh mặt: ${s.hasCharacter ? '✅ Đã nạp' : '❌ Chưa có'}\n` +
    `• Ảnh trang phục: ${s.hasFashion ? '✅ Đã nạp' : '❌ Chưa có'}\n` +
    `• Số video mẫu: **${s.videoCount} video**\n` +
    `• Trạng thái: **${s.status}**\n\n` +
    (s.isReady ? '👉 Đã đủ điều kiện! Gõ **/chay** để bắt đầu render.' : '⚠️ Cần đủ 1 ảnh mặt + 1 ảnh outfit + ít nhất 1 video để chạy.');
  await ctx.reply(txt, { parse_mode: 'Markdown' });
});

import { DEFAULT_PROMPT, DEFAULT_MODEL_ID } from './data/config.js';

let currentPrompt = DEFAULT_PROMPT;
let currentModel = DEFAULT_MODEL_ID;
let currentSettings = {
  ratio: '9:16',
  duration: '5',
  resolution: '720p',
};

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

// Lệnh /caidat - Xem và đổi Model / Tỉ lệ
bot.command('caidat', async (ctx) => {
  const keyboard = new InlineKeyboard()
    .text(`📐 Tỉ lệ: ${currentSettings.ratio}`, 'toggle:ratio')
    .row()
    .text(`⏱️ Thời lượng: ${currentSettings.duration}s`, 'toggle:duration')
    .row()
    .text(`🤖 Model: ${currentModel}`, 'toggle:model');

  await ctx.reply(
    `⚙️ **CẤU HÌNH MODEL & THÔNG SỐ RENDER:**\n\n` +
    `• **Model AI:** \`${currentModel}\`\n` +
    `• **Tỉ lệ khung hình:** \`${currentSettings.ratio}\`\n` +
    `• **Thời lượng video:** \`${currentSettings.duration}s\`\n` +
    `• **Độ phân giải:** \`${currentSettings.resolution}\`\n` +
    `• **Số luồng song song:** \`${concurrencyLimit} luồng\`\n\n` +
    `👉 Bấm các nút bên dưới để đổi nhanh thông số:`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
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

  if (caption.includes('#mat') || caption.includes('#face') || (!sessionManager.session.character && !caption.includes('#outfit'))) {
    sessionManager.setCharacter({ fileId, name: 'character.jpg' });
    await ctx.reply('✅ **Đã nhận ẢNH KHUÔN MẶT** (Nhân vật)', { parse_mode: 'Markdown' });
  } else if (caption.includes('#outfit') || caption.includes('#do') || caption.includes('#ao') || (!sessionManager.session.fashion)) {
    sessionManager.setFashion({ fileId, name: 'fashion.jpg' });
    await ctx.reply('✅ **Đã nhận ẢNH TRANG PHỤC** (Outfit)', { parse_mode: 'Markdown' });
  } else {
    sessionManager.setFashion({ fileId, name: 'fashion.jpg' });
    await ctx.reply('✅ Đã cập nhật lại **Ảnh trang phục**.', { parse_mode: 'Markdown' });
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
    return ctx.reply('⚠️ Chưa đủ file! Vui lòng nạp đủ: 1 ảnh mặt + 1 ảnh trang phục + ít nhất 1 video mẫu.');
  }

  if (sessionManager.session.status === 'running') {
    return ctx.reply('⏳ Một mẻ render đang chạy rồi Sếp ơi! Gõ /status để xem tiến độ.');
  }

  sessionManager.session.status = 'running';
  sessionManager.session.startedAt = Date.now();

  await ctx.reply(`🚀 **Bắt đầu xử lý mẻ ${s.videoCount} video (${concurrencyLimit} luồng song song)...**\n\n` +
    `☕ Sếp cứ nghỉ ngơi, khi có video render xong Bot sẽ gửi về kèm nút duyệt ngay!`, { parse_mode: 'Markdown' });

  // 1. Tải link ảnh trực tiếp
  let charDirectUrl, fashionDirectUrl;
  try {
    const charFile = await bot.api.getFile(sessionManager.session.character.fileId);
    const charTeleUrl = `https://api.telegram.org/file/bot${token}/${charFile.file_path}`;
    charDirectUrl = await uploadTelegramFile(charTeleUrl, 'character.jpg');

    const fashionFile = await bot.api.getFile(sessionManager.session.fashion.fileId);
    const fashionTeleUrl = `https://api.telegram.org/file/bot${token}/${fashionFile.file_path}`;
    fashionDirectUrl = await uploadTelegramFile(fashionTeleUrl, 'fashion.jpg');
  } catch (err) {
    sessionManager.session.status = 'idle';
    return ctx.reply(`❌ Lỗi tải ảnh lên server: ${err.message}`);
  }

  // 2. Chạy hàng đợi cuốn chiếu
  const videoList = [...sessionManager.session.videos];
  let cursor = 0;
  let doneCount = 0;
  let errorCount = 0;

  const runWorker = async (workerId) => {
    while (cursor < videoList.length) {
      const idx = cursor;
      cursor += 1;
      const vidItem = videoList[idx];
      const sceneId = `sc_${Date.now()}_${idx + 1}`;

      try {
        console.info(`[Worker ${workerId}] Đang xử lý video #${idx + 1}/${videoList.length} (ref: ${vidItem.seconds || 0}s)`);
        const vidFile = await bot.api.getFile(vidItem.fileId);
        const vidTeleUrl = `https://api.telegram.org/file/bot${token}/${vidFile.file_path}`;
        const vidDirectUrl = await uploadTelegramFile(vidTeleUrl, vidItem.name || 'clip.mp4');

        const out = await executeVideoScene({
          characterUrl: charDirectUrl,
          fashionUrl: fashionDirectUrl,
          videoUrl: vidDirectUrl,
          refSeconds: vidItem.seconds || 0,
          modelId: currentModel,
          settings: currentSettings,
          prompt: currentPrompt,
          timeoutSeconds: timeoutSec,
        });

        doneCount += 1;
        qcStore.set(sceneId, {
          url: out.url,
          index: idx + 1,
          charDirectUrl,
          fashionDirectUrl,
          vidDirectUrl,
          refSeconds: vidItem.seconds || 0,
        });

        // Tạo bàn phím duyệt QC
        const keyboard = new InlineKeyboard()
          .text('✅ Duyệt', `qc:pass:${sceneId}`)
          .text('🔄 Làm lại', `qc:retry:${sceneId}`)
          .text('❌ Bỏ qua', `qc:skip:${sceneId}`);

        await bot.api.sendVideo(ctx.chat.id, out.url, {
          caption: `✨ **Video #${idx + 1}/${videoList.length} HOÀN TẤT**\n\n👉 Sếp xem và bấm nút duyệt bên dưới:`,
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      } catch (e) {
        errorCount += 1;
        console.error(`[Worker ${workerId}] Lỗi video #${idx + 1}:`, e);
        await bot.api.sendMessage(ctx.chat.id, `⚠️ **Video #${idx + 1} lỗi:** ${e.message}`);
      }
    }
  };

  const activeWorkers = Math.min(concurrencyLimit, videoList.length);
  Promise.all(Array.from({ length: activeWorkers }).map((_, wId) => runWorker(wId + 1))).then(async () => {
    sessionManager.session.status = 'idle';
    await bot.api.sendMessage(
      ctx.chat.id,
      `🎉 **ĐÃ HOÀN TẤT TOÀN BỘ MẺ RENDER!**\n\n` +
      `• Tổng số: ${videoList.length} video\n` +
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

// Xử lý nút bấm cài đặt (/caidat)
bot.callbackQuery(/^toggle:(ratio|duration|model)$/, async (ctx) => {
  const type = ctx.match[1];
  if (type === 'ratio') {
    currentSettings.ratio = currentSettings.ratio === '9:16' ? '16:9' : '9:16';
  } else if (type === 'duration') {
    currentSettings.duration = currentSettings.duration === '5' ? '10' : '5';
  } else if (type === 'model') {
    currentModel = currentModel === 'wan_3_0' ? 'seedance_20_pro_edit' : 'wan_3_0';
  }

  await ctx.answerCallbackQuery({ text: '✅ Đã đổi thiết lập!' });

  const keyboard = new InlineKeyboard()
    .text(`📐 Tỉ lệ: ${currentSettings.ratio}`, 'toggle:ratio')
    .row()
    .text(`⏱️ Thời lượng: ${currentSettings.duration}s`, 'toggle:duration')
    .row()
    .text(`🤖 Model: ${currentModel}`, 'toggle:model');

  await ctx.editMessageText(
    `⚙️ **CẤU HÌNH MODEL & THÔNG SỐ RENDER:**\n\n` +
    `• **Model AI:** \`${currentModel}\`\n` +
    `• **Tỉ lệ khung hình:** \`${currentSettings.ratio}\`\n` +
    `• **Thời lượng video:** \`${currentSettings.duration}s\`\n` +
    `• **Độ phân giải:** \`${currentSettings.resolution}\`\n` +
    `• **Số luồng song song:** \`${concurrencyLimit} luồng\`\n\n` +
    `👉 Bấm các nút bên dưới để đổi nhanh thông số:`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
});

// Khởi động bot
console.info('🚀 Đang khởi động Telegram Assistant Bot...');
bot.start({
  onStart: (botInfo) => {
    console.info(`✅ Bot @${botInfo.username} đã sẵn sàng chạy!`);
    console.info(`👉 Đang lắng nghe lệnh từ Admin ID: ${adminId || '(Chưa cấu hình, hãy điền vào .env)'}`);
  },
});
