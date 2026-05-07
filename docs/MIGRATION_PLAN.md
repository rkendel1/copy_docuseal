# Full TypeScript/Java Migration Plan for DocuSeal

## Executive Summary

This document outlines a comprehensive plan to migrate the DocuSeal application from Ruby on Rails to TypeScript/Java. The migration is divided into phases with effort estimates and risk assessments.

## Current Architecture Analysis

### Technology Stack
- **Backend**: Ruby 4.0.1, Rails 8.1.3 (~30,000 LOC)
- **Frontend**: Vue.js 3.3.2, Webpack 5 (~15,000 LOC JavaScript/Vue)
- **Database**: PostgreSQL/SQLite/MySQL (via ActiveRecord)
- **Job Queue**: Sidekiq with Redis
- **PDF Processing**: HexaPDF, Pdfium
- **Image Processing**: ruby-vips, ONNX Runtime
- **API**: RESTful with JWT authentication

### Component Breakdown

| Component | Ruby LOC | Complexity | Priority |
|-----------|----------|------------|----------|
| Models (32 files) | ~4,500 | Medium | High |
| Controllers (111 files) | ~7,200 | Medium | High |
| Jobs (21 files) | ~2,100 | Low | Medium |
| Lib/Services (87 files) | ~6,900 | High | High |
| OCR Module | ~1,600 | Very High | **DONE** |
| API Layer | ~3,000 | Medium | High |
| Authentication | ~1,200 | High | High |
| Tests | ~8,000 | Low | Low |

**Total Estimated LOC to Migrate**: ~34,500 lines

## Migration Strategy Options

### Option 1: Full TypeScript Migration (Recommended for Phase 1)

**Architecture**: Node.js + TypeScript + Express/NestJS + TypeORM + Vue.js 3

**Pros**:
- Same language for frontend and backend (TypeScript)
- Faster iteration and development
- Rich ecosystem (npm packages)
- Lower learning curve for existing Vue.js developers
- Better developer experience with modern tooling

**Cons**:
- Single-threaded by default (mitigated with clustering)
- Less mature enterprise patterns than Java
- Type safety not as strict as Java

**Recommended Stack**:
- **Framework**: NestJS (enterprise-grade Node.js framework)
- **ORM**: TypeORM or Prisma
- **Validation**: class-validator
- **Jobs**: Bull (Redis-based queue)
- **PDF**: pdf-lib + pdfjs-dist
- **Images**: Sharp
- **API**: GraphQL + REST
- **Testing**: Jest + Supertest

### Option 2: Java Migration (Enterprise Option)

**Architecture**: Java 21 + Spring Boot + JPA + Vue.js 3

**Pros**:
- Enterprise-grade performance and scalability
- Strong type safety
- Mature ecosystem (Maven/Gradle)
- Better for high-throughput scenarios
- Native PDF libraries (Apache PDFBox, iText)

**Cons**:
- Steeper learning curve
- More verbose code
- Longer build times
- Different language for frontend/backend

**Recommended Stack**:
- **Framework**: Spring Boot 3.2+
- **ORM**: Hibernate (JPA)
- **Validation**: Jakarta Bean Validation
- **Jobs**: Spring Batch or Quartz
- **PDF**: Apache PDFBox or iText
- **Images**: ImageIO + ONNX Runtime Java
- **API**: Spring REST + GraphQL
- **Testing**: JUnit 5 + Mockito

### Option 3: Hybrid Approach (Recommended Overall)

**Phase 1**: Migrate OCR/compute-intensive services to TypeScript microservices ✅ **DONE**
**Phase 2**: Migrate core API to TypeScript (NestJS)
**Phase 3**: Keep UI in Vue.js 3 (already TypeScript-compatible)
**Phase 4**: Optional: Migrate performance-critical services to Java

## Detailed Migration Plan

### Phase 1: OCR Service Extraction (✅ COMPLETED)

**Status**: DONE
**Effort**: 40 hours
**Timeline**: Week 1

**Deliverables**:
- [x] Standalone TypeScript OCR service
- [x] REST API with Express
- [x] Docker deployment
- [x] Documentation

**Benefits**:
- Independent scaling
- Language-agnostic integration
- Immediate deployment

---

### Phase 2: Database Schema Migration (HIGH PRIORITY)

**Effort**: 80-120 hours
**Timeline**: Weeks 2-4

**Tasks**:
1. **Schema Analysis** (8 hours)
   - Document all 32 models
   - Map relationships
   - Identify constraints and indexes

2. **ORM Setup** (16 hours)
   - TypeScript: Setup TypeORM or Prisma
   - Java: Setup Hibernate/JPA
   - Configure database connections

