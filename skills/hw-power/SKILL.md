---
name: hw-power
description: Power architecture for hardware — source selection (mains adapter, USB/USB-C PD, battery chemistries, solar, PoE, vehicle), power tree, regulators (LDO vs buck vs buck-boost), charging, protection, power budget with duty cycles, battery life, thermal management and low-power optimisation. Use when designing how a device is powered or estimating battery life.
---

# Power architecture

## 1. Power tree
Source → protection (reverse polarity, TVS, fuse/eFuse) → (charger/power-path for batteries) → regulators per rail → loads, plus monitoring (battery voltage/fuel gauge, current sense). Draw it in ELECTRICAL.md with voltage, max current and regulator part per rail. See `references/power-design.md`.

## 2. Power budget: computed, not guessed
Write `.hw/power.json` (loads with active/sleep/peak currents from **datasheets**, duty cycles from the firmware design) and run:
```bash
node <kit>/skills/hw-power/scripts/power.mjs .hw/power.json
```
It computes per-rail and source-side average/peak/sleep currents (LDO vs buck/boost efficiency and quiescent current), **battery life including self-discharge**, and flags: LDO dropout at minimum battery voltage, buck/boost topology errors, regulator headroom vs peak (radio TX, motor start), LDO junction temperature, low LDO efficiency, and regulator Iq dominating sleep current. Chemistry presets: `li-ion, lifepo4, alkaline-aa, nimh-aa, coin-cr2032, custom`.

## 3. Regulator choice
- **LDO**: low noise, simple, cheap; efficient only when Vin ≈ Vout. Check dropout at the *lowest* source voltage and dissipation at the *highest* (`calc.mjs ldo`).
- **Buck**: efficient step-down for large Vin−Vout or high current; watch light-load efficiency (PFM/burst mode) and layout.
- **Buck-boost**: when the battery range spans the rail (e.g. 1× Li-ion 3.0–4.2 V → 3.3 V).
- **Boost**: from low-voltage sources (1–2 AA, single cell to 5 V).
- **Load switches** to fully power down sensors/peripherals between measurements.

## 4. Low-power design
Deep sleep with RTC/timer wake; power-gate sensors; minimise radio on-time (batch transmissions); lower CPU clock; avoid LEDs always on; high-value dividers switched by a MOSFET (or measured only when needed); nano-Iq regulators; choose sensors with low standby current; verify with a current profiler.

## 5. Thermal
Compute dissipation per part (regulators, MOSFETs: I²·Rds(on), motor drivers, LEDs), junction temperature from θJA at max ambient, copper area/thermal vias, enclosure temperature rise, and derating. Keep batteries away from heat sources.

Output `.hw/POWER_BUDGET.md` (generated) + the power tree and thermal analysis in ELECTRICAL.md.
