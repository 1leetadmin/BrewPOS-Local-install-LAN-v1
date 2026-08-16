import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { TRANSITION_VARIANTS } from '@/lib/cdsDefaults';
import ImageSlide from './slides/ImageSlide';
import VideoSlide from './slides/VideoSlide';
import TextSlide from './slides/TextSlide';
import SpecialSlide from './slides/SpecialSlide';

const SLIDE_COMPONENTS = {
  image: ImageSlide,
  video: VideoSlide,
  text: TextSlide,
  special: SpecialSlide,
};

export default function Slideshow({ slides, defaultInterval, defaultTransition, paused }) {
  const [index, setIndex] = useState(0);
  const [videoDuration, setVideoDuration] = useState(null);
  const timerRef = useRef(null);

  // Clamp index when slides array changes
  useEffect(() => {
    if (index >= slides.length) setIndex(0);
  }, [slides.length, index]);

  // Reset measured video duration whenever the active slide changes
  useEffect(() => {
    setVideoDuration(null);
  }, [index]);

  // Slideshow timer — advances to next slide after duration
  useEffect(() => {
    if (paused || slides.length <= 1) return;

    const current = slides[index];
    let duration = current?.duration_ms || defaultInterval || 5000;

    // Override: if this is a video and its actual duration is longer than the
    // configured interval, keep the slide up for the full video length so it
    // can play through completely before advancing.
    if (current?.type === 'video' && videoDuration != null) {
      duration = Math.max(duration, videoDuration * 1000);
    }

    timerRef.current = setTimeout(() => {
      setIndex(prev => (prev + 1) % slides.length);
    }, duration);

    return () => clearTimeout(timerRef.current);
  }, [index, slides, defaultInterval, paused, videoDuration]);

  if (slides.length === 0) return null;

  const current = slides[index];
  const SlideComponent = SLIDE_COMPONENTS[current.type] || ImageSlide;
  const transition = current.transition || defaultTransition || 'fade';
  const variants = TRANSITION_VARIANTS[transition] || TRANSITION_VARIANTS.fade;

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      <AnimatePresence mode="wait">
        <motion.div
          key={current.id || index}
          initial={variants.initial}
          animate={variants.animate}
          exit={variants.exit}
          transition={{ duration: transition === 'cut' ? 0 : 0.5, ease: 'easeInOut' }}
          className="absolute inset-0"
        >
          <SlideComponent
            slide={current}
            onVideoDuration={current.type === 'video' ? setVideoDuration : undefined}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}