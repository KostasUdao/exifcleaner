import { it, expect, describe } from "vitest";
import {
	classifyCleaningOutcome,
	isPdfPath,
} from "../../src/domain/exif/cleaning_outcome";

describe("classifyCleaningOutcome", () => {
	it("returns 'no-metadata' when there was nothing and nothing remains", () => {
		expect(classifyCleaningOutcome({ beforeCount: 0, afterCount: 0 })).toBe(
			"no-metadata",
		);
	});

	it("returns 'clean' when metadata existed and none remains", () => {
		expect(classifyCleaningOutcome({ beforeCount: 12, afterCount: 0 })).toBe(
			"clean",
		);
	});

	it("returns 'residual' when metadata still remains after the strip", () => {
		expect(classifyCleaningOutcome({ beforeCount: 12, afterCount: 3 })).toBe(
			"residual",
		);
	});

	it("returns 'residual' for a PDF residue risk even when after=0", () => {
		expect(
			classifyCleaningOutcome({
				beforeCount: 12,
				afterCount: 0,
				pdfResidueRisk: true,
			}),
		).toBe("residual");
	});

	it("PDF residue risk does not override a genuinely empty file", () => {
		// Nothing was there to begin with; an empty PDF is still 'no-metadata'.
		expect(
			classifyCleaningOutcome({
				beforeCount: 0,
				afterCount: 0,
				pdfResidueRisk: true,
			}),
		).toBe("no-metadata");
	});
});

describe("isPdfPath", () => {
	it("detects .pdf case-insensitively", () => {
		expect(isPdfPath({ filePath: "/a/b/file.pdf" })).toBe(true);
		expect(isPdfPath({ filePath: "/a/b/FILE.PDF" })).toBe(true);
		expect(isPdfPath({ filePath: "C:\\docs\\Report.Pdf" })).toBe(true);
	});

	it("returns false for non-PDF and extensionless paths", () => {
		expect(isPdfPath({ filePath: "/a/b/photo.jpg" })).toBe(false);
		expect(isPdfPath({ filePath: "/a/b/noext" })).toBe(false);
		expect(isPdfPath({ filePath: "/a/b/pdf" })).toBe(false);
	});
});
