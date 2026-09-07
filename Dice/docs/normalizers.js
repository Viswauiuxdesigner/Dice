/**
 * Normalization utilities for raw extracted car listing strings.
 * All normalizers are deterministic and preserve raw inputs if unparseable.
 */

window.CarNormalizers = {
  /**
   * Clean text string (trim, remove double spaces, collapse newlines)
   */
  cleanText(val) {
    if (!val || typeof val !== 'string') return '';
    return val.replace(/\s+/g, ' ').trim();
  },

  /**
   * Normalize numeric year (e.g., "2019", "2019/2020" -> 2019)
   */
  normalizeYear(val) {
    if (!val) return '';
    const match = String(val).match(/\b(19\d\d|20\d\d)\b/);
    return match ? parseInt(match[1], 10) : '';
  },

  /**
   * Normalize mileage in km (e.g. "125 000 km", "125,000" -> 125000)
   */
  normalizeMileage(val) {
    if (!val) return '';
    const digitsOnly = String(val).replace(/[^\d]/g, '');
    return digitsOnly ? parseInt(digitsOnly, 10) : '';
  },

  /**
   * Normalize price in ZAR (e.g. "R 349 900", "R349,900.00" -> 349900)
   */
  normalizePrice(val) {
    if (!val) return '';
    const digitsOnly = String(val).replace(/[^\d]/g, '');
    return digitsOnly ? parseInt(digitsOnly, 10) : '';
  },

  /**
   * Normalize Transmission standard options
   */
  normalizeTransmission(val) {
    if (!val) return '';
    const str = String(val).toLowerCase();
    if (str.includes('auto') || str.includes('steptronic') || str.includes('cvt') || str.includes('dsg')) {
      return 'Automatic';
    }
    if (str.includes('manual') || str.includes('stick')) {
      return 'Manual';
    }
    return this.cleanText(val);
  },

  /**
   * Normalize Fuel Type standard options
   */
  normalizeFuel(val) {
    if (!val) return '';
    const str = String(val).toLowerCase();
    if (str.includes('petrol') || str.includes('gasoline')) return 'Petrol';
    if (str.includes('diesel')) return 'Diesel';
    if (str.includes('hybrid')) return 'Hybrid';
    if (str.includes('electric') || str.includes('ev')) return 'Electric';
    return this.cleanText(val);
  },

  /**
   * Normalize Drivetrain standard options
   */
  normalizeDrivetrain(val) {
    if (!val) return '';
    const str = String(val).toLowerCase();
    if (str.includes('4x4') || str.includes('4wd') || str.includes('awd') || str.includes('all-wheel')) return 'AWD/4WD';
    if (str.includes('fwd') || str.includes('front')) return 'FWD';
    if (str.includes('rwd') || str.includes('rear')) return 'RWD';
    return this.cleanText(val);
  },

  /**
   * Normalize array of features
   */
  normalizeFeatures(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val.map(f => this.cleanText(f)).filter(Boolean);
    if (typeof val === 'string') {
      return val.split(/[,;\n]/).map(f => this.cleanText(f)).filter(Boolean);
    }
    return [];
  }
};
