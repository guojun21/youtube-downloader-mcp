import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Download, Settings, X, Check, Loader2, AlertCircle } from 'lucide-react';
import { youtubeDownloaderApiClient } from './api/youtube';
import type {
  YoutubeVideoSearchResultInfo,
  VideoDownloadFormatOption,
  ActiveVideoDownloadItem,
} from './types';
import './App.css';

function App() {
  const [searchResultVideos, setSearchResultVideos] = useState<
    YoutubeVideoSearchResultInfo[]
  >([]);
  const [isSearchInProgress, setIsSearchInProgress] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeDownloads, setActiveDownloads] = useState<
    ActiveVideoDownloadItem[]
  >([]);
  const [selectedVideoForDownload, setSelectedVideoForDownload] =
    useState<YoutubeVideoSearchResultInfo | null>(null);
  const [availableDownloadOptions, setAvailableDownloadOptions] = useState<
    VideoDownloadFormatOption[]
  >([]);
  const [isLoadingDownloadOptions, setIsLoadingDownloadOptions] =
    useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleSearchSubmission = async () => {
    const searchQuery = searchInputRef.current?.value || '';
    if (!searchQuery.trim()) return;

    setIsSearchInProgress(true);
    setErrorMessage(null);

    try {
      const searchResponse =
        await youtubeDownloaderApiClient.searchVideosByQuery(searchQuery);
      setSearchResultVideos(searchResponse.videos);
    } catch (error: unknown) {
      const displayError =
        error instanceof Error ? error.message : 'Search failed';
      setErrorMessage(displayError);
    } finally {
      setIsSearchInProgress(false);
    }
  };

  const handleVideoSelectionForDownload = async (
    video: YoutubeVideoSearchResultInfo
  ) => {
    setSelectedVideoForDownload(video);
    setIsLoadingDownloadOptions(true);

    try {
      const downloadOptions =
        await youtubeDownloaderApiClient.getAvailableDownloadOptionsForVideo(
          video.id
        );
      setAvailableDownloadOptions(downloadOptions);
    } catch (error: unknown) {
      const displayError =
        error instanceof Error ? error.message : 'Failed to get options';
      setErrorMessage(displayError);
    } finally {
      setIsLoadingDownloadOptions(false);
    }
  };

  const handleDownloadStart = async (
    selectedOption: VideoDownloadFormatOption
  ) => {
    if (!selectedVideoForDownload) return;

    try {
      const downloadTrackingId =
        await youtubeDownloaderApiClient.startVideoDownloadTask(
          selectedVideoForDownload.id,
          selectedOption.container,
          selectedOption.quality
        );

      const newActiveDownload: ActiveVideoDownloadItem = {
        id: `${selectedVideoForDownload.id}-${Date.now()}`,
        downloadId: downloadTrackingId,
        video: selectedVideoForDownload,
        option: selectedOption,
        progress: { status: 'Starting', percentage: 0 },
      };

      setActiveDownloads((previousDownloads) => [
        newActiveDownload,
        ...previousDownloads,
      ]);
      setSelectedVideoForDownload(null);
      setAvailableDownloadOptions([]);
    } catch (error: unknown) {
      const displayError =
        error instanceof Error ? error.message : 'Download failed';
      setErrorMessage(displayError);
    }
  };

  const pollAndUpdateActiveDownloadProgress = useCallback(async () => {
    const downloadsStillInProgress = activeDownloads.filter(
      (download) =>
        download.progress.status !== 'Completed' &&
        download.progress.status !== 'Failed'
    );

    for (const activeDownload of downloadsStillInProgress) {
      try {
        const latestProgress =
          await youtubeDownloaderApiClient.getDownloadProgressByTrackingId(
            activeDownload.downloadId
          );
        setActiveDownloads((previousDownloads) =>
          previousDownloads.map((download) =>
            download.id === activeDownload.id
              ? { ...download, progress: latestProgress }
              : download
          )
        );
      } catch {
        // Why: transient polling errors should not disrupt the UI
      }
    }
  }, [activeDownloads]);

  useEffect(() => {
    const pollingInterval = setInterval(
      pollAndUpdateActiveDownloadProgress,
      1000
    );
    return () => clearInterval(pollingInterval);
  }, [pollAndUpdateActiveDownloadProgress]);

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="search-box">
          <Search className="search-icon" size={20} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Paste YouTube URL or search..."
            onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmission()}
          />
          <button onClick={handleSearchSubmission} disabled={isSearchInProgress}>
            {isSearchInProgress ? (
              <Loader2 className="spin" size={20} />
            ) : (
              'Search'
            )}
          </button>
        </div>
        <button className="settings-btn">
          <Settings size={20} />
        </button>
      </header>

      {/* Error message */}
      {errorMessage && (
        <div className="error-banner">
          <AlertCircle size={16} />
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Main content */}
      <main className="main">
        {/* Downloads section */}
        {activeDownloads.length > 0 && (
          <section className="downloads-section">
            <h2>
              <Download size={18} /> Downloads
            </h2>
            <div className="downloads-list">
              {activeDownloads.map((download) => (
                <div key={download.id} className="download-item">
                  <img src={download.video.thumbnailUrl} alt="" />
                  <div className="download-info">
                    <h4>{download.video.title}</h4>
                    <p>
                      {download.option.quality} • {download.option.container}
                    </p>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${download.progress.percentage}%` }}
                      />
                    </div>
                    <span className="progress-text">
                      {download.progress.status === 'Completed' ? (
                        <>
                          <Check size={14} /> Completed
                        </>
                      ) : download.progress.status === 'Failed' ? (
                        <>
                          <AlertCircle size={14} /> {download.progress.error}
                        </>
                      ) : (
                        <>
                          <Loader2 className="spin" size={14} />{' '}
                          {download.progress.percentage}%
                        </>
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Search results */}
        {searchResultVideos.length > 0 && (
          <section className="videos-section">
            <h2>Search Results</h2>
            <div className="videos-grid">
              {searchResultVideos.map((video) => (
                <div
                  key={video.id}
                  className="video-card"
                  onClick={() => handleVideoSelectionForDownload(video)}
                >
                  <div className="thumbnail">
                    <img src={video.thumbnailUrl} alt="" />
                    <span className="duration">{video.duration}</span>
                  </div>
                  <div className="video-info">
                    <h3>{video.title}</h3>
                    <p>{video.author}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {searchResultVideos.length === 0 &&
          activeDownloads.length === 0 &&
          !isSearchInProgress && (
            <div className="empty-state">
              <Download size={64} strokeWidth={1} />
              <h2>YouTube Downloader</h2>
              <p>Paste a YouTube URL or search for videos to get started</p>
            </div>
          )}
      </main>

      {/* Download options modal */}
      {selectedVideoForDownload && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedVideoForDownload(null)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => setSelectedVideoForDownload(null)}
            >
              <X size={20} />
            </button>
            <div className="modal-header">
              <img src={selectedVideoForDownload.thumbnailUrl} alt="" />
              <div>
                <h3>{selectedVideoForDownload.title}</h3>
                <p>{selectedVideoForDownload.author}</p>
              </div>
            </div>
            <div className="modal-body">
              <h4>Select format</h4>
              {isLoadingDownloadOptions ? (
                <div className="loading-options">
                  <Loader2 className="spin" size={24} />
                  <span>Loading options...</span>
                </div>
              ) : (
                <div className="options-list">
                  {availableDownloadOptions.map((option, index) => (
                    <button
                      key={index}
                      className="option-btn"
                      onClick={() => handleDownloadStart(option)}
                    >
                      <span className="option-quality">{option.quality}</span>
                      <span className="option-container">
                        {option.container}
                      </span>
                      <span className="option-size">{option.size}</span>
                      <Download size={16} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
