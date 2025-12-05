// 日本円フォーマット
const yenFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0
});

// localStorageキー
const LS_KEY_INPUTS = "trafficAccidentCalcLastInputsV1";

// 等級ごとの典型的な喪失率・喪失期間（モデル値）
const gradeLossPreset = {
  none: { rate: 0, years: 0 },
  "14": { rate: 5, years: 5 },
  "13": { rate: 9, years: 7 },
  "12": { rate: 14, years: 10 },
  "11": { rate: 20, years: 15 },
  "10": { rate: 27, years: 17 },
  "9": { rate: 35, years: 20 },
  "8": { rate: 45, years: 22 },
  "7": { rate: 56, years: 27 },
  "6": { rate: 67, years: 30 },
  "5": { rate: 79, years: 32 },
  "4": { rate: 79, years: 34 },
  "3": { rate: 100, years: 35 },
  "2": { rate: 100, years: 40 },
  "1": { rate: 100, years: 45 }
};

// 自賠責の後遺障害慰謝料（モデル値）
const jibaiAfterPainTable = {
  "1": 16500000,
  "2": 12030000,
  "3": 8610000,
  "4": 7370000,
  "5": 6180000,
  "6": 5120000,
  "7": 4190000,
  "8": 3310000,
  "9": 2490000,
  "10": 1900000,
  "11": 1360000,
  "12": 940000,
  "13": 570000,
  "14": 320000
};

// 裁判所基準（モデル）の後遺障害慰謝料（代表値）
const courtAfterPainTable = {
  "1": 2800000,
  "2": 2370000,
  "3": 1990000,
  "4": 1670000,
  "5": 1400000,
  "6": 1180000,
  "7": 1000000,
  "8": 830000,
  "9": 690000,
  "10": 550000,
  "11": 420000,
  "12": 290000,
  "13": 180000,
  "14": 110000
};

// 傷害慰謝料（裁判所基準モデル）の代表値（1〜6か月、通院頻度「中」の想定）
const courtInjuryBaseTable = {
  1: 190000,
  2: 280000,
  3: 530000,
  4: 670000,
  5: 750000,
  6: 880000
};

// 死亡自賠責の限度額
const JIBAI_DEATH_CAP = 30000000;

// 死亡慰謝料の推奨額（モデル値）
const DEATH_PAIN_PRESET = {
  self: 29000000,      // 本人死亡
  dependent: 22000000  // 被扶養者死亡
};

// 直近の計算結果・入力を保持（サマリー生成用）
let lastInputs = null;
let lastResult = null;

// シナリオA/B（現在の計算結果をスナップショット保存）
let scenarioA = null;
let scenarioB = null;

