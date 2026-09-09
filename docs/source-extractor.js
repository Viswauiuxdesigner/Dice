/**
 * Production Cars.co.za Dynamic Source Extractor Engine v2.0.6
 * Robust Semantic & Section-Scoped Extractor for Real Cars.co.za Production Pages
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

    // --- 1. Parse Next.js Hydrated State if Available ---
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

    // --- 2. Parse JSON-LD Microdata if Available ---
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

    // --- Helper: Scoped Text Lookup ---
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

    // Dealer Address
    dealerAddress = getSelectorText(doc, ['[data-test="dealer-address"]', '[data-testid="dealer-address"]', '[data-test="dealer-location"]', '[data-testid="dealer-location"]', '.dealer-address', '.seller-info__address', '.dealer-location']);
    let locLeaf = null;
    if (!dealerAddress) {
      locLeaf = allLeafElements.find(item => /\b(Sandton|Cape Town|Johannesburg|Durban|Pretoria|Centurion|Gauteng|Western Cape|KwaZulu-Natal|Eastern Cape)\b/i.test(item.text) && item.text.length < 50 && !item.text.startsWith('R'));
      if (locLeaf) dealerAddress = locLeaf.text;
    }
    if (!dealerAddress) {
      dealerAddress = nextDataProps.dealer?.address || nextDataProps.dealer?.location || nextDataProps.location || jsonLdData.offers?.seller?.address || '';
    }

    // Dealer Name
    if (locLeaf && locLeaf.el) {
      const dealerContainer = locLeaf.el.closest('[class*="dealer"], [class*="seller"], [data-test*="dealer"], [data-testid*="dealer"], aside, section, div[style*="border"], div') || locLeaf.el.parentElement?.parentElement;
      if (dealerContainer && dealerContainer !== doc.body) {
        const nameEl = dealerContainer.querySelector('[data-test*="dealer-name"], [data-testid*="dealer-name"], [class*="dealer-name"], [class*="dealer__name"], [class*="seller-name"], [class*="dealerTitle"], strong, h2, h3, h4, h5, h6, a[href*="/dealers/"], a[href*="/dealer/"]');
        if (nameEl) {
          const txt = (nameEl.textContent || '').trim();
          if (txt && !/^(?:seller|dealer|dealership)\s*(?:details|information|info|overview)$/i.test(txt) && txt !== dealerAddress && !/^\d+(\.\d+)?\s*(?:reviews?|\(\d+\))/i.test(txt)) {
            dealerName = txt;
          }
        }
        if (!dealerName && locLeaf.el.previousElementSibling) {
          const prevTxt = (locLeaf.el.previousElementSibling.textContent || '').trim();
          if (prevTxt && prevTxt.length < 60 && !/^(?:seller|dealer)\s*(?:details|info)/i.test(prevTxt)) {
            dealerName = prevTxt;
          }
        }
        if (!dealerName) {
          const imgEl = dealerContainer.querySelector('img[alt]');
          if (imgEl && imgEl.alt && !/logo|icon|avatar|dealer|seller/i.test(imgEl.alt.trim())) {
            dealerName = imgEl.alt.trim();
          }
        }
      }
    }

    if (!dealerName) {
      dealerName = getSelectorText(doc, [
        '[data-test="dealer-name"]', '[data-testid="dealer-name"]',
        '.dealer-name', '[class*="dealer-name"]', '[class*="dealer__name"]',
        '.seller-info__title', '.dealer-title', '#dealer-name'
      ]);
    }
    if (!dealerName) {
      const dealerLink = doc.querySelector('a[href*="/dealers/"], a[href*="/dealer/"], a[href*="/seller/"]');
      if (dealerLink) {
        const txt = (dealerLink.textContent || '').trim();
        if (txt && !/view all|all cars|contact|directions/i.test(txt)) {
          dealerName = txt;
        }
      }
    }
    if (!dealerName) {
      const dealerHeading = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6, strong, b')).find(el => /^(?:Seller|Dealer|Dealership)\s*(?:Details|Information|Info)$/i.test(el.textContent.trim()));
      if (dealerHeading) {
        const card = dealerHeading.closest('div, section, aside') || dealerHeading.parentElement;
        const candidateEls = card.querySelectorAll('.dealer-name, strong, h3, h4, h5, a, p, span');
        for (const el of candidateEls) {
          if (el !== dealerHeading) {
            const txt = (el.textContent || '').trim();
            if (txt && txt.length > 1 && txt.length < 60 && txt !== dealerAddress && !/^(?:seller|dealer|dealership)\s*(?:details|info|information)$/i.test(txt) && !/^\d+(\.\d+)?/i.test(txt)) {
              dealerName = txt;
              break;
            }
          }
        }
      }
    }
    if (!dealerName) {
      dealerName = nextDataProps.dealer?.name || nextDataProps.seller?.name || jsonLdData.offers?.seller?.name || '';
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
      if (window.CarNormalizers && window.CarNormalizers.normalizeDescription) {
        description = window.CarNormalizers.normalizeDescription(description);
      } else {
        const rawBlocks = description.replace(/<br\s*\/?>/gi, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n{2,}/);
        description = rawBlocks.map(b => b.split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join(' ').trim()).filter(Boolean).join('\n\n');
      }
    }

    // --- 16. VEHICLE HIGHLIGHTS (Dynamic multi-card extractor) ---
    let vehicleHighlights = '';

    // Helper: Safely extract text lines from a single highlight card
    const extractHighlightCardLines = (el) => {
      if (!el) return [];
      let clone;
      try { clone = el.cloneNode(true); } catch (e) { clone = el; }
      if (clone.querySelectorAll) {
        const junk = clone.querySelectorAll('style, script, noscript, svg, button, iframe, [aria-hidden="true"], [style*="display: none"], [style*="display:none"], [hidden]');
        junk.forEach(j => j.remove());
        clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
      }

      const text = (clone.textContent || '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');

      const rawLines = text.split('\n');
      const cleanLines = rawLines
        .map(l => l.replace(/[ \t]+/g, ' ').trim())
        .filter(l => l.length > 0 && !/^(?:vehicle\s+|key\s+)?highlights:?$/i.test(l) && !hasCssArtifacts(l));

      const uniqueLines = [];
      for (const line of cleanLines) {
        if (uniqueLines.length === 0 || uniqueLines[uniqueLines.length - 1] !== line) {
          uniqueLines.push(line);
        }
      }
      return uniqueLines;
    };

    let highlightsContainer = null;
    const highlightHeading = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6, strong, b, [class*="heading"], [class*="title"], summary, p, div, span')).find(el => {
      const t = (el.textContent || '').trim();
      return /^(?:Vehicle\s+|Key\s+)?Highlights:?$/i.test(t) && t.length < 35;
    });

    if (highlightHeading) {
      let p = highlightHeading.parentElement;
      while (p && p !== doc.body && p.tagName !== 'BODY') {
        const text = (p.textContent || '').trim();
        if (text.length > 40 && (p.tagName === 'SECTION' || p.tagName === 'ARTICLE' || p.children.length >= 2)) {
          highlightsContainer = p;
          break;
        }
        p = p.parentElement;
      }
      if (!highlightsContainer && highlightHeading.nextElementSibling) {
        highlightsContainer = highlightHeading.nextElementSibling;
      } else if (!highlightsContainer && highlightHeading.parentElement?.nextElementSibling) {
        highlightsContainer = highlightHeading.parentElement.nextElementSibling;
      }
    }

    if (!highlightsContainer) {
      highlightsContainer = doc.querySelector('[data-test="vehicle-highlights"], [data-testid="vehicle-highlights"], [data-test="highlights"], [data-testid="highlights"], #vehicle-highlights, .vehicle-highlights, .highlights-section, section[class*="highlight"]');
    }

    if (highlightsContainer) {
      // Find candidate leaf cards
      const allDescendants = Array.from(highlightsContainer.querySelectorAll('div, li, article, section')).filter(el => {
        if (el === highlightHeading || el.contains(highlightHeading) || el === highlightsContainer) return false;
        const lines = extractHighlightCardLines(el);
        if (lines.length >= 2 && lines.length <= 6) {
          // Verify it's a leaf card container (no child elements with 2+ lines)
          const hasChildCard = Array.from(el.children).some(child => extractHighlightCardLines(child).length >= 2);
          return !hasChildCard;
        }
        return false;
      });

      const cards = [];
      const seenCardTexts = new Set();

      allDescendants.forEach(cardEl => {
        const lines = extractHighlightCardLines(cardEl);
        if (lines.length >= 2) {
          const cardText = lines.join('\n');
          if (!seenCardTexts.has(cardText) && !hasCssArtifacts(cardText)) {
            cards.push(cardText);
            seenCardTexts.add(cardText);
          }
        }
      });

      if (cards.length > 0) {
        vehicleHighlights = cards.join('\n\n');
      }
    }

    // Fallback: Next.js Dehydrated State
    if (!vehicleHighlights && nextDataProps) {
      const rawHL = nextDataProps.highlights || nextDataProps.vehicleHighlights || nextDataProps.keyHighlights || nextDataProps.insights || nextDataProps.vehicleInsights || nextDataProps.specsHighlights || nextDataProps.specHighlights;
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
      if (window.CarNormalizers && window.CarNormalizers.normalizeVehicleHighlights) {
        vehicleHighlights = window.CarNormalizers.normalizeVehicleHighlights(vehicleHighlights);
      } else if (typeof Normalizers !== 'undefined' && Normalizers.normalizeVehicleHighlights) {
        vehicleHighlights = Normalizers.normalizeVehicleHighlights(vehicleHighlights);
      }
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
      description: norm.normalizeDescription(raw.description),
      vehicleHighlights: norm.normalizeVehicleHighlights ? norm.normalizeVehicleHighlights(raw.vehicleHighlights) : (raw.vehicleHighlights || ''),
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
