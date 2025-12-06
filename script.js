// ===============================
// script.js  Part 1 / 3
// ===============================

// 日本円フォーマット
const yenFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0
});

// 等級ごとの代表的な喪失率・喪失期間（モデル値）
const gradeLossPreset = {
  none: { rate: 0, years: 0 },
  "14": { rate: 5, years: 5 },
  "13": { rate: 9, years: 7 },
  "12": { rate: 14, years: 10 },
  "11": { rate: 20, years: 15 },
  "10": { rate: 27, years: 17 },
  "9":  { rate: 35, years: 20 },
  "8":  { rate: 45, years: 22 },
  "7":  { rate: 56, years: 27 },
  "6":  { rate: 67, years: 30 },
  "5":  { rate: 79, years: 32 },
  "4":  { rate: 79, years: 34 },
  "3":  { rate: 100, years: 35 },
  "2":  { rate: 100, years: 40 },
  "1":  { rate: 100, years: 45 }
};

// 後遺障害慰謝料（裁判所基準・代表額）
const courtAfterPainTable = {
  none: 0,
  "14": 1100000,
  "13": 1800000,
  "12": 2900000,
  "11": 4200000,
  "10": 5500000,
  "9":  6900000,
  "8":  8300000,
  "7":  10300000,
  "6":  11800000,
  "5":  14000000,
  "4":  16700000,
  "3":  19900000,
  "2":  23700000,
  "1":  28000000
};

// 傷害慰謝料（入通院）裁判所基準のざっくりベース（ヶ月）
const courtInjuryBaseTable = {
  1: 530000,
  2: 900000,
  3: 1200000,
  4: 1500000,
  5: 1800000,
  6: 2100000
};

// 自賠責：後遺障害慰謝料（簡略モデル）
const jibaiAfterPainTable = {
  none: 0,
  "14": 320000,
  "13": 570000,
  "12": 940000,
  "11": 1350000,
  "10": 1900000,
  "9":  2490000,
  "8":  3310000,
  "7":  4190000,
  "6":  5120000,
  "5":  6180000,
  "4":  7370000,
  "3":  8610000,
  "2":  10960000,
  "1":  11000000
};

// 死亡慰謝料モデル
const deathPainPreset = {
  self: 29000000,
  dependent: 35000000
};

// 自賠責限度額（簡略）
const JIBAI_INJURY_CAP = 1200000;
const JIBAI_DEATH_CAP = 3000000;

// 直近の計算結果（コピー機能用）
let lastResult = null;

// ===============================
// 基本ユーティリティ
// ===============================
function parseNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

function getLiapnizCoefficient(years, rate = 0.03) {
  if (!years || years <= 0) return 0;
  return (1 - Math.pow(1 + rate, -years)) / rate;
}

// ===============================
// 入力取得
// ===============================
function collectInputs() {
  return {
    status: document.getElementById("victimStatus").value,
    modelPreset: document.getElementById("modelPreset").value,
    accidentDate: document.getElementById("accidentDate").value || "",
    age: parseNumber(document.getElementById("age").value),
    annualIncome: parseNumber(document.getElementById("annualIncome").value),

    treatmentDays: parseNumber(document.getElementById("treatmentDays").value),
    visitDays: parseNumber(document.getElementById("visitDays").value),
    absenceDays: parseNumber(document.getElementById("absenceDays").value),
    dailyIncome: parseNumber(document.getElementById("dailyIncome").value),

    grade: document.getElementById("grade").value,
    lossRate: document.getElementById("lossRate").value === "" ? null : parseNumber(document.getElementById("lossRate").value),
    lossYears: document.getElementById("lossYears").value === "" ? null : parseNumber(document.getElementById("lossYears").value),

    deathSupportType: document.getElementById("deathSupportType").value,
    deathLifeRate: document.getElementById("deathLifeRate").value === "" ? null : parseNumber(document.getElementById("deathLifeRate").value),
    deathWorkYears: parseNumber(document.getElementById("deathWorkYears").value),
    deathPainPreset: document.getElementById("deathPainPreset").value,
    deathPainCustom: parseNumber(document.getElementById("deathPainCustom").value),
    funeralCost: parseNumber(document.getElementById("funeralCost").value),

    otherCosts: parseNumber(document.getElementById("otherCosts").value),
    faultPercent: parseNumber(document.getElementById("faultPercent").value),
    alreadyPaid: parseNumber(document.getElementById("alreadyPaid").value)
  };
}

