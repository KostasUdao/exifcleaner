// Pure domain logic — zero dependencies, zero I/O.
//
// Classifies the outcome of a metadata-stripping pass so the UI can give the
// user an honest, *verifiable* answer to the only question that matters for a
// privacy tool: did everything actually get removed?
//
// Two non-obvious failure modes this guards against:
//
//   1. ExifTool reports a successful write, yet some fields survive. Rare, but
//      possible with malformed files or tags ExifTool will not delete. A naive
//      "exiftool exited 0 => done" check would claim success anyway.
//
//   2. PDFs. ExifTool edits PDFs with an *incremental update*: the old metadata
//      is hidden from ExifTool's own reader but left physically present (and
//      trivially recoverable) in the file. So re-reading a stripped PDF reports
//      "0 tags" even though recoverable data remains. The only real fix is a
//      structural rewrite (qpdf / Ghostscript). When that rewrite did not run,
//      the caller passes `pdfResidueRisk: true` and we must report residue —
//      regardless of what the re-read count says.

export type CleaningOutcome = "no-metadata" | "clean" | "residual";

interface ClassifyCleaningOutcomeParams {
	beforeCount: number;
	afterCount: number;
	pdfResidueRisk?: boolean;
}

export function classifyCleaningOutcome({
	beforeCount,
	afterCount,
	pdfResidueRisk = false,
}: ClassifyCleaningOutcomeParams): CleaningOutcome {
	// Nothing was there and nothing is there: genuinely empty input.
	if (beforeCount === 0 && afterCount === 0) {
		return "no-metadata";
	}
	// PDF whose dead metadata could not be physically removed is never "clean",
	// even when the re-read shows zero tags (see note 2 above).
	if (pdfResidueRisk) {
		return "residual";
	}
	// Re-read still finds embedded metadata: the strip was incomplete.
	if (afterCount > 0) {
		return "residual";
	}
	return "clean";
}

const PDF_EXTENSION = ".pdf";

interface IsPdfPathParams {
	filePath: string;
}

export function isPdfPath({ filePath }: IsPdfPathParams): boolean {
	const lastDot = filePath.lastIndexOf(".");
	if (lastDot === -1) {
		return false;
	}
	return filePath.slice(lastDot).toLowerCase() === PDF_EXTENSION;
}
