/**
 * Validation module for extracted car data.
 * Strictly adheres to rule: NEVER fabricate missing/masked/ambiguous data.
 * Flags fields as:
 * - Extracted: Valid value extracted
 * - Missing / Needs Review: Field missing, masked, empty, or unparseable
 */

window.CarValidators = {
  validateField(key, value) {
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

    if (key === 'year') {
      const num = Number(value);
      if (isNaN(num) || num < 1900 || num > new Date().getFullYear() + 1) {
        return { status: 'missing', label: 'Missing / Needs Review', message: `Year out of range: ${value}` };
      }
    }

    if (key === 'contactNumber') {
      if (typeof value !== 'string' || value.includes('*') || value.replace(/[^\d]/g, '').length < 7) {
        return { status: 'missing', label: 'Missing / Needs Review', message: 'Contact Number is masked or invalid.' };
      }
    }

    return {
      status: 'extracted',
      label: 'Extracted',
      message: 'Successfully extracted.'
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
