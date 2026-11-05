// Ảnh sản phẩm thật (ảnh hộp và ảnh mô hình hoàn thiện) cho dữ liệu mẫu, lấy từ trang của các cửa hàng bán lẻ.
// Chỉ dùng cho mục đích học thuật (luận văn); trang sản phẩm ghi nguồn bên dưới ảnh. Lần khởi động đầu, các ảnh này được
// ghi vào bảng product_media và ảnh đầu tiên thành ảnh đại diện (src/server/db/index.ts, khoá seed:product-photos-v1).
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
