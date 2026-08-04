-- CreateTable
CREATE TABLE "VideoTip" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'geral',
    "filename" TEXT NOT NULL,
    "duration" INTEGER,
    "filesize" INTEGER,
    "uploadedBy" INTEGER NOT NULL,
    "boxId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoTip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoxProgram" (
    "id" SERIAL NOT NULL,
    "boxId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "imageData" TEXT,
    "imageMimeType" TEXT,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoxProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoxSchedule" (
    "id" SERIAL NOT NULL,
    "boxId" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "className" TEXT NOT NULL,
    "coach" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BoxSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoxPlan" (
    "id" SERIAL NOT NULL,
    "boxId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'mensal',
    "features" TEXT,
    "highlighted" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BoxPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessRequest" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'Geral',
    "tag" TEXT NOT NULL DEFAULT '',
    "photoUrl" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VideoTip_filename_key" ON "VideoTip"("filename");

-- CreateIndex
CREATE INDEX "VideoTip_category_idx" ON "VideoTip"("category");

-- CreateIndex
CREATE INDEX "VideoTip_uploadedBy_idx" ON "VideoTip"("uploadedBy");

-- CreateIndex
CREATE INDEX "VideoTip_boxId_idx" ON "VideoTip"("boxId");

-- CreateIndex
CREATE INDEX "BoxProgram_boxId_date_idx" ON "BoxProgram"("boxId", "date");

-- CreateIndex
CREATE INDEX "BoxProgram_createdBy_idx" ON "BoxProgram"("createdBy");

-- CreateIndex
CREATE INDEX "BoxSchedule_boxId_dayOfWeek_idx" ON "BoxSchedule"("boxId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "BoxPlan_boxId_idx" ON "BoxPlan"("boxId");

-- CreateIndex
CREATE INDEX "AccessRequest_status_idx" ON "AccessRequest"("status");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "Product_active_idx" ON "Product"("active");

-- AddForeignKey
ALTER TABLE "VideoTip" ADD CONSTRAINT "VideoTip_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoTip" ADD CONSTRAINT "VideoTip_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "Box"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxProgram" ADD CONSTRAINT "BoxProgram_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "Box"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxProgram" ADD CONSTRAINT "BoxProgram_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxSchedule" ADD CONSTRAINT "BoxSchedule_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "Box"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxPlan" ADD CONSTRAINT "BoxPlan_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "Box"("id") ON DELETE CASCADE ON UPDATE CASCADE;

