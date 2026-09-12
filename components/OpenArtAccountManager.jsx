import React from 'react';
import {
  loadAccounts,
  saveAccounts,
  loadRotationSettings,
  saveRotationSettings,
  parseBulkAccounts,
  verifyAccount,
  verifyAllAccounts,
  DEFAULT_ROTATION_SETTINGS,
} from '../lib/openartPool.js';

export default function OpenArtAccountManager() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [tab, setTab] = React.useState('list');
  const [accounts, setAccounts] = React.useState([]);
  const [settings, setSettings] = React.useState(DEFAULT_ROTATION_SETTINGS);
  const [bulkText, setBulkText] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [progress, setProgress] = React.useState(null);
  const [statusMsg, setStatusMsg] = React.useState('');

  React.useEffect(() => {
    setAccounts(loadAccounts());
    setSettings(loadRotationSettings());
  }, []);

  const updateAccounts = (newAccounts) => {
    setAccounts(newAccounts);
    saveAccounts(newAccounts);
  };

  const updateSettings = (newSettings) => {
    setSettings(newSettings);
    saveRotationSettings(newSettings);
  };

  const totalAccounts = accounts.length;
  const activeAccounts = accounts.filter((a) => a.status === 'active' && a.credits > 0);
  const totalCredits = accounts.reduce((sum, a) => sum + (Number(a.credits) || 0), 0);

  const handleBulkImport = async () => {
    if (!bulkText.trim()) return;
    setLoading(true);
    setStatusMsg('Đang phân tích danh sách tài khoản...');

    const parsed = parseBulkAccounts(bulkText);
    if (parsed.length === 0) {
      setStatusMsg('⚠️ Không tìm thấy tài khoản hợp lệ. Vui lòng kiểm tra định dạng email|password.');
      setLoading(false);
      return;
    }

    const existingEmails = new Set(accounts.map((a) => a.email.toLowerCase()));
    const newItems = parsed.filter((p) => !existingEmails.has(p.email.toLowerCase()));

    if (newItems.length === 0) {
      setStatusMsg('⚠️ Tất cả tài khoản trong danh sách đã có sẵn trong hệ thống.');
      setLoading(false);
      return;
    }

    setStatusMsg(`Đã thêm ${newItems.length} tài khoản mới. Đang kiểm tra đăng nhập...`);
    const merged = [...accounts, ...newItems];
    updateAccounts(merged);
    setBulkText('');

    for (let i = 0; i < newItems.length; i++) {
      const idx = merged.findIndex((a) => a.id === newItems[i].id);
      if (idx !== -1) {
        setProgress({ current: i + 1, total: newItems.length, email: newItems[i].email });
        merged[idx] = await verifyAccount(merged[idx]);
        updateAccounts([...merged]);
      }
    }

    setProgress(null);
    setLoading(false);
    setStatusMsg(`✅ Đã nạp và kiểm tra xong ${newItems.length} tài khoản!`);
    setTab('list');
  };

  const handleLoadSample = () => {
    setBulkText('cw25lyw69o@aidesigner.2bd.net|FlLnqQ8hd6R7');
  };

  const handleVerifySingle = async (id) => {
    const acc = accounts.find((a) => a.id === id);
    if (!acc) return;
    setLoading(true);
    const updated = await verifyAccount(acc);
    updateAccounts(accounts.map((a) => (a.id === id ? updated : a)));
    setLoading(false);
  };

  const handleVerifyAll = async () => {
    if (accounts.length === 0) return;
    setLoading(true);
    await verifyAllAccounts(accounts, (p) => {
      setProgress({ current: p.current, total: p.total, email: p.account.email });
    });
    setAccounts(loadAccounts());
    setProgress(null);
    setLoading(false);
    setStatusMsg('✅ Đã kiểm tra và làm mới trạng thái toàn bộ tài khoản!');
  };

  const handleDelete = (id) => {
    updateAccounts(accounts.filter((a) => a.id !== id));
  };

  const handleClearAll = () => {
    if (window.confirm('Sếp có chắc chắn muốn xóa toàn bộ tài khoản OpenArt khỏi danh sách không?')) {
      updateAccounts([]);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium transition hover:border-[#a855f7]/50 hover:bg-[#a855f7]/10"
        title="Quản lý và xoay tour tài khoản OpenArt"
      >
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            activeAccounts.length > 0 ? 'bg-[#a855f7] shadow-[0_0_8px_#a855f7]' : 'bg-[#777777]'
          }`}
        />
        <i className="ph ph-paint-brush-broad text-[#a855f7]" aria-hidden="true" />
        <span className="font-semibold text-white">OpenArt Pool:</span>
        <span className="rounded-md bg-[#a855f7]/20 px-1.5 py-0.5 text-[11px] font-bold text-[#d8b4fe]">
          {activeAccounts.length}/{totalAccounts} Acc
        </span>
        <span className="text-[#a3a3a3]">
          ({totalCredits.toLocaleString()} cr)
        </span>
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="flex h-[88vh] w-full max-w-4xl flex-col rounded-2xl border border-white/10 bg-[#141416] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#a855f7]/20 text-[#a855f7]">
                  <i className="ph ph-paint-brush-broad text-2xl" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">
                    OpenArt Multi-Account Studio & Rotation Pool
                  </h2>
                  <p className="text-xs text-[#888888]">
                    Tự động xoay vòng tài khoản khi tạo ảnh & video mà không lo cạn credit
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-[#888888] hover:bg-white/10 hover:text-white"
              >
                <i className="ph ph-x text-lg" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-3 border-b border-white/5 bg-[#18181b] px-6 py-3 text-xs">
              <div>
                <span className="text-[#777777]">Tổng tài khoản:</span>
                <p className="text-sm font-bold text-white">{totalAccounts}</p>
              </div>
              <div>
                <span className="text-[#777777]">Đang hoạt động:</span>
                <p className="text-sm font-bold text-[#a855f7]">{activeAccounts.length} acc</p>
              </div>
              <div>
                <span className="text-[#777777]">Tổng số dư Credits:</span>
                <p className="text-sm font-bold text-[#c7ff44]">{totalCredits.toLocaleString()} credits</p>
              </div>
              <div>
                <span className="text-[#777777]">Chế độ xoay tour:</span>
                <p className="text-sm font-bold text-[#38bdf8]">
                  {settings.mode === 'round_robin' ? 'Xoay vòng tuần tự' : 'Dùng cạn lần lượt'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 border-b border-white/10 px-6 pt-3">
              <button
                type="button"
                onClick={() => setTab('list')}
                className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
                  tab === 'list'
                    ? 'border-[#a855f7] text-[#a855f7]'
                    : 'border-transparent text-[#888888] hover:text-white'
                }`}
              >
                <i className="ph ph-users text-sm" />
                <span>Danh Sách Tài Khoản ({accounts.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('import')}
                className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
                  tab === 'import'
                    ? 'border-[#a855f7] text-[#a855f7]'
                    : 'border-transparent text-[#888888] hover:text-white'
                }`}
              >
                <i className="ph ph-plus-circle text-sm" />
                <span>Nạp Hàng Loạt (Bulk Import)</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('settings')}
                className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
                  tab === 'settings'
                    ? 'border-[#a855f7] text-[#a855f7]'
                    : 'border-transparent text-[#888888] hover:text-white'
                }`}
              >
                <i className="ph ph-gear text-sm" />
                <span>Cài Đặt Xoay Tour</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {progress ? (
                <div className="mb-4 rounded-xl border border-[#a855f7]/30 bg-[#a855f7]/10 p-3 text-xs text-[#d8b4fe]">
                  <div className="flex items-center justify-between mb-1">
                    <span>Đang kiểm tra: <b>{progress.email}</b></span>
                    <span>{progress.current}/{progress.total}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/40">
                    <div
                      className="h-full bg-[#a855f7] transition-all duration-300"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              ) : null}

              {statusMsg ? (
                <div className="mb-4 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs text-[#c7ff44]">
                  {statusMsg}
                </div>
              ) : null}

              {tab === 'list' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#888888]">
                      Danh sách tài khoản được lưu trong máy và tự động xoay tour khi render
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleVerifyAll}
                        disabled={loading || accounts.length === 0}
                        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10 disabled:opacity-50"
                      >
                        <i className={`ph ph-arrows-clockwise ${loading ? 'animate-spin' : ''}`} />
                        <span>Kiểm tra toàn bộ</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleClearAll}
                        disabled={loading || accounts.length === 0}
                        className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
                      >
                        <i className="ph ph-trash" />
                        <span>Xóa tất cả</span>
                      </button>
                    </div>
                  </div>

                  {accounts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 py-16 text-center">
                      <i className="ph ph-users text-4xl text-[#555555] mb-2" />
                      <p className="text-sm font-semibold text-white">Chưa có tài khoản OpenArt nào trong Pool</p>
                      <p className="text-xs text-[#777777] max-w-sm mt-1">
                        Sếp bấm chuyển sang tab "Nạp Hàng Loạt" để dán danh sách tài khoản OpenArt vào nhé!
                      </p>
                      <button
                        type="button"
                        onClick={() => setTab('import')}
                        className="mt-4 rounded-xl bg-[#a855f7] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#9333ea]"
                      >
                        + Nạp tài khoản ngay
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {accounts.map((acc, index) => {
                        const isOk = acc.status === 'active' && acc.credits > 0;
                        const isExhausted = acc.status === 'exhausted' || (acc.status === 'active' && acc.credits === 0);
                        const isErr = acc.status === 'error';

                        return (
                          <div
                            key={acc.id}
                            className="flex items-center justify-between rounded-xl border border-white/5 bg-[#18181b] p-3 text-xs transition hover:border-white/10"
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/5 text-[11px] font-bold text-[#777777]">
                                {index + 1}
                              </span>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-white">{acc.email}</span>
                                  {acc.isSubscribed ? (
                                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                                      VIP Sub
                                    </span>
                                  ) : null}
                                </div>
                                <div className="text-[11px] text-[#777777] flex items-center gap-2 mt-0.5">
                                  <span>User: {acc.username || 'Chưa rõ'}</span>
                                  {acc.lastChecked ? (
                                    <span>• Đã check: {new Date(acc.lastChecked).toLocaleTimeString()}</span>
                                  ) : null}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <span
                                    className={`inline-block h-2 w-2 rounded-full ${
                                      isOk
                                        ? 'bg-[#c7ff44] shadow-[0_0_6px_#c7ff44]'
                                        : isExhausted
                                        ? 'bg-amber-500'
                                        : isErr
                                        ? 'bg-red-500'
                                        : 'bg-gray-500'
                                    }`}
                                  />
                                  <span
                                    className={`font-bold ${
                                      isOk
                                        ? 'text-[#c7ff44]'
                                        : isExhausted
                                        ? 'text-amber-400'
                                        : isErr
                                        ? 'text-red-400'
                                        : 'text-gray-400'
                                    }`}
                                  >
                                    {isOk
                                      ? `${acc.credits.toLocaleString()} cr`
                                      : isExhausted
                                      ? 'Hết credit'
                                      : isErr
                                      ? 'Lỗi đăng nhập'
                                      : 'Chưa kiểm tra'}
                                  </span>
                                </div>
                                {isErr && acc.error ? (
                                  <p className="text-[10px] text-red-400/80 max-w-[200px] truncate">
                                    {acc.error}
                                  </p>
                                ) : null}
                              </div>

                              <button
                                type="button"
                                onClick={() => handleVerifySingle(acc.id)}
                                title="Kiểm tra lại tài khoản này"
                                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-[#888888] transition hover:bg-white/10 hover:text-white"
                              >
                                <i className="ph ph-arrows-clockwise text-sm" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(acc.id)}
                                title="Xóa khỏi danh sách"
                                className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/10 text-red-400 transition hover:bg-red-500/20"
                              >
                                <i className="ph ph-trash text-sm" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {tab === 'import' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-white">Dán danh sách tài khoản</h3>
                      <p className="text-[11px] text-[#777777]">
                        Mỗi tài khoản trên 1 dòng. Định dạng hỗ trợ: <code className="text-[#a855f7]">email|matkhau</code> hoặc <code className="text-[#a855f7]">email:matkhau</code>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleLoadSample}
                      className="rounded-lg border border-[#a855f7]/30 bg-[#a855f7]/10 px-2.5 py-1 text-[11px] font-medium text-[#d8b4fe] transition hover:bg-[#a855f7]/20"
                    >
                      Dán mẫu của Sếp
                    </button>
                  </div>

                  <textarea
                    rows={8}
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder={`cw25lyw69o@aidesigner.2bd.net|FlLnqQ8hd6R7\nuser2@example.com|Matkhau123\nuser3@example.com:Matkhau456`}
                    className="w-full rounded-xl border border-white/10 bg-[#0d0d0e] p-3 text-xs font-mono text-white placeholder:text-[#555555] focus:border-[#a855f7] focus:outline-none focus:ring-1 focus:ring-[#a855f7]"
                  />

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setBulkText('')}
                      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-[#888888] transition hover:text-white"
                    >
                      Xóa trắng
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkImport}
                      disabled={loading || !bulkText.trim()}
                      className="flex items-center gap-2 rounded-xl bg-[#a855f7] px-5 py-2 text-xs font-bold text-white transition hover:bg-[#9333ea] disabled:opacity-50"
                    >
                      <i className="ph ph-lightning text-sm" />
                      <span>Thêm & Tự Động Kiểm Tra</span>
                    </button>
                  </div>
                </div>
              )}

              {tab === 'settings' && (
                <div className="space-y-6 max-w-lg">
                  <div>
                    <label className="text-xs font-bold text-white block mb-1">
                      Chiến lược xoay tour (Rotation Strategy)
                    </label>
                    <p className="text-[11px] text-[#777777] mb-3">
                      Cách thức Tool tự động chọn tài khoản OpenArt khi bạn thực hiện render
                    </p>

                    <div className="space-y-2">
                      <label
                        className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition ${
                          settings.mode === 'round_robin'
                            ? 'border-[#a855f7] bg-[#a855f7]/10'
                            : 'border-white/5 bg-[#18181b]'
                        }`}
                      >
                        <input
                          type="radio"
                          name="mode"
                          checked={settings.mode === 'round_robin'}
                          onChange={() => updateSettings({ ...settings, mode: 'round_robin' })}
                          className="mt-0.5 text-[#a855f7] focus:ring-[#a855f7]"
                        />
                        <div>
                          <p className="text-xs font-bold text-white">Xoay vòng tuần tự (Round-Robin)</p>
                          <p className="text-[11px] text-[#888888]">
                            Mỗi lượt render sẽ đổi lần lượt sang tài khoản tiếp theo (Acc 1 ➔ Acc 2 ➔ Acc 3...). Chia đều lượt dùng cho các tài khoản.
                          </p>
                        </div>
                      </label>

                      <label
                        className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition ${
                          settings.mode === 'waterfall'
                            ? 'border-[#a855f7] bg-[#a855f7]/10'
                            : 'border-white/5 bg-[#18181b]'
                        }`}
                      >
                        <input
                          type="radio"
                          name="mode"
                          checked={settings.mode === 'waterfall'}
                          onChange={() => updateSettings({ ...settings, mode: 'waterfall' })}
                          className="mt-0.5 text-[#a855f7] focus:ring-[#a855f7]"
                        />
                        <div>
                          <p className="text-xs font-bold text-white">Dùng cạn lần lượt (Waterfall)</p>
                          <p className="text-[11px] text-[#888888]">
                            Ưu tiên dùng hết sạch credit của tài khoản hiện tại rồi mới tự động chuyển sang tài khoản kế tiếp.
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-white block mb-1">
                      Ngưỡng credit tối thiểu
                    </label>
                    <p className="text-[11px] text-[#777777] mb-2">
                      Nếu tài khoản còn ít hơn số credit này, tool sẽ tự động coi là hết lượt và chuyển sang tài khoản khác
                    </p>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={settings.minCreditsThreshold}
                      onChange={(e) =>
                        updateSettings({
                          ...settings,
                          minCreditsThreshold: Number(e.target.value) || 1,
                        })
                      }
                      className="w-32 rounded-xl border border-white/10 bg-[#0d0d0e] px-3 py-1.5 text-xs text-white focus:border-[#a855f7] focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-white/10 px-6 py-3 bg-[#111113]">
              <span className="text-[11px] text-[#777777]">
                Mẹo: Hệ thống tự động lưu mật khẩu cục bộ trên máy tính của bạn an toàn.
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-xl bg-white/10 px-5 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
