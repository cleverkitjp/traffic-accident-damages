// script.js  Part 1 / 3
"use strict";

// 金額フォーマッタ
const yenFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0
});

// 自賠責の上限（簡易モデル）
const JIBAI_INJURY_CAP = 1200000;   // 傷害（入通院）120万円モデル
const JIBAI_DEATH_CAP  = 30000000;  // 死亡 3000万円モデル

let lastResult = null;

// -----------------------
// 入力取得
// -----------------------
function getNumber(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  const v = Number(el.value.replace(/,/g, ""));
  return isNaN(v) ? 0 : v;
}

function collectInputs() {
  const status = document.getElementById("victimStatus").value;

  const inputs = {
    status,
    accidentDate: document.getElementById("accidentDate").value || "",
    age: getNumber("age"),
    annualIncome: getNumber("annualIncome"),
    treatmentDays: getNumber("treatmentDays"),
    visitDays: getNumber("visitDays"),
    absenceDays: getNumber("absenceDays"),
    dailyIncome: getNumber("dailyIncome"),
    grade: document.getElementById("grade") ? document.getElementById("grade").value : "none",
    lossRate: getNumber("lossRate"),
    lossYears: getNumber("lossYears"),
    deathSupportType: document.getElementById("deathSupportType")
      ? document.getElementById("deathSupportType").value
      : "",
    deathLifeRate: getNumber("deathLifeRate"),
    deathWorkYears: getNumber("deathWorkYears"),
    deathPainPreset: document.getElementById("deathPainPreset")
      ? document.getElementById("deathPainPreset").value
      : "",
    deathPainCustom: getNumber("deathPainCustom"),
    funeralCost: getNumber("funeralCost"),
    otherCosts: getNumber("otherCosts"),
    faultPercent: getNumber("faultPercent"),
    alreadyPaid: getNumber("alreadyPaid")
  };

  return inputs;
}

// -----------------------
// バリデーション
// -----------------------
function validateInputs(inputs) {
  const errors = [];

  if (!inputs.status) {
    errors.push("事故類型を選択してください。");
  }
  if (inputs.age <= 0 || inputs.age > 100) {
    errors.push("年齢を正しく入力してください。");
  }
  if (inputs.annualIncome < 0) {
    errors.push("基礎収入が不正です。");
  }
  if (inputs.status === "after" && inputs.grade === "none") {
    errors.push("後遺障害等級を選択してください（仮にでも構いません）。");
  }
  if (inputs.status === "death" && !inputs.deathSupportType) {
    errors.push("死亡事故の場合は生活費控除方式を選択してください。");
  }
  if (inputs.faultPercent < 0 || inputs.faultPercent > 100) {
    errors.push("過失割合は0〜100の範囲で入力してください。");
  }
  return errors;
}

function showErrors(errors) {
  const area = document.getElementById("errorArea");
  if (!area) {
    alert(errors.join("\n"));
    return;
  }
  if (!errors.length) {
    area.textContent = "";
    return;
  }
  area.textContent = "入力エラー：" + errors.join("／");
}

// -----------------------
// 各種モデル計算
// -----------------------

// 裁判所基準：傷害慰謝料（かなり簡略化したレンジモデル）
function calcCourtInjuryPain(treatmentDays, visitDays) {
  const days = Math.max(treatmentDays || 0, (visitDays || 0) * 3);
  if (!days) return 0;
  if (days <= 14) return 130000;
  if (days <= 30) return 260000;
  if (days <= 60) return 530000;
  if (days <= 90) return 880000;
  if (days <= 120) return 1200000;
  if (days <= 150) return 1500000;
  if (days <= 180) return 1800000;
  if (days <= 210) return 2100000;
  return 2400000;
}

// 裁判所基準：後遺障害慰謝料（簡略赤本モデル・万円単位）
const COURT_AFTER_PAIN_TABLE = {
  "1": 28000000,
  "2": 23000000,
  "3": 20000000,
  "4": 17000000,
  "5": 14000000,
  "6": 12000000,
  "7": 10000000,
  "8": 8300000,
  "9": 6900000,
  "10": 5500000,
  "11": 4200000,
  "12": 2900000,
  "13": 1800000,
  "14": 1100000
};

function calcCourtAfterPain(grade) {
  if (!grade || grade === "none") return 0;
  return COURT_AFTER_PAIN_TABLE[grade] || 0;
}

// 労働能力喪失率（等級ベース・簡略）
const LOSS_RATE_TABLE = {
  "1": 100,
  "2": 100,
  "3": 100,
  "4": 92,
  "5": 79,
  "6": 67,
  "7": 56,
  "8": 45,
  "9": 35,
  "10": 27,
  "11": 20,
  "12": 14,
  "13": 9,
  "14": 5
};

