# Build page-aware PDF routing with OCR

Firecrawl’s native PDF inspector identifies pages that require OCR through pagesNeedingOcr. Firecrawl currently handles OCR
through externally configured services and does not combine native extraction with a bundled local OCR engine on a page-by-page
basis.

Implement page-aware PDF processing that preserves accepted native content while processing only OCR-required pages with a local ocr model.

## Goal

For each requested PDF page:

- Use native extraction when the inspector accepts the page.
- Use local OCR when the inspector marks the page as requiring OCR.
- Preserve the original page order.
- Produce one consumable Markdown document.
- Report actual routing, timing, and failure telemetry.
- Preserve existing fallback behavior if local OCR cannot produce a complete result.

## Local OCR model

Use both components of PP-OCRv6 Tiny:

- PaddlePaddle/PP-OCRv6_tiny_det_onnx
- PaddlePaddle/PP-OCRv6_tiny_rec_onnx

## Expected workflow

1. Download and validate the PDF through the existing PDF engine:
- There are pdf utils that decide whether it should be processed by ocr or extractable use that

2. Run the existing native pdf inspection and process utility.
- Preserve the current page count, maxPages, PDF type, confidence, complexity, and pagesNeedingOcr behavior.

3. Build a route for every processed page:
Each page must be classified as:
- native
- ocr

  Pages listed in pagesNeedingOcr use the OCR route. Other processed pages use the native route.

4. route the ocr pages to the ocr model

- transform page that need ocr into images
- pass image to model
- collect the output

5. Organize the order of the output
- Reconstruct the reading order of the OCR detections.
- Convert the organized result into expected markdown

6. Assemble the final markdown using native utils and the ocr output

## Expected functions
Create a .ts called pageRouting.ts



The module should expose these function for evaluation:

- buildPdfPageRoutingPlan()
- executePdfPageRouting()
- assemblePdfPageResults()
- summarizePdfPageRouting()


`buildPdfPageRoutingPlan()`

This should do the following:

- Produce one-based page numbers.
- Respect maxPages.
- Return routes in page order.
- Deduplicate pagesNeedingOcr.
- Ignore invalid or out-of-range page numbers.
- Assign a classification reason to every page.

Example output:

```json
[
    {
      pageNumber: 1,
      route: "ocr",
      reason: "inspector_requires_ocr",
    },
    {
      pageNumber: 2,
      route: "ocr",
      reason: "inspector_requires_ocr",
    },
    {
      pageNumber: 3,
      route: "ocr",
      reason: "inspector_requires_ocr",
    },
    {
      pageNumber: 4,
      route: "native",
      reason: "inspector_allows_native",
    },
  ]
```

`executePdfPageRouting()`

This should:

1. Reuses the already-downloaded PDF.
2. Passes native page results through unchanged.
3. Renders pages 1 and 3 into images.
4. Sends those images through the local detector and recognizer.
5. Records recognized text, confidence, and bounding boxes.
6. Preserves each original page number.
7. Measures rendering and OCR time.
8. Records page-level failures.
9. Cleans up rendered images.
10. Stops appropriately on cancellation or timeout.

for example
```json
[
    {
      pageNumber: 1,
      parser: "ocr",
      detections: [
        {
          text: "Chapter I",
          confidence: 0.94,
          box: [239, 0, 716, 154],
        }
      ],
      durationMs: 151,
      classificationReason: "inspector_requires_ocr",
    },
    {
      pageNumber: 2,
      parser: "native",
      markdown: "Existing native page content...",
      durationMs: 0,
      classificationReason: "inspector_allows_native",
    },
    {
      pageNumber: 3,
      parser: "ocr",
      detections: [
        {
          text: "Support",
          confidence: 0.98,
          box: [100, 200, 300, 230],
        }
      ],
      durationMs: 99,
      classificationReason: "inspector_requires_ocr",
    }
  ]
```

`summarizePdfPageRouting()`
This should:

1. Takes native Markdown and raw OCR detections.
2. Orders OCR detections using their bounding-box coordinates.
3. Handles column ordering where possible.
4. Converts ordered OCR text into page-level Markdown.
5. Sorts every page by its original page number.
6. Joins the pages into one deterministic Markdown document.
7. Reports failed or missing pages.
8. Prevents duplicated native and OCR content.

The output object should has page number, parser used and the markdown extracted

`buildPdfPageRoutingPlan()`

This should produces structured telemetry from the routing plan, execution results, assembly result, and recorded timings.

It returns:

- Total and processed pages.
- Native and OCR page numbers.
- Classification reasons.
- Per-stage timings.
- Failed OCR pages.
- Actual parser mix.
- Whether fallback processing was required.


## Constraints

- Do not download model weights during request handling.
- Do not require a third-party OCR API.
- Do not introduce regressions in the existing PDF pipeline.
