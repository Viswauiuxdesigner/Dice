// ==UserScript==
// @name         Car Data Entry Helper
// @namespace    local.car.helper
// @version      2.2.4
// @description  Local car data extraction helper for Cars.co.za listings (18 fields manual COPY workflow, semantic value-anchored extraction)
// @match        https://www.cars.co.za/*
// @match        https://tamilnadu2026.dicewebfreelancers.com/*
// @match        *://*/*cars-co-za-sample.html*
// @match        *://*/*cars-co-za-ferrari-sample.html*
// @match        *://*/*cars-co-za-suzuki-sample.html*
// @match        file://*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @run-at       document-end
// ==UserScript==

(function () {
  'use strict';

  const SCRIPT_VERSION = '2.2.4';

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
      if (str.includes('auto') || str.includes('steptronic') || str.includes('cvt') || str.includes('dsg') || str.includes('dual clutch')) {
        return 'Automatic';
      }
      if (str.includes('manual') || str.includes('stick')) {
        return 'Manual';
      }
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
    },
    normalizeDescription(val) {
      if (!val || typeof val !== 'string') return '';
      let text = val
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');

      const rawParagraphs = text.split(/\n{2,}/);
      const cleanParagraphs = [];

      for (const rawP of rawParagraphs) {
        const cleanP = rawP
          .split('\n')
          .map(line => line.replace(/[ \t]+/g, ' ').trim())
          .filter(Boolean)
          .join(' ')
          .trim();
        if (cleanP && !/^(?:seller\s+|dealer\s+|vehicle\s+)?description:?$/i.test(cleanP) && !/^(?:show|read|view)\s*(?:more|less)$/i.test(cleanP)) {
          cleanParagraphs.push(cleanP);
        }
      }

      return cleanParagraphs.join('\n\n');
    },
    normalizeVehicleHighlights(val) {
      if (!val) return '';
      if (Array.isArray(val)) {
        return val.map(item => {
          if (typeof item === 'string') return this.cleanText(item);
          if (typeof item === 'object' && item !== null) {
            const t = item.title || item.heading || item.name || '';
            const v = item.value || item.metric || item.stat || '';
            const d = item.description || item.desc || item.detail || item.text || '';
            return [t, v, d].filter(Boolean).map(s => this.cleanText(s)).join('\n');
          }
          return '';
        }).filter(Boolean).join('\n\n');
      }
      if (typeof val === 'string') {
        const text = val
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n');

        const rawCards = text.split(/\n{2,}/);
        const cleanCards = [];

        for (const rawCard of rawCards) {
          const lines = rawCard
            .split('\n')
            .map(l => l.replace(/[ \t]+/g, ' ').trim())
            .filter(l => l.length > 0 && !/^(?:vehicle\s+)?highlights$/i.test(l));

          if (lines.length > 0) {
            cleanCards.push(lines.join('\n'));
          }
        }
        return cleanCards.join('\n\n');
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
        if (isNaN(num) || num < 1900 || num > new Date().getFullYear() + 2) {
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

  // --- 3. PRODUCTION CARS.CO.ZA ADAPTER (Semantic Leaf & Value-Anchored Extractor) ---
  const CarsCoZaAdapter = {
    canHandle(doc) {
      const url = doc.location?.href || '';
      return url.includes('cars.co.za') || doc.querySelector('#cars-co-za-marker') !== null || (doc.title && doc.title.includes('Cars.co.za'));
    },
    extract(doc) {
      if (!doc) doc = document;

      // 1. Next.js Hydrated State Deep Search
      let nextDataProps = {};
      let rawNextData = null;
      try {
        const nextScript = doc.querySelector('script[id="__NEXT_DATA__"]');
        if (nextScript && nextScript.textContent) {
          const parsed = JSON.parse(nextScript.textContent);
          rawNextData = parsed;
          nextDataProps = parsed.props?.pageProps?.listing ||
                          parsed.props?.pageProps?.vehicle?.attributes ||
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

      // Helper: Scoped Text Lookup
      const getSelectorText = (root, selectors) => {
        if (!root) return '';
        for (const sel of selectors) {
          try {
            const el = root.querySelector(sel);
            if (el) {
              const txt = el.textContent || el.getAttribute('content') || el.value || '';
              if (txt && txt.trim().length > 0) return txt.trim();
            }
          } catch (e) {}
        }
        return '';
      };

      const getMeta = (props) => {
        for (const p of props) {
          const el = doc.querySelector(`meta[property="${p}"], meta[name="${p}"]`);
          if (el && el.getAttribute('content')) return el.getAttribute('content').trim();
        }
        return '';
      };

      // --- 1 & 2. TITLE & TITLE DESCRIPTION ---
      const h1El = doc.querySelector('[data-test="heading"], [data-testid="heading"], [data-test="title"], [data-testid="title"], h1.heading-sm, h1.title, h1');
      let rawHeadingText = h1El ? (h1El.textContent || '').trim() : '';
      if (!rawHeadingText) {
        rawHeadingText = nextDataProps.title || nextDataProps.heading || (typeof jsonLdData.name === 'string' ? jsonLdData.name : '') || getMeta(['og:title', 'title']);
      }
      rawHeadingText = rawHeadingText.replace(/\s+for\s+sale.*$/i, '').replace(/\s*-\s*R\s*[\d\s,.]+.*$/i, '').trim();

      let rawVariantText = getSelectorText(doc, [
        '[data-test="variant"]', '[data-testid="variant"]',
        '[data-test="subtitle"]', '[data-testid="subtitle"]',
        '[data-test="derivative"]', '[data-testid="derivative"]',
        '[data-test="sub-heading"]', '[data-testid="sub-heading"]',
        '[data-test="trim"]', '[data-testid="trim"]',
        '.vehicle-subtitle', '.vehicle-variant', '.variant-title', '.subtitle', '.sub-heading', '.subHeading', '.derivative', '.trim'
      ]);

      if (!rawVariantText && h1El && h1El.nextElementSibling) {
        const sib = h1El.nextElementSibling;
        const sibTxt = (sib.textContent || '').trim();
        if (sibTxt && sibTxt.length > 0 && sibTxt.length < 50 && !sibTxt.startsWith('R') && !/\b(reviews|gauteng|cape town|western cape|kwazulu|sandton|durban|johannesburg)\b/i.test(sibTxt)) {
          rawVariantText = sibTxt;
        }
      }

      if (!rawVariantText) {
        rawVariantText = nextDataProps.variant || nextDataProps.derivative || nextDataProps.trim || nextDataProps.subTitle || nextDataProps.subtitle || '';
      }

      let title = '';
      let titleDescription = '';

      if (rawVariantText && rawVariantText.toLowerCase() !== rawHeadingText.toLowerCase()) {
        titleDescription = rawVariantText.trim();
        if (rawHeadingText.toLowerCase().endsWith(rawVariantText.toLowerCase())) {
          title = rawHeadingText.substring(0, rawHeadingText.length - rawVariantText.length).trim();
        } else if (rawHeadingText.toLowerCase().includes(rawVariantText.toLowerCase())) {
          title = rawHeadingText.replace(new RegExp(rawVariantText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').trim();
        } else {
          title = rawHeadingText.trim();
        }
      } else {
        const brandName = nextDataProps.make || (typeof jsonLdData.brand === 'string' ? jsonLdData.brand : jsonLdData.brand?.name) || '';
        const modelName = nextDataProps.model || jsonLdData.model || '';
        const yearMatch = rawHeadingText.match(/\b(19\d\d|20\d\d)\b/);
        const yrVal = nextDataProps.year || (yearMatch ? yearMatch[1] : '');

        if (brandName && modelName) {
          const expectedBase = `${yrVal ? yrVal + ' ' : ''}${brandName} ${modelName}`.trim();
          if (rawHeadingText.toLowerCase().startsWith(expectedBase.toLowerCase()) && rawHeadingText.length > expectedBase.length) {
            title = expectedBase;
            titleDescription = rawHeadingText.substring(expectedBase.length).trim();
          } else {
            title = rawHeadingText;
            titleDescription = '';
          }
        } else {
          const m = rawHeadingText.match(/^((?:19|20)\d\d\s+[A-Za-z0-9-]+(?:\s+[A-Za-z0-9-]+)?)\s+(.+)$/);
          if (m && m[2] && m[2].trim()) {
            title = m[1].trim();
            titleDescription = m[2].trim();
          } else {
            title = rawHeadingText;
            titleDescription = '';
          }
        }
      }

      if (titleDescription && titleDescription.toLowerCase() === title.toLowerCase()) {
        titleDescription = '';
      }

      // --- 3. VEHICLE SUMMARY & TECHNICAL SPECS (Semantic Value Anchors) ---
      const allLeafElements = [];
      const walker = doc.createTreeWalker(doc.body || doc, NodeFilter.SHOW_ELEMENT, null, false);
      let currentNode = walker.nextNode();
      while (currentNode) {
        if (currentNode.children.length === 0 || (currentNode.children.length === 1 && currentNode.querySelector('svg, i, img, span'))) {
          const txt = (currentNode.textContent || '').trim();
          if (txt && txt.length > 0 && txt.length < 60) {
            allLeafElements.push({ el: currentNode, text: txt });
          }
        }
        currentNode = walker.nextNode();
      }

      // Key-Value Table Mapping (if specifications table exists)
      const specTableMap = {};
      const specRows = doc.querySelectorAll('table tr, dl > div, dl tr, [class*="spec-row"], [class*="vehicle-details__list"] tr');
      specRows.forEach(row => {
        const labelEl = row.querySelector('td:first-child, th, dt, [class*="label"], [class*="name"]');
        const valEl = row.querySelector('td:last-child, dd, [class*="value"]');
        if (labelEl && valEl && labelEl !== valEl) {
          const l = labelEl.textContent.trim().toLowerCase();
          const v = valEl.textContent.trim();
          if (l && v) specTableMap[l] = v;
        }
      });

      // 3. Year
      let year = '';
      const yrLeaf = allLeafElements.find(item => /^(19\d\d|20\d\d)$/.test(item.text));
      if (yrLeaf) year = yrLeaf.text;
      if (!year) {
        for (const [k, v] of Object.entries(specTableMap)) {
          if (/year|model year|registration/i.test(k) && /^(19\d\d|20\d\d)$/.test(v)) {
            year = v;
            break;
          }
        }
      }
      if (!year) year = nextDataProps.year || jsonLdData.vehicleModelDate || '';
      if (!year) {
        const match = rawHeadingText.match(/\b(19\d\d|20\d\d)\b/);
        if (match) year = match[1];
      }

      // 4. Kilometers Driven
      let kilometersDriven = '';
      const kmLeaf = allLeafElements.find(item => /^\s*(\d[\d\s,.]*)\s*(?:km|kms|kilometres|kilometers)\s*$/i.test(item.text));
      if (kmLeaf) kilometersDriven = kmLeaf.text;
      if (!kilometersDriven) {
        for (const [k, v] of Object.entries(specTableMap)) {
          if (/mileage|kilometer|odometer|km/i.test(k) && /\d/.test(v)) {
            kilometersDriven = v;
            break;
          }
        }
      }
      if (!kilometersDriven) {
        kilometersDriven = nextDataProps.mileage || jsonLdData.mileageFromOdometer?.value || (typeof jsonLdData.mileageFromOdometer === 'string' ? jsonLdData.mileageFromOdometer : '') || '';
      }
      if (kilometersDriven && (!/\d/.test(kilometersDriven) || /^(gtb|ferrari|mazda|automatic|manual|petrol|diesel|red|white|blue|4x2|4x4)$/i.test(kilometersDriven))) {
        kilometersDriven = '';
      }

      // 5. Transmission
      let transmission = '';
      const transLeaf = allLeafElements.find(item => /^(automatic|manual|semi-automatic|automated manual|cvt|dual clutch|sequential|direct drive|auto|steptronic|dsg)$/i.test(item.text));
      if (transLeaf) transmission = transLeaf.text;
      if (!transmission) {
        for (const [k, v] of Object.entries(specTableMap)) {
          if (/transmission|gearbox/i.test(k) && /automatic|manual|semi|cvt|dual clutch/i.test(v)) {
            transmission = v;
            break;
          }
        }
      }
      if (!transmission) {
        transmission = nextDataProps.transmission || nextDataProps.gearbox || jsonLdData.vehicleTransmission || '';
      }
      if (transmission && !/^(automatic|manual|semi-automatic|automated manual|cvt|dual clutch|sequential|direct drive|auto|steptronic|dsg)$/i.test(transmission.trim())) {
        transmission = '';
      }

      // 6. Fuel
      let fuel = '';
      const fuelLeaf = allLeafElements.find(item => /^(petrol|diesel|hybrid|electric|plug-in hybrid|phev|hydrogen|lpg|gas|unleaded|premium)$/i.test(item.text));
      if (fuelLeaf) fuel = fuelLeaf.text;
      if (!fuel) {
        for (const [k, v] of Object.entries(specTableMap)) {
          if (/fuel/i.test(k) && /petrol|diesel|hybrid|electric|phev|gas|lpg/i.test(v)) {
            fuel = v;
            break;
          }
        }
      }
      if (!fuel) {
        fuel = nextDataProps.fuel || nextDataProps.fuelType || nextDataProps.fuel_type || jsonLdData.fuelType || '';
      }
      if (fuel && !/^(petrol|diesel|hybrid|electric|plug-in hybrid|phev|hydrogen|lpg|gas|unleaded|premium)$/i.test(fuel.trim())) {
        fuel = '';
      }

      // 7. 4x2 / 4x4 (Drivetrain)
      let drivetrain = '';
      const dtLeaf = allLeafElements.find(item => /^(4x2|4x4|fwd|rwd|awd|4wd|front-wheel drive|rear-wheel drive|all-wheel drive|four-wheel drive)$/i.test(item.text));
      if (dtLeaf) drivetrain = dtLeaf.text;
      if (!drivetrain) {
        for (const [k, v] of Object.entries(specTableMap)) {
          if (/4x2|4x4|drivetrain|drive\s*type|driven\s*wheels|wheel\s*drive/i.test(k)) {
            drivetrain = v;
            break;
          }
        }
      }
      if (!drivetrain) {
        drivetrain = nextDataProps.drivetrain || nextDataProps.drive || nextDataProps.driveType || nextDataProps.driveWheelConfiguration || jsonLdData.driveWheelConfiguration || '';
      }
      if (drivetrain) {
        if (/4x4|awd|4wd|all-wheel|four-wheel/i.test(drivetrain)) drivetrain = '4x4';
        else if (/4x2|fwd|rwd|front-wheel|rear-wheel|front wheel|rear wheel/i.test(drivetrain)) drivetrain = '4x2';
        else drivetrain = '';
      }

      // 8. Body Color
      let bodyColor = '';
      const knownColors = ['red', 'white', 'black', 'silver', 'grey', 'gray', 'blue', 'yellow', 'green', 'orange', 'brown', 'bronze', 'gold', 'purple', 'beige', 'maroon', 'burgundy', 'charcoal', 'navy', 'rosso corsa', 'bianco', 'nero', 'giallo'];
      const colorLeaf = allLeafElements.find(item => knownColors.includes(item.text.toLowerCase()));
      if (colorLeaf) bodyColor = colorLeaf.text;
      if (!bodyColor) {
        for (const [k, v] of Object.entries(specTableMap)) {
          if (/colou?r|body\s*colou?r/i.test(k) && !/^(gtb|automatic|petrol|4x2|4x4|\d+)$/i.test(v)) {
            bodyColor = v;
            break;
          }
        }
      }
      if (!bodyColor) {
        bodyColor = nextDataProps.colour || nextDataProps.color || nextDataProps.bodyColour || nextDataProps.bodyColor || nextDataProps.exteriorColor || jsonLdData.color || '';
      }
      if (bodyColor && (/\d|\b(reviews?|ratings?|gtb|ferrari|mazda|auto|petrol|diesel)\b/i.test(bodyColor) || bodyColor.length > 25)) {
        bodyColor = '';
      }

      // 9. Condition
      let condition = '';
      const condLeaf = allLeafElements.find(item => /^(?:excellent|good|clean|fair|used|new|demo)\s*condition$/i.test(item.text) || /^(excellent condition|good condition|clean condition|fair condition)$/i.test(item.text));
      if (condLeaf) condition = condLeaf.text;
      if (!condition) {
        for (const [k, v] of Object.entries(specTableMap)) {
          if (/condition/i.test(k) && !/^(gtb|automatic|petrol|\d+)$/i.test(v)) {
            condition = v;
            break;
          }
        }
      }
      if (!condition) {
        condition = nextDataProps.condition || nextDataProps.vehicleCondition || '';
        if (!condition && jsonLdData.itemCondition) {
          condition = jsonLdData.itemCondition.replace('https://schema.org/', '').replace('Condition', '');
        }
      }
      if (condition && (condition.toLowerCase() === titleDescription.toLowerCase() || /^(gtb|ferrari|mazda|\d+)$/i.test(condition))) {
        condition = '';
      }

      // --- 10 & 16. PRICING & PRICING SUMMARY ---
      let rawPrice = '';
      let installmentText = '';

      // Find cash price element: matches R ... (excluding installments ending in p/m)
      const priceCandidates = allLeafElements.filter(item => {
        return /^\s*R\s*([1-9]\d{0,2}(?:[\s,.]\d{3})+|[1-9]\d{4,8})\s*$/i.test(item.text) && !/p\/m|pm|per month|\/m/i.test(item.text);
      });

      if (priceCandidates.length > 0) {
        rawPrice = priceCandidates[0].text;
      }

      if (!rawPrice) {
        rawPrice = getSelectorText(doc, ['[data-test="price"]', '[data-testid="price"]', '.price-cash', '.price-amount', '#car-price', '.heading-lg.price', 'h2.price', 'span.price']);
      }
      if (!rawPrice) {
        rawPrice = nextDataProps.price || (jsonLdData.offers?.price ? String(jsonLdData.offers.price) : '') || getMeta(['product:price:amount', 'og:price:amount']);
      }

      let priceDigits = String(rawPrice).replace(/[^\d]/g, '');
      let formattedPrice = priceDigits ? Number(priceDigits).toLocaleString('fr-FR').replace(/\s/g, ' ') : '';

      // Find installment text
      const instLeaf = allLeafElements.find(item => /(?:Est\.?\s*)?R\s*[\d\s,.]+\s*(?:p\/m|pm|per month)/i.test(item.text));
      if (instLeaf) {
        installmentText = instLeaf.text.trim();
        if (!installmentText.toLowerCase().startsWith('est.')) {
          installmentText = `Est. ${installmentText}`;
        }
      }

      if (!installmentText && nextDataProps.installment) {
        installmentText = `Est. ${nextDataProps.installment}`;
      }

      let pricingSummary = '';
      const sumLeaf = allLeafElements.find(item => /^R\s*[\d\s,.]+\s*(?:Est\.|\/|\+)\s*R\s*[\d\s,.]+/i.test(item.text));
      if (sumLeaf) {
        pricingSummary = sumLeaf.text.trim();
      }
      if (!pricingSummary) {
        pricingSummary = getSelectorText(doc, ['[data-test="pricing-summary"]', '[data-testid="pricing-summary"]', '#car-price-summary', '.price-summary']);
      }
      if (!pricingSummary && formattedPrice) {
        if (installmentText) {
          pricingSummary = `R ${formattedPrice} / ${installmentText}`;
        } else {
          pricingSummary = `R ${formattedPrice}`;
        }
      } else if (!pricingSummary && nextDataProps.pricingSummary) {
        pricingSummary = nextDataProps.pricingSummary;
      }

      // --- 11, 12, 13. DEALER & RATING ---
      let dealerName = '';
      let dealerAddress = '';
      let averageRating = '';

      // Step A: Extract Dealer Name (distinct from address)
      // 1. Explicit data-cy, data-test, data-testid selectors
      dealerName = getSelectorText(doc, [
        '[data-cy="seller-name"]', '[data-test="dealer-name"]', '[data-testid="dealer-name"]',
        '[data-cy="dealer-name"]', '.dealer-name', '[class*="dealer-name"]', '[class*="dealer__name"]',
        '.seller-info__title', '.dealer-title', '#dealer-name',
        '.dealer-info .name', '.seller-info .name', '.dealer-info [class*="name"]'
      ]);

      // 2. Links to dealer group / profile (excluding navigation buttons)
      if (!dealerName) {
        const dealerLinks = Array.from(doc.querySelectorAll('a[href*="/groups/"], a[href*="/dealers/"], a[href*="/dealer/"], a[href*="/seller/"]'));
        for (const link of dealerLinks) {
          if (link.closest('nav, header, footer')) continue;
          const txt = (link.textContent || '').trim();
          if (txt && txt.length > 2 && txt.length < 80 && !/^(?:view\s*all|all\s*cars|contact|directions|website|dealer\s*banner|back\s*to\s*search)$/i.test(txt)) {
            dealerName = txt;
            break;
          }
        }
      }

      // 3. Dealer Card Container Heading
      if (!dealerName) {
        const sellerContainer = doc.querySelector('[data-cy="seller-address"], [data-cy="seller-info"], [class*="seller-info"], [class*="dealer-info"], [class*="dealer-card"]');
        if (sellerContainer) {
          const titleEl = sellerContainer.querySelector('h1, h2, h3, h4, h5, h6, strong, .name, [class*="name"]');
          if (titleEl) {
            const txt = (titleEl.textContent || '').trim();
            if (txt && txt.length > 2 && txt.length < 80 && !/^(?:seller|dealer|dealership)\s*(?:details|information|info|overview|address)$/i.test(txt)) {
              dealerName = txt;
            }
          }
        }
      }

      // 4. Fallback: Next.js Dehydrated State / JSON-LD
      if (!dealerName) {
        const searchNextDataDealerName = (obj, depth = 0) => {
          if (!obj || typeof obj !== 'object' || depth > 8) return '';
          if (obj.agent_name && typeof obj.agent_name === 'string') return obj.agent_name.trim();
          if (obj.dealer_name && typeof obj.dealer_name === 'string') return obj.dealer_name.trim();
          if (obj.dealer && typeof obj.dealer.name === 'string') return obj.dealer.name.trim();
          if (obj.seller && typeof obj.seller.name === 'string') return obj.seller.name.trim();
          for (const key of Object.keys(obj)) {
            if (typeof obj[key] === 'object' && obj[key] !== null) {
              const res = searchNextDataDealerName(obj[key], depth + 1);
              if (res) return res;
            }
          }
          return '';
        };
        dealerName = searchNextDataDealerName(rawNextData) || searchNextDataDealerName(nextDataProps) || jsonLdData.offers?.seller?.name || '';
      }

      // Clean Dealer Name
      if (dealerName) {
        dealerName = dealerName.replace(/^(?:Seller|Dealer|Dealership)\s*:?\s*/i, '').trim();
      }

      // Step B: Extract Dealer Address (distinct from Dealer Name)
      // 1. Look for element next to map pin icon
      const mapPinEl = doc.querySelector('svg.tabler-icon-map-pin, svg[class*="map-pin"], svg[class*="pin"], [data-cy="seller-location"], [data-test="dealer-location"], [data-testid="dealer-location"], [data-test="dealer-address"], [data-testid="dealer-address"], .dealer-address, .dealer-location');
      if (mapPinEl) {
        const parent = mapPinEl.closest('div, p, span, li') || mapPinEl.parentElement;
        if (parent) {
          const txt = (parent.textContent || '').trim();
          if (txt && txt.length > 3 && txt.length < 90 && txt !== dealerName && !/^(?:view\s*map|map|directions)$/i.test(txt)) {
            dealerAddress = txt;
          }
        }
      }

      // 2. Search for explicit City, Province pattern (e.g. "Centurion, Gauteng", "Sandton, Gauteng", "Vredenburg, Western Cape")
      if (!dealerAddress) {
        const provinceRegex = /^[A-Z][a-zA-Z\s\-']+(?:,\s*|\s+)(?:Gauteng|Western Cape|KwaZulu-Natal|Eastern Cape|Free State|Limpopo|Mpumalanga|North West|Northern Cape)$/i;
        const candidates = allLeafElements.filter(item => provinceRegex.test(item.text.trim()) && item.text.trim() !== dealerName);
        if (candidates.length > 0) {
          dealerAddress = candidates[0].text.trim();
        }
      }

      // 3. Search for elements containing city & province
      if (!dealerAddress) {
        const locMatch = allLeafElements.find(item => {
          const t = item.text.trim();
          if (t === dealerName || t.length > 60 || t.startsWith('R') || /^(?:used\s+cars|view\s+map)/i.test(t)) return false;
          return /(?:Sandton|Cape Town|Johannesburg|Durban|Pretoria|Centurion|Vredenburg|Bellville|Randburg|Boksburg|Roodepoort|Bloemfontein|Gqeberha|Port Elizabeth|East London|Pietermaritzburg|Polokwane|Nelspruit|Mbombela)\s*,\s*(?:Gauteng|Western Cape|KwaZulu-Natal|Eastern Cape|Free State|Limpopo|Mpumalanga|North West|Northern Cape)/i.test(t);
        });
        if (locMatch) {
          dealerAddress = locMatch.text.trim();
        }
      }

      // 4. Fallback: Next.js Dehydrated State (agent_locality + province, dealer.address, location)
      if (!dealerAddress) {
        const searchNextDataAddress = (obj, depth = 0) => {
          if (!obj || typeof obj !== 'object' || depth > 8) return '';
          if (obj.agent_locality && obj.province) return `${obj.agent_locality.trim()}, ${obj.province.trim()}`;
          if (obj.agent_locality && !obj.province) return obj.agent_locality.trim();
          if (obj.dealer_location && typeof obj.dealer_location === 'string') return obj.dealer_location.trim();
          if (obj.dealer_address && typeof obj.dealer_address === 'string') return obj.dealer_address.trim();
          if (obj.dealer?.address && typeof obj.dealer.address === 'string') return obj.dealer.address.trim();
          if (obj.dealer?.location && typeof obj.dealer.location === 'string') return obj.dealer.location.trim();
          for (const key of Object.keys(obj)) {
            if (typeof obj[key] === 'object' && obj[key] !== null) {
              const res = searchNextDataAddress(obj[key], depth + 1);
              if (res) return res;
            }
          }
          return '';
        };
        dealerAddress = searchNextDataAddress(rawNextData) || searchNextDataAddress(nextDataProps) || jsonLdData.offers?.seller?.address || '';
      }

      // Strict validation: Dealer Address must NEVER equal Dealer Name
      if (dealerAddress === dealerName) {
        dealerAddress = '';
      }

      // Average Rating
      const ratingLeaf = allLeafElements.find(item => /(?:★\s*)?([1-5]\.\d)\s*(?:\/5)?\s*(?:\(\s*(\d+)\s*(?:Reviews?|reviews?)?\s*\)|(\d+)\s*(?:Reviews?|reviews?))/i.test(item.text));
      if (ratingLeaf) {
        const match = ratingLeaf.text.match(/(?:★\s*)?([1-5]\.\d)\s*(?:\/5)?\s*(?:\(\s*(\d+)\s*(?:Reviews?|reviews?)?\s*\)|(\d+)\s*(?:Reviews?|reviews?))/i);
        if (match) {
          const score = match[1];
          const count = match[2] || match[3] || '';
          averageRating = count ? `${score} (${count} Reviews)` : score;
        }
      }
      if (!averageRating) {
        const scoreLeaf = allLeafElements.find(item => /^[★\s]*([1-5]\.\d)[★\s]*$/.test(item.text));
        const revLeaf = allLeafElements.find(item => /^\s*(\d+)\s*(?:reviews?|ratings?)\s*$/i.test(item.text));
        if (scoreLeaf && revLeaf) {
          const scoreMatch = scoreLeaf.text.match(/([1-5]\.\d)/);
          const revMatch = revLeaf.text.match(/(\d+)/);
          if (scoreMatch && revMatch) {
            averageRating = `${scoreMatch[1]} (${revMatch[1]} Reviews)`;
          }
        }
      }
      if (!averageRating) {
        averageRating = nextDataProps.dealer?.rating || nextDataProps.dealer?.aggregateRating || '';
        if (!averageRating && jsonLdData.offers?.seller?.aggregateRating) {
          const agg = jsonLdData.offers.seller.aggregateRating;
          const val = agg.ratingValue || '';
          const count = agg.reviewCount || '';
          if (val) averageRating = `${val}${count ? ` (${count} Reviews)` : ''}`;
        }
      }

      // --- 14. FEATURES (Preserved Successful Logic) ---
      let featuresList = nextDataProps.features || [];
      if (typeof featuresList === 'string') {
        featuresList = featuresList.split('\n').map(f => f.trim()).filter(Boolean);
      }

      if (!featuresList || featuresList.length === 0) {
        const featureHeading = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6, strong, b')).find(el => /^(?:Key\s+|Vehicle\s+|Standard\s+)?Features$/i.test(el.textContent.trim()));
        let featuresContainer = null;
        if (featureHeading) {
          featuresContainer = featureHeading.closest('div, section, article') || featureHeading.parentElement;
        } else {
          featuresContainer = doc.querySelector('[data-test="features"], [data-testid="features"], #car-features, .features-grid, .features-list, .equipment-list');
        }

        if (featuresContainer) {
          const itemEls = featuresContainer.querySelectorAll('li, [class*="feature-item"], [class*="chip"], [class*="tag"], [class*="pill"], div, p');
          const items = [];
          itemEls.forEach(el => {
            if (el.children.length <= 1) {
              const txt = (el.textContent || '').trim();
              if (txt && txt.length > 1 && txt.length < 80 && !/^(features|key features|show more|view all|read more|back to search|used cars)$/i.test(txt)) {
                if (!items.includes(txt)) items.push(txt);
              }
            }
          });
          if (items.length > 0) featuresList = items;
        }
      }

      // --- 15. DESCRIPTION (CSS-Safe Multi-Strategy Scoped Extractor with Show More Clicker) ---
      let description = '';

      // Guard: Check if a string contains CSS / style / syntax junk
      const hasCssArtifacts = (str) => {
        if (!str || typeof str !== 'string') return false;
        return /[{}\[\]]|font-size:|var\(--|@media|\.__m__|line-height:|color:|margin:|padding:|<style|\.className_|text-transform:|background-color:/i.test(str);
      };

      // Helper: Safely extract human-readable text from a container, stripping style/script/svg/buttons and preserving paragraphs
      const extractPureDescriptionText = (container) => {
        if (!container) return '';
        let clone;
        try {
          clone = container.cloneNode(true);
        } catch (e) {
          clone = container;
        }

        if (clone.querySelectorAll) {
          // 1. Remove all non-content, styling, script and hidden elements completely
          const junk = clone.querySelectorAll('style, script, noscript, svg, button, iframe, nav, header, footer, [aria-hidden="true"], [style*="display: none"], [style*="display:none"], [hidden]');
          junk.forEach(el => el.remove());

          // 2. Remove any Show More / Read More anchors or spans
          const moreControls = clone.querySelectorAll('a, span, div, p');
          moreControls.forEach(el => {
            const txt = (el.textContent || '').trim();
            if (/^(?:show\s*more|read\s*more|view\s*more|show\s*less|read\s*less|expand|\.\.\.\s*more)$/i.test(txt)) {
              el.remove();
            }
          });

          // 3. Replace <br> tags with \n
          clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));

          // 4. Strategy A: Extract from explicit <p> paragraph elements
          const pElements = Array.from(clone.querySelectorAll('p'));
          if (pElements.length > 0) {
            const validParagraphs = pElements
              .map(p => (p.textContent || '').replace(/\r\n/g, '\n').split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join(' ').trim())
              .filter(p => p.length > 0 && !/^(?:seller\s+|dealer\s+|vehicle\s+)?description:?$/i.test(p) && !hasCssArtifacts(p));

            if (validParagraphs.length > 0) {
              const combined = validParagraphs.join('\n\n');
              if (!hasCssArtifacts(combined) && combined.length > 15) {
                return combined;
              }
            }
          }

          // 5. Strategy B: Check if there are multiple child block elements (div, section, article, li)
          const childBlocks = Array.from(clone.children).filter(el => /^(DIV|SECTION|ARTICLE|LI)$/i.test(el.tagName));
          if (childBlocks.length > 1) {
            const validBlocks = childBlocks
              .map(el => (el.textContent || '').replace(/\r\n/g, '\n').split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join(' ').trim())
              .filter(p => p.length > 0 && !/^(?:seller\s+|dealer\s+|vehicle\s+)?description:?$/i.test(p) && !hasCssArtifacts(p));

            if (validBlocks.length > 0) {
              const combined = validBlocks.join('\n\n');
              if (!hasCssArtifacts(combined) && combined.length > 15) {
                return combined;
              }
            }
          }
        }

        // 6. Strategy C: Text content with newline separation
        const rawText = (clone.textContent || '')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n');

        const rawBlocks = rawText.split(/\n{2,}/);
        const cleanBlocks = rawBlocks
          .map(block => block.split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join(' ').trim())
          .filter(p => p.length > 0 && !/^(?:seller\s+|dealer\s+|vehicle\s+)?description:?$/i.test(p) && !hasCssArtifacts(p));

        const combined = cleanBlocks.join('\n\n');
        return hasCssArtifacts(combined) ? '' : combined;
      };

      // Step A: Locate Description Heading Element
      const descHeadingCandidates = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6, [class*="heading"], [class*="title"], strong, b, button, summary, p, div, span'));
      const descHeading = descHeadingCandidates.find(el => {
        const t = (el.textContent || '').trim();
        return /^(?:Seller\s+|Dealer\s+|Vehicle\s+)?Description:?$/i.test(t) && t.length < 30;
      });

      let descBodyContainer = null;

      if (descHeading) {
        let next = descHeading.nextElementSibling;
        if (!next && descHeading.parentElement && descHeading.parentElement !== doc.body) {
          next = descHeading.parentElement.nextElementSibling;
        }
        while (next && !descBodyContainer) {
          const text = extractPureDescriptionText(next);
          if (text.length > 20 && !text.toLowerCase().includes('back to search') && !hasCssArtifacts(text)) {
            descBodyContainer = next;
            break;
          }
          next = next.nextElementSibling;
        }
        if (!descBodyContainer) {
          descBodyContainer = descHeading.closest('section, article, [class*="description"], [class*="card"], [class*="detail"]');
        }
      }

      // Step B: Direct selector lookup for container if not found via heading
      if (!descBodyContainer) {
        descBodyContainer = doc.querySelector('[data-test="description"], [data-testid="description"], #car-description, #description, .description-content, .vehicle-description, .description-text, [class*="description-section"], [class*="description-content"], section[class*="description"]');
      }

      // Step C: Trigger "Show More" / "Read More" button if present
      if (descBodyContainer) {
        const expandBtns = descBodyContainer.querySelectorAll('button, a, [role="button"], span, div');
        for (const btn of expandBtns) {
          const btnTxt = (btn.textContent || '').trim();
          if (/^(?:show\s*more|read\s*more|view\s*more|expand|\.\.\.\s*more)$/i.test(btnTxt)) {
            try {
              btn.click();
              btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            } catch (e) {}
            break;
          }
        }

        // Step D: Extract pure text from container
        description = extractPureDescriptionText(descBodyContainer);
      }

      // Step E: Clean and sanitize description string
      if (description) {
        description = description
          .replace(/^(?:Seller\s+|Dealer\s+|Vehicle\s+)?Description\s*:?\s*/i, '')
          .replace(/(?:Show|Read|View)\s*(?:more|less)\s*$/i, '')
          .replace(/^(?:Show|Read|View)\s*(?:more|less)\s*/i, '')
          .trim();

        if (description.toLowerCase().includes('back to search') || description.length < 20 || hasCssArtifacts(description)) {
          description = '';
        }
      }

      // Step F: Next.js Dehydrated State / JSON-LD Fallback (contains 100% complete seller description)
      if (!description) {
        const stateDesc = nextDataProps.description || nextDataProps.sellerComments || nextDataProps.dealerComments || nextDataProps.comments || '';
        if (stateDesc && !hasCssArtifacts(stateDesc)) {
          description = stateDesc;
        }
      }
      if (!description && jsonLdData.description && jsonLdData.description.length > 40 && !hasCssArtifacts(jsonLdData.description)) {
        description = jsonLdData.description;
      }

      // Step G: Normalize multi-paragraph spacing
      if (description) {
        description = Normalizers.normalizeDescription(description);
      }

      // --- 16. VEHICLE HIGHLIGHTS (Robust multi-card structural extractor) ---
      let vehicleHighlights = '';

      // Helper: Safely extract human-readable text lines from an element
      const extractHighlightCardLines = (el) => {
        if (!el) return [];
        let clone;
        try { clone = el.cloneNode(true); } catch (e) { clone = el; }
        if (clone.querySelectorAll) {
          const junk = clone.querySelectorAll('style, script, noscript, svg, button, iframe, nav, header, footer, [aria-hidden="true"], [style*="display: none"], [style*="display:none"], [hidden]');
          junk.forEach(j => j.remove());
          clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
        }

        const text = (clone.textContent || '')
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n');

        const rawLines = text.split('\n');
        const cleanLines = rawLines
          .map(l => l.replace(/[ \t]+/g, ' ').trim())
          .filter(l => l.length > 0 && !/^(?:vehicle\s+|key\s+|car\s+)?highlights:?$/i.test(l) && !hasCssArtifacts(l));

        const uniqueLines = [];
        for (const line of cleanLines) {
          if (uniqueLines.length === 0 || uniqueLines[uniqueLines.length - 1] !== line) {
            uniqueLines.push(line);
          }
        }
        return uniqueLines;
      };

      // 1. Locate heading element for Vehicle Highlights (prefer deepest element containing the heading text)
      const highlightHeadingCandidates = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6, strong, b, [class*="heading"], [class*="title"], summary, p, div, span')).filter(el => {
        const t = (el.textContent || '').trim();
        return /^(?:Vehicle\s+|Key\s+|Car\s+)?Highlights(?:\s*\(\d+\))?:?$/i.test(t) && t.length < 35 && !hasCssArtifacts(t);
      });

      // Deepest candidate element (avoids selecting outer section container)
      let highlightHeading = null;
      if (highlightHeadingCandidates.length > 0) {
        highlightHeading = highlightHeadingCandidates.reduce((deepest, curr) => {
          if (!deepest) return curr;
          return (deepest.contains(curr) && deepest !== curr) ? curr : deepest;
        }, null);
      }

      // 2. Identify candidate container(s) for the highlights section
      const candidateContainers = [];

      if (highlightHeading) {
        // Sibling of heading
        if (highlightHeading.nextElementSibling) {
          candidateContainers.push(highlightHeading.nextElementSibling);
        }
        // Sibling of heading's immediate wrapper
        if (highlightHeading.parentElement && highlightHeading.parentElement !== doc.body) {
          if (highlightHeading.parentElement.nextElementSibling) {
            candidateContainers.push(highlightHeading.parentElement.nextElementSibling);
          }
          if (highlightHeading.parentElement.parentElement && highlightHeading.parentElement.parentElement !== doc.body) {
            if (highlightHeading.parentElement.parentElement.nextElementSibling) {
              candidateContainers.push(highlightHeading.parentElement.parentElement.nextElementSibling);
            }
          }
        }
        // Enclosing section / article / card
        let p = highlightHeading.parentElement;
        while (p && p !== doc.body && p.tagName !== 'BODY') {
          candidateContainers.push(p);
          p = p.parentElement;
        }
      }

      // Direct attribute selector candidates
      const directContainers = doc.querySelectorAll('[data-test*="highlight"], [data-testid*="highlight"], #vehicle-highlights, #highlights, .vehicle-highlights, .highlights-section, section[class*="highlight"], div[class*="highlights"]');
      directContainers.forEach(el => candidateContainers.push(el));

      // 3. Find repeated card items inside containers
      let extractedCards = [];

      for (const container of candidateContainers) {
        if (!container || extractedCards.length > 0) break;

        // Strategy A: Direct repeated children of a grid/flex wrapper inside container
        const candidateWrappers = [container, ...Array.from(container.querySelectorAll('div, ul, ol, section, article'))];
        
        for (const wrapper of candidateWrappers) {
          if (wrapper === highlightHeading || (wrapper.contains(highlightHeading) && wrapper.children.length === 1)) continue;
          
          const children = Array.from(wrapper.children).filter(c => {
            if (c === highlightHeading || c.contains(highlightHeading)) return false;
            if (/^(STYLE|SCRIPT|NOSCRIPT|SVG|BUTTON|NAV|HEADER|FOOTER)$/i.test(c.tagName)) return false;
            return true;
          });

          if (children.length >= 1 && children.length <= 12) {
            // Check if children look like highlight cards (each having 2 to 6 clean lines)
            const validChildCards = children.map(c => extractHighlightCardLines(c)).filter(lines => lines.length >= 2 && lines.length <= 6);
            
            if (validChildCards.length >= 1 && validChildCards.length === children.length) {
              // Found exact repeated cards wrapper!
              extractedCards = validChildCards.map(lines => lines.join('\n'));
              break;
            } else if (validChildCards.length >= 2 && validChildCards.length >= children.length * 0.6) {
              // Found cards wrapper with some minor decorative sibling nodes
              extractedCards = validChildCards.map(lines => lines.join('\n'));
              break;
            }
          }
        }

        // Strategy B: If no clear wrapper found, gather leaf-like card elements
        if (extractedCards.length === 0) {
          const potentialCards = Array.from(container.querySelectorAll('div, li, article, section')).filter(el => {
            if (el === highlightHeading || el.contains(highlightHeading) || el === container) return false;
            const lines = extractHighlightCardLines(el);
            if (lines.length >= 2 && lines.length <= 6) {
              // Check if child elements themselves have 2+ lines
              const childCards = Array.from(el.children).filter(c => extractHighlightCardLines(c).length >= 2);
              return childCards.length <= 1;
            }
            return false;
          });

          if (potentialCards.length >= 1 && potentialCards.length <= 12) {
            const seen = new Set();
            const cardsList = [];
            for (const cardEl of potentialCards) {
              const lines = extractHighlightCardLines(cardEl);
              if (lines.length >= 2) {
                const text = lines.join('\n');
                if (!seen.has(text) && !hasCssArtifacts(text)) {
                  seen.add(text);
                  cardsList.push(text);
                }
              }
            }
            if (cardsList.length > 0) {
              extractedCards = cardsList;
            }
          }
        }
      }

      if (extractedCards.length > 0) {
        vehicleHighlights = extractedCards.join('\n\n');
      }

      // 4. Fallback: Deep recursive search in Next.js State (handles vehicle_highlights, key_highlights, etc.)
      if (!vehicleHighlights && (nextDataProps || rawNextData)) {
        const searchNextDataHighlights = (obj, depth = 0) => {
          if (!obj || typeof obj !== 'object' || depth > 8) return null;
          for (const key of Object.keys(obj)) {
            if (/^(?:vehicle_?highlights?|key_?highlights?|highlights?|vehicle_?insights?|insights?|specs?_?highlights?|selling_?points?|key_?specs?)$/i.test(key)) {
              const val = obj[key];
              if (Array.isArray(val) && val.length > 0) return val;
            }
          }
          for (const key of Object.keys(obj)) {
            if (typeof obj[key] === 'object' && obj[key] !== null) {
              const res = searchNextDataHighlights(obj[key], depth + 1);
              if (res) return res;
            }
          }
          return null;
        };

        const rawHL = searchNextDataHighlights(rawNextData) || searchNextDataHighlights(nextDataProps);
        if (Array.isArray(rawHL) && rawHL.length > 0) {
          const stateCards = rawHL.map(item => {
            if (typeof item === 'string') return item.trim();
            if (typeof item === 'object' && item !== null) {
              const title = item.title || item.heading || item.name || item.label || '';
              const val = item.value || item.metric || item.stat || item.figure || '';
              const desc = item.description || item.desc || item.detail || item.text || item.summary || '';
              return [title, val, desc].filter(Boolean).map(s => String(s).trim()).join('\n');
            }
            return '';
          }).filter(Boolean);
          if (stateCards.length > 0) {
            vehicleHighlights = stateCards.join('\n\n');
          }
        }
      }

      if (vehicleHighlights) {
        vehicleHighlights = Normalizers.normalizeVehicleHighlights(vehicleHighlights);
      }

      // --- 17. SOURCE URL ---
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
        vehicleHighlights,
        price: formattedPrice || rawPrice,
        sourceUrl
      };
    }
  };

  // --- 4. FLOATING UI PANEL CONTROLLER (18 Fields with Individual COPY buttons) ---
  const FIELD_DEFINITIONS = [
    { key: 'title', label: 'Title' },
    { key: 'titleDescription', label: 'Title Description' },
    { key: 'year', label: 'Year' },
    { key: 'kilometersDriven', label: 'Kilometers Driven' },
    { key: 'transmission', label: 'Transmission' },
    { key: 'fuel', label: 'Fuel' },
    { key: 'drivetrain', label: '4x2 / 4x4' },
    { key: 'bodyColor', label: 'Body Color' },
    { key: 'condition', label: 'Condition' },
    { key: 'pricingSummary', label: 'Pricing Summary' },
    { key: 'dealerName', label: 'Dealer Name' },
    { key: 'dealerAddress', label: 'Dealer Address' },
    { key: 'averageRating', label: 'Average Rating' },
    { key: 'features', label: 'Features (Newline-separated)' },
    { key: 'description', label: 'Description' },
    { key: 'vehicleHighlights', label: 'Vehicle Highlights' },
    { key: 'price', label: 'Price' },
    { key: 'sourceUrl', label: 'Source URL' }
  ];

  let currentExtractedData = {};

  function normalizeAndValidate(raw) {
    const norm = Normalizers;
    const normalized = {
      title: norm.cleanText(raw.title),
      titleDescription: norm.cleanText(raw.titleDescription),
      year: norm.normalizeYear(raw.year),
      kilometersDriven: norm.normalizeKilometersDriven(raw.kilometersDriven),
      transmission: norm.normalizeTransmission(raw.transmission),
      fuel: norm.normalizeFuel(raw.fuel),
      drivetrain: norm.normalize4x2Or4x4(raw.drivetrain),
      bodyColor: norm.cleanText(raw.bodyColor),
      condition: norm.cleanText(raw.condition),
      pricingSummary: norm.cleanText(raw.pricingSummary),
      dealerName: norm.cleanText(raw.dealerName),
      dealerAddress: norm.cleanText(raw.dealerAddress),
      averageRating: norm.cleanText(raw.averageRating),
      features: norm.normalizeFeatures(raw.features),
      description: norm.normalizeDescription(raw.description),
      vehicleHighlights: norm.normalizeVehicleHighlights(raw.vehicleHighlights),
      price: norm.normalizePrice(raw.price),
      sourceUrl: raw.sourceUrl || window.location.href
    };
    const validation = Validators.validateAll(normalized);
    return { normalized, validation };
  }

  function copyToClipboard(text, btnElement, event) {
    if (event) {
      try {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      } catch (e) {}
    }
    const cleanStr = (text == null) ? '' : String(text);
    if (!cleanStr.trim() || cleanStr.trim() === 'Missing / Needs Review') {
      alert('This field is missing or unextracted on this listing.');
      return;
    }

    const copyFallback = (str) => {
      const textarea = document.createElement('textarea');
      textarea.value = str;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('Fallback copy failed:', err);
      }
      document.body.removeChild(textarea);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(cleanStr).catch(() => copyFallback(cleanStr));
    } else {
      copyFallback(cleanStr);
    }

    if (btnElement) {
      const origText = btnElement.textContent;
      btnElement.textContent = 'COPIED!';
      btnElement.style.background = '#10b981';
      btnElement.style.color = '#ffffff';
      setTimeout(() => {
        btnElement.textContent = origText;
        btnElement.style.background = '#f1f5f9';
        btnElement.style.color = '#0f172a';
      }, 1400);
    }
  }

  function createHelperPanel() {
    if (document.getElementById('car-data-helper-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'car-data-helper-panel';
    panel.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      width: 440px;
      max-height: calc(100vh - 32px);
      background: #ffffff;
      color: #0f172a;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 13px;
      z-index: 9999999;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `;

    panel.innerHTML = `
      <div id="car-panel-header" style="background:#0f172a; color:#f8fafc; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; cursor:move; user-select:none;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:16px;">🚗</span>
          <div>
            <strong style="font-size:13px; letter-spacing:0.3px;">Car Data Entry Helper</strong>
            <span style="font-size:10px; background:#3b82f6; color:#ffffff; padding:2px 6px; border-radius:10px; margin-left:6px; font-weight:700;">v${SCRIPT_VERSION}</span>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <button id="car-panel-reextract" title="Re-extract live data" style="background:#334155; color:#f8fafc; border:none; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:600;">🔄 Re-extract</button>
          <button id="car-panel-toggle" title="Minimize / Expand" style="background:transparent; color:#94a3b8; border:none; font-size:14px; cursor:pointer; padding:2px 6px;">➖</button>
        </div>
      </div>

      <div id="car-panel-summary-bar" style="background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:8px 16px; font-size:11px; color:#64748b; display:flex; justify-content:space-between; align-items:center;">
        <span id="car-extracted-count">Extracting fields...</span>
        <span style="font-size:10px; color:#94a3b8;">Manual 1-Click Copy</span>
      </div>

      <div id="car-panel-body" style="padding:10px 14px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:8px;">
        <!-- Fields will be dynamically injected -->
      </div>

      <div id="car-panel-footer" style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
        <button id="car-panel-copy-all" style="background:#2563eb; color:#ffffff; border:none; padding:6px 12px; border-radius:6px; font-weight:600; font-size:12px; cursor:pointer; width:100%;">
          📋 Copy All Extracted (JSON)
        </button>
      </div>
    `;

    document.body.appendChild(panel);

    panel.querySelector('#car-panel-reextract').onclick = () => runExtraction();
    panel.querySelector('#car-panel-toggle').onclick = () => {
      const body = panel.querySelector('#car-panel-body');
      const footer = panel.querySelector('#car-panel-footer');
      const sumBar = panel.querySelector('#car-panel-summary-bar');
      const btn = panel.querySelector('#car-panel-toggle');
      if (body.style.display === 'none') {
        body.style.display = 'flex';
        footer.style.display = 'flex';
        sumBar.style.display = 'flex';
        btn.textContent = '➖';
      } else {
        body.style.display = 'none';
        footer.style.display = 'none';
        sumBar.style.display = 'none';
        btn.textContent = '➕';
      }
    };

    panel.querySelector('#car-panel-copy-all').onclick = (e) => {
      const payload = {
        marker: 'CAR_DATA_ENTRY_HELPER',
        version: 1,
        source: 'cars.co.za',
        sourceUrl: currentExtractedData.sourceUrl || window.location.href,
        fields: {
          title: currentExtractedData.title || '',
          titleDescription: currentExtractedData.titleDescription || '',
          year: currentExtractedData.year || '',
          kilometersDriven: currentExtractedData.kilometersDriven || '',
          transmission: currentExtractedData.transmission || '',
          fuel: currentExtractedData.fuel || '',
          drivetrain: currentExtractedData.drivetrain || '',
          bodyColor: currentExtractedData.bodyColor || '',
          condition: currentExtractedData.condition || '',
          pricingSummary: currentExtractedData.pricingSummary || '',
          dealerName: currentExtractedData.dealerName || '',
          dealerAddress: currentExtractedData.dealerAddress || '',
          averageRating: currentExtractedData.averageRating || '',
          features: currentExtractedData.features || '',
          description: currentExtractedData.description || '',
          vehicleHighlights: currentExtractedData.vehicleHighlights || '',
          price: currentExtractedData.price || '',
          sourceUrl: currentExtractedData.sourceUrl || window.location.href
        }
      };
      const jsonStr = JSON.stringify(payload, null, 2);
      copyToClipboard(jsonStr, e.target);
    };

    runExtraction();
  }

  function runExtraction() {
    const bodyEl = document.getElementById('car-panel-body');
    const countEl = document.getElementById('car-extracted-count');
    if (!bodyEl) return;

    bodyEl.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">Extracting live page specifications...</div>';

    setTimeout(() => {
      const raw = CarsCoZaAdapter.extract(document);
      const { normalized, validation } = normalizeAndValidate(raw);
      currentExtractedData = normalized;

      let extractedCount = 0;
      bodyEl.innerHTML = '';

      FIELD_DEFINITIONS.forEach(({ key, label }) => {
        const val = normalized[key];
        const statusObj = validation[key];
        const isExtracted = statusObj.status === 'extracted';
        if (isExtracted) extractedCount++;

        const row = document.createElement('div');
        row.style.cssText = `
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 6px 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          transition: all 0.15s ease;
        `;

        const leftCol = document.createElement('div');
        leftCol.style.cssText = 'flex:1; min-width:0;';

        const labelEl = document.createElement('div');
        labelEl.style.cssText = 'font-size:10.5px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.4px;';
        labelEl.textContent = label;

        const valEl = document.createElement('div');
        valEl.style.cssText = 'font-size:12.5px; font-weight:600; margin-top:2px; word-break:break-word; white-space:pre-wrap; max-height:80px; overflow-y:auto;';

        if (isExtracted) {
          valEl.style.color = '#0f172a';
          valEl.textContent = val;
        } else {
          valEl.style.color = '#dc2626';
          valEl.innerHTML = `<span style="background:#fee2e2; color:#b91c1c; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:600;">Missing / Needs Review</span>`;
        }

        leftCol.appendChild(labelEl);
        leftCol.appendChild(valEl);

        const copyBtn = document.createElement('button');
        copyBtn.style.cssText = `
          background: #f1f5f9;
          color: #0f172a;
          border: 1px solid #cbd5e1;
          padding: 5px 10px;
          border-radius: 5px;
          font-weight: 700;
          font-size: 11px;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s ease;
        `;
        copyBtn.type = 'button';
        copyBtn.textContent = 'COPY';
        copyBtn.title = `Copy ${label}`;
        copyBtn.onclick = (e) => copyToClipboard(val, copyBtn, e);

        row.appendChild(leftCol);
        row.appendChild(copyBtn);
        bodyEl.appendChild(row);
      });

      if (countEl) {
        countEl.textContent = `Extracted ${extractedCount} of 18 fields`;
        countEl.style.color = extractedCount >= 15 ? '#16a34a' : (extractedCount >= 9 ? '#d97706' : '#dc2626');
        countEl.style.fontWeight = '700';
      }
    }, 100);
  }

  // --- 5. SMART PASTE ENGINE (Silent Background Transport Layer) ---
  const SmartPasteEngine = {
    init() {
      if (window.__carSmartPasteInitialized) return;
      window.__carSmartPasteInitialized = true;
      document.addEventListener('paste', this.handlePaste.bind(this), true);
    },

    handlePaste(e) {
      let text = '';
      try {
        if (e.clipboardData) {
          text = e.clipboardData.getData('text/plain') || e.clipboardData.getData('text');
        } else if (window.clipboardData) {
          text = window.clipboardData.getData('Text');
        }
      } catch (err) {
        return;
      }

      if (!text || typeof text !== 'string') return;
      const trimmed = text.trim();

      // Fast check for marker
      if (!trimmed.startsWith('{') || !trimmed.includes('CAR_DATA_ENTRY_HELPER')) {
        // Normal paste - DO NOT intercept, DO NOT preventDefault, DO NOT stopPropagation
        return;
      }

      let payload;
      try {
        payload = JSON.parse(trimmed);
      } catch (err) {
        return;
      }

      if (!payload || payload.marker !== 'CAR_DATA_ENTRY_HELPER' || !payload.fields) {
        return;
      }

      // Intercept our Smart Paste payload
      e.preventDefault();
      e.stopPropagation();

      this.fillTargetForm(document, payload.fields);
    },

    fillTargetForm(doc, fields) {
      if (!doc || !fields) return;

      const triggerEvents = (el) => {
        try {
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
        } catch (err) {}
      };

      const isClean = (v) => {
        if (v == null) return false;
        const s = String(v).trim();
        return s !== '' && s !== 'Missing / Needs Review';
      };

      // Helper to find input/textarea by exact semantic criteria
      const findFieldElement = (identifiers) => {
        // 1. Direct selector match
        for (const sel of identifiers.selectors || []) {
          try {
            const el = doc.querySelector(sel);
            if (el && this.isSafeEditable(el, identifiers.allowSelect)) return el;
          } catch (e) {}
        }

        // 2. Label match
        if (identifiers.labels && identifiers.labels.length > 0) {
          const allLabels = doc.querySelectorAll('label, .control-label, .form-label');
          for (const lbl of allLabels) {
            const lText = lbl.textContent.replace(/\s+/g, ' ').trim();
            for (const targetLabel of identifiers.labels) {
              const matches = typeof targetLabel === 'string'
                ? lText.toLowerCase() === targetLabel.toLowerCase()
                : targetLabel.test(lText);

              if (matches) {
                // Check if label has a "for" attribute
                const forId = lbl.getAttribute('for');
                if (forId) {
                  const el = (doc.getElementById ? doc.getElementById(forId) : (doc.ownerDocument || document).getElementById(forId)) || (doc.querySelector ? doc.querySelector('#' + CSS.escape(forId)) : null);
                  if (el && this.isSafeEditable(el, identifiers.allowSelect)) return el;
                }
                // Check inside label
                const inside = lbl.querySelector('input, textarea');
                if (inside && this.isSafeEditable(inside, identifiers.allowSelect)) return inside;

                // Check container/sibling
                const container = lbl.closest('.form-group, .control-group, .demo-form-group, tr, td, .form-item, div');
                if (container) {
                  const siblingInput = container.querySelector('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea');
                  if (siblingInput && this.isSafeEditable(siblingInput, identifiers.allowSelect)) return siblingInput;
                }
              }
            }
          }
        }

        // 3. Name fallback
        if (identifiers.names) {
          for (const name of identifiers.names) {
            const el = doc.querySelector(`input[name="${name}"], textarea[name="${name}"]`);
            if (el && this.isSafeEditable(el, identifiers.allowSelect)) return el;
          }
        }

        return null;
      };

      // 1. TITLE
      if (isClean(fields.title)) {
        const el = findFieldElement({
          selectors: ['#target_vehicle_title', '#target_title', '#title', 'input[name="title"]', 'input[name="advert_title"]', 'input[name="target_vehicle_title"]'],
          labels: [/^title\s*\*?$/i, /^vehicle title\s*(?:\/\s*full name)?\s*\*?$/i],
          names: ['title', 'advert_title', 'target_vehicle_title']
        });
        if (el) { el.value = fields.title; triggerEvents(el); }
      }

      // 2. TITLE DESCRIPTION
      if (isClean(fields.titleDescription)) {
        const el = findFieldElement({
          selectors: ['#target_title_description', '#title_description', 'input[name="title_description"]', 'input[name="fields[title_description]"]', 'input[name*="title_description"]'],
          labels: [/^title description\s*\*?$/i],
          names: ['title_description', 'target_title_description']
        });
        if (el) { el.value = fields.titleDescription; triggerEvents(el); }
      }

      // 3. YEAR
      if (isClean(fields.year)) {
        const el = findFieldElement({
          selectors: ['#target_year', '#year', 'input[name="year"]', 'input[name="fields[year]"]', 'input[name*="year"]', 'input[name="target_year"]'],
          labels: [/^year\s*\*?$/i, /^year of manufacture\s*\*?$/i],
          names: ['year', 'target_year']
        });
        if (el) { el.value = fields.year; triggerEvents(el); }
      }

      // 4. KILOMETERS DRIVEN
      if (isClean(fields.kilometersDriven)) {
        const el = findFieldElement({
          selectors: ['#target_kilometers_driven', '#target_mileage', '#kilometers_driven', '#mileage', 'input[name="kilometers_driven"]', 'input[name="mileage"]', 'input[name*="kilometer"]', 'input[name="target_mileage"]'],
          labels: [/^kilometers driven\s*\*?$/i, /^odometer mileage\s*(?:\(km\))?\s*\*?$/i, /^mileage\s*\*?$/i],
          names: ['kilometers_driven', 'mileage', 'target_mileage']
        });
        if (el) { el.value = fields.kilometersDriven; triggerEvents(el); }
      }

      // 5. TRANSMISSION
      if (isClean(fields.transmission)) {
        const el = findFieldElement({
          selectors: ['#target_transmission_input', '#target_transmission', '#transmission', 'input[name="transmission"]', 'input[name="fields[transmission]"]', 'input[name*="transmission"]'],
          labels: [/^transmission\s*\*?$/i],
          names: ['transmission', 'target_transmission']
        });
        if (el) { el.value = fields.transmission; triggerEvents(el); }
      }

      // 6. FUEL
      if (isClean(fields.fuel)) {
        const el = findFieldElement({
          selectors: ['#target_fuel_input', '#target_fuel', '#fuel', 'input[name="fuel"]', 'input[name="fields[fuel]"]', 'input[name*="fuel"]'],
          labels: [/^fuel(?:\s+type)?\s*\*?$/i],
          names: ['fuel', 'target_fuel']
        });
        if (el) { el.value = fields.fuel; triggerEvents(el); }
      }

      // 7. 4X2 / 4X4
      if (isClean(fields.drivetrain)) {
        const el = findFieldElement({
          selectors: ['#target_drivetrain_input', '#target_drivetrain', '#drivetrain', '#target_4x2_4x4', 'input[name="drivetrain"]', 'input[name="4x2_4x4"]', 'input[name*="drivetrain"]', 'input[name*="4x2"]'],
          labels: [/^4x2\s*\/\s*4x4\s*\*?$/i, /^4x2\s*\/\s*4x4\s*drivetrain\s*\*?$/i, /^drivetrain\s*\*?$/i],
          names: ['drivetrain', '4x2_4x4', 'target_drivetrain']
        });
        if (el) { el.value = fields.drivetrain; triggerEvents(el); }
      }

      // 8. BODY COLOUR
      if (isClean(fields.bodyColor)) {
        const el = findFieldElement({
          selectors: ['#target_body_colour', '#target_body_color', '#body_colour', '#body_color', 'input[name*="body_colour"]', 'input[name*="body_color"]', 'input[name="colour"]', 'input[name="color"]'],
          labels: [/^body colou?r\s*\*?$/i, /^exterior body colou?r\s*\*?$/i],
          names: ['body_colour', 'body_color', 'target_body_colour']
        });
        if (el) { el.value = fields.bodyColor; triggerEvents(el); }
      }

      // 9. CONDITION (Target SECOND Condition text input ONLY; NEVER touch the first "Used Or New" control)
      if (isClean(fields.condition)) {
        const findSecondConditionField = () => {
          // Explicit test harness selector
          const explicitSecond = doc.querySelector('#target_condition_input, input[name="target_condition_input"]');
          if (explicitSecond && explicitSecond.tagName === 'INPUT' && explicitSecond.type !== 'radio' && explicitSecond.type !== 'checkbox') {
            return explicitSecond;
          }

          // Gather all inputs associated with "Condition" label in DOM order
          const conditionCandidates = [];
          const allLabels = doc.querySelectorAll('label, .control-label, .form-label');

          for (const lbl of allLabels) {
            const lText = lbl.textContent.replace(/\s+/g, ' ').trim();
            if (/^condition\b/i.test(lText)) {
              let inputEl = null;

              // 1. Check "for" attribute
              const forId = lbl.getAttribute('for');
              if (forId) {
                inputEl = (doc.getElementById ? doc.getElementById(forId) : (doc.ownerDocument || document).getElementById(forId)) || (doc.querySelector ? doc.querySelector('#' + CSS.escape(forId)) : null);
              }

              // 2. Check input inside label
              if (!inputEl) {
                inputEl = lbl.querySelector('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="radio"]):not([type="checkbox"])');
              }

              // 3. Check container / sibling input
              if (!inputEl) {
                const container = lbl.closest('.form-group, .control-group, .demo-form-group, tr, td, .form-item, div');
                if (container) {
                  inputEl = container.querySelector('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="radio"]):not([type="checkbox"])');
                }
              }

              if (inputEl && inputEl.tagName === 'INPUT' && !conditionCandidates.includes(inputEl)) {
                conditionCandidates.push(inputEl);
              }
            }
          }

          // Also check custom fields with condition in name/id
          const directCustomFields = doc.querySelectorAll('input[name*="condition" i], input[name*="Condition"], input[id*="condition" i]');
          for (const el of directCustomFields) {
            if (el.tagName === 'INPUT' && el.type !== 'hidden' && el.type !== 'radio' && el.type !== 'checkbox') {
              if (!conditionCandidates.includes(el)) {
                conditionCandidates.push(el);
              }
            }
          }

          // Filter out any element that is clearly the FIRST "Used Or New" control
          const validSecondCandidates = conditionCandidates.filter(el => {
            if (el.tagName !== 'INPUT') return false;
            if (el.type === 'radio' || el.type === 'checkbox' || el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return false;

            const val = (el.value || '').toLowerCase();
            const placeholder = (el.placeholder || '').toLowerCase();
            const id = (el.id || '').toLowerCase();
            const name = (el.name || '').toLowerCase();
            const container = el.closest('.form-group, .control-group, .demo-form-group, tr, td, div') || el.parentElement;
            const containerText = (container ? container.textContent : '').toLowerCase();

            // If it explicitly mentions "used or new", it is the first control -> EXCLUDE
            if (/used\s*(?:or|\/)\s*new/i.test(val) || /used\s*(?:or|\/)\s*new/i.test(placeholder) ||
                /used\s*(?:or|\/)\s*new/i.test(id) || /used\s*(?:or|\/)\s*new/i.test(name) ||
                /used_or_new|used-or-new|usedornew|new_or_used/i.test(id) ||
                /used_or_new|used-or-new|usedornew|new_or_used/i.test(name)) {
              return false;
            }

            return true;
          });

          // If there are multiple candidates, the SECOND one is the intended field in the Ad Details section
          if (validSecondCandidates.length >= 2) {
            // Check if one is a custom field `fields[...]`
            const customField = validSecondCandidates.find(el => /^fields\[/i.test(el.name) || /^fields_/i.test(el.id));
            if (customField) return customField;
            // Otherwise take the second in DOM order
            return validSecondCandidates[1];
          }

          if (validSecondCandidates.length === 1) {
            const single = validSecondCandidates[0];
            // If there were 2 total condition candidates and the first was filtered out or this is the only non-used-or-new candidate
            if (conditionCandidates.length >= 2 || /^fields\[/i.test(single.name) || /^fields_/i.test(single.id) || single.id === 'target_condition_input') {
              return single;
            }
            // If the single candidate has container text mentioning "Used Or New", fail safely!
            const cText = (single.closest('.form-group, .control-group, .demo-form-group, div')?.textContent || '').toLowerCase();
            if (/used\s*(?:or|\/)\s*new/i.test(cText)) {
              return null; // Fail safely!
            }
            return single;
          }

          return null;
        };

        const el = findSecondConditionField();
        if (el && el.tagName === 'INPUT' && el.type !== 'radio' && el.type !== 'checkbox') {
          // Absolute safety check: verify element is NOT the first "Used Or New" control before writing
          const currentVal = (el.value || '').toLowerCase();
          const currentId = (el.id || '').toLowerCase();
          const currentName = (el.name || '').toLowerCase();
          if (!currentVal.includes('used or new') && !currentId.includes('used_or_new') && !currentName.includes('used_or_new')) {
            el.value = fields.condition;
            triggerEvents(el);
          }
        }
      }

      // 10. PRICING SUMMARY
      if (isClean(fields.pricingSummary)) {
        const el = findFieldElement({
          selectors: ['#target_pricing_summary', '#pricing_summary', '#price_summary', 'input[name*="pricing_summary"]', 'input[name*="price_summary"]'],
          labels: [/^pricing summary\s*\*?$/i],
          names: ['pricing_summary', 'target_pricing_summary']
        });
        if (el) { el.value = fields.pricingSummary; triggerEvents(el); }
      }

      // 11. DEALER NAME
      if (isClean(fields.dealerName)) {
        const el = findFieldElement({
          selectors: ['#target_dealer_name', '#dealer_name', 'input[name*="dealer_name"]'],
          labels: [/^dealer(?:ship)? name\s*\*?$/i],
          names: ['dealer_name', 'target_dealer_name']
        });
        if (el) { el.value = fields.dealerName; triggerEvents(el); }
      }

      // 12. DEALER ADDRESS (Avoid Contact Address)
      if (isClean(fields.dealerAddress)) {
        const el = findFieldElement({
          selectors: ['#target_dealer_address', '#dealer_address', 'input[name="dealer_address"]', 'input[name*="dealer_address"]'],
          labels: [/^dealer address\s*\*?$/i],
          names: ['dealer_address', 'target_dealer_address']
        });
        if (el) { el.value = fields.dealerAddress; triggerEvents(el); }
      }

      // 13. DEALER AVERAGE RATING
      if (isClean(fields.averageRating)) {
        const el = findFieldElement({
          selectors: ['#target_dealer_rating', '#dealer_rating', '#average_rating', 'input[name*="dealer_rating"]', 'input[name*="average_rating"]'],
          labels: [/^dealer (?:average )?rating\s*(?:\(1-5\))?\s*\*?$/i, /^average rating\s*\*?$/i, /^dealer average rating\s*\*?$/i],
          names: ['dealer_rating', 'average_rating', 'target_dealer_rating']
        });
        if (el) { el.value = fields.averageRating; triggerEvents(el); }
      }

      // 14. FEATURES (Textarea - exact preservation of internal word spacing and newlines)
      if (isClean(fields.features)) {
        const el = findFieldElement({
          selectors: [
            'textarea#target_features_text',
            'textarea#target_features',
            'textarea#features',
            '#target_features_text',
            '#target_features',
            '#features',
            'textarea[name*="features"]',
            'textarea[name="fields[features]"]',
            'textarea[name="fields[Features]"]'
          ],
          labels: [/^features\s*\*?$/i, /^installed features\s*\*?$/i],
          names: ['features', 'target_features_text', 'target_features']
        });
        if (el) {
          const rawFeaturesText = String(fields.features).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
          el.value = rawFeaturesText;
          triggerEvents(el);
        }
      }

      // 15. SOURCE LINK
      if (isClean(fields.sourceUrl)) {
        const el = findFieldElement({
          selectors: ['#target_source_url', '#target_source_link', '#source_url', '#source_link', 'input[name*="source_link"]', 'input[name*="source_url"]'],
          labels: [/^source link\s*\*?$/i, /^source listing link\s*\*?$/i, /^source url\s*\*?$/i],
          names: ['source_link', 'source_url', 'target_source_url']
        });
        if (el) { el.value = fields.sourceUrl; triggerEvents(el); }
      }

      // 16. VEHICLE HIGHLIGHTS (Textarea)
      if (isClean(fields.vehicleHighlights)) {
        const el = findFieldElement({
          selectors: ['#target_vehicle_highlights', '#vehicle_highlights', 'textarea[name*="vehicle_highlights"]', 'textarea[name*="highlights"]'],
          labels: [/^vehicle highlights\s*\*?$/i, /^highlights\s*\*?$/i],
          names: ['vehicle_highlights', 'target_vehicle_highlights']
        });
        if (el) { el.value = fields.vehicleHighlights; triggerEvents(el); }
      }

      // 17. PRICE (Numeric digits only)
      if (isClean(fields.price)) {
        const digitsOnly = String(fields.price).replace(/[^\d]/g, '');
        const el = findFieldElement({
          selectors: ['#target_price', '#price', 'input[name="price"]', 'input[name*="listing_price"]'],
          labels: [/^price\s*\*?$/i, /^listing price\s*(?:\(zar\))?\s*\*?$/i],
          names: ['price', 'target_price']
        });
        if (el && digitsOnly) { el.value = digitsOnly; triggerEvents(el); }
      }

      // 18. DESCRIPTION (Rich text editor / TinyMCE / textarea)
      if (isClean(fields.description)) {
        this.fillDescription(doc, fields.description);
      }
    },

    isSafeEditable(el, allowSelect) {
      if (!el) return false;
      const tag = el.tagName ? el.tagName.toUpperCase() : '';
      if (tag === 'SELECT' && !allowSelect) return false;
      if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return false;

      // Check excluded IDs / names
      const idOrName = `${el.id || ''} ${el.name || ''}`.toLowerCase();
      const excludedKeywords = [
        'category', 'used_or_new', 'used_cars', 'seat', 'contact_number', 'phone',
        'currency', 'tag', 'country', 'contact_address'
      ];
      if (excludedKeywords.some(kw => idOrName.includes(kw))) {
        return false;
      }

      return true;
    },

    isSafeConditionField(el) {
      if (!el || !this.isSafeEditable(el, false)) return false;
      if (el.tagName === 'SELECT') return false;
      if (el.type === 'radio' || el.type === 'checkbox' || el.type === 'hidden') return false;

      // Ensure it is not the first "Used Or New" control
      const idOrName = `${el.id || ''} ${el.name || ''}`.toLowerCase();
      if (/used_or_new|used-or-new|usedornew|used_new|new_or_used/i.test(idOrName)) return false;

      const container = el.closest('.form-group, .control-group, .demo-form-group, tr, td, div') || el.parentElement;
      const text = `${container ? container.textContent : ''} ${el.placeholder || ''} ${el.value || ''}`.toLowerCase();
      if (/used\s*(?:or|\/)\s*new/i.test(text)) return false;

      return true;
    },

    fillDescription(doc, text) {
      const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
      const htmlContent = paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('');

      // 1. Check TinyMCE instances
      try {
        if (typeof window.tinymce !== 'undefined' && window.tinymce.get) {
          const editor = window.tinymce.get('description') ||
                         window.tinymce.get('target_description') ||
                         window.tinymce.activeEditor;
          if (editor && !editor.isHidden()) {
            editor.setContent(htmlContent);
            editor.save();
            return;
          }
        }
      } catch (e) {}

      // 2. Check Joomla editor instance
      try {
        if (typeof window.Joomla !== 'undefined' && window.Joomla.editors?.instances?.description) {
          window.Joomla.editors.instances.description.setValue(htmlContent);
          return;
        }
      } catch (e) {}

      // 3. Check TinyMCE / Rich Text iframe
      try {
        const iframe = doc.querySelector('#description_ifr, iframe[id*="description"], .tox-edit-area iframe, .mce-edit-area iframe');
        if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
          iframe.contentDocument.body.innerHTML = htmlContent;
          iframe.contentDocument.body.dispatchEvent(new Event('input', { bubbles: true }));
          iframe.contentDocument.body.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } catch (e) {}

      // 4. Target Textarea / Input
      const textarea = doc.querySelector('#target_description, #description, textarea[name="description"], textarea[name*="description"]');
      if (textarea) {
        textarea.value = text;
        try {
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          textarea.dispatchEvent(new Event('change', { bubbles: true }));
          textarea.dispatchEvent(new Event('blur', { bubbles: true }));
        } catch (e) {}
      }
    }
  };

  // Expose SmartPasteEngine and CarsCoZaAdapter for testing harnesses
  if (typeof window !== 'undefined') {
    window.CarSmartPasteEngine = SmartPasteEngine;
    window.CarsCoZaAdapter = CarsCoZaAdapter;
    window.CarDataHelperNormalizers = Normalizers;
    window.CarDataHelperValidators = Validators;
  }

  // Active initialization
  SmartPasteEngine.init();

  const isSourceListing = CarsCoZaAdapter.canHandle(document);
  if (isSourceListing) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(createHelperPanel, 300);
      });
    } else {
      setTimeout(createHelperPanel, 300);
    }
  }
})();
