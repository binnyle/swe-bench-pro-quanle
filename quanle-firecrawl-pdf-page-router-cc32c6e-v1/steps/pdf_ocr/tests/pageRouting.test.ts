import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

type AnyRecord = Record<string, any>;

const fixturePath = "/tests/pdf_ocr.pdf";
const detectorModelPath =
  process.env.PPOCRV6_DET_MODEL_PATH ??
  "/opt/firecrawl-ocr/ppocrv6-tiny-det/inference.onnx";
const recognizerModelPath =
  process.env.PPOCRV6_REC_MODEL_PATH ??
  "/opt/firecrawl-ocr/ppocrv6-tiny-rec/inference.onnx";

let routingModule: AnyRecord | undefined;
let importError: unknown;

beforeAll(async () => {
  try {
    routingModule = await import("../pageRouting");
  } catch (error) {
    importError = error;
  }
});

function exportedFunction(name: string): (...args: any[]) => any {
  if (!routingModule) {
    throw new Error(
      `Unable to import pageRouting.ts: ${String(importError ?? "unknown error")}`,
    );
  }
  const candidate = routingModule[name];
  if (typeof candidate !== "function") {
    throw new Error(`pageRouting.ts must export ${name}()`);
  }
  return candidate;
}

async function invokeWithFallbacks(
  fn: (...args: any[]) => any,
  variants: any[][],
): Promise<any> {
  const failures: unknown[] = [];
  for (const args of variants) {
    try {
      const value = await fn(...args);
      if (value !== undefined && value !== null) return value;
      failures.push(new Error("function returned no value"));
    } catch (error) {
      failures.push(error);
    }
  }
  throw failures[0] ?? new Error("No supported invocation returned a value");
}

function pageNumber(value: AnyRecord): number {
  return value.pageNumber ?? value.page ?? value.page_number;
}

function routeValue(value: AnyRecord): string {
  return value.route ?? value.parser;
}

function pageResults(value: any): AnyRecord[] {
  if (Array.isArray(value)) return value;
  for (const key of ["pageResults", "results", "pages", "routes", "plan"]) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  throw new Error("Expected an array of page results");
}