document.addEventListener("DOMContentLoaded", () => {
  const gradeEl = document.getElementById("grade");
  const lossRateEl = document.getElementById("lossRate");
  const lossYearsEl = document.getElementById("lossYears");
  const incomePresetEl = document.getElementById("incomePreset");
  const annualIncomeEl = document.getElementById("annualIncome");
  const calcButton = document.getElementById("calcButton");
  const toggleAdvancedBtn = document.getElementById("toggleAdvanced");
  const advancedSection = document.getElementById("advancedSection");
  const restoreButton = document.getElementById("restoreButton");
  const restoreStatus = document.getElementById("restoreStatus");
  const copySummaryButton = document.getElementById("copySummaryButton");
  const copySummaryStatus = document.getElementById("copySummaryStatus");
  const delayTodayButton = document.getElementById("delayTodayButton");
  const delayCalcButton = document.getElementById("delayCalcButton");
  const delayCalcStatus = document.getElementById("delayCalcStatus");
  const saveScenarioAButton = document.getElementById("saveScenarioA");
  const saveScenarioBButton = document.getElementById("saveScenarioB");
  const showScenarioButton = document.getElementById("showScenario");
  const scenarioStatus = document.getElementById("scenarioStatus");

  // 死亡モード関連
  const victimStatusEl = document.getElementById("victimStatus");
  const deathSupportTypeEl = document.getElementById("deathSupportType");
  const deathLifeRateEl = document.getElementById("deathLifeRate");
  const deathWorkYearsEl = document.getElementById("deathWorkYears");
  const deathPainPresetEl = document.getElementById("deathPainPreset");
  const deathPainCustomEl = document.getElementById("deathPainCustom");
  const funeralCostEl = document.getElementById("funeralCost");

  // 葬儀費の初期値（死亡モード用）
  if (funeralCostEl && !funeralCostEl.value) {
    funeralCostEl.value = "1200000";
  }

  // 等級変更時に喪失率・期間を自動設定
  if (gradeEl) {
    gradeEl.addEventListener("change", () => {
      const value = gradeEl.value || "none";
      const preset = gradeLossPreset[value] || gradeLossPreset["none"];
      if (lossRateEl) lossRateEl.value = preset.rate > 0 ? String(preset.rate) : "";
      if (lossYearsEl) lossYearsEl.value = preset.years > 0 ? String(preset.years) : "";
    });
  }

  // 基礎収入プリセット
  if (incomePresetEl) {
    incomePresetEl.addEventListener("change", () => {
      const value = incomePresetEl.value;
      if (value === "avgAll") {
        annualIncomeEl.value = "4000000"; // モデル値
      } else if (value === "avgMale") {
        annualIncomeEl.value = "5000000"; // モデル値
      } else if (value === "avgFemale") {
        annualIncomeEl.value = "3000000"; // モデル値
      }
      // "custom" の場合は何もしない
    });
  }

  // 詳細設定表示/非表示
  if (toggleAdvancedBtn && advancedSection) {
    toggleAdvancedBtn.addEventListener("click", () => {
      const isHidden = advancedSection.classList.contains("hidden");
      if (isHidden) {
        advancedSection.classList.remove("hidden");
        toggleAdvancedBtn.textContent = "詳細設定（労働能力喪失率・喪失期間）を隠す";
      } else {
        advancedSection.classList.add("hidden");
        toggleAdvancedBtn.textContent = "詳細設定（労働能力喪失率・喪失期間）を表示";
      }
    });
  }

  // 計算ボタン
  if (calcButton) {
    calcButton.addEventListener("click", () => {
      const inputs = parseInputs();
      const errors = validateInputs(inputs);
      showErrors(errors);

      if (errors.length === 0) {
        const result = calculateAll(inputs);
        // グローバルに保存（サマリー・遅延損害金・シナリオ用）
        lastInputs = inputs;
        lastResult = result;
        // localStorage に保存
        saveInputsToStorage(inputs);
        updateResultDisplay(result);
        if (restoreStatus) restoreStatus.textContent = ""; // 計算後は復元メッセージをクリア
      }
    });
  }

  // 前回入力復元
  if (restoreButton) {
    restoreButton.addEventListener("click", () => {
      const loaded = loadInputsFromStorage();
      if (!loaded) {
        if (restoreStatus) restoreStatus.textContent = "保存された前回の入力はありません。";
        return;
      }
      applyInputsToForm(loaded);
      if (restoreStatus) restoreStatus.textContent = "前回の入力をフォームに復元しました。";
    });
  }

  // サマリーをコピー
  if (copySummaryButton) {
    copySummaryButton.addEventListener("click", async () => {
      if (copySummaryStatus) copySummaryStatus.textContent = "";
      if (!lastInputs || !lastResult) {
        if (copySummaryStatus) {
          copySummaryStatus.textContent = "先に「損害額を計算する」を実行してください。";
        }
        return;
      }
      const text = buildSummaryText(lastInputs, lastResult);
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          if (copySummaryStatus) {
            copySummaryStatus.textContent = "サマリーをクリップボードにコピーしました。";
          }
        } else {
          // クリップボードAPIがない環境向けフォールバック
          fallbackCopyText(text);
          if (copySummaryStatus) {
            copySummaryStatus.textContent =
              "サマリーを選択状態にしました。必要に応じてコピーしてください。";
          }
        }
      } catch (_e) {
        if (copySummaryStatus) {
          copySummaryStatus.textContent =
            "コピーに失敗しました。環境によっては対応していない場合があります。";
        }
      }
    });
  }

  // 遅延損害金：支払日に本日をセット
  if (delayTodayButton) {
    delayTodayButton.addEventListener("click", () => {
      const today = new Date();
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, "0");
      const d = String(today.getDate()).padStart(2, "0");
      const iso = `${y}-${m}-${d}`;
      const delayPayDateEl = document.getElementById("delayPayDate");
      if (delayPayDateEl) delayPayDateEl.value = iso;
    });
  }

  // 遅延損害金計算
  if (delayCalcButton) {
    delayCalcButton.addEventListener("click", () => {
      const delayErrorBox = document.getElementById("delayError");
      const delayResult = document.getElementById("delayResult");

      // クリックされたことを即座に表示
      if (delayCalcStatus) {
        delayCalcStatus.textContent = "遅延損害金の計算を実行中です…";
      }

      if (delayErrorBox) {
        delayErrorBox.style.display = "none";
        delayErrorBox.textContent = "";
      }
      if (delayResult) delayResult.textContent = "";

      const baseAmount = toNumberOrNull(
        document.getElementById("delayBaseAmount")?.value
      );
      const rate = toNumberOrNull(
        document.getElementById("delayRate")?.value
      );
      const accidentDateStr = document.getElementById("accidentDate")?.value;
      const payDateStr = document.getElementById("delayPayDate")?.value;

      const errors = [];
      if (!baseAmount || baseAmount <= 0) {
        errors.push("遅延損害金の対象額（円）を0より大きい値で入力してください。");
      }
      if (!rate || rate < 0) {
        errors.push("年利（％）を0以上の数値で入力してください。");
      }
      if (!accidentDateStr) {
        errors.push("事故日が未入力のため、遅延損害金を計算できません。Step1で事故日を入力してください。");
      }
      if (!payDateStr) {
        errors.push("支払日（または和解日）を入力してください。");
      }

      if (errors.length > 0) {
        if (delayErrorBox) {
          delayErrorBox.style.display = "block";
          delayErrorBox.innerHTML = errors.map((e) => `<div>・${e}</div>`).join("");
        }
        if (delayCalcStatus) {
          delayCalcStatus.textContent = "入力エラーのため、遅延損害金を計算できませんでした。";
        }
        return;
      }

      const diff = calcDelayDamages(baseAmount, accidentDateStr, payDateStr, rate);
      if (diff.error) {
        if (delayErrorBox) {
          delayErrorBox.style.display = "block";
          delayErrorBox.innerHTML = `<div>・${diff.error}</div>`;
        }
        if (delayCalcStatus) {
          delayCalcStatus.textContent = "エラーにより、遅延損害金を計算できませんでした。";
        }
        return;
      }

      if (delayResult) {
        delayResult.textContent =
          `事故日から支払日までの経過日数は約 ${diff.days} 日、年利${rate.toFixed(1)}％での遅延損害金は概ね `
          + `${yenFormatter.format(diff.amount)} 程度です。`;
      }

      if (delayCalcStatus) {
        delayCalcStatus.textContent = "遅延損害金の計算が完了しました。";
      }
    });
  }

  // シナリオAとして保存
  if (saveScenarioAButton) {
    saveScenarioAButton.addEventListener("click", () => {
      if (scenarioStatus) scenarioStatus.textContent = "";
      if (!lastInputs || !lastResult) {
        if (scenarioStatus) {
          scenarioStatus.textContent = "先に「損害額を計算する」を実行してからシナリオAを保存してください。";
        }
        return;
      }
      scenarioA = {
        inputs: structuredCloneSafe(lastInputs),
        result: structuredCloneSafe(lastResult)
      };
      if (scenarioStatus) scenarioStatus.textContent = "現在の計算結果をシナリオAとして保存しました。";
      updateScenarioCompareDisplay();
    });
  }

  // シナリオBとして保存
  if (saveScenarioBButton) {
    saveScenarioBButton.addEventListener("click", () => {
      if (scenarioStatus) scenarioStatus.textContent = "";
      if (!lastInputs || !lastResult) {
        if (scenarioStatus) {
          scenarioStatus.textContent = "先に「損害額を計算する」を実行してからシナリオBを保存してください。";
        }
        return;
      }
      scenarioB = {
        inputs: structuredCloneSafe(lastInputs),
        result: structuredCloneSafe(lastResult)
      };
      if (scenarioStatus) scenarioStatus.textContent = "現在の計算結果をシナリオBとして保存しました。";
      updateScenarioCompareDisplay();
    });
  }

  // シナリオ比較表示／更新
  if (showScenarioButton) {
    showScenarioButton.addEventListener("click", () => {
      if (!scenarioA && !scenarioB) {
        if (scenarioStatus) {
          scenarioStatus.textContent = "シナリオA/Bのいずれも保存されていません。先に保存してください。";
        }
        return;
      }
      if (scenarioStatus) scenarioStatus.textContent = "シナリオ比較を更新しました。";
      updateScenarioCompareDisplay(true);
    });
  }
});

