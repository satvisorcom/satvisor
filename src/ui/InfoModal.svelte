<script lang="ts">
  import DraggableWindow from './shared/DraggableWindow.svelte';
  import { uiStore } from '../stores/ui.svelte';
  import { ICON_HELP } from './shared/icons';
</script>

{#snippet helpIcon()}<span class="title-icon">{@html ICON_HELP}</span>{/snippet}

<DraggableWindow title="Help" icon={helpIcon} modal bind:open={uiStore.infoModalOpen}>
  <div class="info-content">
    <div class="touch-controls">
      <div class="section">
        <h3>Touch</h3>
        <div class="ctrl-table">
          <span class="ctrl-key">1 finger drag</span><span class="ctrl-desc">Orbit camera</span>
          <span class="ctrl-key">2 finger drag</span><span class="ctrl-desc">Pan camera</span>
          <span class="ctrl-key">Pinch</span><span class="ctrl-desc">Zoom in / out</span>
          <span class="ctrl-key">Tap satellite</span><span class="ctrl-desc">Select / deselect</span>
        </div>
      </div>
    </div>
    <div class="desktop-controls">
      <div class="section">
        <h3>Mouse</h3>
        <div class="ctrl-table">
          <span class="ctrl-key"><kbd>MMB</kbd> drag</span><span class="ctrl-desc">Orbit camera</span>
          <span class="ctrl-key"><kbd>Shift</kbd>+<kbd>MMB</kbd> drag</span><span class="ctrl-desc">Pan camera</span>
          <span class="ctrl-key"><kbd>Scroll</kbd></span><span class="ctrl-desc">Zoom in / out</span>
          <span class="ctrl-key">Click satellite</span><span class="ctrl-desc">Select / deselect</span>
        </div>
      </div>
      <div class="section">
        <h3>Keyboard</h3>
        <div class="kb-group">
          <span class="kb-label">Time</span>
          <span class="kb-item"><kbd>Space</kbd> pause</span>
          <span class="kb-item"><kbd>.</kbd><kbd>,</kbd> speed</span>
          <span class="kb-item"><kbd>/</kbd> reset</span>
        </div>
        <div class="kb-group">
          <span class="kb-label">View</span>
          <span class="kb-item"><kbd>M</kbd> 2D/3D</span>
          <span class="kb-item"><kbd>S</kbd> sky</span>
          <span class="kb-item"><kbd>Home</kbd> reset</span>
          <span class="kb-item"><kbd>`</kbd> HUD</span>
        </div>
        <div class="kb-group">
          <span class="kb-label">Toggle</span>
          <span class="kb-item"><kbd>C</kbd> clouds</span>
          <span class="kb-item"><kbd>N</kbd> night</span>
          <span class="kb-item"><kbd>L</kbd> orbits</span>
        </div>
        <div class="kb-group">
          <span class="kb-label">Window</span>
          <span class="kb-item"><kbd>D</kbd> sources</span>
          <span class="kb-item"><kbd>P</kbd> passes</span>
          <span class="kb-item"><kbd>O</kbd> observer</span>
          <span class="kb-item"><kbd>R</kbd> radar</span>
        </div>
        <div class="kb-group">
          <span class="kb-label">Search</span>
          <span class="kb-item"><kbd>Ctrl</kbd><kbd>K</kbd> palette</span>
          <span class="kb-item"><kbd>Ctrl</kbd><kbd>F</kbd> satellite</span>
          <span class="kb-item"><kbd>?</kbd> help</span>
        </div>
      </div>
    </div>
    <div class="section">
      <h3>Credits</h3>
      <div class="credits">
        <span>TLE data</span><a href="https://celestrak.org" target="_blank">CelesTrak</a>
        <span>Satellite metadata</span><a href="https://satnogs.org" target="_blank">SatNOGS</a>
        <span>Moon textures</span><a href="https://svs.gsfc.nasa.gov/4720/" target="_blank">NASA SVS CGI Moon Kit</a>
        <span>Planet textures</span><a href="https://www.solarsystemscope.com/textures/" target="_blank">Solar System Scope</a>
        <span>Inspired by</span><a href="https://github.com/aweeri/TLEscope" target="_blank">TLEscope</a>
      </div>
    </div>
    <div class="section">
      <h3>License</h3>
      <a href="https://github.com/satvisorcom/satvisor/blob/master/LICENSE" target="_blank">AGPL-3.0</a>
      &middot; <a href="https://github.com/satvisorcom/satvisor" target="_blank">Source code</a>
    </div>
  </div>
</DraggableWindow>

<style>
  .info-content {
    line-height: 1.6;
  }
  h3 {
    font-size: 14px;
    color: var(--text-dim);
    margin-bottom: 8px;
    font-weight: normal;
  }
  .section { margin-bottom: 14px; }
  .section:last-child { margin-bottom: 0; }
  .ctrl-table {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 12px;
  }
  .ctrl-key { color: var(--text-dim); text-align: right; white-space: nowrap; }
  .ctrl-desc { color: var(--text-muted); }
  .credits {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 12px;
  }
  .credits span { color: var(--text-ghost); }
  a { color: var(--text-faint); text-decoration: none; }
  a:hover { color: var(--text-dim); }
  kbd {
    background: var(--kbd-bg);
    border: 1px solid var(--border);
    padding: 0 4px;
    font-family: inherit;
    font-size: 11px;
    color: var(--text-dim);
  }
  .kb-group {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 8px;
    margin-bottom: 4px;
  }
  .kb-label {
    color: var(--text-ghost);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    width: 42px;
    flex-shrink: 0;
  }
  .kb-item {
    color: var(--text-muted);
    font-size: 11px;
    white-space: nowrap;
  }
  .touch-controls { display: none; }
  .desktop-controls { display: block; margin-bottom: 14px; }
  @media (pointer: coarse) {
    .touch-controls { display: block; }
    .desktop-controls { display: none; }
  }
</style>
