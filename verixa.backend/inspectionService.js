const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { imageSize } = require('image-size');
const JSZip = require('jszip');
const mammoth = require('mammoth');
const pdfParseModule = require('pdf-parse');
const pdfParse = pdfParseModule.default || pdfParseModule;
const { config } = require('../config');
const { getSupabaseClient } = require('../supabase');
const { upsertScan, getScan } = require('./scanStore');

function createError(code, message, status = 400) {
  return { success: false, error: { code, message }, status };
}

function computeScore(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function normalizeIssue(issue) {
  return {
    category: issue.category || 'content',
    severity: issue.severity || 'medium',
    location: issue.location || 'document',
    issue: issue.issue || 'Issue detected',
    evidence: issue.evidence || 'Observed in extracted document metadata.',
    whyItMatters: issue.whyItMatters || 'It may impact readability or professionalism.',
    suggestion: issue.suggestion || 'Review the content and align with the document standards.'
  };
}

async function extractImageMetadata(fileBuffer) {
  const dims = imageSize(fileBuffer);
  const width = dims && dims.width ? dims.width : 0;
  const height = dims && dims.height ? dims.height : 0;
  const aspectRatio = width && height ? width / height : 0;
  const fileSize = fileBuffer.length;

  return {
    width,
    height,
    aspectRatio,
    resolution: width && height ? `${width}x${height}` : 'unknown',
    fileSize,
    qualityIndicators: {
      approxMegapixels: width && height ? (width * height) / 1000000 : 0,
      isLowResolution: width < 800 || height < 600,
      aspectRatio,
    },
    ocrText: '',
    layout: {
      dimensions: `${width}x${height}`,
      orientation: width >= height ? 'landscape' : 'portrait',
    }
  };
}

async function extractPdf(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const raw = fileBuffer.toString('latin1');
  let parsed = null;
  let extractedText = '';

  try {
    parsed = await pdfParse(fileBuffer);
  } catch (error) {
    parsed = null;
  }

  if (parsed) {
    const pages = Array.isArray(parsed.pages) ? parsed.pages : [];
    extractedText = typeof parsed.text === 'string' ? parsed.text : '';
    const fallbackText = pages.map((page) => page && page.str ? page.str : '').join(' ').trim();
    extractedText = fallbackText || extractedText;

    const pageCount = pages.length || (parsed.numpages ? Number(parsed.numpages) : 1);
    const pageInfo = pages.map((page, index) => ({
      pageNumber: index + 1,
      text: page && page.str ? page.str : '',
      width: page && page.width ? page.width : 0,
      height: page && page.height ? page.height : 0,
      fontInfo: page && page.font ? page.font : 'unknown'
    }));

    return {
      pages: pageCount,
      text: extractedText,
      pageInfo,
      layout: {
        pageCount,
        pageDimensions: pageInfo.map((item) => ({ pageNumber: item.pageNumber, width: item.width, height: item.height }))
      },
      images: [],
      mimeType: 'application/pdf'
    };
  }

  const textMatches = [...raw.matchAll(/\(([^()\\]*(?:\\.[^()\\]*)*)\)/g)].map((match) => match[1].replace(/\\([0-9a-fA-F]{2})/g, ''));
  const fallbackText = textMatches.join(' ').trim();
  const pageCount = raw.match(/\/Type \/Page/g)?.length || 1;

  return {
    pages: pageCount,
    text: fallbackText || raw.slice(0, 500),
    pageInfo: Array.from({ length: pageCount }, (_, index) => ({
      pageNumber: index + 1,
      text: fallbackText || '',
      width: 0,
      height: 0,
      fontInfo: 'unknown'
    })),
    layout: {
      pageCount,
      pageDimensions: Array.from({ length: pageCount }, (_, index) => ({ pageNumber: index + 1, width: 0, height: 0 }))
    },
    images: [],
    mimeType: 'application/pdf'
  };
}

async function extractDocx(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer: fileBuffer });
  const text = result.value || '';
  const paragraphs = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const headings = paragraphs.filter((p) => p.length < 120 && /^(?:[A-Z]|\d+\.)/.test(p)).slice(0, 20);

  return {
    paragraphs,
    headings,
    text,
    fontInfo: [],
    tables: [],
    images: [],
    headersFooters: {},
    sections: { paragraphCount: paragraphs.length }
  };
}

