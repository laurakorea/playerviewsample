import { useState, useRef, useEffect, useMemo } from 'react';
import { decodeWKBPoint } from '../utils/geo';

const SHEET_VH = [0, 74, 90];

const MAPS_API_KEY = 'AIzaSyA08FbqWiPl8VfF8aDcP9yhgCCJj6EqU58';
let mapsPromise = null;
function loadGoogleMaps() {
  if (window.google?.maps) return Promise.resolve();
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}`;
    s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return mapsPromise;
}
const MAP_STYLES = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
];

export default function PlayerV2({
  artwork, artworks, currentIndex, total,
  onPrev, onNext, onHome, onSelectIndex,
}) {
  const [snap, setSnap] = useState(0);
  const [pinActive, setPinActive] = useState(false);
  const [viewingMyLocation, setViewingMyLocation] = useState(false);
  const myLocationFnRef = useRef(null);
  const goTourFnRef = useRef(null);
  const [dragH, setDragH] = useState(null);
  const [tab, setTab] = useState('map');
  const [listFilter, setListFilter] = useState('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showRoute, setShowRoute] = useState(true);
  const [autoplay, setAutoplay] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [likedIds, setLikedIds] = useState(new Set());
  // 지도 탐색 인덱스 — 핀 클릭 시 이것만 바뀌고 재생 트랙(currentIndex)은 유지됨
  const [browseIndex, setBrowseIndex] = useState(currentIndex);
  useEffect(() => { setBrowseIndex(currentIndex); }, [currentIndex]);
  const isLiked = (id) => likedIds.has(id);
  const toggleLike = (id, e) => {
    e.stopPropagation();
    setLikedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const [overlay, setOverlay] = useState(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef(null);
  const autoPlayOnSelectRef = useRef(false);
  const lastTimeRef = useRef(0);
  const dragRef = useRef({ dragging: false, startY: 0, startH: 0 });

  const isFull = snap === 0;
  const mediaSrc = artwork.audioSrc || artwork.videoSrc || null;
  const hasMedia = !!mediaSrc;

  useEffect(() => {
    setProgress(0);
    setElapsed(0);
    setDuration(0);
    lastTimeRef.current = 0;
    if (autoPlayOnSelectRef.current) {
      autoPlayOnSelectRef.current = false;
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  }, [artwork.id]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const restore = () => {
      if (lastTimeRef.current) { try { v.currentTime = lastTimeRef.current; } catch { } }
      if (isPlaying) v.play().catch(() => {});
    };
    if (v.readyState >= 1) restore();
    else v.addEventListener('loadedmetadata', restore, { once: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFull]);

  const onEnded = () => {
    setIsPlaying(false);
    if (autoplay && currentIndex < total - 1) onNext();
  };

  const playPause = () => {
    const v = videoRef.current;
    if (!v || !hasMedia) return;
    if (isPlaying) v.pause();
    else v.play().catch(() => {});
    setIsPlaying(p => !p);
  };
  const onTime = () => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    lastTimeRef.current = v.currentTime;
    setElapsed(Math.floor(v.currentTime));
    setProgress((v.currentTime / v.duration) * 100);
  };
  const onMeta = () => {
    const v = videoRef.current;
    if (v) setDuration(Math.floor(v.duration));
  };
  const seek = (e) => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    v.currentTime = ((e.clientX - r.left) / r.width) * v.duration;
  };
  const nudge = (sec) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, v.currentTime + sec);
  };
  const changeSpeed = (s) => {
    setSpeed(s);
    const v = videoRef.current;
    if (v) v.playbackRate = s;
  };
  const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  const totalDisplay = duration > 0 ? fmt(duration) : artwork.duration?.slice(3) ?? '0:00';

  const vh = () => window.innerHeight / 100;
  const onDown = (e) => {
    dragRef.current = { dragging: true, startY: e.clientY, startH: SHEET_VH[snap] * vh() };
    setDragH(SHEET_VH[snap] * vh());
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!dragRef.current.dragging) return;
    const dy = dragRef.current.startY - e.clientY;
    const h = Math.max(0, Math.min(window.innerHeight * 0.88, dragRef.current.startH + dy));
    setDragH(h);
  };
  const onUp = () => {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    const startH = dragRef.current.startH;
    const h = dragH ?? startH;
    const targets = SHEET_VH.map(v => v * vh());
    let best = 0, bd = Infinity;
    targets.forEach((t, i) => { const d = Math.abs(t - h); if (d < bd) { bd = d; best = i; } });
    const delta = h - startH;
    if (best === snap && Math.abs(delta) > 24) {
      best = delta > 0 ? Math.min(2, snap + 1) : Math.max(0, snap - 1);
    }
    setSnap(best);
    setDragH(null);
  };

  const sheetH = dragH != null ? `${dragH}px` : `${SHEET_VH[snap]}vh`;
  const sheetTrans = dragH != null ? 'none' : 'height 0.32s cubic-bezier(0.4,0,0.2,1)';

  const prevArtwork = browseIndex > 0 ? artworks[browseIndex - 1] : null;
  const nextArtwork = browseIndex < artworks.length - 1 ? artworks[browseIndex + 1] : null;
  const browseArtwork = artworks[browseIndex];

  const mediaEl = mediaSrc ? (
    <video
      ref={videoRef}
      src={mediaSrc}
      style={{ display: 'none' }}
      onTimeUpdate={onTime}
      onLoadedMetadata={onMeta}
      onEnded={onEnded}
      preload="metadata"
      playsInline
    />
  ) : null;

  return (
    <div style={styles.root}>
      {mediaEl}
      {/* ============ 플레이어 레이어 ============ */}
      <div style={{ ...styles.player, bottom: sheetH, transition: `bottom ${sheetTrans.includes('none') ? '0s' : '0.32s cubic-bezier(0.4,0,0.2,1)'}` }}>
        <div style={styles.topBar}>
          {snap !== 2 && <button style={styles.iconBtn} onClick={onHome}>⌄</button>}
          <div style={styles.topRight}>
            {!isFull && snap !== 2 && (
              <>
                <button style={styles.chip} onClick={() => setOverlay('comments')}>댓글</button>
                <button style={styles.chip} onClick={() => setOverlay('script')}>스크립트</button>
              </>
            )}
            {snap !== 2 && (
              <button style={styles.gearBtn} onClick={() => setOverlay('settings')}>⚙</button>
            )}
          </div>
        </div>

        {isFull ? (
          <div style={styles.fullWrap}>
            <div style={styles.artBig} onClick={playPause}>
              <ArtImage src={artwork.imageSrc} alt={artwork.title} />
              {artwork.star && <span style={styles.badge}>핵심</span>}
              {hasMedia && (
                <div style={styles.playOverlay}>{isPlaying ? '' : '▶'}</div>
              )}
            </div>
            <div style={{ textAlign: 'left', margin: '12px 0 4px' }}>
              <span style={styles.count}>{artwork.subtitle || ''}</span>
            </div>
            <div style={styles.titleRow}>
              <div style={{ flex: 1 }}>
                <h2 style={{ ...styles.title, textAlign: 'left' }}>{artwork.title}</h2>
              </div>
              <button style={{ ...styles.heart, color: isLiked(artwork.id) ? ORANGE : BORDER_DEFAULT }} onClick={(e) => toggleLike(artwork.id, e)}>
                {isLiked(artwork.id) ? '♥' : '♡'}
              </button>
            </div>
            <div style={styles.chips}>
              <button style={styles.chip} onClick={() => setOverlay('comments')}>댓글 0</button>
              <button style={styles.chip} onClick={() => setOverlay('script')}>스크립트</button>
              <span style={styles.chip}>위치보기</span>
            </div>
            <div style={styles.progWrap}>
              <div style={styles.progBar} onClick={seek}>
                <div style={{ ...styles.progFill, width: `${progress}%` }} />
                <div style={{ ...styles.progThumb, left: `${progress}%` }} />
              </div>
              <div style={styles.timeRow}>
                <span style={styles.time}>{fmt(elapsed)}</span>
                <span style={styles.time}>{totalDisplay}</span>
              </div>
            </div>
            <Controls big isPlaying={isPlaying} hasMedia={hasMedia} onPlay={playPause} onPrev={onPrev} onNext={onNext} onNudge={nudge} />
            <div style={styles.bottomBtns}>
              <button style={styles.bottomBtn} onClick={() => { setTab('map'); setSnap(1); setBrowseIndex(currentIndex); setPinActive(true); }}>▥ 지도보기</button>
              <button style={styles.bottomBtn} onClick={() => { setTab('list'); setSnap(1); }}>☰ 목차보기</button>
            </div>
          </div>
        ) : snap === 2 ? (
          <div style={styles.compactBar} onClick={() => setSnap(0)}>
            <div style={styles.compactThumb}>
              <ArtImage src={artwork.imageSrc} alt={artwork.title} cover />
            </div>
            <div style={styles.compactTitleWrap}>
              <span style={styles.compactTitle}>{artwork.title}</span>
            </div>
            <div style={styles.compactControls} onClick={e => e.stopPropagation()}>
              <button
                style={{ ...styles.compactPlayBtn, ...(hasMedia ? {} : styles.playDisabled) }}
                onClick={playPause}
              >
                {hasMedia ? (isPlaying ? '⏸' : '▶') : '🔇'}
              </button>
              <button style={styles.compactDownBtn} onClick={() => setSnap(0)}>⌄</button>
            </div>
          </div>
        ) : (
          <div style={styles.miniWrap} onClick={() => setSnap(0)}>
            {artwork.imageSrc && (
              <img src={artwork.imageSrc} alt="" aria-hidden style={styles.miniBlurBg} />
            )}
            <ArtImage src={artwork.imageSrc} alt={artwork.title} contain />
            <div style={styles.miniBar}>
              <div style={styles.miniBarInfo}>
                <span style={styles.miniBarTitle}>{artwork.title}</span>
              </div>
              <div style={styles.miniBarControls} onClick={e => e.stopPropagation()}>
                <button style={styles.miniBarBtn} onClick={onPrev}>⏮</button>
                <button style={{ ...styles.miniBarPlay, ...(hasMedia ? {} : styles.playDisabled) }} onClick={playPause}>
                  {hasMedia ? (isPlaying ? '⏸' : '▶') : '🔇'}
                </button>
                <button style={styles.miniBarBtn} onClick={onNext}>⏭</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ============ 지도 바텀시트 ============ */}
      <div style={{ ...styles.sheet, height: sheetH, transition: sheetTrans }}>
        <div
          style={styles.handleZone}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <div style={styles.grabber} />
        </div>

        {tab === 'map' ? (
          <div style={styles.sheetBody}>
            <div style={styles.mapBox}>
              <MapView
                artworks={artworks}
                currentIndex={browseIndex}
                playingIndex={currentIndex}
                snap={snap}
                showRoute={showRoute}
                pinActive={pinActive}
                onPinClick={(i) => { setBrowseIndex(i); setSnap(1); setPinActive(true); setViewingMyLocation(false); }}
                onMapClick={() => { setSnap(1); setPinActive(false); setViewingMyLocation(false); }}
                onRegisterMyLocation={(fn) => { myLocationFnRef.current = fn; }}
                onRegisterGoTour={(fn) => { goTourFnRef.current = fn; }}
              />
              <div style={styles.mapTopBar}>
                <button style={styles.tocBtn} onClick={() => setTab('list')}>☰ 목차</button>
                <button
                  style={{ ...styles.mapTopBtn, ...(showRoute ? styles.mapTopBtnOn : {}) }}
                  onClick={() => setShowRoute(r => !r)}
                >
                  {showRoute ? '경로 끄기' : '경로 켜기'}
                </button>
              </div>
              {!pinActive && (
                <button style={styles.myLocationBtn} onClick={() => {
                  if (viewingMyLocation) {
                    goTourFnRef.current?.();
                    setViewingMyLocation(false);
                  } else {
                    myLocationFnRef.current?.();
                    setViewingMyLocation(true);
                  }
                }}>
                  {viewingMyLocation ? '← 투어로 돌아가기' : '📍 내 위치'}
                </button>
              )}
            </div>

            {snap >= 1 && pinActive && (
              <div style={styles.stripOverlay}>
                <div style={styles.pinActionBar}>
                  <button style={styles.mapTopBtn} onClick={() => {
                    if (viewingMyLocation) {
                      goTourFnRef.current?.();
                      setViewingMyLocation(false);
                    } else {
                      myLocationFnRef.current?.();
                      setViewingMyLocation(true);
                    }
                  }}>
                    {viewingMyLocation ? '← 투어로 돌아가기' : '📍 내 위치'}
                  </button>
                  <button style={styles.mapTopBtn}>길찾기</button>
                </div>
                <div style={styles.strip}>
                  {prevArtwork && (
                    <button style={{ ...styles.stripCard, ...styles.nextStopCard }} onClick={() => { autoPlayOnSelectRef.current = true; onSelectIndex(browseIndex - 1); setBrowseIndex(browseIndex - 1); setSnap(1); }}>
                      <div style={styles.nextStopThumb}>
                        <div style={styles.prevStopCircle}>‹</div>
                      </div>
                      <div style={styles.nextStopLabel}>이전 장소</div>
                      <div style={styles.nextStopName}>{prevArtwork.title}</div>
                    </button>
                  )}
                  <div style={styles.stripCard}>
                    {(() => {
                      const isThisPlaying = browseIndex === currentIndex && isPlaying;
                      return (
                        <>
                          <div style={{ ...styles.stripThumb, ...(browseIndex === currentIndex ? styles.stripThumbOn : {}) }}
                               onClick={() => { autoPlayOnSelectRef.current = true; onSelectIndex(browseIndex); setSnap(1); }}>
                            <ArtImage src={browseArtwork.imageSrc} alt={browseArtwork.title} cover />
                            {isThisPlaying && (
                              <div style={styles.stripEqBadge}>
                                <span style={{ ...styles.eqBar, animationDelay: '0s', height: 6 }} />
                                <span style={{ ...styles.eqBar, animationDelay: '0.15s', height: 10 }} />
                                <span style={{ ...styles.eqBar, animationDelay: '0.3s', height: 7 }} />
                              </div>
                            )}
                            <button
                              style={isLiked(browseArtwork.id) ? styles.stripHeartOn : styles.stripHeart}
                              onClick={(e) => { e.stopPropagation(); toggleLike(browseArtwork.id, e); }}
                            >
                              {isLiked(browseArtwork.id) ? '♥' : '♡'}
                            </button>
                          </div>
                          <div style={{ ...styles.stripName, ...(browseIndex === currentIndex ? styles.stripNameOn : {}) }}
                               onClick={() => { autoPlayOnSelectRef.current = true; onSelectIndex(browseIndex); setSnap(1); }}>
                            {browseArtwork.title}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                  {nextArtwork && (
                    <button style={{ ...styles.stripCard, ...styles.nextStopCard }} onClick={() => { autoPlayOnSelectRef.current = true; onSelectIndex(browseIndex + 1); setBrowseIndex(browseIndex + 1); setSnap(1); }}>
                      <div style={styles.nextStopThumb}>
                        <div style={styles.nextStopCircle}>›</div>
                      </div>
                      <div style={styles.nextStopLabel}>다음 장소</div>
                      <div style={styles.nextStopName}>{nextArtwork.title}</div>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={styles.listWrap}>
            <div style={styles.listHeader}>
              <div style={{ ...styles.listTopBar, position: 'relative' }}>
                <button style={styles.tocBtnList} onClick={() => setTab('map')}>🗺 지도</button>
                <button style={{ ...styles.listFilter, ...(listFilter === 'all' ? styles.listFilterOn : {}) }}
                        onClick={() => setListFilter('all')}>전체</button>

                <button style={{ ...styles.listFilter, ...(listFilter === 'liked' ? styles.listFilterOn : {}) }}
                        onClick={() => setListFilter('liked')}>♡ 좋아요</button>
                {!searchOpen && (
                  <button style={styles.searchIconAbsBtn} onClick={() => setSearchOpen(true)}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <circle cx="11" cy="11" r="7" stroke={TXT_DEFAULT} strokeWidth="2"/>
                      <line x1="16.5" y1="16.5" x2="21" y2="21" stroke={TXT_DEFAULT} strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </button>
                )}
              </div>
              {searchOpen && (
                <div style={styles.listSecondBar}>
                  <div style={styles.searchBar}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                      <circle cx="11" cy="11" r="7" stroke={ORANGE} strokeWidth="2"/>
                      <line x1="16.5" y1="16.5" x2="21" y2="21" stroke={ORANGE} strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    <input
                      autoFocus
                      style={styles.searchInput}
                      placeholder="제목 검색하기"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <button style={styles.searchCancelBtn} onClick={() => { setSearchOpen(false); setSearchQuery(''); }}>취소</button>
                </div>
              )}
            </div>
            <div style={styles.listBody}>
              {(() => {
                const filtered = artworks.map((a, i) => ({ a, i })).filter(({ a }) => {
                  if (listFilter === 'liked' && !isLiked(a.id)) return false;
                  if (searchQuery && !a.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
                  return true;
                });
                return (
                  <div style={{ marginBottom: 8 }}>
                    <div style={styles.listGroupBox}>
                      {filtered.map(({ a, i }) => (
                        <button key={a.id}
                                style={styles.listItem}
                                onClick={() => { autoPlayOnSelectRef.current = true; onSelectIndex(i); setSnap(1); }}>
                          <div style={{ ...styles.listThumb, ...(i === currentIndex ? styles.listThumbOn : {}) }}>
                            <ArtImage src={a.imageSrc} alt={a.title} cover />
                            {i === currentIndex && (
                              <>
                                <div style={styles.listThumbDim} />
                                <div style={styles.listThumbEqBadge}>
                                  <span style={{ ...styles.eqBar, animationDelay: '0s', height: 6 }} />
                                  <span style={{ ...styles.eqBar, animationDelay: '0.15s', height: 10 }} />
                                  <span style={{ ...styles.eqBar, animationDelay: '0.3s', height: 7 }} />
                                </div>
                              </>
                            )}
                          </div>
                          <div style={{ flex: 1, textAlign: 'left' }}>
                            <div style={{ ...styles.listTitle, ...(i === currentIndex ? { color: ORANGE } : {}) }}>{a.star ? '★ ' : ''}{a.title}</div>
                            <div style={styles.listSub}>{a.subtitle || ''}</div>
                          </div>
                          <button style={isLiked(a.id) ? styles.listHeartOn : styles.listHeartOff} onClick={(e) => toggleLike(a.id, e)}>
                            {isLiked(a.id) ? '♥' : '♡'}
                          </button>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {overlay && (
        <>
          <div style={styles.dim} onClick={() => setOverlay(null)} />
          <div style={{ ...styles.overlaySheet, ...(overlay === 'settings' ? { height: 'auto' } : {}) }}>
            <div style={styles.overlayHandle}>
              <div style={styles.grabber} />
            </div>
            <div style={styles.overlayHeader}>
              <span style={styles.overlayTitle}>
                {overlay === 'comments' ? '댓글' : overlay === 'script' ? '스크립트' : '설정'}
              </span>
              <button style={styles.overlayClose} onClick={() => setOverlay(null)}>✕</button>
            </div>
            <div style={styles.overlayBody}>
              {overlay === 'comments' && (
                <div style={styles.overlayEmpty}>
                  <span style={{ fontSize: 32 }}>💬</span>
                  <p style={{ margin: '12px 0 0', color: TXT_SUBTLE, fontSize: 14 }}>아직 댓글이 없습니다</p>
                </div>
              )}
              {overlay === 'script' && (
                <div style={styles.scriptBody}>
                  <h3 style={styles.scriptTitle}>{artwork.title}</h3>
                  <p style={styles.scriptText}>{artwork.description || '스크립트가 준비되지 않았습니다.'}</p>
                </div>
              )}
              {overlay === 'settings' && (
                <div style={styles.settingsBody}>
                  <div style={styles.settingsRow}>
                    <span style={styles.settingsLabel}>자동재생</span>
                    <button
                      style={{ ...styles.toggleTrack, ...(autoplay ? styles.toggleTrackOn : {}) }}
                      onClick={() => setAutoplay(a => !a)}>
                      <div style={{ ...styles.toggleHandle, ...(autoplay ? styles.toggleHandleOn : {}) }} />
                    </button>
                  </div>
                  <div style={styles.settingsRow}>
                    <span style={styles.settingsLabel}>재생 속도</span>
                    <span style={styles.settingsValue}>x{speed === 1 ? '1.0' : speed}배 ›</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ArtImage({ src, alt, cover, contain }) {
  const [err, setErr] = useState(false);
  useEffect(() => { setErr(false); }, [src]);
  if (!src || err) {
    return (
      <div style={{ ...styles.imgFallback, ...((cover || contain) ? { position: 'absolute', inset: 0 } : {}) }}>
        <span style={styles.imgFallbackIcon}>🖼️</span>
      </div>
    );
  }
  return (
    <img src={src} alt={alt}
         style={contain ? styles.containImg : cover ? styles.coverImg : styles.artImg}
         onError={() => setErr(true)} />
  );
}

function Controls({ big, isPlaying, hasMedia, onPlay, onPrev, onNext, onNudge }) {
  return (
    <div style={styles.controls}>
      <button style={styles.ctrlSide} onClick={() => onNudge(-5)} disabled={!hasMedia}>↺<sub style={styles.ctrlNum}>5</sub></button>
      <button style={big ? styles.ctrlBig : styles.ctrl} onClick={onPrev}>⏮</button>
      <button style={{ ...(big ? styles.playBig : styles.play), ...(hasMedia ? {} : styles.playDisabled) }} onClick={onPlay}>
        {hasMedia ? (isPlaying ? '⏸' : '▶') : '🔇'}
      </button>
      <button style={big ? styles.ctrlBig : styles.ctrl} onClick={onNext}>⏭</button>
      <button style={styles.ctrlSide} onClick={() => onNudge(5)} disabled={!hasMedia}><sub style={styles.ctrlNum}>5</sub>↻</button>
    </div>
  );
}

function buildSegPath(seq, currentIndex) {
  const a = seq[currentIndex];
  const b = seq[currentIndex + 1];
  if (!a || !b) return [];
  return [
    { lat: a.lat, lng: a.lon },
    { lat: b.lat, lng: b.lon },
  ];
}

function markerIcon(g, state) {
  // state: 'active' | 'visited' | 'upcoming'
  const fillColor = state === 'active' ? ORANGE : state === 'visited' ? '#A0A0A0' : ORANGE;
  const fillOpacity = state === 'active' ? 1 : 0.5;
  const scale = state === 'active' ? 15 : 12;
  return {
    path: g.maps.SymbolPath.CIRCLE,
    scale,
    fillColor,
    fillOpacity,
    strokeColor: '#fff',
    strokeWeight: state === 'active' ? 3 : 2,
  };
}

function playingMarkerIcon(g) {
  const svg = `<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="14" fill="${ORANGE}" stroke="white" stroke-width="2.5"/>
    <rect x="7" y="12" width="4" height="8" fill="white" rx="1.5">
      <animate attributeName="height" values="3;8;3" dur="0.7s" repeatCount="indefinite" begin="0s"/>
      <animate attributeName="y" values="17;12;17" dur="0.7s" repeatCount="indefinite" begin="0s"/>
    </rect>
    <rect x="14" y="12" width="4" height="8" fill="white" rx="1.5">
      <animate attributeName="height" values="8;3;8" dur="0.7s" repeatCount="indefinite" begin="0.2s"/>
      <animate attributeName="y" values="12;17;12" dur="0.7s" repeatCount="indefinite" begin="0.2s"/>
    </rect>
    <rect x="21" y="12" width="4" height="8" fill="white" rx="1.5">
      <animate attributeName="height" values="5;8;5" dur="0.7s" repeatCount="indefinite" begin="0.1s"/>
      <animate attributeName="y" values="15;12;15" dur="0.7s" repeatCount="indefinite" begin="0.1s"/>
    </rect>
  </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new g.maps.Size(32, 32),
    anchor: new g.maps.Point(16, 16),
  };
}

