import { useState, useRef, useEffect, useMemo } from 'react';
import { orsayFloorMaps, orsayRoomPins } from '../data/orsayTourData';

// 스냅별 시트 높이 (뷰포트 높이 대비 %)
//  0: 지도 닫힘 → 풀 플레이어 / 1: 중간 / 2: 지도 크게
const SHEET_VH = [0, 52, 74];

export default function OrsayPlayer({
  artwork, artworks, currentIndex, total,
  onPrev, onNext, onHome, onSelectIndex,
}) {
  const [snap, setSnap] = useState(2);        // 진입 시 전체(지도+칩+스트립+버튼) 노출
  const [dragH, setDragH] = useState(null);   // 드래그 중 px, 평소 null
  const [tab, setTab] = useState('map');      // 'map' | 'list'
  const [autoplay, setAutoplay] = useState(false);
  const [liked, setLiked] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(null);
  const lastTimeRef = useRef(0);
  const dragRef = useRef({ dragging: false, startY: 0, startH: 0 });

  const isFull = snap === 0;
  const hasAudio = !!artwork.audioSrc;

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

  // 현재 트랙이 속한 stop. 없으면(추가 작품) 추가 작품끼리 묶어서 노출.
  const activeStop = roomStops.find(s => s.room === artwork.room && s.floor === artwork.floor) || null;
  const stripIdxs = activeStop
    ? activeStop.idxs
    : artworks.map((a, i) => i).filter(i => !artworks[i].floor);
  // 다음 장소(stop)
  const nextStop = activeStop ? roomStops.find(s => s.seq === activeStop.seq + 1) : roomStops[0];

  useEffect(() => {
    setIsPlaying(false);
    setProgress(0);
    setElapsed(0);
    setDuration(0);
    lastTimeRef.current = 0;
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
      src={artwork.audioSrc || undefined}
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
          <button style={styles.iconBtn} onClick={onHome}>⌄</button>
          <div style={styles.topRight}>
            {!isFull && (
              <>
                <button style={styles.topChip}>💬 댓글</button>
                <button style={styles.topChip}>📄 스크립트</button>
              </>
            )}
            <button
              style={{ ...styles.autoPill, ...(autoplay ? styles.autoPillOn : {}) }}
              onClick={() => setAutoplay(a => !a)}
            >
              자동재생 {autoplay ? 'on' : 'off'}
            </button>
          </div>
        </div>

        {isFull ? (
          /* ── 풀 플레이어 ── */
          <div style={styles.fullWrap}>
            <div style={styles.artBig} onClick={playPause}>
              <ArtImage src={artwork.imageSrc} alt={artwork.title} />
              {artwork.star && <span style={styles.badge}>핵심</span>}
              {hasAudio && (
                <div style={styles.playOverlay}>{isPlaying ? '' : '▶'}</div>
              )}
            </div>
            <div style={styles.countRow}>
              <span style={styles.count}>{currentIndex + 1} / {total} · {floorLabel(artwork)}</span>
            </div>

            <div style={styles.titleRow}>
              <div style={{ flex: 1 }}>
                <h2 style={styles.title}>{artwork.title}</h2>
                <p style={styles.subtitle}>오르세 미술관 · {artwork.subtitle}</p>
              </div>
              <button style={styles.heart} onClick={() => setLiked(l => !l)}>
                {liked ? '♥' : '♡'}
              </button>
            </div>

            {artwork.description && <p style={styles.desc}>{artwork.description}</p>}

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
              <button style={styles.bottomBtn} onClick={() => { setTab('map'); setSnap(1); }}>▥ 지도보기</button>
              <button style={styles.bottomBtn} onClick={() => { setTab('list'); setSnap(2); }}>☰ 목차보기</button>
            </div>
          </div>
        ) : (
          /* ── 미니 플레이어: 작품 이미지 풀배경 + 컨트롤 오버레이 ── */
          <div style={styles.miniWrap} onClick={playPause}>
            <ArtImage src={artwork.imageSrc} alt={artwork.title} cover />
            <div style={styles.miniTopInfo}>
              <span style={styles.miniTitle}>{artwork.title}</span>
              <span style={styles.miniSub}>{floorLabel(artwork)} · {artwork.subtitle}</span>
            </div>
            <div style={styles.miniControls} onClick={e => e.stopPropagation()}>
              <Controls isPlaying={isPlaying} hasAudio={hasAudio} onPlay={playPause} onPrev={onPrev} onNext={onNext} onNudge={nudge} />
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
              <FloorMapView artworks={artworks} currentIndex={currentIndex} roomStops={roomStops}
                            onPinClick={(i) => { onSelectIndex(i); setSnap(2); }} />
              <button style={styles.tocBtn} onClick={() => setTab('list')}>☰ 목차</button>
            </div>

            {snap === 2 && (
              <>
                <div style={styles.stripHeader}>
                  {activeStop ? `${activeStop.seq}번 · ${floorLabel(artwork)}` : '추가 작품'}
                  <span style={styles.stripHeaderCount}>{stripIdxs.length}개 트랙</span>
                </div>
                <div style={styles.strip}>
                  {stripIdxs.map((gi, k) => {
                    const a = artworks[gi];
                    const active = gi === currentIndex;
                    return (
                      <button key={a.id} style={styles.stripCard} onClick={() => onSelectIndex(gi)}>
                        <div style={{ ...styles.stripThumb, ...(active ? styles.stripThumbOn : {}) }}>
                          <ArtImage src={a.imageSrc} alt={a.title} cover />
                          <span style={{ ...styles.stripNo, ...(active ? styles.stripNoOn : {}) }}>{k + 1}</span>
                          {active && (
                            <div style={styles.nowPlay}>
                              <span style={{ ...styles.eqBar, animationDelay: '0s', height: 8 }} />
                              <span style={{ ...styles.eqBar, animationDelay: '0.15s', height: 14 }} />
                              <span style={{ ...styles.eqBar, animationDelay: '0.3s', height: 10 }} />
                              <span style={styles.nowPlayTxt}>재생중</span>
                            </div>
                          )}
                        </div>
                        <div style={{ ...styles.stripName, ...(active ? styles.stripNameOn : {}) }}>{a.star ? '★ ' : ''}{a.title}</div>
                      </button>
                    );
                  })}
                </div>
                <div style={styles.navBar}>
                  <button style={{ ...styles.navBtn, ...styles.navBtnPrimary, ...(nextStop ? {} : styles.navBtnDisabled) }}
                          onClick={() => nextStop && onSelectIndex(nextStop.idxs[0])} disabled={!nextStop}>
                    {nextStop ? `다음 장소 (${roomName(nextStop.room)}) →` : '마지막 장소입니다'}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          /* 목차 리스트 */
          <div style={styles.listBody}>
            <div style={styles.listTopBar}>
              <button style={styles.tocBtnList} onClick={() => setTab('map')}>▥ 지도</button>
            </div>
            {artworks.map((a, i) => (
              <button key={a.id}
                      style={{ ...styles.listItem, ...(i === currentIndex ? styles.listItemOn : {}) }}
                      onClick={() => onSelectIndex(i)}>
                <span style={{ ...styles.listNo, ...(i === currentIndex ? styles.listNoOn : {}) }}>{i + 1}</span>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={styles.listTitle}>{a.star ? '★ ' : ''}{a.title}</div>
                  <div style={styles.listSub}>{floorLabel(a)}{a.subtitle ? ` · ${a.subtitle}` : ''}</div>
                </div>
                <span style={styles.listDur}>{a.duration?.slice(3)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function roomName(room) {
  return room === '입구' || room === '조각홀' ? room : `${room}관`;
}

function floorLabel(a) {
  if (!a.floor) return '추가 작품';
  const f = orsayFloorMaps[a.floor];
  const fl = f ? f.label : `${a.floor}층`;
  return a.room ? `${fl} · ${roomName(a.room)}` : fl;
}

// 작품 이미지 (없으면 플레이스홀더)
function ArtImage({ src, alt, cover }) {
  const [err, setErr] = useState(false);
  useEffect(() => { setErr(false); }, [src]);
  if (!src || err) {
    return (
      <div style={{ ...styles.imgFallback, ...(cover ? { position: 'absolute', inset: 0 } : {}) }}>
        <span style={styles.imgFallbackIcon}>🖼️</span>
      </div>
    );
  }
  return (
    <img src={src} alt={alt}
         style={cover ? styles.coverImg : styles.artImg}
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
function FloorMapView({ artworks, currentIndex, roomStops, onPinClick }) {
  const current = artworks[currentIndex];
  const [floor, setFloor] = useState(current.floor || 1);
  const [imgErr, setImgErr] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const chipsRef = useRef(null);

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
  const traveledPts = densePts(floorStops.filter(s => s.seq <= currentSeq));
  const upcomingPts = densePts(floorStops.filter(s => s.seq >= currentSeq));

  // 현재 stop 칩을 가운데로 (지도는 한 화면에 다 보이므로 스크롤 불필요)
  useEffect(() => {
    chipsRef.current?.querySelector('[data-active="1"]')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [currentRoom]);

  const pinStyle = (s) => {
    if (s.seq === currentSeq) return styles.pinOn;       // 현재
    if (s.seq < currentSeq) return styles.pinVisited;    // 지나감
    return null;                                         // 앞으로
  };
  const chipStyle = (s) => {
    if (s.seq === currentSeq) return styles.roomChipOn;
    if (s.seq < currentSeq) return styles.roomChipVisited;
    return null;
  };

  return (
    <div style={styles.floorWrap}>
      <div style={styles.floorImgBox}>
        {map && !imgErr ? (
          <div style={styles.floorCanvas}>
            <img src={map.src} alt={map.label} style={styles.floorImg} onError={() => setImgErr(true)} />
            {/* 경로선: 지나간 구간(회색) → 앞으로 갈 구간(파랑) + 진행 방향 화살표 */}
            {floorStops.length > 1 && (
              <svg style={styles.routeSvg} viewBox="0 0 100 100">
                <defs>
                  <marker id="arrB" viewBox="0 0 10 10" refX="6" refY="5" markerUnits="userSpaceOnUse"
                          markerWidth="5.5" markerHeight="5.5" orient="auto">
                    <path d="M0,1 L9,5 L0,9 z" fill={BLUE} />
                  </marker>
                  <marker id="arrG" viewBox="0 0 10 10" refX="6" refY="5" markerUnits="userSpaceOnUse"
                          markerWidth="5.5" markerHeight="5.5" orient="auto">
                    <path d="M0,1 L9,5 L0,9 z" fill="#b6bac6" />
                  </marker>
                </defs>
                {upcomingPts && (
                  <polyline points={upcomingPts} fill="none" stroke={BLUE} strokeWidth="0.9"
                            strokeLinejoin="round" strokeLinecap="round" opacity="0.9"
                            markerMid="url(#arrB)" />
                )}
                {traveledPts && (
                  <polyline points={traveledPts} fill="none" stroke="#b6bac6" strokeWidth="1"
                            strokeLinejoin="round" strokeLinecap="round" opacity="0.95"
                            markerMid="url(#arrG)" />
                )}
              </svg>
            )}
            {/* 순서 핀: 지나감(회색) · 현재(주황) · 앞으로(파랑) */}
            {floorStops.map(s => {
              const pos = pins[s.room];
              return (
                <button key={s.room}
                        style={{ ...styles.pin, left: `${pos.x}%`, top: `${pos.y}%`, ...pinStyle(s) }}
                        onClick={() => onPinClick(s.idxs[0])}>
                  {s.seq}
                </button>
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

      {/* 층 선택 햄버거 (지도 왼쪽 아래 고정) */}
      <div style={styles.floorFab}>
        {menuOpen && (
          <div style={styles.floorMenu}>
            {floors.map(f => (
              <button key={f}
                      style={{ ...styles.floorMenuItem, ...(f === floor ? styles.floorMenuItemOn : {}) }}
                      onClick={() => { setFloor(f); setMenuOpen(false); }}>
                {orsayFloorMaps[f].label}
              </button>
            ))}
          </div>
        )}
        <button style={styles.floorFabBtn} onClick={() => setMenuOpen(o => !o)}>
          <span style={styles.floorFabIcon}>☰</span>{map ? map.label : `${floor}층`}
        </button>
      </div>

      {/* 순서 칩 (1번 ~ 마지막). 다른 층 stop 누르면 자동으로 그 층으로 전환됨 */}
      <div ref={chipsRef} style={styles.roomChips}>
        {roomStops.map(s => (
          <button key={s.room} data-active={s.seq === currentSeq ? '1' : '0'}
                  style={{ ...styles.roomChip, ...chipStyle(s) }}
                  onClick={() => onPinClick(s.idxs[0])}>
            {s.seq}
          </button>
        ))}
      </div>
    </div>
  );
}

const W = '#fff';
const ORANGE = '#F2994A';
const BLUE = '#4F6FE8';
const styles = {
  root: { position: 'relative', height: '100dvh', minHeight: '100vh', background: '#000', overflow: 'hidden', color: W,
    fontFamily: 'system-ui, sans-serif' },

  player: { position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column',
    background: '#0c0c0e', overflow: 'hidden' },
  topBar: { position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 16px', background: 'linear-gradient(rgba(0,0,0,0.45), transparent)' },
  iconBtn: { background: 'none', border: 'none', color: W, fontSize: 24, lineHeight: 1, cursor: 'pointer', width: 32 },
  topRight: { display: 'flex', alignItems: 'center', gap: 8 },
  topChip: { display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,0,0,0.42)',
    border: '1px solid rgba(255,255,255,0.25)', color: '#fff', fontSize: 12, padding: '5px 10px', borderRadius: 20,
    cursor: 'pointer', whiteSpace: 'nowrap' },
  autoPill: { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.7)',
    fontSize: 12, padding: '5px 12px', borderRadius: 20, cursor: 'pointer' },
  autoPillOn: { background: 'rgba(79,111,232,0.25)', border: `1px solid ${BLUE}`, color: '#9db0ff' },

  // 풀 플레이어
  fullWrap: { flex: 1, display: 'flex', flexDirection: 'column', padding: '4px 22px 16px', overflow: 'auto' },
  artBig: { position: 'relative', width: '72%', aspectRatio: '3 / 4', margin: '6px auto 0', borderRadius: 6, overflow: 'hidden',
    background: '#222', boxShadow: '0 12px 40px rgba(0,0,0,0.6)' },
  artImg: { width: '100%', height: '100%', objectFit: 'cover' },
  coverImg: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' },
  imgFallback: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg,#2a2a32,#16161c)' },
  imgFallbackIcon: { fontSize: 40, opacity: 0.5 },
  playOverlay: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 40, color: 'rgba(255,255,255,0.85)', textShadow: '0 2px 12px rgba(0,0,0,0.6)', pointerEvents: 'none' },
  badge: { position: 'absolute', top: 8, left: 8, background: ORANGE, color: '#1a1208', fontSize: 10, fontWeight: 700,
    padding: '3px 8px', borderRadius: 4 },
  countRow: { textAlign: 'center', margin: '12px 0 4px' },
  count: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  titleRow: { display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 4 },
  title: { fontSize: 20, fontWeight: 700, color: W, margin: 0, lineHeight: 1.35 },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '4px 0 0' },
  heart: { background: 'none', border: 'none', color: '#ff5a7a', fontSize: 24, cursor: 'pointer', lineHeight: 1, flexShrink: 0 },
  desc: { fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,0.72)', marginTop: 12 },

  progWrap: { marginTop: 16 },
  progBar: { position: 'relative', height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 4, cursor: 'pointer' },
  progFill: { position: 'absolute', top: 0, left: 0, height: '100%', background: BLUE, borderRadius: 4 },
  progThumb: { position: 'absolute', top: '50%', transform: 'translate(-50%,-50%)', width: 12, height: 12, borderRadius: '50%',
    background: '#fff', pointerEvents: 'none' },
  timeRow: { display: 'flex', justifyContent: 'space-between', marginTop: 7 },
  time: { fontSize: 11, color: 'rgba(255,255,255,0.45)' },

  controls: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, marginTop: 16 },
  ctrlSide: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.75)', fontSize: 20, cursor: 'pointer',
    display: 'flex', alignItems: 'center' },
  ctrlNum: { fontSize: 9, bottom: 0 },
  ctrl: { background: 'none', border: 'none', color: W, fontSize: 22, cursor: 'pointer' },
  ctrlBig: { background: 'none', border: 'none', color: W, fontSize: 26, cursor: 'pointer' },
  play: { width: 48, height: 48, borderRadius: '50%', background: '#fff', color: '#0c0c0e', fontSize: 18, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' },
  playBig: { width: 64, height: 64, borderRadius: '50%', background: '#fff', color: '#0c0c0e', fontSize: 24, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' },
  playDisabled: { background: 'rgba(255,255,255,0.25)', color: 'rgba(255,255,255,0.6)' },

  bottomBtns: { display: 'flex', gap: 10, marginTop: 'auto', paddingTop: 18 },
  bottomBtn: { flex: 1, padding: '13px', borderRadius: 10, background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.12)', color: W, fontSize: 14, fontWeight: 600, cursor: 'pointer' },

  // 미니 플레이어
  miniWrap: { position: 'absolute', inset: 0, zIndex: 1, background: '#000' },
  miniTopInfo: { position: 'absolute', left: 16, right: 16, top: 52, display: 'flex', flexDirection: 'column', gap: 2,
    textShadow: '0 1px 8px rgba(0,0,0,0.7)', pointerEvents: 'none' },
  miniTitle: { fontSize: 17, fontWeight: 700, color: '#fff' },
  miniSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },
  miniControls: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: 14,
    background: 'linear-gradient(transparent, rgba(0,0,0,0.6))' },

  // 시트
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, background: '#fff', borderRadius: '18px 18px 0 0',
    display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 -8px 30px rgba(0,0,0,0.4)' },
  handleZone: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 34, cursor: 'grab',
    touchAction: 'none', flexShrink: 0 },
  grabber: { width: 52, height: 6, borderRadius: 6, background: '#bdbdc6' },
  tocBtn: { position: 'absolute', top: 10, right: 10, zIndex: 5, padding: '7px 12px', borderRadius: 8,
    background: 'rgba(26,26,46,0.92)', color: '#fff', fontSize: 12, fontWeight: 700,
    boxShadow: '0 2px 8px rgba(0,0,0,0.28)' },
  listTopBar: { position: 'sticky', top: 0, zIndex: 1, display: 'flex', justifyContent: 'flex-end',
    padding: '2px 6px 8px', background: '#fff' },
  tocBtnList: { padding: '7px 12px', borderRadius: 8, background: '#1a1a2e', color: '#fff', fontSize: 12, fontWeight: 700 },

  sheetBody: { flex: 1, display: 'flex', flexDirection: 'column', padding: '12px 16px 16px', overflow: 'hidden', minHeight: 0 },
  mapBox: { position: 'relative', flex: 1, borderRadius: 12, overflow: 'hidden', minHeight: 120, background: '#eef0f5' },

  // 층 도면
  floorWrap: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' },
  // 스크롤 없이 한 화면에: 도면을 박스 안에 맞춰 표시(정사각 캔버스, 중앙 정렬)
  floorImgBox: { position: 'relative', flex: 1, overflow: 'hidden', background: '#fafbfc', minHeight: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center' },

  // 층 선택 햄버거 (지도 왼쪽 아래)
  floorFab: { position: 'absolute', left: 10, bottom: 66, zIndex: 6, display: 'flex', flexDirection: 'column',
    alignItems: 'flex-start', gap: 6 },
  floorFabBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10,
    background: 'rgba(26,26,46,0.92)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    border: 'none', boxShadow: '0 2px 10px rgba(0,0,0,0.28)' },
  floorFabIcon: { fontSize: 14, lineHeight: 1 },
  floorMenu: { display: 'flex', flexDirection: 'column', gap: 4, background: '#fff', borderRadius: 10, padding: 5,
    boxShadow: '0 4px 16px rgba(0,0,0,0.22)' },
  floorMenuItem: { padding: '9px 16px', borderRadius: 8, border: 'none', background: '#f4f5f8', color: '#444',
    fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap' },
  floorMenuItemOn: { background: BLUE, color: '#fff' },
  floorCanvas: { position: 'relative', height: '100%', aspectRatio: '1 / 1', maxWidth: '100%', lineHeight: 0 },
  floorImg: { display: 'block', width: '100%', height: '100%', objectFit: 'contain' },
  floorPlaceholder: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 6, color: '#9aa0ad' },
  floorPhIcon: { fontSize: 40 },
  floorPhTxt: { fontSize: 15, fontWeight: 700, color: '#666' },
  floorPhSub: { fontSize: 11, color: '#aab' },
  routeSvg: { position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none' },
  pin: { position: 'absolute', zIndex: 2, transform: 'translate(-50%,-50%)', width: 26, height: 26,
    borderRadius: '50%', background: BLUE, color: '#fff', fontSize: 13, fontWeight: 700, border: '2px solid #fff',
    boxShadow: '0 2px 6px rgba(0,0,0,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', lineHeight: 1 },
  pinOn: { background: ORANGE, transform: 'translate(-50%,-50%) scale(1.3)', zIndex: 4 },
  pinVisited: { background: '#b6bac6', border: '2px solid #eef0f5' },

  roomChips: { display: 'flex', gap: 8, overflowX: 'auto', padding: '10px 8px', flexShrink: 0, background: '#fff' },
  roomChip: { flexShrink: 0, width: 36, height: 36, borderRadius: '50%', border: '1px solid #e0e0e6', background: '#fff',
    color: '#555', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', padding: 0 },
  roomChipOn: { background: ORANGE, border: `1px solid ${ORANGE}`, color: '#fff' },
  roomChipVisited: { background: '#dfe1e8', border: '1px solid #dfe1e8', color: '#9298a6' },

  stripHeader: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 2px 2px', fontSize: 13,
    fontWeight: 700, color: '#1a1a2e', flexShrink: 0 },
  stripHeaderCount: { fontSize: 11, fontWeight: 600, color: '#999' },
  strip: { display: 'flex', gap: 10, overflowX: 'auto', padding: '8px 0 4px', flexShrink: 0 },
  stripCard: { flexShrink: 0, width: 92, background: 'none', border: 'none', padding: 0, cursor: 'pointer' },
  stripThumb: { position: 'relative', width: 92, height: 72, borderRadius: 8, overflow: 'hidden', background: '#e5e5ea',
    border: '2px solid transparent' },
  stripThumbOn: { border: `3px solid ${ORANGE}`, boxShadow: '0 0 0 3px rgba(242,153,74,0.25)' },
  stripNo: { position: 'absolute', top: 4, left: 4, zIndex: 2, minWidth: 16, height: 16, padding: '0 4px',
    borderRadius: 8, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center' },
  stripNoOn: { background: ORANGE },
  nowPlay: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
    background: 'rgba(0,0,0,0.42)' },
  eqBar: { width: 3, background: '#fff', borderRadius: 2, transformOrigin: 'bottom',
    animation: 'eq 0.8s ease-in-out infinite' },
  nowPlayTxt: { position: 'absolute', bottom: 5, fontSize: 9, fontWeight: 700, color: '#fff', letterSpacing: 0.5 },
  stripName: { fontSize: 11, color: '#444', marginTop: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    textAlign: 'left' },
  stripNameOn: { color: ORANGE, fontWeight: 700 },

  navBar: { display: 'flex', gap: 10, marginTop: 10, flexShrink: 0 },
  navBtn: { flex: 1, padding: '14px', borderRadius: 12, border: '1px solid #e0e0e6', background: '#fff', color: '#555',
    fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  navBtnPrimary: { background: ORANGE, border: `1px solid ${ORANGE}`, color: '#fff' },
  navBtnDisabled: { background: '#e5e5ea', border: '1px solid #e5e5ea', color: '#aaa', cursor: 'default' },

  listBody: { flex: 1, overflow: 'auto', padding: '8px 8px 16px' },
  listItem: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 12px', borderRadius: 12,
    border: 'none', background: 'none', cursor: 'pointer' },
  listItemOn: { background: '#eef2ff' },
  listNo: { width: 26, height: 26, borderRadius: '50%', background: '#e5e5ea', color: '#888', fontSize: 12, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  listNoOn: { background: BLUE, color: '#fff' },
  listTitle: { fontSize: 15, fontWeight: 600, color: '#1a1a2e' },
  listSub: { fontSize: 12, color: '#999', marginTop: 2 },
  listDur: { fontSize: 12, color: '#bbb', flexShrink: 0 },
};
