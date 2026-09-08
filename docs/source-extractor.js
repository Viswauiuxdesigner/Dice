/**
 * Production Cars.co.za Dynamic Source Extractor Engine
 * Works dynamically across ANY Cars.co.za car-detail / listing page.
 *
 * Extraction Layers (Cascade):
 * 1. Schema.org JSON-LD Microdata (<script type="application/ld+json">)
 * 2. Next.js Hydration Props (<script id="__NEXT_DATA__">)
 * 3. OpenGraph / Canonical Meta Tags
 * 4. Cars.co.za Rendered DOM Spec Tables & Badges
 */

const CarsCoZaAdapter = {
  id: 'cars_co_za',
  name: 'Cars.co.za Listing Adapter',

  canHandle(doc) {
    if (!doc) return false;
    const url = doc.location?.href || '';
    if (url.includes('cars.co.za')) return true;
    if (doc.querySelector('link[rel="canonical"]')?.getAttribute('href')?.includes('cars.co.za')) return true;
    if (doc.querySelector('#cars-co-za-marker') !== null) return true;
    return false;
  },

  extract(doc) {
    let jsonLdData = {};
    let nextDataProps = {};

    // 1. Extract Schema.org JSON-LD microdata
    try {
      const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
      jsonLdScripts.forEach(script => {
        try {
          const parsed = JSON.parse(script.textContent);
          if (parsed['@type'] === 'Car' || parsed['@type'] === 'Vehicle' || parsed['@type'] === 'Product') {
            jsonLdData = parsed;
          } else if (Array.isArray(parsed)) {
            const found = parsed.find(item => item['@type'] === 'Car' || item['@type'] === 'Vehicle');
            if (found) jsonLdData = found;
          }
        } catch (e) {}
      });
    } catch (e) {}

    // 2. Extract Next.js __NEXT_DATA__ page props if present
    try {
      const nextScript = doc.querySelector('script[id="__NEXT_DATA__"]');
      if (nextScript) {
        const nextJson = JSON.parse(nextScript.textContent);
        nextDataProps = nextJson.props?.pageProps?.listing ||
                        nextJson.props?.pageProps?.vehicle ||
                        nextJson.props?.pageProps?.initialState?.listing || {};
      }
    } catch (e) {}

    // Helper: Meta tag extract
    const getMeta = (props) => {
      for (const p of props) {
        const el = doc.querySelector(`meta[property="${p}"], meta[name="${p}"]`);
        if (el && el.getAttribute('content')) return el.getAttribute('content').trim();
      }
      return '';
    };

    // Helper: DOM text extract
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

    // Helper: DOM list extract
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

    // Helper: Spec table label lookup
    const getSpecByLabel = (labels) => {
      const items = doc.querySelectorAll('.spec-item, .vehicle-details__item, tr, dl, li, [class*="spec"]');
      for (const item of items) {
        const txt = item.textContent || '';
        for (const lbl of labels) {
          if (txt.toLowerCase().includes(lbl.toLowerCase())) {
            const valEl = item.querySelector('.value, td:nth-child(2), dd, span:last-child');
            if (valEl && valEl.textContent) return valEl.textContent.trim();
            const parts = txt.split(/[:\n\t]/);
            if (parts.length > 1) return parts[parts.length - 1].trim();
          }
        }
      }
      return '';
    };

    // --- Dynamic Field Extractions ---

    // Full raw title heading
    const fullTitle = nextDataProps.title ||
                      getDOMText(['[data-test="heading"]', 'h1.heading-sm', '#car-title', 'h1.title', 'h1']) ||
                      jsonLdData.name ||
                      getMeta(['og:title', 'title']);

    // Title (Make/Model) vs Title Description (Trim/Variant)
    let title = '';
    let titleDescription = '';

    const brandName = nextDataProps.make || (typeof jsonLdData.brand === 'string' ? jsonLdData.brand : jsonLdData.brand?.name) || '';
    const modelName = nextDataProps.model || jsonLdData.model || '';
    const yearVal = nextDataProps.year || jsonLdData.vehicleModelDate || (fullTitle.match(/\b(19\d\d|20\d\d)\b/) ? fullTitle.match(/\b(19\d\d|20\d\d)\b/)[1] : '');

    if (brandName && modelName) {
      title = `${yearVal} ${brandName} ${modelName}`.trim();
      titleDescription = fullTitle.replace(title, '').trim();
      if (!titleDescription && fullTitle !== title) {
        titleDescription = fullTitle.replace(/^\d{4}\s+/, '').trim();
      }
    } else {
      const m = fullTitle.match(/^((?:19|20)\d\d\s+[A-Za-z0-9-]+(?:\s+[A-Za-z0-9-]+)?)(.*)$/);
      if (m && m[2].trim()) {
        title = m[1].trim();
        titleDescription = m[2].trim();
      } else {
        title = fullTitle;
        titleDescription = getDOMText(['.variant-title', '.sub-heading']) || (fullTitle.match(/\b(19\d\d|20\d\d)\b/) ? fullTitle.replace(/^\d{4}\s+/, '').trim() : '');
      }
    }

    // 3. Year
    const year = yearVal || getSpecByLabel(['Year', 'Registration Year']) || getDOMText(['#spec-year']);

    // 4. Kilometers Driven
    const kilometersDriven = nextDataProps.mileage ||
                               jsonLdData.mileageFromOdometer?.value ||
                               jsonLdData.mileageFromOdometer ||
                               getSpecByLabel(['Kilometers Driven', 'Mileage', 'Odometer']) ||
                               getDOMText(['#spec-mileage', '[data-test="mileage"]', '.spec-mileage']);

    // 5. Transmission
    const transmission = nextDataProps.transmission ||
                         jsonLdData.vehicleTransmission ||
                         getSpecByLabel(['Transmission', 'Gearbox']) ||
                         getDOMText(['#spec-transmission']);

    // 6. Fuel
    const fuel = nextDataProps.fuel ||
                 jsonLdData.fuelType ||
                 getSpecByLabel(['Fuel', 'Fuel Type']) ||
                 getDOMText(['#spec-fuel']);

    // 7. 4x2 / 4x4 (Drivetrain)
    const drivetrain = nextDataProps.drivetrain ||
                         jsonLdData.driveWheelConfiguration ||
                         getSpecByLabel(['4x2 / 4x4', 'Drivetrain', 'Drive Type']) ||
                         getDOMText(['#spec-drivetrain']);

    // 8. Body Color
    const bodyColor = nextDataProps.colour ||
                      jsonLdData.color ||
                      getSpecByLabel(['Body Color', 'Body Colour', 'Colour', 'Color']) ||
                      getDOMText(['#spec-colour']);

    // 9. Condition
    const condition = nextDataProps.condition ||
                      (jsonLdData.itemCondition ? jsonLdData.itemCondition.replace('https://schema.org/', '').replace('Condition', '') : '') ||
                      getSpecByLabel(['Condition', 'Vehicle Condition']) ||
                      getDOMText(['#spec-condition']);

    // 10. Pricing Summary (Combined Cash Price + Installment if present)
    const pricingSummary = nextDataProps.pricingSummary ||
                           getDOMText(['[data-test="pricing-summary"]', '.price-summary', '#car-price-summary', '.pricing-container']) ||
                           (getDOMText(['[data-test="price"]', '#car-price', '.price-amount']) ? `${getDOMText(['[data-test="price"]', '#car-price', '.price-amount'])} ${getDOMText(['[data-test="est-installment"]', '.est-payment'])}`.trim() : '') ||
                           (jsonLdData.offers?.price ? `R ${Number(jsonLdData.offers.price).toLocaleString('fr-FR').replace(/\s/g, ' ')}` : '');

    // 11. Dealer Name
    const dealerName = nextDataProps.dealer?.name ||
                       jsonLdData.offers?.seller?.name ||
                       getDOMText(['[data-test="dealer-name"]', '#dealer-name', '.seller-info__title']);

    // 12. Dealer Address / Location
    const dealerAddress = nextDataProps.dealer?.address ||
                          nextDataProps.location ||
                          getDOMText(['[data-test="dealer-address"]', '[data-test="location"]', '#car-location', '.seller-info__address', '.location-text']);

    // 13. Average Rating
    const averageRating = nextDataProps.dealer?.rating ||
                          (jsonLdData.offers?.seller?.aggregateRating ? `${jsonLdData.offers.seller.aggregateRating.ratingValue} (${jsonLdData.offers.seller.aggregateRating.reviewCount || ''} Reviews)`.trim() : '') ||
                          getDOMText(['[data-test="dealer-rating"]', '#dealer-rating', '.rating-badge']);

    // 14. Features
    const rawFeatures = nextDataProps.features ||
                        getDOMList(['[data-test="features"] li', '#car-features li', '.features-list li']);

    // 15. Description
    const description = nextDataProps.description ||
                        jsonLdData.description ||
                        getMeta(['og:description', 'description']) ||
                        getDOMText(['[data-test="description"]', '#car-description', '.vehicle-description']);

    // 16. Price (Cash Price only)
    const rawPrice = nextDataProps.price ||
                     jsonLdData.offers?.price ||
                     getMeta(['product:price:amount']) ||
                     getDOMText(['[data-test="price"]', '#car-price', '.price-amount']);

    // 17. Source URL (Canonical Page URL)
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
      features: rawFeatures,
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