function MapView({ artworks, currentIndex, playingIndex, snap, showRoute, pinActive, onPinClick, onMapClick, onRegisterMyLocation, onRegisterGoTour }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const routeRef = useRef(null);
  const userMarkerRef = useRef(null);
  const segRouteRef = useRef(null);
  const infoWindowRef = useRef(null);
  const onPinRef = useRef(onPinClick);
  const onMapClickRef = useRef(onMapClick);
  const currentIndexRef = useRef(currentIndex);
  const seqRef = useRef(null);

  useEffect(() => { onPinRef.current = onPinClick; onMapClickRef.current = onMapClick; });
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

  useEffect(() => {
    onRegisterMyLocation?.(() => {
      if (!navigator.geolocation || !mapRef.current) return;
      navigator.geolocation.getCurrentPosition(pos => {
        const g = window.google;
        const map = mapRef.current;
        const latlng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        map.panTo(latlng);
        map.setZoom(16);
        if (userMarkerRef.current) userMarkerRef.current.setMap(null);
        userMarkerRef.current = new g.maps.Marker({
          position: latlng,
          map,
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: '#4A90E2',
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2.5,
          },
          zIndex: 999,
        });
      }, () => {}, { enableHighAccuracy: true });
    });
    onRegisterGoTour?.(() => {
      const map = mapRef.current;
      const s = seqRef.current;
      if (!map || !s) return;
      const coord = s[currentIndexRef.current];
      if (coord) { map.panTo({ lat: coord.lat, lng: coord.lon }); map.setZoom(17); }
      if (userMarkerRef.current) { userMarkerRef.current.setMap(null); userMarkerRef.current = null; }
    });
  }, []);

  const seq = useMemo(() => {
    const raw = artworks.map(a => decodeWKBPoint(a.wkb));
    const filled = raw.slice();
    for (let i = 0; i < filled.length; i++) if (!filled[i] && i > 0) filled[i] = filled[i - 1];
    for (let i = filled.length - 1; i >= 0; i--) if (!filled[i] && i < filled.length - 1) filled[i] = filled[i + 1];
    const result = filled.map((c, i) => {
      if (!c) return null;
      if (!raw[i]) return { lat: c.lat + 0.00022, lon: c.lon + 0.00022 };
      return c;
    });
    seqRef.current = result;
    return result;
  }, [artworks]);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then(() => {
      const tryInit = () => {
        if (cancelled) return;
        if (!elRef.current) { requestAnimationFrame(tryInit); return; }
        init();
      };
      tryInit();
    });

    function init() {
      const g = window.google;
      const pts = seq.map((c, i) => ({ c, i })).filter(x => x.c);
      if (!pts.length) return;
      const center = seq[currentIndex] || pts[0].c;
      const map = new g.maps.Map(elRef.current, {
        center: { lat: center.lat, lng: center.lon },
        zoom: 16,
        disableDefaultUI: true,
        clickableIcons: false,
        gestureHandling: 'greedy',
        styles: MAP_STYLES,
      });
      mapRef.current = map;

      // 전체 경로: 점선
      routeRef.current = new g.maps.Polyline({
        path: pts.map(({ c }) => ({ lat: c.lat, lng: c.lon })),
        map,
        strokeOpacity: 0,
        icons: [{
          icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.5, strokeColor: ORANGE, strokeWeight: 4, scale: 1 },
          offset: '0',
          repeat: '8px',
        }],
        visible: showRoute,
      });

      // 현재→다음 구간: 오렌지 화살표 실선
      const segPath = buildSegPath(seq, currentIndex);
      segRouteRef.current = new g.maps.Polyline({
        path: segPath,
        map,
        strokeColor: ORANGE,
        strokeOpacity: 1,
        strokeWeight: 8,
        icons: [{
          icon: { path: g.maps.SymbolPath.FORWARD_OPEN_ARROW, strokeOpacity: 1, strokeColor: '#fff', fillOpacity: 0, scale: 1 },
          offset: '50%',
          repeat: '24px',
        }],
        visible: showRoute && segPath.length > 1,
      });

      infoWindowRef.current = new g.maps.InfoWindow({
        disableAutoPan: true,
        pixelOffset: new g.maps.Size(0, -8),
      });

      map.addListener('click', () => {
        infoWindowRef.current?.close();
        onMapClickRef.current?.();
      });

      const initPlayIdx = playingIndex ?? -1;
      markersRef.current = pts.map(({ c, i }) => {
        const isPlaying = i === initPlayIdx;
        const state = i === currentIndex ? 'active' : i < currentIndex ? 'visited' : 'upcoming';
        const m = new g.maps.Marker({
          position: { lat: c.lat, lng: c.lon },
          map,
          zIndex: i === currentIndex ? 99 : isPlaying ? 98 : i + 1,
          icon: isPlaying ? playingMarkerIcon(g) : markerIcon(g, state),
          label: isPlaying ? null : { text: String(i + 1), color: '#fff', fontSize: '11px', fontWeight: '700' },
        });
        m.addListener('click', () => {
          const iw = infoWindowRef.current;
          const title = artworks[i]?.title ?? '';
          iw.setContent(`<div style="position:relative;display:inline-block"><div style="font-family:sans-serif;font-size:12px;font-weight:700;color:#fff;background:#FF730D;padding:6px 10px;border-radius:6px;white-space:nowrap">${title}</div><div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid #FF730D;"></div></div>`);
          iw.open({ map, anchor: m });
          onPinRef.current?.(i);
        });
        return { m, i };
      });

      const initCenter = seq[currentIndex] || pts[0].c;
      map.setCenter({ lat: initCenter.lat, lng: initCenter.lon });
      map.setZoom(16);
    }
    return () => {
      cancelled = true;
      mapRef.current = null;
      markersRef.current = [];
      routeRef.current = null;
      segRouteRef.current = null;
    };
  }, [artworks]);

  useEffect(() => {
    const g = window.google, map = mapRef.current;
    if (!g || !map) return;
    const playIdx = playingIndex ?? -1;
    markersRef.current.forEach(({ m, i }) => {
      const isPlaying = i === playIdx;
      const state = i === currentIndex ? 'active' : i < currentIndex ? 'visited' : 'upcoming';
      m.setIcon(isPlaying ? playingMarkerIcon(g) : markerIcon(g, state));
      m.setZIndex(i === currentIndex ? 99 : isPlaying ? 98 : i + 1);
      m.setLabel(isPlaying ? null : { text: String(i + 1), color: '#fff', fontSize: '11px', fontWeight: '700' });
    });
    const c = seq[currentIndex];
    if (c) map.panTo({ lat: c.lat, lng: c.lon });
    // 현재→다음 구간 갱신
    const segPath = buildSegPath(seq, currentIndex);
    if (segRouteRef.current) {
      segRouteRef.current.setPath(segPath);
      segRouteRef.current.setVisible(routeRef.current?.getVisible() && segPath.length > 1);
    }
  }, [currentIndex, playingIndex]);


  useEffect(() => {
    routeRef.current?.setVisible(showRoute);
    const segPath = segRouteRef.current?.getPath()?.getLength() > 1;
    segRouteRef.current?.setVisible(showRoute && !!segPath);
  }, [showRoute]);

  useEffect(() => {
    const iw = infoWindowRef.current;
    const map = mapRef.current;
    if (!iw || !map) return;
    if (!pinActive) { iw.close(); return; }
    const entry = markersRef.current.find(({ i }) => i === currentIndex);
    if (!entry) return;
    const title = artworks[currentIndex]?.title ?? '';
    iw.setContent(`<div style="position:relative;display:inline-block"><div style="font-family:sans-serif;font-size:12px;font-weight:700;color:#fff;background:#FF730D;padding:6px 10px;border-radius:6px;white-space:nowrap">${title}</div><div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid #FF730D;"></div></div>`);
    iw.open({ map, anchor: entry.m });
  }, [pinActive, currentIndex]);

  useEffect(() => {
    const g = window.google, map = mapRef.current;
    if (!g || !map) return;
    const t = setTimeout(() => {
      g.maps.event.trigger(map, 'resize');
      const c = seq[currentIndex];
      if (c) map.setCenter({ lat: c.lat, lng: c.lon });
    }, 360);
    return () => clearTimeout(t);
  }, [snap]);

  return <div ref={elRef} style={{ position: 'absolute', inset: 0 }} />;
}