// 共通：文字列→数値
function toNumberOrNull(v) {
  if (v == null) return null;
  const trimmed = String(v).trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isNaN(n) ? null : n;
}

// 入力取得
function parseInputs() {
  const intOrNullInput = (id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const v = el.value.trim();
    if (v === "") return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  };

  const victimStatusEl = document.getElementById("victimStatus");
  const status = victimStatusEl ? (victimStatusEl.value || "injury") : "injury";

  const grade = document.getElementById("grade").value;
  const lossRateOverride = intOrNullInput("lossRate");
  const lossYearsOverride = intOrNullInput("lossYears");

  const treatmentDays = intOrNullInput("treatmentDays");
  const visitDays = intOrNullInput("visitDays");
  const dailyIncome = intOrNullInput("dailyIncome");
  const absenceDays = intOrNullInput("absenceDays");
  const otherCosts = intOrNullInput("otherCosts") ?? 0;
  const annualIncome = intOrNullInput("annualIncome");
  const faultPercent = intOrNullInput("faultPercent");
  const alreadyPaid = intOrNullInput("alreadyPaid") ?? 0;
  const accidentDateEl = document.getElementById("accidentDate");
  const accidentDate = accidentDateEl ? (accidentDateEl.value || null) : null;

  // 死亡モード用
  const deathSupportTypeEl = document.getElementById("deathSupportType");
  const deathSupportType = deathSupportTypeEl ? deathSupportTypeEl.value : "";

  const deathLifeRate = intOrNullInput("deathLifeRate"); // %
  const deathWorkYears = intOrNullInput("deathWorkYears");
  const deathPainPresetEl = document.getElementById("deathPainPreset");
  const deathPainPreset = deathPainPresetEl ? deathPainPresetEl.value : "";
  const deathPainCustom = intOrNullInput("deathPainCustom");
  const funeralCost = intOrNullInput("funeralCost") ?? 0;

  return {
    status, // "injury" | "after" | "death"
    treatmentDays,
    visitDays,
    dailyIncome,
    absenceDays,
    otherCosts,
    grade,
    lossRateOverride,
    lossYearsOverride,
    annualIncome,
    faultPercent,
    alreadyPaid,
    accidentDate,
    deathSupportType,
    deathLifeRate,
    deathWorkYears,
    deathPainPreset,
    deathPainCustom,
    funeralCost
  };
}

// 入力バリデーション
function validateInputs(inputs) {
  const errors = [];

  // 共通チェック
  if (!inputs.grade && inputs.status !== "death") {
    errors.push("後遺障害等級を選択してください（非該当の場合も「14級・12級」などを目安に設定すると、逸失利益の当たりが出しやすくなります）。");
  }
  if (!inputs.annualIncome || inputs.annualIncome <= 0) {
    errors.push("基礎収入（年額・円）を0より大きい値で入力してください。");
  }
  if (inputs.faultPercent === null || inputs.faultPercent < 0 || inputs.faultPercent > 100) {
    errors.push("被害者側過失割合（％）は0〜100の範囲で入力してください。");
  }
  if (inputs.alreadyPaid < 0) {
    errors.push("既払金合計（円）は0以上で入力してください。");
  }

  if (inputs.status === "death") {
    // 死亡モード専用チェック
    const lifeRate = getDeathLifeRate(inputs);
    const workYears = getDeathWorkYears(inputs);
    const deathPainAmount = getDeathPainAmount(inputs);

    if (!inputs.deathSupportType && inputs.deathLifeRate == null) {
      errors.push("死亡モードでは、生活費控除の扶養状況を選択するか、控除率（％）を入力してください。");
    }
    if (!(lifeRate > 0 && lifeRate < 1)) {
      errors.push("生活費控除率（％）は0〜100の範囲で設定してください。");
    }
    if (!workYears || workYears <= 0) {
      errors.push("死亡モードでは、就労可能年数（年）を1以上の値で入力してください。");
    }
    if (!deathPainAmount || deathPainAmount <= 0) {
      errors.push("死亡慰謝料の区分を選択するか、任意額を入力してください。");
    }
    if (inputs.funeralCost < 0) {
      errors.push("葬儀費（円）は0以上で入力してください。");
    }

    return errors;
  }

  // 傷害・後遺障害モード
  if (inputs.status === "injury") {
    if (!inputs.treatmentDays || inputs.treatmentDays <= 0) {
      errors.push("治療期間（日数）を1以上の整数で入力してください。");
    }
    if (inputs.visitDays === null || inputs.visitDays < 0) {
      errors.push("実通院日数（日）を0以上の整数で入力してください。");
    }
    if (inputs.dailyIncome === null || inputs.dailyIncome < 0) {
      errors.push("休業損害の実収入日額（円）を0以上で入力してください。");
    }
    if (inputs.absenceDays === null || inputs.absenceDays < 0) {
      errors.push("休業日数（日）を0以上の整数で入力してください。");
    }
  } else if (inputs.status === "after") {
    // 後遺障害のみ：治療・休業の入力は任意（負の値だけNG）
    if (inputs.visitDays !== null && inputs.visitDays < 0) {
      errors.push("実通院日数（日）は0以上の整数で入力してください。");
    }
    if (inputs.absenceDays !== null && inputs.absenceDays < 0) {
      errors.push("休業日数（日）は0以上の整数で入力してください。");
    }
  }

  return errors;
}

