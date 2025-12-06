// ===============================
// script.js  Part 1 / 3
// ===============================

// -----------------------
// 定数・ユーティリティ
// -----------------------
const yenFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY"
});

// ライプニッツ係数（新係数・簡易）
const LIFETIME_FACTORS = {
  1: 0.99, 2: 1.97, 3: 2.94, 4: 3.90, 5: 4.86,
  6: 5.80, 7: 6.74, 8: 7.66, 9: 8.58, 10: 9.48,
  11: 10.38, 12: 11.26, 13: 12.14, 14: 13.00, 15: 13.86,
  20: 18.41, 25: 22.89, 30: 27.31, 35: 31.66, 40: 35.95
};

// 数値入力取得ヘルパ
function readNumber(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  const v = el.value.trim();
  if (v === "") return null;
  const n = Number(v.replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

// -----------------------
// 入力収集・バリデーション
// -----------------------
function collectInputs() {
  const getVal = (id) => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : "";
  };

  const inputs = {
    status: getVal("victimStatus"),   // injury / after / death
    accidentDate: getVal("accidentDate") || "",

    age: readNumber("age"),
    annualIncome: readNumber("annualIncome"),

    treatmentDays: readNumber("treatmentDays"),
    visitDays: readNumber("visitDays"),
    absenceDays: readNumber("absenceDays"),
    dailyIncome: readNumber("dailyIncome"),

    grade: getVal("grade"),
    lossRateInput: readNumber("lossRate"),   // % 指定
    lossYearsInput: readNumber("lossYears"),

    faultPercent: readNumber("faultPercent"),
    alreadyPaid: readNumber("alreadyPaid"),
    otherCosts: readNumber("otherCosts"),

    // 死亡事故関連
    deathSupportType: getVal("deathSupportType"),   // none / one / twoPlus
    deathLifeRateInput: readNumber("deathLifeRate"), // % 指定
    deathWorkYears: readNumber("deathWorkYears"),
    deathPainPreset: getVal("deathPainPreset"),     // self / dependent / custom
    deathPainCustom: readNumber("deathPainCustom"),
    funeralCost: readNumber("funeralCost")
  };

  // 生活費控除率（0〜1に変換）
  if (inputs.deathLifeRateInput != null) {
    inputs.deathLifeRate = inputs.deathLifeRateInput / 100;
  } else {
    inputs.deathLifeRate = null;
  }

  return inputs;
}

function validateInputs(inputs) {
  const errors = [];

  if (!inputs.status) {
    errors.push("事故類型を選択してください。");
  }

  if (inputs.status === "after" || inputs.status === "death") {
    if (!inputs.age || inputs.age <= 0) {
      errors.push("年齢を入力してください。");
    }
    if (!inputs.annualIncome || inputs.annualIncome <= 0) {
      errors.push("基礎収入（年収）を入力してください。");
    }
  }

  if (inputs.status === "after") {
    if (!inputs.grade || inputs.grade === "none") {
      errors.push("後遺障害等級を選択してください。");
    }
  }

  if (inputs.status === "death") {
    if (!inputs.deathSupportType) {
      errors.push("生活費控除方式（扶養状況）を選択してください。");
    }
  }

  if (inputs.deathLifeRate != null &&
      (inputs.deathLifeRate < 0 || inputs.deathLifeRate > 1)) {
    errors.push("生活費控除率は0〜100%の範囲で入力してください。");
  }

  if (inputs.faultPercent != null &&
      (inputs.faultPercent < 0 || inputs.faultPercent > 100)) {
    errors.push("過失割合（被害者側）は0〜100の範囲で入力してください。");
  }

  return errors;
}

function showErrors(errors) {
  // エラー表示用の専用エリアはないので、必要なときだけアラート
  if (!errors.length) return;
  alert(errors.join("\n"));
}

// -----------------------
// 算定ロジック
// -----------------------

// 労働能力喪失率（代表値＋任意入力）
function resolveLossRate(inputs) {
  if (inputs.lossRateInput != null && inputs.lossRateInput >= 0) {
    return inputs.lossRateInput / 100;
  }
  const table = {
    "1": 1.0, "2": 1.0, "3": 1.0, "4": 0.92,
    "5": 0.79, "6": 0.67, "7": 0.56, "8": 0.45,
    "9": 0.35, "10": 0.27, "11": 0.20, "12": 0.14,
    "13": 0.09, "14": 0.05
  };
  return table[inputs.grade] || 0;
}

// 喪失期間（モデル：67歳まで＋任意入力）
function resolveLossYears(inputs) {
  if (inputs.lossYearsInput != null && inputs.lossYearsInput > 0) {
    return inputs.lossYearsInput;
  }
  if (!inputs.age) return 0;
  const y = 67 - inputs.age;
  return Math.max(0, Math.min(y, 40));
}

// ライプニッツ係数
function getFactor(years) {
  if (years <= 0) return 0;
  if (LIFETIME_FACTORS[years]) return LIFETIME_FACTORS[years];

  let nearest = 40;
  for (const k of Object.keys(LIFETIME_FACTORS)) {
    const num = Number(k);
    if (Math.abs(num - years) < Math.abs(nearest - years)) nearest = num;
  }
  return LIFETIME_FACTORS[nearest];
}

// 逸失利益（裁判所）
function calcLostEarningsCourt(income, lossRate, years) {
  if (!income || !lossRate || !years) return 0;
  const factor = getFactor(years);
  return Math.round(income * lossRate * factor);
}

// 入通院慰謝料（裁判所基準・簡易モデル）
function calcCourtInjuryPain(treat, visit) {
  if (!treat) return 0;
  const effVisit = visit || 0;
  const useDays = Math.min(treat, effVisit * 2 || treat);
  const base = Math.min(useDays * 4300 * 1.2, 1350000); // 「ざっくり赤本寄せ」モデル
  return Math.round(base);
}

// 後遺障害慰謝料（裁判所基準）
function calcCourtAfterPain(grade) {
  const table = {
    "1": 28000000, "2": 23700000, "3": 19900000, "4": 16700000,
    "5": 14000000, "6": 11800000, "7": 10000000, "8": 8300000,
    "9": 6900000, "10": 5500000, "11": 4200000, "12": 2900000,
    "13": 1800000, "14": 1100000
  };
  return table[grade] || 0;
}

// 自賠責：入通院慰謝料（簡易）
function calcJibaiInjuryPain(treatDays, visitDays) {
  if (!treatDays) return 0;
  const v = visitDays || 0;
  const n = Math.min(treatDays, v * 2 || treatDays);
  return n * 4300;
}

// 自賠責：後遺障害慰謝料
function calcJibaiAfterPain(grade) {
  const table = {
    "1": 1150000, "2": 998000, "3": 861000, "4": 738000,
    "5": 618000, "6": 503000, "7": 403000, "8": 302000,
    "9": 245000, "10": 190000, "11": 136000, "12": 93000,
    "13": 57000, "14": 32000
  };
  return table[grade] || 0;
}

// 自賠責：休業損害
function calcJibaiLostWages(dailyIncome, days) {
  if (!dailyIncome || !days) return 0;
  return dailyIncome * days;
}

// 自賠責限度額
const JIBAI_INJURY_CAP = 1200000;
const JIBAI_DEATH_CAP = 3000000;

// 過失相殺
function applyFault(amount, percent) {
  if (!percent && percent !== 0) return amount;
  return Math.max(0, Math.round(amount * (1 - percent / 100)));
}

// 既払控除
function applyPaid(amount, paid) {
  if (!paid) return amount;
  return Math.max(0, amount - paid);
}

// 死亡事故：慰謝料（裁判所モデル）
function resolveDeathPain(inputs) {
  if (inputs.deathPainPreset === "custom" && inputs.deathPainCustom && inputs.deathPainCustom > 0) {
    return inputs.deathPainCustom;
  }
  switch (inputs.deathPainPreset) {
    case "dependent":
      return 35000000; // 一家の支柱モデル
    case "self":
      return 29000000; // 本人のみモデル
    default:
      return 32000000; // 中間的モデル
  }
}

// 死亡事故：生活費控除率
function resolveDeathLifeRate(inputs) {
  if (inputs.deathLifeRate != null && inputs.deathLifeRate >= 0) {
    return inputs.deathLifeRate;
  }
  switch (inputs.deathSupportType) {
    case "none": return 0.4;
    case "one": return 0.3;
    case "twoPlus": return 0.2;
    default: return 0.3;
  }
}

// 死亡事故：逸失利益
function calcDeathLostEarnings(income, lifeRate, workYears) {
  if (!income || !workYears) return 0;
  const factor = getFactor(workYears);
  return Math.round(income * (1 - lifeRate) * factor);
}

// 比率カード用
function buildRatio(obj) {
  const total = obj.injury + obj.after + obj.lost + obj.other;
  if (!total) return { injury: 0, after: 0, lost: 0, other: 0 };
  return {
    injury: obj.injury / total,
    after: obj.after / total,
    lost: obj.lost / total,
    other: obj.other / total
  };
}

let lastResult = null;

// ===============================
// script.js  Part 2 / 3
// ===============================

// -----------------------
// 結果描画
// -----------------------
function renderResult(result) {
  const summarySection = document.getElementById("resultSection");
  const detailSection = document.getElementById("detailResults");
  if (summarySection) summarySection.classList.remove("hidden");
  if (detailSection) detailSection.classList.remove("hidden");

  const court = result.court;
  const jibai = result.jibai;
  const meta = result.meta;

  // --- サマリーカード ---
  const statusLabelMap = {
    injury: "傷害（入通院）",
    after: "後遺障害",
    death: "死亡事故"
  };
  const statusLabel = statusLabelMap[meta.status] || "";

  const caseSummaryEl = document.getElementById("caseSummary");
  if (caseSummaryEl) {
    const parts = [];
    if (statusLabel) parts.push(statusLabel);
    if (meta.age) parts.push(`${meta.age}歳`);
    if (meta.annualIncome) parts.push(`年収 ${yenFormatter.format(meta.annualIncome)}`);
    if (meta.grade && meta.status === "after") parts.push(`後遺障害 ${meta.grade}級`);
    caseSummaryEl.textContent = parts.join(" ／ ");
  }

  const courtNetEl = document.getElementById("courtNetAmount");
  const courtHintEl = document.getElementById("courtHint");
  const jibaiNetEl = document.getElementById("jibaiNetAmount");
  const jibaiHintEl = document.getElementById("jibaiHint");

  if (courtNetEl) courtNetEl.textContent = yenFormatter.format(court.afterPaid);
  if (courtHintEl) {
    courtHintEl.textContent =
      `裁判所基準モデル：総損害額 ${yenFormatter.format(court.total)} → 過失相殺後 ${yenFormatter.format(court.afterFault)} → 既払控除後（受取想定）`;
  }

  if (jibaiNetEl) jibaiNetEl.textContent = yenFormatter.format(jibai.afterPaid);
  if (jibaiHintEl) {
    let capText = "";
    if (jibai.cap) capText = `（自賠責限度額 ${yenFormatter.format(jibai.cap)}）`;
    jibaiHintEl.textContent =
      `自賠責基準モデル：総損害額 ${yenFormatter.format(jibai.total)} ${capText} → 過失相殺後 ${yenFormatter.format(jibai.afterFault)} → 既払控除後（受取想定）`;
  }

  // --- 明細カード（裁判所基準） ---
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setText("courtInjuryPain", yenFormatter.format(court.injuryPain));
  setText("courtAfterPain", yenFormatter.format(court.afterPain));
  setText("courtLostEarnings", yenFormatter.format(court.lostEarnings));
  setText("courtLostWages", yenFormatter.format(court.lostWages));
  setText("courtOtherCosts", yenFormatter.format(court.otherCosts));
  setText("courtTotal", yenFormatter.format(court.total));
  setText("courtAfterFault", yenFormatter.format(court.afterFault));
  setText("courtAfterPaid", yenFormatter.format(court.afterPaid));

  if (court.ratios) {
    const r = court.ratios;
    setText("courtRatioInjury", (r.injury * 100).toFixed(1) + "%");
    setText("courtRatioAfter", (r.after * 100).toFixed(1) + "%");
    setText("courtRatioLostEarnings", (r.lost * 100).toFixed(1) + "%");
    setText("courtRatioOther", (r.other * 100).toFixed(1) + "%");
  }

  // --- 明細カード（自賠責基準） ---
  setText("jibaiInjuryPain", yenFormatter.format(jibai.injuryPain));
  setText("jibaiAfterPain", yenFormatter.format(jibai.afterPain));
  setText("jibaiLostWages", yenFormatter.format(jibai.lostWages));
  setText("jibaiOtherCosts", yenFormatter.format(jibai.otherCosts));
  setText("jibaiTotal", yenFormatter.format(jibai.total));
  setText("jibaiAfterFault", yenFormatter.format(jibai.afterFault));
  setText("jibaiAfterPaid", yenFormatter.format(jibai.afterPaid));

  const capInfoEl = document.getElementById("jibaiCapInfo");
  if (capInfoEl) {
    if (jibai.cap) {
      capInfoEl.textContent = `※自賠責限度額は ${yenFormatter.format(jibai.cap)} です。`;
    } else {
      capInfoEl.textContent = "";
    }
  }

  // 円グラフ更新
  updateCourtChart(court);
}

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

// ===============================
// script.js  Part 3 / 3
// ===============================

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

  // 死亡事故：就労可能年数の自動補完
  if (inputs.status === "death" && (!inputs.deathWorkYears || inputs.deathWorkYears <= 0)) {
    if (inputs.age > 0 && inputs.age < 80) {
      inputs.deathWorkYears = Math.max(0, 67 - inputs.age);
    } else {
      inputs.deathWorkYears = 0;
    }
  }

  let courtInjury = 0,
      courtAfter = 0,
      courtLost = 0,
      courtLostWages = 0,
      courtOther = inputs.otherCosts || 0;

  let deathLifeRateUsed = null;

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
    deathLifeRateUsed = lifeRate;
    courtAfter = resolveDeathPain(inputs);
    courtLost = calcDeathLostEarnings(inputs.annualIncome, lifeRate, inputs.deathWorkYears || 0);
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
    jibaiInjury = calcJibaiInjuryPain(inputs.treatmentDays, inputs.visitDays || 0);
    jibaiLostWages = calcJibaiLostWages(inputs.dailyIncome || 0, inputs.absenceDays || 0);
    if (inputs.status === "after") {
      jibaiAfter = calcJibaiAfterPain(inputs.grade);
    }
    jibaiCap = JIBAI_INJURY_CAP;

  } else if (inputs.status === "death") {
    // 現時点では死亡自賠責の内訳詳細までは組み込まず、上限のみ表示
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
      status: inputs.status,
      age: inputs.age,
      annualIncome: inputs.annualIncome,
      treatmentDays: inputs.treatmentDays,
      visitDays: inputs.visitDays,
      absenceDays: inputs.absenceDays,
      grade: inputs.grade,
      deathSupportType: inputs.deathSupportType,
      deathWorkYears: inputs.deathWorkYears,
      deathLifeRate: deathLifeRateUsed
    }
  };

  lastResult = { inputs, result };
  renderResult(result);

  // ===== 結果セクションへ自動スクロール（resultSection が画面上部付近に来る） =====
  setTimeout(() => {
    const target = document.getElementById("resultSection");
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const y = rect.top + window.scrollY - 8; // 少し余白
    window.scrollTo({
      top: y,
      behavior: "smooth"
    });
  }, 50);
}

