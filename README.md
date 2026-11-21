Field Desk
==========

Phone-first work tracker. Service Call Reports open the real Ocellus Invoice Generator report screen, so both apps use one report form, numbering sequence, database collection, PDF output, and receiver-photo folder.

Local setup
-----------
1. Copy each backend .env.example to .env. Use the same MONGO_URI and the exact same JWT_SECRET in both backends. The Invoice Generator backend signs the shared token cookie; Field Desk verifies it against the same secret.
2. Start the Invoice Generator backend on port 3000 and frontend on port 5173. Start Field Desk backend on port 3001 and frontend on port 5174. Set each backend CORS_ORIGIN to its frontend origin. Frontend VITE_* values are build-time settings, so set them in the deployment environment before building.
3. Generate a VAPID pair in the Field Desk backend with npx web-push generate-vapid-keys, then set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and a real VAPID_SUBJECT email in its environment. Keep the private key server-only.
4. In production, host both frontends and APIs under one parent domain, for example invoice.example.com, field.example.com, api-invoice.example.com, and api-field.example.com. Set COOKIE_DOMAIN=.example.com in both backends, use the exact same JWT_SECRET and MONGO_URI in both backends, and set VITE_INVOICE_APP_URL and VITE_FIELD_DESK_URL to the deployed frontend origins. Both apps must use HTTPS. If the apps use unrelated domains, the browser cannot share this cookie; use a shared parent domain or a central auth proxy.
5. Sign in to Field Desk with an Invoice Generator account. Invoice roles admin, accountant, and superAdmin map to Field Desk Admin; staff maps to Worker. Field Desk admins can create staff accounts from the Team section; those accounts are created in the shared Invoice Generator employees collection and can sign into either app.

Work access
-----------
Admins create, edit, delete, and assign work. Workers see their assigned work and can set its completion date. Field Desk is installable as a PWA using its web manifest and service worker. Install Field Desk from the browser install prompt (or the browser menu on iOS), then choose Enable push notifications on each device/browser. Completion notices go to subscribed admins, and once a day the backend sends a push to subscribed workers with pending work at DAILY_REMINDER_HOUR (default 9:00 AM India time). Notification records also remain in the in-app inbox. The Field Desk backend must stay running for scheduled reminders; push delivery requires valid VAPID settings and HTTPS in production.

Service Call Reports
--------------------
The Service Call Report button routes to /admin/service-call-reports in the Invoice Generator frontend. Staff can create, view, and print reports; admin roles can also edit and delete them. All report operations use the Invoice Generator API and shared MongoDB collection. Receiver images are stored in the Invoice Generator backend public/uploads/service-call-reports folder, while the database stores the corresponding public path.

Active legacy Field Desk worker accounts are migrated to the shared Invoice Generator employees collection on startup, retaining their existing password hashes and work assignments. If an Invoice Generator employee already has the same name, Field Desk links the existing work assignment to that account. Field Desk-only admin credentials are not migrated; sign in with an Invoice Generator admin account.

Docker deployment on the Invoice server
---------------------------------------
Field Desk now has its own frontend and backend containers in docker-compose.yml. The frontend joins global-network for ingress and proxies /api to the backend. The backend joins global-network and the Invoice Mongo network so it can resolve mongodb:27017.

1. Copy docker-compose.env.example to .env beside docker-compose.yml. On the server run docker network ls and set INVOICE_DOCKER_NETWORK to the actual Compose-created network name used by Invoice app-network. The Invoice compose network is project-prefixed unless its name was explicitly set.
2. Set MONGO_URI to the Invoice database address reachable from that network (usually mongodb://mongodb:27017/Invoice), and copy the exact Invoice JWT_SECRET. Set COOKIE_DOMAIN to the shared domain (for example .ocellus.co.in), plus the Field Desk and Invoice frontend URLs. Configure the VAPID pair and subject email. Keep the VAPID private key and Docker credentials out of source control.
3. In the Invoice compose deployment, pass COOKIE_DOMAIN to the backend and build the Invoice frontend with VITE_FIELD_DESK_URL set to the Field Desk frontend origin. Rebuild/redeploy that frontend after changing the build argument.
4. Configure the server reverse proxy on global-network to send the Field Desk hostname to fielddesk-frontend:80. The Field Desk Nginx container handles /api and proxies it to fielddesk-backend:3001.
5. Start the separate Field Desk Compose project on the same Docker host with docker compose up -d --build. Keep the backend running for daily scheduled reminders.

A Docker bridge network only connects containers on the same Docker host. If Field Desk is on a different physical server, it cannot join Invoice app-network or resolve mongodb by container name; use a private network-accessible MongoDB endpoint and set MONGO_URI to that endpoint instead.
