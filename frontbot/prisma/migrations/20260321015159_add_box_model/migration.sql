-- AlterTable
ALTER TABLE "Movement" ADD COLUMN     "boxId" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "boxId" INTEGER;

-- CreateTable
CREATE TABLE "Box" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Box_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Box_name_key" ON "Box"("name");

-- CreateIndex
CREATE INDEX "Movement_boxId_idx" ON "Movement"("boxId");

-- CreateIndex
CREATE INDEX "User_boxId_idx" ON "User"("boxId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "Box"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "Box"("id") ON DELETE SET NULL ON UPDATE CASCADE;
