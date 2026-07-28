-- Remove coluna message da GroupAutomation (agora é por dia)
ALTER TABLE "GroupAutomation" DROP COLUMN IF EXISTS "message";

-- CreateTable
CREATE TABLE "GroupAutomationDay" (
    "id" SERIAL NOT NULL,
    "automationId" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "GroupAutomationDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupAutomationDay_automationId_day_key" ON "GroupAutomationDay"("automationId", "day");

-- CreateIndex
CREATE INDEX "GroupAutomationDay_automationId_idx" ON "GroupAutomationDay"("automationId");

-- AddForeignKey
ALTER TABLE "GroupAutomationDay" ADD CONSTRAINT "GroupAutomationDay_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "GroupAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
