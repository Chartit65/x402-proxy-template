import type { ProtectedRouteConfig } from "./auth";

const PAY_TO = "0xC6D43A2C51e26F423476b92aba5108f2ec13Ad55";
const FACILITATOR_URL = "https://x402.org/facilitator";
const NETWORK_SLUG = "base";
const CAIP2_NETWORK = "eip155:8453";

function stillEndpoint(
	path: string,
	description: string
): Record<string, string> {
	return {
		path,
		method: "GET",
		description,
		price: "$0.001",
		network: CAIP2_NETWORK,
		mimeType: "image/jpeg",
	};
}

/** Paid still paths — keep in sync with wrangler PROTECTED_PATTERNS. */
export function paidStillManifest(
	patterns: ProtectedRouteConfig[]
): Record<string, unknown> {
	const endpoints = patterns
		.filter((p) => /^\/.+\.jpg$/.test(p.pattern))
		.map((p) =>
			stillEndpoint(
				p.pattern,
				p.description ?? `StillGate paid still ${p.pattern}`
			)
		);

	return {
		x402Version: 1,
		name: "StillGate Paid Stills Gallery",
		description:
			"Unlock individual gallery stills via x402 micropayment on Base. One payment unlocks one image path for one hour.",
		origin: "https://stillgate.quest",
		facilitatorUrl: FACILITATOR_URL,
		payTo: PAY_TO,
		network: NETWORK_SLUG,
		endpoints,
	};
}

export function paidStillResourceList(
	patterns: ProtectedRouteConfig[]
): Record<string, unknown> {
	const resources = patterns
		.filter((p) => /^\/.+\.jpg$/.test(p.pattern))
		.map((p) => `GET ${p.pattern}`);

	return {
		version: 1,
		resources,
	};
}
