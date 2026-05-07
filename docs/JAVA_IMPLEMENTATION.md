# Java Implementation Guide for OCR Service

This guide provides instructions for creating a Java version of the OCR service as an alternative to the TypeScript implementation.

## Java Technology Stack

- **Java**: 21 (LTS)
- **Framework**: Spring Boot 3.2+
- **Build Tool**: Maven or Gradle
- **ONNX Runtime**: onnxruntime Java bindings
- **Image Processing**: ImageIO + Thumbnailator or Apache Commons Imaging
- **PDF**: Apache PDFBox or iText
- **API**: Spring REST
- **Testing**: JUnit 5 + Mockito

## Project Structure

```
ocr-service-java/
├── src/
│   ├── main/
│   │   ├── java/
│   │   │   └── com/
│   │   │       └── docuseal/
│   │   │           └── ocr/
│   │   │               ├── OcrServiceApplication.java
│   │   │               ├── controller/
│   │   │               │   └── FieldDetectionController.java
│   │   │               ├── service/
│   │   │               │   ├── ImageToFieldsService.java
│   │   │               │   └── DetectFieldsService.java
│   │   │               ├── model/
│   │   │               │   ├── Field.java
│   │   │               │   ├── DetectedField.java
│   │   │               │   └── Detections.java
│   │   │               ├── config/
│   │   │               │   └── OnnxConfig.java
│   │   │               └── util/
│   │   │                   ├── ImageProcessor.java
│   │   │                   └── NmsUtil.java
│   │   └── resources/
│   │       ├── application.yml
│   │       └── models/
│   │           └── model.onnx
│   └── test/
│       └── java/
│           └── com/
│               └── docuseal/
│                   └── ocr/
│                       └── service/
│                           └── ImageToFieldsServiceTest.java
├── pom.xml (or build.gradle)
├── Dockerfile
└── README.md
```

## Maven Dependencies (pom.xml)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.1</version>
    </parent>

    <groupId>com.docuseal</groupId>
    <artifactId>ocr-service</artifactId>
    <version>1.0.0</version>
    <name>DocuSeal OCR Service</name>

    <properties>
        <java.version>21</java.version>
        <onnxruntime.version>1.17.0</onnxruntime.version>
    </properties>

    <dependencies>
        <!-- Spring Boot -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        
        <!-- ONNX Runtime -->
        <dependency>
            <groupId>com.microsoft.onnxruntime</groupId>
            <artifactId>onnxruntime</artifactId>
            <version>${onnxruntime.version}</version>
        </dependency>

        <!-- Image Processing -->
        <dependency>
            <groupId>net.coobird</groupId>
            <artifactId>thumbnailator</artifactId>
            <version>0.4.20</version>
        </dependency>

        <!-- PDF Processing -->
        <dependency>
            <groupId>org.apache.pdfbox</groupId>
            <artifactId>pdfbox</artifactId>
            <version>3.0.1</version>
        </dependency>

        <!-- Commons -->
        <dependency>
            <groupId>org.apache.commons</groupId>
            <artifactId>commons-lang3</artifactId>
        </dependency>

        <!-- Lombok (optional) -->
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>

        <!-- Testing -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
```

## Core Java Classes

### 1. Field Model

```java
package com.docuseal.ocr.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class Field {
    private String type; // "text" or "checkbox"
    private double x;
    private double y;
    private double w;
    private double h;
    private double confidence;

    public double getEndX() {
        return x + w;
    }

    public double getEndY() {
        return y + h;
    }
}
```

### 2. ImageToFieldsService

```java
package com.docuseal.ocr.service;

