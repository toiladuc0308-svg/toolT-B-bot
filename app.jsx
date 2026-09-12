import React from 'react';
import ReactDOM from 'react-dom/client';
import useStudio from './lib/useStudio.js';
import ProjectPicker from './components/ProjectPicker.jsx';
import { CharacterInput, FashionInput, VideoInput } from './components/MediaInputs.jsx';
import ModelSettings from './components/ModelSettings.jsx';
import RunSettings from './components/RunSettings.jsx';
import CreateBar from './components/CreateBar.jsx';
import SessionTabs from './components/SessionTabs.jsx';
import Storyboard from './components/Storyboard.jsx';
import StatsPanel from './components/StatsPanel.jsx';
import ProjectLibrary from './components/ProjectLibrary.jsx';
import TokenSettings from './components/TokenSettings.jsx';
import OpenArtAccountManager from './components/OpenArtAccountManager.jsx';

function App() {
  const s = useStudio();
  const session = s.sessions.find((x) => x.id === s.activeSession) || null;

  return (
    <div className="min-h-screen w-full bg-[#0d0d0d] text-white">
      <header className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-3 pl-[max(12px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))] border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <i className="ph ph-sparkle text-xl text-[#c7ff44]" aria-hidden="true" />
            <h1 className="text-base font-bold">Seedance Fashion Studio</h1>
          </div>
          <span className="rounded-md bg-[#c7ff44]/10 px-2 py-0.5 text-[10px] font-bold text-[#c7ff44]">
            79AI & OpenArt Edition
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#777777]">
          <OpenArtAccountManager />
          <TokenSettings />
          <span className="rounded-full bg-white/5 px-3 py-1">
            {s.sessions.length} phiên
          </span>
          <span className="rounded-full bg-white/5 px-3 py-1">
            {s.stats.done}/{s.stats.total} video
          </span>
        </div>
      </header>

      {s.toast ? (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl bg-[#f59e0b]/10 px-3 py-2 text-xs text-[#f59e0b]">
          <i className="ph ph-warning-circle" aria-hidden="true" />
          <span className="min-w-0 flex-1">{s.toast}</span>
          <button type="button" aria-label="Đóng thông báo" onClick={() => s.setToast('')}>
            <i className="ph ph-x" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <div className="grid w-full grid-cols-1 gap-3 px-3 pb-6 pl-[max(12px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))] lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        <aside className="sb-scroll w-full space-y-3 lg:max-h-[calc(100vh-72px)] lg:overflow-y-auto lg:pr-1">
          <ProjectPicker />
          <CharacterInput value={s.character} onChange={s.setCharacter} />
          <FashionInput
            items={s.fashion}
            onChange={s.setFashion}
            lockedUrls={s.lockedFashion}
            onResetLocks={s.resetFashionLocks}
          />
          <VideoInput
            items={s.videos}
            onChange={s.setVideos}
            lockedUrls={s.lockedVideo}
            onResetLocks={s.resetVideoLocks}
          />
          <ModelSettings
            loading={s.modelsLoading}
            error={s.modelsError}
            models={s.models}
            selectedId={s.selectedId}
            onSelectModel={s.setSelectedId}
            settings={s.modelSettings}
            onPatchSettings={s.patchModelSettings}
            prompt={s.prompt}
            onPromptChange={s.setPrompt}
          />
          <RunSettings value={s.runSettings} onPatch={s.patchRunSettings} />
        </aside>

        <main className="w-full space-y-3">
          <CreateBar
            concurrency={s.sessionSettings.concurrency}
            maxVideos={s.sessionSettings.maxVideos}
            onPatch={s.patchSessionSettings}
            onCreate={s.createSession}
            onStopAll={() => session && s.stopSession(session.id)}
            canCreate={!s.blockedReason}
            running={s.running}
            blockedReason={s.blockedReason}
          />
          <StatsPanel stats={s.stats} />
          <SessionTabs
            sessions={s.sessions}
            activeId={s.activeSession}
            onSelect={s.setActiveSession}
            onClose={s.closeSession}
          />
          <Storyboard
            session={session}
            columns={s.sessionSettings.columns}
            onColumns={(n) => s.patchSessionSettings({ columns: n })}
            timeoutSeconds={s.runSettings.timeoutSeconds}
            onRetry={s.retryScene}
            tick={s.tick}
          />
          <ProjectLibrary refreshSignal={s.stats.done} />
        </main>
      </div>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  if (!container._reactRoot) {
    container._reactRoot = ReactDOM.createRoot(container);
  }
  container._reactRoot.render(<App />);
}

export default App;