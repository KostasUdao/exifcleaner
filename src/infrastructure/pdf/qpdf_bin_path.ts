// Pure, electron-free resolver for the optional *bundled* qpdf binary.
//
// qpdf is bundled per-platform under .resources/qpdf/<platform>/bin/ and copied
// into the packaged app's resources by electron-builder. Unlike ExifTool (a
// cross-platform Perl script), qpdf is a native binary, so each OS has its own
// subdirectory. The bundle is OPTIONAL: if the binary is not present for the
// current platform, this returns null and the caller falls back to a qpdf found
// on the system PATH (and then to Ghostscript).

import path from "node:path";

export type QpdfPlatform = "win" | "linux" | "mac";

export function bundledQpdfRelativePath(platform: QpdfPlatform): string {
	const exe = platform === "win" ? "qpdf.exe" : "qpdf";
	return path.join("qpdf", platform, "bin", exe);
}

export function resolveQpdfBinPath({
	resourcesDir,
	platform,
	exists,
}: {
	resourcesDir: string;
	platform: QpdfPlatform;
	exists: (candidate: string) => boolean;
}): string | null {
	const candidate = path.join(resourcesDir, bundledQpdfRelativePath(platform));
	return exists(candidate) ? candidate : null;
}
