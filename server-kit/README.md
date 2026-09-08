# server-kit (PocketBase, later)

1. Download the single PocketBase binary for your OS from  
   https://github.com/pocketbase/pocketbase/releases  
   and put it in this folder. Then create an admin once:  
   `./pocketbase superuser upsert admin@heroal.local change-me-now`

2. Start: `./pocketbase serve`

3. Seed (from this folder):  
   `PB_ADMIN_EMAIL=admin@heroal.local PB_ADMIN_PASSWORD=change-me-now node migrate-csv.js`

PWA stays on Google until `CONFIG.DATA_SOURCE` in `index.html` is set to `LOCAL`.
