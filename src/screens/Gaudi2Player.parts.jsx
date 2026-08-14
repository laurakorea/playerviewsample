import { useState, useRef, useEffect, useMemo } from 'react';
import { orsayFloorMaps, orsayRoomPins } from '../data/orsayTourData';
import { styles, ORANGE } from './Gaudi2Player.styles';
import { loadGoogleMaps, MAP_STYLES, markerIcon, playingMarkerIcon } from './PlayerV2.parts';

// gaudi2 지도 색상 분리 (복잡도 완화): 트랙 핀=오렌지(메인), 전환 핀=진회색, 경로선=뮤트 슬레이트.
export const SUB_COLOR = '#475569'; // 전환 핀(내부/시작/야외로) — 진회색(slate-600)
const ROUTE_COLOR = '#94A3B8';     // 전체 경로선 (뮤트 그레이)
const SEG_COLOR = '#64748B';       // 현재→다음 구간 하이라이트 (슬레이트 그레이 — 색은 현재 위치(오렌지)에만)

// SUB_MAP/전환 핀 마커: "이름" 라벨(비활성 시) + 원형 안에 흰 아이콘 (트랙 핀과 동일한 원형 형태).
// pinType 'start'=달리는 사람 / 'navigation'=계단 / 그 외(sub)=지도. active=true면 살짝 확대.
function subMapMarkerIcon(g, name, active = false, pinType = 'sub') {
  const label = String(name ?? '');
  const icon = pinType === 'start'
    ? `<g transform="translate(31.5,33.5) scale(0.72)" fill="#ffffff"><path d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z"/></g>`
    : pinType === 'navigation'
    ? `<g transform="translate(31.5,33.5) scale(0.72)" fill="#ffffff"><path d="M3 22 L3 17 L8 17 L8 13 L13 13 L13 9 L18 9 L18 5 L22 5 L22 22 Z"/></g>`
    : `<g transform="translate(31.5,34) scale(0.5)" fill="#ffffff"><path d="M0 6 L11 2 L11 26 L0 30 Z"/><path d="M11 2 L23 6 L23 30 L11 26 Z" fill-opacity="0.55"/><path d="M23 6 L34 2 L34 26 L23 30 Z"/></g>`;
  const circle = `<circle cx="40" cy="42" r="13" fill="${active ? ORANGE : SUB_COLOR}" stroke="#ffffff" stroke-width="2"/>`;
  // 활성: 이름은 InfoWindow 툴팁으로 표시 → 원(핀) 주변만 타이트하게 크롭.
  // 큰 SVG면 구글이 툴팁을 아이콘 상단(원보다 한참 위)에 붙여 핀에서 떠 보임 → 원 중심 앵커의 작은 아이콘으로 해결.
  if (active) {
    const size = 40;
    const svg = `<svg width="${size}" height="${size}" viewBox="24 26 32 32" xmlns="http://www.w3.org/2000/svg">${circle}${icon}</svg>`;
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new g.maps.Size(size, size),
      anchor: new g.maps.Point(20, 20), // 원 중심(뷰박스 24,26 기준 32칸의 중앙)
    };
  }
  // 비활성: 원 위에 이름 라벨 노출(툴팁 없음).
  const w = 80, h = 64;
  const text = `<text x="40" y="16" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="14" font-weight="700" fill="#2A2A2A" stroke="#ffffff" stroke-width="3.5" paint-order="stroke" stroke-linejoin="round">${label}</text>`;
  const svg = `<svg width="${w}" height="${h}" viewBox="0 0 80 64" xmlns="http://www.w3.org/2000/svg">${text}${circle}${icon}</svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new g.maps.Size(w, h),
    anchor: new g.maps.Point(40, 42),
  };
}

export function roomName(room) {
  // 오르세: 숫자 방번호는 "N관", '입구'/'조각홀'은 그대로.
  // 가우디 등 이름 기반 데이터셋은 장소명을 그대로 표시.
  if (room == null) return '';
  return /^\d+$/.test(room) ? `${room}관` : room;
}

export function floorLabel(a, floorMaps = orsayFloorMaps) {
  if (!a.floor) return a.subtitle || '';
  const f = floorMaps[a.floor];
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

// 야외(GPS) 구역용 구글지도 — 장소(stop)당 마커 1개 + 경로. PlayerV2 지도 헬퍼 재사용.
function iwContent(text, color = ORANGE) {
  return `<div style="position:relative;display:inline-block"><div style="font-family:sans-serif;font-size:12px;font-weight:700;color:#fff;background:${color};padding:6px 10px;border-radius:6px;white-space:nowrap">${text}</div><div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid ${color};"></div></div>`;
}

