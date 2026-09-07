# Car Data Browser Automation & Data-Entry Helper (Phase 3 Userscript Prototype)

A 100% client-side, zero-dependency, local browser automation prototype designed for repetitive car data entry workflows on **Android** and **Desktop**.

> [!IMPORTANT]
> **No Node.js / Backend Required**:
> This tool uses pure HTML, CSS, and Vanilla JavaScript. It runs directly in any modern web browser or mobile browser without Node.js, npm, servers, proxies, or remote APIs.

---

## 📁 Repository Structure

```
/docs
  index.html            # Main Test Harness & Dashboard (Phase 2 & 3 Adapter Toggle)
  cars-co-za-sample.html # Real Cars.co.za Listing Sample Fixture (2019 BMW X1)
  dummy-source.html     # Dummy practice car listing page (Phase 1)
  dummy-target.html     # Legacy target HTML intake form (18 fields)
  app.js                # Dashboard controller & UI handlers
  normalizers.js        # Data cleaning (mileage, price, transmission, etc.)
  validators.js         # Status check & missing data rules (no fabrication)
  field-mapping.js      # Configurable source.field -> target selector mapping
  storage-manager.js    # LocalStorage manager for mappings & extracted JSON
  source-extractor.js   # Modular Adapter Extractor (CarsCoZaAdapter & DummyAdapter)
  target-filler.js      # TargetFormAdapter auto-filler with event dispatchers
  styles.css            # Responsive dashboard & form styling
  README.md             # Complete Documentation

/userscript
  car-data-helper.user.js # Production Android & Desktop Userscript (Tampermonkey/Violentmonkey)
  README.md               # Android setup guide & browser evaluation
```

---

## 📱 Android Userscript Architecture

```
Cars.co.za Listing Page (Phone Browser)
               ↓
     Tap "🚗 Extract Car Data"
               ↓
       CarsCoZaAdapter
               ↓
   GM_setValue (Cross-Domain Storage)
               ↓
Switch Tab to Target Form (Work Site)
               ↓
      Tap "⚡ Fill Target Form"
               ↓
      TargetFormAdapter
               ↓
    18 Mapped Fields Populated
               ↓
  User Manually Inspects & Submits!
```

---

## 📊 Complete Field Mapping Reference

| Extracted Field | Target Selector | Control Type | Status |
| :--- | :--- | :--- | :--- |
| `source.title` | `#target_vehicle_title` | `text` | Extracted |
| `source.year` | `#target_year` | `number` | Extracted |
| `source.mileage` | `#target_mileage` | `number` | Extracted |
| `source.transmission` | `#target_transmission` | `select` | Extracted |
| `source.fuel` | `#target_fuel` | `select` | Extracted |
| `source.drivetrain` | `#target_drivetrain` | `select` | Extracted |
| `source.bodyColour` | `#target_body_colour` | `text` | Extracted |
| `source.condition` | `input[name="target_condition"]` | `radio` | Extracted |
| `source.price` | `#target_price` | `number` | Extracted |
| `source.dealerName` | `#target_dealer_name` | `text` | Extracted |
| `source.dealerRating` | `#target_dealer_rating` | `number` | Extracted |
| `source.location` | `#target_location` | `text` | Extracted |
| `source.features` | `input[name="target_features[]"]` | `checkbox_group` | Extracted |
| `source.description` | `#target_description` | `textarea` | Extracted |
| `source.engineSize` | `#target_engine_capacity` | `text` | Extracted |
| `source.VIN` | `#target_vin` | `text` | Extracted |
| `source.serviceHistory` | `#target_service_history` | `select` | Extracted |
| `source.sourceUrl` | `#target_source_url` | `url` | Extracted |
