import { useState, useEffect, useRef } from 'react';
import { FullMap } from './FullMap';

const COLLAPSE_LEN = 100; // 이보다 긴 스크립트는 3줄로 접어서 보여줌
const COMPACT_HEIGHT = 740; // 이보다 낮은 화면에서는 '다음 작품' 미리보기 행을 숨겨 영상(16:9)과 3줄 스크립트 자리를 확보

export default function AudioGuideScreen({ artwork, nextArtwork, artworks, plan, autoPlay, onSelectIndex, onNavigate, onPrev, onHome, currentIndex, total }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const containerRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCompact(el.clientHeight < COMPACT_HEIGHT));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const currentRowRef = useRef(null);

  useEffect(() => {
    setIsPlaying(false);
    setProgress(0);
    setElapsed(0);
    setExpanded(false);
    // 도착/다음 트랙으로 넘어온 경우 자동 재생 (브라우저가 막으면 정지 상태로 둔다)
    if (autoPlay && videoRef.current) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div ref={containerRef} style={styles.container}>
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
            <div style={styles.overlayBtn} aria-label="재생">
              <svg width="26" height="26" viewBox="0 0 22 22"><path d="M7 4 L18 11 L7 18 Z" fill="#fff" /></svg>
            </div>
          )}
        </div>
        {/* 재생바: 영상 하단 */}
        <div style={styles.videoControls} onClick={e => e.stopPropagation()}>
          <div style={styles.progressTouch} onClick={handleProgressClick}>
            <div style={styles.progressBar}>
              <div style={{ ...styles.progressFill, width: `${progress}%` }} />
              <div style={{ ...styles.progressThumb, left: `${progress}%` }} />
            </div>
          </div>
          <div style={styles.timeRow}>
            <span>{formatTime(elapsed)}</span>
            <span>{totalDisplay}</span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ ...styles.body, ...(compact ? styles.bodyCompact : null) }}>
        <div style={styles.nowPlayingLabel}>{artwork.preview ? '미리듣기' : '지금 보는 작품'}</div>
        <h2 style={styles.artworkTitle}>{artwork.title}</h2>
        {artwork.subtitle && <p style={styles.artworkSubtitle}>{artwork.subtitle}</p>}

        <p style={{ ...styles.description, ...(compact ? { marginTop: 8 } : null), ...(expanded ? null : styles.descriptionClamped) }}>{artwork.description}</p>
        {artwork.description.length > COLLAPSE_LEN && (
          <button style={styles.moreBtn} onClick={() => setExpanded(e => !e)}>{expanded ? '접기' : '더보기'}</button>
        )}
      </div>

      {/* Next artwork */}
      {nextArtwork ? (
        <div style={styles.nextSection}>
          {!compact && <div style={styles.nextInfo}>
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
          </div>}
          <div style={styles.actionRow}>
            <button style={{ ...styles.prevBtn, opacity: onPrev ? 1 : 0.4 }} onClick={onPrev ?? undefined} disabled={!onPrev}>‹ 이전</button>
            <button style={styles.navigateBtn} onClick={onNavigate}>
              {nextArtwork.preview ? '다음 미리듣기 →' : '다음 작품으로 이동 →'}
            </button>
          </div>
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
  mediaBox: { position: 'relative', width: '100%', flex: 'none', aspectRatio: '16 / 9', background: '#111', overflow: 'hidden' }, // 항상 16:9
  video: { width: '100%', height: '100%', objectFit: 'cover' },
  playOverlay: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  overlayBtn: { width: 64, height: 64, borderRadius: '50%', background: 'rgba(30,42,90,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  body: { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '16px 20px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }, // 더보기로 펼쳤을 때만 이 영역 안에서 스크롤
  bodyCompact: { padding: '8px 20px 4px' },
  nowPlayingLabel: { fontSize: 12, fontWeight: 600, color: '#4F6FE8' },
  artworkTitle: { fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', margin: '4px 0 0', color: '#1A1A2E' },
  artworkSubtitle: { fontSize: 14, color: '#666', margin: '4px 0 0' },
  videoControls: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: '18px 14px 8px', background: 'linear-gradient(transparent, rgba(0,0,0,0.6))' },
  progressTouch: { height: 28, display: 'flex', alignItems: 'center', cursor: 'pointer' },
  progressBar: { position: 'relative', width: '100%', height: 4, background: 'rgba(255,255,255,0.4)', borderRadius: 2 },
  progressFill: { position: 'absolute', top: 0, left: 0, height: '100%', background: '#4F6FE8', borderRadius: 2, transition: 'width 0.3s linear' },
  progressThumb: { position: 'absolute', top: '50%', transform: 'translate(-50%, -50%)', width: 14, height: 14, borderRadius: '50%', background: '#4F6FE8', boxShadow: '0 0 0 3px rgba(255,255,255,0.35)' },
  timeRow: { display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: '#fff', marginTop: -2 },
  description: { flex: 'none', width: '100%', marginTop: 16, fontSize: 14, lineHeight: 1.75, textAlign: 'left', color: '#1A1A2E' },
  descriptionClamped: { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  moreBtn: { flex: 'none', padding: '8px 16px', fontSize: 13, fontWeight: 600, color: '#4F6FE8', background: 'none' },
  nextSection: { flex: 'none', marginTop: 'auto', borderTop: '1px solid #F0F0F0', padding: '14px 20px 24px', display: 'flex', flexDirection: 'column', gap: 12 },
  nextInfo: { display: 'flex', alignItems: 'center', gap: 12 },
  nextThumb: { width: 56, height: 56, flex: 'none', borderRadius: 8, objectFit: 'cover', background: '#EEF0F5' },
  nextText: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  nextLabel: { fontSize: 12, color: '#999' },
  nextTitle: { fontSize: 16, fontWeight: 700, color: '#1A1A2E' },
  nextSub: { fontSize: 13, color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  actionRow: { display: 'flex', gap: 8 },
  prevBtn: { flex: 'none', width: 88, height: 56, borderRadius: 16, background: '#F2F4F7', color: '#1A1A2E', fontSize: 16, fontWeight: 700 },
  navigateBtn: { flex: 1, minWidth: 0, height: 56, borderRadius: 16, background: '#4F6FE8', color: '#fff', fontSize: 17, fontWeight: 700 },
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
