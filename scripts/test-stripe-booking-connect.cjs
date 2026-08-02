const fs = require('fs');
const path = require('path');
const t = fs.readFileSync(path.join(__dirname, '../js/styld-tenant-config.local.js'), 'utf8');
const url = t.match(/supabaseUrl = "([^"]+)"/)[1];
const key = t.match(/supabaseAnonKey = "([^"]+)"/)[1];
fetch(url + '/functions/v1/stripe-booking-connect', {
  method: 'POST',
  headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
  body: JSON.stringify({ subdomain: process.argv[2] || 'mayahair' }),
})
  .then(function (r) {
    return r.json().then(function (j) {
      console.log(r.status, JSON.stringify(j, null, 2));
    });
  })
  .catch(console.error);
