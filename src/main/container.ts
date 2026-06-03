import { app } from "electron";
import path from "node:path";
import { existsSync } from "node:fs";
import {
	ExiftoolProcess,
	ExifToolAdapter,
	SettingsService,
	ConsoleLogger,
	PdfScrubService,
	removeXattrs,
	exiftoolBinPath,
	qpdfBinPath,
} from "../infrastructure";
import {
	StripMetadataCommand,
	ReadMetadataQuery,
	ExpandFolderCommand,
	XattrCommand,
} from "../application";

export function createContainer(): {
	exiftoolProcess: ExiftoolProcess;
	exiftool: ExifToolAdapter;
	settings: SettingsService;
	logger: ConsoleLogger;
	stripMetadata: StripMetadataCommand;
	readMetadata: ReadMetadataQuery;
	expandFolder: ExpandFolderCommand;
	xattrCommand: XattrCommand;
} {
	const logger = new ConsoleLogger();
	const exiftoolProcess = new ExiftoolProcess({ binPath: exiftoolBinPath });
	const exiftool = new ExifToolAdapter({ process: exiftoolProcess });
	const settingsPath = path.join(app.getPath("userData"), "settings.json");
	const settings = new SettingsService({ filePath: settingsPath, logger });
	const pdfScrub = new PdfScrubService({ logger, qpdfPath: qpdfBinPath });
	const xattrAdapter = { removeXattrs };
	const xattrCommand = new XattrCommand({ xattr: xattrAdapter, logger });
	const stripMetadata = new StripMetadataCommand({
		exiftool,
		pdfScrub,
		// Adapt XattrCommand to the command's minimal XattrRemover shape.
		xattr: { remove: ({ filePath }) => xattrCommand.execute({ filePath }) },
		fileExists: (candidate) => existsSync(candidate),
	});
	const readMetadata = new ReadMetadataQuery({ exiftool });
	const expandFolder = new ExpandFolderCommand();

	return {
		exiftoolProcess,
		exiftool,
		settings,
		logger,
		stripMetadata,
		readMetadata,
		expandFolder,
		xattrCommand,
	};
}

export type Container = ReturnType<typeof createContainer>;

export async function initContainer(container: Container): Promise<void> {
	await container.exiftool.open();
	await container.settings.load();
}
