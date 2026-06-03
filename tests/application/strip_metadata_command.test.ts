import { it, expect, describe, beforeEach } from "vitest";
import { StripMetadataCommand } from "../../src/application/commands/strip_metadata_command";
import type { XattrRemover } from "../../src/application/commands/strip_metadata_command";
import type {
	PdfScrubPort,
	PdfScrubResult,
} from "../../src/application/pdf_scrub_port";
import { FakeExifTool } from "../fakes/fake_exiftool";

class FakePdfScrub implements PdfScrubPort {
	calls: string[] = [];
	result: PdfScrubResult = { processed: true, tool: "qpdf" };
	async scrub({ filePath }: { filePath: string }): Promise<PdfScrubResult> {
		this.calls.push(filePath);
		return this.result;
	}
}

function makeXattr(): XattrRemover & { calls: string[] } {
	const calls: string[] = [];
	return {
		calls,
		remove: async ({ filePath }: { filePath: string }) => {
			calls.push(filePath);
		},
	};
}

let exiftool: FakeExifTool;
let pdfScrub: FakePdfScrub;
let xattr: XattrRemover & { calls: string[] };
let command: StripMetadataCommand;

beforeEach(() => {
	exiftool = new FakeExifTool();
	pdfScrub = new FakePdfScrub();
	xattr = makeXattr();
	command = new StripMetadataCommand({
		exiftool,
		pdfScrub,
		xattr,
		fileExists: () => false,
	});
});

// Fills required params so each test only specifies what it cares about.
function run(
	overrides: Partial<{
		filePath: string;
		preserveOrientation: boolean;
		preserveColorProfile: boolean;
		preserveTimestamps: boolean;
		saveAsCopy: boolean;
		deepCleanPdf: boolean;
		removeXattrs: boolean;
		signal: AbortSignal;
	}> = {},
) {
	return command.execute({
		filePath: "/tmp/photo.jpg",
		preserveOrientation: false,
		preserveColorProfile: false,
		preserveTimestamps: false,
		saveAsCopy: false,
		deepCleanPdf: true,
		removeXattrs: false,
		...overrides,
	});
}

function lastRemoveArgs(): string[] {
	const call = exiftool.calls.find((c) => c.method === "removeMetadata");
	return call!.args[1] as string[];
}

describe("arg assembly", () => {
	it("always starts with -all= as first element", async () => {
		await run();
		expect(lastRemoveArgs()[0]).toBe("-all=");
	});

	it("always includes -m (ignoreMinorErrors) so odd files are not skipped", async () => {
		await run();
		expect(lastRemoveArgs()).toContain("-m");
	});

	it("preserveOrientation=true, preserveColorProfile=false: -Orientation only", async () => {
		await run({ preserveOrientation: true });
		const args = lastRemoveArgs();
		expect(args).toContain("-TagsFromFile");
		expect(args).toContain("@");
		expect(args).toContain("-Orientation");
		expect(args).not.toContain("-ICC_Profile");
	});

	it("preserveColorProfile=true, preserveOrientation=false: -ICC_Profile only", async () => {
		await run({ preserveColorProfile: true });
		const args = lastRemoveArgs();
		expect(args).toContain("-ICC_Profile");
		expect(args).not.toContain("-Orientation");
	});

	it("both preserve flags true: both tags present", async () => {
		await run({ preserveOrientation: true, preserveColorProfile: true });
		const args = lastRemoveArgs();
		expect(args).toContain("-Orientation");
		expect(args).toContain("-ICC_Profile");
	});

	it("both preserve flags false: no -TagsFromFile", async () => {
		await run();
		expect(lastRemoveArgs()).not.toContain("-TagsFromFile");
	});

	it("preserveTimestamps=true: args contain -P", async () => {
		await run({ preserveTimestamps: true });
		expect(lastRemoveArgs()).toContain("-P");
	});

	it("saveAsCopy=false: -overwrite_original and NOT -o", async () => {
		await run();
		const args = lastRemoveArgs();
		expect(args).toContain("-overwrite_original");
		expect(args).not.toContain("-o");
	});

	it("saveAsCopy=true: -o with computed _cleaned path, NOT -overwrite_original", async () => {
		const result = await run({ saveAsCopy: true });
		const args = lastRemoveArgs();
		expect(args).toContain("-o");
		expect(args).toContain("/tmp/photo_cleaned.jpg");
		expect(args).not.toContain("-overwrite_original");
		expect(result.ok && result.value.outputPath).toBe("/tmp/photo_cleaned.jpg");
	});

	it("correct flag order: -all= before -TagsFromFile", async () => {
		await run({ preserveOrientation: true });
		const args = lastRemoveArgs();
		expect(args.indexOf("-all=")).toBeLessThan(args.indexOf("-TagsFromFile"));
	});
});

