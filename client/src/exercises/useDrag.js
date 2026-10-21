import { useEffect, useRef, useState } from 'react';

const HOLD_MS = 220; // a finger must rest this long before a drag starts; moving earlier is a scroll
const TOUCH_SLOP = 8;
const MOUSE_SLOP = 5;
const EDGE = 56; // a drag this close to the top or bottom of the screen scrolls the page (long lists of paragraphs)
const EDGE_SPEED = 14; // px per frame at the very edge

/**
 * Pointer drag for rearranging an answer (mouse, pen and touch). `bind(key, source)` gives a draggable element's props.
 *   mouse / pen   the drag starts after moving 5 px
 *   finger        after resting 220 ms (a finger that moves earlier scrolls the page, as always); while a drag runs, page
 *                 scrolling is blocked (a non-passive touchmove listener) and the long press opens no menu
 * While dragging, the element follows the pointer (`style`, `data-dragging`) and lets hits through, `resolve(x, y, source)`
 * names the drop target under the pointer (null: none — the drop changes nothing) and `drag.target` lets the exercise draw
 * the drop indicator. Near the top or bottom of the screen the page scrolls along. `onDrop(source, target)` applies a drop. The click that ends a drag is swallowed, so a drag is
 * never also a tap. A cancelled pointer (the browser took over) changes nothing.
 */
export function useDrag({ disabled, resolve, onDrop }) {
  const [drag, setDrag] = useState(null); // { key, source, dx, dy, target }
  const g = useRef(null);
  const swallow = useRef(false);
  const latest = useRef({ resolve, onDrop });
  latest.current = { resolve, onDrop };

  useEffect(() => {
    const block = (e) => { if (g.current?.active) e.preventDefault(); };
    document.addEventListener('touchmove', block, { passive: false });
    return () => {
      document.removeEventListener('touchmove', block);
      end(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function end(drop, x, y) {
    const st = g.current;
    if (!st) return;
    g.current = null;
    clearTimeout(st.timer);
    cancelAnimationFrame(st.frame);
    window.removeEventListener('pointermove', st.move);
    window.removeEventListener('pointerup', st.up);
    window.removeEventListener('pointercancel', st.cancel);
    if (!st.active) return;
    // what is under the pointer, while the dragged item still lets hits through (it sits right under the pointer)
    const target = drop ? latest.current.resolve(x, y, st.source, { dx: x - st.x0, dy: y - st.y0 + (window.scrollY - st.scroll0) }) : null;
    st.el.style.pointerEvents = '';
    swallow.current = true;
    setTimeout(() => { swallow.current = false; }, 0); // the click a drag causes comes in the same task as its pointerup
    setDrag(null);
    if (target !== null && target !== undefined) latest.current.onDrop(st.source, target);
  }

  // Where the dragged item is drawn and what it would drop on; the page may have scrolled since the drag began.
  function follow(st) {
    const dx = st.x - st.x0;
    const dy = st.y - st.y0 + (window.scrollY - st.scroll0);
    const target = latest.current.resolve(st.x, st.y, st.source, { dx, dy });
    setDrag({ key: st.key, source: st.source, dx, dy, target: target ?? null });
  }

  // Near the top or bottom edge the page scrolls, faster the closer the pointer is, so a far place can be reached.
  function autoScroll(st) {
    // the bottom of what can be seen: the top of the sticky Check bar, not the window
    const h = document.querySelector('.lesson-bottom')?.getBoundingClientRect().top ?? window.innerHeight;
    const v = st.y < EDGE ? -EDGE_SPEED * (1 - st.y / EDGE) : st.y > h - EDGE ? EDGE_SPEED * (1 - (h - st.y) / EDGE) : 0;
    if (v) {
      const before = window.scrollY;
      window.scrollBy(0, v);
      if (window.scrollY !== before) follow(st);
    }
    st.frame = requestAnimationFrame(() => { if (g.current === st && st.active) autoScroll(st); });
  }

  function start(st, x, y) {
    st.active = true;
    st.x = x;
    st.y = y;
    st.el.style.pointerEvents = 'none'; // hit-testing sees what is under the dragged item
    follow(st);
    autoScroll(st);
  }

  const bind = (key, source) => {
    if (disabled) return {};
    const dragging = drag?.key === key;
    return {
      onPointerDown: (e) => {
        if (e.button > 0 || g.current) return;
        const touch = e.pointerType === 'touch';
        const st = { key, source, el: e.currentTarget, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, scroll0: window.scrollY, active: false, timer: null, frame: 0 };
        st.move = (ev) => {
          st.x = ev.clientX;
          st.y = ev.clientY;
          const moved = Math.hypot(ev.clientX - st.x0, ev.clientY - st.y0);
          if (!st.active) {
            if (touch) { if (moved > TOUCH_SLOP) end(false); return; } // a scroll: the browser keeps it
            if (moved < MOUSE_SLOP) return;
            start(st, ev.clientX, ev.clientY);
            return;
          }
          follow(st);
        };
        st.up = (ev) => end(true, ev.clientX, ev.clientY);
        st.cancel = () => end(false);
        if (touch) st.timer = setTimeout(() => { if (g.current === st) start(st, st.x, st.y); }, HOLD_MS);
        g.current = st;
        window.addEventListener('pointermove', st.move);
        window.addEventListener('pointerup', st.up);
        window.addEventListener('pointercancel', st.cancel);
      },
      onClickCapture: (e) => {
        if (!swallow.current) return;
        swallow.current = false;
        e.preventDefault();
        e.stopPropagation();
      },
      onContextMenu: (e) => { if (g.current) e.preventDefault(); },
      'data-draggable': 'true',
      ...(dragging ? { 'data-dragging': 'true', style: { transform: `translate(${drag.dx}px, ${drag.dy}px)` } } : {}),
    };
  };

  return { drag, bind };
}

/** Boxes of the elements matching `selector` inside `root`, in DOM order (for gapAt); the dragged one where it sits. */
export function boxes(root, selector, offset = { dx: 0, dy: 0 }) {
  if (!root) return [];
  return [...root.querySelectorAll(selector)].map((el) => {
    const r = el.getBoundingClientRect();
    const o = el.dataset.dragging === 'true' ? offset : { dx: 0, dy: 0 };
    return { left: r.left - o.dx, top: r.top - o.dy, width: r.width, height: r.height };
  });
}

/** Is (x, y) inside the element's box (plus a margin)? */
export function inside(el, x, y, margin = 16) {
  if (!el) return false;
  // under the sticky Check bar nothing can be seen, so nothing is a drop target there
  const bar = typeof document !== 'undefined' ? document.querySelector('.lesson-bottom')?.getBoundingClientRect() : null;
  if (bar && y > bar.top) return false;
  const r = el.getBoundingClientRect();
  return x >= r.left - margin && x <= r.right + margin && y >= r.top - margin && y <= r.bottom + margin;
}
