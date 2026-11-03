# INV Utility – IIS deployment

How it runs on the server. Both parts are IIS sites, managed in IIS Manager:

| IIS site | Port | What it does |
|---|---|---|
| **InvUtility** | 8080 | Serves the React screens and forwards every `/api/...` call to InvUtilityApi. |
| **InvUtilityApi** | 5050 | The Node backend. IIS starts `node.exe` itself, through the HttpPlatformHandler module, and restarts it if it stops. |

Users open `http://<server-name>:8080`. You don't need a Windows service. To restart the backend, recycle the **InvUtilityApi** app pool.

## 1. Build the package (development machine)

```powershell
powershell -ExecutionPolicy Bypass -File deploy\build-package.ps1
```

This creates `publish\InvUtility.zip`. It includes `backend\.env` with the database password, so copy it only to the server.

## 2. One-time server prerequisites

Install these on the IIS server, in this order:

1. **IIS**, including "IIS Management Scripts and Tools" and "Application Initialization" (under Application Development).
2. **Node.js 22 LTS**: https://nodejs.org
3. **IIS URL Rewrite 2.1**: https://www.iis.net/downloads/microsoft/url-rewrite
4. **IIS Application Request Routing (ARR) 3.0**: https://www.iis.net/downloads/microsoft/application-request-routing
5. **IIS HttpPlatformHandler 1.2**: https://www.iis.net/downloads/microsoft/httpplatformhandler

The server must also be able to reach MySQL at `192.168.3.49:3306`, and `erp_user` must be allowed to log in from the server's IP.

## 3. Install or update (on the server)

Extract `InvUtility.zip`, open **PowerShell as Administrator** in the extracted `InvUtility` folder, and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-iis.ps1 -Port 8080
```

The script will:

- copy the files to `C:\inetpub\InvUtility`
- create both IIS sites and their app pools
- point the backend at this server's `node.exe`
- open the screens' port in Windows Firewall
- check that the API answers

To update later, build a new package and run the same command. The server's `backend\.env` is kept. If an older package installed the "InvUtility Backend" Windows service, the script removes it.

Optional parameters: `-Port`, `-ApiPort`, `-InstallDir`, `-SiteName`, `-ApiSiteName`.

## Data sync from the INV API

The backend on the server pulls data from `http://192.168.3.24/INVUtility/Service1.svc/getinvdata/...` on a schedule (India time):

| Job | When | Table |
|---|---|---|
| customer | every 30 minutes; keeps calling until the API returns no rows | `customer` |
| company | daily at 06:00 | `company` |
| branch | daily at 06:00 | `branch` |
| territory | daily at 06:00 | `territory` |
| route | daily at 06:00 | `route` |
| salesexecutive | daily at 06:00 | `salesexecutive` |
| salesdetails | every 30 minutes (one call; the API returns its current list each time) | `salesdetails` |

- **On restart:** if a job missed its time, for example because the server was off at 06:00, it runs a few seconds after the backend starts.
- **Run history:** each run is recorded in the `sync_log` table and shown at `http://localhost:5050/api/sync/log` on the server.
- **Failed rows:** a row that can't be saved goes to `sync_failed_row` with the error, so customer data the API has already handed out is never lost.
- **Running a job now:** use `Invoke-RestMethod -Method Post http://localhost:5050/api/sync/customer/run`, with another job name from the table above in place of `customer`.
- **Developer PCs:** the schedules run only where `SCHEDULER_ENABLED=true`. The IIS site sets this in `backend\web.config`; on developer PCs it's `false` in `.env`.

## Troubleshooting

- **Screens load but the menu or data is empty**:
  - Open `http://localhost:5050/api/health` on the server.
  - Read the Node logs in `C:\inetpub\InvUtility\backend\logs\`.
- **502.3 or 502.5 errors from InvUtilityApi**: Node failed to start or crashed. The reason is in the same logs folder. A common cause is that the server can't reach MySQL.
- **502 or "URL Rewrite" errors on InvUtility**: ARR is not installed, or its proxy is disabled.
- **Changing the database**:
  1. Edit `C:\inetpub\InvUtility\backend\.env`.
  2. Recycle the **InvUtilityApi** app pool.
- **Updating Node.js**: re-run `setup-iis.ps1`. The backend's `web.config` stores the full path to `node.exe`.
