import path from "path";
import { existsSync } from "node:fs";
import { getPlatform, Platform } from "../../common";
import { resourcesPath } from "./resources";
import { resolveQpdfBinPath, type QpdfPlatform } from "../pdf/qpdf_bin_path";

enum BinaryPlatformSubpath {
	Win = "win",
	Nix = "nix",
}

enum BinFilename {
	Win = "exiftool.exe",
	Nix = "exiftool",
}

function binariesPath(): string {
	return path.join(resourcesPath(), binaryPlatformSubpath(), "bin");
}

function binaryPlatformSubpath(): BinaryPlatformSubpath {
	const platform = getPlatform();

	switch (getPlatform()) {
		case Platform.WIN:
			return BinaryPlatformSubpath.Win;
		case Platform.NIX:
		case Platform.MAC:
			return BinaryPlatformSubpath.Nix;
		default:
			throw new Error(
				`Could not determine dev Exiftool binary subpath for platform ${platform}`,
			);
	}
}

function binaryFilename(): string {
	const platform = getPlatform();

	switch (platform) {
		case Platform.WIN:
			return BinFilename.Win;
		case Platform.NIX:
		case Platform.MAC:
			return BinFilename.Nix;
		default:
			throw new Error(
				`Could not determine the ExifTool binary path for platform ${platform}`,
			);
	}
}

function getExifToolBinPath(): string {
	return path.resolve(binariesPath(), binaryFilename());
}

export const exiftoolBinPath = getExifToolBinPath();

function qpdfPlatform(): QpdfPlatform {
	const platform = getPlatform();

	switch (platform) {
		case Platform.WIN:
			return "win";
		case Platform.MAC:
			return "mac";
		case Platform.NIX:
			return "linux";
		default:
			throw new Error(
				`Could not determine the qpdf binary platform for ${platform}`,
			);
	}
}

// Path to the bundled qpdf binary, or null when none is bundled for this
// platform (the PDF scrubber then falls back to a system qpdf / Ghostscript).
export const qpdfBinPath: string | null = resolveQpdfBinPath({
	resourcesDir: resourcesPath(),
	platform: qpdfPlatform(),
	exists: existsSync,
});
