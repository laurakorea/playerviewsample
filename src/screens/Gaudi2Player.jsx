import { useState, useRef, useEffect, useMemo } from 'react';
import { orsayFloorMaps } from '../data/orsayTourData';
import { styles, ORANGE, TXT_DEFAULT, TXT_SUBTLE, BORDER_DEFAULT } from './Gaudi2Player.styles';
import { roomName, floorLabel, ArtCarousel, ArtImage, Controls, FloorMapView } from './Gaudi2Player.parts';

// 스냅별 시트 높이 (뷰포트 높이 대비 %)
//  0: 지도 닫힘 → 풀 플레이어 / 1: 지도+스트립 / 2: 지도 크게(90%)
const SHEET_VH = [0, 65, 90];

export default function Gaudi2Player({
  artwork, artworks, currentIndex, total,
  onPrev, onNext, onHome, onSelectIndex,
  floorMaps = orsayFloorMaps, roomPins, subMapPins, museumName = '오르세 미술관',
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
  useEffect(() => { setBrowseIndex(currentIndex); setSubStop(null); }, [currentIndex]);
  // 지도보기 클릭 시 현재 핀으로 지도 센터 이동 트리거
  const [mapCenterTrigger, setMapCenterTrigger] = useState(0);
  // 지도 "열 때" 전용: 전체 핀이 보이도록 fit (트랙 이동 시의 center와 구분)
  const [mapFitTrigger, setMapFitTrigger] = useState(0);
  // 지도를 보고 있는 중 이전/다음 버튼으로 트랙이 바뀌면 활성 pin 위치로 지도 재센터
  useEffect(() => {
    if (tab === 'map') setMapCenterTrigger(n => n + 1);
  }, [currentIndex]);
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

  // 미니 플레이어(snap 1)에서도 캐로젤 스와이프 지원
  const [miniIdx, setMiniIdx] = useState(0);
  const miniImages = artwork.carouselImages?.length > 1 ? artwork.carouselImages : null;
  useEffect(() => { setMiniIdx(0); }, [artwork.id]);
  const miniTouchRef = useRef(null);
  const miniSwipedRef = useRef(false);
  const onMiniTouchStart = (e) => { miniTouchRef.current = e.touches[0].clientX; };
  const onMiniTouchEnd = (e) => {
    if (miniTouchRef.current == null || !miniImages) return;
    const dx = e.changedTouches[0].clientX - miniTouchRef.current;
    miniTouchRef.current = null;
    if (Math.abs(dx) < 40) return;
    miniSwipedRef.current = true;
    setMiniIdx(i => dx < 0 ? Math.min(i + 1, miniImages.length - 1) : Math.max(i - 1, 0));
  };
  const onMiniWrapClick = () => {
    if (miniSwipedRef.current) { miniSwipedRef.current = false; return; }
    setSnap(0);
  };

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
      if (!m.has(a.room)) m.set(a.room, { room: a.room, floor: a.floor, idxs: [], pinNo: a.pinNo, routeGroup: a.routeGroup, routeSeq: a.routeSeq });
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
  // SUB_MAP 가상 stop(예: "내부")을 이전/다음 장소 네비게이션에 끼워넣음.
  // afterSeq = 이 핀이 몇 번 트랙 stop "다음"에 오는지(seq). 유효 seq = afterSeq + 0.5.
  const subStopList = useMemo(() => Object.values(subMapPins || {}).flat(), [subMapPins]);
  const [subStop, setSubStop] = useState(null); // "내부"/"야외로" 같은 전환 가상 stop에 머물러 있으면 그 핀
  const asSubStop = (sp) => ({ isSubMap: true, name: sp.name, room: sp.name, target: sp.target, afterSeq: sp.afterSeq, seq: sp.afterSeq + 0.5, pinType: sp.pinType, cardLabel: sp.cardLabel, cardName: sp.cardName, targetSeq: sp.targetSeq, targetPin: sp.targetPin });
  // 전환 후 착지할 트랙 idx: targetSeq 있으면 그 stop, 없으면 target floor의 첫 트랙.
  const transitionTargetIdx = (ss) => {
    if (!ss) return null;
    const s = ss.targetSeq != null ? roomStops.find(x => x.seq === ss.targetSeq) : roomStops.find(x => x.floor === ss.target);
    return s ? s.idxs[0] : null;
  };

  // 이전/다음 장소(stop) — SUB_MAP 가상 stop 인식. 전환 핀 위에선 전환 체인(targetPin/targetSeq)을 따라 필과 같은 목적지를 가리킴.
  const prevStop = useMemo(() => {
    if (subStop) {
      const via = subStopList.find(x => x.targetPin === subStop.name);                         // 이 전환을 가리키는 앞 전환 핀 (시작 ← 야외로)
      if (via) return asSubStop(via);
      return roomStops.find(s => s.seq === subStop.afterSeq) || null;                           // 내부/야외로 → afterSeq stop
    }
    if (!activeStop) return null;
    const landed = subStopList.find(x => x.targetSeq === activeStop.seq);                       // 이 stop으로 착지시키는 전환 (시작 → seq22)
    if (landed) return asSubStop(landed);
    const sp = subStopList.find(x => x.afterSeq === activeStop.seq - 1);                        // 14 → 내부
    return sp ? asSubStop(sp) : (roomStops.find(s => s.seq === activeStop.seq - 1) || null);
  }, [subStop, activeStop, roomStops, subStopList]);
  const nextStop = useMemo(() => {
    if (subStop) {
      if (subStop.targetPin) {                                                                  // 야외로 → 시작(다음 전환 핀)
        const tp = subStopList.find(x => x.name === subStop.targetPin);
        return tp ? asSubStop(tp) : null;
      }
      if (subStop.targetSeq != null) return roomStops.find(s => s.seq === subStop.targetSeq) || null;   // 시작 → seq22
      return roomStops.find(s => s.floor === subStop.target) || null;                           // 내부 → target floor 첫 stop
    }
    if (!activeStop) return roomStops[0] || null;
    const sp = subStopList.find(x => x.afterSeq === activeStop.seq);                            // 13 → 내부
    return sp ? asSubStop(sp) : (roomStops.find(s => s.seq === activeStop.seq + 1) || null);
  }, [subStop, activeStop, roomStops, subStopList]);

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

  // ── 핀 스트립: 잠금(미구매)/재생 상태는 썸네일에, 이동은 강등 ──
  // 구매/권한 상태 — 데모용(false=미구매). 실제 서비스에선 엔타이틀먼트/API 상태로 교체.
  const purchased = false;
  const isLocked = (a) => !purchased && !!a?.room && !a?.free; // 유료(장소) 트랙은 구매 전 잠금. 인트로(room 없음)·free 트랙은 무료.
  const playTrack = (gi) => {                                              // 썸네일 탭 = 그 트랙 재생 (자동재생 arm)
    if (isLocked(artworks[gi])) return;                                    // 잠금 트랙은 재생 불가
    autoPlayOnSelectRef.current = true;
    onSelectIndex(gi);
    setBrowseIndex(gi);
    setSnap(1);
  };
  const goToStop = (s) => {                                                 // prev/next 장소 이동(로직 동일, 위계만 강등)
    if (!s) return;
    if (s.isSubMap) { setSubStop(s); setPinActive(true); setSnap(1); }
    else { setSubStop(null); setBrowseIndex(s.idxs[0]); setPinActive(true); setSnap(1); setMapCenterTrigger(n => n + 1); }
  };
  const goTransition = () => {                                             // 전환 핀 주 CTA (실내 입장/야외로/시작)
    if (!subStop) return;
    if (subStop.targetPin) {
      const tp = subStopList.find(x => x.name === subStop.targetPin);
      if (tp) { setSubStop(asSubStop(tp)); setPinActive(true); setSnap(1); }
      return;
    }
    const goIdx = transitionTargetIdx(subStop);
    setSubStop(null);
    if (goIdx != null) { setBrowseIndex(goIdx); setPinActive(true); setSnap(1); setMapCenterTrigger(n => n + 1); }
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
  const frameH = () => (document.querySelector('.app-shell')?.clientHeight || window.innerHeight);
  const vh = () => frameH() / 100;
  const onDown = (e) => {
    dragRef.current = { dragging: true, startY: e.clientY, startH: SHEET_VH[snap] * vh() };
    setDragH(SHEET_VH[snap] * vh());
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!dragRef.current.dragging) return;
    const dy = dragRef.current.startY - e.clientY; // 위로 = +
    const h = Math.max(0, Math.min(frameH() * 0.88, dragRef.current.startH + dy));
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

  const sheetH = dragH != null ? `${dragH}px` : `${SHEET_VH[snap]}%`;
  const sheetTrans = dragH != null ? 'none' : 'height 0.32s cubic-bezier(0.4,0,0.2,1)';

  // 지도/목차 탭 전환 토글 (아이콘). 지도=상단 우측, 목차=시트 우하단 재사용.
  const tabToggleButtons = (
    <>
      <button style={{ ...styles.sheetTabBtn, width: 36, padding: 0, ...(tab === 'map' ? styles.sheetTabBtnOn : {}) }}
              onClick={() => { setTab('map'); setPinActive(false); }} aria-label="지도">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 6L9 3L15 6L21 3V18L15 21L9 18L3 21V6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
          <line x1="9" y1="3" x2="9" y2="18" stroke="currentColor" strokeWidth="2"/>
          <line x1="15" y1="6" x2="15" y2="21" stroke="currentColor" strokeWidth="2"/>
        </svg>
      </button>
      <button style={{ ...styles.sheetTabBtn, width: 36, padding: 0, ...(tab === 'list' ? styles.sheetTabBtnOn : {}) }}
              onClick={() => { setTab('list'); setPinActive(false); }} aria-label="목차">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="4" y1="6" x2="20" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <line x1="4" y1="18" x2="20" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>
    </>
  );

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
          {snap !== 2 && (
            <button style={styles.iconBtn} onClick={onHome} aria-label="닫기">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 6.5L9.5 15L18 6.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
          <div style={styles.topRight}>
            {!isFull && snap !== 2 && (
              <>
                <button style={styles.chipIcon} onClick={() => setOverlay('comments')} aria-label="댓글">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 4H20V16H7L4 19V4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                  </svg>
                </button>
                <button style={styles.chipIcon} onClick={() => setOverlay('script')} aria-label="스크립트">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 3H14L18 7V21H6V3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                    <path d="M9 11H15M9 15H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                </button>
              </>
            )}
            {snap !== 2 && (
              <button style={styles.gearBtn} onClick={() => setOverlay('settings')}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10.825 22C10.375 22 9.98748 21.85 9.66248 21.55C9.33748 21.25 9.14165 20.8833 9.07498 20.45L8.84998 18.8C8.63331 18.7167 8.42915 18.6167 8.23748 18.5C8.04581 18.3833 7.85831 18.2583 7.67498 18.125L6.12498 18.775C5.70831 18.9583 5.29165 18.975 4.87498 18.825C4.45831 18.675 4.13331 18.4083 3.89998 18.025L2.72498 15.975C2.49165 15.5917 2.42498 15.1833 2.52498 14.75C2.62498 14.3167 2.84998 13.9583 3.19998 13.675L4.52498 12.675C4.50831 12.5583 4.49998 12.4458 4.49998 12.3375V11.6625C4.49998 11.5542 4.50831 11.4417 4.52498 11.325L3.19998 10.325C2.84998 10.0417 2.62498 9.68333 2.52498 9.25C2.42498 8.81667 2.49165 8.40833 2.72498 8.025L3.89998 5.975C4.13331 5.59167 4.45831 5.325 4.87498 5.175C5.29165 5.025 5.70831 5.04167 6.12498 5.225L7.67498 5.875C7.85831 5.74167 8.04998 5.61667 8.24998 5.5C8.44998 5.38333 8.64998 5.28333 8.84998 5.2L9.07498 3.55C9.14165 3.11667 9.33748 2.75 9.66248 2.45C9.98748 2.15 10.375 2 10.825 2H13.175C13.625 2 14.0125 2.15 14.3375 2.45C14.6625 2.75 14.8583 3.11667 14.925 3.55L15.15 5.2C15.3666 5.28333 15.5708 5.38333 15.7625 5.5C15.9541 5.61667 16.1416 5.74167 16.325 5.875L17.875 5.225C18.2916 5.04167 18.7083 5.025 19.125 5.175C19.5416 5.325 19.8666 5.59167 20.1 5.975L21.275 8.025C21.5083 8.40833 21.575 8.81667 21.475 9.25C21.375 9.68333 21.15 10.0417 20.8 10.325L19.475 11.325C19.4916 11.4417 19.5 11.5542 19.5 11.6625V12.3375C19.5 12.4458 19.4833 12.5583 19.45 12.675L20.775 13.675C21.125 13.9583 21.35 14.3167 21.45 14.75C21.55 15.1833 21.4833 15.5917 21.25 15.975L20.05 18.025C19.8166 18.4083 19.4916 18.675 19.075 18.825C18.6583 18.975 18.2416 18.9583 17.825 18.775L16.325 18.125C16.1416 18.2583 15.95 18.3833 15.75 18.5C15.55 18.6167 15.35 18.7167 15.15 18.8L14.925 20.45C14.8583 20.8833 14.6625 21.25 14.3375 21.55C14.0125 21.85 13.625 22 13.175 22H10.825ZM11 20H12.975L13.325 17.35C13.8416 17.2167 14.3208 17.0208 14.7625 16.7625C15.2041 16.5042 15.6083 16.1917 15.975 15.825L18.45 16.85L19.425 15.15L17.275 13.525C17.3583 13.2917 17.4166 13.0458 17.45 12.7875C17.4833 12.5292 17.5 12.2667 17.5 12C17.5 11.7333 17.4833 11.4708 17.45 11.2125C17.4166 10.9542 17.3583 10.7083 17.275 10.475L19.425 8.85L18.45 7.15L15.975 8.2C15.6083 7.81667 15.2041 7.49583 14.7625 7.2375C14.3208 6.97917 13.8416 6.78333 13.325 6.65L13 4H11.025L10.675 6.65C10.1583 6.78333 9.67915 6.97917 9.23748 7.2375C8.79581 7.49583 8.39165 7.80833 8.02498 8.175L5.54998 7.15L4.57498 8.85L6.72498 10.45C6.64165 10.7 6.58331 10.95 6.54998 11.2C6.51665 11.45 6.49998 11.7167 6.49998 12C6.49998 12.2667 6.51665 12.525 6.54998 12.775C6.58331 13.025 6.64165 13.275 6.72498 13.525L4.57498 15.15L5.54998 16.85L8.02498 15.8C8.39165 16.1833 8.79581 16.5042 9.23748 16.7625C9.67915 17.0208 10.1583 17.2167 10.675 17.35L11 20ZM12.05 15.5C13.0166 15.5 13.8416 15.1583 14.525 14.475C15.2083 13.7917 15.55 12.9667 15.55 12C15.55 11.0333 15.2083 10.2083 14.525 9.525C13.8416 8.84167 13.0166 8.5 12.05 8.5C11.0666 8.5 10.2375 8.84167 9.56248 9.525C8.88748 10.2083 8.54998 11.0333 8.54998 12C8.54998 12.9667 8.88748 13.7917 9.56248 14.475C10.2375 15.1583 11.0666 15.5 12.05 15.5Z" fill="currentColor"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        {isFull ? (
          /* ── 풀 플레이어 ── */
          <div style={styles.fullWrap}>
            <ArtCarousel artwork={artwork} hasAudio={hasAudio} isPlaying={isPlaying} />

            <div style={{ textAlign: 'left', margin: '12px 0 4px' }}>
              <span style={styles.count}>{floorLabel(artwork, floorMaps)}</span>
            </div>

            <div style={styles.titleRow}>
              <div style={{ flex: 1 }}>
                <h2 style={styles.title}>{artwork.title}</h2>
                <p style={styles.subtitle}>{museumName}{artwork.subtitle ? ` · ${artwork.subtitle}` : ''}</p>
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
              <button style={styles.bottomBtn} onClick={() => { setSubStop(null); setTab('map'); setSnap(1); setBrowseIndex(currentIndex); setPinActive(true); setMapFitTrigger(n => n + 1); }}>▥ 지도보기</button>
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
          <div style={styles.miniWrap} onClick={onMiniWrapClick}
               onTouchStart={onMiniTouchStart} onTouchEnd={onMiniTouchEnd}>
            {miniImages ? (
              <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', gap: 8,
                  transform: `translateX(calc(10% - ${miniIdx} * (80% + 8px)))`,
                  transition: 'transform 0.3s ease',
                }}>
                  {miniImages.map((src, i) => (
                    <div key={i} style={{ width: '80%', height: '100%', flexShrink: 0, position: 'relative', background: '#2a2a2a', opacity: i === miniIdx ? 1 : 0.5, transition: 'opacity 0.3s' }}>
                      <ArtImage src={src} alt={artwork.title} contain />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {artwork.imageSrc && (
                  <img src={artwork.imageSrc} alt="" aria-hidden style={styles.miniBlurBg} />
                )}
                <ArtImage src={artwork.imageSrc} alt={artwork.title} contain />
              </>
            )}
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
                            pinActive={pinActive && !subStop}
                            centerTrigger={mapCenterTrigger}
                            fitTrigger={mapFitTrigger}
                            onPinClick={(i) => { setSubStop(null); setBrowseIndex(i); setSnap(1); setPinActive(true); }}
                            onMapClick={() => { setSnap(1); setPinActive(false); }}
                            stripActive={pinActive && (!!activeStop || !!subStop)}
                            floorMaps={floorMaps} roomPins={roomPins} subMapPins={subMapPins}
                            forcedSubActive={subStop?.name ?? null}
                            onSubMapActivate={(name) => {
                              if (!name) { setSubStop(null); return; }
                              const sp = subStopList.find(x => x.name === name);
                              if (sp) { setSubStop(asSubStop(sp)); setPinActive(true); setSnap(1); }
                            }}
                            topRight={tabToggleButtons}
                            onToggleRoute={() => setShowRoute(r => !r)} />
            </div>

            {snap >= 1 && pinActive && (activeStop || subStop) && (
              <div style={styles.stripOverlay}>

                {subStop ? (
                  /* 이동 유도 핀 — 콘텐츠가 아니라 '이동'이므로 가로 필 버튼(썸네일 크기 X) */
                  <button style={styles.stripMoveBtn} onClick={goTransition}>
                    <span style={styles.stripMoveIcon}>
                      {subStop.pinType === 'navigation' ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M3 22 L3 17 L8 17 L8 13 L13 13 L13 9 L18 9 L18 5 L22 5 L22 22 Z" /></svg>
                      ) : subStop.pinType === 'start' ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z" /></svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 -960 960 960" fill="#fff" aria-hidden="true">{subStop.pinType === 'next'
                          ? <path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-800h280v80H200v560h280v80H200Zm440-160-55-58 102-102H360v-80h327L585-622l55-58 200 200-200 200Z" />
                          : <path d="M480-120v-80h280v-560H480v-80h280q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H480Zm-80-160-55-58 102-102H120v-80h327L345-622l55-58 200 200-200 200Z" />}</svg>
                      )}
                    </span>
                    <span style={styles.stripMoveLabel}>
                      {subStop.pinType === 'navigation'
                        ? subStop.name                                              // "출구로 나가기" — name이 곧 문구
                        : subStop.pinType === 'start'
                        ? `${subStop.cardName ?? '다음 장소'}로 이동`               // "지점 24로 이동" — 다음 장소로
                        : `${subStop.name ?? '내부'} 입장`}                          {/* "내부 입장" — 지도(실내) 진입 */}
                    </span>
                    <span style={styles.stripMoveChev}>›</span>
                  </button>
                ) : (
                  /* 트랙 스트립 — 썸네일만. 제목·트랙수는 하단 이동 바에 표시 */
                  <div style={styles.strip}>
                      {stripIdxs.map((gi) => {
                        const a = artworks[gi];
                        const active = gi === currentIndex;
                        const playing = active && isPlaying;
                        return (
                          <div key={a.id} style={styles.stripCardSm}>
                            <div style={{ ...styles.stripThumbSm, ...(active ? styles.stripThumbOn : {}) }}
                                 onClick={() => playTrack(gi)}>
                              <ArtImage src={a.imageSrc} alt={a.title} cover />
                              {playing ? (
                                <div style={styles.stripEqBadge}>
                                  <span style={{ ...styles.eqBar, animationDelay: '0s', height: 6 }} />
                                  <span style={{ ...styles.eqBar, animationDelay: '0.15s', height: 10 }} />
                                  <span style={{ ...styles.eqBar, animationDelay: '0.3s', height: 7 }} />
                                </div>
                              ) : isLocked(a) ? (
                                <div style={styles.stripLockOverlay}>
                                  <div style={styles.stripLockBadge}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5zm3 8H9V6a3 3 0 1 1 6 0v3z" /></svg>
                                  </div>
                                </div>
                              ) : null}
                              <button
                                style={isLiked(a.id) ? styles.stripHeartOn : styles.stripHeart}
                                onClick={(e) => { e.stopPropagation(); toggleLike(a.id, e); }}
                              >
                                {isLiked(a.id) ? '♥' : '♡'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}

                {/* 하단 이동 바 — (◯‹) 활성 핀 제목[+트랙수] (›◯). 원형 이전/다음 버튼, 없는 방향은 그레이 비활성 */}
                <div style={styles.stripNavBar}>
                  {prevStop ? (
                    <button style={styles.stripNavCircle} onClick={() => goToStop(prevStop)} aria-label="이전">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                  ) : (
                    <span style={{ ...styles.stripNavCircle, ...styles.stripNavCircleOff }} aria-hidden="true">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>
                  )}
                  <div style={styles.stripNavCenter}>
                    <div style={styles.stripNavTitle}>{subStop ? subStop.name : roomName(activeStop?.room)}</div>
                    {!subStop && <div style={styles.stripNavSub}>트랙 {stripIdxs.length}개</div>}
                  </div>
                  {nextStop ? (
                    <button style={styles.stripNavCircle} onClick={() => goToStop(nextStop)} aria-label="다음">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                  ) : (
                    <span style={{ ...styles.stripNavCircle, ...styles.stripNavCircleOff }} aria-hidden="true">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>
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
              {/* 0행: 지도 이름 드롭다운 + 지도/목차 토글 (지도 시트와 동일) */}
              <div style={styles.listTopRow}>
                <button style={styles.mapNameBtn} onClick={() => setOverlay('floorFilter')}>
                  {museumName}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <div style={styles.sheetTabToggle}>{tabToggleButtons}</div>
              </div>
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
              {/* 2행: 검색바 */}
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
            {/* 스크롤 목록 — 층별 그룹 */}
            <div ref={listBodyRef} style={styles.listBody}>
              {(() => {
                const filtered = artworks.map((a, i) => ({ a, i })).filter(({ a }) => {
                  if (listFilter === 'best' && !a.star) return false;
                  if (listFilter === 'liked' && !isLiked(a.id)) return false;
                  if (searchQuery && !a.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
                  return true;
                });
                // floor별로 1개 그룹 (첫 등장 순서 유지). 같은 floor가 비연속으로 나와도 병합 → key 중복 방지.
                const groups = [];
                const byFloor = new Map();
                filtered.forEach(({ a, i }) => {
                  if (!byFloor.has(a.floor)) { const g = { floor: a.floor, items: [] }; byFloor.set(a.floor, g); groups.push(g); }
                  byFloor.get(a.floor).items.push({ a, i });
                });
                return groups.map(({ floor, items }) => (
                  <div key={floor ?? 'none'} ref={el => { groupRefsMap.current[floor ?? 'none'] = el; }} style={{ marginBottom: 8 }}>
                    <div style={styles.listGroupHeader}>{floor != null ? (floorMaps[floor]?.label ?? `${floor}층`) : '전체'}</div>
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
                  {[null, ...Object.keys(floorMaps).map(Number)].map(f => (
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
                      {f === null ? '층 전체' : floorMaps[f]?.label ?? `${f}층`}
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


export { FloorMapView, ArtCarousel, Controls, ArtImage, floorLabel } from './Gaudi2Player.parts';
