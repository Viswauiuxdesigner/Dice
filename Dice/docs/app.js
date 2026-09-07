/**
 * Main Controller for the Car Data Helper Test Harness Dashboard.
 * Phase 2: Supports CarsCoZaAdapter and DummySourceAdapter modular extractions.
 */

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initMappingEditor();
  loadDashboardState();
});

// Tab Navigation
function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const targetId = tab.getAttribute('data-tab');
      document.getElementById(targetId).classList.add('active');
    });
  });
}

let currentExtractionResult = null;

// Integrated Test Harness Actions
window.extractFromIframeSource = function() {
  const sourceIframe = document.getElementById('iframe-source');
  try {
    const iframeDoc = sourceIframe.contentDocument || sourceIframe.contentWindow.document;
    currentExtractionResult = window.CarSourceExtractor.extractFromDocument(iframeDoc);
    
    // Save to LocalStorage
    window.CarStorageManager.saveExtractedData(currentExtractionResult);
    
    // Render Preview Table
    renderExtractionPreview(currentExtractionResult);
    
    // Enable Fill Button
    const fillBtn = document.getElementById('btn-fill-target-iframe');
    if (fillBtn) fillBtn.disabled = false;
    
    showToast(`Car data extracted successfully using ${currentExtractionResult.adapter}!`);
  } catch (err) {
    alert('Extraction Error: ' + err.message + '\nNote: Ensure same-origin iframe access.');
  }
};

window.fillTargetIframe = function() {
  if (!currentExtractionResult) {
    currentExtractionResult = window.CarStorageManager.getExtractedData();
  }
  if (!currentExtractionResult) {
    alert('No extracted car data available! Please extract data first.');
    return;
  }

  const targetIframe = document.getElementById('iframe-target');
  try {
    const targetDoc = targetIframe.contentDocument || targetIframe.contentWindow.document;
    const mapping = window.CarStorageManager.getMapping();
    const fillReport = window.CarTargetFiller.fillForm(targetDoc, currentExtractionResult, mapping);
    
    renderFillSummary(fillReport.results);
    showToast('Target form populated! Please review fields manually.');
  } catch (err) {
    alert('Form Filler Error: ' + err.message);
  }
};

