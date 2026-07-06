import { useState, useRef, useEffect, useMemo } from 'react';
import { FloorMapView, ArtImage, floorLabel, roomName } from './OrsayPlayer.parts';
import { orsayFloorMaps } from '../data/orsayTourData';

// 댓글 목업 데이터 (3개) — 하단 댓글 섹션
const MOCK_COMMENTS = [
  { id: 1, author: '미술관러버', text: '오디오 설명 덕분에 그림이 완전 다르게 보여요! 이 앞에서 한참 머물렀네요. 강추합니다 🎨', likes: 42, pinned: true },
  { id: 2, author: '파리여행중', text: '해설이 귀에 쏙쏙 들어와요. 배경 이야기까지 알려줘서 좋았습니다.', likes: 28, best: true },
  { id: 3, author: '제이든', text: '설명이 자세해서 좋았어요. 다음 작품도 기대됩니다 :)', likes: 15 },
];

const floorName = (f) => (f == null ? '기타' : orsayFloorMaps[f]?.label ?? `${f}층`);

// 4차 오르세 투어 v2: 상단 고정(헤더+다크 지도) + 시트 스크롤(트랙 헤더·참고이미지·플레이어 카드·댓글·스크립트) + 목차 오버레이
export default function OrsayFeed({ artworks, onHome }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [tab, setTab] = useState('map');            // 'map' | 'list'
  const [showRoute, setShowRoute] = useState(true);
  const [likedIds, setLikedIds] = useState(new Set());
  const [scriptOpen, setScriptOpen] = useState(true);
  const [commentsOpen, setCommentsOpen] = useState(true);
  const [pinCard, setPinCard] = useState(false);   // 핀 클릭 시 지도 안 트랙 카드
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

  // 핀 클릭 시 하단 스트립: 현재 방(stop) + 이전/다음 장소
  const activeStop = roomStops.find(s => s.room === art?.room && s.floor === art?.floor) || null;
  const stripIdxs = activeStop ? activeStop.idxs : [];
  const prevStop = activeStop ? roomStops.find(s => s.seq === activeStop.seq - 1) : null;
  const nextStop = activeStop ? roomStops.find(s => s.seq === activeStop.seq + 1) : null;

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

  // 전체 소요 시간(분) — 목차 헤더용
  const totalMin = useMemo(() => {
    const sec = artworks.reduce((s, a) => {
      const m = a.duration?.match(/(\d+):(\d+):(\d+)/);
      return s + (m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : 0);
    }, 0);
    return Math.round(sec / 60);
  }, [artworks]);

  // 작품 변경 시: 진행 초기화 + 스크롤 맨 위 + (대기 중이면) 자동 재생
  useEffect(() => {
    setProg({ elapsed: 0, duration: 0, pct: 0 });
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
    if (i === currentIndex) { setTab('map'); playPause(); return; }
    pendingPlay.current = true;
    setCurrentIndex(i);
    setTab('map');
  };
  const playAll = () => {
    if (currentIndex === 0) { setTab('map'); playPause(); return; }
    pendingPlay.current = true;
    setCurrentIndex(0);
    setTab('map');
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

  const showStrip = pinCard && !!activeStop;

  return (
    <div style={styles.root}>
      <audio ref={audioRef} src={art.audioSrc || undefined}
             onTimeUpdate={onTime} onEnded={onEnded} preload="metadata" />

      {/* ===== 상단 고정: 헤더 + 다크 지도 ===== */}
      <div style={styles.fixedTop}>
        <div style={styles.header}>
          <button style={styles.hdrBtn} onClick={onHome} aria-label="닫기"><i className="ph ph-caret-down" /></button>
          <div style={styles.segWrap}>
            <div style={styles.segmented}>
              <button style={{ ...styles.seg, ...(tab === 'map' ? styles.segOn : {}) }} onClick={() => setTab('map')}>지도</button>
              <button style={{ ...styles.seg, ...(tab === 'list' ? styles.segOn : {}) }} onClick={() => setTab('list')}>목차</button>
            </div>
          </div>
          <button style={{ ...styles.hdrBtn, color: '#c8c8ce', fontSize: 19 }} aria-label="더보기"><i className="ph ph-dots-three" /></button>
        </div>

        <div style={styles.mapWrap}>
          <FloorMapView
            v2
            artworks={artworks}
            currentIndex={currentIndex}
            playingIndex={isPlaying ? currentIndex : -1}
            roomStops={roomStops}
            showRoute={showRoute}
            pinActive={true}
            centerTrigger={0}
            stripActive={showStrip}
            onPinClick={(i) => { select(i); setPinCard(true); }}
            onMapClick={() => setPinCard(false)}
            onToggleRoute={() => setShowRoute(r => !r)}
          />
          <div style={styles.scrim} />

          {/* 핀 클릭 시 하단 스트립: 이전 장소 · 작품 카드 · 다음 장소 */}
          {showStrip && (
            <div style={styles.strip} className="ag-hscroll">
              {prevStop && (
                <button style={styles.stripPlace} onClick={() => { select(prevStop.idxs[0]); setPinCard(true); }}>
                  <div style={styles.stripPlaceCircle}>‹</div>
                  <div style={styles.stripPlaceLabel}>이전 장소</div>
                  <div style={styles.stripPlaceName}>{roomName(prevStop.room)}</div>
                </button>
              )}
              {stripIdxs.map(gi => {
                const a = artworks[gi];
                const on = gi === currentIndex;
                return (
                  <div key={gi} style={styles.stripCard}>
                    <div style={{ ...styles.stripThumb, ...(on ? styles.stripThumbOn : {}) }} onClick={() => select(gi)}>
                      <ArtImage src={a.imageSrc} alt={a.title} cover />
                      {on && isPlaying && (
                        <div style={styles.stripEq}>
                          <span style={{ ...styles.stripEqBar, animationDelay: '0s' }} />
                          <span style={{ ...styles.stripEqBar, animationDelay: '.15s' }} />
                          <span style={{ ...styles.stripEqBar, animationDelay: '.3s' }} />
                        </div>
                      )}
                      <button style={styles.stripHeart} onClick={(e) => { e.stopPropagation(); toggleLike(a.id); }}>
                        <i className={isLiked(a.id) ? 'ph-fill ph-heart' : 'ph ph-heart'}
                           style={{ color: isLiked(a.id) ? '#f2760f' : '#fff' }} />
                      </button>
                    </div>
                    <div style={{ ...styles.stripName, ...(on ? styles.stripNameOn : {}) }} onClick={() => select(gi)}>
                      {a.star ? '★ ' : ''}{a.title}
                    </div>
                  </div>
                );
              })}
              {nextStop && (
                <button style={styles.stripPlace} onClick={() => { select(nextStop.idxs[0]); setPinCard(true); }}>
                  <div style={styles.stripPlaceCircle}>›</div>
                  <div style={styles.stripPlaceLabel}>다음 장소</div>
                  <div style={styles.stripPlaceName}>{roomName(nextStop.room)}</div>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== 스크롤 시트 ===== */}
      <div ref={feedRef} style={styles.sheet} className="ag-scroll">
        <div style={styles.handleWrap}><div style={styles.handle} /></div>

        {/* 트랙 헤더: 번호 배지 + 라벨/제목 + 좋아요 */}
        <div style={styles.trackHeader}>
          <div style={styles.numBadge}>{currentIndex + 1}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={styles.eyebrow}>{art.subtitle || floorLabel(art)}</div>
            <h1 style={styles.title}>{art.star ? '★ ' : ''}{art.title}</h1>
          </div>
          <button style={styles.likeBtn} onClick={() => toggleLike(art.id)} aria-label="좋아요">
            <i className={isLiked(art.id) ? 'ph-fill ph-heart' : 'ph ph-heart'}
               style={{ color: isLiked(art.id) ? '#f2760f' : '#8a8a90' }} />
          </button>
        </div>

        {/* 플레이어 카드 */}
        <div style={styles.playerCard}>
          <div style={styles.progBar} onClick={seek}>
            <div style={{ ...styles.progFill, width: `${prog.pct}%` }} />
            <div style={{ ...styles.progThumb, left: `${prog.pct}%` }} />
          </div>
          <div style={styles.timeRow}>
            <span>{fmt(prog.elapsed)}</span>
            <span>{totalDisplay}</span>
          </div>
          <div style={styles.transport}>
            <button style={styles.tBtn} onClick={() => nudge(-5)} disabled={!hasAudio}>
              <i className="ph ph-arrow-counter-clockwise" /><span style={styles.tNum}>5</span>
            </button>
            <button style={styles.tSkip} onClick={() => select(currentIndex - 1)}><i className="ph-fill ph-skip-back" /></button>
            <button style={{ ...styles.fab, ...(hasAudio ? {} : styles.fabOff) }} onClick={playPause}>
              <i className={hasAudio ? (isPlaying ? 'ph-fill ph-pause' : 'ph-fill ph-play') : 'ph-fill ph-speaker-simple-slash'} />
            </button>
            <button style={styles.tSkip} onClick={() => select(currentIndex + 1)}><i className="ph-fill ph-skip-forward" /></button>
            <button style={styles.tBtn} onClick={() => nudge(5)} disabled={!hasAudio}>
              <i className="ph ph-arrow-clockwise" /><span style={styles.tNum}>5</span>
            </button>
          </div>
        </div>

        {/* 댓글 */}
        <div style={{ padding: '26px 22px 0' }}>
          <button style={styles.sectionHead} onClick={() => setCommentsOpen(o => !o)}>
            <span style={styles.sectionTitle}>댓글 <span style={{ color: '#f2760f' }}>{MOCK_COMMENTS.length}</span></span>
            <i className="ph ph-caret-down" style={{ ...styles.chev, transform: commentsOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
          </button>
          {commentsOpen && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {MOCK_COMMENTS.map(c => (
                <div key={c.id} style={styles.commentCard}>
                  <div style={styles.commentTop}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      {c.pinned && <i className="ph-fill ph-push-pin" style={{ color: '#f2760f', fontSize: 15 }} />}
                      <span style={styles.commentAuthor}>{c.author}</span>
                    </div>
                    <div style={{ ...styles.commentLikes, color: c.pinned ? '#f2760f' : '#8a8a90' }}>
                      <i className={c.pinned ? 'ph-fill ph-heart' : 'ph ph-heart'} /><span>{c.likes}</span>
                    </div>
                  </div>
                  <p style={styles.commentText}>{c.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 스크립트 */}
        <div style={{ padding: '22px 22px 40px' }}>
          <button style={styles.sectionHead} onClick={() => setScriptOpen(o => !o)}>
            <span style={styles.sectionTitle}>스크립트</span>
            <i className="ph ph-caret-down" style={{ ...styles.chev, transform: scriptOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
          </button>
          {scriptOpen && (
            <div style={styles.scriptCard}>{art.description || '스크립트가 준비되지 않았습니다.'}</div>
          )}
        </div>
      </div>

      {/* ===== 목차 오버레이 ===== */}
      {tab === 'list' && (
        <div style={styles.indexOverlay}>
          <div style={styles.indexHeader}>
            <div>
              <div style={styles.indexTitle}>오르세 · 오디오 가이드</div>
              <div style={styles.indexSub}>전체 {artworks.length}점 · 약 {totalMin}분</div>
            </div>
            <button style={styles.playAllBtn} onClick={playAll}>
              <i className="ph-fill ph-play" style={{ fontSize: 13 }} />전체 재생
            </button>
          </div>

          {/* 필터 바 */}
          <div style={styles.filterBar} className="ag-hscroll">
            <button style={styles.hamBtn} onClick={() => setFloorMenuOpen(o => !o)} aria-label="층 선택"><i className="ph ph-list" /></button>
            <button style={{ ...styles.filterChip, ...(listFilter === 'all' ? styles.filterChipOn : {}) }} onClick={() => setListFilter('all')}>전체</button>
            <button style={{ ...styles.filterChip, ...(listFilter === 'best' ? styles.filterChipOn : {}) }} onClick={() => setListFilter('best')}>★ BEST</button>
            <button style={{ ...styles.filterChip, ...(listFilter === 'liked' ? styles.filterChipOn : {}) }} onClick={() => setListFilter('liked')}>♡ 좋아요</button>
            <div style={{ flex: 1 }} />
            <button style={styles.hamBtn} onClick={() => setSearchOpen(o => !o)} aria-label="검색"><i className="ph ph-magnifying-glass" /></button>
          </div>
          {floorMenuOpen && (
            <div style={styles.floorMenu}>
              {[null, 1, 2, 5].map(f => (
                <button key={f ?? 'all'} style={{ ...styles.floorMenuItem, ...(floorFilter === f ? styles.floorMenuItemOn : {}) }}
                        onClick={() => { setFloorFilter(f); setFloorMenuOpen(false); }}>
                  {f == null ? '층 전체' : floorName(f)}
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
          <div style={styles.indexScroll} className="ag-scroll">
            {groups.map((g, gi) => (
              <div key={gi}>
                <div style={styles.floorHeader}>{floorName(g.floor)}</div>
                {g.items.map(({ a, i }) => {
                  const cur = i === currentIndex;
                  return (
                    <button key={i} style={{ ...styles.row, ...(cur ? styles.rowOn : {}) }} onClick={() => playFromList(i)}>
                      <div style={{ ...styles.rowNum, ...(cur ? styles.rowNumOn : {}) }}>{i + 1}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ ...styles.rowTitle, ...(cur ? styles.rowTitleOn : {}) }}>{a.star ? '★ ' : ''}{a.title}</div>
                        <div style={styles.rowSub}>{a.subtitle || floorLabel(a)}</div>
                      </div>
                      {cur && isPlaying ? (
                        <div style={styles.eqWrap}>
                          <span style={{ ...styles.eqBar, animationDelay: '0s' }} />
                          <span style={{ ...styles.eqBar, animationDelay: '.3s' }} />
                          <span style={{ ...styles.eqBar, animationDelay: '.15s' }} />
                        </div>
                      ) : (
                        <span style={styles.rowDur}>{a.duration?.slice(3) || ''}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
            {groups.length === 0 && <div style={styles.emptyMsg}>결과가 없습니다</div>}
          </div>
        </div>
      )}
    </div>
  );
}

const BG = '#0b0b0d', CARD = '#141417', BTN = '#161619', ORANGE = '#f2760f',
  W = '#fafafa', SUB = '#8a8a90', SUB2 = '#c8c8ce', BODY = '#b4b4ba', LINE = '#1a1a1d';
const FONT = "'Pretendard Variable', 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif";

const styles = {
  root: { position: 'relative', display: 'flex', flexDirection: 'column', height: '100dvh', minHeight: '100vh',
    background: BG, fontFamily: FONT, color: W, overflow: 'hidden', textAlign: 'left' },

  // 상단 고정
  fixedTop: { position: 'relative', zIndex: 3, flex: '0 0 auto', background: BG },
  header: { padding: '14px 18px 12px', display: 'flex', alignItems: 'center', gap: 10 },
  hdrBtn: { width: 40, height: 40, border: 'none', background: BTN, color: W, display: 'flex', alignItems: 'center',
    justifyContent: 'center', cursor: 'pointer', borderRadius: 999, fontSize: 20, flex: '0 0 auto' },
  segWrap: { flex: 1, display: 'flex', justifyContent: 'center' },
  segmented: { display: 'flex', background: BTN, borderRadius: 999, padding: 3, gap: 2 },
  seg: { border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, padding: '7px 20px', borderRadius: 999,
    background: 'transparent', color: SUB, transition: 'all .15s' },
  segOn: { background: W, color: BG },

  mapWrap: { position: 'relative', height: 'clamp(232px, 34dvh, 322px)', overflow: 'hidden',
    background: 'radial-gradient(120% 90% at 50% 28%,#1c1c20 0%,#151518 55%,#0f0f12 100%)' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 96, pointerEvents: 'none', zIndex: 3,
    background: 'linear-gradient(180deg,rgba(11,11,13,0) 0%,rgba(11,11,13,0.55) 55%,#0b0b0d 100%)' },
  // 핀 클릭 시 하단 스트립 (이전 장소 · 작품 카드 · 다음 장소)
  strip: { position: 'absolute', left: 0, right: 0, bottom: 10, zIndex: 6, display: 'flex', alignItems: 'flex-end',
    gap: 10, padding: '0 14px', overflowX: 'auto', scrollSnapType: 'x mandatory' },
  stripCard: { flex: '0 0 auto', width: 132, scrollSnapAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6 },
  stripThumb: { position: 'relative', width: 132, height: 92, borderRadius: 14, overflow: 'hidden', background: '#1f1f23',
    border: '2px solid transparent', boxShadow: '0 8px 20px rgba(0,0,0,0.5)', cursor: 'pointer' },
  stripThumbOn: { border: `2px solid ${ORANGE}` },
  stripEq: { position: 'absolute', left: 8, bottom: 8, display: 'flex', alignItems: 'flex-end', gap: 2.5, height: 12 },
  stripEqBar: { width: 3, height: 12, background: ORANGE, borderRadius: 2, transformOrigin: 'bottom',
    animation: 'eq .9s ease-in-out infinite', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' },
  stripHeart: { position: 'absolute', top: 4, right: 4, width: 28, height: 28, border: 'none', background: 'rgba(0,0,0,0.35)',
    borderRadius: 999, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  stripName: { color: W, fontSize: 12.5, fontWeight: 600, lineHeight: 1.3, textAlign: 'center', cursor: 'pointer',
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  stripNameOn: { color: ORANGE, fontWeight: 700 },
  stripPlace: { flex: '0 0 auto', width: 74, scrollSnapAlign: 'center', border: 'none', background: 'transparent',
    cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingBottom: 24 },
  stripPlaceCircle: { width: 44, height: 44, borderRadius: 999, background: 'rgba(28,28,32,0.92)',
    border: '1px solid rgba(255,255,255,0.14)', color: SUB2, fontSize: 22, fontWeight: 400, display: 'flex',
    alignItems: 'center', justifyContent: 'center', lineHeight: 1 },
  stripPlaceLabel: { color: SUB, fontSize: 10, fontWeight: 600 },
  stripPlaceName: { color: SUB2, fontSize: 12, fontWeight: 700 },

  // 스크롤 시트
  sheet: { flex: '1 1 auto', overflowY: 'auto', position: 'relative', zIndex: 4, marginTop: -28,
    background: BG, borderRadius: '26px 26px 0 0', WebkitOverflowScrolling: 'touch' },
  handleWrap: { position: 'sticky', top: 0, zIndex: 5, padding: '12px 0 8px', display: 'flex', justifyContent: 'center',
    background: 'linear-gradient(180deg,#0b0b0d 70%,rgba(11,11,13,0))' },
  handle: { width: 38, height: 4, borderRadius: 999, background: '#3a3a3f' },

  trackHeader: { padding: '2px 22px 0', display: 'flex', alignItems: 'center', gap: 14 },
  numBadge: { width: 46, height: 46, flex: '0 0 auto', borderRadius: 14, background: 'rgba(242,118,15,0.14)',
    color: ORANGE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, fontWeight: 700,
    fontVariantNumeric: 'tabular-nums' },
  eyebrow: { color: SUB, fontSize: 12, fontWeight: 600, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  title: { margin: 0, color: W, fontSize: 21, fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.04em' },
  likeBtn: { width: 40, height: 40, border: 'none', background: BTN, fontSize: 20, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', borderRadius: 999 },

  playerCard: { margin: '20px 18px 0', background: CARD, borderRadius: 22, padding: '20px 20px 22px' },
  progBar: { position: 'relative', height: 5, borderRadius: 999, background: '#2a2a2e', cursor: 'pointer' },
  progFill: { position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 999, background: ORANGE },
  progThumb: { position: 'absolute', top: '50%', transform: 'translate(-50%,-50%)', width: 14, height: 14,
    borderRadius: 999, background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.5)', pointerEvents: 'none' },
  timeRow: { display: 'flex', justifyContent: 'space-between', marginTop: 10, color: SUB, fontSize: 12,
    fontWeight: 500, fontVariantNumeric: 'tabular-nums' },
  transport: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginTop: 16 },
  tBtn: { position: 'relative', flex: '0 0 auto', width: 44, height: 44, border: 'none', background: 'transparent', color: SUB2,
    fontSize: 23, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  tNum: { position: 'absolute', fontSize: 9, fontWeight: 700, color: SUB2 },
  tSkip: { flex: '0 0 auto', width: 40, height: 40, border: 'none', background: 'transparent', color: W, fontSize: 26,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  fab: { flex: '0 0 auto', width: 72, height: 72, borderRadius: 999, background: ORANGE, border: 'none', color: '#fff', fontSize: 29,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 20px rgba(242,118,15,0.4)' },
  fabOff: { opacity: 0.45, boxShadow: 'none' },

  sectionHead: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' },
  sectionTitle: { color: W, fontSize: 16, fontWeight: 700 },
  chev: { color: SUB, fontSize: 18, transition: 'transform .2s' },
  commentCard: { background: CARD, borderRadius: 16, padding: '14px 16px' },
  commentTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  commentAuthor: { color: W, fontSize: 14, fontWeight: 600 },
  commentLikes: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600 },
  commentText: { margin: '8px 0 0', color: BODY, fontSize: 14, lineHeight: 1.6 },
  scriptCard: { marginTop: 14, background: CARD, borderRadius: 16, padding: 18, color: BODY, fontSize: 15,
    lineHeight: 1.75, whiteSpace: 'pre-wrap' },

  // 목차 오버레이
  indexOverlay: { position: 'absolute', left: 0, right: 0, top: 66, bottom: 0, zIndex: 6, background: BG,
    display: 'flex', flexDirection: 'column' },
  indexHeader: { padding: '18px 22px 14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
    flex: '0 0 auto', borderBottom: `1px solid ${LINE}` },
  indexTitle: { color: W, fontSize: 19, fontWeight: 700, letterSpacing: '-0.01em' },
  indexSub: { color: SUB, fontSize: 13, fontWeight: 500, marginTop: 4 },
  playAllBtn: { display: 'flex', alignItems: 'center', gap: 6, background: ORANGE, color: '#fff', border: 'none',
    borderRadius: 999, padding: '9px 15px', fontSize: 13, fontWeight: 600, cursor: 'pointer', flex: '0 0 auto' },
  filterBar: { flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', overflowX: 'auto' },
  hamBtn: { flex: '0 0 auto', width: 34, height: 34, borderRadius: 999, border: '1px solid #2a2a2e', background: BTN,
    color: SUB2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 },
  filterChip: { flex: '0 0 auto', height: 32, padding: '0 14px', borderRadius: 999, border: '1px solid #2a2a2e',
    background: BTN, color: SUB2, fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' },
  filterChipOn: { border: `1px solid ${ORANGE}`, color: ORANGE, fontWeight: 700, background: 'rgba(242,118,15,0.12)' },
  floorMenu: { flex: '0 0 auto', background: CARD, borderRadius: 12, margin: '0 14px 6px', overflow: 'hidden',
    border: `1px solid ${LINE}` },
  floorMenuItem: { display: 'block', width: '100%', padding: '13px 16px', textAlign: 'left', border: 'none',
    borderBottom: `1px solid ${LINE}`, background: 'none', fontSize: 14, color: SUB2, cursor: 'pointer' },
  floorMenuItemOn: { color: ORANGE, fontWeight: 700, background: 'rgba(242,118,15,0.1)' },
  searchRow: { flex: '0 0 auto', padding: '0 14px 8px' },
  searchInput: { width: '100%', height: 38, border: `1.5px solid ${ORANGE}`, borderRadius: 999, padding: '0 16px',
    fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: CARD, color: W },
  indexScroll: { flex: 1, overflowY: 'auto', padding: '8px 12px 34px', display: 'flex', flexDirection: 'column', gap: 2 },
  floorHeader: { color: SUB2, fontSize: 13, fontWeight: 700, padding: '12px 10px 6px' },
  row: { width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: 12, border: 'none', borderRadius: 16,
    cursor: 'pointer', textAlign: 'left', background: 'transparent' },
  rowOn: { background: 'rgba(242,118,15,0.12)' },
  rowNum: { width: 34, height: 34, flex: '0 0 auto', borderRadius: 999, display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', background: '#1f1f23', color: SUB },
  rowNumOn: { background: ORANGE, color: '#fff' },
  rowTitle: { color: '#dcdce0', fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  rowTitleOn: { color: W },
  rowSub: { color: SUB, fontSize: 12.5, fontWeight: 500, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  rowDur: { color: '#71717a', fontSize: 12, fontWeight: 500, fontVariantNumeric: 'tabular-nums', flex: '0 0 auto' },
  eqWrap: { display: 'flex', alignItems: 'flex-end', gap: 2.5, height: 15, flex: '0 0 auto', paddingRight: 2 },
  eqBar: { width: 3, height: 15, background: ORANGE, borderRadius: 2, transformOrigin: 'bottom',
    animation: 'eq .9s ease-in-out infinite' },
  emptyMsg: { textAlign: 'center', color: SUB, fontSize: 14, padding: '32px 0' },
};
