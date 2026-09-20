# Verixa AI Backend API

Base URL: `http://localhost:5000`

Production/public deployments should set `PUBLIC_API_BASE_URL` and use that domain instead of localhost.

## Health

### GET /

Returns backend availability.

Response:

```json
{
  "name": "Verixa AI Backend",
  "status": "running"
}
```

## Upload a file

### POST /api/upload

Request: multipart form-data with a field named `file`.

Supported extensions:
- .pptx
- .docx
- .pdf
- .png
- .jpg
- .jpeg

Required field:
- `file`

Response:

```json
{
  "success": true,
  "scanId": "uuid",
  "filename": "sample.pptx",
  "fileType": "pptx",
  "status": "uploaded"
}
```

Errors:
- invalid extension: `400`
- oversize file: `413`
- missing file: `400`

## Start scan processing

### POST /api/scan

Request body:

```json
{
  "scanId": "uuid"
}
```

Response:

```json
{
  "success": true,
  "scanId": "uuid",
  "status": "completed",
  "report": {
    "scanId": "uuid",
    "filename": "sample.pdf",
    "fileType": "pdf",
    "status": "completed",
    "overallScore": 90,
    "scores": {
      "content": 90,
      "typography": 85,
      "layout": 88,
      "visualHierarchy": 87,
      "readability": 89,
      "consistency": 92,
      "technical": 95
    },
    "issues": [],
    "summary": "The file passes basic quality checks.",
    "recommendations": []
  }
}
```

## Get scan status

### GET /api/scan/:scanId/status

Response:

```json
{
  "scanId": "uuid",
  "filename": "sample.pdf",
  "fileType": "pdf",
  "status": "completed",
  "createdAt": "2026-09-20T12:00:00.000Z"
}
```

## Get report

### GET /api/scan/:scanId/report

Returns the final inspection report for the scan.

Errors:
- missing scan ID: `404`
- scan not finished: `202` with a progress payload, or `404` if unknown

## Download original file

### GET /api/scan/:scanId/download

Returns the uploaded file for the scan.

Response:
- raw file stream
- content-type based on MIME type

Errors:
- missing file: `404`
- scan not found: `404`
