import { Spinner } from '../shared/Spinner';
import styles from './HistoryFilters.module.css';

interface HistoryFiltersProps {
  activeFilter: string;
  isLoading: boolean;
  onFilterChange: (filter: string) => void;
  onRefresh: () => void;
}

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'download', label: 'Downloads' },
  { value: 'subtitle', label: 'Subtitles' },
  { value: 'transcription', label: 'Transcriptions' },
];

export function HistoryFilters({ activeFilter, isLoading, onFilterChange, onRefresh }: HistoryFiltersProps) {
  return (
    <div className={styles.filters}>
      {FILTER_OPTIONS.map((f) => (
        <button
          key={f.value}
          className={`${styles.btn} ${activeFilter === f.value ? styles.active : ''}`}
          onClick={() => onFilterChange(f.value)}
        >
          {f.label}
        </button>
      ))}
      <button
        className={`${styles.btn} ${styles.refresh}`}
        onClick={onRefresh}
        disabled={isLoading}
      >
        {isLoading ? <Spinner size={14} /> : 'Refresh'}
      </button>
    </div>
  );
}
