"use client";

import { cva } from "class-variance-authority";
import Link from "fumadocs-core/link";
import { ChevronDown } from "lucide-react";
import {
	type ComponentPropsWithoutRef,
	type ReactNode,
	useEffect,
	useState,
} from "react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type ParameterNode = {
	name: string;
	description: ReactNode;
};

export type TypeNode = {
	/**
	 * Additional description of the field
	 */
	description?: ReactNode;

	/**
	 * type signature (short)
	 */
	type: ReactNode;

	/**
	 * type signature (full)
	 */
	typeDescription?: ReactNode;

	/**
	 * Optional `href` for the type
	 */
	typeDescriptionLink?: string;

	complexType?: boolean;

	default?: ReactNode;

	required?: boolean;
	deprecated?: boolean;

	parameters?: ParameterNode[];

	returns?: ReactNode;
};

const keyVariants = cva("text-fd-primary", {
	variants: {
		deprecated: {
			true: "text-fd-primary/50 line-through",
		},
	},
});

const fieldVariants = cva("not-prose pe-2 text-fd-muted-foreground");

export type TypeTableVariant = "prop" | "property" | "parameter" | "return";

const headerLabels: Record<TypeTableVariant, { name: string; type: string }> = {
	prop: { name: "Prop", type: "Type" },
	property: { name: "Property", type: "Type" },
	parameter: { name: "Parameter", type: "Type" },
	return: { name: "Name", type: "Type" },
};

export function TypeTable({
	id,
	type,
	variant = "prop",
	className,
	...props
}: {
	type: Record<string, TypeNode>;
	variant?: TypeTableVariant;
} & ComponentPropsWithoutRef<"div">) {
	const headers = headerLabels[variant];

	return (
		<div
			className={cn(
				"@container my-6 flex flex-col overflow-hidden rounded border border-dashed bg-background-100 p-1 text-primary text-sm",
				className
			)}
			id={id}
			{...props}
		>
			<div className="not-prose mb-4 flex items-center px-3 py-1 font-medium text-fd-muted-foreground">
				<p className="w-[33%]">{headers.name}</p>
				<p className="@max-xl:hidden">{headers.type}</p>
			</div>
			{Object.entries(type).map(([key, value]) => (
				<Item item={value} key={key} name={key} parentId={id} />
			))}
		</div>
	);
}

function Item({
	parentId,
	name,
	item: {
		parameters = [],
		description,
		required = false,
		deprecated,
		typeDescription,
		default: defaultValue,
		type,
		typeDescriptionLink,
		complexType = false,
		returns,
	},
}: {
	parentId?: string;
	name: string;
	item: TypeNode;
}) {
	const [open, setOpen] = useState(false);
	const id = parentId ? `${parentId}-${name}` : undefined;

	useEffect(() => {
		const hash = window.location.hash;
		if (!(id && hash)) {
			return;
		}

		if (`#${id}` === hash) {
			setOpen(true);
		}
	}, [id]);

	return (
		<Collapsible
			className={cn(
				"scroll-m-20 overflow-hidden rounded border bg-background-100 transition-all",
				open ? "not-last:mb-2 bg-background-200" : "border-transparent"
			)}
			id={id}
			onOpenChange={(value) => {
				if (value && id) {
					window.history.replaceState(null, "", `#${id}`);
				}

				setOpen(value);
			}}
			open={open}
		>
			<CollapsibleTrigger className="group not-prose relative flex w-full flex-row items-center px-3 py-2 text-start hover:bg-background-200">
				<code
					className={cn(
						keyVariants({
							deprecated,
							className: "w-[33%] min-w-fit font-medium text-plasma-green",
						})
					)}
				>
					{name}
					{!required && <span className="ml-1 text-plasma-orange">?</span>}
				</code>
				<div className="@max-xl:hidden min-w-0 flex-1 pe-6">
					{typeDescriptionLink ? (
						<Link
							className={cn(
								"inline-flex max-w-full items-center truncate underline underline-offset-4",
								complexType &&
									"rounded border border-border/60 border-dashed bg-background-200 px-2 py-0.5 font-mono text-xs no-underline"
							)}
							href={typeDescriptionLink}
						>
							<span className="truncate">{type}</span>
						</Link>
					) : (
						<span
							className={cn(
								"inline-flex max-w-full items-center truncate",
								complexType &&
									"rounded border border-border/60 border-dashed bg-background-200 px-2 py-0.5 font-mono text-xs"
							)}
						>
							<span className="truncate">{type}</span>
						</span>
					)}
				</div>
				<ChevronDown className="absolute end-2 size-4 text-fd-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="fd-scroll-container grid grid-cols-[1fr_3fr] gap-y-4 overflow-auto border-border/30 border-t p-3 text-sm">
					<div className="prose prose-no-margin col-span-full text-sm empty:hidden">
						{description}
					</div>
					{typeDescription && (
						<>
							<p className={cn(fieldVariants())}>
								{complexType ? "Definition" : "Type"}
							</p>
							{complexType && typeof typeDescription === "string" ? (
								<div className="not-prose my-auto overflow-hidden rounded border border-border/60 border-dashed bg-background-100">
									<pre className="overflow-x-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs leading-6">
										<code>{typeDescription}</code>
									</pre>
								</div>
							) : (
								<p className="not-prose my-auto">{typeDescription}</p>
							)}
						</>
					)}
					{defaultValue && (
						<>
							<p className={cn(fieldVariants())}>Default</p>
							<p className="not-prose my-auto">{defaultValue}</p>
						</>
					)}
					{parameters.length > 0 && (
						<>
							<p className={cn(fieldVariants())}>Parameters</p>
							<div className="flex flex-col gap-2">
								{parameters.map((param) => (
									<div
										className="inline-flex flex-wrap items-center gap-1"
										key={param.name}
									>
										<p className="not-prose text-nowrap font-medium">
											{param.name} -
										</p>
										<div className="prose prose-no-margin text-sm">
											{param.description}
										</div>
									</div>
								))}
							</div>
						</>
					)}
					{returns && (
						<>
							<p className={cn(fieldVariants())}>Returns</p>
							<div className="prose prose-no-margin my-auto text-sm">
								{returns}
							</div>
						</>
					)}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}