3. **Entity Migration** (40-60 hours)
   - Convert Ruby models to TypeScript/Java entities
   - Implement associations (has_many, belongs_to, etc.)
   - Add validation rules
   - Implement scopes and query methods

4. **Migration Scripts** (16-20 hours)
   - Port Rails migrations to TypeORM/Liquibase
   - Ensure backward compatibility
   - Test migrations

5. **Testing** (20-30 hours)
   - Unit tests for models
   - Integration tests for repositories
   - Data integrity tests

**Example Conversion**:

**Ruby (ActiveRecord)**:
```ruby
class Template < ApplicationRecord
  belongs_to :account
  belongs_to :author, class_name: 'User'
  has_many :submissions, dependent: :destroy
  has_many :submitters, through: :submissions
  
  validates :name, presence: true, length: { maximum: 255 }
  validates :schema, presence: true
  
  scope :active, -> { where(archived_at: nil) }
  
  def total_submissions
    submissions.completed.count
  end
end
```

**TypeScript (TypeORM)**:
```typescript
@Entity('templates')
export class Template {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @Column('json')
  @IsNotEmpty()
  schema: any;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'account_id' })
  account: Account;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'author_id' })
  author: User;

  @OneToMany(() => Submission, submission => submission.template)
  submissions: Submission[];

  @Column({ name: 'archived_at', nullable: true })
  archivedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  async getTotalSubmissions(): Promise<number> {
    return await getRepository(Submission)
      .createQueryBuilder('submission')
      .where('submission.template_id = :templateId', { templateId: this.id })
      .andWhere('submission.completed_at IS NOT NULL')
      .getCount();
  }

  static active() {
    return this.createQueryBuilder('template')
      .where('template.archived_at IS NULL');
  }
}
```

**Java (JPA/Hibernate)**:
```java
@Entity
@Table(name = "templates")
public class Template {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(length = 255, nullable = false)
    @NotBlank
    @Size(max = 255)
    private String name;

    @Column(columnDefinition = "json", nullable = false)
    @NotNull
    private JsonNode schema;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id")
    private Account account;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "author_id")
    private User author;

    @OneToMany(mappedBy = "template", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Submission> submissions = new ArrayList<>();

    @Column(name = "archived_at")
    private LocalDateTime archivedAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public long getTotalSubmissions() {
        return submissions.stream()
            .filter(s -> s.getCompletedAt() != null)
            .count();
    }

    public static Specification<Template> isActive() {
        return (root, query, cb) -> cb.isNull(root.get("archivedAt"));
    }
}
```

---

### Phase 3: API Layer Migration

**Effort**: 120-160 hours
**Timeline**: Weeks 5-8

**Tasks**:
1. **API Analysis** (16 hours)
   - Document all 111 controller actions
   - Map routes and endpoints
   - Identify dependencies

2. **Framework Setup** (24 hours)
   - TypeScript: Setup NestJS with modules
   - Java: Setup Spring Boot with controllers
   - Configure middleware (CORS, auth, validation)

3. **Controller Migration** (60-80 hours)
   - Convert Rails controllers to NestJS/Spring controllers
   - Implement request validation
   - Add response serialization
   - Error handling

4. **Authentication & Authorization** (24 hours)
   - Migrate Devise to Passport.js/Spring Security
   - Implement JWT tokens
   - Role-based access control

5. **Testing** (40-50 hours)
   - Integration tests for each endpoint
   - API documentation (Swagger/OpenAPI)

**Example Conversion**:

**Ruby (Rails Controller)**:
```ruby
class TemplatesController < ApplicationController
  load_and_authorize_resource
  
  def index
    @templates = @templates.active.page(params[:page])
    render json: @templates
  end
  
  def create
    @template = current_account.templates.build(template_params)
    @template.author = current_user
    
    if @template.save
      render json: @template, status: :created
    else
      render json: { errors: @template.errors }, status: :unprocessable_entity
    end
  end
  
  private
  
  def template_params
    params.require(:template).permit(:name, :schema, :folder_id)
  end
end
```

**TypeScript (NestJS)**:
```typescript
@Controller('api/templates')
@UseGuards(JwtAuthGuard)
export class TemplatesController {
  constructor(
    private readonly templatesService: TemplatesService,
    private readonly authorizationService: AuthorizationService
  ) {}

  @Get()
  @UseGuards(AbilityGuard)
  @CheckAbilities({ action: 'read', subject: Template })
  async index(
    @Query() query: PaginationDto,
    @CurrentUser() user: User
  ): Promise<PaginatedResponse<Template>> {
    return await this.templatesService.findActive(query, user.accountId);
  }

  @Post()
  @UseGuards(AbilityGuard)
  @CheckAbilities({ action: 'create', subject: Template })
  async create(
    @Body() createDto: CreateTemplateDto,
    @CurrentUser() user: User
  ): Promise<Template> {
    return await this.templatesService.create({
      ...createDto,
      accountId: user.accountId,
      authorId: user.id,
    });
  }
}
```

