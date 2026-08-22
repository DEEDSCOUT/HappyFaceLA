import {
  assertBoundedOperationalText,
  assertExactObject,
  signedJsonRead,
  type SignedReadAdapterConfig,
  type SignedReadAdapterOptions,
} from "./signed-read-adapter.ts";
import { isSafeBusinessId } from "./validation.ts";
import type { PayoutEnvironment } from "./types.ts";

export type ArtistLegalEntityType =
  "individual" | "company" | "non_profit" | "government_entity";

export interface AuthoritativeArtistIdentity {
  environment: PayoutEnvironment;
  artistId: string;
  displayName: string;
  contactEmail: string;
  country: string;
  legalEntityType: ArtistLegalEntityType;
  active: true;
  revision: string;
}

export interface AuthoritativeArtistSummary {
  environment: PayoutEnvironment;
  artistId: string;
  displayName: string;
  revision: string;
}

export interface AuthoritativeActiveRoster {
  environment: PayoutEnvironment;
  revision: string;
  totalActiveCount: number;
  artists: AuthoritativeArtistSummary[];
}

export type ArtistRosterAdapterConfig = SignedReadAdapterConfig;

const RESPONSE_KEYS = ["ok", "requestId", "environment", "artist"] as const;
const ARTIST_KEYS = [
  "artistId",
  "displayName",
  "contactEmail",
  "country",
  "legalEntityType",
  "active",
  "revision",
] as const;
const LEGAL_ENTITY_TYPES = new Set<ArtistLegalEntityType>([
  "individual",
  "company",
  "non_profit",
  "government_entity",
]);
const ROSTER_LIST_RESPONSE_KEYS = [
  "ok",
  "requestId",
  "environment",
  "rosterRevision",
  "totalActiveCount",
  "artists",
  "nextAfterArtistId",
  "complete",
] as const;
const ARTIST_SUMMARY_KEYS = ["artistId", "displayName", "revision"] as const;
export const ARTIST_ROSTER_LIST_MAX_RESPONSE_BYTES = 192 * 1024;

function assertEmail(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 3 ||
    value.length > 254 ||
    value !== value.trim() ||
    /[\u0000-\u0020\u007F]/.test(value) ||
    !/^[^@]+@[^@]+\.[^@]+$/.test(value)
  ) {
    throw new Error("Artist roster contact email is malformed");
  }
  return value;
}

function parseArtistResponse(
  value: unknown,
  expectedArtistId: string,
  requestId: string,
  expectedEnvironment: PayoutEnvironment,
): AuthoritativeArtistIdentity {
  assertExactObject(value, RESPONSE_KEYS, "Artist roster response");
  if (value.ok !== true || value.requestId !== requestId) {
    throw new Error(
      "Artist roster response authentication context does not match the request",
    );
  }
  if (value.environment !== expectedEnvironment) {
    throw new Error(
      "Artist roster response environment does not match the payout environment",
    );
  }
  assertExactObject(value.artist, ARTIST_KEYS, "Artist roster identity");
  const artist = value.artist;
  if (
    !isSafeBusinessId(artist.artistId) ||
    artist.artistId !== expectedArtistId
  ) {
    throw new Error("Artist roster returned a substituted artist identity");
  }
  const displayName = assertBoundedOperationalText(
    artist.displayName,
    160,
    "Artist display name",
  );
  const contactEmail = assertEmail(artist.contactEmail);
  if (
    typeof artist.country !== "string" ||
    !/^[A-Z]{2}$/.test(artist.country)
  ) {
    throw new Error("Artist roster country is malformed");
  }
  if (
    typeof artist.legalEntityType !== "string" ||
    !LEGAL_ENTITY_TYPES.has(artist.legalEntityType as ArtistLegalEntityType)
  ) {
    throw new Error("Artist roster legal entity type is unsupported");
  }
  if (artist.active !== true)
    throw new Error("Artist roster identity is inactive");
  const revision = assertBoundedOperationalText(
    artist.revision,
    200,
    "Artist roster revision",
  );
  return {
    environment: expectedEnvironment,
    artistId: artist.artistId,
    displayName,
    contactEmail,
    country: artist.country,
    legalEntityType: artist.legalEntityType as ArtistLegalEntityType,
    active: true,
    revision,
  };
}

export async function resolveActiveArtistIdentity(
  artistId: string,
  config: ArtistRosterAdapterConfig,
  fetcher: typeof fetch = fetch,
  options?: SignedReadAdapterOptions,
): Promise<AuthoritativeArtistIdentity> {
  if (!isSafeBusinessId(artistId))
    throw new Error("Artist roster lookup ID is malformed");
  const response = await signedJsonRead(
    {
      operation: "artist_roster_read_v1",
      queryName: "artistId",
      queryValue: artistId,
      config,
      options,
      maxResponseBytes: 16 * 1024,
    },
    fetcher,
  );
  return parseArtistResponse(
    response.value,
    artistId,
    response.requestId,
    config.environment,
  );
}

