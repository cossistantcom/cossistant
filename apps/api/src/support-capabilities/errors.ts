export type SupportCapabilityErrorCode =
	| "BAD_REQUEST"
	| "UNAUTHORIZED"
	| "FORBIDDEN"
	| "NOT_FOUND"
	| "CONFLICT"
	| "INTERNAL_SERVER_ERROR";

export class SupportCapabilityError extends Error {
	readonly code: SupportCapabilityErrorCode;
	readonly status: 400 | 401 | 403 | 404 | 409 | 500;

	constructor(
		status: SupportCapabilityError["status"],
		code: SupportCapabilityErrorCode,
		message: string
	) {
		super(message);
		this.name = "SupportCapabilityError";
		this.status = status;
		this.code = code;
	}
}

export function toSupportCapabilityError(error: unknown) {
	if (error instanceof SupportCapabilityError) {
		return error;
	}

	return new SupportCapabilityError(
		500,
		"INTERNAL_SERVER_ERROR",
		"Support capability failed"
	);
}
