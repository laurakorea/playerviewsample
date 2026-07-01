import { useState, useEffect, useRef } from 'react';

export default function AudioGuideScreen({ artwork, nextArtwork, onNavigate, onPrev, onHome, currentIndex, total }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef(null);

  useEffect(() => {
    setIsPlaying(false);
    setProgress(0);
    setElapsed(0);
  }, [artwork.id]);

  const handlePlayPause = () => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) {
      v.pause();
    } else {
      v.play().catch(() => {});
    }
    setIsPlaying(p => !p);
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    setElapsed(Math.floor(v.currentTime));
    setProgress((v.currentTime / v.duration) * 100);
  };

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (v) setDuration(Math.floor(v.duration));
  };

  const handleEnded = () => setIsPlaying(false);

  const handleProgressClick = (e) => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    v.currentTime = ratio * v.duration;
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const totalDisplay = duration > 0 ? formatTime(duration) : artwork.duration;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onPrev}>‹</button>
        <span style={styles.headerTitle}>경복궁 오디오 가이드 · {currentIndex + 1}/{total}</span>
        <button style={styles.closeBtn} onClick={onHome}>✕</button>
      </div>

      {/* Video / thumbnail */}
      <div style={styles.mediaBox}>
        <video
          ref={videoRef}
          src={artwork.videoSrc}
          poster={artwork.imageSrc}
          style={styles.video}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          playsInline
          preload="metadata"
        />
        {!isPlaying && (
          <div style={styles.playOverlay} onClick={handlePlayPause}>
            <div style={styles.overlayBtn}>▶</div>
          </div>
        )}
        {isPlaying && (
          <div style={styles.playOverlay} onClick={handlePlayPause} />
        )}
      </div>

      {/* Body */}
      <div style={styles.body}>
        <div style={styles.nowPlayingLabel}>지금 보는 작품</div>
        <h2 style={styles.artworkTitle}>{artwork.title}</h2>
        <p style={styles.artworkSubtitle}>{artwork.subtitle}</p>

        {/* Progress bar */}
        <div style={styles.progressWrap}>
          <div style={styles.progressBar} onClick={handleProgressClick}>
            <div style={{ ...styles.progressFill, width: `${progress}%` }} />
            <div style={{ ...styles.progressThumb, left: `${progress}%` }} />
          </div>
          <div style={styles.timeRow}>
            <span style={styles.timeText}>{formatTime(elapsed)}</span>
            <span style={styles.timeText}>{totalDisplay}</span>
          </div>
        </div>

        {/* Controls */}
        <button style={styles.playBtn} onClick={handlePlayPause}>
          <span style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</span>
        </button>

        <p style={styles.description}>{artwork.description}</p>
      </div>

      {/* Next artwork */}
      {nextArtwork ? (
        <div style={styles.nextSection}>
          <div style={styles.nextInfo}>
            <img
              src={nextArtwork.imageSrc}
              alt={nextArtwork.title}
              style={styles.nextThumb}
              onError={e => { e.target.style.display = 'none'; }}
            />
            <div>
              <div style={styles.nextLabel}>다음 작품</div>
              <div style={styles.nextTitle}>{nextArtwork.title}</div>
              <div style={styles.nextDistance}>{nextArtwork.subtitle}</div>
            </div>
          </div>
          <button style={styles.navigateBtn} onClick={onNavigate}>
            다음 작품으로 이동 →
          </button>
        </div>
      ) : (
        <div style={styles.nextSection}>
          <div style={styles.completeMsg}>🎉 투어가 완료되었습니다!</div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    background: '#fff',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
    borderBottom: '1px solid #F0F0F0',
  },
  backBtn: {
    background: 'none',
    fontSize: 28,
    color: '#555',
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#333',
  },
  closeBtn: {
    background: 'none',
    fontSize: 18,
    color: '#aaa',
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaBox: {
    position: 'relative',
    width: '100%',
    height: 220,
    background: '#111',
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  playOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  overlayBtn: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    background: 'rgba(0,0,0,0.55)',
    color: '#fff',
    fontSize: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(4px)',
    paddingLeft: 4,
  },
  body: {
    padding: '20px 24px 0',
    textAlign: 'center',
  },
  nowPlayingLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  artworkTitle: {
    fontSize: 24,
    fontWeight: 700,
    color: '#1a1a2e',
    marginBottom: 4,
  },
  artworkSubtitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 18,
  },
  progressWrap: {
    marginBottom: 16,
  },
  progressBar: {
    position: 'relative',
    height: 4,
    background: '#E5E7EB',
    borderRadius: 4,
    marginBottom: 8,
    cursor: 'pointer',
  },
  progressFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    background: '#4F6FE8',
    borderRadius: 4,
    transition: 'width 0.3s linear',
  },
  progressThumb: {
    position: 'absolute',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: 12,
    height: 12,
    borderRadius: '50%',
    background: '#4F6FE8',
    transition: 'left 0.3s linear',
    pointerEvents: 'none',
  },
  timeRow: {
    display: 'flex',
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: 12,
    color: '#aaa',
  },
  playBtn: {
    width: 60,
    height: 60,
    borderRadius: '50%',
    background: '#1a1a2e',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
  },
  playIcon: {
    fontSize: 22,
    color: '#fff',
    lineHeight: 1,
    paddingLeft: 2,
  },
  description: {
    fontSize: 14,
    color: '#666',
    lineHeight: 1.75,
    textAlign: 'left',
  },
  nextSection: {
    marginTop: 20,
    padding: '20px 24px 40px',
    borderTop: '1px solid #F0F0F0',
  },
  nextInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  nextThumb: {
    width: 52,
    height: 52,
    borderRadius: 12,
    objectFit: 'cover',
    background: '#F0F2F5',
    flexShrink: 0,
  },
  nextLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 3,
  },
  nextTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#1a1a2e',
    marginBottom: 3,
  },
  nextDistance: {
    fontSize: 12,
    color: '#888',
  },
  navigateBtn: {
    width: '100%',
    padding: '16px',
    borderRadius: 14,
    background: '#4F6FE8',
    color: '#fff',
    fontSize: 16,
    fontWeight: 700,
    boxShadow: '0 4px 16px rgba(79,111,232,0.3)',
    marginBottom: 12,
  },
  nearbyBtn: {
    width: '100%',
    padding: '12px',
    borderRadius: 14,
    background: 'none',
    color: '#888',
    fontSize: 14,
  },
  completeMsg: {
    textAlign: 'center',
    fontSize: 18,
    fontWeight: 600,
    color: '#4F6FE8',
    padding: '20px 0',
  },
};
