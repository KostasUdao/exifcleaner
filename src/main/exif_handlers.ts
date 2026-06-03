import { ipcMain } from "electron";
import type { Container } from "./container";
import { createValidatedHandler } from "./ipc/ipc_validation";
import { exifReadSchema, exifRemoveSchema } from "./ipc/ipc_schemas";
import { formatExifError } from "../domain";

export function setupExifHandlers({
	container,
}: {
	container: Container;
}): void {
	ipcMain.handle(
		"exif:read",
		createValidatedHandler(exifReadSchema, async (filePath) => {
			const result = await container.readMetadata.execute({ filePath });
			if (result.ok) {
				return result.value;
			}
			return {};
		}),
	);

	ipcMain.handle(
		"exif:remove",
		createValidatedHandler(exifRemoveSchema, async (filePath) => {
			const settings = container.settings.get();
			// Maximum scrub overrides the fidelity-preserving toggles for the most
			// thorough wipe, and always deep-cleans PDFs.
			const max = settings.maximumScrub;
			const result = await container.stripMetadata.execute({
				filePath,
				preserveOrientation: max ? false : settings.preserveOrientation,
				preserveColorProfile: max ? false : settings.preserveColorProfile,
				preserveTimestamps: settings.preserveTimestamps,
				saveAsCopy: settings.saveAsCopy,
				deepCleanPdf: settings.deepCleanPdf || max,
				removeXattrs: settings.removeXattrs,
			});
			if (result.ok) {
				return {
					ok: true,
					error: null,
					outputPath: result.value.outputPath,
					pdfResidueRisk: result.value.pdfResidueRisk,
					pdfTool: result.value.pdfTool,
					xattrsRemoved: result.value.xattrsRemoved,
				};
			}
			return {
				ok: false,
				error: formatExifError(result.error),
				outputPath: null,
				pdfResidueRisk: false,
				pdfTool: null,
				xattrsRemoved: false,
			};
		}),
	);
}
