/**
 * Quản lý Session mẻ đơn hàng hiện tại của Admin.
 * Hỗ trợ 1 ảnh mặt + nhiều ảnh outfit + nhiều video mẫu + khoá dùng 1 lần.
 */

export class BotSessionManager {
  constructor() {
    this.reset();
  }

  reset() {
    this.session = {
      character: null,     // { fileId, url, filename }
      fashions: [],        // [ { fileId, url, filename, index } ]
      videos: [],          // [ { fileId, url, filename, seconds, index } ]
      usedFashion: [],     // danh sách fileId outfit đã dùng
      usedVideo: [],       // danh sách fileId video đã dùng
      status: 'idle',      // 'idle' | 'collecting' | 'running'
      startedAt: null,
      results: [],
    };
  }

  setCharacter(media) {
    this.session.character = media;
    this.session.status = 'collecting';
  }

  addFashion(media) {
    this.session.fashions.push({
      ...media,
      index: this.session.fashions.length + 1,
    });
    this.session.status = 'collecting';
  }

  addVideo(media) {
    this.session.videos.push({
      ...media,
      index: this.session.videos.length + 1,
    });
    this.session.status = 'collecting';
  }

  getSummary() {
    const { character, fashions, videos, status } = this.session;
    return {
      hasCharacter: !!character,
      fashionCount: fashions.length,
      videoCount: videos.length,
      status,
      isReady: !!character && fashions.length > 0 && videos.length > 0,
    };
  }
}

export const sessionManager = new BotSessionManager();
