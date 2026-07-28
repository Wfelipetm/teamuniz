-- CreateTable
CREATE TABLE "FlowConfig" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "ownerName" TEXT NOT NULL DEFAULT 'o Personal Trainer',
    "welcomeMessage" TEXT NOT NULL DEFAULT 'Olá! Seja bem-vindo(a) ao *Team Muniz 57* 💪

Sou o assistente virtual do personal trainer. Como posso te ajudar hoje?',
    "menuMessage" TEXT NOT NULL DEFAULT 'Escolha uma das opções abaixo:',
    "offHoursMessage" TEXT NOT NULL DEFAULT 'Nosso atendimento é das *06h às 20h*. Retornaremos em breve! 🙏',
    "humanMessage" TEXT NOT NULL DEFAULT 'Ótima escolha! 🎉 Vou te conectar com o personal agora. Aguarde um instante...',
    "attendanceStart" INTEGER NOT NULL DEFAULT 6,
    "attendanceEnd" INTEGER NOT NULL DEFAULT 20,
    "reminderDays" INTEGER NOT NULL DEFAULT 3,
    "followupMessage" TEXT NOT NULL DEFAULT 'Oi! Tudo bem? 😊 Passando para saber como você está se sentindo com os treinos. Tem alguma dúvida ou feedback?',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowMenuItem" (
    "id" SERIAL NOT NULL,
    "configId" INTEGER NOT NULL,
    "parentId" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" TEXT NOT NULL DEFAULT '',
    "isHuman" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FlowMenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowLead" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "step" TEXT NOT NULL DEFAULT 'menu',
    "selectedItem" INTEGER,
    "converted" BOOLEAN NOT NULL DEFAULT false,
    "lastContact" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reminderSent" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FlowConfig_userId_key" ON "FlowConfig"("userId");

-- CreateIndex
CREATE INDEX "FlowMenuItem_configId_idx" ON "FlowMenuItem"("configId");

-- CreateIndex
CREATE INDEX "FlowMenuItem_parentId_idx" ON "FlowMenuItem"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "FlowLead_userId_phone_key" ON "FlowLead"("userId", "phone");

-- CreateIndex
CREATE INDEX "FlowLead_userId_idx" ON "FlowLead"("userId");

-- CreateIndex
CREATE INDEX "FlowLead_lastContact_idx" ON "FlowLead"("lastContact");

-- AddForeignKey
ALTER TABLE "FlowConfig" ADD CONSTRAINT "FlowConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowMenuItem" ADD CONSTRAINT "FlowMenuItem_configId_fkey" FOREIGN KEY ("configId") REFERENCES "FlowConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowLead" ADD CONSTRAINT "FlowLead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
