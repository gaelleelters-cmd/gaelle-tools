Workspace for the second application (root domain gaelleelters.com).

Traffic path: Cloudflare -> tunnel -> host port 8080.

Deploy:
  This repo auto-deploys on every push to main (GitHub Actions).
  The site container binds to host port 8080 and replaces the placeholder.

Manual deploy:
  docker rm -f newapp-placeholder
  cd /opt/newapp
  docker compose up -d

Bind to port 8080. The firewall blocks direct internet access to 8080 —
only the Cloudflare tunnel reaches it.
Keep everything inside /opt/newapp. Do not touch other containers.
