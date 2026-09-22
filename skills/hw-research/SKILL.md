---
name: hw-research
description: Research for hardware projects — proven open designs and reference firmware (GitHub), electronics Q&A (EE Stack Exchange), research papers, plus web research of datasheets, errata, application notes, reference designs, evaluation boards, standards and distributor availability/pricing. Use before choosing components or architecture.
---

# Research before designing

## 1. Queries (short keywords)
Problem/function ("soil moisture sensing", "brushless motor control"), candidate technologies ("capacitive soil sensor", "LoRa sensor node", "FOC ESC"), parts ("SHT45", "DRV8833"), and failure topics ("<sensor> drift", "<MCU> brownout reset", "<part> errata"). Save in `.hw/queries.txt`.

## 2. Collect open-source intelligence
```bash
node <kit>/skills/hw-research/scripts/research.mjs --queries-file .hw/queries.txt --limit 8 --tag research
```
Default sources: `github` (open hardware, KiCad projects, drivers, firmware), `electronics` (EE Stack Exchange: real pitfalls), `hn`, `arxiv`, `openalex`, `wikipedia`. Opt-in: `stackoverflow`, `reddit` (needs credentials), `huggingface` (edge-AI models), `news`. Output `.hw/research/research.{md,json}`.

## 3. Web research (manufacturer & distributor sources)
| Need | Where |
|---|---|
| Datasheets, **errata/silicon bugs**, reference manuals | Manufacturer product pages (TI, ADI, ST, NXP, Microchip, Espressif, Nordic, Raspberry Pi, Infineon, onsemi, Bosch, Sensirion, TDK…) |
| Application notes & **reference designs** | Same manufacturers: app notes often contain the exact circuit you need (layout, protection, filter values) |
| Evaluation boards / dev kits | Manufacturer & distributor pages: start prototypes on eval boards |
| Availability, lifecycle, price breaks, alternates | Octopart/Findchips (aggregators), DigiKey, Mouser, Farnell/Newark, LCSC/JLCPCB parts (for PCBA), Arrow |
| Open hardware designs | GitHub, Hackaday.io, OSHWA certified projects, KiCad libraries |
| Standards overviews | Standards bodies' summaries, compliance-lab guides (don't reproduce paid standard text) |
| Community pitfalls | EE Stack Exchange, EEVblog forum, vendor forums (ESP32 forum, ST community, Nordic DevZone) |

## 4. Record in `.hw/RESEARCH.md`
- Proven designs similar to the idea (what they used, what worked, known problems), with links
- Candidate components per subsystem with key specs taken **from datasheets** (cite datasheet revision/date)
- Relevant app notes/reference circuits to follow
- Errata or known issues that affect the design
- Standards/regulations that apply (to confirm)
- Availability & lifecycle notes (source, date)

See `references/datasheet-reading.md` for what to extract from a datasheet.
