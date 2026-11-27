# Inventory Attendance – Android app for the attendance kiosk

The **Attendance Kiosk** screen (Attendance menu on the web) as an Android app, built with
[Capacitor](https://capacitorjs.com). The screens are the same code as the web
(`Frontend/src/pages/attendance/Kiosk.jsx`, with `KioskApp.jsx` for the app's login): a phone or tablet at the gate is
logged in once, and employees look at the front camera and blink to mark In / Out.

Why an app: phone browsers allow the camera only on **https** pages. Inside the app the page runs from the device
itself (`http://localhost`, which Android treats as secure), so the camera works while the server is plain
`http://nkgautogroup.com:8080`. The face models are inside the app, so they are not downloaded from the server.

| | |
|---|---|
| App name | Inventory Attendance |
| App id | `com.nkgautogroup.attendance` |
| Default server | `http://nkgautogroup.com:8080` (in `Frontend/.env.kiosk`). To change it on the device: on the login screen tap **Inventory Attendance** (under the Sign in button) 5 times, e.g. `http://192.168.3.24:8080` on office Wi-Fi |
| Login | A user with the **Attendance Kiosk** right (P0402), given in Users |
| Permissions | Internet, camera |
| Devices | Android 7.0 and newer, with a front camera; the screen is kept on while the kiosk is open |

## Build the APK

Same one-time setup as `DriverApp/README.md` (Android Studio, Node.js). Then from `AttendanceApp/`:

```
npm install       # first time only
npm run sync      # builds the kiosk from ../Frontend into www/ and copies it into the Android project
```

Then either `npm run open` and in Android Studio **Build → Build APK(s)**, or from the command line with `JAVA_HOME`
set to Android Studio's `jbr` folder: `android\gradlew.bat assembleDebug`.
The test APK is `android/app/build/outputs/apk/debug/app-debug.apk`.

For the APK to hand out, build a **signed release** as described in `DriverApp/README.md` (keep the key store safe
and outside git; every update must be signed with the same key).

## Set up a kiosk device

1. Install the APK (allow **Install unknown apps** when Android asks).
2. Open it, allow the **camera**, and log in with the kiosk user.
3. Leave it on the kiosk screen, plugged in. **Log out** (top right) asks before logging out.
   For a locked-down kiosk, Android's **App pinning** (Settings → Security → App pinning) keeps it on this app.

## Updating the app

Changes to the kiosk screen (`Frontend/src/pages/attendance/`) need a new APK: raise `versionCode` / `versionName`
in `android/app/build.gradle`, `npm run sync`, build and install over the old app. Server changes (matching limit,
API, office screens) need no new APK.
