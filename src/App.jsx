import { useState, useEffect } from 'react';
import './App.css';
import { tourData } from './data/tourData';
import { orsayTourData } from './data/orsayTourData';
import { gaudiTourData, gaudiFloorMaps, gaudiRoomPins, gaudiSubMapPins } from './data/gaudiTourData';
import { gaudiTourData2, gaudiFloorMaps2, gaudiRoomPins2, gaudiSubMapPins2 } from './data/gaudiTourData2';
import { vaticanTourData, vaticanEasyArtworks, vaticanFloorMaps, vaticanRoomPins, vaticanSubMapPins } from './data/vaticanTourData';
import StartScreen from './screens/StartScreen';
import AudioGuideScreen from './screens/AudioGuideScreen';
import NavigationScreen from './screens/NavigationScreen';
import PlayerV2 from './screens/PlayerV2';
import OrsayPlayer from './screens/OrsayPlayer';
import Gaudi2Player from './screens/Gaudi2Player';
import Gaudi3Player from './screens/Gaudi3Player';
import OrsayFeed from './screens/OrsayFeed';

export default function App() {
  const [screen, setScreen] = useState('start');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false); // 쉬운모드: 다음 트랙으로 넘어오면 자동 재생
  const [orsayIndex, setOrsayIndex] = useState(0);
  const orsayArtworks = orsayTourData.artworks;
  const [gaudiIndex, setGaudiIndex] = useState(0);
  const gaudiArtworks = gaudiTourData.artworks;
  const [gaudi2Index, setGaudi2Index] = useState(0);
  const gaudi2Artworks = gaudiTourData2.artworks;
  const [easyTour, setEasyTour] = useState('gyeongbok'); // 쉬운모드(audio→navigate) 대상 투어
  const [vaticanIndex, setVaticanIndex] = useState(0);
  const vaticanArtworks = vaticanTourData.artworks;
  const [gaudi3Index, setGaudi3Index] = useState(0); // gaudi3 = gaudi2 복제(스타일 실험용), 데이터 공유

  // URL(해시) ↔ 화면 상태 동기화
  useEffect(() => {
    const onHash = () => {
      const s = window.location.hash.replace(/^#\/?/, '') || 'start';
      setScreen(prev => (prev === s ? prev : s));
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const target = screen === 'start' ? '' : `#/${screen}`;
    if (window.location.hash !== target) {
      window.location.hash = target;
    }
  }, [screen]);

  const easyIsVatican = easyTour === 'vatican';
  const artworks = easyIsVatican ? vaticanEasyArtworks : tourData.artworks;
  const currentArtwork = artworks[currentIndex];
  const nextArtwork = artworks[currentIndex + 1] ?? null;

  const handleStart = () => {
    setEasyTour('gyeongbok');
    setAutoPlay(false);
    setCurrentIndex(0);
    setScreen('audio');
  };

  const handleStart2 = () => {
    setEasyTour('gyeongbok');
    setCurrentIndex(0);
    setScreen('v2');
  };

  const handleStartOrsay = () => {
    setOrsayIndex(0);
    setScreen('orsay');
  };

  const handleStartOrsay4 = () => {
    setScreen('orsay4');
  };

  const handleStartGaudi = () => {
    setGaudi2Index(0);
    setScreen('gaudi2');
  };

  const handleStartVatican = () => {
    setVaticanIndex(0);
    setScreen('vatican');
  };

  const handleStartVaticanEasy = () => {
    setEasyTour('vatican');
    setAutoPlay(false);
    setCurrentIndex(0);
    setScreen('audio');
  };

  const handleNavigate = () => {
    if (nextArtwork?.preview) {                 // 미리듣기 트랙은 장소 이동 없이 바로 이어서
      setAutoPlay(true);
      setCurrentIndex(i => i + 1);
      return;
    }
    setScreen('navigate');
  };

  // 이전: 직전 화면으로. 장소 오디오(i)의 직전 화면은 이동 화면(i-1 → i), 미리듣기는 앞 트랙 오디오.
  const handlePrevAudio = () => {
    if (currentIndex === 0) return;
    setAutoPlay(false);
    setCurrentIndex(i => i - 1);
    setScreen(currentArtwork.preview ? 'audio' : 'navigate');
  };

  const handleArrived = () => {
    setAutoPlay(true);
    setCurrentIndex(i => i + 1);
    setScreen('audio');
  };

  const handleCantFind = () => {
    setAutoPlay(true);
    setCurrentIndex(i => i + 1);
    setScreen('audio');
  };

  return (
    <div className="app-shell">
      {screen === 'start' && (
        <StartScreen onStart={handleStart} onStart2={handleStart2} onStartOrsay={handleStartOrsay} onStartOrsay4={handleStartOrsay4} onStartGaudi={handleStartGaudi} onStartVatican={handleStartVatican} onStartVaticanEasy={handleStartVaticanEasy} />
      )}
      {screen === 'gaudi' && (
        <OrsayPlayer
          artwork={gaudiArtworks[gaudiIndex]}
          artworks={gaudiArtworks}
          currentIndex={gaudiIndex}
          total={gaudiArtworks.length}
          floorMaps={gaudiFloorMaps}
          roomPins={gaudiRoomPins}
          subMapPins={gaudiSubMapPins}
          museumName="가우디 반일투어"
          onPrev={() => setGaudiIndex(i => Math.max(0, i - 1))}
          onNext={() => setGaudiIndex(i => Math.min(gaudiArtworks.length - 1, i + 1))}
          onSelectIndex={(i) => setGaudiIndex(i)}
          onHome={() => setScreen('start')}
        />
      )}
      {screen === 'gaudi2' && (
        <Gaudi2Player
          artwork={gaudi2Artworks[gaudi2Index]}
          artworks={gaudi2Artworks}
          currentIndex={gaudi2Index}
          total={gaudi2Artworks.length}
          floorMaps={gaudiFloorMaps2}
          roomPins={gaudiRoomPins2}
          subMapPins={gaudiSubMapPins2}
          museumName="가우디 반일투어 (2)"
          onPrev={() => setGaudi2Index(i => Math.max(0, i - 1))}
          onNext={() => setGaudi2Index(i => Math.min(gaudi2Artworks.length - 1, i + 1))}
          onSelectIndex={(i) => setGaudi2Index(i)}
          onHome={() => setScreen('start')}
        />
      )}
      {screen === 'vatican' && (
        <Gaudi2Player
          artwork={vaticanArtworks[vaticanIndex]}
          artworks={vaticanArtworks}
          currentIndex={vaticanIndex}
          total={vaticanArtworks.length}
          floorMaps={vaticanFloorMaps}
          roomPins={vaticanRoomPins}
          subMapPins={vaticanSubMapPins}
          museumName="바티칸 반일투어"
          onPrev={() => setVaticanIndex(i => Math.max(0, i - 1))}
          onNext={() => setVaticanIndex(i => Math.min(vaticanArtworks.length - 1, i + 1))}
          onSelectIndex={(i) => setVaticanIndex(i)}
          onHome={() => setScreen('start')}
        />
      )}
      {screen === 'gaudi3' && (
        <Gaudi3Player
          artwork={gaudi2Artworks[gaudi3Index]}
          artworks={gaudi2Artworks}
          currentIndex={gaudi3Index}
          total={gaudi2Artworks.length}
          floorMaps={gaudiFloorMaps2}
          roomPins={gaudiRoomPins2}
          subMapPins={gaudiSubMapPins2}
          museumName="가우디 반일투어 (3)"
          onPrev={() => setGaudi3Index(i => Math.max(0, i - 1))}
          onNext={() => setGaudi3Index(i => Math.min(gaudi2Artworks.length - 1, i + 1))}
          onSelectIndex={(i) => setGaudi3Index(i)}
          onHome={() => setScreen('start')}
        />
      )}
      {screen === 'orsay4' && (
        <OrsayFeed
          artworks={orsayArtworks}
          onHome={() => setScreen('start')}
        />
      )}
      {screen === 'orsay' && (
        <OrsayPlayer
          artwork={orsayArtworks[orsayIndex]}
          artworks={orsayArtworks}
          currentIndex={orsayIndex}
          total={orsayArtworks.length}
          onPrev={() => setOrsayIndex(i => Math.max(0, i - 1))}
          onNext={() => setOrsayIndex(i => Math.min(orsayArtworks.length - 1, i + 1))}
          onSelectIndex={(i) => setOrsayIndex(i)}
          onHome={() => setScreen('start')}
        />
      )}
      {screen === 'v2' && (
        <PlayerV2
          artwork={artworks[currentIndex]}
          artworks={artworks}
          currentIndex={currentIndex}
          total={artworks.length}
          onPrev={() => setCurrentIndex(i => Math.max(0, i - 1))}
          onNext={() => setCurrentIndex(i => Math.min(artworks.length - 1, i + 1))}
          onSelectIndex={(i) => setCurrentIndex(i)}
          onHome={() => setScreen('start')}
        />
      )}
      {screen === 'audio' && (
        <AudioGuideScreen
          artwork={currentArtwork}
          nextArtwork={nextArtwork}
          artworks={artworks}
          plan={easyIsVatican ? { floorMaps: vaticanFloorMaps, roomPins: vaticanRoomPins } : null}
          autoPlay={autoPlay}
          onSelectIndex={(i) => { setAutoPlay(true); setCurrentIndex(i); }}
          onNavigate={handleNavigate}
          onPrev={currentIndex > 0 ? handlePrevAudio : null}
          onHome={() => setScreen('start')}
          currentIndex={currentIndex}
          total={artworks.length}
        />
      )}
      {screen === 'navigate' && (
        <NavigationScreen
          currentArtwork={currentArtwork}
          nextArtwork={nextArtwork}
          plan={easyIsVatican ? { floorMaps: vaticanFloorMaps, roomPins: vaticanRoomPins } : null}
          onArrived={handleArrived}
          onCantFind={handleCantFind}
          onBack={() => setScreen('audio')}
          onHome={() => setScreen('start')}
        />
      )}
    </div>
  );
}
