import { env } from "@api/env";
import { createPolar, type Polar } from "@polar-sh/sdk/2026-04";

type PolarClient = Polar;

let polarClientSingleton: PolarClient | null = null;

export function createPolarClient(
	config: Pick<typeof env, "POLAR_ACCESS_TOKEN" | "NODE_ENV"> = env
): PolarClient {
	if (!config.POLAR_ACCESS_TOKEN) {
		throw new Error(
			"POLAR_ACCESS_TOKEN is required when Polar billing is enabled."
		);
	}

	return createPolar({
		accessToken: config.POLAR_ACCESS_TOKEN,
		environment: config.NODE_ENV === "production" ? "production" : "sandbox",
	});
}

export function getPolarClient(): PolarClient {
	if (!polarClientSingleton) {
		polarClientSingleton = createPolarClient();
	}

	return polarClientSingleton;
}

const polarClient = new Proxy({} as PolarClient, {
	get(_target, property) {
		return Reflect.get(getPolarClient(), property);
	},
});

export default polarClient;
