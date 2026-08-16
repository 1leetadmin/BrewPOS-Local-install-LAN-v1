import { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Plus, GripVertical, Pencil, Trash2, ImageIcon, Video, Type, Star } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { createSlide, SLIDE_TYPES } from '@/lib/cdsDefaults';
import SlideEditor from './SlideEditor';

const TYPE_ICONS = {
  image: ImageIcon,
  video: Video,
  text: Type,
  special: Star,
};

export default function SlidesManager({ config, onChange, onSave }) {
  const [editingIndex, setEditingIndex] = useState(null);
  const slides = config.slides || [];

  const updateSlide = (index, newSlide) => {
    const next = [...slides];
    next[index] = newSlide;
    onChange('slides', next);
  };

  const addSlide = (type) => {
    const slide = createSlide(type);
    slide.sort_order = slides.length;
    onChange('slides', [...slides, slide]);
  };

  const deleteSlide = (index) => {
    onChange('slides', slides.filter((_, i) => i !== index));
  };

  const toggleSlide = (index, enabled) => {
    const next = [...slides];
    next[index] = { ...next[index], enabled };
    onChange('slides', next);
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const reordered = [...slides];
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    const withOrder = reordered.map((s, i) => ({ ...s, sort_order: i }));
    onChange('slides', withOrder);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Slides</CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="w-4 h-4" /> Add Slide
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {SLIDE_TYPES.map(t => {
                const Icon = TYPE_ICONS[t.value] || Type;
                return (
                  <DropdownMenuItem key={t.value} onClick={() => addSlide(t.value)}>
                    <Icon className="w-4 h-4 mr-2" /> {t.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        {slides.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No slides yet. Click "Add Slide" to create your first one.
          </p>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="slides">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                  {slides.map((slide, index) => {
                    const Icon = TYPE_ICONS[slide.type] || Type;
                    return (
                      <Draggable key={slide.id} draggableId={slide.id} index={index}>
                        {(prov) => (
                          <div
                            ref={prov.innerRef}
                            {...prov.draggableProps}
                            className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
                          >
                            <div {...prov.dragHandleProps} className="cursor-grab text-muted-foreground">
                              <GripVertical className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <Icon className="w-4 h-4 text-primary shrink-0" />
                                <span className="text-sm font-medium truncate">
                                  {slide.title || `${slide.type} slide`}
                                </span>
                                <Badge variant="secondary" className="capitalize text-xs">{slide.type}</Badge>
                              </div>
                            </div>
                            <Switch
                              checked={slide.enabled}
                              onCheckedChange={v => toggleSlide(index, v)}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingIndex(index)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteSlide(index)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}

        {editingIndex !== null && slides[editingIndex] && (
          <SlideEditor
            slide={slides[editingIndex]}
            onChange={(updated) => updateSlide(editingIndex, updated)}
            onSave={(updatedSlide) => {
              const next = [...slides];
              next[editingIndex] = updatedSlide;
              onSave?.({ ...config, slides: next });
            }}
            onClose={() => setEditingIndex(null)}
          />
        )}
      </CardContent>
    </Card>
  );
}