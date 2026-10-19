# Client Payment Tracker

Static website on GitHub Pages + Google Sheet as database + Apps Script as the API, with Google sign-in and role-based access.

## Setup — 10 minutes

### 1. Create the Google Sheet
1. Go to <https://sheets.new>, name it **Client Tracker**.
2. **Extensions → Apps Script**. Delete the default code, paste contents of `Code.gs`, save.
3. In the Apps Script editor, run the `setupSheets` function once (approve permissions). This creates the `Clients`, `Users`, and `Log` tabs.
4. Open the sheet. On the **Users** tab you'll see your own email with role `admin`. Add more rows for anyone else who should have access:
   - `Email` | `Role` (`admin` or `viewer`) | `Active` (`TRUE`)

### 2. Deploy the Apps Script as a Web App
1. In Apps Script: **Deploy → New deployment → Web app**.
2. **Execute as:** Me
3. **Who has access:** Anyone with a Google Account
4. Click **Deploy**, copy the **Web app URL**.

### 3. Wire up the website
1. Open `app.js`, replace `PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE` with the URL from step 2.
2. Commit all files to a GitHub repo.
3. In the repo: **Settings → Pages → Deploy from branch → main / root**. Wait a minute for the site to publish.

### 4. Use it
- Visit your GitHub Pages URL.
- Click **Open Tracker** — Google will ask you to sign in.
- You'll see the dashboard. Click any month cell to toggle paid/unpaid. Add clients with **+ Add Client**.

## Roles
- `admin` — can add clients, mark payments, edit, delete.
- `viewer` — read-only (future-proofed; UI currently just hides edit for them).

## Security notes
- Keep the sheet **private**. Only your Apps Script reads it.
- Only emails on the `Users` tab (with `Active = TRUE`) can access the API.
- The `Log` tab records every write (who, what, when).
- Don't commit the sheet or the Apps Script URL to a public repo if you want extra safety — use a private repo + a hosted static site (Netlify/Vercel) instead.

## Files
- `Code.gs` — Apps Script backend (deploy this inside the sheet).
- `index.html` / `style.css` / `app.js` — the website.

## Extending
- Add a `viewer` filter so clients can see only their own row by matching `Session.getActiveUser().getEmail()` to a `ClientEmail` column.
- Add SMS reminders via Twilio from a scheduled Apps Script trigger.
- Export a monthly PDF statement from a Google Doc template.
