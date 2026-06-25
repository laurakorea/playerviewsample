import { useState } from 'react';
import './App.css';
import { tourData } from './data/tourData';
import StartScreen from './screens/StartScreen';
import AudioGuideScreen from './screens/AudioGuideScreen';
import NavigationScreen from './screens/NavigationScreen';

export default function App() {
  const [screen, setScreen] = useState('start');
  const [currentIndex, setCurrentIndex] = useState(0);

  const { artworks } = tourData;
  const currentArtwork = artworks[currentIndex];
  const nextArtwork = artworks[currentIndex + 1] ?? null;

  const handleStart = () => {
    setCurrentIndex(0);
    setScreen('audio');
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
        <StartScreen onStart={handleStart} />
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