async function extractPptx(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(fileBuffer);
  const slideFiles = Object.keys(zip.files).filter((file) => /(?:^|\/)slides\/slide\d+\.xml$/i.test(file));
  const slides = [];

  for (const slideFile of slideFiles) {
    const xml = await zip.file(slideFile)?.async('string');
    if (!xml) continue;

    const titleMatches = [...xml.matchAll(/<a:t[^>]*>(.*?)<\/a:t>/gs)]
      .map((match) => match[1].replace(/<.*?>/g, '').trim())
      .filter(Boolean);
    const titleText = titleMatches.join(' ').trim();
    const bodyText = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    slides.push({
      title: titleText || 'Untitled slide',
      text: bodyText || titleText,
      textBlocks: titleMatches,
      dimensions: { width: 9144000, height: 6858000 }
    });
  }

  if (slides.length === 0) {
    const presentationXml = await zip.file('ppt/presentation.xml')?.async('string');
    const slideCountFromXml = presentationXml ? (presentationXml.match(/<p:sldId\b/g) || []).length : 0;
    const fallbackSlideCount = Math.max(slideCountFromXml, 1);
    for (let index = 1; index <= fallbackSlideCount; index += 1) {
      const slideXmlPath = `ppt/slides/slide${index}.xml`;
      const xml = await zip.file(slideXmlPath)?.async('string');
      if (!xml) continue;
      const titleMatches = [...xml.matchAll(/<a:t[^>]*>(.*?)<\/a:t>/gs)]
        .map((match) => match[1].replace(/<.*?>/g, '').trim())
        .filter(Boolean);
      slides.push({
        title: titleMatches.join(' ').trim() || `Slide ${index}`,
        text: xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        textBlocks: titleMatches,
        dimensions: { width: 9144000, height: 6858000 }
      });
    }
  }

  return {
    slideCount: slides.length || 1,
    slides,
    slideText: slides.map((slide) => slide.text).join('\n'),
    titles: slides.map((slide) => slide.title),
    paragraphs: slides.flatMap((slide) => slide.textBlocks),
    fontInfo: [],
    images: [],
    dimensions: { width: 9144000, height: 6858000 }
  };
}

async function extractByType(fileType, filePath) {
  if (fileType === 'png' || fileType === 'jpg' || fileType === 'jpeg') {
    const fileBuffer = fs.readFileSync(filePath);
    const image = await extractImageMetadata(fileBuffer);
    return { image };
  }

  if (fileType === 'pdf') {
    const pdf = await extractPdf(filePath);
    return { pdf };
  }

  if (fileType === 'docx') {
    const docx = await extractDocx(filePath);
    return { docx };
  }

  if (fileType === 'pptx') {
    const pptx = await extractPptx(filePath);
    return { pptx };
  }

  return {};
}

function createDeterministicFindings(extraction, fileType) {
  const issues = [];

  if (fileType === 'png' || fileType === 'jpg' || fileType === 'jpeg') {
    if (extraction.image && extraction.image.qualityIndicators.isLowResolution) {
      issues.push(normalizeIssue({
        category: 'Images',
        severity: 'medium',
        location: 'image',
        issue: 'Image resolution may be low for professional presentation use.',
        evidence: `Image dimensions ${extraction.image.resolution}.`,
        whyItMatters: 'Low-resolution visuals can appear pixelated and reduce credibility.',
        suggestion: 'Use a higher-resolution image or scale it without distortion.'
      }));
    }
  }

  if (fileType === 'pdf' && extraction.pdf) {
    if (extraction.pdf.pages > 20) {
      issues.push(normalizeIssue({
        category: 'Technical quality',
        severity: 'low',
        location: 'document',
        issue: 'This PDF has a large number of pages for a single review file.',
        evidence: `Detected ${extraction.pdf.pages} pages.`,
        whyItMatters: 'Very long documents are harder to review and may indicate dense content.',
        suggestion: 'Break the file into logical sections or summarize the main points.'
      }));
    }
  }

  if (fileType === 'pptx' && extraction.pptx) {
    const slideCount = extraction.pptx.slideCount || 0;
    if (slideCount === 0) {
      issues.push(normalizeIssue({
        category: 'Structure',
        severity: 'medium',
        location: 'presentation',
        issue: 'No slide content was detected.',
        evidence: 'The PPTX archive did not contain readable slide text.',
        whyItMatters: 'Missing content can prevent a useful review.',
        suggestion: 'Confirm the file is not blank or password-protected.'
      }));
    }
  }

  if (fileType === 'docx' && extraction.docx) {
    if (extraction.docx.paragraphs.length === 0) {
      issues.push(normalizeIssue({
        category: 'Content',
        severity: 'medium',
        location: 'document',
        issue: 'No readable paragraphs were extracted.',
        evidence: 'The document did not produce paragraph text during extraction.',
        whyItMatters: 'No usable content means the document cannot be evaluated for structure or readability.',
        suggestion: 'Check whether the file is an image-based or corrupted document.'
      }));
    }
  }

  return issues;
}

function buildScoring(issues) {
  const scoreMap = {
    critical: 15,
    high: 25,
    medium: 40,
    low: 60,
    info: 85,
  };

  const baseScore = 100;
  const penalty = issues.reduce((total, issue) => total + (scoreMap[issue.severity] || 35), 0);
  const overall = Math.max(0, Math.min(100, Math.round(baseScore - penalty / 2.5)));

  return {
    content: computeScore(overall - 5),
    typography: computeScore(overall - 2),
    layout: computeScore(overall - 7),
    visualHierarchy: computeScore(overall - 8),
    readability: computeScore(overall - 6),
    consistency: computeScore(overall - 4),
    technical: computeScore(overall - 1),
  };
}

