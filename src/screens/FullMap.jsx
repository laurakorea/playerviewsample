import { useEffect, useRef, useMemo, useState } from 'react';
import { decodeWKBPoint } from '../utils/geo';
import { loadGoogleMaps, MAP_STYLES } from '../utils/googleMaps';

// 실내 도면(SVG/이미지) 위에 출발(회색)·도착(주황) 핀을 그린다. 핀 좌표는 도면 기준 %.
// 확대/축소: 두 손가락 핀치, 마우스 휠, +/- 버튼. 확대 상태에서는 드래그로 이동.
const MAX_ZOOM = 5;

export function PlanMap({ src, from, to, others = [] }) {
  const [dim, setDim] = useState(null);
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const svgRef = useRef(null);
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  useEffect(() => {
    setDim(null);
    setView({ s: 1, x: 0, y: 0 });
    const img = new Image();
    img.onload = () => setDim({ w: img.naturalWidth || 1000, h: img.naturalHeight || 1000 });
    img.src = src;
  }, [src]);
  if (!dim) return <div style={styles.mapBox} />;
  const { w, h } = dim;

  const clamp = (v) => ({
    s: v.s,
    x: Math.min(Math.max(v.x, 0), w - w / v.s),
    y: Math.min(Math.max(v.y, 0), h - h / v.s),
  });
  // 화면 px → 도면 좌표 (preserveAspectRatio=meet 로 가운데 정렬된 콘텐츠 기준)
  const metrics = (v) => {
    const rect = svgRef.current.getBoundingClientRect();
    const k = Math.max(w / v.s / rect.width, h / v.s / rect.height);       // 도면 단위 / px
    return { rect, k, ox: (rect.width - w / v.s / k) / 2, oy: (rect.height - h / v.s / k) / 2 };
  };
  const zoomAt = (clientX, clientY, factor) => setView((v) => {
    const s = Math.min(MAX_ZOOM, Math.max(1, v.s * factor));
    if (s === v.s) return v;
    const { rect, k, ox, oy } = metrics(v);
    const px = v.x + (clientX - rect.left - ox) * k;
    const py = v.y + (clientY - rect.top - oy) * k;
    return clamp({ s, x: px - (px - v.x) * (v.s / s), y: py - (py - v.y) * (v.s / s) });
  });
  const zoomCenter = (factor) => {
    const rect = svgRef.current.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  };

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [p, q] = [...pointers.current.values()];
      pinch.current = Math.hypot(p.x - q.x, p.y - q.y);
    }
  };
  const onPointerMove = (e) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [p, q] = [...pointers.current.values()];
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      zoomAt((p.x + q.x) / 2, (p.y + q.y) / 2, d / pinch.current);
      pinch.current = d;
    } else if (pointers.current.size === 1) {
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      setView((v) => {
        const { k } = metrics(v);
        return clamp({ ...v, x: v.x - dx * k, y: v.y - dy * k });
      });
    }
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    pinch.current = null;
  };

  const baseR = Math.max(w, h) * 0.018;
  const at = (p) => ({ x: (p.x / 100) * w, y: (p.y / 100) * h });
  const a = from && at(from);
  const b = to && at(to);
  // 두 핀이 가까우면 핀을 줄여서 사이에 방향 화살표가 들어갈 자리를 만든다
  const r = a && b ? Math.max(baseR * 0.55, Math.min(baseR, Math.hypot(b.x - a.x, b.y - a.y) / 6.5)) : baseR;
  let arrow = null;
  if (a && b) {
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (len > r * 3.6) {                                     // 두 핀 사이 빈 구간 중앙에 화살표
      const ux = dx / len, uy = dy / len;
      const mx = a.x + dx / 2, my = a.y + dy / 2;
      const px = -uy * r * 0.75, py = ux * r * 0.75;
      arrow = `${mx + ux * r * 0.7},${my + uy * r * 0.7} ${mx - ux * r * 0.7 + px},${my - uy * r * 0.7 + py} ${mx - ux * r * 0.7 - px},${my - uy * r * 0.7 - py}`;
    }
  }
  return (
    <div style={styles.mapBox}>
      <svg ref={svgRef} style={{ ...styles.mapBox, touchAction: 'none' }}
        viewBox={`${view.x} ${view.y} ${w / view.s} ${h / view.s}`} preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onWheel={(e) => zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.25 : 0.8)}>
        <image href={src} width={w} height={h} />
        {others.map((o, i) => <circle key={i} cx={at(o).x} cy={at(o).y} r={r * 0.7} fill="#4F6FE8" stroke="#fff" strokeWidth={r * 0.25} />)}
        {a && b && (
          <>
            {/* 출발 → 도착 방향으로 흐르는 점선 + 방향 화살표 */}
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#4F6FE8" strokeWidth={r * 0.35} strokeDasharray={`${r} ${r * 0.7}`}>
              <animate attributeName="stroke-dashoffset" from={r * 1.7} to="0" dur="1s" repeatCount="indefinite" />
            </line>
            {arrow && <polygon points={arrow} fill="#4F6FE8" />}
          </>
        )}
        {a && <circle cx={a.x} cy={a.y} r={r} fill="#9CA3AF" stroke="#fff" strokeWidth={r * 0.3} />}
        {b && <circle cx={b.x} cy={b.y} r={r * 1.3} fill="#FF730D" stroke="#fff" strokeWidth={r * 0.35} />}
      </svg>
      <div style={styles.zoomBtns}>
        <button style={styles.zoomBtn} onClick={() => zoomCenter(1.5)} aria-label="확대">+</button>
        <button style={styles.zoomBtn} onClick={() => zoomCenter(1 / 1.5)} aria-label="축소">−</button>
      </div>
    </div>
  );
}

