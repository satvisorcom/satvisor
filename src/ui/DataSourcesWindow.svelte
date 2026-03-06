<script lang="ts">
  import DraggableWindow from './shared/DraggableWindow.svelte';
  import MobileSheet from './shared/MobileSheet.svelte';
  import Checkbox from './shared/Checkbox.svelte';
  import Button from './shared/Button.svelte';
  import Input from './shared/Input.svelte';
  import { uiStore } from '../stores/ui.svelte';
  import { sourcesStore, type TLESourceConfig, type SourceType } from '../stores/sources.svelte';
  import { ICON_DATA_SOURCES, ICON_DOWNLOAD, ICON_EDIT, ICON_CLOSE } from './shared/icons';
  import { tooltip } from './shared/tooltip';
  import VirtualList from './shared/VirtualList.svelte';
  import { textToRecords, ommToJson, type DataFormat } from '../data/omm-formats';

  let addingUrl = $state(false);
  let newName = $state('');
  let newUrl = $state('');
  let fileInput: HTMLInputElement | undefined = $state();
  let filterQuery = $state('');

  // TLE editor modal state
  let editOpen = $state(false);
  let editName = $state('');
  let editText = $state('');
  let editSourceId: string | null = $state(null);
  let editOriginalType: SourceType | null = $state(null);

  // Visual editor state
  let editorTab = $state<'raw' | 'visual'>('raw');
  let editRecords = $state<Record<string, unknown>[]>([]);
  let editParseError = $state<string | null>(null);
  let editDetectedFormat = $state<DataFormat>('tle');

  const VISUAL_COLUMNS: { key: string; label: string; width: string }[] = [
    { key: 'OBJECT_NAME', label: 'Name', width: '1' },
    { key: 'NORAD_CAT_ID', label: 'NORAD', width: '60px' },
    { key: 'EPOCH', label: 'Epoch', width: '150px' },
    { key: 'INCLINATION', label: 'Inc', width: '56px' },
    { key: 'RA_OF_ASC_NODE', label: 'RAAN', width: '56px' },
    { key: 'ECCENTRICITY', label: 'Ecc', width: '66px' },
    { key: 'ARG_OF_PERICENTER', label: 'ArgP', width: '56px' },
    { key: 'MEAN_ANOMALY', label: 'MA', width: '56px' },
    { key: 'MEAN_MOTION', label: 'n', width: '66px' },
    { key: 'BSTAR', label: 'B*', width: '66px' },
  ];

  function switchEditorTab(tab: 'raw' | 'visual') {
    if (tab === editorTab) return;
    if (tab === 'visual') {
      // Parse raw text into records
      try {
        const result = textToRecords(editText.trim());
        editRecords = result.records;
        editDetectedFormat = result.format;
        editParseError = editRecords.length === 0 ? 'No satellite records found' : null;
      } catch (e) {
        editParseError = String(e instanceof Error ? e.message : e);
        editRecords = [];
      }
    } else {
      // Serialize records back to JSON
      if (editRecords.length > 0) {
        editText = ommToJson(editRecords);
      }
    }
    editorTab = tab;
  }

  function updateRecordField(idx: number, key: string, value: string) {
    editRecords[idx] = { ...editRecords[idx], [key]: value };
  }

  function deleteRecord(idx: number) {
    editRecords = editRecords.filter((_, i) => i !== idx);
  }

  function addRecord() {
    editRecords = [...editRecords, {
      OBJECT_NAME: 'NEW SAT',
      OBJECT_ID: '',
      NORAD_CAT_ID: '',
      EPOCH: new Date().toISOString().replace('Z', ''),
      MEAN_MOTION: '15.0',
      ECCENTRICITY: '0.001',
      INCLINATION: '51.6',
      RA_OF_ASC_NODE: '0',
      ARG_OF_PERICENTER: '0',
      MEAN_ANOMALY: '0',
      EPHEMERIS_TYPE: '0',
      CLASSIFICATION_TYPE: 'U',
      ELEMENT_SET_NO: '999',
      REV_AT_EPOCH: '0',
      BSTAR: '0',
      MEAN_MOTION_DOT: '0',
      MEAN_MOTION_DDOT: '0',
    }];
  }

  let builtinSources = $derived(sourcesStore.sources.filter(s => s.builtin));
  let filteredBuiltins = $derived.by(() => {
    if (!filterQuery) return builtinSources;
    const q = filterQuery.toLowerCase();
    return builtinSources.filter(s => s.name.toLowerCase().includes(q));
  });
  let customSources = $derived(sourcesStore.sources.filter(s => !s.builtin));
  let allSources = $derived(sourcesStore.sources);
  let enabledCount = $derived(sourcesStore.enabledIds.size);
  let allEnabled = $derived(enabledCount === allSources.length && allSources.length > 0);
  let someEnabled = $derived(enabledCount > 0 && !allEnabled);

  function submitUrl() {
    const name = newName.trim();
    const url = newUrl.trim();
    if (!name || !url) return;
    sourcesStore.addCustomUrl(name, url);
    newName = '';
    newUrl = '';
    addingUrl = false;
  }

  function onUrlKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') submitUrl();
    if (e.key === 'Escape') addingUrl = false;
  }

  function onFileChange() {
    const file = fileInput?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const name = file.name.replace(/\.(tle|txt|3le|json|csv|xml|kvn)$/i, '');
      sourcesStore.addCustomFile(name, reader.result as string);
    };
    reader.readAsText(file);
    if (fileInput) fileInput.value = '';
  }

  function getStatus(id: string): string {
    const state = sourcesStore.loadStates.get(id);
    if (!state) return '';
    if (state.status === 'loading') return '...';
    if (state.status === 'error') return 'err';
    if (state.status === 'loaded') return `${state.satCount}`;
    return '';
  }

  function formatAge(ms: number): string {
    const min = Math.floor(ms / 60_000);
    if (min < 1) return '<1m';
    if (min < 60) return `${min}m`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  }

  function epochRow(label: string, ms: number): string {
    return `  ${label}  <span class="val">${formatAge(ms)}</span>`;
  }

  function getEpochAgeInfo(src: { id: string }): { label: string; tooltip: string } | null {
    const state = sourcesStore.loadStates.get(src.id);
    if (state?.status !== 'loaded' || !state.epochAge) return null;
    const ea = state.epochAge;
    const label = formatAge(ea.avgMs);
    const lines = [
      `<b>Epoch age</b> <span class="dim">(TLE freshness)</span>`,
      epochRow('Newest ', ea.newestMs),
      epochRow('P25    ', ea.p25Ms),
      epochRow('Median ', ea.p50Ms),
      epochRow('Average', ea.avgMs),
      epochRow('P75    ', ea.p75Ms),
      epochRow('Oldest ', ea.oldestMs),
    ];
    let html = lines.join('\n');
    if (state.cacheAge != null) {
      html += `<div class="sep"></div>Fetched <span class="val">${formatAge(state.cacheAge)}</span> ago`;
    }
    return { label, tooltip: html };
  }

  function openPasteModal() {
    editSourceId = null;
    editOriginalType = null;
    editName = '';
    editText = '';
    editorTab = 'raw';
    editRecords = [];
    editParseError = null;
    editOpen = true;
  }

  async function openEditModal(src: TLESourceConfig) {
    const text = await sourcesStore.getRawText(src);
    if (!text) return;
    editSourceId = src.id;
    editOriginalType = src.type;
    editName = src.type === 'celestrak' ? src.name + ' (copy)' : src.name;
    editText = text;
    // Parse into visual records immediately
    try {
      const result = textToRecords(text.trim());
      editRecords = result.records;
      editDetectedFormat = result.format;
      editParseError = editRecords.length === 0 ? 'No satellite records found' : null;
    } catch (e) {
      editParseError = String(e instanceof Error ? e.message : e);
      editRecords = [];
    }
    editorTab = 'visual';
    editOpen = true;
  }

  async function downloadSource(src: TLESourceConfig) {
    const text = await sourcesStore.getRawText(src);
    if (!text) return;
    const isJson = text.trimStart()[0] === '[';
    const blob = new Blob([text], { type: isJson ? 'application/json' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = src.name.replace(/[^a-zA-Z0-9_-]/g, '_') + (isJson ? '.json' : '.tle');
    a.click();
    URL.revokeObjectURL(url);
  }

  function saveEdit() {
    const name = editName.trim();
    // If on visual tab, serialize records to JSON first
    const text = (editorTab === 'visual' && editRecords.length > 0)
      ? ommToJson(editRecords)
      : editText.trim();
    if (!name || !text) return;

    if (!editSourceId) {
      // New paste
      sourcesStore.addCustomFile(name, text);
    } else if (editOriginalType === 'celestrak') {
      // Fork celestrak as new custom
      sourcesStore.addCustomFile(name, text);
    } else if (editOriginalType === 'url') {
      // Convert URL source to text
      sourcesStore.convertToText(editSourceId, text);
      if (name !== sourcesStore.sources.find(s => s.id === editSourceId)?.name) {
        sourcesStore.renameCustom(editSourceId, name);
      }
    } else {
      // Update existing text source
      sourcesStore.updateCustomText(editSourceId, text);
      if (name !== sourcesStore.sources.find(s => s.id === editSourceId)?.name) {
        sourcesStore.renameCustom(editSourceId, name);
      }
    }
    editOpen = false;
  }

  function hasCachedData(src: TLESourceConfig): boolean {
    const state = sourcesStore.loadStates.get(src.id);
    return state?.status === 'loaded';
  }
</script>

{#snippet dsIcon()}<span class="title-icon">{@html ICON_DATA_SOURCES}</span>{/snippet}
{#snippet windowContent()}
  <div class="ds-content">
    <div class="master-row">
      <Checkbox size="sm"
        checked={allEnabled}
        mixed={someEnabled}
        onchange={() => allEnabled ? sourcesStore.disableAllSources() : sourcesStore.enableAllSources(allSources.map(s => s.id))} />
      <span class="master-label">{enabledCount} / {allSources.length} enabled</span>
    </div>
    <Input
      class="filter-input"
      size="lg"
      type="text"
      placeholder="Filter sources..."
      bind:value={filterQuery}
      spellcheck="false"
      autocomplete="off"
    />

    <div class="section">
      <div class="section-header">CelesTrak{#if filterQuery} <span class="filter-count">({filteredBuiltins.length})</span>{/if}</div>
      <div class="source-list">
        {#each filteredBuiltins as src}
          {@const epochInfo = getEpochAgeInfo(src)}
          {@const enabled = sourcesStore.enabledIds.has(src.id)}
          <label class="source-row">
            <Checkbox size="sm"
              checked={enabled}
              onchange={() => sourcesStore.toggleSource(src.id)} />
            <span class="source-name">{src.name}</span>
            {#if enabled}
              <span class="source-count">{getStatus(src.id)}</span>
            {/if}
            {#if epochInfo}
              <span class="epoch-age" use:tooltip={{ html: epochInfo.tooltip }}>{epochInfo.label}</span>
            {/if}
            {#if hasCachedData(src)}
              <button class="action-btn" title="Download" onclick={(e) => { e.preventDefault(); downloadSource(src); }}>{@html ICON_DOWNLOAD}</button>
              <button class="action-btn" title="Edit as copy" onclick={(e) => { e.preventDefault(); openEditModal(src); }}>{@html ICON_EDIT}</button>
            {/if}
          </label>
        {/each}
      </div>
    </div>

    <div class="section">
      <div class="section-header">Custom</div>
      {#if customSources.length > 0}
        <div class="source-list custom-list">
          {#each customSources as src}
            {@const epochInfo = getEpochAgeInfo(src)}
            <label class="source-row">
              <Checkbox size="sm"
                checked={sourcesStore.enabledIds.has(src.id)}
                onchange={() => sourcesStore.toggleSource(src.id)} />
              <span class="source-name">{src.name}</span>
              {#if sourcesStore.enabledIds.has(src.id)}
                <span class="source-count">{getStatus(src.id)}</span>
              {/if}
              {#if epochInfo}
                <span class="epoch-age" use:tooltip={{ html: epochInfo.tooltip }}>{epochInfo.label}</span>
              {/if}
              {#if hasCachedData(src)}
                <button class="action-btn" title="Download" onclick={(e) => { e.preventDefault(); downloadSource(src); }}>{@html ICON_DOWNLOAD}</button>
                <button class="action-btn" title="Edit" onclick={(e) => { e.preventDefault(); openEditModal(src); }}>{@html ICON_EDIT}</button>
              {/if}
              <button class="delete-btn" title="Remove source" onclick={(e) => { e.preventDefault(); sourcesStore.removeCustom(src.id); }}>{@html ICON_CLOSE}</button>
            </label>
          {/each}
        </div>
      {:else}
        <div class="empty-hint">No custom sources</div>
      {/if}

      {#if addingUrl}
        <div class="add-form">
          <Input class="add-input" type="text" placeholder="Name" bind:value={newName} onkeydown={onUrlKeydown} />
          <Input class="add-input" type="text" placeholder="URL" bind:value={newUrl} onkeydown={onUrlKeydown} />
          <div class="add-actions">
            <Button variant="ghost" onclick={() => addingUrl = false}>Cancel</Button>
            <Button onclick={submitUrl}>Add</Button>
          </div>
        </div>
      {:else}
        <div class="add-row">
          <Button onclick={() => addingUrl = true}>+ URL</Button>
          <Button onclick={() => fileInput?.click()}>+ File</Button>
          <Button onclick={openPasteModal}>+ Paste</Button>
          <input type="file" bind:this={fileInput} accept=".tle,.txt,.3le,.json,.csv,.xml,.kvn" style="display:none" onchange={onFileChange}>
        </div>
      {/if}
    </div>
  </div>
{/snippet}

{#if uiStore.isMobile}
  <MobileSheet id="sources" title="Data Sources" icon={dsIcon}>
    {@render windowContent()}
  </MobileSheet>
{:else}
  <DraggableWindow id="data-sources" title="Data Sources" icon={dsIcon} bind:open={uiStore.dataSourcesOpen} initialX={10} initialY={260}>
    {@render windowContent()}
  </DraggableWindow>
{/if}

{#snippet editorTabs()}
  <div class="editor-tab-bar">
    <Button size="xs" variant="ghost" active={editorTab === 'raw'} onclick={() => switchEditorTab('raw')}>Raw</Button>
    <Button size="xs" variant="ghost" active={editorTab === 'visual'} onclick={() => switchEditorTab('visual')}>Visual</Button>
  </div>
{/snippet}

<DraggableWindow title={editSourceId ? 'Edit Source' : 'Paste OMM / TLE Data'} modal bind:open={editOpen} headerExtra={editorTabs}>
  <div class="tle-editor">
    <Input
      class="tle-name-input"
      type="text"
      placeholder="Source name"
      bind:value={editName}
      spellcheck="false"
      autocomplete="off"
    />
    {#if editorTab === 'raw'}
      <textarea
        class="tle-textarea"
        placeholder={'Paste OMM JSON, TLE, CSV, XML, or KVN data...\n\nOMM JSON:\n[{"OBJECT_NAME":"ISS","NORAD_CAT_ID":25544,...}]\n\nTLE:\nISS (ZARYA)\n1 25544U 98067A   24001.00000000 ...\n2 25544  51.6400 100.0000 ...\n\nCSV / XML / KVN from CelesTrak also supported.'}
        bind:value={editText}
        spellcheck="false"
      ></textarea>
    {:else}
      <!-- Visual editor -->
      {#if editParseError}
        <div class="visual-error">{editParseError}</div>
      {:else if editRecords.length === 0}
        <div class="visual-empty">No records yet. Paste data in the Raw tab or add rows below.</div>
      {:else}
        <div class="visual-header">
          <span class="visual-count">{editRecords.length} records</span>
          {#if editDetectedFormat !== 'json'}
            <span class="visual-format">Parsed from {editDetectedFormat.toUpperCase()}</span>
          {/if}
        </div>
        <div class="visual-table-wrap">
          <div class="visual-table-header">
            {#each VISUAL_COLUMNS as col}
              <span class="vth" style={col.width === '1' ? 'flex:1;min-width:90px' : `width:${col.width};flex-shrink:0`}>{col.label}</span>
            {/each}
            <span class="vth vth-del"></span>
          </div>
          {#snippet visualRow(rec: Record<string, unknown>, i: number)}
            <div class="visual-row">
              {#each VISUAL_COLUMNS as col}
                <span class="vcell" style={col.width === '1' ? 'flex:1;min-width:90px' : `width:${col.width};flex-shrink:0`}>
                  <input
                    class="cell-input"
                    type="text"
                    value={String(rec[col.key] ?? '')}
                    oninput={(e) => updateRecordField(i, col.key, (e.target as HTMLInputElement).value)}
                    spellcheck="false"
                  />
                </span>
              {/each}
              <span class="vcell vcell-del">
                <button class="row-delete-btn" title="Remove" onclick={() => deleteRecord(i)}>{@html ICON_CLOSE}</button>
              </span>
            </div>
          {/snippet}
          <VirtualList items={editRecords} rowHeight={24} maxHeight={9999} buffer={20} row={visualRow} />
        </div>
      {/if}
      {#if !editParseError}
        <Button size="sm" variant="ghost" onclick={addRecord}>+ Add Row</Button>
      {/if}
    {/if}
    <div class="tle-editor-actions">
      <Button variant="ghost" onclick={() => editOpen = false}>Cancel</Button>
      <Button onclick={saveEdit}>Save</Button>
    </div>
  </div>
</DraggableWindow>

<style>
  .ds-content {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 300px;
  }
  @media (max-width: 767px) {
    .ds-content { width: 100%; }
  }
  .master-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .master-label {
    font-size: 11px;
    color: var(--text-muted);
  }
  :global(.filter-input) { width: 100%; }
  .filter-count { color: var(--text-faint); font-size: 10px; }
  .section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .section-header {
    font-size: 10px;
    color: var(--text-ghost);
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }
  .source-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 140px;
    overflow-y: auto;
    padding-right: 10px;
  }
  .custom-list {
    max-height: 120px;
  }
  .source-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    cursor: pointer;
    color: var(--text-dim);
    line-height: 20px;
    padding: 1px 0;
  }
  .source-row:hover { color: var(--text); }


  .source-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .source-count {
    font-size: 11px;
    color: var(--text-ghost);
    flex-shrink: 0;
  }
  .epoch-age {
    font-size: 10px;
    color: var(--text-faint);
    flex-shrink: 0;
    white-space: pre-line;
    cursor: default;
  }
  .action-btn {
    background: none;
    border: none;
    color: var(--text-ghost);
    cursor: pointer;
    padding: 0 1px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    width: 14px;
    height: 14px;
  }
  .action-btn :global(svg) { width: 12px; height: 12px; }
  .action-btn:hover { color: var(--text); }

  .delete-btn {
    background: none;
    border: none;
    color: var(--text-ghost);
    cursor: pointer;
    padding: 0 1px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    width: 14px;
    height: 14px;
  }
  .delete-btn :global(svg) { width: 10px; height: 10px; }
  .delete-btn:hover { color: var(--danger-bright); }

  .empty-hint {
    font-size: 11px;
    color: var(--text-ghost);
    font-style: italic;
  }

  .add-row {
    display: flex;
    gap: 4px;
    margin-top: 2px;
  }
  .add-form {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 2px;
  }
  :global(.add-input) { width: 100%; }

  .add-actions {
    display: flex;
    gap: 4px;
  }


  /* TLE editor modal — override modal-window sizing */
  :global(.modal-window:has(.tle-editor)) {
    max-width: 860px;
    height: 80vh;
    max-height: 700px;
    display: flex;
    flex-direction: column;
  }
  :global(.modal-window:has(.tle-editor) .window-body) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .tle-editor {
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex: 1;
    min-height: 0;
  }
  :global(.tle-name-input) { width: 100%; }
  .tle-textarea {
    width: 100%;
    flex: 1;
    min-height: 120px;
    resize: none;
    background: var(--ui-bg);
    color: var(--text);
    border: 1px solid var(--border);
    font-family: 'Overpass Mono', monospace;
    font-size: 11px;
    padding: 10px;
    line-height: 1.4;
  }
  .tle-textarea::placeholder { color: var(--text-ghost); }
  .tle-textarea:focus { outline: 1px solid var(--text-faint); }
  .tle-editor-actions {
    display: flex;
    gap: 4px;
    justify-content: flex-end;
  }

  /* Editor tab bar */
  .editor-tab-bar {
    display: flex;
    align-items: center;
    gap: 1px;
    margin-left: auto;
    margin-right: 8px;
  }

  /* Visual editor */
  .visual-error {
    color: var(--danger);
    font-size: 11px;
    padding: 12px;
    text-align: center;
  }
  .visual-empty {
    color: var(--text-ghost);
    font-size: 11px;
    padding: 12px;
    text-align: center;
    font-style: italic;
  }
  .visual-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    color: var(--text-ghost);
  }
  .visual-format {
    color: var(--text-faint);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .visual-table-wrap {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--border);
    display: flex;
    flex-direction: column;
  }
  .visual-table-wrap :global(.vl-viewport) {
    flex: 1;
    min-height: 0;
    max-height: unset !important;
  }
  .visual-table-header {
    display: flex;
    align-items: center;
    padding: 3px 4px;
    border-bottom: 1px solid var(--border);
    background: var(--ui-bg);
    flex-shrink: 0;
  }
  .vth {
    color: var(--text-ghost);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
    padding: 0 4px;
  }
  .vth-del { width: 20px; flex-shrink: 0; }
  .visual-row {
    display: flex;
    align-items: center;
    height: 24px;
    border-bottom: 1px solid var(--row-border);
  }
  .visual-row:hover { background: var(--row-hover); }
  .vcell { padding: 0; }
  .vcell-del { width: 20px; flex-shrink: 0; text-align: center; }
  .cell-input {
    width: 100%;
    background: none;
    border: none;
    color: var(--text-muted);
    font-family: 'Overpass Mono', monospace;
    font-size: 10px;
    padding: 3px 4px;
    outline: none;
  }
  .cell-input:focus {
    background: var(--row-hover);
    color: var(--text);
  }
  .row-delete-btn {
    background: none;
    border: none;
    color: var(--text-ghost);
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
    opacity: 0;
  }
  .visual-row:hover .row-delete-btn { opacity: 1; }
  .row-delete-btn:hover { color: var(--danger-bright); }
  .row-delete-btn :global(svg) { width: 8px; height: 8px; }
</style>
