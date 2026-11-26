-- DropIndex
DROP INDEX "Appointment_doctorId_scheduledAt_key";

-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "slaDueAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SupportAttachment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportAttachment_storageKey_key" ON "SupportAttachment"("storageKey");

-- CreateIndex
CREATE INDEX "SupportAttachment_ticketId_createdAt_idx" ON "SupportAttachment"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportAttachment_uploadedBy_createdAt_idx" ON "SupportAttachment"("uploadedBy", "createdAt");

-- CreateIndex
CREATE INDEX "Appointment_doctorId_scheduledAt_idx" ON "Appointment"("doctorId", "scheduledAt");

-- CreateIndex
CREATE INDEX "SupportTicket_priority_slaDueAt_idx" ON "SupportTicket"("priority", "slaDueAt");

-- CreateIndex
CREATE INDEX "SupportTicket_escalatedAt_status_idx" ON "SupportTicket"("escalatedAt", "status");

-- AddForeignKey
ALTER TABLE "SupportAttachment" ADD CONSTRAINT "SupportAttachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportAttachment" ADD CONSTRAINT "SupportAttachment_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