function parseRosterPage(
  value: unknown,
  requestId: string,
  expectedEnvironment: PayoutEnvironment,
): {
  revision: string;
  totalActiveCount: number;
  artists: AuthoritativeArtistSummary[];
  nextAfterArtistId: string | null;
  complete: boolean;
} {
  assertExactObject(
    value,
    ROSTER_LIST_RESPONSE_KEYS,
    "Artist roster list response",
  );
  if (value.ok !== true || value.requestId !== requestId) {
    throw new Error(
      "Artist roster list authentication context does not match the request",
    );
  }
  if (value.environment !== expectedEnvironment) {
    throw new Error(
      "Artist roster list environment does not match the payout environment",
    );
  }
  const revision = assertBoundedOperationalText(
    value.rosterRevision,
    200,
    "Artist roster list revision",
  );
  if (
    !Number.isSafeInteger(value.totalActiveCount) ||
    Number(value.totalActiveCount) < 0 ||
    Number(value.totalActiveCount) > 10_000
  ) {
    throw new Error("Artist roster list total is outside its safe bound");
  }
  if (!Array.isArray(value.artists) || value.artists.length > 100) {
    throw new Error("Artist roster list page is outside its safe bound");
  }
  const artists = value.artists.map((candidate) => {
    assertExactObject(
      candidate,
      ARTIST_SUMMARY_KEYS,
      "Artist roster list identity",
    );
    if (
      !isSafeBusinessId(candidate.artistId) ||
      candidate.artistId === "START"
    ) {
      throw new Error("Artist roster list identity is malformed");
    }
    return {
      environment: expectedEnvironment,
      artistId: candidate.artistId,
      displayName: assertBoundedOperationalText(
        candidate.displayName,
        160,
        "Artist display name",
      ),
      revision: assertBoundedOperationalText(
        candidate.revision,
        200,
        "Artist roster identity revision",
      ),
    };
  });
  for (let index = 1; index < artists.length; index += 1) {
    if (artists[index - 1].artistId >= artists[index].artistId) {
      throw new Error("Artist roster list is not strictly ordered and unique");
    }
  }
  if (typeof value.complete !== "boolean") {
    throw new Error("Artist roster list completion state is malformed");
  }
  const nextAfterArtistId = value.nextAfterArtistId;
  if (
    (nextAfterArtistId !== null && !isSafeBusinessId(nextAfterArtistId)) ||
    (value.complete && nextAfterArtistId !== null) ||
    (!value.complete &&
      (artists.length === 0 ||
        nextAfterArtistId !== artists[artists.length - 1].artistId))
  ) {
    throw new Error("Artist roster list continuation is contradictory");
  }
  return {
    revision,
    totalActiveCount: Number(value.totalActiveCount),
    artists,
    nextAfterArtistId,
    complete: value.complete,
  };
}

export async function listActiveArtistIdentities(
  config: ArtistRosterAdapterConfig,
  fetcher: typeof fetch = fetch,
  options?: SignedReadAdapterOptions,
): Promise<AuthoritativeActiveRoster> {
  const artists: AuthoritativeArtistSummary[] = [];
  const seen = new Set<string>();
  let afterArtistId = "START";
  let expectedRevision: string | null = null;
  let expectedTotal: number | null = null;
  for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
    const response = await signedJsonRead(
      {
        operation: "artist_roster_list_v1",
        queryName: "afterArtistId",
        queryValue: afterArtistId,
        config,
        options,
        maxResponseBytes: ARTIST_ROSTER_LIST_MAX_RESPONSE_BYTES,
      },
      fetcher,
    );
    const page = parseRosterPage(
      response.value,
      response.requestId,
      config.environment,
    );
    expectedRevision ??= page.revision;
    expectedTotal ??= page.totalActiveCount;
    if (
      page.revision !== expectedRevision ||
      page.totalActiveCount !== expectedTotal
    ) {
      throw new Error("Artist roster changed during paginated retrieval");
    }
    for (const artist of page.artists) {
      if (
        seen.has(artist.artistId) ||
        (afterArtistId !== "START" && artist.artistId <= afterArtistId)
      ) {
        throw new Error(
          "Artist roster pagination repeated or reordered an identity",
        );
      }
      seen.add(artist.artistId);
      artists.push(artist);
    }
    if (page.complete) {
      if (artists.length !== expectedTotal) {
        throw new Error(
          "Artist roster list total does not match the complete inventory",
        );
      }
      return {
        environment: config.environment,
        revision: expectedRevision,
        totalActiveCount: expectedTotal,
        artists,
      };
    }
    afterArtistId = page.nextAfterArtistId!;
  }
  throw new Error("Artist roster list exceeded its bounded page count");
}
