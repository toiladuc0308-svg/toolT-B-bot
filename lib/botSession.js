/**
 * Quản lý Session mẻ đơn hàng hiện tại của Admin.
 */

export class BotSessionManager {
  constructor() {
    this.reset();
  }

  reset() {
    this.session = {
      character: null,     // { fileId, url, filename }
      fashion: null,       // { fileId, url, filename }
      videos: [],          // [ { fileId, url, filename, index } ]
      status: 'idle',      // 'idle' | 'collecting' | 'running'
      startedAt: null,
      results: [],         // [ { id, url, status: 'pending'|'done'|'error', approved: false } ]
      currentQueue: [],
    };
  }

  setCharacter(media) {
    this.session.character = media;
    this.session.status = 'collecting';
  }

  setFashion(media) {
    this.session.fashion = media;
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
    const { character, fashion, videos, status } = this.session;
    return {
      hasCharacter: !!character,
      hasFashion: !!fashion,
      videoCount: videos.length,
      status,
      isReady: !!character && !!fashion && videos.length > 0,
    };
  }
}

export const sessionManager = new BotSessionManager();
