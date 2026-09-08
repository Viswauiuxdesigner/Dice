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
   * Normalize numeric year (e.g., "2019", "2019/2020" -> "2019")
   */
  normalizeYear(val) {
    if (!val) return '';
    const match = String(val).match(/\b(19\d\d|20\d\d)\b/);
    return match ? match[1] : '';
  },

  /**
   * Normalize Kilometers Driven (e.g. "75743", "75 743 km" -> "75 743 km")
   */
  normalizeKilometersDriven(val) {
    if (!val) return '';
    const str = String(val).trim();
    if (str.toLowerCase().includes('km')) return str;
    const digitsOnly = str.replace(/[^\d]/g, '');
    if (!digitsOnly) return str;
    return `${Number(digitsOnly).toLocaleString('fr-FR').replace(/\s/g, ' ')} km`;
  },

  /**
   * Normalize Price (e.g. "R 249 900", "249900" -> "249 900")
   */
  normalizePrice(val) {
    if (!val) return '';
    const digitsOnly = String(val).replace(/[^\d]/g, '');
    if (!digitsOnly) return String(val).trim();
    return Number(digitsOnly).toLocaleString('fr-FR').replace(/\s/g, ' ');
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
   * Normalize 4x2 / 4x4 (Drivetrain)
   */
  normalize4x2Or4x4(val) {
    if (!val) return '';
    const str = String(val).toLowerCase();
    if (str.includes('4x4') || str.includes('4wd') || str.includes('awd') || str.includes('all-wheel')) return '4x4';
    if (str.includes('4x2') || str.includes('fwd') || str.includes('rwd') || str.includes('front') || str.includes('rear') || str.includes('two-wheel')) return '4x2';
    return this.cleanText(val);
  },

  /**
   * Normalize features to a newline-separated string
   */
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
