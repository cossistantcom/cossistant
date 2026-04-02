// Re-export all types from the shared types package
export * from "@plasma/types";

// Import the error interface for the error class
import type { CossistantError } from "@plasma/types";

// Core-specific error class (runtime code)
export class CossistantAPIError extends Error {
	code: string;
	details?: Record<string, unknown>;

	constructor(error: CossistantError) {
		super(error.message);
		this.name = "CossistantAPIError";
		this.code = error.code;
		this.details = error.details;
	}
}
