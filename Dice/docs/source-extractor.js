/**
 * Modular Source Extractor Architecture
 * Supports multiple source site adapters:
 * 1. DummySourceAdapter (Phase 1 practice page)
 * 2. CarsCoZaAdapter (Phase 2 real Cars.co.za listing pages)
 *
 * Deterministic DOM extraction using JSON-LD microdata, __NEXT_DATA__ props, meta tags, and DOM selectors.
 * Never fabricates values. Missing or masked values return status: "Missing / Needs Review".
 */

// Adapter 1: Dummy Practice Page Adapter
const DummySourceAdapter = {
  id: 'dummy',
  name: 'Dummy Practice Page Adapter',

  canHandle(doc) {
    if (!doc) return false;
    const url = doc.location?.href || '';
    return url.includes('dummy-source.html') || doc.querySelector('#car-title') !== null;
  },

  extract(doc) {
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

    const title = getDOMText(['#car-title', '.listing-title']);
    return {
      title,
      titleDescription: title.replace(/^\d{4}\s+/, ''),
      year: getDOMText(['#spec-year']),
      mileage: getDOMText(['#spec-mileage']),
      transmission: getDOMText(['#spec-transmission']),
      fuel: getDOMText(['#spec-fuel']),
      drivetrain: getDOMText(['#spec-drivetrain']),
      bodyColour: getDOMText(['#spec-colour']),
      condition: getDOMText(['#spec-condition']),
      price: getDOMText(['#car-price']),
      dealerName: getDOMText(['#dealer-name']),
      dealerRating: getDOMText(['#dealer-rating']),
      location: getDOMText(['#car-location']),
      features: getDOMList(['#car-features li']),
      description: getDOMText(['#car-description']),
      engineSize: getDOMText(['#spec-engine']),
      VIN: getDOMText(['#spec-vin']),
      serviceHistory: getDOMText(['#spec-service']),
      sourceUrl: doc.querySelector('#source-url-meta')?.getAttribute('href') || doc.location?.href || ''
    };
  }
};

