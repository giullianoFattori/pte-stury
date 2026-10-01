type WfdAnswerInputProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function WfdAnswerInput({ value, onChange, disabled = false }: WfdAnswerInputProps) {
  return (
    <div className="wfd-answer">
      <label htmlFor="wfd-answer">Your answer</label>
      <textarea
        id="wfd-answer"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        rows={4}
        autoComplete="off"
        spellCheck={false}
        placeholder="Type exactly what you hear..."
      />
    </div>
  );
}
