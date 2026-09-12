import * as THREE from 'three';
import type { InteractionFrame } from '../types';

export class InteractionController {
  readonly frame: InteractionFrame = { x: 0, y: 0, worldX: 0, worldY: 0, pressed: false, energy: 0, burst: 0, zoom: 1, reducedMotion: false };
  private pointers = new Map<number, PointerEvent>();
  private disposers: Array<() => void> = [];
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private point = new THREE.Vector3();
  private normalized = new THREE.Vector2();
  private pinchDistance = 0;
  constructor(private canvas: HTMLCanvasElement, private camera: THREE.PerspectiveCamera) {
    this.listen(canvas, 'pointermove', this.pointerMove);
    this.listen(canvas, 'pointerdown', this.pointerDown);
    this.listen(canvas, 'pointerup', this.pointerUp);
    this.listen(canvas, 'pointercancel', this.pointerUp);
    this.listen(canvas, 'wheel', this.wheel, { passive: false });
  }
  private listen(target: EventTarget, type: string, handler: EventListener, options?: AddEventListenerOptions): void {
    target.addEventListener(type, handler, options); this.disposers.push(() => target.removeEventListener(type, handler, options));
  }
  private update(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.frame.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.frame.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    this.ray.setFromCamera(this.normalized.set(this.frame.x, this.frame.y), this.camera);
    if (this.ray.ray.intersectPlane(this.plane, this.point)) { this.frame.worldX = this.point.x; this.frame.worldY = this.point.y; }
  }
  private pointerMove = ((event: PointerEvent) => {
    if (this.pointers.has(event.pointerId)) this.pointers.set(event.pointerId, event);
    if (this.pointers.size === 2) {
      const [a, b] = this.pointers.values();
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (this.pinchDistance) this.frame.zoom = Math.max(0.55, Math.min(1.65, this.frame.zoom * distance / this.pinchDistance));
      this.pinchDistance = distance;
      return;
    }
    this.update(event); if (this.frame.pressed) this.frame.energy = Math.min(1, this.frame.energy + 0.035);
  }) as EventListener;
  private pointerDown = ((event: PointerEvent) => { this.canvas.setPointerCapture(event.pointerId); this.pointers.set(event.pointerId, event); this.update(event); this.frame.pressed = true; this.frame.burst = 1; }) as EventListener;
  private pointerUp = ((event: PointerEvent) => { this.pointers.delete(event.pointerId); this.frame.pressed = this.pointers.size > 0; this.pinchDistance = 0; }) as EventListener;
  private wheel = ((event: WheelEvent) => { event.preventDefault(); this.frame.zoom = Math.max(0.55, Math.min(1.65, this.frame.zoom + event.deltaY * -0.0007)); }) as EventListener;
  tick(delta: number): InteractionFrame { this.frame.energy = Math.max(0, this.frame.energy - delta * 0.22); this.frame.burst = Math.max(0, this.frame.burst - delta * 1.8); return this.frame; }
  dispose(): void { this.disposers.forEach((dispose) => dispose()); this.disposers.length = 0; }
}