// ===============================
// 入力チェック
// ===============================
function validateInputs(inputs) {
  const errors = [];

  if (!["injury", "after", "death"].includes(inputs.status)) {
    errors.push("事故類型を選択してください。");
  }

  if (inputs.faultPercent < 0 || inputs.faultPercent > 100) {
    errors.push("過失割合は0〜100%で入力してください。");
  }

  if (inputs.status === "injury") {
    if (!inputs.treatmentDays || !inputs.visitDays) {
      errors.push("傷害の場合は治療期間と実通院日数を入力してください。");
    }
  }

  if (inputs.status === "after") {
    if (!inputs.grade || inputs.grade === "none") {
      errors.push("後遺障害等級を選択してください。");
    }
    if (!inputs.annualIncome) {
      errors.push("後遺障害では基礎収入（年収）が必須です。");
    }
  }

  if (inputs.status === "death") {
    if (!inputs.annualIncome) {
      errors.push("死亡事故では基礎収入（年収）が必須です。");
    }
    if (inputs.deathWorkYears <= 0 && !(inputs.age > 0 && inputs.age < 80)) {
      errors.push("死亡事故では就労可能年数を入力するか、年齢を入力してください。");
    }
    if (inputs.deathLifeRate === null && !inputs.deathSupportType) {
      errors.push("生活費控除率または扶養状況を入力してください。");
    }
  }

  return errors;
}

// ===============================
// エラー表示
// ===============================
function showErrors(errors) {
  if (!errors || errors.length === 0) return;
  alert(errors.join("\n"));
}

// ===============================
// script.js  Part 2 / 3
// ===============================

// -----------------------
// 自賠責 計算
// -----------------------
function calcJibaiInjuryPain(treat, visit) {
  if (!treat || !visit) return 0;
  const days = Math.min(treat, visit * 2);
  return 4300 * days;
}

function calcJibaiLostWages(daily, days) {
  if (!daily || !days) return 0;
  return Math.min(daily, 6100) * days;
}

function calcJibaiAfterPain(grade) {
  if (!grade || grade === "none") return 0;
  return jibaiAfterPainTable[grade] || 0;
}

// -----------------------
// 裁判所基準（傷害慰謝料）
// -----------------------
function calcCourtInjuryPain(treat, visit) {
  if (!treat || treat <= 0) return 0;

  const months = Math.max(1, Math.min(6, treat / 30));
  const lo = Math.floor(months);
  const hi = Math.ceil(months);
  const loBase = courtInjuryBaseTable[lo] || courtInjuryBaseTable[6];
  const hiBase = courtInjuryBaseTable[hi] || courtInjuryBaseTable[6];
  const base = loBase + (hiBase - loBase) * (months - lo);

  const freq = visit && treat ? visit / treat : 0;
  let m = 1.0;
  if (freq >= 0.4) {
    m = 1.1;          // 頻繁通院 → +10%
  } else if (freq < 0.1) {
    m = 0.8;          // ごく低頻度 → -20%
  } else if (freq < 0.2) {
    m = 0.9;          // 低頻度 → -10%
  }
  return Math.round(base * m);
}

// -----------------------
// 裁判所基準（後遺障害慰謝料）
// -----------------------
function calcCourtAfterPain(grade) {
  return courtAfterPainTable[grade] || 0;
}

// 喪失率・喪失期間
function resolveLossRate(inputs) {
  if (inputs.lossRate !== null) return inputs.lossRate / 100;
  const preset = gradeLossPreset[inputs.grade] || gradeLossPreset.none;
  return preset.rate / 100;
}