function resolveLossRate(inputs) {
  if (inputs.lossRate > 0) return inputs.lossRate;
  if (LOSS_RATE_TABLE[inputs.grade]) return LOSS_RATE_TABLE[inputs.grade];
  return 0;
}

// 喪失年数（ざっくり：67歳までを目安）
function resolveLossYears(inputs) {
  if (inputs.lossYears > 0) return inputs.lossYears;
  if (!inputs.age || inputs.age >= 67) return 0;
  return 67 - inputs.age;
}

// ここでは新ライプニッツ係数を「単純年数」で近似
function calcLostEarningsCourt(annualIncome, lossRatePercent, lossYears) {
  if (!annualIncome || !lossRatePercent || !lossYears) return 0;
  const rate = lossRatePercent / 100;
  return Math.round(annualIncome * rate * lossYears);
}

// 死亡慰謝料（裁判所基準モデル）
function resolveDeathPain(inputs) {
  if (inputs.deathPainPreset === "custom" && inputs.deathPainCustom > 0) {
    return inputs.deathPainCustom;
  }
  if (inputs.deathPainPreset === "self") {
    return 29000000;
  }
  if (inputs.deathPainPreset === "dependent") {
    return 35000000;
  }
  // プリセット不明だが扶養ありなら高めに
  if (inputs.deathSupportType === "twoPlus") return 35000000;
  if (inputs.deathSupportType === "one") return 30000000;
  return 29000000;
}

// 死亡事故：生活費控除率（簡易）
function resolveDeathLifeRate(inputs) {
  if (inputs.deathLifeRate > 0 && inputs.deathLifeRate <= 100) {
    return inputs.deathLifeRate / 100;
  }
  if (inputs.deathSupportType === "none") return 0.4;
  if (inputs.deathSupportType === "one") return 0.3;
  if (inputs.deathSupportType === "twoPlus") return 0.3;
  return 0.3;
}

// 死亡事故：就労可能年数
function resolveDeathWorkYears(inputs) {
  if (inputs.deathWorkYears > 0) return inputs.deathWorkYears;
  if (!inputs.age || inputs.age >= 67) return 0;
  return 67 - inputs.age;
}

// 死亡事故：逸失利益
function calcDeathLostEarnings(annualIncome, lifeRate, workYears) {
  if (!annualIncome || !workYears) return 0;
  const rate = 1 - lifeRate; // 生活費控除率を引いた残り
  return Math.round(annualIncome * rate * workYears);
}

// 自賠責：傷害慰謝料（4300円 × 日数・120日上限の簡易モデル）
function calcJibaiInjuryPain(treatmentDays, visitDays) {
  const days = Math.max(treatmentDays || 0, (visitDays || 0) * 2);
  if (!days) return 0;
  const effective = Math.min(days, 120);
  return 4300 * effective;
}

// 自賠責：休業損害
function calcJibaiLostWages(dailyIncome, absenceDays) {
  if (!dailyIncome || !absenceDays) return 0;
  return Math.round(dailyIncome * absenceDays);
}

// 自賠責：後遺障害慰謝料（ここでは後遺分の簡略モデル）
const JIBAI_AFTER_PAIN_TABLE = {
  "1": 115000000,
  "2": 99800000,
  "3": 86100000,
  "4": 73700000,
  "5": 61800000,
  "6": 51200000,
  "7": 41900000,
  "8": 33100000,
  "9": 24900000,
  "10": 19000000,
  "11": 13600000,
  "12": 9300000,
  "13": 5700000,
  "14": 3200000
};

function calcJibaiAfterPain(grade) {
  if (!grade || grade === "none") return 0;
  return JIBAI_AFTER_PAIN_TABLE[grade] || 0;
}

// 過失・既払
function applyFault(total, faultPercent) {
  const f = faultPercent ? faultPercent / 100 : 0;
  return Math.max(0, Math.round(total * (1 - f)));
}

function applyPaid(afterFault, alreadyPaid) {
  if (!alreadyPaid) return afterFault;
  return Math.max(0, afterFault - alreadyPaid);
}

// 構成比
function buildRatio(parts) {
  const total = (parts.injury || 0) + (parts.after || 0) +
                (parts.lost || 0) + (parts.other || 0);
  if (!total) {
    return { injury: 0, after: 0, lost: 0, other: 0 };
  }
  const pct = v => Math.round((v / total) * 1000) / 10;
  return {
    injury: pct(parts.injury || 0),
    after: pct(parts.after || 0),
    lost: pct(parts.lost || 0),
    other: pct(parts.other || 0)
  };
}

// script.js  Part 2 / 3

// 円グラフ描画
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

