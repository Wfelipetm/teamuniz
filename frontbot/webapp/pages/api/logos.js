import fs from "fs";
import path from "path";

// Lista as imagens disponíveis em public/logo — qualquer arquivo colocado
// nessa pasta aparece automaticamente como opção de logo na "Criar arte".
export default function handler(req, res) {
    const dir = path.join(process.cwd(), "public", "logo");
    let logos = [];
    try {
        logos = fs
            .readdirSync(dir)
            .filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f))
            .sort();
    } catch {
        logos = [];
    }
    res.status(200).json({ logos });
}
