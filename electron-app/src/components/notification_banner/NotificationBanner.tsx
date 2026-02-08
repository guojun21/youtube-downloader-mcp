import { Check, AlertCircle, X } from 'lucide-react';
import styles from './NotificationBanner.module.css';

interface NotificationBannerProps {
  message: string;
  onDismiss: () => void;
}

/**
 * Why: unified banner for both success and error notifications.
 * Success is detected by a "Subtitle saved:" prefix (convention from the download flow).
 */
export function NotificationBanner({ message, onDismiss }: NotificationBannerProps) {
  const isSuccess = message.startsWith('Subtitle saved');
  return (
    <div className={`${styles.banner} ${isSuccess ? styles.success : styles.error}`}>
      {isSuccess ? <Check size={16} /> : <AlertCircle size={16} />}
      <span className={styles.text}>{message}</span>
      <button className={styles.dismiss} onClick={onDismiss}>
        <X size={16} />
      </button>
    </div>
  );
}
