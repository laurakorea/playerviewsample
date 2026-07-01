import { useState, useEffect } from 'react';
import './App.css';
import { tourData } from './data/tourData';
import { orsayTourData } from './data/orsayTourData';
import StartScreen from './screens/StartScreen';
import AudioGuideScreen from './screens/AudioGuideScreen';
import NavigationScreen from './screens/NavigationScreen';
import PlayerV2 from './screens/PlayerV2';
import OrsayPlayer from './screens/OrsayPlayer';

export default function App() {
  const [screen, setScreen] = useState('start');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [orsayIndex, setOrsayIndex] = useState(0);
  const orsayArtworks = orsayTourData.artworks;

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
    <div>
      {screen === 'start' && (
        <StartScreen onStart={handleStart} onStart2={handleStart2} onStartOrsay={handleStartOrsay} />
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
