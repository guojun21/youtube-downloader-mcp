import { Download } from 'lucide-react';
import { DownloadItem } from './DownloadItem';
import type { ActiveVideoDownloadItem } from '../../types';
import styles from './ActiveDownloadsList.module.css';

interface ActiveDownloadsListProps {
  downloads: ActiveVideoDownloadItem[];
}

export function ActiveDownloadsList({ downloads }: ActiveDownloadsListProps) {
  if (downloads.length === 0) return null;
  return (
    <section className={styles.section}>
      <h2 className={styles.heading}><Download size={18} /> Active Downloads</h2>
      <div className={styles.list}>
        {downloads.map((dl) => (
          <DownloadItem key={dl.id} download={dl} />
        ))}
      </div>
    </section>
  );
}
