import { loadPhoton } from "./photon.js";
// Сторона итоговой картинки: до 2000px модель читает мелкий текст без потерь.
const MAX_SIDE = 2000;
const GAP = 16;
const LABEL = 56;
/**
 * Склеивает несколько изображений в одно, сеткой, с номером над каждым.
 * Нужно моделям с лимитом картинок на запрос (qwen3-8 на alem.ai — одна):
 * без склейки из сообщения с 2–4 фото модель видела бы только одно.
 * Возвращает null, если склеить не удалось (тогда лимит обрежет лишнее).
 */
export async function combineImages(images) {
    const photon = await loadPhoton();
    if (!photon || images.length < 2)
        return null;
    const decoded = [];
    try {
        for (const image of images) {
            decoded.push(photon.PhotonImage.new_from_base64(image.data));
        }
        const columns = Math.ceil(Math.sqrt(decoded.length));
        const rows = Math.ceil(decoded.length / columns);
        const cell = Math.floor((MAX_SIDE - GAP * (columns + 1)) / columns);
        const cellHeight = Math.floor((MAX_SIDE - GAP * (rows + 1)) / rows) - LABEL;
        // Высота строки — по самой высокой картинке в ней, чтобы не тратить место зря.
        const placed = decoded.map((img) => {
            const scale = Math.min(1, cell / img.get_width(), cellHeight / img.get_height());
            return { img, width: Math.max(1, Math.round(img.get_width() * scale)), height: Math.max(1, Math.round(img.get_height() * scale)) };
        });
        const rowHeights = [];
        for (let r = 0; r < rows; r++) {
            rowHeights.push(Math.max(...placed.slice(r * columns, (r + 1) * columns).map((p) => p.height)));
        }
        const width = GAP + columns * (cell + GAP);
        const height = GAP + rowHeights.reduce((sum, h) => sum + LABEL + h + GAP, 0);
        const canvas = new photon.PhotonImage(new Uint8Array(width * height * 4).fill(255), width, height);
        const badge = new photon.PhotonImage(new Uint8Array(96 * 48 * 4).map((_, i) => (i % 4 === 3 ? 255 : 20)), 96, 48);
        try {
            let top = GAP;
            placed.forEach((p, index) => {
                const row = Math.floor(index / columns);
                const col = index % columns;
                if (col === 0 && row > 0)
                    top += LABEL + rowHeights[row - 1] + GAP;
                const left = GAP + col * (cell + GAP);
                photon.watermark(canvas, badge, BigInt(left), BigInt(top + 2));
                photon.draw_text(canvas, String(index + 1), left + 30, top + 6, 36);
                const resized = photon.resize(p.img, p.width, p.height, photon.SamplingFilter.Lanczos3);
                try {
                    photon.watermark(canvas, resized, BigInt(left), BigInt(top + LABEL));
                }
                finally {
                    resized.free();
                }
            });
            const jpeg = canvas.get_bytes_jpeg(90);
            return { type: "image", mimeType: "image/jpeg", data: Buffer.from(jpeg).toString("base64") };
        }
        finally {
            badge.free();
            canvas.free();
        }
    }
    catch {
        return null;
    }
    finally {
        for (const img of decoded)
            img.free();
    }
}
