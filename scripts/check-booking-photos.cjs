/** Check recent booking photo paths in DB and verify storage objects exist. */
const fs = require('fs');
const path = require('path');

const cfgText = fs.readFileSync(path.join(__dirname, '../js/styld-tenant-config.local.js'), 'utf8');
const url = cfgText.match(/supabaseUrl = "([^"]+)"/)[1];
const key = cfgText.match(/supabaseAnonKey = "([^"]+)"/)[1];
const headers = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };

function photoPaths(data) {
  data = data || {};
  return {
    hair: data.current_hair_photo_path || data.photo_hair_path || null,
    ref: data.reference_photo_path || data.photo_ref_path || null,
  };
}

async function checkStorageObject(storagePath) {
  const cleaned = String(storagePath || '').replace(/^\/+/, '');
  if (!cleaned) return { ok: false, reason: 'empty path' };
  const base = url.replace(/\/$/, '') + '/storage/v1/object/';
  const pubUrl = base + 'public/booking-photos/' + cleaned;
  const authUrl = base + 'booking-photos/' + cleaned;
  const pub = await fetch(pubUrl, { method: 'HEAD' });
  const auth = await fetch(authUrl, {
    method: 'HEAD',
    headers: { apikey: key, Authorization: 'Bearer ' + key },
  });
  return {
    public: { ok: pub.ok, status: pub.status, url: pubUrl },
    auth: {
      ok: auth.ok,
      status: auth.status,
      contentType: auth.headers.get('content-type') || '',
      contentLength: auth.headers.get('content-length') || '',
      url: authUrl,
    },
  };
}

async function listStoragePrefix(prefix) {
  const listUrl =
    url.replace(/\/$/, '') +
    '/storage/v1/object/list/booking-photos?prefix=' +
    encodeURIComponent(prefix);
  const res = await fetch(listUrl, {
    method: 'POST',
    headers: Object.assign({}, headers, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefix: prefix, limit: 20, offset: 0 }),
  });
  const body = await res.json().catch(function () {
    return null;
  });
  return { status: res.status, body };
}

async function main() {
  const res = await fetch(
    url +
      '/rest/v1/styld_site_records?record_type=eq.booking&select=id,user_id,created_at,data&order=created_at.desc&limit=50',
    { headers },
  );
  const rows = await res.json();
  if (!Array.isArray(rows)) {
    console.error('Booking query failed:', rows);
    process.exit(1);
  }

  const withPhotos = rows.filter(function (r) {
    var p = photoPaths(r.data);
    return p.hair || p.ref;
  });

  console.log('Supabase:', url);
  console.log('Recent bookings checked:', rows.length);
  console.log('With photo paths in data JSON:', withPhotos.length);
  console.log('');

  if (!withPhotos.length) {
    console.log('No bookings in last 50 have photo paths saved.');
    console.log('Latest 8 bookings:');
    rows.slice(0, 8).forEach(function (r) {
      var d = r.data || {};
      var p = photoPaths(d);
      console.log(
        '  ' +
          r.created_at +
          ' | ' +
          (d.full_name || '(no name)') +
          ' | hair=' +
          (p.hair || 'null') +
          ' | ref=' +
          (p.ref || 'null'),
      );
    });
    return;
  }

  var okCount = 0;
  var failCount = 0;

  for (var i = 0; i < Math.min(withPhotos.length, 12); i++) {
    var row = withPhotos[i];
    var data = row.data || {};
    var paths = photoPaths(data);
    console.log('--- ' + row.created_at + ' | ' + (data.full_name || 'guest') + ' | booking ' + (data.id || row.id));
    for (var kind of ['hair', 'ref']) {
      var p = paths[kind];
      if (!p) {
        console.log('  ' + kind + ': (not set)');
        continue;
      }
      console.log('  ' + kind + ' path: ' + p);
      var check = await checkStorageObject(p);
      if (check.auth.ok) {
        okCount++;
        console.log(
          '  ' +
            kind +
            ' storage: OK (private bucket) | auth ' +
            check.auth.status +
            ' | ' +
            check.auth.contentType +
            ' | ' +
            check.auth.contentLength +
            ' bytes',
        );
      } else {
        failCount++;
        console.log('  ' + kind + ' storage: NOT FOUND via auth ' + check.auth.status);
      }
      console.log('  ' + kind + ' public URL: ' + check.public.status + (check.public.ok ? ' (public)' : ' (private — expected)'));
    }
    console.log('');
  }

  console.log('Verified files: ' + okCount + ' OK, ' + failCount + ' failed/missing');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
