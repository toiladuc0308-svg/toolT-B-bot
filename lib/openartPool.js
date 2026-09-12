/**
 * OpenArt Multi-Account Pool & Tour Rotation Manager
 * Quản lý danh sách tài khoản, tự động kiểm tra số dư và xoay vòng tour
 */

import { loginOpenArt, refreshOpenArtCredits } from './openartAuth.js';

const STORAGE_KEY_ACCOUNTS = 'openart_accounts_pool';
const STORAGE_KEY_SETTINGS = 'openart_rotation_settings';

export const DEFAULT_ROTATION_SETTINGS = {
  mode: 'round_robin', // 'round_robin' (xoay vòng tuần tự) hoặc 'waterfall' (dùng cạn từng acc)
  autoSkipExhausted: true, // Tự động bỏ qua tài khoản hết credit
  minCreditsThreshold: 5,  // Ngưỡng credit tối thiểu để coi là còn lượt
};

export function loadAccounts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACCOUNTS);
    if (!raw) {
      const defaultList = [
        {
          id: 'acc_sample_1',
          email: 'cw25lyw69o@aidesigner.2bd.net',
          password: 'FlLnqQ8hd6R7',
          username: 'beetle_knowledgeable_60_bee6bc',
          credits: 4240,
          isSubscribed: true,
          status: 'active',
          lastChecked: new Date().toISOString(),
          cookies: '',
          error: '',
        }
      ];
      saveAccounts(defaultList);
      return defaultList;
    }
    return JSON.parse(raw) || [];
  } catch (e) {
    console.error('[OpenArtPool] Lỗi đọc accounts từ localStorage:', e);
    return [];
  }
}

export function saveAccounts(accounts) {
  try {
    localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(accounts));
  } catch (e) {
    console.error('[OpenArtPool] Lỗi lưu accounts vào localStorage:', e);
  }
}

export function loadRotationSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (!raw) return { ...DEFAULT_ROTATION_SETTINGS };
    return { ...DEFAULT_ROTATION_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    return { ...DEFAULT_ROTATION_SETTINGS };
  }
}

export function saveRotationSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  } catch (e) {}
}

export function parseBulkAccounts(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];
  const lines = rawText.split('\n');
  const results = [];

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;

    let parts = [];
    if (line.includes('|')) parts = line.split('|');
    else if (line.includes(':') && !line.startsWith('http')) parts = line.split(':');
    else if (line.includes('\t')) parts = line.split('\t');
    else if (line.includes(',')) parts = line.split(',');
    else if (line.includes(' ')) parts = line.split(/\s+/);

    if (parts.length >= 2) {
      const email = parts[0].trim();
      const password = parts[1].trim();
      if (email.includes('@') && password) {
        results.push({
          id: 'acc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          email,
          password,
          username: email.split('@')[0],
          credits: 0,
          isSubscribed: false,
          status: 'unverified',
          lastChecked: null,
          cookies: '',
          error: '',
        });
      }
    }
  }

  return results;
}

export async function verifyAccount(account) {
  const res = await loginOpenArt(account.email, account.password);
  if (res.success) {
    return {
      ...account,
      username: res.username,
      credits: res.credits,
      isSubscribed: res.isSubscribed,
      subscriptionType: res.subscriptionType,
      status: res.credits > 0 ? 'active' : 'exhausted',
      cookies: res.cookies,
      lastChecked: res.lastChecked,
      error: '',
    };
  } else {
    return {
      ...account,
      status: 'error',
      error: res.error,
      lastChecked: res.lastChecked,
    };
  }
}

export async function verifyAllAccounts(accounts, onProgress) {
  const updated = [...accounts];
  for (let i = 0; i < updated.length; i++) {
    onProgress?.({ current: i + 1, total: updated.length, account: updated[i] });
    updated[i] = await verifyAccount(updated[i]);
  }
  saveAccounts(updated);
  return updated;
}

export function pickNextAccount(accounts, lastUsedId, settings = DEFAULT_ROTATION_SETTINGS) {
  if (!accounts || accounts.length === 0) return null;

  const threshold = Number(settings.minCreditsThreshold) || 1;
  const validAccounts = accounts.filter(
    (a) => a.status === 'active' && a.credits >= threshold
  );

  if (validAccounts.length === 0) {
    return null;
  }

  if (settings.mode === 'waterfall') {
    const current = validAccounts.find((a) => a.id === lastUsedId);
    if (current && current.credits >= threshold) {
      return current;
    }
    return validAccounts[0];
  }

  // Round-Robin
  const currentIndex = validAccounts.findIndex((a) => a.id === lastUsedId);
  if (currentIndex === -1 || currentIndex >= validAccounts.length - 1) {
    return validAccounts[0];
  }
  return validAccounts[currentIndex + 1];
}

export function markAccountExhaustedInPool(accounts, accountId) {
  const next = accounts.map((a) => {
    if (a.id === accountId) {
      return { ...a, status: 'exhausted', credits: 0 };
    }
    return a;
  });
  saveAccounts(next);
  return next;
}
