// Pure domain logic — zero dependencies, zero I/O.
// Settings schema defines all user preferences with typed defaults.

import type { Result } from "../common/result";

export const CURRENT_SCHEMA_VERSION = 4;

export type ThemeMode = "light" | "dark" | "system";

export interface Settings {
	readonly preserveOrientation: boolean;
	readonly preserveColorProfile: boolean;
	readonly saveAsCopy: boolean;
	readonly removeXattrs: boolean;
	readonly preserveTimestamps: boolean;
	// Deep-clean PDFs by structurally rewriting them (qpdf/Ghostscript) so the
	// metadata ExifTool's incremental update leaves behind is physically removed.
	readonly deepCleanPdf: boolean;
	// One-switch maximum scrub: forces orientation + color profile to be removed
	// and PDF deep-clean on, overriding the preserve toggles. For users who want
	// the most thorough wipe possible at the cost of photo fidelity.
	readonly maximumScrub: boolean;
	readonly language: string | null;
	readonly themeMode: ThemeMode;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
	preserveOrientation: true,
	preserveColorProfile: true,
	saveAsCopy: false,
	removeXattrs: false,
	preserveTimestamps: false,
	deepCleanPdf: true,
	maximumScrub: false,
	language: null,
	themeMode: "system",
});

export interface SettingsFile {
	readonly version: number;
	readonly settings: Settings;
}

const VALID_THEME_MODES: ReadonlySet<string> = new Set([
	"light",
	"dark",
	"system",
]);

// Type guard functions keep positional params (TypeScript type predicates
// cannot reference destructured binding elements).
function isValidThemeMode(value: unknown): value is ThemeMode {
	return typeof value === "string" && VALID_THEME_MODES.has(value);
}

export function isSettingsFile(value: unknown): value is SettingsFile {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const obj: Record<string, unknown> = Object.create(null);
	Object.assign(obj, value);

	if (typeof obj["version"] !== "number") {
		return false;
	}

	if (typeof obj["settings"] !== "object" || obj["settings"] === null) {
		return false;
	}

	const settingsObj: Record<string, unknown> = Object.create(null);
	Object.assign(settingsObj, obj["settings"]);

	if (
		typeof settingsObj["preserveOrientation"] !== "boolean" ||
		typeof settingsObj["preserveColorProfile"] !== "boolean" ||
		typeof settingsObj["saveAsCopy"] !== "boolean" ||
		typeof settingsObj["removeXattrs"] !== "boolean" ||
		typeof settingsObj["preserveTimestamps"] !== "boolean" ||
		typeof settingsObj["deepCleanPdf"] !== "boolean" ||
		typeof settingsObj["maximumScrub"] !== "boolean"
	) {
		return false;
	}

	// language must be string or null
	if (
		settingsObj["language"] !== null &&
		typeof settingsObj["language"] !== "string"
	) {
		return false;
	}

	// themeMode must be a valid ThemeMode
	if (!isValidThemeMode(settingsObj["themeMode"])) {
		return false;
	}

	return true;
}

interface MigrateSettingsParams {
	file: SettingsFile;
}

export function migrateSettings({ file }: MigrateSettingsParams): {
	settings: Settings;
	didMigrate: boolean;
} {
	if (file.version === CURRENT_SCHEMA_VERSION) {
		return { settings: file.settings, didMigrate: false };
	}

	let didMigrate = false;
	let settings: Settings = {
		...DEFAULT_SETTINGS,
		...file.settings,
	};

	// v1 -> v2: Split preserveRotation into preserveOrientation + preserveColorProfile
	if (file.version < 2) {
		// Old v1 settings may have a preserveRotation field not in current type
		const oldRaw: Record<string, unknown> = Object.create(null);
		Object.assign(oldRaw, file.settings);
		const preserveRotation = oldRaw["preserveRotation"] !== false;
		// Construct clean Settings object without legacy preserveRotation key
		settings = {
			preserveOrientation: preserveRotation,
			preserveColorProfile: preserveRotation,
			saveAsCopy: settings.saveAsCopy,
			removeXattrs: settings.removeXattrs,
			preserveTimestamps: settings.preserveTimestamps,
			deepCleanPdf: settings.deepCleanPdf,
			maximumScrub: settings.maximumScrub,
			language: settings.language,
			themeMode: settings.themeMode,
		};
		didMigrate = true;
	}

	// v2 -> v3: Add themeMode field
	if (file.version < 3) {
		settings = { ...settings, themeMode: "system" };
		didMigrate = true;
	}

	// v3 -> v4: Add deepCleanPdf + maximumScrub fields
	if (file.version < 4) {
		settings = {
			...settings,
			deepCleanPdf: settings.deepCleanPdf ?? DEFAULT_SETTINGS.deepCleanPdf,
			maximumScrub: settings.maximumScrub ?? DEFAULT_SETTINGS.maximumScrub,
		};
		didMigrate = true;
	}

	return { settings, didMigrate };
}

interface ValidateSettingsParams {
	input: unknown;
}

export function validateSettings({
	input,
}: ValidateSettingsParams): Result<Settings> {
	if (typeof input !== "object" || input === null) {
		return { ok: false, error: "Settings must be a non-null object" };
	}

	const raw: Record<string, unknown> = Object.create(null);
	Object.assign(raw, input);

	const settings: Settings = {
		preserveOrientation:
			typeof raw["preserveOrientation"] === "boolean"
				? raw["preserveOrientation"]
				: DEFAULT_SETTINGS.preserveOrientation,
		preserveColorProfile:
			typeof raw["preserveColorProfile"] === "boolean"
				? raw["preserveColorProfile"]
				: DEFAULT_SETTINGS.preserveColorProfile,
		saveAsCopy:
			typeof raw["saveAsCopy"] === "boolean"
				? raw["saveAsCopy"]
				: DEFAULT_SETTINGS.saveAsCopy,
		removeXattrs:
			typeof raw["removeXattrs"] === "boolean"
				? raw["removeXattrs"]
				: DEFAULT_SETTINGS.removeXattrs,
		preserveTimestamps:
			typeof raw["preserveTimestamps"] === "boolean"
				? raw["preserveTimestamps"]
				: DEFAULT_SETTINGS.preserveTimestamps,
		deepCleanPdf:
			typeof raw["deepCleanPdf"] === "boolean"
				? raw["deepCleanPdf"]
				: DEFAULT_SETTINGS.deepCleanPdf,
		maximumScrub:
			typeof raw["maximumScrub"] === "boolean"
				? raw["maximumScrub"]
				: DEFAULT_SETTINGS.maximumScrub,
		language:
			typeof raw["language"] === "string"
				? raw["language"]
				: raw["language"] === null
					? null
					: DEFAULT_SETTINGS.language,
		themeMode: isValidThemeMode(raw["themeMode"])
			? raw["themeMode"]
			: DEFAULT_SETTINGS.themeMode,
	};

	return { ok: true, value: settings };
}
