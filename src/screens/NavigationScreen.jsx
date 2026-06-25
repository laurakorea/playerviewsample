import { useEffect, useRef, useMemo, useState } from 'react';
import { decodeWKBPoint, distanceMeters, formatDistance } from '../utils/geo';

const MAPS_API_KEY = 'AIzaSyA08FbqWiPl8VfF8aDcP9yhgCCJj6EqU58';

let mapsPromise = null;
function loadGoogleMaps() {
  if (window.google?.maps) return Promise.resolve();
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}`;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return mapsPromise;
}

const MAP_STYLES = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
];

export default function NavigationScreen({ currentArtwork, nextArtwork, onArrived, onCantFind, onBack, onHome }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const currMarkerRef = useRef(null);
  const dirRendererRef = useRef(null);
  const [locating, setLocating] = useState(false);
  const [distDisplay, setDistDisplay] = useState(null);

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

      // 다음 작품 마커 (주황색)
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

      // 자동으로 현재 위치 가져와서 경로 표시
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

            const d = distanceMeters(
              { lat: pos.coords.latitude, lon: pos.coords.longitude },
              { lat: nextCoord.lat, lon: nextCoord.lon }
            );
            setDistDisplay(formatDistance(d));

            requestRoute(google, map, renderer, myLatLng, nextLatLng, () => cancelled);

            const bounds = new google.maps.LatLngBounds();
            bounds.extend(myLatLng);
            bounds.extend(nextLatLng);
            map.fitBounds(bounds, { top: 60, bottom: 60, left: 40, right: 40 });
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
        const nextLatLng = { lat: nextCoord.lat, lng: nextCoord.lon };

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

        // 경로 재계산
        if (dirRendererRef.current) {
          requestRoute(google, map, dirRendererRef.current, myLatLng, nextLatLng, () => false);
        }

        // 두 마커 모두 보이게
        const bounds = new google.maps.LatLngBounds();
        bounds.extend(myLatLng);
        bounds.extend(nextLatLng);
        map.fitBounds(bounds, { top: 60, bottom: 60, left: 40, right: 40 });
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

  const displayDist = distDisplay ?? (distM ? formatDistance(distM) : null);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onBack}>‹</button>
        <span style={styles.headerTitle}>작품으로 이동</span>
        <button style={styles.closeBtn} onClick={onHome}>✕</button>
      </div>

      {/* Google Map */}
      <div style={styles.mapWrap}>
        <div ref={mapRef} style={styles.mapBox} />
        {/* 현재 위치 버튼 */}
        <button
          style={{ ...styles.locateBtn, opacity: locating ? 0.6 : 1 }}
          onClick={handleLocate}
          disabled={locating}
          title="현재 위치 찾기"
        >
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
      </div>

      {/* 하단 카드 */}
      <div style={styles.bottomCard}>
        <div style={styles.arrivalHint}>도착하면 눌러주세요</div>
        <h2 style={styles.destTitle}>{nextArtwork?.title}</h2>
        <p style={styles.destSub}>
          {displayDist ? `${displayDist} 이동` : nextArtwork?.subtitle}
        </p>
        <button style={styles.arrivedBtn} onClick={onArrived}>
          도착했어요 · 재생하기 ▶
        </button>
        <button style={styles.cantFindBtn} onClick={onCantFind}>
          못 찾겠어요
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    background: '#fff',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
    borderBottom: '1px solid #F0F0F0',
    zIndex: 1,
    background: '#fff',
  },
  backBtn: {
    background: 'none',
    fontSize: 28,
    color: '#555',
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#1a1a2e',
  },
  closeBtn: {
    background: 'none',
    fontSize: 18,
    color: '#aaa',
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapWrap: {
    flex: 1,
    position: 'relative',
    minHeight: 320,
  },
  mapBox: {
    position: 'absolute',
    inset: 0,
    background: '#E8EAF0',
  },
  locateBtn: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 12,
    background: '#fff',
    boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    cursor: 'pointer',
    border: 'none',
  },
  locateSpinner: {
    fontSize: 22,
    color: '#4F6FE8',
    display: 'inline-block',
    animation: 'spin 1s linear infinite',
  },
  bottomCard: {
    padding: '22px 24px 40px',
    borderTop: '1px solid #F0F0F0',
    background: '#fff',
  },
  arrivalHint: {
    fontSize: 13,
    color: '#999',
    marginBottom: 6,
  },
  destTitle: {
    fontSize: 24,
    fontWeight: 700,
    color: '#1a1a2e',
    marginBottom: 6,
  },
  destSub: {
    fontSize: 13,
    color: '#888',
    marginBottom: 22,
  },
  arrivedBtn: {
    width: '100%',
    padding: '17px',
    borderRadius: 14,
    background: '#4F6FE8',
    color: '#fff',
    fontSize: 16,
    fontWeight: 700,
    boxShadow: '0 4px 16px rgba(79,111,232,0.3)',
    marginBottom: 12,
  },
  cantFindBtn: {
    width: '100%',
    padding: '14px',
    borderRadius: 14,
    background: '#F8F9FB',
    color: '#888',
    fontSize: 15,
  },
};
