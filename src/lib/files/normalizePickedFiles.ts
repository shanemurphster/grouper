/**
 * Normalizes the result from expo-document-picker into a consistent array.
 *
 * Handles two shapes:
 *   A) Expo mobile: result.assets is an array of { name, uri, mimeType, size }
 *   B) Web:         result.output is a FileList of File objects
 *
 * Returns a unified array of PickedFile.
 */

export type PickedFile = {
	name: string;
	/** Native URI (present on mobile, absent on web) */
	uri?: string;
	/** Web File object (present on web, absent on mobile) */
	file?: File;
	mimeType: string;
	size: number;
};

export function normalizePickedFiles(result: any): PickedFile[] {
	if (!result || result.canceled === true || result.cancelled === true || (result as any).type === "cancel") {
		return [];
	}

	const files: PickedFile[] = [];

	// Case A: Expo DocumentPicker (mobile) — result.assets is an array
	if (Array.isArray(result.assets) && result.assets.length > 0) {
		for (const asset of result.assets) {
			files.push({
				name: asset.name ?? asset.fileName ?? "file",
				uri: asset.uri,
				mimeType: asset.mimeType ?? asset.type ?? "application/octet-stream",
				size: asset.size ?? asset.fileSize ?? 0,
			});
		}
	}

	// Case B: Web — result.output is a FileList (or array-like of File objects)
	if (result.output && typeof result.output === "object" && typeof result.output.length === "number") {
		for (let i = 0; i < result.output.length; i++) {
			const f = result.output[i];
			if (f && typeof f.name === "string") {
				files.push({
					name: f.name,
					file: f as File,
					mimeType: f.type || "application/octet-stream",
					size: f.size ?? 0,
				});
			}
		}
	}

	// Deduplicate: if both assets and output produced entries for the same file,
	// prefer the web File version (has the actual File object for direct upload).
	if (files.length > 0) {
		const seen = new Map<string, PickedFile>();
		for (const f of files) {
			const key = `${f.name}:${f.size}`;
			const existing = seen.get(key);
			// Prefer the one with a File object, otherwise keep first
			if (!existing || (f.file && !existing.file)) {
				seen.set(key, f);
			}
		}
		return Array.from(seen.values());
	}

	return files;
}
