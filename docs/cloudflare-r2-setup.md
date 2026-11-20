# Cloudflare R2 — file storage setup

All uploads on LogicMate (knowledge-base photos and PDF brochures, service
brochures, user documents and issued invoices) are stored in **Cloudflare R2**
through one backend endpoint, `POST /api/v1/uploads` (see "How uploads work"
at the end).

## The plan: 4 buckets, 2 environments

| Environment | Database | Public bucket (photos, brochures) | Private bucket (documents, invoices) | Public URL |
|---|---|---|---|---|
| **Local + Staging** | local MongoDB | `logicmate-dev-public` | `logicmate-dev-private` | the bucket's `r2.dev` URL |
| **Production** (logicmate.io) | prod MongoDB (Atlas) | `logicmate-prod-public` | `logicmate-prod-private` | `https://media.logicmate.io` |

- **Public bucket:** files anyone may see (they're shown to website visitors in
  the chat), served from a public URL.
- **Private bucket:** never public. Files are opened only through links that
  expire after 5 minutes, and only for their owner or an admin.
- Local and staging share the dev buckets, the same way they share the local
  database. Test files never mix with real customers' files.

Limits enforced by the backend: photos (JPG, PNG, WebP) up to **10 MB**, PDFs
up to **100 MB**. Per chatbot: Basic 100 photos + 20 PDFs, Pro 500 + 100.
No video uploads (link YouTube or a virtual tour instead).

---

## Step 1 — Turn on R2 (once)

