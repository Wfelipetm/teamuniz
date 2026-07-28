-- AlterTable
ALTER TABLE "DayPhoto" ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "message" TEXT;

-- AlterTable
ALTER TABLE "UserConfig" ADD COLUMN     "scheduleTime" TEXT NOT NULL DEFAULT '05:00';

-- CreateTable
CREATE TABLE "SendLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "groupJid" TEXT NOT NULL,
    "hadPhoto" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'auto',
    "error" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SendLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SendLog_userId_idx" ON "SendLog"("userId");

-- CreateIndex
CREATE INDEX "SendLog_sentAt_idx" ON "SendLog"("sentAt");

-- AddForeignKey
ALTER TABLE "SendLog" ADD CONSTRAINT "SendLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