function GpsFloorMap({ stops, currentSeq, playingRoom, showRoute, pinActive, centerTrigger, fitTrigger = 0, onPinClick, onMapClick, locateRef, subMapPins = [], onSubMapActivate, forcedSubActive = null }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const subMapMarkersRef = useRef([]);
  const boundsRef = useRef(null); // 전체 핀을 담는 bounds (지도 열 때 fit용)
  const resizeObsRef = useRef(null);
  const routeRef = useRef(null);
  const segRouteRef = useRef(null); // 현재→다음 핀 오렌지 하이라이트 구간
  const iwRef = useRef(null);
  const userMarkerRef = useRef(null);
  const onPinRef = useRef(onPinClick);
  const onMapClickRef = useRef(onMapClick);
  const onSubMapActivateRef = useRef(onSubMapActivate);
  const subMapPinsRef = useRef(subMapPins);
  // SUB_MAP 핀 활성 상태는 부모(subStop)가 단일 소스. forcedSubActive(=활성 핀 이름)로 내려옴.
  const forcedSubActiveRef = useRef(forcedSubActive);
  useEffect(() => { onPinRef.current = onPinClick; onMapClickRef.current = onMapClick; onSubMapActivateRef.current = onSubMapActivate; subMapPinsRef.current = subMapPins; forcedSubActiveRef.current = forcedSubActive; });

  // 현재(seq) → 다음(seq+1) 핀 구간의 경로 좌표. 둘 다 좌표가 있어야 함.
  const segPathFor = (seq) => {
    const from = stops.find(s => s.seq === seq && s.lat != null);
    const to = stops.find(s => s.seq === seq + 1 && s.lat != null);
    return (from && to) ? [{ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }] : [];
  };
  // 전환 핀(예: "시작") 활성 시: 그 핀 → 목적지 구간. targetPin/targetSeq/target floor 순.
  // 목적지가 이 지도(같은 floor)에 없으면 null → 트랙 구간으로 폴백.
  const activeSubSegPath = () => {
    const name = forcedSubActiveRef.current;
    if (!name) return null;
    const sp = (subMapPinsRef.current || []).find(p => p.name === name);
    if (!sp || sp.lat == null) return null;
    let dest = null;
    if (sp.targetPin) {
      const tp = (subMapPinsRef.current || []).find(p => p.name === sp.targetPin && p.lat != null);
      dest = tp ? { lat: tp.lat, lng: tp.lng } : null;
    } else if (sp.targetSeq != null) {
      const st = stops.find(s => s.seq === sp.targetSeq && s.lat != null); // 시작 → 지점24(seq22)
      dest = st ? { lat: st.lat, lng: st.lng } : null;
    } else {
      const st = stops.find(s => s.floor === sp.target && s.lat != null);
      dest = st ? { lat: st.lat, lng: st.lng } : null;
    }
    return dest ? [{ lat: sp.lat, lng: sp.lng }, dest] : null;
  };
  const computeSegPath = () => activeSubSegPath() ?? segPathFor(currentSeq);

  // GPS(내 위치) 버튼용 함수 등록 — FloorMapView가 locateRef.current() 호출
  useEffect(() => {
    if (!locateRef) return;
    locateRef.current = () => {
      const g = window.google, map = mapRef.current;
      if (!navigator.geolocation || !g || !map) return;
      navigator.geolocation.getCurrentPosition(pos => {
        const latlng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        map.panTo(latlng);
        map.setZoom(16);
        if (userMarkerRef.current) userMarkerRef.current.setMap(null);
        userMarkerRef.current = new g.maps.Marker({
          position: latlng, map, zIndex: 999,
          icon: { path: g.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#4A90E2',
                  fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2.5 },
        });
      }, () => {}, { enableHighAccuracy: true });
    };
    return () => { if (locateRef) locateRef.current = null; };
  }, [locateRef]);

  // stops(=선택 구역) 바뀌면 지도 재생성
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then(() => {
      const tryInit = () => {
        if (cancelled) return;
        if (!elRef.current) { requestAnimationFrame(tryInit); return; }
        init();
      };
      tryInit();
    }).catch(() => {});

    function init() {
      const g = window.google;
      const pts = stops.filter(s => s.lat != null);
      if (!pts.length || !elRef.current) return;
      const map = new g.maps.Map(elRef.current, {
        center: { lat: pts[0].lat, lng: pts[0].lng },
        zoom: 16, disableDefaultUI: true, clickableIcons: false,
        gestureHandling: 'greedy', styles: MAP_STYLES,
      });
      mapRef.current = map;

      // 경로 waypoint: 트랙 stop + 경로에 포함되는 전환 핀을 routeGroup별로 나눠 각각 폴리라인.
      //  - group: 데이터 routeGroup(없으면 'main'). 그룹 순서: routeSeq ?? seq ?? afterSeq+0.5.
      //  - 다른 group끼리는 선이 안 이어짐 → "시작"+"지점24"(restart)는 별도 선, "내부"(main)와 끊김.
      const trackWps = pts.map(s => ({ lat: s.lat, lng: s.lng, group: s.routeGroup ?? 'main', order: s.routeSeq ?? s.seq }));
      const subWps = (subMapPinsRef.current || [])
        .filter(sp => sp.lat != null && sp.lng != null && (sp.afterSeq != null || sp.routeGroup != null))
        .map(sp => ({ lat: sp.lat, lng: sp.lng, group: sp.routeGroup ?? 'main', order: sp.routeSeq ?? (sp.afterSeq != null ? sp.afterSeq + 0.5 : 1e9) }));
      const allWps = [...trackWps, ...subWps];

      const bounds = new g.maps.LatLngBounds();
      allWps.forEach(w => bounds.extend({ lat: w.lat, lng: w.lng }));
      boundsRef.current = allWps.length > 1 ? bounds : null;
      const fitAll = () => {
        if (!boundsRef.current || !mapRef.current) return;
        mapRef.current.fitBounds(boundsRef.current, 48);
        g.maps.event.addListenerOnce(mapRef.current, 'idle', () => {
          if (mapRef.current && mapRef.current.getZoom() > 16) mapRef.current.setZoom(16);
        });
      };
      // 시트 열림 애니메이션으로 컨테이너 크기가 늦게/여러 번 확정되어도 전체 핀에 맞춰 재fit.
      // 사용자가 지도를 직접 드래그하기 전까지만 자동 fit.
      let userMoved = false;
      // 전환으로 진입한 전환 핀(예: 야외로→시작)이 있으면 전체 fit 대신 그 핀에 센터+확대 → 핀 인지가 쉬움.
      const focusSub = (subMapPinsRef.current || []).find(sp => sp.name === forcedSubActiveRef.current && sp.lat != null);
      if (focusSub) {
        map.setCenter({ lat: focusSub.lat, lng: focusSub.lng });
        map.setZoom(17);
        userMoved = true; // 자동 전체-fit 억제
      } else {
        fitAll();
      }
      map.addListener('dragstart', () => { userMoved = true; });
      if (typeof ResizeObserver !== 'undefined' && elRef.current) {
        resizeObsRef.current = new ResizeObserver(() => { if (!userMoved) fitAll(); });
        resizeObsRef.current.observe(elRef.current);
      }

      // routeGroup별로 폴리라인 하나씩 (다른 group끼리는 선 안 이어짐)
      const groups = {};
      allWps.forEach(w => { (groups[w.group] ||= []).push(w); });
      routeRef.current = Object.values(groups).map(wps => {
        wps.sort((a, b) => a.order - b.order);
        if (wps.length < 2) return null;
        return new g.maps.Polyline({
          path: wps.map(w => ({ lat: w.lat, lng: w.lng })), map, strokeOpacity: 0,
          icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.5, strokeColor: ROUTE_COLOR, strokeWeight: 4, scale: 1 }, offset: '0', repeat: '8px' }],
          visible: showRoute,
        });
      }).filter(Boolean);
      // 현재→다음 핀 구간: 파스텔 오렌지 실선 + 흰 화살표 (이미지 도면의 seg와 동일 색·개념)
      segRouteRef.current = new g.maps.Polyline({
        path: computeSegPath(), map, strokeColor: SEG_COLOR, strokeOpacity: 1, strokeWeight: 8, zIndex: 2,
        icons: [{ icon: { path: g.maps.SymbolPath.FORWARD_OPEN_ARROW, strokeOpacity: 1, strokeColor: '#fff', fillOpacity: 0, scale: 1 }, offset: '50%', repeat: '24px' }],
        visible: showRoute,
      });
      iwRef.current = new g.maps.InfoWindow({ disableAutoPan: true, pixelOffset: new g.maps.Size(0, -8) });
      // 빈 지도 클릭 → SUB_MAP 활성 해제(부모에 통지) + 시트 닫기
      map.addListener('click', () => { iwRef.current?.close(); onSubMapActivateRef.current?.(null); onMapClickRef.current?.(); });

      markersRef.current = pts.map(s => {
        const state = s.seq === currentSeq ? 'active' : s.seq < currentSeq ? 'visited' : 'upcoming';
        const isPlaying = s.room === playingRoom;
        const m = new g.maps.Marker({
          position: { lat: s.lat, lng: s.lng }, map,
          zIndex: s.seq === currentSeq ? 99 : isPlaying ? 98 : s.seq,
          icon: isPlaying ? playingMarkerIcon(g) : markerIcon(g, state),
          label: isPlaying ? null : { text: String(s.pinNo ?? s.seq), color: '#fff', fontSize: '11px', fontWeight: '700' },
        });
        m.addListener('click', () => {
          iwRef.current.setContent(iwContent(s.room));
          iwRef.current.open({ map, anchor: m });
          onPinRef.current?.(s.idxs[0]);
        });
        return { m, room: s.room, seq: s.seq, pinNo: s.pinNo };
      });

      // SUB_MAP 핀: 하위 지도 진입 마커 (라벨 + 오렌지 지도 아이콘)
      // 클릭 → 부모에 활성 통지(subStop). 활성되면 forcedSubActive로 다시 내려와 강조+툴팁,
      // 실제 진입은 하단 "실내 입장" 카드로 수행(툴팁은 라벨 역할만).
      subMapMarkersRef.current = (subMapPinsRef.current || [])
        .filter(sp => sp.lat != null && sp.lng != null)
        .map(sp => {
          const on = forcedSubActiveRef.current === sp.name;
          const m = new g.maps.Marker({
            position: { lat: sp.lat, lng: sp.lng }, map,
            zIndex: on ? 100 : 51,
            icon: subMapMarkerIcon(g, sp.name, on, sp.pinType), title: sp.name,
          });
          m.addListener('click', () => { onSubMapActivateRef.current?.(sp.name); });
          return { m, pin: sp };
        });

      // 재마운트 시 이미 활성(subStop) 상태면 툴팁 즉시 표시 (실내→내부 역방향 대응)
      const activeEntry = subMapMarkersRef.current.find(e => e.pin.name === forcedSubActiveRef.current);
      if (activeEntry) {
        if (activeEntry.pin.pinType !== 'start') { // restart(출구)는 툴팁 숨김 — 필 버튼이 목적지를 안내
          iwRef.current.setContent(iwContent(activeEntry.pin.name, ORANGE));
          iwRef.current.open({ map, anchor: activeEntry.m });
        }
        const p = activeEntry.m.getPosition();
        if (p) map.panTo(p);
      }
    }
    return () => {
      cancelled = true;
      markersRef.current.forEach(({ m }) => m.setMap(null));
      markersRef.current = [];
      subMapMarkersRef.current.forEach(({ m }) => m.setMap(null));
      subMapMarkersRef.current = [];
      routeRef.current?.forEach(pl => pl.setMap(null));
      routeRef.current = null;
      segRouteRef.current?.setMap(null);
      segRouteRef.current = null;
      resizeObsRef.current?.disconnect();
      resizeObsRef.current = null;
      if (userMarkerRef.current) { userMarkerRef.current.setMap(null); userMarkerRef.current = null; }
      mapRef.current = null;
    };
  }, [stops]);

  // 현재/재생 상태 변화 → 마커 스타일 갱신
  useEffect(() => {
    const g = window.google, map = mapRef.current;
    if (!g || !map) return;
    markersRef.current.forEach(({ m, room, seq, pinNo }) => {
      const state = seq === currentSeq ? 'active' : seq < currentSeq ? 'visited' : 'upcoming';
      const isPlaying = room === playingRoom;
      m.setIcon(isPlaying ? playingMarkerIcon(g) : markerIcon(g, state));
      m.setLabel(isPlaying || !showRoute ? null : { text: String(pinNo ?? seq), color: '#fff', fontSize: '11px', fontWeight: '700' });
      m.setZIndex(seq === currentSeq ? 99 : isPlaying ? 98 : seq);
    });
    segRouteRef.current?.setPath(computeSegPath()); // 현재→다음 구간 갱신
  }, [currentSeq, playingRoom, showRoute]);

  useEffect(() => {
    routeRef.current?.forEach(pl => pl.setVisible(showRoute));
    segRouteRef.current?.setVisible(showRoute);
  }, [showRoute]);

  // 부모(subStop)가 SUB_MAP 활성 상태를 제어 → 마커 강조/툴팁("이름")/센터 동기화.
  // 툴팁은 라벨 역할만(트랙 핀과 동일). 실제 진입은 하단 "실내 입장" 카드가 담당.
  useEffect(() => {
    const g = window.google, map = mapRef.current, iw = iwRef.current;
    if (!g || !map) return;
    subMapMarkersRef.current.forEach(({ m, pin }) => {
      const on = forcedSubActive === pin.name;
      m.setIcon(subMapMarkerIcon(g, pin.name, on, pin.pinType));
      m.setZIndex(on ? 100 : 51);
    });
    segRouteRef.current?.setPath(computeSegPath()); // 전환 핀 활성/해제 시 구간 경로 갱신 (시작 → 지점24 등)
    if (!iw) return;
    const entry = subMapMarkersRef.current.find(e => e.pin.name === forcedSubActive);
    if (entry) {
      if (entry.pin.pinType === 'start') iw.close(); // restart(출구)는 툴팁 숨김 — 필 버튼이 목적지를 안내
      else { iw.setContent(iwContent(entry.pin.name, ORANGE)); iw.open({ map, anchor: entry.m }); }
      const pos = entry.m.getPosition();
      if (pos) map.panTo(pos);
    } else {
      iw.close();
    }
  }, [forcedSubActive]);

  // 활성 핀 툴팁 (SUB_MAP이 활성 중이면 트랙 툴팁으로 덮어쓰지 않음)
  useEffect(() => {
    const iw = iwRef.current, map = mapRef.current;
    if (!iw || !map) return;
    if (forcedSubActiveRef.current) return;
    if (!pinActive) { iw.close(); return; }
    const entry = markersRef.current.find(e => e.seq === currentSeq);
    if (entry) { iw.setContent(iwContent(entry.room)); iw.open({ map, anchor: entry.m }); }
  }, [pinActive, currentSeq]);

  // 지도 열 때: 전체 핀이 한 화면에 보이도록 fit (시트가 열려 컨테이너 크기가 확정된 뒤 재적용).
  useEffect(() => {
    if (!fitTrigger) return;
    if (forcedSubActiveRef.current) return; // 전환 핀 포커스 중엔 전체 fit로 덮어쓰지 않음 (예: 시작 핀 확대 유지)
    const map = mapRef.current, b = boundsRef.current, g = window.google;
    if (!map || !b) return;
    map.fitBounds(b, 48);
    // 핀이 몇 개 안 되는 구역에서 너무 확대되지 않도록 상한
    if (g) g.maps.event.addListenerOnce(map, 'idle', () => { if (map.getZoom() > 16) map.setZoom(16); });
  }, [fitTrigger]);

  // 트랙 이동 시 현재 핀으로 센터 (줌 유지)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const cur = stops.find(s => s.seq === currentSeq);
    if (cur && cur.lat != null) map.panTo({ lat: cur.lat, lng: cur.lng });
  }, [centerTrigger, currentSeq]);

  return <div ref={elRef} style={{ position: 'absolute', inset: 0 }} />;
}

