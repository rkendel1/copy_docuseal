# OCR Service Testing Guide

## Running Tests

```bash
npm test
```

## Test Structure

```
src/
├── __tests__/
│   ├── imageToFields.test.ts
│   ├── detectFields.test.ts
│   └── server.test.ts
└── ...
```

## Example Test

```typescript
import { ImageToFields } from '../imageToFields';
import * as fs from 'fs';
import * as path from 'path';

describe('ImageToFields', () => {
  let imageToFields: ImageToFields;

  beforeAll(async () => {
    imageToFields = new ImageToFields();
    await imageToFields.initialize();
  });

  it('should detect text fields in an image', async () => {
    const imageBuffer = fs.readFileSync(path.join(__dirname, 'fixtures/form.png'));
    
    const fields = await imageToFields.call(imageBuffer, {
      confidence: 0.3,
      nms: 0.1,
      nmm: 0.9,
    });

    expect(fields).toBeInstanceOf(Array);
    expect(fields.length).toBeGreaterThan(0);
    expect(fields[0]).toHaveProperty('type');
    expect(fields[0]).toHaveProperty('x');
    expect(fields[0]).toHaveProperty('y');
  });

  it('should filter fields by confidence', async () => {
    const imageBuffer = fs.readFileSync(path.join(__dirname, 'fixtures/form.png'));
    
    const lowConfidenceFields = await imageToFields.call(imageBuffer, {
      confidence: 0.1,
    });
    
    const highConfidenceFields = await imageToFields.call(imageBuffer, {
      confidence: 0.8,
    });

    expect(lowConfidenceFields.length).toBeGreaterThan(highConfidenceFields.length);
  });
});
```

## Integration Tests

```bash
# Start service
npm run dev

# Run integration tests
npm run test:integration
```

## Load Testing

```bash
# Install k6
brew install k6  # macOS

# Run load test
k6 run loadtest.js
```

Example load test:

```javascript
// loadtest.js
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  vus: 10,
  duration: '30s',
};

export default function() {
  const url = 'http://localhost:3001/api/detect-fields';
  
  const formData = {
    file: http.file(open('test-form.png', 'b'), 'form.png'),
    confidence: '0.3',
  };

  const response = http.post(url, formData);

  check(response, {
    'status is 200': (r) => r.status === 200,
    'has fields': (r) => JSON.parse(r.body).fields.length > 0,
  });
}
```
