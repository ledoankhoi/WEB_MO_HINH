// Ảnh sản phẩm thật (ảnh hộp và ảnh mô hình hoàn thiện) cho dữ liệu mẫu, lấy từ trang của các cửa hàng bán lẻ.
// Chỉ dùng cho mục đích học thuật (luận văn); trang sản phẩm ghi nguồn bên dưới ảnh. Lần khởi động đầu, các ảnh này được
// ghi vào bảng product_media (src/server/db/index.ts, khoá seed:product-photos-2026-11-06) và chỉ hiện ở trang chi tiết sản phẩm;
// ảnh đại diện (thẻ sản phẩm, giỏ hàng, menu) vẫn là ảnh dựng từ mô hình 3D.
// Thêm sản phẩm: thêm một mục theo slug rồi tăng hậu tố khoá seed, hoặc tải ảnh trong trang quản trị.
// `box`: danh sách "Trong hộp có gì" theo trang nguồn, ghi vào products.box_contents khi cột còn trống.
export type ProductPhotoSet = { source: string; sourceUrl: string; urls: string[]; box?: string[] };

export const PRODUCT_PHOTOS: Record<string, ProductPhotoSet> = {
  "rx-78-2-gundam": {
    source: "otakumart.co.nz",
    sourceUrl: "https://otakumart.co.nz/products/rx-78-2-gundam-ver-3-0-mg-1-100",
    urls: [
      "https://otakumart.co.nz/cdn/shop/products/om-BAN5061610-1.jpg?v=1656121030",
      "https://otakumart.co.nz/cdn/shop/products/om-BAN5061610-2_1024x.jpg?v=1656121029",
      "https://otakumart.co.nz/cdn/shop/products/om-BAN5061610-3_1024x.jpg?v=1656121029",
      "https://otakumart.co.nz/cdn/shop/products/om-BAN5061610-4_1024x.jpg?v=1656121029",
      "https://otakumart.co.nz/cdn/shop/products/om-BAN5061610-5_1024x.jpg?v=1656121030",
    ],
    box: ["Linh kiện lắp RX-78-2 Gundam Ver. 3.0", "Core Fighter", "2 beam saber", "Beam rifle", "Hyper bazooka", "Tờ sticker và hướng dẫn lắp"],
  },
  "zeta-gundam": {
    source: "otakumart.co.nz",
    sourceUrl: "https://otakumart.co.nz/products/zeta-gundam-ver-ka-mg-1-100",
    urls: [
      "https://otakumart.co.nz/cdn/shop/files/zeta-gundam-ver-ka-mg-1_1024x.jpg?v=1719363311",
      "https://otakumart.co.nz/cdn/shop/files/zeta-gundam-ver-ka-mg-2_1024x.jpg?v=1719363311",
      "https://otakumart.co.nz/cdn/shop/files/zeta-gundam-ver-ka-mg-3_1024x.jpg?v=1719363311",
      "https://otakumart.co.nz/cdn/shop/files/zeta-gundam-ver-ka-mg-4_1024x.jpg?v=1719363311",
      "https://otakumart.co.nz/cdn/shop/files/zeta-gundam-ver-ka-mg-5_1024x.jpg?v=1719363311",
      "https://otakumart.co.nz/cdn/shop/files/zeta-gundam-ver-ka-mg-6_1024x.jpg?v=1719363311",
    ],
    box: ["Linh kiện lắp Zeta Gundam Ver.Ka (biến hình Waverider)", "Khiên", "Beam rifle", "2 beam saber", "2 hộp đạn grenade launcher", "Bộ bàn tay thay thế", "Khớp trưng bày cho dạng MS và WR", "2 figure phi công", "Sticker foil và decal nước"],
  },
  "strike-freedom-gundam": {
    source: "hobbyco.com.au",
    sourceUrl: "https://hobbyco.com.au/products/rg-1-144-zgmf-x20a-strike-freedom-gundam",
    urls: [
      "https://www.hobbyco.com.au/cdn/shop/files/rg-1144-zgmf-x20a-strike-freedom-gundam-bandai.jpg?v=1788474995&width=1400",
      "https://www.hobbyco.com.au/cdn/shop/files/rg-1144-zgmf-x20a-strike-freedom-gundam-bandai-2.jpg?v=1788474996&width=1400",
      "https://www.hobbyco.com.au/cdn/shop/products/rg-1144-zgmf-x20a-strike-freedom-gundam-bandai-3.jpg?v=1788474998&width=1400",
      "https://www.hobbyco.com.au/cdn/shop/products/rg-1144-zgmf-x20a-strike-freedom-gundam-bandai-4.jpg?v=1788474999&width=1400",
      "https://www.hobbyco.com.au/cdn/shop/products/rg-1144-zgmf-x20a-strike-freedom-gundam-bandai-5.webp?v=1788475000&width=1400",
    ],
    box: ["Linh kiện lắp RG Strike Freedom Gundam (khung trong mạ vàng)", "2 beam rifle", "2 beam saber", "Beam shield (nhựa trong)", "Figure Kira Yamato", "Decal realistic"],
  },
  "gundam-exia": {
    source: "otakumart.co.nz",
    sourceUrl: "https://otakumart.co.nz/products/gundam-exia-mg-1-100",
    urls: [
      "https://otakumart.co.nz/cdn/shop/products/om-BAN5061586-1.jpg?v=1656123763",
      "https://otakumart.co.nz/cdn/shop/products/om-BAN5061586-2.jpg?v=1656123764",
      "https://otakumart.co.nz/cdn/shop/products/om-BAN5061586-3.jpg?v=1656123763",
      "https://otakumart.co.nz/cdn/shop/products/om-BAN5061586-4.jpg?v=1656123763",
      "https://otakumart.co.nz/cdn/shop/products/om-BAN5061586-5.jpg?v=1656123763",
      "https://otakumart.co.nz/cdn/shop/products/om-BAN5061586-6.jpg?v=1656123764",
    ],
    box: ["Linh kiện lắp MG Gundam Exia", "GN Sword (dạng kiếm và súng)", "GN Long Blade, GN Short Blade", "2 GN Beam Saber, 2 GN Beam Dagger", "GN Shield", "Đế trưng bày GN Drive"],
  },
  "full-armor-unicorn-gundam": {
    source: "otakumart.co.nz",
    sourceUrl: "https://otakumart.co.nz/products/full-armor-unicorn-gundam-rg-1-144",
    urls: [
      "https://otakumart.co.nz/cdn/shop/products/om-BAN5055586-1_1024x.jpg?v=1655601175",
      "https://otakumart.co.nz/cdn/shop/products/om-BAN5055586-2_1024x.jpg?v=1655601174",
      "https://otakumart.co.nz/cdn/shop/products/om-BAN5055586-3_1024x.jpg?v=1655601174",
      "https://otakumart.co.nz/cdn/shop/products/om-BAN5055586-4_1024x.jpg?v=1655601175",
      "https://otakumart.co.nz/cdn/shop/products/om-BAN5055586-5_1024x.jpg?v=1655601175",
      "https://otakumart.co.nz/cdn/shop/products/om-BAN5055586-6_1024x.jpg?v=1655601173",
    ],
  },
  "sazabi": {
    source: "otakumart.co.nz",
    sourceUrl: "https://otakumart.co.nz/products/msn-04-sazabi-rg-1-144",
    urls: [
      "https://otakumart.co.nz/cdn/shop/products/om-BAN5061605-1.jpg?v=1655603792",
      "https://otakumart.co.nz/cdn/shop/products/om-BAN5061605-2.jpg?v=1655603792",
      "https://otakumart.co.nz/cdn/shop/products/om-BAN5061605-3.jpg?v=1655603792",
      "https://otakumart.co.nz/cdn/shop/products/om-BAN5061605-4.jpg?v=1655603792",
      "https://otakumart.co.nz/cdn/shop/products/om-BAN5061605-5.jpg?v=1655603793",
      "https://otakumart.co.nz/cdn/shop/products/om-BAN5061605-6.jpg?v=1655603792",
    ],
    box: ["Linh kiện lắp RG Sazabi", "Beam shot rifle", "Beam tomahawk", "2 beam saber", "Khiên", "6 funnel", "Tên lửa", "Decal realistic", "Hướng dẫn lắp"],
  },
  "chars-zaku-ii": {
    source: "otakumart.co.nz",
    sourceUrl: "https://otakumart.co.nz/products/ms-06s-char-s-zaku-ii-hg-1-144",
    urls: [
      "https://otakumart.co.nz/cdn/shop/products/om-BAN5058888-1_1024x.jpg?v=1655518776",
      "https://otakumart.co.nz/cdn/shop/products/om-BAN5058888-2_1024x.jpg?v=1655518776",
      "https://otakumart.co.nz/cdn/shop/products/om-BAN5058888-3_1024x.jpg?v=1655518776",
      "https://otakumart.co.nz/cdn/shop/products/om-BAN5058888-4_1024x.jpg?v=1655518776",
      "https://otakumart.co.nz/cdn/shop/products/om-BAN5058888-5_1024x.jpg?v=1655518776",
    ],
    box: ["Linh kiện lắp HGUC Char's Zaku II", "Heat hawk", "Súng máy Zaku", "Bazooka", "Sticker foil"],
  },
  "wing-gundam": {
    source: "lascalemodel.com",
    sourceUrl: "https://lascalemodel.com/products/hg-1-144-hgac-xxxg-01w-wing-gundam",
    urls: [
      "https://lascalemodel.com/cdn/shop/products/HGAC-Wing-Gundam-box_800x.webp?v=1707768831",
      "https://lascalemodel.com/cdn/shop/products/HGAC-Wing-Gundam-3_800x.webp?v=1707768831",
      "https://lascalemodel.com/cdn/shop/products/HGAC-Wing-Gundam-1_800x.webp?v=1674516022",
      "https://lascalemodel.com/cdn/shop/products/HGAC-Wing-Gundam-2_800x.webp?v=1674516022",
      "https://lascalemodel.com/cdn/shop/products/HGAC-Wing-Gundam-4_800x.webp?v=1674516022",
    ],
    box: ["Linh kiện lắp HGAC Wing Gundam (biến hình Bird Mode)", "Buster rifle", "Khiên", "Beam saber", "Sticker foil và sticker marking"],
  },
  "acguy": {
    source: "lascalemodel.com",
    sourceUrl: "https://lascalemodel.com/products/hg-1-144-hguc-msm-04-acguy",
    urls: [
      "https://lascalemodel.com/cdn/shop/products/HGUC-Acguy-boxart_800x.webp?v=1680198556",
      "https://lascalemodel.com/cdn/shop/products/HGUC-Acguy_800x.webp?v=1680198556",
      "https://lascalemodel.com/cdn/shop/products/HGUC-Acguy-2_800x.webp?v=1680198556",
      "https://lascalemodel.com/cdn/shop/products/HGUC-Acguy-3_800x.webp?v=1680198556",
      "https://lascalemodel.com/cdn/shop/products/HGUC-Acguy-4_800x.webp?v=1680198556",
    ],
    box: ["Linh kiện lắp HGUC Acguy", "Bàn tay vuốt (thu và duỗi)", "Bàn tay phóng tên lửa", "Sticker foil"],
  },
  "alliance-optimus-prime": {
    source: "japan-figure.com",
    sourceUrl: "https://japan-figure.com/products/takara-tomy-transformers-masterpiece-mp-44s-optimus-prime-japan",
    urls: [
      "https://japan-figure.com/cdn/shop/products/Transformers-Masterpiece-Mp44S-Optimus-Prime-Japan-Figure-4904810919049-0.jpg?v=1690353723&width=1100",
      "https://japan-figure.com/cdn/shop/products/Transformers-Masterpiece-Mp44S-Optimus-Prime-Japan-Figure-4904810919049-1.jpg?v=1690353723&width=1100",
      "https://japan-figure.com/cdn/shop/products/Transformers-Masterpiece-Mp44S-Optimus-Prime-Japan-Figure-4904810919049-2.jpg?v=1690353723&width=1100",
      "https://japan-figure.com/cdn/shop/products/Transformers-Masterpiece-Mp44S-Optimus-Prime-Japan-Figure-4904810919049-3.jpg?v=1690353723&width=1100",
      "https://japan-figure.com/cdn/shop/products/Transformers-Masterpiece-Mp44S-Optimus-Prime-Japan-Figure-4904810919049-4.jpg?v=1690353723&width=1100",
    ],
  },
  "bumblebee": {
    source: "japan-figure.com",
    sourceUrl: "https://japan-figure.com/products/takara-tomy-t-spark-bumblebee-figure-ts-43-transformers-form",
    urls: [
      "https://japan-figure.com/cdn/shop/files/takara-tomy-t-spark-studio-series-transformers-ts-43-bumblebee_1_1788916394.webp?v=1788923858&width=1061",
      "https://japan-figure.com/cdn/shop/files/takara-tomy-t-spark-studio-series-transformers-ts-43-bumblebee_2_1788916394.webp?v=1788923858&width=1062",
      "https://japan-figure.com/cdn/shop/files/takara-tomy-t-spark-studio-series-transformers-ts-43-bumblebee_3_1788916395.webp?v=1788923857&width=1059",
      "https://japan-figure.com/cdn/shop/files/takara-tomy-t-spark-studio-series-transformers-ts-43-bumblebee_4_1788916395.webp?v=1788923858&width=1058",
      "https://japan-figure.com/cdn/shop/files/takara-tomy-t-spark-studio-series-transformers-ts-43-bumblebee_5_1788916396.webp?v=1788923858&width=1056",
    ],
  },
  // Bổ sung 06/11/2026 (khoá seed:product-photos-2026-11-06): đồ chơi thật cùng nhân vật, ưu tiên bản G1/Beast Wars và đúng dòng
  // (Studio Series 86, Legacy, Combiner Wars, Kingdom). Hook và Long Haul bán chung một hộp đôi nên dùng chung ảnh.
  "alliance-arcee": {
    source: "japan-figure.com",
    sourceUrl: "https://japan-figure.com/products/takara-tomy-transformers-ss-106-arcee-action-figure-toy",
    urls: [
      "https://japan-figure.com/cdn/shop/products/Takara-Tomy-Transformers-Ss106-Arcee-4904810909705-0.jpg?v=1708436815",
      "https://japan-figure.com/cdn/shop/products/Takara-Tomy-Transformers-Ss106-Arcee-4904810909705-1.jpg?v=1708436815",
      "https://japan-figure.com/cdn/shop/products/Takara-Tomy-Transformers-Ss106-Arcee-4904810909705-2.jpg?v=1708436815",
      "https://japan-figure.com/cdn/shop/products/Takara-Tomy-Transformers-Ss106-Arcee-4904810909705-3.jpg?v=1708436815",
    ],
  },
  "alliance-grimlock": {
    source: "japan-figure.com",
    sourceUrl: "https://japan-figure.com/products/takara-tomy-tl-31-grimlock-transformers-legacy",
    urls: [
      "https://japan-figure.com/cdn/shop/products/Transformers-Transformers-Legacy-Tl31-Grimlock-Japan-Figure-4904810911074-0.jpg?v=1699270787",
      "https://japan-figure.com/cdn/shop/products/Transformers-Transformers-Legacy-Tl31-Grimlock-Japan-Figure-4904810911074-1.jpg?v=1699270787",
      "https://japan-figure.com/cdn/shop/products/Transformers-Transformers-Legacy-Tl31-Grimlock-Japan-Figure-4904810911074-2.jpg?v=1699270787",
      "https://japan-figure.com/cdn/shop/products/Transformers-Transformers-Legacy-Tl31-Grimlock-Japan-Figure-4904810911074-3.jpg?v=1699270787",
      "https://japan-figure.com/cdn/shop/products/Transformers-Transformers-Legacy-Tl31-Grimlock-Japan-Figure-4904810911074-4.jpg?v=1699270787",
    ],
  },
  "blades": {
    source: "cmdstore.com",
    sourceUrl: "https://www.cmdstore.com/products/transformers-generations-combiner-wars-deluxe-class-wave-3-6-inch-blades",
    urls: [
      "https://www.cmdstore.com/cdn/shop/files/transformers-generations-combiner-wars-deluxe-class-wave-3-6-inch-blades_image.gif?v=1784753379",
    ],
  },
  "bonecrusher": {
    source: "cmdstore.com",
    sourceUrl: "https://www.cmdstore.com/products/transformers-studio-series-constructicon-deluxe-class-2025-wave-1-bonecrusher-5010996301130",
    urls: [
      "https://www.cmdstore.com/cdn/shop/files/transformers-studio-series-constructicon-deluxe-class-2025-wave-1-bonecrusher-5010996301130.jpg?v=1746818520",
      "https://www.cmdstore.com/cdn/shop/files/transformers-studio-series-constructicon-deluxe-class-2025-wave-1-bonecrusher-5010996301130-2.jpg?v=1746818520",
      "https://www.cmdstore.com/cdn/shop/files/transformers-studio-series-constructicon-deluxe-class-2025-wave-1-bonecrusher-5010996301130-3.jpg?v=1746818520",
    ],
  },
  "breakdown": {
    source: "cmdstore.com",
    sourceUrl: "https://www.cmdstore.com/products/transformers-generations-legacy-deluxe-class-wave-4-breakdown-5010994196943",
    urls: [
      "https://www.cmdstore.com/cdn/shop/files/transformers-generations-legacy-deluxe-class-wave-4-breakdown-5010994196943-pkg.jpg?v=1767912270",
      "https://www.cmdstore.com/cdn/shop/files/transformers-generations-legacy-deluxe-class-wave-4-breakdown-5010994196943-2.jpg?v=1767912270",
      "https://www.cmdstore.com/cdn/shop/files/transformers-generations-legacy-deluxe-class-wave-4-breakdown-5010994196943.jpg?v=1767912270",
    ],
  },
  "cliffjumper": {
    source: "japan-figure.com",
    sourceUrl: "https://japan-figure.com/products/takara-tomy-transformers-cliff-jumper-age-of-prime-action-figure",
    urls: [
      "https://japan-figure.com/cdn/shop/files/takara-tomy-transformers-age-of-the-prime-cliff-jumper-action-figure_1_1778484854.webp?v=1778485209",
      "https://japan-figure.com/cdn/shop/files/takara-tomy-transformers-age-of-the-prime-cliff-jumper-action-figure_2_1778484855.webp?v=1778485209",
      "https://japan-figure.com/cdn/shop/files/takara-tomy-transformers-age-of-the-prime-cliff-jumper-action-figure_3_1778484855.webp?v=1778485209",
      "https://japan-figure.com/cdn/shop/files/takara-tomy-transformers-age-of-the-prime-cliff-jumper-action-figure_4_1778484856.webp?v=1778485209",
      "https://japan-figure.com/cdn/shop/files/takara-tomy-transformers-age-of-the-prime-cliff-jumper-action-figure_5_1778484856.webp?v=1778485209",
      "https://japan-figure.com/cdn/shop/files/takara-tomy-transformers-age-of-the-prime-cliff-jumper-action-figure_6_1778484857.webp?v=1778485209",
    ],
  },
  "dead-end": {
    source: "japan-figure.com",
    sourceUrl: "https://japan-figure.com/products/transformers-transformers-legacy-tl-16-dead-end",
    urls: [
      "https://japan-figure.com/cdn/shop/products/Transformers-Transformers-Legacy-Tl16-Dead-End-Japan-Figure-4904810220848-0.jpg?v=1664953315",
      "https://japan-figure.com/cdn/shop/products/Transformers-Transformers-Legacy-Tl16-Dead-End-Japan-Figure-4904810220848-1.jpg?v=1664953315",
      "https://japan-figure.com/cdn/shop/products/Transformers-Transformers-Legacy-Tl16-Dead-End-Japan-Figure-4904810220848-2.jpg?v=1664953315",
      "https://japan-figure.com/cdn/shop/products/Transformers-Transformers-Legacy-Tl16-Dead-End-Japan-Figure-4904810220848-3.jpg?v=1664953315",
      "https://japan-figure.com/cdn/shop/products/Transformers-Transformers-Legacy-Tl16-Dead-End-Japan-Figure-4904810220848-4.jpg?v=1664953315",
    ],
  },
  "devastator": {
    source: "toyarena.com",
    sourceUrl: "https://www.toyarena.com/products/transformers-studio-series-86-devastator-figure-set",
    urls: [
      "https://www.toyarena.com/cdn/shop/files/SS86DEvastatora.jpg?v=1755309000",
    ],
  },
  "drag-strip": {
    source: "toyarena.com",
    sourceUrl: "https://www.toyarena.com/products/transformers-generations-legacy-deluxe-class-drag-strip-action-figure-1",
    urls: [
      "https://www.toyarena.com/cdn/shop/products/5010993974917c_0351a1f1-0408-440a-abb4-10aab744957c.jpg?v=1652916562",
      "https://www.toyarena.com/cdn/shop/products/5010993974917a_8e08cc98-5666-483f-b559-fcc0cc66b082.jpg?v=1652916562",
      "https://www.toyarena.com/cdn/shop/products/5010993974917b_41c9b86a-8ed4-45c3-a859-61ca7e92ee0f.jpg?v=1652916562",
      "https://www.toyarena.com/cdn/shop/products/5010993974917d_5fab26b1-c061-4cc3-adef-5396396ebd4d.jpg?v=1652916562",
      "https://www.toyarena.com/cdn/shop/products/5010993974917e_b1e3d11d-5c2c-4915-9aa6-21a67c3fcb13.jpg?v=1652916562",
      "https://www.toyarena.com/cdn/shop/products/5010993974917f_1383b849-9953-4feb-ad4a-0c540238fb52.jpg?v=1652916562",
    ],
  },
  "first-aid": {
    source: "cmdstore.com",
    sourceUrl: "https://www.cmdstore.com/products/transformers-generations-combiner-wars-deluxe-class-wave-3-6-inch-first-aid",
    urls: [
      "https://www.cmdstore.com/cdn/shop/files/transformers-generations-combiner-wars-deluxe-class-wave-3-6-inch-first-aid_image.gif?v=1784753234",
    ],
  },
  "galvatron": {
    source: "japan-figure.com",
    sourceUrl: "https://japan-figure.com/products/takara-tomy-transformers-studio-series-ss-145-galvatron-action-figure",
    urls: [
      "https://japan-figure.com/cdn/shop/files/Takara-Tomy-Transformers-The-Movie-Studio-Series-Ss145-Galvatron-Action-Figure-4904810991465-0.jpg?v=1738501671",
      "https://japan-figure.com/cdn/shop/files/Takara-Tomy-Transformers-The-Movie-Studio-Series-Ss145-Galvatron-Action-Figure-4904810991465-1.jpg?v=1738501671",
      "https://japan-figure.com/cdn/shop/files/Takara-Tomy-Transformers-The-Movie-Studio-Series-Ss145-Galvatron-Action-Figure-4904810991465-2.jpg?v=1738501671",
      "https://japan-figure.com/cdn/shop/files/Takara-Tomy-Transformers-The-Movie-Studio-Series-Ss145-Galvatron-Action-Figure-4904810991465-3.jpg?v=1738501671",
      "https://japan-figure.com/cdn/shop/files/Takara-Tomy-Transformers-The-Movie-Studio-Series-Ss145-Galvatron-Action-Figure-4904810991465-4.jpg?v=1738501671",
    ],
  },
  "groove": {
    source: "japan-figure.com",
    sourceUrl: "https://japan-figure.com/products/hasbro-transformers-combiner-wars-deluxe-groove",
    urls: [
      "https://japan-figure.com/cdn/shop/files/0d08fbbbc11b49612f73cd62dbdc3730.webp?v=1768656610",
      "https://japan-figure.com/cdn/shop/files/a8d17e08d7bd438bab1547b645c9646b.webp?v=1768656615",
      "https://japan-figure.com/cdn/shop/files/46eb9ec650bdbcd20d7de0efe963d2cb.webp?v=1768656618",
    ],
  },
  "gundam-phenex": {
    source: "japan-figure.com",
    sourceUrl: "https://japan-figure.com/products/robot-spirtis-side-ms-rx-0-unicorn-gundam-03-phenex-narrative-ver-figure-bandai-bandai",
    urls: [
      "https://japan-figure.com/cdn/shop/products/Robot-Spirtis-Side-Ms-Rx-0-Unicorn-Gundam-03-Phenex-Narrative-Ver-Figure-Bandai-Japan-Figure-4573102550200-0.jpg?v=1647413689",
      "https://japan-figure.com/cdn/shop/products/Robot-Spirtis-Side-Ms-Rx-0-Unicorn-Gundam-03-Phenex-Narrative-Ver-Figure-Bandai-Japan-Figure-4573102550200-1.jpg?v=1647413689",
      "https://japan-figure.com/cdn/shop/products/Robot-Spirtis-Side-Ms-Rx-0-Unicorn-Gundam-03-Phenex-Narrative-Ver-Figure-Bandai-Japan-Figure-4573102550200-2.jpg?v=1647413690",
      "https://japan-figure.com/cdn/shop/products/Robot-Spirtis-Side-Ms-Rx-0-Unicorn-Gundam-03-Phenex-Narrative-Ver-Figure-Bandai-Japan-Figure-4573102550200-3.jpg?v=1647413690",
      "https://japan-figure.com/cdn/shop/products/Robot-Spirtis-Side-Ms-Rx-0-Unicorn-Gundam-03-Phenex-Narrative-Ver-Figure-Bandai-Japan-Figure-4573102550200-4.jpg?v=1647413690",
    ],
  },
  "hook": {
    source: "cmdstore.com",
    sourceUrl: "https://www.cmdstore.com/products/transformers-studio-series-deluxe-class-2-pack-constructicon-hook-long-haul-5010996309242",
    urls: [
      "https://www.cmdstore.com/cdn/shop/files/transformers-studio-series-deluxe-class-2-pack-constructicon-hook-long-haul-5010996309242.jpg?v=1751151765",
      "https://www.cmdstore.com/cdn/shop/files/transformers-studio-series-deluxe-class-2-pack-constructicon-hook-long-haul-5010996309242-2.jpg?v=1751151765",
      "https://www.cmdstore.com/cdn/shop/files/transformers-studio-series-deluxe-class-2-pack-constructicon-hook-long-haul-5010996309242-3.jpg?v=1751151765",
    ],
  },
  "hot-spot": {
    source: "cmdstore.com",
    sourceUrl: "https://www.cmdstore.com/products/transformers-generations-combiner-wars-voyager-class-wave-3-8-inch-hot-spot",
    urls: [
      "https://www.cmdstore.com/cdn/shop/files/transformers-generations-combiner-wars-voyager-class-wave-3-8-inch-hot-spot_image.gif?v=1723127660",
    ],
  },
  "hound": {
    source: "japan-figure.com",
    sourceUrl: "https://japan-figure.com/products/takara-tomy-transformers-hound-mtmte-action-figure-for-display",
    urls: [
      "https://japan-figure.com/cdn/shop/files/takara-tomy-transformers-hound-mtmte-action-figure_1_1785224899.webp?v=1785299444",
      "https://japan-figure.com/cdn/shop/files/takara-tomy-transformers-hound-mtmte-action-figure_2_1785224899.webp?v=1785299444",
      "https://japan-figure.com/cdn/shop/files/takara-tomy-transformers-hound-mtmte-action-figure_3_1785224900.webp?v=1785299444",
      "https://japan-figure.com/cdn/shop/files/takara-tomy-transformers-hound-mtmte-action-figure_4_1785224900.webp?v=1785299444",
    ],
  },
  "ironhide": {
    source: "japan-figure.com",
    sourceUrl: "https://japan-figure.com/products/takara-tomy-transformers-ss-110-ironhide-action-figure-toy",
    urls: [
      "https://japan-figure.com/cdn/shop/products/Transformers-Transformers-Ss110-Ironhide-4904810909750-0.jpg?v=1708769129",
      "https://japan-figure.com/cdn/shop/products/Transformers-Transformers-Ss110-Ironhide-4904810909750-1.jpg?v=1708769129",
      "https://japan-figure.com/cdn/shop/products/Transformers-Transformers-Ss110-Ironhide-4904810909750-2.jpg?v=1708769129",
      "https://japan-figure.com/cdn/shop/products/Transformers-Transformers-Ss110-Ironhide-4904810909750-3.jpg?v=1708769129",
      "https://japan-figure.com/cdn/shop/products/Transformers-Transformers-Ss110-Ironhide-4904810909750-4.jpg?v=1708769129",
    ],
  },
  "jazz": {
    source: "japan-figure.com",
    sourceUrl: "https://japan-figure.com/products/takara-tomy-spark-ts-41-autobot-jazz-studio-series-figure-display",
    urls: [
      "https://japan-figure.com/cdn/shop/files/takara-tomy-t-spark-transformers-studio-series-ts-41-autobot-jazz_1_1788916071.webp?v=1788924311",
      "https://japan-figure.com/cdn/shop/files/takara-tomy-t-spark-transformers-studio-series-ts-41-autobot-jazz_2_1788916072.webp?v=1788924311",
      "https://japan-figure.com/cdn/shop/files/takara-tomy-t-spark-transformers-studio-series-ts-41-autobot-jazz_3_1788916072.webp?v=1788924311",
      "https://japan-figure.com/cdn/shop/files/takara-tomy-t-spark-transformers-studio-series-ts-41-autobot-jazz_4_1788916073.webp?v=1788924311",
      "https://japan-figure.com/cdn/shop/files/takara-tomy-t-spark-transformers-studio-series-ts-41-autobot-jazz_5_1788916073.webp?v=1788924311",
    ],
  },
  "jetfire": {
    source: "toyarena.com",
    sourceUrl: "https://www.toyarena.com/products/transformers-masterpiece-mp-57-skyfire-jetfire-action-figure",
    urls: [
      "https://www.toyarena.com/cdn/shop/products/4904810133452.webp?v=1675108676",
      "https://www.toyarena.com/cdn/shop/products/MP-57POd_f497f92c-24e7-40ea-949a-ae6ed13e04d7.jpg?v=1675108654",
      "https://www.toyarena.com/cdn/shop/products/MP-57POb_1e32ec62-315b-4c5a-8839-37d94c1c2c40.jpg?v=1675108654",
      "https://www.toyarena.com/cdn/shop/products/MP-57POc_bc342464-d744-49fd-92dd-622eb7ba773f.jpg?v=1675108654",
      "https://www.toyarena.com/cdn/shop/products/MP-57POe_f303e576-706d-411b-813c-e69f079cec0f.jpg?v=1675108654",
      "https://www.toyarena.com/cdn/shop/products/MP-57POf_bd31ff3e-72b1-44a9-9213-088f34119004.jpg?v=1675108654",
    ],
  },
  "long-haul": {
    source: "cmdstore.com",
    sourceUrl: "https://www.cmdstore.com/products/transformers-studio-series-deluxe-class-2-pack-constructicon-hook-long-haul-5010996309242",
    urls: [
      "https://www.cmdstore.com/cdn/shop/files/transformers-studio-series-deluxe-class-2-pack-constructicon-hook-long-haul-5010996309242.jpg?v=1751151765",
      "https://www.cmdstore.com/cdn/shop/files/transformers-studio-series-deluxe-class-2-pack-constructicon-hook-long-haul-5010996309242-2.jpg?v=1751151765",
      "https://www.cmdstore.com/cdn/shop/files/transformers-studio-series-deluxe-class-2-pack-constructicon-hook-long-haul-5010996309242-3.jpg?v=1751151765",
    ],
  },
  "menasor": {
    source: "toyarena.com",
    sourceUrl: "https://www.toyarena.com/products/transformers-unite-warriors-uw-02-menasor-stunticons",
    urls: [
      "https://www.toyarena.com/cdn/shop/products/4904810831723.JPG?v=1571609187",
    ],
  },
  "mixmaster": {
    source: "cmdstore.com",
    sourceUrl: "https://www.cmdstore.com/products/transformers-studio-series-voyager-class-2025-wave-3-mixmaster-5010996323521",
    urls: [
      "https://www.cmdstore.com/cdn/shop/files/transformers-studio-series-voyager-class-2025-wave-3-mixmaster-5010996323521.jpg?v=1750978046",
      "https://www.cmdstore.com/cdn/shop/files/transformers-studio-series-voyager-class-2025-wave-3-mixmaster-5010996323521-2.jpg?v=1750978046",
      "https://www.cmdstore.com/cdn/shop/files/transformers-studio-series-voyager-class-2025-wave-3-mixmaster-5010996323521-3.jpg?v=1750978046",
    ],
  },
  "motormaster": {
    source: "toyarena.com",
    sourceUrl: "https://www.toyarena.com/products/transformers-generations-legacy-commander-class-motormaster-action-figure-1",
    urls: [
      "https://www.toyarena.com/cdn/shop/products/5010994111366a_e8146a35-cb5e-4c16-9215-1e3265f02718.jpg?v=1659144765",
      "https://www.toyarena.com/cdn/shop/products/5010994111366b_1b5267af-7231-449e-8ad1-7603ba3f81f9.jpg?v=1659144765",
      "https://www.toyarena.com/cdn/shop/products/5010994111366c_219d3298-d7bc-40e2-8f18-a0dfef0af04e.jpg?v=1659144765",
      "https://www.toyarena.com/cdn/shop/products/5010994111366d_b71ca331-6064-4a4d-8d26-512c8967231c.jpg?v=1659144766",
      "https://www.toyarena.com/cdn/shop/products/5010994111366e_59b28f26-1878-466c-a312-d9b84fab9c3a.jpg?v=1659144766",
      "https://www.toyarena.com/cdn/shop/products/5010994111366f_6d0a775a-b10a-4834-b8ae-ae1812c85ba0.jpg?v=1659144767",
    ],
  },
  "muteki-shogun": {
    source: "japan-figure.com",
    sourceUrl: "https://japan-figure.com/products/super-mini-pla-ninja-combination-invincible-shogun-5-pieces-candy-toy-refreshment-ninja-sentai-kakuranger",
    urls: [
      "https://japan-figure.com/cdn/shop/products/Super-MiniPla-Ninja-Combination-Invincible-Shogun-5-Pieces-Candy-ToyRefreshment-Ninja-Sentai-Kakuranger-Japan-Figure-4549660250920-0.jpg?v=1659686708",
      "https://japan-figure.com/cdn/shop/products/Super-MiniPla-Ninja-Combination-Invincible-Shogun-5-Pieces-Candy-ToyRefreshment-Ninja-Sentai-Kakuranger-Japan-Figure-4549660250920-1.jpg?v=1659686708",
      "https://japan-figure.com/cdn/shop/products/Super-MiniPla-Ninja-Combination-Invincible-Shogun-5-Pieces-Candy-ToyRefreshment-Ninja-Sentai-Kakuranger-Japan-Figure-4549660250920-2.jpg?v=1659686708",
      "https://japan-figure.com/cdn/shop/products/Super-MiniPla-Ninja-Combination-Invincible-Shogun-5-Pieces-Candy-ToyRefreshment-Ninja-Sentai-Kakuranger-Japan-Figure-4549660250920-3.jpg?v=1659686708",
      "https://japan-figure.com/cdn/shop/products/Super-MiniPla-Ninja-Combination-Invincible-Shogun-5-Pieces-Candy-ToyRefreshment-Ninja-Sentai-Kakuranger-Japan-Figure-4549660250920-4.jpg?v=1659686708",
    ],
  },
  "optimus-primal": {
    source: "japan-figure.com",
    sourceUrl: "https://japan-figure.com/products/takara-tomy-transformers-war-for-cybertron-wfc-19-optimus-primal-japan-w-rat-trap",
    urls: [
      "https://japan-figure.com/cdn/shop/products/Transformers-War-For-Cybertron-Series-Wfc19-Optimus-Primal-With-Rat-Trap-Japan-Figure-4904810173618-0.jpg?v=1691662645",
      "https://japan-figure.com/cdn/shop/products/Transformers-War-For-Cybertron-Series-Wfc19-Optimus-Primal-With-Rat-Trap-Japan-Figure-4904810173618-1.jpg?v=1691662645",
      "https://japan-figure.com/cdn/shop/products/Transformers-War-For-Cybertron-Series-Wfc19-Optimus-Primal-With-Rat-Trap-Japan-Figure-4904810173618-2.jpg?v=1691662645",
      "https://japan-figure.com/cdn/shop/products/Transformers-War-For-Cybertron-Series-Wfc19-Optimus-Primal-With-Rat-Trap-Japan-Figure-4904810173618-3.jpg?v=1691662645",
      "https://japan-figure.com/cdn/shop/products/Transformers-War-For-Cybertron-Series-Wfc19-Optimus-Primal-With-Rat-Trap-Japan-Figure-4904810173618-4.jpg?v=1691662645",
    ],
  },
  "rodimus-prime": {
    source: "japan-figure.com",
    sourceUrl: "https://japan-figure.com/products/takara-tomy-transformers-kingdom-kd-12-rodimus-prime-japan",
    urls: [
      "https://japan-figure.com/cdn/shop/products/Transformers-Kingdom-Series-Kd12-Rodimus-Prime-Japan-Figure-4904810177852-0.jpg?v=1691662594",
      "https://japan-figure.com/cdn/shop/products/Transformers-Kingdom-Series-Kd12-Rodimus-Prime-Japan-Figure-4904810177852-1.jpg?v=1691662594",
      "https://japan-figure.com/cdn/shop/products/Transformers-Kingdom-Series-Kd12-Rodimus-Prime-Japan-Figure-4904810177852-2.jpg?v=1691662594",
      "https://japan-figure.com/cdn/shop/products/Transformers-Kingdom-Series-Kd12-Rodimus-Prime-Japan-Figure-4904810177852-3.jpg?v=1691662594",
      "https://japan-figure.com/cdn/shop/products/Transformers-Kingdom-Series-Kd12-Rodimus-Prime-Japan-Figure-4904810177852-4.jpg?v=1691662594",
    ],
  },
  "scavenger": {
    source: "cmdstore.com",
    sourceUrl: "https://www.cmdstore.com/products/transformers-studio-series-deluxe-class-2025-wave-3-scavenger-5010996323439",
    urls: [
      "https://www.cmdstore.com/cdn/shop/files/transformers-studio-series-deluxe-class-2025-wave-3-scavenger-5010996323439.jpg?v=1750978034",
      "https://www.cmdstore.com/cdn/shop/files/transformers-studio-series-deluxe-class-2025-wave-3-scavenger-5010996323439-2.jpg?v=1750978034",
      "https://www.cmdstore.com/cdn/shop/files/transformers-studio-series-deluxe-class-2025-wave-3-scavenger-5010996323439-3.jpg?v=1750978034",
    ],
  },
  "scrapper": {
    source: "cmdstore.com",
    sourceUrl: "https://www.cmdstore.com/products/transformers-studio-series-constructicon-voyager-class-2025-wave-1-scrapper-5010996301185",
    urls: [
      "https://www.cmdstore.com/cdn/shop/files/transformers-studio-series-constructicon-voyager-class-2025-wave-1-scrapper-5010996301185.jpg?v=1745702770",
      "https://www.cmdstore.com/cdn/shop/files/transformers-studio-series-constructicon-voyager-class-2025-wave-1-scrapper-5010996301185-2.jpg?v=1745702770",
      "https://www.cmdstore.com/cdn/shop/files/transformers-studio-series-constructicon-voyager-class-2025-wave-1-scrapper-5010996301185-3.jpg?v=1745702770",
    ],
  },
  "shockwave": {
    source: "japan-figure.com",
    sourceUrl: "https://japan-figure.com/products/takara-tomy-transformers-siege-sg-14-shockwave-figure-tomy-takaratomy",
    urls: [
      "https://japan-figure.com/cdn/shop/products/Takara-Tomy-Transformers-Siege-Sg-14-Shockwave-Figure-Japan-Figure-4904810595731-0.jpg?v=1647227260",
      "https://japan-figure.com/cdn/shop/products/Takara-Tomy-Transformers-Siege-Sg-14-Shockwave-Figure-Japan-Figure-4904810595731-1.jpg?v=1647227260",
      "https://japan-figure.com/cdn/shop/products/Takara-Tomy-Transformers-Siege-Sg-14-Shockwave-Figure-Japan-Figure-4904810595731-2.jpg?v=1647227260",
      "https://japan-figure.com/cdn/shop/products/Takara-Tomy-Transformers-Siege-Sg-14-Shockwave-Figure-Japan-Figure-4904810595731-3.jpg?v=1647227260",
      "https://japan-figure.com/cdn/shop/products/Takara-Tomy-Transformers-Siege-Sg-14-Shockwave-Figure-Japan-Figure-4904810595731-4.jpg?v=1647227260",
      "https://japan-figure.com/cdn/shop/products/Takara-Tomy-Transformers-Siege-Sg-14-Shockwave-Figure-Japan-Figure-4904810595731-5.jpg?v=1647227260",
    ],
  },
  "skywarp": {
    source: "japan-figure.com",
    sourceUrl: "https://japan-figure.com/products/takara-tomy-transformers-ss-136-skywarp-action-figure-toy",
    urls: [
      "https://japan-figure.com/cdn/shop/files/Transformers-Ss136-Skywarp-4904810945994-0.jpg?v=1722780604",
      "https://japan-figure.com/cdn/shop/files/Transformers-Ss136-Skywarp-4904810945994-1.jpg?v=1722780604",
      "https://japan-figure.com/cdn/shop/files/Transformers-Ss136-Skywarp-4904810945994-2.jpg?v=1722780604",
      "https://japan-figure.com/cdn/shop/files/Transformers-Ss136-Skywarp-4904810945994-3.jpg?v=1722780604",
      "https://japan-figure.com/cdn/shop/files/Transformers-Ss136-Skywarp-4904810945994-4.jpg?v=1722780604",
    ],
  },
  "sludge": {
    source: "japan-figure.com",
    sourceUrl: "https://japan-figure.com/products/takara-tomy-transformers-legacy-tl-28-sludge-action-figure",
    urls: [
      "https://japan-figure.com/cdn/shop/products/Transformers-Transformers-Legacy-Tl28-Sludge-4904810907923-0.jpg?v=1708436847",
      "https://japan-figure.com/cdn/shop/products/Transformers-Transformers-Legacy-Tl28-Sludge-4904810907923-1.jpg?v=1708436847",
      "https://japan-figure.com/cdn/shop/products/Transformers-Transformers-Legacy-Tl28-Sludge-4904810907923-2.jpg?v=1708436847",
      "https://japan-figure.com/cdn/shop/products/Transformers-Transformers-Legacy-Tl28-Sludge-4904810907923-3.jpg?v=1708436847",
      "https://japan-figure.com/cdn/shop/products/Transformers-Transformers-Legacy-Tl28-Sludge-4904810907923-4.jpg?v=1708436847",
    ],
  },
  "snarl": {
    source: "japan-figure.com",
    sourceUrl: "https://japan-figure.com/products/takara-tomy-ss-111-dinobot-snarl-transformers",
    urls: [
      "https://japan-figure.com/cdn/shop/products/Transformers-Transformers-Ss111-Dinobot-Snarl-Japan-Figure-4904810909767-0.jpg?v=1702918505",
      "https://japan-figure.com/cdn/shop/products/Transformers-Transformers-Ss111-Dinobot-Snarl-Japan-Figure-4904810909767-1.jpg?v=1702918505",
      "https://japan-figure.com/cdn/shop/products/Transformers-Transformers-Ss111-Dinobot-Snarl-Japan-Figure-4904810909767-2.jpg?v=1702918505",
      "https://japan-figure.com/cdn/shop/products/Transformers-Transformers-Ss111-Dinobot-Snarl-Japan-Figure-4904810909767-3.jpg?v=1702918505",
      "https://japan-figure.com/cdn/shop/products/Transformers-Transformers-Ss111-Dinobot-Snarl-Japan-Figure-4904810909767-4.jpg?v=1702918505",
    ],
  },
  "streetwise": {
    source: "cmdstore.com",
    sourceUrl: "https://www.cmdstore.com/products/transformers-generations-combiner-wars-deluxe-class-wave-3-6-inch-streetwise",
    urls: [
      "https://www.cmdstore.com/cdn/shop/files/transformers-generations-combiner-wars-deluxe-class-wave-3-6-inch-streetwise_image.gif?v=1784753245",
    ],
  },
  "swoop": {
    source: "japan-figure.com",
    sourceUrl: "https://japan-figure.com/products/takara-tomy-transformers-ss-132-swoop-action-figure",
    urls: [
      "https://japan-figure.com/cdn/shop/files/Transformers-Ss132-Swoop-4904810941392-0.jpg?v=1722780842",
      "https://japan-figure.com/cdn/shop/files/Transformers-Ss132-Swoop-4904810941392-1.jpg?v=1722780842",
      "https://japan-figure.com/cdn/shop/files/Transformers-Ss132-Swoop-4904810941392-2.jpg?v=1722780842",
      "https://japan-figure.com/cdn/shop/files/Transformers-Ss132-Swoop-4904810941392-3.jpg?v=1722780842",
      "https://japan-figure.com/cdn/shop/files/Transformers-Ss132-Swoop-4904810941392-4.jpg?v=1722780842",
    ],
  },
  "thundercracker": {
    source: "japan-figure.com",
    sourceUrl: "https://japan-figure.com/products/takara-tomy-tl-36-thundercracker-transformers",
    urls: [
      "https://japan-figure.com/cdn/shop/products/Transformers-Tl36-Thundercracker-Japan-Figure-4904810911111-0.jpg?v=1699267608",
      "https://japan-figure.com/cdn/shop/products/Transformers-Tl36-Thundercracker-Japan-Figure-4904810911111-1.jpg?v=1699267608",
      "https://japan-figure.com/cdn/shop/products/Transformers-Tl36-Thundercracker-Japan-Figure-4904810911111-2.jpg?v=1699267608",
      "https://japan-figure.com/cdn/shop/products/Transformers-Tl36-Thundercracker-Japan-Figure-4904810911111-3.jpg?v=1699267608",
      "https://japan-figure.com/cdn/shop/products/Transformers-Tl36-Thundercracker-Japan-Figure-4904810911111-4.jpg?v=1699267608",
    ],
  },
  "ultra-magnus": {
    source: "japan-figure.com",
    sourceUrl: "https://japan-figure.com/products/takara-tomy-transformers-ss-119-ultra-magnus",
    urls: [
      "https://japan-figure.com/cdn/shop/products/Transformers-Ss119-Ultra-Magnus-Japan-Figure-4904810918509-0.jpg?v=1702910154",
      "https://japan-figure.com/cdn/shop/products/Transformers-Ss119-Ultra-Magnus-Japan-Figure-4904810918509-1.jpg?v=1702910154",
      "https://japan-figure.com/cdn/shop/products/Transformers-Ss119-Ultra-Magnus-Japan-Figure-4904810918509-2.jpg?v=1702910154",
      "https://japan-figure.com/cdn/shop/products/Transformers-Ss119-Ultra-Magnus-Japan-Figure-4904810918509-3.jpg?v=1702910154",
      "https://japan-figure.com/cdn/shop/products/Transformers-Ss119-Ultra-Magnus-Japan-Figure-4904810918509-4.jpg?v=1702910154",
    ],
  },
  "volcanicus": {
    source: "toyarena.com",
    sourceUrl: "https://www.toyarena.com/products/transformers-generations-selects-tt-gs11-volcanicus-action-figure-exclusive",
    urls: [
      "https://www.toyarena.com/cdn/shop/products/4904810172079a.jpg?v=1616187615",
      "https://www.toyarena.com/cdn/shop/products/4904810172079c.jpg?v=1616187615",
      "https://www.toyarena.com/cdn/shop/products/4904810172079b.jpg?v=1616187615",
      "https://www.toyarena.com/cdn/shop/products/4904810172079e.jpg?v=1616187615",
      "https://www.toyarena.com/cdn/shop/products/4904810172079f.jpg?v=1616187615",
      "https://www.toyarena.com/cdn/shop/products/4904810172079d.jpg?v=1616187615",
    ],
  },
  "waspinator": {
    source: "japan-figure.com",
    sourceUrl: "https://japan-figure.com/products/takara-tomy-transformers-kingdom-kd-20-waspinator-japan",
    urls: [
      "https://japan-figure.com/cdn/shop/products/Transformers-Kingdom-Series-Kd20-Waspinator-Japan-Figure-4904810177968-0.jpg?v=1691760333",
      "https://japan-figure.com/cdn/shop/products/Transformers-Kingdom-Series-Kd20-Waspinator-Japan-Figure-4904810177968-1.jpg?v=1691760333",
      "https://japan-figure.com/cdn/shop/products/Transformers-Kingdom-Series-Kd20-Waspinator-Japan-Figure-4904810177968-2.jpg?v=1691760333",
      "https://japan-figure.com/cdn/shop/products/Transformers-Kingdom-Series-Kd20-Waspinator-Japan-Figure-4904810177968-3.jpg?v=1691760334",
      "https://japan-figure.com/cdn/shop/products/Transformers-Kingdom-Series-Kd20-Waspinator-Japan-Figure-4904810177968-4.jpg?v=1691760334",
    ],
  },
  "wheeljack": {
    source: "toyarena.com",
    sourceUrl: "https://www.toyarena.com/products/transformers-generations-studio-series-86-deluxe-wheeljack-action-figure",
    urls: [
      "https://www.toyarena.com/cdn/shop/files/5010996380647a.webp?v=1778788585",
      "https://www.toyarena.com/cdn/shop/files/5010996380647b.jpg?v=1778788585",
      "https://www.toyarena.com/cdn/shop/files/5010996380647c.jpg?v=1778788585",
      "https://www.toyarena.com/cdn/shop/files/5010996380647d.webp?v=1778788586",
      "https://www.toyarena.com/cdn/shop/files/5010996380647e.webp?v=1778788585",
      "https://www.toyarena.com/cdn/shop/files/5010996380647f.webp?v=1778788585",
    ],
  },
  "wildrider": {
    source: "toyarena.com",
    sourceUrl: "https://www.toyarena.com/products/transformers-generations-legacy-deluxe-class-decepticon-wild-rider-action-figure-1",
    urls: [
      "https://www.toyarena.com/cdn/shop/products/5010993971992a_ffd21644-f511-42f8-8467-68d4c2509b84.jpg?v=1660871253",
      "https://www.toyarena.com/cdn/shop/products/5010993971992b_1b9965f1-8313-4d94-82f5-d066fe4f7046.jpg?v=1660871253",
      "https://www.toyarena.com/cdn/shop/products/5010993971992c_3b0afe61-e684-419d-8746-76557e609aa1.jpg?v=1660871253",
      "https://www.toyarena.com/cdn/shop/products/5010993971992d_8e901f04-61f6-40db-b828-22e408706dfc.jpg?v=1660871253",
      "https://www.toyarena.com/cdn/shop/products/5010993971992e_4fa0d66d-5b8c-4e67-91c9-856f58515230.jpg?v=1660871253",
      "https://www.toyarena.com/cdn/shop/products/5010993971992f_f162f080-0ce9-432c-a401-8c76e54d1060.jpg?v=1660871253",
    ],
  },
};

// Tên miền ảnh ngoài, để trang sản phẩm ghi nguồn.
export function photoSource(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return Object.values(PRODUCT_PHOTOS).some((set) => set.source === host) ? host : null;
  } catch {
    return null;
  }
}