describe("PDF deep-clean", () => {
	it("runs the structural rewrite for PDFs when deepCleanPdf=true", async () => {
		const result = await run({ filePath: "/tmp/doc.pdf", deepCleanPdf: true });
		expect(pdfScrub.calls).toEqual(["/tmp/doc.pdf"]);
		expect(result.ok && result.value.pdfResidueRisk).toBe(false);
		expect(result.ok && result.value.pdfTool).toBe("qpdf");
	});

	it("flags residue risk when the rewrite tool is unavailable", async () => {
		pdfScrub.result = { processed: false, tool: null };
		const result = await run({ filePath: "/tmp/doc.pdf", deepCleanPdf: true });
		expect(result.ok && result.value.pdfResidueRisk).toBe(true);
	});

	it("flags residue risk and skips rewrite when deepCleanPdf=false", async () => {
		const result = await run({ filePath: "/tmp/doc.pdf", deepCleanPdf: false });
		expect(pdfScrub.calls).toHaveLength(0);
		expect(result.ok && result.value.pdfResidueRisk).toBe(true);
	});

	it("does not touch the PDF scrubber for non-PDF files", async () => {
		const result = await run({ filePath: "/tmp/photo.jpg" });
		expect(pdfScrub.calls).toHaveLength(0);
		expect(result.ok && result.value.pdfTool).toBe(null);
		expect(result.ok && result.value.pdfResidueRisk).toBe(false);
	});

	it("deep-cleans the COPY path in save-as-copy mode, not the original", async () => {
		await run({
			filePath: "/tmp/doc.pdf",
			saveAsCopy: true,
			deepCleanPdf: true,
		});
		expect(pdfScrub.calls).toEqual(["/tmp/doc_cleaned.pdf"]);
	});
});

describe("xattr removal", () => {
	it("removes xattrs from the file when removeXattrs=true", async () => {
		const result = await run({ removeXattrs: true });
		expect(xattr.calls).toEqual(["/tmp/photo.jpg"]);
		expect(result.ok && result.value.xattrsRemoved).toBe(true);
	});

	it("does not remove xattrs when removeXattrs=false", async () => {
		const result = await run({ removeXattrs: false });
		expect(xattr.calls).toHaveLength(0);
		expect(result.ok && result.value.xattrsRemoved).toBe(false);
	});

	it("removes xattrs from the COPY in save-as-copy mode", async () => {
		await run({ saveAsCopy: true, removeXattrs: true });
		expect(xattr.calls).toEqual(["/tmp/photo_cleaned.jpg"]);
	});
});

describe("signal handling", () => {
	it("returns error when signal is already aborted", async () => {
		const controller = new AbortController();
		controller.abort();
		const result = await run({ signal: controller.signal });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("exiftool-error");
		}
		expect(exiftool.calls).toHaveLength(0);
	});
});

describe("error handling", () => {
	it("returns error result when exiftool fails", async () => {
		exiftool.removeResult = {
			ok: false,
			error: { code: "exiftool-error", detail: "Permission denied" },
		};
		const result = await run();
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("exiftool-error");
		}
		// PDF rewrite / xattr must not run after a failed strip.
		expect(pdfScrub.calls).toHaveLength(0);
		expect(xattr.calls).toHaveLength(0);
	});
});