// 結果描画
function renderResult(result) {
  const court = result.court;
  const jibai = result.jibai;
  const meta = result.meta || {};

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  // サマリー
  const statusLabelMap = {
    injury: "傷害（入通院）",
    after: "後遺障害",
    death: "死亡事故"
  };
  const statusLabel = statusLabelMap[meta.status] || "";
  const summaryEl = document.getElementById("caseSummary");
  if (summaryEl) {
    let s = "";
    if (statusLabel) s += statusLabel;
    if (meta.age) s += (s ? " ／ " : "") + meta.age + "歳";
    if (meta.annualIncome) {
      s += (s ? " ／ " : "") + "年収 " + yenFormatter.format(meta.annualIncome);
    }
    summaryEl.textContent = s;
  }

  // 裁判所基準・サマリー
  setText("courtNetAmount", yenFormatter.format(court.afterPaid));
  setText("courtTotalMini", yenFormatter.format(court.total));
  setText("courtAfterFaultMini", yenFormatter.format(court.afterFault));
  setText("courtAfterPaidMini", yenFormatter.format(court.afterPaid));

  const courtHint = document.getElementById("courtHint");
  if (courtHint) {
    courtHint.textContent =
      `① 総損害額 ${yenFormatter.format(court.total)} → ` +
      `② 過失相殺後 ${yenFormatter.format(court.afterFault)} → ` +
      `③ 既払控除後（受取想定） ${yenFormatter.format(court.afterPaid)}`;
  }

  // 自賠責基準・サマリー
  setText("jibaiNetAmount", yenFormatter.format(jibai.afterPaid));
  setText("jibaiTotalMini", yenFormatter.format(jibai.total));
  setText("jibaiAfterFaultMini", yenFormatter.format(jibai.afterFault));
  setText("jibaiAfterPaidMini", yenFormatter.format(jibai.afterPaid));

  const jibaiHint = document.getElementById("jibaiHint");
  if (jibaiHint) {
    const capInfo = jibai.cap
      ? `（限度額 ${yenFormatter.format(jibai.cap)} を上限とするモデル）`
      : "";
    jibaiHint.textContent =
      `① 総損害額 ${yenFormatter.format(jibai.total)} → ` +
      `② 過失相殺後 ${yenFormatter.format(jibai.afterFault)} → ` +
      `③ 既払控除後（受取想定） ${yenFormatter.format(jibai.afterPaid)} ${capInfo}`;
  }

  // 明細（裁判所）
  setText("courtInjuryPain", yenFormatter.format(court.injuryPain));
  setText("courtAfterPain", yenFormatter.format(court.afterPain));
  setText("courtLostEarnings", yenFormatter.format(court.lostEarnings));
  setText("courtLostWages", yenFormatter.format(court.lostWages));
  setText("courtOtherCosts", yenFormatter.format(court.otherCosts));
  setText("courtTotal", yenFormatter.format(court.total));
  setText("courtAfterFault", yenFormatter.format(court.afterFault));
  setText("courtAfterPaid", yenFormatter.format(court.afterPaid));

  setText("courtRatioInjury", court.ratios.injury.toFixed(1) + "%");
  setText("courtRatioAfter", court.ratios.after.toFixed(1) + "%");
  setText("courtRatioLostEarnings", court.ratios.lost.toFixed(1) + "%");
  setText("courtRatioOther", court.ratios.other.toFixed(1) + "%");

  // 明細（自賠責）
  setText("jibaiInjuryPain", yenFormatter.format(jibai.injuryPain));
  setText("jibaiAfterPain", yenFormatter.format(jibai.afterPain));
  setText("jibaiLostWages", yenFormatter.format(jibai.lostWages));
  setText("jibaiOtherCosts", yenFormatter.format(jibai.otherCosts));
  setText("jibaiTotal", yenFormatter.format(jibai.total));
  setText("jibaiAfterFault", yenFormatter.format(jibai.afterFault));
  setText("jibaiAfterPaid", yenFormatter.format(jibai.afterPaid));

  const capInfoEl = document.getElementById("jibaiCapInfo");
  if (capInfoEl) {
    capInfoEl.textContent = jibai.cap
      ? `自賠責限度額：${yenFormatter.format(jibai.cap)} を上限として計算。`
      : "";
  }

  // カード表示
  const detailSection = document.getElementById("detailResults");
  if (detailSection) detailSection.classList.remove("hidden");
  const resultSection = document.getElementById("resultSection");
  if (resultSection) resultSection.classList.remove("hidden");

  // 円グラフ
  updateCourtChart(result.court);

  // 結果カードへスクロール
  if (resultSection) {
    setTimeout(() => {
      const rect = resultSection.getBoundingClientRect();
      const y = rect.top + window.pageYOffset - 8;
      window.scrollTo({ top: y, behavior: "smooth" });
    }, 200);
  }
}

// script.js  Part 3 / 3

