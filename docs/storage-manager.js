/**
 * Storage Manager using standard browser localStorage.
 * Operates 100% locally in browser without external servers or cookies.
 */

window.CarStorageManager = {
  MAPPING_KEY: 'car_helper_field_mapping',
  EXTRACTED_DATA_KEY: 'car_helper_extracted_data',
  FILL_LOG_KEY: 'car_helper_fill_log',

  getMapping() {
    try {
      const stored = localStorage.getItem(this.MAPPING_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('LocalStorage error reading mapping:', e);
    }
    return window.DefaultFieldMapping;
  },

  saveMapping(mappingObj) {
    try {
      localStorage.setItem(this.MAPPING_KEY, JSON.stringify(mappingObj, null, 2));
      return true;
    } catch (e) {
      console.error('Failed to save mapping:', e);
      return false;
    }
  },

  resetMappingToDefault() {
    try {
      localStorage.removeItem(this.MAPPING_KEY);
    } catch (e) {}
    return window.DefaultFieldMapping;
  },

  getExtractedData() {
    try {
      const stored = localStorage.getItem(this.EXTRACTED_DATA_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  },

  saveExtractedData(dataObj) {
    try {
      localStorage.setItem(this.EXTRACTED_DATA_KEY, JSON.stringify(dataObj, null, 2));
      return true;
    } catch (e) {
      console.error('Failed to save extracted data:', e);
      return false;
    }
  },

  saveFillLog(logObj) {
    try {
      localStorage.setItem(this.FILL_LOG_KEY, JSON.stringify(logObj, null, 2));
    } catch (e) {}
  }
};