// 全体計算
function calculateAll(inputs) {
  const status = inputs.status || "injury";
  const fault = (inputs.faultPercent ?? 0) / 100;

  // 共通変数
  let jibaiInjuryPain = 0;
  let jibaiLostWages = 0;
  let jibaiAfterPain = 0;
  let jibaiOtherCosts = 0;
  let jibaiCap = 0;

  let courtInjuryPain = 0;
  let courtAfterPain = 0;
  let courtLostEarnings = 0;
  let courtLostWages = 0;
  let courtOtherCosts = 0;

  let lossRateInfo = 0;
  let lossYearsInfo = 0;

  if (status === "death") {
    // 死亡モード
    const lifeRate = getDeathLifeRate(inputs);        // 生活費控除率
    const workYears = getDeathWorkYears(inputs);      // 就労可能年数
    const deathPain = getDeathPainAmount(inputs);     // 死亡慰謝料
    const funeralCost = inputs.funeralCost || 0;

    // 裁判所基準（死亡）
    courtInjuryPain = 0;
    courtLostWages = 0;
    courtAfterPain = deathPain;
    courtLostEarnings = calcDeathLostEarnings(inputs.annualIncome, lifeRate, workYears);
    courtOtherCosts = (inputs.otherCosts || 0) + funeralCost;

    lossRateInfo = lifeRate;      // 生活費控除率（参考表示用）
    lossYearsInfo = workYears;    // 就労可能年数

    // 自賠責基準（死亡：3000万円枠モデル）
    jibaiInjuryPain = 0;
    jibaiLostWages = 0;
    jibaiAfterPain = 0;
    jibaiOtherCosts = JIBAI_DEATH_CAP;  // すべてを「その他（死亡一括）」として表示
    jibaiCap = JIBAI_DEATH_CAP;
  } else {
    // 傷害／後遺障害モード（従来ロジック）
    const isAfterOnly = status === "after";

    const injuryTreatmentDays = isAfterOnly ? 0 : inputs.treatmentDays;
    const injuryVisitDays = isAfterOnly ? 0 : inputs.visitDays;
    const absenceDays = isAfterOnly ? 0 : inputs.absenceDays;

    // 自賠責
    jibaiInjuryPain = calcJibaiInjuryPain(injuryTreatmentDays, injuryVisitDays);
    jibaiLostWages = calcJibaiLostEarnings(inputs.dailyIncome, absenceDays);
    jibaiAfterPain = calcJibaiAfterEffectPain(inputs.grade);
    jibaiOtherCosts = inputs.otherCosts;
    jibaiCap = 1200000; // 傷害120万円枠

    // 裁判所基準
    courtInjuryPain = calcCourtInjuryPain(injuryTreatmentDays, injuryVisitDays);
    courtAfterPain = calcCourtAfterEffectPain(inputs.grade);
    const lossRate = getLossRate(inputs);
    const lossYears = getLossYears(inputs);
    courtLostEarnings = calcLostEarningsCourt(inputs.annualIncome, lossRate, lossYears);
    courtLostWages = calcCourtLostWages(inputs.dailyIncome, absenceDays);
    courtOtherCosts = inputs.otherCosts;

    lossRateInfo = lossRate;
    lossYearsInfo = lossYears;
  }

  // 自賠責：集計
  const jibaiTotalGross = jibaiInjuryPain + jibaiLostWages + jibaiAfterPain + jibaiOtherCosts;
  const jibaiAfterFault = applyFault(jibaiTotalGross, fault);
  const jibaiAfterPaid = applyPaid(jibaiAfterFault, inputs.alreadyPaid);

  // 裁判所基準：集計
  const courtTotalGross =
    courtInjuryPain + courtAfterPain + courtLostEarnings + courtLostWages + courtOtherCosts;
  const courtAfterFault = applyFault(courtTotalGross, fault);
  const courtAfterPaid = applyPaid(courtAfterFault, inputs.alreadyPaid);

  const ratios = calcPercentageDistribution({
    injury: courtInjuryPain,
    after: courtAfterPain,
    lost: courtLostEarnings,
    other: courtLostWages + courtOtherCosts
  });

  return {
    jibai: {
      injuryPain: jibaiInjuryPain,
      lostWages: jibaiLostWages,
      afterPain: jibaiAfterPain,
      otherCosts: jibaiOtherCosts,
      total: jibaiTotalGross,
      afterFault: jibaiAfterFault,
      afterPaid: jibaiAfterPaid,
      cap: jibaiCap
    },
    court: {
      injuryPain: courtInjuryPain,
      afterPain: courtAfterPain,
      lostEarnings: courtLostEarnings,
      lostWages: courtLostWages,
      otherCosts: courtOtherCosts,
      total: courtTotalGross,
      afterFault: courtAfterFault,
      afterPaid: courtAfterPaid,
      ratios,
      lossRate: lossRateInfo,
      lossYears: lossYearsInfo
    }
  };
}

