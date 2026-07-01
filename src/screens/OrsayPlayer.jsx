import { useState, useRef, useEffect, useMemo } from 'react';
import { orsayFloorMaps, orsayRoomPins } from '../data/orsayTourData';

// 스냅별 시트 높이 (뷰포트 높이 대비 %)
//  0: 지도 닫힘 → 풀 플레이어 / 1: 지도+스트립 / 2: 지도 크게(90%)
const SHEET_VH = [0, 68, 90];

export default function OrsayPlayer({
  artwork, artworks, currentIndex, total,
  onPrev, onNext, onHome, onSelectIndex,
}) {
  const [snap, setSnap] = useState(0);        // 진입 시 전체 펼침(0%)
  const [pinActive, setPinActive] = useState(false);
  const [dragH, setDragH] = useState(null);   // 드래그 중 px, 평소 null
  const [tab, setTab] = useState('map');      // 'map' | 'list'
  const [listFilter, setListFilter] = useState('all'); // 'all' | 'best' | 'liked'
  const [floorFilter, setFloorFilter] = useState(null); // null = 전체, 1 | 2 | 5 — 레이블 표시용
  const [floorDropOpen, setFloorDropOpen] = useState(false);
  const listBodyRef = useRef(null);
  const groupRefsMap = useRef({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showRoute, setShowRoute] = useState(true);
  const [autoplay, setAutoplay] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [likedIds, setLikedIds] = useState(new Set());
  // 지도 탐색 인덱스 — 핀 클릭 시 이것만 바뀌고 재생 트랙(currentIndex)은 유지됨
  const [browseIndex, setBrowseIndex] = useState(currentIndex);
  // 재생 트랙이 외부(onPrev/onNext/onSelectIndex)에 의해 변경되면 탐색도 따라감
  useEffect(() => { setBrowseIndex(currentIndex); }, [currentIndex]);
  // 지도보기 클릭 시 현재 핀으로 지도 센터 이동 트리거
  const [mapCenterTrigger, setMapCenterTrigger] = useState(0);
  const isLiked = (id) => likedIds.has(id);
  const toggleLike = (id, e) => {
    e.stopPropagation();
    setLikedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const [overlay, setOverlay] = useState(null); // 'comments' | 'script' | 'settings' | null

  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(null);
  const lastTimeRef = useRef(0);
  const dragRef = useRef({ dragging: false, startY: 0, startH: 0 });

  const isFull = snap === 0;
  const mediaSrc = artwork.audioSrc || artwork.videoSrc || null;
  const hasAudio = !!mediaSrc;

  // 방을 투어 순서대로 묶은 "순서 stop" 목록 (1번 ~ 마지막). 추가 작품(floor 없음)은 제외.
  const roomStops = useMemo(() => {
    const m = new Map();
    artworks.forEach((a, i) => {
      if (!a.floor || !a.room) return;
      if (!m.has(a.room)) m.set(a.room, { room: a.room, floor: a.floor, idxs: [] });
      m.get(a.room).idxs.push(i);
    });
    return [...m.values()].map((s, k) => ({ ...s, seq: k + 1 }));
  }, [artworks]);

  // 탐색 중인 방 기준으로 stop 계산 (재생 트랙과 독립)
  const browseArtwork = artworks[browseIndex];
  const activeStop = roomStops.find(s => s.room === browseArtwork?.room && s.floor === browseArtwork?.floor) || null;
  const stripIdxs = activeStop
    ? activeStop.idxs
    : artworks.map((a, i) => i).filter(i => !artworks[i].floor);
  // 이전/다음 장소(stop)
  const prevStop = activeStop ? roomStops.find(s => s.seq === activeStop.seq - 1) : null;
  const nextStop = activeStop ? roomStops.find(s => s.seq === activeStop.seq + 1) : roomStops[0];

  const autoPlayOnSelectRef = useRef(false);

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

  // 자동재생: 오디오 끝나면 다음 트랙으로
  const onEnded = () => {
    setIsPlaying(false);
    if (autoplay && currentIndex < total - 1) onNext();
  };

  // ── 오디오 ───────────────────────────────────
  const playPause = () => {
    const a = audioRef.current;
    if (!a || !hasAudio) return;
    if (isPlaying) a.pause();
    else a.play().catch(() => {});
    setIsPlaying(p => !p);
  };
  const onTime = () => {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    lastTimeRef.current = a.currentTime;
    setElapsed(Math.floor(a.currentTime));
    setProgress((a.currentTime / a.duration) * 100);
  };
  const onMeta = () => {
    const a = audioRef.current;
    if (a) setDuration(Math.floor(a.duration));
  };
  const seek = (e) => {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - r.left) / r.width) * a.duration;
  };
  const nudge = (sec) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, a.currentTime + sec);
  };
  const changeSpeed = (s) => {
    setSpeed(s);
    const a = audioRef.current;
    if (a) a.playbackRate = s;
  };
  const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  const totalDisplay = duration > 0 ? fmt(duration) : artwork.duration?.slice(3) ?? '0:00';

  // ── 시트 드래그 ───────────────────────────────
  const vh = () => window.innerHeight / 100;
  const onDown = (e) => {
    dragRef.current = { dragging: true, startY: e.clientY, startH: SHEET_VH[snap] * vh() };
    setDragH(SHEET_VH[snap] * vh());
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!dragRef.current.dragging) return;
    const dy = dragRef.current.startY - e.clientY; // 위로 = +
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

  // 오디오 엘리먼트는 항상 마운트(풀↔미니 무관) — 끊김 없이 재생
  const audioEl = (
    <audio
      ref={audioRef}
      src={mediaSrc || undefined}
      onTimeUpdate={onTime}
      onLoadedMetadata={onMeta}
      onEnded={onEnded}
      preload="metadata"
    />
  );

  return (
    <div style={styles.root}>
      {audioEl}
      {/* ============ 플레이어 레이어 ============ */}
      <div style={{ ...styles.player, bottom: sheetH, transition: `bottom ${sheetTrans.includes('none') ? '0s' : '0.32s cubic-bezier(0.4,0,0.2,1)'}` }}>
        {/* 상단 바 */}
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
          /* ── 풀 플레이어 ── */
          <div style={styles.fullWrap}>
            <ArtCarousel artwork={artwork} hasAudio={hasAudio} isPlaying={isPlaying} />

            <div style={{ textAlign: 'left', margin: '12px 0 4px' }}>
              <span style={styles.count}>{floorLabel(artwork)}</span>
            </div>

            <div style={styles.titleRow}>
              <div style={{ flex: 1 }}>
                <h2 style={styles.title}>{artwork.title}</h2>
                <p style={styles.subtitle}>오르세 미술관 · {artwork.subtitle}</p>
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

            <Controls big isPlaying={isPlaying} hasAudio={hasAudio} onPlay={playPause} onPrev={onPrev} onNext={onNext} onNudge={nudge} />

            <div style={styles.bottomBtns}>
              <button style={styles.bottomBtn} onClick={() => { setTab('map'); setSnap(1); setBrowseIndex(currentIndex); setPinActive(true); setMapCenterTrigger(n => n + 1); }}>▥ 지도보기</button>
              <button style={styles.bottomBtn} onClick={() => { setTab('list'); setSnap(1); }}>☰ 목차보기</button>
            </div>
          </div>
        ) : snap === 2 ? (
          /* ── 90% 컴팩트 바: 썸네일 + 제목(마퀴) + 재생 + ⌄ ── */
          <div style={styles.compactBar} onClick={() => setSnap(0)}>
            <div style={styles.compactThumb}>
              <ArtImage src={artwork.imageSrc} alt={artwork.title} cover />
            </div>
            <div style={styles.compactTitleWrap}>
              <span style={styles.compactTitle}>{artwork.title}</span>
            </div>
            <div style={styles.compactControls} onClick={e => e.stopPropagation()}>
              <button
                style={{ ...styles.compactPlayBtn, ...(hasAudio ? {} : styles.playDisabled) }}
                onClick={playPause}
              >
                {hasAudio ? (isPlaying ? '⏸' : '▶') : '🔇'}
              </button>
              <button style={styles.compactDownBtn} onClick={() => setSnap(0)}>⌄</button>
            </div>
          </div>
        ) : (
          /* ── 미니 플레이어: 작품 이미지 풀배경 + 트랙명/컨트롤 한 줄 ── */
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
                <button style={{ ...styles.miniBarPlay, ...(hasAudio ? {} : styles.playDisabled) }} onClick={playPause}>
                  {hasAudio ? (isPlaying ? '⏸' : '▶') : '🔇'}
                </button>
                <button style={styles.miniBarBtn} onClick={onNext}>⏭</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ============ 지도 바텀시트 ============ */}
      <div style={{ ...styles.sheet, height: sheetH, transition: sheetTrans }}>
        {/* 시트 우하단 고정 탭 토글 */}
        <div style={{ ...styles.sheetTabToggleFixed, bottom: (pinActive && !!activeStop) ? 162 : 16, transition: 'bottom 0.3s cubic-bezier(0.4,0,0.2,1)' }}>
          <button style={{ ...styles.sheetTabBtn, ...(tab === 'map' ? styles.sheetTabBtnOn : {}) }}
                  onClick={() => { setTab('map'); setPinActive(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: 4, verticalAlign: 'middle' }}>
                    <path d="M3 6L9 3L15 6L21 3V18L15 21L9 18L3 21V6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                    <line x1="9" y1="3" x2="9" y2="18" stroke="currentColor" strokeWidth="2"/>
                    <line x1="15" y1="6" x2="15" y2="21" stroke="currentColor" strokeWidth="2"/>
                  </svg>지도</button>
          <button style={{ ...styles.sheetTabBtn, ...(tab === 'list' ? styles.sheetTabBtnOn : {}) }}
                  onClick={() => { setTab('list'); setPinActive(false); }}>☰ 목차</button>
        </div>
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
              <FloorMapView artworks={artworks} currentIndex={browseIndex} playingIndex={currentIndex} roomStops={roomStops}
                            showRoute={showRoute}
                            pinActive={pinActive}
                            centerTrigger={mapCenterTrigger}
                            onPinClick={(i) => { setBrowseIndex(i); setSnap(1); setPinActive(true); }}
                            onMapClick={() => { setSnap(1); setPinActive(false); }}
                            stripActive={pinActive && !!activeStop}
                            onToggleRoute={() => setShowRoute(r => !r)} />
              <div style={styles.mapTopBar}>
              </div>
            </div>

            {snap >= 1 && pinActive && activeStop && (
              <div style={styles.stripOverlay}>

                <div style={styles.strip}>
                  {/* 이전 코스 카드 — strip 첫 번째 */}
                  {prevStop && (
                    <button
                      style={{ ...styles.stripCard, ...styles.nextStopCard }}
                      onClick={() => { autoPlayOnSelectRef.current = true; onSelectIndex(prevStop.idxs[0]); setSnap(1); }}
                    >
                      <div style={styles.nextStopThumb}>
                        <div style={styles.prevStopCircle}>‹</div>
                      </div>
                      <div style={styles.nextStopLabel}>이전 장소</div>
                      <div style={styles.nextStopName}>{roomName(prevStop.room)}</div>
                    </button>
                  )}
                  {stripIdxs.map((gi) => {
                    const a = artworks[gi];
                    const active = gi === currentIndex;
                    return (
                      <div key={a.id} style={styles.stripCard}>
                        <div style={{ ...styles.stripThumb, ...(active ? styles.stripThumbOn : {}) }}
                             onClick={() => { autoPlayOnSelectRef.current = true; onSelectIndex(gi); setBrowseIndex(gi); setSnap(1); }}>
                          <ArtImage src={a.imageSrc} alt={a.title} cover />
                          {active && isPlaying && (
                            <div style={styles.stripEqBadge}>
                              <span style={{ ...styles.eqBar, animationDelay: '0s', height: 6 }} />
                              <span style={{ ...styles.eqBar, animationDelay: '0.15s', height: 10 }} />
                              <span style={{ ...styles.eqBar, animationDelay: '0.3s', height: 7 }} />
                            </div>
                          )}
                          <button
                            style={isLiked(a.id) ? styles.stripHeartOn : styles.stripHeart}
                            onClick={(e) => { e.stopPropagation(); toggleLike(a.id, e); }}
                          >
                            {isLiked(a.id) ? '♥' : '♡'}
                          </button>
                        </div>
                        <div style={{ ...styles.stripName, ...(active ? styles.stripNameOn : {}) }}
                             onClick={() => { autoPlayOnSelectRef.current = true; onSelectIndex(gi); setBrowseIndex(gi); setSnap(1); }}>
                          {a.star ? '★ ' : ''}{a.title}
                        </div>
                      </div>
                    );
                  })}
                  {/* 다음 장소 카드 — strip 마지막 (다음 장소 있을 때만 노출) */}
                  {nextStop && (
                    <button
                      style={{ ...styles.stripCard, ...styles.nextStopCard }}
                      onClick={() => { autoPlayOnSelectRef.current = true; onSelectIndex(nextStop.idxs[0]); setSnap(1); }}
                    >
                      <div style={styles.nextStopThumb}>
                        <div style={styles.nextStopCircle}>›</div>
                      </div>
                      <div style={styles.nextStopLabel}>다음 장소</div>
                      <div style={styles.nextStopName}>{roomName(nextStop.room)}</div>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* 목차 리스트 */
          <div style={styles.listWrap}>
            {/* 고정 헤더 영역 (스크롤 밖) */}
            <div style={styles.listHeader}>
              {/* 1행: 스크롤 가능한 탭+필터 / 고정 검색 아이콘 */}
              <div style={styles.listTopBarOuter}>
                <div style={styles.listTopBar}>
                  <button style={{ ...styles.listFilter, ...(listFilter === 'all' ? styles.listFilterOn : {}) }}
                          onClick={() => setListFilter('all')}>전체</button>
                  <button style={{ ...styles.listFilter, ...(listFilter === 'best' ? styles.listFilterOn : {}) }}
                          onClick={() => setListFilter('best')}>☆ BEST</button>
                  <button style={{ ...styles.listFilter, ...(listFilter === 'liked' ? styles.listFilterOn : {}) }}
                          onClick={() => setListFilter('liked')}>♡ 좋아요</button>
                </div>
                {!searchOpen && (
                  <button style={styles.searchIconAbsBtn} onClick={() => setSearchOpen(true)}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <circle cx="11" cy="11" r="7" stroke={TXT_DEFAULT} strokeWidth="2"/>
                      <line x1="16.5" y1="16.5" x2="21" y2="21" stroke={TXT_DEFAULT} strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </button>
                )}
              </div>
              {/* 2행: 층 드랍다운(전체만) + 검색바 */}
              {(searchOpen || listFilter === 'all') && (
                <div style={styles.listSecondBar}>
                  {searchOpen ? (
                    <>
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
                    </>
                  ) : (
                    <button style={styles.floorSelector} onClick={() => setOverlay('floorFilter')}>
                      <span style={styles.floorSelectorLabel}>
                        {floorFilter !== null ? orsayFloorMaps[floorFilter].label : '층 전체'}
                      </span>
                      <span style={styles.floorSelectorChevron}>▼</span>
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* 스크롤 목록 — 층별 그룹 */}
            <div ref={listBodyRef} style={styles.listBody}>
              {(() => {
                const filtered = artworks.map((a, i) => ({ a, i })).filter(({ a }) => {
                  if (listFilter === 'best' && !a.star) return false;
                  if (listFilter === 'liked' && !isLiked(a.id)) return false;
                  if (searchQuery && !a.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
                  return true;
                });
                const groups = [];
                let lastFloor = null;
                filtered.forEach(({ a, i }) => {
                  if (a.floor !== lastFloor) {
                    groups.push({ floor: a.floor, items: [] });
                    lastFloor = a.floor;
                  }
                  groups[groups.length - 1].items.push({ a, i });
                });
                return groups.map(({ floor, items }) => (
                  <div key={floor ?? 'none'} ref={el => { groupRefsMap.current[floor ?? 'none'] = el; }} style={{ marginBottom: 8 }}>
                    <div style={styles.listGroupHeader}>{floor != null ? (orsayFloorMaps[floor]?.label ?? `${floor}층`) : '전체'}</div>
                    <div style={styles.listGroupBox}>
                    {items.map(({ a, i }) => (
                      <button key={a.id}
                              style={{ ...styles.listItem, ...(i === currentIndex ? styles.listItemOn : {}) }}
                              onClick={() => { autoPlayOnSelectRef.current = true; onSelectIndex(i); setSnap(1); }}>
                        <div style={{ ...styles.listThumb, ...(i === currentIndex ? styles.listThumbOn : {}) }}>
                          <ArtImage src={a.imageSrc} alt={a.title} cover />
                          {i === currentIndex && (
                            <div style={styles.listThumbNowPlay}>
                              <span style={{ ...styles.eqBar, animationDelay: '0s', height: 6 }} />
                              <span style={{ ...styles.eqBar, animationDelay: '0.15s', height: 10 }} />
                              <span style={{ ...styles.eqBar, animationDelay: '0.3s', height: 7 }} />
                            </div>
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
                ));
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
                {overlay === 'comments' ? '댓글' : overlay === 'script' ? '스크립트' : overlay === 'floorFilter' ? '목록' : '설정'}
              </span>
              <button style={styles.overlayClose} onClick={() => setOverlay(null)}>✕</button>
            </div>
            <div style={styles.overlayBody}>
              {overlay === 'floorFilter' && (
                <div>
                  {[null, 1, 2, 5].map(f => (
                    <button
                      key={f ?? 'all'}
                      style={{ ...styles.floorModalItem, ...(floorFilter === f ? styles.floorModalItemOn : {}) }}
                      onClick={() => {
                        setFloorFilter(f);
                        setOverlay(null);
                        requestAnimationFrame(() => {
                          const key = f ?? 'none';
                          const el = groupRefsMap.current[key];
                          if (f === null) {
                            listBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                          } else if (el && listBodyRef.current) {
                            const offset = el.offsetTop - listBodyRef.current.offsetTop;
                            listBodyRef.current.scrollTo({ top: offset, behavior: 'smooth' });
                          }
                        });
                      }}>
                      {f === null ? '층 전체' : orsayFloorMaps[f]?.label ?? `${f}층`}
                    </button>
                  ))}
                </div>
              )}
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

function roomName(room) {
  return room === '입구' || room === '조각홀' ? room : `${room}관`;
}

function floorLabel(a) {
  if (!a.floor) return a.subtitle || '';
  const f = orsayFloorMaps[a.floor];
  const fl = f ? f.label : `${a.floor}층`;
  return a.room ? `${fl} · ${roomName(a.room)}` : fl;
}

// 캐로젤 (carouselImages 있을 때만, 없으면 단일 이미지)
function ArtCarousel({ artwork, hasAudio, isPlaying }) {
  const images = artwork.carouselImages?.length > 1 ? artwork.carouselImages : null;
  const [idx, setIdx] = useState(0);
  const touchRef = useRef(null);

  useEffect(() => { setIdx(0); }, [artwork.id]);

  const onTouchStart = (e) => { touchRef.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchRef.current == null) return;
    const dx = e.changedTouches[0].clientX - touchRef.current;
    touchRef.current = null;
    if (Math.abs(dx) < 40) return;
    if (!images) return;
    setIdx(i => dx < 0 ? Math.min(i + 1, images.length - 1) : Math.max(i - 1, 0));
  };

  if (!images) {
    return (
      <div style={styles.artBig}>
        <ArtImage src={artwork.imageSrc} alt={artwork.title} />
        {artwork.star && <span style={styles.badge}>핵심</span>}
      </div>
    );
  }

  // peek 슬라이드: 각 아이템 75% 너비, 양 옆 인접 이미지가 보임
  const ITEM_W = 80;   // % of wrapper
  const GAP = 8;       // px between items
  const OFFSET = 10;   // % from left to center first item

  return (
    <div style={{ width: '100%', overflow: 'hidden', margin: '6px 0 0', position: 'relative' }}
         onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div style={{
        display: 'flex',
        gap: GAP,
        transform: `translateX(calc(${OFFSET}% - ${idx} * (${ITEM_W}% + ${GAP}px)))`,
        transition: 'transform 0.3s ease',
      }}>
        {images.map((src, i) => (
          <div key={i} style={{
            width: `${ITEM_W}%`,
            aspectRatio: '1 / 1',
            flexShrink: 0,
            borderRadius: 8,
            overflow: 'hidden',
            background: '#2a2a2a',
            opacity: i === idx ? 1 : 0.5,
            transition: 'opacity 0.3s',
            position: 'relative',
          }} onClick={i !== idx ? () => setIdx(i) : undefined}>
            <ArtImage src={src} alt={`${artwork.title} ${i + 1}`} />
            {i === idx && artwork.star && <span style={styles.badge}>핵심</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// 작품 이미지 (없으면 플레이스홀더)
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

function Controls({ big, isPlaying, hasAudio, onPlay, onPrev, onNext, onNudge }) {
  const size = big ? styles.ctrlBig : styles.ctrl;
  return (
    <div style={styles.controls}>
      <button style={styles.ctrlSide} onClick={() => onNudge(-5)} disabled={!hasAudio}>↺<sub style={styles.ctrlNum}>5</sub></button>
      <button style={size} onClick={onPrev}>⏮</button>
      <button style={{ ...(big ? styles.playBig : styles.play), ...(hasAudio ? {} : styles.playDisabled) }} onClick={onPlay}>
        {hasAudio ? (isPlaying ? '⏸' : '▶') : '🔇'}
      </button>
      <button style={size} onClick={onNext}>⏭</button>
      <button style={styles.ctrlSide} onClick={() => onNudge(5)} disabled={!hasAudio}><sub style={styles.ctrlNum}>5</sub>↻</button>
    </div>
  );
}

// 층별 이미지 도면 + 순서 핀 + 경로선
function FloorMapView({ artworks, currentIndex, playingIndex, roomStops, showRoute, pinActive, centerTrigger, stripActive, onPinClick, onMapClick, onToggleRoute }) {
  const current = artworks[currentIndex];
  const playing = artworks[playingIndex];
  const [floor, setFloor] = useState(current.floor || 1);
  const [imgErr, setImgErr] = useState(false);
  const chipsRef = useRef(null);

  // 줌/팬 상태
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef({ dragging: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0 });
  const pinchRef = useRef({ pinching: false, startDist: 0, startZoom: 1 });
  const imgBoxRef = useRef(null);
  const canvasRef = useRef(null);

  // 층 바뀌면 줌 리셋
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, [floor]);

  const onMapPointerDown = (e) => {
    if (e.pointerType === 'touch') return; // touch는 onTouchStart에서 처리
    panRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, startPanX: pan.x, startPanY: pan.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMapPointerMove = (e) => {
    if (!panRef.current.dragging || e.pointerType === 'touch') return;
    setPan({
      x: panRef.current.startPanX + (e.clientX - panRef.current.startX),
      y: panRef.current.startPanY + (e.clientY - panRef.current.startY),
    });
  };
  const onMapPointerUp = (e) => {
    if (e.pointerType === 'touch') return;
    panRef.current.dragging = false;
  };

  const getTouchDist = (touches) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };
  const onMapTouchStart = (e) => {
    if (e.touches.length === 2) {
      pinchRef.current = { pinching: true, startDist: getTouchDist(e.touches), startZoom: zoom };
    } else if (e.touches.length === 1 && zoom > 1) {
      panRef.current = { dragging: true, startX: e.touches[0].clientX, startY: e.touches[0].clientY, startPanX: pan.x, startPanY: pan.y };
    }
  };
  const onMapTouchMove = (e) => {
    if (pinchRef.current.pinching && e.touches.length === 2) {
      e.preventDefault();
      const dist = getTouchDist(e.touches);
      const newZoom = Math.min(4, Math.max(1, pinchRef.current.startZoom * (dist / pinchRef.current.startDist)));
      setZoom(newZoom);
    } else if (panRef.current.dragging && e.touches.length === 1 && zoom > 1) {
      e.preventDefault();
      setPan({
        x: panRef.current.startPanX + (e.touches[0].clientX - panRef.current.startX),
        y: panRef.current.startPanY + (e.touches[0].clientY - panRef.current.startY),
      });
    }
  };
  const onMapTouchEnd = () => {
    pinchRef.current.pinching = false;
    panRef.current.dragging = false;
    if (zoom <= 1) setPan({ x: 0, y: 0 });
  };

  const onMapWheel = (e) => {
    e.preventDefault();
    setZoom(z => Math.min(4, Math.max(1, z - e.deltaY * 0.002)));
  };

  const resetZoom = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // 지도보기 클릭 시 현재 핀 위치로 중앙 이동 + 확대
  useEffect(() => {
    if (!centerTrigger) return;
    const box = imgBoxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas) return;
    const pos = pins[current.room];
    if (!pos) return;
    const targetZoom = 2.2;
    const bw = box.clientWidth;
    const bh = box.clientHeight;
    const cw = canvas.offsetWidth;
    const ch = canvas.offsetHeight;
    const canvasLeft = (bw - cw) / 2;
    const canvasTop = (bh - ch) / 2;
    const pinX = canvasLeft + cw * pos.x / 100;
    const pinY = canvasTop + ch * pos.y / 100;
    // zoom 적용 후 핀이 중앙에 오도록 pan 계산
    setPan({ x: (bw / 2 - pinX) * targetZoom, y: (bh / 2 - pinY) * targetZoom });
    setZoom(targetZoom);
  }, [centerTrigger]);

  // 현재 작품 층으로 자동 전환
  useEffect(() => { if (current.floor) setFloor(current.floor); }, [current.floor]);
  useEffect(() => { setImgErr(false); }, [floor]);

  const floors = useMemo(() => Object.keys(orsayFloorMaps).map(Number), []);
  const map = orsayFloorMaps[floor];
  const pins = useMemo(() => orsayRoomPins[floor] || {}, [floor]);

  // 이 층의 순서 stop (좌표가 있는 것만, seq 순서대로)
  const floorStops = useMemo(
    () => roomStops.filter(s => s.floor === floor && pins[s.room]),
    [roomStops, floor, pins]
  );
  const currentRoom = current.room;
  // 현재 순서(seq). 이 번호 이하 = 이미 지나간 것으로 표시.
  const currentStop = roomStops.find(s => s.room === currentRoom && s.floor === current.floor);
  const currentSeq = currentStop ? currentStop.seq : 0;

  // 경로선: 지나간 구간(seq ≤ 현재)·앞으로 갈 구간(seq ≥ 현재) 분리.
  // 핀 사이 "중간점"을 끼워넣어, 화살표(markerMid)가 핀에 가리지 않고 구간 가운데에 찍히도록 한다.
  const densePts = (stops) => {
    const c = stops.map(s => [pins[s.room].x, pins[s.room].y]);
    if (c.length < 2) return '';
    const out = [c[0]];
    for (let i = 1; i < c.length; i++) {
      out.push([(c[i - 1][0] + c[i][0]) / 2, (c[i - 1][1] + c[i][1]) / 2], c[i]);
    }
    return out.map(p => `${p[0]},${p[1]}`).join(' ');
  };
  // 전체 경로 (그레이 선)
  const allPts = densePts(floorStops);

  // 활성 핀 → 다음 핀 구간 (오렌지 실선 + chevron)
  const segFrom = floorStops.find(s => s.seq === currentSeq);
  const segTo = floorStops.find(s => s.seq === currentSeq + 1);
  let seg = null;
  if (segFrom && segTo) {
    const a = pins[segFrom.room], b = pins[segTo.room];
    const dist = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
    // 마커 너비(5) + 간격(1.5) = 6.5 단위마다 1개
    const spacing = 4.5;
    const steps = Math.max(1, Math.round(dist / spacing));
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts.push(`${a.x + (b.x - a.x) * t},${a.y + (b.y - a.y) * t}`);
    }
    seg = pts.join(' ');
  }

  // 현재 stop 칩을 가운데로 (지도는 한 화면에 다 보이므로 스크롤 불필요)
  useEffect(() => {
    chipsRef.current?.querySelector('[data-active="1"]')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [currentRoom]);

  const pinStyle = (s, isActive) => {
    if (s.seq === currentSeq && isActive && pinActive) return styles.pinOn;  // 현재 + 활성
    if (s.seq < currentSeq) return styles.pinVisited;           // 지나감
    return null;                                                 // 앞으로 or 비활성
  };
  const chipStyle = (s) => {
    if (s.seq === currentSeq) return styles.roomChipOn;
    if (s.seq < currentSeq) return styles.roomChipVisited;
    return null;
  };

  return (
    <div style={styles.floorWrap}>
      <div ref={imgBoxRef} style={styles.floorImgBox}
           onPointerDown={onMapPointerDown} onPointerMove={onMapPointerMove}
           onPointerUp={onMapPointerUp} onPointerCancel={onMapPointerUp}
           onTouchStart={onMapTouchStart} onTouchMove={onMapTouchMove} onTouchEnd={onMapTouchEnd}
           onWheel={onMapWheel}
           onClick={onMapClick}>
        {map && !imgErr ? (
          <div ref={canvasRef} style={{ ...styles.floorCanvas, transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`, transition: pinchRef.current.pinching || panRef.current.dragging ? 'none' : 'transform 0.2s ease-out' }}>
            <img src={map.src} alt={map.label} style={styles.floorImg} onError={() => setImgErr(true)} />
            {floorStops.length > 1 && showRoute && (
              <svg style={styles.routeSvg} viewBox="0 0 100 100">
                <defs>
                  <marker id="arrowBlock" markerWidth="2" markerHeight="2" refX="1" refY="1"
                          orient="auto" markerUnits="userSpaceOnUse">
                    <rect x="0" y="0" width="2" height="2" rx="0.2" fill={ORANGE} />
                    <path d="M0.5,0.3 L1.6,1 L0.5,1.7" fill="none" stroke="#fff" strokeWidth="0.5"
                          strokeLinecap="round" strokeLinejoin="round" />
                  </marker>
                </defs>
                {/* 전체 경로: 그레이 선 */}
                {allPts && (
                  <polyline points={allPts} fill="none" stroke="#FFBA94" strokeWidth="0.5"
                            strokeLinejoin="round" strokeLinecap="round" strokeDasharray="1 1" opacity="0.6" />
                )}
                {/* 활성 → 다음: 주황 실선 + 블록 화살표 */}
                {seg && (
                  <polyline points={seg} fill="none" stroke={ORANGE} strokeWidth="2"
                            strokeLinejoin="round" strokeLinecap="round"
                            markerMid="url(#arrowBlock)" />
                )}
              </svg>
            )}
            {/* 순서 핀: 지나감(회색) · 현재(주황) · 앞으로(파랑) */}
            {floorStops.map(s => {
              const pos = pins[s.room];
              const isCurrent = s.seq === currentSeq;
              const isPlaying = s.room === playing?.room && s.floor === playing?.floor;
              return (
                <div key={s.room} style={{ position: 'absolute', left: `${pos.x}%`, top: `${pos.y}%`, transform: `translate(-50%,-50%) scale(${1 / zoom})`, transformOrigin: 'center center', zIndex: isCurrent ? 4 : isPlaying ? 3 : 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {isCurrent && pinActive ? (
                    <div style={styles.pinTooltipWrap}>
                      <div style={styles.pinTooltip}>{roomName(s.room)}</div>
                      <div style={styles.pinTooltipArrow} />
                    </div>
                  ) : s.seq === 1 && (
                    <div style={styles.pinTooltipWrap}>
                      <div style={styles.pinStartBubble}>Start</div>
                      <div style={styles.pinTooltipArrow} />
                    </div>
                  )}
                  <div style={{ position: 'relative' }}>
                    <button
                      style={{ ...styles.pin, position: 'relative', left: 'auto', top: 'auto', transform: 'none', ...pinStyle(s, true), ...(isPlaying ? { background: ORANGE, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2, paddingBottom: 3 } : {}) }}
                      onClick={(e) => { e.stopPropagation(); onPinClick(s.idxs[0]); }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onPinClick(s.idxs[0]); }}>
                      {isPlaying ? (
                        <>
                          <span style={{ ...styles.pinEqBar, height: 7, animationDelay: '0s' }} />
                          <span style={{ ...styles.pinEqBar, height: 10, animationDelay: '0.2s' }} />
                          <span style={{ ...styles.pinEqBar, height: 5, animationDelay: '0.1s' }} />
                        </>
                      ) : showRoute ? s.seq : null}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={styles.floorPlaceholder}>
            <div style={styles.floorPhIcon}>🗺️</div>
            <div style={styles.floorPhTxt}>{map ? map.label : `${floor}층`} 도면</div>
            <div style={styles.floorPhSub}>이미지 도면을 public/orsay/ 에 넣어주세요</div>
          </div>
        )}
      </div>

      {/* 좌측 하단 버튼 그룹: 경로 + 층 선택 */}
      <div style={{ position: 'absolute', left: 10, zIndex: 6, bottom: stripActive ? 162 : 10, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, transition: 'bottom 0.3s cubic-bezier(0.4,0,0.2,1)' }}>
        <div style={styles.floorPill}>
          {floors.slice().reverse().map(f => (
            <button key={f}
                    style={{ ...styles.floorPillItem, ...(f === floor ? styles.floorPillItemOn : {}) }}
                    onClick={() => setFloor(f)}>
              {orsayFloorMaps[f].label}
            </button>
          ))}
        </div>
        <button
          style={{ ...styles.mapTopBtn, ...(showRoute ? styles.mapTopBtnOn : {}) }}
          onClick={e => { e.stopPropagation(); onToggleRoute?.(); }}>
          {showRoute ? '경로 끄기' : '경로 켜기'}
        </button>
      </div>

    </div>
  );
}

// — TourLive Design Tokens —
const W = '#FFFFFF';        // Gray.0 / text.inverse
const ORANGE = '#FF730D';   // Orange.500 / primary.default
const ORANGE_HOVER = '#FF5811'; // Orange.600 / primary.hover
const ORANGE_LIGHT = '#FFF3EC'; // Orange.100 / primary.light
const TXT_STRONG = '#1A1A1A';  // Gray.800
const TXT_DEFAULT = '#3A3A3A'; // Gray.700
const TXT_SUBTLE = '#8A8A8A';  // Gray.600
const TXT_DISABLED = '#A0A0A0'; // Gray.500
const BG_PAGE = '#FFFFFF';     // Gray.0
const BG_SUBTLE = '#F9F9F9';   // Gray.100
const BG_MUTED = '#F2F4F7';    // Gray.200
const BORDER_DEFAULT = '#D1D1D1'; // Gray.400
const PLAYER_BG = '#000000';   // Gray.900
const FONT = "'Pretendard Variable', 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif";
const styles = {
  root: { position: 'relative', height: '100dvh', minHeight: '100vh', background: PLAYER_BG, overflow: 'hidden', color: W,
    fontFamily: FONT },

  player: { position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column',
    background: PLAYER_BG, overflow: 'hidden' },
  topBar: { position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 16px', background: 'linear-gradient(rgba(0,0,0,0.45), transparent)' },
  iconBtn: { background: 'none', border: 'none', color: W, fontSize: 24, lineHeight: 1, cursor: 'pointer', width: 32 },
  topRight: { display: 'flex', alignItems: 'center', gap: 8 },
  topChip: { display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.15)',
    border: 'none', color: W, fontSize: 12, padding: '5px 10px', borderRadius: 9999,
    cursor: 'pointer', whiteSpace: 'nowrap' },
  gearBtn: { background: 'rgba(255,255,255,0.15)', border: 'none', color: W, fontSize: 18,
    width: 36, height: 36, borderRadius: 9999, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center' },

  // 풀 플레이어
  fullWrap: { flex: 1, display: 'flex', flexDirection: 'column', padding: '4px 20px 16px', overflow: 'auto' },
  artBig: { position: 'relative', width: '80%', aspectRatio: '1 / 1', margin: '6px auto 0', borderRadius: 8, overflow: 'hidden',
    background: '#2a2a2a', boxShadow: '0 12px 40px rgba(0,0,0,0.6)' },
  artImg: { width: '100%', height: '100%', objectFit: 'contain' },
  coverImg: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' },
  containImg: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' },
  miniBlurBg: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(28px)', transform: 'scale(1.2)', opacity: 0.5 },
  imgFallback: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg,#2a2a32,#16161c)' },
  imgFallbackIcon: { fontSize: 40, opacity: 0.5 },
  playOverlay: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 40, color: 'rgba(255,255,255,0.85)', textShadow: '0 2px 12px rgba(0,0,0,0.6)', pointerEvents: 'none' },
  carouselDots: { position: 'absolute', bottom: 8, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5, pointerEvents: 'auto' },
  carouselDot: { width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.45)', cursor: 'pointer' },
  carouselDotOn: { background: '#fff', transform: 'scale(1.3)' },
  badge: { position: 'absolute', top: 8, left: 8, background: ORANGE, color: W, fontSize: 11, fontWeight: 600,
    padding: '3px 8px', borderRadius: 9999, letterSpacing: '0.04em' },
  countRow: { textAlign: 'left', margin: '12px 0 4px' },
  count: { fontSize: 13, color: TXT_SUBTLE },
  titleRow: { display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 4 },
  title: { fontSize: 20, fontWeight: 600, color: W, margin: 0, lineHeight: 1.45, textAlign: 'left' },
  subtitle: { fontSize: 13, color: TXT_SUBTLE, margin: '4px 0 0', lineHeight: 1.5, textAlign: 'left' },
  heart: { background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', lineHeight: 1, flexShrink: 0 },
  desc: { fontSize: 14, lineHeight: 1.55, color: TXT_SUBTLE, marginTop: 12 },

  chips: { display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' },
  chip: { fontSize: 13, color: W, background: 'rgba(255,255,255,0.15)', padding: '8px 12px',
    borderRadius: 8, whiteSpace: 'nowrap', border: 'none', cursor: 'pointer',
    backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' },

  progWrap: { marginTop: 16 },
  progBar: { position: 'relative', height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 9999, cursor: 'pointer' },
  progFill: { position: 'absolute', top: 0, left: 0, height: '100%', background: ORANGE, borderRadius: 9999 },
  progThumb: { position: 'absolute', top: '50%', transform: 'translate(-50%,-50%)', width: 12, height: 12, borderRadius: '50%',
    background: '#fff', pointerEvents: 'none' },
  timeRow: { display: 'flex', justifyContent: 'space-between', marginTop: 7 },
  time: { fontSize: 12, color: TXT_SUBTLE },

  controls: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginTop: 16 },
  ctrlSide: { background: 'none', border: 'none', color: TXT_SUBTLE, fontSize: 20, cursor: 'pointer',
    display: 'flex', alignItems: 'center' },
  ctrlNum: { fontSize: 9, bottom: 0 },
  ctrl: { background: 'none', border: 'none', color: W, fontSize: 22, cursor: 'pointer' },
  ctrlBig: { background: 'none', border: 'none', color: W, fontSize: 26, cursor: 'pointer' },
  play: { width: 48, height: 48, borderRadius: '50%', background: W, color: PLAYER_BG, fontSize: 18, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' },
  playBig: { width: 64, height: 64, borderRadius: '50%', background: W, color: PLAYER_BG, fontSize: 24, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' },
  playDisabled: { background: 'rgba(255,255,255,0.25)', color: 'rgba(255,255,255,0.6)' },

  bottomBtns: { display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 20 },
  bottomBtn: { flex: 1, padding: '14px', borderRadius: 12, background: 'rgba(255,255,255,0.15)',
    border: 'none', color: W, fontSize: 15, fontWeight: 600, cursor: 'pointer' },

  // 90% 컴팩트 바
  compactBar: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px',
    background: PLAYER_BG, flex: 1, overflow: 'hidden' },
  compactThumb: { position: 'relative', width: 52, height: 52, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
    background: '#222' },
  compactTitleWrap: { flex: 1, overflow: 'hidden' },
  compactTitle: { display: 'inline-block', fontSize: 16, fontWeight: 700, color: W,
    whiteSpace: 'nowrap', animation: 'marquee 8s linear infinite', animationDelay: '2s' },
  compactControls: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  compactPlayBtn: { width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.15)',
    color: W, fontSize: 16, border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center' },
  compactDownBtn: { width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.15)',
    color: W, fontSize: 24, border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 },

  // 미니 플레이어
  miniWrap: { position: 'absolute', inset: 0, zIndex: 1, background: PLAYER_BG },
  miniBar: { position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center',
    padding: '12px 16px', gap: 12, background: 'linear-gradient(transparent, rgba(0,0,0,0.7))' },
  miniBarInfo: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden', textAlign: 'left' },
  miniBarTitle: { fontSize: 15, fontWeight: 700, color: W, whiteSpace: 'nowrap',
    textShadow: '0 1px 4px rgba(0,0,0,0.5)', display: 'inline-block',
    animation: 'marquee 8s linear infinite', animationDelay: '2s' },
  miniBarSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' },
  miniBarControls: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  miniBarBtn: { background: 'none', border: 'none', color: W, fontSize: 20, cursor: 'pointer',
    width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  miniBarPlay: { width: 40, height: 40, borderRadius: '50%', background: W, color: PLAYER_BG,
    fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' },

  // 시트
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, background: BG_MUTED, borderRadius: '16px 16px 0 0',
    display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 -4px 12px rgba(0,0,0,0.3)' },
  handleZone: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 20, cursor: 'grab',
    touchAction: 'none', flexShrink: 0 },
  sheetTabBar: { display: 'flex', alignItems: 'center', padding: '6px 14px 6px', flexShrink: 0 },
  sheetTabToggle: { display: 'flex', background: BG_MUTED, borderRadius: 9999, padding: 3, gap: 2,
    border: `1px solid ${BORDER_DEFAULT}` },
  sheetTabToggleFixed: { position: 'absolute', right: 16, bottom: 16, zIndex: 20, display: 'flex',
    background: BG_PAGE, borderRadius: 9999, padding: 3, gap: 2,
    border: `1px solid ${BORDER_DEFAULT}`, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' },
  sheetTabBtn: { padding: '5px 12px', borderRadius: 9999, border: 'none', background: 'transparent',
    fontSize: 13, fontWeight: 600, color: TXT_SUBTLE, cursor: 'pointer', whiteSpace: 'nowrap' },
  sheetTabBtnOn: { background: '#1a1a1a', color: '#fff', boxShadow: '0 1px 6px rgba(0,0,0,0.2)' },
  grabber: { width: 52, height: 6, borderRadius: 9999, background: BORDER_DEFAULT },
  mapTopBar: { position: 'absolute', top: 10, left: 10, right: 10, zIndex: 5, display: 'flex', gap: 8,
    flexWrap: 'wrap' },
  tocBtn: { height: 34, padding: '0 12px', borderRadius: 9999,
    background: TXT_STRONG, color: W, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.28)', display: 'flex', alignItems: 'center', outline: 'none' },
  mapTopBtn: { height: 34, padding: '0 12px', borderRadius: 9999, border: `1px solid ${BORDER_DEFAULT}`,
    background: BG_PAGE, color: TXT_STRONG, fontSize: 13, fontWeight: 600, cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', outline: 'none' },
  mapTopBtnOn: { background: W, border: `1.5px solid ${ORANGE}`, color: ORANGE },
  listWrap: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 },
  listHeader: { flexShrink: 0, background: BG_MUTED },
  listTopBarOuter: { display: 'flex', alignItems: 'center', padding: '10px 12px 6px',
    background: BG_MUTED, gap: 4 },
  listTopBar: { display: 'flex', alignItems: 'center', gap: 8, flex: 1,
    overflowX: 'auto', flexWrap: 'nowrap', WebkitOverflowScrolling: 'touch',
    scrollbarWidth: 'none', msOverflowStyle: 'none' },
  listSecondBar: { display: 'flex', alignItems: 'center', gap: 8,
    padding: '0 12px 8px', background: BG_MUTED },
  floorSelector: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    height: 38, padding: '0 14px', borderRadius: 10, border: `1px solid ${BORDER_DEFAULT}`,
    background: BG_PAGE, cursor: 'pointer' },
  floorSelectorLabel: { fontSize: 14, fontWeight: 500, color: TXT_DEFAULT },
  floorSelectorChevron: { fontSize: 11, color: TXT_SUBTLE },
  searchBtn: { width: 38, height: 38, borderRadius: 10, border: `1px solid ${BORDER_DEFAULT}`,
    background: BG_PAGE, display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', flexShrink: 0 },
  searchIconAbsBtn: { flexShrink: 0, width: 36, height: 36, border: 'none', background: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', outline: 'none' },
  searchIconBtn: { width: 36, height: 36, border: 'none', background: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, outline: 'none' },
  searchBar: { flex: 1, display: 'flex', alignItems: 'center', gap: 8, height: 38,
    border: `1.5px solid ${ORANGE}`, borderRadius: 9999, padding: '0 14px', background: BG_PAGE },
  searchInput: { flex: 1, border: 'none', outline: 'none', background: 'none',
    fontSize: 14, color: TXT_STRONG, fontFamily: 'inherit' },
  searchCancelBtn: { flexShrink: 0, border: 'none', background: 'none', fontSize: 14,
    fontWeight: 500, color: TXT_DEFAULT, cursor: 'pointer', outline: 'none', padding: '0 4px' },
  tocBtnList: { height: 34, padding: '0 12px', borderRadius: 9999, background: TXT_STRONG, color: W, fontSize: 13, fontWeight: 700,
    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', outline: 'none' },

  sheetBody: { position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 },
  mapBox: { position: 'relative', flex: 1, overflow: 'hidden', minHeight: 0, background: '#E3E3E3' },
  stripOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 5, padding: '0 16px 16px',
    background: 'linear-gradient(transparent, rgba(255,255,255,1) 80%, rgb(255,255,255) 100%)' },
  pinActionBar: { display: 'flex', gap: 8, padding: '8px 0 4px' },

  // 층 도면
  floorWrap: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' },
  // 스크롤 없이 한 화면에: 도면을 박스 안에 맞춰 표시(정사각 캔버스, 중앙 정렬)
  floorImgBox: { position: 'relative', flex: 1, overflow: 'hidden', background: '#E3E3E3', minHeight: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none', cursor: 'grab' },

  zoomReset: { position: 'absolute', right: 10, bottom: 66, zIndex: 6, padding: '8px 12px', borderRadius: 8,
    background: TXT_DEFAULT, color: W, fontSize: 13, fontWeight: 700, border: 'none',
    cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.28)' },

  // 층 선택 pill
  floorPill: { display: 'flex', flexDirection: 'column',
    background: BG_PAGE, borderRadius: 9999, boxShadow: '0 2px 8px rgba(0,0,0,0.2)', overflow: 'hidden' },
  floorPillItem: { padding: '10px 16px', border: 'none', background: 'transparent', color: TXT_SUBTLE,
    fontSize: 14, fontWeight: 700, cursor: 'pointer', textAlign: 'center', whiteSpace: 'nowrap' },
  floorPillItemOn: { color: ORANGE },
  floorCanvas: { position: 'relative', width: '100%', lineHeight: 0 },
  floorImg: { display: 'block', width: '100%', height: 'auto' },
  floorPlaceholder: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 8, color: TXT_DISABLED },
  floorPhIcon: { fontSize: 40 },
  floorPhTxt: { fontSize: 15, fontWeight: 700, color: TXT_SUBTLE },
  floorPhSub: { fontSize: 12, color: TXT_DISABLED },
  routeSvg: { position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none' },
  pinTooltipWrap: { position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
    marginBottom: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none' },
  pinTooltip: { whiteSpace: 'nowrap', background: ORANGE, color: W, fontSize: 11, fontWeight: 600,
    padding: '8px 10px', borderRadius: 6, boxShadow: '0 2px 6px rgba(0,0,0,0.3)' },
  pinStartBubble: { whiteSpace: 'nowrap', background: ORANGE, color: W, fontSize: 13, fontStyle: 'italic', fontWeight: 700,
    padding: '6px 12px', borderRadius: 20, boxShadow: '0 2px 6px rgba(0,0,0,0.3)', letterSpacing: '0.5px' },
  pinTooltipArrow: { width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
    borderTop: `5px solid ${ORANGE}` },
  pin: { position: 'absolute', zIndex: 2, transform: 'translate(-50%,-50%)', width: 26, height: 26,
    borderRadius: '50%', background: 'rgba(255,115,13,0.6)', color: W, fontSize: 13, fontWeight: 700, border: `2px solid ${BG_PAGE}`,
    boxShadow: '0 2px 6px rgba(0,0,0,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', lineHeight: 1 },
  pinOn: { background: ORANGE, transform: 'scale(1.3)', zIndex: 4 },
  pinVisited: { background: TXT_DISABLED, border: `2px solid ${BG_MUTED}` },
  pinPlayingBadge: { position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
    marginBottom: 3, display: 'flex', alignItems: 'flex-end', gap: 2, padding: '0 1px' },
  pinEqBar: { width: 3, background: W, borderRadius: 2, display: 'inline-block',
    transformOrigin: 'bottom', animation: 'eq 0.7s ease-in-out infinite', flexShrink: 0,
    filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' },
  foot: { position: 'absolute', zIndex: 3, transform: 'translate(-50%,-50%)', fontSize: 15, lineHeight: 1,
    filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))', pointerEvents: 'none' },
  crossFloor: { position: 'absolute', zIndex: 5, transform: 'translate(-50%,-180%)', whiteSpace: 'nowrap',
    background: ORANGE, color: W, fontSize: 11, fontWeight: 600, padding: '4px 8px', borderRadius: 9999,
    boxShadow: '0 2px 6px rgba(0,0,0,0.3)', pointerEvents: 'none' },

  roomChips: { display: 'flex', gap: 8, overflowX: 'auto', padding: '10px 8px', flexShrink: 0, background: '#fff' },
  roomChip: { flexShrink: 0, width: 36, height: 36, borderRadius: '50%', border: '1px solid #e0e0e6', background: '#fff',
    color: '#555', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', padding: 0 },
  roomChipOn: { background: ORANGE, border: `1px solid ${ORANGE}`, color: '#fff' },
  roomChipVisited: { background: '#dfe1e8', border: '1px solid #dfe1e8', color: '#9298a6' },

  stripHeader: { display: 'flex', alignItems: 'center', gap: 6, padding: '10px 4px 6px', flexShrink: 0 },
  stripPinIcon: { display: 'flex', alignItems: 'center', flexShrink: 0 },
  stripRoomName: { fontSize: 15, fontWeight: 700, color: TXT_STRONG, flex: 1 },
  stripHeaderCount: { fontSize: 13, fontWeight: 500, color: TXT_SUBTLE, flexShrink: 0 },
  strip: { display: 'flex', gap: 2, overflowX: 'auto', padding: '4px 0 8px', flexShrink: 0 },
  stripCard: { flexShrink: 0, width: 92, background: 'none', border: 'none', padding: 0, cursor: 'pointer' },
  stripThumb: { position: 'relative', width: 92, height: 92, borderRadius: 10, overflow: 'hidden', background: BG_MUTED,
    border: '2px solid transparent' },
  stripThumbOn: { border: `3px solid ${ORANGE}`, boxShadow: `0 0 0 2px ${ORANGE_LIGHT}` },
  stripNo: { position: 'absolute', top: 4, left: 4, zIndex: 2, minWidth: 16, height: 16, padding: '0 4px',
    borderRadius: 8, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center' },
  stripNoOn: { background: ORANGE },
  stripEqBadge: { position: 'absolute', top: 5, right: 5, display: 'flex', alignItems: 'flex-end', gap: 2, background: 'rgba(0,0,0,0.42)', borderRadius: 4, padding: '4px 5px' },
  stripHeart: { position: 'absolute', bottom: 4, right: 4, background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', fontSize: 16, cursor: 'pointer', padding: 2, lineHeight: 1 },
  stripHeartOn: { position: 'absolute', bottom: 4, right: 4, background: 'none', border: 'none', color: ORANGE, fontSize: 16, cursor: 'pointer', padding: 2, lineHeight: 1 },
  nowPlay: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.25)' },
  nowPlayBtn: { width: 36, height: 36, borderRadius: '50%', background: ORANGE,
    display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' },
  eqBar: { width: 3, background: '#fff', borderRadius: 2, transformOrigin: 'bottom',
    animation: 'eq 0.8s ease-in-out infinite' },
  nowPlayTxt: { position: 'absolute', bottom: 5, fontSize: 9, fontWeight: 700, color: '#fff', letterSpacing: 0.5 },
  stripName: { fontSize: 12, color: TXT_DEFAULT, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    textAlign: 'left' },
  stripNameOn: { color: ORANGE, fontWeight: 700 },

  nextStopCard: { border: 'none', borderRadius: 10, padding: '0 0 2px', display: 'flex',
    flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: 0 },
  nextStopCardDisabled: {},
  nextStopThumb: { width: 92, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  nextStopCircle: { width: 40, height: 40, borderRadius: '50%', background: ORANGE, color: W,
    fontSize: 26, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
    lineHeight: 1, paddingLeft: 3 },
  nextStopCircleDisabled: { background: BORDER_DEFAULT },
  prevStopCircle: { width: 40, height: 40, borderRadius: '50%', background: BORDER_DEFAULT, color: TXT_STRONG,
    fontSize: 26, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
    lineHeight: 1, paddingRight: 3 },
  nextStopLabel: { fontSize: 11, color: TXT_SUBTLE, marginTop: 2 },
  nextStopName: { fontSize: 13, fontWeight: 700, color: TXT_STRONG, marginTop: 1,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 88 },

  listFilter: { height: 34, padding: '0 12px', borderRadius: 9999, border: `1px solid ${BORDER_DEFAULT}`,
    background: BG_PAGE, color: TXT_STRONG, fontSize: 13, fontWeight: 400, cursor: 'pointer',
    display: 'flex', alignItems: 'center', outline: 'none' },
  listFilterOn: { background: W, border: `1.5px solid ${ORANGE}`, color: ORANGE, fontWeight: 700 },
  listBody: { flex: 1, overflow: 'auto', padding: '4px 8px 16px' },
  listGroupHeader: { fontSize: 14, fontWeight: 700, color: TXT_STRONG, padding: '16px 4px 8px', textAlign: 'left' },
  listGroupBox: { background: W, borderRadius: 12, overflow: 'hidden' },
  floorDrop: { margin: '0 8px 8px', borderRadius: 12, border: `1px solid ${BORDER_DEFAULT}`,
    background: BG_PAGE, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.10)' },
  floorDropItem: { display: 'block', width: '100%', padding: '13px 16px', textAlign: 'left',
    background: 'none', border: 'none', borderBottom: `1px solid ${BG_MUTED}`,
    fontSize: 14, fontWeight: 500, color: TXT_DEFAULT, cursor: 'pointer' },
  floorDropItemOn: { color: ORANGE, fontWeight: 700, background: ORANGE_LIGHT },
  floorModalItem: { display: 'block', width: '100%', padding: '16px 20px', textAlign: 'left',
    background: 'none', border: 'none', borderBottom: `1px solid ${BG_MUTED}`,
    fontSize: 15, fontWeight: 500, color: TXT_DEFAULT, cursor: 'pointer', outline: 'none' },
  floorModalItemOn: { color: ORANGE, fontWeight: 700, background: ORANGE_LIGHT },
  listItem: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 12px', borderRadius: 0,
    border: 'none', borderBottom: '1px solid #EBEBEB', background: 'none', cursor: 'pointer' },
  listItemOn: {},
  listThumb: { position: 'relative', width: 92, height: 92, borderRadius: 10, overflow: 'hidden',
    flexShrink: 0, background: BG_MUTED, border: '2px solid transparent' },
  listThumbOn: { border: `2px solid ${ORANGE}` },
  listThumbNowPlay: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
    justifyContent: 'center', gap: 2, background: 'rgba(0,0,0,0.42)' },
  listTitle: { fontSize: 15, fontWeight: 600, color: TXT_STRONG },
  listSub: { fontSize: 13, color: TXT_SUBTLE, marginTop: 2 },
  listHeartOff: { background: 'none', border: 'none', color: BORDER_DEFAULT, fontSize: 20,
    cursor: 'pointer', flexShrink: 0, padding: '4px 8px', lineHeight: 1 },
  listHeartOn: { background: 'none', border: 'none', color: ORANGE, fontSize: 20,
    cursor: 'pointer', flexShrink: 0, padding: '4px 8px', lineHeight: 1 },

  dim: { position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.50)' },
  overlaySheet: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%', zIndex: 51,
    background: BG_PAGE, borderRadius: '16px 16px 0 0', display: 'flex', flexDirection: 'column',
    boxShadow: '0 -4px 12px rgba(0,0,0,0.30)' },
  overlayHandle: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 28, flexShrink: 0 },
  overlayHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 20px 12px', borderBottom: `1px solid ${BORDER_DEFAULT}`, flexShrink: 0 },
  overlayTitle: { fontSize: 20, fontWeight: 600, color: TXT_STRONG },
  overlayClose: { background: 'none', border: 'none', fontSize: 24, color: TXT_DEFAULT, cursor: 'pointer',
    width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  overlayBody: { flex: 1, overflow: 'auto', padding: '20px 24px' },
  overlayEmpty: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    height: '100%' },
  scriptBody: { lineHeight: 1.6 },
  scriptTitle: { fontSize: 20, fontWeight: 600, color: TXT_STRONG, margin: '0 0 16px' },
  scriptText: { fontSize: 16, color: TXT_DEFAULT, margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 },

  settingsBody: { display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 20 },
  settingsRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  settingsLabel: { fontSize: 16, fontWeight: 600, color: TXT_STRONG },
  settingsValue: { fontSize: 15, fontWeight: 400, color: TXT_SUBTLE },
  toggleTrack: { width: 44, height: 24, borderRadius: 9999, background: BORDER_DEFAULT, border: 'none',
    cursor: 'pointer', position: 'relative', padding: 0 },
  toggleTrackOn: { background: ORANGE },
  toggleHandle: { width: 20, height: 20, borderRadius: '50%', background: W, position: 'absolute',
    top: 2, left: 2, transition: 'left 150ms ease' },
  toggleHandleOn: { left: 22 },
  speedRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  speedBtn: { padding: '8px 16px', borderRadius: 8, border: `1px solid ${BORDER_DEFAULT}`,
    background: BG_PAGE, color: TXT_STRONG, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  speedBtnOn: { background: ORANGE, borderColor: ORANGE, color: W },
};
