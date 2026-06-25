import { useState, useRef, useEffect, useMemo } from 'react';
import { decodeWKBPoint } from '../utils/geo';

// 스냅별 시트 높이 (뷰포트 높이 대비 %)
//  0: 지도 닫힘 → 풀 플레이어 / 1: 중간 / 2: 지도 크게
const SHEET_VH = [0, 52, 74];

// ── 구글맵 로더 (NavigationScreen과 동일 키 재사용) ──
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
  const [snap, setSnap] = useState(1);        // 진입 시 중간
  const [dragH, setDragH] = useState(null);   // 드래그 중 px, 평소 null
  const [tab, setTab] = useState('map');      // 'map' | 'list'
  const [autoplay, setAutoplay] = useState(false);
  const [liked, setLiked] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef(null);
  const lastTimeRef = useRef(0);
  const dragRef = useRef({ dragging: false, startY: 0, startH: 0 });

  const isFull = snap === 0;

  useEffect(() => {
    setIsPlaying(false);
    setProgress(0);
    setElapsed(0);
    lastTimeRef.current = 0;
  }, [artwork.id]);

  // 풀↔미니 전환 시 video 엘리먼트가 새로 마운트되므로 재생 위치/상태 복원
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const restore = () => {
      if (lastTimeRef.current) { try { v.currentTime = lastTimeRef.current; } catch { /* noop */ } }
      if (isPlaying) v.play().catch(() => {});
    };
    if (v.readyState >= 1) restore();
    else v.addEventListener('loadedmetadata', restore, { once: true });
    // isPlaying 변화로 재실행하지 않도록 isFull만 의존
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFull]);

  // ── 오디오/영상 ───────────────────────────────
  const playPause = () => {
    const v = videoRef.current;
    if (!v) return;
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
    // 살짝만 끌어도(플릭) 방향대로 한 단계 이동
    const delta = h - startH;
    if (best === snap && Math.abs(delta) > 24) {
      best = delta > 0 ? Math.min(2, snap + 1) : Math.max(0, snap - 1);
    }
    setSnap(best);
    setDragH(null);
  };

  const sheetH = dragH != null ? `${dragH}px` : `${SHEET_VH[snap]}vh`;
  const sheetTrans = dragH != null ? 'none' : 'height 0.32s cubic-bezier(0.4,0,0.2,1)';

  return (
    <div style={styles.root}>
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
              <video ref={videoRef} src={artwork.videoSrc} poster={artwork.imageSrc} style={styles.artImg}
                     onTimeUpdate={onTime} onLoadedMetadata={onMeta} onEnded={() => setIsPlaying(false)}
                     playsInline preload="metadata" />
              <span style={styles.badge}>{artwork.subtitle}</span>
            </div>
            <div style={styles.countRow}>
              <span style={styles.count}>{currentIndex + 1} / {total}</span>
            </div>

            <div style={styles.titleRow}>
              <div style={{ flex: 1 }}>
                <h2 style={styles.title}>{artwork.title}</h2>
                <p style={styles.subtitle}>경복궁 · {artwork.subtitle}</p>
              </div>
              <button style={styles.heart} onClick={() => setLiked(l => !l)}>
                {liked ? '♥' : '♡'}
              </button>
            </div>

            <div style={styles.chips}>
              <span style={styles.chip}>댓글 0</span>
              <span style={styles.chip}>1.0x</span>
              <span style={styles.chip}>스크립트</span>
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

            <Controls big isPlaying={isPlaying} onPlay={playPause} onPrev={onPrev} onNext={onNext} onNudge={nudge} />

            <div style={styles.bottomBtns}>
              <button style={styles.bottomBtn} onClick={() => { setTab('map'); setSnap(1); }}>▥ 지도보기</button>
              <button style={styles.bottomBtn} onClick={() => { setTab('list'); setSnap(2); }}>☰ 목차보기</button>
            </div>
          </div>
        ) : (
          /* ── 미니 플레이어: 영상 풀배경 + 컨트롤 오버레이 ── */
          <div style={styles.miniWrap}>
            <video ref={videoRef} src={artwork.videoSrc} poster={artwork.imageSrc} style={styles.miniVideo}
                   onTimeUpdate={onTime} onLoadedMetadata={onMeta} onEnded={() => setIsPlaying(false)}
                   playsInline preload="metadata" onClick={playPause} />
            <div style={styles.miniControls}>
              <Controls isPlaying={isPlaying} onPlay={playPause} onPrev={onPrev} onNext={onNext} onNudge={nudge} />
            </div>
          </div>
        )}
      </div>

      {/* ============ 지도 바텀시트 ============ */}
      <div style={{ ...styles.sheet, height: sheetH, transition: sheetTrans }}>
        {/* 드래그 전용 핸들 영역 */}
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
            {/* 지도 (구글맵) */}
            <div style={styles.mapBox}>
              <MapView
                artworks={artworks}
                currentIndex={currentIndex}
                snap={snap}
                onPinClick={(i) => { onSelectIndex(i); setSnap(2); }}
              />
              <button style={styles.tocBtn} onClick={() => setTab('list')}>☰ 목차</button>
            </div>

            {/* 장소 썸네일 스트립 (위로 올렸을 때) */}
            {snap === 2 && (
              <>
                <div style={styles.strip}>
                  {artworks.map((a, i) => {
                    const active = i === currentIndex;
                    return (
                      <button key={a.id} style={styles.stripCard} onClick={() => onSelectIndex(i)}>
                        <div style={{ ...styles.stripThumb, ...(active ? styles.stripThumbOn : {}) }}>
                          <img src={a.imageSrc} alt={a.title} style={styles.stripImg}
                               onError={e => { e.target.style.visibility = 'hidden'; }} />
                          {!active && <span style={styles.lock}>🔒</span>}
                          {active && (
                            <div style={styles.nowPlay}>
                              <span style={{ ...styles.eqBar, animationDelay: '0s', height: 8 }} />
                              <span style={{ ...styles.eqBar, animationDelay: '0.15s', height: 14 }} />
                              <span style={{ ...styles.eqBar, animationDelay: '0.3s', height: 10 }} />
                              <span style={styles.nowPlayTxt}>재생중</span>
                            </div>
                          )}
                        </div>
                        <div style={{ ...styles.stripName, ...(active ? styles.stripNameOn : {}) }}>{a.title}</div>
                      </button>
                    );
                  })}
                </div>
                <div style={styles.navBar}>
                  <button style={styles.navBtn} onClick={onPrev}>← 이전 장소</button>
                  <button style={{ ...styles.navBtn, ...styles.navBtnPrimary }} onClick={onNext}>다음 장소 →</button>
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
                  <div style={styles.listTitle}>{a.title}</div>
                  <div style={styles.listSub}>{a.subtitle}</div>
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

function Controls({ big, isPlaying, onPlay, onPrev, onNext, onNudge }) {
  const size = big ? styles.ctrlBig : styles.ctrl;
  return (
    <div style={styles.controls}>
      <button style={styles.ctrlSide} onClick={() => onNudge(-5)}>↺<sub style={styles.ctrlNum}>5</sub></button>
      <button style={size} onClick={onPrev}>⏮</button>
      <button style={big ? styles.playBig : styles.play} onClick={onPlay}>{isPlaying ? '⏸' : '▶'}</button>
      <button style={size} onClick={onNext}>⏭</button>
      <button style={styles.ctrlSide} onClick={() => onNudge(5)}><sub style={styles.ctrlNum}>5</sub>↻</button>
    </div>
  );
}

function markerIcon(g, active) {
  return {
    path: g.maps.SymbolPath.CIRCLE,
    scale: active ? 11 : 7,
    fillColor: active ? '#F2994A' : '#4F6FE8',
    fillOpacity: 1,
    strokeColor: '#fff',
    strokeWeight: active ? 3 : 2,
  };
}

function MapView({ artworks, currentIndex, snap, onPinClick }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const userRef = useRef(null);
  const rendererRef = useRef(null);
  const onPinRef = useRef(onPinClick);
  const [locating, setLocating] = useState(false);

  useEffect(() => { onPinRef.current = onPinClick; });

  // wkb → 좌표 (null인 코스는 제외)
  const coords = useMemo(() => artworks.map(a => decodeWKBPoint(a.wkb)), [artworks]);

  // 지도 초기화 (탭/마운트 시 1회)
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
      const valid = coords.map((c, i) => ({ c, i })).filter(x => x.c);
      if (!valid.length) return;
      const center = coords[currentIndex] || valid[0].c;
      const map = new g.maps.Map(elRef.current, {
        center: { lat: center.lat, lng: center.lon },
        zoom: 16,
        disableDefaultUI: true,
        clickableIcons: false,
        gestureHandling: 'greedy',
        styles: MAP_STYLES,
      });
      mapRef.current = map;
      markersRef.current = valid.map(({ c, i }) => {
        const m = new g.maps.Marker({
          position: { lat: c.lat, lng: c.lon },
          map,
          zIndex: i === currentIndex ? 99 : 1,
          icon: markerIcon(g, i === currentIndex),
        });
        m.addListener('click', () => onPinRef.current?.(i));
        return m;
      });
    }
    return () => {
      cancelled = true;
      mapRef.current = null;
      markersRef.current = [];
      userRef.current = null;
      rendererRef.current = null;
    };
  }, [artworks]);

  // 현재 코스 변경 → 하이라이트 + 이동
  useEffect(() => {
    const g = window.google, map = mapRef.current;
    if (!g || !map) return;
    const valid = coords.map((c, i) => ({ c, i })).filter(x => x.c);
    markersRef.current.forEach((m, k) => {
      const active = valid[k]?.i === currentIndex;
      m.setIcon(markerIcon(g, active));
      m.setZIndex(active ? 99 : 1);
    });
    const c = coords[currentIndex];
    if (c) map.panTo({ lat: c.lat, lng: c.lon });
  }, [currentIndex]);

  // 시트 높이(스냅) 변경 → 지도 resize 후 재중심
  useEffect(() => {
    const g = window.google, map = mapRef.current;
    if (!g || !map) return;
    const t = setTimeout(() => {
      g.maps.event.trigger(map, 'resize');
      const c = coords[currentIndex];
      if (c) map.setCenter({ lat: c.lat, lng: c.lon });
    }, 360);
    return () => clearTimeout(t);
  }, [snap]);

  const locate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const g = window.google, map = mapRef.current;
        if (!g || !map) return;
        const ll = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (userRef.current) userRef.current.setPosition(ll);
        else userRef.current = new g.maps.Marker({
          position: ll, map,
          icon: { path: g.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#4F6FE8', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2.5 },
        });
        map.panTo(ll);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const route = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const g = window.google, map = mapRef.current, dest = coords[currentIndex];
        if (!g || !map || !dest) return;
        const origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!rendererRef.current) rendererRef.current = new g.maps.DirectionsRenderer({
          map, suppressMarkers: true,
          polylineOptions: { strokeColor: '#4F6FE8', strokeWeight: 4, strokeOpacity: 0.85 },
        });
        new g.maps.DirectionsService().route(
          { origin, destination: { lat: dest.lat, lng: dest.lon }, travelMode: g.maps.TravelMode.WALKING },
          (res, status) => { if (status === 'OK') rendererRef.current.setDirections(res); }
        );
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <>
      <div ref={elRef} style={{ position: 'absolute', inset: 0 }} />
      <div style={styles.mapActions}>
        <button style={styles.mapAction} onClick={route}>↗ 경로</button>
        <button style={styles.mapAction} onClick={locate}>{locating ? '…' : '◎ 내 위치'}</button>
      </div>
    </>
  );
}