import ai.onnxruntime.*;
import com.docuseal.ocr.model.Detections;
import com.docuseal.ocr.model.Field;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.FloatBuffer;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class ImageToFieldsService {
    
    private static final String[] ID_TO_CLASS = {"text", "checkbox"};
    private static final float[] MEAN = {0.485f, 0.456f, 0.406f};
    private static final float[] STD = {0.229f, 0.224f, 0.225f};
    
    private final OrtEnvironment env;
    private final OrtSession session;
    private final int resolution;
    
    public ImageToFieldsService(
        @Value("${ocr.model.path}") String modelPath,
        @Value("${ocr.model.resolution:704}") int resolution
    ) throws OrtException {
        this.env = OrtEnvironment.getEnvironment();
        this.session = env.createSession(modelPath, 
            new OrtSession.SessionOptions());
        this.resolution = resolution;
        
        log.info("ONNX model loaded from: {}", modelPath);
        log.info("Model resolution: {}x{}", resolution, resolution);
    }
    
    public List<Field> detect(
        byte[] imageBytes,
        double confidence,
        double nmsThreshold,
        double nmmThreshold,
        double temperature
    ) throws OrtException, IOException {
        
        // Load image
        BufferedImage image = ImageIO.read(new ByteArrayInputStream(imageBytes));
        
        // Preprocess
        float[][][] preprocessed = preprocessImage(image);
        
        // Run inference
        Map<String, OnnxTensor> inputs = Map.of(
            "input", OnnxTensor.createTensor(env, 
                flattenArray(preprocessed), 
                new long[]{1, 3, resolution, resolution})
        );
        
        OrtSession.Result results = session.run(inputs);
        
        // Get outputs
        float[][] boxes = getBoxes(results);
        float[][] logits = getLogits(results);
        
        // Postprocess
        Detections detections = postprocessOutputs(
            boxes, logits, confidence, temperature, 
            image.getWidth(), image.getHeight()
        );
        
        // Apply NMS
        detections = applyNms(detections, nmsThreshold);
        
        // Apply NMM
        detections = applyNmm(detections, nmmThreshold, confidence);
        
        // Build fields
        return buildFields(detections, image.getWidth(), image.getHeight());
    }
    
    private float[][][] preprocessImage(BufferedImage image) {
        // Resize to resolution x resolution
        BufferedImage resized = resizeImage(image, resolution, resolution);
        
        float[][][] tensor = new float[3][resolution][resolution];
        
        for (int c = 0; c < 3; c++) {
            for (int y = 0; y < resolution; y++) {
                for (int x = 0; x < resolution; x++) {
                    int rgb = resized.getRGB(x, y);
                    int channel = (rgb >> (16 - c * 8)) & 0xFF;
                    float normalized = channel / 255.0f;
                    tensor[c][y][x] = (normalized - MEAN[c]) / STD[c];
                }
            }
        }
        
        return tensor;
    }
    
    private BufferedImage resizeImage(BufferedImage image, int width, int height) {
        BufferedImage resized = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        java.awt.Graphics2D g = resized.createGraphics();
        g.drawImage(image.getScaledInstance(width, height, java.awt.Image.SCALE_SMOOTH), 0, 0, null);
        g.dispose();
        return resized;
    }
    
    private float[] flattenArray(float[][][] array) {
        int depth = array.length;
        int height = array[0].length;
        int width = array[0][0].length;
        float[] flat = new float[depth * height * width];
        
        int idx = 0;
        for (int c = 0; c < depth; c++) {
            for (int h = 0; h < height; h++) {
                for (int w = 0; w < width; w++) {
                    flat[idx++] = array[c][h][w];
                }
            }
        }
        return flat;
    }
    
    private float[][] getBoxes(OrtSession.Result results) throws OrtException {
        OnnxValue dets = results.get("dets").orElseThrow();
        float[][][] boxes3d = (float[][][]) dets.getValue();
        return boxes3d[0]; // Remove batch dimension
    }
    
    private float[][] getLogits(OrtSession.Result results) throws OrtException {
        OnnxValue labels = results.get("labels").orElseThrow();
        float[][][] logits3d = (float[][][]) labels.getValue();
        return logits3d[0]; // Remove batch dimension
    }
    
    private Detections postprocessOutputs(
        float[][] boxes,
        float[][] logits,
        double confidenceThreshold,
        double temperature,
        int imageWidth,
        int imageHeight
    ) {
        List<float[]> xyxyList = new ArrayList<>();
        List<Float> confidenceList = new ArrayList<>();
        List<Integer> classIdList = new ArrayList<>();
        
        int numDetections = boxes.length;
        int numClasses = logits[0].length;
        
        for (int i = 0; i < numDetections; i++) {
            // Apply temperature and sigmoid
            float maxProb = 0;
            int maxClass = 0;
            
            for (int c = 0; c < numClasses; c++) {
                float scaledLogit = (float) (logits[i][c] / temperature);
                float prob = 1.0f / (1.0f + (float) Math.exp(-scaledLogit));
                
                if (prob > maxProb) {
                    maxProb = prob;
                    maxClass = c;
                }
            }
            
            if (maxProb < confidenceThreshold) continue;
            
            // Convert from center format to xyxy
            float cx = boxes[i][0] * resolution;
            float cy = boxes[i][1] * resolution;
            float w = boxes[i][2] * resolution;
            float h = boxes[i][3] * resolution;
            
            float x1 = cx - w / 2;
            float y1 = cy - h / 2;
            float x2 = cx + w / 2;
            float y2 = cy + h / 2;
            
            xyxyList.add(new float[]{x1, y1, x2, y2});
            confidenceList.add(maxProb);
            classIdList.add(maxClass);
        }
        
        return new Detections(xyxyList, confidenceList, classIdList);
    }
    
    private Detections applyNms(Detections detections, double iouThreshold) {
        // Implement Non-Maximum Suppression
        // Similar to TypeScript version
        return detections; // Simplified
    }
    
    private Detections applyNmm(Detections detections, double overlapThreshold, double confidence) {
        // Implement Non-Maximum Merge
        // Similar to TypeScript version
        return detections; // Simplified
    }
    
    private List<Field> buildFields(Detections detections, int imageWidth, int imageHeight) {
        List<Field> fields = new ArrayList<>();
        
        for (int i = 0; i < detections.getXyxy().size(); i++) {
            float[] box = detections.getXyxy().get(i);
            float confidence = detections.getConfidence().get(i);
            int classId = detections.getClassId().get(i);
            
            double x = box[0] / imageWidth;
            double y = box[1] / imageHeight;
            double w = (box[2] - box[0]) / imageWidth;
            double h = (box[3] - box[1]) / imageHeight;
            
            // Validate coordinates
            if (x < 0 || x > 1 || y < 0 || y > 1) continue;
            
            fields.add(new Field(
                ID_TO_CLASS[classId],
                x, y,
                Math.min(w, 1 - x),
                Math.min(h, 1 - y),
                confidence
            ));
        }
        
        return fields;
    }
}
```

### 3. REST Controller

```java
package com.docuseal.ocr.controller;

