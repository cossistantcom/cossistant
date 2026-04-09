import type { MetaData, PageData } from "fumadocs-core/source";

declare module "fumadocs-mdx:collections/server" {
	type CollectionInfo = {
		info: {
			path: string;
			fullPath: string;
		};
	};

	type CollectionPage = PageData &
		CollectionInfo & {
			path: string;
			url: string;
			slugs: string[];
			absolutePath: string;
			body?: any;
			toc?: any[];
			date?: string;
			author?: string;
			image?: string;
			tags?: string[];
			top?: boolean;
			version?: string;
			"tiny-excerpt"?: string;
			[key: string]: any;
		};

	type CollectionMeta = MetaData &
		CollectionInfo & {
			path: string;
			absolutePath: string;
			[key: string]: any;
		};

	export const blog: CollectionPage[];
	export const changelog: CollectionPage[];
	export const docs: {
		docs: CollectionPage[];
		meta: CollectionMeta[];
	};
}
