import { Download } from 'lucide-react';
import { ActiveDownloadsList } from './ActiveDownloadsList';
import { VideoGrid } from './VideoGrid';
import { EmptyState } from '../shared/EmptyState';
import type {
  YoutubeVideoSearchResultInfo,
  ActiveVideoDownloadItem,
} from '../../types';

interface SearchTabProps {
  videos: YoutubeVideoSearchResultInfo[];
  activeDownloads: ActiveVideoDownloadItem[];
  isSearching: boolean;
  onVideoClick: (video: YoutubeVideoSearchResultInfo) => void;
}

export function SearchTab({ videos, activeDownloads, isSearching, onVideoClick }: SearchTabProps) {
  const showEmpty = videos.length === 0 && activeDownloads.length === 0 && !isSearching;

  return (
    <>
      <ActiveDownloadsList downloads={activeDownloads} />
      <VideoGrid videos={videos} onVideoClick={onVideoClick} />
      {showEmpty && (
        <EmptyState
          icon={<Download size={64} strokeWidth={1} />}
          title="YouTube Downloader"
          message="Paste a YouTube URL or search for videos to get started"
        />
      )}
    </>
  );
}