function finalMarkdown(value: any): string {
  for (const key of ["markdown", "finalMarkdown", "content"]) {
    if (typeof value?.[key] === "string") return value[key];
  }
  throw new Error("Assembly output must contain the final Markdown string");
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

async function buildPlan(input: AnyRecord): Promise<AnyRecord[]> {
  const fn = exportedFunction("buildPdfPageRoutingPlan");
  const value = await invokeWithFallbacks(fn, [
    [input],
    [input.totalPages, input.pagesNeedingOcr, input.maxPages],
    [input.totalPages, input.maxPages, input.pagesNeedingOcr],
  ]);
  return pageResults(value);
}

function executionRequest(plan: AnyRecord[]): AnyRecord {
  const nativePageResults = [
    {
      pageNumber: 1,
      parser: "native",
      markdown: "NATIVE SHADOW PAGE ONE MUST NOT SURVIVE",
    },
    {
      pageNumber: 2,
      parser: "native",
      markdown: "NATIVE PAGE TWO MARKER",
    },
    {
      pageNumber: 3,
      parser: "native",
      markdown: "NATIVE SHADOW PAGE THREE MUST NOT SURVIVE",
    },
  ];

  return {
    pdfPath: fixturePath,
    filePath: fixturePath,
    plan,
    routes: plan,
    nativePageResults,
    nativeResults: nativePageResults,
    nativeResult: {
      markdown: nativePageResults.map(page => page.markdown).join("\n"),
      pageMarkdown: nativePageResults.map(page => ({
        page: page.pageNumber,
        markdown: page.markdown,
      })),
    },
    detectorModelPath,
    recognizerModelPath,
    modelPaths: {
      detector: detectorModelPath,
      recognizer: recognizerModelPath,
    },
    renderScale: 2,
    timeoutMs: 120_000,
    signal: new AbortController().signal,
  };
}

async function executeFixture(plan: AnyRecord[]): Promise<any> {
  const fn = exportedFunction("executePdfPageRouting");
  const request = executionRequest(plan);
  return invokeWithFallbacks(fn, [
    [request],
    [fixturePath, plan, request.nativePageResults, request],
  ]);
}

describe("buildPdfPageRoutingPlan", () => {
  it("exports all four evaluated functions", () => {
    for (const name of [
      "buildPdfPageRoutingPlan",
      "executePdfPageRouting",
      "assemblePdfPageResults",
      "summarizePdfPageRouting",
    ]) {
      expect(typeof routingModule?.[name], `${name} must be exported`).toBe(
        "function",
      );
    }
  });

  it("returns one ordered one-based route for every processed page", async () => {
    const plan = await buildPlan({
      totalPages: 6,
      pageCount: 6,
      maxPages: 4,
      pagesNeedingOcr: [3, 1],
    });

    expect(plan.map(pageNumber)).toEqual([1, 2, 3, 4]);
    expect(plan.map(routeValue)).toEqual(["ocr", "native", "ocr", "native"]);
    expect(plan.map(route => route.reason)).toEqual([
      "inspector_requires_ocr",
      "inspector_allows_native",
      "inspector_requires_ocr",
      "inspector_allows_native",
    ]);
  });

  it("deduplicates OCR pages and safely ignores invalid or out-of-range values", async () => {
    const plan = await buildPlan({
      totalPages: 5,
      pageCount: 5,
      maxPages: 3,
      pagesNeedingOcr: [3, 1, 3, 0, -2, 2.5, 4, 99],
    });

    expect(plan).toHaveLength(3);
    expect(plan.map(pageNumber)).toEqual([1, 2, 3]);
    expect(plan.filter(route => routeValue(route) === "ocr").map(pageNumber)).toEqual([
      1,
      3,
    ]);
  });
});

describe("executePdfPageRouting", () => {
  it(
    "uses the bundled detector and recognizer for only routed OCR pages",
    async () => {
      await Promise.all([
        access(fixturePath),
        access(detectorModelPath),
        access(recognizerModelPath),
      ]);

      const plan = await buildPlan({
        totalPages: 6,
        pageCount: 6,
        maxPages: 3,
        pagesNeedingOcr: [1, 3],
      });
      const execution = await executeFixture(plan);
      const pages = pageResults(execution);

      expect(pages.map(pageNumber)).toEqual([1, 2, 3]);
      expect(pages.map(page => page.parser)).toEqual(["ocr", "native", "ocr"]);

      const nativePage = pages[1];
      expect(nativePage.markdown).toBe("NATIVE PAGE TWO MARKER");
      expect(nativePage.detections ?? []).toHaveLength(0);

      for (const page of [pages[0], pages[2]]) {
        expect(page.detections?.length).toBeGreaterThan(0);
        expect(page.durationMs).toBeGreaterThanOrEqual(0);
        expect(page.classificationReason).toBe("inspector_requires_ocr");
        for (const detection of page.detections) {
          expect(typeof detection.text).toBe("string");
          expect(detection.text.length).toBeGreaterThan(0);
          expect(detection.confidence).toBeGreaterThanOrEqual(0);
          expect(detection.confidence).toBeLessThanOrEqual(1);
          expect(detection.box).toHaveLength(4);
          expect(detection.box.every((n: unknown) => Number.isFinite(n))).toBe(
            true,
          );
        }
      }

      const pageOneText = pages[0].detections
        .map((detection: AnyRecord) => detection.text)
        .join(" ");
      const pageThreeText = pages[2].detections
        .map((detection: AnyRecord) => detection.text)
        .join(" ");
      expect(pageOneText).toMatch(/chapter/i);
      expect(pageThreeText).toMatch(/support/i);
    },
    120_000,
  );

  it("does not leave rendered page images in the configured temporary directory", async () => {
    const tempDir = path.join(
      "/tmp",
      `firecrawl-routing-test-${process.pid}-${Date.now()}`,
    );
    const plan = await buildPlan({
      totalPages: 6,
      maxPages: 1,
      pagesNeedingOcr: [1],
    });
    const fn = exportedFunction("executePdfPageRouting");
    const request = { ...executionRequest(plan), tempDir, temporaryDirectory: tempDir };
    await invokeWithFallbacks(fn, [[request], [fixturePath, plan, request.nativePageResults, request]]);

    const entries = await readdir(tempDir).catch(error => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    });
    expect(entries.filter(name => /\.(png|jpe?g|webp)$/i.test(name))).toEqual([]);
  }, 120_000);
});