// メイン計算
function calculateAll() {
  const inputs = collectInputs();
  const errors = validateInputs(inputs);
  showErrors(errors);
  if (errors.length) return;

  // 死亡事故の補正
  if (inputs.status === "death") {
    inputs.deathWorkYears = resolveDeathWorkYears(inputs);
  }

  // 裁判所基準
  let courtInjury = 0;
  let courtAfter = 0;
  let courtLost = 0;
  let courtLostWages = 0;
  let courtOther = inputs.otherCosts || 0;

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
    const workYears = resolveDeathWorkYears(inputs);
    courtAfter = resolveDeathPain(inputs);
    courtLost = calcDeathLostEarnings(inputs.annualIncome, lifeRate, workYears);
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

  // 自賠責基準（モデル）
  let jibaiInjury = 0;
  let jibaiAfter = 0;
  let jibaiLostWages = 0;
  let jibaiOther = inputs.otherCosts || 0;
  let jibaiCap = null;

  if (inputs.status === "injury" || inputs.status === "after") {
    jibaiInjury = calcJibaiInjuryPain(inputs.treatmentDays, inputs.visitDays);
    jibaiLostWages = calcJibaiLostWages(inputs.dailyIncome, inputs.absenceDays);
    if (inputs.status === "after") {
      jibaiAfter = calcJibaiAfterPain(inputs.grade);
    }
    jibaiCap = JIBAI_INJURY_CAP;
  } else if (inputs.status === "death") {
    // 死亡自賠責モデル：死亡慰謝料 350万円＋葬儀費（上限は別途）
    jibaiAfter = 3500000;
    jibaiOther += inputs.funeralCost || 0;
    jibaiCap = JIBAI_DEATH_CAP;
  }

  let jibaiTotal = jibaiInjury + jibaiAfter + jibaiLostWages + jibaiOther;
  if (jibaiCap != null) {
    jibaiTotal = Math.min(jibaiTotal, jibaiCap);
  }
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
      annualIncome: inputs.annualIncome
    }
  };

  lastResult = { inputs, result };
  renderResult(result);
}

// 入力UI切り替え
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

// モデルプリセット
const modelPresets = {
  "after_14_30": { status: "after", age: 30, annualIncome: 4000000, grade: "14" },
  "after_12_40": { status: "after", age: 40, annualIncome: 5000000, grade: "12" },
  "after_9_30":  { status: "after", age: 30, annualIncome: 6000000, grade: "9"  },
  "after_12_30": { status: "after", age: 30, annualIncome: 4500000, grade: "12" },
  "death_40_dep": {
    status: "death",
    age: 40,
    annualIncome: 5000000,
    deathSupportType: "twoPlus",
    deathPainPreset: "dependent"
  },
  "death_75_single": {
    status: "death",
    age: 75,
    annualIncome: 3000000,
    deathSupportType: "none",
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
  setVal("deathPainPreset", preset.deathPainPreset);
}

// 損害明細コピー
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
  lines.push(`過失割合（被害者側）：${inputs.faultPercent || 0}%`);
  if (inputs.alreadyPaid) {
    lines.push(`既払金：${yenFormatter.format(inputs.alreadyPaid)}`);
  }

  if (inputs.status === "injury" || inputs.status === "after") {
    const t = inputs.treatmentDays ? `${inputs.treatmentDays}日` : "-";
    const v = inputs.visitDays ? `${inputs.visitDays}日` : "-";
    const a = inputs.absenceDays ? `${inputs.absenceDays}日` : "-";
    lines.push(`治療期間：${t}／実通院日数：${v}／休業日数：${a}`);
    if (inputs.status === "after" && inputs.grade && inputs.grade !== "none") {
      lines.push(`後遺障害等級：${inputs.grade}級（慰謝料＋逸失利益モデル）`);
    }
  }

  if (inputs.status === "death") {
    lines.push(`扶養状況：${supportMap[inputs.deathSupportType] || ""}`);
    const lifeRate = resolveDeathLifeRate(inputs);
    const workYears = resolveDeathWorkYears(inputs);
    lines.push(`就労可能年数（モデル）：約${workYears}年（67歳まで目安）`);
    lines.push(`生活費控除率（モデル）：約${(lifeRate * 100).toFixed(1).replace(/\.0$/, "")}%`);
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
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    success = document.execCommand("copy");
    document.body.removeChild(ta);
  } catch (e) {
    success = false;
  }

  const statusEl = document.getElementById("copyStatus");
  if (success) {
    if (statusEl) {
      statusEl.textContent = "損害明細をクリップボードにコピーしました。";
      setTimeout(() => statusEl.textContent = "", 4000);
    } else {
      alert("損害明細をコピーしました。");
    }
  } else {
    window.prompt("コピーに失敗しました。下記テキストを選択してコピーしてください。", text);
  }
}

// 初期化
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
