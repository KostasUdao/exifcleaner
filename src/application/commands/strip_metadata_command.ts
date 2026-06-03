import type { ExifToolPort } from "../exiftool_port";
import type { PdfScrubPort } from "../pdf_scrub_port";
import type { Result } from "../../common";
import type { ExifError } from "../../domain";
import { generateCleanedPath, isPdfPath } from "../../domain";

// Minimal xattr capability the command needs. The container adapts the existing
// XattrCommand to this shape, keeping logger plumbing out of this command.
export interface XattrRemover {
	remove(args: { filePath: string }): Promise<void>;
}

export interface StripMetadataResult {
	// Where the cleaned file is. null => original overwritten in place.
	readonly outputPath: string | null;
	// true when recoverable metadata may remain in a PDF (no rewrite tool ran).
	readonly pdfResidueRisk: boolean;
	readonly pdfTool: "qpdf" | "ghostscript" | null;
	readonly xattrsRemoved: boolean;
}

export class StripMetadataCommand {
	private readonly exiftool: ExifToolPort;
	private readonly pdfScrub: PdfScrubPort;
	private readonly xattr: XattrRemover;
	private readonly fileExists: (candidate: string) => boolean;

	constructor({
		exiftool,
		pdfScrub,
		xattr,
		fileExists,
	}: {
		exiftool: ExifToolPort;
		pdfScrub: PdfScrubPort;
		xattr: XattrRemover;
		fileExists: (candidate: string) => boolean;
	}) {
		this.exiftool = exiftool;
		this.pdfScrub = pdfScrub;
		this.xattr = xattr;
		this.fileExists = fileExists;
	}

	async execute({
		filePath,
		preserveOrientation,
		preserveColorProfile,
		preserveTimestamps,
		saveAsCopy,
		deepCleanPdf,
		removeXattrs,
		signal,
	}: {
		filePath: string;
		preserveOrientation: boolean;
		preserveColorProfile: boolean;
		preserveTimestamps: boolean;
		saveAsCopy: boolean;
		deepCleanPdf: boolean;
		removeXattrs: boolean;
		signal?: AbortSignal | undefined;
	}): Promise<Result<StripMetadataResult, ExifError>> {
		if (signal?.aborted) {
			return {
				ok: false,
				error: { code: "exiftool-error", detail: "Aborted" },
			};
		}

		// CRITICAL FLAG ORDER: -all= must come before -TagsFromFile. ExifTool
		// processes flags left-to-right, so we strip everything first, then copy
		// back only the tags the user chose to preserve.
		//
		// -m (ignoreMinorErrors): without it ExifTool aborts on minor/recoverable
		// warnings, which would silently leave an odd-but-valid file UNcleaned.
		// For a privacy tool, failing closed (and reporting it) beats skipping.
		const args: string[] = ["-all=", "-m"];

		const preserveTags: string[] = [];
		if (preserveOrientation) preserveTags.push("-Orientation");
		if (preserveColorProfile) preserveTags.push("-ICC_Profile");
		if (preserveTags.length > 0) {
			args.push("-TagsFromFile", "@", ...preserveTags);
		}

		if (preserveTimestamps) {
			args.push("-P");
		}

		let outputPath: string | null = null;
		if (saveAsCopy) {
			outputPath = generateCleanedPath({
				filePath,
				exists: this.fileExists,
			});
			args.push("-o", outputPath);
		} else {
			args.push("-overwrite_original");
		}

		const result = await this.exiftool.removeMetadata({ filePath, args });
		if (!result.ok) {
			return result;
		}

		// Operate on the file we actually produced.
		const effectivePath = outputPath ?? filePath;

		// PDF deep-clean: ExifTool only hides PDF metadata via an incremental
		// update; a structural rewrite is required to physically remove it.
		let pdfResidueRisk = false;
		let pdfTool: "qpdf" | "ghostscript" | null = null;
		if (isPdfPath({ filePath: effectivePath })) {
			if (deepCleanPdf) {
				const scrub = await this.pdfScrub.scrub({ filePath: effectivePath });
				pdfResidueRisk = !scrub.processed;
				pdfTool = scrub.tool;
			} else {
				// Deep-clean disabled: we KNOW ExifTool leaves recoverable residue.
				pdfResidueRisk = true;
			}
		}

		// Strip macOS extended attributes (quarantine, download origin, Finder
		// tags). No-op off macOS inside the adapter.
		let xattrsRemoved = false;
		if (removeXattrs) {
			await this.xattr.remove({ filePath: effectivePath });
			xattrsRemoved = true;
		}

		return {
			ok: true,
			value: { outputPath, pdfResidueRisk, pdfTool, xattrsRemoved },
		};
	}
}