describe("assemblePdfPageResults", () => {
  it("reconstructs column-aware OCR order and assembles deterministic page Markdown", async () => {
    const fn = exportedFunction("assemblePdfPageResults");
    const inputPages = [
      {
        pageNumber: 3,
        parser: "ocr",
        classificationReason: "inspector_requires_ocr",
        detections: [
          { text: "PAGE THREE", confidence: 0.99, box: [10, 10, 180, 30] },
        ],
      },
      {
        pageNumber: 1,
        parser: "ocr",
        classificationReason: "inspector_requires_ocr",
        markdown: "NATIVE DUPLICATE MUST NOT SURVIVE",
        detections: [
          { text: "RIGHT COLUMN", confidence: 0.99, box: [420, 10, 600, 30] },
          { text: "LEFT SECOND", confidence: 0.99, box: [10, 50, 180, 70] },
          { text: "LEFT FIRST", confidence: 0.99, box: [10, 10, 180, 30] },
        ],
      },
      {
        pageNumber: 2,
        parser: "native",
        classificationReason: "inspector_allows_native",
        markdown: "NATIVE PAGE TWO",
      },
    ];

    const assembled = await invokeWithFallbacks(fn, [
      [{ pageResults: inputPages, results: inputPages, pages: inputPages }],
      [inputPages],
    ]);
    const pages = pageResults(assembled);
    const markdown = finalMarkdown(assembled);

    expect(pages.map(pageNumber)).toEqual([1, 2, 3]);
    expect(pages.map(page => page.parser)).toEqual(["ocr", "native", "ocr"]);
    expect(pages.every(page => typeof page.markdown === "string")).toBe(true);

    const leftFirst = markdown.indexOf("LEFT FIRST");
    const leftSecond = markdown.indexOf("LEFT SECOND");
    const rightColumn = markdown.indexOf("RIGHT COLUMN");
    const nativePage = markdown.indexOf("NATIVE PAGE TWO");
    const pageThree = markdown.indexOf("PAGE THREE");
    expect(leftFirst).toBeGreaterThanOrEqual(0);
    expect(leftFirst).toBeLessThan(leftSecond);
    expect(leftSecond).toBeLessThan(rightColumn);
    expect(rightColumn).toBeLessThan(nativePage);
    expect(nativePage).toBeLessThan(pageThree);
    expect(markdown).not.toContain("NATIVE DUPLICATE MUST NOT SURVIVE");
    expect(countOccurrences(markdown, "NATIVE PAGE TWO")).toBe(1);
  });

  it("reports failed or missing pages instead of silently dropping them", async () => {
    const fn = exportedFunction("assemblePdfPageResults");
    const inputPages = [
      { pageNumber: 1, parser: "native", markdown: "ONE" },
      {
        pageNumber: 2,
        parser: "ocr",
        detections: [],
        error: "recognition failed",
      },
      { pageNumber: 3, parser: "native", markdown: "THREE" },
    ];
    const assembled = await invokeWithFallbacks(fn, [
      [{ pageResults: inputPages, results: inputPages, pages: inputPages }],
      [inputPages],
    ]);
    const failed =
      assembled.failedPages ?? assembled.failedOcrPages ?? assembled.missingPages;
    expect(failed).toContain(2);
  });
});

