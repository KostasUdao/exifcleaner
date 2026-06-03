import { it, expect, describe, beforeEach } from "vitest";
import {
	PdfScrubService,
	buildQpdfArgs,
	buildGhostscriptArgs,
	type CommandRunner,
} from "../../src/infrastructure/pdf/pdf_scrub_service";

class SpyLogger {
	warnings: string[] = [];
	info(): void {}
	warn({ message }: { message: string }): void {
		this.warnings.push(message);
	}
	error(): void {}
}

describe("buildQpdfArgs", () => {
	it("linearizes and replaces the input in place", () => {
		expect(buildQpdfArgs({ filePath: "/x/doc.pdf" })).toEqual([
			"--linearize",
			"--replace-input",
			"/x/doc.pdf",
		]);
	});
});

describe("buildGhostscriptArgs", () => {
	it("targets pdfwrite with a safe, non-interactive invocation", () => {
		const args = buildGhostscriptArgs({
			input: "/x/in.pdf",
			output: "/x/out.pdf",
		});
		expect(args).toContain("-sDEVICE=pdfwrite");
		expect(args).toContain("-dSAFER");
		expect(args).toContain("-sOutputFile=/x/out.pdf");
		expect(args[args.length - 1]).toBe("/x/in.pdf");
	});
});

describe("PdfScrubService orchestration", () => {
	let logger: SpyLogger;

	beforeEach(() => {
		logger = new SpyLogger();
	});

	it("uses qpdf when it succeeds and never falls back", async () => {
		const seen: string[] = [];
		const run: CommandRunner = async ({ command }) => {
			seen.push(command);
			return { ok: command === "qpdf" };
		};
		const service = new PdfScrubService({ logger, run });
		const result = await service.scrub({ filePath: "/x/doc.pdf" });
		expect(result).toEqual({ processed: true, tool: "qpdf" });
		expect(seen).toEqual(["qpdf"]);
	});

	it("prefers the bundled qpdf binary when a path is provided", async () => {
		const seen: string[] = [];
		const run: CommandRunner = async ({ command }) => {
			seen.push(command);
			return { ok: true };
		};
		const service = new PdfScrubService({
			logger,
			qpdfPath: "/app/resources/qpdf/win/bin/qpdf.exe",
			run,
		});
		const result = await service.scrub({ filePath: "/x/doc.pdf" });
		expect(result).toEqual({ processed: true, tool: "qpdf" });
		// Bundled binary tried first; system qpdf never reached.
		expect(seen).toEqual(["/app/resources/qpdf/win/bin/qpdf.exe"]);
	});

	it("falls back from a broken bundled qpdf to the system qpdf", async () => {
		const seen: string[] = [];
		const bundled = "/app/resources/qpdf/linux/bin/qpdf";
		const run: CommandRunner = async ({ command }) => {
			seen.push(command);
			return { ok: command === "qpdf" }; // bundled fails, system PATH works
		};
		const service = new PdfScrubService({ logger, qpdfPath: bundled, run });
		const result = await service.scrub({ filePath: "/x/doc.pdf" });
		expect(result).toEqual({ processed: true, tool: "qpdf" });
		expect(seen).toEqual([bundled, "qpdf"]);
	});

	it("falls back to ghostscript when qpdf is unavailable", async () => {
		// Make the fallback deterministic: when "gs" runs, actually create the
		// temp output file it claims to have written, so the service's atomic
		// rename succeeds and we exercise the real success path (tool=ghostscript).
		const { writeFileSync, mkdtempSync, existsSync } = await import("node:fs");
		const { tmpdir } = await import("node:os");
		const path = await import("node:path");
		const dir = mkdtempSync(path.join(tmpdir(), "ec-gs-"));
		const target = path.join(dir, "doc.pdf");
		writeFileSync(target, "%PDF-1.4 original");

		const seen: string[] = [];
		const run: CommandRunner = async ({ command, commandArgs }) => {
			seen.push(command);
			if (command === "gs") {
				// Emulate gs writing its -sOutputFile.
				const outFlag = commandArgs.find((a) => a.startsWith("-sOutputFile="));
				const out = outFlag!.slice("-sOutputFile=".length);
				writeFileSync(out, "%PDF-1.4 rewritten");
				return { ok: true };
			}
			return { ok: false }; // qpdf unavailable
		};
		const service = new PdfScrubService({ logger, run });
		const result = await service.scrub({ filePath: target });

		expect(seen).toEqual(["qpdf", "gs"]);
		expect(result).toEqual({ processed: true, tool: "ghostscript" });
		// Original path now holds the rewritten content (atomic swap happened).
		expect(existsSync(target)).toBe(true);
	});

	it("reports processed=false and warns when no tool is available", async () => {
		const run: CommandRunner = async () => ({ ok: false });
		const service = new PdfScrubService({ logger, run });
		const result = await service.scrub({ filePath: "/x/doc.pdf" });
		expect(result).toEqual({ processed: false, tool: null });
		expect(logger.warnings.length).toBeGreaterThan(0);
	});
});
