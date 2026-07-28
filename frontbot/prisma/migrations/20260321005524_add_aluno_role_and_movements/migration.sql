-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'ALUNO';

-- CreateTable
CREATE TABLE "Movement" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Geral',
    "filename" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Movement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Movement_filename_key" ON "Movement"("filename");

-- CreateIndex
CREATE INDEX "Movement_category_idx" ON "Movement"("category");
