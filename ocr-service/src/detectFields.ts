/**
 * TypeScript port of Templates::DetectFields
 * Field detection orchestrator that handles both images and PDFs
 */

import { ImageToFields, Field, InferenceOptions } from './imageToFields';
import { v4 as uuidv4 } from 'uuid';

export interface DetectedField {
  uuid: string;
  type: 'text' | 'checkbox' | 'date' | 'number';
  required: boolean;
  preferences: Record<string, any>;
  areas: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    page: number;
    attachmentUuid?: string;
  }>;
}

export interface DetectFieldsOptions extends InferenceOptions {
  /** 
   * Enable field type inference from context (for future PDF support)
   * Currently unused - reserved for when PDF text extraction is implemented
   */
  regexpType?: boolean;
  /** 
   * Target specific page number for processing (null = all pages)
   * Currently only page 0 is supported for image files
   */
  pageNumber?: number | null;
}

export type ProgressCallback = (data: {
  attachmentUuid?: string;
  page: number;
  fields: DetectedField[];
}) => void;

export class DetectFields {
  private static DATE_REGEXP = /(?:date|signed\sat|datum)[:_\s-]*$/i;
  private static NUMBER_REGEXP =
    /(?:price|\$|€|total|quantity|prix|quantité|preis|summe|gesamt(?:betrag)?|menge|anzahl|stückzahl)[:_\s-]*$/i;
  private static SIGNATURE_REGEXP =
    /(?:signature|sign\shere|sign|signez\sici|signer\sici|unterschrift|unterschreiben|unterzeichnen)[:_\s-]*$/i;

  constructor(private imageToFields: ImageToFields) {}

  /**
   * Main detection method
   */
  async call(
    fileBuffer: Buffer,
    options: DetectFieldsOptions = {},
    progressCallback?: ProgressCallback
  ): Promise<DetectedField[]> {
    const {
      confidence = 0.3,
      nms = 0.1,
      nmm = 0.5,
      temperature = 1,
      splitPage = false,
      aspectRatio = true,
      padding = 20,
      regexpType = true,
      pageNumber = null,
    } = options;

    // Determine if file is image or PDF
    const isImage = this.isImageFile(fileBuffer);

    if (isImage) {
      return this.processImageAttachment(
        fileBuffer,
        {
          confidence: confidence / 3.0, // Adjusted confidence for single image
          nms,
          nmm,
          temperature,
          splitPage,
          aspectRatio,
          padding,
        },
        pageNumber,
        progressCallback
      );
    } else {
      // PDF processing would go here
      // For now, throw an error as PDF support requires additional libraries
      throw new Error(
        'PDF processing not yet implemented in TypeScript version. Use image files.'
      );
    }
  }

  /**
   * Process image attachment
   */
  private async processImageAttachment(
    imageBuffer: Buffer,
    options: InferenceOptions,
    pageNumber: number | null,
    progressCallback?: ProgressCallback
  ): Promise<DetectedField[]> {
    if (pageNumber !== null && pageNumber !== 0) {
      return [];
    }

    // Run inference
    const fields = await this.imageToFields.call(imageBuffer, options);

    // Sort fields by position
    const sortedFields = this.sortFields(fields, 10.0 / 1000); // Assuming ~1000px height

    // Convert to API format
    const detectedFields = sortedFields.map((field) => ({
      uuid: uuidv4(),
      type: field.type as 'text' | 'checkbox', // Only text and checkbox are detected by the model
      required: false, // Can be set based on business logic
      preferences: {},
      areas: [
        {
          x: field.x,
          y: field.y,
          w: field.w,
          h: field.h,
          page: 0,
        },
      ],
    }));

    // Call progress callback if provided
    if (progressCallback) {
      progressCallback({
        page: 0,
        fields: detectedFields,
      });
    }

    return detectedFields;
  }

  /**
   * Sort fields by vertical position, then horizontal
   */
  private sortFields(fields: Field[], yThreshold: number): Field[] {
    return fields.sort((a, b) => {
      const aEndY = a.y + a.h;
      const bEndY = b.y + b.h;

      if (Math.abs(aEndY - bEndY) < yThreshold) {
        return a.x - b.x;
      }
      return aEndY - bEndY;
    });
  }

  /**
   * Determine field type from context
   * 
   * Note: This method is reserved for future PDF support when text context will be available.
   * Currently only 'text' and 'checkbox' are detected by the ONNX model, but this method
   * is prepared to infer 'date' and 'number' types based on surrounding text labels.
   * 
   * @param prevText - Text content preceding the field (from PDF text extraction)
   * @param fieldType - Base field type detected by the model
   * @returns Inferred field type
   */
  private typeFromContext(prevText: string, fieldType: string): 'text' | 'checkbox' | 'date' | 'number' {
    if (fieldType !== 'text') return fieldType as 'checkbox';

    if (DetectFields.DATE_REGEXP.test(prevText)) return 'date';
    if (DetectFields.NUMBER_REGEXP.test(prevText)) return 'number';

    return 'text';
  }

  /**
   * Check if buffer contains image data
   */
  private isImageFile(buffer: Buffer): boolean {
    // Check magic numbers for common image formats
    const magicNumbers = {
      jpg: [0xff, 0xd8, 0xff],
      png: [0x89, 0x50, 0x4e, 0x47],
      gif: [0x47, 0x49, 0x46],
      bmp: [0x42, 0x4d],
      webp: [0x52, 0x49, 0x46, 0x46],
    };

    for (const [format, magic] of Object.entries(magicNumbers)) {
      if (magic.every((byte, i) => buffer[i] === byte)) {
        return true;
      }
    }

    // Check for PDF
    if (buffer.slice(0, 4).toString() === '%PDF') {
      return false;
    }

    return false; // Unknown format
  }
}
