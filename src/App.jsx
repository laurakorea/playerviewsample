import { useState, useEffect } from 'react';
import './App.css';
import { tourData } from './data/tourData';
import { orsayTourData } from './data/orsayTourData';
import { gaudiTourData, gaudiFloorMaps, gaudiRoomPins, gaudiSubMapPins } from './data/gaudiTourData';
import { gaudiTourData2, gaudiFloorMaps2, gaudiRoomPins2, gaudiSubMapPins2 } from './data/gaudiTourData2';
import StartScreen from './screens/StartScreen';
import AudioGuideScreen from './screens/AudioGuideScreen';
import NavigationScreen from './screens/NavigationScreen';
import PlayerV2 from './screens/PlayerV2';
import OrsayPlayer from './screens/OrsayPlayer';
import Gaudi2Player from './screens/Gaudi2Player';
import OrsayFeed from './screens/OrsayFeed';

export default function App() {
  const [screen, setScreen] = useState('start');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [orsayIndex, setOrsayIndex] = useState(0);
  const orsayArtworks = orsayTourData.artworks;
  const [gaudiIndex, setGaudiIndex] = useState(0);
  const gaudiArtworks = gaudiTourData.artworks;
  const [gaudi2Index, setGaudi2Index] = useState(0);
  const gaudi2Artworks = gaudiTourData2.artworks;

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

  const { artworks } = tourData;
  const currentArtwork = artworks[currentIndex];
  const nextArtwork = artworks[currentIndex + 1] ?? null;

  const handleStart = () => {
    setCurrentIndex(0);
    setScreen('audio');
  };

  const handleStart2 = () => {
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
    setGaudiIndex(0);
    setScreen('gaudi');
  };

  const handleNavigate = () => {
    setScreen('navigate');
  };

  const handleArrived = () => {
    setCurrentIndex(i => i + 1);
    setScreen('audio');
  };

  const handleCantFind = () => {
    setCurrentIndex(i => i + 1);
    setScreen('audio');
  };

  const handlePrev = () => {
    if (currentIndex === 0) {
      setScreen('start');
    } else {
      setCurrentIndex(i => i - 1);
      setScreen('audio');
    }
  };

  return (
    <div className="app-shell">
      {screen === 'start' && (
        <StartScreen onStart={handleStart} onStart2={handleStart2} onStartOrsay={handleStartOrsay} onStartOrsay4={handleStartOrsay4} onStartGaudi={handleStartGaudi} />
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
          onNavigate={handleNavigate}
          onPrev={handlePrev}
          onHome={() => setScreen('start')}
          currentIndex={currentIndex}
          total={artworks.length}
        />
      )}
      {screen === 'navigate' && (
        <NavigationScreen
          currentArtwork={currentArtwork}
          nextArtwork={nextArtwork}
          onArrived={handleArrived}
          onCantFind={handleCantFind}
          onBack={() => setScreen('audio')}
          onHome={() => setScreen('start')}
        />
      )}
    </div>
  );
}
