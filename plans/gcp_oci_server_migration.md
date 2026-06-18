# GCP → OCI migration guide (Django stack, e2-micro → Ampere A1)

This document walks through migrating the Autosage Django control plane (django
+ celery worker + celery beat + scheduler worker) off the GCP **e2-micro**
Always-Free VM and onto an OCI **Ampere A1** Always-Free VM. The motivation,
trade-offs, and target architecture are summarised below; the rest of the
document is a step-by-step playbook you run **on a fresh A1 VM**.

After you finish Step 14 the VM is permanently configured, and from then on
every `git push` to `main` (with changes under `server/`,
`docker-compose.oci.yml`, `nginx/**`, or the workflow file itself) will deploy
automatically.

## Why migrate

- **CPU/RAM headroom.** GCP e2-micro = 0.25 vCPU burst / 1 GB RAM. Once
  workflow execution was folded in (Celery worker + Beat + scheduler worker
  alongside the SSE-streaming Django process), the box was choking under load.
  OCI Ampere A1's Always-Free quota is 4 OCPU / 24 GB across instances —
  comfortably more than enough.
- **ARM (aarch64) build target.** A1 is ARM64. The existing CI workflow
  built `linux/amd64` images; this guide switches it to `linux/arm64` via
  buildx + QEMU.
- **HTTPS for Firebase frontend.** Firebase Hosting refuses `http://`
  origins (mixed-content blocking). On GCP we ran nginx + a self-signed
  cert. On A1 we run nginx in the same `docker compose` stack with a real
  Let's Encrypt cert via certbot, against a free **DuckDNS** subdomain
  pointed at the A1 public IP.
- **Cost.** Both platforms are free at the quota involved; this is a
  performance/headroom move, not a cost move.

## Out-of-scope

- `exec-worker` (FastAPI) stays on Cloud Run — its `cloudbuild.yaml`-driven
  CI is unchanged and its `EXEC_WORKER_URL` continues to be the OIDC-secured
  Cloud Run service URL.
- Supabase Postgres, Upstash Redis, Clerk, GCS buckets — none of those move.