// 死亡モード：生活費控除率（0〜1）
// 死亡モード：生活費控除率（0〜1）
function getDeathLifeRate(inputs) {
  if (inputs.deathLifeRate != null && inputs.deathLifeRate >= 0 && inputs.deathLifeRate <= 100) {
    return inputs.deathLifeRate / 100;
  }
  switch (inputs.deathSupportType) {
    case "none":
      return 0.4;  // 被扶養者なし
    case "one":
      return 0.3;  // 扶養1名
    case "twoPlus":
      return 0.3;  // 扶養2名以上
    default:
      return 0.0;
  }
}

// 死亡モード：就労可能年数
function getDeathWorkYears(inputs) {
  return inputs.deathWorkYears || 0;
}

// 死亡モード：死亡慰謝料（円）
function getDeathPainAmount(inputs) {
  if (inputs.deathPainPreset === "self") {
    return DEATH_PAIN_PRESET.self;
  }
  if (inputs.deathPainPreset === "dependent") {
    return DEATH_PAIN_PRESET.dependent;
  }
  if (inputs.deathPainPreset === "custom") {
    return inputs.deathPainCustom || 0;
  }
  return 0;
}

// 死亡モード：逸失利益
function calcDeathLostEarnings(annualIncome, lifeRate, workYears) {
  if (!annualIncome || annualIncome <= 0) return 0;
  if (!lifeRate || lifeRate <= 0 || lifeRate >= 1) return 0;
  if (!workYears || workYears <= 0) return 0;
  const coeff = getLiapnizCoefficient(workYears, 0.03);
  const netAnnual = annualIncome * (1 - lifeRate);
  const base = netAnnual * coeff;
  return Math.round(base);
}

// 自賠責：傷害慰謝料
function calcJibaiInjuryPain(treatmentDays, visitDays) {
  const base = 4300;
  const periods = Math.min(treatmentDays || 0, (visitDays || 0) * 2);
  if (!treatmentDays || !visitDays) return 0;
  return base * periods;
}

// 自賠責：休業損害
function calcJibaiLostEarnings(dailyIncome, absenceDays) {
  if (!dailyIncome || !absenceDays) return 0;
  const daily = Math.min(dailyIncome, 6100);
  return daily * absenceDays;
}

// 自賠責：後遺障害慰謝料
function calcJibaiAfterEffectPain(grade) {
  if (!grade || grade === "none") return 0;
  return jibaiAfterPainTable[grade] || 0;
}

// 裁判所基準：傷害慰謝料（入通院）モデル
function calcCourtInjuryPain(treatmentDays, visitDays) {
  if (!treatmentDays || treatmentDays <= 0) return 0;
  const periodDays = treatmentDays;
  const months = periodDays / 30;
  const capMonth = Math.max(1, Math.min(6, months));

  const freq = (visitDays && treatmentDays) ? (visitDays / treatmentDays) : 0;
  let freqMultiplier = 0.8; // 中頻度
  if (freq >= 0.4) {
    freqMultiplier = 1.0; // 高頻度
  } else if (freq < 0.2) {
    freqMultiplier = 0.6; // 低頻度
  }

  const lowerMonth = Math.floor(capMonth);
  const upperMonth = Math.ceil(capMonth);
  const lowerBase = courtInjuryBaseTable[lowerMonth] || courtInjuryBaseTable[6];
  const upperBase = courtInjuryBaseTable[upperMonth] || (courtInjuryBaseTable[6] + (upperMonth - 6) * 30000);

  const t = capMonth - lowerMonth;
  const interpolated = lowerBase + (upperBase - lowerBase) * t;

  const amount = interpolated * freqMultiplier;
  return Math.round(amount);
}

// 裁判所基準：後遺障害慰謝料
function calcCourtAfterEffectPain(grade) {
  if (!grade || grade === "none") return 0;
  return courtAfterPainTable[grade] || 0;
}

// 等級から喪失率
function getLossRate(inputs) {
  if (inputs.lossRateOverride != null && inputs.lossRateOverride >= 0) {
    return inputs.lossRateOverride / 100;
  }
  const gradeKey = inputs.grade || "none";
  const preset = gradeLossPreset[gradeKey] || gradeLossPreset["none"];
  return (preset.rate || 0) / 100;
}

// 等級から喪失期間
function getLossYears(inputs) {
  if (inputs.lossYearsOverride != null && inputs.lossYearsOverride >= 0) {
    return inputs.lossYearsOverride;
  }
  const gradeKey = inputs.grade || "none";
  const preset = gradeLossPreset[gradeKey] || gradeLossPreset["none"];
  return preset.years || 0;
}

// ライプニッツ係数（利率3％）
function getLiapnizCoefficient(years, rate = 0.03) {
  if (!years || years <= 0) return 0;
  const n = years;
  const coeff = (1 - Math.pow(1 + rate, -n)) / rate;
  return coeff;
}

// 裁判所基準：逸失利益
function calcLostEarningsCourt(annualIncome, lossRate, lossYears) {
  if (!annualIncome || !lossRate || !lossYears) return 0;
  const coeff = getLiapnizCoefficient(lossYears, 0.03);
  const base = annualIncome * lossRate * coeff;
  return Math.round(base);
}

// 裁判所基準：休業損害
function calcCourtLostWages(dailyIncome, absenceDays) {
  if (!dailyIncome || !absenceDays) return 0;
  return dailyIncome * absenceDays;
}

// 過失相殺
function applyFault(total, fault) {
  if (!total || total <= 0) return 0;
  const f = !fault ? 0 : fault;
  return Math.max(0, Math.round(total * (1 - f)));
}

// 既払控除
function applyPaid(amount, alreadyPaid) {
  if (!amount || amount <= 0) return 0;
  const paid = alreadyPaid || 0;
  return Math.max(0, amount - paid);
}

// 構成比
function calcPercentageDistribution(parts) {
  const total = parts.injury + parts.after + parts.lost + parts.other;
  if (!total || total <= 0) {
    return {
      injury: "-",
      after: "-",
      lost: "-",
      other: "-"
    };
  }
  const pct = (v) => ((v / total) * 100).toFixed(1) + "%";
  return {
    injury: pct(parts.injury),
    after: pct(parts.after),
    lost: pct(parts.lost),
    other: pct(parts.other)
  };
}

