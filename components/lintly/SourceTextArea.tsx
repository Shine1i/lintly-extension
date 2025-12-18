interface SourceTextAreaProps {
  value: string;
  onChange: (value: string) => void;
}

export function SourceTextArea({ value, onChange }: SourceTextAreaProps) {
  return (
    <div className="p-5 bg-white/40">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-sm text-gray-600 bg-transparent outline-none resize-none placeholder-gray-300 leading-relaxed font-normal"
        rows={3}
        spellCheck={false}
        placeholder="Paste text here..."
      />
    </div>
  );
}
