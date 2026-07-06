import { useState, useRef, useEffect, useMemo } from 'react';
import { decodeWKBPoint } from '../utils/geo';
import { styles, ORANGE } from './PlayerV2.styles';

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

function MapView({ artworks, currentIndex, playingIndex, snap, showRoute, pinActive, onPinClick, onMapClick, onRegisterMyLocation, onRegisterGoTour, onRegisterCenterPin }) {
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
  const mapTouchCleanupRef = useRef(null);

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
    onRegisterCenterPin?.(() => {
      const map = mapRef.current;
      const s = seqRef.current;
      if (!map || !s) return;
      const coord = s[currentIndexRef.current];
      if (coord) { map.panTo({ lat: coord.lat, lng: coord.lon }); }
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

      // 핀치 확대/축소 제스처 시작 시 활성 pin 비활성화 (오르세 지도와 동일)
      const onMapTouchStart = (e) => {
        if (e.touches.length === 2) onMapClickRef.current?.();
      };
      elRef.current.addEventListener('touchstart', onMapTouchStart, { passive: true });
      mapTouchCleanupRef.current = () => elRef.current?.removeEventListener('touchstart', onMapTouchStart);

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
      mapTouchCleanupRef.current?.();
      mapTouchCleanupRef.current = null;
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
    const playIdx = playingIndex ?? -1;
    markersRef.current.forEach(({ m, i }) => {
      const isPlaying = i === playIdx;
      m.setLabel(isPlaying || !showRoute ? null : { text: String(i + 1), color: '#fff', fontSize: '11px', fontWeight: '700' });
    });
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


export { ArtImage, Controls, MapView };
