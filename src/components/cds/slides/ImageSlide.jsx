export default function ImageSlide({ slide }) {
  if (!slide.media_url) {
    return (
      <div className="w-full h-full bg-neutral-900 flex items-center justify-center text-white/30">
        <span className="text-2xl">No image set</span>
      </div>
    );
  }
  return (
    <img
      src={slide.media_url}
      className="w-full h-full object-contain"
      alt={slide.title || ''}
      draggable={false}
    />
  );
}