# Multi-face detection validation

This regression check uses an AI-generated group portrait with ten fictional
adults. It contains no real-person photo or personal data.

## Input

![AI-generated group portrait containing ten faces](images/multi-face-input-ai-generated.png)

## Expected result

The local web app should create one automatic mosaic region for each of the ten
faces. The detector runs locally over overlapping image tiles, deduplicates
overlapping candidates, and returns at most ten candidates.

## Verified result

![FrameMute applies ten automatic mosaic regions to the AI-generated group portrait](images/multi-face-masking-result.png)

The status message reports `Found 10 face candidate(s). Please review all
results.` Users should still review every automatic mask before exporting.
