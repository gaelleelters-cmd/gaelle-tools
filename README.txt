Workspace for the second application (root domain gaelleelters.com).

Traffic path: Cloudflare -> tunnel -> host port 8080.

Deploy:
  This repo auto-deploys on every push to main (GitHub Actions).
  The site container binds to host port 8080 and replaces the placeholder.

Mail Mass (like Word mail merge — each user sends from their own mailbox):
  Add GitHub secret MAILMASS_CLIENT_ID = Azure App Registration client ID
  (SPA redirect: https://gaelleelters.com/Mail%20Mass/index.html
   Graph permissions: Mail.Send, User.Read)
  Or run: Mail Mass/owner-setup/Register-MailMassAzureApp.ps1 once, then add the printed ID as the secret.
  Visitors: upload Excel → Send → Microsoft sign-in (their Outlook mailbox) → sent.

Optional SMTP mail-api (shared mailbox only — not per-user Outlook):
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
  CONTACT_TO (optional, default info@gaelleelters.com) — help bot questions

Manual deploy:
  docker rm -f newapp-placeholder
  cd /opt/newapp
  docker compose up -d --build

Bind to port 8080. The firewall blocks direct internet access to 8080 —
only the Cloudflare tunnel reaches it.
Keep everything inside /opt/newapp. Do not touch other containers.