**Java (Spring Boot)**:
```java
@RestController
@RequestMapping("/api/templates")
@Secured("ROLE_USER")
public class TemplatesController {
    
    @Autowired
    private TemplatesService templatesService;
    
    @Autowired
    private AuthorizationService authorizationService;
    
    @GetMapping
    @PreAuthorize("hasPermission(null, 'Template', 'READ')")
    public ResponseEntity<Page<Template>> index(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "30") int size,
        @AuthenticationPrincipal UserDetails userDetails
    ) {
        User user = (User) userDetails;
        Page<Template> templates = templatesService.findActive(
            PageRequest.of(page, size),
            user.getAccountId()
        );
        return ResponseEntity.ok(templates);
    }
    
    @PostMapping
    @PreAuthorize("hasPermission(null, 'Template', 'CREATE')")
    public ResponseEntity<Template> create(
        @Valid @RequestBody CreateTemplateDto dto,
        @AuthenticationPrincipal UserDetails userDetails
    ) {
        User user = (User) userDetails;
        Template template = templatesService.create(dto, user);
        return ResponseEntity.status(HttpStatus.CREATED).body(template);
    }
}
```

---

### Phase 4: Background Jobs Migration

**Effort**: 60-80 hours
**Timeline**: Weeks 9-10

**Tasks**:
1. **Job Queue Setup** (8 hours)
   - TypeScript: Setup Bull with Redis
   - Java: Setup Spring Batch or Quartz

2. **Job Migration** (40-50 hours)
   - Convert 21 Sidekiq jobs
   - Implement retry logic
   - Add job monitoring

3. **Testing** (12-20 hours)
   - Job execution tests
   - Failure handling tests

**Example Conversion**:

**Ruby (Sidekiq)**:
```ruby
class ProcessSubmitterCompletionJob < ApplicationJob
  queue_as :default
  
  def perform(submitter_id)
    submitter = Submitter.find(submitter_id)
    Submitters::ProcessCompletion.call(submitter)
  rescue ActiveRecord::RecordNotFound => e
    Rails.logger.error("Submitter not found: #{submitter_id}")
  end
end
```

**TypeScript (Bull)**:
```typescript
@Processor('default')
export class ProcessSubmitterCompletionProcessor {
  constructor(
    private readonly submitterService: SubmitterService,
    private readonly logger: Logger
  ) {}

  @Process('process_completion')
  async handleCompletion(job: Job<{ submitterId: string }>) {
    try {
      const submitter = await this.submitterService.findById(job.data.submitterId);
      await this.submitterService.processCompletion(submitter);
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        this.logger.error(`Submitter not found: ${job.data.submitterId}`);
        return; // Don't retry
      }
      throw error; // Retry
    }
  }
}
```

---

### Phase 5: Service Layer Migration

**Effort**: 100-140 hours
**Timeline**: Weeks 11-14

**Tasks**:
1. **Service Identification** (8 hours)
   - Document 87 lib modules
   - Identify service boundaries

2. **Service Migration** (70-100 hours)
   - Convert Ruby modules to TypeScript/Java services
   - Implement business logic
   - Add transaction management

3. **Testing** (22-32 hours)
   - Service unit tests
   - Integration tests

---

### Phase 6: PDF Processing Migration

**Effort**: 80-100 hours
**Timeline**: Weeks 15-17

**Tasks**:
1. **Library Evaluation** (8 hours)
   - TypeScript: pdf-lib, pdfjs-dist, pdf-parse
   - Java: Apache PDFBox, iText

2. **PDF Module Migration** (50-60 hours)
   - HexaPDF → pdf-lib/PDFBox
   - Pdfium wrapper → Native libraries
   - Form field detection
   - Signature generation

3. **Testing** (22-32 hours)
   - PDF generation tests
   - Signature verification tests

---

### Phase 7: Frontend Integration

**Effort**: 40-60 hours
**Timeline**: Weeks 18-19

**Tasks**:
1. **API Client Update** (16 hours)
   - Update API calls to new endpoints
   - Handle response format changes

2. **Authentication Flow** (16 hours)
   - Integrate new JWT flow
   - Update login/logout

3. **Testing** (8-20 hours)
   - E2E tests
   - UI regression tests

---

### Phase 8: Deployment & DevOps

**Effort**: 60-80 hours
**Timeline**: Weeks 20-22

**Tasks**:
1. **Containerization** (16 hours)
   - Update Dockerfiles
   - Multi-stage builds