function resolveLossYears(inputs) {
  if (inputs.lossYears !== null) return inputs.lossYears;
  const preset = gradeLossPreset[inputs.grade] || gradeLossPreset.none;
  if (!(inputs.age > 0)) return preset.years;

  const to67 = Math.max(0, 67 - inputs.age);
  if (to67 === 0) return preset.years;
  return Math.min(preset.years, to67);
}

// -----------------------
// 裁判所基準：後遺障害・逸失利益
// -----------------------
function calcLostEarningsCourt(annualIncome, lossRate, lossYears) {
  if (!annualIncome || !lossRate || !lossYears) return 0;
  const coeff = getLiapnizCoefficient(lossYears, 0.03);
  return Math.round(annualIncome * lossRate * coeff);
}

// -----------------------
// 死亡事故
// -----------------------
function resolveDeathLifeRate(inputs) {
  if (inputs.deathLifeRate !== null) return inputs.deathLifeRate / 100;

  let base;
  switch (inputs.deathSupportType) {
    case "none":
      base = 0.4;
      break;
    case "one":
    case "twoPlus":
      base = 0.3;
      break;
    default:
      base = 0.35;
  }

  // 高齢者・低収入は控除率をやや低めに
  if (inputs.age && inputs.age >= 65) {
    base -= 0.05;
  }
  if (inputs.annualIncome && inputs.annualIncome < 3000000) {
    base -= 0.05;
  }

  return Math.max(0.2, Math.min(0.5, base));
}

function resolveDeathPain(inputs) {
  if (inputs.deathPainPreset === "custom") return inputs.deathPainCustom || 0;
  if (inputs.deathPainPreset === "self") return deathPainPreset.self;
  if (inputs.deathPainPreset === "dependent") return deathPainPreset.dependent;
  return 0;
}

function calcDeathLostEarnings(annualIncome, lifeRate, workYears) {
  if (!annualIncome || !workYears) return 0;
  const coeff = getLiapnizCoefficient(workYears, 0.03);
  return Math.round(annualIncome * (1 - lifeRate) * coeff);
}

// -----------------------
// 過失相殺・既払控除
// -----------------------
function applyFault(total, fault) {
  if (!total || total <= 0) return 0;
  return Math.round(total * (1 - (fault || 0) / 100));
}

function applyPaid(total, paid) {
  if (!total || total <= 0) return 0;
  return Math.max(0, total - (paid || 0));
}

// -----------------------
// 構成比＋慰謝料レンジ
// -----------------------
function buildRatio(parts) {
  const total = parts.injury + parts.after + parts.lost + parts.other;
  if (!total) return { injury: "-", after: "-", lost: "-", other: "-" };
  const pct = v => (v / total * 100).toFixed(1) + "%";
  return {
    injury: pct(parts.injury),
    after: pct(parts.after),
    lost: pct(parts.lost),
    other: pct(parts.other)
  };
}

// 後遺慰謝料のレンジ（代表額±10%）
function getAfterPainRange(amount) {
  if (!amount || amount <= 0) return null;
  const min = Math.round(amount * 0.9);
  const max = Math.round(amount * 1.1);
  return { min, max };
}

