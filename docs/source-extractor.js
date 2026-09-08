/**
 * Production Cars.co.za Dynamic Source Extractor Engine v2.0.2
 * Multi-Strategy Cascading Extractor for ANY Cars.co.za car-detail / listing page.
 *
 * Cascading Strategies:
 * 1. Deep Next.js Hydration Props Search (<script id="__NEXT_DATA__">)
 * 2. Schema.org JSON-LD Microdata (<script type="application/ld+json">)
 * 3. OpenGraph / Canonical Meta Tags
 * 4. Explicit Data Attributes & Semantic DOM Selectors
 * 5. Universal Label-Value Spec Crawler (Grid, Flexbox, Cards, Tables, Lists, DL/DT/DD)
 */

const CarsCoZaAdapter = {
  id: 'cars_co_za',
  name: 'Cars.co.za Production Listing Adapter',

  canHandle(doc) {
    if (!doc) return false;
    const url = doc.location?.href || '';
    return url.includes('cars.co.za') || doc.querySelector('#cars-co-za-marker') !== null || doc.title.includes('Cars.co.za');
  },

  extract(doc) {
    if (!doc) doc = document;

    // --- 1. Parse Next.js hydrated state ---
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

    // --- 2. Parse JSON-LD microdata ---
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

    // --- Helper 2: DOM Selectors Lookup ---
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

    // --- Helper 3: Universal Label Spec Crawler ---
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
