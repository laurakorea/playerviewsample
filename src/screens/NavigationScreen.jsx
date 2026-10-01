import { useEffect, useRef, useMemo, useState } from 'react';
import { decodeWKBPoint, distanceMeters, formatDistance } from '../utils/geo';

import { loadGoogleMaps, MAP_STYLES } from '../utils/googleMaps';
import { FullMap, PlanMap } from './FullMap';

// 길 안내 영상: 지도 오른쪽 아래 작은 창. 탭하면 지도 위에서 크게 커지며 재생, 축소 버튼으로 다시 작아진다.
function GuideVideo({ src }) {
  const ref = useRef(null);
  const [big, setBig] = useState(false);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (big) v.play().catch(() => {}); else v.pause();
  }, [big]);
  return (
    <div style={big ? styles.videoBig : styles.videoPip} onClick={big ? undefined : () => setBig(true)}>
      <video ref={ref} src={`${src}#t=0.1`} style={styles.videoEl} playsInline preload="metadata" controls={big} />
      {big
        ? <button style={styles.videoShrink} onClick={() => setBig(false)} aria-label="영상 작게">✕ 작게</button>
        : <span style={styles.videoPipLabel}>▶ 길 영상</span>}
    </div>
  );
}

export default function NavigationScreen({ currentArtwork, nextArtwork, artworks = [], plan, onArrived, onCantFind, onBack, onHome }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const currMarkerRef = useRef(null);
  const dirRendererRef = useRef(null);
  const [locating, setLocating] = useState(false);
  const [distDisplay, setDistDisplay] = useState(null);
  const [fullMapOpen, setFullMapOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);

  const currentCoord = useMemo(() => decodeWKBPoint(currentArtwork?.wkb), [currentArtwork?.wkb]);
  const nextCoord    = useMemo(() => decodeWKBPoint(nextArtwork?.wkb),    [nextArtwork?.wkb]);

  const distM = (currentCoord && nextCoord) ? distanceMeters(currentCoord, nextCoord) : null;

  useEffect(() => {
    if (!nextCoord) return;
    let cancelled = false;

    loadGoogleMaps().then(() => {
      if (cancelled) return;
      if (!mapRef.current) {
        requestAnimationFrame(() => {
          if (!cancelled && mapRef.current) initMap();
        });
        return;
      }
      initMap();
    });

    function initMap() {
      if (cancelled || !mapRef.current) return;
      const google = window.google;

      const nextLatLng = { lat: nextCoord.lat, lng: nextCoord.lon };

      const map = new google.maps.Map(mapRef.current, {
        center: nextLatLng,
        zoom: 17,
        mapTypeId: 'roadmap',
        disableDefaultUI: true,
        zoomControl: true,
        zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER },
        styles: MAP_STYLES,
      });
      mapInstanceRef.current = map;

      // 다음 장소 마커 (주황색)
      new google.maps.Marker({
        position: nextLatLng,
        map,
        title: nextArtwork?.title,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 11,
          fillColor: '#F97316',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2.5,
        },
      });

      const renderer = new google.maps.DirectionsRenderer({
        map,
        suppressMarkers: true,
        polylineOptions: {
          strokeColor: '#4F6FE8',
          strokeWeight: 4,
          strokeOpacity: 0.85,
        },
      });
      dirRendererRef.current = renderer;

      // 이전 장소 → 다음 장소 경로 연결
      if (currentCoord) {
        const prevLatLng = { lat: currentCoord.lat, lng: currentCoord.lon };
        new google.maps.Marker({
          position: prevLatLng,
          map,
          title: currentArtwork?.title,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 9,
            fillColor: '#94A3B8',
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2.5,
          },
        });
        requestRoute(google, map, renderer, prevLatLng, nextLatLng, () => cancelled);
        const bounds = new google.maps.LatLngBounds();
        bounds.extend(prevLatLng);
        bounds.extend(nextLatLng);
        map.fitBounds(bounds, { top: 70, bottom: 70, left: 50, right: 50 });
      }

      // 현재 위치 마커 (경로는 변경하지 않고 표시만)
      if (navigator.geolocation) {
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (cancelled) return;
            setLocating(false);
            const myLatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            currMarkerRef.current = new google.maps.Marker({
              position: myLatLng,
              map,
              title: '현재 위치',
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillColor: '#4F6FE8',
                fillOpacity: 1,
                strokeColor: '#fff',
                strokeWeight: 2.5,
              },
            });
            // 이전 좌표가 없을 때(첫 코스)만 내 위치로 이동
            if (!currentCoord) map.panTo(myLatLng);
          },
          () => {
            if (cancelled) return;
            setLocating(false);
          },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      }
    }

    return () => {
      cancelled = true;
      mapInstanceRef.current = null;
      currMarkerRef.current = null;
      dirRendererRef.current = null;
    };
  }, [currentArtwork?.id, nextArtwork?.id]);

  function requestRoute(google, map, renderer, origin, destination, isCancelled) {
    const svc = new google.maps.DirectionsService();
    svc.route(
      { origin, destination, travelMode: google.maps.TravelMode.WALKING },
      (result, status) => {
        if (isCancelled()) return;
        if (status === 'OK') {
          renderer.setDirections(result);
        } else {
          new google.maps.Polyline({
            path: [origin, destination],
            map,
            strokeColor: '#4F6FE8',
            strokeWeight: 3,
            strokeOpacity: 0.8,
            icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '12px' }],
          });
        }
      }
    );
  }

  function handleLocate() {
    if (!navigator.geolocation) {
      alert('이 기기에서 위치 서비스를 지원하지 않습니다.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const google = window.google;
        const map = mapInstanceRef.current;
        if (!google || !map || !nextCoord) return;

        const myLatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };

        // 현재 위치 마커 업데이트
        if (currMarkerRef.current) {
          currMarkerRef.current.setPosition(myLatLng);
        } else {
          currMarkerRef.current = new google.maps.Marker({
            position: myLatLng,
            map,
            title: '현재 위치',
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: '#4F6FE8',
              fillOpacity: 1,
              strokeColor: '#fff',
              strokeWeight: 2.5,
            },
          });
        }

        // 거리 업데이트
        const d = distanceMeters(
          { lat: pos.coords.latitude, lon: pos.coords.longitude },
          { lat: nextCoord.lat, lon: nextCoord.lon }
        );
        setDistDisplay(formatDistance(d));

        // 이전→다음 경로는 유지하고, 내 위치로만 이동
        map.panTo(myLatLng);
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          alert('위치 권한을 허용해 주세요.');
        } else {
          alert('위치를 가져오지 못했습니다. 다시 시도해 주세요.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // 실내(도면) 목적지: 같은 도면에 출발 핀이 있으면 함께 표시
  const planFloor = plan && nextArtwork?.floor ? plan.floorMaps[nextArtwork.floor] : null;
  const planTo = planFloor?.kind === 'image' ? plan.roomPins[nextArtwork.floor]?.[nextArtwork.room] : null;
  const planFrom = planTo && currentArtwork?.floor === nextArtwork.floor ? plan.roomPins[currentArtwork.floor]?.[currentArtwork.room] : null;

  const displayDist = distDisplay ?? (distM ? formatDistance(distM) : null);

  const isIndoor = !!planTo;
  const move = currentArtwork?.moveTrack;
  // 길 안내 영상: 이동 트랙 영상이 있으면 그것, 없으면 도착할 장소 트랙의 영상
  const guide = move?.videoSrc ? move : nextArtwork?.videoSrc ? nextArtwork : null;
  const [mm, ss] = (move?.duration ?? '').split(':').slice(1).map(Number);
  const moveSecs = move?.duration ? (mm || 0) * 60 + (ss || 0) : 0;
  const moveSpoken = moveSecs >= 60 ? `약 ${Math.round(moveSecs / 60)}분` : moveSecs > 0 ? `약 ${moveSecs}초` : '';
  const headerSub = moveSpoken || (isIndoor ? '' : displayDist ?? '');

  // 이동 화면은 실내/야외 구분 없이 같은 구조: 주황 헤더 · 지도(+길 영상 작은 창) · 경로 카드 · 도착 버튼
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.iconBtn} onClick={onHome} aria-label="처음으로">✕</button>
        <div style={styles.headerTitle}>{nextArtwork?.title}까지{headerSub ? ` · ${headerSub}` : ''}</div>
        <button style={styles.iconBtn} onClick={() => setFullMapOpen(true)} aria-label="전체 지도">
          <span style={styles.mapIconWrap}>
            <svg width="20" height="20" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M2 4l4.5-2 5 2 4.5-2v12l-4.5 2-5-2L2 16z" /><path d="M6.5 2v12M11.5 4v12" /></svg>
            <span style={styles.mapIconLabel}>지도</span>
          </span>
        </button>
      </div>

      <div style={styles.mapWrap}>
        {isIndoor ? <PlanMap src={planFloor.src} from={planFrom} to={planTo} /> : <div ref={mapRef} style={styles.mapBox} />}
        {guide && <GuideVideo key={guide.videoSrc} src={guide.videoSrc} />}
        {/* 현재 위치 버튼 (도면에서는 숨김) */}
        {!isIndoor && (
          <button style={{ ...styles.locateBtn, opacity: locating ? 0.6 : 1 }} onClick={handleLocate} disabled={locating} title="현재 위치 찾기">
            {locating ? (
              <span style={styles.locateSpinner}>⟳</span>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="3.5" fill="#4F6FE8"/>
                <circle cx="12" cy="12" r="7" stroke="#4F6FE8" strokeWidth="2" fill="none"/>
                <line x1="12" y1="2" x2="12" y2="5" stroke="#4F6FE8" strokeWidth="2" strokeLinecap="round"/>
                <line x1="12" y1="19" x2="12" y2="22" stroke="#4F6FE8" strokeWidth="2" strokeLinecap="round"/>
                <line x1="2" y1="12" x2="5" y2="12" stroke="#4F6FE8" strokeWidth="2" strokeLinecap="round"/>
                <line x1="19" y1="12" x2="22" y2="12" stroke="#4F6FE8" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            )}
          </button>
        )}
      </div>

      <div style={styles.steps}>
        {move && (
          <div style={styles.stepActive}>
            <div style={styles.stepIcon}>🧭</div>
            <div style={styles.stepText}>
              <span style={styles.stepTitle}>{currentArtwork.title} → {nextArtwork?.title}</span>
              {move.description && <span style={styles.stepSub}>{move.description}</span>}
            </div>
          </div>
        )}
        <div style={styles.stepRow}>
          {nextArtwork?.imageSrc ? (
            <button style={styles.destPhoto} onClick={() => setPhotoOpen(true)} aria-label="도착 장소 사진 크게 보기">
              <img src={nextArtwork.imageSrc} alt="" style={styles.destPhotoImg} />
            </button>
          ) : (
            <div style={{ ...styles.stepIcon, background: '#FFE3CF' }}><span style={styles.destDot} /></div>
          )}
          <div style={styles.stepText}>
            <span style={styles.stepRowTitle}>도착 · {nextArtwork?.title}</span>
            <span style={styles.destHint}>이게 보이면 도착이에요{!isIndoor && displayDist ? ` · ${displayDist}` : ''}</span>
          </div>
        </div>
      </div>
      <div style={styles.bottomIndoor}>
        <div style={styles.hintRow}>
          <span style={styles.hint}>도착하면 눌러주세요</span>
          <button style={styles.cantFindLink} onClick={onCantFind}>못 찾겠어요</button>
        </div>
        <div style={styles.actionRow}>
          <button style={styles.prevBtn} onClick={onBack}>‹ 이전</button>
          <button style={styles.arrivedBtn} onClick={onArrived}>도착했어요 · 재생하기 ▶</button>
        </div>
      </div>

      {photoOpen && (
        <div style={styles.photoBack} onClick={() => setPhotoOpen(false)}>
          <img src={nextArtwork.imageSrc} alt={nextArtwork.title} style={styles.photoBig} />
          <div style={styles.photoCap}>{nextArtwork.title} · 이게 보이면 도착이에요</div>
          <button style={styles.photoClose} onClick={() => setPhotoOpen(false)} aria-label="닫기">✕</button>
        </div>
      )}
      {fullMapOpen && <FullMap artworks={artworks} current={currentArtwork} next={nextArtwork} plan={plan} onClose={() => setFullMapOpen(false)} />}
    </div>
  );
}

