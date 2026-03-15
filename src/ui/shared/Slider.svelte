<script lang="ts">
  import type { Snippet } from 'svelte';
  let {
    label,
    value,
    display,
    min,
    max,
    step = 1,
    size = 'sm',
    oninput,
    tip,
  }: {
    label: string;
    value: number;
    display: string;
    min: number;
    max: number;
    step?: number;
    size?: 'xs' | 'sm' | 'md';
    oninput: (e: Event) => void;
    tip?: Snippet;
  } = $props();
</script>

<div class="slider-row">
  <label><span class="label-group">{label}{#if tip}{@render tip()}{/if}</span><span class="value-label">{display}</span></label>
  <input type="range" class="slider slider-{size}" {min} {max} {step} {value} {oninput}>
</div>

<style>
  .slider-row {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 7px;
    margin: 6px 0 8px;
  }
  label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: var(--text-dim);
    font-size: 12px;
  }
  .value-label { color: var(--text-muted); }
  .slider {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    background: var(--border);
    outline: none;
    cursor: pointer;
  }

  /* xs: 8px thumb, 2px track */
  .slider-xs { height: 2px; }
  .slider-xs::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 8px; height: 8px; background: var(--text-dim); border: none; cursor: pointer; }
  .slider-xs::-moz-range-thumb { width: 8px; height: 8px; background: var(--text-dim); border: none; cursor: pointer; }

  /* sm: 10px thumb, 3px track */
  .slider-sm { height: 3px; }
  .slider-sm::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 10px; height: 10px; background: var(--text-dim); border: none; cursor: pointer; }
  .slider-sm::-moz-range-thumb { width: 10px; height: 10px; background: var(--text-dim); border: none; cursor: pointer; }

  /* md: 14px thumb, 4px track */
  .slider-md { height: 4px; }
  .slider-md::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px; background: var(--text-dim); border: none; cursor: pointer; }
  .slider-md::-moz-range-thumb { width: 14px; height: 14px; background: var(--text-dim); border: none; cursor: pointer; }

  .slider:hover::-webkit-slider-thumb { background: var(--text); }
  .slider:hover::-moz-range-thumb { background: var(--text); }

  /* Touch-friendly sizing */
  @media (pointer: coarse) {
    .slider-row { gap: 8px; margin: 8px 0 10px; }
    .slider-xs { height: 3px; }
    .slider-xs::-webkit-slider-thumb { width: 14px; height: 14px; border-radius: 50%; }
    .slider-xs::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; }
    .slider-sm { height: 4px; }
    .slider-sm::-webkit-slider-thumb { width: 16px; height: 16px; border-radius: 50%; }
    .slider-sm::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; }
    .slider-md { height: 5px; }
    .slider-md::-webkit-slider-thumb { width: 20px; height: 20px; border-radius: 50%; }
    .slider-md::-moz-range-thumb { width: 20px; height: 20px; border-radius: 50%; }
  }
</style>
