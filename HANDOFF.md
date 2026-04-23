# xFix Receipts — Handoff

Standalone iOS receipt-capture app for your personal accounting. **No connections to xfix-mobile or KAI AI Bench.** Receipts live on-device; export to CSV when you want to hand them off.

## Stack

- **Expo SDK 54** + React Native 0.81 + TypeScript
- **Storage:** AsyncStorage (receipt metadata) + FileSystem (photos, in app documents directory)
- **Camera:** `expo-camera`
- **Export:** CSV via `expo-sharing` (opens iOS share sheet → email, Files, AirDrop, etc.)
- **Bundle id:** `io.xmotion.xfixreceipts`
- **Slug / EAS project:** `xfix-receipts`

## Running it locally (Expo Go)

From this folder:

```bash
npm install          # only needed once
npx expo start
```

Then press `s` to switch to Expo Go mode, scan the QR code with your iPhone camera (the Expo Go app must be installed from the App Store). The app hot-reloads as you edit source.

**Limitation in Expo Go:** the camera works; everything else works. No caveats for this app specifically.

## Project layout

```
App.tsx                    # root — StoreProvider + screen router
index.ts                   # Expo entry
app.json                   # bundle id, permissions, plugins
eas.json                   # build + submit config (below)
src/
  types.ts                 # Receipt, Entity, Category types
  theme.ts                 # colors, fonts, status meta
  data/
    entities.ts            # xFix / KAI / Personal books
    categories.ts          # GL categories + codes, payment methods, projects
    seed.ts                # one-time seed receipts for first launch
  lib/
    format.ts              # fmtMoney, fmtDate, uid, etc.
    photos.ts              # persist captured photos to FileSystem
    exportCsv.ts           # build CSV + open share sheet
  store/
    StoreContext.tsx       # React Context + useReducer + AsyncStorage persistence
  components/
    Icon.tsx               # maps design's icon names → Ionicons
    StatusChip.tsx
    ReceiptThumb.tsx
    ReceiptRow.tsx
    EntityBadge.tsx
    EntityPill.tsx
    EntitySwitcher.tsx     # bottom-sheet modal
    PickerSheet.tsx        # reusable picker for category/payment/project
  screens/
    HomeScreen.tsx
    CaptureScreen.tsx      # single receipt; expo-camera + persist + → Review
    BatchScreen.tsx        # multi-shot session; each capture creates a receipt
    ReviewScreen.tsx       # edit all fields, save or delete
    SyncScreen.tsx         # export CSV (the standalone version of "sync")
    ReportScreen.tsx       # monthly summary by category
```

## What's wired

| Feature | Status |
|---|---|
| Capture single photo → new receipt | ✅ |
| Capture batch photos → N receipts | ✅ |
| Photo persisted to app documents | ✅ |
| Edit vendor / total / date / category / project / payment / notes | ✅ |
| Save receipt → status becomes `ready` (or `needs-review` if required fields blank) | ✅ |
| Delete receipt (with confirmation, also deletes photo file) | ✅ |
| Three books (xFix, KAI, Personal) with per-book filtering | ✅ |
| Home summary: month total, status breakdown, recent list | ✅ |
| Report: category breakdown + receipt list | ✅ |
| Export CSV (opens iOS share sheet) | ✅ |
| Seed data on first launch so the app isn't empty | ✅ |
| Data persists across app restarts | ✅ |
| Camera permission prompt with friendly empty state | ✅ |
| Light haptics on capture / success | ✅ |

## What's explicitly NOT wired

- **OCR** — no automatic extraction of vendor/total from the photo. Fields are manual. Wire up `@react-native-ml-kit/text-recognition` or a cloud OCR later if you want auto-fill.
- **QuickBooks sync** — out of scope (standalone app). Export CSV and import to QB yourself.
- **Cloud backup** — receipts are local-only. If you uninstall the app, your data is gone. Export regularly.
- **Multi-device sync** — one device, one database.
- **Date picker UI** — date is a plain text input (YYYY-MM-DD). Add `@react-native-community/datetimepicker` later for polish.

## Icons & splash screen

Currently using Expo's default placeholder icons in `assets/`. To brand the app:

1. Create a `1024×1024` PNG icon → save as `assets/icon.png`.
2. Create a centered logo on transparent or solid background → save as `assets/splash-icon.png`.
3. For Android: `assets/adaptive-icon.png` (foreground layer, 1024×1024).
4. Run `npx expo prebuild --clean` if you want to regenerate native folders.

Icon colors already referenced in `app.json` splash:

```json
"backgroundColor": "#F2F2F7"
```

## TestFlight build

### One-time setup

1. **Install EAS CLI:**
   ```bash
   npm install -g eas-cli
   ```

2. **Log in to Expo** (free account if you don't have one):
   ```bash
   eas login
   ```

3. **Link this project to an EAS project:**
   ```bash
   eas init
   ```
   Accept the prompt to create a new project named `xfix-receipts`.

4. **Register the app in App Store Connect:**
   - Go to <https://appstoreconnect.apple.com>
   - My Apps → `+` → **New App**
   - Platform: iOS
   - Name: **xFix Receipts** (must be unique across App Store)
   - Primary Language: English (U.S.)
   - Bundle ID: select `io.xmotion.xfixreceipts` (create it first at <https://developer.apple.com/account/resources/identifiers/list> if needed — just enter the exact bundle id, no capabilities required beyond default)
   - SKU: `xfix-receipts-v1` (any unique string)
   - User Access: Full Access
   - Copy the **Apple ID** number shown on the app page (looks like `6747XXXXXX`) — that's your `ascAppId`.

5. **Update `eas.json`** with real values (currently has `REPLACE_WITH_*` placeholders):
   ```json
   "submit": {
     "production": {
       "ios": {
         "appleId": "thurstonadams@msn.com",
         "ascAppId": "6747XXXXXX",
         "appleTeamId": "XXXXXXXXXX"
       }
     }
   }
   ```
   Team ID is at <https://developer.apple.com/account> → Membership details.

### Build + submit

```bash
# Build the iOS binary in EAS's cloud (takes ~15 min). First run will ask to
# generate a distribution certificate and provisioning profile — say yes to all.
eas build --platform ios --profile production

# Once the build finishes, submit it to App Store Connect / TestFlight.
eas submit --platform ios --latest
```

Apple will take 10–60 min to process the build, then TestFlight shows it under
**TestFlight → iOS Builds**. Add yourself (and any testers) under **Internal
Testing**, and TestFlight on your phone will offer the install.

### Subsequent releases

Bump `buildNumber` in `app.json` (and/or `version`), then run the same build + submit commands again.

## Customizing per book

Book metadata lives in `src/data/entities.ts`. Edit the names, EINs, colors, badge letters directly — the app just reads that file.

Categories and payment methods are in `src/data/categories.ts`. Add your real accounts with their GL codes and the CSV export will include them.

## Data model

Receipts are stored as a JSON array under the AsyncStorage key
`@xfix-receipts:receipts:v1`. Each receipt:

```ts
{
  id: string;            // "r_<timestamp>_<rand>"
  entityId: string;      // 'xfix' | 'kai' | 'personal'
  vendor: string;
  date: string;          // 'YYYY-MM-DD'
  total: number;
  currency: string;      // 'USD'
  payment: string;       // e.g. "Visa •• 4821"
  category: string;
  categoryCode?: string; // e.g. '6220'
  project?: string;
  notes: string;
  status: 'needs-review' | 'ready' | 'synced' | 'processing';
  thumbTone: number;     // 0–360, decorative hue for placeholder
  photoUri?: string;     // file:// path in app documents
  createdAt: number;
  updatedAt: number;
}
```

Photos are stored at `<DocumentDirectory>/receipt-photos/<id>.jpg`.

To wipe everything and start fresh: uninstall the app, reinstall. Or add a "Clear all data" setting later.

## Quick smoke test

1. Launch in Expo Go.
2. Home screen: should show seed data (xFix book, ~3 receipts).
3. Tap **Scan** → grant camera permission → point at anything → tap shutter.
4. Review screen should appear with your photo. Fill vendor / total / category → **Save**.
5. Back on Home, new row shows "Ready to sync".
6. Tap the blue CTA at the bottom → Report → **Export CSV** → share sheet opens.
7. Switch book (tap the "BOOK · xFix" pill at the top) → KAI/Personal have their own seed receipts.