import com.docuseal.ocr.model.Field;
import com.docuseal.ocr.service.ImageToFieldsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class FieldDetectionController {
    
    private final ImageToFieldsService imageToFieldsService;
    
    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of(
            "status", "healthy",
            "service", "ocr-service-java",
            "version", "1.0.0",
            "timestamp", System.currentTimeMillis()
        );
    }
    
    @PostMapping("/detect-fields")
    public ResponseEntity<Map<String, Object>> detectFields(
        @RequestParam("file") MultipartFile file,
        @RequestParam(defaultValue = "0.3") double confidence,
        @RequestParam(defaultValue = "0.1") double nms,
        @RequestParam(defaultValue = "0.9") double nmm,
        @RequestParam(defaultValue = "1.0") double temperature
    ) {
        try {
            long startTime = System.currentTimeMillis();
            
            log.info("Processing field detection: filename={}, size={}", 
                file.getOriginalFilename(), file.getSize());
            
            List<Field> fields = imageToFieldsService.detect(
                file.getBytes(),
                confidence,
                nms,
                nmm,
                temperature
            );
            
            long processingTime = System.currentTimeMillis() - startTime;
            
            log.info("Field detection completed: fields={}, time={}ms", 
                fields.size(), processingTime);
            
            return ResponseEntity.ok(Map.of(
                "fields", fields,
                "metadata", Map.of(
                    "pageCount", 1,
                    "processingTime", processingTime
                )
            ));
            
        } catch (Exception e) {
            log.error("Error processing field detection", e);
            return ResponseEntity.internalServerError()
                .body(Map.of("error", e.getMessage()));
        }
    }
}
```

### 4. Application Configuration

```yaml
# application.yml
server:
  port: 3001

