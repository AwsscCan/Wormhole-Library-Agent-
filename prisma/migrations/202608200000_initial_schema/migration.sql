CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Concept" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "aliasesJson" TEXT NOT NULL DEFAULT '[]',
    "domain" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "embeddingJson" TEXT NOT NULL DEFAULT '[]',
    "popularity" REAL NOT NULL DEFAULT 0.5
);

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

CREATE TABLE "ResourceConcept" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resourceId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "weight" REAL NOT NULL DEFAULT 1.0,
    CONSTRAINT "ResourceConcept_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "LibraryResource" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ResourceConcept_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

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

CREATE TABLE "LivingBookConcept" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "livingBookId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "weight" REAL NOT NULL DEFAULT 1.0,
    CONSTRAINT "LivingBookConcept_livingBookId_fkey" FOREIGN KEY ("livingBookId") REFERENCES "LivingBookProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LivingBookConcept_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

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

CREATE TABLE "WormholeRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "interactionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startConceptsJson" TEXT NOT NULL,
    "sliderValue" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WormholeRun_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "Interaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

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

CREATE TABLE "ContactRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personMatchId" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "ConceptEdge_fromConceptId_idx" ON "ConceptEdge"("fromConceptId");
CREATE INDEX "ConceptEdge_toConceptId_idx" ON "ConceptEdge"("toConceptId");
CREATE INDEX "ResourceConcept_conceptId_idx" ON "ResourceConcept"("conceptId");
CREATE UNIQUE INDEX "ResourceConcept_resourceId_conceptId_key" ON "ResourceConcept"("resourceId", "conceptId");
CREATE UNIQUE INDEX "LivingBookProfile_userId_key" ON "LivingBookProfile"("userId");
CREATE INDEX "LivingBookConcept_conceptId_idx" ON "LivingBookConcept"("conceptId");
CREATE UNIQUE INDEX "LivingBookConcept_livingBookId_conceptId_relation_key" ON "LivingBookConcept"("livingBookId", "conceptId", "relation");
CREATE UNIQUE INDEX "UserMemory_userId_category_key_key" ON "UserMemory"("userId", "category", "key");
