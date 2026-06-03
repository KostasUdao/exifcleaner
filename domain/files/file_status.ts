// Pure domain logic — zero dependencies, zero I/O.
// Per-file processing states for the UI.

export enum FileProcessingStatus {
	Pending = "pending",
	Reading = "reading",
	Processing = "processing",
	Complete = "complete",
	Error = "error",
	NoMetadataFound = "no-metadata-found",
	// Cleaning ran but metadata still remains (incl. recoverable PDF residue
	// that ExifTool's incremental update cannot remove). Surfaced as a warning
	// so the tool never silently claims a file is clean when it is not.
	Residual = "residual",
}
