<script lang="ts">
  import { fly } from 'svelte/transition';
  import { uiStore } from '../../stores/ui.svelte';
  import { ICON_CLOSE, ICON_BACK } from './icons';
  import type { Snippet } from 'svelte';

  let {
    id,
    title = '',
    icon = undefined as Snippet | undefined,
    headerExtra = undefined as Snippet | undefined,
    footer = undefined as Snippet | undefined,
    children,
  }: {
    id: string;
    title?: string;
    icon?: Snippet;
    headerExtra?: Snippet;
    footer?: Snippet;
    children: Snippet;
  } = $props();

  let open = $derived(uiStore.activeMobileSheet === id);

  // Swipe-to-dismiss state
  let dragY = $state(0);
  let dragging = $state(false);
  let sheetEl: HTMLDivElement | undefined = $state();
  let startY = 0;

  function onHandlePointerDown(e: PointerEvent) {
    dragging = true;
    startY = e.clientY;
    dragY = 0;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onHandlePointerMove(e: PointerEvent) {
    if (!dragging) return;
    const dy = e.clientY - startY;
    dragY = Math.max(0, dy); // only allow dragging down
  }

  function onHandlePointerUp() {
    if (!dragging) return;
    dragging = false;
    const h = sheetEl?.offsetHeight ?? 300;
    if (dragY > h * 0.3) {
      uiStore.closeMobileSheet();
    }
    dragY = 0;
  }
</script>

{#if open}
  <div
    class="sheet"
    bind:this={sheetEl}
    style="transform: translateY({dragY}px)"
    class:dragging
    transition:fly={{ y: 400, duration: uiStore.skipSheetTransition ? 0 : 250 }}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="sheet-handle"
      onpointerdown={onHandlePointerDown}
      onpointermove={onHandlePointerMove}
      onpointerup={onHandlePointerUp}
      onpointercancel={onHandlePointerUp}
    >
      <div class="handle-bar"></div>
    </div>
    <div class="sheet-titlebar">
      <span class="sheet-title">
        {#if icon}{@render icon()}{/if}
        {title}
      </span>
      {#if headerExtra}{@render headerExtra()}{/if}
      <button class="sheet-close" onclick={() => uiStore.closeMobileSheet()}>{@html uiStore.canGoBack ? ICON_BACK : ICON_CLOSE}</button>
    </div>
    <div class="sheet-body">
      {@render children()}
    </div>
    {#if footer}
      <div class="sheet-footer">
        {@render footer()}
      </div>
    {/if}
  </div>
{/if}

<style>
  .sheet {
    position: fixed;
    bottom: 56px;
    left: 0;
    width: 100%;
    max-height: calc(35vh);
    z-index: 500;
    background: var(--modal-bg);
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    transition: transform 0.15s ease-out;
  }
  .sheet.dragging {
    transition: none;
  }
  .sheet-handle {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px 0 4px;
    cursor: grab;
    touch-action: none;
  }
  .sheet-handle:active { cursor: grabbing; }
  .handle-bar {
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: var(--text-ghost);
  }
  .sheet-titlebar {
    display: flex;
    align-items: center;
    padding: 2px 12px 6px;
    gap: 6px;
  }
  .sheet-title {
    font-size: 11px;
    color: var(--text-ghost);
    text-transform: uppercase;
    letter-spacing: 1px;
    display: flex;
    align-items: center;
    gap: 5px;
    flex: 1;
  }
  .sheet-title :global(.title-icon) {
    display: inline-flex;
    align-items: center;
    line-height: 0;
  }
  .sheet-title :global(.title-icon svg) {
    width: 11px;
    height: 11px;
  }
  .sheet-close {
    background: none;
    border: none;
    color: var(--text-ghost);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
  }
  .sheet-close:hover { color: var(--text-dim); }
  .sheet-close :global(svg) { width: 12px; height: 12px; }
  .sheet-body {
    overflow-y: auto;
    padding: 0 14px 14px;
    flex: 1;
    min-height: 0;
  }
  .sheet-footer {
    border-top: 1px solid var(--border);
    padding: 4px 14px 3px;
    padding-bottom: calc(3px + env(safe-area-inset-bottom, 0px));
  }
  .sheet-footer:not(:has(*)) {
    display: none;
  }
</style>