2. **CI/CD** (24 hours)
   - Update GitHub Actions
   - Automated testing
   - Deployment pipelines

3. **Monitoring** (12 hours)
   - Logging setup
   - Performance monitoring
   - Error tracking

4. **Documentation** (8-20 hours)
   - API documentation
   - Deployment guides
   - Developer guides

---

## Effort Summary

| Phase | Description | Effort (hours) | Duration (weeks) |
|-------|-------------|----------------|------------------|
| 1 | OCR Service | 40 | 1 |
| 2 | Database Schema | 80-120 | 2-3 |
| 3 | API Layer | 120-160 | 4 |
| 4 | Background Jobs | 60-80 | 2 |
| 5 | Service Layer | 100-140 | 4 |
| 6 | PDF Processing | 80-100 | 3 |
| 7 | Frontend Integration | 40-60 | 2 |
| 8 | Deployment & DevOps | 60-80 | 3 |
| **Total** | | **580-780** | **21-26** |

**Estimated Timeline**: 5-7 months with 1-2 full-time developers

## Risk Assessment

### High Risks

1. **PDF Processing Complexity**
   - **Risk**: Ruby HexaPDF has features not in TypeScript/Java libraries
   - **Mitigation**: Evaluate libraries early, consider keeping Ruby service

2. **Performance Degradation**
   - **Risk**: TypeScript/Java may be slower for certain operations
   - **Mitigation**: Performance benchmarking, optimization, caching

3. **Data Migration**
   - **Risk**: Data loss or corruption during migration
   - **Mitigation**: Extensive testing, rollback plans, zero-downtime migration

### Medium Risks

4. **Authentication/Authorization**
   - **Risk**: Security vulnerabilities in new implementation
   - **Mitigation**: Security audit, penetration testing

5. **Third-party Integrations**
   - **Risk**: Breaking integrations (AWS, Azure, Google Cloud)
   - **Mitigation**: Integration tests, backward compatibility

6. **Developer Learning Curve**
   - **Risk**: Team unfamiliar with new stack
   - **Mitigation**: Training, documentation, pair programming

### Low Risks

7. **UI Changes**
   - **Risk**: Minimal (Vue.js stays the same)
   - **Mitigation**: N/A

## Cost Analysis

### Development Costs

**Assumptions**:
- Developer rate: $100-150/hour
- QA rate: $75-100/hour

| Category | Hours | Cost Range |
|----------|-------|------------|
| Development | 580-780 | $58,000 - $117,000 |
| QA/Testing | 120-160 | $9,000 - $16,000 |
| DevOps | 40-60 | $4,000 - $9,000 |
| Project Management | 80-100 | $8,000 - $15,000 |
| **Total** | **820-1,100** | **$79,000 - $157,000** |

### Infrastructure Costs (Annual)

| Resource | Current | New (TypeScript) | New (Java) |
|----------|---------|------------------|------------|
| Compute | $2,400 | $3,000 | $3,600 |
| Database | $1,200 | $1,200 | $1,200 |
| Storage | $600 | $600 | $600 |
| Monitoring | $0 | $600 | $600 |
| **Total** | **$4,200** | **$5,400** | **$6,000** |

## Recommendations

### Short-term (0-3 months)

1. ✅ **Deploy OCR microservice** (DONE)
2. **Evaluate TypeScript vs Java** with small proof-of-concept
3. **Setup development environment** for chosen stack
4. **Begin Phase 2** (Database Schema Migration)

### Medium-term (3-6 months)

5. **Complete API Layer Migration** (Phase 3)
6. **Migrate Background Jobs** (Phase 4)
7. **Begin Service Layer Migration** (Phase 5)
8. **Run parallel deployments** (Ruby + TypeScript/Java)

### Long-term (6-12 months)

9. **Complete all migrations**
10. **Performance optimization**
11. **Deprecate Ruby services**
12. **Monitor and iterate**

## Success Criteria

1. **Feature Parity**: All existing features work in new stack
2. **Performance**: Response times within 10% of current system
3. **Reliability**: 99.9% uptime maintained
4. **Security**: Pass security audit
5. **Cost**: Infrastructure costs within budget
6. **Developer Experience**: Faster development cycles

## Conclusion

The migration from Ruby to TypeScript/Java is feasible but requires significant effort (5-7 months with 1-2 developers). The hybrid approach with microservices (starting with OCR) provides immediate benefits while reducing risk.

**Recommended Next Steps**:
1. Approve OCR microservice deployment ✅
2. Choose TypeScript vs Java for main application
3. Begin Phase 2 (Database Schema Migration)
4. Allocate budget and resources
5. Setup project tracking and milestones
