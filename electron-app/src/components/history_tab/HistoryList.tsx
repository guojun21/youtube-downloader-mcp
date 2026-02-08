import { HistoryItem } from './HistoryItem';
import type { TaskHistoryRecord } from '../../types';
import styles from './HistoryList.module.css';

interface HistoryListProps {
  records: TaskHistoryRecord[];
}

export function HistoryList({ records }: HistoryListProps) {
  return (
    <div className={styles.list}>
      {records.map((task) => (
        <HistoryItem key={task.id} task={task} />
      ))}
    </div>
  );
}