// 층별 이미지 도면(실내) 또는 구글지도(야외) + 순서 핀 + 경로선
export function FloorMapView({ artworks, currentIndex, playingIndex, roomStops, showRoute, pinActive, centerTrigger, fitTrigger = 0, stripActive, onPinClick, onMapClick, onToggleRoute, trackCard, v2, floorMaps = orsayFloorMaps, roomPins: roomPinsProp = orsayRoomPins, subMapPins, forcedSubActive = null, onSubMapActivate, topRight }) {
  const current = artworks[currentIndex];
  const playing = artworks[playingIndex];
  const [floor, setFloor] = useState(current.floor || 1);
  const [imgErr, setImgErr] = useState(false);
  const [nameOpen, setNameOpen] = useState(false); // 지도 이름 드롭다운
  const chipsRef = useRef(null);
  const locateFnRef = useRef(null); // GPS(내 위치) — GpsFloorMap이 등록

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

  // 지도보기 클릭(열 때=fitTrigger, 이동=centerTrigger) 시 현재 핀 위치로 중앙 이동 + 확대 (이미지 도면)
  useEffect(() => {
    if (!centerTrigger && !fitTrigger) return;
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
  }, [centerTrigger, fitTrigger]);

  // 현재 작품 층으로 자동 전환
  useEffect(() => { if (current.floor) setFloor(current.floor); }, [current.floor]);
  useEffect(() => { setImgErr(false); }, [floor]);

  const floors = useMemo(() => Object.keys(floorMaps).map(Number), [floorMaps]);
  const map = floorMaps[floor];
  const pins = useMemo(() => roomPinsProp[floor] || {}, [roomPinsProp, floor]);
  // 야외(GPS) 구역: 도면 이미지 대신 구글지도. floorMaps[floor].kind === 'gps'
  const isGps = !!map && (map.kind === 'gps' || !map.src);
  // 이 floor(지도) 위에 표시할 SUB_MAP 핀들
  const floorSubMaps = useMemo(() => subMapPins?.[floor] || [], [subMapPins, floor]);

  // SUB_MAP 핀이 활성(subStop)되면, 그 핀이 얹힌 홈 층(GPS)으로 지도를 강제 전환.
  // 실내(floor 2)에서 "이전 장소=내부"로 돌아올 때 GPS 지도로 되돌아가 핀을 보이게 함.
  useEffect(() => {
    if (!forcedSubActive || !subMapPins) return;
    const homeFloor = Object.keys(subMapPins).find(f => (subMapPins[f] || []).some(p => p.name === forcedSubActive));
    if (homeFloor != null) setFloor(Number(homeFloor));
  }, [forcedSubActive, subMapPins]);
  const gpsStops = useMemo(() => {
    if (!isGps) return [];
    return roomStops
      .filter(s => s.floor === floor)
      .map(s => { const a = artworks[s.idxs[0]]; return { ...s, lat: a?.lat ?? null, lng: a?.lng ?? null }; })
      .filter(s => s.lat != null);
  }, [isGps, roomStops, floor, artworks]);

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

  // 활성 핀 → 다음 핀 구간 (하이라이트 실선 + chevron).
  // 다음이 트랙 stop이면 그 핀, 없으면 이 floor의 "다음 순서(afterSeq===currentSeq)" 전환 핀(예: 21 → 야외로).
  const segFrom = floorStops.find(s => s.seq === currentSeq);
  const segToStop = floorStops.find(s => s.seq === currentSeq + 1);
  const segToPos = segToStop
    ? pins[segToStop.room]
    : (floorSubMaps.find(sp => sp.afterSeq === currentSeq && sp.x != null) || null);
  let seg = null;
  if (segFrom && segToPos) {
    const a = pins[segFrom.room], b = segToPos;
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

      {/* 지도 상단바: 좌측=지도 이름 드롭다운, 우측=지도/목차 탭 토글 (시트 색 배경 바) */}
      <div style={styles.mapHeaderBar}>
        <div style={{ position: 'relative' }}>
          <button style={styles.mapNameBtn} onClick={() => setNameOpen(o => !o)}>
            {map?.label ?? `${floor}층`}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
                 style={{ transform: nameOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
              <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {nameOpen && (
            <div style={styles.mapNameMenu}>
              {floors.map(f => (
                <button key={f}
                        style={{ ...styles.mapNameItem, ...(f === floor ? styles.mapNameItemOn : {}) }}
                        onClick={() => { setFloor(f); setNameOpen(false); }}>
                  {floorMaps[f]?.label ?? `${f}층`}
                </button>
              ))}
            </div>
          )}
        </div>
        {topRight && <div style={{ ...styles.sheetTabToggle, pointerEvents: 'auto' }}>{topRight}</div>}
      </div>

      {isGps ? (
        <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', background: '#E3E3E3' }}>
          {gpsStops.length > 0 ? (
            <GpsFloorMap stops={gpsStops} currentSeq={currentSeq} playingRoom={playing?.room}
                         showRoute={showRoute} pinActive={pinActive} centerTrigger={centerTrigger} fitTrigger={fitTrigger}
                         onPinClick={onPinClick} onMapClick={onMapClick} locateRef={locateFnRef}
                         subMapPins={floorSubMaps} onSubMapActivate={onSubMapActivate}
                         forcedSubActive={forcedSubActive} />
          ) : (
            <div style={styles.floorPlaceholder}>
              <div style={styles.floorPhIcon}>📍</div>
              <div style={styles.floorPhTxt}>{map?.label} · 좌표 없음</div>
            </div>
          )}
        </div>
      ) : (
      <div ref={imgBoxRef} style={{ ...styles.floorImgBox, ...(v2 ? styles.floorImgBoxV2 : {}) }}
           onPointerDown={onMapPointerDown} onPointerMove={onMapPointerMove}
           onPointerUp={onMapPointerUp} onPointerCancel={onMapPointerUp}
           onTouchStart={onMapTouchStart} onTouchMove={onMapTouchMove} onTouchEnd={onMapTouchEnd}
           onWheel={onMapWheel}
           onClick={onMapClick}>
        {map && map.src && !imgErr ? (
          <div ref={canvasRef} style={{ ...styles.floorCanvas, transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`, transition: pinchRef.current.pinching || panRef.current.dragging ? 'none' : 'transform 0.2s ease-out' }}>
            <img src={map.src} alt={map.label} style={{ ...styles.floorImg, ...(v2 ? styles.floorImgV2 : {}) }} onError={() => setImgErr(true)} />
            {floorStops.length > 1 && showRoute && (
              <svg style={styles.routeSvg} viewBox="0 0 100 100">
                <defs>
                  <marker id="arrowBlock" markerWidth="2" markerHeight="2" refX="1" refY="1"
                          orient="auto" markerUnits="userSpaceOnUse">
                    <rect x="0" y="0" width="2" height="2" rx="0.2" fill={SEG_COLOR} />
                    <path d="M0.5,0.3 L1.6,1 L0.5,1.7" fill="none" stroke="#fff" strokeWidth="0.5"
                          strokeLinecap="round" strokeLinejoin="round" />
                  </marker>
                </defs>
                {/* 전체 경로: 그레이 선 */}
                {allPts && (
                  <polyline points={allPts} fill="none" stroke="#CBD5E1" strokeWidth="0.5"
                            strokeLinejoin="round" strokeLinecap="round" strokeDasharray="1 1" opacity="0.7" />
                )}
                {/* 활성 → 다음: 파스텔 오렌지 실선 + 블록 화살표 */}
                {seg && (
                  <polyline points={seg} fill="none" stroke={SEG_COLOR} strokeWidth="2"
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
                      ) : showRoute ? (s.pinNo ?? s.seq) : null}
                    </button>
                  </div>
                </div>
              );
            })}
            {/* 지도 전환 핀(SUB_MAP/next): 이미지 도면 위 x/y anchor. 클릭 → 활성(부모 통지). */}
            {floorSubMaps.filter(sp => sp.x != null && sp.y != null).map(sp => {
              const on = forcedSubActive === sp.name;
              return (
                <div key={sp.name} style={{ position: 'absolute', left: `${sp.x}%`, top: `${sp.y}%`, transform: `translate(-50%,-50%) scale(${(on ? 1.15 : 1) / zoom})`, transformOrigin: 'center center', zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {on ? (
                    <div style={styles.pinTooltipWrap}>
                      <div style={{ ...styles.pinTooltip, background: ORANGE }}>{sp.name}</div>
                      <div style={{ ...styles.pinTooltipArrow, borderTopColor: ORANGE }} />
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#2A2A2A', textShadow: '0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff', marginBottom: 2, whiteSpace: 'nowrap' }}>{sp.name}</div>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); onSubMapActivate?.(sp.name); }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onSubMapActivate?.(sp.name); }}
                    style={{ width: 28, height: 28, borderRadius: '50%', background: on ? ORANGE : SUB_COLOR, border: '2px solid #fff', boxShadow: '0 2px 6px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer' }} aria-label={sp.name}>
                    {sp.pinType === 'start' ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="#fff"><path d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z" /></svg>
                    ) : sp.pinType === 'navigation' ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="#fff"><path d="M3 22 L3 17 L8 17 L8 13 L13 13 L13 9 L18 9 L18 5 L22 5 L22 22 Z" /></svg>
                    ) : (
                      <svg width="16" height="14" viewBox="0 0 34 32" fill="#fff"><path d="M0 6 L11 2 L11 26 L0 30 Z" /><path d="M11 2 L23 6 L23 30 L11 26 Z" fillOpacity="0.55" /><path d="M23 6 L34 2 L34 26 L23 30 Z" /></svg>
                    )}
                  </button>
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
      )}

      {/* 하단: 경로 토글 (층 전환은 상단 지도이름 드롭다운으로 이동) */}
      <div style={{ position: 'absolute', zIndex: 6,
                    ...(v2 ? { top: 12, right: 12 } : { left: 10, bottom: stripActive ? 162 : 10 }),
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
        {/* GPS(내 위치) — 구글지도(야외)일 때만 노출, 이미지 도면엔 없음 */}
        {isGps && (
          <button style={styles.mapIconBtn}
                  onClick={e => { e.stopPropagation(); locateFnRef.current?.(); }} aria-label="내 위치">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="3.5" fill="currentColor"/>
              <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2"/>
              <line x1="12" y1="1.5" x2="12" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="12" y1="20" x2="12" y2="22.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="1.5" y1="12" x2="4" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="20" y1="12" x2="22.5" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>

    </div>
  );
}
