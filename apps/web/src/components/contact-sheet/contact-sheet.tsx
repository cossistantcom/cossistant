import type { ContactDetailResponse } from "@plasma/types";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
	ValueDisplay,
	ValueGroup,
} from "@/components/ui/layout/sidebars/shared";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { ContactSheetHeader } from "./contact-sheet-header";
import { ContactVisitorsList } from "./contact-visitors-list";

type ContactSheetProps = {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	data: ContactDetailResponse | null;
	isLoading: boolean;
	isError: boolean;
};

export function ContactSheet({
	isOpen,
	onOpenChange,
	data,
	isLoading,
	isError,
}: ContactSheetProps) {
	return (
		<Sheet onOpenChange={onOpenChange} open={isOpen}>
			<SheetContent className="w-full bg-background sm:max-w-md">
				<ContactSheetContent
					data={data}
					isError={isError}
					isLoading={isLoading}
				/>
			</SheetContent>
		</Sheet>
	);
}

type ContactSheetContentProps = {
	data: ContactDetailResponse | null;
	isLoading: boolean;
	isError: boolean;
};

function ContactSheetContent({
	data,
	isLoading,
	isError,
}: ContactSheetContentProps) {
	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center">
				<Spinner className="h-6 w-6" />
			</div>
		);
	}

	if (isError) {
		return (
			<Alert className="m-4" variant="destructive">
				<AlertTitle>Unable to load contact</AlertTitle>
				<AlertDescription>
					An unexpected error occurred while retrieving this contact. Please try
					again.
				</AlertDescription>
			</Alert>
		);
	}

	if (!data) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground text-sm">
				Select a contact to view its details.
			</div>
		);
	}

	const { contact, visitors } = data;
	const metadataEntries = contact.metadata
		? Object.entries(contact.metadata)
		: [];

	return (
		<>
			<div className="sticky top-4 mt-4 px-2">
				<ContactSheetHeader contact={contact} />
			</div>
			<ScrollArea
				className="-mr-1.5 flex h-full flex-col gap-4 pr-2"
				scrollMask
			>
				<div className="px-2">
					<ValueGroup className="mt-0" header="Details">
						{contact.externalId && (
							<ValueDisplay
								title="External ID"
								value={contact.externalId}
								withPaddingLeft={false}
							/>
						)}
						<ValueDisplay
							autoFormat
							title="createdAt"
							value={contact.createdAt}
							withPaddingLeft={false}
						/>
						<ValueDisplay
							autoFormat
							title="updatedAt"
							value={contact.updatedAt}
							withPaddingLeft={false}
						/>
						{contact.contactOrganizationId && (
							<ValueDisplay
								title="Organization ID"
								value={contact.contactOrganizationId}
								withPaddingLeft={false}
							/>
						)}
					</ValueGroup>

					<ValueGroup header="Metadata">
						{metadataEntries.length > 0 ? (
							metadataEntries.map(([key, value]) => (
								<ValueDisplay autoFormat key={key} title={key} value={value} />
							))
						) : (
							<p className="text-primary/60 text-xs">
								No metadata yet, see our{" "}
								<Link
									className="text-primary/60 underline hover:text-primary/80"
									href="/docs/concepts/contacts#contact-metadata"
								>
									documentation
								</Link>{" "}
								to learn more.
							</p>
						)}
					</ValueGroup>
					<ContactVisitorsList visitors={visitors} />
				</div>

				<div className="h-32 min-h-32" />
			</ScrollArea>
		</>
	);
}
