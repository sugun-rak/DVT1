import React, { useState, useRef, useEffect } from 'react';

/**
 * SwipeSlider: A premium swipe-to-confirm component.
 * @param {string} label - The text to show on the slider.
 * @param {function} onConfirm - Callback when swipe is complete.
 * @param {string} color - The primary color (success, primary, error).
 * @param {boolean} disabled - Whether the slider is disabled.
 */
export default function SwipeSlider({ label, onConfirm, color = 'var(--primary-color)', disabled = false }) {
  const [swipePos, setSwipePos] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const containerRef = useRef(null);
  const startX = useRef(0);

  const handleStart = (e) => {
    if (disabled || confirmed) return;
    setIsSwiping(true);
    startX.current = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
  };

  const handleMove = (e) => {
    if (!isSwiping || confirmed) return;
    const currentX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const delta = currentX - startX.current;
    const maxWidth = containerRef.current.offsetWidth - 60; // 60 is knob width
    const newPos = Math.max(0, Math.min(delta, maxWidth));
    setSwipePos(newPos);
    
    // Auto-confirm if 95% swiped
    if (newPos >= maxWidth * 0.95) {
      setIsSwiping(false);
      setSwipePos(maxWidth);
      setConfirmed(true);
      onConfirm();
      // Reset after a delay
      setTimeout(() => {
        setConfirmed(false);
        setSwipePos(0);
      }, 1500);
    }
  };

  const handleEnd = () => {
    if (confirmed) return;
    setIsSwiping(false);
    setSwipePos(0); // Snap back
  };

  useEffect(() => {
    if (isSwiping) {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchmove', handleMove);
      window.addEventListener('touchend', handleEnd);
    } else {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isSwiping]);

  const opacity = 0.1 + (swipePos / (containerRef.current?.offsetWidth || 1)) * 0.9;

  return (
    <div 
      ref={containerRef}
      className="swipe-slider-container"
      style={{
        position: 'relative',
        width: '100%',
        height: '60px',
        background: 'rgba(0,0,0,0.3)',
        borderRadius: '30px',
        overflow: 'hidden',
        border: `1px solid ${confirmed ? color : 'rgba(255,255,255,0.1)'}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'border 0.3s'
      }}
      onMouseDown={handleStart}
      onTouchStart={handleStart}
    >
      <div 
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          height: '100%',
          width: `${swipePos + 60}px`,
          background: color,
          opacity: opacity,
          transition: isSwiping ? 'none' : 'width 0.3s, opacity 0.3s'
        }}
      />
      
      <div 
        style={{
          position: 'absolute',
          left: `${swipePos}px`,
          top: '5px',
          width: '50px',
          height: '50px',
          background: 'white',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          transition: isSwiping ? 'none' : 'left 0.3s',
          zIndex: 2
        }}
      >
        <span style={{ fontSize: '1.2rem', color: '#000' }}>{confirmed ? '✓' : '»'}</span>
      </div>

      <div 
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.9rem',
          fontWeight: 'bold',
          color: confirmed ? 'white' : 'rgba(255,255,255,0.5)',
          userSelect: 'none',
          zIndex: 1,
          pointerEvents: 'none'
        }}
      >
        {confirmed ? 'CONFIRMED' : label.toUpperCase()}
      </div>
    </div>
  );
}