// 結果表示更新
function updateResultDisplay(result) {
  document.getElementById("resultSection").classList.remove("hidden");
  document.getElementById("detailResults").classList.remove("hidden");

  document.getElementById("courtNetAmount").textContent =
    result.court.afterPaid > 0 ? yenFormatter.format(result.court.afterPaid) : "¥0";
  document.getElementById("jibaiNetAmount").textContent =
    result.jibai.afterPaid > 0 ? yenFormatter.format(result.jibai.afterPaid) : "¥0";

  // 裁判所基準
  document.getElementById("courtInjuryPain").textContent = yenFormatter.format(result.court.injuryPain);
  document.getElementById("courtAfterPain").textContent = yenFormatter.format(result.court.afterPain);
  document.getElementById("courtLostEarnings").textContent = yenFormatter.format(result.court.lostEarnings);
  document.getElementById("courtLostWages").textContent = yenFormatter.format(result.court.lostWages);
  document.getElementById("courtOtherCosts").textContent = yenFormatter.format(result.court.otherCosts);
  document.getElementById("courtTotal").textContent = yenFormatter.format(result.court.total);
  document.getElementById("courtAfterFault").textContent = yenFormatter.format(result.court.afterFault);
  document.getElementById("courtAfterPaid").textContent = yenFormatter.format(result.court.afterPaid);

  document.getElementById("courtRatioInjury").textContent = result.court.ratios.injury;
  document.getElementById("courtRatioAfter").textContent = result.court.ratios.after;
  document.getElementById("courtRatioLostEarnings").textContent = result.court.ratios.lost;
  document.getElementById("courtRatioOther").textContent = result.court.ratios.other;

  // 自賠責
  document.getElementById("jibaiInjuryPain").textContent = yenFormatter.format(result.jibai.injuryPain);
  document.getElementById("jibaiAfterPain").textContent = yenFormatter.format(result.jibai.afterPain);
  document.getElementById("jibaiLostWages").textContent = yenFormatter.format(result.jibai.lostWages);
  document.getElementById("jibaiOtherCosts").textContent = yenFormatter.format(result.jibai.otherCosts);
  document.getElementById("jibaiTotal").textContent = yenFormatter.format(result.jibai.total);
  document.getElementById("jibaiAfterFault").textContent = yenFormatter.format(result.jibai.afterFault);
  document.getElementById("jibaiAfterPaid").textContent = yenFormatter.format(result.jibai.afterPaid);

  const capText = (() => {
    const total = result.jibai.total;
    if (total <= 0) return "–";
    if (result.jibai.cap && total <= result.jibai.cap) {
      return `総損害額は自賠責限度額の範囲内（残り約 ${yenFormatter.format(result.jibai.cap - total)}）`;
    } else if (result.jibai.cap && total > result.jibai.cap) {
      return `総損害額は自賠責限度額を約 ${yenFormatter.format(total - result.jibai.cap)} 超過`;
    }
    return "–";
  })();
  document.getElementById("jibaiCapInfo").textContent = capText;

  // 裁判所基準の損害構造グラフを更新
  updateCourtChart(result.court);
}

// 裁判所基準の損害構造グラフを更新
function updateCourtChart(court) {
  const chartSection = document.getElementById("chartSection");
  const courtChartCanvas = document.getElementById("courtChart");
  const chartLegend = document.getElementById("chartLegend");
  const chartNote = document.getElementById("chartNote");

  if (!chartSection || !courtChartCanvas || !chartLegend) return;

  const ctx = courtChartCanvas.getContext("2d");
  if (!ctx) return;

  // 各要素の金額
  const injury = court.injuryPain || 0;
  const after = court.afterPain || 0;
  const lost = court.lostEarnings || 0;
  const other = (court.lostWages || 0) + (court.otherCosts || 0);

  const parts = [
    { key: "injury", label: "傷害慰謝料", value: injury },
    { key: "after", label: "後遺障害慰謝料／死亡慰謝料", value: after },
    { key: "lost", label: "逸失利益", value: lost },
    { key: "other", label: "その他（休業損害＋その他費目）", value: other }
  ];

  const total = injury + after + lost + other;

  // 金額ゼロ or 総額ゼロならグラフ非表示
  if (!total || total <= 0) {
    chartSection.classList.add("hidden");
    chartLegend.innerHTML = "";
    if (chartNote) {
      chartNote.textContent = "裁判所基準の総損害額が0円のため、グラフは表示していません。";
    }
    return;
  }

  // 表示するデータ（ゼロ項目は除外）
  const visibleParts = parts.filter(p => p.value > 0);
  if (!visibleParts.length) {
    chartSection.classList.add("hidden");
    chartLegend.innerHTML = "";
    if (chartNote) {
      chartNote.textContent = "裁判所基準の総損害額が0円のため、グラフは表示していません。";
    }
    return;
  }

  // グラフを表示状態に
  chartSection.classList.remove("hidden");

  // キャンバスクリア
  const { width, height } = courtChartCanvas;
  ctx.clearRect(0, 0, width, height);

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 10;

  // シンプルな色セット（落ち着いたトーン）
  const colors = {
    injury: "#60a5fa", // 青
    after: "#f97373",  // 赤
    lost: "#22c55e",   // 緑
    other: "#facc15"   // 黄
  };

  // 円グラフ描画
  let startAngle = -Math.PI / 2; // 上からスタート
  visibleParts.forEach(part => {
    const angle = (part.value / total) * Math.PI * 2;
    const endAngle = startAngle + angle;

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = colors[part.key] || "#9ca3af";
    ctx.fill();

    startAngle = endAngle;
  });

  // 凡例を生成
  chartLegend.innerHTML = "";
  visibleParts.forEach(part => {
    const pct = ((part.value / total) * 100).toFixed(1) + "%";

    const item = document.createElement("div");
    item.className = "chart-legend-item";

    const colorBox = document.createElement("span");
    colorBox.className = "chart-legend-color";
    colorBox.style.backgroundColor = colors[part.key] || "#9ca3af";

    const label = document.createElement("span");
    label.textContent = `${part.label}：${yenFormatter.format(part.value)}（${pct}）`;

    item.appendChild(colorBox);
    item.appendChild(label);
    chartLegend.appendChild(item);
  });

  if (chartNote) {
    chartNote.textContent =
      `総損害額（裁判所基準）は ${yenFormatter.format(total)} であり、その内訳の構成比を示しています。`;
  }
// localStorage 保存
function saveInputsToStorage(inputs) {
  try {
    const json = JSON.stringify(inputs);
    localStorage.setItem(LS_KEY_INPUTS, json);
  } catch (_e) {
    // 何もしない（ストレージが使えない環境）
  }
}

// localStorage 読み込み
function loadInputsFromStorage() {
  try {
    const json = localStorage.getItem(LS_KEY_INPUTS);
    if (!json) return null;
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== "object") return null;
    return obj;
  } catch (_e) {
    return null;
  }
}

