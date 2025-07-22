import { useEffect, useState } from 'react';
import './SplashScreen.css';

interface SplashScreenProps {
  onComplete: () => void;
}

const SplashScreen = ({ onComplete }: SplashScreenProps) => {
  const [animationStage, setAnimationStage] = useState<'fadeIn' | 'zoomIn' | 'fadeOut'>('fadeIn');

  useEffect(() => {
    // Play sound effect if available
    const audio = new Audio('/jingle.mp3');
    audio.volume = 0.6; // Adjust volume as needed
    
    // Modern browsers require user interaction before playing audio
    // We'll try to play it, but also provide fallback options
    const playAudio = async () => {
      try {
        await audio.play();
        console.log('✅ Jingle playing successfully');
      } catch (error) {
        console.log('🔇 Audio autoplay blocked by browser or file not found');
        console.log('💡 To enable sound: ensure jingle.mp3 is in public folder and try clicking page first');
        console.error('Audio error:', error);
      }
    };
    
    playAudio();

    // Animation sequence timing
    const timer1 = setTimeout(() => {
      setAnimationStage('zoomIn');
    }, 500);

    const timer2 = setTimeout(() => {
      setAnimationStage('fadeOut');
    }, 2000);

    const timer3 = setTimeout(() => {
      onComplete();
    }, 2800);

    // Enable audio on first user interaction
    const enableAudioAndContinue = async () => {
      try {
        await audio.play();
        console.log('🔊 Audio enabled after user interaction');
      } catch (error) {
        console.log('🔇 Still could not play audio:', error);
      }
    };

    // Skip animation on click/touch (optional - remove if you want to force full animation)
    const handleSkip = () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      audio.pause();
      onComplete();
    };

    // Try to play audio on user interaction
    const handleInteraction = (e: Event) => {
      enableAudioAndContinue();
      // After first interaction, remove the listeners and continue with skip behavior
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
      document.addEventListener('click', handleSkip);
      document.addEventListener('keydown', handleSkip);
    };

    // Allow users to enable audio and skip
    document.addEventListener('click', handleInteraction);
    document.addEventListener('keydown', handleInteraction);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
      document.removeEventListener('click', handleSkip);
      document.removeEventListener('keydown', handleSkip);
      audio.pause();
    };
  }, [onComplete]);

  return (
    <div className={`splash-screen ${animationStage}`}>
      <div className="splash-logo-container">
        <img 
          src="/hoopflix-logo.png" 
          alt="HoopFlix" 
          className="splash-logo"
        />
      </div>

    </div>
  );
};

// Development utility function - call in browser console to reset intro
if (typeof window !== 'undefined') {
  (window as any).resetHoopflixIntro = () => {
    localStorage.removeItem('hoopflix-intro-seen');
    window.location.reload();
  };
}

export default SplashScreen; 