import { useId } from 'react';

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  large?: boolean;
  onChange(value: number): void;
}

export function Knob({ label, value, min, max, step = 1, unit = '', large, onChange }: KnobProps) {
  const id = useId();
  const ratio = (value - min) / (max - min);
  const angle = -135 + ratio * 270;
  return (
    <label className={`knob-control ${large ? 'knob-control--large' : ''}`} htmlFor={id}>
      <span>{label}</span>
      <span className="knob-shell" style={{ '--knob-angle': `${angle}deg` } as React.CSSProperties}>
        <i />
        <strong>{Number.isInteger(value) ? value : value.toFixed(1)}</strong>
        <small>{unit}</small>
      </span>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
