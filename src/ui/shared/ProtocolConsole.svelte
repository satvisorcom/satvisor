<script lang="ts">
  import type { ConsoleLogEntry } from '../../serial/console-types';
  import { parseHexInput } from '../../serial/console-types';
  import VirtualList from './VirtualList.svelte';
  import { tooltip } from './tooltip';
  import { ICON_WARN } from './icons';

  let {
    log,
    connected,
    isBinary = false,
    autoScroll = $bindable(true),
    onSend,
    onSendBytes,
  }: {
    log: ConsoleLogEntry[];
    connected: boolean;
    isBinary?: boolean;
    autoScroll?: boolean;
    onSend: (cmd: string) => void;
    onSendBytes?: (data: Uint8Array) => void;
  } = $props();

  let inputValue = $state('');
  let wrapEl: HTMLDivElement | undefined = $state();
  let commandHistory: string[] = [];
  let historyIdx = -1;
  let userScrolled = false;

  const ROW_H = 17;

  function showText(text: string): string {
    return text.replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  }

  function formatTimestamp(ts: number): string {
    const d = new Date(performance.timeOrigin + ts);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    const s = d.getSeconds().toString().padStart(2, '0');
    const ms = d.getMilliseconds().toString().padStart(3, '0');
    return `${h}:${m}:${s}.${ms}`;
  }

  /** Parse escape sequences in user input so \r \n send real control chars. */
  function parseEscapes(input: string): string {
    return input.replace(/\\\\/g, '\0').replace(/\\r/g, '\r').replace(/\\n/g, '\n').replace(/\0/g, '\\');
  }

  function getViewport(): HTMLElement | null {
    return wrapEl?.querySelector('.vl-viewport') ?? null;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && inputValue.trim()) {
      const raw = inputValue.trim();
      commandHistory.push(raw);
      historyIdx = commandHistory.length;
      if (isBinary && onSendBytes) {
        const bytes = parseHexInput(raw);
        if (bytes) onSendBytes(bytes);
      } else {
        onSend(parseEscapes(raw));
      }
      inputValue = '';
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIdx > 0) {
        historyIdx--;
        inputValue = commandHistory[historyIdx];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx < commandHistory.length - 1) {
        historyIdx++;
        inputValue = commandHistory[historyIdx];
      } else {
        historyIdx = commandHistory.length;
        inputValue = '';
      }
    }
  }

  function handleScroll() {
    const vp = getViewport();
    if (!vp) return;
    const atBottom = vp.scrollHeight - vp.scrollTop - vp.clientHeight < 24;
    if (!atBottom) {
      userScrolled = true;
      autoScroll = false;
    } else if (userScrolled) {
      userScrolled = false;
      autoScroll = true;
    }
  }

  $effect(() => {
    log.length;
    if (autoScroll) {
      requestAnimationFrame(() => {
        const vp = getViewport();
        if (vp) vp.scrollTop = vp.scrollHeight;
      });
    }
  });

  // Attach scroll listener to VirtualList viewport once mounted
  $effect(() => {
    if (!wrapEl) return;
    const vp = getViewport();
    if (!vp) return;
    vp.addEventListener('scroll', handleScroll, { passive: true });
    return () => vp.removeEventListener('scroll', handleScroll);
  });
</script>

<div class="console">
  {#if log.length === 0}
    <div class="console-log empty-log">
      <span class="empty">{connected ? 'Waiting for data…' : 'Not connected'}</span>
    </div>
  {:else}
    <div class="console-log" bind:this={wrapEl}>
      <VirtualList items={log} rowHeight={ROW_H} maxHeight={9999} buffer={10} bottomAlign>
        {#snippet row(entry: ConsoleLogEntry)}
          <div class="log-line" class:tx={entry.direction === 'tx'} class:rx={entry.direction === 'rx'} class:err={!!entry.error}>
            <span class="log-ts">{formatTimestamp(entry.timestamp)}</span>
            <span class="log-dir">{entry.direction === 'tx' ? 'TX' : 'RX'}</span>
            <span class="log-data">{showText(entry.text)}</span>
            {#if entry.error}
              <span class="log-err" use:tooltip={entry.error}>{@html ICON_WARN}</span>
            {/if}
          </div>
        {/snippet}
      </VirtualList>
    </div>
  {/if}
  <div class="console-input">
    <span class="prompt">{isBinary ? 'hex>' : '>'}</span>
    <input
      type="text"
      bind:value={inputValue}
      placeholder={isBinary ? 'FE FE 94 E0 03 FD' : connected ? 'Type command…' : 'Not connected'}
      disabled={!connected}
      onkeydown={handleKeyDown}
    />
  </div>
</div>

<style>
  .console {
    display: flex;
    flex-direction: column;
    height: 100%;
    font-size: 10px;
  }
  .console-log {
    flex: 1;
    overflow: hidden;
    padding: 0 10px;
    line-height: 1.7;
  }
  /* VirtualList viewport fills the container */
  .console-log :global(.vl-viewport) {
    height: 100%;
    max-height: none !important;
    overflow-x: auto;
  }
  .empty-log {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .log-line {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 17px;
    white-space: pre;
  }
  .log-ts { color: var(--text-ghost); flex-shrink: 0; }
  .log-dir { flex-shrink: 0; font-weight: bold; min-width: 16px; }
  .log-line.tx .log-dir { color: var(--warning); }
  .log-line.rx .log-dir { color: var(--live); }
  .log-data { color: var(--text-muted); }
  .log-line.err .log-data { color: var(--danger); }
  .log-err {
    color: var(--danger-bright);
    flex-shrink: 0;
    cursor: default;
  }
  .log-err :global(svg) { width: 11px; height: 11px; vertical-align: -1.5px; }
  .empty { color: var(--text-ghost); }

  .console-input {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px 10px;
  }
  .prompt { color: var(--text-dim); flex-shrink: 0; }
  .console-input input {
    flex: 1;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--border);
    color: var(--text-muted);
    font-family: inherit;
    font-size: 10px;
    padding: 2px 0;
  }
  .console-input input:disabled { opacity: 0.4; }
  .console-input input:focus { border-bottom-color: var(--border-hover); outline: none; }
  .console-input input::placeholder { color: var(--text-ghost); }
</style>
