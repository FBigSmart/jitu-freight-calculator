(function () {
  "use strict";

  const LOCAL_RATE_PROVINCES = new Set(["河北省", "天津"]);
  const HIGH_RATE_PROVINCES = new Set([
    "四川省",
    "重庆",
    "云南省",
    "贵州省",
    "广西壮族自治区",
    "甘肃省",
    "宁夏回族自治区",
  ]);
  const SMALL_REMOTE_PROVINCES = new Set([...HIGH_RATE_PROVINCES, "内蒙古自治区"]);
  const CITY_SURCHARGE_PROVINCES = new Set(["北京", "上海"]);
  const MANUAL_PROVINCES = new Set(["辽宁省", "吉林省"]);
  const UNAVAILABLE_PROVINCES = new Set([
    "青海省",
    "海南省",
    "新疆维吾尔自治区",
    "西藏自治区",
  ]);

  const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
  const formatMoney = (value) => `¥${Math.abs(value).toFixed(2)}`;

  function calculateShipping(province, actualWeight) {
    const weight = Number(actualWeight);
    if (!province) {
      return { error: "请选择收件省份" };
    }
    if (!Number.isFinite(weight) || weight <= 0) {
      return { error: "请输入大于0的实际重量" };
    }
    if (UNAVAILABLE_PROVINCES.has(province)) {
      return { unavailable: true, province };
    }

    const billableWeight = Math.ceil(weight);
    let baseFee;
    let pricingTier;

    if (billableWeight <= 1) {
      baseFee = 3;
      pricingTier = "1kg档";
    } else if (billableWeight <= 2) {
      baseFee = 4;
      pricingTier = "2kg档";
    } else if (billableWeight <= 3) {
      baseFee = 5;
      pricingTier = "3kg档";
    } else if (billableWeight <= 5) {
      baseFee = 7.5;
      pricingTier = "4–5kg档";
    } else if (LOCAL_RATE_PROVINCES.has(province)) {
      baseFee = 4 + billableWeight;
      pricingTier = "大件Ⅰ档 · 1.00元/kg＋4元";
    } else if (HIGH_RATE_PROVINCES.has(province)) {
      baseFee = 4 + billableWeight * 1.7;
      pricingTier = "大件Ⅲ档 · 1.70元/kg＋4元";
    } else {
      baseFee = 4 + billableWeight * 1.2;
      pricingTier = "大件Ⅱ档 · 1.20元/kg＋4元";
    }

    const cityFee = CITY_SURCHARGE_PROVINCES.has(province) && billableWeight <= 5 ? 1 : 0;
    const remoteFee = SMALL_REMOTE_PROVINCES.has(province) && billableWeight <= 3 ? 0.5 : 0;
    const transportFee = billableWeight <= 3 ? 0.05 : 0.05 + billableWeight * 0.02;
    const totalCost = roundMoney(baseFee + cityFee + remoteFee + transportFee);
    const labelCredit = 3.5;
    const monthlyDue = roundMoney(totalCost - labelCredit);

    return {
      province,
      actualWeight: weight,
      billableWeight,
      baseFee: roundMoney(baseFee),
      cityFee: roundMoney(cityFee),
      remoteFee: roundMoney(remoteFee),
      transportFee: roundMoney(transportFee),
      totalCost,
      labelCredit,
      monthlyDue,
      pricingTier,
      manual: MANUAL_PROVINCES.has(province),
      inferredLargeRate: province === "吉林省" && billableWeight > 5,
    };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { calculateShipping };
  }

  if (typeof document === "undefined") return;

  const form = document.getElementById("shipping-form");
  const provinceInput = document.getElementById("province");
  const weightInput = document.getElementById("weight");
  const resultContent = document.getElementById("result-content");
  const unavailableState = document.getElementById("unavailable-state");
  const policyCard = document.getElementById("policy-card");
  const policyTitle = document.getElementById("policy-title");
  const policyText = document.getElementById("policy-text");

  function setPolicy(result) {
    policyCard.classList.remove("manual", "unavailable");

    if (result.unavailable) {
      policyCard.classList.add("unavailable");
      policyCard.querySelector(".policy-icon").textContent = "×";
      policyTitle.textContent = "暂不发货";
      policyText.textContent = "该省份目前不纳入运费计算。";
      return;
    }

    if (result.manual) {
      policyCard.classList.add("manual");
      policyCard.querySelector(".policy-icon").textContent = "!";
      policyTitle.textContent = "需联系确认地址";
      policyText.textContent = result.inferredLargeRate
        ? "吉林6kg以上账单暂无样本，当前按同组规则估算，发货前请确认。"
        : "费用可计算，但下单前需要消费者联系确认收件地址。";
      return;
    }

    policyCard.querySelector(".policy-icon").textContent = "✓";
    policyTitle.textContent = "可直接下单";
    policyText.textContent = "该省份按已确认账单规则计费。";
  }

  function renderUnavailable(province) {
    resultContent.hidden = true;
    unavailableState.hidden = false;
    document.getElementById("unavailable-title").textContent = `${province}暂不提供报价`;
  }

  function renderResult(result) {
    unavailableState.hidden = true;
    resultContent.hidden = false;

    document.getElementById("route-title").textContent = `发往${result.province}`;
    document.getElementById("billable-weight").textContent = `计费 ${result.billableWeight}kg`;
    document.getElementById("total-cost").innerHTML = `<span>¥</span>${result.totalCost.toFixed(2)}`;
    document.getElementById("monthly-due").textContent = result.monthlyDue < 0
      ? `抵扣 ${formatMoney(result.monthlyDue)}`
      : formatMoney(result.monthlyDue);
    document.getElementById("base-fee").textContent = formatMoney(result.baseFee);
    document.getElementById("city-fee").textContent = formatMoney(result.cityFee);
    document.getElementById("remote-fee").textContent = formatMoney(result.remoteFee);
    document.getElementById("transport-fee").textContent = formatMoney(result.transportFee);
    document.getElementById("breakdown-total").textContent = formatMoney(result.totalCost);
    document.getElementById("pricing-tier").textContent = result.pricingTier;

    const pieces = [`基础运费 ${formatMoney(result.baseFee)}`];
    if (result.cityFee) pieces.push(`北京／上海加收 ${formatMoney(result.cityFee)}`);
    if (result.remoteFee) pieces.push(`偏远加收 ${formatMoney(result.remoteFee)}`);
    pieces.push(`运输加收 ${formatMoney(result.transportFee)}`);
    document.getElementById("calculation-note").querySelector("p").textContent = pieces.join(" ＋ ");
  }

  function calculateAndRender() {
    const result = calculateShipping(provinceInput.value, weightInput.value);
    if (result.error) {
      weightInput.setCustomValidity(result.error);
      weightInput.reportValidity();
      return result;
    }

    weightInput.setCustomValidity("");
    setPolicy(result);
    if (result.unavailable) {
      renderUnavailable(result.province);
    } else {
      renderResult(result);
    }
    return result;
  }

  function registerCalculatorTool() {
    const context = document.modelContext;
    if (!context?.registerTool) return;

    const knownProvinces = new Set(Array.from(provinceInput.options, (option) => option.value));
    const lifecycle = new AbortController();

    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: "calculate_shipping_quote",
            title: "计算极兔运费",
            description: "输入中国省级地区和实际重量，计算极兔总运费、计费重量、各项加收和月结补交金额。",
            inputSchema: {
              type: "object",
              properties: {
                province: { type: "string", description: "收件省份，例如河北省、北京或广西壮族自治区" },
                actualWeight: { type: "number", exclusiveMinimum: 0, description: "快件实际重量，单位为kg" },
              },
              required: ["province", "actualWeight"],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute(input) {
              if (!input || typeof input !== "object") throw new TypeError("请输入省份和重量");
              const province = String(input.province || "");
              const actualWeight = Number(input.actualWeight);
              if (!knownProvinces.has(province)) throw new RangeError("该省份不在可选列表中");
              if (!Number.isFinite(actualWeight) || actualWeight <= 0) throw new RangeError("重量必须大于0kg");

              provinceInput.value = province;
              weightInput.value = String(actualWeight);
              const result = calculateAndRender();
              if (result.unavailable) return { province, status: "暂不发货" };

              return {
                province: result.province,
                status: result.manual ? "需联系确认地址" : "可直接下单",
                actualWeight: result.actualWeight,
                billableWeight: result.billableWeight,
                baseFee: result.baseFee,
                cityFee: result.cityFee,
                remoteFee: result.remoteFee,
                transportFee: result.transportFee,
                totalCost: result.totalCost,
                monthlyDue: result.monthlyDue,
              };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch (_) {
      // The visible calculator remains fully functional when WebMCP is unavailable.
    }
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    calculateAndRender();
  });

  provinceInput.addEventListener("change", calculateAndRender);
  weightInput.addEventListener("input", function () {
    if (weightInput.value && Number(weightInput.value) > 0) calculateAndRender();
  });

  window.JTShippingCalculator = { calculateShipping };
  calculateAndRender();
  registerCalculatorTool();
})();
