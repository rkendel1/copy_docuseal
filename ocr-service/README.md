# DocuSeal OCR Service

Standalone OCR and form field detection service extracted from DocuSeal, reimplemented in TypeScript for independent deployment.

## Features

- **ONNX-based field detection**: Uses deep learning to detect form fields (text boxes and checkboxes)
- **Image processing**: Supports JPEG, PNG, WebP, BMP, and more via Sharp
- **REST API**: Simple HTTP API for field detection
- **Streaming support**: Server-Sent Events (SSE) for real-time progress
- **Docker support**: Easy deployment with Docker and Docker Compose
- **Confidence tuning**: Adjustable confidence thresholds and NMS/NMM parameters
- **Production-ready**: Health checks, logging, and error handling

## Technology Stack

- **Node.js** 20+ with TypeScript
- **ONNX Runtime**: ML inference engine
- **Sharp**: High-performance image processing
- **Express**: REST API framework
- **Docker**: Containerized deployment

## Quick Start

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Download the ONNX model:**
   ```bash
   mkdir -p models
   wget -O models/model.onnx "https://github.com/docusealco/fields-detection/releases/download/2.0.0/model_704_int8.onnx"
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Run in development mode:**
   ```bash
   npm run dev
   ```

5. **Build for production:**
   ```bash
   npm run build
   npm start
   ```

### Docker Deployment

1. **Using Docker Compose (recommended):**
   ```bash
   docker-compose up -d
   ```

2. **Using Docker directly:**
   ```bash
   docker build -t docuseal-ocr-service .
   docker run -p 3001:3001 docuseal-ocr-service
   ```

## API Documentation

### Health Check

```bash
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "ocr-service",
  "version": "1.0.0",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Detect Fields

```bash
POST /api/detect-fields
Content-Type: multipart/form-data
```

**Request Parameters:**
- `file` (required): Image file to analyze
- `confidence` (optional): Confidence threshold (0-1, default: 0.3)
- `nms` (optional): Non-Maximum Suppression threshold (default: 0.1)
- `nmm` (optional): Non-Maximum Merge threshold (default: 0.9)
- `temperature` (optional): Temperature for confidence adjustment (default: 1)
- `splitPage` (optional): Enable split-page processing (default: false)
- `aspectRatio` (optional): Preserve aspect ratio (default: true)
- `padding` (optional): Padding for image trimming (default: null)

**Example with cURL:**
```bash
curl -X POST http://localhost:3001/api/detect-fields \
  -F "file=@form.png" \
  -F "confidence=0.3" \
  -F "nms=0.1"
```

**Response:**
```json
{
  "fields": [
    {
      "uuid": "550e8400-e29b-41d4-a716-446655440000",
      "type": "text",
      "required": false,
      "preferences": {},
      "areas": [
        {
          "x": 0.1,
          "y": 0.2,
          "w": 0.3,
          "h": 0.05,
          "page": 0
        }
      ]
    }
  ],
  "metadata": {
    "pageCount": 1,
    "processingTime": 1234
  }
}
```

### Detect Fields with Streaming

```bash
POST /api/detect-fields-stream
Content-Type: multipart/form-data
```

Returns Server-Sent Events (SSE) with progress updates.

**Example with cURL:**
```bash
curl -X POST http://localhost:3001/api/detect-fields-stream \
  -F "file=@form.png" \
  --no-buffer
```

**SSE Response:**
```
data: {"page":0,"fields":[...]}

data: {"completed":true,"fields":[...]}
```

### Analyze Image (Simple)

```bash
POST /api/analyze-image
Content-Type: multipart/form-data
```

Direct image analysis without additional processing.

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `NODE_ENV` | Environment mode | `production` |
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | `info` |
| `MODEL_PATH` | Path to ONNX model file | `./models/model.onnx` |

### Model Configuration

The service uses an ONNX model for field detection. By default, it downloads the `model_704_int8.onnx` model (Int8 quantized, 704x704 resolution).

To use a custom model:
1. Place your `.onnx` file in the `models/` directory
2. Set `MODEL_PATH` environment variable to your model path

## Integration with DocuSeal

To integrate this OCR service with the main DocuSeal application:

### Option 1: Microservice Architecture

Update the DocuSeal Rails app to call the OCR service via HTTP:

```ruby
# config/initializers/ocr_service.rb
OCR_SERVICE_URL = ENV.fetch('OCR_SERVICE_URL', 'http://localhost:3001')

# lib/templates/detect_fields.rb
module Templates
  module DetectFields
    def self.call_remote(file_data, options = {})
      conn = Faraday.new(url: OCR_SERVICE_URL)
      
      response = conn.post('/api/detect-fields') do |req|
        req.body = { 
          file: Faraday::UploadIO.new(StringIO.new(file_data), 'application/octet-stream'),
          **options
        }
      end
      
      JSON.parse(response.body)
    end
  end
end
```

### Option 2: Docker Compose Integration

Add the OCR service to your DocuSeal `docker-compose.yml`:

```yaml
services:
  app:
    # ... existing DocuSeal config
    environment:
      - OCR_SERVICE_URL=http://ocr-service:3001
    depends_on:
      - ocr-service

  ocr-service:
    build: ./ocr-service
    ports:
      - "3001:3001"
    restart: unless-stopped
```

## Performance Tuning

### CPU Optimization

The service uses all available CPU cores by default. To limit CPU usage:

```bash
export CPU_THREADS=4
```

### Memory Optimization

For high-throughput scenarios, consider:
- Increasing container memory limits
- Using process managers like PM2 for clustering
- Implementing request queuing

### Scaling

Horizontal scaling options:
1. **Multiple containers**: Run multiple instances behind a load balancer
2. **Kubernetes**: Deploy as a Kubernetes service with HPA
3. **Cloud services**: Deploy to AWS ECS, Google Cloud Run, or Azure Container Instances

## Development

### Project Structure

```
ocr-service/
├── src/
│   ├── server.ts           # Express API server
│   ├── imageToFields.ts    # ONNX inference engine
│   └── detectFields.ts     # Field detection orchestrator
├── models/                  # ONNX model files
├── config/                  # Configuration files
├── docker/                  # Docker configs
├── docs/                    # Documentation
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── README.md
```

### Testing

```bash
npm test
```

### Linting

```bash
npm run lint
```

### Code Formatting

```bash
npm run format
```

## License

AGPL-3.0 - Same as DocuSeal

## Support

For issues or questions:
- GitHub Issues: https://github.com/docusealco/docuseal/issues
- Documentation: https://www.docuseal.com/docs

## Roadmap

- [x] Basic image field detection
- [x] REST API with Express
- [x] Docker deployment
- [ ] PDF support (multi-page processing)
- [ ] WebSocket support for real-time updates
- [ ] gRPC API option
- [ ] Java port (see Java migration guide)
- [ ] Kubernetes Helm charts
- [ ] Performance benchmarks
- [ ] Unit and integration tests
