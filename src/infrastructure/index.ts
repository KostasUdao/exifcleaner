// Infrastructure layer barrel file — re-exports adapters, services, and utilities.

export type { ExifToolResult, ExifToolCloseResult } from "./exiftool/types";

export { ExiftoolProcess } from "./exiftool/ExiftoolProcess";
export { ExifToolAdapter } from "./exiftool/exiftool_adapter";
export { SettingsService } from "./settings_service";
export { ConsoleLogger } from "./console_logger";
export { removeXattrs } from "./xattr_service";
export {
	PdfScrubService,
	buildQpdfArgs,
	buildGhostscriptArgs,
} from "./pdf/pdf_scrub_service";
export type { CommandRunner, CommandRunResult } from "./pdf/pdf_scrub_service";
export {
	resolveQpdfBinPath,
	bundledQpdfRelativePath,
} from "./pdf/qpdf_bin_path";
export type { QpdfPlatform } from "./pdf/qpdf_bin_path";
export { exiftoolBinPath, qpdfBinPath } from "./electron/binaries";
export {
	currentBrowserWindow,
	defaultBrowserWindow,
	restoreWindowAndFocus,
} from "./electron/browser_window";
export { isProd, isDev } from "./electron/env";
export { resourcesPath, iconPath, checkmarkPath } from "./electron/resources";
export {
	i18n,
	preloadI18nStrings,
	getI18nStrings,
} from "./electron/i18n_strings";