// 保存された入力をフォームに反映
function applyInputsToForm(inputs) {
  const setValue = (id, v) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (v === null || v === undefined) {
      el.value = "";
    } else {
      el.value = String(v);
    }
  };

  setValue("treatmentDays", inputs.treatmentDays);
  setValue("visitDays", inputs.visitDays);
  setValue("dailyIncome", inputs.dailyIncome);
  setValue("absenceDays", inputs.absenceDays);
  setValue("otherCosts", inputs.otherCosts);
  setValue("annualIncome", inputs.annualIncome);
  setValue("faultPercent", inputs.faultPercent);
  setValue("alreadyPaid", inputs.alreadyPaid);
  setValue("accidentDate", inputs.accidentDate || "");

  const gradeEl = document.getElementById("grade");
  if (gradeEl) gradeEl.value = inputs.grade || "";

  // 詳細設定（喪失率・期間）も復元
  const lossRateEl = document.getElementById("lossRate");
  const lossYearsEl = document.getElementById("lossYears");
  if (lossRateEl) {
    lossRateEl.value =
      inputs.lossRateOverride != null ? String(inputs.lossRateOverride) : "";
  }
  if (lossYearsEl) {
    lossYearsEl.value =
      inputs.lossYearsOverride != null ? String(inputs.lossYearsOverride) : "";
  }

  // 死亡モード関連
  setValue("deathLifeRate", inputs.deathLifeRate);
  setValue("deathWorkYears", inputs.deathWorkYears);
  setValue("deathPainCustom", inputs.deathPainCustom);
  setValue("funeralCost", inputs.funeralCost);

  const victimStatusEl = document.getElementById("victimStatus");
  if (victimStatusEl && inputs.status) {
    victimStatusEl.value = inputs.status;
  }
  const deathSupportTypeEl = document.getElementById("deathSupportType");
  if (deathSupportTypeEl && inputs.deathSupportType) {
    deathSupportTypeEl.value = inputs.deathSupportType;
  }
  const deathPainPresetEl = document.getElementById("deathPainPreset");
  if (deathPainPresetEl && inputs.deathPainPreset) {
    deathPainPresetEl.value = inputs.deathPainPreset;
  }
}

// シンプルなディープコピー（structuredClone が使えない環境向けフォールバック付き）
function structuredCloneSafe(obj) {
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(obj);
    }
  } catch (_e) {
    // ignore
  }
  return JSON.parse(JSON.stringify(obj));
}

// シナリオ比較表示更新
function updateScenarioCompareDisplay(forceShow = false) {
  const container = document.getElementById("scenarioCompare");
  const aLabelEl = document.getElementById("scenarioALabel");
  const bLabelEl = document.getElementById("scenarioBLabel");

  const courtNetA = document.getElementById("scenarioCourtNetA");
  const courtNetB = document.getElementById("scenarioCourtNetB");
  const jibaiNetA = document.getElementById("scenarioJibaiNetA");
  const jibaiNetB = document.getElementById("scenarioJibaiNetB");
  const courtTotalA = document.getElementById("scenarioCourtTotalA");
  const courtTotalB = document.getElementById("scenarioCourtTotalB");
  const jibaiTotalA = document.getElementById("scenarioJibaiTotalA");
  const jibaiTotalB = document.getElementById("scenarioJibaiTotalB");

  // 保存されていない側は「未保存」と表示
  if (!scenarioA) {
    if (aLabelEl) aLabelEl.textContent = "未保存";
    if (courtNetA) courtNetA.textContent = "–";
    if (jibaiNetA) jibaiNetA.textContent = "–";
    if (courtTotalA) courtTotalA.textContent = "–";
    if (jibaiTotalA) jibaiTotalA.textContent = "–";
  } else {
    if (aLabelEl) aLabelEl.textContent = buildScenarioTag(scenarioA.inputs);
    if (courtNetA) courtNetA.textContent = yenFormatter.format(scenarioA.result.court.afterPaid);
    if (jibaiNetA) jibaiNetA.textContent = yenFormatter.format(scenarioA.result.jibai.afterPaid);
    if (courtTotalA) courtTotalA.textContent = yenFormatter.format(scenarioA.result.court.total);
    if (jibaiTotalA) jibaiTotalA.textContent = yenFormatter.format(scenarioA.result.jibai.total);
  }

  if (!scenarioB) {
    if (bLabelEl) bLabelEl.textContent = "未保存";
    if (courtNetB) courtNetB.textContent = "–";
    if (jibaiNetB) jibaiNetB.textContent = "–";
    if (courtTotalB) courtTotalB.textContent = "–";
    if (jibaiTotalB) jibaiTotalB.textContent = "–";
  } else {
    if (bLabelEl) bLabelEl.textContent = buildScenarioTag(scenarioB.inputs);
    if (courtNetB) courtNetB.textContent = yenFormatter.format(scenarioB.result.court.afterPaid);
    if (jibaiNetB) jibaiNetB.textContent = yenFormatter.format(scenarioB.result.jibai.afterPaid);
    if (courtTotalB) courtTotalB.textContent = yenFormatter.format(scenarioB.result.court.total);
    if (jibaiTotalB) jibaiTotalB.textContent = yenFormatter.format(scenarioB.result.jibai.total);
  }

  // どちらか一方でも登録があれば表示
  if ((scenarioA || scenarioB) && container) {
    container.classList.remove("hidden");
  } else if (forceShow && container) {
    container.classList.add("hidden");
  }
}

