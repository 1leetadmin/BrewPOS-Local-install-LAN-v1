export default function SpecialSlide({ slide }) {
  const bg = slide.background_color || '#16213e';
  const color = slide.text_color || '#ffffff';
  return (
    <div
      className="w-full h-full flex items-center justify-center p-12"
      style={{ backgroundColor: bg, color }}
    >
      <div className="max-w-4xl text-center">
        {slide.special_image_url && (
          <img
            src={slide.special_image_url}
            className="w-48 h-48 object-cover rounded-2xl mx-auto mb-8 shadow-2xl"
            alt={slide.special_name || ''}
          />
        )}
        <div className="inline-block px-4 py-1 rounded-full text-sm font-bold uppercase tracking-wider mb-4 bg-white/15">
          Today's Special
        </div>
        {slide.special_name && (
          <h2 className="text-7xl font-black mb-4">{slide.special_name}</h2>
        )}
        {slide.special_description && (
          <p className="text-3xl mb-8 opacity-80 max-w-2xl mx-auto">{slide.special_description}</p>
        )}
        {slide.special_price && (
          <p className="text-6xl font-bold" style={{ color: '#ffd700' }}>
            {slide.special_price}
          </p>
        )}
      </div>
    </div>
  );
}