// Adapter 2: Cars.co.za Listing Adapter
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

    // Layer 1: Extract Schema.org JSON-LD microdata
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

    // Layer 2: Extract Next.js __NEXT_DATA__ page props if present
    try {
      const nextScript = doc.querySelector('script[id="__NEXT_DATA__"]');
      if (nextScript) {
        const nextJson = JSON.parse(nextScript.textContent);
        nextDataProps = nextJson.props?.pageProps?.listing || nextJson.props?.pageProps?.vehicle || {};
      }
    } catch (e) {}

    // Layer 3: Extract Meta tags & OpenGraph
    const getMeta = (props) => {
      for (const p of props) {
        const el = doc.querySelector(`meta[property="${p}"], meta[name="${p}"]`);
        if (el && el.getAttribute('content')) return el.getAttribute('content').trim();
      }
      return '';
    };

    // Layer 4: Extract rendered DOM elements
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

    // Helper: Find value from spec tables / key-value list items
    const getSpecByLabel = (labels) => {
      const items = doc.querySelectorAll('.spec-item, .vehicle-details__item, tr, dl, li, [class*="spec"]');
      for (const item of items) {
        const txt = item.textContent || '';
        for (const lbl of labels) {
          if (txt.toLowerCase().includes(lbl.toLowerCase())) {
            const valEl = item.querySelector('.value, td:nth-child(2), dd, span:last-child');
            if (valEl && valEl.textContent) return valEl.textContent.trim();
            // Fallback split label: value
            const parts = txt.split(/[:\n\t]/);
            if (parts.length > 1) return parts[parts.length - 1].trim();
          }
        }
      }
      return '';
    };

    // Extraction with cascade order: NextData -> JSON-LD -> Meta -> DOM Spec Table
    const title = nextDataProps.title ||
                  jsonLdData.name ||
                  getMeta(['og:title', 'title']) ||
                  getDOMText(['h1.heading-sm', 'h1.title', 'h1', '[data-test="heading"]']);

    const year = nextDataProps.year ||
                 jsonLdData.vehicleModelDate ||
                 jsonLdData.modelDate ||
                 getSpecByLabel(['Year', 'Registration Year']) ||
                 (title.match(/\b(19\d\d|20\d\d)\b/) ? title.match(/\b(19\d\d|20\d\d)\b/)[1] : '');

    const mileage = nextDataProps.mileage ||
                    jsonLdData.mileageFromOdometer?.value ||
                    jsonLdData.mileageFromOdometer ||
                    getSpecByLabel(['Mileage', 'Odometer', 'Km']) ||
                    getDOMText(['[data-test="mileage"]', '.spec-mileage']);

    const price = nextDataProps.price ||
                  jsonLdData.offers?.price ||
                  getMeta(['product:price:amount']) ||
                  getDOMText(['[data-test="price"]', '.price-amount', '.heading-lg.price']);

    const transmission = nextDataProps.transmission ||
                         jsonLdData.vehicleTransmission ||
                         getSpecByLabel(['Transmission', 'Gearbox']);

    const fuel = nextDataProps.fuel ||
                 jsonLdData.fuelType ||
                 getSpecByLabel(['Fuel', 'Fuel Type']);

    const drivetrain = nextDataProps.drivetrain ||
                       jsonLdData.driveWheelConfiguration ||
                       getSpecByLabel(['Drivetrain', 'Drive Type', 'Wheel Drive']);

    const bodyColour = nextDataProps.colour ||
                       jsonLdData.color ||
                       getSpecByLabel(['Colour', 'Color', 'Body Colour']);

    const condition = nextDataProps.condition ||
                      (jsonLdData.itemCondition ? jsonLdData.itemCondition.replace('https://schema.org/', '').replace('Condition', '') : '') ||
                      getSpecByLabel(['Condition', 'Vehicle Condition']);

    const dealerName = nextDataProps.dealer?.name ||
                       jsonLdData.offers?.seller?.name ||
                       getDOMText(['[data-test="dealer-name"]', '.seller-info__title', '.dealer-title']);

    const dealerRating = nextDataProps.dealer?.rating ||
                         jsonLdData.offers?.seller?.aggregateRating?.ratingValue ||
                         getDOMText(['[data-test="dealer-rating"]', '.rating-badge']);

    const location = nextDataProps.location ||
                     getDOMText(['[data-test="location"]', '.seller-info__address', '.location-text']);

    const features = nextDataProps.features ||
                     getDOMList(['[data-test="features"] li', '.features-list li', '.equipment-list li']);

    const description = nextDataProps.description ||
                        jsonLdData.description ||
                        getMeta(['og:description', 'description']) ||
                        getDOMText(['[data-test="description"]', '.vehicle-description', '#description']);

    const engineSize = nextDataProps.engineSize ||
                       getSpecByLabel(['Engine Size', 'Engine Capacity', 'Engine']);

    const VIN = nextDataProps.vin ||
                jsonLdData.vehicleIdentificationNumber ||
                getSpecByLabel(['VIN', 'Stock No', 'Stock Number', 'VIN / Stock']);

    const serviceHistory = nextDataProps.serviceHistory ||
                           getSpecByLabel(['Service History', 'Service Record']);

    const sourceUrl = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ||
                      getMeta(['og:url']) ||
                      doc.location?.href || '';

    // Title Description (Model / Variant minus year)
    const titleDescription = title ? title.replace(/^\d{4}\s+/, '').trim() : '';

    return {
      title,
      titleDescription,
      year,
      mileage,
      transmission,
      fuel,
      drivetrain,
      bodyColour,
      condition,
      price,
      dealerName,
      dealerRating,
      location,
      features,
      description,
      engineSize,
      VIN,
      serviceHistory,
      sourceUrl
    };
  }
};

// Global Extractor Engine
window.CarSourceExtractor = {
  adapters: [CarsCoZaAdapter, DummySourceAdapter],

  extractFromDocument(doc) {
    if (!doc) doc = document;

    // Select suitable adapter
    let adapter = this.adapters.find(a => a.canHandle(doc)) || DummySourceAdapter;

    const raw = adapter.extract(doc);

    // Normalize
    const norm = window.CarNormalizers;
    const normalized = {
      title: norm.cleanText(raw.title),
      titleDescription: norm.cleanText(raw.titleDescription),
      year: norm.normalizeYear(raw.year),
      mileage: norm.normalizeMileage(raw.mileage),
      transmission: norm.normalizeTransmission(raw.transmission),
      fuel: norm.normalizeFuel(raw.fuel),
      drivetrain: norm.normalizeDrivetrain(raw.drivetrain),
      bodyColour: norm.cleanText(raw.bodyColour),
      condition: norm.cleanText(raw.condition),
      price: norm.normalizePrice(raw.price),
      dealerName: norm.cleanText(raw.dealerName),
      dealerRating: raw.dealerRating ? parseFloat(raw.dealerRating) || '' : '',
      location: norm.cleanText(raw.location),
      features: norm.normalizeFeatures(raw.features),
      description: norm.cleanText(raw.description),
      engineSize: norm.cleanText(raw.engineSize),
      VIN: norm.cleanText(raw.VIN),
      serviceHistory: norm.cleanText(raw.serviceHistory),
      sourceUrl: raw.sourceUrl || doc.location?.href || ''
    };

    // Validate
    const validationReport = window.CarValidators.validateCarData(normalized);

    return {
      adapter: adapter.name,
      raw,
      normalized,
      validationReport,
      timestamp: new Date().toISOString()
    };
  }
};
