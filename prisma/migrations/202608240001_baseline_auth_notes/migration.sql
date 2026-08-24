-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expiresAt" DATETIME NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "issuer" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" DATETIME,
    "refreshTokenExpiresAt" DATETIME,
    "scope" TEXT,
    "password" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuthRateLimit" (
    "keyHash" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "windowStartedAt" DATETIME NOT NULL,
    "attempts" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL,

    PRIMARY KEY ("keyHash", "action")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "markdown" TEXT NOT NULL,
    "linksJson" TEXT NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Concept" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "aliasesJson" TEXT NOT NULL DEFAULT '[]',
    "domain" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "embeddingJson" TEXT NOT NULL DEFAULT '[]',
    "popularity" REAL NOT NULL DEFAULT 0.5
);

-- CreateTable
CREATE TABLE "ConceptEdge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromConceptId" TEXT NOT NULL,
    "toConceptId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "weight" REAL NOT NULL DEFAULT 0.5,
    "explanation" TEXT NOT NULL,
    CONSTRAINT "ConceptEdge_fromConceptId_fkey" FOREIGN KEY ("fromConceptId") REFERENCES "Concept" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ConceptEdge_toConceptId_fkey" FOREIGN KEY ("toConceptId") REFERENCES "Concept" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LibraryResource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "authorsJson" TEXT NOT NULL DEFAULT '[]',
    "year" INTEGER,
    "language" TEXT NOT NULL,
    "abstract" TEXT,
    "location" TEXT,
    "callNumber" TEXT,
    "availability" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "qualityScore" REAL NOT NULL DEFAULT 0.5,
    "sourceUrl" TEXT
);

-- CreateTable
CREATE TABLE "ResourceConcept" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resourceId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "weight" REAL NOT NULL DEFAULT 1.0,
    CONSTRAINT "ResourceConcept_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "LibraryResource" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ResourceConcept_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LivingBookProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "displayName" TEXT,
    "displayMode" TEXT NOT NULL DEFAULT 'anonymous',
    "bio" TEXT,
    "expertiseLevel" TEXT NOT NULL DEFAULT 'peer',
    "willingTypesJson" TEXT NOT NULL DEFAULT '[]',
    "availabilityJson" TEXT NOT NULL DEFAULT '{}',
    "consentState" TEXT NOT NULL DEFAULT 'private',
    "helpfulnessScore" REAL NOT NULL DEFAULT 0.5,
    CONSTRAINT "LivingBookProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LivingBookConcept" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "livingBookId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "weight" REAL NOT NULL DEFAULT 1.0,
    CONSTRAINT "LivingBookConcept_livingBookId_fkey" FOREIGN KEY ("livingBookId") REFERENCES "LivingBookProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LivingBookConcept_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueJson" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0.5,
    "source" TEXT NOT NULL,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Interaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "taskType" TEXT,
    "level" TEXT,
    "sliderValue" INTEGER NOT NULL,
    "extractedConceptsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Interaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "interactionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "rating" TEXT NOT NULL,
    "freeText" TEXT,
    "memoryPatchesJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Feedback_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "Interaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WormholeRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "interactionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startConceptsJson" TEXT NOT NULL,
    "sliderValue" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WormholeRun_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "Interaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WormholePath" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "pathConceptsJson" TEXT NOT NULL,
    "destinationConceptId" TEXT NOT NULL,
    "resourceIdsJson" TEXT NOT NULL DEFAULT '[]',
    "livingBookIdsJson" TEXT NOT NULL DEFAULT '[]',
    "novelty" REAL NOT NULL,
    "noveltyFit" REAL NOT NULL,
    "bridgeScore" REAL NOT NULL,
    "qualityScore" REAL NOT NULL,
    "diversityScore" REAL NOT NULL,
    "finalScore" REAL NOT NULL,
    "explanation" TEXT NOT NULL,
    CONSTRAINT "WormholePath_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WormholeRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PersonMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requesterUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "bridgeConceptsJson" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "explanation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'suggested',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ContactRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personMatchId" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_issuer_accountId_key" ON "Account"("issuer", "accountId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE INDEX "AuthRateLimit_expiresAt_idx" ON "AuthRateLimit"("expiresAt");

-- CreateIndex
CREATE INDEX "Note_ownerId_deletedAt_updatedAt_idx" ON "Note"("ownerId", "deletedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "ConceptEdge_fromConceptId_idx" ON "ConceptEdge"("fromConceptId");

-- CreateIndex
CREATE INDEX "ConceptEdge_toConceptId_idx" ON "ConceptEdge"("toConceptId");

-- CreateIndex
CREATE INDEX "ResourceConcept_conceptId_idx" ON "ResourceConcept"("conceptId");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceConcept_resourceId_conceptId_key" ON "ResourceConcept"("resourceId", "conceptId");

-- CreateIndex
CREATE UNIQUE INDEX "LivingBookProfile_userId_key" ON "LivingBookProfile"("userId");

-- CreateIndex
CREATE INDEX "LivingBookConcept_conceptId_idx" ON "LivingBookConcept"("conceptId");

-- CreateIndex
CREATE UNIQUE INDEX "LivingBookConcept_livingBookId_conceptId_relation_key" ON "LivingBookConcept"("livingBookId", "conceptId", "relation");

-- CreateIndex
CREATE UNIQUE INDEX "UserMemory_userId_category_key_key" ON "UserMemory"("userId", "category", "key");
