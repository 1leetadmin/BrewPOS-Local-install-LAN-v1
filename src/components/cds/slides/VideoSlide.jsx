import { useRef } from 'react';

export default function VideoSlide({ slide, onVideoDuration }) {
  const videoRef = useRef(null);

  const handleLoadedMetadata = () => {
    if (videoRef.current && onVideoDuration && videoRef.current.duration) {
      onVideoDuration(videoRef.current.duration);
    }
  };

  if (!slide.media_url) {
    return (
      <div className="w-full h-full bg-neutral-900 flex items-center justify-center text-white/30">
        <span className="text-2xl">No video set</span>
      </div>
    );
  }
  return (
    <video
      ref={videoRef}
      src={slide.media_url}
      className="w-full h-full object-contain"
      autoPlay
      muted
      loop
      playsInline
      onLoadedMetadata={handleLoadedMetadata}
    />
  );
}