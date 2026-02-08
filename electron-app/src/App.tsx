import { useState } from 'react';
import { youtubeDownloaderApiClient } from './api/youtube';
import { useDownloadPoller } from './hooks/use_download_poller';
import { useHistoryLoader } from './hooks/use_history_loader';
import { TitleBar } from './components/title_bar/TitleBar';
import { SearchBox } from './components/toolbar/SearchBox';
import { HistoryFilters } from './components/toolbar/HistoryFilters';
import { NotificationBanner } from './components/notification_banner/NotificationBanner';
import { SearchTab } from './components/search_tab/SearchTab';
import { HistoryTab } from './components/history_tab/HistoryTab';
import { DownloadModal } from './components/download_modal/DownloadModal';
import type {
  YoutubeVideoSearchResultInfo,
  VideoDownloadFormatOption,
  ActiveVideoDownloadItem,
} from './types';
import styles from './App.module.css';

type TabId = 'search' | 'history';

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('search');
  const [searchResults, setSearchResults] = useState<YoutubeVideoSearchResultInfo[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [activeDownloads, setActiveDownloads] = useState<ActiveVideoDownloadItem[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<YoutubeVideoSearchResultInfo | null>(null);
  const [downloadOptions, setDownloadOptions] = useState<VideoDownloadFormatOption[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [isDownloadingSubtitle, setIsDownloadingSubtitle] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('all');

  useDownloadPoller(activeDownloads, setActiveDownloads);
  const { historyRecords, isLoading: isLoadingHistory, refreshHistory } =
    useHistoryLoader(activeTab === 'history', historyFilter);

  const handleSearch = async (query: string) => {
    setIsSearching(true);
    setNotification(null);
    try {
      const res = await youtubeDownloaderApiClient.searchVideosByQuery(query);
      setSearchResults(res.videos);
    } catch (e: unknown) {
      setNotification(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const handleVideoClick = async (video: YoutubeVideoSearchResultInfo) => {
    setSelectedVideo(video);
    setIsLoadingOptions(true);
    try {
      const opts = await youtubeDownloaderApiClient.getAvailableDownloadOptionsForVideo(video.id);
      setDownloadOptions(opts);
    } catch (e: unknown) {
      setNotification(e instanceof Error ? e.message : 'Failed to get options');
    } finally {
      setIsLoadingOptions(false);
    }
  };

  const handleDownload = async (option: VideoDownloadFormatOption) => {
    if (!selectedVideo) return;
    try {
      const trackingId = await youtubeDownloaderApiClient.startVideoDownloadTask(
        selectedVideo.id, option.container, option.quality,
      );
      setActiveDownloads((prev) => [{
        id: `${selectedVideo.id}-${Date.now()}`,
        downloadId: trackingId,
        video: selectedVideo,
        option,
        progress: { status: 'Starting', percentage: 0 },
      }, ...prev]);
      setSelectedVideo(null);
      setDownloadOptions([]);
    } catch (e: unknown) {
      setNotification(e instanceof Error ? e.message : 'Download failed');
    }
  };

  const handleSubtitleDownload = async (language: string) => {
    if (!selectedVideo) return;
    setIsDownloadingSubtitle(true);
    try {
      const result = await youtubeDownloaderApiClient.downloadSubtitle(selectedVideo.id, language);
      if (result.success) {
        setSelectedVideo(null);
        setNotification(`Subtitle saved: ${result.subtitlePath}`);
      } else {
        setNotification(result.message || result.error || 'Subtitle download failed');
      }
    } catch (e: unknown) {
      setNotification(e instanceof Error ? e.message : 'Subtitle download failed');
    } finally {
      setIsDownloadingSubtitle(false);
    }
  };

  const handleTranscribe = async (language: string) => {
    if (!selectedVideo) return;
    setIsTranscribing(true);
    try {
      const result = await youtubeDownloaderApiClient.startTranscription(selectedVideo.id, language);
      if (result.success) {
        setSelectedVideo(null);
        setNotification(`Transcription started (task: ${result.taskId}). Check History tab for progress.`);
      } else {
        setNotification(result.error || 'Transcription failed to start');
      }
    } catch (e: unknown) {
      setNotification(e instanceof Error ? e.message : 'Transcription failed');
    } finally {
      setIsTranscribing(false);
    }
  };

  return (
    <div className={styles.app}>
      <TitleBar activeTab={activeTab} onTabChange={setActiveTab} />

      <div className={styles.toolbar}>
        {activeTab === 'search' && (
          <SearchBox isSearching={isSearching} onSearch={handleSearch} />
        )}
        {activeTab === 'history' && (
          <HistoryFilters
            activeFilter={historyFilter}
            isLoading={isLoadingHistory}
            onFilterChange={setHistoryFilter}
            onRefresh={refreshHistory}
          />
        )}
      </div>

      {notification && (
        <NotificationBanner message={notification} onDismiss={() => setNotification(null)} />
      )}

      <main className={styles.main}>
        {activeTab === 'search' && (
          <SearchTab
            videos={searchResults}
            activeDownloads={activeDownloads}
            isSearching={isSearching}
            onVideoClick={handleVideoClick}
          />
        )}
        {activeTab === 'history' && (
          <HistoryTab records={historyRecords} isLoading={isLoadingHistory} />
        )}
      </main>

      {selectedVideo && (
        <DownloadModal
          video={selectedVideo}
          downloadOptions={downloadOptions}
          isLoadingOptions={isLoadingOptions}
          isDownloadingSubtitle={isDownloadingSubtitle}
          isTranscribing={isTranscribing}
          onClose={() => setSelectedVideo(null)}
          onDownload={handleDownload}
          onSubtitleDownload={handleSubtitleDownload}
          onTranscribe={handleTranscribe}
        />
      )}
    </div>
  );
}

export default App;
