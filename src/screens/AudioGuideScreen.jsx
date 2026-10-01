import { useState, useEffect, useRef } from 'react';
import { FullMap } from './FullMap';

const COLLAPSE_LEN = 150; // 이보다 긴 스크립트는 5줄로 접어서 보여줌

export default function AudioGuideScreen({ artwork, nextArtwork, artworks, plan, onSelectIndex, onNavigate, onHome, currentIndex, total }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const videoRef = useRef(null);
  const currentRowRef = useRef(null);

  useEffect(() => {
    setIsPlaying(false);
    setProgress(0);
    setElapsed(0);
    setExpanded(false);
  }, [artwork.id]);

  // 목차를 열면 현재 항목이 보이도록 스크롤
  useEffect(() => {
    if (listOpen) currentRowRef.current?.scrollIntoView({ block: 'center' });
  }, [listOpen]);

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
        <button style={styles.iconBtn} onClick={onHome} aria-label="처음으로">✕</button>
        <button style={styles.headerTitle} onClick={() => setListOpen(true)}>
          {currentIndex + 1}/{total} <span style={{ color: '#4F6FE8' }}>▾</span>
        </button>
        <button style={styles.iconBtn} onClick={() => setMapOpen(true)} aria-label="전체 지도">
          <span style={styles.mapIconWrap}>
            <svg width="20" height="20" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M2 4l4.5-2 5 2 4.5-2v12l-4.5 2-5-2L2 16z" /><path d="M6.5 2v12M11.5 4v12" /></svg>
            <span style={styles.mapIconLabel}>지도</span>
          </span>
        </button>
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
        <div style={styles.playOverlay} onClick={handlePlayPause}>
          {!isPlaying && (
            <div style={styles.overlayBtn}>
              <svg width="18" height="18" viewBox="0 0 18 18"><path d="M5 3 L15 9 L5 15 Z" fill="#fff" /></svg>
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={styles.body}>
        <div style={styles.nowPlayingLabel}>{artwork.preview ? '미리듣기' : '지금 보는 작품'}</div>
        <h2 style={styles.artworkTitle}>{artwork.title}</h2>
        {artwork.subtitle && <p style={styles.artworkSubtitle}>{artwork.subtitle}</p>}

        {/* Progress bar */}
        <div style={styles.progressWrap}>
          <div style={styles.progressBar} onClick={handleProgressClick}>
            <div style={{ ...styles.progressFill, width: `${progress}%` }} />
            <div style={{ ...styles.progressThumb, left: `${progress}%` }} />
          </div>
          <div style={styles.timeRow}>
            <span>{formatTime(elapsed)}</span>
            <span>{totalDisplay}</span>
          </div>
        </div>

        {/* Controls */}
        <button style={styles.playBtn} onClick={handlePlayPause} aria-label={isPlaying ? '일시정지' : '재생'}>
          {isPlaying ? (
            <svg width="22" height="22" viewBox="0 0 22 22"><path d="M6 4h4v14H6zM12 4h4v14h-4z" fill="#fff" /></svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 22 22"><path d="M7 4 L18 11 L7 18 Z" fill="#fff" /></svg>
          )}
        </button>

        <p style={{ ...styles.description, ...(expanded ? null : styles.descriptionClamped) }}>{artwork.description}</p>
        {artwork.description.length > COLLAPSE_LEN && (
          <button style={styles.moreBtn} onClick={() => setExpanded(e => !e)}>{expanded ? '접기' : '더보기'}</button>
        )}
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
            <div style={styles.nextText}>
              <span style={styles.nextLabel}>다음 작품</span>
              <span style={styles.nextTitle}>{nextArtwork.title}</span>
              {nextArtwork.subtitle && <span style={styles.nextSub}>{nextArtwork.subtitle}</span>}
            </div>
          </div>
          <button style={styles.navigateBtn} onClick={onNavigate}>
            {nextArtwork.preview ? '다음 미리듣기 →' : '다음 작품으로 이동 →'}
          </button>
        </div>
      ) : (
        <div style={styles.nextSection}>
          <div style={styles.completeMsg}>🎉 투어가 완료되었습니다!</div>
        </div>
      )}

      {/* 목차 시트 */}
      {listOpen && (
        <div style={styles.dim} onClick={() => setListOpen(false)}>
          <div style={styles.sheet} onClick={e => e.stopPropagation()}>
            <div style={styles.grabberWrap}><div style={styles.grabber} /></div>
            <div style={styles.sheetHead}>
              <span style={styles.sheetTitleText}>목차</span>
              <button style={styles.iconBtn} onClick={() => setListOpen(false)} aria-label="닫기">✕</button>
            </div>
            <div style={styles.sheetList}>
              {artworks.map((a, i) => {
                const active = i === currentIndex;
                return (
                  <button key={a.id} ref={active ? currentRowRef : null}
                    style={{ ...styles.row, ...(active ? styles.rowActive : null) }}
                    onClick={() => { onSelectIndex(i); setListOpen(false); }}>
                    <span style={{ ...styles.rowNo, ...(active ? styles.rowNoActive : null) }}>{i + 1}</span>
                    <span style={{ ...styles.rowTitle, ...(active ? styles.rowTitleActive : null) }}>{a.title}</span>
                    {active ? <span style={styles.tagActive}>재생 중</span> : a.preview && <span style={styles.tag}>미리듣기</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {mapOpen && <FullMap artworks={artworks} current={artwork} next={nextArtwork} plan={plan} onClose={() => setMapOpen(false)} />}
    </div>
  );
}

const styles = {
  container: { position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', background: '#fff' },
  header: { height: 64, flex: 'none', display: 'flex', alignItems: 'center', padding: '0 8px', gap: 4 },
  iconBtn: { width: 44, height: 44, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#1A1A2E', background: 'none' },
  headerTitle: { flex: 1, minWidth: 0, height: 44, textAlign: 'center', fontSize: 16, fontWeight: 700, color: '#1A1A2E', background: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  mapIconWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 },
  mapIconLabel: { fontSize: 11, fontWeight: 700 },
  mediaBox: { position: 'relative', width: '100%', flex: '0 100 220px', minHeight: 100, background: '#111', overflow: 'hidden' }, // 낮은 화면에선 본문보다 먼저 줄어듦
  video: { width: '100%', height: '100%', objectFit: 'cover' },
  playOverlay: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  overlayBtn: { width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  body: { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '16px 20px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }, // 더보기로 펼쳤을 때만 이 영역 안에서 스크롤
  nowPlayingLabel: { fontSize: 12, fontWeight: 600, color: '#4F6FE8' },
  artworkTitle: { fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', margin: '4px 0 0', color: '#1A1A2E' },
  artworkSubtitle: { fontSize: 14, color: '#666', margin: '4px 0 0' },
  progressWrap: { width: '100%', marginTop: 16, flex: 'none' },
  progressBar: { position: 'relative', height: 4, margin: '5px 0', background: '#E5E7EB', borderRadius: 2, cursor: 'pointer' },
  progressFill: { position: 'absolute', top: 0, left: 0, height: '100%', background: '#4F6FE8', borderRadius: 2, transition: 'width 0.3s linear' },
  progressThumb: { position: 'absolute', top: '50%', transform: 'translate(-50%, -50%)', width: 14, height: 14, borderRadius: '50%', background: '#4F6FE8', boxShadow: '0 0 0 3px #EEF2FF' },
  timeRow: { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#999', marginTop: 6 },
  playBtn: { flex: 'none', width: 64, height: 64, borderRadius: '50%', background: '#1E2A5A', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  description: { flex: 'none', width: '100%', marginTop: 16, fontSize: 14, lineHeight: 1.75, textAlign: 'left', color: '#1A1A2E' },
  descriptionClamped: { display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  moreBtn: { flex: 'none', padding: '8px 16px', fontSize: 13, fontWeight: 600, color: '#4F6FE8', background: 'none' },
  nextSection: { flex: 'none', marginTop: 'auto', borderTop: '1px solid #F0F0F0', padding: '14px 20px 24px', display: 'flex', flexDirection: 'column', gap: 12 },
  nextInfo: { display: 'flex', alignItems: 'center', gap: 12 },
  nextThumb: { width: 56, height: 56, flex: 'none', borderRadius: 8, objectFit: 'cover', background: '#EEF0F5' },
  nextText: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  nextLabel: { fontSize: 12, color: '#999' },
  nextTitle: { fontSize: 16, fontWeight: 700, color: '#1A1A2E' },
  nextSub: { fontSize: 13, color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  navigateBtn: { height: 56, borderRadius: 16, background: '#4F6FE8', color: '#fff', fontSize: 17, fontWeight: 700, width: '100%' },
  completeMsg: { textAlign: 'center', fontSize: 18, fontWeight: 600, color: '#4F6FE8', padding: '20px 0' },
  // 목차 시트
  dim: { position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(26,26,46,0.55)', display: 'flex', alignItems: 'flex-end' },
  sheet: { width: '100%', height: '75%', background: '#fff', borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  grabberWrap: { flex: 'none', display: 'flex', justifyContent: 'center', paddingTop: 8 },
  grabber: { width: 36, height: 4, borderRadius: 2, background: '#E5E7EB' },
  sheetHead: { flex: 'none', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px 0 20px' },
  sheetTitleText: { fontSize: 18, fontWeight: 700 },
  sheetList: { flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: 16 },
  row: { width: '100%', height: 48, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', background: 'none', textAlign: 'left', color: '#1A1A2E' },
  rowActive: { width: 'calc(100% - 24px)', margin: '0 12px', padding: '0 8px', borderRadius: 12, background: '#EEF2FF' },
  rowNo: { width: 22, fontSize: 13, color: '#999' },
  rowNoActive: { fontWeight: 700, color: '#4F6FE8' },
  rowTitle: { flex: 1, minWidth: 0, fontSize: 15 },
  rowTitleActive: { fontWeight: 700, color: '#4F6FE8' },
  tag: { fontSize: 11, fontWeight: 600, color: '#4F6FE8', background: '#EEF2FF', padding: '3px 8px', borderRadius: 999 },
  tagActive: { fontSize: 11, fontWeight: 600, color: '#4F6FE8' },
};
