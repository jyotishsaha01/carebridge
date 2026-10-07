CREATE TYPE "NotificationType" AS ENUM ('APPOINTMENT', 'CLINICAL', 'DOCUMENT', 'PAYMENT', 'SECURITY', 'SYSTEM');
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS');
CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ');
CREATE TYPE "CarePlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "CareTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'SKIPPED');
CREATE TYPE "CareRequestType" AS ENUM ('DIAGNOSTIC', 'PROCEDURE', 'SURGERY', 'MEDICATION', 'COORDINATION');
CREATE TYPE "CareRequestStatus" AS ENUM ('REQUESTED', 'REVIEWING', 'APPROVED', 'SCHEDULED', 'COMPLETED', 'CANCELLED');

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
  "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "metadata" JSONB,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Notification_userId_status_createdAt_idx" ON "Notification"("userId", "status", "createdAt");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CarePlan" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "CarePlanStatus" NOT NULL DEFAULT 'DRAFT',
  "coordinatorNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CarePlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CarePlan_patientId_status_updatedAt_idx" ON "CarePlan"("patientId", "status", "updatedAt");
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CarePlanTask" (
  "id" TEXT NOT NULL,
  "carePlanId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "dueAt" TIMESTAMP(3),
  "status" "CareTaskStatus" NOT NULL DEFAULT 'TODO',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CarePlanTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CarePlanTask_carePlanId_status_dueAt_idx" ON "CarePlanTask"("carePlanId", "status", "dueAt");
ALTER TABLE "CarePlanTask" ADD CONSTRAINT "CarePlanTask_carePlanId_fkey" FOREIGN KEY ("carePlanId") REFERENCES "CarePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CareRequest" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "type" "CareRequestType" NOT NULL,
  "status" "CareRequestStatus" NOT NULL DEFAULT 'REQUESTED',
  "title" TEXT NOT NULL,
  "description" TEXT,
  "country" TEXT,
  "targetDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CareRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CareRequest_patientId_status_createdAt_idx" ON "CareRequest"("patientId", "status", "createdAt");
ALTER TABLE "CareRequest" ADD CONSTRAINT "CareRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