describe("summarizePdfPageRouting", () => {
  it("derives required telemetry from the actual plan, execution, and assembly", async () => {
    const fn = exportedFunction("summarizePdfPageRouting");
    const plan = [
      { pageNumber: 1, route: "ocr", reason: "inspector_requires_ocr" },
      { pageNumber: 2, route: "native", reason: "inspector_allows_native" },
      { pageNumber: 3, route: "ocr", reason: "inspector_requires_ocr" },
    ];
    const execution = [
      { pageNumber: 1, parser: "ocr", detections: [{ text: "ONE", confidence: 0.9, box: [0, 0, 1, 1] }], durationMs: 20 },
      { pageNumber: 2, parser: "native", markdown: "TWO", durationMs: 0 },
      { pageNumber: 3, parser: "ocr", detections: [], durationMs: 25, error: "failed" },
    ];
    const assembly = {
      markdown: "ONE\n\nTWO",
      pageResults: [
        { pageNumber: 1, parser: "ocr", markdown: "ONE" },
        { pageNumber: 2, parser: "native", markdown: "TWO" },
      ],
      failedPages: [3],
    };
    const timings = {
      nativeInspectionMs: 12,
      renderingMs: 7,
      ocrMs: 45,
      assemblyMs: 3,
    };
    const request = {
      totalPages: 6,
      processedPages: 3,
      plan,
      routingPlan: plan,
      execution,
      executionResults: execution,
      assembly,
      assemblyResult: assembly,
      timings,
    };

    const summary = await invokeWithFallbacks(fn, [
      [request],
      [plan, execution, assembly, timings, 6],
    ]);

    expect(summary.totalPages).toBe(6);
    expect(summary.processedPages).toBe(3);
    expect(summary.nativePages).toEqual([2]);
    expect(summary.ocrPages ?? summary.pagesRequiringOcr).toEqual([1, 3]);
    expect(summary.classificationReasons).toEqual({
      1: "inspector_requires_ocr",
      2: "inspector_allows_native",
      3: "inspector_requires_ocr",
    });
    expect(summary.failedOcrPages ?? summary.failedPages).toEqual([3]);
    expect(summary.actualParserMix ?? summary.parserMix).toEqual({
      native: 1,
      ocr: 1,
    });
    expect(summary.fallbackRequired).toBe(true);

    const reportedTimings = summary.timings ?? summary.stageTimings;
    expect(reportedTimings).toMatchObject(timings);
  });
});

describe("page-aware PDF routing integration", () => {
  it(
    "produces ordered mixed-parser Markdown from the hidden six-page PDF fixture",
    async () => {
      const plan = await buildPlan({
        totalPages: 6,
        pageCount: 6,
        maxPages: 3,
        pagesNeedingOcr: [1, 3],
      });
      const execution = await executeFixture(plan);
      const executedPages = pageResults(execution);
      const assemble = exportedFunction("assemblePdfPageResults");
      const assembled = await invokeWithFallbacks(assemble, [
        [{ pageResults: executedPages, results: executedPages, pages: executedPages }],
        [executedPages],
      ]);
      const pages = pageResults(assembled);
      const markdown = finalMarkdown(assembled);

      expect(pages.map(pageNumber)).toEqual([1, 2, 3]);
      expect(pages.map(page => page.parser)).toEqual(["ocr", "native", "ocr"]);
      expect(markdown).toMatch(/chapter/i);
      expect(markdown).toContain("NATIVE PAGE TWO MARKER");
      expect(markdown).toMatch(/support/i);
      expect(markdown.toLowerCase().indexOf("chapter")).toBeLessThan(
        markdown.indexOf("NATIVE PAGE TWO MARKER"),
      );
      expect(markdown.indexOf("NATIVE PAGE TWO MARKER")).toBeLessThan(
        markdown.toLowerCase().indexOf("support"),
      );
      expect(markdown).not.toContain("NATIVE SHADOW PAGE ONE MUST NOT SURVIVE");
      expect(markdown).not.toContain("NATIVE SHADOW PAGE THREE MUST NOT SURVIVE");
    },
    120_000,
  );
});
