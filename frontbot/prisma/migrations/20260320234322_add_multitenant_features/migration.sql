-- CreateTable
CREATE TABLE "UserConfig" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "groupJid" TEXT NOT NULL DEFAULT '',
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "message" TEXT NOT NULL DEFAULT 'Bom dia! Aqui vai o treino de hoje! 💪',

    CONSTRAINT "UserConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayPhoto" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledMessage" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "groupJid" TEXT NOT NULL,
    "message" TEXT,
    "mediaBase64" TEXT,
    "mediaMimeType" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserConfig_userId_key" ON "UserConfig"("userId");

-- CreateIndex
CREATE INDEX "DayPhoto_userId_idx" ON "DayPhoto"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DayPhoto_userId_day_key" ON "DayPhoto"("userId", "day");

-- CreateIndex
CREATE INDEX "ScheduledMessage_userId_idx" ON "ScheduledMessage"("userId");

-- CreateIndex
CREATE INDEX "ScheduledMessage_scheduledAt_sent_idx" ON "ScheduledMessage"("scheduledAt", "sent");

-- AddForeignKey
ALTER TABLE "UserConfig" ADD CONSTRAINT "UserConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayPhoto" ADD CONSTRAINT "DayPhoto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledMessage" ADD CONSTRAINT "ScheduledMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
