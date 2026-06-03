import { it, expect, describe } from "vitest";
import path from "node:path";
import {
	resolveQpdfBinPath,
	bundledQpdfRelativePath,
} from "../../src/infrastructure/pdf/qpdf_bin_path";

describe("bundledQpdfRelativePath", () => {
	it("uses qpdf.exe under win", () => {
		expect(bundledQpdfRelativePath("win")).toBe(
			path.join("qpdf", "win", "bin", "qpdf.exe"),
		);
	});

	it("uses qpdf (no extension) under linux and mac", () => {
		expect(bundledQpdfRelativePath("linux")).toBe(
			path.join("qpdf", "linux", "bin", "qpdf"),
		);
		expect(bundledQpdfRelativePath("mac")).toBe(
			path.join("qpdf", "mac", "bin", "qpdf"),
		);
	});
});

describe("resolveQpdfBinPath", () => {
	const resourcesDir = "/app/resources";

	it("returns the full path when the bundled binary exists", () => {
		const expected = path.join(resourcesDir, "qpdf", "win", "bin", "qpdf.exe");
		const result = resolveQpdfBinPath({
			resourcesDir,
			platform: "win",
			exists: (p) => p === expected,
		});
		expect(result).toBe(expected);
	});

	it("returns null when the bundled binary is absent (fall back to system)", () => {
		const result = resolveQpdfBinPath({
			resourcesDir,
			platform: "linux",
			exists: () => false,
		});
		expect(result).toBe(null);
	});

	it("checks the platform-specific path", () => {
		const seen: string[] = [];
		resolveQpdfBinPath({
			resourcesDir,
			platform: "mac",
			exists: (p) => {
				seen.push(p);
				return false;
			},
		});
		expect(seen).toEqual([
			path.join(resourcesDir, "qpdf", "mac", "bin", "qpdf"),
		]);
	});
});
