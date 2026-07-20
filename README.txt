Workspace for the second application (root domain gaelleelters.com).

Traffic path: Cloudflare -> tunnel -> host port 8080.

Deploy:
  This repo auto-deploys on every push to main (GitHub Actions).
  The site container binds to host port 8080 and replaces the placeholder.

Mail Mass sending (one-time, site owner):
  Add GitHub Actions secrets:
    SMTP_HOST   e.g. smtp.office365.com
    SMTP_PORT   e.g. 587
    SMTP_USER   mailbox used to send
    SMTP_PASS   mailbox password / app password
    SMTP_FROM   From address (usually same as SMTP_USER)
  Visitors only upload Excel and click Send — no sign-in.

Manual deploy:
  docker rm -f newapp-placeholder
  cd /opt/newapp
  docker compose up -d --build

Bind to port 8080. The firewall blocks direct internet access to 8080 —
only the Cloudflare tunnel reaches it.
Keep everything inside /opt/newapp. Do not touch other containers.
