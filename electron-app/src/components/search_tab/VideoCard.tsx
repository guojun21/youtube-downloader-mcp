import type { YoutubeVideoSearchResultInfo } from '../../types';
import styles from './VideoCard.module.css';

interface VideoCardProps {
  video: YoutubeVideoSearchResultInfo;
  onClick: () => void;
}

export function VideoCard({ video, onClick }: VideoCardProps) {
  return (
    <div className={styles.card} onClick={onClick}>
      <div className={styles.thumbnail}>
        <img src={video.thumbnailUrl} alt="" />
        <span className={styles.duration}>{video.duration}</span>
      </div>
      <div className={styles.info}>
        <h3 className={styles.title}>{video.title}</h3>
        <p className={styles.author}>{video.author}</p>
      </div>
    </div>
  );
}
