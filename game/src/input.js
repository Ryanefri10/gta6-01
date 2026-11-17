// Keyboard + mouse state, kept in one place so the loop never touches DOM
// events directly. Keys are stored lowercase; mouse position is in pixels.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false, clicked: false };
    this._pressed = new Set();
    this._canvas = canvas;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.key.toLowerCase());
      this._pressed.add(e.key.toLowerCase());
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.down = false; });
    canvas.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouse.down = true; this.mouse.clicked = true; }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.down = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(...names) { return names.some((n) => this.keys.has(n)); }
  // True once, on the frame the key went down; consumed by the loop.
  pressed(...names) { return names.some((n) => this._pressed.has(n)); }
  // True once for just these keys, and removes only them from the pressed
  // set — so Escape/M can be taken by the menu handling without eating E,
  // F or Space before the world step reads them.
  take(...names) {
    let hit = false;
    for (const n of names) if (this._pressed.delete(n)) hit = true;
    return hit;
  }
  consumePressed() { this._pressed.clear(); }
  consumeClick() { const c = this.mouse.clicked; this.mouse.clicked = false; return c; }
}
