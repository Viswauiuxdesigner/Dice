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

    // --- 14. FEATURES (Strict Section-Scoped Item Extractor) ---
    let featuresList = [];

    // 1. Check Next.js state props (only accept if array has at least 2 clean items)
    if (Array.isArray(nextDataProps.features) && nextDataProps.features.length >= 2) {
      featuresList = nextDataProps.features.map(f => typeof f === 'object' ? (f.name || f.title || f.label || '') : String(f)).filter(Boolean);
    } else if (Array.isArray(nextDataProps.vehicleFeatures) && nextDataProps.vehicleFeatures.length >= 2) {
      featuresList = nextDataProps.vehicleFeatures.map(f => typeof f === 'object' ? (f.name || f.title || f.label || '') : String(f)).filter(Boolean);
    } else if (Array.isArray(nextDataProps.equipment) && nextDataProps.equipment.length >= 2) {
      featuresList = nextDataProps.equipment.map(f => typeof f === 'object' ? (f.name || f.title || f.label || '') : String(f)).filter(Boolean);
    } else if (typeof nextDataProps.features === 'string' && nextDataProps.features.includes('\n')) {
      featuresList = nextDataProps.features.split(/\r?\n/).map(f => f.trim()).filter(Boolean);
    }

    // 2. DOM Structural Extraction (strictly scoped to Features section with repeating item unwrapping)
    if (!featuresList || featuresList.length === 0) {
      // Step A: Find the explicit Features heading element (prefer deepest heading)
      const candidateHeadings = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6, strong, b, [class*="heading"], [class*="title"], summary, div, span')).filter(el => {
        const txt = (el.textContent || '').trim();
        if (!/^(?:key\s+|vehicle\s+|standard\s+|installed\s+)?features(?:\s*&\s*specs)?$/i.test(txt)) return false;
        if (txt.length > 35) return false;
        if (el.tagName === 'H1' && /20\d\d|[a-z]{3,}\s+[a-z]{3,}/i.test(txt)) return false;
        if (el.querySelector('h1, h2, h3, h4, h5, h6')) return false;
        return true;
      });

      let featureHeading = null;
      if (candidateHeadings.length > 0) {
        featureHeading = candidateHeadings.reduce((deepest, curr) => {
          if (!deepest) return curr;
          return (deepest.contains(curr) && deepest !== curr) ? curr : deepest;
        }, null);
      }

      // Step B: Collect candidate containers
      const candidateContainers = [];
      if (featureHeading) {
        let sib = featureHeading.nextElementSibling;
        while (sib && /^(?:hr|br|script|style)$/i.test(sib.tagName)) {
          sib = sib.nextElementSibling;
        }
        if (sib) candidateContainers.push(sib);

        if (featureHeading.parentElement && featureHeading.parentElement !== doc.body) {
          let parentSib = featureHeading.parentElement.nextElementSibling;
          while (parentSib && /^(?:hr|br|script|style)$/i.test(parentSib.tagName)) {
            parentSib = parentSib.nextElementSibling;
          }
          if (parentSib) candidateContainers.push(parentSib);
          candidateContainers.push(featureHeading.parentElement);
          if (featureHeading.parentElement.parentElement && featureHeading.parentElement.parentElement !== doc.body) {
            candidateContainers.push(featureHeading.parentElement.parentElement);
          }
        }
      }

      const directContainers = doc.querySelectorAll('[data-test*="feature"], [data-testid*="feature"], #car-features, #features, .features-grid, .features-list, .equipment-list, [class*="features-grid"], [class*="features_grid"], [class*="features-section"], [class*="features-list"]');
      directContainers.forEach(el => candidateContainers.push(el));

      // Step C: Extract individual repeating items inside the container ONLY
      const items = [];
      const seen = new Set();

      // Helper: Extract text while preserving spaces across disjoint child elements/tags
      const extractItemText = (el) => {
        if (!el) return '';
        try {
          const clone = el.cloneNode(true);
          const junk = clone.querySelectorAll('script, style, svg, path, img, button');
          junk.forEach(n => n.remove());

          const textParts = [];
          const collectText = (node) => {
            if (node.nodeType === 3) {
              const val = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
              if (val) textParts.push(val);
            } else if (node.nodeType === 1) {
              for (let child = node.firstChild; child; child = child.nextSibling) {
                collectText(child);
              }
            }
          };
          collectText(clone);
          if (textParts.length > 0) {
            return textParts.join(' ').replace(/[ \t]+/g, ' ').trim();
          }
        } catch (e) {}

        return (el.textContent || '').replace(/[ \t]+/g, ' ').trim();
      };

      const addFeature = (rawText) => {
        if (!rawText || typeof rawText !== 'string') return;
        const splitParts = (str) => {
          if (!str) return [];
          if (str.includes('\n')) return str.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
          const cln = str.replace(/[ \t]+/g, ' ').trim();
          if (cln.length > 30 && (/[a-z0-9][A-Z]/.test(cln) || /\b(?:CD|ABS|EBD|ESP|MP3|USB|GPS|AM\/FM|LED|HID|4WD|AWD|FWD|RWD|PDC|TPMS)[A-Z][a-z]/.test(cln))) {
            const sep = cln
              .replace(/([a-z0-9])([A-Z])/g, '$1\n$2')
              .replace(/\b(CD|ABS|EBD|ESP|MP3|USB|GPS|AM\/FM|LED|HID|4WD|AWD|FWD|RWD|PDC|TPMS)([A-Z][a-z])/g, '$1\n$2');
            return sep.split('\n').map(s => s.trim()).filter(Boolean);
          }
          return [cln];
        };

        const lines = splitParts(rawText);
        for (const line of lines) {
          const clean = line.replace(/[ \t]+/g, ' ').trim();
          if (clean && clean.length >= 2 && clean.length <= 60) {
            if (!/^(?:features|key features|vehicle features|standard features|installed features|show more|show less|view all|view less|read more|read less|back to search|used cars|specs)$/i.test(clean)) {
              if (!/^(?:20\d\d\s+[A-Za-z]+|R\s*[\d\s,.]+|[\d\s]+km)$/i.test(clean)) {
                if (!seen.has(clean.toLowerCase())) {
                  seen.add(clean.toLowerCase());
                  items.push(clean);
                }
              }
            }
          }
        }
      };

      for (const container of candidateContainers) {
        if (!container || items.length >= 2) break;

        // Strategy 1: Direct <li> elements
        const listItems = Array.from(container.querySelectorAll('li')).filter(li => !featureHeading || !li.contains(featureHeading));
        if (listItems.length >= 2) {
          listItems.forEach(li => addFeature(extractItemText(li)));
          if (items.length >= 2) break;
        }

        // Strategy 2: Dedicated feature class elements
        const classItems = Array.from(container.querySelectorAll('[class*="feature-item"], [class*="feature_item"], [class*="featureItem"], [class*="features__item"], [class*="chip"], [class*="pill"], [class*="badge"], [class*="tag"]')).filter(ci => !featureHeading || !ci.contains(featureHeading));
        if (classItems.length >= 2) {
          classItems.forEach(ci => addFeature(extractItemText(ci)));
          if (items.length >= 2) break;
        }

        // Strategy 3: Find repeating wrapper inside container
        const allWrappers = [container, ...Array.from(container.querySelectorAll('div, ul, ol, section, article'))];
        for (const wrapper of allWrappers) {
          if (featureHeading && (wrapper === featureHeading || (wrapper.contains(featureHeading) && wrapper.children.length === 1))) continue;

          const children = Array.from(wrapper.children).filter(c => {
            if (featureHeading && (c === featureHeading || c.contains(featureHeading))) return false;
            if (/^(?:STYLE|SCRIPT|NOSCRIPT|SVG|BUTTON|NAV|HEADER|FOOTER|HR|BR)$/i.test(c.tagName)) return false;
            const txt = (c.textContent || '').trim();
            if (/^(?:features|key features|show more|view all|read more)$/i.test(txt)) return false;
            return true;
          });

          if (children.length >= 2 && children.length <= 80) {
            const sampleTexts = children.map(c => extractItemText(c)).filter(t => t.length >= 2 && t.length <= 60 && !/^(?:features|key features|show more|view all|read more)$/i.test(t));
            if (sampleTexts.length >= 2 && sampleTexts.length >= children.length * 0.7) {
              children.forEach(c => addFeature(extractItemText(c)));
              if (items.length >= 2) break;
            }
          }
        }
      }

      // Strategy 4: Fallback leaf-elements within section
      if (items.length === 0 && featureHeading) {
        const sectionEl = featureHeading.closest('section, article, [class*="section"], [class*="card"], div') || featureHeading.parentElement;
        if (sectionEl && !/^(?:body|html|main)$/i.test(sectionEl.tagName)) {
          const leafEls = Array.from(sectionEl.querySelectorAll('div, span, p, li')).filter(el => {
            if (featureHeading.contains(el) || el.contains(featureHeading)) return false;
            if (el.closest('h1, h2, h3, h4, h5, h6, button, script, style, svg')) return false;
            if (el.children.length > 0) {
              const nonInline = Array.from(el.children).filter(c => !/^(?:SPAN|I|SVG|PATH|IMG|EM|STRONG|B)$/i.test(c.tagName));
              if (nonInline.length > 0) return false;
            }
            const t = extractItemText(el);
            return t.length >= 2 && t.length <= 60 && !/^(?:features|key features|show more|view all|read more)$/i.test(t);
          });
          if (leafEls.length >= 2) {
            leafEls.forEach(el => addFeature(extractItemText(el)));
          }
        }
      }

      if (items.length > 0) {
        featuresList = items;
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
