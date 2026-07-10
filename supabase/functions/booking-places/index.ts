const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function googleMapsApiKey() {
  return (
    Deno.env.get('GOOGLE_MAPS_API_KEY') ||
    Deno.env.get('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY') ||
    ''
  ).trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const apiKey = googleMapsApiKey();
  if (!apiKey) {
    return json({ error: 'Google Maps API key is not configured on the server.' }, 500);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const action = String(body.action || '').trim();

  if (action === 'autocomplete') {
    const input = String(body.input || '').trim();
    if (input.length < 3) {
      return json({ status: 'ZERO_RESULTS', predictions: [] });
    }
    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('input', input);
    url.searchParams.set('types', 'address');
    url.searchParams.set('components', 'country:us');
    const response = await fetch(url);
    return json(await response.json());
  }

  if (action === 'details') {
    const placeId = String(body.placeId || '').trim();
    if (!placeId) return json({ error: 'placeId is required.' }, 400);
    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('fields', 'address_components,formatted_address');
    const response = await fetch(url);
    return json(await response.json());
  }

  if (action === 'distancematrix') {
    const origins = String(body.origins || '').trim();
    const destinations = String(body.destinations || '').trim();
    if (!origins || !destinations) {
      return json({ error: 'origins and destinations are required.' }, 400);
    }
    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('origins', origins);
    url.searchParams.set('destinations', destinations);
    url.searchParams.set('units', 'imperial');
    const response = await fetch(url);
    return json(await response.json());
  }

  return json({ error: 'Unsupported action.' }, 400);
});