// -----------------------
// 結果をDOMに反映
// -----------------------
function renderResult(result) {
  document.getElementById("resultSection").classList.remove("hidden");
  document.getElementById("detailResults").classList.remove("hidden");

  const court = result.court;
  const jibai = result.jibai;
  const status = result.meta?.status || null;

  document.getElementById("courtNetAmount").textContent =
    yenFormatter.format(court.afterPaid);

  document.getElementById("jibaiNetAmount").textContent =
    yenFormatter.format(jibai.afterPaid);

  // 後遺慰謝料：代表額＋レンジ表示（後遺モードのとき）
  const afterSpan = document.getElementById("courtAfterPain");
  if (status === "after" && court.afterPain > 0) {
    const range = getAfterPainRange(court.afterPain);
    if (range) {
      afterSpan.textContent =
        `${yenFormatter.format(court.afterPain)}（目安レンジ：` +
        `${yenFormatter.format(range.min)}〜${yenFormatter.format(range.max)}）`;
    } else {
      afterSpan.textContent = yenFormatter.format(court.afterPain);
    }
  } else {
    afterSpan.textContent = yenFormatter.format(court.afterPain);
  }

  document.getElementById("courtInjuryPain").textContent =
    yenFormatter.format(court.injuryPain);
  document.getElementById("courtLostEarnings").textContent =
    yenFormatter.format(court.lostEarnings);
  document.getElementById("courtLostWages").textContent =
    yenFormatter.format(court.lostWages);
  document.getElementById("courtOtherCosts").textContent =
    yenFormatter.format(court.otherCosts);
  document.getElementById("courtTotal").textContent =
    yenFormatter.format(court.total);
  document.getElementById("courtAfterFault").textContent =
    yenFormatter.format(court.afterFault);
  document.getElementById("courtAfterPaid").textContent =
    yenFormatter.format(court.afterPaid);

  document.getElementById("courtRatioInjury").textContent = court.ratios.injury;
  document.getElementById("courtRatioAfter").textContent = court.ratios.after;
  document.getElementById("courtRatioLostEarnings").textContent = court.ratios.lost;
  document.getElementById("courtRatioOther").textContent = court.ratios.other;

  document.getElementById("jibaiInjuryPain").textContent =
    yenFormatter.format(jibai.injuryPain);
  document.getElementById("jibaiAfterPain").textContent =
    yenFormatter.format(jibai.afterPain);
  document.getElementById("jibaiLostWages").textContent =
    yenFormatter.format(jibai.lostWages);
  document.getElementById("jibaiOtherCosts").textContent =
    yenFormatter.format(jibai.otherCosts);
  document.getElementById("jibaiTotal").textContent =
    yenFormatter.format(jibai.total);
  document.getElementById("jibaiAfterFault").textContent =
    yenFormatter.format(jibai.afterFault);
  document.getElementById("jibaiAfterPaid").textContent =
    yenFormatter.format(jibai.afterPaid);

  const capInfo = document.getElementById("jibaiCapInfo");
  if (jibai.cap) {
    if (jibai.total <= jibai.cap) {
      capInfo.textContent =
        `自賠責限度額内（残り ${yenFormatter.format(jibai.cap - jibai.total)}）`;
    } else {
      capInfo.textContent =
        `自賠責限度額超過（超過分 ${yenFormatter.format(jibai.total - jibai.cap)}）`;
    }
  } else {
    capInfo.textContent = "";
  }

  updateCourtChart(court);
    }

// ===============================
// script.js  Part 3 / 3
// ===============================

