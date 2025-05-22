-- CreateTable
CREATE TABLE "ScheduledJob" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "fireDate" TIMESTAMP(3) NOT NULL,
    "jobType" TEXT NOT NULL,
    "jobData" JSONB,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "executedAt" TIMESTAMP(3),
    "failureReason" TEXT,

    CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledJob_jobId_key" ON "ScheduledJob"("jobId");

-- CreateIndex
CREATE INDEX "ScheduledJob_status_idx" ON "ScheduledJob"("status");

-- CreateIndex
CREATE INDEX "ScheduledJob_jobType_idx" ON "ScheduledJob"("jobType");

-- CreateIndex
CREATE INDEX "ScheduledJob_fireDate_idx" ON "ScheduledJob"("fireDate");

-- CreateIndex
CREATE INDEX "ScheduledJob_jobId_idx" ON "ScheduledJob"("jobId");
