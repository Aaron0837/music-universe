import { useId, useRef } from 'react';

interface KnobProps {
  label: string; value: number; min: number; max: number; step?: number;
  unit?: string; large?: boolean; onChange(value: number): void;
}
export function Knob({ label, value, min, max, step = 1, unit = '', large, onChange }: KnobProps) {
  const id = useId();
  const drag = useRef<{ y: number; value: number } | null>(null);
  const change = (next: number) => onChange(Math.max(min, Math.min(max, Math.round(next / step) * step)));
  return <div className={`knob-control ${large ? 'knob-control--large' : ''}`}>
    <label htmlFor={id}>{label}</label>
    <div className="knob-shell" style={{ '--knob-angle': `${-135 + (value - min) / (max - min) * 270}deg` } as React.CSSProperties}
      onPointerDown={(event) => { if (event.button !== 0) return; drag.current = { y: event.clientY, value }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={(event) => { if (drag.current) change(drag.current.value + (drag.current.y - event.clientY) * (max - min) / (event.shiftKey ? 1200 : 240)); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <i /><strong>{Number.isInteger(value) ? value : value.toFixed(1)}</strong><small>{unit}</small>
      <input id={id} aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(event) => change(Number(event.target.value))} onPointerDown={(event) => event.preventDefault()} />
    </div>
    {large && <input className="knob-number" aria-label={`${label} 数值`} type="number" min={min} max={max} step={step} value={Number(value.toFixed(1))} onChange={(event) => { if (event.target.value) change(Number(event.target.value)); }} />}
  </div>;
}
