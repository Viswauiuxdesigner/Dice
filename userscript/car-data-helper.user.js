// ==UserScript==
// @name         Car Data Entry Helper
// @namespace    local.car.helper
// @version      2.0.2
// @description  Local car data extraction helper for Cars.co.za listings (17 fields manual COPY workflow)
// @match        https://www.cars.co.za/*
// @match        https://tamilnadu2026.dicewebfreelancers.com/*
// @match        *://*/*cars-co-za-sample.html*
// @match        file://*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
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
      return match ? match[1] : '';
    },
    normalizeKilometersDriven(val) {
      if (!val) return '';
      const str = String(val).trim();
      if (str.toLowerCase().includes('km')) return str;
      const digitsOnly = str.replace(/[^\d]/g, '');
      if (!digitsOnly) return str;
      return `${Number(digitsOnly).toLocaleString('fr-FR').replace(/\s/g, ' ')} km`;
    },
    normalizePrice(val) {
      if (!val) return '';
      const digitsOnly = String(val).replace(/[^\d]/g, '');
      if (!digitsOnly) return String(val).trim();
      return Number(digitsOnly).toLocaleString('fr-FR').replace(/\s/g, ' ');
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
    normalize4x2Or4x4(val) {
      if (!val) return '';
      const str = String(val).toLowerCase();
      if (str.includes('4x4') || str.includes('4wd') || str.includes('awd') || str.includes('all-wheel')) return '4x4';
      if (str.includes('4x2') || str.includes('fwd') || str.includes('rwd') || str.includes('front') || str.includes('rear') || str.includes('two-wheel')) return '4x2';
      return this.cleanText(val);
    },
    normalizeFeatures(val) {
      if (!val) return '';
      if (Array.isArray(val)) {
        return val.map(f => this.cleanText(f)).filter(Boolean).join('\n');
      }
      if (typeof val === 'string') {
        return val.split(/[,;\n]/).map(f => this.cleanText(f)).filter(Boolean).join('\n');
      }
      return '';
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
        if (isNaN(num) || num < 1900 || num > new Date().getFullYear() + 1) {
          return { status: 'missing', label: 'Missing / Needs Review' };
        }
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

  // --- 3. PRODUCTION CARS.CO.ZA ADAPTER (Multi-Strategy Cascader) ---
  const CarsCoZaAdapter = {
    canHandle(doc) {
      const url = doc.location?.href || '';
      return url.includes('cars.co.za') || doc.querySelector('#cars-co-za-marker') !== null || doc.title.includes('Cars.co.za');
    },
    extract(doc) {
      if (!doc) doc = document;

      // 1. Next.js Hydrated State Deep Search
      let nextDataProps = {};
      try {
        const nextScript = doc.querySelector('script[id="__NEXT_DATA__"]');
        if (nextScript && nextScript.textContent) {
          const parsed = JSON.parse(nextScript.textContent);
          nextDataProps = parsed.props?.pageProps?.listing ||
                          parsed.props?.pageProps?.vehicle ||
                          parsed.props?.pageProps?.initialState?.vehicle ||
                          parsed.props?.pageProps || {};

          if (!nextDataProps.title && parsed.props?.pageProps?.dehydratedState?.queries) {
            const queries = parsed.props.pageProps.dehydratedState.queries;
            for (const q of queries) {
              const data = q.state?.data;
              if (data && (data.title || data.make || data.price)) {
                nextDataProps = data;
                break;
              }
            }
          }
        }
      } catch (e) {}

      // 2. JSON-LD Microdata Deep Search
      let jsonLdData = {};
      try {
        const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
        scripts.forEach(script => {
          try {
            const parsed = JSON.parse(script.textContent);
            if (parsed['@type'] === 'Car' || parsed['@type'] === 'Vehicle' || parsed['@type'] === 'Product') {
              jsonLdData = parsed;
            } else if (Array.isArray(parsed)) {
              const found = parsed.find(item => item['@type'] === 'Car' || item['@type'] === 'Vehicle');
              if (found) jsonLdData = found;
            } else if (parsed['@graph'] && Array.isArray(parsed['@graph'])) {
              const found = parsed['@graph'].find(item => item['@type'] === 'Car' || item['@type'] === 'Vehicle');
              if (found) jsonLdData = found;
            }
          } catch (e) {}
        });
      } catch (e) {}

      // Helpers
      const getDOMText = (selectors) => {
        for (const sel of selectors) {
          const el = doc.querySelector(sel);
          if (el) {
            const txt = el.textContent || el.getAttribute('content') || el.value;
            if (txt && txt.trim().length > 0) return txt.trim();
          }
        }
        return '';
      };

      const getDOMList = (selectors) => {
        for (const sel of selectors) {
          const elements = doc.querySelectorAll(sel);
          if (elements && elements.length > 0) {
            const list = Array.from(elements).map(el => el.textContent.trim()).filter(Boolean);
            if (list.length > 0) return list;
          }
        }
        return [];
      };

      const getMeta = (props) => {
        for (const p of props) {
          const el = doc.querySelector(`meta[property="${p}"], meta[name="${p}"]`);
          if (el && el.getAttribute('content')) return el.getAttribute('content').trim();
        }
        return '';
      };

      const crawlSpecByLabel = (labels) => {
        const candidateElements = doc.querySelectorAll('div, span, p, tr, li, dl, dt, [class*="spec"], [class*="detail"], [data-test]');
        for (const el of candidateElements) {
          const txt = el.textContent || '';
          if (!txt) continue;

          for (const lbl of labels) {
            const lblLower = lbl.toLowerCase();
            const labelSpan = Array.from(el.children).find(child => child.textContent && child.textContent.trim().toLowerCase() === lblLower);
            if (labelSpan) {
              const valueSpan = Array.from(el.children).find(child => child !== labelSpan && child.textContent && child.textContent.trim().length > 0);
              if (valueSpan) return valueSpan.textContent.trim();
            }

            if (txt.toLowerCase().includes(lblLower)) {
              const valEl = el.querySelector('.value, td:nth-child(2), dd, span:last-child, p:last-child');
              if (valEl && valEl !== el && valEl.textContent && valEl.textContent.trim().toLowerCase() !== lblLower) {
                return valEl.textContent.trim();
              }
              const parts = txt.split(/[:\n\t]/);
              if (parts.length > 1 && parts[0].toLowerCase().includes(lblLower)) {
                return parts[parts.length - 1].trim();
              }
            }
          }
        }
        return '';
      };

      // --- FIELD EXTRACTIONS ---

      const rawHeadingText = getDOMText(['[data-test="heading"]', '[data-test="title"]', '.vehicle-title', 'h1.heading-sm', 'h1.title', 'h1']) ||
                             nextDataProps.title ||
                             jsonLdData.name ||
                             getMeta(['og:title', 'title']);

      const rawVariantText = getDOMText(['[data-test="variant"]', '[data-test="subtitle"]', '.vehicle-variant', '.variant-title', '.subtitle', '.sub-heading']) ||
                             nextDataProps.variant ||
                             nextDataProps.trim ||
                             jsonLdData.model || '';

      let title = '';
      let titleDescription = '';

      const brandName = nextDataProps.make || (typeof jsonLdData.brand === 'string' ? jsonLdData.brand : jsonLdData.brand?.name) || '';
      const modelName = nextDataProps.model || jsonLdData.model || '';
      const yearVal = nextDataProps.year || jsonLdData.vehicleModelDate || (rawHeadingText.match(/\b(19\d\d|20\d\d)\b/) ? rawHeadingText.match(/\b(19\d\d|20\d\d)\b/)[1] : '');

      if (rawVariantText) {
        titleDescription = rawVariantText.trim();
        if (rawHeadingText.includes(rawVariantText)) {
          title = rawHeadingText.replace(rawVariantText, '').trim();
        } else {
          title = rawHeadingText.trim();
        }
      } else if (brandName && modelName) {
        title = `${yearVal} ${brandName} ${modelName}`.trim();
        titleDescription = rawHeadingText.replace(title, '').trim();
      } else {
        const m = rawHeadingText.match(/^((?:19|20)\d\d\s+[A-Za-z0-9-]+(?:\s+[A-Za-z0-9-]+)?)(.*)$/);
        if (m && m[2].trim()) {
          title = m[1].trim();
          titleDescription = m[2].trim();
        } else {
          title = rawHeadingText;
          titleDescription = '';
        }
      }

      // 3. Year
      const year = yearVal ||
                   crawlSpecByLabel(['Year', 'Registration Year', 'Model Year']) ||
                   getDOMText(['[data-test="year"]', '#spec-year']);

      // 4. Kilometers Driven
      const kilometersDriven = nextDataProps.mileage ||
                               jsonLdData.mileageFromOdometer?.value ||
                               jsonLdData.mileageFromOdometer ||
                               getDOMText(['[data-test="mileage"]', '[data-test="kilometers"]', '#spec-mileage', '.spec-mileage']) ||
                               crawlSpecByLabel(['Kilometers Driven', 'Kilometers', 'Mileage', 'Odometer', 'Km']);

      // 5. Transmission
      const transmission = nextDataProps.transmission ||
                           jsonLdData.vehicleTransmission ||
                           getDOMText(['[data-test="transmission"]', '#spec-transmission']) ||
                           crawlSpecByLabel(['Transmission', 'Gearbox']);

      // 6. Fuel
      const fuel = nextDataProps.fuel ||
                   jsonLdData.fuelType ||
                   getDOMText(['[data-test="fuel"]', '[data-test="fuel-type"]', '#spec-fuel']) ||
                   crawlSpecByLabel(['Fuel Type', 'Fuel']);

      // 7. 4x2 / 4x4 (Drivetrain)
      const drivetrain = nextDataProps.drivetrain ||
                         jsonLdData.driveWheelConfiguration ||
                         getDOMText(['[data-test="drivetrain"]', '#spec-drivetrain']) ||
                         crawlSpecByLabel(['4x2 / 4x4', 'Drivetrain', 'Drive Type', 'Wheel Drive']);

      // 8. Body Color
      const bodyColor = nextDataProps.colour ||
                        nextDataProps.color ||
                        jsonLdData.color ||
                        getDOMText(['[data-test="colour"]', '[data-test="color"]', '#spec-colour']) ||
                        crawlSpecByLabel(['Body Color', 'Body Colour', 'Colour', 'Color']);

      // 9. Condition
      const condition = nextDataProps.condition ||
                        (jsonLdData.itemCondition ? jsonLdData.itemCondition.replace('https://schema.org/', '').replace('Condition', '') : '') ||
                        getDOMText(['[data-test="condition"]', '#spec-condition']) ||
                        crawlSpecByLabel(['Condition', 'Vehicle Condition']);

      // 10. Pricing Summary (Price + Installment text)
      const cashPriceText = getDOMText(['[data-test="price"]', '.price-amount', '#car-price', '.heading-lg.price']) ||
                            (jsonLdData.offers?.price ? `R ${Number(jsonLdData.offers.price).toLocaleString('fr-FR').replace(/\s/g, ' ')}` : '');

      const installmentText = getDOMText(['[data-test="est-installment"]', '[data-test="installment"]', '.est-payment', '.finance-est']) ||
                              (nextDataProps.installment ? `Est. ${nextDataProps.installment}` : '');

      let pricingSummary = nextDataProps.pricingSummary ||
                           getDOMText(['[data-test="pricing-summary"]', '#car-price-summary', '.price-summary']);

      if (!pricingSummary && cashPriceText) {
        pricingSummary = installmentText ? `${cashPriceText} / ${installmentText}` : cashPriceText;
      }

      // 11. Dealer Name
      const dealerName = nextDataProps.dealer?.name ||
                         jsonLdData.offers?.seller?.name ||
                         getDOMText(['[data-test="dealer-name"]', '#dealer-name', '.seller-info__title', '.dealer-title', 'a[href*="/dealers/"]']);

      // 12. Dealer Address / Location
      const dealerAddress = nextDataProps.dealer?.address ||
                            nextDataProps.location ||
                            getDOMText(['[data-test="dealer-address"]', '[data-test="location"]', '#car-location', '.seller-info__address', '.location-text', '.dealer-location']);

      // 13. Average Rating
      let averageRating = nextDataProps.dealer?.rating || getDOMText(['[data-test="dealer-rating"]', '#dealer-rating', '.rating-badge', '.seller-rating']);

      if (!averageRating && jsonLdData.offers?.seller?.aggregateRating) {
        const agg = jsonLdData.offers.seller.aggregateRating;
        averageRating = `${agg.ratingValue}${agg.reviewCount ? ` (${agg.reviewCount} Reviews)` : ''}`;
      }

      // 14. Features
      let featuresList = nextDataProps.features ||
                         getDOMList(['[data-test="features"] li', '[data-test="feature-item"]', '#car-features li', '.features-list li', '.equipment-list li', '[class*="feature"] li']);

      if ((!featuresList || featuresList.length === 0)) {
        const featureEls = doc.querySelectorAll('[data-test*="feature"], .feature-item, .equipment-item');
        if (featureEls && featureEls.length > 0) {
          featuresList = Array.from(featureEls).map(el => el.textContent.trim()).filter(Boolean);
        }
      }

      // 15. Description
      const description = nextDataProps.description ||
                          jsonLdData.description ||
                          getDOMText(['[data-test="description"]', '#car-description', '.vehicle-description', '.description-text', '#description']) ||
                          getMeta(['og:description', 'description']);

      // 16. Price (Cash price numeric string)
      const rawPrice = nextDataProps.price ||
                       jsonLdData.offers?.price ||
                       getDOMText(['[data-test="price"]', '#car-price', '.price-amount']) ||
                       getMeta(['product:price:amount']);

      // 17. Source URL (Canonical URL)
      const sourceUrl = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ||
                        doc.querySelector('#source-url-meta')?.getAttribute('href') ||
                        getMeta(['og:url']) ||
                        doc.location?.href || '';

      return {
        title,
        titleDescription,
        year,
        kilometersDriven,
        transmission,
        fuel,
        drivetrain,
        bodyColor,
        condition,
        pricingSummary,
        dealerName,
        dealerAddress,
        averageRating,
        features: featuresList,
        description,
        price: rawPrice,
        sourceUrl
      };
    }
  };

  // --- 4. CLIPBOARD HELPERS ---
  async function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {}
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    let success = false;
    try {
      success = document.execCommand('copy');
    } catch (e) {}
    document.body.removeChild(textarea);
    return success;
  }

  // --- 5. UI PANEL DISPATCHER ---
  const FIELD_LABELS = {
    title: 'Title',
    titleDescription: 'Title Description',
    year: 'Year',
    kilometersDriven: 'Kilometers Driven',
    transmission: 'Transmission',
    fuel: 'Fuel',
    drivetrain: '4x2 / 4x4',
    bodyColor: 'Body Color',
    condition: 'Condition',
    pricingSummary: 'Pricing Summary',
    dealerName: 'Dealer Name',
    dealerAddress: 'Dealer Address',
    averageRating: 'Average Rating',
    features: 'Features',
    description: 'Description',
    price: 'Price',
    sourceUrl: 'Source URL'
  };

  function performExtraction() {
    const raw = CarsCoZaAdapter.extract(document);
    const normalized = {
      title: Normalizers.cleanText(raw.title),
      titleDescription: Normalizers.cleanText(raw.titleDescription),
      year: Normalizers.normalizeYear(raw.year),
      kilometersDriven: Normalizers.normalizeKilometersDriven(raw.kilometersDriven),
      transmission: Normalizers.normalizeTransmission(raw.transmission),
      fuel: Normalizers.normalizeFuel(raw.fuel),
      drivetrain: Normalizers.normalize4x2Or4x4(raw.drivetrain),
      bodyColor: Normalizers.cleanText(raw.bodyColor),
      condition: Normalizers.cleanText(raw.condition),
      pricingSummary: Normalizers.cleanText(raw.pricingSummary),
      dealerName: Normalizers.cleanText(raw.dealerName),
      dealerAddress: Normalizers.cleanText(raw.dealerAddress),
      averageRating: Normalizers.cleanText(raw.averageRating),
      features: Normalizers.normalizeFeatures(raw.features),
      description: Normalizers.cleanText(raw.description),
      price: Normalizers.normalizePrice(raw.price),
      sourceUrl: raw.sourceUrl || document.location.href
    };

    const validationReport = Validators.validateAll(normalized);
    renderExtractedFields(normalized, validationReport);
  }

  function injectExtractorUI() {
    if (document.getElementById('car-data-helper-widget')) return;

    const widget = document.createElement('div');
    widget.id = 'car-data-helper-widget';
    widget.style.cssText = `
      position: fixed;
      bottom: 16px;
      right: 16px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      border: 2px solid #3b82f6;
      border-radius: 12px;
      padding: 14px;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.6);
      width: 360px;
      max-width: 92vw;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
    `;

    widget.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div style="font-weight:700; color:#60a5fa; font-size:1rem; display:flex; align-items:center; gap:6px;">
          <span>🚗 Car Data Helper (v2.0.2)</span>
        </div>
        <button id="cdh-toggle-btn" style="background:transparent; border:none; color:#94a3b8; font-size:1.2rem; cursor:pointer; padding:2px 6px;">−</button>
      </div>
      
      <div id="cdh-body" style="display:flex; flex-direction:column; gap:10px; overflow:hidden;">
        <button id="cdh-btn-extract" style="width:100%; background:#10b981; color:#fff; border:none; padding:12px; border-radius:8px; font-weight:700; font-size:0.95rem; cursor:pointer; min-height:44px;">
          🔄 Re-extract Data
        </button>

        <div id="cdh-results-container" style="display:block; overflow-y:auto; max-height:60vh; padding-right:4px;">
          <div id="cdh-fields-list" style="display:flex; flex-direction:column; gap:10px;"></div>
        </div>
      </div>
    `;

    document.body.appendChild(widget);

    let isMinimized = false;
    document.getElementById('cdh-toggle-btn').addEventListener('click', () => {
      const body = document.getElementById('cdh-body');
      isMinimized = !isMinimized;
      body.style.display = isMinimized ? 'none' : 'flex';
      document.getElementById('cdh-toggle-btn').textContent = isMinimized ? '+' : '−';
    });

    document.getElementById('cdh-btn-extract').addEventListener('click', () => {
      performExtraction();
    });

    performExtraction();
  }

  function renderExtractedFields(data, report) {
    const fieldsList = document.getElementById('cdh-fields-list');
    if (!fieldsList) return;
    fieldsList.innerHTML = '';

    for (const key of Object.keys(FIELD_LABELS)) {
      const label = FIELD_LABELS[key];
      const val = data[key];
      const status = report[key]?.status;
      const isMissing = !val || status === 'missing';

      const fieldCard = document.createElement('div');
      fieldCard.style.cssText = `
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 8px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      `;

      const displayVal = isMissing ? 'Missing / Needs Review' : val;
      const displayValColor = isMissing ? '#f87171' : '#f1f5f9';
      const isMultiline = String(val).includes('\n') || key === 'description' || key === 'features';

      fieldCard.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:0.75rem; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px;">${label}</span>
          <button class="cdh-copy-btn" data-key="${key}" style="background:#3b82f6; color:#ffffff; border:none; border-radius:6px; padding:6px 12px; font-weight:700; font-size:0.78rem; cursor:pointer; min-height:36px;">
            COPY
          </button>
        </div>
        <div style="font-size:0.85rem; color:${displayValColor}; white-space:${isMultiline ? 'pre-wrap' : 'normal'}; word-break:break-word; max-height:${isMultiline ? '120px' : 'none'}; overflow-y:${isMultiline ? 'auto' : 'visible'}; background:#0f172a; padding:6px 8px; border-radius:4px; border:1px solid #1e293b;">
          ${escapeHtml(displayVal)}
        </div>
      `;

      fieldsList.appendChild(fieldCard);

      const copyBtn = fieldCard.querySelector('.cdh-copy-btn');
      copyBtn.addEventListener('click', async () => {
        const textToCopy = isMissing ? '' : String(val);
        const copied = await copyToClipboard(textToCopy);
        if (copied) {
          copyBtn.textContent = '✓ Copied';
          copyBtn.style.background = '#10b981';
          setTimeout(() => {
            copyBtn.textContent = 'COPY';
            copyBtn.style.background = '#3b82f6';
          }, 2000);
        } else {
          copyBtn.textContent = 'Failed';
          copyBtn.style.background = '#ef4444';
          setTimeout(() => {
            copyBtn.textContent = 'COPY';
            copyBtn.style.background = '#3b82f6';
          }, 2000);
        }
      });
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    injectExtractorUI();
  } else {
    window.addEventListener('DOMContentLoaded', injectExtractorUI);
  }
})();
