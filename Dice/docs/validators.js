/**
 * Validation module for extracted car data.
 * Strictly adheres to rule: NEVER fabricate missing/masked/ambiguous data.
 * Flags fields as:
 * - Extracted: Valid value extracted
 * - Missing / Needs Review: Field missing, masked, empty, or unparseable
 * - Invalid Format: Value present but violates format expectation
 */

window.CarValidators = {
  validateField(key, value) {
    // Check missing or masked value
    if (value === null || value === undefined || value === '') {
      return {
        status: 'missing',
        label: 'Missing / Needs Review',
        message: 'Value was missing or masked on source page.'
      };
    }

    if (typeof value === 'string' && (value.includes('***') || value.includes('Contact Dealer for Price') || value.includes('N/A'))) {
      return {
        status: 'missing',
        label: 'Missing / Needs Review',
        message: 'Value is masked or unspecified.'
      };
    }

    // Specific field validations
    if (key === 'year') {
      const num = Number(value);
      if (isNaN(num) || num < 1900 || num > new Date().getFullYear() + 1) {
        return { status: 'invalid', label: 'Invalid Format', message: `Year out of range: ${value}` };
      }
    }

    if (key === 'price' || key === 'mileage') {
      const num = Number(value);
      if (isNaN(num) || num < 0) {
        return { status: 'invalid', label: 'Invalid Format', message: `Must be a positive number: ${value}` };
      }
    }

    return {
      status: 'extracted',
      label: 'Extracted',
      message: 'Successfully extracted and normalized.'
    };
  },

  validateCarData(data) {
    const report = {};
    for (const key of Object.keys(data)) {
      report[key] = this.validateField(key, data[key]);
    }
    return report;
  }
};
