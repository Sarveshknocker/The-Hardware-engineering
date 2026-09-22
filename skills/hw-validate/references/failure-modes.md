# Common failure modes & how to handle them

| Subsystem | Failure mode | Typical cause | Detection | Hardware mitigation | Firmware handling |
|---|---|---|---|---|---|
| Sensor | No response / NACK | Loose wire, dead part, address clash, bus stuck | Timeout, NACK, ID check | Locking connectors, bus pull-ups, I²C bus-recovery (9 clocks) | Retry with backoff → fault → safe/degraded |
| Sensor | Out-of-range / implausible | Open/short, EMI, condensation | Range & rate-of-change checks | Filtering, protection, sealing | Reject sample, hold last good, fault after N |
| Sensor | Drift / stuck value | Ageing, contamination, corrosion | Stuck detection, cross-check with second sensor, calibration checks | Better sensor (capacitive vs resistive), redundancy | Flag degraded, schedule recalibration |
| Actuator | Doesn't run when commanded | Blown fuse, open load, jammed motor | Current sense / feedback / flow switch | Fuse, driver with diagnostics | Latch fault, stop, alert |
| Actuator | Runs when it shouldn't | MOSFET short, stuck relay, firmware bug | Current sense when off | Pull-down on gate, second series switch, hardware interlock | Safe state; alert; never rely on firmware alone for hazards |
| Actuator | Overheat / stall | Mechanical block, overload | Current & temperature | Thermal cutoff, current limiting, driver OCP | Max on-time, stall detection, cool-down |
| Power | Brown-out / reset loop | Weak battery, inrush, radio TX peaks | BOD, supply ADC, reset reason | Bulk caps, proper regulator, soft-start | Low-battery mode, stop radios/actuators, hysteresis |
| Power | Reverse polarity / over-voltage | User error, transients | — | P-MOSFET/diode, TVS, fuse | — |
| Battery | Over-discharge / over-charge / cold charging | Missing protection, bad charger config | Fuel gauge, NTC | Protection IC, charger with thermal regulation | UVLO cutoff, charge only in temp window |
| Comms | Link loss | RF range, interference, network down | Timeouts, RSSI | Antenna placement, external antenna option | Store-and-forward, backoff, local autonomy |
| Comms | Corrupted data | Noise, long cables | CRC, framing errors | Differential signalling, termination, shielding | Discard + retry, error counters |
| Firmware | Hang / deadlock | Bug, ISR storm, blocking call | Watchdog | Independent watchdog | Task check-ins, reset reason logging, safe boot |
| Firmware | Bad update | Power loss, bad image | Signature/CRC, boot health check | Dual-bank flash | A/B rollback |
| Storage | Corruption | Power loss during write, wear | CRC, version | Brown-out detection, capacitor hold-up | Atomic writes/journaling, defaults on CRC fail |
| Clock / RTC | Time wrong | Backup battery dead, drift | Sanity checks, NTP/GNSS compare | Supercap/coin cell, TCXO | Resync, flag untrusted timestamps |
| Mechanical | Connector/solder fatigue | Vibration, thermal cycling | Intermittent faults | Locking connectors, strain relief, underfill | Log intermittent errors |
| Environment | Moisture ingress | Seal failure, condensation | Humidity sensor inside, leakage current | IP enclosure, vent membrane, conformal coat | Alert, safe state |
| Security | Tampering / credential theft | Physical access, debug port | — | Secure boot, flash encryption, debug lock | Per-device credentials, signed OTA (see The Protectors) |