> **What you should already have**
> - An A1 Ubuntu 22.04 (aarch64) shape provisioned in OCI Console.
> - A **reserved public IP** assigned to it (not ephemeral — otherwise the
>   IP changes on every stop/start and you'd have to re-update DuckDNS).
> - SSH access to the VM as user `ubuntu` (default for OCI Ubuntu images).
> - The same Supabase Postgres, Upstash Redis, and GCS bucket access keys
>   you were using on the GCP VM.
> - The GCS service-account JSON file on your laptop (the one mounted as
>   `gcs_key.json` on the old box).
> - The complete `.env.server` from the old box on your laptop.

---

## Step 1 — Open ingress ports in OCI Console

Open the OCI Console → **Networking → Virtual Cloud Networks → (your VCN) →
Security Lists → (the default subnet's security list)**, and add two
**Ingress Rules**:

| Source CIDR | IP Protocol | Source Port | Destination Port |
|---|---|---|---|
| `0.0.0.0/0` | TCP | All | `80`  |
| `0.0.0.0/0` | TCP | All | `443` |

(Port `22` is already open since you can SSH in.)

If you are using a Network Security Group (NSG) instead of/in addition to a
Security List, mirror the two rules there too.

---

## Step 2 — Update the VM and install Docker Engine

SSH to the VM and run:

```bash
ssh ubuntu@<A1-public-ip>
```

```bash
# Update base packages
sudo apt-get update
sudo apt-get -y upgrade

# Helper packages
sudo apt-get install -y ca-certificates curl gnupg lsb-release jq

# Docker apt repo
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Docker + buildx + compose plugin
sudo apt-get update
sudo apt-get install -y \
  docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

# Run docker without sudo
sudo usermod -aG docker ubuntu

# Re-open the SSH session so the new group membership applies
exit
```

Re-SSH back in:

```bash
ssh ubuntu@<A1-public-ip>
docker version              # should print Client + Server
docker compose version      # should print "Docker Compose version v2.x"
```

---

## Step 3 — Open host-firewall ports (iptables)

OCI's Ubuntu images ship with an iptables INPUT chain that blocks everything
except port 22. Open 80 and 443:

```bash
# Insert rules ahead of the catch-all REJECT (position 6 by default)
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80  -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT

# Persist across reboots
sudo apt-get install -y iptables-persistent netfilter-persistent
sudo netfilter-persistent save
```

Verify:

```bash
sudo iptables -L INPUT -n --line-numbers | grep -E '80|443'
```

You should see two `ACCEPT` lines for `dpt:80` and `dpt:443` **above** the
final REJECT rule.

---

## Step 4 — Create the host directory layout

```bash
mkdir -p ~/autosage-server/nginx
chmod 750 ~/autosage-server
```

Final layout (will be populated in the next steps):

```
/home/ubuntu/autosage-server/
├── server.env                  # secrets (chmod 600)
├── gcs_key.json                # GCS SA key (chmod 600)
├── docker-compose.oci.yml      # scp'd from repo
└── nginx/
    ├── autosage.conf           # scp'd from repo (TLS, contains your domain)
    ├── autosage-bootstrap.conf # scp'd from repo (HTTP-only)
    └── active.conf             # copy of whichever of the two is currently active
```

---

## Step 5 — Register a DuckDNS subdomain

1. Open **https://www.duckdns.org** in a browser, sign in with GitHub.
2. Pick a subdomain (e.g. `autosage-api`). Full hostname will be
   `autosage-api.duckdns.org`.
3. In the DuckDNS dashboard, set its **current ip** field to your A1 public IP.
4. **Copy your DuckDNS token** from the top of the page — you'll need it for
   the optional updater cron in Step 13.

Verify from the VM:

```bash
getent hosts autosage-api.duckdns.org
# → <your-A1-public-ip>   autosage-api.duckdns.org
```

If you don't see the public IP, wait a minute and retry — DuckDNS updates
within ~60 seconds.

---

## Step 6 — Place `server.env` on the VM

From your **laptop** (PowerShell), build the env file. Easiest path: open the
old `.env.server`, copy it to a fresh file, edit the host/CORS lines, then
**escape every `$` as `$$`** (see the warning below).

> ### ⚠️ Critical: escape every `$` in env values as `$$`
> Docker Compose interpolates `$variable` patterns in env-file values **before**
> passing them to the container. If you have a value like
> `SECRET_KEY=abc$icgjfcn123` it will be passed to Django as `abc123` (silently
> stripped). To preserve the literal `$`, **double it**: `abc$$icgjfcn123`.
> Compose un-escapes `$$` back to `$` before the container sees it.

On your laptop, create `server.env` with content like this (replace placeholders):

```dotenv
# ── Django core ──────────────────────────────────────────────────────────────
SECRET_KEY=<paste from old env — remember to double every $>
DEBUG=False
ENVIRONMENT=PROD

# CHANGED: include your DuckDNS hostname here
ALLOWED_HOSTS=autosage-api.duckdns.org,localhost,127.0.0.1

# CHANGED: include the frontend Firebase origin AND the DuckDNS origin
CORS_ALLOWED_ORIGINS=https://autosagex.web.app,https://autosage-api.duckdns.org

FRONTEND_URL=https://autosagex.web.app

# ── Database / Cache / Broker ────────────────────────────────────────────────
DATABASE_URL=<Supabase Postgres conn string — double every $ in the password>
CELERY_BROKER_URL=<Upstash Redis URL — double every $>
CELERY_RESULT_BACKEND=<same as CELERY_BROKER_URL>

# ── Vault encryption ─────────────────────────────────────────────────────────
VAULT_ENCRYPTION_KEY=<paste from old env — double every $>

# ── Clerk ────────────────────────────────────────────────────────────────────
CLERK_PUBLISHABLE_KEY=<paste from old env — double every $>
CLERK_SECRET_KEY=<paste from old env — double every $>

# ── Exec-worker (Cloud Run) ──────────────────────────────────────────────────
EXEC_WORKER_URL=<paste from old env>
EXEC_WORKER_URL_EMAIL=<paste from old env>
WORKER_API_KEY=<paste from old env — double every $>
EXEC_WORKER_AUDIENCE=<paste from old env>

# ── GCS — path INSIDE the container (the gcs_key.json bind mount) ────────────
GOOGLE_APPLICATION_CREDENTIALS=/app/creds/service-account.json

# ── Email (Gmail SMTP for workflow completion notifications) ─────────────────
GMAIL_USERNAME=<paste from old env>
GMAIL_APP_PASSWORD=<paste from old env — double every $>
```

Scp to the VM:

```powershell
# From your Windows laptop (PowerShell). Replace paths/IP as needed.
scp .\server.env  ubuntu@<A1-public-ip>:/home/ubuntu/autosage-server/server.env
scp .\gcs-key.json ubuntu@<A1-public-ip>:/home/ubuntu/autosage-server/gcs_key.json
```

> **Note**: the file on the VM **must** be named `gcs_key.json` (underscore),
> not `gcs-key.json` — `docker-compose.oci.yml` references it by that name.

Back on the VM, tighten permissions and verify `$` escaping:

```bash
chmod 600 ~/autosage-server/server.env ~/autosage-server/gcs_key.json
ls -l  ~/autosage-server/server.env  ~/autosage-server/gcs_key.json
# Both should show: -rw------- 1 ubuntu ubuntu ...

# Sanity check: every `$` should appear doubled as `$$`.
grep -nE '(^|[^$])\$([^$]|$)' ~/autosage-server/server.env
# This regex matches an UNESCAPED `$`. The output should be EMPTY.
# If anything prints, those lines need the `$` doubled to `$$`.
```

---

## Step 7 — Copy the compose + nginx configs from the repo to the VM

You haven't pushed yet, so the GitHub workflow hasn't run. Either:

**Option A — scp from your laptop** (recommended, no git on the VM):

```powershell
# From your laptop, in the autogen/ repo root:
scp docker-compose.oci.yml          ubuntu@<A1-public-ip>:/home/ubuntu/autosage-server/
scp nginx\autosage.conf             ubuntu@<A1-public-ip>:/home/ubuntu/autosage-server/nginx/
scp nginx\autosage-bootstrap.conf   ubuntu@<A1-public-ip>:/home/ubuntu/autosage-server/nginx/
```

**Option B — clone the repo on the VM** (if you'd rather):

```bash
sudo apt-get install -y git
cd ~
git clone https://github.com/lagnajit09/autosage.git autogen
cp autogen/docker-compose.oci.yml    ~/autosage-server/
cp autogen/nginx/autosage.conf       ~/autosage-server/nginx/
cp autogen/nginx/autosage-bootstrap.conf ~/autosage-server/nginx/
```

---

## Step 8 — Substitute the DuckDNS hostname into `nginx/autosage.conf`

`nginx/autosage.conf` ships with a placeholder `__DUCKDNS_DOMAIN__`. The
GitHub Actions workflow substitutes it automatically on every deploy, but for
the **first-time manual bootstrap** we need to do it once by hand:

```bash
cd ~/autosage-server
DUCKDNS_DOMAIN=autosage-api.duckdns.org    # ← replace with YOUR subdomain
sed -i "s/__DUCKDNS_DOMAIN__/${DUCKDNS_DOMAIN}/g" nginx/autosage.conf

# Sanity-check — should print 4 lines (server_name × 2 + ssl_certificate × 2)
grep -nE "server_name|ssl_certificate" nginx/autosage.conf
```

---

## Step 9 — Bootstrap the Let's Encrypt certificate (HTTP-only, do NOT swap yet)

This is the chicken-and-egg step: `autosage.conf` references `django:8000` as
an upstream and won't reload until the django container is in the docker
network. The django container won't exist until the **first GitHub Actions
push** builds and uploads the arm64 image to GHCR. So during this manual
bootstrap we only obtain the cert; the swap to TLS config happens
**automatically** during the first push.

```bash
cd ~/autosage-server

# 1. Seed active.conf with the HTTP-only bootstrap config
cp nginx/autosage-bootstrap.conf nginx/active.conf

# 2. Start ONLY nginx. --no-deps skips django/celery/beat (their image
#    isn't built yet). nginx pulls nginx:1.27-alpine directly from Docker
#    Hub — no GHCR auth needed here.
docker compose -f docker-compose.oci.yml up -d --no-deps nginx

# 3. Verify nginx is reachable from the public internet on port 80.
#    Expect HTTP/1.1 503 — that means the bootstrap config is serving
#    correctly and the ACME http-01 path is open.
curl -I "http://${DUCKDNS_DOMAIN}/"
# → HTTP/1.1 503 Service Temporarily Unavailable
# If you get "Connection refused" or a timeout, recheck steps 1 + 3.

# 4. Obtain the cert via the certbot one-shot service.
#    Replace the email with a real address Let's Encrypt can reach.
docker compose -f docker-compose.oci.yml run --rm certbot \
  certonly --webroot -w /var/www/certbot \
  -d "${DUCKDNS_DOMAIN}" \
  --email you@example.com \
  --agree-tos \
  --no-eff-email
# Expect "Successfully received certificate." at the end.

# 5. STOP HERE. Do NOT swap active.conf to autosage.conf yet.
#    Reason: autosage.conf references `django:8000` as the upstream.
#    Only the nginx container is currently in autosage-net (we used
#    --no-deps because the django image isn't built yet), so a swap right
#    now would cause `nginx -t` to fail with
#    "host not found in upstream 'django'".
#    The first GitHub Actions deploy (Step 14) brings up django + workers
#    AND swaps active.conf in the right order, automatically.
```

Quick sanity check before moving on — confirm the cert files now exist in the named volume:

```bash
docker compose -f docker-compose.oci.yml run --rm --entrypoint sh certbot \
  -c "ls /etc/letsencrypt/live/${DUCKDNS_DOMAIN}/"
# Expect: cert.pem  chain.pem  fullchain.pem  privkey.pem  README
```

If for any reason you already ran `cp nginx/autosage.conf nginx/active.conf`
and your `nginx -t` is now failing with `host not found in upstream "django"`,
**revert it** before continuing:

```bash
cp nginx/autosage-bootstrap.conf nginx/active.conf
docker compose -f docker-compose.oci.yml exec -T nginx nginx -s reload
```

---

## Step 10 — Verify TLS plumbing

You can't fully validate HTTPS until after Step 14, because nginx is still on
the bootstrap config. What you **can** verify now:

```bash
# Port 80 is open and bootstrap config is serving
curl -I "http://${DUCKDNS_DOMAIN}/"
# → HTTP/1.1 503 Service Temporarily Unavailable

# Cert files exist in the named volume
docker compose -f docker-compose.oci.yml run --rm --entrypoint sh certbot \
  -c "openssl x509 -in /etc/letsencrypt/live/${DUCKDNS_DOMAIN}/fullchain.pem -noout -issuer -subject -dates"
# issuer=  C = US, O = Let's Encrypt, CN = R10 (or similar)
# subject= CN = autosage-api.duckdns.org
# notBefore=...
# notAfter= ~90 days from today
```

Full HTTPS verification comes in the **Verification checklist** at the end of
this doc, after the first GitHub Actions deploy finishes.

---

## Step 11 — Add GitHub repository secrets

Open **GitHub → your repo → Settings → Secrets and variables → Actions → New
repository secret**, and add:

| Secret name | Value |
|---|---|
| `VM_HOST` | `<A1 public IP>` (or `autosage-api.duckdns.org`) |
| `VM_USER` | `ubuntu` |
| `VM_SSH_KEY` | Full contents of the **private key** that authenticates as `ubuntu` on the VM (see below) |
| `VM_SSH_PORT` | `22` |
| `DUCKDNS_DOMAIN` | `autosage-api.duckdns.org` (no scheme, no trailing slash) |
| `GHCR_PAT` | (already exists — leave as is) |

### `VM_SSH_KEY` — what exactly to paste

This is the **private** half of the keypair you use to SSH into the VM —
the same file you point `ssh -i ...` at from your laptop. **Paste the entire
file contents**, including the header/footer lines. No transformation, no
quoting, no base64.

On your Windows laptop the file is typically one of:

```
C:\Users\<you>\.ssh\id_ed25519
C:\Users\<you>\.ssh\id_rsa
C:\Users\<you>\.ssh\ssh-key-<date>.key       ← OCI's default-generated keypair
```

Inspect what you have, then copy it to clipboard:

```powershell
dir $HOME\.ssh\
Get-Content $HOME\.ssh\<your-key-filename> | Set-Clipboard
```

The pasted value must look like one of these (header AND footer are required):

```
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW...
-----END OPENSSH PRIVATE KEY-----
```

```
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAvxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx...
-----END RSA PRIVATE KEY-----
```

### Three gotchas

1. **Wrong half.** If your file ends in `.pub`, that's the *public* key —
   don't paste it. The private key has no extension or `.key` / `.pem`.
2. **Passphrase-protected key.** GitHub Actions can't unlock interactively.
   Either remove the passphrase:
   ```powershell
   ssh-keygen -p -f $HOME\.ssh\<your-key-filename>
   # Old passphrase: <type yours>
   # New passphrase: <press Enter for empty>
   # Confirm: <press Enter>
   ```
   Or generate a dedicated CI-only key (recommended — keeps your laptop key
   passphrased):
   ```powershell
   ssh-keygen -t ed25519 -N '""' -f $HOME\.ssh\autosage-ci -C "github-actions-deploy"
   scp $HOME\.ssh\autosage-ci.pub ubuntu@autosage-api.duckdns.org:~/.ssh/autosage-ci.pub
   ssh ubuntu@autosage-api.duckdns.org "cat ~/.ssh/autosage-ci.pub >> ~/.ssh/authorized_keys && rm ~/.ssh/autosage-ci.pub"
   # Paste the contents of $HOME\.ssh\autosage-ci (no .pub) into VM_SSH_KEY.
   ```
3. **Don't paste the OCI Console's "Copy SSH command" string.** That's the
   connection string, not the key.

### Sanity check before saving the secret

Test from your laptop with exactly the key file you'll paste:

```powershell
ssh -i $HOME\.ssh\<your-key-filename> ubuntu@autosage-api.duckdns.org "whoami && hostname"
```

Should print `ubuntu` and the VM hostname **without** prompting for a
passphrase or password. If it does, that file's contents are what goes into
`VM_SSH_KEY`.

---

## Step 12 — Set up the cert-renewal cron

Let's Encrypt certs expire after 90 days. certbot renews them when ≤30 days
remain. Schedule a daily check at 03:17 (off-peak):

```bash
crontab -e
```

Append this single line (replace the path if your home isn't `/home/ubuntu`):

```
17 3 * * * cd /home/ubuntu/autosage-server && /usr/bin/docker compose -f docker-compose.oci.yml run --rm certbot renew --quiet && /usr/bin/docker compose -f docker-compose.oci.yml exec -T nginx nginx -s reload >> /home/ubuntu/autosage-server/certbot.log 2>&1
```

Confirm it's installed:

```bash
crontab -l | grep certbot
```

Test the renewal flow without actually renewing:

```bash
cd ~/autosage-server
docker compose -f docker-compose.oci.yml run --rm certbot renew --dry-run
# → "Congratulations, all simulated renewals succeeded"
```

---

## Step 13 — (Optional) DuckDNS IP-updater cron

If your A1 IP is **reserved** (recommended), you can skip this — the IP never
changes. If your IP is **ephemeral**, add a 5-minute cron that pushes the
current IP to DuckDNS so the hostname tracks any IP change:

```bash
crontab -e
```

Add (replace the token with the one from Step 5):

```
*/5 * * * * curl -s "https://www.duckdns.org/update?domains=autosage-api&token=YOUR_DUCKDNS_TOKEN&ip=" >/dev/null 2>&1
```

Empty `ip=` makes DuckDNS auto-detect the source IP of the request, which is
your VM's outbound public IP.

---

## Pre-flight checklist before pushing

These three checks catch the failure modes that bit me during the actual
migration. Run them in order on the VM before triggering the first deploy.

### 1. `active.conf` is the bootstrap config (not the TLS one)

```bash
cd ~/autosage-server
grep -E "server_name|listen" nginx/active.conf
```

Expected (bootstrap mode):
```
listen      80 default_server;
listen      [::]:80 default_server;
server_name _;
```

If you instead see `listen 443 ssl` / `server_name autosage-api.duckdns.org`,
you swapped it too early. Revert:

```bash
cp nginx/autosage-bootstrap.conf nginx/active.conf
docker compose -f docker-compose.oci.yml exec -T nginx nginx -s reload
```

### 2. No unescaped `$` in `server.env`

```bash
grep -nE '(^|[^$])\$([^$]|$)' ~/autosage-server/server.env
```

**Expected output: nothing (empty).** Any printed line is a value that needs
its `$` doubled to `$$`. Compose silently strips `$<word>` patterns before
passing them to the container — left unfixed, Django/Celery/Clerk will get
mangled secrets and the workflow may deploy "successfully" but the app will
fail to authenticate or connect to the database.

### 3. GitHub secrets in place

```powershell
# From your laptop — confirms the same SSH key authenticates non-interactively
ssh -i $HOME\.ssh\<your-key-filename> ubuntu@autosage-api.duckdns.org "echo OK"
```

If that prints `OK` without a passphrase prompt, the key file in
`VM_SSH_KEY` is correct. Confirm `VM_HOST`, `VM_USER`, `VM_SSH_PORT`, and
`DUCKDNS_DOMAIN` are also set in the repo secrets UI.

---

## Step 13.5 — One Django code change: trust `X-Forwarded-Proto`

The new architecture puts nginx in front of Django and proxies in plain HTTP
over the internal docker bridge. By default Django's `request.scheme` is
`http`, so `request.build_absolute_uri()` returns `http://...` URLs in API
responses — most visibly the **HTTP-trigger URL** shown to the user in the
trigger config modal, and the `polling_url` returned by the public HTTP
trigger endpoint.

nginx is already forwarding the real scheme via `X-Forwarded-Proto: $scheme`
(see [nginx/autosage.conf](nginx/autosage.conf)), but Django won't trust the
header without an explicit opt-in. Add this one line to
[server/server/settings.py](server/server/settings.py), near `ALLOWED_HOSTS`:

```python
# We sit behind nginx, which terminates TLS and proxies to us in plain HTTP
# on the internal docker bridge. Trust nginx's X-Forwarded-Proto header so
# Django knows the original request was HTTPS — this fixes request.scheme,
# request.is_secure(), and `request.build_absolute_uri()`-derived URLs
# (e.g. trigger_url, polling_url) returning `http://...` instead of
# `https://...`. Only safe because nginx is the sole ingress and
# unconditionally sets the header on every proxied request.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
```

> **Security note.** This setting is dangerous when Django can be reached
> directly bypassing nginx, because a client could spoof the header. In our
> compose setup, Django uses `expose: ["8000"]` only (no host port mapping),
> the OCI VCN exposes only 22/80/443, and nginx is the sole ingress — so
> spoofing is not possible.

---

## Step 14 — Commit and push the new workflow + compose + nginx files

You're now ready to push. On your laptop:

```powershell
git add `
  docker-compose.oci.yml `
  nginx/autosage.conf `
  nginx/autosage-bootstrap.conf `
  .github/workflows/deploy-server.yml `
  server/server/settings.py `
  gcp-to-oci-migration.md
git commit -m "ci: migrate Django deploy to OCI Ampere A1 with nginx + Let's Encrypt"
git push origin main
```

The push triggers **Build and Deploy Server** in GitHub Actions:

1. `build-and-push` — builds a `linux/arm64` image, pushes to
   `ghcr.io/lagnajit09/autosage/autosage-server:latest`.
2. `deploy` —
   1. Substitutes `__DUCKDNS_DOMAIN__` from the `DUCKDNS_DOMAIN` secret.
   2. scp's the three files to the VM (overwriting your manual scp from Step 7).
   3. `docker compose pull` (now finds the arm64 image you just built).
   4. `docker compose up -d --remove-orphans` — brings up **all** services:
      django, celery, beat, scheduler-worker, nginx. django is now in the
      `autosage-net` bridge, so its DNS name resolves.
   5. Cert-presence check passes → `cp nginx/autosage.conf nginx/active.conf`
      → `nginx -t` (succeeds — django is reachable + cert files exist) →
      `nginx -s reload`. **This is the deferred TLS swap from Step 9.**
3. `health-check` — verifies both the internal Django health endpoint and
   the public `https://<duckdns>/api/health/`.

Watch progress in **GitHub → Actions → Build and Deploy Server**.

---

## Step 15 — Update the Firebase frontend's API base URL

The React client reads its backend URL from the `VITE_API_URL` Vite env var
(see [client/src/lib/api-client.ts](client/src/lib/api-client.ts#L4)). Update
the value wherever it's set for production builds — typically the
`VITE_API_URL` GitHub Secret consumed by the firebase-hosting workflow
(`.github/workflows/firebase-hosting.yml`) — and change it from the old GCP
nginx hostname to:

```
https://autosage-api.duckdns.org
```

Rebuild and redeploy the frontend (`firebase deploy --only hosting` after
`npm run build`).

---

## Post-deploy verification

Run these in order after the workflow turns green. The first two are
must-pass; the rest catch silent regressions.

### From your laptop

```powershell
# 1. HTTPS health endpoint returns Django JSON (intentionally unauthenticated)
curl.exe -sS https://autosage-api.duckdns.org/api/health/
# → {"status":"healthy","service":"main-server","version":"1.0.0",...}

# 2. Cert is real Let's Encrypt
echo | openssl s_client -connect autosage-api.duckdns.org:443 -servername autosage-api.duckdns.org 2>$null | openssl x509 -noout -issuer -subject -dates
# issuer should mention "Let's Encrypt"
# notAfter should be ~90 days out

# 3. Authenticated endpoint correctly demands auth
curl.exe -sS https://autosage-api.duckdns.org/api/workflows/
# → {"success":false,"status_code":401,"message":"Authentication required..."}
```

### On the VM

```bash
cd ~/autosage-server

# 4. All 5 containers up; django additionally "healthy"
docker compose -f docker-compose.oci.yml ps

# 5. active.conf was promoted from bootstrap to TLS during deploy
grep -E "server_name|ssl_certificate" nginx/active.conf | head -4
# Expect 4 lines all referencing autosage-api.duckdns.org

# 6. No startup errors in any service
docker compose -f docker-compose.oci.yml logs --tail=30 django
docker compose -f docker-compose.oci.yml logs --tail=30 celery
docker compose -f docker-compose.oci.yml logs --tail=30 beat
docker compose -f docker-compose.oci.yml logs --tail=30 scheduler-worker
docker compose -f docker-compose.oci.yml logs --tail=30 nginx
# nginx must have NO [emerg] lines. django should show Uvicorn startup
# and post-migrate messages. celery/beat/scheduler-worker should show
# "celery@... ready." lines.

# 7. Cert-renewal dry-run (proves the cron will work in 60 days)
docker compose -f docker-compose.oci.yml run --rm certbot renew --dry-run
# → "Congratulations, all simulated renewals succeeded"
```

### In the React frontend (after Step 15)

8. Open the deployed app, sign in via Clerk, list workflows. DevTools →
   Network: all `/api/...` requests go to `https://autosage-api.duckdns.org`,
   return 200 with valid JSON. DevTools → Console: no `Mixed Content` errors,
   no `CORS` errors. If you see CORS errors, your `CORS_ALLOWED_ORIGINS` in
   `server.env` is missing the Firebase hosting URL — fix it and
   `docker compose -f docker-compose.oci.yml up -d --force-recreate django`.

9. **SSE log streaming.** Trigger a workflow run. In DevTools → Network,
   find `/api/execution-engine/workflows/runs/<id>/stream/`:
   - Type column says `eventsource`.
   - The request **stays open** (pending) while the workflow runs.
   - The EventStream sub-tab shows events arriving incrementally
     (`node_start`, `log`, `node_complete`, `done`) — NOT all dumped at the
     end. If events bulk-dump at the end, nginx buffering is on; verify
     `proxy_buffering off;` is present:
     `docker compose -f docker-compose.oci.yml exec nginx grep proxy_buffering /etc/nginx/conf.d/default.conf`.

10. **Cron-fired workflows.** In the UI, edit a workflow's trigger to a
    schedule (`*/2 * * * *`) firing 1–2 min in the future. Tail logs:
    ```bash
    docker compose -f ~/autosage-server/docker-compose.oci.yml logs -f scheduler-worker beat celery
    ```
    - `beat` shows `Scheduler: Sending due task workflow-schedule:...`
    - `scheduler-worker` shows `Task triggers.fire_scheduled_workflow[...] succeeded`
    - `celery` shows `Task workflows.execute_workflow[...] started`

    Disable the schedule after one fire.

---

## Step 16 — Decommission the old GCP e2-micro (optional but recommended)

Once you've confirmed the new stack works end-to-end (steps 1–10 of
verification all green for at least 24 hours), stop paying for the old
infrastructure:

1. **Stop the GCP VM**: GCP Console → Compute Engine → VM instances → select
   the old e2-micro → **Stop** (free) or **Delete** (releases the disk).
2. **Remove the GCP load balancer / static IP** if you had one.
3. **Update the firewall rules** to not include the old nginx hostname.
4. **Remove the old DNS entry** if you had a real domain pointing at GCP.
5. **Keep `cloudbuild.yaml`** in the repo — that's still in use for the
   exec-worker (Cloud Run), which we deliberately did not migrate.

---

## Common pitfalls

- **`docker: permission denied` on `/var/run/docker.sock`** — you forgot to
  re-SSH after `usermod -aG docker ubuntu`. Log out and log back in.
- **`curl: (7) Failed to connect` on port 80 from the public internet** —
  you opened iptables on the host but forgot the OCI Security List in
  Step 1, or vice versa. Both layers must allow the port.
- **certbot fails with "Detail: <ip>: Fetching <url>: Timeout"** — the
  ACME challenge can't reach your VM on port 80. Same fix as the above.
- **`nginx -t` says `host not found in upstream "django"`** — you tried to
  swap `active.conf` to `autosage.conf` before the django container exists.
  Revert: `cp nginx/autosage-bootstrap.conf nginx/active.conf && docker compose
  -f docker-compose.oci.yml exec -T nginx nginx -s reload`. Let the first
  GitHub Actions deploy do the swap (Step 14).
  (The current `nginx/autosage.conf` uses deferred DNS resolution via
  `resolver 127.0.0.11` so this is much less likely to bite future deploys —
  the config will load successfully even when django is briefly absent and
  just return 502 until django is back.)
- **`WARN[0000] The "<some-name>" variable is not set. Defaulting to a blank
  string.`** — Docker Compose is interpolating a `$<some-name>` substring in
  one of your `server.env` values. Find and escape: `grep -nE
  '(^|[^$])\$([^$]|$)' ~/autosage-server/server.env` then double every `$`
  to `$$`. This warning is **not cosmetic** — the value is silently mutated
  before the container sees it, so a `SECRET_KEY=abc$icgjfcn123` becomes
  `abc123` inside Django. Symptoms include Clerk auth failures, DB
  connection refused, and Vault decryption errors.
- **`Connection refused: <duckdns>:443` after Step 9** — expected during the
  bootstrap window. nginx is only on port 80 with the bootstrap config until
  the first GitHub Actions deploy promotes it.
- **`/api/health/` returns 200 in a browser even with `DEBUG=False` and
  `ENVIRONMENT=PROD`** — this is **intentional**, not a security hole.
  `DEBUG` only controls stack traces and `ALLOWED_HOSTS` enforcement;
  `ENVIRONMENT=PROD` only controls how Django authenticates to the Cloud Run
  exec-worker (OIDC tokens). Endpoint visibility is controlled by view-level
  decorators. The `health_check` view has no `IsAuthenticated` permission,
  so it's reachable by anyone — and it must be, so uptime monitors and load
  balancers can probe it without credentials. The data exposed (status,
  service name, version, timestamp) is harmless. To confirm auth-gated
  endpoints still require login, try `curl https://<duckdns>/api/workflows/`
  — that should return a 401 JSON response.
- **CORS doesn't block direct URL-bar visits** — typing
  `https://autosage-api.duckdns.org/...` into the address bar is a
  same-origin navigation, not a cross-origin fetch. CORS only kicks in for
  JS fetches initiated from a different origin (e.g. your Firebase frontend).
- **Firebase request fails with `Mixed Content`** — frontend is still
  calling the old `http://` URL. Re-deploy the frontend after updating its
  env var (Step 15).
- **DuckDNS returns the old GCP IP** — DuckDNS dashboard wasn't updated to
  the A1 IP, or your laptop has a stale DNS cache. Run
  `Resolve-DnsName autosage-api.duckdns.org -DnsOnly` in PowerShell and
  confirm it shows the A1 IP.

- **`certbot renew --dry-run` fails with `accountDoesNotExist`** — the
  staging account that certbot remembered got pruned by LE staging after
  ~30 days of inactivity. Wipe and let certbot re-register:
  ```bash
  docker compose -f docker-compose.oci.yml run --rm --entrypoint sh certbot \
    -c "rm -rf /etc/letsencrypt/accounts/acme-staging-v02.api.letsencrypt.org"
  docker compose -f docker-compose.oci.yml run --rm certbot renew --dry-run
  ```
  Production account state (`acme-v02.api.letsencrypt.org`) is **not**
  touched — only staging. The real cron renewal hits production and is
  unaffected.

- **`certbot renew --dry-run` fails with `DNS problem: SERVFAIL looking up
  CAA for <duckdns>` (especially "During secondary validation")** — known
  DuckDNS NS reliability hiccup, **not your setup**. CAA queries to
  DuckDNS's free nameservers occasionally fail from some geographic
  perspectives. Confirm with:
  ```bash
  dig @8.8.8.8 +noall +comment CAA <duckdns>
  dig @1.1.1.1 +noall +comment CAA <duckdns>
  ```
  If you get `SERVFAIL` from one resolver and `NOERROR` from another, it's
  DuckDNS being flaky. **Just retry the dry-run** — it usually succeeds
  within 1–2 attempts. The production renewal cron does its own retries on
  a saner cadence, so this rarely causes a real cert outage.
