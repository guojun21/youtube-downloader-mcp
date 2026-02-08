import type { YoutubeVideoSearchResultInfo } from '../../types';
import { VideoCard } from './VideoCard';
import styles from './VideoGrid.module.css';

interface VideoGridProps {
  videos: YoutubeVideoSearchResultInfo[];
  onVideoClick: (video: YoutubeVideoSearchResultInfo) => void;
}

export function VideoGrid({ videos, onVideoClick }: VideoGridProps) {
  if (videos.length === 0) return null;
  return (
    <section>
      <h2 className={styles.heading}>Search Results</h2>
      <div className={styles.grid}>
        {videos.map((video) => (
          <VideoCard key={video.id} video={video} onClick={() => onVideoClick(video)} />
        ))}
      </div>
    </section>
  );
}
