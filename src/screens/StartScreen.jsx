import { tourData } from '../data/tourData';

export default function StartScreen({ onStart, onStart2 }) {
  const { artworks } = tourData;
  const totalMin = artworks.reduce((sum, a) => {
    const m = a.duration.match(/(\d+):(\d+):(\d+)/);
    return sum + (m ? parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) : 0);
  }, 0);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.badge}>AUDIO GUIDE</div>
        <h1 style={styles.title}>경복궁</h1>
        <p style={styles.subtitle}>가이드 투어 · 루이</p>
      </div>

      <div style={styles.heroBox}>
        <img
          src={artworks[0].imageSrc}
          alt="경복궁"
          style={styles.heroImg}
          onError={e => { e.target.style.display = 'none'; }}
        />
      </div>

      <div style={styles.infoBox}>
        <div style={styles.infoRow}>
          <span style={styles.infoIcon}>🎬</span>
          <div>
            <div style={styles.infoLabel}>총 작품 수</div>
            <div style={styles.infoValue}>{artworks.length}개</div>
          </div>
        </div>
        <div style={styles.divider} />
        <div style={styles.infoRow}>
          <span style={styles.infoIcon}>⏱️</span>
          <div>
            <div style={styles.infoLabel}>예상 소요</div>
            <div style={styles.infoValue}>약 {Math.ceil(totalMin / 60)}분</div>
          </div>
        </div>
        <div style={styles.divider} />
        <div style={styles.infoRow}>
          <span style={styles.infoIcon}>📍</span>
          <div>
            <div style={styles.infoLabel}>시작 위치</div>
            <div style={styles.infoValue}>광화문 광장</div>
          </div>
        </div>
      </div>

      <div style={styles.routePreview}>
        <div style={styles.routeLabel}>투어 경로</div>
        <div style={styles.routeItems}>
          {artworks.map((a, i) => (
            <div key={a.id} style={styles.routeItem}>
              <div style={styles.routeDot}>{i + 1}</div>
              <div style={styles.routeInfo}>
                <span style={styles.routeName}>{a.title}</span>
                <span style={styles.routeSub}>{a.duration}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button style={styles.startBtn} onClick={onStart}>
        투어 시작하기
      </button>
      <button style={styles.startBtn2} onClick={onStart2}>
        투어 시작하기 2
      </button>
      <p style={styles.hint}>이어폰을 연결하면 더 좋아요 🎧</p>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '40px 24px 40px',
    minHeight: '100vh',
    background: '#fff',
  },
  header: {
    textAlign: 'center',
    marginBottom: 20,
  },
  badge: {
    display: 'inline-block',
    background: '#EEF2FF',
    color: '#4F6FE8',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.5,
    padding: '4px 12px',
    borderRadius: 20,
    marginBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: '#1a1a2e',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: '#888',
  },
  heroBox: {
    width: '100%',
    height: 160,
    borderRadius: 16,
    overflow: 'hidden',
    background: '#EEF2FF',
    marginBottom: 20,
  },
  heroImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  infoBox: {
    width: '100%',
    background: '#F8F9FB',
    borderRadius: 16,
    padding: '6px 16px',
    marginBottom: 22,
    display: 'flex',
    alignItems: 'center',
  },
  infoRow: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 0',
  },
  infoIcon: { fontSize: 20 },
  infoLabel: { fontSize: 11, color: '#999', marginBottom: 2 },
  infoValue: { fontSize: 14, fontWeight: 600, color: '#1a1a2e' },
  divider: { width: 1, height: 32, background: '#E5E7EB' },
  routePreview: {
    width: '100%',
    marginBottom: 28,
  },
  routeLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: '#999',
    marginBottom: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  routeItems: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  routeItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  routeDot: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: '#4F6FE8',
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  routeInfo: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
  },
  routeName: {
    fontSize: 14,
    color: '#333',
  },
  routeSub: {
    fontSize: 12,
    color: '#bbb',
  },
  startBtn: {
    width: '100%',
    padding: '18px',
    borderRadius: 16,
    background: '#4F6FE8',
    color: '#fff',
    fontSize: 17,
    fontWeight: 700,
    boxShadow: '0 4px 16px rgba(79,111,232,0.35)',
    marginBottom: 12,
  },
  startBtn2: {
    width: '100%',
    padding: '18px',
    borderRadius: 16,
    background: '#fff',
    color: '#4F6FE8',
    fontSize: 17,
    fontWeight: 700,
    border: '2px solid #4F6FE8',
    marginBottom: 12,
  },
  hint: {
    fontSize: 13,
    color: '#aaa',
  },
};
