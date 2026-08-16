export default function TextSlide({ slide }) {
  const bg = slide.background_color || '#1a1a2e';
  const color = slide.text_color || '#ffffff';
  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center text-center p-12"
      style={{ backgroundColor: bg, color }}
    >
      {slide.headline && (
        <h2 className="text-6xl font-bold mb-6 leading-tight">{slide.headline}</h2>
      )}
      {slide.body && (
        <p className="text-3xl max-w-3xl leading-relaxed opacity-90">{slide.body}</p>
      )}
    </div>
  );
}