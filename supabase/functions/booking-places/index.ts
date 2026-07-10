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

function googleErrorMessage(data: Record<string, unknown>, fallback: string) {
  const error = data.error as Record<string, unknown> | undefined;
  if (typeof error?.message === 'string') return error.message;
  if (typeof data.error_message === 'string') return data.error_message;
  if (typeof data.error === 'string') return data.error;
  return fallback;
}

function parseWaypoint(value: string) {
  const trimmed = String(value || '').trim();
  const latLngMatch = /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/.exec(trimmed);
  if (latLngMatch) {
    return {
      waypoint: {
        location: {
          latLng: {
            latitude: Number(latLngMatch[1]),
            longitude: Number(latLngMatch[2]),
          },
        },
      },
    };
  }
  return { waypoint: { address: trimmed } };
}

async function autocompletePlacesNew(input: string, apiKey: string) {
  const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
    },
    body: JSON.stringify({
      input,
      includedRegionCodes: ['us'],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    return {
      status: 'REQUEST_DENIED',
      error_message: googleErrorMessage(data, 'Address lookup failed.'),
    };
  }

  const predictions = (data.suggestions || [])
    .map((suggestion: Record<string, unknown>) => suggestion.placePrediction as Record<string, unknown> | undefined)
    .filter(Boolean)
    .map((prediction: Record<string, unknown>) => {
      const placeId = String(prediction.placeId || String(prediction.place || '').replace(/^places\//, ''));
      const description =
        (prediction.text as Record<string, unknown> | undefined)?.text ||
        [
          (prediction.structuredFormat as Record<string, unknown> | undefined)?.mainText as
            | Record<string, unknown>
            | undefined,
          (prediction.structuredFormat as Record<string, unknown> | undefined)?.secondaryText as
            | Record<string, unknown>
            | undefined,
        ]
          .map((part) => (part && typeof part.text === 'string' ? part.text : ''))
          .filter(Boolean)
          .join(', ');
      return { place_id: placeId, description };
    })
    .filter((prediction: { place_id: string; description: string }) => prediction.place_id && prediction.description);

  return {
    status: predictions.length ? 'OK' : 'ZERO_RESULTS',
    predictions,
  };
}

async function placeDetailsPlacesNew(placeId: string, apiKey: string) {
  const id = String(placeId || '').trim().replace(/^places\//, '');
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'formattedAddress,addressComponents',
    },
  });

  const data = await response.json();
  if (!response.ok) {
    return {
      status: 'REQUEST_DENIED',
      error_message: googleErrorMessage(data, 'Could not load address details.'),
    };
  }

  return {
    status: 'OK',
    result: {
      formatted_address: data.formattedAddress || '',
      address_components: (data.addressComponents || []).map((component: Record<string, unknown>) => ({
        long_name: component.longText || '',
        short_name: component.shortText || '',
        types: component.types || [],
      })),
    },
  };
}

async function distanceMatrixRoutesNew(origins: string, destinations: string, apiKey: string) {
  const response = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'originIndex,destinationIndex,distanceMeters,condition',
    },
    body: JSON.stringify({
      origins: [parseWaypoint(origins)],
      destinations: [parseWaypoint(destinations)],
      travelMode: 'DRIVE',
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    return {
      status: 'REQUEST_DENIED',
      error_message: googleErrorMessage(data, 'Could not calculate travel distance.'),
    };
  }

  const element = Array.isArray(data) ? data[0] : null;
  if (!element || element.condition !== 'ROUTE_EXISTS' || element.distanceMeters == null) {
    return {
      status: 'ZERO_RESULTS',
      error_message: 'Could not calculate travel distance for that address.',
    };
  }

  return {
    status: 'OK',
    rows: [
      {
        elements: [
          {
            status: 'OK',
            distance: { value: Number(element.distanceMeters) || 0 },
          },
        ],
      },
    ],
  };
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
    return json(await autocompletePlacesNew(input, apiKey));
  }

  if (action === 'details') {
    const placeId = String(body.placeId || '').trim();
    if (!placeId) return json({ error: 'placeId is required.' }, 400);
    return json(await placeDetailsPlacesNew(placeId, apiKey));
  }

  if (action === 'distancematrix') {
    const origins = String(body.origins || '').trim();
    const destinations = String(body.destinations || '').trim();
    if (!origins || !destinations) {
      return json({ error: 'origins and destinations are required.' }, 400);
    }
    return json(await distanceMatrixRoutesNew(origins, destinations, apiKey));
  }

  return json({ error: 'Unsupported action.' }, 400);
});
