/**
 * Field Mapping Configurator
 * Defines default mappings between extracted source fields and target form input selectors.
 * Supports camelCase and snake_case properties seamlessly.
 */

window.DefaultFieldMapping = {
  title: {
    sourceKey: 'title',
    targetSelector: '#target_vehicle_title',
    targetType: 'text',
    description: 'Vehicle Title / Full Name'
  },
  titleDescription: {
    sourceKey: 'titleDescription',
    targetSelector: '#target_vehicle_title',
    targetType: 'text',
    description: 'Vehicle Model / Variant (without year)'
  },
  year: {
    sourceKey: 'year',
    targetSelector: '#target_year',
    targetType: 'number',
    description: 'Manufacture Year'
  },
  mileage: {
    sourceKey: 'mileage',
    targetSelector: '#target_mileage',
    targetType: 'number',
    description: 'Odometer Mileage (km)'
  },
  transmission: {
    sourceKey: 'transmission',
    targetSelector: '#target_transmission',
    targetType: 'select',
    description: 'Transmission Type'
  },
  fuel: {
    sourceKey: 'fuel',
    targetSelector: '#target_fuel',
    targetType: 'select',
    description: 'Fuel Type'
  },
  drivetrain: {
    sourceKey: 'drivetrain',
    targetSelector: '#target_drivetrain',
    targetType: 'select',
    description: 'Drivetrain (AWD, FWD, RWD)'
  },
  bodyColour: {
    sourceKey: 'bodyColour',
    targetSelector: '#target_body_colour',
    targetType: 'text',
    description: 'Exterior Body Colour'
  },
  condition: {
    sourceKey: 'condition',
    targetSelector: 'input[name="target_condition"]',
    targetType: 'radio',
    description: 'Vehicle Condition (Used, Certified, New)'
  },
  price: {
    sourceKey: 'price',
    targetSelector: '#target_price',
    targetType: 'number',
    description: 'Listing Price (ZAR)'
  },
  dealerName: {
    sourceKey: 'dealerName',
    targetSelector: '#target_dealer_name',
    targetType: 'text',
    description: 'Dealership / Seller Name'
  },
  dealerRating: {
    sourceKey: 'dealerRating',
    targetSelector: '#target_dealer_rating',
    targetType: 'number',
    description: 'Dealership Rating (1-5)'
  },
  location: {
    sourceKey: 'location',
    targetSelector: '#target_location',
    targetType: 'text',
    description: 'Vehicle Location / Region'
  },
  features: {
    sourceKey: 'features',
    targetSelector: 'input[name="target_features[]"]',
    targetType: 'checkbox_group',
    description: 'Vehicle Features (Sunroof, Leather, Navigation, etc.)'
  },
  description: {
    sourceKey: 'description',
    targetSelector: '#target_description',
    targetType: 'textarea',
    description: 'Seller Detailed Description'
  },
  engineSize: {
    sourceKey: 'engineSize',
    targetSelector: '#target_engine_capacity',
    targetType: 'text',
    description: 'Engine Capacity / Displacement'
  },
  VIN: {
    sourceKey: 'VIN',
    targetSelector: '#target_vin',
    targetType: 'text',
    description: 'VIN / Stock Number'
  },
  serviceHistory: {
    sourceKey: 'serviceHistory',
    targetSelector: '#target_service_history',
    targetType: 'select',
    description: 'Service Record History'
  },
  sourceUrl: {
    sourceKey: 'sourceUrl',
    targetSelector: '#target_source_url',
    targetType: 'url',
    description: 'Original Source Listing URL'
  }
};
