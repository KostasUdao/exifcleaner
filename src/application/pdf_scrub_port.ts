// Application port for physically rewriting a PDF so that metadata left behind
// by ExifTool's incremental update is dropped from the file (not merely hidden).
//
// Best-effort by contract: if no rewrite tool is available on the system, the
// implementation resolves with `processed: false` and the caller decides how to
// surface the residual-data risk to the user. It never throws.

export interface PdfScrubResult {
	// true only if a structural rewrite actually ran and removed recoverable
	// residue from the file.
	readonly processed: boolean;
	// which external tool performed the rewrite, if any.
	readonly tool: "qpdf" | "ghostscript" | null;
}

export interface PdfScrubPort {
	scrub(args: { filePath: string }): Promise<PdfScrubResult>;
}