1. Log in at **dash.cloudflare.com** (create a free account if you don't have one).
2. In the left menu, open **R2 Object Storage**.
3. Click **Purchase R2 Plan** / **Enable R2**. Cloudflare asks for a card even
   on the free tier (10 GB storage free per month; downloads are always free).
4. On the R2 overview page, copy your **Account ID** (right-hand side). You'll
   need it for both environments.

## Step 2 — Create the 4 buckets

R2 Object Storage → **Create bucket**, four times:

| Name | Location | Storage class |
|---|---|---|
| `logicmate-dev-public` | Automatic | Standard |
| `logicmate-dev-private` | Automatic | Standard |
| `logicmate-prod-public` | Automatic | Standard |
| `logicmate-prod-private` | Automatic | Standard |

(Optional: choose a location hint near most of your users, e.g. "Eastern Europe"
covers the Gulf and Europe well. Cloudflare serves files worldwide either way.)

## Step 3 — Make the public buckets reachable

### Dev public bucket → r2.dev URL (no domain needed)
1. Open `logicmate-dev-public` → **Settings** → **Public access** → **R2.dev subdomain** → **Allow access**.
2. Type `allow` to confirm.
3. Copy the URL it shows, e.g. `https://pub-1a2b3c4d5e.r2.dev`. That's your
   dev `R2_PUBLIC_URL`.

(The r2.dev URL is rate-limited and meant for development only. Don't use it
in production.)

### Prod public bucket → `media.logicmate.io`
logicmate.io's DNS is already on Cloudflare (Active, confirmed 2026-11-20), so
no nameserver change is needed. Connecting the subdomain adds one DNS record
for `media` only — email routing and the Resend records are not touched.

1. Open `logicmate-prod-public` → **Settings** → **Custom Domains** → **Connect Domain**.
2. Enter `media.logicmate.io` → **Continue** → **Connect domain**.
3. Wait until the status is **Active** (usually a few minutes).
4. Your prod `R2_PUBLIC_URL` is `https://media.logicmate.io`.

### Private buckets
Do nothing: leave public access **off** (the default) on both private buckets.

## Step 4 — CORS (lets the browser upload straight to R2)

For **each of the 4 buckets**: open the bucket → **Settings** → **CORS Policy**
→ **Add CORS policy** (or Edit) → paste the JSON → **Save**.

Dev buckets (`logicmate-dev-public`, `logicmate-dev-private`):
```json
[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```
When the staging site exists, add its address to `AllowedOrigins`, e.g.
`["http://localhost:3000", "https://staging.logicmate.io"]`.

Prod buckets (`logicmate-prod-public`, `logicmate-prod-private`):
```json
[
  {
    "AllowedOrigins": ["https://logicmate.io", "https://www.logicmate.io"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

## Step 5 — Create the access keys (one per environment)

R2 Object Storage → **Manage R2 API Tokens** (or **API** → **Manage API tokens**) → **Create API token**:

**Dev token**
- Token name: `logicmate-dev`
- Permissions: **Object Read & Write**
- Specify bucket(s): **Apply to specific buckets only** → `logicmate-dev-public`, `logicmate-dev-private`
- TTL: Forever → **Create API Token**

**Prod token**: same, named `logicmate-prod`, buckets `logicmate-prod-public`, `logicmate-prod-private`.

After each one, Cloudflare shows the **Access Key ID** and **Secret Access Key**
**only once**. Copy both straight into the env file / Railway (Step 6). Don't
paste them into chat, email or any file that's committed.

A dev key can't touch production files, and the other way round.

## Step 6 — Add the settings

### Local (and later staging): backend `.env`
```
R2_ACCOUNT_ID=<your account id>
R2_ACCESS_KEY_ID=<logicmate-dev access key id>
R2_SECRET_ACCESS_KEY=<logicmate-dev secret access key>
R2_PUBLIC_BUCKET=logicmate-dev-public
R2_PRIVATE_BUCKET=logicmate-dev-private
R2_PUBLIC_URL=https://pub-xxxxxxxx.r2.dev
```
Restart the backend (`npm run start:dev`).

### Staging (when you set it up)
The same six values as local, set in the staging host's environment settings.

### Production: Railway → backend service → **Variables**
```
R2_ACCOUNT_ID=<your account id>
R2_ACCESS_KEY_ID=<logicmate-prod access key id>
R2_SECRET_ACCESS_KEY=<logicmate-prod secret access key>
R2_PUBLIC_BUCKET=logicmate-prod-public
R2_PRIVATE_BUCKET=logicmate-prod-private
R2_PUBLIC_URL=https://media.logicmate.io
```
Railway redeploys automatically after you save.

The frontend (Vercel) needs **no** new settings: it only calls the backend.

Never set `R2_ENDPOINT` locally or in production. It exists only for the
automated tests, which use a fake local storage server.

## Step 7 — Check it works (each environment)

### Knowledge-base photos + brochure
1. Open any chatbot → **Knowledge Base** → **Add Knowledge**.
2. Under the link field you should see **Photos & brochure (optional) — 0/100
   photos · 0/20 PDFs on your plan**.
   If it says "uploads aren't set up on this server yet", one of the six
   settings is missing or misspelt. Check the backend env and restart it.
3. Add a question + answer, click **Add photos** (pick 1–2 images) and **Add
   PDF brochure**, then **Add Entry**.
4. In Cloudflare → the public bucket → **Objects**: you should see
   `chatbots/<chatbot id>/knowledge/…` files.
5. Ask that question in the website widget: the photos and the brochure link
   appear under the reply.
6. Delete the entry → the files disappear from the bucket.

### Documents
1. **Profile → Documents**: upload a file (photo or PDF), then click **View**
   — it opens in a new tab.
2. In the **private** bucket → **Objects**: `users/<user id>/documents/…`.
3. Delete it → the file disappears from the bucket.

### Invoices
After you next confirm a payment, the private bucket has
`invoices/<year>/LM-<year>-NNNN.pdf`, and the Billing tab's Invoice button
downloads that copy.

If the upload fails with a CORS error in the browser console, check Step 4
(exact site address in `AllowedOrigins`, no trailing slash).

## Step 8 — Move documents uploaded before R2 (once Step 7 works)
Documents uploaded before R2 sit on Vercel Blob at public URLs. Once the R2
settings are in place, copy them into the private bucket (run from the
backend folder, with that environment's `MONGODB_URI` and R2 settings in `.env`):
```bash
node --env-file=.env scripts/migrate-documents-to-r2.cjs            # dry run: lists what would move
node --env-file=.env scripts/migrate-documents-to-r2.cjs --apply    # copy + update the rows
node --env-file=.env scripts/migrate-documents-to-r2.cjs --apply --delete-blob  # also delete the Blob copies (needs BLOB_READ_WRITE_TOKEN)
```
Each moved row gets `storageKey` + `fileName` and loses `fileUrl`. Running it
again skips rows already moved.

---

## How uploads work (for developers)

1. The page calls `POST /api/v1/uploads` with a **purpose** and details:
   `{ purpose: "chatbot-knowledge", chatbotId, contentType, size, name }`.
2. The backend checks access, file type, size and plan limits for that purpose,
   picks the folder itself, and returns a signed URL (valid 10 minutes, bound to
   that exact type and size) plus the file `key`.
3. The browser `PUT`s the file straight to R2 (never through Railway).
4. The page saves the `key` on its record (e.g. a knowledge entry). The backend
   re-checks the file exists and belongs to that record's folder.

Other calls: `DELETE /uploads?purpose=&key=&…` removes an upload that was never
saved; `GET /uploads/file?purpose=&key=&…` returns a 5-minute link to a private file.

Purposes today (`src/modules/uploads/uploads.service.ts`):

| Purpose | Who | Bucket | Folder | Types |
|---|---|---|---|---|
| `chatbot-knowledge` | chatbot owner / admin | public | `chatbots/<id>/knowledge/` | photos + PDF |
| `service-brochure` | admin | public | `services/<slug>/brochures/` | PDF + photos |
| `user-document` | the user / admin | private | `users/<id>/documents/` | PDF + photos |

To add upload anywhere new: add a purpose there, then use the
`UploadButton` component (frontend `src/components/ui/upload-button.tsx`) or
call `POST /uploads` from the page. Files the server creates itself (e.g. invoice
PDFs) use `StorageService.putObject()`.

Invoices: when an admin confirms a payment the backend saves the PDF to the
private bucket as `invoices/<year>/<number>.pdf`; the Billing tab download
serves that copy.