const styles = {
  container: { position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', background: '#fff' },
  header: { height: 64, flex: 'none', display: 'flex', alignItems: 'center', padding: '0 8px', gap: 4, background: '#FF730D' },
  iconBtn: { width: 44, height: 44, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#1A1A2E', background: 'none' },
  headerTitle: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: 17, fontWeight: 700, color: '#1A1A2E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  mapIconWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 },
  mapIconLabel: { fontSize: 11, fontWeight: 700 },
  videoBig: { position: 'absolute', left: 12, right: 12, bottom: 12, zIndex: 2, aspectRatio: '16 / 9', borderRadius: 12, overflow: 'hidden', background: '#000', border: '2px solid #fff', boxShadow: '0 4px 16px rgba(26,26,46,0.35)' },
  videoShrink: { position: 'absolute', top: 8, right: 8, zIndex: 3, height: 32, padding: '0 12px', borderRadius: 16, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 13, fontWeight: 700 },
  videoEl: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  videoPip: { position: 'absolute', right: 12, bottom: 12, zIndex: 2, width: 120, height: 80, borderRadius: 12, overflow: 'hidden', background: '#111', border: '2px solid #fff', boxShadow: '0 4px 12px rgba(26,26,46,0.25)', cursor: 'pointer' },
  videoPipLabel: { position: 'absolute', left: 6, bottom: 6, fontSize: 12, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.45)', padding: '3px 6px', borderRadius: 6 },
  mapWrap: { flex: 1, minHeight: 180, position: 'relative', background: '#F1F3F6' },
  mapBox: { position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#E8EAF0' },
  locateBtn: {
    position: 'absolute', top: 12, right: 12, width: 44, height: 44, borderRadius: '50%', background: '#fff',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  locateSpinner: { fontSize: 20, color: '#4F6FE8' },
  steps: { flex: 'none', borderTop: '1px solid #F0F0F0', padding: '8px 12px 0', display: 'flex', flexDirection: 'column' },
  stepActive: { minHeight: 64, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 14, background: '#EEF2FF' },
  stepRow: { minHeight: 72, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px' },
  stepIcon: { width: 40, height: 40, flex: 'none', borderRadius: 12, background: '#4F6FE8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 },
  destDot: { width: 14, height: 14, borderRadius: '50%', background: '#FF730D', boxShadow: '0 0 0 3px #fff' },
  stepText: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  stepTitle: { fontSize: 17, fontWeight: 700, color: '#1A1A2E' },
  stepSub: { fontSize: 14, color: '#444', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  stepRowTitle: { fontSize: 16, fontWeight: 600, color: '#1A1A2E' },
  destHint: { fontSize: 13, fontWeight: 600, color: '#C2410C' },
  destPhoto: { width: 56, height: 56, flex: 'none', padding: 0, borderRadius: 12, overflow: 'hidden', background: '#FFE3CF', border: '2px solid #FF730D' },
  destPhotoImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  photoBack: { position: 'absolute', inset: 0, zIndex: 25, background: 'rgba(0,0,0,0.88)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 16 },
  photoBig: { maxWidth: '100%', maxHeight: '75%', objectFit: 'contain', borderRadius: 12 },
  photoCap: { color: '#fff', fontSize: 15, fontWeight: 600, textAlign: 'center' },
  photoClose: { position: 'absolute', top: 12, right: 12, width: 44, height: 44, fontSize: 20, color: '#fff', background: 'none' },
  bottomIndoor: { flex: 'none', padding: '8px 20px 24px', display: 'flex', flexDirection: 'column', gap: 4 },
  hintRow: { height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  hint: { fontSize: 14, color: '#666' },
  cantFindLink: { height: 40, padding: 0, background: 'none', fontSize: 15, fontWeight: 600, color: '#444', textDecoration: 'underline', textUnderlineOffset: 3 },
  actionRow: { display: 'flex', gap: 8 },
  prevBtn: { flex: 'none', width: 88, height: 56, borderRadius: 16, background: '#F2F4F7', color: '#1A1A2E', fontSize: 16, fontWeight: 700 },
  arrivedBtn: { flex: 1, minWidth: 0, height: 56, borderRadius: 16, background: '#4F6FE8', color: '#fff', fontSize: 17, fontWeight: 700 },
};
