import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export function BwSelect({ value, onChange, options, placeholder, className }) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className={cn(
        'h-8 px-2 text-xs shadow-none rounded-md font-medium',
        'bg-white text-black border-black',
        'dark:bg-black dark:text-white dark:border-white',
        'data-[placeholder]:text-black/50 dark:data-[placeholder]:text-white/50',
        'hover:bg-white dark:hover:bg-black',
        className
      )}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        className="bg-white text-black border-black dark:bg-black dark:text-white dark:border-white shadow-lg"
        position="popper"
        sideOffset={4}
      >
        {options.map(opt => (
          <SelectItem
            key={opt.value}
            value={opt.value}
            className="focus:bg-blue-500 focus:text-white data-[highlighted]:bg-blue-500 data-[highlighted]:text-white data-[state=checked]:text-blue-600 dark:data-[state=checked]:text-blue-400 font-medium"
          >
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}