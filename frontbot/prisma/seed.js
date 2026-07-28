const prisma = require("../prismaClient");
const bcrypt = require("bcryptjs");

async function main() {
    const email = process.env.ADMIN_EMAIL || "admin@botbox.com";
    const password = process.env.ADMIN_PASSWORD || "admin@2026";
    const name = process.env.ADMIN_NAME || "Admin";

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
        // Garante que o admin existente tenha role ADMIN
        if (exists.role !== "ADMIN") {
            await prisma.user.update({ where: { email }, data: { role: "ADMIN" } });
            console.log(`🔄 Usuário "${email}" promovido a ADMIN.`);
        } else {
            console.log(`✅ Usuário admin "${email}" já existe.`);
        }
        return;
    }

    const hash = await bcrypt.hash(password, 12);
    await prisma.user.create({
        data: { email, password: hash, name, role: "ADMIN" },
    });
    console.log(`✅ Usuário admin criado: ${email}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
