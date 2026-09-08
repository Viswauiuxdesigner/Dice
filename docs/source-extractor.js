/**
 * Production Cars.co.za Dynamic Source Extractor Engine v2.0.4
 * Icon-Anchored & Section-Scoped Multi-Strategy Cascading Extractor
 *
 * Ordered Strategies:
 * 1. Exact Production DOM Section + Icon-Anchored Semantic Chip Extraction
 * 2. Structured Page State / React / Next.js Data (<script id="__NEXT_DATA__">)
 * 3. Schema.org JSON-LD Microdata (<script type="application/ld+json">)
 * 4. Narrow Section-Specific Scoped Fallbacks
 * 5. Missing / Needs Review (Strict Validation & Zero Cross-Contamination)
 */

const CarsCoZaAdapter = {
  id: 'cars_co_za',
  name: 'Cars.co.za Production Listing Adapter',

  canHandle(doc) {
    if (!doc) return false;
    const url = doc.location?.href || '';
    return url.includes('cars.co.za') || doc.querySelector('#cars-co-za-marker') !== null || (doc.title && doc.title.includes('Cars.co.za'));
  },

  extract(doc) {
    if (!doc) doc = document;

    // --- 1. Next.js Hydrated State Deep Search ---
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

    // --- 2. JSON-LD Microdata Deep Search ---
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

    // --- Section & DOM Helpers ---
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

    const findSectionContainer = (headings, explicitSelectors = []) => {
      for (const sel of explicitSelectors) {
        try {
          const el = doc.querySelector(sel);
          if (el) return el;
        } catch (e) {}
      }
      const headingElements = doc.querySelectorAll('h1, h2, h3, h4, h5, h6, [class*="heading"], [class*="title"], strong, b');
      for (const h of headingElements) {
        const text = (h.textContent || '').trim().toLowerCase();
        for (const target of headings) {
          if (text === target.toLowerCase() || (text.includes(target.toLowerCase()) && text.length < target.length + 20)) {
            return h.closest('section, article, div[class*="section"], div[class*="card"], div[class*="container"], div[class*="block"]') || h.parentElement;
          }
        }
      }
      return null;
    };

    // --- 1 & 2. TITLE & TITLE DESCRIPTION (Strict Header Scoping) ---
    const h1El = doc.querySelector('[data-test="heading"], [data-testid="heading"], [data-test="title"], [data-testid="title"], h1.heading-sm, h1.title, h1');
    let rawHeadingText = h1El ? (h1El.textContent || '').trim() : '';
    if (!rawHeadingText) {
      rawHeadingText = nextDataProps.title || nextDataProps.heading || (typeof jsonLdData.name === 'string' ? jsonLdData.name : '') || getMeta(['og:title', 'title']);
    }
    rawHeadingText = rawHeadingText.replace(/\s+for\s+sale.*$/i, '').replace(/\s*-\s*R\s*[\d\s,.]+.*$/i, '').trim();

    // Look for explicit variant/subtitle element strictly associated with heading
    let rawVariantText = getSelectorText(doc, [
      '[data-test="variant"]', '[data-testid="variant"]',
      '[data-test="subtitle"]', '[data-testid="subtitle"]',
      '[data-test="derivative"]', '[data-testid="derivative"]',
      '[data-test="sub-heading"]', '[data-testid="sub-heading"]',
      '[data-test="trim"]', '[data-testid="trim"]',
      '.vehicle-variant', '.variant-title', '.subtitle', '.sub-heading', '.subHeading', '.derivative', '.trim'
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

    // --- 3. ICON-ANCHORED & SECTION-SCOPED CHIP EXTRACTOR ---
    const iconChipMap = {};

    function inspectChipIconType(chipEl) {
      const allAttrs = [];
      for (const attr of chipEl.attributes || []) {
        allAttrs.push(`${attr.name}="${attr.value}"`);
      }
      const iconEls = chipEl.querySelectorAll('svg, i, img, [class*="icon"], [data-icon], [data-testid*="icon"]');
      iconEls.forEach(icon => {
        for (const attr of icon.attributes || []) {
          allAttrs.push(`${attr.name}="${attr.value}"`);
        }
        const uses = icon.querySelectorAll('use, path');
        uses.forEach(u => {
          for (const attr of u.attributes || []) {
            allAttrs.push(`${attr.name}="${attr.value}"`);
          }
        });
      });

      const attrStr = allAttrs.join(' ').toLowerCase();

      if (/calendar|year|reg-year|date|regdate/i.test(attrStr)) return 'year';
      if (/odometer|speedometer|mileage|gauge|road|tachometer|distance|speed/i.test(attrStr)) return 'mileage';
      if (/transmission|gearbox|gear|shifter|clutch|stick|manual|auto/i.test(attrStr)) return 'transmission';
      if (/fuel|pump|petrol|gas|station|charging|energy/i.test(attrStr)) return 'fuel';
      if (/drivetrain|axle|wheel|drive|4x4|4x2|4wd|awd|traction/i.test(attrStr)) return 'drivetrain';
      if (/palette|paint|color|colour|brush|bucket|swatch|tint/i.test(attrStr)) return 'color';
      if (/condition|checklist|check|shield|badge|verified|inspection|heart/i.test(attrStr)) return 'condition';

      return null;
    }

    // Scoped Summary Chips Container
    const summaryContainer = findSectionContainer(['Vehicle Overview', 'Summary', 'Quick Specs', 'Overview', 'Key Specs'], [
      '[data-test="vehicle-specs"]', '[data-testid="vehicle-specs"]',
      '[data-test="quick-specs"]', '[data-testid="quick-specs"]',
      '[data-test="key-specs"]', '[data-testid="key-specs"]',
      '[data-test="summary-specs"]', '[data-testid="summary-specs"]',
      '[class*="quick-specs"]', '[class*="quickSpecs"]',
      '[class*="key-specs"]', '[class*="keySpecs"]',
      '[class*="vehicle-specs"]', '[class*="vehicleSpecs"]',
      '[class*="specs-grid"]', '[class*="overview-grid"]',
      '[class*="summary-grid"]', '[class*="chips"]'
    ]);

    const chipElements = (summaryContainer || doc).querySelectorAll(
      '[data-test*="spec-item"], [data-testid*="spec-item"], [class*="chip"], [class*="pill"], [class*="badge"], [class*="spec-item"], [class*="overview-item"], [class*="quick-spec"], [class*="summary-item"]'
    );

    const orderedChips = [];

    chipElements.forEach(chip => {
      const txt = (chip.textContent || '').trim();
      if (!txt || txt.length > 50) return;
      if (!orderedChips.includes(txt)) orderedChips.push(txt);

      const iconType = inspectChipIconType(chip);
      if (iconType && !iconChipMap[iconType]) {
        iconChipMap[iconType] = txt;
      }
    });

    // Scoped Technical Specifications Table / DL Key-Value mapping
    const specTableMap = {};
    const specRows = doc.querySelectorAll('table tr, dl > div, dl tr, [class*="spec-row"]');
    specRows.forEach(row => {
      const labelEl = row.querySelector('td:first-child, th, dt, [class*="label"], [class*="name"]');
      const valEl = row.querySelector('td:last-child, dd, [class*="value"]');
      if (labelEl && valEl && labelEl !== valEl) {
        const l = labelEl.textContent.trim().toLowerCase();
        const v = valEl.textContent.trim();
        if (l && v) specTableMap[l] = v;
      }
    });

    // --- 3. YEAR ---
    let year = iconChipMap.year || '';
    if (!year) {
      for (const [k, v] of Object.entries(specTableMap)) {
        if (/year|model year|registration/i.test(k) && /^(19\d\d|20\d\d)$/.test(v)) {
          year = v;
          break;
        }
      }
    }
    if (!year) {
      const yrChip = orderedChips.find(c => /^(19\d\d|20\d\d)$/.test(c.trim()));
      if (yrChip) year = yrChip.trim();
    }
    if (!year) {
      year = nextDataProps.year || jsonLdData.vehicleModelDate || '';
    }
    if (!year) {
      const match = rawHeadingText.match(/\b(19\d\d|20\d\d)\b/);
      if (match) year = match[1];
    }

    // --- 4. KILOMETERS DRIVEN ---
    let kilometersDriven = iconChipMap.mileage || '';
    if (!kilometersDriven) {
      for (const [k, v] of Object.entries(specTableMap)) {
        if (/mileage|kilometer|odometer|km/i.test(k) && /\d/.test(v)) {
          kilometersDriven = v;
          break;
        }
      }
    }
    if (!kilometersDriven) {
      const kmChip = orderedChips.find(c => /\b\d[\d\s,.]*\s*(?:km|kms|kilometres|kilometers)\b/i.test(c));
      if (kmChip) kilometersDriven = kmChip.trim();
    }
    if (!kilometersDriven) {
      kilometersDriven = nextDataProps.mileage || jsonLdData.mileageFromOdometer?.value || (typeof jsonLdData.mileageFromOdometer === 'string' ? jsonLdData.mileageFromOdometer : '') || '';
    }
    if (!kilometersDriven) {
      kilometersDriven = getSelectorText(doc, ['[data-test="mileage"]', '[data-testid="mileage"]', '[data-test="kilometers"]', '[data-testid="kilometers"]', '#spec-mileage', '.spec-mileage', '[data-test*="odometer"]']);
    }
    // Strict Guard: Reject GTB, models, text without digits
    if (kilometersDriven && (!/\d/.test(kilometersDriven) || /^(gtb|ferrari|mazda|automatic|manual|petrol|diesel|red|white|blue|4x2|4x4)$/i.test(kilometersDriven))) {
      kilometersDriven = '';
    }

    // --- 5. TRANSMISSION ---
    let transmission = iconChipMap.transmission || '';
    if (!transmission) {
      for (const [k, v] of Object.entries(specTableMap)) {
        if (/transmission|gearbox/i.test(k) && /automatic|manual|semi|cvt|dual clutch/i.test(v)) {
          transmission = v;
          break;
        }
      }
    }
    if (!transmission) {
      const transChip = orderedChips.find(c => /^(automatic|manual|semi-automatic|automated manual|cvt|dual clutch|sequential|direct drive|auto)$/i.test(c.trim()));
      if (transChip) transmission = transChip.trim();
    }
    if (!transmission) {
      transmission = nextDataProps.transmission || nextDataProps.gearbox || jsonLdData.vehicleTransmission || '';
    }
    if (!transmission) {
      transmission = getSelectorText(doc, ['[data-test="transmission"]', '[data-testid="transmission"]', '[data-test="gearbox"]', '#spec-transmission', '.spec-transmission']);
    }
    if (transmission && !/^(automatic|manual|semi-automatic|automated manual|cvt|dual clutch|sequential|direct drive|auto)$/i.test(transmission.trim())) {
      transmission = '';
    }

    // --- 6. FUEL ---
    let fuel = iconChipMap.fuel || '';
    if (!fuel) {
      for (const [k, v] of Object.entries(specTableMap)) {
        if (/fuel/i.test(k) && /petrol|diesel|hybrid|electric|phev|gas|lpg/i.test(v)) {
          fuel = v;
          break;
        }
      }
    }
    if (!fuel) {
      const fuelChip = orderedChips.find(c => /^(petrol|diesel|hybrid|electric|plug-in hybrid|phev|hydrogen|lpg|gas|unleaded|premium)$/i.test(c.trim()));
      if (fuelChip) fuel = fuelChip.trim();
    }
    if (!fuel) {
      fuel = nextDataProps.fuel || nextDataProps.fuelType || nextDataProps.fuel_type || jsonLdData.fuelType || '';
    }
    if (!fuel) {
      fuel = getSelectorText(doc, ['[data-test="fuel"]', '[data-testid="fuel"]', '[data-test="fuel-type"]', '#spec-fuel', '.spec-fuel']);
    }
    if (fuel && !/^(petrol|diesel|hybrid|electric|plug-in hybrid|phev|hydrogen|lpg|gas|unleaded|premium)$/i.test(fuel.trim())) {
      fuel = '';
    }

    // --- 7. 4x2 / 4x4 (DRIVETRAIN) ---
    let drivetrain = iconChipMap.drivetrain || '';
    if (!drivetrain) {
      for (const [k, v] of Object.entries(specTableMap)) {
        if (/4x2|4x4|drivetrain|drive\s*type|driven\s*wheels|wheel\s*drive/i.test(k)) {
          drivetrain = v;
          break;
        }
      }
    }
    if (!drivetrain) {
      const dtChip = orderedChips.find(c => /^(4x2|4x4|fwd|rwd|awd|4wd|front-wheel drive|rear-wheel drive|all-wheel drive|four-wheel drive)$/i.test(c.trim()));
      if (dtChip) drivetrain = dtChip.trim();
    }
    if (!drivetrain) {
      drivetrain = nextDataProps.drivetrain || nextDataProps.drive || nextDataProps.driveType || nextDataProps.driveWheelConfiguration || jsonLdData.driveWheelConfiguration || '';
    }
    if (!drivetrain) {
      drivetrain = getSelectorText(doc, ['[data-test="drivetrain"]', '[data-testid="drivetrain"]', '[data-test="drive"]', '#spec-drivetrain', '.spec-drivetrain']);
    }
    if (drivetrain) {
      if (/4x4|awd|4wd|all-wheel|four-wheel/i.test(drivetrain)) drivetrain = '4x4';
      else if (/4x2|fwd|rwd|front-wheel|rear-wheel|front wheel|rear wheel/i.test(drivetrain)) drivetrain = '4x2';
      else drivetrain = '';
    }

    // --- 8. BODY COLOR ---
    let bodyColor = iconChipMap.color || '';
    if (!bodyColor) {
      for (const [k, v] of Object.entries(specTableMap)) {
        if (/colou?r|body\s*colou?r/i.test(k) && !/^(gtb|automatic|petrol|4x2|4x4|\d+)$/i.test(v)) {
          bodyColor = v;
          break;
        }
      }
    }
    if (!bodyColor) {
      const knownColors = ['red', 'white', 'black', 'silver', 'grey', 'gray', 'blue', 'yellow', 'green', 'orange', 'brown', 'bronze', 'gold', 'purple', 'beige', 'maroon', 'burgundy', 'charcoal', 'navy', 'rosso corsa', 'bianco', 'nero', 'giallo'];
      const colorChip = orderedChips.find(c => knownColors.includes(c.trim().toLowerCase()));
      if (colorChip) bodyColor = colorChip.trim();
    }
    if (!bodyColor) {
      bodyColor = nextDataProps.colour || nextDataProps.color || nextDataProps.bodyColour || nextDataProps.bodyColor || nextDataProps.exteriorColor || jsonLdData.color || '';
    }
    if (!bodyColor) {
      bodyColor = getSelectorText(doc, ['[data-test="colour"]', '[data-testid="colour"]', '[data-test="color"]', '[data-testid="color"]', '#spec-colour', '.spec-colour']);
    }
    if (bodyColor && (bodyColor.toLowerCase() === titleDescription.toLowerCase() || bodyColor.toLowerCase() === title.toLowerCase() || /^(gtb|ferrari|mazda|automatic|manual|petrol|diesel|4x2|4x4|\d+)$/i.test(bodyColor))) {
      bodyColor = '';
    }

    // --- 9. CONDITION ---
    let condition = iconChipMap.condition || '';
    if (!condition) {
      for (const [k, v] of Object.entries(specTableMap)) {
        if (/condition/i.test(k) && !/^(gtb|automatic|petrol|\d+)$/i.test(v)) {
          condition = v;
          break;
        }
      }
    }
    if (!condition) {
      const condChip = orderedChips.find(c => /condition|used|new|demo|clean|excellent|good/i.test(c.trim()) && !/^(gtb|automatic|petrol|\d+)$/i.test(c.trim()));
      if (condChip) condition = condChip.trim();
    }
    if (!condition) {
      condition = nextDataProps.condition || nextDataProps.vehicleCondition || '';
      if (!condition && jsonLdData.itemCondition) {
        condition = jsonLdData.itemCondition.replace('https://schema.org/', '').replace('Condition', '');
      }
    }
    if (!condition) {
      condition = getSelectorText(doc, ['[data-test="condition"]', '[data-testid="condition"]', '#spec-condition', '.spec-condition']);
    }
    if (condition && (condition.toLowerCase() === titleDescription.toLowerCase() || /^(gtb|ferrari|mazda|\d+)$/i.test(condition))) {
      condition = '';
    }

    // --- 10 & 16. PRICING & PRICING SUMMARY (Strict Pricing Section Scoping) ---
    const pricingContainer = findSectionContainer(['Pricing Summary', 'Pricing', 'Price Summary', 'Finance Summary'], [
      '[data-test="pricing-summary-container"]', '[data-testid="pricing-summary-container"]',
      '.pricing-summary', '.price-section', '[class*="pricing-summary"]'
    ]);

    let rawPrice = '';
    if (pricingContainer) {
      rawPrice = getSelectorText(pricingContainer, ['[data-test="price"]', '[data-testid="price"]', '.price-amount', '#car-price', '.heading-lg.price', 'h2.price', 'span.price', 'h1', 'h2', 'span']);
    }
    if (!rawPrice) {
      rawPrice = getSelectorText(doc, ['[data-test="price"]', '[data-testid="price"]', '.price-amount', '#car-price', '.heading-lg.price', 'h2.price', 'span.price']);
    }
    if (!rawPrice) {
      rawPrice = nextDataProps.price || (jsonLdData.offers?.price ? String(jsonLdData.offers.price) : '') || getMeta(['product:price:amount', 'og:price:amount']);
    }

    let priceDigits = String(rawPrice).replace(/[^\d]/g, '');
    let formattedPrice = priceDigits ? Number(priceDigits).toLocaleString('fr-FR').replace(/\s/g, ' ') : '';

    let installmentText = '';
    if (pricingContainer) {
      installmentText = getSelectorText(pricingContainer, [
        '[data-test="est-installment"]', '[data-testid="est-installment"]',
        '[data-test="installment"]', '[data-testid="installment"]',
        '.est-payment', '.finance-est', '.monthly-installment', '[class*="installment"]'
      ]);
    }
    if (!installmentText) {
      installmentText = getSelectorText(doc, [
        '[data-test="est-installment"]', '[data-testid="est-installment"]',
        '[data-test="installment"]', '[data-testid="installment"]',
        '.est-payment', '.finance-est', '.monthly-installment', '[class*="installment"]'
      ]);
    }
    if (!installmentText && nextDataProps.installment) {
      installmentText = `Est. ${nextDataProps.installment}`;
    }
    if (!installmentText) {
      const priceBlock = pricingContainer || doc.querySelector('[class*="pricing"], [class*="price"], [class*="finance"]') || doc.body;
      const match = (priceBlock.textContent || '').match(/(?:Est\.\s*)?R\s*[\d\s,.]+\s*(?:p\/m|pm|per month)/i);
      if (match) {
        installmentText = match[0].trim();
        if (!installmentText.toLowerCase().startsWith('est.')) {
          installmentText = `Est. ${installmentText}`;
        }
      }
    }

    let pricingSummary = nextDataProps.pricingSummary || '';
    if (!pricingSummary && pricingContainer) {
      pricingSummary = getSelectorText(pricingContainer, ['[data-test="pricing-summary"]', '[data-testid="pricing-summary"]', '#car-price-summary', '.price-summary']);
    }
    if (!pricingSummary) {
      pricingSummary = getSelectorText(doc, ['[data-test="pricing-summary"]', '[data-testid="pricing-summary"]', '#car-price-summary', '.price-summary', '[class*="pricing-summary"]']);
    }

    if (!pricingSummary && formattedPrice) {
      if (installmentText) {
        pricingSummary = `R ${formattedPrice} / ${installmentText}`;
      } else {
        pricingSummary = `R ${formattedPrice}`;
      }
    }

    // --- 11, 12, 13. DEALER & RATING (Strict Dealer / Rating Section Scoping) ---
    const dealerContainer = findSectionContainer(['Seller Details', 'Dealer Details', 'Seller Information', 'Dealer Information', 'Dealership'], [
      '[data-test="dealer-card"]', '[data-testid="dealer-card"]',
      '[data-test="seller-info"]', '[data-testid="seller-info"]',
      '.seller-info', '.dealer-info', '.dealer-card', 'aside[class*="dealer"]', 'div[class*="dealer"]'
    ]);

    let dealerName = '';
    if (dealerContainer) {
      dealerName = getSelectorText(dealerContainer, ['[data-test="dealer-name"]', '[data-testid="dealer-name"]', 'a[href*="/dealers/"]', '.seller-info__title', '.dealer-title', 'h2', 'h3', 'h4', 'strong']);
    }
    if (!dealerName) {
      dealerName = nextDataProps.dealer?.name || nextDataProps.seller?.name || jsonLdData.offers?.seller?.name || '';
    }
    if (!dealerName) {
      dealerName = getSelectorText(doc, ['[data-test="dealer-name"]', '[data-testid="dealer-name"]', '#dealer-name', 'a[href*="/dealers/"]', '.seller-info__title']);
    }

    let dealerAddress = '';
    if (dealerContainer) {
      dealerAddress = getSelectorText(dealerContainer, ['[data-test="dealer-address"]', '[data-testid="dealer-address"]', '[data-test="dealer-location"]', '[data-testid="dealer-location"]', '.seller-info__address', '.dealer-address', '.dealer-location', 'p', 'span']);
    }
    if (!dealerAddress) {
      dealerAddress = nextDataProps.dealer?.address || nextDataProps.dealer?.location || nextDataProps.location || jsonLdData.offers?.seller?.address || '';
    }
    if (!dealerAddress) {
      dealerAddress = getSelectorText(doc, ['[data-test="location"]', '[data-testid="location"]', '[data-test="dealer-address"]', '#car-location', '.location-text', '.vehicle-location']);
    }

    const ratingContainer = findSectionContainer(['Reviews', 'Google Reviews', 'Dealer Rating', 'Rating'], [
      '[data-test="dealer-rating"]', '[data-testid="dealer-rating"]',
      '[data-test="rating-card"]', '[data-testid="rating-card"]',
      '.rating-badge', '.seller-rating', '.dealer-rating', '.google-rating'
    ]);

    let averageRating = '';
    const ratingTargetEl = ratingContainer || dealerContainer;
    if (ratingTargetEl) {
      const match = (ratingTargetEl.textContent || '').match(/([1-5](?:\.\d)?)\s*(?:\/5)?\s*(?:\(\s*(\d+)\s*(?:Reviews?|reviews?)?\s*\)|(\d+)\s*(?:Reviews?|reviews?))/i);
      if (match) {
        const score = match[1];
        const count = match[2] || match[3] || '';
        averageRating = count ? `${score} (${count} Reviews)` : score;
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
    if (!averageRating) {
      averageRating = getSelectorText(doc, ['[data-test="dealer-rating"]', '[data-testid="dealer-rating"]', '#dealer-rating', '.rating-badge', '.seller-rating']);
    }

    // --- 14. FEATURES (Strict Features Section Scoping) ---
    let featuresList = nextDataProps.features || [];
    if (typeof featuresList === 'string') {
      featuresList = featuresList.split('\n').map(f => f.trim()).filter(Boolean);
    }

    if (!featuresList || featuresList.length === 0) {
      const featuresContainer = findSectionContainer(['Features', 'Key Features', 'Vehicle Features', 'Standard Features', 'Optional Features', 'Equipment', 'Specification'], [
        '[data-test="features"]', '[data-testid="features"]',
        '#car-features', '.features-list', '.equipment-list', 'section[class*="features"]', 'div[class*="features"]'
      ]);
      if (featuresContainer) {
        const itemEls = featuresContainer.querySelectorAll('li, [class*="feature-item"], [class*="chip"], [class*="tag"], [class*="pill"], p');
        const items = [];
        itemEls.forEach(el => {
          const txt = (el.textContent || '').trim();
          if (txt && txt.length > 1 && txt.length < 100 && !/^(features|key features|show more|view all|read more)$/i.test(txt)) {
            if (!items.includes(txt)) items.push(txt);
          }
        });
        if (items.length > 0) featuresList = items;
      }
    }

    // --- 15. DESCRIPTION (Strict Description Section Scoping) ---
    let description = '';
    const descContainer = findSectionContainer(['Description', 'Seller Description', 'Dealer Description', 'Seller Comments', 'Dealer Comments', 'Vehicle Overview'], [
      '[data-test="description"]', '[data-testid="description"]',
      '#car-description', '.vehicle-description', '.description-text', 'section[class*="description"]', 'div[class*="description"]'
    ]);
    if (descContainer) {
      const contentEl = descContainer.querySelector('p, [class*="content"], [class*="body"], [class*="text"]') || descContainer;
      const txt = (contentEl.textContent || '').trim();
      description = txt.replace(/^(?:Seller\s+|Dealer\s+)?Description\s*/i, '').replace(/Read\s*more\s*$/i, '').trim();
    }
    if (!description) {
      description = nextDataProps.description || '';
    }
    if (!description && jsonLdData.description && jsonLdData.description.length > 60) {
      description = jsonLdData.description.trim();
    }
    if (!description) {
      description = getMeta(['og:description', 'description']);
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
      price: formattedPrice || rawPrice,
      sourceUrl
    };
  }
};

window.CarSourceExtractor = {
  adapters: [CarsCoZaAdapter],

  extractFromDocument(doc) {
    if (!doc) doc = document;
    const raw = CarsCoZaAdapter.extract(doc);
    const norm = window.CarNormalizers;

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
      description: norm.cleanText(raw.description),
      price: norm.normalizePrice(raw.price),
      sourceUrl: raw.sourceUrl || doc.location?.href || ''
    };

    const validationReport = window.CarValidators.validateCarData(normalized);

    return {
      adapter: CarsCoZaAdapter.name,
      raw,
      normalized,
      validationReport,
      timestamp: new Date().toISOString()
    };
  }
};
