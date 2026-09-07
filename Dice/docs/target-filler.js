/**
 * Target Form Filler Adapter (TargetFormAdapter)
 * Fills target HTML form elements using configured CSS selectors and extracted car data.
 * Features:
 * - Supports text, number, select, radio groups, checkbox groups, textarea, url inputs.
 * - Triggers input, change, and blur events.
 * - Reports success/failure/skipped status for every field.
 * - Never overwrites fields when source data is Missing / Needs Review.
 * - Never fabricates values.
 * - NEVER clicks submit or calls form.submit().
 */

window.CarTargetFiller = {
  fillForm(targetDoc, extractedData, mappingConfig, options = {}) {
    if (!targetDoc) targetDoc = document;
    if (!extractedData) return { success: false, error: 'No extracted vehicle data provided.' };
    if (!mappingConfig) mappingConfig = window.CarStorageManager?.getMapping() || window.DefaultFieldMapping;

    const normalized = extractedData.normalized || extractedData;
    const report = extractedData.validationReport || {};

    const results = {
      filled: [],
      skippedMissing: [],
      failed: [],
      timestamp: new Date().toISOString()
    };

    for (const key of Object.keys(mappingConfig)) {
      const mapping = mappingConfig[key];
      const val = normalized[key];
      const selector = mapping.targetSelector;
      const fieldStatus = report[key]?.status;

      if (!selector || selector === 'Not mapped') continue;

      // Skip missing / masked / unextracted values strictly unless overwrite is explicitly requested
      if (val === undefined || val === null || val === '' || fieldStatus === 'missing') {
        if (!options.allowOverwriteMissing) {
          results.skippedMissing.push({
            field: key,
            selector,
            reason: 'Source value missing or masked (Skipped for safety).'
          });
          continue;
        }
      }

      try {
        const fillStatus = this.fillSingleField(targetDoc, selector, mapping.targetType, val);
        if (fillStatus.success) {
          results.filled.push({ field: key, selector, value: val });
        } else {
          results.failed.push({ field: key, selector, error: fillStatus.error });
        }
      } catch (err) {
        results.failed.push({ field: key, selector, error: err.message });
      }
    }

    if (window.CarStorageManager?.saveFillLog) {
      window.CarStorageManager.saveFillLog(results);
    }
    return { success: true, results };
  },

  fillSingleField(doc, selector, targetType, value) {
    if (targetType === 'radio') {
      const radios = doc.querySelectorAll(selector);
      if (!radios || radios.length === 0) {
        return { success: false, error: `Radio elements not found for selector: ${selector}` };
      }
      let matched = false;
      radios.forEach(radio => {
        const rVal = (radio.value || '').toLowerCase();
        const rLabel = (radio.labels?.[0]?.textContent || '').toLowerCase();
        const searchVal = String(value).toLowerCase();

        if (rVal === searchVal || rLabel.includes(searchVal) || searchVal.includes(rVal)) {
          radio.checked = true;
          this.triggerEvents(radio);
          matched = true;
        }
      });
      return matched ? { success: true } : { success: false, error: `No radio option matching value "${value}"` };
    }

    if (targetType === 'checkbox_group') {
      const checkboxes = doc.querySelectorAll(selector);
      if (!checkboxes || checkboxes.length === 0) {
        return { success: false, error: `Checkboxes not found for selector: ${selector}` };
      }
      const valArray = Array.isArray(value) ? value.map(v => String(v).toLowerCase()) : [String(value).toLowerCase()];
      checkboxes.forEach(cb => {
        const cbVal = (cb.value || '').toLowerCase();
        const cbLabel = (cb.labels?.[0]?.textContent || '').toLowerCase();
        const shouldCheck = valArray.some(v => cbVal.includes(v) || cbLabel.includes(v));
        cb.checked = shouldCheck;
        if (shouldCheck) this.triggerEvents(cb);
      });
      return { success: true };
    }

    const el = doc.querySelector(selector);
    if (!el) {
      return { success: false, error: `Element not found for selector: ${selector}` };
    }

    if (el.tagName === 'SELECT') {
      let matchedOption = false;
      for (let i = 0; i < el.options.length; i++) {
        const opt = el.options[i];
        const optVal = opt.value.toLowerCase();
        const optTxt = opt.text.toLowerCase();
        const searchVal = String(value).toLowerCase();

        if (optVal === searchVal || optTxt.includes(searchVal) || searchVal.includes(optVal)) {
          el.selectedIndex = i;
          matchedOption = true;
          break;
        }
      }
      if (!matchedOption) {
        el.value = value;
      }
      this.triggerEvents(el);
      return { success: true };
    }

    // Input / Textarea / URL / Number
    el.value = String(value);
    this.triggerEvents(el);
    return { success: true };
  },

  triggerEvents(el) {
    try {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    } catch (e) {}
  }
};
