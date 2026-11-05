# Inventory Delivery – Android app for drivers

The driver delivery page (`/driver` on the web) as an Android app, built with [Capacitor](https://capacitorjs.com).
The screens are the same code as the web page (`Frontend/src/pages/driver/DriverApp.jsx`): log in with the
mobile number and the trip sheet's driver code, see the trip's customers and bills, scan the QR code or
**Mark delivered**.

Why an app: phone browsers allow the camera and the location only on **https** pages. Inside the app the page
runs from the phone itself (`http://localhost`, which Android treats as secure), so live QR scanning and GPS
work even while the server is plain `http://nkgautogroup.com:8080`.

| | |
|---|---|
| App name | Inventory Delivery |
| App id | `com.nkgautogroup.delivery` |
| Default server | `http://nkgautogroup.com:8080` (in `Frontend/.env.driver`; the driver can change it on the login screen, e.g. `http://192.168.3.24:8080` on office Wi-Fi) |
| Permissions | Internet, camera (QR scan), location (saved with each delivery) |
| Phones | Android 7.0 and newer |

## One-time setup on the PC that builds the APK

1. Install **Android Studio** (free): https://developer.android.com/studio — it brings the Android SDK and Java.
2. Open Android Studio once and let it finish downloading the SDK (More Actions → SDK Manager: Android 16 / API 36;
   the first build also downloads what it is missing).
3. Install **Node.js 22 LTS** if it isn't there.
4. In this folder: `npm install` (and `npm install` in `../Frontend` if not done).

## Build the APK

The project uses Capacitor 8, the Android Gradle plugin 8.13 and Gradle 9.1 (`android/gradle/wrapper`), which runs
on the Java 25 that comes with Android Studio. From the command line, set `JAVA_HOME` to Android Studio's `jbr`
folder, e.g. `C:\Program Files\Android\Android Studio\jbr`, then run `android\gradlew.bat assembleDebug`.

From `DriverApp/`:

```
npm run sync      # builds the driver page from ../Frontend into www/ and copies it into the Android project
npm run open      # opens the Android project in Android Studio
```

In Android Studio:

- **Quick test APK:** Build → Build App Bundle(s) / APK(s) → **Build APK(s)**.
  The file is `android/app/build/outputs/apk/debug/app-debug.apk`.
- **APK to give the drivers:** Build → **Generate Signed App Bundle / APK** → APK → create a *key store* the first
  time (keep the `.jks` file and its passwords safe and **outside git** — every later update must be signed with
  the same key, or phones refuse to install it over the old app) → release.
  The file is `android/app/release/app-release.apk`.

## Install on a driver's phone

Send the APK (WhatsApp, email, USB). On the phone open it, allow **Install unknown apps** for that app when Android
asks, and install. On first use the app asks for camera and location permission — tap **Allow**.

## Updating the app

Changes to the driver screens (in `Frontend/src/pages/driver/`) need a new APK:

1. Raise `versionCode` (by 1) and `versionName` in `android/app/build.gradle`.
2. `npm run sync`, then build the signed APK again with the **same key store**.
3. Install it over the old app on each phone.

Changes on the server (API, office screens) need no new APK.