function summarizeReport(fileType, issues, extraction) {
  if (issues.length === 0) {
    return `The ${fileType.toUpperCase()} file passed the basic structural checks and no material issues were detected from extracted evidence.`;
  }

  const topIssue = issues[0].issue;
  return `The ${fileType.toUpperCase()} file has been flagged for ${topIssue.toLowerCase()} based on the extracted evidence.`;
}

function buildRecommendations(issues) {
  return issues.slice(0, 5).map((issue) => issue.suggestion).filter(Boolean);
}

function normalizeExtractionPayload(extraction) {
  const payload = { ...extraction };

  if (extraction.pptx) {
    payload.slideCount = extraction.pptx.slideCount;
    payload.slides = extraction.pptx.slides;
    payload.slideText = extraction.pptx.slideText;
    payload.titles = extraction.pptx.titles;
    payload.paragraphs = extraction.pptx.paragraphs;
  }

  if (extraction.pdf) {
    payload.pages = extraction.pdf.pages;
    payload.text = extraction.pdf.text;
    payload.pageInfo = extraction.pdf.pageInfo;
  }

  if (extraction.docx) {
    payload.paragraphs = extraction.docx.paragraphs;
    payload.headings = extraction.docx.headings;
    payload.text = extraction.docx.text;
  }

  if (extraction.image) {
    payload.width = extraction.image.width;
    payload.height = extraction.image.height;
    payload.aspectRatio = extraction.image.aspectRatio;
    payload.resolution = extraction.image.resolution;
  }

  return payload;
}

async function analyzeFile(filePath, fileType, originalName) {
  const extraction = await extractByType(fileType, filePath);
  const issues = createDeterministicFindings(extraction, fileType);
  const scores = buildScoring(issues);
  const summary = summarizeReport(fileType, issues, extraction);
  const recommendations = buildRecommendations(issues);

  return {
    fileType,
    originalName,
    extraction: normalizeExtractionPayload(extraction),
    issues,
    scores,
    summary,
    recommendations,
    overallScore: Math.round(
      Object.values(scores).reduce((sum, value) => sum + value, 0) / Object.keys(scores).length
    )
  };
}

async function createScanRecord(scanId, fileMeta) {
  const now = new Date().toISOString();
  const record = {
    scanId,
    filename: fileMeta.originalName,
    fileType: fileMeta.fileType,
    status: 'uploaded',
    createdAt: now,
    updatedAt: now,
    filePath: fileMeta.filePath,
    storageName: fileMeta.storageName,
    size: fileMeta.size,
    mimeType: fileMeta.mimeType,
  };

  upsertScan(record);
  return record;
}

async function runInspection(scanId, fileMeta) {
  const scan = getScan(scanId);
  if (!scan) {
    throw new Error('Scan record not found.');
  }

  scan.status = 'processing';
  scan.updatedAt = new Date().toISOString();
  upsertScan(scan);

  try {
    scan.status = 'extracting';
    scan.updatedAt = new Date().toISOString();
    upsertScan(scan);

    const analysis = await analyzeFile(fileMeta.filePath, fileMeta.fileType, fileMeta.originalName);
    scan.status = 'analyzing';
    scan.updatedAt = new Date().toISOString();
    scan.analysis = analysis;
    upsertScan(scan);

    scan.status = 'scoring';
    scan.updatedAt = new Date().toISOString();
    scan.report = {
      scanId,
      filename: fileMeta.originalName,
      fileType: fileMeta.fileType,
      status: 'completed',
      overallScore: analysis.overallScore,
      scores: analysis.scores,
      issues: analysis.issues,
      summary: analysis.summary,
      recommendations: analysis.recommendations,
      extraction: analysis.extraction,
    };
    upsertScan(scan);

    scan.status = 'completed';
    scan.updatedAt = new Date().toISOString();
    scan.report.status = 'completed';
    upsertScan(scan);

    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.from('scan_results').insert({
        scan_id: scanId,
        filename: fileMeta.originalName,
        file_type: fileMeta.fileType,
        status: 'completed',
        report: scan.report,
        created_at: scan.createdAt,
      }).select();
    }

    return scan.report;
  } catch (error) {
    scan.status = 'failed';
    scan.error = {
      code: 'INSPECTION_FAILED',
      message: error.message || 'Inspection failed. Please review the uploaded file.',
    };
    scan.updatedAt = new Date().toISOString();
    upsertScan(scan);
    throw error;
  }
}

module.exports = {
  createScanRecord,
  runInspection,
  analyzeFile,
  extractByType,
  createError,
};
