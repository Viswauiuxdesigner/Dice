// ==UserScript==
// @name         Car Data Entry Helper (Cars.co.za -> Target Form)
// @namespace    http://local.carhelper/
// @version      1.0.0
// @description  Local browser automation helper for car data extraction from Cars.co.za and legacy form auto-filling on Android & Desktop.
// @author       Antigravity
// @match        https://www.cars.co.za/for-sale/*
// @match        https://*.github.io/*
// @match        http://*.github.io/*
// @match        *://*/*cars-co-za-sample.html*
// @match        *://*/*dummy-source.html*
// @match        *://*/*dummy-target.html*
// @match        *://*/*target*
// @match        file://*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-end
// ==UserScript==

(function () {
  'use strict';

  // --- 1. NORMALIZERS ENGINE ---
  const Normalizers = {
    cleanText(val) {
      if (!val || typeof val !== 'string') return '';
      return val.replace(/\s+/g, ' ').trim();
    },
    normalizeYear(val) {
      if (!val) return '';
      const match = String(val).match(/\b(19\d\d|20\d\d)\b/);
      return match ? parseInt(match[1], 10) : '';
    },
    normalizeMileage(val) {
      if (!val) return '';
      const digitsOnly = String(val).replace(/[^\d]/g, '');
      return digitsOnly ? parseInt(digitsOnly, 10) : '';
    },
    normalizePrice(val) {
      if (!val) return '';
      const digitsOnly = String(val).replace(/[^\d]/g, '');
      return digitsOnly ? parseInt(digitsOnly, 10) : '';
    },
    normalizeTransmission(val) {
      if (!val) return '';
      const str = String(val).toLowerCase();
      if (str.includes('auto') || str.includes('steptronic') || str.includes('cvt') || str.includes('dsg')) return 'Automatic';
      if (str.includes('manual') || str.includes('stick')) return 'Manual';
      return this.cleanText(val);
    },
    normalizeFuel(val) {
      if (!val) return '';
      const str = String(val).toLowerCase();
      if (str.includes('petrol') || str.includes('gasoline')) return 'Petrol';
      if (str.includes('diesel')) return 'Diesel';
      if (str.includes('hybrid')) return 'Hybrid';
      if (str.includes('electric') || str.includes('ev')) return 'Electric';
      return this.cleanText(val);
    },
    normalizeDrivetrain(val) {
      if (!val) return '';
      const str = String(val).toLowerCase();
      if (str.includes('4x4') || str.includes('4wd') || str.includes('awd') || str.includes('all-wheel')) return 'AWD/4WD';
      if (str.includes('fwd') || str.includes('front')) return 'FWD';
      if (str.includes('rwd') || str.includes('rear')) return 'RWD';
      return this.cleanText(val);
    },
    normalizeFeatures(val) {
      if (!val) return [];
      if (Array.isArray(val)) return val.map(f => this.cleanText(f)).filter(Boolean);
      if (typeof val === 'string') return val.split(/[,;\n]/).map(f => this.cleanText(f)).filter(Boolean);
      return [];
    }
  };

  // --- 2. VALIDATORS ENGINE ---
  const Validators = {
    validateField(key, value) {
      if (value === null || value === undefined || value === '') {
        return { status: 'missing', label: 'Missing / Needs Review' };
      }
      if (typeof value === 'string' && (value.includes('***') || value.includes('Contact Dealer') || value.includes('N/A'))) {
        return { status: 'missing', label: 'Missing / Needs Review' };
      }
      if (key === 'year') {
        const num = Number(value);
        if (isNaN(num) || num < 1900 || num > 2030) return { status: 'invalid', label: 'Invalid Format' };
      }
      if (key === 'price' || key === 'mileage') {
        const num = Number(value);
        if (isNaN(num) || num < 0) return { status: 'invalid', label: 'Invalid Format' };
      }
      return { status: 'extracted', label: 'Extracted' };
    },
    validateAll(data) {
      const report = {};
      for (const k of Object.keys(data)) {
        report[k] = this.validateField(k, data[k]);
      }
      return report;
    }
  };

  // --- 3. CARS.CO.ZA ADAPTER ---
  const CarsCoZaAdapter = {
    canHandle(doc) {
      const url = doc.location?.href || '';
      return url.includes('cars.co.za') || doc.querySelector('#cars-co-za-marker') !== null || doc.title.includes('Cars.co.za');
    },
    extract(doc) {
      let jsonLdData = {};
      try {
        const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
        scripts.forEach(script => {
          try {
            const parsed = JSON.parse(script.textContent);
            if (parsed['@type'] === 'Car' || parsed['@type'] === 'Vehicle') jsonLdData = parsed;
          } catch (e) {}
        });
      } catch (e) {}

      const getMeta = (props) => {
        for (const p of props) {
          const el = doc.querySelector(`meta[property="${p}"], meta[name="${p}"]`);
          if (el && el.getAttribute('content')) return el.getAttribute('content').trim();
        }
        return '';
      };

      const getDOMText = (selectors) => {
        for (const sel of selectors) {
          const el = doc.querySelector(sel);
          if (el && el.textContent) return el.textContent.trim();
        }
        return '';
      };

      const getDOMList = (selectors) => {
        for (const sel of selectors) {
          const els = doc.querySelectorAll(sel);
          if (els && els.length > 0) return Array.from(els).map(el => el.textContent.trim()).filter(Boolean);
        }
        return [];
      };

      const getSpecByLabel = (labels) => {
        const items = doc.querySelectorAll('.spec-item, .vehicle-details__item, tr, dl, li');
        for (const item of items) {
          const txt = item.textContent || '';
          for (const lbl of labels) {
            if (txt.toLowerCase().includes(lbl.toLowerCase())) {
              const valEl = item.querySelector('.value, td:nth-child(2), dd');
              if (valEl && valEl.textContent) return valEl.textContent.trim();
              const parts = txt.split(/[:\n\t]/);
              if (parts.length > 1) return parts[parts.length - 1].trim();
            }
          }
        }
        return '';
      };

      const title = jsonLdData.name || getMeta(['og:title', 'title']) || getDOMText(['h1.heading-sm', 'h1', '[data-test="heading"]']);
      const titleDescription = title ? title.replace(/^\d{4}\s+/, '').trim() : '';

      return {
        title,
        titleDescription,
        year: jsonLdData.vehicleModelDate || getSpecByLabel(['Year']) || (title.match(/\b(19\d\d|20\d\d)\b/) ? title.match(/\b(19\d\d|20\d\d)\b/)[1] : ''),
        mileage: jsonLdData.mileageFromOdometer?.value || getSpecByLabel(['Mileage']) || getDOMText(['[data-test="mileage"]']),
        transmission: jsonLdData.vehicleTransmission || getSpecByLabel(['Transmission']),
        fuel: jsonLdData.fuelType || getSpecByLabel(['Fuel']),
        drivetrain: jsonLdData.driveWheelConfiguration || getSpecByLabel(['Drivetrain', 'Drive Type']),
        bodyColour: jsonLdData.color || getSpecByLabel(['Colour', 'Color']),
        condition: (jsonLdData.itemCondition ? jsonLdData.itemCondition.replace('https://schema.org/', '').replace('Condition', '') : '') || getSpecByLabel(['Condition']),
        price: jsonLdData.offers?.price || getMeta(['product:price:amount']) || getDOMText(['[data-test="price"]', '.price-amount']),
        dealerName: jsonLdData.offers?.seller?.name || getDOMText(['[data-test="dealer-name"]', '.seller-info__title']),
        dealerRating: jsonLdData.offers?.seller?.aggregateRating?.ratingValue || getDOMText(['[data-test="dealer-rating"]']),
        location: getDOMText(['[data-test="location"]', '.location-text']),
        features: getDOMList(['[data-test="features"] li', '.features-list li']),
        description: jsonLdData.description || getMeta(['og:description', 'description']) || getDOMText(['[data-test="description"]']),
        engineSize: getSpecByLabel(['Engine Size', 'Engine Capacity']),
        VIN: jsonLdData.vehicleIdentificationNumber || getSpecByLabel(['VIN', 'Stock No']),
        serviceHistory: getSpecByLabel(['Service History']),
        sourceUrl: doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || doc.location?.href || ''
      };
    }
  };

  // --- 4. STORAGE BRIDGE (GM Storage with LocalStorage fallback) ---
  const StorageBridge = {
    set(key, val) {
      try {
        if (typeof GM_setValue !== 'undefined') {
          GM_setValue(key, JSON.stringify(val));
          return;
        }
      } catch (e) {}
      localStorage.setItem(`car_helper_${key}`, JSON.stringify(val));
    },
    get(key) {
      try {
        if (typeof GM_getValue !== 'undefined') {
          const val = GM_getValue(key);
          return val ? JSON.parse(val) : null;
        }
      } catch (e) {}
      const val = localStorage.getItem(`car_helper_${key}`);
      return val ? JSON.parse(val) : null;
    }
  };

  // --- 5. DEFAULT FIELD MAPPING ---
  const DefaultMapping = {
    title: { targetSelector: '#target_vehicle_title', targetType: 'text' },
    titleDescription: { targetSelector: '#target_vehicle_title', targetType: 'text' },
    year: { targetSelector: '#target_year', targetType: 'number' },
    mileage: { targetSelector: '#target_mileage', targetType: 'number' },
    transmission: { targetSelector: '#target_transmission', targetType: 'select' },
    fuel: { targetSelector: '#target_fuel', targetType: 'select' },
    drivetrain: { targetSelector: '#target_drivetrain', targetType: 'select' },
    bodyColour: { targetSelector: '#target_body_colour', targetType: 'text' },
    condition: { targetSelector: 'input[name="target_condition"]', targetType: 'radio' },
    price: { targetSelector: '#target_price', targetType: 'number' },
    dealerName: { targetSelector: '#target_dealer_name', targetType: 'text' },
    dealerRating: { targetSelector: '#target_dealer_rating', targetType: 'number' },
    location: { targetSelector: '#target_location', targetType: 'text' },
    features: { targetSelector: 'input[name="target_features[]"]', targetType: 'checkbox_group' },
    description: { targetSelector: '#target_description', targetType: 'textarea' },
    engineSize: { targetSelector: '#target_engine_capacity', targetType: 'text' },
    VIN: { targetSelector: '#target_vin', targetType: 'text' },
    serviceHistory: { targetSelector: '#target_service_history', targetType: 'select' },
    sourceUrl: { targetSelector: '#target_source_url', targetType: 'url' }
  };

  // --- 6. TARGET FORM FILLER ENGINE ---
  const FormFiller = {
    fill(doc, extracted, mapping) {
      if (!extracted || !extracted.normalized) return { error: 'No extracted vehicle data found.' };
      if (!mapping) mapping = DefaultMapping;

      const norm = extracted.normalized;
      const report = extracted.validationReport || {};
      const results = { filled: [], skippedMissing: [], failed: [] };

      for (const key of Object.keys(mapping)) {
        const m = mapping[key];
        const val = norm[key];
        const selector = m.targetSelector;
        const status = report[key]?.status;

        if (!selector || selector === 'Not mapped') continue;

        if (val === undefined || val === null || val === '' || status === 'missing') {
          results.skippedMissing.push({ field: key, selector });
          continue;
        }

        try {
          const res = this.fillField(doc, selector, m.targetType, val);
          if (res.success) results.filled.push({ field: key, selector, val });
          else results.failed.push({ field: key, selector, error: res.error });
        } catch (e) {
          results.failed.push({ field: key, selector, error: e.message });
        }
      }
      return { success: true, results };
    },

    fillField(doc, selector, type, value) {
      if (type === 'radio') {
        const radios = doc.querySelectorAll(selector);
        let matched = false;
        radios.forEach(r => {
          if ((r.value || '').toLowerCase() === String(value).toLowerCase() ||
              (r.labels?.[0]?.textContent || '').toLowerCase().includes(String(value).toLowerCase())) {
            r.checked = true;
            this.fireEvents(r);
            matched = true;
          }
        });
        return matched ? { success: true } : { success: false, error: 'No matching radio option.' };
      }

      if (type === 'checkbox_group') {
        const checkboxes = doc.querySelectorAll(selector);
        const arr = Array.isArray(value) ? value.map(v => String(v).toLowerCase()) : [String(value).toLowerCase()];
        checkboxes.forEach(cb => {
          const val = (cb.value || '').toLowerCase();
          const lbl = (cb.labels?.[0]?.textContent || '').toLowerCase();
          const check = arr.some(v => val.includes(v) || lbl.includes(v));
          cb.checked = check;
          if (check) this.fireEvents(cb);
        });
        return { success: true };
      }

      const el = doc.querySelector(selector);
      if (!el) return { success: false, error: `Element not found: ${selector}` };

      if (el.tagName === 'SELECT') {
        let matched = false;
        for (let i = 0; i < el.options.length; i++) {
          const opt = el.options[i];
          if (opt.value.toLowerCase() === String(value).toLowerCase() ||
              opt.text.toLowerCase().includes(String(value).toLowerCase())) {
            el.selectedIndex = i;
            matched = true;
            break;
          }
        }
        if (!matched) el.value = value;
        this.fireEvents(el);
        return { success: true };
      }

      el.value = String(value);
      this.fireEvents(el);
      return { success: true };
    },

    fireEvents(el) {
      try {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      } catch (e) {}
    }
  };

  // --- 7. UI WIDGET INJECTION ---
  function injectWidget() {
    const isSourcePage = CarsCoZaAdapter.canHandle(document) || document.location.href.includes('dummy-source.html');
    const isTargetPage = document.querySelector('form') !== null || document.location.href.includes('dummy-target.html');

    if (!isSourcePage && !isTargetPage) return;

    const widget = document.createElement('div');
    widget.id = 'car-data-helper-widget';
    widget.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:99999; font-family:-apple-system,BlinkMacSystemFont,sans-serif; background:#0f172a; color:#f8fafc; border:2px solid #3b82f6; border-radius:12px; padding:14px; box-shadow:0 10px 25px rgba(0,0,0,0.5); width:300px; max-width:90vw;';

    if (isSourcePage) {
      widget.innerHTML = `
        <div style="font-weight:700; color:#60a5fa; margin-bottom:6px; font-size:0.95rem;">🚗 Car Data Extractor</div>
        <p style="font-size:0.8rem; color:#94a3b8; margin-bottom:10px;">Cars.co.za listing detected.</p>
        <button id="cdh-btn-extract" style="width:100%; background:#10b981; color:#fff; border:none; padding:10px; border-radius:6px; font-weight:600; cursor:pointer;">
          🔍 Extract Car Data
        </button>
        <div id="cdh-status" style="margin-top:10px; font-size:0.8rem; display:none;"></div>
      `;
      document.body.appendChild(widget);

      document.getElementById('cdh-btn-extract').addEventListener('click', () => {
        const raw = CarsCoZaAdapter.extract(document);
        const normalized = {
          title: Normalizers.cleanText(raw.title),
          titleDescription: Normalizers.cleanText(raw.titleDescription),
          year: Normalizers.normalizeYear(raw.year),
          mileage: Normalizers.normalizeMileage(raw.mileage),
          transmission: Normalizers.normalizeTransmission(raw.transmission),
          fuel: Normalizers.normalizeFuel(raw.fuel),
          drivetrain: Normalizers.normalizeDrivetrain(raw.drivetrain),
          bodyColour: Normalizers.cleanText(raw.bodyColour),
          condition: Normalizers.cleanText(raw.condition),
          price: Normalizers.normalizePrice(raw.price),
          dealerName: Normalizers.cleanText(raw.dealerName),
          dealerRating: raw.dealerRating ? parseFloat(raw.dealerRating) || '' : '',
          location: Normalizers.cleanText(raw.location),
          features: Normalizers.normalizeFeatures(raw.features),
          description: Normalizers.cleanText(raw.description),
          engineSize: Normalizers.cleanText(raw.engineSize),
          VIN: Normalizers.cleanText(raw.VIN),
          serviceHistory: Normalizers.cleanText(raw.serviceHistory),
          sourceUrl: raw.sourceUrl || document.location.href
        };

        const validationReport = Validators.validateAll(normalized);
        const packageData = { raw, normalized, validationReport, timestamp: new Date().toISOString() };

        StorageBridge.set('extractedCarData', packageData);

        const statusEl = document.getElementById('cdh-status');
        statusEl.style.display = 'block';
        const extCount = Object.values(validationReport).filter(v => v.status === 'extracted').length;
        statusEl.innerHTML = `
          <div style="background:#065f46; color:#34d399; padding:8px; border-radius:4px; margin-top:6px;">
            ✅ Extracted ${extCount} fields!<br>Data saved to local storage. Switch to target form and tap "Fill Target Form".
          </div>
        `;
      });
    } else if (isTargetPage) {
      widget.innerHTML = `
        <div style="font-weight:700; color:#60a5fa; margin-bottom:6px; font-size:0.95rem;">📝 Car Target Form Helper</div>
        <p style="font-size:0.8rem; color:#94a3b8; margin-bottom:10px;">Target intake form detected.</p>
        <button id="cdh-btn-fill" style="width:100%; background:#3b82f6; color:#fff; border:none; padding:10px; border-radius:6px; font-weight:600; cursor:pointer;">
          ⚡ Fill Target Form
        </button>
        <div id="cdh-status" style="margin-top:10px; font-size:0.8rem; display:none;"></div>
      `;
      document.body.appendChild(widget);

      document.getElementById('cdh-btn-fill').addEventListener('click', () => {
        const extracted = StorageBridge.get('extractedCarData');
        const statusEl = document.getElementById('cdh-status');
        statusEl.style.display = 'block';

        if (!extracted) {
          statusEl.innerHTML = `<div style="background:#7f1d1d; color:#f87171; padding:8px; border-radius:4px;">❌ No extracted data found in storage! Extract from Cars.co.za first.</div>`;
          return;
        }

        const mapping = StorageBridge.get('fieldMapping') || DefaultMapping;
        const res = FormFiller.fill(document, extracted, mapping);

        statusEl.innerHTML = `
          <div style="background:#065f46; color:#34d399; padding:8px; border-radius:4px;">
            ✅ Form Populated!<br>
            - Filled: ${res.results.filled.length} fields<br>
            - Skipped (Missing): ${res.results.skippedMissing.length} fields<br>
            - Failed: ${res.results.failed.length} fields<br>
            <em style="color:#fbbf24; font-size:0.75rem;">Manual review & submit required.</em>
          </div>
        `;
      });
    }
  }

  window.addEventListener('load', injectWidget);
})();
