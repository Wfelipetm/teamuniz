-- CreateTable
CREATE TABLE "GroupAutomation" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "groupJid" TEXT NOT NULL,
    "groupName" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT 'Bom dia! Aqui vai o treino de hoje! 💪',
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "scheduleTime" TEXT NOT NULL DEFAULT '05:00',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupAutomation_userId_groupJid_key" ON "GroupAutomation"("userId", "groupJid");

-- CreateIndex
CREATE INDEX "GroupAutomation_userId_idx" ON "GroupAutomation"("userId");

-- AddForeignKey
ALTER TABLE "GroupAutomation" ADD CONSTRAINT "GroupAutomation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
