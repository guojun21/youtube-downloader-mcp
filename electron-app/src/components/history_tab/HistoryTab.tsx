import { Clock } from 'lucide-react';
import { HistoryList } from './HistoryList';
import { EmptyState } from '../shared/EmptyState';
import { Spinner } from '../shared/Spinner';
import type { TaskHistoryRecord } from '../../types';

interface HistoryTabProps {
  records: TaskHistoryRecord[];
  isLoading: boolean;
}

export function HistoryTab({ records, isLoading }: HistoryTabProps) {
  if (isLoading && records.length === 0) {
    return (
      <EmptyState
        icon={<Spinner size={48} />}
        message="Loading history..."
      />
    );
  }

  if (records.length === 0) {
    return (
      <EmptyState
        icon={<Clock size={64} strokeWidth={1} />}
        title="No History"
        message="Download a video or subtitle to see it here"
      />
    );
  }

  return <HistoryList records={records} />;
}
