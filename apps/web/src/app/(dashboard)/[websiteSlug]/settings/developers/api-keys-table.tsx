"use client";

import type { RouterOutputs } from "@plasma/api/types";
import { APIKeyType } from "@plasma/types";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { BaseSubmitButton } from "@/components/ui/base-submit-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { CopyApiKeyButton } from "./copy-api-key-button";

type WebsiteApiKey =
	RouterOutputs["website"]["developerSettings"]["apiKeys"][number];

type ApiKeysTableProps = {
	apiKeys?: WebsiteApiKey[];
	isLoading: boolean;
	onRequestRevoke: (apiKey: WebsiteApiKey) => void;
	revokingKeyId: string | null;
};

const LOADING_ROWS = [0, 1, 2];

function formatType(keyType: WebsiteApiKey["keyType"]) {
	return keyType === APIKeyType.PRIVATE ? "Private" : "Public";
}

function formatEnvironment(isTest: boolean) {
	return isTest ? "Test" : "Live";
}

function formatKeyPreview(keyValue: string | null) {
	if (!keyValue) {
		return "Hidden";
	}

	if (keyValue.length <= 12) {
		return keyValue;
	}

	return `${keyValue.slice(0, 6)}…${keyValue.slice(-4)}`;
}

export function ApiKeysTable({
	apiKeys,
	isLoading,
	onRequestRevoke,
	revokingKeyId,
}: ApiKeysTableProps) {
	const sortedKeys = useMemo(
		() =>
			(apiKeys ?? [])
				.slice()
				.sort(
					(a, b) =>
						new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
				),
		[apiKeys]
	);

	if (isLoading) {
		return (
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Name</TableHead>
						<TableHead>Type</TableHead>
						<TableHead>Key</TableHead>
						<TableHead className="text-right">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{LOADING_ROWS.map((row) => (
						<TableRow key={row}>
							<TableCell colSpan={4}>
								<Skeleton className="h-9 w-full" />
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		);
	}

	if (!sortedKeys.length) {
		return (
			<div className="px-4 py-10 text-center text-muted-foreground text-sm">
				No API keys have been created yet. Generate a key below to get started.
			</div>
		);
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Name</TableHead>
					<TableHead>Type</TableHead>
					<TableHead>Key</TableHead>
					<TableHead className="text-right">Actions</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{sortedKeys.map((apiKey) => {
					const canCopy =
						Boolean(apiKey.key) && apiKey.keyType === APIKeyType.PUBLIC;

					return (
						<TableRow key={apiKey.id}>
							<TableCell>
								<div className="flex flex-col gap-1">
									<span className="font-medium">{apiKey.name}</span>
									<span className="text-muted-foreground text-xs">
										Created {new Date(apiKey.createdAt).toLocaleString()}
									</span>
								</div>
							</TableCell>
							<TableCell>
								<Badge variant="outline">
									{formatEnvironment(apiKey.isTest)}{" "}
									{formatType(apiKey.keyType)} Key
								</Badge>
							</TableCell>
							<TableCell>
								<div className="flex items-center gap-2">
									<span className="font-mono text-sm">
										{formatKeyPreview(apiKey.key)}
									</span>
									{canCopy && apiKey.key ? (
										<CopyApiKeyButton apiKey={apiKey.key} />
									) : null}
								</div>
							</TableCell>
							<TableCell>
								<div className="flex items-center justify-end gap-2">
									<BaseSubmitButton
										disabled={revokingKeyId === apiKey.id}
										isSubmitting={revokingKeyId === apiKey.id}
										onClick={() => onRequestRevoke(apiKey)}
										size="xs"
										variant="destructive"
									>
										Revoke
									</BaseSubmitButton>
								</div>
							</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}