const W = '#fff';
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
  autoPillOn: { background: 'rgba(79,111,232,0.25)', borderColor: '#4F6FE8', color: '#9db0ff' },

  // 풀 플레이어
  fullWrap: { flex: 1, display: 'flex', flexDirection: 'column', padding: '4px 22px 16px', overflow: 'auto' },
  artBig: { position: 'relative', width: '62%', aspectRatio: '3 / 4', margin: '6px auto 0', borderRadius: 6, overflow: 'hidden',
    background: '#222', boxShadow: '0 12px 40px rgba(0,0,0,0.6)' },
  artImg: { width: '100%', height: '100%', objectFit: 'cover' },
  badge: { position: 'absolute', top: 8, left: 8, background: '#F2994A', color: '#1a1208', fontSize: 10, fontWeight: 700,
    padding: '3px 8px', borderRadius: 4 },
  countRow: { textAlign: 'center', margin: '12px 0 4px' },
  count: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  titleRow: { display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 4 },
  title: { fontSize: 20, fontWeight: 700, color: W, margin: 0, lineHeight: 1.35 },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '4px 0 0' },
  heart: { background: 'none', border: 'none', color: '#ff5a7a', fontSize: 24, cursor: 'pointer', lineHeight: 1, flexShrink: 0 },

  chips: { display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' },
  chip: { fontSize: 12, color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.07)', padding: '7px 12px',
    borderRadius: 8, whiteSpace: 'nowrap' },

  progWrap: { marginTop: 16 },
  progBar: { position: 'relative', height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 4, cursor: 'pointer' },
  progFill: { position: 'absolute', top: 0, left: 0, height: '100%', background: '#4F6FE8', borderRadius: 4 },
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

  bottomBtns: { display: 'flex', gap: 10, marginTop: 'auto', paddingTop: 18 },
  bottomBtn: { flex: 1, padding: '13px', borderRadius: 10, background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.12)', color: W, fontSize: 14, fontWeight: 600, cursor: 'pointer' },

  // 미니 플레이어: 영상이 전체를 채우고 컨트롤만 오버레이
  miniWrap: { position: 'absolute', inset: 0, zIndex: 1, background: '#000' },
  miniVideo: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' },
  miniControls: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: 14,
    background: 'linear-gradient(transparent, rgba(0,0,0,0.55))' },

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
  mapBox: { position: 'relative', flex: 1, borderRadius: 12, overflow: 'hidden', minHeight: 120, background: '#e8eaf0' },
  mapActions: { position: 'absolute', right: 10, bottom: 10, display: 'flex', flexDirection: 'column', gap: 8 },
  mapAction: { background: '#fff', border: 'none', borderRadius: 8, padding: '8px 10px', fontSize: 12, fontWeight: 600,
    color: '#333', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', cursor: 'pointer' },

  strip: { display: 'flex', gap: 10, overflowX: 'auto', padding: '12px 0 4px', flexShrink: 0 },
  stripCard: { flexShrink: 0, width: 92, background: 'none', border: 'none', padding: 0, cursor: 'pointer' },
  stripThumb: { position: 'relative', width: 92, height: 72, borderRadius: 8, overflow: 'hidden', background: '#e5e5ea',
    border: '2px solid transparent' },
  stripThumbOn: { border: '3px solid #F2994A', boxShadow: '0 0 0 3px rgba(242,153,74,0.25)' },
  stripImg: { width: '100%', height: '100%', objectFit: 'cover' },
  lock: { position: 'absolute', top: 6, right: 6, fontSize: 11 },
  nowPlay: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
    background: 'rgba(0,0,0,0.42)' },
  eqBar: { width: 3, background: '#fff', borderRadius: 2, transformOrigin: 'bottom',
    animation: 'eq 0.8s ease-in-out infinite' },
  nowPlayTxt: { position: 'absolute', bottom: 5, fontSize: 9, fontWeight: 700, color: '#fff', letterSpacing: 0.5 },
  stripName: { fontSize: 11, color: '#444', marginTop: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    textAlign: 'left' },
  stripNameOn: { color: '#F2994A', fontWeight: 700 },

  navBar: { display: 'flex', gap: 10, marginTop: 10, flexShrink: 0 },
  navBtn: { flex: 1, padding: '14px', borderRadius: 12, border: '1px solid #e0e0e6', background: '#fff', color: '#555',
    fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  navBtnPrimary: { background: '#F2994A', borderColor: '#F2994A', color: '#fff' },

  listBody: { flex: 1, overflow: 'auto', padding: '8px 8px 16px' },
  listItem: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 12px', borderRadius: 12,
    border: 'none', background: 'none', cursor: 'pointer' },
  listItemOn: { background: '#eef2ff' },
  listNo: { width: 26, height: 26, borderRadius: '50%', background: '#e5e5ea', color: '#888', fontSize: 12, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  listNoOn: { background: '#4F6FE8', color: '#fff' },
  listTitle: { fontSize: 15, fontWeight: 600, color: '#1a1a2e' },
  listSub: { fontSize: 12, color: '#999', marginTop: 2 },
  listDur: { fontSize: 12, color: '#bbb', flexShrink: 0 },
};
