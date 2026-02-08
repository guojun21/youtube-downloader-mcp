import { useRef } from 'react';
import { Search } from 'lucide-react';
import { Spinner } from '../shared/Spinner';
import styles from './SearchBox.module.css';

interface SearchBoxProps {
  isSearching: boolean;
  onSearch: (query: string) => void;
}

export function SearchBox({ isSearching, onSearch }: SearchBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    const query = inputRef.current?.value || '';
    if (query.trim()) onSearch(query);
  };

  return (
    <div className={styles.searchBox}>
      <Search className={styles.icon} size={18} />
      <input
        ref={inputRef}
        type="text"
        className={styles.input}
        placeholder="Paste YouTube URL or search for videos..."
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
      />
      <button
        className={styles.button}
        onClick={handleSubmit}
        disabled={isSearching}
      >
        {isSearching ? <Spinner size={18} /> : 'Search'}
      </button>
    </div>
  );
}
