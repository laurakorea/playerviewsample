import { useState, useRef, useEffect, useMemo } from 'react';
import { orsayFloorMaps, orsayRoomPins } from '../data/orsayTourData';
import { styles, ORANGE } from './OrsayPlayer.styles';

export function roomName(room) {
  return room === '입구' || room === '조각홀' ? room : `${room}관`;
}

export function floorLabel(a) {
  if (!a.floor) return a.subtitle || '';
  const f = orsayFloorMaps[a.floor];
  const fl = f ? f.label : `${a.floor}층`;
  return a.room ? `${fl} · ${roomName(a.room)}` : fl;
}

// 캐로젤 (carouselImages 있을 때만, 없으면 단일 이미지)
export function ArtCarousel({ artwork, hasAudio, isPlaying, aspect = '1 / 1', full = false }) {
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
      <div style={{ ...styles.artBig, aspectRatio: aspect, ...(full ? { width: '100%' } : {}) }}>
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
            aspectRatio: aspect,
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
export function ArtImage({ src, alt, cover, contain }) {
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

export function Controls({ big, isPlaying, hasAudio, onPlay, onPrev, onNext, onNudge }) {
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
export function FloorMapView({ artworks, currentIndex, playingIndex, roomStops, showRoute, pinActive, centerTrigger, stripActive, onPinClick, onMapClick, onToggleRoute, trackCard, v2 }) {
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
      onMapClick?.();
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
    const targetZoom = 2;
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
      {trackCard && <div style={styles.mapTrackCard}>{trackCard}</div>}
      <div ref={imgBoxRef} style={{ ...styles.floorImgBox, ...(v2 ? styles.floorImgBoxV2 : {}) }}
           onPointerDown={onMapPointerDown} onPointerMove={onMapPointerMove}
           onPointerUp={onMapPointerUp} onPointerCancel={onMapPointerUp}
           onTouchStart={onMapTouchStart} onTouchMove={onMapTouchMove} onTouchEnd={onMapTouchEnd}
           onWheel={onMapWheel}
           onClick={onMapClick}>
        {map && !imgErr ? (
          <div ref={canvasRef} style={{ ...styles.floorCanvas, transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`, transition: pinchRef.current.pinching || panRef.current.dragging ? 'none' : 'transform 0.2s ease-out' }}>
            <img src={map.src} alt={map.label} style={{ ...styles.floorImg, ...(v2 ? styles.floorImgV2 : {}) }} onError={() => setImgErr(true)} />
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

      {/* 하단 버튼 그룹: 경로 + 층 선택 (v2는 우측, 기본은 좌측) */}
      <div style={{ position: 'absolute', zIndex: 6, bottom: stripActive ? 162 : (v2 ? '50%' : 10),
                    ...(v2 ? { right: 12, transform: 'translateY(50%)' } : { left: 10 }),
                    display: 'flex', flexDirection: 'column', alignItems: v2 ? 'flex-end' : 'flex-start',
                    gap: v2 ? 10 : 8, transition: 'bottom 0.3s cubic-bezier(0.4,0,0.2,1)' }}>
        <button
          style={{ ...styles.mapIconBtn, ...(v2 ? styles.mapRoundV2 : {}),
                   ...(showRoute ? (v2 ? styles.mapRoundV2On : styles.mapTopBtnOn) : {}) }}
          onClick={e => { e.stopPropagation(); onToggleRoute?.(); }}>
          <svg xmlns="http://www.w3.org/2000/svg" height={v2 ? 20 : 18} width={v2 ? 20 : 18} viewBox="0 -960 960 960" fill="currentColor" style={{ transform: 'rotate(90deg)' }}>
            <path d="M247-167q-47-47-47-113v-327q-35-13-57.5-43.5T120-720q0-50 35-85t85-35q50 0 85 35t35 85q0 39-22.5 69.5T280-607v327q0 33 23.5 56.5T360-200q33 0 56.5-23.5T440-280v-400q0-66 47-113t113-47q66 0 113 47t47 113v327q35 13 57.5 43.5T840-240q0 50-35 85t-85 35q-50 0-85-35t-35-85q0-39 22.5-70t57.5-43v-327q0-33-23.5-56.5T600-760q-33 0-56.5 23.5T520-680v400q0 66-47 113t-113 47q-66 0-113-47Z"/>
          </svg>
        </button>
        <div style={{ ...styles.floorPill, ...(v2 ? styles.floorPillV2 : {}) }}>
          {floors.slice().reverse().map(f => (
            <button key={f}
                    style={{ ...styles.floorPillItem, ...(v2 ? styles.floorPillItemV2 : {}),
                             ...(f === floor ? (v2 ? styles.floorPillItemV2On : styles.floorPillItemOn) : {}) }}
                    onClick={() => setFloor(f)}>
              {orsayFloorMaps[f].label}
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