// 전체 보기용 구글지도: 좌표 있는 모든 장소 + 출발(회색)/도착(주황) 강조
function GpsFullMap({ places, from, to }) {
  const ref = useRef(null);
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then(() => {
      if (cancelled || !ref.current || !places.length) return;
      const { maps } = window.google;
      const map = new maps.Map(ref.current, { disableDefaultUI: true, zoomControl: true, styles: MAP_STYLES });
      const bounds = new maps.LatLngBounds();
      places.forEach(p => {
        const color = p === to ? '#FF730D' : p === from ? '#9CA3AF' : '#4F6FE8';
        new maps.Marker({
          map, position: p, title: p.title,
          icon: { path: maps.SymbolPath.CIRCLE, scale: p === to ? 10 : 7, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
        });
        bounds.extend(p);
      });
      map.fitBounds(bounds, 40);
    });
    return () => { cancelled = true; };
  }, [places, from, to]);
  return <div ref={ref} style={styles.mapBox} />;
}

// 전체 지도 오버레이 (보기 전용). 층이 여러 개면 상단 탭으로 전환.
export function FullMap({ artworks, current, next, plan, onClose }) {
  const floors = plan ? Object.keys(plan.floorMaps) : ['1'];
  const [floor, setFloor] = useState(String(next?.floor ?? current?.floor ?? floors[0]));
  const places = useMemo(() => {
    const seen = new Set();
    return artworks.filter(a => (plan ? a.floor != null : true) && String(a.floor ?? 1) === floor).filter(a => {
      const k = a.room ?? a.id;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [artworks, floor, plan]);
  const same = (a, b) => a && b && (a.room ?? a.id) === (b.room ?? b.id) && a.floor === b.floor;
  const fm = plan?.floorMaps[floor];
  let body;
  if (fm?.kind === 'image') {
    const pin = (a) => plan.roomPins[floor]?.[a.room];
    const others = places.filter(a => !same(a, current) && !same(a, next)).map(pin).filter(Boolean);
    const from = places.some(a => same(a, current)) ? pin(current) : null;
    const to = places.some(a => same(a, next)) ? pin(next) : null;
    body = <PlanMap src={fm.src} from={from} to={to} others={others} />;
  } else {
    const pts = places.map(a => ({ a, c: decodeWKBPoint(a.wkb) })).filter(x => x.c).map(x => ({ lat: x.c.lat, lng: x.c.lon, title: x.a.title, a: x.a }));
    const from = pts.find(p => same(p.a, current));
    const to = pts.find(p => same(p.a, next));
    body = <GpsFullMap key={floor} places={pts} from={from} to={to} />;
  }
  return (
    <div style={styles.back}>
      <div style={styles.header}>
        <button style={styles.iconBtn} onClick={onClose} aria-label="닫기">✕</button>
        <div style={styles.title}>전체 지도</div>
        <div style={{ width: 44, flex: 'none' }} />
      </div>
      {floors.length > 1 && (
        <div style={styles.tabs}>
          {floors.map(f => (
            <button key={f} style={{ ...styles.tab, ...(f === floor ? styles.tabActive : null) }} onClick={() => setFloor(f)}>
              {plan.floorMaps[f].label}
            </button>
          ))}
        </div>
      )}
      <div style={styles.mapWrap}>{body}</div>
      <div style={styles.legend}>
        <span style={styles.legendItem}><i style={{ ...styles.dot, width: 10, height: 10, background: '#9CA3AF' }} />지금 위치</span>
        <span style={styles.legendItem}><i style={{ ...styles.dot, width: 12, height: 12, background: '#FF730D' }} />다음 장소</span>
        <span style={styles.legendItem}><i style={{ ...styles.dot, width: 8, height: 8, background: '#4F6FE8' }} />다른 장소</span>
      </div>
    </div>
  );
}

const styles = {
  zoomBtns: { position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.2)', overflow: 'hidden' },
  zoomBtn: { width: 40, height: 40, fontSize: 22, fontWeight: 500, color: '#1A1A2E', background: 'none' },
  mapBox: { position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#F1F3F6' },
  back: { position: 'absolute', inset: 0, zIndex: 20, background: '#fff', display: 'flex', flexDirection: 'column' },
  header: { height: 64, flex: 'none', display: 'flex', alignItems: 'center', padding: '0 8px', gap: 4 },
  iconBtn: { width: 44, height: 44, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#1A1A2E', background: 'none' },
  title: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: 17, fontWeight: 700, color: '#1A1A2E' },
  tabs: { flex: 'none', display: 'flex', gap: 8, padding: '4px 16px 12px', overflowX: 'auto' },
  tab: { flex: 'none', height: 36, padding: '0 14px', borderRadius: 999, background: '#F2F4F7', color: '#666', fontSize: 14, fontWeight: 600 },
  tabActive: { background: '#4F6FE8', color: '#fff', fontWeight: 700 },
  mapWrap: { flex: '1 1 auto', minHeight: 0, position: 'relative', background: '#F1F3F6', overflow: 'hidden' },
  legend: { flex: 'none', borderTop: '1px solid #F0F0F0', padding: '16px 20px 28px', display: 'flex', justifyContent: 'center', gap: 20, fontSize: 13, color: '#666' },
  legendItem: { display: 'flex', alignItems: 'center', gap: 6 },
  dot: { display: 'inline-block', borderRadius: '50%' },
};