// -----------------------
// 事故類型で入力UI切替
// -----------------------
function updateInputVisibility() {
  const v = document.getElementById("victimStatus").value;
  const inj = document.getElementById("injuryInputs");
  const aft = document.getElementById("afterInputs");
  const dth = document.getElementById("deathInputs");

  if (inj) inj.classList.add("hidden");
  if (aft) aft.classList.add("hidden");
  if (dth) dth.classList.add("hidden");

  if (v === "injury" && inj) inj.classList.remove("hidden");
  if (v === "after") {
    if (inj) inj.classList.remove("hidden");
    if (aft) aft.classList.remove("hidden");
  }
  if (v === "death" && dth) dth.classList.remove("hidden");
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

  const supportMap = {
    none: "被扶養者なし",
    one: "扶養1名",
    twoPlus: "扶養2名以上"
  };

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

  if (inputs.status === "injury" || inputs.status === "after") {
    if (inputs.treatmentDays || inputs.visitDays || inputs.absenceDays) {
      const t = inputs.treatmentDays ? `${inputs.treatmentDays}日` : "-";
      const v = inputs.visitDays ? `${inputs.visitDays}日` : "-";
      const a = inputs.absenceDays ? `${inputs.absenceDays}日` : "-";
      lines.push(`治療期間：${t}／実通院日数：${v}／休業日数：${a}`);
    }
    if (inputs.status === "after" && inputs.grade && inputs.grade !== "none") {
      lines.push(`後遺障害等級：${inputs.grade}級（慰謝料モデル＋逸失利益モデル）`);
    }
  }

  if (inputs.status === "death") {
    if (inputs.deathSupportType) {
      lines.push(`扶養状況：${supportMap[inputs.deathSupportType] || ""}`);
    }
    if (inputs.deathWorkYears) {
      lines.push(`就労可能年数（モデル）：約${inputs.deathWorkYears}年（67歳までを目安）`);
    }
    const lifeRate = result.meta && result.meta.deathLifeRate;
    if (lifeRate != null) {
      const pct = (lifeRate * 100).toFixed(1).replace(/\.0$/, "");
      lines.push(`生活費控除率（モデル）：約${pct}%`);
    }
    if (inputs.funeralCost) {
      lines.push(`葬儀費：${yenFormatter.format(inputs.funeralCost)}`);
    }
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
    alert("先に「損害額を計算する」を実行してください。");
    return;
  }

  const text = buildSummaryTextFromLastResult();
  if (!text) {
    alert("コピー可能な明細がありません。");
    return;
  }

  let success = false;
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    success = document.execCommand("copy");
    document.body.removeChild(textarea);
  } catch (e) {
    console.error("copy execCommand error:", e);
    success = false;
  }

  const statusEl = document.getElementById("copyStatus");

  if (success) {
    if (statusEl) {
      statusEl.textContent = "損害明細をクリップボードにコピーしました。";
      setTimeout(() => {
        statusEl.textContent = "";
      }, 4000);
    } else {
      alert("損害明細をコピーしました。");
    }
  } else {
    window.prompt("コピーに失敗しました。下記テキストを選択してコピーしてください。", text);
    if (statusEl) {
      statusEl.textContent = "損害明細を表示しました（長押しでコピーできます）。";
      setTimeout(() => {
        statusEl.textContent = "";
      }, 4000);
    }
  }
}

// -----------------------
// 初期化
// -----------------------
document.addEventListener("DOMContentLoaded", () => {
  updateInputVisibility();

  const statusSel = document.getElementById("victimStatus");
  if (statusSel) {
    statusSel.addEventListener("change", updateInputVisibility);
  }

  const calcBtn = document.getElementById("calcButton");
  if (calcBtn) {
    calcBtn.addEventListener("click", (e) => {
      e.preventDefault();
      calculateAll();
    });
  }

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
