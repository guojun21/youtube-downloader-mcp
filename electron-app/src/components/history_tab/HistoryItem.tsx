import { Download, FileText, FolderOpen, Mic } from 'lucide-react';
import { formatRelativeTime } from '../../utils/format_relative_time';
import type { TaskHistoryRecord } from '../../types';
import styles from './HistoryItem.module.css';

interface HistoryItemProps {
  task: TaskHistoryRecord;
}

function statusColor(status: string): string {
  if (status === 'completed') return 'var(--success)';
  if (status === 'failed') return 'var(--error)';
  if (status === 'running' || status === 'downloading') return 'var(--accent)';
  return 'var(--text-secondary)';
}

export function HistoryItem({ task }: HistoryItemProps) {
  return (
    <div className={styles.item}>
      <div className={styles.icon}>
        {task.type === 'transcription'
          ? <Mic size={20} />
          : task.type === 'subtitle'
            ? <FileText size={20} />
            : <Download size={20} />}
      </div>
      <div className={styles.info}>
        <h4 className={styles.title}>
          {task.file_name || task.video_id || (task.video_file_path ? task.video_file_path.split('/').pop() : task.id)}
        </h4>
        <div className={styles.meta}>
          <span className={styles.type}>{task.type}</span>
          <span className={styles.status} style={{ color: statusColor(task.status) }}>
            {task.status}
            {task.type === 'transcription' && task.percentage != null && task.status !== 'completed'
              ? ` (${task.percentage}%)`
              : ''}
          </span>
          <span className={styles.time}>{formatRelativeTime(task.created_at)}</span>
          {(task.language || task.detected_language) && (
            <span className={styles.lang}>{task.detected_language || task.language}</span>
          )}
          {task.elapsed_seconds && (
            <span className={styles.lang}>{task.elapsed_seconds}s</span>
          )}
        </div>
        {task.error && <p className={styles.error}>{task.error}</p>}
        {task.transcript_path && task.type === 'transcription' && (
          <p className={styles.path}>
            <FileText size={12} /> {task.transcript_path}
          </p>
        )}
        {task.output_path && (
          <p className={styles.path}>
            <FolderOpen size={12} /> {task.output_path}
          </p>
        )}
      </div>
    </div>
  );
}