// — Design Tokens —
const W = '#FFFFFF';
const ORANGE = '#FF730D';
const ORANGE_LIGHT = '#FFF3EC';
const TXT_STRONG = '#1A1A1A';
const TXT_DEFAULT = '#3A3A3A';
const TXT_SUBTLE = '#8A8A8A';
const BG_PAGE = '#FFFFFF';
const BG_MUTED = '#F2F4F7';
const BORDER_DEFAULT = '#D1D1D1';
const PLAYER_BG = '#000000';
const FONT = "'Pretendard Variable', 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif";

const styles = {
  root: { position: 'relative', height: '100dvh', minHeight: '100vh', background: PLAYER_BG, overflow: 'hidden', color: W, fontFamily: FONT },

  player: { position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column', background: PLAYER_BG, overflow: 'hidden' },
  topBar: { position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'linear-gradient(rgba(0,0,0,0.45), transparent)' },
  iconBtn: { background: 'none', border: 'none', color: W, fontSize: 24, lineHeight: 1, cursor: 'pointer', width: 32 },
  topRight: { display: 'flex', alignItems: 'center', gap: 8 },
  gearBtn: { background: 'rgba(255,255,255,0.15)', border: 'none', color: W, fontSize: 18, width: 36, height: 36, borderRadius: 9999, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },

  fullWrap: { flex: 1, display: 'flex', flexDirection: 'column', padding: '4px 20px 16px', overflow: 'auto' },
  artBig: { position: 'relative', width: '72%', aspectRatio: '3 / 4', margin: '6px auto 0', borderRadius: 8, overflow: 'hidden', background: TXT_DEFAULT, boxShadow: '0 12px 40px rgba(0,0,0,0.6)' },
  artImg: { width: '100%', height: '100%', objectFit: 'cover' },
  coverImg: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' },
  containImg: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' },
  miniBlurBg: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(28px)', transform: 'scale(1.2)', opacity: 0.5 },
  imgFallback: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#2a2a32,#16161c)' },
  imgFallbackIcon: { fontSize: 40, opacity: 0.5 },
  playOverlay: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, color: 'rgba(255,255,255,0.85)', textShadow: '0 2px 12px rgba(0,0,0,0.6)', pointerEvents: 'none' },
  badge: { position: 'absolute', top: 8, left: 8, background: ORANGE, color: W, fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 9999 },
  countRow: { textAlign: 'center', margin: '12px 0 4px' },
  count: { fontSize: 13, color: TXT_SUBTLE },
  titleRow: { display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 4 },
  title: { fontSize: 20, fontWeight: 600, color: W, margin: 0, lineHeight: 1.45 },
  subtitle: { fontSize: 13, color: TXT_SUBTLE, margin: '4px 0 0', lineHeight: 1.5 },
  heart: { background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', lineHeight: 1, flexShrink: 0 },

  chips: { display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' },
  chip: { fontSize: 13, color: W, background: 'rgba(255,255,255,0.15)', padding: '8px 12px', borderRadius: 8, whiteSpace: 'nowrap', border: 'none', cursor: 'pointer', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' },

  progWrap: { marginTop: 16 },
  progBar: { position: 'relative', height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 9999, cursor: 'pointer' },
  progFill: { position: 'absolute', top: 0, left: 0, height: '100%', background: ORANGE, borderRadius: 9999 },
  progThumb: { position: 'absolute', top: '50%', transform: 'translate(-50%,-50%)', width: 12, height: 12, borderRadius: '50%', background: '#fff', pointerEvents: 'none' },
  timeRow: { display: 'flex', justifyContent: 'space-between', marginTop: 7 },
  time: { fontSize: 12, color: TXT_SUBTLE },

  controls: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginTop: 16 },
  ctrlSide: { background: 'none', border: 'none', color: TXT_SUBTLE, fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center' },
  ctrlNum: { fontSize: 9, bottom: 0 },
  ctrl: { background: 'none', border: 'none', color: W, fontSize: 22, cursor: 'pointer' },
  ctrlBig: { background: 'none', border: 'none', color: W, fontSize: 26, cursor: 'pointer' },
  play: { width: 48, height: 48, borderRadius: '50%', background: W, color: PLAYER_BG, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' },
  playBig: { width: 64, height: 64, borderRadius: '50%', background: W, color: PLAYER_BG, fontSize: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' },
  playDisabled: { background: 'rgba(255,255,255,0.25)', color: 'rgba(255,255,255,0.6)' },

  bottomBtns: { display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 20 },
  bottomBtn: { flex: 1, padding: '14px', borderRadius: 12, background: 'rgba(255,255,255,0.15)', border: 'none', color: W, fontSize: 15, fontWeight: 600, cursor: 'pointer' },

  compactBar: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: PLAYER_BG, flex: 1, overflow: 'hidden' },
  compactThumb: { position: 'relative', width: 52, height: 52, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#222' },
  compactTitleWrap: { flex: 1, overflow: 'hidden' },
  compactTitle: { display: 'inline-block', fontSize: 16, fontWeight: 700, color: W, whiteSpace: 'nowrap', animation: 'marquee 8s linear infinite', animationDelay: '2s' },
  compactControls: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  compactPlayBtn: { width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', color: W, fontSize: 16, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  compactDownBtn: { width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', color: W, fontSize: 24, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 },

  miniWrap: { position: 'absolute', inset: 0, zIndex: 1, background: PLAYER_BG },
  miniBar: { position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 12, background: 'linear-gradient(transparent, rgba(0,0,0,0.7))' },
  miniBarInfo: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden', textAlign: 'left' },
  miniBarTitle: { fontSize: 15, fontWeight: 700, color: W, whiteSpace: 'nowrap', textShadow: '0 1px 4px rgba(0,0,0,0.5)', display: 'inline-block', animation: 'marquee 8s linear infinite', animationDelay: '2s' },
  miniBarSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' },
  miniBarControls: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  miniBarBtn: { background: 'none', border: 'none', color: W, fontSize: 20, cursor: 'pointer', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  miniBarPlay: { width: 40, height: 40, borderRadius: '50%', background: W, color: PLAYER_BG, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' },

  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, background: BG_MUTED, borderRadius: '16px 16px 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 -4px 12px rgba(0,0,0,0.3)' },
  handleZone: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 34, cursor: 'grab', touchAction: 'none', flexShrink: 0 },
  grabber: { width: 52, height: 6, borderRadius: 9999, background: BORDER_DEFAULT },

  sheetBody: { position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 },
  mapBox: { position: 'relative', flex: 1, overflow: 'hidden', minHeight: 0, background: '#E3E3E3' },
  mapTopBar: { position: 'absolute', top: 10, left: 10, right: 10, zIndex: 5, display: 'flex', gap: 8 },
  tocBtn: { height: 34, padding: '0 12px', borderRadius: 9999, background: TXT_STRONG, color: W, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.28)', display: 'flex', alignItems: 'center', outline: 'none' },
  mapTopBtn: { height: 34, padding: '0 12px', borderRadius: 9999, border: `1px solid ${BORDER_DEFAULT}`, background: BG_PAGE, color: TXT_STRONG, fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', outline: 'none' },
  mapTopBtnOn: { background: W, border: `1.5px solid ${ORANGE}`, color: ORANGE },

  stripOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 5, padding: '0 16px 16px', background: 'linear-gradient(transparent, rgba(255,255,255,1) 80%, rgb(255,255,255) 100%)' },
  pinActionBar: { display: 'flex', gap: 8, padding: '8px 0 4px' },
  myLocationBtn: { position: 'absolute', left: 12, bottom: 16, zIndex: 6, height: 34, padding: '0 12px', borderRadius: 9999, border: `1px solid ${BORDER_DEFAULT}`, background: BG_PAGE, color: TXT_STRONG, fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', outline: 'none' },
  strip: { display: 'flex', gap: 10, overflowX: 'auto', padding: '4px 0 8px', flexShrink: 0 },
  stripCard: { flexShrink: 0, width: 92, background: 'none', border: 'none', padding: 0, cursor: 'pointer' },
  stripThumb: { position: 'relative', width: 92, height: 92, borderRadius: 10, overflow: 'hidden', background: BG_MUTED, border: '2px solid transparent' },
  stripThumbOn: { border: `3px solid ${ORANGE}`, boxShadow: `0 0 0 2px ${ORANGE_LIGHT}` },
  stripName: { fontSize: 12, color: TXT_DEFAULT, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' },
  stripNameOn: { color: ORANGE, fontWeight: 700 },
  nowPlay: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.25)' },
  nowPlayBtn: { width: 36, height: 36, borderRadius: '50%', background: ORANGE, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' },

  nextStopCard: { border: 'none', borderRadius: 10, padding: '0 0 2px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: 0 },
  nextStopThumb: { width: 92, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  nextStopCircle: { width: 40, height: 40, borderRadius: '50%', background: ORANGE, color: W, fontSize: 26, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, paddingLeft: 3 },
  prevStopCircle: { width: 40, height: 40, borderRadius: '50%', background: BORDER_DEFAULT, color: TXT_STRONG, fontSize: 26, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, paddingRight: 3 },
  nextStopLabel: { fontSize: 11, color: TXT_SUBTLE, marginTop: 2 },
  nextStopName: { fontSize: 13, fontWeight: 700, color: TXT_STRONG, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 88 },

  listWrap: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 },
  listHeader: { flexShrink: 0, background: BG_MUTED },
  listTopBar: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px 6px', background: BG_MUTED },
  listSecondBar: { display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px 8px', background: BG_MUTED, justifyContent: 'flex-end' },
  tocBtnList: { height: 34, padding: '0 12px', borderRadius: 9999, background: TXT_STRONG, color: W, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', outline: 'none' },
  listFilter: { height: 34, padding: '0 12px', borderRadius: 9999, border: `1px solid ${BORDER_DEFAULT}`, background: BG_PAGE, color: TXT_STRONG, fontSize: 13, fontWeight: 400, cursor: 'pointer', display: 'flex', alignItems: 'center', outline: 'none' },
  listFilterOn: { background: W, border: `1.5px solid ${ORANGE}`, color: ORANGE, fontWeight: 700 },
  searchIconBtn: { width: 36, height: 36, border: 'none', background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, outline: 'none' },
  searchIconAbsBtn: { position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, border: 'none', background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', outline: 'none' },
  searchBar: { flex: 1, display: 'flex', alignItems: 'center', gap: 8, height: 38, border: `1.5px solid ${ORANGE}`, borderRadius: 9999, padding: '0 14px', background: BG_PAGE },
  searchInput: { flex: 1, border: 'none', outline: 'none', background: 'none', fontSize: 14, color: TXT_STRONG, fontFamily: 'inherit' },
  searchCancelBtn: { flexShrink: 0, border: 'none', background: 'none', fontSize: 14, fontWeight: 500, color: TXT_DEFAULT, cursor: 'pointer', outline: 'none', padding: '0 4px' },
  listBody: { flex: 1, overflow: 'auto', padding: '4px 8px 16px' },
  listGroupBox: { background: W, borderRadius: 12, overflow: 'hidden' },
  listItem: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 12px', borderRadius: 0, border: 'none', borderBottom: '1px solid #EBEBEB', background: 'none', cursor: 'pointer' },
  listItemOn: {},
  listThumb: { position: 'relative', width: 92, height: 92, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: BG_MUTED, border: '2px solid transparent' },
  listThumbOn: { border: `2px solid ${ORANGE}` },
  listThumbNowPlay: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, background: 'rgba(0,0,0,0.42)' },
  listThumbDim: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.30)', borderRadius: 8 },
  listThumbEqBadge: { position: 'absolute', top: 5, right: 5, display: 'flex', alignItems: 'flex-end', gap: 2, background: 'rgba(0,0,0,0.42)', borderRadius: 4, padding: '4px 5px' },
  eqBar: { width: 3, background: '#fff', borderRadius: 2, transformOrigin: 'bottom', animation: 'eq 0.8s ease-in-out infinite' },
  stripEqBadge: { position: 'absolute', top: 5, right: 5, display: 'flex', alignItems: 'flex-end', gap: 2, background: 'rgba(0,0,0,0.42)', borderRadius: 4, padding: '4px 5px' },
  stripHeart: { position: 'absolute', bottom: 4, right: 4, background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', fontSize: 16, cursor: 'pointer', padding: 2, lineHeight: 1 },
  stripHeartOn: { position: 'absolute', bottom: 4, right: 4, background: 'none', border: 'none', color: ORANGE, fontSize: 16, cursor: 'pointer', padding: 2, lineHeight: 1 },
  listTitle: { fontSize: 15, fontWeight: 600, color: TXT_STRONG },
  listSub: { fontSize: 13, color: TXT_SUBTLE, marginTop: 2 },
  listHeartOff: { background: 'none', border: 'none', color: BORDER_DEFAULT, fontSize: 20, cursor: 'pointer', flexShrink: 0, padding: '4px 8px', lineHeight: 1 },
  listHeartOn: { background: 'none', border: 'none', color: ORANGE, fontSize: 20, cursor: 'pointer', flexShrink: 0, padding: '4px 8px', lineHeight: 1 },

  dim: { position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.50)' },
  overlaySheet: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%', zIndex: 51, background: BG_PAGE, borderRadius: '16px 16px 0 0', display: 'flex', flexDirection: 'column', boxShadow: '0 -4px 12px rgba(0,0,0,0.30)' },
  overlayHandle: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 28, flexShrink: 0 },
  overlayHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px 12px', borderBottom: `1px solid ${BORDER_DEFAULT}`, flexShrink: 0 },
  overlayTitle: { fontSize: 20, fontWeight: 600, color: TXT_STRONG },
  overlayClose: { background: 'none', border: 'none', fontSize: 24, color: TXT_DEFAULT, cursor: 'pointer', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  overlayBody: { flex: 1, overflow: 'auto', padding: '20px 24px' },
  overlayEmpty: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' },
  scriptBody: { lineHeight: 1.6 },
  scriptTitle: { fontSize: 20, fontWeight: 600, color: TXT_STRONG, margin: '0 0 16px' },
  scriptText: { fontSize: 16, color: TXT_DEFAULT, margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 },

  settingsBody: { display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 20 },
  settingsRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  settingsLabel: { fontSize: 16, fontWeight: 600, color: TXT_STRONG },
  settingsValue: { fontSize: 15, fontWeight: 400, color: TXT_SUBTLE },
  toggleTrack: { width: 44, height: 24, borderRadius: 9999, background: BORDER_DEFAULT, border: 'none', cursor: 'pointer', position: 'relative', padding: 0 },
  toggleTrackOn: { background: ORANGE },
  toggleHandle: { width: 20, height: 20, borderRadius: '50%', background: W, position: 'absolute', top: 2, left: 2, transition: 'left 150ms ease' },
  toggleHandleOn: { left: 22 },
};
