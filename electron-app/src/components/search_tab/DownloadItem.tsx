import { Check, AlertCircle } from 'lucide-react';
import { Spinner } from '../shared/Spinner';
import type { ActiveVideoDownloadItem } from '../../types';
import styles from './DownloadItem.module.css';

interface DownloadItemProps {
  download: ActiveVideoDownloadItem;
}

export function DownloadItem({ download }: DownloadItemProps) {
  const { video, option, progress } = download;
  return (
    <div className={styles.item}>
      <img className={styles.thumb} src={video.thumbnailUrl} alt="" />
      <div className={styles.info}>
        <h4 className={styles.title}>{video.title}</h4>
        <p className={styles.meta}>{option.quality} &middot; {option.container}</p>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progress.percentage}%` }} />
        </div>
        <span className={styles.status}>
          {progress.status === 'Completed' ? (
            <><Check size={14} /> Completed</>
          ) : progress.status === 'Failed' ? (
            <><AlertCircle size={14} /> {progress.error}</>
          ) : (
            <><Spinner size={14} /> {progress.percentage}%</>
          )}
        </span>
      </div>
    </div>
  );
}
