# Protection circuits

| Threat | Protection | Notes |
|---|---|---|
| Reverse polarity (DC input, batteries) | P-channel MOSFET "ideal diode" (low loss), Schottky diode (simple, 0.3–0.5 V drop), ideal-diode controller ICs | P-MOSFET: gate to GND via resistor, Zener clamp on Vgs for inputs > ~12 V |
| Over-voltage / transients (automotive, long cables, inductive environments) | TVS diode (SMAJ/SMBJ sized to working voltage), series resistor/ferrite, surge stopper IC | Automotive: load-dump protection (ISO 7637-2 / ISO 16750) |
| Over-current / short | Fuse (slow/fast), resettable PTC, eFuse/hot-swap controller, current-limited load switch | Size for normal peak with margin; eFuses give fast, reportable protection |
| ESD on user-touchable connectors/buttons/USB | TVS arrays (e.g. USBLC6-2, TPD4E05), series resistors, chassis ground path | Place right at the connector |
| Inductive kickback (relays, motors, solenoids) | Flyback diode across coil; TVS or RC snubber for faster release; bidirectional TVS for H-bridges handled by driver | Missing flyback kills MOSFETs/MCUs |
| Brown-out | MCU brown-out detector enabled, supervisor/reset IC, bulk capacitance near high-current loads | Firmware: stop actuators and save state on low voltage |
| Mains | Certified AC-DC module, fuse + MOV + NTC inrush, creepage/clearance per IEC 62368-1, isolation for any user-accessible circuit | Get professional review; prefer external certified adapters |
| Li-ion cells | Protection IC + dual MOSFET (OV/UV/OC/short), NTC for charge temperature, fuse; use protected cells or BMS | Never charge below 0 °C; UN 38.3 for shipping |
| Heaters / high-energy loads | Independent thermal cutoff (thermal fuse/bimetal) in series, not firmware-only | Required for safety |
| Moisture / condensation | Conformal coating, IP-rated enclosure, vent membrane, avoid DC on exposed electrodes | Corrosion is a top field failure |
| Long sensor cables | Series resistors, RC filters, TVS, shielded twisted pair, differential signalling for distance | Treat cables as antennas |
