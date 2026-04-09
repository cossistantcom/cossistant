import { useCallback, useEffect, useMemo, useState } from "react";

const LOCAL_STORAGE_DRAFT_PREFIX = "cossistant:draft";
const LOCAL_STORAGE_DRAFT_EVENT = "cossistant:local-storage-draft";

type LocalStorageDraftChangeDetail = {
	key: string;
	value: string | null;
};

export type UseLocalStorageDraftValueOptions = {
	id?: string | null;
	initialValue?: string;
};

export type UseLocalStorageDraftValueReturn = {
	value: string;
	setValue: (value: string | ((previousValue: string) => string)) => void;
	clearValue: () => void;
};

function getStorage(): Storage | null {
	if (typeof window === "undefined") {
		return null;
	}

	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

function dispatchDraftStorageEvent(detail: LocalStorageDraftChangeDetail) {
	if (typeof window === "undefined") {
		return;
	}

	window.dispatchEvent(
		new CustomEvent<LocalStorageDraftChangeDetail>(LOCAL_STORAGE_DRAFT_EVENT, {
			detail,
		})
	);
}

export function getLocalStorageDraftStorageKey(id: string): string {
	return `${LOCAL_STORAGE_DRAFT_PREFIX}:${id}`;
}

export function readLocalStorageDraftValue(id: string): string | null {
	const storage = getStorage();
	if (!storage) {
		return null;
	}

	try {
		return storage.getItem(getLocalStorageDraftStorageKey(id));
	} catch {
		return null;
	}
}

export function writeLocalStorageDraftValue(id: string, value: string): void {
	const storage = getStorage();
	if (!storage) {
		return;
	}

	const key = getLocalStorageDraftStorageKey(id);
	const normalizedValue = value;

	try {
		if (normalizedValue.length === 0) {
			storage.removeItem(key);
			dispatchDraftStorageEvent({ key, value: null });
			return;
		}

		storage.setItem(key, normalizedValue);
		dispatchDraftStorageEvent({ key, value: normalizedValue });
	} catch {
		// Ignore storage failures so drafts never break input state.
	}
}

export function clearLocalStorageDraftValue(id: string): void {
	const storage = getStorage();
	if (!storage) {
		return;
	}

	const key = getLocalStorageDraftStorageKey(id);

	try {
		storage.removeItem(key);
		dispatchDraftStorageEvent({ key, value: null });
	} catch {
		// Ignore storage failures so drafts never break input state.
	}
}

function readDraftValueForHook(
	id: string | null | undefined,
	initialValue: string
): string {
	if (!id) {
		return initialValue;
	}

	return readLocalStorageDraftValue(id) ?? initialValue;
}

export function useLocalStorageDraftValue({
	id = null,
	initialValue = "",
}: UseLocalStorageDraftValueOptions = {}): UseLocalStorageDraftValueReturn {
	const storageKey = useMemo(
		() => (id ? getLocalStorageDraftStorageKey(id) : null),
		[id]
	);
	const [value, setValue] = useState(() =>
		readDraftValueForHook(id, initialValue)
	);

	useEffect(() => {
		setValue(readDraftValueForHook(id, initialValue));
	}, [id, initialValue]);

	useEffect(() => {
		if (!(storageKey && typeof window !== "undefined")) {
			return;
		}

		const handleStorage = (event: StorageEvent) => {
			if (event.key !== storageKey) {
				return;
			}

			setValue(event.newValue ?? initialValue);
		};

		const handleDraftStorageEvent = (event: Event) => {
			const detail = (event as CustomEvent<LocalStorageDraftChangeDetail>)
				.detail;
			if (!detail || detail.key !== storageKey) {
				return;
			}

			setValue(detail.value ?? initialValue);
		};

		window.addEventListener("storage", handleStorage);
		window.addEventListener(
			LOCAL_STORAGE_DRAFT_EVENT,
			handleDraftStorageEvent as EventListener
		);

		return () => {
			window.removeEventListener("storage", handleStorage);
			window.removeEventListener(
				LOCAL_STORAGE_DRAFT_EVENT,
				handleDraftStorageEvent as EventListener
			);
		};
	}, [initialValue, storageKey]);

	const setDraftValue = useCallback(
		(nextValue: string | ((previousValue: string) => string)) => {
			setValue((previousValue) => {
				const resolvedValue =
					typeof nextValue === "function"
						? nextValue(previousValue)
						: nextValue;

				if (id) {
					writeLocalStorageDraftValue(id, resolvedValue);
				}

				return resolvedValue;
			});
		},
		[id]
	);

	const clearValue = useCallback(() => {
		if (id) {
			clearLocalStorageDraftValue(id);
		}

		setValue(initialValue);
	}, [id, initialValue]);

	return {
		value,
		setValue: setDraftValue,
		clearValue,
	};
}

export { LOCAL_STORAGE_DRAFT_EVENT, LOCAL_STORAGE_DRAFT_PREFIX };
