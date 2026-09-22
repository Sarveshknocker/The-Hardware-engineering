# REQUIREMENTS — <project>

## 1. Purpose & value
One paragraph. Core function(s): sense / actuate / communicate / compute / display / store / power.

## 2. Use cases
| ID | Actor | Scenario | Success condition | Failure/edge cases |
|---|---|---|---|---|

## 3. Functional requirements
| ID | Requirement | Value & tolerance | Priority | Verification |
|---|---|---|---|---|
| FR-01 | Measure soil moisture | 0–100 % VWC, ±3 % after calibration, every 10 min | Must | Test vs gravimetric reference |

## 4. Performance & non-functional
| ID | Category | Requirement | Value | Priority | Verification |
|---|---|---|---|---|---|
| NFR-01 | Power | Battery life | ≥ 12 months on 2× AA / 1× 18650 | Must | power.mjs + current profiling |
| NFR-02 | Environment | Operating temperature | −10 … 60 °C | Must | Thermal chamber |
| NFR-03 | Ingress | Enclosure | IP65 | Should | Spray test / certified enclosure |
| NFR-04 | Cost | BOM @ 1k units | ≤ $12 | Should | bom.mjs |
| NFR-05 | Size | Enclosure | ≤ 100×60×30 mm | Could | CAD |
| NFR-06 | Reliability | Unattended operation | Recovers from any fault without human action (except latched safety faults) | Must | Fault-injection tests |
| NFR-07 | Update | Field firmware update | OTA with rollback | Should | Test |

## 5. Interfaces
Inputs/outputs to the physical world and to users/systems: connectors, buttons, displays, apps, cloud, APIs, protocols.

## 6. Environment
Temperature, humidity/condensation, IP, UV, vibration/shock, EMI, altitude, mounting, installation constraints.

## 7. Power source
Type, voltage range, availability, autonomy, charging method.

## 8. Safety & compliance
| Hazard | Severity | Mitigation approach | Standard / regime (to confirm) |
|---|---|---|---|

## 9. Constraints
Budget (unit @ volume, development), timeline, volume, maker vs production, tools, team skills, supplier regions.

## 10. Acceptance tests (definition of done)
Measurable tests that prove the prototype meets the must-have requirements.

## 11. Assumptions & open questions
Each with how to confirm it and the design impact if wrong.
