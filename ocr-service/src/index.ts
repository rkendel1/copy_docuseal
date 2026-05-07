/**
 * OCR Service Entry Point
 * 
 * This module exports the main classes and interfaces for the OCR service.
 */

export { ImageToFields, Field, InferenceOptions } from './imageToFields';
export { DetectFields, DetectedField, DetectFieldsOptions, ProgressCallback } from './detectFields';

// Version
export const VERSION = '1.0.0';