spring:
  application:
    name: ocr-service
  servlet:
    multipart:
      max-file-size: 50MB
      max-request-size: 50MB

ocr:
  model:
    path: ${MODEL_PATH:models/model.onnx}
    resolution: 704

logging:
  level:
    com.docuseal.ocr: INFO
    ai.onnxruntime: WARN
```

### 5. Dockerfile

```dockerfile
# Multi-stage build for Java OCR Service

FROM maven:3.9-eclipse-temurin-21 AS builder

WORKDIR /build

COPY pom.xml .
RUN mvn dependency:go-offline

COPY src ./src
RUN mvn clean package -DskipTests

FROM eclipse-temurin:21-jre-alpine

# Download model
RUN apk add --no-cache wget && \
    mkdir -p /app/models && \
    wget -O /app/models/model.onnx \
    "https://github.com/docusealco/fields-detection/releases/download/2.0.0/model_704_int8.onnx" && \
    apk del wget

WORKDIR /app

COPY --from=builder /build/target/*.jar app.jar

ENV MODEL_PATH=/app/models/model.onnx
ENV SERVER_PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

ENTRYPOINT ["java", "-jar", "app.jar"]
```

## Comparison: TypeScript vs Java

| Aspect | TypeScript | Java |
|--------|-----------|------|
| **Development Speed** | Faster | Moderate |
| **Type Safety** | Good | Excellent |
| **Performance** | Good | Excellent |
| **Memory Usage** | Lower | Higher |
| **Startup Time** | Fast | Slower |
| **Ecosystem** | npm (huge) | Maven/Gradle (mature) |
| **Learning Curve** | Lower | Higher |
| **Enterprise Adoption** | Growing | Established |
| **Async Processing** | Built-in (async/await) | More complex (CompletableFuture) |
| **Deployment Size** | Smaller | Larger |

## When to Choose Java

Choose Java for:
- Enterprise environments with Java expertise
- High-throughput, CPU-intensive workloads
- Strong type safety requirements
- Integration with existing Java systems
- Native PDF processing (PDFBox, iText)

## When to Choose TypeScript

Choose TypeScript for:
- Faster development cycles
- Teams already using Node.js/JavaScript
- Microservices with smaller footprint
- Integration with JavaScript frontend
- Modern async/await patterns

## Next Steps

1. **Create Java project**: `mvn archetype:generate`
2. **Add dependencies**: Update `pom.xml`
3. **Implement services**: Port TypeScript code to Java
4. **Add tests**: JUnit 5 + Mockito
5. **Build Docker image**: `docker build -t ocr-service-java .`
6. **Deploy**: Use Kubernetes or Docker Compose

## Resources

- **ONNX Runtime Java**: https://onnxruntime.ai/docs/get-started/with-java.html
- **Spring Boot**: https://spring.io/projects/spring-boot
- **Apache PDFBox**: https://pdfbox.apache.org/
- **Maven**: https://maven.apache.org/

## Conclusion

Both TypeScript and Java implementations are viable. The TypeScript version is already implemented and ready to deploy. The Java version provides an alternative for Java-centric environments.
