import { Delete } from 'lucide-react';

// Large touch-friendly numeric keypad for PIN entry.
export default function PinKeypad({ onDigit, onBackspace, disabled }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];

  return (
    <div className="grid grid-cols-3 gap-3 max-w-[280px] mx-auto">
      {keys.map((k, i) => {
        if (k === '') return <div key={i} />;
        if (k === 'back') {
          return (
            <button
              key={i}
              onClick={onBackspace}
              disabled={disabled}
              className="h-16 rounded-xl bg-muted hover:bg-accent flex items-center justify-center transition-colors disabled:opacity-40"
            >
              <Delete className="w-6 h-6" />
            </button>
          );
        }
        return (
          <button
            key={i}
            onClick={() => onDigit(k)}
            disabled={disabled}
            className="h-16 rounded-xl bg-card border border-border hover:bg-accent text-2xl font-bold font-heading flex items-center justify-center transition-colors disabled:opacity-40 active:scale-95"
          >
            {k}
          </button>
        );
      })}
    </div>
  );
}