// -----------------------
// 円グラフ描画
// -----------------------
function updateCourtChart(court) {
  const section = document.getElementById("chartSection");
  const canvas = document.getElementById("courtChart");
  const legend = document.getElementById("chartLegend");
  const note = document.getElementById("chartNote");
  if (!canvas || !legend || !section) return;

  const injury = court.injuryPain || 0;
  const after = court.afterPain || 0;
  const lost = court.lostEarnings || 0;
  const other = (court.lostWages || 0) + (court.otherCosts || 0);
  const total = injury + after + lost + other;

  if (!total) {
    section.classList.add("hidden");
    legend.innerHTML = "";
    if (note) note.textContent = "裁判所基準の総損害額が0円のため表示しません。";
    return;
  }

  section.classList.remove("hidden");

  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 10;

  const parts = [
    { label: "傷害慰謝料", value: injury, color: "#60a5fa" },
    { label: "後遺/死亡慰謝料", value: after, color: "#f97373" },
    { label: "逸失利益", value: lost, color: "#22c55e" },
    { label: "その他", value: other, color: "#facc15" }
  ].filter(p => p.value > 0);

  let start = -Math.PI / 2;

  parts.forEach(p => {
    const angle = (p.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = p.color;
    ctx.fill();
    start += angle;
  });

  legend.innerHTML = "";
  parts.forEach(p => {
    const pct = (p.value / total * 100).toFixed(1) + "%";
    const item = document.createElement("div");
    item.className = "chart-legend-item";

    const box = document.createElement("span");
    box.className = "chart-legend-color";
    box.style.backgroundColor = p.color;

    const label = document.createElement("span");
    label.textContent = `${p.label}：${yenFormatter.format(p.value)}（${pct}）`;

    item.appendChild(box);
    item.appendChild(label);
    legend.appendChild(item);
  });

  if (note) {
    note.textContent =
      `総損害額 ${yenFormatter.format(total)} の構成比を表示しています。`;
  }
}

// -----------------------
// メイン計算
// -----------------------
function calculateAll() {
  const inputs = collectInputs();
  const errors = validateInputs(inputs);
  if (errors.length > 0) {
    showErrors(errors);
    return;
  }

  // 死亡：就労可能年数を年齢から自動補完（未入力の場合）
  if (inputs.status === "death" && (!inputs.deathWorkYears || inputs.deathWorkYears <= 0)) {
    if (inputs.age > 0 && inputs.age < 80) {
      inputs.deathWorkYears = Math.max(0, 67 - inputs.age);
    }
  }

  let courtInjury = 0,
      courtAfter = 0,
      courtLost = 0,
      courtLostWages = 0,
      courtOther = inputs.otherCosts || 0;

  if (inputs.status === "injury" || inputs.status === "after") {
    courtInjury = calcCourtInjuryPain(inputs.treatmentDays, inputs.visitDays);

    if (inputs.status === "after") {
      courtAfter = calcCourtAfterPain(inputs.grade);
      const lossRate = resolveLossRate(inputs);
      const lossYears = resolveLossYears(inputs);
      courtLost = calcLostEarningsCourt(inputs.annualIncome, lossRate, lossYears);
    }

    if (inputs.absenceDays && inputs.dailyIncome) {
      courtLostWages = inputs.dailyIncome * inputs.absenceDays;
    }

  } else if (inputs.status === "death") {
    const lifeRate = resolveDeathLifeRate(inputs);
    courtAfter = resolveDeathPain(inputs);
    courtLost = calcDeathLostEarnings(inputs.annualIncome, lifeRate, inputs.deathWorkYears);
    courtOther += inputs.funeralCost || 0;
  }

  const courtTotal = courtInjury + courtAfter + courtLost + courtLostWages + courtOther;
  const courtAfterFault = applyFault(courtTotal, inputs.faultPercent);
  const courtAfterPaid = applyPaid(courtAfterFault, inputs.alreadyPaid);
  const courtRatios = buildRatio({
    injury: courtInjury,
    after: courtAfter,
    lost: courtLost,
    other: courtLostWages + courtOther
  });

  let jibaiInjury = 0,
      jibaiAfter = 0,
      jibaiLostWages = 0,
      jibaiOther = inputs.otherCosts || 0,
      jibaiCap = null;

  if (inputs.status === "injury" || inputs.status === "after") {
    jibaiInjury = calcJibaiInjuryPain(inputs.treatmentDays, inputs.visitDays);
    jibaiLostWages = calcJibaiLostWages(inputs.dailyIncome, inputs.absenceDays);
    if (inputs.status === "after") {
      jibaiAfter = calcJibaiAfterPain(inputs.grade);
    }
    jibaiCap = JIBAI_INJURY_CAP;

  } else if (inputs.status === "death") {
    jibaiCap = JIBAI_DEATH_CAP;
  }

  const jibaiTotal = jibaiInjury + jibaiAfter + jibaiLostWages + jibaiOther;
  const jibaiAfterFault = applyFault(jibaiTotal, inputs.faultPercent);
  const jibaiAfterPaid = applyPaid(jibaiAfterFault, inputs.alreadyPaid);

  const result = {
    court: {
      injuryPain: courtInjury,
      afterPain: courtAfter,
      lostEarnings: courtLost,
      lostWages: courtLostWages,
      otherCosts: courtOther,
      total: courtTotal,
      afterFault: courtAfterFault,
      afterPaid: courtAfterPaid,
      ratios: courtRatios
    },
    jibai: {
      injuryPain: jibaiInjury,
      afterPain: jibaiAfter,
      lostWages: jibaiLostWages,
      otherCosts: jibaiOther,
      total: jibaiTotal,
      afterFault: jibaiAfterFault,
      afterPaid: jibaiAfterPaid,
      cap: jibaiCap
    },
    meta: {
      status: inputs.status
    }
  };

  // コピー用に保存
  lastResult = { inputs, result };

  renderResult(result);
}

// -----------------------
// 事故類型で入力UI切替
// -----------------------
function updateInputVisibility() {
  const v = document.getElementById("victimStatus").value;
  const inj = document.getElementById("injuryInputs");
  const aft = document.getElementById("afterInputs");
  const dth = document.getElementById("deathInputs");

  inj.classList.add("hidden");
  aft.classList.add("hidden");
  dth.classList.add("hidden");

  if (v === "injury") inj.classList.remove("hidden");
  if (v === "after") {
    inj.classList.remove("hidden");
    aft.classList.remove("hidden");
  }
  if (v === "death") dth.classList.remove("hidden");
}

// -----------------------
// 典型モデル適用
// -----------------------
const modelPresets = {
  "after_14_30": {
    status: "after",
    age: 30,
    annualIncome: 4000000,
    grade: "14"
  },
  "after_12_40": {
    status: "after",
    age: 40,
    annualIncome: 5000000,
    grade: "12"
  },
  "after_9_30": {
    status: "after",
    age: 30,
    annualIncome: 6000000,
    grade: "9"
  },
  "after_12_30": {
    status: "after",
    age: 30,
    annualIncome: 4500000,
    grade: "12"
  },
  "death_40_dep": {
    status: "death",
    age: 40,
    annualIncome: 5000000,
    deathSupportType: "twoPlus",
    deathWorkYears: 27,
    deathPainPreset: "dependent"
  },
  "death_75_single": {
    status: "death",
    age: 75,
    annualIncome: 3000000,
    deathSupportType: "none",
    deathWorkYears: 0,
    deathPainPreset: "self"
  }
};

function applyModelPreset(key) {
  const preset = modelPresets[key];
  if (!preset) return;

  const setVal = (id, val) => {
    if (val === undefined) return;
    const el = document.getElementById(id);
    if (el) el.value = val;
  };

  if (preset.status) {
    setVal("victimStatus", preset.status);
    updateInputVisibility();
  }

  setVal("age", preset.age);
  setVal("annualIncome", preset.annualIncome);
  setVal("grade", preset.grade);
  setVal("deathSupportType", preset.deathSupportType);
  setVal("deathWorkYears", preset.deathWorkYears);
  setVal("deathPainPreset", preset.deathPainPreset);
}

// -----------------------
// 損害明細コピー機能
// -----------------------
function buildSummaryTextFromLastResult() {
  if (!lastResult) return "";

  const { inputs, result } = lastResult;
  const court = result.court;
  const jibai = result.jibai;

  const statusLabelMap = {
    injury: "傷害（入通院）",
    after: "後遺障害",
    death: "死亡事故"
  };
  const statusLabel = statusLabelMap[inputs.status] || "";

  const lines = [];
  lines.push("【交通事故損害概算（参考値・モデル計算）】");
  if (statusLabel) lines.push(`事故類型：${statusLabel}`);
  if (inputs.age) lines.push(`年齢：${inputs.age}歳`);
  if (inputs.annualIncome) {
    lines.push(`基礎収入：${yenFormatter.format(inputs.annualIncome)}／年`);
  }
  if (inputs.accidentDate) {
    lines.push(`事故日：${inputs.accidentDate}`);
  }
  if (inputs.faultPercent || inputs.faultPercent === 0) {
    lines.push(`過失割合（被害者側）：${inputs.faultPercent}%`);
  }
  if (inputs.alreadyPaid) {
    lines.push(`既払金：${yenFormatter.format(inputs.alreadyPaid)}`);
  }

  lines.push("");
  lines.push("＜裁判所基準モデル＞");
  lines.push(`傷害慰謝料：${yenFormatter.format(court.injuryPain)}`);
  lines.push(`後遺障害／死亡慰謝料：${yenFormatter.format(court.afterPain)}`);
  lines.push(`逸失利益：${yenFormatter.format(court.lostEarnings)}`);
  lines.push(`休業損害：${yenFormatter.format(court.lostWages)}`);
  lines.push(`その他費用：${yenFormatter.format(court.otherCosts)}`);
  lines.push(`総損害額：${yenFormatter.format(court.total)}`);
  lines.push(`過失相殺後：${yenFormatter.format(court.afterFault)}`);
  lines.push(`既払控除後（受取想定）：${yenFormatter.format(court.afterPaid)}`);

  lines.push("");
  lines.push("＜自賠責基準モデル＞");
  lines.push(`傷害慰謝料：${yenFormatter.format(jibai.injuryPain)}`);
  lines.push(`後遺障害慰謝料：${yenFormatter.format(jibai.afterPain)}`);
  lines.push(`休業損害：${yenFormatter.format(jibai.lostWages)}`);
  lines.push(`その他費用：${yenFormatter.format(jibai.otherCosts)}`);
  lines.push(`総損害額：${yenFormatter.format(jibai.total)}`);
  if (jibai.cap) {
    lines.push(`自賠責限度額：${yenFormatter.format(jibai.cap)}`);
  }
  lines.push(`過失相殺後：${yenFormatter.format(jibai.afterFault)}`);
  lines.push(`既払控除後（受取想定）：${yenFormatter.format(jibai.afterPaid)}`);

  lines.push("");
  lines.push("※本明細は公開されている目安額・モデル算式に基づく概算値であり、実際の解決額を保証するものではありません。");

  return lines.join("\n");
}

function copySummaryToClipboard() {
  if (!lastResult) {
    alert("先に計算を実行してください。");
    return;
  }

  const text = buildSummaryTextFromLastResult();
  if (!text) {
    alert("コピー可能な明細がありません。");
    return;
  }

  const statusEl = document.getElementById("copyStatus");
  const done = () => {
    if (statusEl) {
      statusEl.textContent = "損害明細をクリップボードにコピーしました。";
      setTimeout(() => {
        statusEl.textContent = "";
      }, 3000);
    } else {
      alert("損害明細をコピーしました。");
    }
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => {
      fallbackCopy(text, done);
    });
  } else {
    fallbackCopy(text, done);
  }
}

function fallbackCopy(text, callback) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
  } catch (e) {
    console.error(e);
  }
  document.body.removeChild(textarea);
  if (typeof callback === "function") callback();
}

// -----------------------
// 初期化
// -----------------------
document.addEventListener("DOMContentLoaded", () => {
  updateInputVisibility();

  document.getElementById("victimStatus")
    .addEventListener("change", updateInputVisibility);

  document.getElementById("calcButton")
    .addEventListener("click", (e) => {
      e.preventDefault();
      calculateAll();
    });

  const presetSelect = document.getElementById("modelPreset");
  if (presetSelect) {
    presetSelect.addEventListener("change", (e) => {
      applyModelPreset(e.target.value);
    });
  }

  const copyBtn = document.getElementById("copySummaryButton");
  if (copyBtn) {
    copyBtn.addEventListener("click", (e) => {
      e.preventDefault();
      copySummaryToClipboard();
    });
  }
});
