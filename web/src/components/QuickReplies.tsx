import './QuickReplies.css';

interface QuickRepliesProps {
  options: string[];
  onSelect: (option: string) => void;
  disabled: boolean;
}

export function QuickReplies({ options, onSelect, disabled }: QuickRepliesProps) {
  if (options.length === 0) return null;

  return (
    <div className="quick-replies">
      {options.map((opt) => (
        <button
          key={opt}
          className="quick-reply-btn"
          onClick={() => onSelect(opt)}
          disabled={disabled}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
