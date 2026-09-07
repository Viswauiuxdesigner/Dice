# Android & Desktop Userscript - Car Data Helper

The `car-data-helper.user.js` script is a 100% client-side, zero-dependency userscript that bridges Cars.co.za listings directly to your target legacy form on **Android devices** and **Desktop browsers**.

---

## 🚀 How to Install and Run on Android

### Recommended Browser 1: Firefox for Android (Gecko Engine)
1. Install **Firefox for Android** from Google Play Store.
2. Open Firefox settings -> **Add-ons** -> Search for **Tampermonkey** or **Violentmonkey** -> Tap **Install (+)**.
3. Open Tampermonkey / Violentmonkey dashboard -> Tap **Create a new script** or **Import**.
4. Paste the contents of [`userscript/car-data-helper.user.js`](file:///c:/Dice/userscript/car-data-helper.user.js) and save.

### Recommended Browser 2: Kiwi Browser (Chromium Engine)
1. Install **Kiwi Browser** from Google Play Store.
2. Navigate to the **Chrome Web Store** inside Kiwi Browser -> Search and install **Tampermonkey**.
3. Create a new script in Tampermonkey, paste `car-data-helper.user.js`, and save.

---

## 🔄 Mobile User Workflow

```

1. Open Cars.co.za car listing in phone browser
                   ↓
2. Tap "🚗 Extract Car Data" floating widget
                   ↓
3. Extracted JSON saved to cross-domain storage (GM_setValue)
                   ↓
4. Switch tab to Target Form (dummy-target.html / work site)
                   ↓
5. Tap "⚡ Fill Target Form" floating widget
                   ↓
6. Target fields populated & events dispatched (input, change, blur)
                   ↓
7. Inspect fields manually -> Tap "Submit" manually!
```

---

## 🔐 Cross-Domain Storage Engine (`GM_setValue` / `GM_getValue`)

Because `cars.co.za` and your target work site are on separate origins:
- Standard webpage `localStorage` cannot bridge data between them due to browser same-origin policies.
- **Userscripts solve this natively**: Userscript managers (Tampermonkey / Violentmonkey) provide `GM_setValue(key, value)` and `GM_getValue(key)` which store data securely in the browser extension's local storage sandbox across different origins.

---

## 📊 Complete Field Mapping Reference

| Extracted Field | Target Selector | Target Input Type |
| :--- | :--- | :--- |
| `source.title` | `#target_vehicle_title` | `text` |
| `source.titleDescription` | `#target_vehicle_title` | `text` |
| `source.year` | `#target_year` | `number` |
| `source.mileage` | `#target_mileage` | `number` |
| `source.transmission` | `#target_transmission` | `select` |
| `source.fuel` | `#target_fuel` | `select` |
| `source.drivetrain` | `#target_drivetrain` | `select` |
| `source.bodyColour` | `#target_body_colour` | `text` |
| `source.condition` | `input[name="target_condition"]` | `radio` |
| `source.price` | `#target_price` | `number` |
| `source.dealerName` | `#target_dealer_name` | `text` |
| `source.dealerRating` | `#target_dealer_rating` | `number` |
| `source.location` | `#target_location` | `text` |
| `source.features` | `input[name="target_features[]"]` | `checkbox_group` |
| `source.description` | `#target_description` | `textarea` |
| `source.engineSize` | `#target_engine_capacity` | `text` |
| `source.VIN` | `#target_vin` | `text` |
| `source.serviceHistory` | `#target_service_history` | `select` |
| `source.sourceUrl` | `#target_source_url` | `url` |
