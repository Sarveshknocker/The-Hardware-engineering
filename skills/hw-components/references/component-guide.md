# Component selection guide

Part names are **examples of commonly used, well-documented families**, not endorsements. Always confirm current specs, lifecycle and pricing.

## Sensors (choose by what you must measure, accuracy needed and environment)
| Quantity | Options (examples) | Selection notes |
|---|---|---|
| Temperature | NTC thermistor + ADC; digital TMP117 (±0.1 °C), TMP102, DS18B20 (1-Wire, waterproof probes); thermocouple + MAX31856; PT100/PT1000 + MAX31865 | Thermistor cheapest; RTD for accuracy/industrial; thermocouple for high temperature |
| Humidity + temp | SHT4x, SHT3x, BME280 (adds pressure), HDC302x | Avoid DHT11/DHT22 for anything serious (slow, less accurate, timing-critical protocol) |
| Pressure / altitude | BMP390, LPS22HB, MS5611 | Vent the enclosure with a membrane |
| Gas / air quality | SCD4x (true CO₂, photoacoustic), SGP41 (VOC/NOx index), SPS30 (PM) | MQ-series heated sensors are power-hungry and uncalibrated |
| Motion / orientation | LSM6DSOX/ISM330 (IMU), BMI270, ICM-42688; BNO08x (sensor fusion inside) | MPU6050 is a legacy part (end-of-life at the manufacturer; many boards carry clones) — prefer a current IMU and confirm lifecycle |
| Distance | VL53L1X/L4CD (ToF, up to ~4 m), ultrasonic (HC-SR04 is 5 V: level shift echo), LiDAR modules, mmWave radar (presence) | ToF sensitive to sunlight; radar sees through plastic |
| Light | VEML7700, BH1750, TSL2591, photodiode + TIA for fast/precise | |
| Current / power | INA219/INA226/INA228 (shunt), ACS7xx Hall (isolated), CT clamps for AC mains (isolated) | Never measure mains without isolation |
| Soil moisture | Capacitive probes (avoid resistive: they corrode), SDI-12 industrial probes | Calibrate per soil type |
| Position / angle | AS5600/AS5047 (magnetic), quadrature encoders, potentiometers, limit switches | |
| Weight / force | Load cell + HX711 / ADS1232 | Temperature drift; mechanical mounting matters |
| Image / vision | OV2640/OV5640 (with ESP32-S3/SBC), Raspberry Pi camera modules, global-shutter sensors for motion | Compute & bandwidth scale fast |
| Sound | I²S MEMS mics (INMP441, SPH0645, ICS-43434), PDM mics | |
| Location | GNSS modules (u-blox M10, Quectel L76), multi-band (L1/L5) for accuracy | Antenna placement, time-to-first-fix, power |

## Actuators & drivers
| Load | Driver options | Notes |
|---|---|---|
| LEDs / small loads | GPIO + resistor; N-MOSFET low-side (AO3400, logic-level Vgs(th)) | Check GPIO current limits |
| DC loads, pumps, solenoids | Logic-level N-MOSFET + flyback diode, or smart high-side switches (protected) | Flyback diode across inductive loads; gate resistor + pull-down |
| Relays / mains loads | Relay + driver transistor + flyback, or solid-state relay/opto-triac | Creepage/clearance, fusing, certified modules for mains |
| Brushed DC motors | H-bridges: DRV8833/DRV8871 (small), BTS7960-class/VNH5019 (high current), TB6612FNG | Current rating at stall, PWM frequency, thermal |
| Stepper motors | TMC2209/TMC2226 (silent, UART config), DRV8825/A4988 | Set current limit; microstepping; supply bulk capacitance |
| BLDC motors | ESCs (off-the-shelf) or FOC drivers (DRV83xx + MCU, SimpleFOC, VESC-class) | Complex; start with proven boards |
| Servos | PWM from MCU/PCA9685; separate supply with bulk capacitance | Servo current spikes brown out MCUs |
| Heaters | MOSFET/SSR with thermal fuse + independent over-temperature cutoff | Never rely on firmware alone |
| Displays | OLED SSD1306/SH1106 (small), e-paper (ultra-low power, static), TFT ST7789/ILI9341 (SPI), character LCD | E-paper for battery devices showing static info |
| Audio | I²S amps (MAX98357A), piezo buzzers (passive needs PWM) | |

## Communication modules
Wi-Fi/BLE SoCs (ESP32 family), BLE/Thread/Zigbee (nRF52/54, EFR32, ESP32-C6/H2), LoRa (SX1262 modules, RAK/Heltec/Seeed modules), cellular LTE-M/NB-IoT (Nordic nRF9151/9160, Quectel BG95/BG77, SIMCom), Ethernet (W5500 SPI, LAN8720 RMII PHY), RS-485 (MAX3485/THVD1450, isolated ISO1410), CAN (TCAN1042/MCP2562 transceivers; MCP2515 controller if MCU lacks CAN), USB-UART (CH340/CP2102/FT232).

## Power parts
Chargers (Li-ion: MCP73831 simple, BQ24074/BQ25895 with power-path; solar: BQ24650, CN3791), fuel gauges (MAX17048), regulators (low-Iq LDOs: TPS7A02, XC6220, MCP1700; bucks: TPS62xxx, AP63203; buck-boost: TPS63xxx), load switches (TPS22918), protection (TVS SMBJ/SMAJ, PTC fuses, ideal-diode/reverse-polarity P-MOSFET, eFuses TPS25947-class), supervisors/reset ICs.

## Storage & timing
SPI NOR flash (W25Q series) for logs/OTA, FRAM (endurance), microSD (bulk; corruption risk on power loss — use journaling/FAT with care), EEPROM (AT24C series); RTC (DS3231 accurate, PCF8563/RV-3028 low-power) with coin cell/supercap backup; crystals with correct load capacitors.

## Selection checklist
- [ ] Meets requirement with margin (accuracy over temperature, not just typical)
- [ ] Voltage/logic compatible (or level shifting planned)
- [ ] Current budget OK (sleep and peak)
- [ ] Package buildable for the chosen stage (breakout/dev board → hand solder → reflow)
- [ ] Operating temperature grade matches environment
- [ ] Driver/library availability for the chosen firmware stack
- [ ] Active lifecycle, ≥ 2 distributors, second source or drop-in alternate
- [ ] Buy genuine parts from authorised distributors (clones of popular sensors/ICs are common)
