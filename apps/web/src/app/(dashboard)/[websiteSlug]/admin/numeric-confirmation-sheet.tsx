"use client";

import type React from "react";
import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";

const MAX_NUMERIC_CONFIRMATION_AMOUNT = 1_000_000;

type NumericConfirmationSheetProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: string;
	targetLabel: string;
	targetDescription?: string;
	inputLabel: string;
	inputSuffix?: string;
	confirmLabel: string;
	isPending: boolean;
	children?: React.ReactNode;
	onConfirm: (amount: number) => void;
};

function normalizeAmount(value: number) {
	return Math.round(value * 1000) / 1000;
}

function getAmountError(value: string) {
	const parsed = Number(value);

	if (!Number.isFinite(parsed)) {
		return "Enter a valid amount.";
	}

	const normalized = normalizeAmount(parsed);

	if (normalized <= 0) {
		return "Amount must be greater than 0.";
	}

	if (normalized > MAX_NUMERIC_CONFIRMATION_AMOUNT) {
		return "Amount must be 1,000,000 or less.";
	}

	return null;
}

export function NumericConfirmationSheet({
	open,
	onOpenChange,
	title,
	description,
	targetLabel,
	targetDescription,
	inputLabel,
	inputSuffix,
	confirmLabel,
	isPending,
	children,
	onConfirm,
}: NumericConfirmationSheetProps) {
	const amountId = useId();
	const [amount, setAmount] = useState("");
	const [hasSubmitted, setHasSubmitted] = useState(false);
	const amountError = useMemo(() => getAmountError(amount), [amount]);

	useEffect(() => {
		if (!open) {
			setAmount("");
			setHasSubmitted(false);
		}
	}, [open]);

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setHasSubmitted(true);

		if (amountError) {
			return;
		}

		onConfirm(normalizeAmount(Number(amount)));
	};

	return (
		<Sheet onOpenChange={onOpenChange} open={open}>
			<SheetContent className="w-full bg-background sm:max-w-md">
				<form className="flex h-full flex-col" onSubmit={handleSubmit}>
					<SheetHeader>
						<SheetTitle>{title}</SheetTitle>
						<SheetDescription>{description}</SheetDescription>
					</SheetHeader>
					<div className="flex flex-1 flex-col gap-5 px-4">
						<div className="rounded border bg-background-50 px-3 py-3">
							<p className="truncate font-medium text-sm">{targetLabel}</p>
							{targetDescription ? (
								<p className="mt-1 truncate text-muted-foreground text-xs">
									{targetDescription}
								</p>
							) : null}
						</div>
						{children}
						<div className="space-y-2">
							<Label htmlFor={amountId}>{inputLabel}</Label>
							<Input
								append={
									inputSuffix ? (
										<span className="text-muted-foreground text-xs">
											{inputSuffix}
										</span>
									) : null
								}
								aria-invalid={hasSubmitted && Boolean(amountError)}
								id={amountId}
								inputMode="decimal"
								min="0"
								onChange={(event) => setAmount(event.target.value)}
								placeholder="100"
								step="0.001"
								type="number"
								value={amount}
							/>
							{hasSubmitted && amountError ? (
								<p className="text-destructive text-xs">{amountError}</p>
							) : null}
						</div>
					</div>
					<SheetFooter>
						<Button
							disabled={isPending}
							onClick={() => onOpenChange(false)}
							type="button"
							variant="outline"
						>
							Cancel
						</Button>
						<Button disabled={isPending} type="submit">
							{isPending ? "Granting..." : confirmLabel}
						</Button>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}
