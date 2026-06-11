// Cloudflare Pages Function: /api/google-reviews
//
// Server-side fetch of Google Business Profile reviews via the Google Places
// API (New). The API key is never exposed to the browser. Response is cached
// at the edge for 6 hours to stay well under Places API quota and cost.
//
// Required environment variables (set as Cloudflare Pages secrets):
//   GOOGLE_PLACES_API_KEY  — restricted API key with Places API (New) enabled
//   GOOGLE_PLACES_PLACE_ID — Happy Faces LA Google Business Profile place ID
//
// Response shape (stable):
//   {
//     placeId: string,
//     rating: number | null,
//     userRatingCount: number | null,
//     googleMapsUri: string | null,
//     reviews: Array<{
//       authorName: string,
//       authorPhotoUri: string | null,
//       rating: number,
//       relativeTime: string,
//       text: string,
//       publishTime: string
//     }>,
//     cachedAt: string
//   }

type Env = {
    GOOGLE_PLACES_API_KEY?: string;
    GOOGLE_PLACES_PLACE_ID?: string;
};

type PlacesReview = {
    name?: string;
    rating?: number;
    text?: { text?: string };
    originalText?: { text?: string };
    relativePublishTimeDescription?: string;
    publishTime?: string;
    authorAttribution?: {
        displayName?: string;
        uri?: string;
        photoUri?: string;
    };
};

type PlacesResponse = {
    rating?: number;
    userRatingCount?: number;
    googleMapsUri?: string;
    reviews?: PlacesReview[];
};

type PagesFunctionContext<EnvBindings> = {
    request: Request;
    env: EnvBindings;
};

type PagesFunction<EnvBindings> = (
    context: PagesFunctionContext<EnvBindings>
) => Response | Promise<Response>;

type EdgeCacheStorage = CacheStorage & {
    default: Cache;
};

const CACHE_TTL_SECONDS = 60 * 60 * 6; // 6 hours

function json(data: unknown, status = 200, cacheSeconds = 0): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control":
                cacheSeconds > 0
                    ? `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`
                    : "no-store"
        }
    });
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
    const apiKey = env.GOOGLE_PLACES_API_KEY;
    const placeId = env.GOOGLE_PLACES_PLACE_ID;

    if (!apiKey || !placeId) {
        return json(
            {
                error: "Google Places API not configured",
                reviews: [],
                rating: null,
                userRatingCount: null
            },
            503
        );
    }

    // Edge cache lookup
    const cache = (caches as EdgeCacheStorage).default;
    const cacheKey = new Request(new URL(request.url).toString(), { method: "GET" });
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
    const fieldMask = [
        "rating",
        "userRatingCount",
        "googleMapsUri",
        "reviews.rating",
        "reviews.text",
        "reviews.originalText",
        "reviews.relativePublishTimeDescription",
        "reviews.publishTime",
        "reviews.authorAttribution"
    ].join(",");

    let upstream: Response;
    try {
        upstream = await fetch(url, {
            method: "GET",
            headers: {
                "X-Goog-Api-Key": apiKey,
                "X-Goog-FieldMask": fieldMask
            }
        });
    } catch {
        return json({ error: "Upstream fetch failed", reviews: [] }, 502);
    }

    if (!upstream.ok) {
        return json(
            { error: `Places API ${upstream.status}`, reviews: [] },
            upstream.status === 429 ? 429 : 502
        );
    }

    const data = (await upstream.json()) as PlacesResponse;

    const reviews = (data.reviews ?? []).map((r) => ({
        authorName: r.authorAttribution?.displayName ?? "Google user",
        authorPhotoUri: r.authorAttribution?.photoUri ?? null,
        rating: typeof r.rating === "number" ? r.rating : 0,
        relativeTime: r.relativePublishTimeDescription ?? "",
        text: r.text?.text ?? r.originalText?.text ?? "",
        publishTime: r.publishTime ?? ""
    }));

    const body = {
        placeId,
        rating: data.rating ?? null,
        userRatingCount: data.userRatingCount ?? null,
        googleMapsUri: data.googleMapsUri ?? null,
        reviews,
        cachedAt: new Date().toISOString()
    };

    const response = json(body, 200, CACHE_TTL_SECONDS);
    // Store a clone in edge cache for subsequent requests
    await cache.put(cacheKey, response.clone());
    return response;
};
