import { useState, useRef, useEffect, useMemo } from 'react';
import { FloorMapView, ArtCarousel, Controls, ArtImage, floorLabel } from './OrsayPlayer';
import { orsayFloorMaps } from '../data/orsayTourData';

// 댓글 목업 데이터 (3개) — 하단 댓글 섹션
const MOCK_COMMENTS = [
  { id: 1, author: '미술관러버', text: '오디오 설명 덕분에 그림이 완전 다르게 보여요! 이 앞에서 한참 머물렀네요. 강추합니다 👍', likes: 42, pinned: true },
  { id: 2, author: '파리여행중', text: '해설이 귀에 쏙쏙 들어와요. 배경 이야기까지 알려줘서 좋았습니다.', likes: 28, best: true },
  { id: 3, author: '제이든', text: '설명이 자세해서 좋았어요. 다음 작품도 기대됩니다 :)', likes: 15 },
];

const floorName = (f) => (f == null ? '기타' : orsayFloorMaps[f]?.label ?? `${f}층`);

// 4차 오르세 투어: 상단(지도/목차 탭) + 하단(작품 1개 플레이어)
export default function OrsayFeed({ artworks, onHome }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [tab, setTab] = useState('map');            // 'map' | 'list'
  const [showRoute, setShowRoute] = useState(true);
  const [likedIds, setLikedIds] = useState(new Set());
  const [scriptOpen, setScriptOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  // 목차 필터
  const [listFilter, setListFilter] = useState('all');   // 'all' | 'best' | 'liked'
  const [floorFilter, setFloorFilter] = useState(null);  // null = 전체
  const [floorMenuOpen, setFloorMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const feedRef = useRef(null);
  const audioRef = useRef(null);
  const pendingPlay = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [prog, setProg] = useState({ elapsed: 0, duration: 0, pct: 0 });

  const art = artworks[currentIndex];
  const hasAudio = !!art.audioSrc;

  const isLiked = (id) => likedIds.has(id);
  const toggleLike = (id) => setLikedIds(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // 방을 투어 순서대로 묶은 stop 목록 (지도용)
  const roomStops = useMemo(() => {
    const m = new Map();
    artworks.forEach((a, i) => {
      if (!a.floor || !a.room) return;
      if (!m.has(a.room)) m.set(a.room, { room: a.room, floor: a.floor, idxs: [] });
      m.get(a.room).idxs.push(i);
    });
    return [...m.values()].map((s, k) => ({ ...s, seq: k + 1 }));
  }, [artworks]);

  // 목차: 필터 → 층별 그룹
  const groups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const items = artworks.map((a, i) => ({ a, i })).filter(({ a }) => {
      if (listFilter === 'best' && !a.star) return false;
      if (listFilter === 'liked' && !isLiked(a.id)) return false;
      if (floorFilter != null && a.floor !== floorFilter) return false;
      if (q && !a.title.toLowerCase().includes(q)) return false;
      return true;
    });
    const gs = [];
    let last;
    items.forEach(({ a, i }) => {
      if (a.floor !== last) { gs.push({ floor: a.floor, items: [] }); last = a.floor; }
      gs[gs.length - 1].items.push({ a, i });
    });
    return gs;
  }, [artworks, listFilter, floorFilter, searchQuery, likedIds]);

  // 작품 변경 시: 진행 초기화 + 스크롤 맨 위 + (대기 중이면) 자동 재생
  useEffect(() => {
    setProg({ elapsed: 0, duration: 0, pct: 0 });
    setScriptOpen(false);
    setCommentsOpen(false);
    feedRef.current?.scrollTo({ top: 0 });
    const a = audioRef.current;
    if (a) a.currentTime = 0;
    if (pendingPlay.current && a) {
      pendingPlay.current = false;
      a.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      setIsPlaying(false);
    }
  }, [currentIndex]);

  const select = (i) => {
    if (i < 0 || i >= artworks.length || i === currentIndex) return;
    pendingPlay.current = isPlaying;   // 재생 중이면 이어서 재생
    setCurrentIndex(i);
  };
  const playPause = () => {
    const a = audioRef.current;
    if (!a || !hasAudio) return;
    if (isPlaying) { a.pause(); setIsPlaying(false); }
    else { a.play().catch(() => {}); setIsPlaying(true); }
  };
  // 목차 리스트에서 바로 재생
  const playFromList = (i) => {
    if (i === currentIndex) { playPause(); return; }
    pendingPlay.current = true;
    setCurrentIndex(i);
  };
  const nudge = (sec) => {
    const a = audioRef.current;
    if (a) a.currentTime = Math.max(0, a.currentTime + sec);
  };
  const onTime = () => {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    setProg({ elapsed: Math.floor(a.currentTime), duration: Math.floor(a.duration), pct: (a.currentTime / a.duration) * 100 });
  };
  const onEnded = () => {
    if (currentIndex < artworks.length - 1) { pendingPlay.current = true; setCurrentIndex(currentIndex + 1); }
    else setIsPlaying(false);
  };
  const seek = (e) => {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - r.left) / r.width) * a.duration;
  };
  const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  const totalDisplay = prog.duration ? fmt(prog.duration) : art.duration?.slice(3) ?? '0:00';

  // 하단 댓글 섹션 내용 (목업 3개)
  const commentsNode = (
    <div>
      {MOCK_COMMENTS.map(c => (
        <div key={c.id} style={styles.commentRow}>
          <div style={styles.commentTop}>
            <span style={styles.commentAuthor}>{c.pinned ? '📌 ' : ''}{c.author}</span>
            <span style={styles.commentLikes}>♥ {c.likes}</span>
          </div>
          <p style={styles.commentText}>{c.text}</p>
        </div>
      ))}
    </div>
  );

  return (
    <div style={styles.root}>
      <audio ref={audioRef} src={art.audioSrc || undefined}
             onTimeUpdate={onTime} onEnded={onEnded} preload="metadata" />

      {/* 상단 절반: 헤더(지도/목차 탭) + 지도 또는 목차 */}
      <div style={styles.topHalf}>
        <div style={styles.header}>
          <button style={styles.iconBtn} onClick={onHome} aria-label="닫기">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M1 6.5L9.5 15L18 6.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          </button>
          <div style={styles.segmented}>
            <button style={{ ...styles.segBtn, ...(tab === 'map' ? styles.segBtnOn : {}) }} onClick={() => setTab('map')}>지도</button>
            <button style={{ ...styles.segBtn, ...(tab === 'list' ? styles.segBtnOn : {}) }} onClick={() => setTab('list')}>목차</button>
          </div>
          <div style={{ width: 32 }} />
        </div>

        {tab === 'map' ? (
          <div style={styles.mapArea}>
            <FloorMapView
              artworks={artworks}
              currentIndex={currentIndex}
              playingIndex={isPlaying ? currentIndex : -1}
              roomStops={roomStops}
              showRoute={showRoute}
              pinActive={true}
              centerTrigger={0}
              stripActive={false}
              onPinClick={select}
              onMapClick={() => {}}
              onToggleRoute={() => setShowRoute(r => !r)}
            />
          </div>
        ) : (
          <div style={styles.listWrap}>
            {/* 필터 바 */}
            <div style={styles.filterBar}>
              <button style={styles.hamBtn} onClick={() => setFloorMenuOpen(o => !o)} aria-label="층 선택">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 6H20M4 12H20M4 18H20" stroke="#3A3A3A" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
              <button style={{ ...styles.filterChip, ...(listFilter === 'all' ? styles.filterChipOn : {}) }} onClick={() => setListFilter('all')}>전체</button>
              <button style={{ ...styles.filterChip, ...(listFilter === 'best' ? styles.filterChipOn : {}) }} onClick={() => setListFilter('best')}>★ BEST</button>
              <button style={{ ...styles.filterChip, ...(listFilter === 'liked' ? styles.filterChipOn : {}) }} onClick={() => setListFilter('liked')}>♡ 좋아요</button>
              <div style={{ flex: 1 }} />
              <button style={styles.hamBtn} onClick={() => setSearchOpen(o => !o)} aria-label="검색">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#3A3A3A" strokeWidth="2" /><line x1="16.5" y1="16.5" x2="21" y2="21" stroke="#3A3A3A" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
            </div>
            {floorMenuOpen && (
              <div style={styles.floorMenu}>
                {[null, 1, 2, 5].map(f => (
                  <button key={f ?? 'all'} style={{ ...styles.floorMenuItem, ...(floorFilter === f ? styles.floorMenuItemOn : {}) }}
                          onClick={() => { setFloorFilter(f); setFloorMenuOpen(false); }}>
                    {f == null ? '층 전체' : orsayFloorMaps[f]?.label ?? `${f}층`}
                  </button>
                ))}
              </div>
            )}
            {searchOpen && (
              <div style={styles.searchRow}>
                <input autoFocus style={styles.searchInput} placeholder="제목 검색"
                       value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </div>
            )}

            {/* 리스트 (층별 그룹) */}
            <div style={styles.listScroll}>
              {groups.map(g => (
                <div key={g.floor ?? 'etc'}>
                  <div style={styles.floorHeader}>{floorName(g.floor)}</div>
                  <div style={styles.groupBox}>
                    {g.items.map(({ a, i }) => {
                      const cur = i === currentIndex;
                      return (
                        <div key={a.id} style={styles.listItem} onClick={() => playFromList(i)}>
                          <div style={{ ...styles.listThumb, ...(cur ? styles.listThumbOn : {}) }}>
                            <ArtImage src={a.imageSrc} alt={a.title} cover />
                          </div>
                          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                            <div style={{ ...styles.listItemTitle, ...(cur ? { color: ORANGE } : {}) }}>{a.star ? '★ ' : ''}{a.title}</div>
                            <div style={styles.listItemSub}>{a.subtitle || a.duration?.slice(3) || ''}</div>
                          </div>
                          <button style={isLiked(a.id) ? styles.heartOn : styles.heartOff}
                                  onClick={(e) => { e.stopPropagation(); toggleLike(a.id); }}>
                            {isLiked(a.id) ? '♥' : '♡'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {groups.length === 0 && <div style={styles.emptyMsg}>결과가 없습니다</div>}
            </div>
          </div>
        )}
      </div>

      {/* 하단 절반: 작품 1개 (다크 풀플레이어 카드, 세로 스크롤) */}
      <div ref={feedRef} style={styles.feed}>
        <article style={styles.card}>
          <ArtCarousel artwork={art} hasAudio={hasAudio} isPlaying={isPlaying} aspect="16 / 9" full />

          <div style={{ textAlign: 'left', margin: '12px 0 4px' }}>
            <span style={styles.count}>{floorLabel(art)}</span>
          </div>

          <div style={styles.titleRow}>
            <div style={{ flex: 1 }}>
              <h2 style={styles.title}>{art.title}</h2>
            </div>
            <button style={{ ...styles.heart, color: isLiked(art.id) ? ORANGE : BORDER }} onClick={() => toggleLike(art.id)}>
              {isLiked(art.id) ? '♥' : '♡'}
            </button>
          </div>

          <div style={styles.progWrap}>
            <div style={styles.progBar} onClick={seek}>
              <div style={{ ...styles.progFill, width: `${prog.pct}%` }} />
              <div style={{ ...styles.progThumb, left: `${prog.pct}%` }} />
            </div>
            <div style={styles.timeRow}>
              <span style={styles.time}>{fmt(prog.elapsed)}</span>
              <span style={styles.time}>{totalDisplay}</span>
            </div>
          </div>

          <Controls
            big
            isPlaying={isPlaying}
            hasAudio={hasAudio}
            onPlay={playPause}
            onPrev={() => select(currentIndex - 1)}
            onNext={() => select(currentIndex + 1)}
            onNudge={nudge}
          />

          {/* 댓글·스크립트: 컨트롤 아래 2줄 미리보기, 클릭 시 전체 */}
          <div style={styles.expandArea}>
            {[
              { key: 'comments', label: `댓글 ${MOCK_COMMENTS.length}`, open: commentsOpen, set: setCommentsOpen, content: commentsNode, peek: 72 },
              { key: 'script', label: '스크립트', open: scriptOpen, set: setScriptOpen,
                content: <p style={styles.sectionText}>{art.description || '스크립트가 준비되지 않았습니다.'}</p>, peek: 48 },
            ].map(sec => (
              <div key={sec.key} style={styles.section}>
                <button style={styles.sectionHead} onClick={() => sec.set(o => !o)}>
                  <span style={styles.sectionTitle}>{sec.label}</span>
                  <span style={{ ...styles.sectionChevron, transform: sec.open ? 'rotate(180deg)' : 'none' }}>⌄</span>
                </button>
                <div style={{ position: 'relative', maxHeight: sec.open ? 2000 : sec.peek, overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
                  {sec.content}
                  {!sec.open && <div style={styles.sectionFade} onClick={() => sec.set(true)} />}
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}

const W = '#FFFFFF';
const ORANGE = '#FF730D';
const TXT_STRONG = '#1A1A1A';
const TXT_SUBTLE = '#8A8A8A';
const BORDER = '#D1D1D1';
const PLAYER_BG = '#000000';
const FONT = "'Pretendard Variable', 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif";

const styles = {
  root: { display: 'flex', flexDirection: 'column', height: '100dvh', minHeight: '100vh',
    background: PLAYER_BG, fontFamily: FONT, color: W, overflow: 'hidden', textAlign: 'left' },

  // 상단 절반 (헤더 + 지도/목차)
  topHalf: { flexShrink: 0, height: '50dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 16px' },
  iconBtn: { background: 'none', border: 'none', color: W, cursor: 'pointer',
    width: 32, height: 32, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  segmented: { display: 'flex', background: '#1E1E1E', borderRadius: 9999, padding: 3, gap: 2 },
  segBtn: { height: 32, padding: '0 18px', borderRadius: 9999, border: 'none', background: 'transparent',
    color: TXT_SUBTLE, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  segBtnOn: { background: W, color: PLAYER_BG },

  mapArea: { position: 'relative', flex: 1, minHeight: 0, background: '#E3E3E3',
    borderRadius: 12, overflow: 'hidden', margin: '0 10px 8px' },

  // 목차 리스트 (라이트 테마)
  listWrap: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    background: '#F2F2F5', borderRadius: 12, margin: '0 10px 8px' },
  filterBar: { flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px',
    overflowX: 'auto', scrollbarWidth: 'none' },
  hamBtn: { flexShrink: 0, width: 34, height: 34, borderRadius: 9999, border: `1px solid ${BORDER}`,
    background: W, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  filterChip: { flexShrink: 0, height: 34, padding: '0 14px', borderRadius: 9999, border: `1px solid ${BORDER}`,
    background: W, color: '#3A3A3A', fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' },
  filterChipOn: { border: `1.5px solid ${ORANGE}`, color: ORANGE, fontWeight: 700 },
  floorMenu: { flexShrink: 0, background: W, borderRadius: 10, margin: '0 12px 8px', overflow: 'hidden',
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)' },
  floorMenuItem: { display: 'block', width: '100%', padding: '13px 16px', textAlign: 'left', border: 'none',
    borderBottom: '1px solid #EEE', background: 'none', fontSize: 14, color: '#3A3A3A', cursor: 'pointer' },
  floorMenuItemOn: { color: ORANGE, fontWeight: 700, background: '#FFF3EC' },
  searchRow: { flexShrink: 0, padding: '0 12px 8px' },
  searchInput: { width: '100%', height: 38, border: `1.5px solid ${ORANGE}`, borderRadius: 9999,
    padding: '0 16px', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' },

  listScroll: { flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', minHeight: 0, padding: '0 12px 12px' },
  floorHeader: { fontSize: 15, fontWeight: 700, color: TXT_STRONG, padding: '12px 4px 8px', textAlign: 'left' },
  groupBox: { background: W, borderRadius: 12, overflow: 'hidden' },
  listItem: { display: 'flex', alignItems: 'center', gap: 12, padding: 12,
    borderBottom: '1px solid #EEE', cursor: 'pointer' },
  listThumb: { position: 'relative', width: 60, height: 60, borderRadius: 10, overflow: 'hidden',
    flexShrink: 0, background: '#EEE', border: '2px solid transparent' },
  listThumbOn: { border: `2px solid ${ORANGE}` },
  listItemTitle: { fontSize: 15, fontWeight: 600, color: TXT_STRONG, overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  listItemSub: { fontSize: 13, color: TXT_SUBTLE, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  heartOff: { flexShrink: 0, background: 'none', border: 'none', color: BORDER, fontSize: 20, cursor: 'pointer', padding: '4px 6px', lineHeight: 1 },
  heartOn: { flexShrink: 0, background: 'none', border: 'none', color: ORANGE, fontSize: 20, cursor: 'pointer', padding: '4px 6px', lineHeight: 1 },
  emptyMsg: { textAlign: 'center', color: TXT_SUBTLE, fontSize: 14, padding: '32px 0' },

  // 하단 절반 (스크롤, 작품 1개)
  feed: { flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', minHeight: 0 },
  card: { padding: '8px 20px 28px' },

  count: { fontSize: 13, color: TXT_SUBTLE },
  titleRow: { display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 4 },
  title: { fontSize: 20, fontWeight: 600, color: W, margin: 0, lineHeight: 1.45, textAlign: 'left' },
  heart: { background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', lineHeight: 1, flexShrink: 0 },

  progWrap: { marginTop: 16 },
  progBar: { position: 'relative', height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 9999, cursor: 'pointer' },
  progFill: { position: 'absolute', top: 0, left: 0, height: '100%', background: ORANGE, borderRadius: 9999 },
  progThumb: { position: 'absolute', top: '50%', transform: 'translate(-50%,-50%)', width: 12, height: 12,
    borderRadius: '50%', background: '#fff', pointerEvents: 'none' },
  timeRow: { display: 'flex', justifyContent: 'space-between', marginTop: 7 },
  time: { fontSize: 12, color: TXT_SUBTLE },

  // 댓글·스크립트 펼침 영역
  expandArea: { marginTop: 24, display: 'flex', flexDirection: 'column' },
  section: { borderTop: '1px solid rgba(255,255,255,0.12)', padding: '12px 0' },
  sectionHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
    background: 'none', border: 'none', padding: 0, cursor: 'pointer' },
  sectionTitle: { fontSize: 15, fontWeight: 700, color: W },
  sectionChevron: { fontSize: 18, color: TXT_SUBTLE, lineHeight: 1, transition: 'transform 0.2s ease' },
  sectionText: { fontSize: 14, lineHeight: 1.7, color: '#CFCFCF', margin: '8px 0 0', whiteSpace: 'pre-wrap', textAlign: 'left' },
  sectionFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 22,
    background: 'linear-gradient(transparent, #000)', cursor: 'pointer' },

  // 댓글 행 (하단 섹션)
  commentRow: { padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', textAlign: 'left' },
  commentTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  commentAuthor: { fontSize: 13, fontWeight: 700, color: W },
  commentLikes: { fontSize: 12, color: ORANGE },
  commentText: { fontSize: 13, lineHeight: 1.6, color: '#CFCFCF', margin: '5px 0 0', textAlign: 'left' },
};
