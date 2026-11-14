// Nhận dạng robot từ logits của mô hình phân loại (docs/nhan-dang-robot/00-ke-hoach.md, B8 và B11).
// Dùng chung cho trình duyệt (sau khi worker ONNX trả logits) và máy chủ (kiểm tra lại trước khi ghi nhật ký).
// Phải cho kết quả giống hệt robotrec/evaluate.py (Python); test/recognition.test.ts so với bộ ca mẫu sinh từ Python.

export type RecognitionLabel = {
  index: number;
  slug: string;
  name: string;
  character: string;
  franchise: string;
  series: string;
};

export type RecognitionLevel = "class" | "character" | "franchise" | "none";

export type Hierarchy = {
  labels: RecognitionLabel[];
  classCharacter: number[];
  classFranchise: number[];
  characters: { name: string; franchise: string }[];
  franchises: string[];
};

export type RecognitionResult = {
  level: RecognitionLevel;
  classIndex: number;
  characterIndex: number;
  franchiseIndex: number;
  pClass: number;
  pCharacter: number;
  pFranchise: number;
  probabilities: number[];
  alternatives: { index: number; p: number }[];
};

// Cây nhãn 3 cấp: lớp (robot + dòng) → nhân vật (cùng franchise và cùng tên nhân vật) → franchise.
// Chỉ số nhân vật và franchise gán theo thứ tự lớp đầu tiên gặp, giống hàm hierarchy() của Python.
export function buildHierarchy(labels: RecognitionLabel[]): Hierarchy {
  const characterKey = new Map<string, number>();
  const franchiseKey = new Map<string, number>();
  const characters: { name: string; franchise: string }[] = [];
  const franchises: string[] = [];
  const classCharacter: number[] = [];
  const classFranchise: number[] = [];
  labels.forEach((label, i) => {
    if (label.index !== i) throw new Error(`Nhãn thứ ${i} có index ${label.index}: labels.json phải xếp theo index.`);
    const key = `${label.franchise}\u0000${label.character}`;
    if (!characterKey.has(key)) {
      characterKey.set(key, characters.length);
      characters.push({ name: label.character, franchise: label.franchise });
    }
    if (!franchiseKey.has(label.franchise)) {
      franchiseKey.set(label.franchise, franchises.length);
      franchises.push(label.franchise);
    }
    classCharacter.push(characterKey.get(key)!);
    classFranchise.push(franchiseKey.get(label.franchise)!);
  });
  return { labels, classCharacter, classFranchise, characters, franchises };
}

// softmax(z / T), trừ giá trị lớn nhất trước khi lấy mũ để không tràn số.
export function softmax(logits: ArrayLike<number>, temperature = 1): number[] {
  if (!(temperature > 0)) throw new Error("Nhiệt độ phải dương.");
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) max = Math.max(max, logits[i] / temperature);
  const out = new Array<number>(logits.length);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    out[i] = Math.exp(logits[i] / temperature - max);
    sum += out[i];
  }
  for (let i = 0; i < out.length; i++) out[i] /= sum;
  return out;
}

function argmax(values: ArrayLike<number>): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
  return best;
}

// Xác suất của nhân vật (franchise) = tổng xác suất các lớp con, cộng theo thứ tự lớp.
export function aggregate(probabilities: ArrayLike<number>, hierarchy: Hierarchy): { characters: number[]; franchises: number[] } {
  const characters = new Array<number>(hierarchy.characters.length).fill(0);
  const franchises = new Array<number>(hierarchy.franchises.length).fill(0);
  for (let i = 0; i < probabilities.length; i++) {
    characters[hierarchy.classCharacter[i]] += probabilities[i];
    franchises[hierarchy.classFranchise[i]] += probabilities[i];
  }
  return { characters, franchises };
}

// Luật trả lời theo cấp (B8): p(lớp) ≥ t₁ → lớp; ngược lại p(nhân vật) ≥ t₂ → nhân vật; ngược lại p(franchise) ≥ t₃ → franchise;
// còn lại → không nhận ra. t₁, t₂, t₃ và nhiệt độ T chọn trên tập val, ghi trong model-card.json của mô hình.
export function recognize(
  logits: ArrayLike<number>,
  hierarchy: Hierarchy,
  temperature: number,
  thresholds: readonly [number, number, number],
  topK = 5,
): RecognitionResult {
  if (logits.length !== hierarchy.labels.length) throw new Error(`Mô hình trả ${logits.length} giá trị, danh sách nhãn có ${hierarchy.labels.length} lớp.`);
  const probabilities = softmax(logits, temperature);
  return decide(probabilities, hierarchy, thresholds, topK);
}

// Như recognize() nhưng nhận thẳng xác suất (máy chủ dùng để kiểm tra lại xác suất trình duyệt gửi lên).
export function decide(probabilities: number[], hierarchy: Hierarchy, thresholds: readonly [number, number, number], topK = 5): RecognitionResult {
  if (probabilities.length !== hierarchy.labels.length) throw new Error(`Cần ${hierarchy.labels.length} xác suất, nhận ${probabilities.length}.`);
  const { characters, franchises } = aggregate(probabilities, hierarchy);
  const classIndex = argmax(probabilities);
  const characterIndex = argmax(characters);
  const franchiseIndex = argmax(franchises);
  const pClass = probabilities[classIndex];
  const pCharacter = characters[characterIndex];
  const pFranchise = franchises[franchiseIndex];
  const level: RecognitionLevel =
    pClass >= thresholds[0] ? "class" : pCharacter >= thresholds[1] ? "character" : pFranchise >= thresholds[2] ? "franchise" : "none";
  // Xếp theo xác suất giảm dần; bằng nhau thì chỉ số nhỏ trước (giống argsort ổn định của numpy trên −p)
  const alternatives = probabilities
    .map((p, index) => ({ index, p }))
    .sort((a, b) => b.p - a.p || a.index - b.index)
    .slice(0, topK);
  return { level, classIndex, characterIndex, franchiseIndex, pClass, pCharacter, pFranchise, probabilities, alternatives };
}
