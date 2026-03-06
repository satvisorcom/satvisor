/** Svelte action for styled tooltips. Replaces native `title` attributes.
 *
 * Usage:
 *   use:tooltip={'Simple text'}
 *   use:tooltip={{ text: 'Hello', placement: 'top' }}
 *   use:tooltip={{ html: '<b>Bold</b> text', placement: 'bottom' }}
 */

export type TooltipPlacement = 'top' | 'bottom';

export interface TooltipOptions {
  text?: string;
  html?: string;
  placement?: TooltipPlacement;
}

type TooltipParam = string | TooltipOptions | null | undefined;

interface ParsedTooltip {
  content: string;
  isHtml: boolean;
  placement: TooltipPlacement;
}

const GAP = 6;
const VIEWPORT_PAD = 8;

let activeEl: HTMLElement | null = null;
let tipEl: HTMLDivElement | null = null;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;

function ensureStyle() {
  if (document.getElementById('_tooltip-style')) return;
  const style = document.createElement('style');
  style.id = '_tooltip-style';
  style.textContent = `
    ._tooltip {
      position: fixed;
      z-index: 99999;
      background: var(--tooltip-bg, #111);
      border: 1px solid var(--border, #333);
      color: var(--text-dim, #aaa);
      font-family: 'Overpass Mono', monospace;
      font-size: 11px;
      line-height: 1.5;
      padding: 6px 10px;
      border-radius: 3px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      pointer-events: none;
      white-space: pre;
      max-width: min(360px, calc(100vw - ${VIEWPORT_PAD * 2}px));
      opacity: 0;
      transition: opacity 80ms ease-in;
    }
    ._tooltip.visible { opacity: 1; }
    ._tooltip b { color: var(--text, #e3e3e3); font-weight: 600; }
    ._tooltip .dim { color: var(--text-muted, #666); }
    ._tooltip .val { color: var(--text, #e3e3e3); }
    ._tooltip .sep {
      display: block;
      height: 0;
      border-top: 1px solid var(--border, #333);
      margin: 4px 0 6px;
      line-height: 0;
      font-size: 0;
    }
  `;
  document.head.appendChild(style);
}

function show(node: HTMLElement, parsed: ParsedTooltip) {
  hide();
  ensureStyle();

  activeEl = node;
  const el = document.createElement('div');
  el.className = '_tooltip';
  if (parsed.isHtml) {
    el.innerHTML = parsed.content;
  } else {
    el.textContent = parsed.content;
  }
  document.body.appendChild(el);
  tipEl = el;

  // Position after layout
  requestAnimationFrame(() => {
    if (tipEl !== el) return;
    const rect = node.getBoundingClientRect();
    const tipRect = el.getBoundingClientRect();

    // Horizontal: center on trigger, clamp to viewport
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(VIEWPORT_PAD, Math.min(left, window.innerWidth - tipRect.width - VIEWPORT_PAD));

    // Vertical: prefer requested placement, flip if no room
    let top: number;
    if (parsed.placement === 'bottom') {
      top = rect.bottom + GAP;
      if (top + tipRect.height > window.innerHeight - VIEWPORT_PAD) {
        top = rect.top - tipRect.height - GAP;
      }
    } else {
      top = rect.top - tipRect.height - GAP;
      if (top < VIEWPORT_PAD) {
        top = rect.bottom + GAP;
      }
    }

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.classList.add('visible');
  });
}

function hide() {
  if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
  if (tipEl) { tipEl.remove(); tipEl = null; }
  activeEl = null;
}

function parse(param: TooltipParam): ParsedTooltip | null {
  if (!param) return null;
  if (typeof param === 'string') return { content: param, isHtml: false, placement: 'top' };
  const content = param.html ?? param.text;
  if (!content) return null;
  return { content, isHtml: !!param.html, placement: param.placement ?? 'top' };
}

export function tooltip(node: HTMLElement, param: TooltipParam) {
  let opts = parse(param);

  // Strip native title to prevent double-tooltip
  const origTitle = node.getAttribute('title');
  if (origTitle) node.removeAttribute('title');

  function onEnter() {
    if (!opts) return;
    if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
    show(node, opts);
  }

  function onLeave() {
    if (activeEl !== node) return;
    hideTimeout = setTimeout(hide, 60);
  }

  node.addEventListener('pointerenter', onEnter);
  node.addEventListener('pointerleave', onLeave);
  node.addEventListener('pointerdown', hide);

  return {
    update(newParam: TooltipParam) {
      opts = parse(newParam);
      if (activeEl === node && tipEl && opts) {
        if (opts.isHtml) {
          tipEl.innerHTML = opts.content;
        } else {
          tipEl.textContent = opts.content;
        }
      } else if (activeEl === node && !opts) {
        hide();
      }
    },
    destroy() {
      node.removeEventListener('pointerenter', onEnter);
      node.removeEventListener('pointerleave', onLeave);
      node.removeEventListener('pointerdown', hide);
      if (activeEl === node) hide();
    },
  };
}