// シナリオラベル（等級・過失・基礎収入等のタグ文字列）
function buildScenarioTag(inputs) {
  const gradeLabel = (() => {
    if (!inputs.grade || inputs.grade === "none") return "等級：非該当";
    return "等級：" + inputs.grade + "級";
  })();

  const faultLabel =
    inputs.faultPercent != null ? `過失：${inputs.faultPercent}％` : "過失：-";

  const incomeLabel =
    inputs.annualIncome != null
      ? `基礎収入：${yenFormatter.format(inputs.annualIncome)}／年`
      : "基礎収入：-";

  return `${gradeLabel} ／ ${faultLabel} ／ ${incomeLabel}`;
}

// サマリーテキスト生成
function buildSummaryText(inputs, result) {
  const gradeLabel = (() => {
    if (!inputs.grade || inputs.grade === "none") return "非該当";
    return inputs.grade + "級";
  })();

  const baseLines = [];

  baseLines.push("事案メモ（概算試算）");
  baseLines.push("");
  baseLines.push(`・被害者の状態：${inputs.status === "death" ? "死亡" : inputs.status === "after" ? "後遺障害のみ" : "傷害"}`);
  baseLines.push(`・治療期間：${inputs.treatmentDays ?? "-"}日（実通院${inputs.visitDays ?? "-"}日）`);
  baseLines.push(`・後遺障害等級：${gradeLabel}`);
  baseLines.push(`・基礎収入：${inputs.annualIncome ? yenFormatter.format(inputs.annualIncome) + "／年" : "-"}`);
  baseLines.push(`・被害者側過失割合：${inputs.faultPercent != null ? inputs.faultPercent + "％" : "-"}`);
  baseLines.push(`・既払金合計：${yenFormatter.format(inputs.alreadyPaid ?? 0)}`);
  if (inputs.accidentDate) {
    baseLines.push(`・事故日：${inputs.accidentDate}`);
  }
  if (inputs.status === "death") {
    const lifeRate = getDeathLifeRate(inputs);
    const workYears = getDeathWorkYears(inputs);
    baseLines.push(
      `・生活費控除率：${(lifeRate * 100).toFixed(1)}％ ／ 就労可能年数：${workYears ?? "-"}年`
    );
  } else {
    baseLines.push(
      `・労働能力喪失率（参考）：${(result.court.lossRate * 100).toFixed(1)}％ ／ 喪失期間：${result.court.lossYears}年`
    );
  }
  baseLines.push("");

  // 裁判所基準
  baseLines.push("【裁判所基準モデル】");
  baseLines.push(`・総損害額（過失・既払前）：${yenFormatter.format(result.court.total)}`);
  baseLines.push(`・過失相殺後：${yenFormatter.format(result.court.afterFault)}`);
  baseLines.push(`・既払控除後（受取想定）：${yenFormatter.format(result.court.afterPaid)}`);
  baseLines.push(
    `・内訳：傷害慰謝料 ${yenFormatter.format(result.court.injuryPain)} / `
    + `後遺障害慰謝料・死亡慰謝料 ${yenFormatter.format(result.court.afterPain)} / `
    + `逸失利益 ${yenFormatter.format(result.court.lostEarnings)} / `
    + `休業損害 ${yenFormatter.format(result.court.lostWages)} / `
    + `その他 ${yenFormatter.format(result.court.otherCosts)}`
  );
  baseLines.push("");

  // 自賠責基準
  baseLines.push("【自賠責基準モデル】");
  baseLines.push(`・総損害額（過失・既払前）：${yenFormatter.format(result.jibai.total)}`);
  baseLines.push(`・過失相殺後：${yenFormatter.format(result.jibai.afterFault)}`);
  baseLines.push(`・既払控除後（受取想定）：${yenFormatter.format(result.jibai.afterPaid)}`);
  baseLines.push(
    `・内訳：傷害慰謝料 ${yenFormatter.format(result.jibai.injuryPain)} / `
    + `後遺障害慰謝料 ${yenFormatter.format(result.jibai.afterPain)} / `
    + `休業損害 ${yenFormatter.format(result.jibai.lostWages)} / `
    + `その他 ${yenFormatter.format(result.jibai.otherCosts)}`
  );
  baseLines.push("");

  baseLines.push("※本試算は一般的な算式・公開目安に基づく概算であり、実際の和解額を保証するものではありません。");

  return baseLines.join("\n");
}

// クリップボードAPI非対応環境向けフォールバック
function fallbackCopyText(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand("copy");
  } catch (_e) {
    // 失敗しても特に何もしない
  } finally {
    document.body.removeChild(textarea);
  }
}

// 遅延損害金計算
function calcDelayDamages(baseAmount, startDateStr, endDateStr, ratePercent) {
  try {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return { error: "日付の形式が不正です。" };
    }
    const diffMs = end.getTime() - start.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays < 0) {
      return { error: "支払日が事故日より前になっています。日付を確認してください。" };
    }
    const rate = ratePercent / 100;
    const amount = Math.round(baseAmount * rate * (diffDays / 365));
    return { amount, days: Math.round(diffDays) };
  } catch (_e) {
    return { error: "遅延損害金の計算中にエラーが発生しました。" };
  }
                                                      }
