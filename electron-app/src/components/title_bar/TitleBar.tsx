import { Search, Clock } from 'lucide-react';
import styles from './TitleBar.module.css';

type TabId = 'search' | 'history';

interface TitleBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

/**
 * Why: top-level drag region for macOS hiddenInset title bar,
 * with tab navigation buttons positioned after the traffic lights.
 */
export function TitleBar({ activeTab, onTabChange }: TitleBarProps) {
  return (
    <div className={styles.titlebar}>
      <nav className={styles.tabNav}>
        <button
          className={`${styles.tabBtn} ${activeTab === 'search' ? styles.active : ''}`}
          onClick={() => onTabChange('search')}
        >
          <Search size={15} /> Search
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'history' ? styles.active : ''}`}
          onClick={() => onTabChange('history')}
        >
          <Clock size={15} /> History
        </button>
      </nav>
    </div>
  );
}
