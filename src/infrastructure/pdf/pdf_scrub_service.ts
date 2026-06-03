import { spawn } from "node:child_process";
import { rename, unlink } from "node:fs/promises";
import path from "node:path";
import type { LoggerPort } from "../../application";
import type { PdfScrubPort, PdfScrubResult } from "../../application";

// Rewrites a PDF to physically drop the orphaned metadata objects ExifTool's
// incremental update leaves behind. Prefers qpdf (lossless structural rewrite);
// falls back to Ghostscript (re-render). If neither tool is available the
// service resolves with processed=false so the caller can warn the user.
//
// External-process plumbing is injected as a `CommandRunner` so the orchestration
// (qpdf -> ghostscript -> none) and the pure argument builders below can be unit
// tested without invoking real binaries.

export interface CommandRunResult {
	readonly ok: boolean;
}

export type CommandRunner = (args: {
	command: string;
	commandArgs: string[];
}) => Promise<CommandRunResult>;

// qpdf --linearize forces a full structural rewrite. qpdf only emits objects
// reachable from the trailer, so the now-orphaned objects from ExifTool's
// incremental update are not written out. --replace-input edits in place safely
// (qpdf writes to a temp file and atomically swaps).
export function buildQpdfArgs({ filePath }: { filePath: string }): string[] {
	return ["--linearize", "--replace-input", filePath];
}

// Ghostscript pdfwrite re-renders the document, which also drops dead metadata.
// Lossier than qpdf, hence the fallback. Writes to `output`; caller swaps it in.
export function buildGhostscriptArgs({
	input,
	output,
}: {
	input: string;
	output: string;
}): string[] {
	return [
		"-q",
		"-dNOPAUSE",
		"-dBATCH",
		"-dSAFER",
		"-sDEVICE=pdfwrite",
		"-dPDFSETTINGS=/prepress",
		`-sOutputFile=${output}`,
		input,
	];
}

const defaultRunner: CommandRunner = ({ command, commandArgs }) =>
	new Promise((resolve) => {
		const child = spawn(command, commandArgs, { stdio: "ignore" });
		child.on("error", () => resolve({ ok: false }));
		child.on("close", (code) => resolve({ ok: code === 0 }));
	});

export class PdfScrubService implements PdfScrubPort {
	private readonly run: CommandRunner;
	private readonly logger: LoggerPort;
	private readonly qpdfPath: string | null;

	constructor({
		logger,
		qpdfPath,
		run,
	}: {
		logger: LoggerPort;
		// Path to a bundled qpdf binary. When null/absent, falls back to a qpdf
		// found on the system PATH.
		qpdfPath?: string | null;
		run?: CommandRunner;
	}) {
		this.logger = logger;
		this.qpdfPath = qpdfPath ?? null;
		this.run = run ?? defaultRunner;
	}

	async scrub({ filePath }: { filePath: string }): Promise<PdfScrubResult> {
		// 1) qpdf — preferred, lossless structural rewrite. Try the bundled
		//    binary first (offline, version we control), then a system qpdf.
		const qpdfCommands =
			this.qpdfPath !== null ? [this.qpdfPath, "qpdf"] : ["qpdf"];
		for (const command of qpdfCommands) {
			const qpdf = await this.run({
				command,
				commandArgs: buildQpdfArgs({ filePath }),
			});
			if (qpdf.ok) {
				return { processed: true, tool: "qpdf" };
			}
		}

		// 2) Ghostscript fallback. Write a temp file alongside the original to
		//    avoid cross-filesystem rename (EXDEV), then atomically swap.
		const tmpOutput = path.join(
			path.dirname(filePath),
			`.exifcleaner-tmp-${Date.now()}-${path.basename(filePath)}`,
		);
		const gs = await this.run({
			command: "gs",
			commandArgs: buildGhostscriptArgs({ input: filePath, output: tmpOutput }),
		});
		if (gs.ok) {
			try {
				await rename(tmpOutput, filePath);
				return { processed: true, tool: "ghostscript" };
			} catch (err: unknown) {
				await unlink(tmpOutput).catch(() => undefined);
				this.logger.warn({
					message: "Ghostscript produced output but replacing the file failed",
					context: {
						filePath,
						error: err instanceof Error ? err.message : String(err),
					},
				});
			}
		}

		// 3) No working rewrite tool — recoverable metadata may remain in the PDF.
		this.logger.warn({
			message:
				"PDF deep-clean skipped: no working qpdf/Ghostscript found. " +
				"Recoverable metadata may remain inside the PDF.",
			context: { filePath },
		});
		return { processed: false, tool: null };
	}
}
