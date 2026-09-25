# First release — <App name> <X.Y.Z>

Prepared by kartograph-release on <YYYY-MM-DD> from `distribution/first-release-check.sh
--version <X.Y.Z>`, the code and the files under `distribution/store/`.

- ✓ in place: read from the store, or set by the push after your yes from the file named
- ✗ missing: the line says where to set it
- ? no API can read it: you do it in the web UI, with the prepared answer

Do every ✗ and every ? under *Before your yes*, then answer the one question. The steps
under *After the release* come once the scripts have run.

## App Store — <platforms>

### Before your yes: in App Store Connect

| Gate | Mark | Prepared answer | Derived from |
|---|---|---|---|
| App Privacy (ASC18) | ? | <Data Not Collected, or per data type: collected, linked to the person, used for tracking, purpose> — then **Publish**; needs the Admin role | <dependency manifests, permissions and usage strings, privacy manifest read> |
| Price and availability | <✓ ✗ ?> | <price tier, countries and regions> | <what the code sells> |
| Agreements, tax, DAC7, trader status (ASC19) | ? | <paid apps agreement needed: yes or no> | <in-app purchases, subscriptions> |
| Version number (ASC29) | <✓ ✗> | <the editable version carries X.Y.Z> | first-release-check.sh |
| First review of in-app purchases and subscriptions (ASC23, ASC24) | <✓ ✗> | <product ids ticked on the version's page> | first-release-check.sh |

### Set by the push after your yes

| Gate | Mark | Value | File |
|---|---|---|---|
| Content rights (ASC17) | <✓ ✗> | <DOES_NOT_USE_THIRD_PARTY_CONTENT or USES_THIRD_PARTY_CONTENT> | `store/apple/app.json` |
| Uses the advertising identifier (ASC17) | <✓ ✗> | <true or false> | `store/apple/app.json` |
| Copyright (ASC17) | <✓ ✗> | <year and holder> | `store/apple/app.json` |
| Review contact and notes (ASC17) | <✓ ✗> | <name, email, phone, demo account needed> | `store/apple/app.json` |
| Category | <✓ ✗> | <primary, secondary> | `store/apple/app.json` |
| Age rating | <✓ ✗> | <the answers that are not NONE or false, else "none apply"> | `store/apple/app.json` |
| Texts per locale (ASC1, ASC32) | <✓ ✗> | <locales> | `store/apple/<locale>.json` |
| URLs answer 200 (ASC26) | <✓ ✗> | <privacy policy, support, marketing> | `store/apple/<locale>.json` |
| EULA link in the description (ASC25) | <✓ ✗ or "no subscription sold"> | <link> | `store/apple/<locale>.json` |
| Screenshots | <✓ ✗> | <display types, screens> | `store/apple/screenshots/` |

## Google Play

### Before your yes: in the Play Console

| Gate | Mark | Prepared answer | Derived from |
|---|---|---|---|
| Data safety (GP6) | ? | <no data collected or shared, or per data type: collected, shared, optional, purpose, encrypted in transit, deletion> | <dependency manifests, permissions, merged manifest> |
| Content rating, IARC (GP6) | ? | <category and the answers that are not "no"> | <what the features show> |
| Target audience and content (GP6) | ? | <age groups; appeals to children: yes or no> | <the intents and features> |
| Ads and Advertising ID (GP11) | ? | <contains ads: yes or no; AD_ID permission: yes or no> | <ad SDKs, the manifest> |
| App access (GP8) | ? | <every function without sign-in, or the reviewer's credentials> | <sign-in in the features> |
| Category (GP6) | ? | <app or game, category, tags> | <the intents> |
| Privacy policy (GP6) | <? ✗> | <the URL that answers 200> | <where the URL came from> |
| Production access | ? | <only when the Dashboard asks for it: a new personal developer account first runs a closed test> | Play Console → Dashboard |
| Icon and feature graphic | <✓ ✗> | <512 × 512 icon, 1024 × 500 graphic> | `store/play/screenshots/<locale>/icon/`, `featureGraphic/` |

### Set by the push after your yes

| Gate | Mark | Value | File |
|---|---|---|---|
| defaultLanguage (GP2) | <✓ ✗> | <the locale chosen> | `store/play/listing.json` |
| Contact email and website | <✓ ✗> | <email, website> | `store/play/listing.json` |
| Listing per locale | <✓ ✗> | <locales> | `store/play/listing.json` |
| Screenshots (GP5) | <✓ ✗> | <the App Store images> | `store/play/screenshots/` |

### After the release

| Step | Where |
|---|---|
| Choose the countries and regions and send the draft production release for review | Play Console → Publishing overview |
