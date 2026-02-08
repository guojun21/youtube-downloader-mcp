import { useState } from 'react';
import { X, Subtitles, FileText, Download, Mic } from 'lucide-react';
import { Spinner } from '../shared/Spinner';
import type {
  YoutubeVideoSearchResultInfo,
  VideoDownloadFormatOption,
} from '../../types';
import styles from './DownloadModal.module.css';

interface DownloadModalProps {
  video: YoutubeVideoSearchResultInfo;
  downloadOptions: VideoDownloadFormatOption[];
  isLoadingOptions: boolean;
  isDownloadingSubtitle: boolean;
  isTranscribing: boolean;
  onClose: () => void;
  onDownload: (option: VideoDownloadFormatOption) => void;
  onSubtitleDownload: (language: string) => void;
  onTranscribe: (language: string) => void;
}

export function DownloadModal({
  video,
  downloadOptions,
  isLoadingOptions,
  isDownloadingSubtitle,
  isTranscribing,
  onClose,
  onDownload,
  onSubtitleDownload,
  onTranscribe,
}: DownloadModalProps) {
  const [subtitleLanguage, setSubtitleLanguage] = useState('en-orig,en');
  const [transcribeLanguage, setTranscribeLanguage] = useState('auto');

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>
          <X size={20} />
        </button>

        {/* Header */}
        <div className={styles.header}>
          <img className={styles.headerThumb} src={video.thumbnailUrl} alt="" />
          <div>
            <h3 className={styles.headerTitle}>{video.title}</h3>
            <p className={styles.headerAuthor}>{video.author}</p>
          </div>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Subtitle section */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>
              <Subtitles size={16} /> Download Subtitle
            </h4>
            <div className={styles.subtitleRow}>
              <input
                type="text"
                className={styles.subtitleInput}
                value={subtitleLanguage}
                onChange={(e) => setSubtitleLanguage(e.target.value)}
                placeholder="en-orig,en"
              />
              <button
                className={styles.subtitleBtn}
                onClick={() => onSubtitleDownload(subtitleLanguage)}
                disabled={isDownloadingSubtitle}
              >
                {isDownloadingSubtitle
                  ? <Spinner size={16} />
                  : <><FileText size={16} /> Get Subtitle</>}
              </button>
            </div>
          </div>

          {/* Transcription section */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>
              <Mic size={16} /> Transcribe (Local AI)
            </h4>
            <p className={styles.sectionHint}>
              Uses mlx-whisper on Apple Silicon GPU. Video must be downloaded first.
            </p>
            <div className={styles.subtitleRow}>
              <input
                type="text"
                className={styles.subtitleInput}
                value={transcribeLanguage}
                onChange={(e) => setTranscribeLanguage(e.target.value)}
                placeholder="auto, zh, en, ja, ko..."
              />
              <button
                className={styles.transcribeBtn}
                onClick={() => onTranscribe(transcribeLanguage)}
                disabled={isTranscribing}
              >
                {isTranscribing
                  ? <Spinner size={16} />
                  : <><Mic size={16} /> Transcribe</>}
              </button>
            </div>
          </div>

          {/* Video download section */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>
              <Download size={16} /> Download Video
            </h4>
            {isLoadingOptions ? (
              <div className={styles.loadingOptions}>
                <Spinner size={24} />
                <span>Loading formats...</span>
              </div>
            ) : (
              <div className={styles.optionsList}>
                {downloadOptions.map((option, index) => (
                  <button
                    key={index}
                    className={styles.optionBtn}
                    onClick={() => onDownload(option)}
                  >
                    <span className={styles.optionQuality}>{option.quality}</span>
                    <span className={styles.optionContainer}>{option.container}</span>
                    <span className={styles.optionSize}>{option.size}</span>
                    <Download size={16} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
