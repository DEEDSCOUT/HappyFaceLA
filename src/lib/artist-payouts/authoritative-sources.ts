import {
  listActiveArtistIdentities,
  resolveActiveArtistIdentity,
  type AuthoritativeActiveRoster,
  type AuthoritativeArtistIdentity,
} from "./artist-roster-adapter.ts";
import {
  resolveCrmPayoutSource,
  type AuthoritativeCrmPayoutSource,
} from "./crm-payout-source-adapter.ts";
import type { PayoutEnvironment, PayoutRuntimeEnv } from "./types.ts";
import type {
  DashboardQuery,
  DashboardSnapshot,
  PayoutRepository,
} from "./repository.ts";

export interface AuthoritativePayoutSourceResolver {
  resolveArtist(artistId: string): Promise<AuthoritativeArtistIdentity>;
  listActiveArtists(): Promise<AuthoritativeActiveRoster>;
  resolveCrmSource(crmRecordId: string): Promise<AuthoritativeCrmPayoutSource>;
}

export async function dashboardWithAuthoritativeRoster(
  repository: PayoutRepository,
  sources: AuthoritativePayoutSourceResolver | null,
  query: DashboardQuery = {},
): Promise<DashboardSnapshot> {
  const snapshot = await repository.getDashboard(query);
  if (!sources) return snapshot;
  try {
    const [roster, accounts] = await Promise.all([
      sources.listActiveArtists(),
      repository.listArtistAccountsForRoster(),
    ]);
    if (roster.environment !== repository.environment) {
      throw new Error("Authoritative roster environment does not match D1");
    }
    const accountByArtist = new Map(
      accounts.map((account) => [account.artistId, account] as const),
    );
    return {
      ...snapshot,
      activeRosterCount: roster.totalActiveCount,
      onboardingQueueUnavailable: false,
      onboardingQueue: roster.artists
        .filter(
          (artist) =>
            accountByArtist.get(artist.artistId)?.onboardingStatus !==
            "PAYOUT_READY",
        )
        .map((artist) => ({
          artistId: artist.artistId,
          displayName: artist.displayName,
          onboardingStatus:
            accountByArtist.get(artist.artistId)?.onboardingStatus ??
            ("NOT_INVITED" as const),
        })),
    };
  } catch {
    return snapshot;
  }
}

function environmentValue(
  environment: PayoutEnvironment,
  sandbox: string | undefined,
  live: string | undefined,
): string | undefined {
  return environment === "sandbox" ? sandbox : live;
}

function requiredSourceConfig(
  url: string | undefined,
  allowedOrigin: string | undefined,
  secret: string | undefined,
  label: string,
  environment: PayoutEnvironment,
) {
  const values = {
    url: url?.trim() ?? "",
    allowedOrigin: allowedOrigin?.trim() ?? "",
    secret: secret?.trim() ?? "",
  };
  if (!values.url || !values.allowedOrigin || !values.secret) {
    throw new Error(`${label} authoritative source is not configured`);
  }
  return { ...values, environment };
}

export function authoritativePayoutSourcesFromEnv(
  env: PayoutRuntimeEnv,
  environment: PayoutEnvironment,
): AuthoritativePayoutSourceResolver {
  const rosterConfig = (list: boolean) =>
    requiredSourceConfig(
      environmentValue(
        environment,
        list
          ? env.PAYOUT_SANDBOX_ROSTER_LIST_URL
          : env.PAYOUT_SANDBOX_ROSTER_READ_URL,
        list
          ? env.PAYOUT_LIVE_ROSTER_LIST_URL
          : env.PAYOUT_LIVE_ROSTER_READ_URL,
      ),
      environmentValue(
        environment,
        env.PAYOUT_SANDBOX_ROSTER_ALLOWED_ORIGIN,
        env.PAYOUT_LIVE_ROSTER_ALLOWED_ORIGIN,
      ),
      environmentValue(
        environment,
        env.PAYOUT_SANDBOX_ROSTER_READ_SECRET,
        env.PAYOUT_LIVE_ROSTER_READ_SECRET,
      ),
      list ? "Artist roster list" : "Artist roster identity",
      environment,
    );
  const crmConfig = () =>
    requiredSourceConfig(
      environmentValue(
        environment,
        env.PAYOUT_SANDBOX_CRM_SOURCE_READ_URL,
        env.PAYOUT_LIVE_CRM_SOURCE_READ_URL,
      ),
      environmentValue(
        environment,
        env.PAYOUT_SANDBOX_CRM_SOURCE_ALLOWED_ORIGIN,
        env.PAYOUT_LIVE_CRM_SOURCE_ALLOWED_ORIGIN,
      ),
      environmentValue(
        environment,
        env.PAYOUT_SANDBOX_CRM_SOURCE_READ_SECRET,
        env.PAYOUT_LIVE_CRM_SOURCE_READ_SECRET,
      ),
      "CRM payout",
      environment,
    );
  return {
    resolveArtist: (artistId) =>
      resolveActiveArtistIdentity(artistId, rosterConfig(false)),
    listActiveArtists: () => listActiveArtistIdentities(rosterConfig(true)),
    resolveCrmSource: (recordId) =>
      resolveCrmPayoutSource(recordId, crmConfig()),
  };
}