// Render Extracted Data Preview Table
function renderExtractionPreview(extractionResult) {
  const container = document.getElementById('preview-table-container');
  if (!container) return;

  const data = extractionResult.normalized;
  const rawData = extractionResult.raw || {};
  const report = extractionResult.validationReport;
  const mapping = window.CarStorageManager.getMapping();
  const adapterName = extractionResult.adapter || 'Unknown Adapter';

  let html = `
    <div style="background:#1e293b; border:1px solid #334155; padding:8px 12px; border-radius:6px; margin-bottom:12px; font-size:0.85rem;">
      🔹 <strong>Active Source Adapter:</strong> <span style="color:#38bdf8;">${adapterName}</span>
      &nbsp;|&nbsp; 
      🕒 <strong>Extracted At:</strong> <span style="color:#94a3b8;">${new Date(extractionResult.timestamp).toLocaleTimeString()}</span>
    </div>
    <table>
      <thead>
        <tr>
          <th>Field Name</th>
          <th>Raw Extracted Value</th>
          <th>Normalized Value</th>
          <th>Validation Status</th>
          <th>Target Form Selector</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const key of Object.keys(data)) {
    const val = data[key];
    const rawVal = rawData[key];
    const valStatus = report[key] || { status: 'missing', label: 'Missing' };
    const fieldMapping = mapping[key] || { targetSelector: 'Not mapped' };

    let statusTagClass = 'status-missing';
    if (valStatus.status === 'extracted') statusTagClass = 'status-extracted';
    if (valStatus.status === 'invalid') statusTagClass = 'status-error';

    const displayVal = Array.isArray(val) ? val.join(', ') : (val !== '' && val !== null && val !== undefined ? val : '<em>[Empty / Masked]</em>');
    const displayRaw = Array.isArray(rawVal) ? rawVal.join(', ') : (rawVal || '<em>[Unspecified]</em>');

    html += `
      <tr>
        <td><strong>source.${key}</strong></td>
        <td style="max-width:200px; word-break:break-word; color:#cbd5e1; font-size:0.82rem;">${displayRaw}</td>
        <td style="max-width:220px; word-break:break-word;">${displayVal}</td>
        <td><span class="status-tag ${statusTagClass}">${valStatus.label}</span></td>
        <td><code style="color:#60a5fa;">${fieldMapping.targetSelector}</code></td>
      </tr>
    `;
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}

// Render Fill Summary
function renderFillSummary(results) {
  const container = document.getElementById('fill-summary-container');
  if (!container) return;

  let html = `
    <div style="display:flex; gap:12px; margin-bottom:12px;">
      <div style="background:#065f46; color:#34d399; padding:8px 12px; border-radius:6px; font-weight:600; font-size:0.85rem;">
        ✅ Successfully Filled: ${results.filled.length}
      </div>
      <div style="background:#78350f; color:#fbbf24; padding:8px 12px; border-radius:6px; font-weight:600; font-size:0.85rem;">
        ⚠️ Skipped / Missing: ${results.skippedMissing.length}
      </div>
      <div style="background:#7f1d1d; color:#f87171; padding:8px 12px; border-radius:6px; font-weight:600; font-size:0.85rem;">
        ❌ Failed: ${results.failed.length}
      </div>
    </div>
  `;

  container.innerHTML = html;
}

// Mapping Configuration Editor
function initMappingEditor() {
  const editorContainer = document.getElementById('mapping-editor-container');
  if (!editorContainer) return;

  const currentMapping = window.CarStorageManager.getMapping();
  renderMappingEditorTable(currentMapping);
}

function renderMappingEditorTable(mappingObj) {
  const container = document.getElementById('mapping-editor-container');
  if (!container) return;

  let html = `
    <table>
      <thead>
        <tr>
          <th>Source Property</th>
          <th>Target CSS Selector / Input ID</th>
          <th>Control Type</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const key of Object.keys(mappingObj)) {
    const item = mappingObj[key];
    html += `
      <tr>
        <td><strong>source.${key}</strong></td>
        <td>
          <input type="text" class="mapping-input" data-key="${key}" value="${item.targetSelector || ''}">
        </td>
        <td><span class="badge" style="background:#334155; color:#cbd5e1;">${item.targetType || 'text'}</span></td>
        <td style="color:#94a3b8; font-size:0.8rem;">${item.description || ''}</td>
      </tr>
    `;
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}

window.saveMappingChanges = function() {
  const inputs = document.querySelectorAll('.mapping-input');
  const currentMapping = window.CarStorageManager.getMapping();

  inputs.forEach(input => {
    const key = input.getAttribute('data-key');
    if (currentMapping[key]) {
      currentMapping[key].targetSelector = input.value.trim();
    }
  });

  window.CarStorageManager.saveMapping(currentMapping);
  showToast('Mapping configuration saved to LocalStorage!');
};

window.resetMappingDefaults = function() {
  const defaults = window.CarStorageManager.resetMappingToDefault();
  renderMappingEditorTable(defaults);
  showToast('Mapping reset to defaults.');
};

function showToast(msg) {
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = 'position:fixed; bottom:20px; right:20px; background:#3b82f6; color:#fff; padding:10px 18px; border-radius:6px; font-weight:600; font-size:0.85rem; box-shadow:0 4px 12px rgba(0,0,0,0.3); z-index:9999; animation:fadeIn 0.3s;';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function loadDashboardState() {
  const savedData = window.CarStorageManager.getExtractedData();
  if (savedData) {
    currentExtractionResult = savedData;
    renderExtractionPreview(savedData);
  }
}
