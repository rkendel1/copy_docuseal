/**
 * REST API Server for OCR Service
 */

import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import cors from 'cors';
import dotenv from 'dotenv';
import { ImageToFields } from './imageToFields';
import { DetectFields } from './detectFields';
import winston from 'winston';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Initialize OCR engine
const imageToFields = new ImageToFields();
const detectFields = new DetectFields(imageToFields);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'ocr-service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/detect-fields
 * Detect form fields from an uploaded image or PDF
 * 
 * Request:
 * - file: multipart/form-data file upload
 * - confidence: optional confidence threshold (default: 0.3)
 * - nms: optional NMS threshold (default: 0.1)
 * - nmm: optional NMM threshold (default: 0.9)
 * - temperature: optional temperature for confidence (default: 1)
 * - splitPage: optional split page processing (default: false)
 * - aspectRatio: optional aspect ratio preservation (default: true)
 * - padding: optional padding for trim (default: null)
 * 
 * Response:
 * {
 *   fields: [
 *     {
 *       uuid: string,
 *       type: 'text' | 'checkbox' | 'signature' | 'date' | 'number',
 *       required: boolean,
 *       areas: [
 *         { x: number, y: number, w: number, h: number, page: number }
 *       ]
 *     }
 *   ],
 *   metadata: {
 *     pageCount: number,
 *     processingTime: number
 *   }
 * }
 */
app.post(
  '/api/detect-fields',
  upload.single('file'),
  async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'No file uploaded',
          message: 'Please upload a file using the "file" field',
        });
      }

      const options = {
        confidence: parseFloat(req.body.confidence) || 0.3,
        nms: parseFloat(req.body.nms) || 0.1,
        nmm: parseFloat(req.body.nmm) || 0.9,
        temperature: parseFloat(req.body.temperature) || 1,
        splitPage: req.body.splitPage === 'true',
        aspectRatio: req.body.aspectRatio !== 'false',
        padding: req.body.padding ? parseInt(req.body.padding) : null,
        regexpType: req.body.regexpType !== 'false',
        pageNumber: req.body.page ? parseInt(req.body.page) : null,
      };

      logger.info('Processing field detection request', {
        filename: req.file.originalname,
        size: req.file.size,
        options,
      });

      const fields = await detectFields.call(req.file.buffer, options);

      const processingTime = Date.now() - startTime;

      logger.info('Field detection completed', {
        fieldCount: fields.length,
        processingTime,
      });

      res.json({
        fields,
        metadata: {
          pageCount: 1, // Will be updated for PDF support
          processingTime,
        },
      });
    } catch (error: any) {
      logger.error('Error processing field detection', {
        error: error.message,
        stack: error.stack,
      });

      res.status(500).json({
        error: 'Processing failed',
        message: error.message,
      });
    }
  }
);

/**
 * POST /api/detect-fields-stream
 * Detect form fields with streaming progress updates (SSE)
 */
app.post(
  '/api/detect-fields-stream',
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'No file uploaded',
        });
      }

      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const options = {
        confidence: parseFloat(req.body.confidence) || 0.3,
        nms: parseFloat(req.body.nms) || 0.1,
        nmm: parseFloat(req.body.nmm) || 0.9,
        temperature: parseFloat(req.body.temperature) || 1,
        splitPage: req.body.splitPage === 'true',
        aspectRatio: req.body.aspectRatio !== 'false',
        padding: req.body.padding ? parseInt(req.body.padding) : null,
        regexpType: req.body.regexpType !== 'false',
        pageNumber: req.body.page ? parseInt(req.body.page) : null,
      };

      // Progress callback
      const onProgress = (data: any) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      const fields = await detectFields.call(req.file.buffer, options, onProgress);

      // Send completion event
      res.write(`data: ${JSON.stringify({ completed: true, fields })}\n\n`);
      res.end();
    } catch (error: any) {
      logger.error('Error in streaming field detection', {
        error: error.message,
      });

      res.write(
        `data: ${JSON.stringify({ error: error.message })}\n\n`
      );
      res.end();
    }
  }
);

/**
 * POST /api/analyze-image
 * Analyze a single image for form fields
 */
app.post(
  '/api/analyze-image',
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'No file uploaded',
        });
      }

      const options = {
        confidence: parseFloat(req.body.confidence) || 0.3,
        nms: parseFloat(req.body.nms) || 0.1,
        nmm: parseFloat(req.body.nmm) || 0.9,
        temperature: parseFloat(req.body.temperature) || 1,
        splitPage: req.body.splitPage === 'true',
        aspectRatio: req.body.aspectRatio !== 'false',
        padding: req.body.padding ? parseInt(req.body.padding) : null,
      };

      const fields = await imageToFields.call(req.file.buffer, options);

      res.json({ fields });
    } catch (error: any) {
      logger.error('Error analyzing image', {
        error: error.message,
      });

      res.status(500).json({
        error: 'Analysis failed',
        message: error.message,
      });
    }
  }
);

// Error handler
// Note: 'next' parameter is required for Express to recognize this as an error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
  });

  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Initialize and start server
async function start() {
  try {
    logger.info('Initializing OCR service...');

    // Initialize the ONNX model
    const modelPath = process.env.MODEL_PATH || './models/model.onnx';
    await imageToFields.initialize(modelPath);

    logger.info('OCR model initialized successfully');

    app.listen(port, () => {
      logger.info(`OCR service listening on port ${port}`);
      logger.info(`Health check: http://localhost:${port}/health`);
      logger.info(`API endpoint: http://localhost:${port}/api/detect-fields`);
    });
  } catch (error: any) {
    logger.error('Failed to start OCR service', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

start();
